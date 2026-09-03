/**
 * social-report fixture: dataset invariants, the traps the tools mirror, a
 * synthetic golden run through every grader, and the mutations that must
 * FAIL the per-fixture checks - a read before the sync, a sweep not run to
 * zero, an account skipped or read twice, a mail attempt, a post write, a
 * marketing-type twin, an empty account labelled measured, a broken account
 * labelled not_connected, the 7-day summary labelled as the quarter, a
 * stopped post quoted as current, a never-synced post called the worst, the
 * lifetime pillar count used as delivery, a memory write-back that dropped
 * the prior document.
 *
 * There is no sample-run/ golden yet (that needs a model-in-the-loop run), so
 * the graders run over a synthetic transcript built from the fixture's own
 * tools: every logged result is what tools.mjs actually returns, never a
 * hand-written shape that could stop resembling the server. A planted-defect
 * eval is only as honest as its seeds, so every seed is recomputed here from
 * the dataset rather than trusted.
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
import {
  checks,
  SYNC_TOOLS,
  PER_POST_METRIC_READS,
  FORBIDDEN_WRITES,
  PLATFORM_STATES,
  CATEGORIES,
  ALL_ACCOUNT_IDS,
  CONNECTED_ACCOUNTS,
  NOT_SYNCED_ACCOUNTS,
  PARTIAL_ACCOUNTS,
  MEASURED_ACCOUNTS,
  NOT_CONNECTED_ACCOUNTS,
  STOPPED_POSTS,
  FAILED_VERSION_POSTS,
  UNSYNCED_POSTS,
  PENDING_POSTS,
  EDUCATE_LIFETIME,
  EDUCATE_WINDOW,
  SUMMARY,
} from '../fixtures/social-report/checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.join(HERE, '..');
const ROOT = path.join(EVALS, '..');
const FIX = path.join(EVALS, 'fixtures', 'social-report');
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(FIX, ...p), 'utf8'));
const { createTools, NOW, WINDOW, SYNC_WINDOW_DAYS, INCOMING_TOOLS, GATED_WRITES } = await import(pathToFileURL(path.join(FIX, 'tools.mjs')).href);
const NOW_MS = Date.parse(NOW);
const DAY = 86400000;

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-social-report-'));

/** The 12 new MCP tools of the social program (mapped in the MCP server tree). */
const PROGRAM_TOOLS = [
  'social_post_validate', 'social_post_preview', 'social_posts_analytics_list', 'social_analytics_by_dimension',
  'social_calendar_gaps', 'social_comments_digest', 'social_repurpose_source', 'social_post_duplicate',
  'social_posts_bulk_create', 'social_post_retry', 'social_comments_sync_recent', 'social_hashtags_bulk_upsert',
];

const IG = 'sacc_instagram_01';
const X = 'sacc_twitter_01';
const LI = 'sacc_linkedin_01';
const FB = 'sacc_facebook_01';
const PICKER = 'sacc_facebook_02';
const STOPPED = 'post_q_01';
const FAILED = 'post_q_26';

const hasProblem = (problems, prefix, includes) =>
  problems.some((p) => p.startsWith(prefix) && (includes === undefined || p.includes(includes)));

// ── Tool surface ────────────────────────────────────────────────────────────
test('social-report: every served tool name is in lib/tool-index.json, pending, or one of the program\'s incoming tools', async () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'tool-index.json'), 'utf8'));
  const known = new Set(index.tools.map((t) => t.name));
  const tools = await createTools();
  for (const name of INCOMING_TOOLS) assert.ok(PROGRAM_TOOLS.includes(name), `${name} is not one of the social program's 12 new tools - it cannot ride the incoming allowlist`);
  for (const name of Object.keys(tools)) {
    const ok = known.has(name) || PENDING_TOOLS.has(name) || INCOMING_TOOLS.includes(name);
    assert.ok(ok, `${name} is served but neither in lib/tool-index.json, nor PENDING_TOOLS, nor the program's incoming tools`);
  }
  for (const name of [...SYNC_TOOLS, ...PER_POST_METRIC_READS, ...FORBIDDEN_WRITES, 'social_account_analytics', 'social_list_accounts', 'marketing_report_create', 'marketing_report_regenerate', 'marketing_report_share_link', 'memory_update', 'memory_create', 'pm_tasks_create', 'social_analytics_timeseries']) {
    assert.ok(name in tools, `${name} is asserted on but not served - an attempt would not be logged under its own name`);
  }
  assert.deepEqual([...GATED_WRITES].sort(), [...FORBIDDEN_WRITES].sort(), 'tools.mjs refuses exactly what checks.mjs forbids');
  for (const name of GATED_WRITES) {
    const res = tools[name]({ report_id: 'rep_social_1', post_id: 'post_q_01', confirm: true, content: 'x', title: 'x' });
    assert.equal(res.refused, true, `${name} must refuse even with confirm: true`);
    assert.equal(res.tool, name);
  }
});

// ── Dataset invariants: the accounts ────────────────────────────────────────
test('social-report: one empty account, one broken mid-window, one picker row, two measured - and the key agrees', () => {
  const accounts = loadJson('dataset', 'accounts.json');
  const analytics = loadJson('dataset', 'analytics.json');
  const posts = loadJson('dataset', 'posts.json');
  const expected = loadJson('expected-findings.json');
  assert.equal(accounts.length, 5);
  assert.deepEqual(CONNECTED_ACCOUNTS, [LI, FB, IG, X]);
  assert.deepEqual(NOT_CONNECTED_ACCOUNTS, [PICKER]);
  assert.deepEqual(NOT_SYNCED_ACCOUNTS, [IG]);
  assert.deepEqual(PARTIAL_ACCOUNTS, [X]);
  assert.deepEqual(MEASURED_ACCOUNTS, [LI, FB]);

  const ig = accounts.find((a) => a.id === IG);
  assert.equal(ig.connection_status, 'connected', 'the trap: the row says connected');
  assert.equal(ig.is_active, true);
  assert.equal(ig.can_read_analytics, false, 'the insights scope was never granted, so no sync ever runs');
  assert.ok(!ig.scopes.includes('instagram_manage_insights'));
  assert.equal(ig.last_sync_at, null);
  assert.equal((analytics.account_rows[IG] || []).length, 0, 'no daily rows at all - nothing, not zeros');
  const igVersions = posts.flatMap((p) => p.versions.filter((v) => v.social_account_id === IG));
  assert.equal(igVersions.length, 2);
  assert.ok(igVersions.every((v) => v.status === 'published' && v.analytics === null && v.analytics_last_synced_at === null), 'both IG versions published and never synced');

  const x = accounts.find((a) => a.id === X);
  assert.equal(x.connection_status, 'error');
  assert.equal(x.token_state, 'expired');
  assert.match(x.last_error, /invalid_grant/);
  assert.match(x.last_error, /2026-08-20T03:12:00Z/);
  assert.equal(x.is_active, true, 'is_active stays true - the status word is what changed');
  const xRows = analytics.account_rows[X];
  assert.equal(xRows.length, 80);
  assert.equal(xRows[0][0], '2026-06-01');
  assert.equal(xRows[xRows.length - 1][0], '2026-08-19', 'the daily rows stop the day before the break');
  assert.ok(xRows.every((r, i) => i === 0 || r[0] > xRows[i - 1][0]), 'rows ascend without gaps in order');

  const picker = accounts.find((a) => a.id === PICKER);
  assert.equal(picker.pending_selection, true);
  assert.equal(picker.is_active, false);
  assert.equal(picker.can_post, false);
  assert.equal((analytics.account_rows[PICKER] || []).length, 0);

  for (const id of [LI, FB]) {
    const rows = analytics.account_rows[id];
    assert.equal(rows.length, 93, `${id}: 92 window days plus this morning's row`);
    assert.equal(rows[0][0], '2026-06-01');
    assert.equal(rows[91][0], '2026-08-31');
    assert.equal(rows[92][0], '2026-09-01');
    const acct = accounts.find((a) => a.id === id);
    assert.equal(acct.follower_count, rows[92][1], `${id}: follower_count is the newest snapshot`);
    assert.equal(acct.last_sync_at, '2026-09-01T05:10:00Z');
  }
  // the answer key's platform map is exactly what the dataset derives
  const derived = Object.fromEntries([
    ...MEASURED_ACCOUNTS.map((id) => [id, 'measured']),
    ...NOT_SYNCED_ACCOUNTS.map((id) => [id, 'not_synced']),
    ...PARTIAL_ACCOUNTS.map((id) => [id, 'partial']),
    ...NOT_CONNECTED_ACCOUNTS.map((id) => [id, 'not_connected']),
  ]);
  assert.deepEqual(expected.platform_states, derived);
  for (const state of PLATFORM_STATES) {
    assert.deepEqual([...expected.categories[state].must].sort(), Object.entries(derived).filter(([, s]) => s === state).map(([id]) => id).sort(), state);
  }
});

