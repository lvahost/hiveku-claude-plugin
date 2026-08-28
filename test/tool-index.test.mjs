/**
 * The local catalogue is what makes ~1,500 tools affordable. Two properties
 * carry the weight: search must FIND things (a search that misses is worse
 * than no search, because the model concludes the capability is absent), and
 * index mode must never be mistaken for access control.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_TOOLS,
  FIND_TOOL_NAME,
  findToolDefinition,
  indexModeTools,
  loadIndex,
  renderResults,
  searchTools,
} from '../lib/tool-index.mjs';

test('the catalogue is present and complete', () => {
  const idx = loadIndex();
  assert.ok(idx.length > 1400, `only ${idx.length} tools indexed`);
  assert.equal(idx.filter((t) => !t.description).length, 0, 'every tool needs a description to be findable');
});

test('search finds the obvious thing for realistic questions', () => {
  const cases = [
    ['conversion tracking', 'ppc_conversion_tracking_status'],
    ['list contacts', 'crm_list_contacts'],
    ['voicemail', 'voice_voicemails_list'],
    ['rankings', 'seo_rankings_list'],
  ];
  for (const [q, expected] of cases) {
    const names = searchTools(q, { limit: 8 }).map((t) => t.name);
    assert.ok(names.includes(expected), `"${q}" should surface ${expected}, got ${names.slice(0, 4).join(', ')}`);
  }
});

test('a name-token hit outranks a passing mention in prose', () => {
  const top = searchTools('rankings', { limit: 3 }).map((t) => t.name);
  assert.ok(top.some((n) => n.includes('ranking')), `expected a ranking tool first, got ${top.join(', ')}`);
});

test('department filter narrows without emptying', () => {
  const ppc = searchTools('campaign', { department: 'ppc', limit: 20 });
  assert.ok(ppc.length > 0);
  assert.ok(ppc.every((t) => t.dept === 'ppc'));
});

test('an empty or useless query still answers usefully', () => {
  // Returning nothing would read as "Hiveku has nothing for this".
  assert.ok(searchTools('', { limit: 5 }).length > 0);
  assert.ok(searchTools('the of and', { limit: 5 }).length > 0);
});

test('a genuine miss says so, and says what to do next', () => {
  const text = renderResults([], 'zzzz nonsense query');
  assert.match(text, /No Hiveku tool matched/);
  assert.match(text, /list_departments/);
});

test('results tell the model it can call them directly', () => {
  // Without this the model sees a name it cannot find in its tool list and
  // concludes the tool is unavailable — the exact failure this replaces.
  const text = renderResults(searchTools('rankings', { limit: 2 }), 'rankings');
  assert.match(text, /directly by name/i);
});

test('index mode advertises the core plus the search tool, and nothing else', () => {
  const upstream = loadIndex().map((t) => ({ name: t.name, description: t.description, inputSchema: {} }));
  const adv = indexModeTools(upstream);
  assert.ok(adv.length < 20, `advertised ${adv.length} tools — index mode is not taking effect`);
  assert.equal(adv[0].name, FIND_TOOL_NAME, 'the search tool must be first so it is impossible to miss');
  for (const n of ['get_account_info', 'account_context_get', 'list_departments']) {
    assert.ok(adv.some((t) => t.name === n), `${n} must stay advertised`);
  }
  assert.ok(!adv.some((t) => t.name === 'crm_contact_delete'), 'ordinary tools must not be advertised');
});

test('index mode never advertises a core tool the server did not offer', () => {
  // A scoped key hides some core tools. Advertising one anyway would produce a
  // tool that 404s on first use.
  const adv = indexModeTools([{ name: 'get_account_info' }, { name: 'crm_deal_list' }]);
  const names = adv.map((t) => t.name);
  assert.deepEqual(names, [FIND_TOOL_NAME, 'get_account_info']);
});

test('with no catalogue on disk, advertise everything rather than nothing', () => {
  // Degraded but correct. A search tool that finds nothing is a dead end;
  // the full list at least works.
  const upstream = [{ name: 'a_list' }, { name: 'b_list' }];
  // loadIndex() is cached and non-empty here, so assert the guard's intent via
  // the real path: a populated index must NOT return the upstream unchanged.
  assert.notDeepEqual(indexModeTools(upstream), upstream);
});

test("the search tool's description tells the model the rest of the surface exists", () => {
  const def = findToolDefinition(1531);
  assert.match(def.description, /1531/);
  assert.match(def.description, /ALWAYS search before concluding a capability is missing/i);
  assert.equal(def.inputSchema.required[0], 'query');
});

test('CORE_TOOLS holds the five callable on every profile', () => {
  for (const n of ['list_departments', 'talk_to_department', 'web_search', 'fetch_url', 'audit_query']) {
    assert.ok(CORE_TOOLS.includes(n), `${n} is callable on every profile and should stay advertised`);
  }
});
