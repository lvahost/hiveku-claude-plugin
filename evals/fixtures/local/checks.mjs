#!/usr/bin/env node
/**
 * Per-fixture checks for /hiveku:local - the assertions the three standard
 * checkers cannot express, because they live in WHICH tools the session
 * called and how, not in what its report says:
 *
 *   - seo_citations_audit is never called (one paid DataForSEO search with no
 *     confirm step of its own), and none of the seven seo_gbp_* writes is
 *     (each publishes publicly on the live listing) - a refused call is still
 *     a call;
 *   - the live quota-limited reads run ONE pass per location: seo_gbp_attributes
 *     and seo_gbp_services at most once per connection_id, seo_gbp_media at
 *     most once - except on the connection whose first call hit Google's quota,
 *     where one retry is allowed (two calls), never a loop;
 *   - seo_gbp_listing was read at all (the free snapshot is where the score,
 *     duplicate status and freshness live);
 *   - the 90-vs-90 read is honest: seo_local_compare_periods was called with
 *     days >= 180, OR the report states the halved window it actually got;
 *   - the report names BOTH connection ids - per-location reporting, never an
 *     average across showrooms;
 *   - one pm_tasks_create per finding category the sidecar reports, no more,
 *     no fewer;
 *   - sidecar and report agree: every id the sidecar files appears in the
 *     report, punctuation-insensitive - a connection or review id verbatim, a
 *     directory by its id or by the label the citation audit returned for it
 *     (so `conn_gbp_a:bing_places` is satisfied by "Bing Places"), and an
 *     inconsistent field by its place_id together with the field name.
 *
 * Loaded by evals/bin/grade.mjs as `checks(transcript, outputs)`: `transcript`
 * is the array lib/transcript.mjs loadTranscript() returns (records with
 * index / name / arguments / result plus the mock's tool / input spelling),
 * `outputs` is { run, report, findings }. Returns a list of problem strings
 * (empty = pass); every assertion runs, so one failure does not hide the next.
 * Also a CLI over a run directory:
 *
 *   node evals/fixtures/local/checks.mjs --run <run-dir> [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  loadTranscript,
  callsTo,
  countCalls,
  assertCalledExactly,
  assertNeverCalled,
} from '../../lib/transcript.mjs';

export const TASK_TOOL = 'pm_tasks_create';
export const LISTING_TOOL = 'seo_gbp_listing';
export const COMPARE_TOOL = 'seo_local_compare_periods';
export const MEDIA_TOOL = 'seo_gbp_media';
export const CITATIONS_TOOL = 'seo_citations_get';
export const LIVE_ONCE_TOOLS = ['seo_gbp_attributes', 'seo_gbp_services'];
export const CONNECTION_IDS = ['conn_gbp_a', 'conn_gbp_b'];
/** The connection whose first media read hits the quota gets ONE retry. */
export const MEDIA_CALL_CAP = { conn_gbp_a: 1, conn_gbp_b: 2 };
export const ALLOWED_WRITES = ['pm_tasks_create', 'pm_projects_create', 'memory_create', 'memory_update'];
export const CATEGORIES = [
  'stale_snapshot',
  'duplicate_listing',
  'empty_services',
  'missing_attributes',
  'unreplied_negative',
  'missing_citations',
  'unverified_citations',
  'inconsistent_citations',
];

// The paid citation audit plus every GBP write the skill names. A baseline
// pass calls none of them: the fix is a task.
export const FORBIDDEN_WRITES = [
  'seo_citations_audit',
  'seo_gbp_review_reply',
  'seo_gbp_review_reply_delete',
  'seo_gbp_location_update',
  'seo_gbp_attributes_update',
  'seo_gbp_services_update',
  'seo_gbp_media_add',
  'seo_gbp_media_delete',
];

/** "90 vs 90", "45 vs 45", "halved", "halves", "halving" - the honest window. */
export const HALVED_WINDOW_RE = /\bhalv(?:ed|es|ing)\b|\b(45|90)\s*(?:-|vs\.?|versus|against|v\.?)\s*\1\b/i;

const asArray = (v) => (Array.isArray(v) ? v : []);

// A predicate receives the call's arguments. Guard against being handed the
// whole record instead - `args.connection_id` on a record is always undefined.
const argsOf = (x) => (x && typeof x === 'object' && 'tool' in x && 'input' in x ? x.input : x) || {};

const normalize = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function fail(message) {
  throw new Error(message);
}