// ── Dataset invariants: the posts ───────────────────────────────────────────
test('social-report: the stopped post, the failed version, the unsynced pair and the created_at trap are real arithmetic', () => {
  const posts = loadJson('dataset', 'posts.json');
  const published = posts.filter((p) => p.status === 'published');
  assert.equal(posts.length, 40);
  assert.equal(published.length, 30);
  const ages = published.map((p) => ({ id: p.id, age: (NOW_MS - Date.parse(p.published_at)) / DAY })).sort((a, b) => b.age - a.age);
  assert.equal(ages[0].id, STOPPED);
  assert.ok(ages[0].age > SYNC_WINDOW_DAYS, `${STOPPED} must be past the ${SYNC_WINDOW_DAYS}-day ladder (age ${ages[0].age.toFixed(1)})`);
  assert.ok(ages[1].age < SYNC_WINDOW_DAYS, `the next-oldest post (${ages[1].id}, ${ages[1].age.toFixed(1)} days) must still be on the ladder - only one stopped post`);
  assert.ok(ages[1].age > SYNC_WINDOW_DAYS - 5, 'the distractor sits close to the line');
  assert.deepEqual(STOPPED_POSTS, [STOPPED]);
  const stopped = posts.find((p) => p.id === STOPPED);
  for (const v of stopped.versions) {
    assert.ok(v.analytics, 'a stopped post still has its frozen snapshot');
    assert.equal(v.analytics_next_sync_at, null, 'next_sync_at is null once the ladder stops');
    assert.equal(v.analytics_last_synced_at, '2026-08-25T14:00:12Z');
  }
  // the created_at trap: created before the window opened, published inside it
  assert.ok(Date.parse(stopped.created_at) < Date.parse(`${WINDOW.from}T00:00:00Z`));
  assert.ok(Date.parse(stopped.published_at) >= Date.parse(`${WINDOW.from}T00:00:00Z`));
  assert.equal(published.filter((p) => Date.parse(p.created_at) < Date.parse(`${WINDOW.from}T00:00:00Z`)).length, 1, 'exactly one post straddles the window edge');

  // exactly one failed version, on X, published after the token break
  const failed = posts.flatMap((p) => p.versions.filter((v) => v.status === 'failed').map((v) => ({ post: p, v })));
  assert.equal(failed.length, 1);
  assert.equal(failed[0].post.id, FAILED);
  assert.equal(failed[0].v.platform, 'twitter');
  assert.match(failed[0].v.error_message, /invalid_grant/);
  assert.ok(Date.parse(failed[0].post.published_at) > Date.parse('2026-08-20T03:12:00Z'));
  assert.ok(failed[0].post.versions.some((v) => v.platform === 'linkedin' && v.status === 'published' && v.analytics), 'the LinkedIn version of the same post published and synced - the post is partial, not dead');
  assert.deepEqual(FAILED_VERSION_POSTS, [FAILED]);
  // X versions that did publish carry snapshots no newer than the last sync before the break
  for (const p of published) {
    for (const v of p.versions.filter((x) => x.platform === 'twitter' && x.status === 'published')) {
      assert.ok(Date.parse(v.analytics_last_synced_at) <= Date.parse('2026-08-19T05:30:00Z'), `${p.id} X snapshot must predate the break`);
    }
  }

  // the two unsynced posts are exactly the Instagram ones
  assert.deepEqual([...UNSYNCED_POSTS].sort(), ['post_q_29', 'post_q_30']);
  for (const id of UNSYNCED_POSTS) assert.ok(posts.find((p) => p.id === id).target_accounts.includes(IG));

  // the top post carries no persona tag and no avatar_id - "persona not recorded"
  const byEng = published.map((p) => ({ id: p.id, eng: p.versions.reduce((s, v) => s + (v.analytics ? v.analytics.engagements : 0), 0), post: p })).sort((a, b) => b.eng - a.eng);
  assert.equal(byEng[0].id, 'post_q_09');
  assert.equal(byEng[0].post.avatar_id, null);
  assert.ok(!byEng[0].post.tags.some((t) => t.startsWith('persona:')));
  assert.ok(byEng[1].post.avatar_id, 'the runner-up does carry a persona, so the gap is specific to the top post');

  // the pending post has waited two weeks and was meant to ship a week ago
  assert.deepEqual(PENDING_POSTS, ['post_pa_01']);
  const pending = posts.find((p) => p.id === 'post_pa_01');
  assert.equal(Math.round((NOW_MS - Date.parse(pending.created_at)) / DAY), 14);
  assert.ok(Date.parse(pending.scheduled_at) < NOW_MS);
  assert.equal(pending.approval_status, 'pending');
});

