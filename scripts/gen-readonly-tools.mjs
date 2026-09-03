#!/usr/bin/env node
/**
 * Generate the read-only tool list from the MCP server's own route mappings.
 *
 * Every Hiveku tool declares `mapping.method`. GET is an authoritative
 * statement that the tool reads and does not write -- far better than
 * inferring intent from a tool's NAME, which is what this replaced after an
 * audit caught `voice_voicemail_mark_read` being auto-approved by a naming
 * rule (it ends in "read" and plainly mutates).
 *
 * ★ PAIRING, and the trap it avoids. A tool is `name: '...'` followed later by
 * `mapping: { method: '...' }`. Pairing them with a fixed character window --
 * "look 4500 chars ahead" -- silently loses every tool whose object is longer
 * than the window, and silently mis-pairs when two objects are short. That
 * exact bug shipped once in this codebase and made a contract check pass
 * vacuously over 31 tools. So: pair each name with the FIRST method that
 * appears before the NEXT name, with no distance limit, and assert the totals.
 *
 * Usage:  node scripts/gen-readonly-tools.mjs [--check]
 *   (no flag)  rewrite lib/readonly-tools.json
 *   --check    exit 1 if the committed file is stale (for CI / prepublish)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const OUT = path.join(PLUGIN_ROOT, 'lib', 'readonly-tools.json');

// The MCP server is a sibling repo, not a dependency. Its absence is fine at
// install time and only matters when regenerating.
const SERVER_SRC = path.resolve(PLUGIN_ROOT, '..', 'hiveku-mcp-api-server', 'src', 'tools');

/**
 * ★ LINE-ANCHORED on purpose. A loose /name:\s*'(...)'/ also matches
 * `pathParams: { name: 'name' }`, which appears inline inside real tools. That
 * does two kinds of damage: it invents a tool called `name`, and — far worse —
 * it acts as a false tool BOUNDARY, so the real tool above it loses the method
 * that follows and silently stops being auto-approved.
 *
 * A tool declaration is always `name: '...',` alone on its line. Requiring the
 * line to contain nothing else excludes every nested `name:` field. Verified:
 * the loose form produced a bogus `name` tool and left 5 tools unmapped; this
 * form produces neither.
 */
/**
 * ★ BOTH DECLARATION STYLES. Most tools are written as object literals
 * (`name: 'x',`), but a few hundred were generated as JSON (`"name": "x",`).
 * A pattern that only knew the first form skipped those tools entirely from
 * the source-parse fallback — including two PPC reads found on 2026-08-30 —
 * and the miss was invisible because the dist path, which reads real objects,
 * covered for it whenever the server happened to be built.
 */
const TOKEN = /(?:^[ \t]*"?name"?:\s*['"]([a-z0-9_]+)['"],[ \t]*$)|(?:"?method"?:\s*['"]([A-Z]+)['"])|(?:"?readOnlyHint"?:\s*(true))/gm;

function extract(source) {
  // Every tool name, every HTTP method and every readOnlyHint, in document order.
  const tokens = [];
  for (const m of source.matchAll(TOKEN)) {
    if (m[1]) tokens.push({ kind: 'name', value: m[1] });
    else if (m[2]) tokens.push({ kind: 'method', value: m[2] });
    else tokens.push({ kind: 'hint', value: true });
  }

  // Pair each name with the first method before the next name. No window.
  const pairs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'name') continue;
    let method = null;
    let readOnlyHint = false;
    for (let j = i + 1; j < tokens.length && tokens[j].kind !== 'name'; j++) {
      if (tokens[j].kind === 'method' && method === null) method = tokens[j].value;
      if (tokens[j].kind === 'hint') readOnlyHint = true;
    }
    pairs.push({ name: tokens[i].value, method, readOnlyHint });
  }
  return pairs;
}

/**
 * ★ THE BUILT SERVER IS AUTHORITATIVE; the regex below is the fallback.
 *
 * Parsing `src/tools/*.ts` cannot see a tool declared through a class method or
 * a factory, and it cannot see the second exported array (`hivekuMetaTools`)
 * that the transport also serves. Measured: the parse finds 1,531 tools / 590
 * GETs, while `dist` declares 1,583 with a method on EVERY one. Those 52 were
 * invisible, so they prompted forever and the sweep skipped them.
 *
 * ★ STALENESS IS THE DANGEROUS DIRECTION. A `dist` older than `src` can still
 * say GET for a tool that has since become a POST, and this file feeds a hook
 * that pre-approves without asking. So an out-of-date build is refused
 * outright, never used with a warning.
 */
