#!/usr/bin/env node
/**
 * Sweep this account's read-only Hiveku tools and report which ones work.
 *
 * ── Why this is a script and not a conversation ────────────────────────────
 * Asking Claude to call ~250 tools one at a time costs a permission decision
 * AND a transcript entry per tool. The transcript is carried forward on every
 * subsequent turn, so a sweep of that size fills a 1M-token context and ends
 * with "Prompt is too long" -- which is what happened. The tool RESULTS are the
 * point; the model reading each one as it arrives is pure overhead.
 *
 * So: the sweep runs here, in one process, and writes a JSON report. Claude
 * reads the summary afterwards -- one tool call instead of two hundred and
 * fifty. Zero permission prompts, zero context growth, seconds instead of an
 * afternoon.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 * ★ Only tools this plugin would PRE-APPROVE are called -- readonly-tools.json
 * (server-declared GETs, plus readOnlyHint declarations and the handful of
 * POST-dispatched pure reads) MINUS NEVER_AUTO_APPROVE, and with the argument
 * gates applied to the exact arguments this sweep sends. That is the same
 * `isAutoApprovable` predicate the permission hook uses, so the sweep cannot
 * reach anything the hook would decline to vouch for.
 *
 * It used to gate on `isReadOnlyTool` alone, which is the weaker, name-pure
 * predicate. Two tools slipped through: voice_recording_url_get (on
 * NEVER_AUTO_APPROVE) and voice_voicemails_list, whose route mints a presigned
 * recording URL per row unless `audio_urls: 'false'` is passed -- so every
 * sweep minted a page of unauthenticated, non-revocable voicemail audio links,
 * which is precisely what that gate exists to prevent.
 *
 * Nothing here can create, update, delete, send or publish. That is a property
 * of the list, not of this script's good intentions -- see lib/tool-safety.mjs.
 *
 * Usage:
 *   node scripts/sweep-tools.mjs [--dir <bound-account-dir>] [--limit N]
 *                                [--out report.json] [--concurrency N]
 *                                [--only <substring>] [--resolve]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAutoApprovable } from '../lib/tool-safety.mjs';
import { classify } from '../lib/sweep-classify.mjs';
import { harvestCandidates, resolveTool, assertSuppliersAreReadOnly } from '../lib/sweep-resolvers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = { dir: process.cwd(), limit: 0, out: 'hiveku-sweep.json', concurrency: 4, only: '', resolve: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = path.resolve(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(argv[++i]) || 4);
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--resolve') out.resolve = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
  }
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));

/**
 * A newline-delimited JSON-RPC client over the plugin's stdio MCP server.
 *
 * The server writes protocol bytes to stdout and NOTHING else, so every line is
 * a message. stderr is kept separate and surfaced only on a hard failure --
 * swallowing it turns "no key for this directory" into a silent hang.
 */
class McpClient {
  constructor(cwd) {
    this.proc = spawn(path.join(PLUGIN_ROOT, 'bin', 'hiveku-mcp'), [], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // ★ Ask for the FULL surface. The plugin advertises a core set plus a
      // search tool by default, which is right for a session and wrong here:
      // a sweep that only sees 13 tools reports "9/9 ok" and has checked
      // almost nothing. Caught by running this against a real account.
      env: { ...process.env, HIVEKU_PROJECT_DIR: cwd, HIVEKU_TOOL_MODE: 'all' },
    });
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = '';
    this.buf = '';
    this.proc.stderr.on('data', (d) => { this.stderr += d.toString(); });
    this.proc.stdout.on('data', (d) => this.onData(d));
    this.exited = new Promise((resolve) => this.proc.on('exit', resolve));
  }

  onData(chunk) {
    this.buf += chunk.toString();
    let nl;
    while ((nl = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const waiter = this.pending.get(msg.id);
      if (waiter) { this.pending.delete(msg.id); waiter(msg); }
    }
  }

  send(method, params) {
    const id = this.nextId++;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve, reject) => {
      // A tool that never answers must not hang the whole sweep.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('timed out after 60s'));
      }, 60_000);
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    });
  }

  notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  close() { this.proc.stdin.end(); this.proc.kill(); }
}

