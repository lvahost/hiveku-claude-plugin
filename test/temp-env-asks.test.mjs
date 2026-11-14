/**
 * Temporary environments (2026-11-13): one branch of a site on its own address and Hiveku link for 1, 3 or 7 days,
 * at 50 cents a day. The tool server adds fifteen project_vcs_temp_env* tools (MCP feature/temporary-environments,
 * after builder #2247), and this plugin ships its ask entries first, so the person is asked from the day the server
 * serves them. Who asks:
 *   - the seven that always ask: create, extend, revive and try_again (each adds 50 cents a day to the account's
 *     bill), password_set, settings_set (a new link stops the old one) and delete. They are on the ask list
 *     (INSTALL.md mirrors it, and so does the Codex plugin) and on LIVE_CHANGE_WRITES, so the hook asks on every
 *     install, whatever its settings allow, a dry run included;
 *   - the three that ask in ask mode only: update, request_dismiss and open. They are on the ask list, and the hook
 *     leaves a direct call to the person's settings, so a desktop chat in full access can run them;
 *   - the five reads: on no list.
 * Until the regenerated tool index carries them, the ten writes wait in test/pending-tools.mjs (TEMP-ENV-1).
 * test/live-change-writes.test.mjs pins the seven under a reads-only folder; this file pins the split, the price in
 * both reasons, and, when the tool server's checkout sits beside this one with the family's table
 * (src/tools/temp-env-texts.ts), that the split is that table.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  ALWAYS_ASK_WRITES,
  HIVEKU_TOOL_PREFIX,
  LIVE_CHANGE_WRITES,
  NEVER_AUTO_APPROVE,
  decideForPayload,
  isAutoApprovable,
} from '../lib/tool-safety.mjs';
import { PENDING_TOOLS } from './pending-tools.mjs';

/** Ask in full access too. */
const ALWAYS_ASKS = [
  'project_vcs_temp_env_create',
  'project_vcs_temp_env_extend',
  'project_vcs_temp_env_revive',
  'project_vcs_temp_env_try_again',
  'project_vcs_temp_env_password_set',
  'project_vcs_temp_env_settings_set',
  'project_vcs_temp_env_delete',
];
/** Run in full access, ask in ask mode. */
const ASKS_IN_ASK_MODE = [
  'project_vcs_temp_env_update',
  'project_vcs_temp_env_request_dismiss',
  'project_vcs_temp_env_open',
];
const READS = [
  'project_vcs_temp_envs_list',
  'project_vcs_temp_env_get',
  'project_vcs_temp_envs_find',
  'project_vcs_temp_envs_requests_list',
  'project_vcs_temp_envs_usage_get',
];
/** The four that add a charge to the account's bill. */
const CHARGING = [
  'project_vcs_temp_env_create',
  'project_vcs_temp_env_extend',
  'project_vcs_temp_env_revive',
  'project_vcs_temp_env_try_again',
];
const WRITES = [...ALWAYS_ASKS, ...ASKS_IN_ASK_MODE];
/** Every write is a POST but the turn-off, which is a DELETE. */
const methodOf = (name) => (name === 'project_vcs_temp_env_delete' ? 'DELETE' : 'POST');

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const permFile = JSON.parse(read('data/permission-critical-tools.json'));
const gated = new Map(permFile.tools.map((t) => [t.name, t]));
const indexMethods = new Map(JSON.parse(read('lib/tool-index.json')).tools.map((t) => [t.name, t.method]));
const decide = (name, toolInput = {}) =>
  decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${name}`, tool_input: toolInput });
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';
const DASHES = /[\u2013\u2014]/;

/** The names in INSTALL.md's main permissions block (the one with the long ask list). */
function installAsk() {
  const blocks = [...read('INSTALL.md').matchAll(/```json\n([\s\S]*?)```/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter((b) => Array.isArray(b?.permissions?.ask) && b.permissions.ask.length >= 10);
  assert.equal(blocks.length, 1, 'could not find the main permissions block in INSTALL.md');
  return blocks[0].permissions.ask;
}

test('the ten writes are on the ask list with their methods and in INSTALL.md, contracted until the index has them', () => {
  const ask = installAsk();
  for (const name of WRITES) {
    const entry = gated.get(name);
    assert.ok(entry, `${name} must be on data/permission-critical-tools.json`);
    assert.equal(entry.method, methodOf(name), `${name}: the tool server maps it to ${methodOf(name)}`);
    assert.ok(
      PENDING_TOOLS.has(name) || indexMethods.get(name) === methodOf(name),
      `${name} is neither contracted in test/pending-tools.mjs nor indexed as a ${methodOf(name)}`,
    );
    assert.ok(ask.includes(`${HIVEKU_TOOL_PREFIX}${name}`), `INSTALL.md's ask block must name ${name}`);
    assert.ok(entry.why_gated.length > 40, `${name}: say why it asks`);
    assert.doesNotMatch(entry.why_gated, DASHES, `${name}: no dashes in a reason people read`);
  }
});

