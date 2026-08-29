/**
 * The drift gate's own failure modes.
 *
 * ★ The bug worth testing for is not "does it find drift" — it is "does it
 * report a SKIP as a pass". Both existing --check gates spent a release cycle
 * exiting 2 because nobody passed --dir, and the release script printed nothing
 * and moved on. So these tests pin the exit codes, not the prose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverBoundDir, resolveDirArg } from '../scripts/lib/bound-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'check-drift.mjs');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hk-drift-'));
}

test('discovery finds a bound account folder', () => {
  const home = tmpHome();
  const acct = path.join(home, 'Hiveku-Accounts', 'acme-1234');
  fs.mkdirSync(path.join(acct, '.hiveku'), { recursive: true });
  fs.writeFileSync(path.join(acct, '.hiveku', 'account.json'), '{}');
  assert.equal(discoverBoundDir(home), acct);
});

test('a folder without .hiveku/account.json is NOT a binding', () => {
  // An empty ~/Hiveku-Accounts/<name>/ is what setup leaves behind before
  // /hiveku:bind runs. Treating it as bound would spawn a server that returns
  // no tools, and the caller would read that as "the catalogue is empty".
  const home = tmpHome();
  fs.mkdirSync(path.join(home, 'Hiveku-Accounts', 'not-bound-yet'), { recursive: true });
  assert.equal(discoverBoundDir(home), null);
});

test('discovery is deterministic when several accounts are bound', () => {
  const home = tmpHome();
  for (const name of ['zeta', 'alpha', 'middle']) {
    const d = path.join(home, 'Hiveku-Accounts', name, '.hiveku');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'account.json'), '{}');
  }
  assert.match(discoverBoundDir(home), /alpha$/);
});

test('an explicit --dir always beats discovery', () => {
  const home = tmpHome();
  const acct = path.join(home, 'Hiveku-Accounts', 'auto');
  fs.mkdirSync(path.join(acct, '.hiveku'), { recursive: true });
  fs.writeFileSync(path.join(acct, '.hiveku', 'account.json'), '{}');
  assert.equal(resolveDirArg(['--dir', '/explicit/path'], home), path.resolve('/explicit/path'));
});

test('a bare --dir with no value falls back rather than resolving undefined', () => {
  // path.resolve(undefined) throws, which would turn a typo into a crash
  // instead of a checkable exit code.
  assert.doesNotThrow(() => resolveDirArg(['--dir'], tmpHome()));
  assert.equal(resolveDirArg(['--dir'], tmpHome()), null);
  assert.equal(resolveDirArg(['--dir', '--json'], tmpHome()), null);
});

test('no binding exits 2 (cannot verify), never 0 (clean)', () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpHome() },
  });
  assert.equal(r.status, 2, 'an unverifiable run must not look like a passing one');
  assert.match(r.stderr, /no bound account folder/i);
});
