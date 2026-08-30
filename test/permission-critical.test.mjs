/**
 * The ask-list must be real, complete, and in sync everywhere it is spelled.
 *
 * data/permission-critical-tools.json is consumed twice:
 *   - INSTALL.md copies it into a literal permissions.ask block (Claude Code
 *     ask rules accept NO wildcards, so every name is exact — a renamed tool
 *     makes the rule stop matching SILENTLY and the tool goes blanket-allowed);
 *   - hiveku-mcp-api-server's permission-critical-tools.test.ts reads the SAME
 *     file and asserts every name resolves in the MCP registry with a matching
 *     method, and that NO gated tool is a GET.
 *
 * This suite is the plugin-side half of that contract: names must exist in
 * lib/tool-index.json (or be contracted in PENDING_TOOLS), methods must match,
 * the count must be honest, INSTALL.md must mirror the file exactly, and no
 * GET may sneak in — a GET that needs gating is gated by argument/name in
 * lib/tool-safety.mjs (NEVER_AUTO_APPROVE / ARG_GATED_READS), never here,
 * because an ask rule on a read stalls every sweep that touches it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const permFile = JSON.parse(
  fs.readFileSync(path.join(root, 'data', 'permission-critical-tools.json'), 'utf8'),
);
const indexMethods = new Map(
  JSON.parse(fs.readFileSync(path.join(root, 'lib', 'tool-index.json'), 'utf8'))
    .tools.map((t) => [t.name, t.method]),
);

test('count matches and no name is duplicated', () => {
  assert.equal(
    permFile.count,
    permFile.tools.length,
    `count says ${permFile.count} but the file holds ${permFile.tools.length} tools — update count with the list`,
  );
  const seen = new Set();
  const dupes = permFile.tools.map((t) => t.name).filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  assert.deepEqual(dupes, [], `duplicated gated names: ${dupes.join(', ')}`);
});

test('every gated name exists in the tool index or is a contracted pending tool', () => {
  const unknown = permFile.tools
    .map((t) => t.name)
    .filter((n) => !indexMethods.has(n) && !PENDING_TOOLS.has(n));
  assert.deepEqual(
    unknown,
    [],
    'gated names that exist nowhere — a rename upstream makes the ask rule stop matching silently: ' +
      unknown.join(', '),
  );
});

test('every gated method matches the tool index where the tool has landed', () => {
  const wrong = permFile.tools
    .filter((t) => indexMethods.has(t.name) && indexMethods.get(t.name) !== t.method)
    .map((t) => `${t.name}: file says ${t.method}, index says ${indexMethods.get(t.name)}`);
  assert.deepEqual(wrong, [], `method drift (the MCP-side suite will refuse these too):\n  ${wrong.join('\n  ')}`);
});

test('no gated tool is a GET — reads are gated in tool-safety, never in the ask list', () => {
  const gets = permFile.tools.filter((t) => indexMethods.get(t.name) === 'GET').map((t) => t.name);
  assert.deepEqual(
    gets,
    [],
    'GET tools in the ask list — the MCP-side suite refuses these outright; gate a risky read via ' +
      'NEVER_AUTO_APPROVE / ARG_GATED_READS in lib/tool-safety.mjs instead: ' + gets.join(', '),
  );
});

test('INSTALL.md main ask block mirrors the JSON exactly', () => {
  const install = fs.readFileSync(path.join(root, 'INSTALL.md'), 'utf8');
  const blocks = [...install.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter((b) => Array.isArray(b?.permissions?.ask) && b.permissions.ask.length >= 10);
  assert.equal(blocks.length, 1, `expected exactly one main permissions block (ask >= 10 entries), found ${blocks.length}`);

  const prefix = 'mcp__plugin_hiveku_hk__';
  const badPrefix = blocks[0].permissions.ask.filter((n) => !n.startsWith(prefix));
  assert.deepEqual(badPrefix, [], `ask entries without the plugin prefix: ${badPrefix.join(', ')}`);

  const askNames = blocks[0].permissions.ask.map((n) => n.slice(prefix.length));
  const jsonNames = permFile.tools.map((t) => t.name);
  const missingFromInstall = jsonNames.filter((n) => !askNames.includes(n));
  const extraInInstall = askNames.filter((n) => !jsonNames.includes(n));
  assert.deepEqual(
    { missingFromInstall, extraInInstall },
    { missingFromInstall: [], extraInInstall: [] },
    'INSTALL.md ask block and data/permission-critical-tools.json disagree — they must be edited together',
  );
});

test('plugin_version matches the shipped plugin version', () => {
  const plugin = JSON.parse(
    fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  assert.equal(
    permFile.plugin_version,
    plugin.version,
    'data/permission-critical-tools.json plugin_version is stale — scripts/release.mjs stamps it; ' +
      'run the release script rather than editing the number by hand',
  );
});
