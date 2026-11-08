/**
 * `hiveku focus` really writes the folder's binding.
 *
 * The command once called writeFileAtomic without importing it, so setting or
 * clearing a focus ended in "writeFileAtomic is not defined" and the binding
 * never changed. tool-focus.test.mjs covers what a focus filters; this runs the
 * real command, in a throwaway folder with a throwaway HOME and nothing else of
 * the caller's environment.
 */
import { isolatedEnv } from './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/hiveku', import.meta.url));
const ACCOUNT = '0f0f0f0f-0000-4000-8000-0000000000f0';

async function boundFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hk-focus-'));
  const home = path.join(root, 'home');
  const folder = path.join(root, 'work', 'acme');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(path.join(folder, '.hiveku'), { recursive: true });
  const file = path.join(folder, '.hiveku', 'account.json');
  await fs.writeFile(file, JSON.stringify({ account_id: ACCOUNT, label: 'Acme', bound_by: 'hiveku-claude-plugin' }, null, 2) + '\n');
  return { root, home, folder, file };
}

function focus(where, args) {
  // Only PATH from the caller: no CLAUDE_CONFIG_DIR, no plugin data folder, no real HOME.
  const env = isolatedEnv({ HOME: where.home, HIVEKU_PLUGIN_DATA: path.join(where.root, 'data') });
  return spawnSync(process.execPath, [BIN, 'focus', ...args, '--json'], { cwd: where.folder, env, encoding: 'utf8', timeout: 20_000 });
}

test('focus writes the departments into the binding, and --clear empties them', async () => {
  const where = await boundFolder();
  try {
    const set = focus(where, ['ppc', 'marketing']);
    assert.equal(set.status, 0, set.stderr);
    const shown = JSON.parse(set.stdout);
    assert.equal(shown.account, 'Acme');
    assert.ok(shown.departments.length >= 2, set.stdout);
    const written = JSON.parse(await fs.readFile(where.file, 'utf8'));
    assert.deepEqual(written.departments, shown.departments);
    assert.equal(written.account_id, ACCOUNT, 'the rest of the binding stays');
    assert.equal(written.bound_by, 'hiveku-claude-plugin', 'the rest of the binding stays');

    const cleared = focus(where, ['--clear']);
    assert.equal(cleared.status, 0, cleared.stderr);
    assert.deepEqual(JSON.parse(cleared.stdout).departments, []);
    assert.deepEqual(JSON.parse(await fs.readFile(where.file, 'utf8')).departments, []);
  } finally {
    await fs.rm(where.root, { recursive: true, force: true });
  }
});
