/**
 * content-draft fixture: dataset invariants, the traps the tools mirror, and
 * the transcript hook exercised over a synthetic run built from the fixture's
 * own tools (no sample-run/ golden yet - producing one needs a model in the
 * loop). A planted-defect eval is only as honest as its seeds, so the seeds
 * are recomputed here from the dataset rather than trusted: one banned-phrase
 * field in the department's draft (and a look-alike that must survive), one
 * pre-filled row field the check reports as an error (a hero with no alt),
 * one timed-out department turn that department_turn_get reads back, three
 * linkable site URLs and one published post that cannot be linked, and a
 * calendar row that arrives UNGROUNDED (the five typed columns null, the
 * keyword only in settings - the pre-column shape). Then the half that
 * matters: the hook FAILS a publish while an error stands, a publish after an
 * unchecked edit, a body with one link or an invented one, a row whose
 * grounding was written to settings keys or tags instead of the typed
 * columns (or not at all, or with a stage off the journey, or refused for a
 * foreign id), a banned phrase persisted, a missing hero alt, a header that
 * disagrees with the row, a skipped check, a blind retry of the timed-out
 * turn, a turn never read back, links read after the body was written, a
 * refused content_create or deploy, a report with no header, and a sidecar
 * that disagrees with the transcript.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTranscript, callsTo, countCalls } from '../lib/transcript.mjs';
import { PENDING_TOOLS } from '../../test/pending-tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.join(HERE, '..');
const ROOT = path.join(EVALS, '..');
const FIX = path.join(EVALS, 'fixtures', 'content-draft');
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(FIX, ...p), 'utf8'));
const {
  createTools, NOW, ROW_ID, PROJECT_ID, SITE_HOST, TURN_ID, REVISION_TURN_ID, FRESH_TURN_ID, SESSION_ID, FRESH_SESSION_ID,
  phrasePattern, checkContentSeo, parseMarkdown, MIN_BODY_WORDS,
} = await import(pathToFileURL(path.join(FIX, 'tools.mjs')).href);
const { checks, BANNED_PHRASES, LINK_URLS, STAGE_NAMES, internalLinksIn, extractUrls, parseHeaders, persistedRow, bannedHit, rowKeyword } = await import(pathToFileURL(path.join(FIX, 'checks.mjs')).href);

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-content-draft-'));
const hasProblem = (problems, prefix, includes) => problems.some((p) => p.startsWith(prefix) && (includes === undefined || p.includes(includes)));
const draft = () => loadJson('dataset', 'misc.json').department.draft;
const LINK_FINISH = 'https://brightsidefixtures.example/blog/finish-schedule';
const LINK_CALLBACK = 'https://brightsidefixtures.example/blog/what-a-call-back-costs';
const ALT = 'A cabinet door on the finish-room rack, scuffed with 320-grit paper between coats';
const META_TITLE = 'Why we sand between coats | Brightside Fixtures';
const GRID_NAME = 'Harlow Street refit - Whitfield Renovations';
/** The grounding a clean run records on the row: the five typed columns content_update takes. */
const DEFAULT_GROUNDING = { avatar_id: 'avt_marcus_01', journey_id: 'cjm_trade_01', journey_stage: 'Problem Aware', before_after_grid_id: 'grid_harlow_01', target_keyword: 'sand between coats' };
const cleanMeta = () => draft().meta_description.replace('A seamless finish', 'A finish that lasts');

// -- Tool surface -----------------------------------------------------------------
test('content-draft: every served tool name is in lib/tool-index.json or PENDING_TOOLS, and nothing hidden is advertised', async () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'tool-index.json'), 'utf8'));
  const known = new Set(index.tools.map((t) => t.name));
  const tools = await createTools();
  for (const name of Object.keys(tools)) {
    assert.ok(known.has(name) || PENDING_TOOLS.has(name), `${name} is served but neither in lib/tool-index.json nor PENDING_TOOLS`);
  }
  // the three round-2 contracts ride on the CONTENT-1 ledger until the index regen
  for (const name of ['content_seo_check', 'content_site_links', 'department_turn_get']) {
    assert.ok(name in tools, `${name} must be served`);
    assert.ok(known.has(name) || PENDING_TOOLS.get(name)?.batch === 'CONTENT-1', `${name} must be live or pending under CONTENT-1`);
  }
  // the names the checks assert on must be served, so an attempt is logged under its own name
  for (const name of ['account_context_get', 'sites_list', 'content_list', 'content_get', 'content_create', 'content_update', 'content_link_to_cms', 'content_publish_to_site', 'content_unpublish_from_site', 'content_delete', 'content_share_link_create', 'deploy_site', 'deploy_run', 'talk_to_department', 'memory_list', 'memory_update', 'pm_tasks_create']) {
    assert.ok(name in tools, `${name} must be served`);
  }
  assert.ok(!Object.keys(tools).includes('_state'), 'the introspection helper must not be enumerable (tools/list would advertise it)');
  assert.equal(typeof tools._state, 'function');
});

// -- Dataset invariants -------------------------------------------------------------
test('content-draft: the calendar row is bound, keyworded, slugged from its title, and carries a hero with no alt', () => {
  const rows = loadJson('dataset', 'content.json');
  const row = rows.find((r) => r.id === ROW_ID);
  const expected = loadJson('expected-findings.json');
  assert.equal(row.status, 'draft');
  assert.equal(row.content, '', 'the body is the work, not a defect');
  assert.equal(row.meta_title, null);
  assert.equal(row.meta_description, null);
  assert.equal(row.slug, 'why-we-sand-between-coats');
  assert.equal(row.website_project_id, PROJECT_ID);
  assert.equal(row.cms_collection_id, 'blog');
  assert.equal(row.settings.target_keyword, expected.draft_bounds.keyword);
  // the seed: the row arrives ungrounded - the five typed columns null, the
  // keyword only in settings (written before the column existed)
  for (const key of ['avatar_id', 'journey_id', 'journey_stage', 'before_after_grid_id', 'target_keyword']) {
    assert.equal(row[key], null, `${key} must be null on the calendar row as handed over`);
  }
  assert.equal(rowKeyword(row), expected.draft_bounds.keyword, 'the legacy settings keyword reads through the column');
  assert.equal(expected.draft_bounds.grid_name, GRID_NAME);
  // the published rows carry theirs on the columns, so the list filters have something to return
  const pillar = rows.find((r) => r.id === 'ci_finish_schedule_01');
  assert.deepEqual([pillar.avatar_id, pillar.journey_id, pillar.journey_stage, pillar.before_after_grid_id, pillar.target_keyword], ['avt_marcus_01', 'cjm_trade_01', 'Solution Aware', 'grid_harlow_01', 'cabinet finish schedule']);
  assert.ok(row.featured_image_url, 'the designer attached the hero');
  assert.equal(row.featured_image_alt, null, 'the seed: a hero with no alt');
  // exactly one draft row, and the only one in the September calendar slot
  assert.deepEqual(rows.filter((r) => r.status === 'draft').map((r) => r.id), [ROW_ID]);
  // the published rows carry a url except the one whose collection has no route
  const published = rows.filter((r) => r.status === 'published');
  assert.equal(published.length, 3);
  assert.deepEqual(published.filter((r) => r.url === null).map((r) => r.id), ['ci_shop_tour_01']);
});

test('content-draft: the check on the row as handed over reports the hero alt as an error, beside the empty fields', async () => {
  const tools = await createTools();
  const first = tools.content_seo_check({ content_id: ROW_ID }).data;
  assert.equal(first.content_id, ROW_ID);
  assert.equal(first.result.ok, false);
  const errors = first.result.checks.filter((c) => c.level === 'error').map((c) => c.id).sort();
  assert.deepEqual(errors, ['content_empty', 'hero_alt_missing', 'meta_description_missing', 'meta_title_missing']);
  assert.equal(first.result.checks.find((c) => c.id === 'hero_alt_missing').field, 'featured_image_alt');
  assert.deepEqual(first.context, { target_keyword: 'sand between coats', banned_phrases: ['elevate', 'seamless'], site_host: SITE_HOST, content_format: 'markdown', linked: true });
  assert.equal(first.result.score, 100 - 4 * 15 - first.result.checks.filter((c) => c.level === 'warn').length * 5);
  // the row's own slug is not a placeholder
  assert.ok(!first.result.checks.some((c) => c.id === 'slug_placeholder'));
});

