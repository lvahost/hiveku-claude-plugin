/**
 * The PreToolUse hook's memory prompts (memory surfaces audit 2026-09-27,
 * m14/P18, and PR #50 review F3, F4, F5):
 *   - each always-ask memory write names the agent that follows what it
 *     changes: from the last /hiveku:knowledge pull's own record (by
 *     memory_id), or the department the new text declares; and says plainly
 *     when it cannot know;
 *   - a memory_update of a rule, skill, shortcut or specialist also says when
 *     its new text moves it to another agent (F4), by the builder's owner rule
 *     over the recorded column and the new text; a `department` argument, which
 *     none of these tools takes, says nothing;
 *   - a restore names only a version, so its prompt says it cannot name the
 *     entry (F5);
 *   - memory_create ASKS for a rule, skill, shortcut or specialist that ends up
 *     shared with every agent, counting a `department` argument only once the
 *     MCP server sends it (F3), and stays silent for everything else.
 * These drive decideWithGuardrails, the function `bin/hiveku hook pre-tool-use` calls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideWithGuardrails, decideForPayload, HIVEKU_TOOL_PREFIX } from '../lib/tool-safety.mjs';
import {
  memoryWriteDecision,
  manifestEntryFor,
  MEMORY_ASK_BASE,
  MEMORY_CREATE_SENDS_DEPARTMENT,
  RECORD_FILES,
} from '../lib/memory-tool-rules.mjs';
import { KNOWLEDGE_MANIFEST_REL, KNOWLEDGE_PLUGIN_STATE_REL } from '../lib/knowledge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SALES_RULE_ID = '0b9d6b0a-5d8e-4c56-9f0c-2f1d9e0a1b2c';
const SHARED_RULE_ID = '6a0f7c1e-3b2d-4e5f-8a9b-0c1d2e3f4a5b';
const SEO_RULE_ID = '2c4e6a8b-1d3f-4a5b-8c7d-9e0f1a2b3c4d';
const VOICE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const OLD_ID = 'ffffffff-0000-4000-8000-000000000000';

/** The plugin's own record of a pull, and the manifest it shares with the VS Code extension. */
function pulledFolder(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-mem-hook-'));
  mkdirSync(join(dir, '.hiveku'), { recursive: true });
  const entries = {
    // Filed under Sales by its column.
    '_rule:no-emojis': { id: SALES_RULE_ID, type: 'rule', domain: '_rule:no-emojis', department: 'sales', owner: 'sales', column: 'sales' },
    '_rule:no-em-dashes': { id: SHARED_RULE_ID, type: 'rule', domain: '_rule:no-em-dashes', department: 'shared', owner: null, column: null },
    // A seeded starter rule: column 'marketing' plus the SEO marker.
    '_rule:titles': { id: SEO_RULE_ID, type: 'rule', domain: '_rule:titles', department: 'seo', owner: 'seo', column: 'marketing' },
    '_account:pronunciations': { id: VOICE_ID, type: 'memory', listing: '_account', domain: '_account:pronunciations', department: 'business/voice' },
    // Filed before the builder said who owns it: no owner recorded, so none is claimed.
    '_rule:older': { id: OLD_ID, type: 'rule', domain: '_rule:older', department: 'general' },
    ...extra,
  };
  writeFileSync(join(dir, '.hiveku', 'knowledge-plugin.json'), JSON.stringify({ version: 1, entries }));
  const shared = Object.fromEntries(
    Object.entries(entries)
      .filter(([k]) => !k.startsWith('_account:'))
      .map(([k, row]) => [k, { id: row.id, type: row.type, department: row.department, domain: row.domain, file: `rules/${row.department}/x.md` }]),
  );
  writeFileSync(join(dir, '.hiveku', 'knowledge-manifest.json'), JSON.stringify({ entries: shared }));
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
  // No record at all (a folder never pulled).
  const bare = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bare-'));
  assert.match(reason(call('memory_delete', { memory_id: SALES_RULE_ID }, bare)), /the agent the Memory page files it under/);
  assert.equal(manifestEntryFor(SALES_RULE_ID, bare), null);
  // Only the shared manifest (the VS Code extension's pull): it names the entry, never its owner.
  const vscodeOnly = mkdtempSync(join(tmpdir(), 'hk-mem-hook-vscode-'));
  mkdirSync(join(vscodeOnly, '.hiveku'), { recursive: true });
  writeFileSync(
    join(vscodeOnly, '.hiveku', 'knowledge-manifest.json'),
    JSON.stringify({ entries: { '_rule:no-emojis': { id: SALES_RULE_ID, type: 'rule', department: 'sales', domain: '_rule:no-emojis', file: 'rules/sales/no-emojis.md' } } }),
  );
  assert.equal(manifestEntryFor(SALES_RULE_ID, vscodeOnly)?.domain, '_rule:no-emojis');
  assert.match(reason(call('memory_delete', { memory_id: SALES_RULE_ID }, vscodeOnly)), /the agent the Memory page files it under/);
});

