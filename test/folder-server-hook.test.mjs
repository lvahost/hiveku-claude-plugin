/**
 * The PreToolUse hook judges the folder's own `hiveku` server exactly as it judges this plugin's server.
 *
 * A hiveku-sync folder (`hiveku-sync init`) and a VS Code extension folder name the Hiveku MCP server `hiveku` in
 * their own .mcp.json, so Claude Code calls its tools as mcp__hiveku__<tool>. Until 2026-11-10 the hook's matcher
 * and hivekuToolName knew only mcp__plugin_hiveku_hk__, so in a sync folder (which had no ask rules of its own)
 * the database and Supabase writes ran unasked in auto and bypass modes. Same server, same tools, same rules
 * (lane 30's decision a). What the hook's answer does in each permission mode is written by
 * FOLDER_SERVER_TOOL_PREFIX in lib/tool-safety.mjs; in bypassPermissions only an ask RULE is documented to
 * prompt, which is why hiveku-sync init also writes the folder's ask rules.
 *
 * Run: node --test test/folder-server-hook.test.mjs
 */
import { isolatedEnv } from './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FOLDER_SERVER_TOOL_PREFIX,
  HIVEKU_TOOL_PREFIX,
  HIVEKU_TOOL_PREFIXES,
  decideForPayload,
  decideWithGuardrails,
  hivekuToolName,
} from '../lib/tool-safety.mjs';
import { probeIsStale, updateCheckPath } from '../lib/update-check.mjs';

const PLUGIN = HIVEKU_TOOL_PREFIX;
const FOLDER = FOLDER_SERVER_TOOL_PREFIX;
const index = JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8')).tools;
const hooks = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8')).hooks;
const decision = (r) => r?.hookSpecificOutput?.permissionDecision ?? null;

/** A folder of its own, with this guardrails file when one is given. */
function folderWith(guardrails) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-folder-server-'));
  if (guardrails !== undefined) {
    mkdirSync(join(dir, '.hiveku'), { recursive: true });
    writeFileSync(join(dir, '.hiveku', 'guardrails.json'), JSON.stringify(guardrails));
  }
  return dir;
}

/** Runs the real hook as hooks/hooks.json does, with no network (a fresh update-check stamp). */
function runPreToolUseHook(toolName, toolInput, cwd) {
  const dataDir = mkdtempSync(join(tmpdir(), 'hk-folder-server-data-'));
  writeFileSync(updateCheckPath(dataDir), JSON.stringify({ checked_at: new Date().toISOString() }));
  assert.equal(probeIsStale(dataDir), false, 'the update probe would spawn; the fixture is wrong');
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../bin/hiveku', import.meta.url)), 'hook', 'pre-tool-use'],
    {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, cwd }),
      encoding: 'utf8',
      env: isolatedEnv({ HIVEKU_PLUGIN_DATA: dataDir }),
      timeout: 20_000,
    },
  );
}

test('the two prefixes: the plugin\'s server and the folder\'s own hiveku server', () => {
  assert.equal(PLUGIN, 'mcp__plugin_hiveku_hk__');
  assert.equal(FOLDER, 'mcp__hiveku__');
  assert.deepEqual([...HIVEKU_TOOL_PREFIXES], [PLUGIN, FOLDER]);
});

test('hooks.json runs the PreToolUse hook on both prefixes, read the way Claude Code reads a matcher', () => {
  // Claude Code's hooks reference: a matcher with any character other than letters, digits, _ and | is a
  // JavaScript regular expression tested unanchored (RegExp.prototype.test). The other tests here also read it
  // anchored, so both forms are checked.
  const matchers = hooks.PreToolUse.map((h) => h.matcher);
  const reaches = (name) => matchers.some((m) => new RegExp(m).test(name));
  const reachesWhole = (name) => matchers.some((m) => new RegExp(`^(?:${m})$`).test(name));
  for (const tool of ['database_execute', 'supabase_auth_user_update', 'supabase_policy_create', 'hiveku_batch', 'database_status']) {
    for (const prefix of HIVEKU_TOOL_PREFIXES) {
      assert.ok(reaches(`${prefix}${tool}`), `no PreToolUse matcher reaches ${prefix}${tool}`);
      assert.ok(reachesWhole(`${prefix}${tool}`), `no PreToolUse matcher covers the whole of ${prefix}${tool}`);
    }
  }
  // NEGATIVE CONTROL: another server's tools, even one whose name starts like hiveku's.
  for (const other of [
    'mcp__hiveku_staging__database_execute',
    'mcp__hivekux__database_execute',
    'mcp__plugin_serena_serena__read_file',
    'mcp__sentry__search_issues',
    'xmcp__hiveku__database_execute',
    'Bash',
  ]) {
    assert.equal(reaches(other), false, `the PreToolUse matcher must not reach ${other}`);
  }
});