test('content-draft: the department draft carries exactly one banned-phrase field, a look-alike that survives, and two of the three site URLs', () => {
  const d = draft();
  const expected = loadJson('expected-findings.json');
  const brand = loadJson('dataset', 'context.json').brand.ai_forbidden_phrases;
  const patterns = [...new Set([...BANNED_PHRASES, ...brand])].map(phrasePattern);
  assert.equal(d.version, 'content_draft.v1');
  assert.equal(d.for.avatar_id, expected.draft_bounds.avatar_id);
  assert.equal(d.stage, 'Problem Aware');
  assert.ok(STAGE_NAMES.includes(d.stage));
  assert.equal(d.target_keyword, expected.draft_bounds.keyword);
  const fields = { title: d.title, meta_description: d.meta_description, excerpt: d.excerpt, body_markdown: d.body_markdown };
  const hits = Object.entries(fields).filter(([, text]) => patterns.some((re) => re.test(text))).map(([field]) => field);
  assert.deepEqual(hits, expected.categories.banned_phrase_hits.must);
  assert.deepEqual(hits, ['meta_description']);
  assert.match(d.meta_description, /\bseamless\b/, 'the seed is the literal word');
  assert.ok(d.meta_description.length <= 160, 'the meta description is otherwise within length');
  assert.match(d.body_markdown, /\bseams\b/, 'the look-alike is in the body');
  assert.ok(!phrasePattern('seamless').test(d.body_markdown));
  assert.ok(phrasePattern('seamless').test('a seamless handoff'));
  assert.ok(phrasePattern('elevate').test('Elevating the finish'), 'inflections count');
  assert.ok(!phrasePattern('elevate').test('the elevator shaft'), 'a different word does not');
  // links: exactly two of the three site URLs, no other host URL, one external source
  const internal = internalLinksIn(d.body_markdown).sort();
  assert.deepEqual(internal, [LINK_FINISH, LINK_CALLBACK].sort());
  assert.deepEqual(d.internal_links.slice().sort(), internal);
  const external = extractUrls(d.body_markdown).filter((u) => !u.includes(SITE_HOST));
  assert.deepEqual([...new Set(external)], ['https://finishing-standards.example/adhesion/cross-hatch']);
  // no exclamation marks, no emoji, ASCII only
  for (const text of Object.values(fields)) {
    assert.ok(!text.includes('!'), 'no exclamation marks in the draft');
    assert.ok(!/[^\x00-\x7F]/.test(text), 'ASCII only');
  }
  // the body clears the builder's thresholds
  const parsed = parseMarkdown(d.body_markdown);
  assert.ok(parsed.text.split(/\s+/).length >= MIN_BODY_WORDS, `the body has fewer than ${MIN_BODY_WORDS} words`);
  assert.equal(parsed.headings.filter((h) => h.level === 1).length, 0, 'the title is the H1; the body starts at H2');
  assert.ok(parsed.headings.every((h) => h.level === 2));
});

test('content-draft: the department draft, persisted with the phrase caught and the alt written, passes the check with warnings only', async () => {
  const tools = await createTools();
  const d = draft();
  tools.content_update({ content_id: ROW_ID, title: d.title, content: d.body_markdown, excerpt: d.excerpt, meta_title: META_TITLE, meta_description: cleanMeta(), featured_image_alt: ALT });
  const out = tools.content_seo_check({ content_id: ROW_ID }).data.result;
  assert.equal(out.ok, true, JSON.stringify(out.checks));
  assert.deepEqual(out.checks.filter((c) => c.level === 'error'), []);
  const warns = out.checks.map((c) => c.id);
  assert.ok(warns.every((id) => ['claims_without_source'].includes(id)), `unexpected warning ids: ${warns.join(', ')}`);
  assert.equal(out.stats.internal_link_count, 3, 'two site URLs, one of them linked twice');
  assert.equal(out.stats.external_link_count, 1);
  assert.equal(out.stats.h1_count, 0);
  assert.ok(out.stats.word_count >= MIN_BODY_WORDS);
  // persisted verbatim (the phrase still in the meta description) it is exactly one error
  tools.content_update({ content_id: ROW_ID, meta_description: d.meta_description });
  const withPhrase = tools.content_seo_check({ content_id: ROW_ID }).data.result;
  assert.equal(withPhrase.ok, false);
  assert.deepEqual(withPhrase.checks.filter((c) => c.level === 'error').map((c) => [c.id, c.field]), [['banned_phrase', 'meta_description']]);
  assert.equal(withPhrase.score, out.score - 15);
});

test('content-draft: three linkable site URLs and one published post that cannot be linked', async () => {
  const tools = await createTools();
  const expected = loadJson('expected-findings.json');
  const out = tools.content_site_links({ project_id: PROJECT_ID });
  assert.deepEqual(out.data.map((l) => l.url), expected.draft_bounds.site_links);
  assert.deepEqual(out.data.map((l) => l.type), ['post', 'post', 'page']);
  assert.deepEqual(out.data.map((l) => l.source), ['content_item', 'content_item', 'page_list']);
  assert.equal(out.total, 3);
  assert.equal(out.capped, false);
  assert.deepEqual(out.project, { id: PROJECT_ID, name: 'Brightside Fixtures site', host: SITE_HOST });
  assert.deepEqual(out.posts, { listed: 2, without_url: 1 });
  assert.deepEqual(out.pages, { listed: 1 });
  assert.equal(out.notes.length, 1);
  assert.match(out.notes[0], /ci_shop_tour_01/);
  assert.match(out.notes[0], /no route pattern/);
  assert.deepEqual(LINK_URLS, expected.draft_bounds.site_links);
  // the 400 and the 404
  assert.equal(tools.content_site_links({}).code, 'project_id_required');
  assert.equal(tools.content_site_links({ project_id: 'wp_other' }).code, 'project_not_found');
  assert.equal(tools.content_site_links({ project_id: PROJECT_ID, limit: 1 }).capped, true);
  // sites_list is where the project id comes from
  assert.equal(tools.sites_list().data[0].id, PROJECT_ID);
  assert.equal(tools.project_get({ project_id: PROJECT_ID }).data.custom_domain, SITE_HOST);
});

test('content-draft: every expected id resolves; must/must_not disjoint; draft_bounds resolve', () => {
  const expected = loadJson('expected-findings.json');
  const d = draft();
  const known = new Set([
    'title', 'meta_description', 'excerpt', 'body_markdown',
    'hero_alt_missing', 'content_empty', 'meta_description_missing', 'meta_title_missing', 'slug_placeholder', 'internal_links_few', 'banned_phrase',
    TURN_ID, REVISION_TURN_ID, SESSION_ID,
  ]);
  for (const [name, spec] of Object.entries(expected.categories)) {
    const must = new Set(spec.must);
    for (const id of spec.must) assert.ok(known.has(id), `${name}.must: ${id}`);
    for (const t of spec.must_not) {
      assert.ok(known.has(t.id), `${name}.must_not: ${t.id}`);
      assert.ok(!must.has(t.id), `${name}: ${t.id} cannot be both must and must_not`);
      assert.ok(typeof t.reason === 'string' && t.reason.length > 20, `${name}.must_not ${t.id} needs a reason`);
    }
  }
  const b = expected.draft_bounds;
  assert.equal(b.content_id, ROW_ID);
  assert.equal(b.turn_id, TURN_ID);
  assert.equal(b.session_id, SESSION_ID);
  assert.equal(b.grid_id, d.grid_id);
  assert.ok(loadJson('dataset', 'avatars.json').some((a) => a.id === b.avatar_id && a.name === b.avatar_name));
  assert.ok(loadJson('dataset', 'journeys.json').some((j) => j.id === b.journey_id));
  assert.ok(loadJson('dataset', 'grids.json').some((g) => g.id === b.grid_id && g.target_avatar_id === b.avatar_id));
  assert.equal(b.min_links, 2);
});

