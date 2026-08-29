// The per-fixture checks.mjs hook in grade.mjs must never read a shape
// mistake as a clean run. A checks() that returns an object instead of an
// array of problem strings is a contract violation, and the gate has to say
// so - the alternative is a silent PASS on a fixture whose assertions never
// ran, which is the exact false green the whole harness exists to prevent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.resolve(HERE, '..');
const GRADE = path.join(EVALS, 'bin', 'grade.mjs');
const SOURCE_FIXTURE = path.join(EVALS, 'fixtures', 'ppc-optimize');

function gradeWithChecks(checksSource) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-grade-hook-'));
  const fixture = path.join(tmp, 'ppc-optimize');
  fs.cpSync(SOURCE_FIXTURE, fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'checks.mjs'), checksSource);
  const run = path.join(fixture, 'sample-run');
  const result = spawnSync(process.execPath, [GRADE, '--fixture', fixture, '--run', run], {
    encoding: 'utf8',
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

test('grade.mjs FAILS a checks() that returns an object instead of an array', () => {
  const r = gradeWithChecks('export function checks() { return { ok: true, problems: [] }; }\n');
  assert.notEqual(r.status, 0, `expected a non-zero exit, got ${r.status}\n${r.stdout}`);
  assert.match(r.stdout, /must return an array of problem strings; got object/);
  assert.match(r.stdout, /FAIL {2}transcript/);
});

test('grade.mjs FAILS a checks() that returns undefined', () => {
  const r = gradeWithChecks('export function checks() {}\n');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /got undefined/);
});

test('grade.mjs still PASSES a checks() that returns an empty array', () => {
  const r = gradeWithChecks('export function checks() { return []; }\n');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /PASS {2}transcript/);
});