test('hivekuToolName reads both prefixes and nothing else', () => {
  assert.equal(hivekuToolName(`${PLUGIN}database_execute`), 'database_execute');
  assert.equal(hivekuToolName(`${FOLDER}database_execute`), 'database_execute');
  for (const other of [
    FOLDER,
    PLUGIN,
    'mcp__hiveku_staging__database_execute',
    'mcp__hivekux__database_execute',
    'MCP__HIVEKU__database_execute',
    'mcp__sentry__search_issues',
    'Bash',
    '',
    null,
    undefined,
  ]) {
    assert.equal(hivekuToolName(other), null, `should ignore ${String(other)}`);
  }
});

test('every indexed tool gets the same answer under both prefixes', () => {
  // The rule is per tool, never per prefix: the read pre-approval, the always-ask writes, the memory and version
  // rules, the metered and vetoed reads, and silence for an ordinary write.
  assert.ok(index.length > 1000, `the tool index looks empty (${index.length})`);
  const differ = [];
  for (const { name } of index) {
    const viaPlugin = decideForPayload({ tool_name: `${PLUGIN}${name}`, tool_input: {} });
    const viaFolder = decideForPayload({ tool_name: `${FOLDER}${name}`, tool_input: {} });
    if (JSON.stringify(viaPlugin) !== JSON.stringify(viaFolder)) differ.push(name);
  }
  assert.deepEqual(differ, [], 'these tools are judged differently under mcp__hiveku__');
});

test('under the folder prefix the database writes ask, a read is pre-approved, an ordinary write is left to settings', () => {
  for (const name of ['database_execute', 'supabase_auth_user_update', 'supabase_policy_create', 'supabase_migration_apply']) {
    assert.equal(decision(decideForPayload({ tool_name: `${FOLDER}${name}`, tool_input: { project_id: 'p' } })), 'ask', name);
  }
  assert.equal(decision(decideForPayload({ tool_name: `${FOLDER}database_status`, tool_input: { project_id: 'p' } })), 'allow');
  assert.equal(decideForPayload({ tool_name: `${FOLDER}crm_deal_create`, tool_input: { name: 'x' } }), null);
  const batch = decideForPayload({
    tool_name: `${FOLDER}hiveku_batch`,
    tool_input: { calls: [{ tool: 'database_status', args: {} }, { tool: 'database_execute', args: { sql: 'select 1' } }] },
  });
  assert.equal(decision(batch), 'ask');
});

test("a folder's guardrails hold under the folder prefix as under the plugin's", () => {
  const readsOnly = folderWith({ version: 1, mode: 'reads-only' });
  const denyOne = folderWith({ version: 1, deny_tools: ['supabase_storage_delete'] });
  const askOne = folderWith({ version: 1, ask_tools: ['crm_deal_create'] });
  for (const prefix of HIVEKU_TOOL_PREFIXES) {
    const at = (tool, cwd, input = {}) => decision(decideWithGuardrails({ tool_name: `${prefix}${tool}`, tool_input: input, cwd }));
    assert.equal(at('database_execute', readsOnly, { sql: 'select 1' }), 'deny', `${prefix}: reads-only refuses a write`);
    assert.equal(at('database_status', readsOnly), 'allow', `${prefix}: reads-only still runs a read`);
    assert.equal(at('supabase_storage_delete', denyOne), 'deny', `${prefix}: deny_tools`);
    assert.equal(at('crm_deal_create', askOne), 'ask', `${prefix}: ask_tools`);
  }
});

test('the real hook process answers mcp__hiveku__ calls as it answers the plugin\'s', () => {
  const cwd = folderWith(undefined);
  for (const prefix of HIVEKU_TOOL_PREFIXES) {
    const write = runPreToolUseHook(`${prefix}database_execute`, { project_id: 'p', sql: 'update t set x = 1 where id = 1' }, cwd);
    assert.equal(write.status, 0, write.stderr);
    assert.notEqual(write.stdout, '', `${prefix}database_execute got no answer, so a blanket allow or auto mode would run it unasked`);
    const out = JSON.parse(write.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /^database_execute /);

    const read = runPreToolUseHook(`${prefix}database_status`, { project_id: 'p' }, cwd);
    assert.equal(read.status, 0, read.stderr);
    assert.equal(JSON.parse(read.stdout).hookSpecificOutput.permissionDecision, 'allow');
  }
  // NEGATIVE CONTROL: another server's tool, even one that starts like hiveku's, gets no answer at all.
  for (const other of ['mcp__hiveku_staging__database_execute', 'mcp__sentry__search_issues']) {
    const run = runPreToolUseHook(other, { project_id: 'p' }, cwd);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '', `${other} is not a Hiveku tool; the hook must say nothing`);
  }
});
