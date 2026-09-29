/**
 * lib/memory-owner.mjs: the Memory page's owner folders, its placement of the
 * `_account:*` rows, what a new entry's call declares, who owns a rule, skill,
 * shortcut or specialist after a write, and who follows an owner's entries
 * (memory surfaces audit 2026-09-27: G9, G13, G14, m14; PR #50 review F3, F4).
 *
 * test/fixtures/memory-ownership-cases.json is the builder's own canonical
 * cases for the owner and follow rules, vendored byte for byte from
 * hiveku_builder src/lib/olympus/__fixtures__/memory-ownership-cases.json
 * (branch fix/memory-gaps3-owner-rule at 22e1bc8e0), as the agent servers
 * vendor it. Change the rule there, then re-vendor here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_NAMES,
  DEPARTMENTS,
  MARKETING_FAMILY,
  MARKETING_TOPICS,
  TEAM_AGENTS,
  TOPIC_NAMES,
  WEBSITE_RELEVANT_TOPICS,
  accountRowPlace,
  accountRowPlaceFromBuilder,
  declaredDepartment,
  followersOf,
  frontMatterDepartment,
  isDepartment,
  isTypedDomain,
  newEntryOwner,
  ownerFolder,
  ownerNoun,
  typedKindOf,
  typedRowOwner,
} from '../lib/memory-owner.mjs';

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'memory-ownership-cases.json'), 'utf8'),
);

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

test('ownerFolder: every agent and Marketing topic under its own key (the VS Code extension\'s layout), no owner under shared/', () => {
  assert.equal(ownerFolder('sales'), 'sales');
  assert.equal(ownerFolder('helpdesk'), 'helpdesk');
  assert.equal(ownerFolder('comms'), 'comms');
  assert.equal(ownerFolder('production'), 'production');
  assert.equal(ownerFolder('accounting'), 'accounting');
  assert.equal(ownerFolder('coder'), 'coder');
  assert.equal(ownerFolder('orchestrator'), 'orchestrator');
  assert.equal(ownerFolder('marketing'), 'marketing');
  assert.equal(ownerFolder('seo'), 'seo');
  assert.equal(ownerFolder('customer_avatar'), 'customer_avatar');
  assert.equal(ownerFolder('analytics'), 'analytics');
  assert.equal(ownerFolder(null), 'shared');
  assert.equal(ownerFolder(' SEO '), 'seo');
  // Not decided here: the caller files an owner no agent has.
  assert.equal(ownerFolder('graphic_design'), undefined);
  assert.equal(ownerFolder(undefined), undefined);
  assert.equal(ownerFolder(''), undefined);
});

test('followersOf follows Abe\'s rules: Marketing lead reaches every topic and the Website agent; shared means chats', () => {
  assert.equal(followersOf('sales'), 'the Sales agent');
  assert.equal(followersOf('helpdesk'), 'the Support agent');
  assert.equal(followersOf('orchestrator'), 'the chief of staff');
  assert.equal(followersOf('orchestrator', { domain: '_account:_rule:brief-first' }), 'the chief of staff', 'her own rows');
  assert.match(followersOf('orchestrator', { domain: '_rule:brief-the-team' }), /^no agent \(the chief of staff follows only her own entries/);
  assert.equal(followersOf('coder'), 'the Website agent');
  assert.match(followersOf('marketing'), /every Marketing topic\) and the Website agent$/);
  assert.equal(followersOf('seo'), 'the SEO topic of the Marketing team');
  assert.equal(followersOf('seo', { domain: '_rule:alt-text' }), 'the SEO topic of the Marketing team', 'SEO rules: not the Website agent');
  assert.equal(followersOf('seo', { domain: '_skill:keyword-research' }), 'the SEO topic of the Marketing team and the Website agent', 'SEO skills: the Website agent too');
  assert.equal(followersOf('branding'), 'the Branding topic of the Marketing team and the Website agent');
  assert.match(followersOf(null), /^every agent, in chats/);
  assert.match(followersOf(null), /calls follow only the receptionist's own call rules/);
  assert.equal(followersOf(undefined), null, 'unknown is said as unknown, never guessed');
  assert.match(followersOf('graphic_design'), /no agent on the Memory page/);
  assert.equal(ownerNoun(null), 'every agent');
  assert.equal(ownerNoun('ppc'), 'the Paid ads topic of the Marketing team');
  assert.equal(ownerNoun(undefined), null);
});

test('the lists match the builder\'s canonical cases: the Marketing family, the departments, the Website agent\'s owners', () => {
  assert.deepEqual([...MARKETING_FAMILY].sort(), [...FIXTURE.marketing_family].sort());
  assert.deepEqual([...DEPARTMENTS].sort(), [...FIXTURE.follower_departments].sort());
  assert.deepEqual(['marketing', ...WEBSITE_RELEVANT_TOPICS].sort(), [...FIXTURE.website_agent_followed_owners].sort());
  assert.deepEqual(FIXTURE.website_agent_followed_skill_owners, ['seo']);
});

test('typedRowOwner is the builder\'s owner rule on every canonical rule, skill, shortcut and specialist', () => {
  const typed = FIXTURE.cases.filter((c) => isTypedDomain(c.row.domain));
  // Refuse the vacuous pass: the fixture has 46 typed cases today.
  assert.ok(typed.length >= 40, `only ${typed.length} typed cases`);
  for (const c of typed) {
    assert.equal(typedRowOwner({ column: c.row.department, content: c.row.content }), c.expect.owner, c.name);
  }
});

/** The words for a canonical follower set, built from the set alone (never from followersOf). */
function wordsForFollowers(followers) {
  if (followers.length === FIXTURE.follower_departments.length) return /^every agent, in chats/;
  if (followers.length === 0) return /^no agent/;
  const rest = followers.filter((d) => d !== 'coder');
  const website = followers.includes('coder');
  if (rest.includes('marketing')) {
    assert.deepEqual(rest.filter((d) => d !== 'marketing').sort(), [...MARKETING_TOPICS].sort(), 'the lead brings every topic');
    return 'the Marketing team (its lead and every Marketing topic) and the Website agent';
  }
  if (rest.length === 0) return 'the Website agent';
  assert.equal(rest.length, 1, followers.join(','));
  const [d] = rest;
  const base = TOPIC_NAMES[d] ? `the ${TOPIC_NAMES[d]} topic of the Marketing team` : `the ${AGENT_NAMES[d]} agent`;
  return website ? `${base} and the Website agent` : base;
}