test('content-draft: prompt.md names the contract and none of the answers; the fixture is ASCII', () => {
  const prompt = fs.readFileSync(path.join(FIX, 'prompt.md'), 'utf8');
  assert.ok(!/seamless|elevate|hero_alt|featured_image_alt|6f1c2a3e|sess_fixture|finish-schedule|what-a-call-back|cabinet-doors|Marcus|Harlow|Problem Aware|avt_marcus|grid_harlow|cjm_trade|ci_sand|wp_brightside|shop_tour|no route pattern/i.test(prompt), 'prompt leaks a seeded answer');
  assert.match(prompt, /findings\.json/);
  assert.match(prompt, /banned_phrase_hits/);
  assert.match(prompt, /row_defects/);
  assert.match(prompt, /resumed_turns/);
  assert.match(prompt, /For: <avatar> \| Stage: <journey stage> \| Grid: <grid> \| Keyword: <keyword> \| Links: <n>/);
  assert.match(prompt, /content_seo_check\(\{ content_id \}\)/);
  assert.match(prompt, /content_site_links\(\{ project_id \}\)/);
  assert.match(prompt, /department_turn_get\(\{ turn_id \}\)/);
  assert.match(prompt, /Do not re-send a timed-out brief/);
  assert.match(prompt, /never while an error stands/);
  assert.match(prompt, /do not call `deploy_site` or `deploy_run`/);
  assert.ok(!prompt.includes('!'), 'no exclamation marks in the contract');
  const files = ['prompt.md', 'tools.mjs', 'checks.mjs', 'expected-findings.json', ...fs.readdirSync(path.join(FIX, 'dataset')).map((f) => path.join('dataset', f))];
  for (const f of files) {
    const text = fs.readFileSync(path.join(FIX, f), 'utf8');
    assert.ok(!/[^\x00-\x7F]/.test(text), `${f} carries a non-ASCII character`);
  }
});

// -- The tools mirror the traps -------------------------------------------------------
test('content-draft: tools - create refuses, update is faithful and refuses a schedule, link binding is scoped, publish never blocks', async () => {
  const tools = await createTools();
  assert.equal(tools.content_create({ title: 'x', content: 'y' }).refused, true);
  assert.match(tools.content_create({}).reason, new RegExp(ROW_ID));
  assert.equal(tools.content_update({ content_id: 'ci_nope', title: 'x' }).error, 'Content item not found');
  assert.equal(tools.content_update({ content_id: ROW_ID, scheduled_publish_at: '2026-09-11T14:00:00Z' }).refused, true);
  assert.match(tools.content_update({ content_id: ROW_ID, slug: 'Bad Slug' }).error, /lower-case/);
  assert.equal(tools.content_update({ content_id: ROW_ID, slug: 'finish-schedule' }).code, 'slug_conflict');
  assert.match(tools.content_update({ content_id: ROW_ID, status: 'live' }).error, /status must be one of/);
  // the grounding: a foreign or malformed id refuses with invalid_reference and NOTHING on the call is written
  const foreign = tools.content_update({ content_id: ROW_ID, avatar_id: 'avt_other_01', title: 'changed' });
  assert.equal(foreign.code, 'invalid_reference');
  assert.match(foreign.error, /customer_avatar_list; nothing was written/);
  assert.equal(tools.content_get({ content_id: ROW_ID }).data.title, 'Why we sand between coats', 'nothing on a refused call is written');
  assert.equal(tools.content_update({ content_id: ROW_ID, journey_id: 'cjm_nope' }).code, 'invalid_reference');
  assert.equal(tools.content_update({ content_id: ROW_ID, before_after_grid_id: 42 }).code, 'invalid_reference');
  assert.match(tools.content_update({ content_id: ROW_ID, journey_stage: ['x'] }).error, /journey_stage must be the stage name/);
  // settings merge one level; the five land on the typed columns with the names beside them; the legacy keyword reads through the column; status flips the row and nothing else
  const merged = tools.content_update({ content_id: ROW_ID, avatar_id: 'avt_marcus_01', journey_id: 'cjm_trade_01', journey_stage: ' Problem Aware ', before_after_grid_id: 'grid_harlow_01', settings: { note: 'x' }, meta_keywords: 'sand between coats, cabinet finish' }).data;
  assert.equal(merged.avatar_id, 'avt_marcus_01');
  assert.deepEqual(merged.customer_avatar, { id: 'avt_marcus_01', name: 'Marcus' });
  assert.deepEqual(merged.customer_journey, { id: 'cjm_trade_01', name: 'Trade contractor journey' });
  assert.equal(merged.journey_stage, 'Problem Aware', 'the stage name is trimmed');
  assert.deepEqual(merged.before_after_grid, { id: 'grid_harlow_01', name: GRID_NAME });
  assert.equal(merged.settings.note, 'x');
  assert.equal(merged.settings.target_keyword, 'sand between coats', 'siblings survive the merge');
  assert.equal(merged.target_keyword, 'sand between coats', 'the legacy settings keyword reads through the column');
  assert.deepEqual(merged.settings.linkedTaskIds, ['task_sept_blog_01']);
  assert.deepEqual(merged.meta_keywords, ['sand between coats', 'cabinet finish']);
  const cleared = tools.content_update({ content_id: ROW_ID, target_keyword: '' }).data;
  assert.equal(cleared.settings.target_keyword, undefined);
  assert.equal(cleared.target_keyword, null);
  const keyed = tools.content_update({ content_id: ROW_ID, target_keyword: 'sand between coats', settings: { target_keyword: 'a different keyword' } }).data;
  assert.equal(keyed.target_keyword, 'sand between coats', 'the declared param wins over a settings keyword sent in the same call');
  assert.equal(keyed.settings.target_keyword, 'sand between coats', 'and the mirror follows the column');
  assert.equal(tools.content_update({ content_id: ROW_ID, avatar_id: null }).data.customer_avatar, null, 'null clears');
  tools.content_update({ content_id: ROW_ID, avatar_id: 'avt_marcus_01' });
  assert.equal(tools.content_update({ content_id: ROW_ID, status: 'published' }).data.status, 'published');
  assert.equal(tools.content_get({ content_id: ROW_ID }).data.url, null, 'a status flip does not put the page anywhere');
  tools.content_update({ content_id: ROW_ID, status: 'draft' });
  // binding: cross-project 404, a taken target 409, re-pointing within the project fine
  assert.match(tools.content_link_to_cms({ content_id: ROW_ID, website_project_id: 'wp_other' }).error, /not found/);
  assert.equal(tools.content_link_to_cms({ content_id: ROW_ID, cms_entry_slug: 'finish-schedule' }).code, 'cms_target_conflict');
  assert.equal(tools.content_link_to_cms({ content_id: ROW_ID, cms_entry_slug: 'why-we-sand-between-coats' }).data.cms_entry_slug, 'why-we-sand-between-coats');
  // publish: unpublish refuses; a publish while an error stands is a 200 with the error line in warnings
  assert.equal(tools.content_publish_to_site({ content_id: ROW_ID, unpublish: true }).refused, true);
  const early = tools.content_publish_to_site({ content_id: ROW_ID }).data;
  assert.equal(early.published, true);
  assert.equal(early.mode, 'publish');
  assert.equal(early.route, '/blog/why-we-sand-between-coats');
  assert.equal(early.filePath, 'content/blog/why-we-sand-between-coats.mdx');
  assert.equal(early.visibility.live, false);
  assert.ok(early.warnings.some((w) => /^Error \(featured_image_alt\)/.test(w)), 'the hero alt error rides along as a warning line');
  assert.equal(early.seo_check.ok, false);
  assert.match(early.note, /NOT on the internet yet/);
  assert.match(early.note, /Pre-publish check: \d+ errors? and \d+ warnings?/);
  const state = tools._state();
  assert.deepEqual(state.publishes, [{ content_id: ROW_ID, ok: false }]);
  const row = state.rows.find((r) => r.id === ROW_ID);
  assert.equal(row.status, 'published');
  assert.equal(row.settings.published_route, '/blog/why-we-sand-between-coats');
  // the just-published row joins the site links by its derived route
  assert.ok(tools.content_site_links({ project_id: PROJECT_ID }).data.some((l) => l.id === ROW_ID && l.url === `https://${SITE_HOST}/blog/why-we-sand-between-coats`));
  // gate-crossing tools refuse
  for (const name of ['deploy_site', 'deploy_run', 'content_delete', 'content_unpublish_from_site', 'content_share_link_create']) {
    assert.equal(tools[name]({ content_id: ROW_ID, project_id: PROJECT_ID }).refused, true, `${name} must refuse`);
  }
  // version snapshot and task link are acks; memory_create 409s on the content domain
  assert.equal(typeof tools.content_version_create({ content_id: ROW_ID }).data.version_number, 'number');
  assert.deepEqual(tools.content_link_tasks({ content_id: ROW_ID, task_ids: ['task_new_9'] }).data.linkedTaskIds, ['task_sept_blog_01', 'task_new_9']);
  assert.equal(tools.memory_create({ domain: 'content', content: 'x' }).status, 409);
  assert.equal(tools.memory_update({ memory_id: 'mem_content_1', content: 'appended' }).previous_version_saved, true);
  assert.equal(tools.pm_tasks_create({ project_id: 'proj_fixture_ops', title: 'Route the news collection' }).data.id, 'task_new_1');
  assert.match(tools.pm_tasks_create({ project_id: 'proj_nope', title: 'x' }).error, /project_id/);
});