test('memory_update falls back to the department its new text declares when nothing was pulled', () => {
  const bare = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bare-'));
  const marked = call('memory_update', { memory_id: 'x', content: '<!-- department: seo -->\nrule' }, bare);
  assert.match(reason(marked), /Who follows it: the SEO topic of the Marketing team \(the department its new text names\)/);
});

test('F4: a `department` argument says nothing on update, delete or restore (they take none)', () => {
  const cwd = pulledFolder();
  // The pulled SEO rule, with a stray department: the pull's owner is what the prompt says.
  const update = call('memory_update', { memory_id: SEO_RULE_ID, content: '<!-- department: seo -->\nx', department: 'sales' }, cwd);
  assert.match(reason(update), /Who follows `_rule:titles`: the SEO topic of the Marketing team \(as of the last \/hiveku:knowledge pull\)/);
  assert.doesNotMatch(reason(update), /Sales agent/);
  const del = call('memory_delete', { memory_id: SEO_RULE_ID, department: 'helpdesk' }, cwd);
  assert.match(reason(del), /the SEO topic of the Marketing team/);
  assert.doesNotMatch(reason(del), /Support agent/);
  // With nothing pulled, a department still names no one.
  const bare = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bare-'));
  assert.match(reason(call('memory_delete', { memory_id: 'x', department: 'helpdesk' }, bare)), /the agent the Memory page files it under/);
});

test('F4: memory_update says when its new text moves the entry, by the owner rule over the recorded column', () => {
  const MARKED_SALES = 'aaaaaaaa-0000-4000-8000-000000000001';
  const MARKED_SEO = 'aaaaaaaa-0000-4000-8000-000000000002';
  const NO_COLUMN = 'aaaaaaaa-0000-4000-8000-000000000003';
  const cwd = pulledFolder({
    // Filed by their markers alone (no column).
    '_rule:tone': { id: MARKED_SALES, type: 'rule', domain: '_rule:tone', department: 'sales', owner: 'sales', column: null },
    '_skill:audit': { id: MARKED_SEO, type: 'skill', domain: '_skill:audit', department: 'seo', owner: 'seo', column: null },
    // A pull that did not record the column cannot tell.
    '_rule:unknown': { id: NO_COLUMN, type: 'rule', domain: '_rule:unknown', department: 'sales', owner: 'sales' },
  });

  // A marker-owned Sales rule rewritten for SEO moves to SEO.
  const toSeo = reason(call('memory_update', { memory_id: MARKED_SALES, content: '<!-- department: seo -->\nwarm' }, cwd));
  assert.match(toSeo, /Who follows `_rule:tone`: the Sales agent \(as of the last \/hiveku:knowledge pull\)/);
  assert.match(toSeo, /This change moves it: the department line in its new text files it under the SEO topic of the Marketing team\. Who follows it after this change: the SEO topic of the Marketing team/);

  // The seeded SEO rule (column 'marketing') without its marker goes back to the Marketing lead.
  const toLead = reason(call('memory_update', { memory_id: SEO_RULE_ID, content: 'titles under 60 characters' }, cwd));
  assert.match(toLead, /its new text no longer names the SEO topic of the Marketing team, so it goes back to the Marketing team/);
  assert.match(toLead, /Who follows it after this change: the Marketing team \(its lead and every Marketing topic\) and the Website agent/);

  // A marker-owned SEO skill without its marker becomes shared with every agent.
  const toShared = reason(call('memory_update', { memory_id: MARKED_SEO, content: '# Audit\nsteps' }, cwd));
  assert.match(toShared, /Who follows `_skill:audit`: the SEO topic of the Marketing team and the Website agent/);
  assert.match(toShared, /its new text names no agent, so it becomes shared with every agent\. Who follows it after this change: every agent, in chats/);

  // A shared rule given a line goes to that agent.
  const toSales = reason(call('memory_update', { memory_id: SHARED_RULE_ID, content: '<!-- department: sales -->\nx' }, cwd));
  assert.match(toSales, /files it under the Sales agent\. Who follows it after this change: the Sales agent/);

  // Negative controls: a column-owned rule is not moved by its text; the same line changes
  // nothing; a pull that did not record the column says nothing it cannot know.
  const stays = reason(call('memory_update', { memory_id: SALES_RULE_ID, content: '<!-- department: seo -->\nx' }, cwd));
  assert.match(stays, /Who follows `_rule:no-emojis`: the Sales agent/);
  assert.doesNotMatch(stays, /moves it/);
  assert.doesNotMatch(reason(call('memory_update', { memory_id: SEO_RULE_ID, content: '<!-- department: seo -->\nshorter' }, cwd)), /moves it/);
  assert.doesNotMatch(reason(call('memory_update', { memory_id: NO_COLUMN, content: '<!-- department: seo -->\nx' }, cwd)), /moves it/);
  // A delete never says it moves anything.
  assert.doesNotMatch(reason(call('memory_delete', { memory_id: MARKED_SALES }, cwd)), /moves it/);
});

