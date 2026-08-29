#!/usr/bin/env node
/**
 * Grade one eval run: the three checkers over a run directory.
 *
 * Usage:
 *   node evals/bin/grade.mjs --fixture evals/fixtures/ap-screen --run <run-dir>
 *
 * The run directory must contain what the session under eval produced:
 *   report.md          the deliverable
 *   findings.json      the machine-readable sidecar (schema in prompt.md)
 *   transcript.jsonl   the mock server's call log (or a Claude Code session
 *                      JSONL copied in - both shapes parse)
 *
 * A fixture may add transcript assertions of its own in fixtures/<case>/checks.mjs,
 * exporting `checks(transcript, outputs)` - transcript from lib/transcript.mjs
 * loadTranscript(), outputs = { run, report, findings }. It returns a list of
 * problem strings (empty = pass) or throws; either way the messages print
 * verbatim and the run gets a fourth verdict line, "transcript".
 *
 * Exit: 0 all pass, 1 any checker failed, 2 setup problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTranscript } from '../lib/transcript.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKERS = path.join(HERE, '..', 'checkers');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fixture') args.fixture = argv[++i];
    else if (a === '--run') args.run = argv[++i];
    else {
      console.error(`grade: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!args.fixture || !args.run) {
    console.error('usage: grade.mjs --fixture <fixture-dir> --run <run-dir>');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const fixture = path.resolve(args.fixture);
const run = path.resolve(args.run);

const expected = path.join(fixture, 'expected-findings.json');
const report = path.join(run, 'report.md');
const findings = path.join(run, 'findings.json');
const transcript = path.join(run, 'transcript.jsonl');
for (const f of [expected, report, findings, transcript]) {
  if (!fs.existsSync(f)) {
    console.error(`grade: missing ${f}`);
    process.exit(2);
  }
}

const checks = [
  ['planted-defect', 'findings-check.mjs', ['--expected', expected, '--actual', findings]],
  ['trace', 'trace-check.mjs', ['--transcript', transcript, '--report', report]],
  ['restatement', 'restatement-check.mjs', ['--transcript', transcript, '--report', report]],
];

let worst = 0;
const verdicts = [];
for (const [label, script, extra] of checks) {
  console.log(`\n== ${label} (${script}) ==`);
  const res = spawnSync(process.execPath, [path.join(CHECKERS, script), ...extra], { encoding: 'utf8' });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  const code = res.status ?? 2;
  verdicts.push(`${code === 0 ? 'PASS' : 'FAIL'}  ${label}`);
  worst = Math.max(worst, code === 0 ? 0 : 1);
}

// Per-fixture transcript assertions (optional).
const checksPath = path.join(fixture, 'checks.mjs');
if (fs.existsSync(checksPath)) {
  console.log('\n== transcript (checks.mjs) ==');
  let problems = [];
  try {
    const mod = await import(pathToFileURL(checksPath).href);
    if (typeof mod.checks !== 'function') throw new Error('checks.mjs does not export checks(transcript, outputs)');
    const outputs = {
      run,
      report: fs.readFileSync(report, 'utf8'),
      findings: JSON.parse(fs.readFileSync(findings, 'utf8')),
    };
    const out = await mod.checks(loadTranscript(transcript), outputs);
    // A non-array return is a contract violation, never a clean run: the
    // shape mistake that reads as "zero problems" is exactly the silent
    // false green this gate exists to prevent.
    if (!Array.isArray(out)) {
      throw new Error(`checks() must return an array of problem strings; got ${out === null ? 'null' : typeof out}`);
    }
    problems = out.filter(Boolean).map(String);
  } catch (err) {
    problems = [err?.message || String(err)];
  }
  for (const p of problems) console.log(`  x ${p}`);
  console.log(problems.length === 0 ? 'PASS: the transcript satisfies the fixture\'s call assertions' : `FAIL: ${problems.length} transcript assertion(s) failed`);
  verdicts.push(`${problems.length === 0 ? 'PASS' : 'FAIL'}  transcript`);
  worst = Math.max(worst, problems.length === 0 ? 0 : 1);
}

console.log('\n== verdict ==');
for (const v of verdicts) console.log(`  ${v}`);
process.exit(worst);
