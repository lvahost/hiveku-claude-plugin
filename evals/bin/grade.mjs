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
 * Exit: 0 all pass, 1 any checker failed, 2 setup problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

console.log('\n== verdict ==');
for (const v of verdicts) console.log(`  ${v}`);
process.exit(worst);
