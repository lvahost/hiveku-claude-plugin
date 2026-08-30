#!/usr/bin/env node
/**
 * Per-fixture checks for /hiveku:tracking-check - the assertions the three
 * standard checkers cannot express, because they live in WHICH tools the
 * session called and how, not in what its report says:
 *
 *   - analytics_channel_scorecard is called exactly ONCE (it loads live pages
 *     in a browser twice and takes minutes; the command says never in a loop,
 *     never per channel), with `days` inside 1..90;
 *   - every channel's scorecard `headline` appears VERBATIM in report.md (the
 *     command says relay it verbatim - it carries the number that makes the
 *     problem undeniable);
 *   - one pm_tasks_create per broken channel (not_tracking + partially_tracking
 *     in the sidecar), no more, no fewer, each title naming an owned money URL;
 *   - no write outside pm_tasks_create / memory_* - none of the GTM, GA4, UET,
 *     conversion-action, offline-upload, deploy or custom-code writes the skill
 *     names (a refused call is still a call);
 *   - analytics_probe_page is only pointed at a domain the account owns;
 *   - the sidecar reconciles with itself: one verdict bucket per channel,
 *     could_not_verify channels sit in `unknown` and are never flagged broken,
 *     broken_links covers exactly the broken channels.
 *
 * Loaded by evals/bin/grade.mjs as `checks(transcript, outputs)`: `transcript`
 * is the array lib/transcript.mjs loadTranscript() returns (records with
 * index / name / arguments / result plus the mock's tool / input spelling),
 * `outputs` is { run, report, findings }. Returns a list of problem strings
 * (empty = pass); every assertion runs, so one failure does not hide the next.
 * Also a CLI over a run directory:
 *
 *   node evals/fixtures/tracking-check/checks.mjs --run <run-dir> [--json]
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
  assertEveryCall,
} from '../../lib/transcript.mjs';

export const SCORECARD = 'analytics_channel_scorecard';
export const TASK_TOOL = 'pm_tasks_create';
export const PROBE_TOOL = 'analytics_probe_page';
export const VERDICTS = ['tracking', 'partially_tracking', 'not_tracking', 'unknown'];
export const BROKEN_VERDICTS = ['not_tracking', 'partially_tracking'];
export const ALLOWED_WRITES = ['pm_tasks_create', 'memory_create', 'memory_update'];

// Every tracking write the skill names, plus the deploy / custom-code writes
// its fixes point at. A diagnosis pass calls none of them: the fix is a task.
export const FORBIDDEN_WRITES = [
  'seo_gtm_install',
  'seo_gtm_publish',
  'seo_gtm_tag_create',
  'seo_gtm_tag_update',
  'seo_gtm_tag_delete',
  'seo_gtm_tag_revert',
  'seo_gtm_version_create',
  'seo_gtm_variable_create',
  'seo_gtm_variable_update',
  'seo_gtm_variable_delete',
  'seo_gtm_variable_revert',
  'seo_gtm_trigger_update',
  'seo_gtm_trigger_delete',
  'seo_gtm_trigger_revert',
  'voice_call_tracking_setup',
  'voice_call_tracking_live_probe',
  'ppc_google_conversion_actions',
  'ppc_offline_conversion_upload',
  'ppc_customer_match_upload',
  'marketing_offline_conversions_run',
  'marketing_offline_conversions_opt_in',
  'marketing_offline_conversions_designate',
  'marketing_offline_conversions_requeue',
  'marketing_offline_conversions_remove_mapping',
  'marketing_offline_conversions_validate_only',
  'ppc_bing_uet_tag_create',
  'ppc_bing_conversion_goal_create',
  'seo_ga4_key_event_create',
  'seo_ga4_key_event_update',
  'seo_ga4_key_event_delete',
  'deploy_site',
  'project_custom_code_set_tier',
  'project_custom_code_page_set',
  'project_custom_code_delete',
];

export const OWNED_URL = /^https:\/\/([a-z0-9-]+\.)*brightside\.example(\/|$)/i;

const asArray = (v) => (Array.isArray(v) ? v : []);

// A predicate receives the call's arguments. Guard against being handed the
// whole record instead - `args.url` on a record is always undefined, which
// would turn the owned-domain assertion into a silent pass.
const argsOf = (x) => (x && typeof x === 'object' && 'tool' in x && 'input' in x ? x.input : x) || {};

const firstUrl = (text) => String(text ?? '').match(/https?:\/\/[^\s)"'<>]+/)?.[0] ?? '';

function fail(message) {
  throw new Error(message);
}

export function checks(transcript, outputs = {}) {
  const report = String(outputs.report ?? '');
  const findings = outputs.findings && typeof outputs.findings === 'object' ? outputs.findings : {};
  const broken = [...new Set(BROKEN_VERDICTS.flatMap((v) => asArray(findings[v])))];
  const problems = [];
  const run = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err?.message || err}`);
    }
  };

  // ── Transcript: call discipline ─────────────────────────────────────────
  run('scorecard called once', () => assertCalledExactly(transcript, SCORECARD, 1));

  run('scorecard days inside 1..90', () =>
    assertEveryCall(
      transcript,
      SCORECARD,
      (x) => {
        const { days } = argsOf(x);
        return days === undefined || (Number.isInteger(days) && days >= 1 && days <= 90);
      },
      'days must be an integer 1..90 or omitted'
    ));

  run('headlines relayed verbatim', () => {
    const headlines = [];
    for (const call of callsTo(transcript, SCORECARD)) {
      for (const ch of asArray(call?.result?.channels)) {
        if (typeof ch?.headline === 'string' && ch.headline.trim()) headlines.push({ channel: ch.channel, headline: ch.headline });
      }
    }
    if (headlines.length === 0) fail('no scorecard result with channel headlines in the transcript');
    // A channel the report refused to stand behind (stale connection, unreadable
    // source) has its scorecard headline deliberately NOT relayed: that headline
    // asserts the very platform number the session judged unreadable. Verbatim
    // relay is owed only for verdicts the report adopts.
    const unverified = new Set([...asArray(findings.could_not_verify), ...asArray(findings.unknown)]);
    const owed = headlines.filter((h) => !unverified.has(h.channel));
    const missing = owed.filter((h) => !report.includes(h.headline));
    if (missing.length) fail(`headline not relayed verbatim for ${missing.map((m) => m.channel).join(', ')}`);
  });

  run('one task per broken channel', () => {
    assertCalledExactly(transcript, TASK_TOOL, broken.length);
  });

  run('task titles name a money URL', () =>
    assertEveryCall(transcript, TASK_TOOL, (x) => OWNED_URL.test(firstUrl(argsOf(x).title)),
      'every pm_tasks_create title must carry an owned money URL (https://brightside.example/...)'));

  run('no write outside pm_tasks_create / memory_*', () => assertNeverCalled(transcript, FORBIDDEN_WRITES));

  run('probes stay on owned domains', () =>
    assertEveryCall(transcript, PROBE_TOOL, (x) => OWNED_URL.test(String(argsOf(x).url ?? '')),
      'analytics_probe_page must only be pointed at a domain the account owns'));

  // ── Sidecar: internally consistent ──────────────────────────────────────
  run('one verdict bucket per channel', () => {
    const seen = new Map();
    for (const v of VERDICTS) for (const ch of asArray(findings[v])) seen.set(ch, (seen.get(ch) || 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([ch]) => ch);
    if (dupes.length) fail(`channel in more than one verdict bucket: ${dupes.join(', ')}`);
    const scorecardChannels = new Set(callsTo(transcript, SCORECARD).flatMap((c) => asArray(c?.result?.channels).map((ch) => ch.channel)));
    const unplaced = [...scorecardChannels].filter((ch) => !seen.has(ch));
    if (unplaced.length) fail(`scorecard channel with no verdict in the sidecar: ${unplaced.join(', ')}`);
  });

  run('could_not_verify channels are unknown, never broken', () => {
    const unknown = new Set(asArray(findings.unknown));
    for (const ch of asArray(findings.could_not_verify)) {
      if (!unknown.has(ch)) fail(`${ch} is in could_not_verify but not in unknown`);
      if (broken.includes(ch)) fail(`${ch} is in could_not_verify and also flagged broken`);
    }
  });

  run('broken_links cover exactly the broken channels', () => {
    const linked = asArray(findings.broken_links).map((id) => String(id).split(':')[0]);
    const missing = broken.filter((ch) => !linked.includes(ch));
    if (missing.length) fail(`broken channel without a named link: ${missing.join(', ')}`);
    const extra = linked.filter((ch) => !broken.includes(ch));
    if (extra.length) fail(`broken_links names a channel not flagged broken: ${extra.join(', ')}`);
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
      console.error(`tracking-check checks: unknown argument ${argv[i]}`);
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
    console.error(`tracking-check checks: ${err.message}`);
    process.exit(2);
  }
  const problems = checks(transcript, outputs);
  if (args.json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  } else {
    for (const p of problems) console.log(`  x   ${p}`);
    console.log(problems.length === 0 ? 'PASS: one scorecard call, headlines verbatim, one task per broken channel, no tracking writes' : `FAIL: ${problems.length} tracking-check check(s)`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
