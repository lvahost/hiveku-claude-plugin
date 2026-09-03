/**
 * social-post fixture: dataset invariants, the traps the tools mirror, and the
 * transcript hook exercised over a synthetic run built from the fixture's own
 * tools (no sample-run/ golden yet - producing one needs a model in the loop).
 * A planted-defect eval is only as honest as its seeds, so the seeds are
 * recomputed here from the dataset rather than trusted: exactly one
 * boilerplate avatar, one persona whose platforms are LinkedIn and Facebook,
 * one banned-phrase variant in the canned department reply, 5 of the last 10
 * LinkedIn posts on the same hook, 6 of 20 on the same opening six words, one
 * erroring X account. Then the half that matters: the hook FAILS a scheduled
 * "draft", a publish or generate_image call, a draft aimed at X, a banned or
 * brand-forbidden phrase (inflections included, look-alikes excluded), missing
 * foundation tags, a recycled opening, a breached hook, a Facebook link in the
 * body, a rubric under the gate, a late context read, a skipped dry run, a
 * memory write-back that dropped the prior document, and a sidecar that
 * disagrees with the transcript.
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
const FIX = path.join(EVALS, 'fixtures', 'social-post');
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(FIX, ...p), 'utf8'));
const { createTools, NOW, PLATFORM_SLUGS, phrasePattern, openingWords, X_QUOTA } = await import(pathToFileURL(path.join(FIX, 'tools.mjs')).href);
const { checks, BANNED_PHRASES, HOOK_SLUGS, STAGE_SLUGS, parseRubricLines, bannedHit } = await import(pathToFileURL(path.join(FIX, 'checks.mjs')).href);
const NOW_MS = Date.parse(NOW);

/**
 * The 12 program tools mapped in the MCP server working tree and not yet in
 * lib/tool-index.json (the orchestrator regenerates the index after the MCP
 * deploy). A served name must be in the index, in PENDING_TOOLS, or here.
 */
const ALLOWED_NEW = [
  'social_post_validate', 'social_post_preview', 'social_posts_analytics_list', 'social_analytics_by_dimension',
  'social_calendar_gaps', 'social_comments_digest', 'social_repurpose_source', 'social_post_duplicate',
  'social_posts_bulk_create', 'social_post_retry', 'social_comments_sync_recent', 'social_hashtags_bulk_upsert',
];

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-social-post-'));
const hasProblem = (problems, prefix, includes) =>
  problems.some((p) => p.startsWith(prefix) && (includes === undefined || p.includes(includes)));
const hookOf = (row) => (row.tags.find((t) => t.startsWith('hook:')) || '').slice(5);
const formatOf = (row) => (row.tags.find((t) => t.startsWith('format:')) || '').slice(7);
const publishedOn = (posts, platform) =>
  posts.filter((p) => p.status === 'published' && p.target_platforms.includes(platform)).sort((a, b) => b.published_at.localeCompare(a.published_at));
const block = () => loadJson('dataset', 'misc.json').department.drafts_block;

// -- Tool surface -----------------------------------------------------------------
test('social-post: every served tool name is in lib/tool-index.json, PENDING_TOOLS or the program\'s ALLOWED_NEW list', async () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'tool-index.json'), 'utf8'));
  const known = new Set(index.tools.map((t) => t.name));
  const tools = await createTools();
  for (const name of Object.keys(tools)) {
    const ok = known.has(name) || PENDING_TOOLS.has(name) || ALLOWED_NEW.includes(name);
    assert.ok(ok, `${name} is served but neither in lib/tool-index.json, PENDING_TOOLS nor ALLOWED_NEW`);
  }
  // the names the checks assert on must be served, so an attempt is logged under its own name
  for (const name of ['social_create_post', 'social_update_post', 'social_publish_post', 'generate_image', 'social_post_validate', 'social_post_preview', 'account_context_get', 'customer_avatar_get', 'social_list_posts', 'talk_to_department', 'pm_tasks_create', 'memory_update', 'memory_create']) {
    assert.ok(name in tools, `${name} must be served`);
  }
  // the two new tools this fixture leans on are in the program list, not in the index yet
  for (const name of ['social_post_validate', 'social_post_preview']) assert.ok(ALLOWED_NEW.includes(name));
  // ALLOWED_NEW is a bridge, not a permanent exemption: once the index carries a name, drop it here
  const landed = ALLOWED_NEW.filter((n) => known.has(n));
  assert.ok(landed.length <= ALLOWED_NEW.length, 'sanity');
});

// -- Dataset invariants -------------------------------------------------------------
test('social-post: exactly one boilerplate avatar, sorting first; the persona reads LinkedIn and Facebook only', async () => {
  const avatars = loadJson('dataset', 'avatars.json');
  const expected = loadJson('expected-findings.json');
  const boiler = /your tool|\[Company\]|your website|Your city/i;
  const invalid = avatars.filter((a) => [a.name, a.summary, a.description, a.typical_quote, a.background_story, a.location, ...(a.primary_goals || [])].some((f) => boiler.test(String(f || ''))));
  assert.deepEqual(invalid.map((a) => a.id), ['avt_template_01']);
  assert.deepEqual(expected.categories.invalid_avatars.must, ['avt_template_01']);
  const marcus = avatars.find((a) => a.id === 'avt_marcus_01');
  assert.equal(marcus.name, expected.post_bounds.persona_name);
  assert.deepEqual(marcus.online_behavior.social_platforms, ['linkedin', 'facebook']);
  assert.deepEqual(expected.post_bounds.persona_platforms, ['linkedin', 'facebook']);
  assert.ok(Array.isArray(marcus.buying_behavior.objections) && marcus.buying_behavior.objections.length >= 1, 'the objection lives in the blob');
  assert.ok(marcus.typical_quote.length > 20);
  // the trap: the template avatar is the NEWEST, so it sorts first in the list
  const tools = await createTools();
  const list = tools.customer_avatar_list({});
  assert.equal(list.pagination.total, 2);
  assert.equal(list.data[0].id, 'avt_template_01', 'the boilerplate row sorts first');
  // the context summary shows the same two, with the summary fields only
  const ctx = tools.account_context_get({ domain: 'social' });
  assert.deepEqual(ctx.avatars.map((a) => a.id), ['avt_template_01', 'avt_marcus_01']);
  assert.equal(ctx.avatars[1].online_behavior, undefined, 'the summary omits online_behavior - the full row is customer_avatar_get');
  assert.deepEqual(ctx.brand.ai_forbidden_phrases, ['elevate', 'seamless']);
});

test('social-post: exactly one connected-but-erroring account, hiding behind connection_status connected', async () => {
  const accounts = loadJson('dataset', 'accounts.json');
  const expected = loadJson('expected-findings.json');
  const erroring = accounts.filter((a) => a.can_post === false || a.last_error !== null);
  assert.equal(erroring.length, 1);
  const [bad] = erroring;
  assert.equal(bad.id, expected.post_bounds.erroring_account);
  assert.equal(bad.platform, 'twitter');
  assert.equal(bad.connection_status, 'connected');
  assert.equal(bad.is_active, true);
  assert.equal(bad.token_state, 'expired');
  const healthy = accounts.filter((a) => a.can_post && a.last_error === null && a.connection_status === 'connected' && a.is_active);
  assert.deepEqual(healthy.map((a) => a.id).sort(), [...expected.post_bounds.healthy_accounts].sort());
  const tools = await createTools();
  const all = tools.social_list_accounts({});
  assert.equal(all.total, 4);
  assert.deepEqual(all.quota.x, X_QUOTA, 'quota.x rides along when an X row is present');
  assert.equal(tools.social_list_accounts({ connection_status: 'connected' }).total, 4, 'the status word keeps the erroring row');
  assert.equal(tools.social_list_accounts({ platform: 'linkedin' }).quota, undefined);
});