/**
 * Per-tool arguments the sweep sends. Empty for almost everything -- the point
 * of the sweep is "does this answer at all", and inventing parameters would
 * make a needs-params refusal look like coverage.
 *
 * The exception is a read whose SAFE form needs an explicit argument.
 * voice_voicemails_list returns a presigned recording URL per row unless
 * audio_urls is 'false' (the route reads `sp.get('audio_urls') !== 'false'`,
 * so omitting it defaults to minting them). Passing the metadata form keeps
 * the tool in the sweep's coverage without generating shareable audio links.
 *
 * ★ This table feeds BOTH the safety gate and the call. Do not split them.
 */
const SWEEP_ARGS = {
  voice_voicemails_list: { audio_urls: 'false' },
};
const argsFor = (name) => SWEEP_ARGS[name] ?? {};

async function main() {
  console.log(`Hiveku tool sweep — ${ARGS.dir}`);
  const mcp = new McpClient(ARGS.dir);

  const init = await mcp.send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'hiveku-sweep', version: '1' },
  }).catch((e) => ({ error: { message: String(e) } }));

  if (init?.error) {
    console.error(`\ncould not start the Hiveku MCP server: ${init.error.message}`);
    if (mcp.stderr.trim()) console.error(mcp.stderr.trim());
    console.error('\nIs this directory bound to an account? Run /hiveku:bind, or pass --dir <folder>.');
    mcp.close();
    process.exit(1);
  }
  mcp.notify('notifications/initialized', {});

  // The server explains an unusable state in `instructions` and then serves an
  // EMPTY tool list rather than failing. Reporting "no tools" would hide the one
  // sentence that says what to do about it.
  const instructions = init?.result?.instructions ?? '';

  const listed = await mcp.send('tools/list', {});
  const all = listed?.result?.tools ?? [];
  if (!all.length) {
    console.error('\nNo Hiveku tools are available in this directory.');
    if (instructions) console.error(`\n  ${instructions}`);
    else console.error('  The server returned an empty tool list and said nothing about why.');
    if (mcp.stderr.trim()) console.error(`\n${mcp.stderr.trim()}`);
    console.error(`\nPass --dir <folder> to sweep a different account's folder.`);
    mcp.close();
    process.exit(1);
  }

  // ★ The safety gate: the same predicate the permission hook applies, fed the
  // same arguments this sweep will actually send. Gating on one argument shape
  // and calling with another is how the gate stops meaning anything, so both
  // read from `argsFor`.
  let targets = all.map((t) => t.name).filter((n) => isAutoApprovable(n, argsFor(n)));
  if (ARGS.only) targets = targets.filter((n) => n.includes(ARGS.only));
  if (ARGS.limit) targets = targets.slice(0, ARGS.limit);

  console.log(`${all.length} tools exposed, ${targets.length} read-only selected` +
    (ARGS.only ? ` (filtered by "${ARGS.only}")` : '') + `\n`);
  if (all.length < 100 && !ARGS.only) {
    console.warn(
      `  WARNING: only ${all.length} tools were advertised. A full account exposes ~1,500, so this\n` +
      `  sweep is checking a fraction of the surface. Is an older plugin pinning the tool list?\n`,
    );
  }

  const results = [];
  let done = 0;
  let throttled = 0;
  const queue = [...targets];

  /**
   * ★ THE SERVER RATE-LIMITS AT 100 REQUESTS PER 60 SECONDS, and this script
   * used to walk straight through it.
   *
   * Measured on a full sweep: 608 tools, 61 ok, and 547 "ERRORS" that were
   * every one of them "Rate limit exceeded. Maximum 100 requests per 60
   * seconds." Zero were real. A staff member running the command the runbook
   * recommends would have been shown 547 failures on a perfectly healthy
   * server, which is worse than not sweeping at all -- it manufactures an
   * incident.
   *
   * A sliding window is used rather than a fixed delay because the limit is
   * itself a sliding window: pacing by average rate still bursts through the
   * first 100 and then fails for the rest of the minute.
   */
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 90;      // 100, less headroom for anything else on this key
  const stamps = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function takeSlot() {
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] >= WINDOW_MS) stamps.shift();
      if (stamps.length < MAX_PER_WINDOW) { stamps.push(now); return; }
      await sleep(Math.max(50, WINDOW_MS - (now - stamps[0]) + 25));
    }
  }

  const RETRY_AFTER = /retry after (\d+)/i;

  /** One call, with a bounded retry when the server says to wait. */
  async function callOnce(name, args = null) {
    const sendArgs = args ?? argsFor(name);
    for (let attempt = 0; attempt < 3; attempt++) {
      await takeSlot();
      let msg;
      try { msg = await mcp.send('tools/call', { name, arguments: sendArgs }); }
      catch (e) { msg = { error: { message: String(e.message || e) } }; }
      const c = classify(msg);
      // ★ The verdict's `detail` is truncated (80 chars for ok). The resolver
      // has to parse ids out of a listing, so hand back the FULL text too —
      // parsing the truncated form fails silently, and an empty harvest then
      // looks exactly like "this account holds none of that entity".
      c.raw = (msg?.result?.content || []).map((x) => x.text || '').join('');
      const text = `${c.detail ?? ''}`;
      if (!/rate limit/i.test(text)) return c;
      throttled++;
      // Honour the server's own number; it knows when the window rolls.
      const secs = Number(RETRY_AFTER.exec(text)?.[1] ?? 5);
      await sleep(Math.min(65, Math.max(1, secs)) * 1000 + 250);
    }
    return { status: 'error', detail: 'rate limited after 3 attempts' };
  }

  const worker = async () => {
    for (;;) {
      const name = queue.shift();
      if (!name) return;
      const t0 = Date.now();
      const c = await callOnce(name);
      results.push({ tool: name, ...c, ms: Date.now() - t0 });
      done++;
      if (done % 25 === 0 || done === targets.length) {
        process.stdout.write(`  ${done}/${targets.length}\r`);
      }
    }
  };
  await Promise.all(Array.from({ length: ARGS.concurrency }, worker));

  // ── Resolving the coverage ceiling (opt-in: --resolve) ──────────────────────
  //
  // ~400 of the tools above refuse for want of an argument, and 358 of those
  // want an ENTITY ID. That is the real ceiling, and the obvious fix -- read
  // required[] and auto-fill it -- makes the report WORSE: a synthetic id
  // returns 404, a 404 classifies as `error`, and the failure list fills with
  // hundreds of incidents that are not real.
  //
  // So this probes REAL ids harvested from read-only listers, and keeps
  // whichever one the tool accepts. See lib/sweep-resolvers.mjs for why the map
  // is discovered rather than declared (seven of nine seo_* tools take the SEO
  // project id; two want a website project and 404 on it).
  if (ARGS.resolve) {
    // ★ Suppliers run ahead of the per-tool gate below, so they are the one
    // path that could reach a mutating tool unguarded. Fail before calling any.
    assertSuppliersAreReadOnly((t) => isAutoApprovable(t, {}));

    const schemas = new Map(all.map((t) => [t.name, t.inputSchema ?? t.input_schema ?? {}]));
    const unresolved = results.filter((r) => r.status === 'needs-params');
    process.stdout.write(`\n  resolving ${unresolved.length} needs-params tools…\n`);

    const candidates = await harvestCandidates({
      call: async (tool) => {
        const c = await callOnce(tool, {});
        if (c.status !== 'ok') return null;
        try { return JSON.parse(c.raw); } catch { return null; }
      },
      onNote: (n) => console.log(`    ${n}`),
    });

    const harvested = [...candidates.values()].reduce((n, v) => n + v.length, 0);
    if (!harvested) {
      console.log(
        '    no candidate ids were harvested from any supplier — every unresolved tool\n' +
        '    below is reported as it was. This is NOT evidence the account holds no such\n' +
        '    entities; check the suppliers in lib/sweep-resolvers.mjs can be called here.',
      );
    }

    let promoted = 0, unavail = 0, probes = 0;
    for (const row of unresolved) {
      const verdict = await resolveTool({
        tool: row.tool,
        schema: schemas.get(row.tool) ?? {},
        candidates,
        call: async (tool, args) => {
          // ★ RE-GATE. The gate above was evaluated with argsFor(name); these
          // arguments are different, and gating on one shape while calling with
          // another is exactly how the gate stops meaning anything.
          if (!isAutoApprovable(tool, args)) {
            return { status: 'error', detail: 'refused by the read-only gate under resolved args' };
          }
          return callOnce(tool, args);
        },
      });
      probes += verdict.probes;
      if (verdict.status === 'ok') {
        row.status = 'ok'; row.detail = verdict.detail; row.resolved_via = verdict.param; promoted++;
      } else if (verdict.status === 'unavailable' && harvested) {
        row.status = 'unavailable'; row.detail = verdict.detail; unavail++;
      }
    }
    console.log(
      `    ${promoted} now answer with a real id, ${unavail} have no such entity on this account ` +
      `(${probes} probe calls)`,
    );
  }

  mcp.close();

  results.sort((a, b) => a.tool.localeCompare(b.tool));
  const by = (s) => results.filter((r) => r.status === s);
  const ok = by('ok'), needs = by('needs-params'), err = by('error');
  const unavail = by('unavailable');

  // Every swept tool lands in exactly one bucket. Asserted rather than assumed:
  // adding `unavailable` moved 102 of this account's 106 "errors" out of the
  // failure list, and a bucket the summary forgets to print is how those tools
  // would have disappeared from the report entirely while the totals still
  // looked plausible.
  const bucketed = ok.length + needs.length + err.length + unavail.length;
  if (bucketed !== results.length) {
    console.error(
      `\n  ! ${results.length - bucketed} swept tool(s) fell into no bucket — ` +
        'the summary below undercounts. Fix classify() before trusting it.',
    );
  }

  const report = {
    account_dir: ARGS.dir,
    swept_at: new Date().toISOString(),
    tools_exposed: all.length,
    tools_swept: results.length,
    ok: ok.length,
    needs_params: needs.length,
    unavailable: unavail.length,
    errors: err.length,
    rate_limit_waits: throttled,
    results,
  };
  fs.writeFileSync(ARGS.out, JSON.stringify(report, null, 2) + '\n');

  console.log(`\n  ok            ${ok.length}`);
  console.log(`  needs params  ${needs.length}   (not a failure — the tool wants arguments)`);
  console.log(`  unavailable   ${unavail.length}   (not a failure — no connection / not entitled on this account)`);
  console.log(`  ERRORS        ${err.length}`);
  if (throttled) {
    console.log(`  (paced ${throttled}x for the server's 100-per-60s limit — a full sweep takes ~7 min)`);
  }
  if (!ARGS.resolve && needs.length) {
    // Say the ceiling out loud. A "needs params" count printed with no way to
    // move it reads as a property of the tools rather than of this run.
    console.log(
      `\n  ${needs.length} tools went uncalled for want of an argument. --resolve harvests real ids\n` +
      '  from read-only listers and probes them, which turns most of that into real coverage\n' +
      '  (slower: it costs up to one extra call per candidate per tool).',
    );
  }
  if (err.length) {
    console.log('\n  failures:');
    for (const r of err) console.log(`    ${r.tool.padEnd(46)} ${r.detail}`);
  } else {
    console.log('\n  no failures — every non-ok result was a parameter refusal or an unconnected integration.');
  }
  console.log(`\n  full report: ${path.resolve(ARGS.out)}`);
  process.exitCode = err.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
