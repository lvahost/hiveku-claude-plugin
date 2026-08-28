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
const TOKEN = /(?:^[ \t]*name:\s*'([a-z0-9_]+)',[ \t]*$)|(?:method:\s*'([A-Z]+)')/gm;

function extract(source) {
  // Every tool name and every HTTP method, in document order.
  const tokens = [];
  for (const m of source.matchAll(TOKEN)) {
    if (m[1]) tokens.push({ kind: 'name', value: m[1] });
    else tokens.push({ kind: 'method', value: m[2] });
  }

  // Pair each name with the first method before the next name. No window.
  const pairs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'name') continue;
    let method = null;
    for (let j = i + 1; j < tokens.length && tokens[j].kind !== 'name'; j++) {
      if (tokens[j].kind === 'method') { method = tokens[j].value; break; }
    }
    pairs.push({ name: tokens[i].value, method });
  }
  return pairs;
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
    if (prev !== undefined && prev !== p.method) conflicts.push(`${p.name}: ${prev} vs ${p.method}`);
    if (prev === undefined) byName.set(p.name, p.method);
  }
  if (conflicts.length) {
    console.error('[gen-readonly-tools] same tool name with conflicting methods:\n  ' + conflicts.join('\n  '));
    process.exit(3);
  }
  return byName;
}

const byName = collect();
const total = byName.size;
const readOnly = [...byName.entries()].filter(([, m]) => m === 'GET').map(([n]) => n).sort();
const unmapped = [...byName.entries()].filter(([, m]) => m === null).map(([n]) => n);

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
    'declares it a read. Used by the PreToolUse hook to pre-approve reads.',
  generatedFrom: 'hiveku-mcp-api-server/src/tools/*.ts',
  toolCount: total,
  readOnlyCount: readOnly.length,
  tools: readOnly,
};
const next = JSON.stringify(payload, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== next) {
    console.error('[gen-readonly-tools] lib/readonly-tools.json is STALE. Run: node scripts/gen-readonly-tools.mjs');
    process.exit(1);
  }
  console.log(`[gen-readonly-tools] up to date (${readOnly.length} read-only of ${total})`);
} else {
  fs.writeFileSync(OUT, next);
  console.log(`[gen-readonly-tools] wrote ${readOnly.length} read-only of ${total} tools`);
  if (unmapped.length) console.log(`  ${unmapped.length} tool(s) had no method and are NOT auto-approved: ${unmapped.slice(0, 5).join(', ')}`);
}