test('social-post: the LinkedIn variance breach is real and the distractors are not', () => {
  const posts = loadJson('dataset', 'posts.json');
  const expected = loadJson('expected-findings.json');
  const li = publishedOn(posts, 'linkedin');
  assert.equal(li.length, 20, 'twenty is the floor for a variance history');
  const last10 = li.slice(0, 10);
  const hooks = {};
  for (const r of last10) hooks[hookOf(r)] = (hooks[hookOf(r)] || 0) + 1;
  assert.equal(hooks.question, 5, 'the breach: 5 of 10 on the same hook');
  assert.equal(hooks['specific-number'], 2, 'the distractor sits exactly at the cap');
  assert.equal(hooks.mistake, 1, 'mistake is 1 of the last 10 ...');
  assert.equal(li.filter((r) => hookOf(r) === 'mistake').length, 4, '... and 4 of 20');
  const over = Object.entries(hooks).filter(([, n]) => n > 2).map(([h]) => `hook:${h}`);
  assert.deepEqual(over, expected.categories.variance_breaches.must);
  // no format three in a row across the 20 (the format distractor)
  const formats = li.map(formatOf);
  let run = 1;
  for (let i = 1; i < formats.length; i += 1) {
    run = formats[i] && formats[i] === formats[i - 1] ? run + 1 : 1;
    assert.ok(run < 3, `format ${formats[i]} runs three in a row at position ${i}`);
  }
  assert.equal(formats.slice(0, 10).filter((f) => f === 'question').length, 5, 'the format distractor: 5 of the last 10, never consecutive');
  assert.equal(formats.filter((f) => f === 'question').length, 6);
  // six of the twenty open with the same six words
  const openings = {};
  for (const r of li) openings[openingWords(r.content)] = (openings[openingWords(r.content)] || 0) + 1;
  const shared = Object.entries(openings).filter(([, n]) => n > 1);
  assert.equal(shared.length, 1);
  assert.equal(shared[0][0], 'a question for our trade customers');
  assert.equal(shared[0][1], 6);
  // the untagged tail is real: four pre-convention rows the session must classify itself
  assert.equal(li.filter((r) => !r.tags.some((t) => t.startsWith('hook:'))).length, 4);
  assert.ok(li.slice(0, 10).every((r) => r.tags.some((t) => t.startsWith('hook:'))), 'the last 10 are all tagged');
  // Facebook has fewer than 20 published posts: no variance history there
  assert.equal(publishedOn(posts, 'facebook').length, 8);
  assert.ok(publishedOn(posts, 'twitter').length === 0, 'zero X posts - the broken token');
  // every published row is in the past and the list is sorted the way the route sorts it
  for (const r of posts) assert.ok(Date.parse(r.published_at) < NOW_MS, `${r.id} is published in the past`);
});