const SERVER_ROOT = path.resolve(PLUGIN_ROOT, '..', 'hiveku-mcp-api-server');
const DIST_TOOLS = path.join(SERVER_ROOT, 'dist', 'tools', 'olympus-tools.js');

function newestSourceMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); continue; }
      if (!e.name.endsWith('.ts') || e.name.includes('.test.')) continue;
      const m = fs.statSync(full).mtimeMs;
      if (m > newest) newest = m;
    }
  };
  walk(dir);
  return newest;
}

/** name -> HTTP method, from the compiled server. Returns null if unusable. */
function collectFromDist() {
  if (!fs.existsSync(DIST_TOOLS)) return null;
  const built = fs.statSync(DIST_TOOLS).mtimeMs;
  const src = newestSourceMtime(path.join(SERVER_ROOT, 'src'));
  if (src > built) {
    console.error('[gen-readonly-tools] dist/ is OLDER than src/ — refusing to derive');
    console.error('  permissions from a stale build. Run `npm run build` in hiveku-mcp-api-server.');
    process.exit(7);
  }
  let mod;
  try { mod = createRequire(import.meta.url)(DIST_TOOLS); } catch (e) {
    console.error(`[gen-readonly-tools] could not load ${DIST_TOOLS}: ${e.message}`);
    return null;
  }
  const byName = new Map();
  // Both arrays are served by the transport. Missing the second one is how 17
  // meta tools stayed unapproved.
  for (const key of ['olympusTools', 'hivekuMetaTools']) {
    for (const t of mod[key] ?? []) {
      if (t?.name) {
        byName.set(t.name, { method: t?.mapping?.method ?? null, readOnlyHint: t?.readOnlyHint === true });
      }
    }
  }
  return byName.size ? byName : null;
}

function collect() {
  if (!fs.existsSync(SERVER_SRC)) {
    console.error(`[gen-readonly-tools] ${SERVER_SRC} not found — clone hiveku-mcp-api-server beside this plugin to regenerate.`);
    process.exit(2);
  }
  const files = fs.readdirSync(SERVER_SRC).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
  const all = [];
  for (const f of files) all.push(...extract(fs.readFileSync(path.join(SERVER_SRC, f), 'utf8')));

  // Deduplicate by name. A name defined twice with DIFFERENT methods is a real
  // problem and must not be papered over.
  const byName = new Map();
  const conflicts = [];
  for (const p of all) {
    const prev = byName.get(p.name);
    if (prev !== undefined && prev.method !== p.method) conflicts.push(`${p.name}: ${prev.method} vs ${p.method}`);
    if (prev === undefined) byName.set(p.name, { method: p.method, readOnlyHint: p.readOnlyHint === true });
  }
  if (conflicts.length) {
    console.error('[gen-readonly-tools] same tool name with conflicting methods:\n  ' + conflicts.join('\n  '));
    process.exit(3);
  }
  return byName;
}

// GET is necessary but NOT sufficient, for two different reasons.
//
// One: a read that RETURNS SECRET MATERIAL must never be silently pre-approved,
// because the PreToolUse hook's approval bypasses the user's own permission
// rules (a hook decision does not consult settings.json, so a user's ask rule
// for one of these would be neutralized).
//
// Two: a GET that WRITES. The method is the only signal this generator has, and
// a route is free to mutate on the way past. Such a tool is pre-approved as a
// read while changing data, which is strictly worse than a write that prompts.
//
// Each exclusion names its reason; add here only after reading the tool's
// registered description AND its route, and never remove one without
// re-reading both.
const SENSITIVE_READ_EXCLUSIONS = new Map([
  ['project_secrets_list',
    'returns { secrets: { KEY: value } } - PLAINTEXT env values for everything not ' +
    'opt-in flagged sensitive. Reading credentials silently is not a read-only act.'],
  // 2026-09-01. Its own registered description says so: "This GET is not purely
  // a read: it first backfills the legacy target_avatar_id into the link
  // table." A GET that writes was being auto-approved as a read.
  ['customer_journey_avatar_list',
    'the route BACKFILLS customer_journey_maps.target_avatar_id into the ' +
    'customer_journey_avatars link table before returning. A GET, but not a read.'],
  // 2026-09-03. A GET whose route may CREATE a media_assets row: when the source
  // content item's hero image has no library row yet, repurpose/source registers a
  // pointer asset (reported as hero.registered). Its MCP mapping deliberately
  // carries no readOnlyHint; the GET method alone must not pre-approve it.
  ['social_repurpose_source',
    'registers the hero image as a media_assets pointer row when none exists ' +
    '(hero.registered: true). A GET, but it can write a library row.'],
  ['design_render_job_get',
    "2026-09-01. Its own registered description: calling it 'does not just read the row, it " +
    "ADVANCES it' - same pollAndAdvance as the reconcile cron, finishing a paid render and " +
    'registering the asset. A GET, but not a read.'],
  // 2026-09-03. A POST today, listed here so that a future readOnlyHint or a
  // method change can never sweep it into the pre-approved list: the response
  // is a short-lived signed URL to a document a site visitor uploaded through a
  // form. Minting the link is distribution, exactly like voice_recording_url_get.
  ['marketing_form_attachment_download_url',
    'returns a signed, unrevocable download link to a visitor-uploaded document (resume, ID, ' +
    'intake form). Minting it is distribution, not a read; it must be an explicit operator ask.'],
]);