test('content-draft: tools - the first department turn times out with turn_id and no session; the read-back runs then completes; a blind retry refuses', async () => {
  const tools = await createTools();
  assert.match(tools.talk_to_department({ domain: 'social', message: 'x' }).error, /not part of this fixture/);
  assert.match(tools.talk_to_department({ domain: 'content' }).error, /message is required/);
  const first = tools.talk_to_department({ domain: 'content', message: 'Draft the September piece.' });
  assert.equal(first.turn_id, TURN_ID);
  assert.equal(first.session_id, null);
  assert.equal(first.response, '');
  assert.equal(first.duration_ms, 110003);
  assert.match(first.error, /did not finish within this tool's 108s window/);
  assert.match(first.error, /Do NOT retry blind/);
  assert.match(first.error, new RegExp(`department_turn_get\\(\\{ turn_id: "${TURN_ID}" \\}\\)`));
  // a session id nobody has yet is not found
  assert.match(tools.talk_to_department({ domain: 'content', message: 'x', session_id: SESSION_ID }).error, /not found/);
  // the blind retry refuses until the turn is read back
  const retry = tools.talk_to_department({ domain: 'content', message: 'Draft the September piece.' });
  assert.equal(retry.refused, true);
  assert.match(retry.reason, /blind retry/);
  // the read-back: bad ids 404, first poll running (no session id), second completed
  assert.equal(tools.department_turn_get({}).error, 'turn_id is required');
  assert.equal(tools.department_turn_get({ turn_id: 'turn_nope' }).error, 'Turn not found');
  assert.equal(tools.department_turn_get({ turn_id: '00000000-0000-4000-8000-000000000000' }).error, 'Turn not found');
  const running = tools.department_turn_get({ turn_id: TURN_ID });
  assert.equal(running.status, 'running');
  assert.equal(running.session_id, null);
  assert.equal(running.stale, false);
  assert.ok(!running.response.includes('content_draft.v1'), 'the partial response carries no draft yet');
  const done = tools.department_turn_get({ turn_id: TURN_ID });
  assert.equal(done.status, 'completed');
  assert.equal(done.session_id, SESSION_ID);
  assert.equal(done.stop_reason, 'end_turn');
  assert.ok(done.response.includes('```json content_draft.v1'));
  assert.deepEqual(done.tool_calls.map((c) => [c.name, c.ok]), [['account_context_get', true], ['kb_search', true]]);
  assert.equal(done.events_available, true);
  assert.equal(done.finished_at, '2026-09-05T15:03:40Z');
  const block = JSON.parse(done.response.split('```json content_draft.v1\n')[1].split('\n```')[0]);
  assert.equal(block.version, 'content_draft.v1');
  assert.equal(block.for.name, 'Marcus');
  // after the read-back: the session resumes, and a fresh conversation is allowed again
  const revised = tools.talk_to_department({ domain: 'content', message: 'Tighten the meta description.', session_id: SESSION_ID });
  assert.equal(revised.session_id, SESSION_ID);
  assert.equal(revised.turn_id, REVISION_TURN_ID);
  assert.ok(revised.response.startsWith('Revised as asked.'));
  const fresh = tools.talk_to_department({ domain: 'content', message: 'A second piece.' });
  assert.equal(fresh.session_id, FRESH_SESSION_ID);
  assert.equal(fresh.turn_id, FRESH_TURN_ID);
  assert.equal(tools.department_turn_get({ turn_id: REVISION_TURN_ID }).status, 'completed');
  assert.equal(tools._state().turn.recovered, true);
});

test('content-draft: tools - reads behave like the routes (context, foundation, KB, content list and get)', async () => {
  const tools = await createTools();
  const ctx = tools.account_context_get({ domain: 'content' });
  assert.equal(ctx.domain, 'content');
  assert.deepEqual(ctx.avatars.map((a) => a.id), ['avt_marcus_01']);
  assert.deepEqual(ctx.journeys[0].stages, STAGE_NAMES);
  assert.equal(ctx.grids[0].id, 'grid_harlow_01');
  assert.deepEqual(ctx.brand.ai_forbidden_phrases, ['elevate', 'seamless']);
  assert.match(ctx.memory_notes, /Client approval on record 2026-09-04/);
  assert.equal(ctx.avatars[0].typical_quote.length > 20, true);
  assert.equal(tools.customer_avatar_get({ id: 'avt_marcus_01' }).data.online_behavior.social_platforms.length, 2);
  assert.equal(tools.customer_avatar_get({ avatar_id: 'nope' }).error, 'Customer avatar not found');
  assert.equal(tools.customer_journey_get({ id: 'cjm_trade_01' }).data.stages.length, 5);
  assert.equal(tools.before_after_grid_list({ target_avatar_id: 'avt_marcus_01' }).pagination.total, 1);
  assert.ok(tools.before_after_grid_get({ grid_id: 'grid_harlow_01' }).data.measurable_results.some((r) => /41 doors/.test(r)));
  assert.equal(tools.brand_guide_get({}).data.copy_dos.length, 2);
  assert.equal(tools.brand_guide_get({ id: 'bg_nope' }).error, 'Brand guide not found');
  const kb = tools.kb_search({ query: 'sand between coats' });
  assert.equal(kb.data[0].id, 'kbdoc_finish_schedule_01');
  assert.match(tools.kb_search({ query: 'lead time' }).data[0].title, /never quote publicly/);
  assert.match(tools.kb_search({}).error, /query is required/);
  const drafts = tools.content_list({ status: 'draft' });
  assert.equal(drafts.pagination.total, 1);
  assert.equal(drafts.data[0].id, ROW_ID);
  assert.equal(drafts.data[0].url, null);
  // every list row carries the grounding: the calendar row's is null, its keyword read through the column
  assert.deepEqual([drafts.data[0].avatar_id, drafts.data[0].journey_stage, drafts.data[0].customer_avatar, drafts.data[0].target_keyword], [null, null, null, 'sand between coats']);
  // the grounding filters, as the Olympus list reads them
  assert.deepEqual(tools.content_list({ avatar_id: 'avt_marcus_01', limit: 200 }).data.map((r) => r.id).sort(), ['ci_call_backs_01', 'ci_finish_schedule_01']);
  assert.deepEqual(tools.content_list({ journey_stage: 'problem aware' }).data.map((r) => r.id), ['ci_call_backs_01']);
  assert.deepEqual(tools.content_list({ avatar_id: 'avt_marcus_01', journey_stage: 'Solution Aware' }).data.map((r) => r.id), ['ci_finish_schedule_01']);
  assert.equal(tools.content_list({ before_after_grid_id: 'grid_nope' }).pagination.total, 0);
  assert.deepEqual(tools.content_get({ content_id: 'ci_finish_schedule_01' }).data.customer_avatar, { id: 'avt_marcus_01', name: 'Marcus' });
  const published = tools.content_list({ status: 'published', limit: 200 });
  assert.equal(published.pagination.total, 3);
  assert.equal(published.data.find((r) => r.id === 'ci_finish_schedule_01').url, LINK_FINISH);
  const got = tools.content_get({ content_id: ROW_ID }).data;
  assert.equal(got.featured_image_alt, null);
  assert.equal(got.linked_tasks[0].id, 'task_sept_blog_01');
  assert.equal(tools.content_get({ content_id: 'nope' }).error, 'Content item not found');
  assert.equal(tools.content_seo_check({}).error, 'content_id is required');
  assert.equal(tools.content_seo_check({ content_id: 'nope' }).error, 'Content item not found');
  assert.equal(tools.memory_list({ domain: 'content' }).entries.length, 1);
});

// -- The transcript hook, over a synthetic run built from the fixture's own tools ----
async function syntheticRun({
  body, metaDescription, alt = ALT, grounding, settings, tags, memoryContent, extraCalls = [], reorder,
  skipPoll = false, pollOnce = false, blindRetry = false, skipCheck = false, publishEarly = false, editAfterCheck = false, skipPublish = false,
  linksAfterBody = false, skipLinks = false, callCreate = false, callDeploy = false, findingsPatch, reportPatch,
} = {}) {
  const tools = await createTools();
  const d = draft();
  const prior = tools.memory_list({ domain: 'content' }).entries[0].content;
  const dir = tmpDir();
  const lines = [];
  const call = (tool, input = {}) => {
    const result = tools[tool](input);
    lines.push(JSON.stringify({ ts: NOW, tool, input, result }));
    return result;
  };
  const brief = 'Draft the September blog post for Marcus (avt_marcus_01) at Problem Aware: why we sand between coats. Keyword: sand between coats. Grid: grid_harlow_01. Link to the pillar (finish-schedule) and the call-back post; anchors attached.';
  call('account_context_get', { domain: 'content' });
  call('content_list', { status: 'draft', limit: 50 });
  call('content_get', { content_id: ROW_ID });
  call('customer_avatar_get', { id: 'avt_marcus_01' });
  call('customer_journey_get', { id: 'cjm_trade_01' });
  call('before_after_grid_get', { id: 'grid_harlow_01' });
  call('kb_search', { query: 'sand between coats' });
  call('sites_list', {});
  if (!linksAfterBody && !skipLinks) call('content_site_links', { project_id: PROJECT_ID });
  if (callCreate) call('content_create', { title: d.title, content: 'x', content_type: 'blog_post', status: 'draft' });
  call('talk_to_department', { domain: 'content', message: brief });
  if (blindRetry) call('talk_to_department', { domain: 'content', message: brief });
  if (!skipPoll) {
    call('department_turn_get', { turn_id: TURN_ID });
    if (!pollOnce) call('department_turn_get', { turn_id: TURN_ID });
  }
  const update = {
    content_id: ROW_ID,
    title: d.title,
    content: body ?? d.body_markdown,
    excerpt: d.excerpt,
    meta_title: META_TITLE,
    meta_description: metaDescription ?? cleanMeta(),
    meta_keywords: ['sand between coats'],
    // the grounding rides on the typed columns (grounding: null sends none; settings keys are the legacy shape a failing run might still write)
    ...(grounding === null ? {} : (grounding ?? DEFAULT_GROUNDING)),
    ...(settings ? { settings } : {}),
    ...(tags ? { tags } : {}),
  };
  call('content_update', update);
  if (linksAfterBody) call('content_site_links', { project_id: PROJECT_ID });
  const results = {};
  if (!skipCheck) results.first = call('content_seo_check', { content_id: ROW_ID });
  if (publishEarly) results.publish = call('content_publish_to_site', { content_id: ROW_ID });
  if (alt !== null) call('content_update', { content_id: ROW_ID, featured_image_alt: alt });
  if (!skipCheck) results.second = call('content_seo_check', { content_id: ROW_ID });
  if (editAfterCheck) call('content_update', { content_id: ROW_ID, excerpt: `${d.excerpt} (edited)` });
  if (!skipPublish && !publishEarly) results.publish = call('content_publish_to_site', { content_id: ROW_ID });
  if (callDeploy) call('deploy_site', { project_id: PROJECT_ID, tier: 'production' });
  call('memory_list', { domain: 'content' });
  call('memory_update', { memory_id: 'mem_content_1', content: memoryContent ?? `${prior}\n2026-09-05: September piece drafted for Marcus at Problem Aware, published to the working tree at /blog/why-we-sand-between-coats; live at the Friday deploy. The department turn timed out at the bridge and was read back with department_turn_get.` });
  for (const extra of extraCalls) lines.push(JSON.stringify(extra));
  if (typeof reorder === 'function') reorder(lines);
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), `${lines.join('\n')}\n`);
  const transcript = loadTranscript(path.join(dir, 'transcript.jsonl'));
  const published = Boolean(results.publish && results.publish.data && results.publish.data.published);
  const findings = {
    categories: { banned_phrase_hits: ['meta_description'], row_defects: ['hero_alt_missing'], resumed_turns: [TURN_ID] },
    draft: { content_id: ROW_ID, avatar: 'Marcus', stage: 'Problem Aware', keyword: 'sand between coats', internal_links: [LINK_FINISH, LINK_CALLBACK], seo_check_ok: true, published, deployed: false },
    ...(findingsPatch || {}),
  };
  const report = [
    '# One blog post - Brightside Fixtures - why we sand between coats',
    '',
    '## Who it is for',
    'The brief said the trade contractor. account_context_get returned one avatar, Marcus (avt_marcus_01), and the trade contractor journey (cjm_trade_01); the piece fills the Problem Aware cell under the finish-durability cluster with the Harlow Street grid (grid_harlow_01) as proof.',
    '',
    reportPatch?.header === null ? '' : (reportPatch?.header ?? `For: Marcus | Stage: Problem Aware | Grid: ${GRID_NAME} | Keyword: sand between coats | Links: 2`),
    '',
    '## Links',
    `content_site_links(wp_brightside_01) returned 3 URLs (2 posts, 1 page) and 1 post without a URL (its collection has no route pattern). The body links the pillar ${LINK_FINISH} and ${LINK_CALLBACK}.`,
    '',
    '## The department turn',
    `talk_to_department timed out at the bridge after 110003 ms with turn_id ${TURN_ID} and no session id; department_turn_get read it back (running once, then completed) - the draft was never re-sent.`,
    '',
    '## Pre-publish check',
    'The department draft opened its meta description on "seamless" (brand.ai_forbidden_phrases) - rewritten before persisting; the body carries "seams", a joint, not a hit. First run: 1 error, hero_alt_missing (featured_image_alt) - the hero was attached in the dashboard with no alt; alt written. Second run: ok true, score 95, one warning (claims_without_source on the 320-grit sentence - a spec, not a claim; left as is).',
    '```',
    ALT,
    '```',
    '```',
    cleanMeta(),
    '```',
    '',
    '## Draft',
    '```',
    body ?? d.body_markdown,
    '```',
    '',
    published
      ? `## Published\ncontent_publish_to_site wrote content/blog/why-we-sand-between-coats.mdx to the working tree (version 4); warnings[] carried the one warning line. NOT live: the page goes out at the web team's Friday deploy.`
      : '## Not published\nThe piece stays a draft on the row.',
    '',
    '## Remembered',
    'Memory note appended.',
  ].join('\n');
  return { dir, tools, transcript, findings, report, results };
}

