#!/usr/bin/env node
/**
 * PLANTED-DEFECT GRADER - the fixture seeded known defects; the run must
 * surface exactly those, no more, no fewer. Precision and recall both count:
 * a missed seed is a miss, and a flagged distractor is a false positive (the
 * distractors are the traps the command's own doc warns about).
 *
 * Inputs:
 *   --expected  the fixture's expected-findings.json:
 *                 { "categories": { "<name>": {
 *                     "must": ["id", ...],
 *                     "must_not": [{ "id": "...", "reason": "..." }, ...] } } }
 *   --actual    the run's findings.json sidecar (written by the session under
 *               eval, schema stated in the fixture's prompt.md):
 *                 { "<name>": ["id", ...], ... }   (a missing category = [])
 *
 * Grading per category: the actual id set must EQUAL the must set. Extras that
 * appear in must_not are reported with the trap's reason. Categories in the
 * actual file that the expected file does not define are themselves failures
 * (invented finding classes).
 *
 * Exit: 0 clean, 1 mismatch, 2 usage/input error.
 */
import fs from 'node:fs';
import process from 'node:process';

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--expected') args.expected = argv[++i];
    else if (a === '--actual') args.actual = argv[++i];
    else if (a === '--json') args.json = true;
    else {
      console.error(`findings-check: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!args.expected || !args.actual) {
    console.error('usage: findings-check.mjs --expected <expected-findings.json> --actual <findings.json> [--json]');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

let expected;
let actual;
try {
  expected = JSON.parse(fs.readFileSync(args.expected, 'utf8'));
  actual = JSON.parse(fs.readFileSync(args.actual, 'utf8'));
} catch (err) {
  console.error(`findings-check: ${err.message}`);
  process.exit(2);
}
if (!expected.categories || typeof expected.categories !== 'object') {
  console.error('findings-check: expected file has no "categories" object');
  process.exit(2);
}
if (actual.categories && typeof actual.categories === 'object') actual = actual.categories;

const problems = [];
const summary = [];
for (const [name, spec] of Object.entries(expected.categories)) {
  const must = new Set(spec.must || []);
  const got = new Set(Array.isArray(actual[name]) ? actual[name] : []);
  const traps = new Map((spec.must_not || []).map((t) => [t.id, t.reason]));
  const missing = [...must].filter((id) => !got.has(id));
  const extra = [...got].filter((id) => !must.has(id));
  summary.push({ name, must: must.size, got: got.size, missing, extra });
  for (const id of missing) problems.push(`${name}: MISSED seeded finding ${id}`);
  for (const id of extra) {
    const reason = traps.get(id);
    problems.push(`${name}: FALSE POSITIVE ${id}${reason ? ` - known trap: ${reason}` : ' - not a seeded finding'}`);
  }
}
for (const name of Object.keys(actual)) {
  if (!(name in expected.categories)) problems.push(`unknown category "${name}" - the sidecar invented a finding class`);
}

if (args.json) {
  console.log(JSON.stringify({ ok: problems.length === 0, summary, problems }, null, 2));
} else {
  for (const s of summary) {
    const flag = s.missing.length === 0 && s.extra.length === 0 ? 'ok ' : 'BAD';
    console.log(`  ${flag} ${s.name}: expected ${s.must}, got ${s.got}`);
  }
  for (const p of problems) console.log(`  x ${p}`);
  console.log(problems.length === 0 ? 'PASS: exactly the seeded defects, no more, no fewer' : `FAIL: ${problems.length} finding mismatch(es)`);
}
process.exit(problems.length === 0 ? 0 : 1);