// The mirror image: a POST that is a pure read. Some routes dispatch reads and
// writes through one POST body (`action: ...`), so a read-only tool can carry
// method POST and would prompt on every call forever. Listing one here is a
// claim that the ROUTE writes nothing for that action - add only after reading
// the route handler, name the evidence, and never list a tool whose action
// can enqueue, send, or record anything.
const READ_ONLY_POST_OVERRIDES = new Map([
  ['marketing_offline_conversions_preview',
    'route pins dryRun: true server-side ("A preview writes nothing, ever"); returns a discovery report'],
  ['marketing_offline_conversions_queue',
    'findMany over the outbox with masked identifiers; no write path in the handler'],
  ['seo_ga4_report',
    'one Data API runReport; the route asks requireOlympusAuth for the read grant ({ action: "read" })'],
  ['ppc_experiments_list',
    'two GAQL SELECTs (experiment, experiment_arm); google-ops lists it in READ_OPERATIONS on the read grant; nothing mutates'],
  // 2026-08-30. Both are POSTs only because they take a body, and both were
  // being refused inside a reads-only guardrail folder - which broke the
  // promise scheduled-routines.md makes, that a read-shaped play degrades to a
  // proposal rather than failing. Validating a graph you cannot change, and
  // previewing how a payload would be normalised, are exactly the reads an
  // unattended session should still be able to do.
  ['workflow_validate',
    'the route loads the definition and runs validateDefinition in memory; it returns {ok, issues, summary} and has no write path'],
  ['workflow_normalize_payload',
    'pure function over the posted payload (meta/normalize-payload); returns the aliased shape, touches no workflow and no row'],
  // workflow_test is a POST, and it EXECUTES the graph - it earns this entry on
  // the engine's gate, not on its verb. Held back until 2026-08-30, when two
  // holes closed in production: the gate now runs at all three dispatch sites
  // (a side-effecting node inside a parallelExecute branch or a transactionBlock
  // used to reach its real handler, so graph SHAPE defeated the dry run), and
  // aiAgent joined the gated set (a "dry run" used to spend real tokens and,
  // since an agent turn can call its own tools, could write). Verified live
  // before adding this line.
  // NOT side-effect-free in the absolute: metered DataForSEO reads and `delay`
  // still execute. It is on this list because it cannot SEND, WRITE or DEPLOY,
  // which is what the reads-only ceiling exists to stop.
  ['workflow_test',
    'runs/:runId POST with test_mode pinned server-side via extraBody (a caller cannot unset it); the engine short-circuits every SIDE_EFFECTING_NODE_TYPES node at all three dispatch sites, persists no run row and burns no quota'],
]);