test('social-report: pillar lifetime counts disagree with the window, and the summary is the closing week with an unsynced worst post', () => {
  const posts = loadJson('dataset', 'posts.json');
  const pillars = loadJson('dataset', 'pillars.json');
  const analytics = loadJson('dataset', 'analytics.json');
  const window = posts.filter((p) => p.status === 'published' && Date.parse(p.published_at) >= Date.parse(`${WINDOW.from}T00:00:00Z`) && Date.parse(p.published_at) <= Date.parse(`${WINDOW.to}T23:59:59.999Z`));
  assert.equal(window.length, 30);
  assert.equal(pillars.reduce((s, p) => s + p.target_percentage, 0), 100);
  for (const p of pillars) {
    const lifetime = posts.filter((x) => x.pillar_id === p.id).length;
    const windowed = window.filter((x) => x.pillar_id === p.id).length;
    assert.ok(lifetime > windowed, `${p.id}: lifetime ${lifetime} must exceed the window's ${windowed} - the trap is real for every pillar`);
  }
  assert.equal(EDUCATE_LIFETIME, 18);
  assert.equal(EDUCATE_WINDOW, 13);
  const others = posts.filter((p) => p.pillar_id === 'pil_educate' && p.status !== 'published');
  assert.deepEqual(others.map((p) => p.status).sort(), ['draft', 'draft', 'pending_approval', 'scheduled', 'scheduled']);

  // the summary recomputes from the trailing 7 days of snapshots
  const s = analytics.summary;
  assert.equal(s.period, '7d');
  const weekStart = NOW_MS - 7 * DAY;
  const weekPosts = posts.filter((p) => p.status === 'published' && Date.parse(p.published_at) >= weekStart && Date.parse(p.published_at) < NOW_MS);
  assert.equal(s.metrics.total_posts, weekPosts.length);
  assert.equal(weekPosts.length, 4, 'the closing week holds four published posts: two measured (LinkedIn + Facebook) and two never-synced Instagram posts');
  const snaps = weekPosts.flatMap((p) => p.versions.filter((v) => v.analytics).map((v) => v.analytics));
  assert.equal(s.metrics.impressions, snaps.reduce((a, b) => a + b.impressions, 0));
  assert.equal(s.metrics.engagements, snaps.reduce((a, b) => a + b.engagements, 0));
  assert.equal(s.metrics.likes + s.metrics.comments + s.metrics.shares, s.metrics.engagements);
  assert.equal(s.metrics.engagement_rate, Math.round((s.metrics.engagements / s.metrics.impressions) * 1000) / 10);
  assert.equal(s.best_post.id, 'post_q_28');
  assert.ok(UNSYNCED_POSTS.includes(s.worst_post.id), 'the trap: the summary ranks a never-synced post as the worst');
  assert.equal(s.worst_post.engagement, 0);
  assert.equal(s.worst_post.impressions, 0);
  // the summary figures collide with no other number in the dataset, so a
  // mislabelled 7-day figure is detectable on any report line
  const nums = new Set();
  const walk = (v) => {
    if (typeof v === 'number') nums.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(analytics.account_rows);
  walk(posts);
  walk(pillars);
  for (const k of ['impressions', 'reach', 'engagements']) assert.ok(!nums.has(s.metrics[k]), `summary ${k} ${s.metrics[k]} collides with another dataset number`);
});

// ── The tools mirror the routes ─────────────────────────────────────────────
test('social-report: tools - the sweep scans what is due and then reports zero; the created_at filter drops the edge post', async () => {
  const tools = await createTools();
  const posts = loadJson('dataset', 'posts.json');
  const accounts = loadJson('dataset', 'accounts.json');
  const syncable = new Set(accounts.filter((a) => a.is_active && a.connection_status === 'connected' && a.can_read_analytics).map((a) => a.id));
  assert.deepEqual([...syncable].sort(), [FB, LI].sort(), 'only LinkedIn and Facebook are analytics-capable and connected');
  const due = posts.flatMap((p) => p.versions.filter((v) => v.status === 'published' && syncable.has(v.social_account_id) && NOW_MS - Date.parse(v.published_at) <= SYNC_WINDOW_DAYS * DAY));
  const first = tools.social_analytics_sync().data;
  assert.equal(first.scanned, due.length);
  assert.equal(first.scanned, 29);
  assert.equal(first.synced + first.skippedUnchanged, first.scanned);
  assert.ok(first.synced > 0);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(Object.keys(first.perPlatform).sort(), ['facebook', 'linkedin']);
  const second = tools.social_analytics_sync().data;
  assert.equal(second.synced, 0, 'the second run finds nothing due - correct, not a failure');
  assert.equal(second.scanned, 0);

  assert.equal(tools.social_list_posts({ status: 'published', from_date: WINDOW.from, to_date: `${WINDOW.to}T23:59:59Z`, limit: 100 }).pagination.total, 29, 'created_at drops the post created before the window opened');
  assert.equal(tools.social_list_posts({ status: 'published', limit: 100 }).pagination.total, 30);
  assert.equal(tools.social_posts_analytics_list({ from_date: WINDOW.from, to_date: WINDOW.to }).count, 30, 'published_at keeps it');
  assert.equal(tools.social_list_posts({ status: 'published', pillar_id: 'pil_educate', from_date: WINDOW.from, limit: 100 }).pagination.total, EDUCATE_WINDOW);
  assert.equal(tools.social_list_posts({ status: 'published', platform: 'twitter', from_date: WINDOW.from, limit: 100 }).pagination.total, 5, 'five posts in the window target X (the filter is target_platforms, like the route); one X version failed, so four were delivered; quota.x.used says 0 for September');
  assert.equal(tools.social_list_posts({ status: 'pending_approval' }).pagination.total, 1);
  assert.equal(tools.social_list_posts({}).pagination.limit, 30, 'default limit mirrors the route');
  assert.equal(tools.social_list_posts({ limit: 999 }).pagination.limit, 100);
  assert.ok(!('versions' in tools.social_list_posts({ limit: 1 }).data[0]), 'the listing returns no metrics and no versions');
});

test('social-report: tools - posts_analytics_list and by_dimension say null for unsynced, stopped for the frozen post, and count N', async () => {
  const tools = await createTools();
  const list = tools.social_posts_analytics_list({ from_date: WINDOW.from, to_date: WINDOW.to, limit: 100 });
  assert.equal(list.count, 30);
  assert.equal(list.window.from, `${WINDOW.from}T00:00:00.000Z`);
  assert.deepEqual([...list.unsynced].sort(), ['post_q_29', 'post_q_30']);
  const stopped = list.data.find((p) => p.post_id === STOPPED);
  assert.equal(stopped.sync_stopped, true);
  assert.ok(stopped.versions.every((v) => v.sync_stopped && v.next_sync_at === null && v.synced_at === '2026-08-25T14:00:12Z'));
  assert.ok(stopped.totals.impressions > 0, 'frozen, not empty');
  assert.equal(list.data.filter((p) => p.sync_stopped).length, 1);
  const unsynced = list.data.find((p) => p.post_id === 'post_q_29');
  assert.equal(unsynced.totals, null, 'unknown is not zero');
  assert.ok(unsynced.versions.every((v) => v.never_synced && v.analytics === null));
  const failed = list.data.find((p) => p.post_id === FAILED);
  assert.deepEqual(failed.versions.map((v) => `${v.platform}:${v.status}`).sort(), ['linkedin:published', 'twitter:failed']);
  assert.ok(failed.totals.impressions > 0, 'the LinkedIn version still counts');
  const byIds = tools.social_posts_analytics_list({ post_ids: `${STOPPED},post_q_99` });
  assert.equal(byIds.count, 1);
  assert.deepEqual(byIds.not_found, ['post_q_99']);
  assert.equal(byIds.window, null);
  assert.ok(tools.social_posts_analytics_list({}).error);
  assert.ok(tools.social_posts_analytics_list({ from_date: '06/01/2026' }).error);
  assert.equal(tools.social_posts_analytics_list({ from_date: WINDOW.from, to_date: WINDOW.to, limit: 5 }).count, 5);

  const hook = tools.social_analytics_by_dimension({ group_by: 'hook', from_date: WINDOW.from, to_date: WINDOW.to });
  assert.equal(hook.posts_in_window, 30);
  assert.equal(hook.unsynced.posts, 2);
  assert.equal(hook.data.reduce((s, r) => s + r.posts, 0), 30, 'every post carries exactly one hook');
  assert.equal(hook.data[0].key, 'story', 'sorted by engagement_rate desc');
  assert.ok(hook.data.every((r, i) => i === 0 || r.engagement_rate === null || r.engagement_rate <= hook.data[i - 1].engagement_rate));
  const howto = hook.data.find((r) => r.key === 'how-to');
  assert.equal(howto.posts, 9);
  assert.equal(howto.synced_posts, 8, 'the unsynced Instagram how-to counts in posts and nowhere else');
  const platform = tools.social_analytics_by_dimension({ group_by: 'platform', from_date: WINDOW.from, to_date: WINDOW.to });
  const ig = platform.data.find((r) => r.key === 'instagram');
  assert.equal(ig.posts, 2);
  assert.equal(ig.synced_posts, 0);
  assert.equal(ig.engagement_rate, null, 'a group nobody has synced carries nulls');
  assert.equal(ig, platform.data[platform.data.length - 1], 'nulls sort last');
  const persona = tools.social_analytics_by_dimension({ group_by: 'persona', from_date: WINDOW.from, to_date: WINDOW.to });
  assert.equal(persona.unassigned, 1, 'the top post carries no persona');
  assert.ok(persona.data.some((r) => r.key === 'tag:homeowner') && persona.data.some((r) => r.key === 'avatar:av_homeowner'), 'tag-derived and column-derived keys stay distinct');
  const dflt = tools.social_analytics_by_dimension({ group_by: 'pillar' });
  assert.equal(dflt.window.days, 30, 'default window is the trailing 30 days');
  assert.ok(tools.social_analytics_by_dimension({ group_by: 'weekday' }).error);
});

test('social-report: tools - account rows, followers, summary, timeseries, pillars, post detail and the per-post zero trap', async () => {
  const tools = await createTools();
  const li = tools.social_account_analytics({ social_account_id: LI, from_date: WINDOW.from, to_date: WINDOW.to, limit: 100 });
  assert.equal(li.pagination.total, 92);
  assert.equal(li.data.length, 92, 'one limit-100 page covers the window');
  assert.equal(li.data[0].date, '2026-08-31T00:00:00.000Z', 'newest day first');
  assert.ok(li.data.every((r) => typeof r.avg_engagement_rate === 'number' && r.avg_engagement_rate < 1), 'avg_engagement_rate is a fraction, not a percent');
  assert.ok(!('reach' in li.data[0]) && !('total_reach' in li.data[0]), 'there is NO reach column on the account table');
  assert.equal(li.social_account.platform, 'linkedin');
  assert.equal(tools.social_account_analytics({ social_account_id: LI }).pagination.limit, 30, 'default limit mirrors the route');
  assert.equal(tools.social_account_analytics({ social_account_id: LI }).pagination.total, 93, 'unfiltered includes this morning\'s row');
  const ig = tools.social_account_analytics({ social_account_id: IG, from_date: WINDOW.from, to_date: WINDOW.to, limit: 100 });
  assert.deepEqual(ig.data, []);
  assert.equal(ig.pagination.total, 0);
  assert.equal(tools.social_account_analytics({ social_account_id: X, from_date: WINDOW.from, to_date: WINDOW.to, limit: 100 }).pagination.total, 80);
  assert.equal(tools.social_account_analytics({}).error, 'social_account_id is required');
  assert.equal(tools.social_account_analytics({ social_account_id: 'nope' }).error, 'Social account not found');

  const followers = tools.social_analytics_followers({ period: 92 });
  assert.equal(followers.period, 92);
  assert.deepEqual(followers.data.map((a) => a.social_account_id), CONNECTED_ACCOUNTS, 'is_active rows only - the picker is not here');
  const igF = followers.data.find((a) => a.social_account_id === IG);
  assert.equal(igF.net_change, 0, 'the flat zero that is really unknown');
  assert.equal(igF.last_synced_at, null, 'the tell');
  assert.deepEqual(igF.chart_data, []);
  const xF = followers.data.find((a) => a.social_account_id === X);
  assert.equal(xF.last_synced_at, '2026-08-19T05:10:00Z');
  assert.equal(xF.chart_data[xF.chart_data.length - 1].date, '2026-08-19');
  assert.equal(tools.social_analytics_followers({ social_account_id: LI }).data.length, 1);
  assert.equal(tools.social_analytics_followers({}).period, 30);

  assert.equal(tools.social_analytics_summary({ from_date: '2026-06-01', to_date: '2026-08-31' }).data.period, '7d', 'date args are ignored');
  const ts = tools.social_analytics_timeseries({ days: 92 });
  assert.equal(ts.data.days, 30, 'a fixed trailing 30 regardless of arguments');
  assert.deepEqual(ts.data.daily, []);
  assert.deepEqual(tools.social_pillar_list().data.map((p) => `${p.name}:${p._count.posts}`), ['Educate:18', 'Authority:8', 'Connection:8', 'Promotion:6']);

  const detail = tools.social_get_post({ post_id: FAILED }).data;
  const xv = detail.versions.find((v) => v.platform === 'twitter');
  assert.equal(xv.status, 'failed');
  assert.match(xv.error_message, /invalid_grant/);
  assert.equal(xv.latest_analytics, null);
  assert.equal(detail.versions.find((v) => v.platform === 'linkedin').status, 'published');
  assert.equal(tools.social_get_post({ post_id: 'nope' }).status, 404);
  // the per-post route's own zero: a never-synced post totals to zeros with rate 0
  const zero = tools.social_post_analytics({ post_id: 'post_q_29' }).data;
  assert.equal(zero.totals.impressions, 0);
  assert.equal(zero.totals.engagement_rate, 0);
  assert.equal(zero.totals.last_synced_at, null, 'the tell');
  assert.ok(zero.per_platform.every((v) => v.analytics === null));
  const top = tools.social_post_analytics({ post_id: 'post_q_09' }).data;
  assert.equal(top.totals.impressions, 7330);
  assert.equal(top.per_platform.length, 2);
  // spot-forcing: stopped and unsyncable versions are skipped with a reason
  assert.ok(tools.social_post_sync_analytics({ post_id: STOPPED }).data.sync_results.every((r) => r.status === 'skipped' && /stopped/.test(r.reason)));
  assert.match(tools.social_post_sync_analytics({ post_id: 'post_q_29' }).data.sync_results[0].reason, /can_read_analytics false/);
  assert.deepEqual(tools.social_post_sync_analytics({ post_id: FAILED }).data.sync_results.map((r) => `${r.platform}:${r.status}`), ['linkedin:success']);
  assert.equal(tools.social_post_sync_analytics({ post_id: 'post_d_01' }).error, 'No published versions to sync');
  assert.equal(tools.social_post_sync_analytics({ post_id: 'nope' }).status, 404);
  assert.equal(tools.customer_avatar_get({ id: 'av_contractor' }).data.name, 'Trade contractor');

  const roster = tools.social_list_accounts({});
  assert.equal(roster.total, 5);
  assert.equal(roster.quota.x.used, 0, 'September\'s count, not the window\'s');
  assert.equal(roster.quota.x.month_start_utc, '2026-09-01T00:00:00Z');
  assert.equal(tools.social_list_accounts({ connection_status: 'connected' }).total, 4, 'the status word keeps the picker and drops the broken X');
  assert.equal(tools.social_list_accounts({ is_active: 'true' }).total, 4);
});

test('social-report: tools - the client report lifecycle acks with a token; mail, twins and post writes refuse', async () => {
  const tools = await createTools();
  const priv = tools.marketing_report_create({ report_name: 'Brightside - Social', report_type: 'social', schedule: 'none' });
  assert.equal(priv.data.id, 'rep_social_1');
  assert.equal(priv.data.is_public, false, 'a social report is private by default');
  assert.equal(priv.data.public_token, null);
  assert.equal(priv.data.next_scheduled_at, null);
  assert.deepEqual(priv.data.include_sections, ['overview', 'timeseries', 'followers', 'top_posts']);
  assert.equal(tools.marketing_report_share_link({ report_id: priv.data.id }).url, null, 'url null means not public');
  tools.marketing_report_update({ report_id: priv.data.id, is_public: true });
  assert.match(tools.marketing_report_share_link({ report_id: priv.data.id }).url, /\/public\/social-report\/tok_fixture_social_1$/);
  const pub = tools.marketing_report_create({ report_name: 'Brightside - Social', report_type: 'social', schedule: 'weekly', is_public: true, include_sections: ['overview', 'top_posts'] });
  assert.equal(pub.data.id, 'rep_social_2');
  assert.equal(pub.data.next_scheduled_at, '2026-09-08T13:20:00Z');
  assert.equal(pub.data.last_generated_at, null, 'empty until regenerated');
  assert.equal(tools.marketing_report_regenerate({ report_id: pub.data.id }).data.last_generated_at, NOW);
  assert.match(tools.marketing_report_share_link({ report_id: pub.data.id }).url, /tok_fixture_social_2$/);
  assert.equal(tools.marketing_report_regenerate({ report_id: 'rep_social_9' }).status, 404);
  assert.equal(tools.marketing_report_share_link({ report_id: 'rep_social_9' }).status, 404);
  assert.equal(tools.marketing_report_create({ report_name: 'x' }).status, 400);
  const twin = tools.marketing_report_create({ report_name: 'x', report_type: 'marketing' });
  assert.equal(twin.refused, true);
  assert.equal(twin.tool, 'marketing_report_create');
  assert.equal(tools.marketing_report_send({ report_id: pub.data.id }).refused, true, 'even the preview call refuses');
  assert.equal(tools.marketing_report_send({ report_id: pub.data.id, confirm: true }).refused, true);
  assert.equal(tools.content_create({ title: 'Social report', content: 'x' }).refused, true);
  assert.equal(tools.social_publish_post({ post_id: FAILED }).refused, true);
  assert.equal(tools.social_update_post({ post_id: 'post_q_09', tags: ['persona:homeowner'] }).refused, true);
  assert.equal(tools.social_create_post({ content: 'x' }).refused, true);
  assert.equal(tools.memory_list({ domain: 'social' }).entries.length, 1);
  assert.equal(tools.pm_tasks_create({ project_id: 'proj_fixture_ops', title: 't' }).id, 'pmt_1');
});

// ── Answer key hygiene ──────────────────────────────────────────────────────
test('social-report: every expected id exists, must/must_not are disjoint, categories match checks.mjs, prompt.md leaks nothing', () => {
  const expected = loadJson('expected-findings.json');
  const posts = loadJson('dataset', 'posts.json');
  const ids = new Set([...ALL_ACCOUNT_IDS, ...posts.map((p) => p.id)]);
  assert.deepEqual(Object.keys(expected.categories), CATEGORIES);
  for (const [name, spec] of Object.entries(expected.categories)) {
    assert.ok(spec.must.length >= 1, `${name} seeds at least one id`);
    for (const id of spec.must) assert.ok(ids.has(id), `${name}.must: ${id}`);
    assert.ok(spec.must_not.length >= 2, `${name} names at least two traps`);
    for (const trap of spec.must_not) {
      assert.ok(ids.has(trap.id), `${name}.must_not: ${trap.id}`);
      assert.ok(!spec.must.includes(trap.id), `${name}: ${trap.id} cannot be both must and must_not`);
      assert.ok(trap.reason.length > 30, `${name}.must_not ${trap.id} must name its trap`);
    }
  }
  assert.deepEqual(expected.categories.stopped_posts.must, STOPPED_POSTS);
  assert.deepEqual(expected.categories.failed_versions.must, FAILED_VERSION_POSTS);
  assert.deepEqual(expected.categories.pending_approval.must, PENDING_POSTS);
  // every account lands in exactly one state
  const placed = PLATFORM_STATES.flatMap((s) => expected.categories[s].must).sort();
  assert.deepEqual(placed, [...ALL_ACCOUNT_IDS].sort());

  const prompt = fs.readFileSync(path.join(FIX, 'prompt.md'), 'utf8');
  for (const name of CATEGORIES) assert.ok(prompt.includes(`"${name}"`), `prompt.md names the ${name} sidecar key`);
  assert.match(prompt, /findings\.json/);
  assert.match(prompt, /report\.md/);
  assert.ok(prompt.includes(WINDOW.from) && prompt.includes(WINDOW.to), 'the window is the operator\'s ask and belongs in the prompt');
  const lower = CATEGORIES.reduce((acc, name) => acc.split(name).join(''), prompt.toLowerCase());
  for (const id of ids) assert.ok(!lower.includes(id.toLowerCase()), `prompt.md leaks the id ${id}`);
  for (const leak of ['instagram', 'twitter', 'linkedin', 'facebook', ' x ', 'invalid_grant', 'insights', 'picker', 'pending_selection', 'educate', 'lifetime', '2026-08-20', '2026-06-02', '2026-08-25', '90 days', '90-day', 'sync_stopped', 'worst', 'quota']) {
    assert.ok(!lower.includes(leak), `prompt.md leaks "${leak}"`);
  }
  assert.ok(!/\b(4470|3666|217|4\.9|18|13|29|30|92|80)\b/.test(prompt), 'prompt.md must not leak a seeded count or figure');
});

// ── The synthetic golden run ────────────────────────────────────────────────
/**
 * A clean run of the command against the fixture: every logged result is what
 * tools.mjs returns for that call, in the command's order. Options drop,
 * reorder or add calls, or override the sidecar, so each mutation test
 * changes exactly one thing.
 */
async function syntheticRun({
  syncFirst = true,
  sweepTwice = true,
  accountReads = CONNECTED_ACCOUNTS,
  duplicateAccountRead = null,
  anonymousAccountRead = false,
  reportType = 'social',
  regenerate = true,
  shareLink = true,
  tasks = 3,
  memoryContent = null,
  extraCalls = [],
  findingsOverride = null,
} = {}) {
  const tools = await createTools();
  const expected = loadJson('expected-findings.json');
  const dir = tmpDir();
  const lines = [];
  const call = (tool, input = {}) => {
    const result = tools[tool](input);
    lines.push(JSON.stringify({ ts: NOW, tool, input, result }));
    return result;
  };
  const from = WINDOW.from;
  const to = WINDOW.to;

  call('account_context_get', { domain: 'social' });
  const memory = call('memory_list', { domain: 'social' });
  const syncs = [];
  const runSyncs = () => {
    syncs.push(call('social_analytics_sync', {}));
    if (sweepTwice) syncs.push(call('social_analytics_sync', {}));
  };
  if (syncFirst) runSyncs();
  const roster = call('social_list_accounts', {});
  const listed = call('social_list_posts', { status: 'published', from_date: from, to_date: `${to}T23:59:59Z`, limit: 100 });
  const accountRows = {};
  for (const id of accountReads) accountRows[id] = call('social_account_analytics', { social_account_id: id, from_date: from, to_date: to, limit: 100 });
  if (duplicateAccountRead) call('social_account_analytics', { social_account_id: duplicateAccountRead, from_date: from, to_date: to, limit: 100 });
  if (anonymousAccountRead) call('social_account_analytics', { from_date: from, to_date: to, limit: 100 });
  const followers = call('social_analytics_followers', { period: 92 });
  const perPost = call('social_posts_analytics_list', { from_date: from, to_date: to, limit: 100 });
  const failedDetail = call('social_get_post', { post_id: FAILED });
  const topDetail = call('social_post_analytics', { post_id: 'post_q_09' });
  const dims = {};
  for (const g of ['hook', 'format', 'persona', 'pillar']) dims[g] = call('social_analytics_by_dimension', { group_by: g, from_date: from, to_date: to });
  const pillars = call('social_pillar_list', {});
  const perPillar = {};
  for (const p of pillars.data) perPillar[p.id] = call('social_list_posts', { status: 'published', pillar_id: p.id, from_date: from, to_date: `${to}T23:59:59Z`, limit: 100 });
  const xDelivery = call('social_list_posts', { status: 'published', platform: 'twitter', from_date: from, limit: 100 });
  const pending = call('social_list_posts', { status: 'pending_approval', limit: 100 });
  const summary = call('social_analytics_summary', {});
  call('social_analytics_timeseries', { days: 92 });
  if (!syncFirst) runSyncs();
  const created = call('marketing_report_create', { report_name: 'Brightside Fixtures - Social, June to August 2026', report_type: reportType, schedule: 'none', include_sections: ['overview', 'timeseries', 'followers', 'top_posts'], is_public: true });
  const reportId = created.data?.id || null;
  if (reportId && regenerate) call('marketing_report_regenerate', { report_id: reportId });
  const link = reportId && shareLink ? call('marketing_report_share_link', { report_id: reportId }) : { url: null };
  call('pm_projects_list', {});
  const taskTitles = ['Reconnect X: the token refresh failed on 2026-08-20 and the 08-21 X version failed', 'Reconnect Instagram with the insights scope so analytics can sync', 'Client sign-off: the toe-kick post has waited at pending_approval since 2026-08-18'];
  for (let i = 0; i < tasks; i += 1) call('pm_tasks_create', { project_id: 'proj_fixture_ops', title: taskTitles[i] || `Social report follow-up ${i + 1}` });
  const prior = memory.entries[0].content;
  call('memory_update', { memory_id: memory.entries[0].memory_id, content: memoryContent ?? `${prior}\n\n2026-09-01 quarter report (June-August): 30 posts published; the X token broke 2026-08-20 and Instagram cannot read analytics until reconnected with the insights scope; the social report page is ${reportId}.` });
  for (const extra of extraCalls) lines.push(JSON.stringify(extra));
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), `${lines.join('\n')}\n`);

  // ── The report, from the results above ──────────────────────────────────
  const rowsOf = (id) => accountRows[id]?.data || [];
  const liRows = rowsOf(LI);
  const fbRows = rowsOf(FB);
  const xRows = rowsOf(X);
  const newest = (rows) => rows[0];
  const oldest = (rows) => rows[rows.length - 1];
  const totalsOf = (id) => perPost.data.find((p) => p.post_id === id)?.totals;
  const top = [...perPost.data].filter((p) => p.totals).sort((a, b) => b.totals.engagements - a.totals.engagements).slice(0, 3);
  const stoppedRow = perPost.data.find((p) => p.post_id === STOPPED);
  const newestSynced = perPost.data.flatMap((p) => p.versions.map((v) => v.synced_at)).filter(Boolean).sort().pop();
  const hookRows = dims.hook.data;
  const formatRows = dims.format.data;
  const personaRows = dims.persona.data.filter((r) => r.key.startsWith('tag:'));
  const pillarRow = (id) => dims.pillar.data.find((r) => r.key === id);
  const educate = pillars.data.find((p) => p.name === 'Educate');
  const share = (n, d) => Math.round((n / d) * 100);
  const xAccount = roster.data.find((a) => a.id === X);
  const igFollowers = followers.data.find((a) => a.social_account_id === IG);
  const s = summary.data;

  const reportLines = [
    '# Social report - Brightside Fixtures - first quarter on Hiveku (2026-06-01 to 2026-08-31)',
    '',
    `Client page: ${link.url || 'not minted'} (${reportId}, generated ${created.data ? '2026-09-01' : 'never'}; the page renders the stored snapshot, not live data). Nothing was mailed: marketing_report_send waits for the owner's yes.`,
    '',
    '## Measurement artifacts, ruled out first',
    '',
    `- The sync ran before any post number was read: social_analytics_sync scanned ${syncs[0]?.data.scanned ?? 0} due versions and refreshed ${syncs[0]?.data.synced ?? 0}; the second pass reported ${syncs[1]?.data.synced ?? 'n/a'} synced, which is the completeness signal, not a failure.`,
    `- Window: social_list_posts (created_at filter) counts ${listed.pagination.total} published posts, social_posts_analytics_list (published_at filter) counts ${perPost.count}. The difference is ${STOPPED}, scheduled ahead of its publish date; the report uses published_at throughout.`,
    `- Connections: ${X} (X) broke on 2026-08-20 with a token refresh failure, so its daily rows stop at ${oldest(xRows) ? newest(xRows).date.slice(0, 10) : 'n/a'} (${xRows.length} rows) - partial, reported as what was captured plus the gap, and kept out of every blended denominator. ${IG} (Instagram) is connected but cannot read analytics: ${rowsOf(IG).length} daily rows, both posts never synced - not_synced, never a zero. ${PICKER} is a picker row awaiting activation - not_connected, not a platform.`,
    `- Versions: ${FAILED} shipped on LinkedIn and its X version failed with the same token error; the failed version is excluded from the sample and named here. ${STOPPED} is past the 90-day ladder and is quoted as of 2026-08-25, its final snapshot.`,
    '',
    '## By platform (social_account_analytics, daily rows in the window)',
    '',
    `- LinkedIn (${LI}, measured): ${liRows.length} daily rows; followers ${oldest(liRows).followers_count} on 2026-06-01 to ${newest(liRows).followers_count} on 2026-08-31 (social_analytics_followers over 92 days agrees at a net change of ${followers.data.find((a) => a.social_account_id === LI).net_change}); impressions are the account-level figure - there is no reach column on these rows.`,
    `- Facebook (${FB}, measured): ${fbRows.length} daily rows; followers ${oldest(fbRows).followers_count} to ${newest(fbRows).followers_count}.`,
    `- X (${X}, partial): ${xRows.length} daily rows through 2026-08-19; followers ${oldest(xRows).followers_count} to ${newest(xRows).followers_count} over the captured span; ${xDelivery.pagination.total} X posts delivered in the window by social_list_posts, while quota.x.used reads 0 because it counts September.`,
    `- Instagram (${IG}, not_synced): no daily rows, and social_analytics_followers shows a net change of ${igFollowers.net_change} with last_synced_at ${igFollowers.last_synced_at} - that is an unread series, not a flat audience.`,
    '',
    '## Top content (social_posts_analytics_list totals, engagements over impressions)',
    '',
    ...top.map((p, i) => `${i + 1}. ${p.post_id} - ${p.title}: ${p.totals.engagements} engagements on ${p.totals.impressions} impressions (${p.totals.engagement_rate}%), pillar ${p.pillar_id}, persona ${p.post_id === 'post_q_09' ? 'not recorded (no persona tag, no avatar_id)' : 'homeowner (persona tag)'}.`),
    `- Sample: ${perPost.count - perPost.unsynced.length} of ${perPost.count} published posts carry a snapshot; ${perPost.unsynced.join(' and ')} are not synced (Instagram) and are excluded, never scored as zero. ${STOPPED} is in the sample as of 2026-08-25 (${stoppedRow.totals.engagements} engagements on ${stoppedRow.totals.impressions} impressions, frozen).`,
    '',
    '## By hook, format and persona (social_analytics_by_dimension, window 2026-06-01 to 2026-08-31, N = posts / synced posts)',
    '',
    ...hookRows.map((r) => `- hook ${r.label}: N ${r.posts}/${r.synced_posts}, ${r.engagement_rate === null ? 'no synced post' : `${r.engagement_rate}% on ${r.impressions} impressions`}${r.posts < 5 ? ' - under five posts, a hint rather than a finding' : ''}.`),
    ...formatRows.map((r) => `- format ${r.label}: N ${r.posts}/${r.synced_posts}, ${r.engagement_rate === null ? 'no synced post' : `${r.engagement_rate}% on ${r.impressions} impressions`}.`),
    ...personaRows.map((r) => `- persona ${r.label}: N ${r.posts}/${r.synced_posts}, ${r.engagement_rate}% on ${r.impressions} impressions.`),
    `- ${dims.persona.unassigned} post carries no persona at all - the top post - so the persona split covers ${dims.persona.posts_in_window - dims.persona.unassigned} of ${dims.persona.posts_in_window} posts.`,
    '',
    '## Delivery and cadence (social_list_posts per pillar, published_at window; targets from social_pillar_list)',
    '',
    ...pillars.data.map((p) => `- ${p.name}: ${perPillar[p.id].pagination.total} of ${perPost.count} published posts (${share(perPillar[p.id].pagination.total, perPost.count)}%) against a ${p.target_percentage}% target; grouped engagement ${pillarRow(p.id)?.engagement_rate}% on N ${pillarRow(p.id)?.posts}/${pillarRow(p.id)?.synced_posts}.${p.id === educate.id ? ` The pillar row's own count is ${educate._count.posts} lifetime (drafts, scheduled and the pending post included) and is not the window's delivery.` : ''}`),
    `- Approval queue: ${pending.data.map((p) => p.id).join(', ')} has waited at pending_approval since 2026-08-18 - fourteen days - and missed its 2026-08-25 slot; the client's own sign-off is holding it.`,
    '',
    '## Closing week',
    '',
    `- social_analytics_summary is always the trailing 7 days, never the quarter: ${s.metrics.total_posts} posts, ${s.metrics.impressions} impressions, ${s.metrics.reach} reach, ${s.metrics.engagements} engagements, ${s.metrics.engagement_rate}% engagement rate (engagements over impressions), impressions ${s.changes.impressions}% on the week before.`,
    `- The same 7-day summary names ${s.worst_post.id} as its worst post at 0 - that post is not synced (Instagram) and the number is unknown, not zero; the closing week's real comparison is ${s.best_post.id} alone.`,
    `- social_analytics_timeseries came back empty (a fixed trailing 30 days), so the blended series was unavailable; the trend above is built from the account rows.`,
    '',
    '## Next bets',
    '',
    `1. More story hooks on Facebook and LinkedIn: N ${hookRows.find((r) => r.key === 'story')?.posts} posts at ${hookRows.find((r) => r.key === 'story')?.engagement_rate}%, the strongest group with a usable N.`,
    `2. Keep how-to carousels as the Educate workhorse: N ${hookRows.find((r) => r.key === 'how-to')?.posts} how-to posts at ${hookRows.find((r) => r.key === 'how-to')?.engagement_rate}%.`,
    `3. Test: a persona tag on every post, so the persona split stops leaking the best post (labelled a test - the gap is one post).`,
    '',
    '## Filed',
    '',
    `- ${tasks} tasks on Fixture Ops: reconnect X, reconnect Instagram with the insights scope, chase the client sign-off. Social memory updated with the quarter's notes appended to the prior document.`,
    '',
    '## Freshness',
    '',
    `- Post metrics: synced through ${newestSynced}; posts published before 2026-06-03 stopped syncing and are quoted as of their last sync (${STOPPED_POSTS.length} post: ${STOPPED}, as of 2026-08-25).`,
    `- Account metrics: daily snapshots through ${newest(liRows).date.slice(0, 10)} (05:10 UTC).`,
    '- Comments: LinkedIn and Meta comments are not part of this report; X, TikTok and GBP comments are not collected here; posts older than 14 days are not re-read.',
    `- Connections: ${CONNECTED_ACCOUNTS.length - 1} connected and reading, 1 awaiting activation (${PICKER}), 1 broken (X: token refresh refused on 2026-08-20; ${xAccount.token_state}).`,
    `- X: ${roster.quota.x.used} of 60 X posts used this month, ${roster.quota.x.remaining} remaining (September's count).`,
  ];
  const report = reportLines.join('\n');
  const findings = findingsOverride ?? {
    categories: Object.fromEntries(CATEGORIES.map((name) => [name, [...expected.categories[name].must]])),
    platforms: { ...expected.platform_states },
    report_id: reportId,
  };
  fs.writeFileSync(path.join(dir, 'report.md'), report);
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings, null, 2));
  return { dir, transcript: loadTranscript(path.join(dir, 'transcript.jsonl')), report, findings };
}

