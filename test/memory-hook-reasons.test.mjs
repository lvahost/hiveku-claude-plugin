/**
 * The PreToolUse hook's memory prompts (memory surfaces audit 2026-09-27,
 * m14/P18):
 *   - each always-ask memory write names the agent that follows what it
 *     changes: from the call's own `department`, the last /hiveku:knowledge
 *     pull's manifest (by memory_id), or the department the new text declares;
 *     and says plainly when it cannot know;
 *   - memory_create ASKS for a rule, skill, shortcut or specialist that names
 *     no agent (Shared with every agent), and stays silent for everything else.
 * These drive decideWithGuardrails, the function `bin/hiveku hook pre-tool-use` calls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideWithGuardrails, decideForPayload, HIVEKU_TOOL_PREFIX } from '../lib/tool-safety.mjs';
import { memoryWriteDecision, manifestEntryFor, MEMORY_ASK_BASE } from '../lib/memory-tool-rules.mjs';

const SALES_RULE_ID = '0b9d6b0a-5d8e-4c56-9f0c-2f1d9e0a1b2c';
const SHARED_RULE_ID = '6a0f7c1e-3b2d-4e5f-8a9b-0c1d2e3f4a5b';
const VOICE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const OLD_ID = 'ffffffff-0000-4000-8000-000000000000';

/** A bound folder whose last knowledge pull recorded three entries (and one from an older pull). */
function pulledFolder() {
  const dir = mkdtempSync(join(tmpdir(), 'hk-mem-hook-'));
  mkdirSync(join(dir, '.hiveku'), { recursive: true });
  writeFileSync(
    join(dir, '.hiveku', 'knowledge-manifest.json'),
    JSON.stringify({
      entries: {
        '_rule:no-emojis': { id: SALES_RULE_ID, type: 'rule', domain: '_rule:no-emojis', department: 'sales', owner: 'sales' },
        '_rule:no-em-dashes': { id: SHARED_RULE_ID, type: 'rule', domain: '_rule:no-em-dashes', department: 'shared', owner: null },
        '_account:pronunciations': { id: VOICE_ID, type: 'memory', listing: '_account', domain: '_account:pronunciations', department: 'business/voice' },
        // Filed before the builder said who owns it: no owner recorded, so none is claimed.
        '_rule:older': { id: OLD_ID, type: 'rule', domain: '_rule:older', department: 'general' },
      },
    }),
  );
  return dir;
}

const call = (tool, input, cwd) => decideWithGuardrails({ tool_name: `${HIVEKU_TOOL_PREFIX}${tool}`, tool_input: input, cwd });
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

test('memory_update names the agent the last knowledge pull recorded for that entry', () => {
  const cwd = pulledFolder();
  const sales = call('memory_update', { memory_id: SALES_RULE_ID, content: 'x', reason: 'y' }, cwd);
  assert.equal(decision(sales), 'ask');
  assert.match(reason(sales), /^memory_update replaces the whole text of a memory entry/);
  assert.match(reason(sales), /Who follows `_rule:no-emojis`: the Sales agent \(as of the last \/hiveku:knowledge pull\)/);
  assert.match(reason(sales), /even when your settings allow all Hiveku tools/);
  const shared = call('memory_update', { memory_id: SHARED_RULE_ID, content: 'x' }, cwd);
  assert.match(reason(shared), /Who follows `_rule:no-em-dashes`: every agent, in chats \(it is shared with every agent/);
  const voice = call('memory_delete', { memory_id: VOICE_ID }, cwd);
  assert.match(reason(voice), /^memory_delete deletes a memory entry/);
  assert.match(reason(voice), /the agents that speak on calls and in voice huddles/);
  // A folder found by walking up from a subfolder, as a session inside the bound folder would.
  const sub = join(cwd, 'memory', 'sales');
  mkdirSync(sub, { recursive: true });
  assert.match(reason(call('memory_delete', { memory_id: SALES_RULE_ID }, sub)), /the Sales agent/);
});

test('without a recorded owner, it says it cannot know rather than guessing (negative control)', () => {
  const cwd = pulledFolder();
  for (const input of [{ memory_id: OLD_ID, content: 'x' }, { memory_id: 'not-in-the-manifest', content: 'x' }, {}]) {
    const r = call('memory_update', input, cwd);
    assert.equal(decision(r), 'ask');
    assert.match(reason(r), /Who follows it: the agent the Memory page files it under, or every agent if it is shared/);
    assert.doesNotMatch(reason(r), /the Sales agent|as of the last/);
  }
  // No manifest at all (a folder never pulled).
  const bare = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bare-'));
  assert.match(reason(call('memory_delete', { memory_id: SALES_RULE_ID }, bare)), /the agent the Memory page files it under/);
  assert.equal(manifestEntryFor(SALES_RULE_ID, bare), null);
});

test('memory_update falls back to the department its new text declares, and an explicit department wins', () => {
  const bare = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bare-'));
  const marked = call('memory_update', { memory_id: 'x', content: '<!-- department: seo -->\nrule' }, bare);
  assert.match(reason(marked), /Who follows it: the SEO topic of the Marketing team \(the department its new text names\)/);
  const explicit = call('memory_update', { memory_id: SALES_RULE_ID, content: 'x', department: 'helpdesk' }, pulledFolder());
  assert.match(reason(explicit), /Who follows it: the Support agent$|Who follows it: the Support agent\./);
  // The manifest outranks a declaration in the new text: the stored owner is who follows it now.
  const both = call('memory_update', { memory_id: SALES_RULE_ID, content: '<!-- department: seo -->\nx' }, pulledFolder());
  assert.match(reason(both), /the Sales agent \(as of the last \/hiveku:knowledge pull\)/);
});

test('memory_bulk_create says who follows each group of entries', () => {
  const r = call('memory_bulk_create', {
    entries: [
      { type: 'memory', name: 'seo', content: 'x' },
      { type: 'skill', name: 'discovery-call-prep', content: '<!-- department: sales -->\nx' },
      { type: 'rule', name: 'no-em-dashes', content: 'x' },
      { type: 'rule', name: 'tone', content: 'x' },
    ],
  }, pulledFolder());
  assert.equal(decision(r), 'ask');
  assert.match(reason(r), /Who follows them: /);
  assert.match(reason(r), /the SEO topic of the Marketing team \(1 entry\)/);
  assert.match(reason(r), /the Sales agent \(1 entry\)/);
  assert.match(reason(r), /every agent, in chats \([^)]*\) \(2 entries\)/);
});

