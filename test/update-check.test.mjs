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
  pluginAutoUpdateBlocker,
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

/* ── auto-update that cannot run (the Claude desktop app) ─────────────────── */

test('pluginAutoUpdateBlocker mirrors Claude Code\'s own gate, FORCE_AUTOUPDATE_PLUGINS included', () => {
  // The desktop app starts every Code session with DISABLE_AUTOUPDATER=1.
  assert.deepEqual(pluginAutoUpdateBlocker({ DISABLE_AUTOUPDATER: '1' }), { kind: 'env', name: 'DISABLE_AUTOUPDATER' });
  assert.deepEqual(pluginAutoUpdateBlocker({ DISABLE_UPDATES: 'true' }), { kind: 'env', name: 'DISABLE_UPDATES' });
  assert.deepEqual(
    pluginAutoUpdateBlocker({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 'yes' }),
    { kind: 'env', name: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC' },
  );
  assert.equal(pluginAutoUpdateBlocker({ DISABLE_AUTOUPDATER: '1', FORCE_AUTOUPDATE_PLUGINS: '1' }), null);
  assert.equal(pluginAutoUpdateBlocker({ DISABLE_AUTOUPDATER: '0' }), null);
  assert.equal(pluginAutoUpdateBlocker({}), null);
  assert.deepEqual(pluginAutoUpdateBlocker({}, { autoUpdates: false }), { kind: 'config', name: 'autoUpdates' });
  assert.equal(pluginAutoUpdateBlocker({}, { autoUpdates: false, installMethod: 'native', autoUpdatesProtectedForNative: true }), null);
  assert.equal(pluginAutoUpdateBlocker({ FORCE_AUTOUPDATE_PLUGINS: 'on' }, { autoUpdates: false }), null);
});

test('when auto-update cannot run, the notice says it will not install by itself and names /hiveku:update', async () => {
  const off = chooseUpdateNotice({ running: '0.26.12', installedNewest: '0.26.12', cloneVersion: null, remoteVersion: '0.27.4', autoUpdateOff: true });
  assert.equal(off.kind, 'remote');
  assert.match(off.text, /0\.27\.4 has been released \(this machine has 0\.26\.12\)/);
  assert.match(off.text, /auto-update is switched off in this Claude session, so it will not install by itself/);
  assert.match(off.text, /run \/hiveku:update/);
  assert.match(off.text, /quit and reopen Claude/);

  const apply = chooseUpdateNotice({ running: '0.26.12', installedNewest: '0.26.12', cloneVersion: '0.27.4', remoteVersion: null, autoUpdateOff: true });
  assert.match(apply.text, /switched off in this Claude session/);

  const on = chooseUpdateNotice({ running: '0.26.12', installedNewest: '0.26.12', cloneVersion: null, remoteVersion: '0.27.4' });
  assert.doesNotMatch(on.text, /switched off/);

  const dir = tmp();
  await fs.writeFile(updateCheckPath(dir), JSON.stringify({ checked_at: 1, remote_version: '0.27.4' }));
  const periodic = await maybePeriodicNotice(dir, { running: '0.26.12', installedNewest: '0.26.12', cloneVersion: null, autoUpdateOff: true, now: 5 });
  assert.match(periodic.text, /switched off in this Claude session/);
});