const grade = (runDir) =>
  spawnSync(process.execPath, [path.join(EVALS, 'bin', 'grade.mjs'), '--fixture', FIX, '--run', runDir], { encoding: 'utf8' });

test('social-report: the synthetic golden run passes grade.mjs - three checkers plus the transcript verdict', async () => {
  const { dir } = await syntheticRun();
  const res = grade(dir);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /PASS {2}planted-defect/);
  assert.match(res.stdout, /PASS {2}trace/);
  assert.match(res.stdout, /PASS {2}restatement/);
  assert.match(res.stdout, /PASS {2}transcript/, 'grade.mjs must have loaded checks.mjs');
});

test('social-report: the synthetic golden run passes checks.mjs, as a module and as a CLI', async () => {
  const { dir, transcript, findings, report } = await syntheticRun();
  const problems = checks(transcript, { run: dir, findings, report });
  assert.ok(Array.isArray(problems), 'checks returns a list of problem strings (the grade.mjs contract)');
  assert.deepEqual(problems, []);
  assert.equal(countCalls(transcript, 'social_account_analytics'), CONNECTED_ACCOUNTS.length);
  assert.equal(countCalls(transcript, 'social_analytics_sync'), 2);
  assert.equal(transcript.findIndex((c) => SYNC_TOOLS.includes(c.name)) < transcript.findIndex((c) => PER_POST_METRIC_READS.includes(c.name)), true);
  const cli = spawnSync(process.execPath, [path.join(FIX, 'checks.mjs'), '--run', dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, `${cli.stdout}\n${cli.stderr}`);
  assert.match(cli.stdout, /PASS/);
  const json = spawnSync(process.execPath, [path.join(FIX, 'checks.mjs'), '--run', dir, '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(json.stdout), { ok: true, problems: [] });
});

// ── Mutations that must FAIL checks.mjs ─────────────────────────────────────
test('social-report: checks fail a read before the sync, a missing sync, and a sweep not run to zero', async () => {
  const late = await syntheticRun({ syncFirst: false });
  const p1 = checks(late.transcript, { run: late.dir, findings: late.findings, report: late.report });
  assert.ok(hasProblem(p1, 'sync runs before any per-post metric read', 'ran before the first sync'), p1.join('\n'));

  const once = await syntheticRun({ sweepTwice: false });
  const p2 = checks(once.transcript, { run: once.dir, findings: once.findings, report: once.report });
  assert.ok(hasProblem(p2, 'the account sweep runs until it reports zero synced', 'not run to completion'), p2.join('\n'));
  assert.ok(!hasProblem(p2, 'sync runs before'), 'one sync before the reads still satisfies the order gate');

  const clean = await syntheticRun();
  const records = fs.readFileSync(path.join(clean.dir, 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.tool !== 'social_analytics_sync');
  const file = path.join(tmpDir(), 'transcript.jsonl');
  fs.writeFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const p3 = checks(loadTranscript(file), { run: clean.dir, findings: clean.findings, report: clean.report });
  assert.ok(hasProblem(p3, 'sync runs before any per-post metric read', 'neither social_analytics_sync nor social_post_sync_analytics'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'the account sweep runs until it reports zero synced', 'never called'), p3.join('\n'));
});

test('social-report: checks fail an account skipped, read twice, or read without its id', async () => {
  const skipped = await syntheticRun({ accountReads: [LI, FB, X] });
  const p1 = checks(skipped.transcript, { run: skipped.dir, findings: skipped.findings, report: skipped.report });
  assert.ok(hasProblem(p1, 'social_account_analytics once per connected account', `never called for ${IG}`), p1.join('\n'));

  const twice = await syntheticRun({ duplicateAccountRead: LI });
  const p2 = checks(twice.transcript, { run: twice.dir, findings: twice.findings, report: twice.report });
  assert.ok(hasProblem(p2, 'social_account_analytics once per connected account', `called 2 times for ${LI}`), p2.join('\n'));

  const anon = await syntheticRun({ anonymousAccountRead: true });
  const p3 = checks(anon.transcript, { run: anon.dir, findings: anon.findings, report: anon.report });
  assert.ok(hasProblem(p3, 'social_account_analytics once per connected account', 'without social_account_id'), p3.join('\n'));
});

test('social-report: checks fail a mail attempt and a post write, even when the fixture refused them', async () => {
  for (const tool of FORBIDDEN_WRITES) {
    const crossing = { ts: NOW, tool, input: { report_id: 'rep_social_1', post_id: FAILED, confirm: true }, result: { refused: true, tool, reason: 'eval fixture' } };
    const run = await syntheticRun({ extraCalls: [crossing] });
    const problems = checks(run.transcript, { run: run.dir, findings: run.findings, report: run.report });
    assert.ok(hasProblem(problems, 'no client mail and no post writes', `${tool} was called`), `${tool}: ${problems.join('\n')}`);
  }
});

test('social-report: checks fail a marketing-type twin, a page never regenerated, and a link never read', async () => {
  const twin = await syntheticRun({ reportType: 'marketing' });
  const p1 = checks(twin.transcript, { run: twin.dir, findings: twin.findings, report: twin.report });
  assert.ok(hasProblem(p1, 'the client artifact is the social report page', 'report_type "marketing"'), p1.join('\n'));

  const stale = await syntheticRun({ regenerate: false });
  const p2 = checks(stale.transcript, { run: stale.dir, findings: stale.findings, report: stale.report });
  assert.ok(hasProblem(p2, 'the client artifact is the social report page', 'never regenerated'), p2.join('\n'));

  const unlinked = await syntheticRun({ shareLink: false });
  const p3 = checks(unlinked.transcript, { run: unlinked.dir, findings: unlinked.findings, report: unlinked.report });
  assert.ok(hasProblem(p3, 'the client artifact is the social report page', 'never read for it'), p3.join('\n'));

  const clean = await syntheticRun();
  const wrongId = { ...clean.findings, report_id: 'rep_social_9' };
  const p4 = checks(clean.transcript, { run: clean.dir, findings: wrongId, report: clean.report });
  assert.ok(hasProblem(p4, 'the client artifact is the social report page', 'findings.report_id'), p4.join('\n'));
});

test('social-report: checks fail an empty account labelled measured, a broken one labelled not_connected, and a map that disagrees with its categories', async () => {
  const clean = await syntheticRun();
  const zeros = structuredClone(clean.findings);
  zeros.platforms[IG] = 'measured';
  zeros.categories.measured.push(IG);
  zeros.categories.not_synced = [];
  const p1 = checks(clean.transcript, { run: clean.dir, findings: zeros, report: clean.report });
  assert.ok(hasProblem(p1, 'empty analytics rows are not_synced, never measured', IG), p1.join('\n'));

  const dropped = structuredClone(clean.findings);
  dropped.platforms[X] = 'not_connected';
  dropped.categories.not_connected.push(X);
  dropped.categories.partial = [];
  const p2 = checks(clean.transcript, { run: clean.dir, findings: dropped, report: clean.report });
  assert.ok(hasProblem(p2, 'a connection that broke mid-window is partial', X), p2.join('\n'));

  const disagree = structuredClone(clean.findings);
  disagree.platforms[LI] = 'partial';
  const p3 = checks(clean.transcript, { run: clean.dir, findings: disagree, report: clean.report });
  assert.ok(hasProblem(p3, 'findings.platforms names every account with one of the four states', 'disagrees'), p3.join('\n'));
  assert.ok(hasProblem(p3, 'picker rows are not_connected and healthy accounts are measured', LI), p3.join('\n'));

  const missingRow = structuredClone(clean.findings);
  delete missingRow.platforms[PICKER];
  const p4 = checks(clean.transcript, { run: clean.dir, findings: missingRow, report: clean.report });
  assert.ok(hasProblem(p4, 'findings.platforms names every account with one of the four states', 'differ from the roster'), p4.join('\n'));

  const badState = structuredClone(clean.findings);
  badState.platforms[FB] = 'ok';
  const p5 = checks(clean.transcript, { run: clean.dir, findings: badState, report: clean.report });
  assert.ok(hasProblem(p5, 'findings.platforms names every account with one of the four states', 'is not one of'), p5.join('\n'));
});

test('social-report: checks fail a 7-day summary labelled as the quarter, and a report that never names the summary', async () => {
  const clean = await syntheticRun();
  const mislabelled = clean.report
    .replace('social_analytics_summary is always the trailing 7 days, never the quarter:', 'Quarter totals (social_analytics_summary):')
    .replace('- The same 7-day summary names', '- The summary also names');
  const p1 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: mislabelled });
  assert.ok(hasProblem(p1, 'the summary is quoted as the trailing 7 days', 'does not say it is the trailing 7 days'), p1.join('\n'));

  // the figure alone, on a line with no marker and no tool name, is caught too
  const bare = clean.report.replace(/^- social_analytics_summary is always.*$/m, `- The quarter closed on ${SUMMARY.metrics.impressions} impressions and ${SUMMARY.metrics.reach} reach.`);
  const p2 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: bare });
  assert.ok(hasProblem(p2, 'the summary is quoted as the trailing 7 days', String(SUMMARY.metrics.impressions)), p2.join('\n'));

  const unnamed = clean.report.replace(/social_analytics_summary/g, 'the summary');
  const p3 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: unnamed });
  assert.ok(hasProblem(p3, 'the summary names its call', 'never names social_analytics_summary'), p3.join('\n'));
});