test('the seven that always ask do so through the hook on every call, a dry run and an accepted price alike', () => {
  const inputs = [
    {},
    { project_id: 'p', branch: 'feature/x', days: 3, dry_run: true },
    { project_id: 'p', temp_env_id: 'e', branch: 'feature/x', days: 3, accept_cents: 150 },
    { project_id: 'p', temp_env_id: 'e', branch: 'feature/x', password: null },
    { project_id: 'p', temp_env_id: 'e', branch: 'feature/x', confirm: true },
  ];
  for (const name of ALWAYS_ASKS) {
    assert.ok(LIVE_CHANGE_WRITES.has(name), `${name} must be on LIVE_CHANGE_WRITES`);
    assert.equal(ALWAYS_ASK_WRITES.has(name), false, `${name} belongs on one always-ask map, LIVE_CHANGE_WRITES`);
    for (const input of inputs) {
      const r = decide(name, input);
      assert.equal(decision(r), 'ask', `${name} ${JSON.stringify(input)} must ask; silence is the blanket allow`);
      assert.match(reason(r), new RegExp(`^${name} `), `${name}: the prompt names the tool`);
      assert.ok(reason(r).includes(LIVE_CHANGE_WRITES.get(name)), `${name}: the prompt carries its own reason`);
    }
    assert.doesNotMatch(LIVE_CHANGE_WRITES.get(name), DASHES, `${name}: no dashes in the prompt`);
    assert.equal(isAutoApprovable(name, {}), false, `${name} must never be pre-approved`);
  }
});

test("the four that charge name the price on the ask list and in the prompt, and say what a dry run does", () => {
  for (const name of CHARGING) {
    assert.match(gated.get(name).why_gated, /50 cents a day to the account's bill/, `${name}: the ask list names the charge`);
    const why = LIVE_CHANGE_WRITES.get(name);
    assert.match(why, /50 cents a day to the account's bill/, `${name}: the prompt names the charge`);
    assert.match(why, /dry_run: true, it changes nothing and only answers the price/, `${name}: the prompt says what a dry run does`);
  }
  for (const name of ALWAYS_ASKS.filter((n) => !CHARGING.includes(n))) {
    assert.doesNotMatch(LIVE_CHANGE_WRITES.get(name), /cents a day|dry_run/, `${name} adds no charge and has no dry run`);
  }
});

test('update, request_dismiss and open are on the ask list only: the hook leaves a direct call to the settings, and a batch asks', () => {
  for (const name of ASKS_IN_ASK_MODE) {
    assert.equal(LIVE_CHANGE_WRITES.has(name), false, `${name} runs in full access, so it is not on the hook`);
    assert.equal(ALWAYS_ASK_WRITES.has(name), false, `${name} runs in full access, so it is not on the hook`);
    assert.equal(
      decide(name, { project_id: 'p', temp_env_id: 'e', branch: 'feature/x' }),
      null,
      `${name}: the hook has no opinion, so the person's settings decide (INSTALL.md's ask rule asks)`,
    );
    const batch = decideForPayload({
      tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
      tool_input: {
        calls: [
          { tool: 'project_vcs_env_bindings', args: { project_id: 'p' } },
          { tool: name, args: { project_id: 'p', temp_env_id: 'e', branch: 'feature/x' } },
        ],
      },
    });
    assert.equal(decision(batch), 'ask', `a batch carrying ${name} asks`);
    assert.match(reason(batch), new RegExp(name));
  }
});

test('the five reads are on no ask list, and the hook never asks before them', () => {
  for (const name of READS) {
    assert.equal(gated.has(name), false, `${name} is a read: an ask rule on it stalls every sweep`);
    assert.equal(LIVE_CHANGE_WRITES.has(name), false, `${name} is a read`);
    assert.equal(ALWAYS_ASK_WRITES.has(name), false, `${name} is a read`);
    assert.equal(NEVER_AUTO_APPROVE.has(name), false, `${name}: its answer carries no passcode and no link past it`);
    const d = decision(decide(name, { project_id: 'p' }));
    assert.ok(d !== 'ask' && d !== 'deny', `${name} must not ask or be refused (got ${d})`);
  }
});

test("the split is the tool server's own table, when its checkout sits beside this one", (t) => {
  const texts = new URL('../../hiveku-mcp-api-server/src/tools/temp-env-texts.ts', import.meta.url);
  if (!existsSync(texts)) {
    t.skip('no hiveku-mcp-api-server checkout with src/tools/temp-env-texts.ts beside this repo');
    return;
  }
  const source = readFileSync(texts, 'utf8');
  const start = source.indexOf('export const TEMP_ENV_TOOL_ASKS');
  assert.ok(start >= 0, 'TEMP_ENV_TOOL_ASKS is in temp-env-texts.ts');
  const block = source.slice(start, source.indexOf('};', start));
  const sorted = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
  const theirs = sorted(
    [...block.matchAll(/^\s*(project_vcs_temp_envs?_[a-z_]+):\s*'(runs|asks_in_ask_mode|always_asks)'/gm)]
      .map((m) => [m[1], m[2]]),
  );
  const ours = sorted([
    ...READS.map((n) => [n, 'runs']),
    ...ASKS_IN_ASK_MODE.map((n) => [n, 'asks_in_ask_mode']),
    ...ALWAYS_ASKS.map((n) => [n, 'always_asks']),
  ]);
  assert.equal(Object.keys(theirs).length, 15, 'the table names the fifteen tools (never a vacuous pass)');
  assert.deepEqual(ours, theirs, "this plugin's split differs from the tool server's TEMP_ENV_TOOL_ASKS");
});

test('NEGATIVE CONTROL: the bindings beside them keep their own rules', () => {
  assert.equal(gated.get('project_vcs_env_bind')?.method, 'POST', 'moving Development or Staging still asks');
  assert.equal(decision(decide('project_vcs_env_bindings', { project_id: 'p' })), 'allow', 'the bindings read stays pre-approved');
});
