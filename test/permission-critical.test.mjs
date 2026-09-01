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
const indexTools = JSON.parse(
  fs.readFileSync(path.join(root, 'lib', 'tool-index.json'), 'utf8'),
).tools;
const indexMethods = new Map(indexTools.map((t) => [t.name, t.method]));

/**
 * ── The re-execution class ────────────────────────────────────────────────
 *
 * ★ THE INCIDENT THIS EARNED. workflow_run_replay, workflow_run_retry and
 * workflow_dead_letter_resolve landed in lib/tool-index.json and were never
 * added to the ask list, while the strictly milder workflow_stranded_replay
 * was gated. On a machine configured per INSTALL.md — `allow:
 * mcp__plugin_hiveku_hk__*` plus the literal ask names — that is not "one
 * missing entry", it is blanket-allowed: an unattended session that finds a
 * failed run calls workflow_run_retry({ run_id, confirm: true }) and the whole
 * graph re-executes with no prompt. Every sendEmail and sendSms node fires a
 * second time at the same contacts, because the engine's send-once guard is
 * keyed PER RUN and a retry is a new run.
 *
 * A tool's own `confirm: true` is NOT a gate. It is a field the model fills in
 * itself, from the same description that told it the field exists — it stops a
 * malformed call, never an unattended one. The only thing that puts a human in
 * the loop is the ask rule, so re-execution belongs there by class, not by
 * whoever remembers.
 *
 * Two independent detectors, because either one alone would have missed one of
 * the three: the NAME rule does not see workflow_dead_letter_resolve (it
 * replays under an `action` argument), and the DESCRIPTION rule does not see a
 * tool whose author never shouted. A tool is in the class if EITHER fires.
 */

/**
 * Names that declare re-execution. Matched on underscore-delimited tokens, so
 * a tool merely CONTAINING "retry" in prose is not swept in.
 */
const REEXEC_NAME = /(^|_)(replay|replays|retry|retries|resend|rerun|requeue|reprocess|redeliver|reexecute|resubmit)(_|$)/;

/**
 * Descriptions that SHOUT re-execution. Deliberately case-sensitive: this
 * codebase upper-cases exactly the sentence a caller must not skim past
 * ("RE-RUNS A PAST RUN'S INPUT FOR REAL"), and matching case-insensitively
 * here pulls in ~90 tools whose prose merely mentions a retry in passing —
 * a rule that noisy gets an exemption entry per failure and stops meaning
 * anything.
 */
const REEXEC_SHOUT = /(?:^|[^A-Za-z])(RE-?RUNS?|RE-?EXECUTES?|RE-?FIRES?|RE-?SENDS?|REPLAYS?|RETRIES)(?:[^A-Za-z]|$)/;

function reExecutionSignals(tool) {
  const signals = [];
  if (REEXEC_NAME.test(tool.name)) signals.push('name');
  if (REEXEC_SHOUT.test(tool.description || '')) signals.push('description');
  return signals;
}

/**
 * Re-execution tools deliberately left OFF the ask list. Added ONE AT A TIME,
 * each with the reason it is not the hazard the class describes — never to
 * quiet a failure. If you cannot write the reason, gate the tool instead.
 */
const REEXEC_NOT_GATED = new Map([
  ['marketing_offline_conversions_requeue',
    're-ARMS rows so a LATER run uploads them; this call itself dispatches nothing, and it 409s ' +
    'until a human takes the account live in the dashboard. The tool that actually sends is ' +
    'marketing_offline_conversions_run — gate that one, not this one'],
  ['project_domain_retry_certificate',
    'requests a fresh SSL cert after a FAILED issuance. Nothing is sent to anyone and no live ' +
    'cert is touched; the usual outcome of a careless call is that it fails again identically ' +
    'because the CAA record is still wrong'],
]);

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

test('every re-execution tool in the index is on the ask list', () => {
  const gated = new Set(permFile.tools.map((t) => t.name));
  // GETs are out of scope by construction: an ask rule on a read stalls every
  // sweep that touches it, which is why the file forbids them outright above.
  // A GET that re-executes would be a mapping bug on the server, not a missing
  // ask entry.
  const missing = indexTools
    .filter((t) => t.method && t.method !== 'GET')
    .filter((t) => reExecutionSignals(t).length > 0)
    .filter((t) => !gated.has(t.name) && !REEXEC_NOT_GATED.has(t.name))
    .map((t) => `${t.name} (${t.method}, matched by ${reExecutionSignals(t).join(' + ')})`);
  assert.deepEqual(
    missing,
    [],
    're-execution tools that are NOT on the ask list. On a machine configured per INSTALL.md ' +
      '(allow: mcp__plugin_hiveku_hk__* plus the literal ask names) these run unprompted, and ' +
      'the send-once guard is keyed per run so every send in the graph fires again. Add each to ' +
      'data/permission-critical-tools.json AND the INSTALL.md ask block, or add it to ' +
      'REEXEC_NOT_GATED with the reason it is not that hazard:\n  ' + missing.join('\n  '),
  );
});

test('every re-execution exemption is still live and still an exemption', () => {
  const byName = new Map(indexTools.map((t) => [t.name, t]));
  const gated = new Set(permFile.tools.map((t) => t.name));
  const stale = [];
  for (const [name, reason] of REEXEC_NOT_GATED) {
    const tool = byName.get(name);
    if (!tool) {
      stale.push(`${name}: no longer in the tool index — a renamed tool carries its exemption ` +
        'nowhere, so the new name is unexamined. Delete this entry and re-judge the new one');
      continue;
    }
    if (reExecutionSignals(tool).length === 0) {
      stale.push(`${name}: no longer matches the re-execution class, so this entry exempts ` +
        'nothing. Delete it');
    }
    if (gated.has(name)) {
      stale.push(`${name}: is BOTH exempted here and on the ask list. The ask list wins; delete ` +
        'the exemption so the reason cannot be read as a decision not to gate it');
    }
    if (!reason || reason.length < 40) {
      stale.push(`${name}: exemption reason is missing or too thin to review`);
    }
  }
  assert.deepEqual(stale, [], `stale re-execution exemptions:\n  ${stale.join('\n  ')}`);
});