test('social-report: checks fail a stopped post quoted as current, a missing stopped-syncing line, a failed version unnamed, and an unsynced worst post', async () => {
  const clean = await syntheticRun();
  const current = clean.report
    .replace(`${STOPPED} is past the 90-day ladder and is quoted as of 2026-08-25, its final snapshot.`, `${STOPPED} pulled 1180 impressions this quarter.`);
  const p1 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: current });
  assert.ok(hasProblem(p1, 'stopped posts are counted and quoted as of their last sync', `${STOPPED} is quoted as current`), p1.join('\n'));

  const noLine = clean.report.split('\n').filter((l) => !/stopped syncing/i.test(l)).join('\n');
  const p2 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: noLine });
  assert.ok(hasProblem(p2, 'stopped posts are counted and quoted as of their last sync', 'no freshness line'), p2.join('\n'));

  const miscounted = clean.report.replace(`(${STOPPED_POSTS.length} post: ${STOPPED}, as of 2026-08-25)`, `(3 posts: ${STOPPED}, as of 2026-08-25)`);
  const p3 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: miscounted });
  assert.ok(hasProblem(p3, 'stopped posts are counted and quoted as of their last sync', 'does not carry the count'), p3.join('\n'));

  const averaged = clean.report.split('\n').map((l) => (l.includes(FAILED) ? l.replace(/failed/gi, 'shipped').replace(/partial/gi, 'fine') : l)).join('\n');
  const p4 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: averaged });
  assert.ok(hasProblem(p4, 'a failed version is named as failed, not averaged in', FAILED), p4.join('\n'));

  const unnamed = clean.report.split('\n').filter((l) => !l.includes(FAILED)).join('\n');
  const p5 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: unnamed });
  assert.ok(hasProblem(p5, 'a failed version is named as failed, not averaged in', 'never names it'), p5.join('\n'));

  const worst = clean.report.replace(/^- The same 7-day summary names .*$/m, '- Worst post of the closing week (7-day summary): post_q_30 with 0 engagements.');
  const p6 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: worst });
  assert.ok(hasProblem(p6, 'never-synced posts are never the worst post or a zero', 'calls it the worst post'), p6.join('\n'));
  assert.ok(hasProblem(p6, 'never-synced posts are never the worst post or a zero', 'gives it a zero'), p6.join('\n'));
});

