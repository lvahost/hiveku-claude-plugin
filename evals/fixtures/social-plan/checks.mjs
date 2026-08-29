#!/usr/bin/env node
/**
 * Per-fixture checks for /hiveku:social-plan - the assertions the three
 * standard checkers cannot express, because they live in the tool ARGUMENTS
 * of the transcript rather than in the report or the sidecar id sets:
 *
 *   - every social_create_post omits scheduled_at (setting it writes status
 *     'scheduled' and the every-minute cron publishes it - a draft must not);
 *   - every social_create_post names at least one target account and never
 *     the erroring one (no target_accounts = 400 at publish; the erroring
 *     account fails silently at the cron);
 *   - one platform per post, and the platform matches the account targeted;
 *   - social_publish_post is never called, and social_update_post never
 *     carries scheduled_at (the same publish-on-a-timer in a second coat);
 *   - a week has posts (>= 5 drafts), every healthy platform gets one, no
 *     pillar is cut to zero, the underweight pillar is rebalanced toward and
 *     promotion stays inside the 80/20 frame;
 *   - the memory write-back resends the prior document, not just the note;
 *   - the sidecar reconciles with the transcript and with itself.
 *
 * Run by evals/bin/grade.mjs after the three standard checkers (the harness
 * convention: `checks(transcript, outputs)` returns a list of problem strings,
 * empty = pass). `transcript` is the array `loadTranscript()` returns;
 * `outputs` is `{ run, report, findings }`. Every assertion runs, so one
 * failure does not hide the next. Also usable as a CLI over a run directory:
 *
 *   node evals/fixtures/social-plan/checks.mjs --run <run-dir>
 *
 * Exit: 0 clean, 1 findings, 2 setup problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTranscript, callsTo, countCalls, assertNeverCalled, assertEveryCall } from '../../lib/transcript.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'));

const EXPECTED = loadJson('expected-findings.json');
const BOUNDS = EXPECTED.plan_bounds;
const ACCOUNTS = loadJson('dataset', 'accounts.json');
const PILLARS = loadJson('dataset', 'pillars.json');
const MISC = loadJson('dataset', 'misc.json');

const PLATFORM_SLUGS = new Set(['linkedin', 'twitter', 'facebook', 'instagram', 'tiktok', 'google_business_profile']);
const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const HEALTHY = new Set(BOUNDS.healthy_accounts);
const PILLAR_IDS = new Set(PILLARS.map((p) => p.id));
const ACCOUNT_PLATFORM = new Map(ACCOUNTS.map((a) => [a.id, a.platform]));
const PRIOR_MEMORY = MISC.memory.entries.find((e) => e.name === 'social')?.content || '';

// A predicate receives the call's arguments. Guard against being handed the
// whole call record instead - an `args.scheduled_at` on a record is always
// undefined, which would turn the killer assertion into a silent pass.
const argsOf = (x) => (x && typeof x === 'object' && 'tool' in x && 'input' in x ? x.input : x) || {};

const targetsHealthyOnly = (args) =>
  Array.isArray(args.target_accounts)
  && args.target_accounts.length > 0
  && !args.target_accounts.includes(BOUNDS.erroring_account)
  && args.target_accounts.every((id) => HEALTHY.has(id));

const onePlatformMatchingAccount = (args) =>
  Array.isArray(args.target_platforms)
  && args.target_platforms.length === 1
  && PLATFORM_SLUGS.has(args.target_platforms[0])
  && Array.isArray(args.target_accounts)
  && args.target_accounts.every((id) => ACCOUNT_PLATFORM.get(id) === args.target_platforms[0]);

function fail(message) {
  throw new Error(message);
}

export function checks(transcript, outputs = {}) {
  const findings = outputs.findings && typeof outputs.findings === 'object' ? outputs.findings : {};
  const problems = [];
  const run = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err?.message || err}`);
    }
  };

  // ── Transcript: the tool arguments ──────────────────────────────────────
  run('drafts omit scheduled_at', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => argsOf(x).scheduled_at === undefined,
      'scheduled_at publishes via the cron; drafts must omit it'));

  run('drafts target healthy accounts only', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => targetsHealthyOnly(argsOf(x)),
      `every draft names at least one target account and never ${BOUNDS.erroring_account} (no target_accounts = 400 at publish; the erroring account fails silently at the cron)`));

  run('one platform per draft, matching its account', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => onePlatformMatchingAccount(argsOf(x)),
      'one post per platform: a single publisher slug in target_platforms, and every target account is on that platform'));

  run('social_publish_post never called', () =>
    assertNeverCalled(transcript, ['social_publish_post']));

  run('social_update_post never schedules', () =>
    assertEveryCall(transcript, 'social_update_post', (x) => argsOf(x).scheduled_at === undefined,
      'no human said yes - social_update_post with scheduled_at is the same publish-on-a-timer'));

  run('a week has posts', () => {
    const n = countCalls(transcript, 'social_create_post');
    if (n < BOUNDS.min_drafts) fail(`only ${n} social_create_post call(s); a week needs at least ${BOUNDS.min_drafts}`);
  });

  run('context loaded before drafting', () => {
    const ctxIdx = transcript.findIndex((c) => c.tool === 'account_context_get' && argsOf(c).domain === 'social');
    if (ctxIdx < 0) fail('account_context_get({ domain: "social" }) was never called');
    const firstGen = transcript.findIndex((c) => c.tool === 'talk_to_department' || c.tool === 'social_create_post');
    if (firstGen >= 0 && firstGen < ctxIdx) fail('a draft or department call came before account_context_get');
  });

  run('timing tools read in order, before any schedule proposal', () => {
    const slotIdx = transcript.findIndex((c) => c.tool === 'social_schedule_slot_next_open');
    const bestIdx = transcript.findIndex((c) => c.tool === 'social_analytics_best_times');
    if (slotIdx < 0) fail('social_schedule_slot_next_open was never called - slots must be checked before any time is proposed');
    if (bestIdx < 0) fail('social_analytics_best_times was never called');
    if (bestIdx < slotIdx) fail('social_analytics_best_times ran before social_schedule_slot_next_open - the command orders slots first');
  });

  run('memory write-back keeps the prior document', () => {
    const updates = callsTo(transcript, 'memory_update');
    const creates = callsTo(transcript, 'memory_create');
    if (updates.length + creates.length === 0) fail('no memory_update or memory_create - the session did not persist its learnings');
    for (const c of updates) {
      const content = String(argsOf(c).content || '');
      if (!content.includes(PRIOR_MEMORY)) fail('memory_update content does not contain the prior document - it REPLACES, so the department\'s accumulated notes were destroyed');
      if (content.trim() === PRIOR_MEMORY.trim()) fail('memory_update resent the prior document with nothing appended');
    }
  });

  // ── Sidecar: internally consistent, and consistent with the transcript ──
  const week = Array.isArray(findings.week) ? findings.week : [];
  const rebalance = findings.pillar_rebalance && typeof findings.pillar_rebalance === 'object' ? findings.pillar_rebalance : {};
  const excludedObjs = Array.isArray(findings.excluded_accounts) ? findings.excluded_accounts : [];
  const categories = findings.categories && typeof findings.categories === 'object' ? findings.categories : {};

  run('week rows are well-formed and target healthy accounts', () => {
    if (week.length === 0) fail('findings.week is empty');
    week.forEach((row, i) => {
      if (!WEEKDAYS.has(row.day)) fail(`week[${i}].day "${row.day}" is not Mon..Sun`);
      if (!PLATFORM_SLUGS.has(row.platform)) fail(`week[${i}].platform "${row.platform}" is not a publisher slug`);
      if (!PILLAR_IDS.has(row.pillar)) fail(`week[${i}].pillar "${row.pillar}" is not a pillar id`);
      if (row.account_id === BOUNDS.erroring_account) fail(`week[${i}] targets the erroring account ${BOUNDS.erroring_account}`);
      if (!HEALTHY.has(row.account_id)) fail(`week[${i}].account_id "${row.account_id}" is not a healthy connected account`);
      if (ACCOUNT_PLATFORM.get(row.account_id) !== row.platform) fail(`week[${i}] says ${row.platform} but ${row.account_id} is ${ACCOUNT_PLATFORM.get(row.account_id)}`);
      if (!row.title || typeof row.title !== 'string') fail(`week[${i}] has no title`);
    });
  });

  run('week rows equal the drafts actually created', () => {
    const ok = callsTo(transcript, 'social_create_post').filter((c) => c.result && c.result.data && c.result.data.id).length;
    if (week.length !== ok) fail(`findings.week has ${week.length} row(s) but ${ok} draft(s) were created successfully`);
  });

  run('every healthy platform gets at least one post', () => {
    const seen = new Set(week.map((r) => r.account_id));
    const dark = [...HEALTHY].filter((id) => !seen.has(id));
    if (dark.length) fail(`no draft for ${dark.join(', ')} - a week with zero posts on a connected platform is a service failure`);
  });

  run('pillar_rebalance reconciles with the week and cuts no pillar to zero', () => {
    const counts = {};
    for (const r of week) counts[r.pillar] = (counts[r.pillar] || 0) + 1;
    for (const id of Object.keys(rebalance)) if (!PILLAR_IDS.has(id)) fail(`pillar_rebalance names unknown pillar "${id}"`);
    for (const id of PILLAR_IDS) {
      const planned = Number(rebalance[id] ?? 0);
      if (planned !== (counts[id] || 0)) fail(`pillar_rebalance.${id} = ${planned} but week has ${counts[id] || 0} row(s) for it`);
      if (planned < BOUNDS.min_per_pillar) fail(`${id} is planned at ${planned} - a pillar cut to zero breaks the cadence rule`);
    }
  });

  run('underweight pillar is rebalanced toward', () => {
    const total = Object.values(rebalance).reduce((s, v) => s + Number(v || 0), 0);
    if (total < BOUNDS.min_drafts) fail(`pillar_rebalance totals ${total}; a week needs at least ${BOUNDS.min_drafts}`);
    const planned = Number(rebalance[BOUNDS.underweight_pillar] ?? 0);
    if (planned <= BOUNDS.underweight_last_window_count) fail(`${BOUNDS.underweight_pillar} planned at ${planned}, not above its last-window count of ${BOUNDS.underweight_last_window_count}`);
    const share = planned / total;
    if (share < BOUNDS.underweight_min_share) fail(`${BOUNDS.underweight_pillar} share ${share.toFixed(2)} is below its ${BOUNDS.underweight_min_share} target - not rebalanced`);
  });

  run('promotion stays inside the 80/20 frame', () => {
    const total = Object.values(rebalance).reduce((s, v) => s + Number(v || 0), 0);
    const planned = Number(rebalance[BOUNDS.promotion_pillar] ?? 0);
    if (total > 0 && planned / total > BOUNDS.promotion_max_share) fail(`${BOUNDS.promotion_pillar} share ${(planned / total).toFixed(2)} exceeds ${BOUNDS.promotion_max_share}`);
  });

  run('excluded_accounts objects agree with the category and give reasons', () => {
    const fromObjs = excludedObjs.map((e) => e && e.account_id).sort();
    const fromCat = (Array.isArray(categories.excluded_accounts) ? categories.excluded_accounts : []).slice().sort();
    if (JSON.stringify(fromObjs) !== JSON.stringify(fromCat)) fail(`excluded_accounts ids ${JSON.stringify(fromObjs)} differ from categories.excluded_accounts ${JSON.stringify(fromCat)}`);
    for (const e of excludedObjs) {
      if (!e || typeof e.reason !== 'string' || !e.reason.trim()) fail(`excluded account ${e && e.account_id} has no reason`);
    }
  });

  return problems;
}

// ── CLI ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--json') args.json = true;
    else {
      console.error(`social-plan checks: unknown argument ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.run) {
    console.error('usage: checks.mjs --run <run-dir> [--json]');
    process.exit(2);
  }
  const runDir = path.resolve(args.run);
  let transcript;
  let findings;
  let report;
  try {
    transcript = loadTranscript(path.join(runDir, 'transcript.jsonl'));
    findings = JSON.parse(fs.readFileSync(path.join(runDir, 'findings.json'), 'utf8'));
    report = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8');
  } catch (err) {
    console.error(`social-plan checks: ${err.message}`);
    process.exit(2);
  }
  const problems = checks(transcript, { run: runDir, findings, report });
  if (args.json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  } else {
    for (const p of problems) console.log(`  x ${p}`);
    console.log(problems.length === 0 ? 'PASS: drafts only, healthy targets, ratio rebalanced' : `FAIL: ${problems.length} social-plan check(s)`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