test('F5: a restore says it cannot name the entry, and never sends the person to a pull that cannot help', () => {
  const cwd = pulledFolder();
  for (const input of [{ version_id: 'v1' }, { version_id: 'v1', memory_id: SALES_RULE_ID }]) {
    const r = call('memory_restore_version', input, cwd);
    assert.equal(decision(r), 'ask');
    assert.match(reason(r), /^memory_restore_version puts an older version of a memory entry back/);
    assert.match(reason(r), /Who follows it: this prompt cannot say, because a restore names only a version, not its entry/);
    assert.doesNotMatch(reason(r), /\/hiveku:knowledge pull lets this prompt name it/);
    assert.doesNotMatch(reason(r), /Sales agent/, 'a stray memory_id is not the restored entry');
  }
});

test('memory_bulk_create says who follows each group of entries', () => {
  const r = call('memory_bulk_create', {
    entries: [
      { type: 'memory', name: 'seo', content: 'x' },
      { type: 'skill', name: 'discovery-call-prep', content: '<!-- department: sales -->\nx' },
      { type: 'rule', name: 'no-em-dashes', content: 'x' },
      { type: 'rule', name: 'tone', content: 'x' },
      // Entries carry `department` to the builder today, and the owner rule's (b) applies.
      { type: 'rule', name: 'seeded', content: '<!-- department: ppc -->\nx', department: 'marketing' },
      // SEO's skills are the Website agent's too.
      { type: 'skill', name: 'keyword-research', content: 'x', department: 'seo' },
    ],
  }, pulledFolder());
  assert.equal(decision(r), 'ask');
  assert.match(reason(r), /Who follows them: /);
  assert.match(reason(r), /the SEO topic of the Marketing team \(1 entry\)/);
  assert.match(reason(r), /the Sales agent \(1 entry\)/);
  assert.match(reason(r), /the Paid ads topic of the Marketing team \(1 entry\)/);
  assert.match(reason(r), /the SEO topic of the Marketing team and the Website agent \(1 entry\)/);
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
    [{ type: 'rule', name: 'x', content: 'x', department: 'engineering' }, 'rule'],
  ]) {
    const r = call('memory_create', input, cwd);
    assert.equal(decision(r), 'ask', `${JSON.stringify(input)} must ask`);
    assert.match(reason(r), new RegExp(`^memory_create creates a ${kind} that names no agent, so it is Shared with every agent`));
    assert.match(reason(r), /start its text with the line <!-- department: x -->/);
    assert.doesNotMatch(reason(r), /pass `department`/, 'the tool does not send it yet');
  }
});

