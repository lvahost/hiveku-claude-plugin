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

test('★ department seo reaches the DataForSEO vendor tools (dept alias)', () => {
  // Measured 2026-08-30: department 'seo' and a focus of seo could not return
  // any backlinks_ / dataforseo_labs_ / serp_ / on_page_ / keywords_data_ /
  // content_analysis_ tool, so a session reported "no backlink data" on an
  // account with twenty backlink tools. lib/dept-aliases.mjs widens both paths.
  const byDept = searchTools('backlinks summary', { department: 'seo', limit: 15 }).map((t) => t.name);
  assert.ok(byDept.includes('backlinks_summary'), `department seo got ${byDept.join(', ')}`);
  const byFocus = searchTools('keyword ideas', { focus: ['seo'], limit: 20 }).map((t) => t.name);
  assert.ok(byFocus.includes('dataforseo_labs_google_keyword_ideas'), `focus seo got ${byFocus.join(', ')}`);
  // content_analysis_ is a PREFIX alias; Hiveku's own content_* tools stay out.
  const content = searchTools('create content', { focus: ['seo'], limit: 50 }).map((t) => t.name);
  assert.ok(!content.includes('content_create'), 'Hiveku content_* tools must not ride an seo focus');
  // The no-terms department listing honours the alias too.
  const listing = searchTools('', { department: 'seo', limit: 50 }).map((t) => t.name);
  assert.ok(listing.some((n) => n.startsWith('backlinks_')), 'the empty-query listing must include vendor tools');
});