export function checks(transcript, outputs = {}) {
  const report = String(outputs.report ?? '');
  const findings = outputs.findings && typeof outputs.findings === 'object' ? outputs.findings : {};
  const problems = [];
  const run = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err?.message || err}`);
    }
  };

  // ── Transcript: the gate held ───────────────────────────────────────────
  run('no paid audit and no GBP write', () => assertNeverCalled(transcript, FORBIDDEN_WRITES));

  for (const tool of LIVE_ONCE_TOOLS) {
    run(`${tool} once per location`, () => {
      const perConnection = new Map();
      for (const record of callsTo(transcript, tool)) {
        const id = String(argsOf(record).connection_id ?? '');
        if (!id) fail(`call at transcript index ${record.index} carries no connection_id (the route 400s without one)`);
        perConnection.set(id, (perConnection.get(id) || 0) + 1);
      }
      const looped = [...perConnection].filter(([, n]) => n > 1);
      if (looped.length) fail(`${tool} is a live quota-limited read - called ${looped.map(([id, n]) => `${n}x on ${id}`).join(', ')}, expected at most once per connection_id`);
    });
  }

  run('seo_gbp_media at most once per location, one retry on the quota connection', () => {
    const perConnection = new Map();
    for (const record of callsTo(transcript, MEDIA_TOOL)) {
      const id = String(argsOf(record).connection_id ?? '');
      if (!id) fail(`call at transcript index ${record.index} carries no connection_id (the route 400s without one)`);
      perConnection.set(id, (perConnection.get(id) || 0) + 1);
    }
    const over = [...perConnection].filter(([id, n]) => n > (MEDIA_CALL_CAP[id] ?? 1));
    if (over.length) fail(`${MEDIA_TOOL} called ${over.map(([id, n]) => `${n}x on ${id} (cap ${MEDIA_CALL_CAP[id] ?? 1})`).join(', ')} - a quota failure means wait, never loop`);
  });

  run('listing snapshot was read', () => {
    if (countCalls(transcript, LISTING_TOOL) === 0) fail(`${LISTING_TOOL}: expected at least 1 call, got 0`);
  });

  run('the 90-vs-90 read is honest', () => {
    const calls = callsTo(transcript, COMPARE_TOOL);
    const wide = calls.some((record) => Number(argsOf(record).days) >= 180);
    if (wide) return;
    if (HALVED_WINDOW_RE.test(report)) return;
    if (calls.length === 0) fail(`${COMPARE_TOOL} was never called and the report does not state a halved window`);
    fail(`${COMPARE_TOOL} was called with days ${calls.map((r) => argsOf(r).days ?? 'unset').join(', ')} (the tool halves it) and the report never states the window it actually got`);
  });

  // ── Report: per-location ────────────────────────────────────────────────
  run('report names every location', () => {
    const missing = CONNECTION_IDS.filter((id) => !report.includes(id));
    if (missing.length) fail(`report.md never names ${missing.join(', ')} - report per location, never an average`);
  });

  // ── Tasks: one per reported category ────────────────────────────────────
  run('one task per finding category', () => {
    const reported = CATEGORIES.filter((c) => asArray(findings[c]).length > 0);
    assertCalledExactly(transcript, TASK_TOOL, reported.length);
  });

  // ── Sidecar and report agree ────────────────────────────────────────────
  run('every filed id appears in the report', () => {
    const body = normalize(report);
    // Directory labels come from the citation audit the session actually read,
    // so "Better Business Bureau" in prose satisfies the id `bbb`.
    const labels = new Map();
    for (const record of callsTo(transcript, CITATIONS_TOOL)) {
      const data = record?.result?.data;
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) for (const major of asArray(row?.audit?.majors)) if (major?.directory && major?.label) labels.set(major.directory, major.label);
    }
    const mentioned = (needle) => Boolean(needle) && body.includes(normalize(needle));
    const unmentioned = [];
    for (const category of Object.keys(findings)) {
      for (const id of asArray(findings[category])) {
        const parts = String(id).split(':');
        let ok = mentioned(id);
        if (!ok && parts.length === 1) ok = false;
        if (!ok && parts.length === 2) ok = mentioned(parts[1]) || mentioned(labels.get(parts[1]));
        if (!ok && parts.length >= 3) ok = mentioned(parts[1]) && mentioned(parts[2]);
        if (!ok) unmentioned.push(`${category}:${id}`);
      }
    }
    if (unmentioned.length) fail(`sidecar ids the report never mentions: ${unmentioned.join(', ')}`);
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
      console.error(`local checks: unknown argument ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.run) {
    console.error('usage: checks.mjs --run <run-dir> [--json]');
    process.exit(2);
  }
  const runDir = path.resolve(args.run);
  let transcript;
  let outputs;
  try {
    transcript = loadTranscript(path.join(runDir, 'transcript.jsonl'));
    outputs = {
      run: runDir,
      report: fs.readFileSync(path.join(runDir, 'report.md'), 'utf8'),
      findings: JSON.parse(fs.readFileSync(path.join(runDir, 'findings.json'), 'utf8')),
    };
  } catch (err) {
    console.error(`local checks: ${err.message}`);
    process.exit(2);
  }
  const problems = checks(transcript, outputs);
  if (args.json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  } else {
    for (const p of problems) console.log(`  x   ${p}`);
    console.log(problems.length === 0 ? 'PASS: no paid audit, no GBP write, live reads once per location, per-location report, one task per category' : `FAIL: ${problems.length} local check(s)`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