test('social-report: checks fail the lifetime pillar count used as delivery, missing freshness lines, and a silent empty timeseries', async () => {
  const clean = await syntheticRun();
  const lifetime = clean.report.replace(/^- Educate: .*$/m, `- Educate: ${EDUCATE_LIFETIME} posts against a 40% target.`);
  const p1 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: lifetime });
  assert.ok(hasProblem(p1, 'pillar delivery uses the windowed count', `carries ${EDUCATE_LIFETIME}`), p1.join('\n'));
  assert.ok(hasProblem(p1, 'pillar delivery uses the windowed count', `window's published count (${EDUCATE_WINDOW}`), p1.join('\n'));

  const noFreshness = clean.report.split('\n').filter((l) => !/synced through|daily snapshots through|of 60 X posts/i.test(l)).join('\n');
  const p2 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: noFreshness });
  assert.ok(hasProblem(p2, 'the freshness lines are present', 'synced through'), p2.join('\n'));

  const silent = clean.report.split('\n').filter((l) => !/timeseries/i.test(l)).join('\n');
  const p3 = checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: silent });
  assert.ok(hasProblem(p3, 'an empty timeseries is said to be unavailable', 'never says'), p3.join('\n'));
});

test('social-report: checks fail a memory write-back that drops the prior document, and a run that filed nothing', async () => {
  const dropped = await syntheticRun({ memoryContent: '2026-09-01 quarter report: 30 posts, X broken, Instagram unsynced.' });
  const p1 = checks(dropped.transcript, { run: dropped.dir, findings: dropped.findings, report: dropped.report });
  assert.ok(hasProblem(p1, 'memory write-back keeps the prior document', 'prior document'), p1.join('\n'));

  const clean = await syntheticRun();
  const prior = loadJson('dataset', 'misc.json').memory.entries[0].content;
  const unchanged = await syntheticRun({ memoryContent: prior });
  const p2 = checks(unchanged.transcript, { run: unchanged.dir, findings: unchanged.findings, report: unchanged.report });
  assert.ok(hasProblem(p2, 'memory write-back keeps the prior document', 'nothing appended'), p2.join('\n'));

  const unfiled = await syntheticRun({ tasks: 0 });
  const p3 = checks(unfiled.transcript, { run: unfiled.dir, findings: unfiled.findings, report: unfiled.report });
  assert.ok(hasProblem(p3, 'the work is filed', 'no pm_tasks_create'), p3.join('\n'));
  assert.deepEqual(checks(clean.transcript, { run: clean.dir, findings: clean.findings, report: clean.report }), []);
});

