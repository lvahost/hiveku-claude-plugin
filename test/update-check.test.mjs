/**
 * The remote-aware update check: version compare, notice priority, probe
 * caching and the machine-wide periodic throttle. All filesystem work runs in
 * a throwaway temp dir; the network is an injected fetch. What these tests
 * protect: a stale machine hears about a release exactly once per throttle
 * window, in one line, and a broken network can never make a hook loud, slow,
 * or loopy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs, mkdtempSync, utimesSync } from 'node:fs';
import {
  cmpVersions,
  chooseUpdateNotice,
  probeRemoteVersion,
  probeIsStale,
  readUpdateCheck,
  maybePeriodicNotice,
  updateCheckPath,
  CHECK_TTL_MS,
  NOTICE_TTL_MS,
} from '../lib/update-check.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'hk-upd-'));

test('cmpVersions orders numerically, not lexically', () => {
  assert.ok(cmpVersions('0.15.0', '0.9.9') > 0);
  assert.ok(cmpVersions('0.14.10', '0.14.9') > 0);
  assert.ok(cmpVersions('1.0.0', '0.99.99') > 0);
  assert.equal(cmpVersions('0.14.10', '0.14.10'), 0);
  assert.ok(cmpVersions('junk', '0.0.1') < 0);
});

test('notice priority: an update already downloaded beats a remote announcement beats skew', () => {
  const apply = chooseUpdateNotice({ running: '0.14.10', installedNewest: '0.14.10', cloneVersion: '0.15.0', remoteVersion: '0.15.1' });
  assert.equal(apply.kind, 'apply');
  assert.match(apply.text, /0\.15\.0 is downloaded/);
  assert.match(apply.text, /quit and reopen Claude/);

  const remote = chooseUpdateNotice({ running: '0.14.10', installedNewest: '0.14.10', cloneVersion: '0.14.10', remoteVersion: '0.15.1' });
  assert.equal(remote.kind, 'remote');
  assert.match(remote.text, /0\.15\.1 has been released/);

  const skew = chooseUpdateNotice({ running: '0.13.0', installedNewest: '0.14.10', cloneVersion: null, remoteVersion: null });
  assert.equal(skew.kind, 'skew');

  assert.equal(chooseUpdateNotice({ running: '0.14.10', installedNewest: '0.14.10', cloneVersion: '0.14.10', remoteVersion: '0.14.10' }), null);
  // A remote OLDER than what we have must never nag (rollback / stale cache).
  assert.equal(chooseUpdateNotice({ running: '0.15.0', installedNewest: '0.15.0', cloneVersion: null, remoteVersion: '0.14.0' }), null);
});

test('probeRemoteVersion caches a good answer and stamps failures without throwing', async () => {
  const dir = tmp();
  const ok = await probeRemoteVersion(dir, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: '0.99.1' }) }),
    now: 1000,
  });
  assert.equal(ok.remote_version, '0.99.1');
  assert.equal((await readUpdateCheck(dir)).remote_version, '0.99.1');

  const bad = await probeRemoteVersion(dir, { fetchImpl: async () => { throw new Error('offline'); }, now: 2000 });
  assert.equal(bad.error, true);
  const cached = await readUpdateCheck(dir);
  // A failed probe stamps checked_at (throttling retries) but KEEPS the last good answer.
  assert.equal(cached.checked_at, 2000);
  assert.equal(cached.remote_version, '0.99.1');

  const junk = await probeRemoteVersion(dir, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: 'not-a-version' }) }),
    now: 3000,
  });
  assert.equal(junk.error, true);
});

test('probeIsStale: missing file is stale, fresh write is not, old mtime is', async () => {
  const dir = tmp();
  assert.equal(probeIsStale(dir), true);
  await probeRemoteVersion(dir, { fetchImpl: async () => ({ ok: true, json: async () => ({ version: '0.1.0' }) }) });
  assert.equal(probeIsStale(dir), false);
  const old = (Date.now() - CHECK_TTL_MS - 60_000) / 1000;
  utimesSync(updateCheckPath(dir), old, old);
  assert.equal(probeIsStale(dir), true);
});

test('maybePeriodicNotice speaks once per throttle window and stamps only when it speaks', async () => {
  const dir = tmp();
  await fs.writeFile(updateCheckPath(dir), JSON.stringify({ checked_at: 1, remote_version: '9.9.9' }));

  const first = await maybePeriodicNotice(dir, { running: '0.14.10', installedNewest: '0.14.10', cloneVersion: null, now: 10_000 });
  assert.equal(first.kind, 'remote');

  const suppressed = await maybePeriodicNotice(dir, { running: '0.14.10', installedNewest: '0.14.10', cloneVersion: null, now: 10_000 + NOTICE_TTL_MS - 1 });
  assert.equal(suppressed, null);

  const again = await maybePeriodicNotice(dir, { running: '0.14.10', installedNewest: '0.14.10', cloneVersion: null, now: 10_000 + NOTICE_TTL_MS + 1 });
  assert.equal(again.kind, 'remote');

  // Up to date: silent, and the throttle stamp must NOT move.
  const before = (await readUpdateCheck(dir)).last_notice_at;
  const quiet = await maybePeriodicNotice(dir, { running: '9.9.9', installedNewest: '9.9.9', cloneVersion: null, now: 10_000 + 2 * NOTICE_TTL_MS + 2 });
  assert.equal(quiet, null);
  assert.equal((await readUpdateCheck(dir)).last_notice_at, before);

  // Skew never nags mid-session.
  const skew = await maybePeriodicNotice(dir, { running: '0.1.0', installedNewest: '9.9.9', cloneVersion: null, now: 10_000 + 3 * NOTICE_TTL_MS });
  assert.equal(skew, null);
});
