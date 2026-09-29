/**
 * lib/memory-owner.mjs: the Memory page's owner folders, its placement of the
 * `_account:*` rows, what a new entry's call declares, and who follows an
 * owner's entries (memory surfaces audit 2026-09-27: G13, G14, m14).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPARTMENTS,
  MARKETING_TOPICS,
  TEAM_AGENTS,
  WEBSITE_RELEVANT_TOPICS,
  accountRowPlace,
  accountRowPlaceFromBuilder,
  declaredDepartment,
  followersOf,
  isDepartment,
  newEntryOwner,
  ownerFolder,
  ownerNoun,
  typedKindOf,
} from '../lib/memory-owner.mjs';

test('the department lists are the builder\'s, with analytics as a Marketing topic (decision 6)', () => {
  assert.deepEqual([...TEAM_AGENTS].sort(), ['accounting', 'coder', 'comms', 'helpdesk', 'marketing', 'orchestrator', 'production', 'sales']);
  // hiveku_builder memory-types.ts MARKETING_FAMILY_DEPARTMENTS, less the lead, plus analytics.
  assert.deepEqual([...MARKETING_TOPICS].sort(), [
    'analytics', 'before_after_grid', 'branding', 'content', 'customer_avatar', 'customer_journey',
    'email', 'knowledge_base', 'outbound', 'ppc', 'seo', 'social', 'website_design', 'workflow',
  ]);
  assert.equal(DEPARTMENTS.length, 22);
  // Not departments: the words the older docs warned about.
  for (const word of ['pm', 'crm', 'dev', 'web', 'commerce', 'general', 'shared', 'account']) {
    assert.equal(isDepartment(word), false, word);
  }
  // CODER_RELEVANT_MARKETING in hiveku_agent_server account_memory_files.py.
  assert.deepEqual([...WEBSITE_RELEVANT_TOPICS].sort(), ['before_after_grid', 'branding', 'content', 'customer_avatar', 'customer_journey', 'knowledge_base', 'website_design']);
});

test('ownerFolder: agents at the top, Marketing topics under marketing/, no owner under shared/', () => {
  assert.equal(ownerFolder('sales'), 'sales');
  assert.equal(ownerFolder('helpdesk'), 'helpdesk');
  assert.equal(ownerFolder('comms'), 'comms');
  assert.equal(ownerFolder('production'), 'production');
  assert.equal(ownerFolder('accounting'), 'accounting');
  assert.equal(ownerFolder('coder'), 'coder');
  assert.equal(ownerFolder('orchestrator'), 'orchestrator');
  assert.equal(ownerFolder('marketing'), 'marketing');
  assert.equal(ownerFolder('seo'), 'marketing/seo');
  assert.equal(ownerFolder('customer_avatar'), 'marketing/customer_avatar');
  assert.equal(ownerFolder('analytics'), 'marketing/analytics');
  assert.equal(ownerFolder(null), 'shared');
  assert.equal(ownerFolder(' SEO '), 'marketing/seo');
  // Not decided here: the caller files an owner no agent has.
  assert.equal(ownerFolder('graphic_design'), undefined);
  assert.equal(ownerFolder(undefined), undefined);
  assert.equal(ownerFolder(''), undefined);
});

test('followersOf follows Abe\'s rules: Marketing lead reaches every topic and the Website agent; shared means chats', () => {
  assert.equal(followersOf('sales'), 'the Sales agent');
  assert.equal(followersOf('helpdesk'), 'the Support agent');
  assert.equal(followersOf('orchestrator'), 'the chief of staff');
  assert.equal(followersOf('coder'), 'the Website agent');
  assert.match(followersOf('marketing'), /every Marketing topic\) and the Website agent$/);
  assert.equal(followersOf('seo'), 'the SEO topic of the Marketing team');
  assert.equal(followersOf('branding'), 'the Branding topic of the Marketing team and the Website agent');
  assert.match(followersOf(null), /^every agent, in chats/);
  assert.match(followersOf(null), /calls follow only the receptionist's own call rules/);
  assert.equal(followersOf(undefined), null, 'unknown is said as unknown, never guessed');
  assert.match(followersOf('graphic_design'), /no agent on the Memory page/);
  assert.equal(ownerNoun(null), 'every agent');
  assert.equal(ownerNoun('ppc'), 'the Paid ads topic of the Marketing team');
  assert.equal(ownerNoun(undefined), null);
});

test('accountRowPlace puts each _account:* shape where the page does, and drops the rest', () => {
  const where = (d) => {
    const p = accountRowPlace(d);
    return p && `${p.typeFolder}/${p.folder}/${p.stem} ${p.label}`;
  };
  assert.equal(where('_account:soul'), 'identity/orchestrator/how-it-works Chief of staff > How it works');
  assert.equal(where('_account:claude'), 'identity/orchestrator/background Chief of staff > Background');
  assert.equal(where('_account:_rule:brief-first'), 'rules/orchestrator/brief-first Chief of staff > Rules');
  assert.equal(where('_account:_skill:triage'), 'skills/orchestrator/triage Chief of staff > Skills');
  assert.equal(where('_account:memory:rooms'), 'memory/orchestrator/rooms Chief of staff > Notes');
  assert.equal(where('_account:memory:team-and-roles'), 'memory/orchestrator/team-and-roles Chief of staff > Moved to About your business');
  assert.equal(where('_account:pronunciations'), 'memory/business/voice/pronunciations About your business > Voice and pronunciation');
  assert.equal(where('_account:voice_settings'), 'memory/business/voice/voice-settings About your business > Voice and pronunciation');
  assert.equal(accountRowPlace('_account:pronunciations').owner, undefined, 'Voice belongs to no agent');
  assert.equal(accountRowPlace('_account:soul').owner, 'orchestrator');
  // Dropped, as the page drops them.
  for (const d of ['_account:_agent:old', '_account:weird', '_account:_rule:', '_account:memory:', 'account', '_rule:x', '_workspace:y']) {
    assert.equal(accountRowPlace(d), null, d);
  }
});

test('accountRowPlaceFromBuilder: a row the builder hides is dropped; its group and label win when it names one', () => {
  assert.equal(accountRowPlaceFromBuilder('_account:soul', { where: 'hidden', reason: 'legacy' }), null);
  const moved = accountRowPlaceFromBuilder('_account:memory:rooms', { where: 'agent', agent: 'orchestrator', group: 'moved', label: 'Chief of staff > Moved to About your business' });
  assert.equal(moved.group, 'moved');
  assert.equal(moved.label, 'Chief of staff > Moved to About your business');
  // A placement this cannot read changes nothing; a shape the page drops stays dropped.
  assert.deepEqual(accountRowPlaceFromBuilder('_account:soul', { where: 'agent', agent: 'orchestrator', group: 'nonsense' }), accountRowPlace('_account:soul'));
  assert.equal(accountRowPlaceFromBuilder('_account:_agent:x', { where: 'agent', agent: 'orchestrator', group: 'rules' }), null);
  assert.deepEqual(accountRowPlaceFromBuilder('_account:soul', null), accountRowPlace('_account:soul'));
});

test('declaredDepartment reads a canonical marker anywhere, else canonical front matter at the top', () => {
  assert.equal(declaredDepartment('<!-- department: seo -->\nbody'), 'seo');
  assert.equal(declaredDepartment('intro\n<!-- Department: SALES -->'), 'sales');
  assert.equal(declaredDepartment('---\nname: x\ndepartment: helpdesk\n---\nbody'), 'helpdesk');
  assert.equal(declaredDepartment('<!-- department: seo -->\n---\ndepartment: sales\n---'), 'seo', 'the marker comes first');
  assert.equal(declaredDepartment('<!-- department: foo -->\n---\ndepartment: "ppc"\n---'), 'ppc', 'a non-canonical marker is no veto');
  // Not declarations: a prose line, a non-canonical token, an unclosed block.
  assert.equal(declaredDepartment('Notes\ndepartment: sales'), null);
  assert.equal(declaredDepartment('<!-- department: engineering -->'), null);
  assert.equal(declaredDepartment('---\ndepartment: sales\nno end'), null);
  assert.equal(declaredDepartment(''), null);
  assert.equal(declaredDepartment(undefined), null);
});

test('typedKindOf and newEntryOwner: only a rule, skill, shortcut or specialist that names no agent is shared', () => {
  assert.equal(typedKindOf({ type: 'rule' }), 'rule');
  assert.equal(typedKindOf({ type: 'command' }), 'shortcut');
  assert.equal(typedKindOf({ type: 'agent' }), 'specialist');
  assert.equal(typedKindOf({ domain: '_skill:x' }), 'skill');
  assert.equal(typedKindOf({ domain: 'seo', type: 'rule' }), null, 'the domain decides when both are sent');
  assert.equal(typedKindOf({ type: 'memory' }), null);
  assert.equal(typedKindOf({ type: 'identity' }), null);

  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'always' }), { owner: null, named: false });
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'always', department: 'Sales' }), { owner: 'sales', named: true });
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'always', department: 'shared' }), { owner: null, named: true });
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: '<!-- department: seo -->\nx' }), { owner: 'seo', named: true });
  assert.deepEqual(newEntryOwner({ type: 'skill', name: 'x', content: 'x', project_id: 'p1' }), { owner: 'coder', named: true });
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'x', department: 'pm' }), { owner: undefined, named: true });
  assert.deepEqual(newEntryOwner({ type: 'memory', name: 'seo', content: 'x' }), { owner: undefined, named: false });
  assert.deepEqual(newEntryOwner(null), { owner: undefined, named: false });
});