// ── findings-check over this fixture's traps ────────────────────────────────
test('social-report: findings-check names the traps - the empty account as measured, the picker as not_synced, the 88-day post as stopped', () => {
  const expected = loadJson('expected-findings.json');
  const dir = tmpDir();
  const findings = {
    categories: Object.fromEntries(CATEGORIES.map((name) => [name, [...expected.categories[name].must]])),
    platforms: { ...expected.platform_states },
  };
  findings.categories.measured.push(IG);
  findings.categories.not_synced = [PICKER];
  findings.categories.stopped_posts.push('post_q_02');
  findings.categories.failed_versions = ['post_q_29'];
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  const res = spawnSync(process.execPath, [path.join(EVALS, 'checkers', 'findings-check.mjs'), '--expected', path.join(FIX, 'expected-findings.json'), '--actual', path.join(dir, 'findings.json')], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stdout, new RegExp(`measured: FALSE POSITIVE ${IG} - known trap: .*EMPTY`));
  assert.match(res.stdout, new RegExp(`not_synced: MISSED seeded finding ${IG}`));
  assert.match(res.stdout, new RegExp(`not_synced: FALSE POSITIVE ${PICKER} - known trap: .*picker row`));
  assert.match(res.stdout, /stopped_posts: FALSE POSITIVE post_q_02 - known trap: .*88 days/);
  assert.match(res.stdout, new RegExp(`failed_versions: MISSED seeded finding ${FAILED}`));
  assert.match(res.stdout, /failed_versions: FALSE POSITIVE post_q_29 - known trap: .*never synced/);
  assert.doesNotMatch(res.stdout, /unknown category/, 'platforms and report_id beside categories are not invented classes');
});