test('followersOf names exactly the builder\'s followers of every canonical account-level rule, skill, shortcut and specialist', () => {
  const typed = FIXTURE.cases.filter((c) => isTypedDomain(c.row.domain) && !c.row.project_id);
  assert.ok(typed.length >= 30, `only ${typed.length} cases`);
  for (const c of typed) {
    const want = wordsForFollowers(c.expect.followers);
    const got = followersOf(c.expect.owner, { domain: c.row.domain });
    if (want instanceof RegExp) assert.match(got, want, c.name);
    else assert.equal(got, want, c.name);
  }
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
  // Front matter the builder does not read declares nothing here either (agent-identity.ts
  // splitIdentity): a byte-order mark or a CR LF before it, or a single-quoted value.
  assert.equal(frontMatterDepartment('\uFEFF---\ndepartment: sales\n---'), null);
  assert.equal(frontMatterDepartment('---\r\ndepartment: sales\r\n---'), null);
  assert.equal(frontMatterDepartment("---\ndepartment: 'sales'\n---"), null);
  assert.equal(frontMatterDepartment('<!-- department: x -->\n---\ndepartment: sales\n---'), 'sales', 'one leading marker line is skipped');
  assert.equal(declaredDepartment('<!-- department: foo -->\n<!-- department: seo -->'), null, 'only the first marker counts');
});

test('typedRowOwner reads the column first, then the Marketing family marker, then any declaration', () => {
  assert.equal(typedRowOwner({ column: 'sales', content: '<!-- department: seo -->' }), 'sales', '(a) the column');
  assert.equal(typedRowOwner({ column: 'marketing', content: '<!-- department: seo -->' }), 'seo', '(b) the seeded shape');
  assert.equal(typedRowOwner({ column: 'marketing', content: '<!-- department: sales -->' }), 'marketing', '(c) not a family marker');
  assert.equal(typedRowOwner({ column: 'marketing', content: 'no line' }), 'marketing', '(c) no marker');
  assert.equal(typedRowOwner({ column: null, content: '<!-- department: sales -->' }), 'sales', '(d) any marker');
  assert.equal(typedRowOwner({ column: '', content: '---\ndepartment: helpdesk\n---' }), 'helpdesk', '(d) front matter');
  assert.equal(typedRowOwner({ column: null, content: 'no line' }), null, '(d) shared with every agent');
  assert.equal(typedRowOwner({ column: ' Graphic_Design ', content: '<!-- department: seo -->' }), 'graphic_design', '(a) as written');
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
  // A `department` no agent has is stored as no column: the rule is shared.
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'x', department: 'pm' }), { owner: null, named: false });
  // The owner rule's (b): a `marketing` department with a topic's line goes to the topic.
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: '<!-- department: seo -->', department: 'marketing' }), { owner: 'seo', named: true });
  assert.deepEqual(newEntryOwner({ type: 'memory', name: 'seo', content: 'x' }), { owner: undefined, named: false });
  assert.deepEqual(newEntryOwner({ type: 'memory', name: 'seo', content: 'x', department: 'seo' }), { owner: 'seo', named: true });
  assert.deepEqual(newEntryOwner(null), { owner: undefined, named: false });
});

test('F3: a `department` the server does not send decides nothing; the text and "shared" still do', () => {
  const unsent = { departmentArg: false };
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'always', department: 'sales' }, unsent), { owner: null, named: false });
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: '<!-- department: sales -->\nalways', department: 'sales' }, unsent), { owner: 'sales', named: true });
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'always', department: 'shared' }, unsent), { owner: null, named: true });
  assert.deepEqual(newEntryOwner({ type: 'skill', name: 'x', content: 'x', project_id: 'p1' }, unsent), { owner: 'coder', named: true });
  // Negative control: the same call counts its department where the server applies it.
  assert.deepEqual(newEntryOwner({ type: 'rule', name: 'x', content: 'always', department: 'sales' }), { owner: 'sales', named: true });
});