test('F3: memory_create with only a `department` argument asks while the MCP server drops it, and says how to name the agent', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hk-mem-hook-create-'));
  assert.equal(MEMORY_CREATE_SENDS_DEPARTMENT, false, 'the live MCP server drops it (hiveku-mcp-api-server PR #63 is not live)');
  const r = call('memory_create', { type: 'rule', name: 'tone', content: 'be warm', department: 'sales' }, cwd);
  assert.equal(decision(r), 'ask');
  assert.match(reason(r), /^memory_create creates a rule with `department: "sales"`, which Hiveku does not apply to a new entry from this app yet, so it is Shared with every agent/);
  assert.match(reason(r), /To give it to the Sales agent only, start its text with the line <!-- department: sales -->/);
  // The line the prompt asks for is what makes it silent; "shared" is a choice either way.
  assert.equal(call('memory_create', { type: 'rule', name: 'tone', content: '<!-- department: sales -->\nbe warm', department: 'sales' }, cwd), null);
  assert.equal(call('memory_create', { type: 'rule', name: 'tone', content: 'be warm', department: 'shared' }, cwd), null);
  // Where the server does send it, the argument decides (newEntryOwner's departmentArg,
  // test/memory-owner.test.mjs); memory_bulk_create's entries are that case today (above).
});

test('MEMORY_CREATE_SENDS_DEPARTMENT follows the tool index: the release that regenerates it from a server with `department` must flip it', () => {
  const index = JSON.parse(readFileSync(join(ROOT, 'lib', 'tool-index.json'), 'utf8'));
  const create = index.tools.find((t) => t.name === 'memory_create');
  assert.ok(create, 'memory_create is in the index');
  // hiveku-mcp-api-server PR #63 documents the argument in the tool's own description.
  const offered = /`department`/.test(create.description ?? '');
  assert.equal(
    MEMORY_CREATE_SENDS_DEPARTMENT,
    offered,
    offered
      ? 'the regenerated index says memory_create takes `department`: set MEMORY_CREATE_SENDS_DEPARTMENT to true in lib/memory-tool-rules.mjs'
      : 'the index says memory_create does not take `department`, so the hook must not count it',
  );
  // The orient skill says the same thing to the session, and must change with it.
  const orient = readFileSync(join(ROOT, 'skills', 'hiveku-orient', 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  const saysNotSent = /A `department` argument on `memory_create` is not sent by the MCP server yet/.test(orient);
  assert.equal(saysNotSent, !MEMORY_CREATE_SENDS_DEPARTMENT, 'skills/hiveku-orient/SKILL.md must say whether memory_create sends `department`');
});

test('NEGATIVE CONTROL: memory_create that decides its owner, or is a note or profile, stays silent', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hk-mem-hook-create-'));
  for (const input of [
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

test('the hook reads the same two records the pull writes', () => {
  assert.deepEqual([...RECORD_FILES], [KNOWLEDGE_PLUGIN_STATE_REL, KNOWLEDGE_MANIFEST_REL]);
});

test('the reasons are built on the always-ask texts, and a broken input still asks', () => {
  for (const name of ['memory_update', 'memory_delete', 'memory_restore_version', 'memory_bulk_create', 'account_memory_append']) {
    const d = memoryWriteDecision(name, undefined, undefined);
    assert.equal(d.decision, 'ask', name);
    assert.ok(d.reason.startsWith(MEMORY_ASK_BASE[name]), `${name} starts with its base text`);
  }
  assert.equal(memoryWriteDecision('crm_deal_create', {}, undefined), null);
  // A record that is not JSON is read as no record.
  const dir = mkdtempSync(join(tmpdir(), 'hk-mem-hook-bad-'));
  mkdirSync(join(dir, '.hiveku'), { recursive: true });
  writeFileSync(join(dir, '.hiveku', 'knowledge-plugin.json'), '{not json');
  writeFileSync(join(dir, '.hiveku', 'knowledge-manifest.json'), '{not json either');
  assert.equal(manifestEntryFor(SALES_RULE_ID, dir), null);
  assert.equal(decision(call('memory_update', { memory_id: SALES_RULE_ID }, dir)), 'ask');
  // Inside a batch the member still makes the batch ask.
  const batch = decideForPayload({
    tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
    tool_input: { calls: [{ tool: 'memory_create', args: { type: 'rule', name: 'x', content: 'x' } }] },
  });
  assert.equal(decision(batch), 'ask');
});
