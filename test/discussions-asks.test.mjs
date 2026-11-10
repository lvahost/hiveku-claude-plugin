/**
 * Discussions waves S5 and S5b ask before the MCP release serves them (2026-11-10).
 *
 * The three private reads, discussion_private_list, discussion_private_messages and discussion_private_search, read the
 * person's own direct messages, group messages and private channels. They are GETs, so the read-only generator would
 * pre-approve them, and under the blanket allow INSTALL.md hands out a silent hook runs them unasked. The other people
 * in those conversations never chose to show them to an AI, so every direct call asks (NEVER_AUTO_APPROVE, each with
 * its own reason) and SENSITIVE_READ_EXCLUSIONS keeps them off the read-only list. The server refuses them inside
 * hiveku_batch; a batch that names one asks here too.
 *
 * discussion_channels_bulk_create makes up to 100 channels at once. It is a practice run unless dry_run reads as false:
 * the boolean, or the text "false" (" false" too), which the MCP server turns into the boolean before the route sees
 * it. Only a value that is plainly a practice run follows the person's settings, as a channel rename does
 * (discussion_update); the write, and any value that is not plainly a practice run, asks, counting the channels.
 * Neither is on the ask list: the reads are GETs, and an ask rule cannot read dry_run. Codex prompts on all four by
 * name (CODEX_ONLY_PROMPTS in test/permission-critical.test.mjs).
 *
 * The tests marked "guard" hold without this change too: they pin behavior older than it (a tool off the read list is
 * never pre-approved, a POST is a write under a reads-only ceiling, and the lists the tests read).
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
  HIVEKU_TOOL_PREFIX,
  NEVER_AUTO_APPROVE,
  VETO_REASONS,
  decideWithGuardrails,
  isAutoApprovable,
  isNonMutatingTool,
  isReadOnlyTool,
} from '../lib/tool-safety.mjs';
import { argGatedWriteDecision } from '../lib/vcs-tool-rules.mjs';
import { probeIsStale, updateCheckPath } from '../lib/update-check.mjs';
import { PENDING_TOOLS } from './pending-tools.mjs';

const PRIVATE_READS = ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search'];
const BULK = 'discussion_channels_bulk_create';
const THREAD = '6d676101-0000-4000-8000-000000000001';
const TEAMMATE = '6d676101-0000-4000-8000-000000000002';

function folderWith(guardrails) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-discussions-'));
  if (guardrails !== undefined) {
    mkdirSync(join(dir, '.hiveku'), { recursive: true });
    writeFileSync(join(dir, '.hiveku', 'guardrails.json'), JSON.stringify(guardrails));
  }
  return dir;
}
const call = (tool, input, cwd) => ({ tool_name: `${HIVEKU_TOOL_PREFIX}${tool}`, tool_input: input, cwd });
const batch = (calls, cwd) => ({ tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`, tool_input: { calls }, cwd });
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

/** Each private read with the arguments its declaration takes. */
const READ_CALLS = [
  ['discussion_private_list', [{}, { kind: 'direct_message' }, { with: TEAMMATE, archived: 'exclude', limit: 20 }]],
  ['discussion_private_messages', [{ thread_id: THREAD }, { thread_id: THREAD, order: 'asc', limit: 10 }, { thread_id: THREAD, parent: THREAD }]],
  ['discussion_private_search', [{ q: 'contract renewal' }, { q: 'launch', in: THREAD, from: TEAMMATE, after: '2026-10-01' }]],
];

const CHANNELS = [{ title: 'design', excerpt: 'Design talk' }, { title: 'leads', visibility: 'account_only' }];