test('social-post: the canned department reply carries exactly one banned-phrase variant and clean siblings that survive look-alikes', () => {
  const expected = loadJson('expected-findings.json');
  const b = block();
  const posts = loadJson('dataset', 'posts.json');
  assert.equal(b.version, 'social_drafts.v1');
  assert.equal(b.persona.id, 'avt_marcus_01');
  assert.ok(['Problem Aware', 'Solution Aware'].includes(b.stage));
  const variants = [...b.drafts, ...b.alternatives];
  const brand = loadJson('dataset', 'context.json').brand.ai_forbidden_phrases;
  const patterns = [...new Set([...BANNED_PHRASES, ...brand])].map(phrasePattern);
  const hits = variants.filter((v) => [v.content, v.first_comment, ...(v.hashtags || []), v.alt_text].filter(Boolean).some((t) => patterns.some((re) => re.test(t)))).map((v) => v.id);
  assert.deepEqual(hits, expected.categories.banned_phrase_hits.must);
  assert.deepEqual(hits, ['draft_li_1']);
  const banned = b.drafts.find((d) => d.id === 'draft_li_1');
  assert.match(banned.content, /\belevate\b/, 'the seed is the literal word');
  assert.ok(banned.rubric.total >= 11, 'the agent self-scored it above the gate - the second reader must catch it');
  // the look-alike: 'seams' in the Facebook draft is NOT 'seamless'
  const fb = b.drafts.find((d) => d.id === 'draft_fb_1');
  assert.match(fb.content, /\bseams\b/);
  assert.ok(!phrasePattern('seamless').test(fb.content));
  assert.ok(phrasePattern('seamless').test('a seamless handoff'));
  assert.ok(phrasePattern('elevate').test('Elevating the finish'), 'inflections count');
  assert.ok(phrasePattern('leverage').test('we leveraged it'));
  assert.ok(phrasePattern('unlock').test('this unlocks growth'));
  assert.ok(!phrasePattern('elevate').test('the elevator shaft'), 'a different word does not');
  assert.ok(phrasePattern('comment below').test('Comment   below with your answer'));
  assert.ok(!phrasePattern('comment below').test('Comment with the failure you see most'));
  assert.ok(phrasePattern('thoughts?').test('Thoughts? Let us know'));
  // one clean variant per platform the persona reads, each with the link in the first comment and no URL in the body
  const clean = b.drafts.filter((d) => !hits.includes(d.id));
  assert.deepEqual(clean.map((d) => d.platform).sort(), ['facebook', 'linkedin']);
  for (const d of clean) {
    assert.ok(!/https?:\/\//.test(d.content), `${d.id} content carries no URL`);
    assert.match(d.first_comment, /https:\/\/.*utm_medium=social/);
    assert.ok(HOOK_SLUGS.includes(d.hook_type), `${d.id} hook ${d.hook_type} is a taxonomy slug`);
    assert.ok(d.rubric.total >= 11);
    assert.equal(Object.values(d.rubric).reduce((s, v) => s + v, 0) - d.rubric.total, d.rubric.total, 'the seven axes sum to the total');
    // the clean drafts do not recycle a history opening and do not use the breached hook
    assert.ok(!posts.some((p) => openingWords(p.content) === openingWords(d.content)), `${d.id} opening is new`);
    if (d.platform === 'linkedin') assert.ok(!['question', 'unanswerable-question'].includes(d.hook_type));
  }
  // the alt text on the Facebook draft is under 125 characters and matches the library asset
  assert.ok(fb.alt_text.length <= 125);
  const media = loadJson('dataset', 'media.json');
  assert.equal(media.find((m) => m.id === fb.media_brief.library_asset_id).alt_text, fb.alt_text);
});

test('social-post: every expected id exists in the dataset; must/must_not disjoint; post_bounds resolve', () => {
  const expected = loadJson('expected-findings.json');
  const b = block();
  const known = new Set([
    ...loadJson('dataset', 'accounts.json').map((a) => a.id),
    ...loadJson('dataset', 'avatars.json').map((a) => a.id),
    ...[...b.drafts, ...b.alternatives].map((d) => d.id),
    ...['hook:question', 'hook:specific-number', 'hook:mistake', 'format:question', 'hook:unanswerable-question'],
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
  const pb = expected.post_bounds;
  const journeys = loadJson('dataset', 'journeys.json');
  const grids = loadJson('dataset', 'grids.json');
  assert.ok(journeys.some((j) => j.id === pb.journey_id));
  assert.ok(grids.some((g) => g.id === pb.grid_id && g.target_avatar_id === pb.persona_id));
  assert.equal(pb.banned_variant, 'draft_li_1');
  assert.deepEqual(pb.breached_hooks.linkedin, ['question', 'unanswerable-question']);
  assert.equal(pb.min_rubric, 11);
});

test('social-post: prompt.md names the contract and none of the answers', () => {
  const prompt = fs.readFileSync(path.join(FIX, 'prompt.md'), 'utf8');
  assert.ok(!/sacc_twitter|twitter|can_post|last_error|token_state|elevate|seamless|your tool|avt_template|avt_marcus|Marcus|hook:question|unanswerable|Primary Customer|draft_li_1|grid_harlow/i.test(prompt), 'prompt leaks a seeded answer');
  assert.match(prompt, /findings\.json/);
  assert.match(prompt, /banned_phrase_hits/);
  assert.match(prompt, /invalid_avatars/);
  assert.match(prompt, /variance_breaches/);
  assert.match(prompt, /Rubric: N\/14/);
  assert.match(prompt, /For: <avatar>/);
  assert.match(prompt, /LinkedIn, Facebook and X/);
  // ASCII only, as the whole fixture
  for (const f of ['prompt.md', 'tools.mjs', 'checks.mjs', 'expected-findings.json', ...fs.readdirSync(path.join(FIX, 'dataset')).map((d) => path.join('dataset', d))]) {
    const text = fs.readFileSync(path.join(FIX, f), 'utf8');
    assert.ok(!/[^\x00-\x7F]/.test(text), `${f} carries a non-ASCII character`);
  }
});

// -- The tools mirror the traps -------------------------------------------------------
test('social-post: tools - create is a draft, a schedule refuses, foreign ids and unknown stages 400, publish and image refuse', async () => {
  const tools = await createTools();
  const base = { content: 'Myth: the lacquer failed. Truth: the coat under it was never sanded.', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'], tags: ['persona:marcus', 'stage:problem-aware', 'hook:myth-truth', 'format:myth-truth'], avatar_id: 'avt_marcus_01', journey_id: 'cjm_trade_01', journey_stage: 'Problem Aware', before_after_grid_id: 'grid_harlow_01', pillar_id: 'pil_educate', first_comment: 'The schedule: https://brightsidefixtures.example/finish-schedule?utm_medium=social' };
  const draft = tools.social_create_post(base);
  assert.equal(draft.data.status, 'draft');
  assert.equal(draft.data.scheduled_at, null);
  assert.equal(draft.data.approval_status, 'not_required');
  assert.deepEqual(draft.validation, { errors: [], warnings: [] });
  assert.equal(draft.data.avatar_id, 'avt_marcus_01');
  assert.equal(draft.data.journey_stage, 'Problem Aware');
  // the gate: a create with a schedule is a publish on a timer
  assert.equal(tools.social_create_post({ ...base, scheduled_at: '2026-09-01T14:00:00Z' }).refused, true);
  assert.equal(tools.social_create_post({ ...base, scheduled_at_local: '2026-09-01T09:00', timezone: 'America/Chicago' }).refused, true);
  // foundation refs are account-scoped; a stage not on the journey lists the real ones
  assert.match(tools.social_create_post({ ...base, avatar_id: 'avt_nope' }).error, /avatar_id avt_nope/);
  assert.match(tools.social_create_post({ ...base, journey_stage: 'Awareness' }).error, /stages: Unaware, Problem Aware, Solution Aware, Product Aware, Most Aware/);
  assert.match(tools.social_create_post({ ...base, before_after_grid_id: 'grid_nope' }).error, /before_after_grid_id grid_nope/);
  assert.match(tools.social_create_post({ ...base, target_accounts: ['sacc_foreign'] }).error, /target_accounts not found/);
  assert.match(tools.social_create_post({ ...base, target_platforms: ['x'] }).error, /Unknown platform "x"/);
  assert.match(tools.social_create_post({ ...base, target_platforms: ['linkedin', 'facebook'], platform_overrides: { facebook: { content: 'fb', hashtags: ['#x'] } } }).error, /platform_overrides\.facebook\.hashtags is not honored/);
  assert.match(tools.social_create_post({ ...base, platform_overrides: { threads: { content: 'x' } } }).error, /unknown platform "threads"/);
  assert.match(tools.social_create_post({ ...base, media_asset_ids: ['ma_nope'] }).error, /media_asset_ids not found/);
  assert.match(tools.social_create_post({ ...base, media_urls: ['http://insecure.example/a.jpg'] }).error, /https/);
  // the brand-forbidden phrase is a WARNING on the 201, never a block - the server does not score copy
  const warned = tools.social_create_post({ ...base, content: 'Elevate the finish on a working kitchen.' });
  assert.equal(warned.data.status, 'draft');
  assert.match(warned.validation.warnings[0], /forbidden phrase "elevate"/);
  // media resolve appends after caller urls, alt text falls back to the asset's own
  const withMedia = tools.social_create_post({ ...base, target_platforms: ['facebook'], target_accounts: ['sacc_facebook_01'], media_asset_ids: ['ma_finish_room_01'] });
  assert.deepEqual(withMedia.data.media_asset_ids, ['ma_finish_room_01']);
  assert.equal(withMedia.data.media_types[0], 'image/jpeg');
  assert.match(withMedia.data.media_alt_texts[0], /320 grit/);
  assert.equal(withMedia.data.content_type, 'image');
  // publish and image generation refuse; update refuses a schedule but takes an edit
  assert.equal(tools.social_publish_post({ post_id: draft.data.id }).refused, true);
  assert.equal(tools.generate_image({ prompt: 'a door' }).refused, true);
  assert.equal(tools.social_update_post({ post_id: draft.data.id, scheduled_at: '2026-09-01T14:00:00Z' }).refused, true);
  assert.equal(tools.social_update_post({ post_id: draft.data.id, scheduled_at: null }).refused, true, 'even an unschedule is a schedule field');
  const edited = tools.social_update_post({ post_id: draft.data.id, title: 'renamed' });
  assert.equal(edited.data.title, 'renamed');
  assert.match(tools.social_update_post({ post_id: draft.data.id, journey_stage: 'Nope' }).error, /stages:/);
  assert.equal(tools.social_update_post({ post_id: 'post_li_01', title: 'nope' }).error, 'post is edit-locked once publishing');
  // created drafts show up in the listing for the rest of the run
  assert.equal(tools.social_list_posts({ status: 'draft' }).pagination.total, 3);
  assert.equal(tools.social_get_post({ post_id: draft.data.id }).data.title, 'renamed');
});

test('social-post: tools - validate reports everything at once, warns on the forbidden phrase, still says ok', async () => {
  const tools = await createTools();
  const clean = tools.social_post_validate({ content: 'Myth: the lacquer failed.', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'], first_comment: 'https://brightsidefixtures.example/x' });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.validation.errors, []);
  assert.deepEqual(clean.platforms, ['linkedin']);
  assert.equal(clean.schedule, null);
  assert.equal(clean.x_quota, undefined);
  // the trap: ok stays true with the brand-forbidden phrase in the copy; the warning names it
  const phrased = tools.social_post_validate({ content: 'If you want to elevate the finish, ask what happened between coats.', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'] });
  assert.equal(phrased.ok, true);
  assert.equal(phrased.validation.warnings.length, 1);
  assert.match(phrased.validation.warnings[0], /forbidden phrase "elevate"/);
  // a look-alike does not warn
  assert.deepEqual(tools.social_post_validate({ content: 'lifting at the seams', target_platforms: ['facebook'] }).validation.warnings, []);
  // X: quota rides along, the erroring account is named, URLs count 23
  const x = tools.social_post_validate({ content: `${'a'.repeat(260)} https://brightsidefixtures.example/a-very-long-url-that-would-otherwise-count`, target_platforms: ['twitter'], target_accounts: ['sacc_twitter_01'] });
  assert.deepEqual(x.x_quota, X_QUOTA);
  assert.match(x.validation.errors[0], /X: caption is 284 characters, over the 280 cap/);
  assert.ok(x.validation.warnings.some((w) => /sacc_twitter_01 \(twitter\) is not publishable: can_post false/.test(w)));
  assert.equal(x.ok, false);
  // everything else in one pass: unknown account, unknown override key, missing asset, past schedule, Instagram without media
  const many = tools.social_post_validate({ content: 'x', target_platforms: ['instagram'], target_accounts: ['sacc_foreign'], platform_overrides: { instagram: { content: 'y', emoji: true } }, media_asset_ids: ['ma_nope'], scheduled_at: '2026-08-01T14:00:00Z' });
  assert.equal(many.ok, false);
  assert.ok(many.validation.errors.some((e) => /target_accounts not found on this account: sacc_foreign/.test(e)));
  assert.ok(many.validation.errors.some((e) => /platform_overrides\.instagram\.emoji/.test(e)));
  assert.ok(many.validation.errors.some((e) => /media_asset_ids not found/.test(e)));
  assert.ok(many.validation.errors.some((e) => /scheduled_at is in the past/.test(e)));
  assert.ok(many.validation.errors.some((e) => /Instagram: at least one image or video is required/.test(e)));
  assert.deepEqual(many.media.missing, ['ma_nope']);
  assert.equal(many.schedule.in_past, true);
  assert.match(tools.social_post_validate({ content: 'x' }).validation.errors[0], /No platform to validate against/);
  assert.match(tools.social_post_validate({}).error, /content is required/);
  // Facebook with media: link_url is dropped, the warning says where the link goes
  const fbMedia = tools.social_post_validate({ content: 'x', target_platforms: ['facebook'], media_asset_ids: ['ma_finish_room_01'], link_url: 'https://brightsidefixtures.example/x' });
  assert.ok(fbMedia.validation.warnings.some((w) => /Facebook: link_url is dropped when the post carries media/.test(w)));
  assert.equal(fbMedia.media.resolved[0].id, 'ma_finish_room_01');
  assert.equal(fbMedia.media.fit[0].verdict, 'ok');
});

test('social-post: tools - preview shows the fold per platform, overrides win, links resolve by adapter', async () => {
  const tools = await createTools();
  const long = 'Myth: the lacquer failed. Truth: the coat under it was never sanded. '.repeat(4);
  const created = tools.social_create_post({
    content: long,
    target_platforms: ['linkedin', 'facebook'],
    target_accounts: ['sacc_linkedin_01', 'sacc_facebook_01'],
    platform_overrides: { facebook: { content: 'We used to skip the sand between coats. #BrightsideBuilt', firstComment: 'The schedule: https://brightsidefixtures.example/finish-schedule' } },
    first_comment: 'Coat by coat: https://brightsidefixtures.example/finish-schedule',
    media_asset_ids: ['ma_finish_room_01'],
    tags: ['persona:marcus', 'stage:problem-aware', 'hook:myth-truth', 'format:myth-truth'],
    avatar_id: 'avt_marcus_01',
  });
  const preview = tools.social_post_preview({ post_id: created.data.id });
  assert.deepEqual(preview.data.platforms.map((p) => p.platform), ['linkedin', 'facebook']);
  const [li, fb] = preview.data.platforms;
  assert.equal(li.content_source, 'shared');
  assert.equal(li.above_the_fold.limit, 210);
  assert.equal(li.above_the_fold.truncated, true);
  assert.equal(li.above_the_fold.text.length, 210);
  assert.equal(li.first_comment_source, 'shared');
  assert.equal(li.link_handling.strategy, 'first_comment');
  assert.equal(li.char_count.max, 3000);
  assert.equal(fb.content_source, 'override');
  assert.equal(fb.first_comment_source, 'override');
  assert.equal(fb.above_the_fold.limit, 125);
  assert.equal(fb.hashtags.count, 1);
  assert.equal(fb.media_composition.images, 1);
  assert.equal(fb.media_composition.alt_text_missing, 0);
  assert.equal(fb.link_handling.strategy, 'first_comment');
  assert.equal(fb.accounts[0].publishable, true);
  assert.equal(preview.data.shared.media_count, 1);
  assert.deepEqual(preview.data.unresolved_target_accounts, []);
  assert.equal(preview.data.post.status, 'draft');
  assert.equal(tools.social_post_preview({ post_id: 'nope' }).error, 'Post not found');
  // a published history row previews too, with its account marked
  const hist = tools.social_post_preview({ post_id: 'post_fb_01' });
  assert.equal(hist.data.platforms[0].link_handling.strategy, 'first_comment');
  assert.equal(hist.data.platforms[0].accounts[0].id, 'sacc_facebook_01');
});

test('social-post: tools - reads behave like the routes (avatars, journeys, grids, KB, media, history, department)', async () => {
  const tools = await createTools();
  assert.equal(tools.customer_avatar_get({ id: 'avt_marcus_01' }).data.online_behavior.social_platforms.length, 2);
  assert.equal(tools.customer_avatar_get({ avatar_id: 'avt_marcus_01' }).data.name, 'Marcus', 'the alias works');
  assert.equal(tools.customer_avatar_get({ id: 'nope' }).error, 'Customer avatar not found');
  assert.equal(tools.customer_avatar_list({ search: 'contractor' }).data[0].id, 'avt_marcus_01');
  assert.equal(tools.customer_journey_list({}).pagination.total, 1);
  assert.deepEqual(tools.customer_journey_get({ id: 'cjm_trade_01' }).data.stages.map((s) => s.name), ['Unaware', 'Problem Aware', 'Solution Aware', 'Product Aware', 'Most Aware']);
  assert.equal(tools.before_after_grid_list({ target_avatar_id: 'avt_marcus_01' }).pagination.total, 1);
  assert.equal(tools.before_after_grid_list({ target_avatar_id: 'avt_template_01' }).pagination.total, 0, 'the boilerplate avatar has no grid');
  const grid = tools.before_after_grid_get({ grid_id: 'grid_harlow_01' }).data;
  assert.ok(grid.measurable_results.some((r) => /41 doors/.test(r)));
  assert.ok(grid.measurable_results.some((r) => /Zero call-backs at the 18-month check/.test(r)));
  assert.equal(grid.grid_items[0].before.images[0].url, 'https://cdn.fixture.invalid/grids/harlow-before.jpg', 'the real before photo exists; none is generated');
  // KB: the finish-schedule page ranks first for the brief; the internal lead-time page only answers a lead-time query
  const kb = tools.kb_search({ query: 'why we sand between coats' });
  assert.equal(kb.data[0].id, 'kbdoc_finish_schedule_01');
  assert.equal(kb.data[0].knowledgeBaseName, 'Brightside shop handbook');
  assert.match(kb.data[0].content, /312 doors/);
  assert.ok(!kb.data.some((d) => d.id === 'kbdoc_lead_times_01'));
  assert.equal(tools.kb_search({ query: 'lead time' }).data[0].id, 'kbdoc_lead_times_01');
  assert.match(tools.kb_search({ query: 'lead time' }).data[0].title, /never quote publicly/);
  assert.equal(tools.kb_search({ query: 'quantum' }).count, 0, 'an empty data means no passage');
  assert.match(tools.kb_search({}).error, /query is required/);
  assert.deepEqual(tools.kb_search({ query: 'brass', kb_id: 'kb_nope' }).warnings, ['Skipped unknown KB IDs: kb_nope']);
  // media: search reads title/filename/alt, tags is comma-separated any-match, update REPLACES tags
  assert.equal(tools.media_library_list({ search: 'finish room' }).pagination.total, 1);
  assert.equal(tools.media_library_list({ tags: 'creative-studio' }).data[0].id, 'ma_quote_card_dana_01');
  assert.equal(tools.media_library_list({ tags: 'harlow-street,shop' }).pagination.total, 3);
  assert.equal(tools.media_library_list({ ai_generated: true }).pagination.total, 0);
  assert.equal(tools.media_library_get({ asset_id: 'ma_finish_room_01' }).data.width, 1600);
  assert.equal(tools.media_library_get({ asset_id: 'nope' }).error, 'Media asset not found');
  const upd = tools.media_update({ asset_id: 'ma_finish_room_01', tags: ['shop', 'finish-room', 'social:finish-schedule'] });
  assert.deepEqual(upd.data.tags, ['shop', 'finish-room', 'social:finish-schedule']);
  assert.equal(tools.media_update({ asset_id: 'nope', alt_text: 'x' }).error, 'Media asset not found');
  // history: platform is a contains-filter, status is the audience's view, limit caps at 100, sorted by created_at
  const li = tools.social_list_posts({ platform: 'linkedin', status: 'published', limit: 20 });
  assert.equal(li.pagination.total, 20);
  assert.equal(li.data.length, 20);
  assert.equal(li.data[0].id, 'post_li_01');
  assert.ok('first_comment' in li.data[0] && 'avatar_id' in li.data[0]);
  assert.equal(tools.social_list_posts({ platform: 'facebook', status: 'published', limit: 20 }).pagination.total, 8);
  assert.equal(tools.social_list_posts({ platform: 'twitter', status: 'published' }).pagination.total, 0);
  assert.equal(tools.social_list_posts({ avatar_id: 'avt_marcus_01' }).pagination.total, 24);
  assert.equal(tools.social_list_posts({}).pagination.limit, 30);
  assert.equal(tools.social_list_posts({ limit: 999 }).pagination.limit, 100);
  // testimonials: the public row is the only name that may appear
  assert.equal(tools.marketing_testimonials_list({ status: 'approved' }).total, 2);
  assert.equal(tools.marketing_testimonials_list({ status: 'approved', is_public: true }).data[0].author.name, 'Dana Whitfield');
  // department: the fenced block parses; only social answers
  const dept = tools.talk_to_department({ domain: 'social', message: 'one post for Marcus' });
  const m = dept.response.match(/```json social_drafts\.v1\n([\s\S]*?)\n```/);
  assert.ok(m, 'the reply ends in the fenced social_drafts.v1 block');
  const parsed = JSON.parse(m[1]);
  assert.equal(parsed.drafts.length, 3);
  assert.equal(dept.session_id, 'sess_fixture_social_post_1');
  assert.ok(tools.talk_to_department({ domain: 'seo', message: 'x' }).error);
  assert.equal(tools.memory_list({ domain: 'social' }).entries.length, 1);
  assert.equal(tools.pm_projects_list({}).projects[0].id, 'proj_fixture_ops');
  assert.match(tools.pm_tasks_create({ title: 'x' }).error, /project_id and title/);
  assert.equal(tools.social_calendar_create({ title: 't', event_type: 'planned_post', start_date: '2026-08-31T14:00:00Z', start_time: '09:00' }).data.start_date, '2026-08-31');
  assert.equal(tools.account_context_get({ domain: 'social', include: 'grids,social' }).grids.length, 1);
  assert.equal(tools.account_context_get({ domain: 'social', include: 'social' }).social.accounts.length, 4);
});

// -- The transcript hook, over a synthetic run built from the fixture's own tools ----
const LINK_LI = 'https://brightsidefixtures.example/finish-schedule?utm_source=linkedin&utm_medium=social';
const LINK_FB = 'https://brightsidefixtures.example/finish-schedule?utm_source=facebook&utm_medium=social';

async function syntheticRun({
  liContent, fbContent, fbFirstComment, liTags, fbTags, memoryContent, extraCalls = [], dropTools = [], reorder, includeValidate = true, includePreview = true, tasks = 2, fbPlatforms, fbAccounts, fbOverrides, liAvatar,
} = {}) {
  const tools = await createTools();
  const b = block();
  const li2 = b.drafts.find((d) => d.id === 'draft_li_2');
  const fb1 = b.drafts.find((d) => d.id === 'draft_fb_1');
  const prior = tools.memory_list({ domain: 'social' }).entries[0].content;
  const dir = tmpDir();
  const lines = [];
  const results = {};
  const call = (tool, input = {}) => {
    if (dropTools.includes(tool)) return null;
    const result = tools[tool](input);
    lines.push(JSON.stringify({ ts: NOW, tool, input, result }));
    return result;
  };
  call('account_context_get', { domain: 'social' });
  call('social_list_accounts', {});
  call('social_pillar_list', {});
  call('customer_avatar_list', {});
  call('customer_avatar_get', { id: 'avt_template_01' });
  call('customer_avatar_get', { id: 'avt_marcus_01' });
  call('customer_journey_list', {});
  call('customer_journey_get', { id: 'cjm_trade_01' });
  call('before_after_grid_list', { target_avatar_id: 'avt_marcus_01' });
  call('before_after_grid_get', { id: 'grid_harlow_01' });
  call('kb_search', { query: 'why we sand between coats' });
  call('marketing_testimonials_list', { status: 'approved' });
  call('social_list_posts', { platform: 'linkedin', status: 'published', limit: 20 });
  call('social_list_posts', { platform: 'facebook', status: 'published', limit: 20 });
  call('talk_to_department', { domain: 'social', message: 'One post for Marcus (avt_marcus_01), Problem Aware, Educate, proof kbdoc_finish_schedule_01 and grid_harlow_01, LinkedIn and Facebook variants, links in the first comment.' });
  const liBody = {
    title: 'Myth: the lacquer failed',
    content: liContent ?? li2.content,
    target_platforms: ['linkedin'],
    target_accounts: ['sacc_linkedin_01'],
    first_comment: li2.first_comment,
    pillar_id: 'pil_educate',
    tags: liTags ?? ['persona:marcus', 'stage:problem-aware', 'hook:myth-truth', 'format:myth-truth'],
    avatar_id: liAvatar ?? 'avt_marcus_01',
    journey_id: 'cjm_trade_01',
    journey_stage: 'Problem Aware',
    before_after_grid_id: 'grid_harlow_01',
  };
  const fbBody = {
    title: 'We used to skip the sand between coats',
    content: fbContent ?? fb1.content,
    target_platforms: fbPlatforms ?? ['facebook'],
    target_accounts: fbAccounts ?? ['sacc_facebook_01'],
    ...(fbOverrides ? { platform_overrides: fbOverrides } : {}),
    first_comment: fbFirstComment === undefined ? fb1.first_comment : fbFirstComment,
    pillar_id: 'pil_educate',
    tags: fbTags ?? ['persona:marcus', 'stage:problem-aware', 'hook:mistake', 'format:story'],
    avatar_id: 'avt_marcus_01',
    journey_id: 'cjm_trade_01',
    journey_stage: 'Problem Aware',
    before_after_grid_id: 'grid_harlow_01',
    media_asset_ids: ['ma_finish_room_01'],
    media_alt_texts: [fb1.alt_text],
  };
  if (includeValidate) {
    call('social_post_validate', { content: liBody.content, target_platforms: liBody.target_platforms, target_accounts: liBody.target_accounts, first_comment: liBody.first_comment });
    call('social_post_validate', { content: fbBody.content, target_platforms: fbBody.target_platforms, target_accounts: fbBody.target_accounts, first_comment: fbBody.first_comment, media_asset_ids: fbBody.media_asset_ids });
  }
  call('media_library_list', { search: 'finish room' });
  call('media_library_get', { asset_id: 'ma_finish_room_01' });
  call('pm_projects_list', {});
  const taskTitles = ['Reconnect X (sacc_twitter_01): token expired 2026-08-26, no post until fixed', 'Rewrite the boilerplate avatar avt_template_01 (template text: your tool, [Company])'];
  for (let i = 0; i < tasks; i += 1) call('pm_tasks_create', { project_id: 'proj_fixture_ops', title: taskTitles[i] || `Task ${i + 1}` });
  results.li = call('social_create_post', liBody);
  results.fb = call('social_create_post', fbBody);
  if (includePreview) {
    if (results.li?.data) call('social_post_preview', { post_id: results.li.data.id });
    if (results.fb?.data) call('social_post_preview', { post_id: results.fb.data.id });
  }
  call('media_update', { asset_id: 'ma_finish_room_01', alt_text: fb1.alt_text, tags: ['shop', 'finish-room', 'social:finish-schedule'] });
  if (results.li?.data) call('social_calendar_create', { title: 'Finish schedule post - LinkedIn', event_type: 'planned_post', start_date: '2026-09-01', start_time: '06:30', target_platforms: ['linkedin'], linked_post_id: results.li.data.id });
  call('memory_list', { domain: 'social' });
  call('memory_update', { memory_id: 'mem_social_1', content: memoryContent ?? `${prior}\n2026-08-29: finish-schedule post for marcus at problem-aware (myth-truth on LinkedIn, mistake on Facebook); hook:question is over the cap on LinkedIn - avoid it until October; avt_template_01 is boilerplate, task filed.` });
  for (const extra of extraCalls) lines.push(JSON.stringify(extra));
  if (typeof reorder === 'function') reorder(lines);
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), `${lines.join('\n')}\n`);
  const transcript = loadTranscript(path.join(dir, 'transcript.jsonl'));
  const liId = results.li?.data?.id;
  const fbId = results.fb?.data?.id;
  const findings = {
    categories: { banned_phrase_hits: ['draft_li_1'], invalid_avatars: ['avt_template_01'], variance_breaches: ['hook:question'] },
    drafts: [
      ...(liId ? [{ platform: 'linkedin', persona: 'Marcus', stage: 'problem-aware', hook_type: 'myth-truth', rubric_total: 13, post_id: liId }] : []),
      ...(fbId ? [{ platform: (fbPlatforms || ['facebook'])[0], persona: 'Marcus', stage: 'problem-aware', hook_type: 'mistake', rubric_total: 12, post_id: fbId }] : []),
    ],
  };
  const report = [
    '# One post - Brightside Fixtures - why we sand between coats',
    '',
    'Drafts only: two posts created with no scheduled_at, nothing published, nothing generated.',
    '',
    '## Who it is for',
    'The brief said the trade contractor. customer_avatar_list returned two rows; avt_template_01 ("Primary Customer") is boilerplate ("your tool", "[Company]") and cannot be drafted for - a task is filed. avt_marcus_01 (Marcus) is valid; his online_behavior.social_platforms is linkedin and facebook, so the X the brief named gets no post for him, and sacc_twitter_01 cannot post anyway (can_post false, token expired 2026-08-26) - reconnect task filed.',
    '',
    '## Variance read',
    'LinkedIn, last 10 of 20 by published_at: hook:question 5 (cap 2) - a breach, avoided; specific-number 2 (at the cap); six of the twenty open with the same six words. Facebook has 8 published posts - no variance history, said plainly.',
    '',
    '## LinkedIn',
    'For: Marcus | Stage: Problem Aware | Pillar: Educate | Hook: myth-truth | Format: myth-truth | CTA: save',
    'Rubric: 13/14 (specificity 2, one-idea 2, proof 2, voice 2, native 2, hook 2, cta 1)',
    'cta 1: "ask your shop" and "save this" are two verbs.',
    '```',
    li2.content,
    '```',
    '',
    '## Facebook',
    'For: Marcus | Stage: Problem Aware | Pillar: Educate | Hook: mistake | Format: story | CTA: comment',
    'Rubric: 12/14 (specificity 2, one-idea 2, proof 2, voice 2, native 2, hook 1, cta 1)',
    'hook 1: the specific (4 doors) lands in sentence two.',
    '```',
    fb1.content,
    '```',
    '',
    '## Held back',
    'draft_li_1 (contrarian): "elevate" is on brand.ai_forbidden_phrases - hard fail whatever the total. Rubric: 12/14 (specificity 2, one-idea 2, proof 2, voice 1, native 2, hook 2, cta 1) - not persisted.',
    '',
    `## Filed\nPosts ${liId || '-'} and ${fbId || '-'} as drafts; two PM tasks; calendar event for Monday 06:30 America/Chicago (schedules nothing); memory appended.`,
  ].join('\n');
  return { dir, tools, transcript, findings, report, liId, fbId };
}

const findingsCheck = (findingsPath) =>
  spawnSync(process.execPath, [path.join(EVALS, 'checkers', 'findings-check.mjs'), '--expected', path.join(FIX, 'expected-findings.json'), '--actual', findingsPath], { encoding: 'utf8' });

test('social-post: the hook PASSES a clean synthetic run, and the answer key grades its sidecar clean', async () => {
  const { dir, transcript, findings, report } = await syntheticRun();
  const problems = checks(transcript, { run: dir, report, findings });
  assert.deepEqual(problems, []);
  assert.equal(countCalls(transcript, 'social_create_post'), 2);
  assert.equal(findings.drafts.length, 2);
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
});

test('social-post: the hook FAILS a scheduled "draft", a publish call, a generate_image call, a scheduling update', async () => {
  const clean = await syntheticRun();
  const scheduled = { ts: NOW, tool: 'social_create_post', input: { content: 'x', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'], scheduled_at: '2026-09-01T14:00:00Z', tags: ['persona:marcus', 'stage:problem-aware', 'hook:myth-truth', 'format:pov'], avatar_id: 'avt_marcus_01' }, result: { refused: true, tool: 'social_create_post' } };
  const p1 = checks(clean.transcript.concat(loadFrom([scheduled])), { run: clean.dir, report: clean.report, findings: clean.findings });
  assert.ok(hasProblem(p1, 'drafts omit scheduled_at'), p1.join('\n'));
  const published = await syntheticRun({ extraCalls: [{ ts: NOW, tool: 'social_publish_post', input: { post_id: 'post_new_1' }, result: { refused: true, tool: 'social_publish_post' } }] });
  const p2 = checks(published.transcript, { run: published.dir, report: published.report, findings: published.findings });
  assert.equal(p2.length, 1, p2.join('\n'));
  assert.match(p2[0], /social_publish_post never called: social_publish_post was called \(transcript index \d+\)/);
  const imaged = await syntheticRun({ extraCalls: [{ ts: NOW, tool: 'generate_image', input: { prompt: 'a door' }, result: { refused: true, tool: 'generate_image' } }] });
  const p3 = checks(imaged.transcript, { run: imaged.dir, report: imaged.report, findings: imaged.findings });
  assert.equal(p3.length, 1, p3.join('\n'));
  assert.match(p3[0], /generate_image never called/);
  const rescheduled = await syntheticRun({ extraCalls: [{ ts: NOW, tool: 'social_update_post', input: { post_id: 'post_new_1', scheduled_at: '2026-09-01T14:00:00Z' }, result: { refused: true, tool: 'social_update_post' } }] });
  const p4 = checks(rescheduled.transcript, { run: rescheduled.dir, report: rescheduled.report, findings: rescheduled.findings });
  assert.ok(hasProblem(p4, 'social_update_post never schedules'), p4.join('\n'));
  // a content-only update is fine
  const edited = await syntheticRun({ extraCalls: [{ ts: NOW, tool: 'social_update_post', input: { post_id: 'post_new_1', title: 'tightened' }, result: { data: { id: 'post_new_1' } } }] });
  assert.deepEqual(checks(edited.transcript, { run: edited.dir, report: edited.report, findings: edited.findings }), []);
});

/** Parse raw records the way loadTranscript would, for appending to a parsed transcript. */
function loadFrom(records) {
  const file = path.join(tmpDir(), 'transcript.jsonl');
  fs.writeFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return loadTranscript(file);
}

test('social-post: the hook FAILS a draft aimed at X, at no account, at a platform the persona does not read, or with mismatched platforms', async () => {
  const aimedAtX = await syntheticRun({ fbPlatforms: ['twitter'], fbAccounts: ['sacc_twitter_01'] });
  const p1 = checks(aimedAtX.transcript, { run: aimedAtX.dir, report: aimedAtX.report, findings: aimedAtX.findings });
  assert.ok(hasProblem(p1, 'drafts target healthy accounts only', 'sacc_twitter_01'), p1.join('\n'));
  assert.ok(hasProblem(p1, 'drafts aim only at the persona'), p1.join('\n'));
  assert.ok(hasProblem(p1, 'facebook link lives in first_comment', 'no Facebook draft'), p1.join('\n'));
  const noAccount = await syntheticRun({ fbAccounts: [] });
  const p2 = checks(noAccount.transcript, { run: noAccount.dir, report: noAccount.report, findings: noAccount.findings });
  assert.ok(hasProblem(p2, 'drafts target healthy accounts only'), p2.join('\n'));
  // Instagram is healthy but Marcus does not read it
  const insta = await syntheticRun({ fbPlatforms: ['instagram'], fbAccounts: ['sacc_instagram_01'] });
  const p3 = checks(insta.transcript, { run: insta.dir, report: insta.report, findings: insta.findings });
  assert.ok(hasProblem(p3, 'drafts aim only at the persona', 'instagram'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'drafts rows are well-formed', 'not one the persona reads'), p3.join('\n'));
  // two platforms with no overrides fails; keyed overrides pass; an override for a platform not targeted fails
  const twoNoOverride = await syntheticRun({ fbPlatforms: ['facebook', 'linkedin'], fbAccounts: ['sacc_facebook_01', 'sacc_linkedin_01'] });
  const p4 = checks(twoNoOverride.transcript, { run: twoNoOverride.dir, report: twoNoOverride.report, findings: twoNoOverride.findings });
  assert.ok(hasProblem(p4, 'one platform per draft'), p4.join('\n'));
  const b = block();
  const li2 = b.drafts.find((d) => d.id === 'draft_li_2');
  const twoKeyed = await syntheticRun({ fbPlatforms: ['facebook', 'linkedin'], fbAccounts: ['sacc_facebook_01', 'sacc_linkedin_01'], fbOverrides: { linkedin: { content: li2.content, firstComment: li2.first_comment } } });
  const p5 = checks(twoKeyed.transcript, { run: twoKeyed.dir, report: twoKeyed.report, findings: twoKeyed.findings });
  assert.ok(!hasProblem(p5, 'one platform per draft'), p5.join('\n'));
  const strayKey = await syntheticRun({ fbPlatforms: ['facebook', 'linkedin'], fbAccounts: ['sacc_facebook_01', 'sacc_linkedin_01'], fbOverrides: { twitter: { content: 'x' } } });
  const p6 = checks(strayKey.transcript, { run: strayKey.dir, report: strayKey.report, findings: strayKey.findings });
  assert.ok(hasProblem(p6, 'one platform per draft'), p6.join('\n'));
  // the account/platform mismatch is caught even when both are healthy
  const mismatch = await syntheticRun({ fbPlatforms: ['facebook'], fbAccounts: ['sacc_linkedin_01'] });
  const p7 = checks(mismatch.transcript, { run: mismatch.dir, report: mismatch.report, findings: mismatch.findings });
  assert.ok(hasProblem(p7, 'one platform per draft'), p7.join('\n'));
});

test('social-post: the hook FAILS a banned or brand-forbidden phrase in any copy field, inflections included, look-alikes excluded', async () => {
  const b = block();
  const banned = b.drafts.find((d) => d.id === 'draft_li_1');
  const withElevate = await syntheticRun({ liContent: banned.content });
  const p1 = checks(withElevate.transcript, { run: withElevate.dir, report: withElevate.report, findings: withElevate.findings });
  assert.ok(hasProblem(p1, 'no banned phrase in persisted copy', '"elevate" in content'), p1.join('\n'));
  const inflected = await syntheticRun({ fbContent: 'We Leveraged a scuff pass on every coat and the doors held.' });
  const p2 = checks(inflected.transcript, { run: inflected.dir, report: inflected.report, findings: inflected.findings });
  assert.ok(hasProblem(p2, 'no banned phrase in persisted copy', '"leverage"'), p2.join('\n'));
  const inComment = await syntheticRun({ fbFirstComment: `Seamless handoff, coat by coat: ${LINK_FB}` });
  const p3 = checks(inComment.transcript, { run: inComment.dir, report: inComment.report, findings: inComment.findings });
  assert.ok(hasProblem(p3, 'no banned phrase in persisted copy', 'first_comment'), p3.join('\n'));
  const inHashtag = await syntheticRun({ fbTags: ['persona:marcus', 'stage:problem-aware', 'hook:mistake', 'format:story', '#GameChanger'] });
  const p4 = checks(inHashtag.transcript, { run: inHashtag.dir, report: inHashtag.report, findings: inHashtag.findings });
  assert.ok(hasProblem(p4, 'no banned phrase in persisted copy', 'tags'), p4.join('\n'));
  // the look-alike survives: 'seams' is in the clean Facebook draft and the clean run passed
  assert.equal(bannedHit({ content: 'lifting at the seams; the elevator was out' }), null);
  assert.deepEqual(bannedHit({ content: 'Ready to level up?' }), { field: 'content', phrase: 'ready to level up' });
  assert.deepEqual(bannedHit({ media_alt_texts: ['A robust door'] }), { field: 'media_alt_texts[0]', phrase: 'robust' });
});

test('social-post: the hook FAILS missing foundation tags, a wrong avatar, a recycled opening, and a breached hook', async () => {
  const noStage = await syntheticRun({ liTags: ['persona:marcus', 'hook:myth-truth', 'format:myth-truth'] });
  const p1 = checks(noStage.transcript, { run: noStage.dir, report: noStage.report, findings: noStage.findings });
  assert.ok(hasProblem(p1, 'tags carry persona, stage, hook and format'), p1.join('\n'));
  const badStage = await syntheticRun({ liTags: ['persona:marcus', 'stage:aware', 'hook:myth-truth', 'format:myth-truth'] });
  const p2 = checks(badStage.transcript, { run: badStage.dir, report: badStage.report, findings: badStage.findings });
  assert.ok(hasProblem(p2, 'tags carry persona, stage, hook and format'), p2.join('\n'));
  const wrongAvatar = await syntheticRun({ liAvatar: 'avt_template_01' });
  const p3 = checks(wrongAvatar.transcript, { run: wrongAvatar.dir, report: wrongAvatar.report, findings: wrongAvatar.findings });
  assert.ok(hasProblem(p3, 'foundation ids persisted on the row'), p3.join('\n'));
  const recycled = await syntheticRun({ liContent: 'A question for our trade customers: what happens between coats? The 320 pass is the answer.' });
  const p4 = checks(recycled.transcript, { run: recycled.dir, report: recycled.report, findings: recycled.findings });
  assert.ok(hasProblem(p4, 'LinkedIn opening differs from every history opening', 'a question for our trade customers'), p4.join('\n'));
  const breached = await syntheticRun({ liTags: ['persona:marcus', 'stage:problem-aware', 'hook:question', 'format:question'] });
  const p5 = checks(breached.transcript, { run: breached.dir, report: breached.report, findings: breached.findings });
  assert.ok(hasProblem(p5, 'hook not a breached pattern', 'hook:question on linkedin'), p5.join('\n'));
  // the sidecar side of the same breach: both the cap and the disagreement with the row's tag surface in one line
  const sidecar = await syntheticRun();
  sidecar.findings.drafts[0].hook_type = 'unanswerable-question';
  const p6 = checks(sidecar.transcript, { run: sidecar.dir, report: sidecar.report, findings: sidecar.findings });
  assert.ok(hasProblem(p6, 'drafts rows are well-formed', 'over the 2-of-10 cap'), p6.join('\n'));
  assert.ok(hasProblem(p6, 'drafts rows are well-formed', 'is tagged hook:myth-truth'), p6.join('\n'));
  // the hashtag form of a banned phrase counts, hyphen or not
  assert.ok(phrasePattern('game-changer').test('#GameChanger'));
  assert.ok(phrasePattern('game-changer').test('a game changer for the shop'));
});

test('social-post: the hook FAILS a Facebook link in the body, a missing first-comment link, and a dark required platform', async () => {
  const b = block();
  const fb1 = b.drafts.find((d) => d.id === 'draft_fb_1');
  const linkInBody = await syntheticRun({ fbContent: `${fb1.content} ${LINK_FB}` });
  const p1 = checks(linkInBody.transcript, { run: linkInBody.dir, report: linkInBody.report, findings: linkInBody.findings });
  assert.ok(hasProblem(p1, 'facebook link lives in first_comment', 'carries a URL'), p1.join('\n'));
  const noLink = await syntheticRun({ fbFirstComment: 'The finish schedule is on our site.' });
  const p2 = checks(noLink.transcript, { run: noLink.dir, report: noLink.report, findings: noLink.findings });
  assert.ok(hasProblem(p2, 'facebook link lives in first_comment', 'carries no link'), p2.join('\n'));
  // drop the Facebook create entirely: the required platform is dark and the sidecar rows no longer match
  const dark = await syntheticRun({ reorder: (lines) => {
    const idx = lines.findIndex((l) => l.includes('"tool":"social_create_post"') && l.includes('"target_platforms":["facebook"]'));
    lines.splice(idx, 1);
  } });
  const p3 = checks(dark.transcript, { run: dark.dir, report: dark.report, findings: dark.findings });
  assert.ok(hasProblem(p3, 'every required platform gets a draft', 'facebook'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'drafts rows equal the posts actually created'), p3.join('\n'));
});

test('social-post: the hook FAILS a rubric under the gate, a malformed rubric, a missing header, and a report that hides the exclusions', async () => {
  const clean = await syntheticRun();
  const low = clean.report.replace('Rubric: 12/14 (specificity 2, one-idea 2, proof 2, voice 2, native 2, hook 1, cta 1)', 'Rubric: 10/14 (specificity 2, one-idea 2, proof 1, voice 2, native 1, hook 1, cta 1)').replace('Rubric: 12/14 (specificity 2, one-idea 2, proof 2, voice 1, native 2, hook 2, cta 1)', 'Rubric: 9/14 (specificity 1, one-idea 2, proof 1, voice 1, native 2, hook 1, cta 1)');
  const p1 = checks(clean.transcript, { run: clean.dir, report: low, findings: clean.findings });
  assert.ok(hasProblem(p1, 'rubric line >= 11 per persisted draft', '1 rubric line(s) at or above 11/14 for 2 persisted draft(s)'), p1.join('\n'));
  const badSum = clean.report.replace('Rubric: 13/14 (specificity 2, one-idea 2, proof 2, voice 2, native 2, hook 2, cta 1)', 'Rubric: 13/14 (specificity 2, one-idea 2, proof 2, voice 2, native 2, hook 2, cta 2)');
  const p2 = checks(clean.transcript, { run: clean.dir, report: badSum, findings: clean.findings });
  assert.ok(hasProblem(p2, 'rubric line >= 11 per persisted draft', 'sum to 14, not 13'), p2.join('\n'));
  const paraphrased = clean.report.replace(/Rubric: 13\/14 \([^)]*\)/, 'Rubric: 13/14 (spec 2, idea 2, proof 2, voice 2, native 2, hook 2, cta 1)');
  const p3 = checks(clean.transcript, { run: clean.dir, report: paraphrased, findings: clean.findings });
  assert.ok(hasProblem(p3, 'rubric line >= 11 per persisted draft', 'does not name exactly the seven axes'), p3.join('\n'));
  const noHeader = clean.report.replace('For: Marcus | Stage: Problem Aware | Pillar: Educate | Hook: mistake | Format: story | CTA: comment', 'For: general audience');
  const p4 = checks(clean.transcript, { run: clean.dir, report: noHeader, findings: clean.findings });
  assert.ok(hasProblem(p4, 'header line per persisted draft', '1 header line(s)'), p4.join('\n'));
  const anonymous = clean.report.replace(/Marcus \| Stage/g, 'general audience | Stage');
  const p5 = checks(clean.transcript, { run: clean.dir, report: anonymous, findings: clean.findings });
  assert.ok(hasProblem(p5, 'header line per persisted draft', 'general audience'), p5.join('\n'));
  const hidden = clean.report.replace(/sacc_twitter_01/g, 'the X account').replace(/avt_template_01/g, 'the other avatar');
  const p6 = checks(clean.transcript, { run: clean.dir, report: hidden, findings: clean.findings });
  assert.ok(hasProblem(p6, 'report names the excluded account and the invalid avatar', 'sacc_twitter_01'), p6.join('\n'));
  // parseRubricLines is the exact-format reader social-audit relies on
  const parsed = parseRubricLines('Rubric: 12/14 (specificity 2, one-idea 2, proof 2, voice 1, native 2, hook 2, cta 1)');
  assert.equal(parsed.lines[0].total, 12);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(STAGE_SLUGS, ['unaware', 'problem-aware', 'solution-aware', 'product-aware', 'most-aware']);
  assert.equal(HOOK_SLUGS.length, 16);
});

test('social-post: the hook FAILS a late context read, an unread persona row, a skipped dry run or preview, no task, and a dropped memory', async () => {
  const late = await syntheticRun({ reorder: (lines) => { const ctx = lines.shift(); lines.push(ctx); } });
  const p1 = checks(late.transcript, { run: late.dir, report: late.report, findings: late.findings });
  assert.ok(hasProblem(p1, 'context loaded before drafting'), p1.join('\n'));
  const noPersona = await syntheticRun({ reorder: (lines) => {
    const idx = lines.findIndex((l) => l.includes('"tool":"customer_avatar_get"') && l.includes('avt_marcus_01'));
    lines.splice(idx, 1);
  } });
  const p2 = checks(noPersona.transcript, { run: noPersona.dir, report: noPersona.report, findings: noPersona.findings });
  assert.ok(hasProblem(p2, 'persona full row read before drafting', 'never called'), p2.join('\n'));
  const noHistory = await syntheticRun({ reorder: (lines) => {
    const idx = lines.findIndex((l) => l.includes('"tool":"social_list_posts"') && l.includes('"platform":"facebook"'));
    lines.splice(idx, 1);
  } });
  const p3 = checks(noHistory.transcript, { run: noHistory.dir, report: noHistory.report, findings: noHistory.findings });
  assert.ok(hasProblem(p3, 'variance history read per target platform', 'facebook'), p3.join('\n'));
  const noValidate = await syntheticRun({ includeValidate: false });
  const p4 = checks(noValidate.transcript, { run: noValidate.dir, report: noValidate.report, findings: noValidate.findings });
  assert.ok(hasProblem(p4, 'validate before create, preview after', 'social_post_validate was never called'), p4.join('\n'));
  const noPreview = await syntheticRun({ includePreview: false });
  const p5 = checks(noPreview.transcript, { run: noPreview.dir, report: noPreview.report, findings: noPreview.findings });
  assert.ok(hasProblem(p5, 'validate before create, preview after', 'social_post_preview was never called'), p5.join('\n'));
  const noTask = await syntheticRun({ tasks: 0 });
  const p6 = checks(noTask.transcript, { run: noTask.dir, report: noTask.report, findings: noTask.findings });
  assert.ok(hasProblem(p6, 'a task is filed'), p6.join('\n'));
  const dropped = await syntheticRun({ memoryContent: '2026-08-29: finish-schedule post for marcus.' });
  const p7 = checks(dropped.transcript, { run: dropped.dir, report: dropped.report, findings: dropped.findings });
  assert.ok(hasProblem(p7, 'memory write-back', 'prior document'), p7.join('\n'));
  const unchanged = await syntheticRun({ memoryContent: (await createTools()).memory_list({ domain: 'social' }).entries[0].content });
  const p8 = checks(unchanged.transcript, { run: unchanged.dir, report: unchanged.report, findings: unchanged.findings });
  assert.ok(hasProblem(p8, 'memory write-back', 'nothing appended'), p8.join('\n'));
  const noMemory = await syntheticRun({ dropTools: ['memory_update'] });
  const p9 = checks(noMemory.transcript, { run: noMemory.dir, report: noMemory.report, findings: noMemory.findings });
  assert.ok(hasProblem(p9, 'memory write-back', 'did not persist'), p9.join('\n'));
});

test('social-post: the hook FAILS a sidecar that disagrees with the transcript or with the rules', async () => {
  const clean = await syntheticRun();
  const phantom = structuredClone(clean.findings);
  phantom.drafts.push({ platform: 'linkedin', persona: 'Marcus', stage: 'problem-aware', hook_type: 'contrarian', rubric_total: 12, post_id: 'post_new_9' });
  const p1 = checks(clean.transcript, { run: clean.dir, report: clean.report, findings: phantom });
  assert.ok(hasProblem(p1, 'drafts rows equal the posts actually created'), p1.join('\n'));
  const lowRubric = structuredClone(clean.findings);
  lowRubric.drafts[1].rubric_total = 9;
  const p2 = checks(clean.transcript, { run: clean.dir, report: clean.report, findings: lowRubric });
  assert.ok(hasProblem(p2, 'drafts rows are well-formed', 'rubric_total 9'), p2.join('\n'));
  const wrongPersona = structuredClone(clean.findings);
  wrongPersona.drafts[0].persona = 'Primary Customer';
  const p3 = checks(clean.transcript, { run: clean.dir, report: clean.report, findings: wrongPersona });
  assert.ok(hasProblem(p3, 'drafts rows are well-formed', 'is not Marcus'), p3.join('\n'));
  const wrongStage = structuredClone(clean.findings);
  wrongStage.drafts[0].stage = 'solution-aware';
  const p4 = checks(clean.transcript, { run: clean.dir, report: clean.report, findings: wrongStage });
  assert.ok(hasProblem(p4, 'drafts rows are well-formed', 'is tagged stage:problem-aware'), p4.join('\n'));
  const badCategory = structuredClone(clean.findings);
  badCategory.categories.banned_phrase_hits = ['post_new_1'];
  badCategory.categories.invalid_avatars = ['avt_marcus_01'];
  badCategory.categories.variance_breaches = ['question'];
  const p5 = checks(clean.transcript, { run: clean.dir, report: clean.report, findings: badCategory });
  assert.ok(hasProblem(p5, 'categories are id arrays', 'not a variant id'), p5.join('\n'));
  assert.ok(hasProblem(p5, 'categories are id arrays', 'the persona the drafts are for'), p5.join('\n'));
  assert.ok(hasProblem(p5, 'categories are id arrays', 'not hook:<tag>'), p5.join('\n'));
  // the stage may be written as the journey's name; it normalizes to the slug
  const named = structuredClone(clean.findings);
  named.drafts[0].stage = 'Problem Aware';
  assert.deepEqual(checks(clean.transcript, { run: clean.dir, report: clean.report, findings: named }), []);
  // an empty sidecar is a failure, not a pass
  const p6 = checks(clean.transcript, { run: clean.dir, report: clean.report, findings: {} });
  assert.ok(hasProblem(p6, 'drafts rows are well-formed', 'is empty'), p6.join('\n'));
});

test('social-post: findings-check grades the categories block and names the traps', async () => {
  const dir = tmpDir();
  const findings = {
    categories: { banned_phrase_hits: ['draft_li_1', 'draft_fb_1'], invalid_avatars: ['avt_marcus_01'], variance_breaches: ['hook:specific-number', 'format:question'] },
    drafts: [],
  };
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  const res = findingsCheck(path.join(dir, 'findings.json'));
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FALSE POSITIVE draft_fb_1 - known trap: carries the word 'seams'/);
  assert.match(res.stdout, /MISSED seeded finding avt_template_01/);
  assert.match(res.stdout, /FALSE POSITIVE avt_marcus_01 - known trap/);
  assert.match(res.stdout, /MISSED seeded finding hook:question/);
  assert.match(res.stdout, /FALSE POSITIVE hook:specific-number - known trap: 2 of the last 10/);
  assert.match(res.stdout, /FALSE POSITIVE format:question - known trap/);
  assert.doesNotMatch(res.stdout, /unknown category/, 'drafts beside categories is not an invented class');
  // the taxonomy spelling of the same breach is a named trap, not a second breach
  const relabel = { categories: { banned_phrase_hits: ['draft_li_1'], invalid_avatars: ['avt_template_01'], variance_breaches: ['hook:question', 'hook:unanswerable-question'] } };
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(relabel));
  const res2 = findingsCheck(path.join(dir, 'findings.json'));
  assert.equal(res2.status, 1);
  assert.match(res2.stdout, /FALSE POSITIVE hook:unanswerable-question - known trap: the taxonomy name/);
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

test('social-post: mock-mcp handshake, tools/list, tools/call, refusals logged to the transcript', async () => {
  const transcript = path.join(tmpDir(), 'transcript.jsonl');
  const responses = await rpcSession(transcript, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'customer_avatar_list', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'social_create_post', arguments: { content: 'hello', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'], avatar_id: 'avt_marcus_01' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'social_publish_post', arguments: { post_id: 'post_new_1' } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'a door' } } },
  ]);
  const byId = new Map(responses.map((r) => [r.id, r]));
  assert.equal(byId.get(1).result.serverInfo.name, 'hk-mock');
  const names = byId.get(2).result.tools.map((t) => t.name);
  for (const n of ['account_context_get', 'social_list_accounts', 'customer_avatar_list', 'customer_avatar_get', 'before_after_grid_list', 'kb_search', 'social_list_posts', 'talk_to_department', 'social_post_validate', 'social_create_post', 'social_post_preview', 'social_publish_post', 'generate_image', 'media_update', 'pm_tasks_create', 'memory_update']) {
    assert.ok(names.includes(n), `tools/list must advertise ${n}`);
  }
  const avatars = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(avatars.pagination.total, 2);
  const created = JSON.parse(byId.get(4).result.content[0].text);
  assert.equal(created.data.status, 'draft');
  assert.equal(JSON.parse(byId.get(5).result.content[0].text).refused, true);
  assert.equal(JSON.parse(byId.get(6).result.content[0].text).refused, true);
  const logged = loadTranscript(transcript);
  assert.deepEqual(logged.map((c) => c.name), ['customer_avatar_list', 'social_create_post', 'social_publish_post', 'generate_image']);
  assert.equal(logged[1].arguments.scheduled_at, undefined);
  assert.equal(callsTo(logged, 'social_publish_post')[0].result.refused, true);
  assert.equal(PLATFORM_SLUGS.length, 6);
});