test('account_memory_append says About your business, which every agent reads', () => {
  const r = call('account_memory_append', { text: 'Closed Mondays.' }, pulledFolder());
  assert.equal(decision(r), 'ask');
  assert.match(reason(r), /^account_memory_append suggests a line for About your business/);
  assert.match(reason(r), /every agent reads it \(marked as not reviewed\)/);
});

test('memory_create ASKS for a rule, skill, shortcut or specialist that names no agent', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hk-mem-hook-create-'));
  for (const [input, kind] of [
    [{ type: 'rule', name: 'no-em-dashes', content: 'never' }, 'rule'],
    [{ type: 'skill', name: 'weekly', content: '# Weekly' }, 'skill'],
    [{ type: 'command', name: 'post', content: 'steps' }, 'shortcut'],
    [{ type: 'agent', name: 'critic', content: 'you review' }, 'specialist'],
    [{ domain: '_rule:tone', content: 'warm' }, 'rule'],
    [{ type: 'rule', name: 'x', content: '<!-- department: engineering -->\nnot an agent' }, 'rule'],
  ]) {
    const r = call('memory_create', input, cwd);
    assert.equal(decision(r), 'ask', `${JSON.stringify(input)} must ask`);
    assert.match(reason(r), new RegExp(`^memory_create creates a ${kind} that names no agent, so it is Shared with every agent`));
    assert.match(reason(r), /pass `department`/);
  }
});

test('NEGATIVE CONTROL: memory_create that names its owner, or is a note or profile, stays silent', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hk-mem-hook-create-'));
  for (const input of [
    { type: 'rule', name: 'x', content: 'never', department: 'sales' },
    { type: 'rule', name: 'x', content: 'never', department: 'shared' },
    { type: 'rule', name: 'x', content: '<!-- department: seo -->\nnever' },
    { type: 'skill', name: 'x', content: '---\ndepartment: helpdesk\n---\nsteps' },
    { type: 'skill', name: 'x', content: 'steps', project_id: '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f' },
    { type: 'memory', name: 'seo', content: 'notes' },
    { type: 'identity', name: 'sales', content: '---\ndepartment: sales\n---' },
    {},
  ]) {
    assert.equal(call('memory_create', input, cwd), null, `${JSON.stringify(input)} must stay silent`);
  }
  // A reads-only folder still DENIES it, as every write.
  const readsOnly = mkdtempSync(join(tmpdir(), 'hk-mem-hook-ro-'));
  mkdirSync(join(readsOnly, '.hiveku'), { recursive: true });
  writeFileSync(join(readsOnly, '.hiveku', 'guardrails.json'), JSON.stringify({ version: 1, mode: 'reads-only' }));
  assert.equal(decision(call('memory_create', { type: 'rule', name: 'x', content: 'x' }, readsOnly)), 'deny');
});

test('the reasons are built on the always-ask texts, and a broken input still asks', () => {
  for (const name of ['memory_update', 'memory_delete', 'memory_restore_version', 'memory_bulk_create', 'account_memory_append']) {
    const d = memoryWriteDecision(name, undefined, undefined);
    assert.equal(d.decision, 'ask', name);
    assert.ok(d.reason.startsWith(MEMORY_ASK_BASE[name]), `${name} starts with its base text`);
  }
  assert.equal(memoryWriteDecision('crm_deal_create', {}, undefined), null);
  // A manifest that is not JSON is read as no manifest.
  const dir = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bad-'));
  mkdirSync(join(dir, '.hiveku'), { recursive: true });
  writeFileSync(join(dir, '.hiveku', 'knowledge-manifest.json'), '{not json');
  assert.equal(manifestEntryFor(SALES_RULE_ID, dir), null);
  assert.equal(decision(call('memory_update', { memory_id: SALES_RULE_ID }, dir)), 'ask');
  // Inside a batch the member still makes the batch ask.
  const batch = decideForPayload({
    tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
    tool_input: { calls: [{ tool: 'memory_create', args: { type: 'rule', name: 'x', content: 'x' } }] },
  });
  assert.equal(decision(batch), 'ask');
});