const fromDist = collectFromDist();
const byName = fromDist ?? collect();
if (!fromDist) {
  console.warn('[gen-readonly-tools] dist/ unavailable — falling back to source parsing,');
  console.warn('  which misses tools declared via class methods and the hivekuMetaTools array.');
}
const total = byName.size;
for (const n of READ_ONLY_POST_OVERRIDES.keys()) {
  // An override for a tool the server no longer serves is a stale claim; fail
  // rather than carry it forward silently.
  if (!byName.has(n)) { console.error(`[gen-readonly-tools] override names unknown tool ${n}`); process.exit(8); }
}
// ★ readOnlyHint BEATS THE VERB, and that is the whole point of it.
//
// The HTTP method is only a good proxy while every read is a GET. It is not:
// 170 ppc_* tools post {action, connection_id} to an action-dispatched route,
// so 47 unambiguous reads — every _list, _report, _status, _summary, _history,
// _performance, _comparison — classified as writes. Operators got a permission
// prompt for reading a report, safety tooling treated an audit as a mutation,
// and the sweep that exists to prove coverage could reach 11 of 170
// (Locus PPC report, PPC-10).
//
// A hint is a CLAIM BY THE DECLARATION that the route writes nothing for that
// tool's fixed action. It is not a naming heuristic — the tool author sets it,
// after reading the handler — and it still cannot rescue a tool listed in
// SENSITIVE_READ_EXCLUSIONS, because "reads only" and "safe to auto-approve"
// are different questions.
const readOnly = [...byName.entries()]
  .filter(([n, e]) =>
    !SENSITIVE_READ_EXCLUSIONS.has(n) &&
    (e.method === 'GET' || e.readOnlyHint === true || READ_ONLY_POST_OVERRIDES.has(n)))
  .map(([n]) => n).sort();
const hinted = [...byName.entries()].filter(([, e]) => e.readOnlyHint === true).length;
const unmapped = [...byName.entries()].filter(([, e]) => e.method === null).map(([n]) => n);

// Sanity gates. A generator that silently produces a tiny or enormous list is
// worse than one that fails: too few means tools start prompting again, too
// many means something non-GET slipped in.
if (total < 1000) { console.error(`[gen-readonly-tools] only ${total} tools parsed — extraction is broken`); process.exit(4); }
if (readOnly.length < 300) { console.error(`[gen-readonly-tools] only ${readOnly.length} GET tools — suspicious`); process.exit(5); }
if (readOnly.length > total * 0.6) { console.error(`[gen-readonly-tools] ${readOnly.length}/${total} marked read-only — too many, check the pairing`); process.exit(6); }

const payload = {
  _comment:
    'GENERATED by scripts/gen-readonly-tools.mjs from hiveku-mcp-api-server route mappings. ' +
    'Do not edit by hand. Every entry has mapping.method === GET, i.e. the server itself ' +
    'declares it a read, except the few POST-dispatched pure reads named with evidence in ' +
    'READ_ONLY_POST_OVERRIDES inside the generator, plus every tool whose declaration carries ' +
    'readOnlyHint: true (an explicit claim by the tool author that its route writes nothing). ' +
    'Used by the PreToolUse hook to pre-approve reads.',
  generatedFrom: fromDist
    ? 'hiveku-mcp-api-server/dist/tools/olympus-tools.js (olympusTools + hivekuMetaTools)'
    : 'hiveku-mcp-api-server/src/tools/*.ts (source parse — undercounts)',
  toolCount: total,
  readOnlyCount: readOnly.length,
  readOnlyHintCount: hinted,
  tools: readOnly,
};
const next = JSON.stringify(payload, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  // ★ A source-parse fallback produces a SMALLER, different file than the
  // committed one, which looks identical to staleness. Calling that "STALE"
  // would block every release from a machine where the server repo is cloned
  // but not built — a false fatal that teaches people to pass --force. Report
  // "cannot verify" (2) instead, which the release gate warns about and skips.
  if (!fromDist && current !== next) {
    console.error('[gen-readonly-tools] cannot verify without a built server (dist/ missing).');
    console.error('  Run `npm run build` in hiveku-mcp-api-server, then retry.');
    process.exit(2);
  }
  if (current !== next) {
    console.error('[gen-readonly-tools] lib/readonly-tools.json is STALE. Run: node scripts/gen-readonly-tools.mjs');
    process.exit(1);
  }
  console.log(`[gen-readonly-tools] up to date (${readOnly.length} read-only of ${total})`);
} else {
  fs.writeFileSync(OUT, next);
  console.log(`[gen-readonly-tools] wrote ${readOnly.length} read-only of ${total} tools (${hinted} via readOnlyHint)`);
  if (unmapped.length) console.log(`  ${unmapped.length} tool(s) had no method and are NOT auto-approved: ${unmapped.slice(0, 5).join(', ')}`);
}