const findingsCheck = (findingsPath) =>
  spawnSync(process.execPath, [path.join(EVALS, 'checkers', 'findings-check.mjs'), '--expected', path.join(FIX, 'expected-findings.json'), '--actual', findingsPath], { encoding: 'utf8' });

test('content-draft: the hook PASSES a clean synthetic run, and the answer key grades its sidecar clean', async () => {
  const { dir, transcript, findings, report, results } = await syntheticRun();
  const problems = checks(transcript, { run: dir, report, findings });
  assert.deepEqual(problems, []);
  assert.equal(results.first.data.result.ok, false, 'the seeded row defect shows on the first check');
  assert.deepEqual(results.first.data.result.checks.filter((c) => c.level === 'error').map((c) => c.id), ['hero_alt_missing']);
  assert.equal(results.second.data.result.ok, true);
  assert.equal(results.publish.data.published, true);
  assert.ok(!results.publish.data.warnings.some((w) => /^Error/.test(w)));
  assert.equal(countCalls(transcript, 'content_publish_to_site'), 1);
  assert.equal(countCalls(transcript, 'department_turn_get'), 2);
  const findingsPath = path.join(dir, 'findings.json');
  fs.writeFileSync(findingsPath, JSON.stringify(findings));
  const res = findingsCheck(findingsPath);
  assert.equal(res.status, 0, res.stdout);
  assert.match(res.stdout, /PASS: exactly the seeded defects/);
  // the CLI form agrees
  fs.writeFileSync(path.join(dir, 'report.md'), report);
  const cli = spawnSync(process.execPath, [path.join(FIX, 'checks.mjs'), '--run', dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, `${cli.stdout}\n${cli.stderr}`);
  assert.match(cli.stdout, /PASS/);
  // the folded row is what the transcript left
  const { row } = persistedRow(transcript);
  assert.equal(row.featured_image_alt, ALT);
  assert.deepEqual([row.avatar_id, row.journey_id, row.journey_stage, row.before_after_grid_id, row.target_keyword], ['avt_marcus_01', 'cjm_trade_01', 'Problem Aware', 'grid_harlow_01', 'sand between coats']);
  assert.equal(row.settings.target_keyword, 'sand between coats', 'the mirror follows the column');
  assert.equal(row.settings.linkedAvatars, undefined, 'nothing writes the legacy settings keys');
  // the echo the hook reads carries the names behind the ids
  const firstUpdate = callsTo(transcript, 'content_update')[0];
  assert.deepEqual(firstUpdate.result.data.customer_avatar, { id: 'avt_marcus_01', name: 'Marcus' });
  assert.equal(firstUpdate.result.data.before_after_grid.name, GRID_NAME);
  assert.equal(bannedHit(row), null);
});

test('content-draft: the hook FAILS a publish while an error stands, a publish after an unchecked edit, and a skipped check', async () => {
  const early = await syntheticRun({ publishEarly: true });
  const p1 = checks(early.transcript, { run: early.dir, report: early.report, findings: early.findings });
  assert.ok(hasProblem(p1, 'every publish follows a clean check', 'still reported an error'), p1.join('\n'));
  assert.ok(hasProblem(p1, 'every publish follows a clean check', 'error line') || hasProblem(p1, 'every publish follows a clean check', 'still reported an error'));
  const edited = await syntheticRun({ editAfterCheck: true });
  const p2 = checks(edited.transcript, { run: edited.dir, report: edited.report, findings: edited.findings });
  assert.ok(hasProblem(p2, 'every publish follows a clean check', 're-run the check after every edit'), p2.join('\n'));
  const skipped = await syntheticRun({ skipCheck: true });
  const p3 = checks(skipped.transcript, { run: skipped.dir, report: skipped.report, findings: skipped.findings });
  assert.ok(hasProblem(p3, 'the check ran on the row and ended clean', 'never ran'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'every publish follows a clean check', 'no content_seo_check'), p3.join('\n'));
  // no publish at all is fine when the sidecar says so
  const held = await syntheticRun({ skipPublish: true });
  const p4 = checks(held.transcript, { run: held.dir, report: held.report, findings: held.findings });
  assert.deepEqual(p4, []);
});

test('content-draft: the hook FAILS a body with one site link, an invented site link, and a banned phrase persisted', async () => {
  const d = draft();
  const oneLink = await syntheticRun({ body: d.body_markdown.split(LINK_CALLBACK).join('https://finishing-standards.example/call-backs') });
  const p1 = checks(oneLink.transcript, { run: oneLink.dir, report: oneLink.report, findings: oneLink.findings });
  assert.ok(hasProblem(p1, 'the persisted body links two of the three site URLs', 'links 1 of the 3'), p1.join('\n'));
  const invented = await syntheticRun({ body: `${d.body_markdown}\n\nSee also [our finish room](https://brightsidefixtures.example/blog/finish-room-tour).\n` });
  const p2 = checks(invented.transcript, { run: invented.dir, report: invented.report, findings: invented.findings });
  assert.ok(hasProblem(p2, 'the persisted body links two of the three site URLs', 'never returned: https://brightsidefixtures.example/blog/finish-room-tour'), p2.join('\n'));
  const relative = await syntheticRun({ body: `${d.body_markdown}\n\nSee also [cabinet doors](/cabinet-doors).\n` });
  const p2b = checks(relative.transcript, { run: relative.dir, report: relative.report, findings: relative.findings });
  assert.deepEqual(p2b, [], 'a site-relative link to a listed page is that page');
  const phrased = await syntheticRun({ metaDescription: d.meta_description });
  const p3 = checks(phrased.transcript, { run: phrased.dir, report: phrased.report, findings: phrased.findings });
  assert.ok(hasProblem(p3, 'no banned phrase in persisted copy', '"seamless" in meta_description'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'the check ran on the row and ended clean'), 'the check itself catches the phrase too');
  const inflected = await syntheticRun({ body: `${d.body_markdown}\n\nElevating the finish is the point.\n` });
  const p4 = checks(inflected.transcript, { run: inflected.dir, report: inflected.report, findings: inflected.findings });
  assert.ok(hasProblem(p4, 'no banned phrase in persisted copy', '"elevate" in content'), p4.join('\n'));
});

test('content-draft: the hook FAILS a grounding written to settings keys or tags, none at all, a stage off the journey, a foreign id, a missing hero alt, and a header the row does not back', async () => {
  const GROUNDING = 'the row carries its grounding as typed columns';
  // the pre-round-3 shape: settings.linkedAvatars / targetJourneyStage / linkedBeforeAfterGrids - nothing reads them now
  const settingsOnly = await syntheticRun({ grounding: null, settings: { linkedAvatars: ['avt_marcus_01'], targetJourneyStage: 'Problem Aware', linkedBeforeAfterGrids: ['grid_harlow_01'] } });
  const p1 = checks(settingsOnly.transcript, { run: settingsOnly.dir, report: settingsOnly.report, findings: settingsOnly.findings });
  assert.ok(hasProblem(p1, GROUNDING, 'not the contract'), p1.join('\n'));
  // the social tag spelling is not the contract either
  const tagged = await syntheticRun({ grounding: null, tags: ['persona:marcus', 'stage:problem-aware', 'cluster:finish-durability'] });
  const p2 = checks(tagged.transcript, { run: tagged.dir, report: tagged.report, findings: tagged.findings });
  assert.ok(hasProblem(p2, GROUNDING, 'not the contract'), p2.join('\n'));
  // avatar and stage recorded, the grid not: the promise is part of the grounding
  const noGrid = await syntheticRun({ grounding: { avatar_id: 'avt_marcus_01', journey_id: 'cjm_trade_01', journey_stage: 'Problem Aware', target_keyword: 'sand between coats' } });
  const p3 = checks(noGrid.transcript, { run: noGrid.dir, report: noGrid.report, findings: noGrid.findings });
  assert.ok(hasProblem(p3, GROUNDING, 'before_after_grid_id is null'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'report carries the For | Stage | Grid | Keyword | Links header', 'not the grid the row carries'), 'and the header names a grid the row does not carry');
  // a stage the journey map does not have (the business vocabulary, not the map's)
  const wrongStage = await syntheticRun({ grounding: { ...DEFAULT_GROUNDING, journey_stage: 'Awareness' } });
  const p4 = checks(wrongStage.transcript, { run: wrongStage.dir, report: wrongStage.report, findings: wrongStage.findings });
  assert.ok(hasProblem(p4, GROUNDING, 'not a stage on cjm_trade_01'), p4.join('\n'));
  // a foreign id: the fixture refuses the whole write (nothing lands, the body included), and the hook sees an ungrounded row
  const foreign = await syntheticRun({ grounding: { ...DEFAULT_GROUNDING, avatar_id: 'avt_other_01' } });
  assert.equal(callsTo(foreign.transcript, 'content_update')[0].result.code, 'invalid_reference');
  const p5 = checks(foreign.transcript, { run: foreign.dir, report: foreign.report, findings: foreign.findings });
  assert.ok(hasProblem(p5, GROUNDING, 'not the contract') || hasProblem(p5, GROUNDING, 'avatar_id is null'), p5.join('\n'));
  const noAlt = await syntheticRun({ alt: null });
  const p6 = checks(noAlt.transcript, { run: noAlt.dir, report: noAlt.report, findings: noAlt.findings });
  assert.ok(hasProblem(p6, 'the hero got its alt text'), p6.join('\n'));
  assert.ok(hasProblem(p6, 'the check ran on the row and ended clean'), 'and the check still reports the error');
  // the header is read back from the row: a stage typed from the brief that the row does not carry fails
  const headerDrift = await syntheticRun({ reportPatch: { header: `For: Marcus | Stage: Solution Aware | Grid: ${GRID_NAME} | Keyword: sand between coats | Links: 2` } });
  const p7 = checks(headerDrift.transcript, { run: headerDrift.dir, report: headerDrift.report, findings: headerDrift.findings });
  assert.ok(hasProblem(p7, 'report carries the For | Stage | Grid | Keyword | Links header', 'not the stage the row carries (Problem Aware)'), p7.join('\n'));
  assert.ok(hasProblem(p7, 'sidecar reconciles', 'not the stage the row carries') === false, 'the sidecar named the row stage, so only the header is wrong');
  // the row's stage recorded as the map spells it, the sidecar disagreeing, fails on the sidecar
  const sidecarDrift = await syntheticRun({ findingsPatch: { draft: { content_id: ROW_ID, avatar: 'Marcus', stage: 'Solution Aware', keyword: 'sand between coats', internal_links: [LINK_FINISH, LINK_CALLBACK], seo_check_ok: true, published: true, deployed: false } } });
  const p8 = checks(sidecarDrift.transcript, { run: sidecarDrift.dir, report: sidecarDrift.report, findings: sidecarDrift.findings });
  assert.ok(hasProblem(p8, 'sidecar reconciles', 'not the stage the row carries (Problem Aware)'), p8.join('\n'));
});

test('content-draft: the hook FAILS a blind retry, a turn never read back, a single poll, and links read after the body', async () => {
  const blind = await syntheticRun({ blindRetry: true });
  const p1 = checks(blind.transcript, { run: blind.dir, report: blind.report, findings: blind.findings });
  assert.ok(hasProblem(p1, 'the timed-out turn was read back, not re-sent', 're-sent a fresh conversation'), p1.join('\n'));
  assert.equal(callsTo(blind.transcript, 'talk_to_department')[1].result.refused, true, 'the fixture refused it, and the refusal is still a call');
  const unread = await syntheticRun({ skipPoll: true });
  const p2 = checks(unread.transcript, { run: unread.dir, report: unread.report, findings: unread.findings });
  assert.ok(hasProblem(p2, 'the timed-out turn was read back, not re-sent', 'was never called'), p2.join('\n'));
  assert.ok(hasProblem(p2, 'sidecar reconciles', 'resumed_turns') === false, 'no poll, so the sidecar rule about resumed_turns does not fire');
  const once = await syntheticRun({ pollOnce: true });
  const p3 = checks(once.transcript, { run: once.dir, report: once.report, findings: once.findings });
  assert.ok(hasProblem(p3, 'the timed-out turn was read back, not re-sent', 'never reached status completed'), p3.join('\n'));
  const late = await syntheticRun({ linksAfterBody: true });
  const p4 = checks(late.transcript, { run: late.dir, report: late.report, findings: late.findings });
  assert.ok(hasProblem(p4, 'site links read from the tool before the body was written', 'before content_site_links answered'), p4.join('\n'));
  const none = await syntheticRun({ skipLinks: true });
  const p5 = checks(none.transcript, { run: none.dir, report: none.report, findings: none.findings });
  assert.ok(hasProblem(p5, 'site links read from the tool before the body was written', 'never called'), p5.join('\n'));
});

test('content-draft: the hook FAILS a refused content_create or deploy, a late context read, a missing header, and a dropped memory', async () => {
  const created = await syntheticRun({ callCreate: true });
  const p1 = checks(created.transcript, { run: created.dir, report: created.report, findings: created.findings });
  assert.ok(hasProblem(p1, 'gate-crossing tools never called', 'content_create was called'), p1.join('\n'));
  const deployed = await syntheticRun({ callDeploy: true });
  const p2 = checks(deployed.transcript, { run: deployed.dir, report: deployed.report, findings: deployed.findings });
  assert.ok(hasProblem(p2, 'gate-crossing tools never called', 'deploy_site was called'), p2.join('\n'));
  // the context read moved to AFTER the department call and the read-back (reads before it are fine; a draft or a write is not)
  const lateCtx = await syntheticRun({ reorder: (lines) => { const ctx = lines.shift(); lines.splice(10, 0, ctx); } });
  const p3 = checks(lateCtx.transcript, { run: lateCtx.dir, report: lateCtx.report, findings: lateCtx.findings });
  assert.ok(hasProblem(p3, 'context loaded before drafting or writing', 'talk_to_department at transcript index 8 came before account_context_get'), p3.join('\n'));
  const readsFirst = await syntheticRun({ reorder: (lines) => { const ctx = lines.shift(); lines.splice(3, 0, ctx); } });
  const p3b = checks(readsFirst.transcript, { run: readsFirst.dir, report: readsFirst.report, findings: readsFirst.findings });
  assert.deepEqual(p3b, [], 'list and get reads before the context read are not a draft');
  const noHeader = await syntheticRun({ reportPatch: { header: null } });
  const p4 = checks(noHeader.transcript, { run: noHeader.dir, report: noHeader.report, findings: noHeader.findings });
  assert.ok(hasProblem(p4, 'report carries the For | Stage | Grid | Keyword | Links header', 'no "For:'), p4.join('\n'));
  const wrongHeader = await syntheticRun({ reportPatch: { header: 'For: Marcus | Stage: Awareness | Grid: Harlow | Keyword: sand between coats | Links: 2' } });
  const p5 = checks(wrongHeader.transcript, { run: wrongHeader.dir, report: wrongHeader.report, findings: wrongHeader.findings });
  assert.ok(hasProblem(p5, 'report carries the For | Stage | Grid | Keyword | Links header', 'not the stage the row carries (Problem Aware)'), p5.join('\n'));
  // the assertion stops at the first mismatch; the abbreviated grid name fails on its own once the stage is right
  const wrongGrid = await syntheticRun({ reportPatch: { header: 'For: Marcus | Stage: Problem Aware | Grid: Harlow | Keyword: sand between coats | Links: 2' } });
  const p5b = checks(wrongGrid.transcript, { run: wrongGrid.dir, report: wrongGrid.report, findings: wrongGrid.findings });
  assert.ok(hasProblem(p5b, 'report carries the For | Stage | Grid | Keyword | Links header', 'not the grid the row carries'), p5b.join('\n'));
  const dropped = await syntheticRun({ memoryContent: 'September piece done.' });
  const p6 = checks(dropped.transcript, { run: dropped.dir, report: dropped.report, findings: dropped.findings });
  assert.ok(hasProblem(p6, 'memory write-back keeps the prior document'), p6.join('\n'));
  assert.deepEqual(parseHeaders('x\nFor: Marcus | Stage: Problem Aware | Grid: G | Keyword: sand between coats | Links: 2\n'), [{ avatar: 'Marcus', stage: 'Problem Aware', grid: 'G', keyword: 'sand between coats', links: 2 }]);
});

test('content-draft: the hook FAILS a sidecar that disagrees with the transcript or the rules', async () => {
  const claimsPublished = await syntheticRun({ skipPublish: true, findingsPatch: { draft: { content_id: ROW_ID, avatar: 'Marcus', stage: 'Problem Aware', keyword: 'sand between coats', internal_links: [LINK_FINISH, LINK_CALLBACK], seo_check_ok: true, published: true, deployed: false } } });
  const p1 = checks(claimsPublished.transcript, { run: claimsPublished.dir, report: claimsPublished.report, findings: claimsPublished.findings });
  assert.ok(hasProblem(p1, 'sidecar reconciles', 'draft.published is true'), p1.join('\n'));
  const deployedFlag = await syntheticRun({ findingsPatch: { draft: { content_id: ROW_ID, avatar: 'Marcus', stage: 'Problem Aware', keyword: 'sand between coats', internal_links: [LINK_FINISH, LINK_CALLBACK], seo_check_ok: true, published: true, deployed: true } } });
  const p2 = checks(deployedFlag.transcript, { run: deployedFlag.dir, report: deployedFlag.report, findings: deployedFlag.findings });
  assert.ok(hasProblem(p2, 'sidecar reconciles', 'draft.deployed must be false'), p2.join('\n'));
  const wrongLinks = await syntheticRun({ findingsPatch: { draft: { content_id: ROW_ID, avatar: 'Marcus', stage: 'Problem Aware', keyword: 'sand between coats', internal_links: [LINK_FINISH, 'https://brightsidefixtures.example/cabinet-doors'], seo_check_ok: true, published: true, deployed: false } } });
  const p3 = checks(wrongLinks.transcript, { run: wrongLinks.dir, report: wrongLinks.report, findings: wrongLinks.findings });
  assert.ok(hasProblem(p3, 'sidecar reconciles', 'which the persisted body does not link'), p3.join('\n'));
  const noTurn = await syntheticRun({ findingsPatch: { categories: { banned_phrase_hits: ['meta_description'], row_defects: ['hero_alt_missing'], resumed_turns: [] } } });
  const p4 = checks(noTurn.transcript, { run: noTurn.dir, report: noTurn.report, findings: noTurn.findings });
  assert.ok(hasProblem(p4, 'sidecar reconciles', 'resumed_turns must carry'), p4.join('\n'));
  const noDraft = await syntheticRun({ findingsPatch: { draft: undefined } });
  const p5 = checks(noDraft.transcript, { run: noDraft.dir, report: noDraft.report, findings: noDraft.findings });
  assert.ok(hasProblem(p5, 'sidecar reconciles', 'no draft block'), p5.join('\n'));
});

test('content-draft: findings-check grades the categories block and names the traps', async () => {
  const dir = tmpDir();
  const wrong = { categories: { banned_phrase_hits: ['meta_description', 'body_markdown'], row_defects: ['content_empty', 'meta_description_missing'], resumed_turns: [SESSION_ID] }, draft: {} };
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(wrong));
  const res = findingsCheck(path.join(dir, 'findings.json'));
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FALSE POSITIVE body_markdown - known trap: the body carries the word 'seams'/);
  assert.match(res.stdout, /MISSED seeded finding hero_alt_missing/);
  assert.match(res.stdout, /FALSE POSITIVE content_empty - known trap/);
  assert.match(res.stdout, /FALSE POSITIVE meta_description_missing - known trap/);
  assert.match(res.stdout, new RegExp(`MISSED seeded finding ${TURN_ID}`));
  assert.match(res.stdout, new RegExp(`FALSE POSITIVE ${SESSION_ID} - known trap: a session id`));
  assert.doesNotMatch(res.stdout, /unknown category/, 'draft beside categories is not an invented class');
  const relabel = { categories: { banned_phrase_hits: ['meta_description'], row_defects: ['hero_alt_missing', 'banned_phrase'], resumed_turns: [TURN_ID, REVISION_TURN_ID] } };
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(relabel));
  const res2 = findingsCheck(path.join(dir, 'findings.json'));
  assert.equal(res2.status, 1);
  assert.match(res2.stdout, /FALSE POSITIVE banned_phrase - known trap: the banned phrase arrived in the department's draft/);
  assert.match(res2.stdout, new RegExp(`FALSE POSITIVE ${REVISION_TURN_ID} - known trap: a revision turn`));
});

