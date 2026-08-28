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
 * ★ Only tools the SERVER declares `GET` are called, via the same
 * lib/readonly-tools.json the permission hook uses. Nothing here can create,
 * update, delete, send or publish. That is a property of the list, not of this
 * script's good intentions -- see lib/tool-safety.mjs.
 *
 * Usage:
 *   node scripts/sweep-tools.mjs [--dir <bound-account-dir>] [--limit N]
 *                                [--out report.json] [--concurrency N]
 *                                [--only <substring>]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReadOnlyTool } from '../lib/tool-safety.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = { dir: process.cwd(), limit: 0, out: 'hiveku-sweep.json', concurrency: 4, only: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = path.resolve(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(argv[++i]) || 4);
    else if (a === '--only') out.only = argv[++i];
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
      env: { ...process.env, HIVEKU_PROJECT_DIR: cwd },
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

const short = (v, n = 160) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
};

/**
 * Classify one tool result.
 *
 * A tool that rejects empty arguments is NOT broken -- it wants parameters this
 * sweep has no business inventing. Reporting that as a failure would bury the
 * real ones, which is the whole reason a sweep is worth running.
 */
function classify(msg) {
  if (msg?.error) {
    const text = `${msg.error.message || ''} ${JSON.stringify(msg.error.data || '')}`.toLowerCase();
    if (/required|missing|invalid_?param|must provide|expected .* argument|validation/.test(text)) {
      return { status: 'needs-params', detail: short(msg.error.message) };
    }
    return { status: 'error', detail: short(msg.error.message) };
  }
  const result = msg?.result;
  if (result?.isError) {
    const text = short((result.content || []).map((c) => c.text || '').join(' '));
    if (/required|missing|must provide|validation/i.test(text)) return { status: 'needs-params', detail: text };
    return { status: 'error', detail: text };
  }
  return { status: 'ok', detail: short((result?.content || []).map((c) => c.text || '').join(' '), 80) };
}

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

  // ★ The safety gate. Only server-declared reads.
  let targets = all.map((t) => t.name).filter(isReadOnlyTool);
  if (ARGS.only) targets = targets.filter((n) => n.includes(ARGS.only));
  if (ARGS.limit) targets = targets.slice(0, ARGS.limit);

  console.log(`${all.length} tools exposed, ${targets.length} read-only selected` +
    (ARGS.only ? ` (filtered by "${ARGS.only}")` : '') + `\n`);

  const results = [];
  let done = 0;
  const queue = [...targets];
  const worker = async () => {
    for (;;) {
      const name = queue.shift();
      if (!name) return;
      const t0 = Date.now();
      let msg;
      try { msg = await mcp.send('tools/call', { name, arguments: {} }); }
      catch (e) { msg = { error: { message: String(e.message || e) } }; }
      const c = classify(msg);
      results.push({ tool: name, ...c, ms: Date.now() - t0 });
      done++;
      if (done % 25 === 0 || done === targets.length) {
        process.stdout.write(`  ${done}/${targets.length}\r`);
      }
    }
  };
  await Promise.all(Array.from({ length: ARGS.concurrency }, worker));
  mcp.close();

  results.sort((a, b) => a.tool.localeCompare(b.tool));
  const by = (s) => results.filter((r) => r.status === s);
  const ok = by('ok'), needs = by('needs-params'), err = by('error');

  const report = {
    account_dir: ARGS.dir,
    swept_at: new Date().toISOString(),
    tools_exposed: all.length,
    tools_swept: results.length,
    ok: ok.length,
    needs_params: needs.length,
    errors: err.length,
    results,
  };
  fs.writeFileSync(ARGS.out, JSON.stringify(report, null, 2) + '\n');

  console.log(`\n  ok            ${ok.length}`);
  console.log(`  needs params  ${needs.length}   (not a failure — the tool wants arguments)`);
  console.log(`  ERRORS        ${err.length}`);
  if (err.length) {
    console.log('\n  failures:');
    for (const r of err) console.log(`    ${r.tool.padEnd(46)} ${r.detail}`);
  }
  console.log(`\n  full report: ${path.resolve(ARGS.out)}`);
  process.exitCode = err.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
