#!/usr/bin/env node
/**
 * Build the LOCAL tool catalogue the plugin searches instead of advertising.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 * Advertising ~1,531 tools costs ~255 tokens each — measured at 447.4k tokens,
 * 224% of the budget, before a single message. Tool search does NOT fix that:
 * deferral withholds a tool's input SCHEMA, while its name and description
 * still ship every session, and Hiveku's descriptions run to 4,600 characters
 * at the extreme.
 *
 * Hiding tools (a department filter) buys the tokens back but costs
 * discoverability — you have to know what you are looking for before you can
 * look for it. A local catalogue buys the tokens back and KEEPS discovery:
 * every tool, with its description, searchable on disk at zero context cost
 * until something actually matches.
 *
 * ── Pairing ───────────────────────────────────────────────────────────────
 * ★ Line-anchored, for the reason gen-readonly-tools.mjs documents: a loose
 * /name:\s*'(...)'/ also matches `pathParams: { name: 'name' }` inline inside a
 * real tool, which invents a phantom tool AND acts as a false boundary that
 * steals the following method from the tool above it.
 *
 * ★ GENERATED FROM THE LIVE SERVER, not from source. Static parsing of
 * src/tools/*.ts finds 1,531 tools and the server actually serves 1,656: the
 * other 125 (all DataForSEO — backlinks_*, dataforseo_labs_*, content_analysis_*,
 * crawl) are registered at RUNTIME by modules whose getTools() returns them from
 * a class method. No amount of regex over the source can see those, and the
 * symptom is silent: hiveku_find_tools simply cannot find a quarter of the SEO
 * surface, and the assistant reports the capability as missing.
 *
 * So the default is to ask a bound account's MCP bridge what it actually serves.
 * --from-source keeps the old parser as a fallback for a machine with no binding,
 * and says loudly that it will undercount.
 *
 * Usage:
 *   node scripts/gen-tool-index.mjs --dir <bound-account-dir>   (live, preferred)
 *   node scripts/gen-tool-index.mjs --from-source               (fallback)
 *   node scripts/gen-tool-index.mjs --check [--dir …]           (CI / prepublish)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDirArg } from './lib/bound-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const OUT = path.join(PLUGIN_ROOT, 'lib', 'tool-index.json');
const SERVER_SRC = path.resolve(PLUGIN_ROOT, '..', 'hiveku-mcp-api-server', 'src', 'tools');

/**
 * A tool declaration is `name: '...',` alone on its line, OR its JSON-style
 * twin `"name": "...",` alone on its line. Nothing else is.
 *
 * ★ The second form is not optional. 55 tools in src/tools (the seo_gtm_*,
 * seo_ga4_*, seo_gbp_media*, seo_gbp_services*, seo_citations_*, seo_cro_audit,
 * ppc_bing_*_report, ppc_meta_* and friends) are declared as pasted JSON with
 * quoted keys. A parser that only knew the TS form paired them with NO method,
 * even in live mode (the live list carries no HTTP method, so it is merged in
 * from this parse), and 39 seo_* writes showed method null in the catalogue,
 * which kept them out of the ask-list gate and off the read-only list.
 */
const NAME_LINE = /^[ \t]*(?:name:\s*'([a-z0-9_]+)'|"name":\s*"([a-z0-9_]+)"),[ \t]*$/gm;

/**
 * Descriptions are single- or double-quoted and often concatenated across many
 * lines with `+`. Capture the whole run so a truncated description does not
 * silently make a tool unfindable by its own keywords.
 */