// -- The mock server serves this fixture --------------------------------------------
function rpcSession(transcriptPath, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(EVALS, 'bin', 'mock-mcp.mjs'), '--fixture', FIX, '--transcript', transcriptPath]);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('mock-mcp timed out'));
    }, 10000);
    let buf = '';
    const responses = [];
    const expected = messages.filter((m) => m.id !== undefined).length;
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) responses.push(JSON.parse(line));
      }
      if (responses.length >= expected) {
        clearTimeout(timer);
        child.kill();
        resolve(responses);
      }
    });
    child.on('error', reject);
    for (const m of messages) child.stdin.write(`${JSON.stringify(m)}\n`);
  });
}

test('content-draft: mock-mcp handshake, tools/list, the timeout, the read-back and a refusal logged to the transcript', async () => {
  const transcript = path.join(tmpDir(), 'transcript.jsonl');
  const responses = await rpcSession(transcript, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'content_site_links', arguments: { project_id: PROJECT_ID } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'talk_to_department', arguments: { domain: 'content', message: 'Draft it.' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'department_turn_get', arguments: { turn_id: TURN_ID } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'department_turn_get', arguments: { turn_id: TURN_ID } } },
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'deploy_site', arguments: { project_id: PROJECT_ID } } },
  ]);
  const byId = new Map(responses.map((r) => [r.id, r]));
  assert.equal(byId.get(1).result.serverInfo.name, 'hk-mock');
  const names = byId.get(2).result.tools.map((t) => t.name);
  for (const n of ['account_context_get', 'content_site_links', 'content_seo_check', 'department_turn_get', 'content_update', 'content_publish_to_site', 'deploy_site', 'memory_update']) {
    assert.ok(names.includes(n), `tools/list must advertise ${n}`);
  }
  assert.ok(!names.includes('_state'), 'the introspection helper is not advertised');
  const links = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(links.total, 3);
  const timedOut = JSON.parse(byId.get(4).result.content[0].text);
  assert.equal(timedOut.turn_id, TURN_ID);
  assert.equal(timedOut.session_id, null);
  assert.equal(JSON.parse(byId.get(5).result.content[0].text).status, 'running');
  assert.equal(JSON.parse(byId.get(6).result.content[0].text).status, 'completed');
  assert.equal(JSON.parse(byId.get(7).result.content[0].text).refused, true);
  const logged = loadTranscript(transcript);
  assert.deepEqual(logged.map((c) => c.name), ['content_site_links', 'talk_to_department', 'department_turn_get', 'department_turn_get', 'deploy_site']);
  assert.equal(callsTo(logged, 'deploy_site')[0].result.refused, true);
});