test('each private read asks on every direct call, with its own reason, whatever it carries', () => {
  const cwd = folderWith(undefined);
  for (const [name, inputs] of READ_CALLS) {
    assert.ok(NEVER_AUTO_APPROVE.has(name), `${name} must carry the veto`);
    assert.match(VETO_REASONS[name], /your own direct messages, group messages/, `${name} needs its own reason`);
    assert.match(VETO_REASONS[name], /never chose to show an AI/);
    // The Hiveku app's own key sends in them for the person, so "nothing can be sent there" was untrue: no AI app's
    // connection can, as the tool server's own texts say.
    assert.match(VETO_REASONS[name], /no AI app's connection can send there/);
    assert.doesNotMatch(VETO_REASONS[name], /nothing can be sent/);
    for (const input of inputs) {
      const direct = decideWithGuardrails(call(name, input, cwd));
      assert.equal(decision(direct), 'ask', `${name} ${JSON.stringify(input)} must ask; silence resolves to the blanket allow`);
      assert.ok(reason(direct).startsWith(`${name} ${VETO_REASONS[name]}`), reason(direct));
      assert.doesNotMatch(reason(direct), /RESPONSE is the hazard/, 'the default sentence is wrong about a person\'s conversations');
    }
    assert.equal(isAutoApprovable(name, {}), false);
    assert.equal(isReadOnlyTool(name), false, `${name} must not classify as a read; regenerate lib/readonly-tools.json if this fails`);
  }
});

test('a batch that carries a private read asks, beside a pre-approved read, and a folder with guardrails says why', () => {
  const cwd = folderWith(undefined);
  const ceiling = folderWith({ version: 1, mode: 'full' });
  for (const name of PRIVATE_READS) {
    const calls = [{ tool: 'discussion_list', args: {} }, { tool: name, args: { thread_id: THREAD, q: 'x' } }];
    const mixed = decideWithGuardrails(batch(calls, cwd));
    assert.equal(decision(mixed), 'ask', name);
    assert.match(reason(mixed), new RegExp(name));
    // Under a folder's guardrails the batch is judged by its vetoed member, and only this change gives these reads
    // the veto and their own reason: without it the batch would ask with the general batch sentence.
    const guarded = decideWithGuardrails(batch(calls, ceiling));
    assert.equal(decision(guarded), 'ask', name);
    assert.ok(reason(guarded).includes(`${name} ${VETO_REASONS[name]}`), reason(guarded));
  }
  // The channel read beside them is still pre-approved on its own: the asks are the private door's alone.
  assert.equal(decision(decideWithGuardrails(call('discussion_list', {}, cwd))), 'allow');
});

test('a reads-only folder still lets the person read them, and asks first; it never refuses them as writes', () => {
  const cwd = folderWith({ version: 1, mode: 'reads-only' });
  for (const name of PRIVATE_READS) {
    assert.equal(isNonMutatingTool(name), true, `${name} reads; a reads-only ceiling must not call it a write`);
    const r = decideWithGuardrails(call(name, { thread_id: THREAD }, cwd));
    assert.equal(decision(r), 'ask', name);
    assert.match(reason(r), /never chose to show an AI/);
  }
});

test('the read-only generator excludes all three, and the committed list carries none of them', () => {
  const generator = readFileSync(new URL('../scripts/gen-readonly-tools.mjs', import.meta.url), 'utf8');
  const block = generator.match(/SENSITIVE_READ_EXCLUSIONS = new Map\(\[([\s\S]*?)\]\);/);
  assert.ok(block, 'could not find SENSITIVE_READ_EXCLUSIONS in the generator');
  const readOnly = new Set(JSON.parse(readFileSync(new URL('../lib/readonly-tools.json', import.meta.url), 'utf8')).tools);
  for (const name of PRIVATE_READS) {
    assert.ok(block[1].includes(`['${name}',`), `${name} must be in SENSITIVE_READ_EXCLUSIONS`);
    assert.equal(readOnly.has(name), false, `${name} is on lib/readonly-tools.json: nothing may pre-approve it`);
  }
  assert.equal(readOnly.has(BULK), false);
});

test('guard: all four are named until the tool index carries them', () => {
  const index = new Set(JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8')).tools.map((t) => t.name));
  for (const name of [...PRIVATE_READS, BULK]) {
    assert.ok(index.has(name) || PENDING_TOOLS.has(name), `${name} exists neither in the index nor PENDING_TOOLS`);
  }
});

test('making many channels: the write asks and counts them; the practice run follows the settings', () => {
  const cwd = folderWith(undefined);
  const write = decideWithGuardrails(call(BULK, { channels: CHANNELS, dry_run: false }, cwd));
  assert.equal(decision(write), 'ask');
  assert.match(reason(write), /This makes 2 Discussions channels in this workspace for real, under your name/);
  assert.match(reason(write), /added and not told/);
  assert.match(reason(write), /no automation starts/);
  assert.match(reason(write), /practice run/);
  const one = argGatedWriteDecision(BULK, { channels: [{ title: 'design' }], dry_run: false });
  assert.match(one.reason, /This makes 1 Discussions channel in/);
  const unread = argGatedWriteDecision(BULK, { channels: 'not a list', dry_run: false });
  assert.equal(unread.decision, 'ask');
  assert.match(unread.reason, /the Discussions channels it lists/);
  // The MCP server reads dry_run as the boolean its declaration names before the route sees it, so the text "false"
  // (" false" too) makes the channels as the boolean does; any value that is not plainly a practice run asks with it.
  for (const dryRun of ['false', ' false', 'false\n', 'False', 0, 'no']) {
    const r = decideWithGuardrails(call(BULK, { channels: CHANNELS, dry_run: dryRun }, cwd));
    assert.equal(decision(r), 'ask', `dry_run ${JSON.stringify(dryRun)} must ask`);
    assert.match(reason(r), /This makes 2 Discussions channels in this workspace for real/);
  }
  // A practice run makes nothing, and follows the settings.
  for (const input of [
    { channels: CHANNELS },
    { channels: CHANNELS, dry_run: true },
    { channels: CHANNELS, dry_run: 'true' },
    { channels: CHANNELS, dry_run: null },
    {},
  ]) {
    assert.equal(argGatedWriteDecision(BULK, input), null, JSON.stringify(input));
    assert.equal(decideWithGuardrails(call(BULK, input, cwd)), null, `${JSON.stringify(input)} follows the settings`);
  }
  // A call whose arguments cannot be read could be the write, so it asks.
  for (const input of ['garbage', 42]) {
    const r = argGatedWriteDecision(BULK, input);
    assert.equal(r.decision, 'ask', JSON.stringify(input));
    assert.match(r.reason, /could not be read/);
  }
});

test('guard: making many channels inside a batch asks, the practice run too, and a reads-only folder refuses it', () => {
  const cwd = folderWith(undefined);
  for (const args of [{ channels: CHANNELS }, { channels: CHANNELS, dry_run: false }]) {
    const r = decideWithGuardrails(batch([{ tool: 'discussion_list', args: {} }, { tool: BULK, args }], cwd));
    assert.equal(decision(r), 'ask', JSON.stringify(args));
    assert.match(reason(r), new RegExp(BULK));
  }
  const ceiling = folderWith({ version: 1, mode: 'reads-only' });
  for (const args of [{ channels: CHANNELS }, { channels: CHANNELS, dry_run: false }]) {
    assert.equal(decision(decideWithGuardrails(call(BULK, args, ceiling))), 'deny', JSON.stringify(args));
  }
});

test('guard: none of the four is on the ask list, which holds writes an ask rule can gate by name', () => {
  const permFile = JSON.parse(readFileSync(new URL('../data/permission-critical-tools.json', import.meta.url), 'utf8'));
  const gated = new Set(permFile.tools.map((t) => t.name));
  for (const name of [...PRIVATE_READS, BULK]) assert.equal(gated.has(name), false, name);
});

/** Runs the real hook as hooks/hooks.json does, with no network (a fresh update-check stamp). */
function runPreToolUseHook(toolName, toolInput, cwd) {
  const dataDir = mkdtempSync(join(tmpdir(), 'hk-discussions-data-'));
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

test('the real hook asks for a private read and for the write, and says nothing about a practice run', () => {
  const cwd = folderWith(undefined);
  const hooks = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const matchers = hooks.hooks.PreToolUse.map((h) => h.matcher);
  for (const name of [...PRIVATE_READS, BULK]) {
    const full = `${HIVEKU_TOOL_PREFIX}${name}`;
    assert.ok(matchers.some((m) => new RegExp(`^(?:${m})$`).test(full)), `no PreToolUse matcher reaches ${full}`);
  }
  const read = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}discussion_private_messages`, { thread_id: THREAD }, cwd);
  assert.equal(read.status, 0, read.stderr);
  assert.equal(JSON.parse(read.stdout).hookSpecificOutput.permissionDecision, 'ask');
  for (const dryRun of [false, 'false', ' false']) {
    const write = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}${BULK}`, { channels: CHANNELS, dry_run: dryRun }, cwd);
    assert.equal(write.status, 0, write.stderr);
    assert.equal(JSON.parse(write.stdout).hookSpecificOutput.permissionDecision, 'ask', `dry_run ${JSON.stringify(dryRun)}`);
  }
  const practice = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}${BULK}`, { channels: CHANNELS }, cwd);
  assert.equal(practice.status, 0, practice.stderr);
  assert.equal(practice.stdout.trim(), '', 'a practice run follows the settings: the hook says nothing');
});