// ── The mock server serves this fixture ─────────────────────────────────────
function rpcSession(transcriptPath, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(EVALS, 'bin', 'mock-mcp.mjs'),
      '--fixture', FIX,
      '--transcript', transcriptPath,
    ]);
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

test('social-report: mock-mcp handshake, tools/list, tools/call, refusal logged to the transcript', async () => {
  const transcript = path.join(tmpDir(), 'transcript.jsonl');
  const responses = await rpcSession(transcript, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'social_analytics_sync', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'social_account_analytics', arguments: { social_account_id: IG, from_date: WINDOW.from, to_date: WINDOW.to, limit: 100 } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'marketing_report_send', arguments: { report_id: 'rep_social_1' } } },
  ]);
  const byId = new Map(responses.map((r) => [r.id, r]));
  assert.equal(byId.get(1).result.serverInfo.name, 'hk-mock');
  const names = byId.get(2).result.tools.map((t) => t.name);
  for (const n of [...SYNC_TOOLS, ...PER_POST_METRIC_READS, ...FORBIDDEN_WRITES, ...INCOMING_TOOLS, 'account_context_get', 'social_list_accounts', 'social_account_analytics', 'social_analytics_followers', 'social_analytics_summary', 'social_pillar_list', 'marketing_report_create', 'marketing_report_regenerate', 'marketing_report_share_link', 'memory_list', 'memory_update', 'pm_projects_list', 'pm_tasks_create']) {
    assert.ok(names.includes(n), `tools/list must advertise ${n}`);
  }
  const sync = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(sync.data.scanned, 29);
  const rows = JSON.parse(byId.get(4).result.content[0].text);
  assert.deepEqual(rows.data, []);
  assert.equal(rows.pagination.total, 0);
  const send = JSON.parse(byId.get(5).result.content[0].text);
  assert.equal(send.refused, true);

  const logged = loadTranscript(transcript);
  assert.equal(logged.length, 3);
  assert.deepEqual(logged.map((c) => c.name), ['social_analytics_sync', 'social_account_analytics', 'marketing_report_send']);
  assert.equal(logged[1].arguments.social_account_id, IG);
  assert.equal(callsTo(logged, 'marketing_report_send')[0].result.refused, true);
});
