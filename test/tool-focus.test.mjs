/**
 * Tool focus trims what is ADVERTISED, and nothing else.
 *
 * The weight here is on two properties. First, that focus never removes a tool
 * a session needs to orient itself — losing `get_account_info` would break the
 * identity check every write depends on. Second, that it is opt-in: an existing
 * directory with no `departments` must behave exactly as it did before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALWAYS_AVAILABLE,
  departmentOf,
  describeFocus,
  filterTools,
  parseFocus,
} from '../lib/tool-focus.mjs';
import { DEPT_ALIASES, deptMatches, expandDept } from '../lib/dept-aliases.mjs';

const tool = (name) => ({ name, description: 'x', inputSchema: { type: 'object' } });
const NAMES = [
  'ppc_campaign_list', 'ppc_digest', 'ppc_conversion_tracking_status',
  'seo_rankings_list', 'seo_gsc_search_analytics',
  'crm_contact_delete', 'crm_account_summary',
  'accounting_bill_pay', 'voice_calls_list',
  'get_account_info', 'account_context_get', 'connections_status',
  'list_departments', 'talk_to_department', 'audit_query',
  'deploy_site',
  // The SEO surface is split across vendor prefixes (lib/dept-aliases.mjs).
  'backlinks_summary', 'dataforseo_labs_google_keyword_ideas', 'content_analysis_summary',
  'serp_organic_live_advanced', 'business_data_business_listings_search', 'crawl',
  // Hiveku's OWN content tools share a first token with content_analysis_ and must not ride along.
  'content_create',
];
const TOOLS = NAMES.map(tool);

test('no focus means no filtering at all', () => {
  // Opt-in. Every directory bound before this existed must be unaffected.
  for (const empty of [undefined, null, [], '', '   ']) {
    assert.equal(filterTools(TOOLS, empty).length, TOOLS.length);
  }
});

test('a focus keeps that department and drops the others', () => {
  const kept = filterTools(TOOLS, ['ppc']).map((t) => t.name);
  assert.ok(kept.includes('ppc_campaign_list'));
  assert.ok(kept.includes('ppc_conversion_tracking_status'));
  assert.ok(!kept.includes('seo_rankings_list'));
  assert.ok(!kept.includes('accounting_bill_pay'));
  assert.ok(!kept.includes('crm_contact_delete'));
});

test('★ orientation tools survive every focus', () => {
  // get_account_info is how a session proves which tenant it is on before any
  // write. Filtering it away to save tokens would trade context for a
  // cross-account write, which is not a trade worth making.
  const kept = filterTools(TOOLS, ['ppc']).map((t) => t.name);
  for (const n of ['get_account_info', 'account_context_get', 'connections_status',
                   'list_departments', 'talk_to_department', 'audit_query']) {
    assert.ok(kept.includes(n), `${n} must survive focus`);
  }
});

test('several departments compose', () => {
  const kept = filterTools(TOOLS, ['ppc', 'seo']).map((t) => t.name);
  assert.ok(kept.includes('ppc_digest'));
  assert.ok(kept.includes('seo_rankings_list'));
  assert.ok(!kept.includes('voice_calls_list'));
});

test('accepts the shapes a person actually types', () => {
  assert.deepEqual(parseFocus('ppc, seo'), ['ppc', 'seo']);
  assert.deepEqual(parseFocus('PPC  SEO'), ['ppc', 'seo']);
  assert.deepEqual(parseFocus(['ppc', 'ppc', 'seo']), ['ppc', 'seo']);
  // Junk is dropped rather than turned into a department that matches nothing.
  assert.deepEqual(parseFocus(['ppc', '', '  ', '../etc', '9x', null]), ['ppc']);
  assert.deepEqual(parseFocus(undefined), []);
});

test('department is the first token, and bare names have none', () => {
  assert.equal(departmentOf('ppc_campaign_list'), 'ppc');
  assert.equal(departmentOf('deploy_site'), 'deploy');
  assert.equal(departmentOf('audit_query'), 'audit');
  assert.equal(departmentOf('memory'), null);
  assert.equal(departmentOf(''), null);
  assert.equal(departmentOf(null), null);
});

test('a tool with no department is dropped unless always-available', () => {
  // Conservative on purpose: an unrecognised name should not ride along just
  // because it does not parse.
  const kept = filterTools([tool('memory'), tool('audit_query')], ['ppc']).map((t) => t.name);
  assert.deepEqual(kept, ['audit_query']);
});

test('never drops an entry it cannot understand', () => {
  // A malformed tool entry is the server's business, not ours. Silently
  // removing it would turn a server bug into a mystery on our side.
  const weird = [{ description: 'no name' }, { name: 42 }, tool('ppc_digest')];
  assert.equal(filterTools(weird, ['ppc']).length, 3);
});

test('non-array input passes through untouched', () => {
  assert.equal(filterTools(undefined, ['ppc']), undefined);
  assert.equal(filterTools('nonsense', ['ppc']), 'nonsense');
});

test('the banner speaks only when it has something to say', () => {
  assert.equal(describeFocus(100, 100, ['ppc']), null, 'nothing filtered — stay quiet');
  assert.equal(describeFocus(100, 20, []), null, 'no focus — stay quiet');
  const msg = describeFocus(1531, 207, ['ppc', 'marketing']);
  assert.match(msg, /207 of 1531/);
  assert.match(msg, /ppc, marketing/);
  // It must say what it is NOT, or someone will read it as access control.
  assert.match(msg, /still reachable/i);
});

test('★ the seo focus is an alias: it keeps the DataForSEO vendor tools too', () => {
  // Measured 2026-08-30: a focus of `seo` dropped every backlinks_, dataforseo_labs_,
  // serp_, on_page_, keywords_data_, content_analysis_ tool and bare `crawl`, so a
  // session concluded the account had no backlink data. The alias closes that.
  const kept = filterTools(TOOLS, ['seo']).map((t) => t.name);
  for (const n of ['seo_rankings_list', 'seo_gsc_search_analytics', 'backlinks_summary',
                   'dataforseo_labs_google_keyword_ideas', 'content_analysis_summary', 'crawl']) {
    assert.ok(kept.includes(n), `${n} must survive an seo focus`);
  }
  // content_analysis_ is an explicit PREFIX alias, never the content department:
  // 38 Hiveku content_* tools (publishing, calendar) stay out of an SEO menu.
  assert.ok(!kept.includes('content_create'), 'Hiveku content_* tools are not SEO');
  assert.ok(!kept.includes('ppc_digest'));
  assert.ok(!kept.includes('crm_contact_delete'));
});

test('an unaliased focus is still an exact first-token match', () => {
  // Aliases only widen the departments named in DEPT_ALIASES; ppc, crm, voice
  // and every other focus behave exactly as before.
  const kept = filterTools(TOOLS, ['ppc']).map((t) => t.name);
  assert.ok(kept.includes('ppc_digest'));
  assert.ok(!kept.includes('backlinks_summary'));
  assert.ok(!kept.includes('crawl'));
  assert.ok(!kept.includes('content_analysis_summary'));
});

test('localseo and aeo aliases match the manifest department ids', () => {
  const local = filterTools(TOOLS, ['localseo']).map((t) => t.name);
  assert.ok(local.includes('seo_gsc_search_analytics'));
  assert.ok(local.includes('business_data_business_listings_search'));
  assert.ok(local.includes('serp_organic_live_advanced'));
  assert.ok(!local.includes('backlinks_summary'), 'localseo does not need the backlink surface');
  const aeo = filterTools(TOOLS, ['aeo']).map((t) => t.name);
  assert.ok(aeo.includes('seo_rankings_list'));
  assert.ok(aeo.includes('serp_organic_live_advanced'));
  assert.ok(!aeo.includes('backlinks_summary'));
});

test('deptMatches: the alias table is explicit and never widens an unaliased department', () => {
  assert.deepEqual(Object.keys(DEPT_ALIASES).sort(), ['aeo', 'creative', 'design', 'localseo', 'media', 'seo', 'social']);
  assert.equal(deptMatches('crawl', 'seo'), true);
  assert.equal(deptMatches('crawl', 'ppc'), false);
  assert.equal(deptMatches('content_analysis_summary', 'seo'), true);
  assert.equal(deptMatches('content_create', 'seo'), false);
  assert.equal(deptMatches('ppc_digest', 'ppc'), true);
  assert.equal(deptMatches('ppc_digest', 'PPC'), true, 'case-insensitive like parseFocus');
  assert.equal(deptMatches('ppc_digest', 'constructor'), false, 'prototype names are not aliases');
  assert.equal(deptMatches('', 'seo'), false);
  assert.equal(deptMatches(null, 'seo'), false);
  assert.equal(deptMatches('seo_rankings_list', ''), false);
  assert.ok(expandDept('seo').includes('backlinks'));
  assert.deepEqual(expandDept('ppc'), ['ppc']);
});

test('★ the creative/design/media aliases reach the split creative surface', () => {
  // Measured 2026-09-01: department 'creative' matched ZERO tools and 'design'
  // only 21 of the ~140 the creative department calls (lib/dept-aliases.mjs).
  // The storyboard/video lane hides under marketing_, the library under media_,
  // brand under brand_ - so an unaliased creative focus advertised nothing.
  assert.equal(deptMatches('marketing_storyboard_create', 'creative'), true);
  assert.equal(deptMatches('marketing_report_send', 'creative'), false,
    'marketing_ is reached by PREFIX only - the report/ops surface must not ride along');
  assert.equal(deptMatches('generate_image', 'media'), true, 'a bare-names alias, not a dept token');
  assert.equal(deptMatches('media_library_list', 'creative'), true);
  assert.equal(deptMatches('brand_guide_get', 'creative'), true);
  assert.equal(deptMatches('marketing_generate_video', 'creative'), true);
  assert.equal(deptMatches('marketing_generate_video', 'design'), true);
  assert.equal(deptMatches('marketing_video_pipeline_status', 'design'), true);
  assert.equal(deptMatches('marketing_media_list', 'media'), true);
  assert.equal(deptMatches('media_upload', 'ppc'), false, 'aliases only widen the aliased word');
});

test('the social alias reaches the surface the social plays actually call', () => {
  // Measured 2026-09-03: department 'social' matched only the 57 social_ tools,
  // while the plays call content_*, media_*, brand_guide_*, generate_*,
  // customer_avatar_*, before_after_grid_*, marketing_report_* and
  // marketing_testimonials_list (lib/dept-aliases.mjs).
  assert.equal(deptMatches('social_create_post', 'social'), true);
  assert.equal(deptMatches('marketing_report_create', 'social'), true);
  assert.equal(deptMatches('before_after_grid_list', 'social'), true);
  assert.equal(deptMatches('customer_avatar_get', 'social'), true);
  assert.equal(deptMatches('content_list', 'social'), true);
  assert.equal(deptMatches('media_library_list', 'social'), true);
  assert.equal(deptMatches('marketing_testimonials_list', 'social'), true);
  assert.equal(deptMatches('sites_list', 'social'), true, 'a bare-names alias, not a dept token');
  assert.equal(deptMatches('project_get', 'social'), true, 'a bare-names alias, not a dept token');
  assert.equal(deptMatches('marketing_offline_conversions_run', 'social'), false,
    'marketing_ is reached by PREFIX only - the rest of marketing stays off a social menu');
  assert.equal(deptMatches('ppc_budget_update', 'social'), false);
  assert.equal(deptMatches('cms_entries_list', 'social'), false, 'cms is read through the page, not aliased');
  assert.equal(deptMatches('social_create_post', 'ppc'), false, 'aliases only widen the aliased word');
});

test('ALWAYS_AVAILABLE covers the five every key can call', () => {
  for (const n of ['list_departments', 'talk_to_department', 'web_search', 'fetch_url', 'audit_query']) {
    assert.ok(ALWAYS_AVAILABLE.has(n), `${n} is callable on every profile and must never be filtered`);
  }
});