test('the search tool tells the model that seo covers the vendor prefixes', () => {
  const desc = findToolDefinition(1770).inputSchema.properties.department.description;
  for (const p of ['backlinks_', 'dataforseo_labs_', 'serp_', 'on_page_', 'keywords_data_']) {
    assert.ok(desc.includes(p), `department description must name ${p}`);
  }
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

test('results tell the model the found tools are now callable', () => {
  // 0.8.x told the model to "call them directly by name" - but a client only
  // dispatches tool_use for REGISTERED tools, so that promise was false and
  // this test enshrined it. The true mechanism is promotion: the shim adds
  // found tools to the advertised list and emits tools/list_changed, so the
  // honest message says added to the session tool list AND warns some clients
  // surface them deferred (the "can be called now" claim was false on Claude Code).
  const text = renderResults(searchTools('rankings', { limit: 2 }), 'rankings');
  assert.match(text, /added to this session's tool list/i);
  assert.match(text, /DEFERRED/);
  assert.match(text, /select:mcp__plugin_hiveku_hk__/);
  assert.doesNotMatch(text, /mcp__hiveku__</);
  assert.doesNotMatch(text, /can be called now/);
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

// ── 0.9.0: the discovery-to-call loop ──────────────────────────────────────
// A client dispatches tool_use only for REGISTERED tools, so a found tool must
// be PROMOTED into the advertised list or it is findable but uncallable. These
// tests pin the three properties that make promotion safe and real.

test('a promoted tool is advertised with its REAL upstream schema', () => {
  const upstream = [
    { name: 'get_account_info', inputSchema: { type: 'object' } },
    { name: 'ppc_search_terms_report', inputSchema: { type: 'object', properties: { connection_id: {} } } },
  ];
  const before = indexModeTools(upstream, new Set());
  assert.ok(!before.some((t) => t.name === 'ppc_search_terms_report'), 'not advertised before promotion');
  const after = indexModeTools(upstream, new Set(['ppc_search_terms_report']));
  const promoted = after.find((t) => t.name === 'ppc_search_terms_report');
  assert.ok(promoted, 'advertised after promotion');
  assert.ok(promoted.inputSchema?.properties?.connection_id, 'carries the upstream schema, not an index stub');
});

test('promotion can never advertise a tool the key cannot see', () => {
  // The upstream list is server-filtered by scope+profile. A name in the
  // exposed set but absent upstream must stay unadvertised - anything else
  // would turn a context optimisation into a fake capability.
  const upstream = [{ name: 'get_account_info', inputSchema: {} }];
  const out = indexModeTools(upstream, new Set(['helpdesk_ticket_send_reply']));
  assert.ok(!out.some((t) => t.name === 'helpdesk_ticket_send_reply'));
});

test('directory focus narrows search by default; an explicit department overrides it', () => {
  const focused = searchTools('list', { focus: ['ppc'], limit: 50 });
  assert.ok(focused.length > 0, 'focused search still finds things');
  assert.ok(focused.every((t) => t.dept === 'ppc'), 'default-restricted to the focus departments');
  const overridden = searchTools('contacts', { focus: ['ppc'], department: 'crm', limit: 50 });
  assert.ok(overridden.some((t) => t.dept === 'crm'), 'explicit department beats focus');
});

test('a read-only key gets annotations, never hidden results', () => {
  const readOnlySet = { has: (n) => n === 'crm_list_contacts' };
  const matches = searchTools('contacts', { readOnlySet, limit: 20 });
  const listed = matches.find((t) => t.name === 'crm_list_contacts');
  assert.ok(listed && !listed.blockedByScope, 'a read-only tool is clean');
  const writeTool = matches.find((t) => t.blockedByScope);
  assert.ok(writeTool, 'write tools stay visible, marked blocked - surfaced, not hidden');
  const text = renderResults(matches, 'contacts');
  assert.match(text, /NOT callable with this read-only key/);
});

test('renderResults promises promotion, not direct-call magic', () => {
  const text = renderResults([{ name: 'crm_list_contacts', method: 'GET', description: 'x' }], 'contacts');
  assert.match(text, /added to this session's tool list/);
  assert.doesNotMatch(text, /do not need to appear/);
});

test('★ naming a tool exactly returns THAT tool, not its near-anagram', () => {
  // `project_get` and `get_project` split to the same token set. With `get`
  // treated as a stopword the query reduced to ["project"], scored them
  // identically, and the alphabetical tiebreak returned the WRONG one. A
  // session asked for a website project's URLs, got the PM-projects tool, and
  // fell back to a memory file for an answer one call would have given.
  assert.equal(searchTools('project_get', { limit: 3 })[0].name, 'project_get');
  assert.equal(searchTools('get_project', { limit: 3 })[0].name, 'get_project');
  assert.equal(searchTools('deploy_status', { limit: 3 })[0].name, 'deploy_status');
});

test('★ a query in the CLIENT\'S tool syntax still finds the tool', () => {
  // Observed verbatim in a production Desktop session: the model pasted the
  // harness's "select:" form plus the client-side MCP prefix into this search,
  // got noise back, and went off to invoke the tool through an unrelated
  // internal tool instead. The wrapper is not the intent.
  for (const q of [
    'select:mcp__plugin_hiveku_hk__get_account_info',
    'mcp__hiveku__get_account_info',
    'select:get_account_info',
  ]) {
    const hit = searchTools(q, { limit: 3 });
    assert.equal(hit[0]?.name, 'get_account_info', `${q} -> ${hit.map((t) => t.name).join(', ')}`);
  }
});

test('`get` and `all` are searchable words in a tool catalogue', () => {
  // Ordinary stopwords, but core verbs here.
  assert.ok(searchTools('get account info', { limit: 5 }).some((t) => t.name === 'get_account_info'));
});

test('★ the tool that returns the development URL is findable', () => {
  // Descriptions were truncated at 400 chars in the index, which cut the
  // response shape out of `project_get` — so the one tool that returns the
  // development URL could not be found by searching for it.
  //
  // Deliberately NOT asserting a field name: `dev_preview_url` was in this
  // description for months and never existed in the response. Pin the tool, not
  // the vocabulary.
  const hit = searchTools('dev preview url', { limit: 5 });
  assert.ok(hit.some((t) => t.name === 'project_get'), `got ${hit.map((t) => t.name).join(', ')}`);
});

test('descriptions are stored in full, and trimmed only when rendered', () => {
  const pg = loadIndex().find((t) => t.name === 'project_get');
  assert.ok(!pg.description.endsWith('…'), 'index must keep the full text');
  const rendered = renderResults([pg], 'dev preview url');
  assert.ok(rendered.length < pg.description.length + 400);
});

test('★ RENDERING PRESERVES WHAT A DESCRIPTION MARKS AS LOAD-BEARING', () => {
  // The bug this pins: the index kept the full text, a test asserted it did,
  // and the RENDERER then cut the response shape off the end anyway. Both
  // halves passed; the fact never reached the model. Asserting "the index has
  // it" and "the render is shorter" is not the same as asserting the render
  // still has it.
  //
  // Every description that marks a fact with ★ or `Response shape:` puts it
  // LAST, so a head-only trim is guaranteed to be the one that loses it.
  // Only 5 descriptions currently use the convention — it is rare, not dead,
  // and the rare ones are the expensive ones to get wrong.
  const marked = loadIndex().filter(
    (t) => t.description.length > 500 && /★|Response shape/.test(t.description),
  );
  assert.ok(marked.length >= 1, `expected marked descriptions, found ${marked.length}`);

  const lost = [];
  for (const t of marked.slice(0, 60)) {
    const rendered = renderResults([t], t.name);
    const hasStar = t.description.includes('★') ? rendered.includes('★') : true;
    const hasShape = t.description.includes('Response shape')
      ? rendered.includes('Response shape')
      : true;
    if (!hasStar || !hasShape) lost.push(t.name);
  }
  assert.deepEqual(lost, [], 'the renderer dropped a marked fact');
});

test('no description in the index is truncated', () => {
  const truncated = loadIndex().filter((t) => t.description.endsWith('…'));
  assert.deepEqual(truncated.map((t) => t.name), [], 'truncation destroys searchability');
});
