import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planProvision, provisionSettings } from '../lib/provision.mjs';

const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-prov-'));

test('a fresh settings file gets all three prerequisites', () => {
  const { next, changes } = planProvision({});
  assert.deepEqual(next.sandbox.filesystem.allowWrite, ['~/.claude/plugins']);
  assert.deepEqual(next.sandbox.network.allowedDomains, ['app.hiveku.com', 'core.hiveku.com']);
  assert.equal(next.extraKnownMarketplaces.hiveku.autoUpdate, true);
  assert.equal(changes.length, 4);
});

test('★ additive only: nothing the user set is removed or reordered', () => {
  const mine = {
    permissions: { allow: ['Bash(git status)'] },
    sandbox: { network: { allowedDomains: ['core.hiveku.com', 'example.com'] }, filesystem: { allowWrite: ['~/.kube'] } },
    extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'x/y' } } },
  };
  const { next } = planProvision(mine);
  assert.deepEqual(next.permissions, mine.permissions);
  assert.deepEqual(next.sandbox.network.allowedDomains, ['core.hiveku.com', 'example.com', 'app.hiveku.com']);
  assert.deepEqual(next.sandbox.filesystem.allowWrite, ['~/.kube', '~/.claude/plugins']);
  assert.ok(next.extraKnownMarketplaces.other);
});

test('idempotent: a provisioned file plans zero changes', () => {
  const { next } = planProvision({});
  assert.deepEqual(planProvision(next).changes, []);
});

test('writes with a backup, then reports up to date', async () => {
  const home = tmpHome();
  const dir = path.join(home, '.claude'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ model: 'x' }));
  const r1 = await provisionSettings({ homeDir: home });
  assert.equal(r1.applied, true);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('settings.json.bak-')), 'backup taken');
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.equal(written.model, 'x', 'existing keys survive');
  const r2 = await provisionSettings({ homeDir: home });
  assert.equal(r2.upToDate, true);
});

test('never touches a settings file that is not valid JSON', async () => {
  const home = tmpHome();
  const dir = path.join(home, '.claude'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ not json');
  const r = await provisionSettings({ homeDir: home });
  assert.equal(r.applied, false);
  assert.match(r.error, /not valid JSON/);
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), '{ not json');
});

test('creates the file when none exists', async () => {
  const home = tmpHome();
  const r = await provisionSettings({ homeDir: home });
  assert.equal(r.applied, true);
  assert.ok(fs.existsSync(path.join(home, '.claude', 'settings.json')));
});
