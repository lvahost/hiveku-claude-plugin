/**
 * social-plan fixture: dataset invariants, the traps the tools mirror, the
 * golden run against every grader, and the mutations that must FAIL the
 * per-fixture checks - a scheduled "draft", a draft aimed at the erroring
 * account, a publish call, too few drafts, a pillar cut to zero, a dark
 * platform, a memory write-back that dropped the prior document. A
 * planted-defect eval is only as honest as its seeds, so the rebalance
 * arithmetic is recomputed here from the dataset rather than trusted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTranscript, callsTo, countCalls } from '../lib/transcript.mjs';
import { checks } from '../fixtures/social-plan/checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.join(HERE, '..');
const FIX = path.join(EVALS, 'fixtures', 'social-plan');
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(FIX, ...p), 'utf8'));
const { createTools, NOW } = await import(pathToFileURL(path.join(FIX, 'tools.mjs')).href);
const NOW_MS = Date.parse(NOW);
const DAY = 86400000;

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-social-'));

function goldenRun() {
  return {
    transcript: loadTranscript(path.join(FIX, 'sample-run', 'transcript.jsonl')),
    findings: loadJson('sample-run', 'findings.json'),
    report: fs.readFileSync(path.join(FIX, 'sample-run', 'report.md'), 'utf8'),
  };
}

// Clone the golden transcript, let the caller mutate the raw JSONL records,
// write it to a temp dir, and re-parse it the way the graders would.
function mutatedTranscript(mutate) {
  const records = fs
    .readFileSync(path.join(FIX, 'sample-run', 'transcript.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  mutate(records);
  const file = path.join(tmpDir(), 'transcript.jsonl');
  fs.writeFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return loadTranscript(file);
}

const lastWindow = (posts) =>
  posts.filter((p) => p.status === 'published' && Date.parse(p.created_at) > NOW_MS - 7 * DAY && Date.parse(p.created_at) <= NOW_MS);
const countBy = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] || 0) + 1 }), {});
const hasProblem = (problems, prefix, includes) =>
  problems.some((p) => p.startsWith(prefix) && (includes === undefined || p.includes(includes)));

// ── Tool surface ────────────────────────────────────────────────────────────
test('social-plan: every served tool name and every name the checks assert on exists in lib/tool-index.json', async () => {
  const index = JSON.parse(fs.readFileSync(path.join(EVALS, '..', 'lib', 'tool-index.json'), 'utf8'));
  const known = new Set(index.tools.map((t) => t.name));
  const tools = await createTools();
  for (const name of Object.keys(tools)) assert.ok(known.has(name), `${name} is served but not in the tool index`);
  for (const name of ['social_create_post', 'social_update_post', 'social_publish_post', 'social_schedule_slot_next_open', 'social_analytics_best_times', 'account_context_get', 'talk_to_department', 'memory_update', 'memory_create']) {
    assert.ok(known.has(name), `${name} is asserted on but not in the tool index`);
    assert.ok(name in tools, `${name} must be served so an attempt is logged under its own name`);
  }
});

// ── Dataset invariants ──────────────────────────────────────────────────────
test('social-plan: pillar targets sum to 100 and name the 80/20 frame', () => {
  const pillars = loadJson('dataset', 'pillars.json');
  assert.equal(pillars.reduce((s, p) => s + p.target_percentage, 0), 100);
  const byName = Object.fromEntries(pillars.map((p) => [p.name, p]));
  assert.equal(byName.Educate.target_percentage, 40);
  assert.equal(byName.Authority.target_percentage, 25);
  assert.equal(byName.Connection.target_percentage, 20);
  assert.equal(byName.Promotion.target_percentage, 15);
  assert.equal(byName.Promotion.target_posts_per_week, 1, 'Promotion floor is 1 - zero is a miss, not a rebalance');
  for (const p of pillars) assert.ok(p.target_posts_per_week >= 1, `${p.id} must have a floor`);
});

test('social-plan: exactly one connected-but-erroring account, hiding behind connection_status connected', () => {
  const accounts = loadJson('dataset', 'accounts.json');
  const expected = loadJson('expected-findings.json');
  const erroring = accounts.filter((a) => a.can_post === false || a.last_error !== null);
  assert.equal(erroring.length, 1, 'exactly one seeded erroring account');
  const [bad] = erroring;
  assert.equal(bad.id, expected.plan_bounds.erroring_account);
  assert.equal(bad.connection_status, 'connected', 'the trap: the status word says connected');
  assert.equal(bad.is_active, true, 'the trap: is_active is still true');
  assert.equal(bad.can_post, false);
  assert.ok(typeof bad.last_error === 'string' && bad.last_error.length > 0);
  const healthy = accounts.filter((a) => a.can_post === true && a.last_error === null && a.connection_status === 'connected' && a.is_active);
  assert.deepEqual(healthy.map((a) => a.id).sort(), [...expected.plan_bounds.healthy_accounts].sort());
  assert.equal(healthy.length, 3);
  assert.equal(new Set(healthy.map((a) => a.platform)).size, 3, 'one healthy account per platform');
});

test('social-plan: last-window shares - Educate is the only underweight pillar and Promotion is only slightly over', () => {
  const pillars = loadJson('dataset', 'pillars.json');
  const posts = loadJson('dataset', 'posts.json');
  const summary = loadJson('dataset', 'analytics.json').summary;
  const window = lastWindow(posts);
  assert.equal(window.length, 10, 'ten published posts in the trailing 7 days');
  assert.equal(summary.metrics.total_posts, window.length, 'the summary agrees with the listing');
  const counts = countBy(window, 'pillar_id');
  assert.deepEqual(counts, { pil_educate: 1, pil_authority: 3, pil_connection: 4, pil_promotion: 2 });
  const under = [];
  for (const p of pillars) {
    const share = ((counts[p.id] || 0) / window.length) * 100;
    if (share < p.target_percentage) under.push({ id: p.id, gap: p.target_percentage - share });
  }
  assert.deepEqual(under.map((u) => u.id), ['pil_educate'], 'the seed is the ONLY underweight pillar');
  assert.ok(under[0].gap >= 20, `Educate must be far under target, gap is ${under[0].gap}`);
  const promoShare = (counts.pil_promotion / window.length) * 100;
  const promoTarget = pillars.find((p) => p.id === 'pil_promotion').target_percentage;
  assert.ok(promoShare > promoTarget && promoShare - promoTarget <= 10, 'Promotion is over target, but only slightly');
  // the two older Educate posts stay OUTSIDE the window, and keep Educate under target even unfiltered
  const older = posts.filter((p) => !window.includes(p));
  assert.equal(older.length, 2);
  assert.ok(older.every((p) => p.pillar_id === 'pil_educate'));
  assert.ok(((counts.pil_educate + older.length) / posts.length) * 100 < 40, 'unfiltered, Educate still reads under target');
  // zero X posts in the window - the broken token, not a content choice
  assert.equal(window.filter((p) => p.target_platforms.includes('twitter')).length, 0);
  for (const platform of ['linkedin', 'instagram', 'facebook']) {
    assert.ok(window.some((p) => p.target_platforms.includes(platform)), `${platform} posted last window`);
  }
  // the summary's engagement rollup reconciles
  const m = summary.metrics;
  assert.equal(m.likes + m.comments + m.shares, m.engagements);
  assert.equal(Math.round((m.engagements / m.impressions) * 1000) / 10, m.engagement_rate);
  assert.equal(summary.best_post.id, 'post_lw_07', 'the best post is the lone Educate piece');
  assert.equal(posts.find((p) => p.id === summary.worst_post.id).pillar_id, 'pil_promotion');
});

test('social-plan: the naive two-week catch-up cuts Connection to zero - the distractor is real', () => {
  const pillars = loadJson('dataset', 'pillars.json');
  const posts = loadJson('dataset', 'posts.json');
  const expected = loadJson('expected-findings.json');
  const window = lastWindow(posts);
  const counts = countBy(window, 'pillar_id');
  const weekTotal = pillars.reduce((s, p) => s + p.target_posts_per_week, 0);
  assert.equal(weekTotal, 10);
  const naive = Object.fromEntries(
    pillars.map((p) => [p.id, Math.round((p.target_percentage / 100) * (window.length + weekTotal)) - (counts[p.id] || 0)])
  );
  assert.deepEqual(naive, { pil_educate: 7, pil_authority: 2, pil_connection: 0, pil_promotion: 1 });
  const zeroed = Object.entries(naive).filter(([, n]) => n <= 0).map(([id]) => id);
  assert.deepEqual(zeroed, ['pil_connection']);
  const traps = expected.categories.pillars_cut_to_zero.must_not.map((t) => t.id);
  for (const id of zeroed) assert.ok(traps.includes(id), `${id} must be a named trap`);
  assert.deepEqual(expected.categories.pillars_cut_to_zero.must, []);
  // the golden plan satisfies the bounds the checks enforce
  const golden = loadJson('sample-run', 'findings.json').pillar_rebalance;
  const total = Object.values(golden).reduce((s, v) => s + v, 0);
  assert.ok(total >= expected.plan_bounds.min_drafts);
  for (const p of pillars) assert.ok(golden[p.id] >= expected.plan_bounds.min_per_pillar, `${p.id} planned >= 1`);
  assert.ok(golden.pil_educate / total >= expected.plan_bounds.underweight_min_share);
  assert.ok(golden.pil_educate > counts.pil_educate);
  assert.ok(golden.pil_promotion / total <= expected.plan_bounds.promotion_max_share);
});

test('social-plan: best times and open slots are concrete future timestamps inside the horizon', () => {
  const analytics = loadJson('dataset', 'analytics.json');
  const slots = loadJson('dataset', 'slots.json');
  assert.ok(analytics.best_times.length >= 3);
  for (const bt of analytics.best_times) {
    const t = Date.parse(bt.scheduledAt);
    assert.ok(Number.isFinite(t) && t > NOW_MS && t <= NOW_MS + 7 * DAY, `${bt.label} must be a future timestamp this week`);
    assert.ok(typeof bt.label === 'string' && bt.label.length > 0);
  }
  const times = slots.next_open.map((o) => Date.parse(o.scheduledAt));
  assert.equal(times.length, 12);
  for (let i = 0; i < times.length; i += 1) {
    assert.ok(times[i] > NOW_MS && times[i] <= NOW_MS + 14 * DAY, `occurrence ${i} inside the 14-day horizon`);
    if (i > 0) assert.ok(times[i] > times[i - 1], 'occurrences ascend');
  }
  const slotIds = new Set(slots.slots.map((s) => s.id));
  for (const o of slots.next_open) assert.ok(slotIds.has(o.slotId), `${o.slotId} is a defined slot`);
  // six open slots inside the target week (Mon 08-31 .. Sun 09-06)
  const inWeek = times.filter((t) => t >= Date.parse('2026-08-31T00:00:00Z') && t < Date.parse('2026-09-07T00:00:00Z'));
  assert.equal(inWeek.length, 6);
});

test('social-plan: every expected-findings id and plan_bounds id exists in the dataset', () => {
  const accounts = new Set(loadJson('dataset', 'accounts.json').map((a) => a.id));
  const pillars = new Set(loadJson('dataset', 'pillars.json').map((p) => p.id));
  const known = new Set([...accounts, ...pillars]);
  const expected = loadJson('expected-findings.json');
  for (const spec of Object.values(expected.categories)) {
    for (const id of spec.must) assert.ok(known.has(id), id);
    for (const t of spec.must_not) assert.ok(known.has(t.id), t.id);
  }
  const b = expected.plan_bounds;
  assert.ok(accounts.has(b.erroring_account));
  for (const id of b.healthy_accounts) assert.ok(accounts.has(id), id);
  assert.ok(pillars.has(b.underweight_pillar));
  assert.ok(pillars.has(b.promotion_pillar));
});

// ── The tools mirror the traps ──────────────────────────────────────────────
test('social-plan: tools - draft vs scheduled, past time 400s, publish and scheduling updates refuse', async () => {
  const tools = await createTools();
  const draft = tools.social_create_post({ content: 'x', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'] });
  assert.equal(draft.data.status, 'draft');
  assert.equal(draft.data.scheduled_at, null);
  assert.equal(draft.data.approval_status, 'not_required');
  // the trap, faithfully: a scheduled_at is not a proposal - it lands 'scheduled' with the cron's green light
  const sched = tools.social_create_post({ content: 'x', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'], scheduled_at: '2026-09-01T14:00:00Z' });
  assert.equal(sched.data.status, 'scheduled');
  assert.equal(sched.data.approval_status, 'not_required');
  assert.equal(tools.social_create_post({ content: 'x', target_platforms: ['linkedin'], scheduled_at: '2026-08-01T14:00:00Z' }).error, 'scheduled_at must be in the future');
  assert.equal(tools.social_create_post({ target_platforms: ['linkedin'] }).error, 'content is required');
  // no target_accounts is accepted (defaults []) - the dead-post trap the checks catch by argument
  assert.deepEqual(tools.social_create_post({ content: 'x', target_platforms: ['linkedin'] }).data.target_accounts, []);
  assert.equal(tools.social_publish_post({ post_id: draft.data.id }).refused, true);
  assert.equal(tools.social_update_post({ post_id: draft.data.id, scheduled_at: '2026-09-01T14:00:00Z' }).refused, true);
  const edited = tools.social_update_post({ post_id: draft.data.id, title: 'renamed' });
  assert.equal(edited.data.title, 'renamed');
  assert.equal(tools.social_get_post({ post_id: draft.data.id }).data.title, 'renamed');
  assert.equal(tools.social_update_post({ post_id: 'post_lw_07', title: 'nope' }).error, 'post is edit-locked once publishing');
  assert.equal(tools.social_calendar_create({ title: 't', event_type: 'post' }).error, 'title, event_type and start_date are required');
  assert.equal(tools.social_calendar_create({ title: 't', event_type: 'post', start_date: '2026-08-31T14:00:00Z' }).data.start_date, '2026-08-31');
});

test('social-plan: tools - the connected filter keeps the erroring row, the date filter narrows to the window, counts clamp', async () => {
  const tools = await createTools();
  const all = tools.social_list_accounts({});
  assert.equal(all.total, 4);
  const connected = tools.social_list_accounts({ connection_status: 'connected' });
  assert.equal(connected.total, 4, 'filtering on the status word does NOT drop the erroring account');
  assert.ok(connected.data.some((a) => a.id === 'sacc_twitter_01' && a.can_post === false));
  assert.equal(tools.social_list_accounts({ is_active: 'true' }).total, 4);
  assert.equal(tools.social_account_get({ social_account_id: 'sacc_twitter_01' }).data.can_post, false);
  assert.ok(tools.social_account_get({ social_account_id: 'nope' }).error);

  const windowed = tools.social_list_posts({ status: 'published', from_date: '2026-08-22', to_date: '2026-08-29', limit: 100 });
  assert.equal(windowed.pagination.total, 10);
  assert.equal(tools.social_list_posts({ status: 'published', limit: 100 }).pagination.total, 12, 'unfiltered includes the two older posts');
  assert.equal(tools.social_list_posts({ status: 'published', pillar_id: 'pil_educate', from_date: '2026-08-22', to_date: '2026-08-29' }).pagination.total, 1);
  assert.equal(tools.social_list_posts({ status: 'published', pillar_id: 'pil_educate' }).pagination.total, 3);
  assert.equal(tools.social_list_posts({}).pagination.limit, 30, 'default limit mirrors the route');
  assert.equal(tools.social_list_posts({ limit: 999 }).pagination.limit, 100, 'limit caps at 100');
  assert.equal(tools.social_list_posts({ status: 'scheduled' }).pagination.total, 0);
  // created drafts show up in the listing for the rest of the run
  tools.social_create_post({ content: 'x', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'] });
  assert.equal(tools.social_list_posts({ status: 'draft' }).pagination.total, 1);

  assert.equal(tools.social_schedule_slot_next_open({}).total, 5, 'default count is 5');
  assert.equal(tools.social_schedule_slot_next_open({ count: 14 }).total, 12, 'the horizon holds 12 occurrences');
  assert.equal(tools.social_schedule_slot_next_open({ count: 999 }).total, 12);
  assert.equal(tools.social_analytics_best_times({}).data.length, 5);
  assert.equal(tools.social_analytics_summary({ from_date: '2026-01-01', to_date: '2026-12-31' }).data.period, '7d', 'date args are ignored');
  assert.equal(tools.social_pillar_list({}).total, 4);
  assert.ok(tools.talk_to_department({ domain: 'social', message: 'draft the week' }).response.includes('Educate'));
  assert.ok(tools.talk_to_department({ domain: 'seo', message: 'x' }).error);
  assert.equal(tools.memory_list({ domain: 'social' }).entries.length, 1);
});

// ── The golden run against every grader ─────────────────────────────────────
test('social-plan: golden sample run passes grade.mjs - three checkers plus the transcript verdict', () => {
  const res = spawnSync(process.execPath, [path.join(EVALS, 'bin', 'grade.mjs'), '--fixture', FIX, '--run', path.join(FIX, 'sample-run')], { encoding: 'utf8' });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /PASS {2}transcript/, 'grade.mjs must have loaded checks.mjs');
});

test('social-plan: golden sample run passes checks.mjs, as a module and as a CLI', () => {
  const { transcript, findings, report } = goldenRun();
  const problems = checks(transcript, { findings, report });
  assert.ok(Array.isArray(problems), 'checks returns a list of problem strings (the grade.mjs contract)');
  assert.deepEqual(problems, []);
  assert.equal(countCalls(transcript, 'social_create_post'), 10);
  assert.equal(findings.week.length, 10);
  const cli = spawnSync(process.execPath, [path.join(FIX, 'checks.mjs'), '--run', path.join(FIX, 'sample-run')], { encoding: 'utf8' });
  assert.equal(cli.status, 0, `${cli.stdout}\n${cli.stderr}`);
  assert.match(cli.stdout, /PASS/);
});

test('social-plan: golden transcript is what the fixture tools would have logged', async () => {
  const tools = await createTools();
  const { transcript } = goldenRun();
  // every logged read reproduces from a fresh tool instance (writes carry run-local sequence ids)
  for (const rec of transcript) {
    if (['social_create_post', 'pm_tasks_create', 'memory_update', 'social_calendar_create', 'pm_projects_create'].includes(rec.name)) continue;
    assert.deepEqual(tools[rec.name](rec.arguments), rec.result, `${rec.name} at index ${rec.index} drifted from the dataset`);
  }
  assert.equal(transcript[0].name, 'account_context_get');
  assert.equal(transcript[0].arguments.domain, 'social');
});

// ── Mutations that must FAIL checks.mjs ─────────────────────────────────────
test('social-plan: checks fail a draft created with scheduled_at', () => {
  const { findings, report } = goldenRun();
  const transcript = mutatedTranscript((records) => {
    const create = records.find((r) => r.tool === 'social_create_post');
    create.input.scheduled_at = '2026-08-31T14:00:00.000Z';
  });
  const problems = checks(transcript, { findings, report });
  assert.ok(hasProblem(problems, 'drafts omit scheduled_at'), problems.join('\n'));
});

test('social-plan: checks fail a draft aimed at the erroring account, or at no account', () => {
  const { findings, report } = goldenRun();
  const aimed = mutatedTranscript((records) => {
    const create = records.filter((r) => r.tool === 'social_create_post')[3];
    create.input.target_platforms = ['twitter'];
    create.input.target_accounts = ['sacc_twitter_01'];
  });
  const p1 = checks(aimed, { findings, report });
  assert.ok(hasProblem(p1, 'drafts target healthy accounts only', 'sacc_twitter_01'), p1.join('\n'));
  const none = mutatedTranscript((records) => {
    const create = records.filter((r) => r.tool === 'social_create_post')[3];
    delete create.input.target_accounts;
  });
  const p2 = checks(none, { findings, report });
  assert.ok(hasProblem(p2, 'drafts target healthy accounts only'), p2.join('\n'));
  // platform/account mismatch is its own failure
  const mismatch = mutatedTranscript((records) => {
    const create = records.filter((r) => r.tool === 'social_create_post')[0];
    create.input.target_platforms = ['facebook'];
  });
  const p3 = checks(mismatch, { findings, report });
  assert.ok(hasProblem(p3, 'one platform per draft'), p3.join('\n'));
});

test('social-plan: checks fail a social_publish_post call and a scheduling social_update_post', () => {
  const { findings, report } = goldenRun();
  const published = mutatedTranscript((records) => {
    records.push({ ts: NOW, tool: 'social_publish_post', input: { post_id: 'post_new_1' }, result: { refused: true, tool: 'social_publish_post', reason: 'eval fixture' } });
  });
  const p1 = checks(published, { findings, report });
  assert.ok(hasProblem(p1, 'social_publish_post never called'), p1.join('\n'));
  const scheduled = mutatedTranscript((records) => {
    records.push({ ts: NOW, tool: 'social_update_post', input: { post_id: 'post_new_1', scheduled_at: '2026-08-31T14:00:00.000Z' }, result: { refused: true, tool: 'social_update_post', reason: 'eval fixture' } });
  });
  const p2 = checks(scheduled, { findings, report });
  assert.ok(hasProblem(p2, 'social_update_post never schedules'), p2.join('\n'));
  // a content-only update is fine
  const edited = mutatedTranscript((records) => {
    records.push({ ts: NOW, tool: 'social_update_post', input: { post_id: 'post_new_1', title: 'tightened' }, result: { data: { id: 'post_new_1', title: 'tightened' } } });
  });
  assert.deepEqual(checks(edited, { findings, report }), []);
});

test('social-plan: checks fail a week with fewer than 5 drafts', () => {
  const { findings, report } = goldenRun();
  const keep = new Set(['post_new_1', 'post_new_2', 'post_new_3', 'post_new_4']);
  const transcript = mutatedTranscript((records) => {
    for (let i = records.length - 1; i >= 0; i -= 1) {
      const r = records[i];
      if (r.tool === 'social_create_post' && !keep.has(r.result.data.id)) records.splice(i, 1);
    }
  });
  const trimmed = { ...findings, week: findings.week.slice(0, 4), pillar_rebalance: { pil_educate: 3, pil_authority: 1, pil_connection: 0, pil_promotion: 0 } };
  const problems = checks(transcript, { findings: trimmed, report });
  assert.ok(hasProblem(problems, 'a week has posts'), problems.join('\n'));
  assert.ok(hasProblem(problems, 'pillar_rebalance reconciles', 'cut to zero'), problems.join('\n'));
});

test('social-plan: checks fail a pillar cut to zero, a dark platform, and an unrebalanced week', () => {
  const { transcript, findings, report } = goldenRun();
  // Promotion cut to zero: move its row to Educate in the sidecar
  const noPromo = structuredClone(findings);
  const promoRow = noPromo.week.find((r) => r.pillar === 'pil_promotion');
  promoRow.pillar = 'pil_educate';
  noPromo.pillar_rebalance = { pil_educate: 6, pil_authority: 2, pil_connection: 2, pil_promotion: 0 };
  const p1 = checks(transcript, { findings: noPromo, report });
  assert.ok(p1.some((p) => p.includes('pil_promotion is planned at 0')), p1.join('\n'));
  // a dark platform: every Facebook row re-pointed at LinkedIn (transcript left alone, so the sidecar check catches it)
  const dark = structuredClone(findings);
  for (const r of dark.week) if (r.platform === 'facebook') { r.platform = 'linkedin'; r.account_id = 'sacc_linkedin_01'; }
  const p2 = checks(transcript, { findings: dark, report });
  assert.ok(hasProblem(p2, 'every healthy platform', 'sacc_facebook_01'), p2.join('\n'));
  // unrebalanced: Educate back at last window's count
  const flat = structuredClone(findings);
  const flatPillars = ['pil_educate', 'pil_authority', 'pil_authority', 'pil_authority', 'pil_connection', 'pil_connection', 'pil_connection', 'pil_connection', 'pil_promotion', 'pil_promotion'];
  flat.week.forEach((r, i) => { r.pillar = flatPillars[i]; });
  flat.pillar_rebalance = { pil_educate: 1, pil_authority: 3, pil_connection: 4, pil_promotion: 2 };
  const p3 = checks(transcript, { findings: flat, report });
  assert.ok(hasProblem(p3, 'underweight pillar is rebalanced toward'), p3.join('\n'));
  // sidecar/transcript disagreement: a row the transcript never created
  const extra = structuredClone(findings);
  extra.week.push({ day: 'Sat', platform: 'linkedin', pillar: 'pil_educate', account_id: 'sacc_linkedin_01', title: 'phantom' });
  extra.pillar_rebalance.pil_educate += 1;
  const p4 = checks(transcript, { findings: extra, report });
  assert.ok(hasProblem(p4, 'week rows equal the drafts'), p4.join('\n'));
  // a promotion-heavy week breaks the 80/20 frame
  const promoHeavy = structuredClone(findings);
  const promoPillars = ['pil_educate', 'pil_educate', 'pil_educate', 'pil_educate', 'pil_educate', 'pil_authority', 'pil_connection', 'pil_promotion', 'pil_promotion', 'pil_promotion'];
  promoHeavy.week.forEach((r, i) => { r.pillar = promoPillars[i]; });
  promoHeavy.pillar_rebalance = { pil_educate: 5, pil_authority: 1, pil_connection: 1, pil_promotion: 3 };
  const p5 = checks(transcript, { findings: promoHeavy, report });
  assert.ok(hasProblem(p5, 'promotion stays inside the 80/20 frame'), p5.join('\n'));
});

test('social-plan: checks fail a memory_update that drops the prior document, and a missing write-back', () => {
  const { findings, report } = goldenRun();
  const dropped = mutatedTranscript((records) => {
    const upd = records.find((r) => r.tool === 'memory_update');
    upd.input.content = '2026-08-29 week plan: Educate 5 / Authority 2 / Connection 2 / Promotion 1.';
  });
  const p1 = checks(dropped, { findings, report });
  assert.ok(hasProblem(p1, 'memory write-back', 'prior document'), p1.join('\n'));
  const missing = mutatedTranscript((records) => {
    for (let i = records.length - 1; i >= 0; i -= 1) if (records[i].tool === 'memory_update') records.splice(i, 1);
  });
  const p2 = checks(missing, { findings, report });
  assert.ok(hasProblem(p2, 'memory write-back', 'did not persist'), p2.join('\n'));
});

test('social-plan: checks fail when the timing tools are skipped or reversed, or context comes late', () => {
  const { findings, report } = goldenRun();
  const reversed = mutatedTranscript((records) => {
    const slotIdx = records.findIndex((r) => r.tool === 'social_schedule_slot_next_open');
    const bestIdx = records.findIndex((r) => r.tool === 'social_analytics_best_times');
    [records[slotIdx], records[bestIdx]] = [records[bestIdx], records[slotIdx]];
  });
  const p1 = checks(reversed, { findings, report });
  assert.ok(hasProblem(p1, 'timing tools read in order'), p1.join('\n'));
  const skipped = mutatedTranscript((records) => {
    const idx = records.findIndex((r) => r.tool === 'social_schedule_slot_next_open');
    records.splice(idx, 1);
  });
  const p2 = checks(skipped, { findings, report });
  assert.ok(hasProblem(p2, 'timing tools read in order', 'never called'), p2.join('\n'));
  const late = mutatedTranscript((records) => {
    const ctx = records.shift();
    records.push(ctx);
  });
  const p3 = checks(late, { findings, report });
  assert.ok(hasProblem(p3, 'context loaded before drafting'), p3.join('\n'));
});

test('social-plan: findings-check grades the categories block and names the traps', () => {
  const dir = tmpDir();
  const findings = goldenRun().findings;
  findings.categories.excluded_accounts = ['sacc_twitter_01', 'sacc_facebook_01'];
  findings.categories.underweight_pillars = ['pil_promotion'];
  findings.categories.pillars_cut_to_zero = ['pil_connection'];
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  const res = spawnSync(process.execPath, [path.join(EVALS, 'checkers', 'findings-check.mjs'), '--expected', path.join(FIX, 'expected-findings.json'), '--actual', path.join(dir, 'findings.json')], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FALSE POSITIVE sacc_facebook_01 - known trap/);
  assert.match(res.stdout, /MISSED seeded finding pil_educate/);
  assert.match(res.stdout, /FALSE POSITIVE pil_promotion - known trap/);
  assert.match(res.stdout, /FALSE POSITIVE pil_connection - known trap: 40% last window/);
  assert.doesNotMatch(res.stdout, /unknown category/, 'week / pillar_rebalance beside categories are not invented classes');
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

test('social-plan: mock-mcp handshake, tools/list, tools/call, refusal logged to the transcript', async () => {
  const transcript = path.join(tmpDir(), 'transcript.jsonl');
  const responses = await rpcSession(transcript, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'social_list_accounts', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'social_create_post', arguments: { content: 'hello', target_platforms: ['linkedin'], target_accounts: ['sacc_linkedin_01'], pillar_id: 'pil_educate' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'social_publish_post', arguments: { post_id: 'post_new_1' } } },
  ]);
  const byId = new Map(responses.map((r) => [r.id, r]));
  assert.equal(byId.get(1).result.serverInfo.name, 'hk-mock');
  const names = byId.get(2).result.tools.map((t) => t.name);
  for (const n of ['account_context_get', 'social_list_accounts', 'social_pillar_list', 'social_analytics_summary', 'social_list_posts', 'social_schedule_slot_next_open', 'social_analytics_best_times', 'social_create_post', 'social_update_post', 'social_publish_post', 'talk_to_department', 'memory_list', 'memory_update', 'pm_projects_list', 'pm_tasks_create']) {
    assert.ok(names.includes(n), `tools/list must advertise ${n}`);
  }
  const accounts = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(accounts.total, 4);
  const created = JSON.parse(byId.get(4).result.content[0].text);
  assert.equal(created.data.status, 'draft');
  const published = JSON.parse(byId.get(5).result.content[0].text);
  assert.equal(published.refused, true);

  const logged = loadTranscript(transcript);
  assert.equal(logged.length, 3);
  assert.deepEqual(logged.map((c) => c.name), ['social_list_accounts', 'social_create_post', 'social_publish_post']);
  assert.equal(logged[1].arguments.scheduled_at, undefined);
  assert.equal(callsTo(logged, 'social_publish_post')[0].result.refused, true);
});

test('social-plan: prompt.md names the contract and none of the answers', () => {
  const prompt = fs.readFileSync(path.join(FIX, 'prompt.md'), 'utf8');
  // The seeded ids, the erroring platform, and the underweight pillar must
  // never appear in the prompt: a prompt that leaks the key measures nothing.
  assert.ok(!/sacc_twitter|pil_educate|Educate|twitter|OAuth|can_post|last_error/i.test(prompt), 'prompt leaks a seeded answer');
  assert.match(prompt, /findings\.json/);
});