const STR = String.raw`(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
// Both key styles: `description: '...'` / `method: 'GET'` and `"description": "..."` / `"method": "GET"`.
const DESC = new RegExp(String.raw`"?description"?:\s*(${STR}(?:\s*\+\s*${STR})*)`);
const METHOD = /"?method"?:\s*['"]([A-Z]+)['"]/;
const STR_G = new RegExp(STR, 'g');

/**
 * The server's own budget for this tool, so the bridge can stop aborting calls
 * the server was still working on.
 *
 * ★ WHY IT IS GENERATED RATHER THAN HAND-LISTED. lib/upstream.mjs used to hold a
 * three-key table of per-tool timeouts, and it was wrong in both directions at
 * once: 254 tools declare `mapping.timeoutMs` above the bridge's 60s default and
 * were aborted client-side mid-call, while the three tools the table DID name
 * map to routes that declare no timeoutMs at all, so the bridge waited 180s for
 * a proxy that had already given up at 60s. A table that must track another
 * repo drifts silently; a generated field cannot.
 *
 * ★ SCOPED TO THE `mapping` OBJECT, not the whole tool body. `web_scrape`
 * declares an INPUT PARAMETER also called timeoutMs (`timeoutMs: { type:
 * 'number' … }` in its inputSchema), which is a value the caller passes to
 * Firecrawl, not a budget for the proxy hop. Matching it would publish a
 * downstream tool's argument as this tool's client budget. Requiring a NUMERIC
 * value already excludes that one, but the scoping is what keeps the next
 * numeric-defaulted parameter from silently becoming a timeout.
 *
 * ★ NULL, NEVER 0, when nothing is declared. A tool with no mapping.timeoutMs
 * has not declared 60s: it has declared nothing, and the proxy applies its own
 * default. The consumer has to be able to tell those apart - see timeoutFor()
 * in lib/upstream.mjs, which treats null as "unknown" and falls back to the
 * infrastructure ceiling rather than to a short guess.
 */
const MAPPING_KEY = /(?:^|[^A-Za-z0-9_])"?mapping"?:/;
// Both key styles again, and both number styles: `timeoutMs: 160_000` (TS
// numeric separators) and `"timeoutMs": 160000` (the pasted-JSON declarations).
const TIMEOUT_MS = /"?timeoutMs"?:\s*([0-9][0-9_]*)/;

function unquote(literal) {
  // Join a `'a' + 'b'` run into one string without eval.
  return (literal.match(STR_G) || [])
    .map((p) =>
      p
        .slice(1, -1)
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        // JSON-style declarations carry \u2014 style escapes for the dashes and
        // arrows Hiveku descriptions use; decode them so search matches prose.
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\'),
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ask a bound account's MCP bridge for the real list.
 *
 * Uses the plugin's own bin/hiveku-mcp so it exercises the same path a session
 * does, with HIVEKU_TOOL_MODE=all so index mode cannot narrow what we see —
 * generating the index from an already-indexed list would freeze it at 13.
 */
function collectLive(dir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(path.join(PLUGIN_ROOT, 'bin', 'hiveku-mcp'), [], {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HIVEKU_PROJECT_DIR: dir, HIVEKU_TOOL_MODE: 'all' },
    });
    let buf = '', err = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('timed out after 60s')); }, 60_000);
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) {
          clearTimeout(timer);
          proc.kill();
          const tools = msg?.result?.tools;
          if (!Array.isArray(tools) || !tools.length) {
            reject(new Error(`server returned no tools${err ? ` — ${err.trim()}` : ''}`));
          } else resolve(tools);
        }
      }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    for (const m of [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gen-tool-index', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]) proc.stdin.write(JSON.stringify(m) + '\n');
  });
}

function extract(source) {
  const names = [...source.matchAll(NAME_LINE)];
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const m = names[i];
    // Everything between this tool's name and the next one. No fixed window:
    // a character budget silently drops tools whose object is longer than it.
    const from = m.index + m[0].length;
    const to = i + 1 < names.length ? names[i + 1].index : source.length;
    const body = source.slice(from, to);
    const desc = body.match(DESC);
    const method = body.match(METHOD);
    // Read the budget out of the mapping object alone; see TIMEOUT_MS above for
    // the input-parameter collision this scoping avoids.
    const mappingAt = body.search(MAPPING_KEY);
    const timeout = mappingAt === -1 ? null : body.slice(mappingAt).match(TIMEOUT_MS);
    const timeoutMs = timeout ? Number(timeout[1].replace(/_/g, '')) : null;
    out.push({
      name: m[1] ?? m[2],
      description: desc ? unquote(desc[1]) : '',
      method: method ? method[1] : null,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null,
    });
  }
  return out;
}

const ARGV = process.argv.slice(2);
const CHECK = ARGV.includes('--check');
const FROM_SOURCE = ARGV.includes('--from-source');
// ★ Falls back to a discovered bound account. Before this, --check with no
// --dir exited 2 ("cannot verify") on every machine, so the release gate
// reported a skip as a pass and the index went 125 tools stale behind it.
const DIR_ARG = resolveDirArg(ARGV);

/** Parse from source. Undercounts by design; see the header. */
function collectFromSource() {
  if (!fs.existsSync(SERVER_SRC)) {
    console.error(`[gen-tool-index] ${SERVER_SRC} not found — clone hiveku-mcp-api-server beside this plugin, or use --dir <bound-account>.`);
    process.exit(2);
  }
  const byName = new Map();
  for (const f of fs.readdirSync(SERVER_SRC).filter((x) => x.endsWith('.ts') && !x.includes('.test.'))) {
    for (const t of extract(fs.readFileSync(path.join(SERVER_SRC, f), 'utf8'))) {
      if (!byName.has(t.name)) byName.set(t.name, t);
    }
  }
  return [...byName.values()];
}

let raw;
let source;
if (CHECK && !DIR_ARG && !FROM_SOURCE) {
  // ★ CANNOT VERIFY is not the same as STALE. A source parse undercounts by 125
  // runtime-registered tools, so comparing it against a live-generated index
  // would report every healthy release as stale — a gate that cries wolf gets
  // switched off, and then it protects nothing.
  console.error('[gen-tool-index] cannot verify without --dir <bound-account>: a source parse undercounts by design.');
  process.exit(2);
}

if (FROM_SOURCE || !DIR_ARG) {
  if (!FROM_SOURCE) {
    console.error('[gen-tool-index] no --dir given, falling back to source parsing.');
    console.error('  ★ This UNDERCOUNTS: DataForSEO tools are registered at runtime and are invisible to the parser.');
    console.error('  Prefer: node scripts/gen-tool-index.mjs --dir <a bound account folder>');
  }
  raw = collectFromSource();
  source = 'hiveku-mcp-api-server/src/tools/*.ts (static parse — undercounts runtime-registered tools)';
} else {
  const live = await collectLive(path.resolve(DIR_ARG)).catch((e) => {
    console.error(`[gen-tool-index] live collection failed: ${e.message}`);
    process.exit(2);
  });
  // The live list has no HTTP method and no timeout: both exist only in
  // source, because the wire tools/list carries name/description/inputSchema
  // and nothing about the route behind them. Merge them in where we have them,
  // so the read-only classification and the bridge's timeout keep working.
  //
  // ★ A tool the source parse cannot see (the ~125 DataForSEO tools registered
  // at runtime) keeps timeoutMs null. That is the honest answer - "not read" -
  // and the bridge treats it as unknown, not as "no budget declared".
  const methods = new Map();
  const timeouts = new Map();
  if (fs.existsSync(SERVER_SRC)) {
    for (const t of collectFromSource()) {
      if (t.method) methods.set(t.name, t.method);
      if (t.timeoutMs != null) timeouts.set(t.name, t.timeoutMs);
    }
  }
  raw = live.map((t) => ({
    name: t.name,
    description: String(t.description ?? '').replace(/\s+/g, ' ').trim(),
    method: methods.get(t.name) ?? null,
    timeoutMs: timeouts.get(t.name) ?? null,
  }));
  source = 'live MCP tools/list (authoritative — includes runtime-registered tools)';
}

const tools = raw
  .map((t) => ({
    name: t.name,
    dept: t.name.includes('_') ? t.name.slice(0, t.name.indexOf('_')) : null,
    method: t.method,
    // The server's declared budget for this tool, or null when it declares
    // none. lib/upstream.mjs reads it so the bridge stops aborting calls the
    // server was still working on. null means UNKNOWN, never "60s".
    timeoutMs: t.timeoutMs ?? null,
    // ★ FULL description, not trimmed. This file is read from disk and searched
    // locally; it is NEVER sent to a model, so trimming it buys nothing and
    // costs everything. A 400-char cap truncated 628 of 1,656 descriptions and
    // cut the exact keywords people search by — `project_get` lost
    // `dev_preview_url`, so "development environment url" could not find the
    // one tool that returns it, and a session fell back to a memory file.
    // Trimming happens at RENDER time instead, where context actually matters.
    description: t.description,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const missingDesc = tools.filter((t) => !t.description).length;
const withTimeout = tools.filter((t) => t.timeoutMs != null).length;

// Gates. A silently tiny or description-less index is worse than a hard failure:
// search returns nothing and the tools look like they do not exist.
if (tools.length < 1000) {
  console.error(`[gen-tool-index] only ${tools.length} tools — collection is broken`);
  process.exit(3);
}
if (missingDesc > tools.length * 0.05) {
  console.error(`[gen-tool-index] ${missingDesc} tools have no description — collection is broken`);
  process.exit(4);
}
// ★ A timeout extraction that quietly stops matching is INVISIBLE at runtime:
// every tool falls back to the ceiling and long calls still work, so nobody
// notices until a short-budget tool waits 135s for a proxy that gave up at 60s.
// The server source declares 254 of these today; zero means the regex broke.
// Only checkable when the source is on disk - a live-only machine cannot see
// mappings at all, and "cannot verify" must not masquerade as "verified".
if (fs.existsSync(SERVER_SRC) && withTimeout === 0) {
  console.error('[gen-tool-index] no tool carries a mapping timeoutMs - the extraction is broken');
  process.exit(5);
}

const payload = {
  _comment:
    'GENERATED by scripts/gen-tool-index.mjs. Do not edit. Searched locally by the plugin so the ' +
    'full tool surface stays discoverable without advertising ~1,500 tool definitions per session. ' +
    'timeoutMs is the server\'s own declared budget for the tool (mapping.timeoutMs), read by ' +
    'lib/upstream.mjs so the bridge does not abort a call the server is still working on; null ' +
    'means the declaration carries none, which is UNKNOWN and not a budget of zero.',
  generatedFrom: source,
  toolCount: tools.length,
  timeoutCount: withTimeout,
  tools,
};
const next = JSON.stringify(payload, null, 2) + '\n';

if (CHECK) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== next) {
    console.error('[gen-tool-index] lib/tool-index.json is STALE. Run: node scripts/gen-tool-index.mjs --dir <bound-account>');
    process.exit(1);
  }
  console.log(`[gen-tool-index] up to date (${tools.length} tools, ${withTimeout} with a server timeout)`);
} else {
  fs.writeFileSync(OUT, next);
  console.log(
    `[gen-tool-index] wrote ${tools.length} tools ` +
      `(${(Buffer.byteLength(next) / 1024).toFixed(0)} KB), ${missingDesc} without a description, ` +
      `${withTimeout} with a declared server timeout`,
  );
}
