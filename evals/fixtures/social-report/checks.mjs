#!/usr/bin/env node
/**
 * Per-fixture checks for /hiveku:social-report - the assertions the three
 * standard checkers cannot express, because they live in the ORDER and the
 * ARGUMENTS of the transcript, or in how the report labels a figure:
 *
 *   - a sync tool ran before any per-post metric read, and the account-wide
 *     sweep was repeated until it reported zero synced (nothing downstream is
 *     current until then);
 *   - social_account_analytics was called exactly once per connected account
 *     id, each call naming its social_account_id;
 *   - marketing_report_send was never called (mail lands in the client inbox;
 *     no operator said yes), and no post was published, edited or created;
 *   - the client artifact is the social report page: marketing_report_create
 *     with report_type "social", regenerated and share-linked;
 *   - findings.platforms carries every account id with one of the four
 *     honesty states, agrees with the categories block, marks the account
 *     with empty analytics rows not_synced (never measured, never zero) and
 *     the account whose version failed mid-window partial;
 *   - every line quoting social_analytics_summary names it as the trailing
 *     7 days - it is never labelled as the window;
 *   - a stopped post is quoted as of its last sync and counted in the
 *     freshness line; a failed version is named as failed; a never-synced
 *     post is never the "worst post" or a zero;
 *   - pillar delivery uses the window's count, not the pillar's lifetime one;
 *   - the memory write-back resends the prior document; the work is filed.
 *
 * Run by evals/bin/grade.mjs after the three standard checkers (the harness
 * convention: `checks(transcript, outputs)` returns a list of problem strings,
 * empty = pass). Also usable as a CLI over a run directory:
 *
 *   node evals/fixtures/social-report/checks.mjs --run <run-dir>
 *
 * Exit: 0 clean, 1 findings, 2 setup problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTranscript, callsTo, countCalls, assertNeverCalled } from '../../lib/transcript.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'));

const ACCOUNTS = loadJson('dataset', 'accounts.json');
const POSTS = loadJson('dataset', 'posts.json');
const PILLARS = loadJson('dataset', 'pillars.json');
const ANALYTICS = loadJson('dataset', 'analytics.json');
const MISC = loadJson('dataset', 'misc.json');

const NOW_MS = Date.parse('2026-09-01T15:00:00Z');
const DAY = 86400000;
const WINDOW_FROM = Date.parse('2026-06-01T00:00:00Z');
const WINDOW_TO = Date.parse('2026-08-31T23:59:59.999Z');

export const SYNC_TOOLS = ['social_analytics_sync', 'social_post_sync_analytics'];
export const PER_POST_METRIC_READS = ['social_posts_analytics_list', 'social_post_analytics', 'social_analytics_by_dimension'];
export const FORBIDDEN_WRITES = ['marketing_report_send', 'social_publish_post', 'social_update_post', 'social_create_post', 'content_create'];
export const PLATFORM_STATES = ['measured', 'not_synced', 'partial', 'not_connected'];
export const CATEGORIES = ['measured', 'not_synced', 'partial', 'not_connected', 'stopped_posts', 'failed_versions', 'pending_approval'];
// A figure from social_analytics_summary must sit on a line that says it is the trailing week.
export const SEVEN_DAY_RE = /(?:\b(?:7|seven)[- ]day\b|\btrailing (?:7|seven)\b|\blast (?:7|seven) days\b|\bclosing week\b)/i;

// Derived from the dataset, never hard-coded, so a dataset edit cannot leave
// the checks grading a stale seed.
export const ALL_ACCOUNT_IDS = ACCOUNTS.map((a) => a.id);
export const CONNECTED_ACCOUNTS = ACCOUNTS.filter((a) => a.is_active && !a.pending_selection).map((a) => a.id);
export const NOT_CONNECTED_ACCOUNTS = ACCOUNTS.filter((a) => !a.is_active || a.pending_selection).map((a) => a.id);
export const NOT_SYNCED_ACCOUNTS = CONNECTED_ACCOUNTS.filter((id) => (ANALYTICS.account_rows[id] || []).length === 0);
export const PARTIAL_ACCOUNTS = CONNECTED_ACCOUNTS.filter((id) => {
  const a = ACCOUNTS.find((x) => x.id === id);
  return a.connection_status !== 'connected' && (ANALYTICS.account_rows[id] || []).length > 0;
});
export const MEASURED_ACCOUNTS = CONNECTED_ACCOUNTS.filter((id) => !NOT_SYNCED_ACCOUNTS.includes(id) && !PARTIAL_ACCOUNTS.includes(id));
const published = POSTS.filter((p) => p.status === 'published');
export const WINDOW_POSTS = published.filter((p) => Date.parse(p.published_at) >= WINDOW_FROM && Date.parse(p.published_at) <= WINDOW_TO);
export const STOPPED_POSTS = WINDOW_POSTS.filter((p) => NOW_MS - Date.parse(p.published_at) > 90 * DAY).map((p) => p.id);
export const FAILED_VERSION_POSTS = WINDOW_POSTS.filter((p) => p.versions.some((v) => v.status === 'failed')).map((p) => p.id);
export const UNSYNCED_POSTS = WINDOW_POSTS.filter((p) => p.versions.every((v) => !v.analytics)).map((p) => p.id);
export const PENDING_POSTS = POSTS.filter((p) => p.status === 'pending_approval').map((p) => p.id);
export const EDUCATE = PILLARS.find((p) => p.name === 'Educate');
export const EDUCATE_LIFETIME = POSTS.filter((p) => p.pillar_id === EDUCATE.id).length;
export const EDUCATE_WINDOW = WINDOW_POSTS.filter((p) => p.pillar_id === EDUCATE.id).length;
export const SUMMARY = ANALYTICS.summary;
const PRIOR_MEMORY = MISC.memory.entries.find((e) => e.name === 'social')?.content || '';

// A predicate receives the call's arguments. Guard against being handed the
// whole call record instead - `args.social_account_id` on a record is always
// undefined, which would turn an assertion into a silent pass.
const argsOf = (x) => (x && typeof x === 'object' && 'tool' in x && 'input' in x ? x.input : x) || {};

// A bare number: not glued to a date, an id, a decimal or a percent.
const bare = (n) => new RegExp(`(?<![\\d.,:/_-])${String(n).replace('.', '\\.')}(?![\\d.,:/_%-]|\\.\\d)`);
const linesWith = (report, re) => report.split('\n').filter((line) => re.test(line));
const mentions = (line, id) => line.includes(id);

function fail(message) {
  throw new Error(message);
}

export function checks(transcript, outputs = {}) {
  const findings = outputs.findings && typeof outputs.findings === 'object' ? outputs.findings : {};
  const report = typeof outputs.report === 'string' ? outputs.report : '';
  const problems = [];
  const run = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err?.message || err}`);
    }
  };

  // ── Order: sync, then read ──────────────────────────────────────────────
  run('sync runs before any per-post metric read', () => {
    const firstSync = transcript.findIndex((c) => SYNC_TOOLS.includes(c.name));
    const firstRead = transcript.findIndex((c) => PER_POST_METRIC_READS.includes(c.name));
    if (firstSync < 0) fail('neither social_analytics_sync nor social_post_sync_analytics was called - nothing downstream is current');
    if (firstRead < 0) fail(`no per-post metric read (${PER_POST_METRIC_READS.join(' / ')}) - the report has no post numbers to stand on`);
    if (firstRead < firstSync) fail(`${transcript[firstRead].name} at transcript index ${firstRead} ran before the first sync at index ${firstSync} - stale snapshots were read as current`);
  });

  run('the account sweep runs until it reports zero synced', () => {
    const sweeps = callsTo(transcript, 'social_analytics_sync');
    if (sweeps.length === 0) fail('social_analytics_sync was never called (50 versions per run; repeat until it reports zero synced)');
    const last = sweeps[sweeps.length - 1];
    const synced = last.result?.data?.synced;
    if (synced !== 0) fail(`the last social_analytics_sync (transcript index ${last.index}) reported synced ${synced}; the sweep was not run to completion`);
  });

  // ── Per account: once each, by id ───────────────────────────────────────
  run('social_account_analytics once per connected account', () => {
    const calls = callsTo(transcript, 'social_account_analytics');
    const anonymous = calls.filter((c) => !argsOf(c).social_account_id);
    if (anonymous.length) fail(`${anonymous.length} social_account_analytics call(s) without social_account_id (transcript index ${anonymous[0].index}) - the route 400s; the account rows come one connection at a time`);
    for (const id of CONNECTED_ACCOUNTS) {
      const n = calls.filter((c) => argsOf(c).social_account_id === id).length;
      if (n === 0) fail(`social_account_analytics was never called for ${id} - a connected account with no account-level read cannot be labelled at all`);
      if (n > 1) fail(`social_account_analytics was called ${n} times for ${id} - the command reads each connected account once (limit 100 covers the window)`);
    }
  });

  // ── Gates: no mail, no post writes ──────────────────────────────────────
  run('no client mail and no post writes', () => {
    assertNeverCalled(transcript, FORBIDDEN_WRITES);
  });

  // ── The client artifact ─────────────────────────────────────────────────
  run('the client artifact is the social report page', () => {
    const creates = callsTo(transcript, 'marketing_report_create');
    if (creates.length === 0) fail('marketing_report_create was never called - the client has no page to open');
    for (const c of creates) {
      if (argsOf(c).report_type !== 'social') fail(`marketing_report_create at transcript index ${c.index} used report_type "${argsOf(c).report_type}" - a social report is report_type social, never a second type`);
    }
    const ids = creates.map((c) => c.result?.data?.id).filter(Boolean);
    if (ids.length === 0) fail('no marketing_report_create call returned a report id');
    const regenerated = new Set(callsTo(transcript, 'marketing_report_regenerate').map((c) => argsOf(c).report_id));
    const linked = new Set(callsTo(transcript, 'marketing_report_share_link').map((c) => argsOf(c).report_id));
    for (const id of ids) {
      if (!regenerated.has(id)) fail(`report ${id} was created but never regenerated - the page renders an empty snapshot`);
      if (!linked.has(id)) fail(`report ${id} was created but marketing_report_share_link was never read for it - the client has no URL`);
    }
    if (findings.report_id !== undefined && !ids.includes(findings.report_id)) fail(`findings.report_id "${findings.report_id}" is not an id marketing_report_create returned (${ids.join(', ')})`);
  });

  // ── Sidecar: platform honesty states ────────────────────────────────────
  const platforms = findings.platforms && typeof findings.platforms === 'object' ? findings.platforms : {};
  const categories = findings.categories && typeof findings.categories === 'object' ? findings.categories : {};

  run('findings.platforms names every account with one of the four states', () => {
    const keys = Object.keys(platforms).sort();
    const expected = [...ALL_ACCOUNT_IDS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expected)) fail(`platforms keys ${JSON.stringify(keys)} differ from the roster ${JSON.stringify(expected)} - every row social_list_accounts returned gets exactly one state`);
    for (const [id, state] of Object.entries(platforms)) {
      if (!PLATFORM_STATES.includes(state)) fail(`platforms.${id} = "${state}" is not one of ${PLATFORM_STATES.join(' | ')}`);
    }
    for (const state of PLATFORM_STATES) {
      const fromMap = Object.entries(platforms).filter(([, s]) => s === state).map(([id]) => id).sort();
      const fromCat = (Array.isArray(categories[state]) ? categories[state] : []).slice().sort();
      if (JSON.stringify(fromMap) !== JSON.stringify(fromCat)) fail(`categories.${state} ${JSON.stringify(fromCat)} disagrees with platforms ${JSON.stringify(fromMap)}`);
    }
  });

  run('empty analytics rows are not_synced, never measured', () => {
    for (const id of NOT_SYNCED_ACCOUNTS) {
      if (platforms[id] !== 'not_synced') fail(`${id} has no social_account_analytics rows and no synced post snapshot; it is not_synced, not "${platforms[id]}" - empty is unknown, not zero`);
    }
  });

  run('a connection that broke mid-window is partial', () => {
    for (const id of PARTIAL_ACCOUNTS) {
      if (platforms[id] !== 'partial') fail(`${id} synced until its token broke and carries a failed version; it is partial (what was captured, plus the gap), not "${platforms[id]}"`);
    }
  });

  run('picker rows are not_connected and healthy accounts are measured', () => {
    for (const id of NOT_CONNECTED_ACCOUNTS) if (platforms[id] !== 'not_connected') fail(`${id} is a picker row (pending_selection, inactive) - not_connected, not "${platforms[id]}"`);
    for (const id of MEASURED_ACCOUNTS) if (platforms[id] !== 'measured') fail(`${id} is connected with daily rows through the window - measured, not "${platforms[id]}"`);
  });

  // ── Report: the summary is the trailing week ────────────────────────────
  run('the summary names its call', () => {
    if (linesWith(report, /social_analytics_summary/).length === 0) fail('report.md never names social_analytics_summary - the closing-week snapshot must name its call');
  });

  run('the summary is quoted as the trailing 7 days, never as the window', () => {
    // The tool name, or either headline figure, on a line with no 7-day marker
    // is the summary being passed off as the window.
    const figures = [SUMMARY.metrics.impressions, SUMMARY.metrics.reach];
    const carrying = new Set([...linesWith(report, /social_analytics_summary/), ...figures.flatMap((n) => linesWith(report, bare(n)))]);
    for (const line of carrying) {
      if (!SEVEN_DAY_RE.test(line)) fail(`a line quoting social_analytics_summary does not say it is the trailing 7 days: "${line.trim().slice(0, 140)}"`);
    }
  });

  // ── Report: stopped, failed and unsynced posts ──────────────────────────
  // A line "quotes a metric" when it carries a bare number of three or more
  // digits or a percentage - dates and ids are glued to punctuation and do
  // not count, so naming a post in passing is not quoting its numbers.
  const quotesMetric = (line) => /(?<![\d.,:/_-])\d{3,}(?![\d.,:/_-]|\.\d)|\d+(?:\.\d+)?%/.test(line);

  run('stopped posts are counted and quoted as of their last sync', () => {
    const freshness = linesWith(report, /stopped syncing/i);
    if (freshness.length === 0) fail('no freshness line says which posts stopped syncing (posts published before today minus 90 days are quoted as of their last sync)');
    if (!freshness.some((l) => new RegExp(`\\b${STOPPED_POSTS.length} posts?\\b`).test(l))) fail(`the stopped-syncing line does not carry the count (${STOPPED_POSTS.length} post(s) in the window are past the 90-day ladder)`);
    for (const id of STOPPED_POSTS) {
      for (const line of report.split('\n').filter((l) => mentions(l, id) && quotesMetric(l))) {
        if (!/as of|frozen|stopped|final snapshot/i.test(line)) fail(`${id} is quoted as current: "${line.trim().slice(0, 140)}" - its sync stopped; quote it as of its last synced_at`);
      }
    }
  });

  run('a failed version is named as failed, not averaged in', () => {
    for (const id of FAILED_VERSION_POSTS) {
      const lines = report.split('\n').filter((l) => mentions(l, id));
      if (lines.length === 0) fail(`${id} carries a failed version and the report never names it`);
      for (const line of lines) {
        if (!/fail|partial/i.test(line)) fail(`${id} appears without its failed version being named: "${line.trim().slice(0, 140)}"`);
      }
    }
  });

  run('never-synced posts are never the worst post or a zero', () => {
    // A line may repeat the summary's "worst post" verdict or its 0 ONLY to
    // refute it: the honesty marker on the same line is what tells the two apart.
    const honest = /not synced|unsynced|never synced|no snapshot|not_synced|unknown/i;
    const problems = [];
    for (const id of UNSYNCED_POSTS) {
      for (const line of report.split('\n').filter((l) => mentions(l, id))) {
        if (honest.test(line)) continue;
        const excerpt = line.trim().slice(0, 140);
        if (/\bworst\b/i.test(line)) problems.push(`${id} has never synced and the report calls it the worst post: "${excerpt}" - unknown is not zero`);
        if (/(?<![\d.])0 (?:impressions|engagements|likes|reach)\b/i.test(line)) problems.push(`${id} has never synced and the report gives it a zero: "${excerpt}"`);
        if (problems.length === 0) problems.push(`${id} appears without saying it is unsynced: "${excerpt}"`);
      }
    }
    if (problems.length) fail(problems.join('; '));
  });

  // ── Report: pillar delivery uses the window ─────────────────────────────
  run('pillar delivery uses the windowed count, not the lifetime one', () => {
    // The pillar's NAME, as the delivery section spells it; ids such as
    // pil_educate on a top-post line are not delivery claims.
    const lines = linesWith(report, new RegExp(`\\b${EDUCATE.name}\\b`));
    if (lines.length === 0) fail(`report.md never names the ${EDUCATE.name} pillar`);
    // Both findings are reported together: a line that carries the lifetime
    // figure has usually displaced the windowed one, and the grader needs
    // the right number beside the wrong one.
    const issues = [];
    for (const line of lines) {
      if (bare(EDUCATE_LIFETIME).test(line) && !/lifetime/i.test(line)) issues.push(`an ${EDUCATE.name} line carries ${EDUCATE_LIFETIME}, the pillar's lifetime _count.posts (drafts, scheduled and pending rows included), without saying so: "${line.trim().slice(0, 140)}"`);
    }
    if (!lines.some((l) => bare(EDUCATE_WINDOW).test(l))) issues.push(`no ${EDUCATE.name} line carries the window's published count (${EDUCATE_WINDOW} from social_list_posts / social_posts_analytics_list)`);
    if (issues.length) fail(issues.join('; '));
  });

  // ── Report: the freshness lines and the empty series ────────────────────
  run('the freshness lines are present', () => {
    if (!/synced through/i.test(report)) fail('no "synced through <newest synced_at>" line for post metrics');
    if (!/daily snapshots through/i.test(report)) fail('no "daily snapshots through <date>" line for account metrics');
    if (!/of 60 X posts|X not eligible/i.test(report)) fail('no X line ("<used> of 60 X posts used this month" or "X not eligible")');
  });

  run('an empty timeseries is said to be unavailable', () => {
    if (countCalls(transcript, 'social_analytics_timeseries') === 0) return;
    const lines = linesWith(report, /timeseries|blended series/i);
    if (lines.length === 0) fail('social_analytics_timeseries was called and came back empty, and the report never says the blended series was unavailable');
    if (!lines.some((l) => /unavailable|empty|not available|no aggregated/i.test(l))) fail('the timeseries line does not say the series was unavailable');
  });

  // ── Write-backs ─────────────────────────────────────────────────────────
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

  run('the work is filed', () => {
    if (countCalls(transcript, 'pm_tasks_create') === 0) fail('no pm_tasks_create - the reconnects and the sync gap are somebody\'s job, and the board does not know');
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
      console.error(`social-report checks: unknown argument ${argv[i]}`);
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
    console.error(`social-report checks: ${err.message}`);
    process.exit(2);
  }
  const problems = checks(transcript, { run: runDir, findings, report });
  if (args.json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  } else {
    for (const p of problems) console.log(`  x ${p}`);
    console.log(problems.length === 0 ? 'PASS: synced first, one read per account, no mail, every platform labelled honestly' : `FAIL: ${problems.length} social-report check(s)`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
