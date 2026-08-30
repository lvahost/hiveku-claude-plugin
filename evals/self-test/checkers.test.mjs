/**
 * The checkers' own failure modes. The bug worth testing is not "does a good
 * run pass" (the golden sample-run covers that) - it is "does a BAD run fail":
 * a missed seed, a flagged distractor, an invented number, provenance
 * laundered through a write-tool echo, and a report that is a paste of its
 * inputs. Each mutation must flip the exit code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.join(HERE, '..');
const AP = path.join(EVALS, 'fixtures', 'ap-screen');
const SUPPORT = path.join(EVALS, 'fixtures', 'support-sweep');

const runNode = (script, args) =>
  spawnSync(process.execPath, [path.join(EVALS, script), ...args], { encoding: 'utf8' });

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-eval-'));

function cloneRun(fixtureDir) {
  const dir = tmpDir();
  for (const f of ['report.md', 'findings.json', 'transcript.jsonl']) {
    fs.copyFileSync(path.join(fixtureDir, 'sample-run', f), path.join(dir, f));
  }
  return dir;
}

// ── grade.mjs end-to-end on the golden runs ─────────────────────────────────
test('golden sample runs pass all three checkers', () => {
  for (const fixture of [AP, SUPPORT]) {
    const res = runNode('bin/grade.mjs', ['--fixture', fixture, '--run', path.join(fixture, 'sample-run')]);
    assert.equal(res.status, 0, `${path.basename(fixture)}:\n${res.stdout}\n${res.stderr}`);
  }
});

// ── planted-defect grader ───────────────────────────────────────────────────
test('findings-check fails a missed seed', () => {
  const dir = cloneRun(AP);
  const findings = JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8'));
  findings.rule_D_out_of_pattern = [];
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  const res = runNode('checkers/findings-check.mjs', [
    '--expected', path.join(AP, 'expected-findings.json'),
    '--actual', path.join(dir, 'findings.json'),
  ]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /MISSED seeded finding bill_cre_open_1/);
});

test('findings-check fails a flagged distractor, naming the trap', () => {
  const dir = cloneRun(AP);
  const findings = JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8'));
  findings.rule_A_duplicate_pair.push('bill_lak_open_1');
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  const res = runNode('checkers/findings-check.mjs', [
    '--expected', path.join(AP, 'expected-findings.json'),
    '--actual', path.join(dir, 'findings.json'),
  ]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FALSE POSITIVE bill_lak_open_1/);
  assert.match(res.stdout, /known trap/);
});

test('findings-check fails an invented category and treats a missing one as empty', () => {
  const dir = cloneRun(SUPPORT);
  const findings = JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8'));
  delete findings.aging_pending; // missing = [] = misses tick_1029
  findings.rule_F_invented = ['tick_1042'];
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  const res = runNode('checkers/findings-check.mjs', [
    '--expected', path.join(SUPPORT, 'expected-findings.json'),
    '--actual', path.join(dir, 'findings.json'),
  ]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /MISSED seeded finding tick_1029/);
  assert.match(res.stdout, /unknown category "rule_F_invented"/);
});

// ── trace test ──────────────────────────────────────────────────────────────
test('trace-check fails a number with no provenance', () => {
  const dir = cloneRun(AP);
  fs.appendFileSync(path.join(dir, 'report.md'), '\nVendor risk score: 87 out of a possible 950.\n');
  const res = runNode('checkers/trace-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
  ]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /UNTRACED/);
  assert.match(res.stdout, /87/);
});

test('trace-check is not laundered by a write-tool echoing fabricated input', () => {
  const dir = tmpDir();
  // The only "provenance" for 424242 is a pm_tasks_create ack echoing the
  // model's own title back. Echo suppression must refuse it.
  const transcript = [
    { ts: '2026-08-29T15:00:00Z', tool: 'accounting_ap_aging', input: {}, result: { total_cents: 975000 } },
    {
      ts: '2026-08-29T15:00:04Z',
      tool: 'pm_tasks_create',
      input: { project_id: 'p1', title: 'Review the 424242 cent anomaly' },
      result: { id: 'pmt_1', title: 'Review the 424242 cent anomaly', status: 'open' },
    },
  ];
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), transcript.map((t) => JSON.stringify(t)).join('\n'));
  fs.writeFileSync(path.join(dir, 'report.md'), 'Aging total is 975000 cents.\nThe anomaly amount is 424242 cents.\n');
  const res = runNode('checkers/trace-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
  ]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /UNTRACED/);
  assert.match(res.stdout, /424242/);
});

test('trace-check accepts derived figures whose inputs are shown inline, unless --strict', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'transcript.jsonl'),
    `${JSON.stringify({ ts: 'x', tool: 't', input: {}, result: { values: [38000, 42000] } })}\n`
  );
  fs.writeFileSync(path.join(dir, 'report.md'), 'Median 40000 cents, from the paid history 38000 / 42000.\n');
  const args = ['--transcript', path.join(dir, 'transcript.jsonl'), '--report', path.join(dir, 'report.md')];
  assert.equal(runNode('checkers/trace-check.mjs', args).status, 0);
  assert.equal(runNode('checkers/trace-check.mjs', [...args, '--strict']).status, 1);
});

test('trace-check accepts a figure whose arithmetic is shown inline over tool numbers, even with a small divisor', () => {
  // 12 conversions is below ignoreBelow, so the line carries only ONE traced
  // number and the old two-per-line rule read the CPA as fabricated. The
  // formula names both operands, both came from the tool, and it reproduces
  // the figure - that is provenance.
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'transcript.jsonl'),
    `${JSON.stringify({ ts: 'x', tool: 't', input: {}, result: { terms: [{ search_term: 'crm software', cost: 1548.7, conversions: 12 }] } })}\n`
  );
  fs.writeFileSync(path.join(dir, 'report.md'), '| crm software | $1,548.70 | 12 | $129.06 (=1548.70/12) | keep |\n');
  const args = ['--transcript', path.join(dir, 'transcript.jsonl'), '--report', path.join(dir, 'report.md')];
  const res = runNode('checkers/trace-check.mjs', args);
  assert.equal(res.status, 0, res.stdout);
  assert.match(res.stdout, /derived-inline: 1/);
  assert.equal(runNode('checkers/trace-check.mjs', [...args, '--strict']).status, 1);
});

test('trace-check still fails a shown formula that does not reproduce the figure, or whose operand no tool returned', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'transcript.jsonl'),
    `${JSON.stringify({ ts: 'x', tool: 't', input: {}, result: { terms: [{ search_term: 'crm software', cost: 1548.7, conversions: 12 }] } })}\n`
  );
  // Wrong arithmetic: 1548.70/12 is 129.06, not 141.06.
  fs.writeFileSync(path.join(dir, 'report.md'), 'CPA $141.06 (=1548.70/12) on the term.\n');
  const args = ['--transcript', path.join(dir, 'transcript.jsonl'), '--report', path.join(dir, 'report.md')];
  let res = runNode('checkers/trace-check.mjs', args);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /UNTRACED/);
  // Right arithmetic over an operand the tool never returned (2100.50).
  fs.writeFileSync(path.join(dir, 'report.md'), 'CPA $175.04 (=2100.50/12) on the term.\n');
  res = runNode('checkers/trace-check.mjs', args);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /UNTRACED/);
});

test('trace-check ignores fenced exhibits, dates, times, ids and small counts', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'transcript.jsonl'),
    `${JSON.stringify({ ts: 'x', tool: 't', input: {}, result: { total_cents: 135000 } })}\n`
  );
  fs.writeFileSync(
    path.join(dir, 'report.md'),
    'Bill bill_cre_open_1 (CJ-467) of $1,350.00 was created 2026-08-21 at 09:36, one of 3 flags.\n```\nQuote: pay 999999 by tomorrow\n```\n'
  );
  const res = runNode('checkers/trace-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
  ]);
  assert.equal(res.status, 0, res.stdout);
});

// ── restatement test ────────────────────────────────────────────────────────
test('restatement-check fails a report that pastes tool output as prose', () => {
  const dir = cloneRun(SUPPORT);
  // Build the "deliverable" out of the fixture's own message bodies - the
  // summary-of-a-summary failure, reproduced literally.
  const calls = fs
    .readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const messages = calls.find((c) => c.tool === 'helpdesk_ticket_messages');
  const pasted = messages.result.messages.map((m) => m.body).join(' ');
  fs.writeFileSync(path.join(dir, 'report.md'), `# Sweep\n${pasted}\n${pasted}\n`);
  const res = runNode('checkers/restatement-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
  ]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FAIL/);
});

test('restatement-check exempts fenced exhibits and accepts synthesized prose', () => {
  const dir = cloneRun(SUPPORT);
  const report = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
  // the golden report already quotes rendered macros inside fences - it passes
  const res = runNode('checkers/restatement-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
  ]);
  assert.equal(res.status, 0, res.stdout);
  // the same macro text OUTSIDE a fence is restatement
  const unfenced = report.replace(/```/g, '');
  fs.writeFileSync(path.join(dir, 'report.md'), unfenced);
  const res2 = runNode('checkers/restatement-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
    '--max-restated', '0.05',
  ]);
  assert.equal(res2.status, 1, res2.stdout);
});

test('restatement-check --against catches a summary-of-a-summary', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), `${JSON.stringify({ ts: 'x', tool: 't', input: {}, result: {} })}\n`);
  const upstream = 'The audit found the export job stalls nightly because the cursor never advances past deleted rows in the queue table.';
  fs.writeFileSync(path.join(dir, 'upstream.md'), upstream);
  fs.writeFileSync(path.join(dir, 'report.md'), `Action plan: ${upstream}\n`);
  const res = runNode('checkers/restatement-check.mjs', [
    '--transcript', path.join(dir, 'transcript.jsonl'),
    '--report', path.join(dir, 'report.md'),
    '--against', path.join(dir, 'upstream.md'),
    '--max-restated', '0.3',
  ]);
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stdout, /VERBATIM|restated/);
});
