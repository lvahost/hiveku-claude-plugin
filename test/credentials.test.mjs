/**
 * The credential store holds live account keys. The properties tested here are
 * the ones an incident would turn on: the file is never readable by others, a
 * damaged store degrades instead of crashing the session, and a reconnect for
 * one account never destroys the other twelve.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readCredentials,
  writeCredentials,
  upsertAccounts,
  removeAccount,
  credentialsPath,
  resolveDataDir,
  publicAccountList,
} from '../lib/credentials.mjs';
import { isSyncedLocation, writeFileSecure } from '../lib/util.mjs';

const A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function tmpdata() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-creds-'));
}

test('round-trips accounts', async () => {
  const dir = await tmpdata();
  await upsertAccounts(dir, [{ account_id: A, key: 'hvk_' + 'a'.repeat(64), label: 'Acme Corp' }]);
  const creds = await readCredentials(dir);
  assert.equal(creds.accounts[A].label, 'Acme Corp');
  assert.equal(creds.accounts[A].key, 'hvk_' + 'a'.repeat(64));
  assert.equal(creds.accounts[A].key_preview, 'hvk_aaaaaa');
});

test('the file is never group- or world-readable', async () => {
  // 0600 is the floor, not the ceiling (same-uid processes still read it), but
  // a store that is even briefly 0644 is a finding on any shared machine.
  const dir = await tmpdata();
  await upsertAccounts(dir, [{ account_id: A, key: 'hvk_secret', label: 'Acme' }]);
  const st = await fs.stat(credentialsPath(dir));
  assert.equal(st.mode & 0o077, 0, `mode was ${(st.mode & 0o777).toString(8)}`);
});

test('a reconnect for ONE account leaves the others intact', async () => {
  // The consent flow can return a single account. If that wiped the store, an
  // agency with twelve clients would silently lose eleven of them.
  const dir = await tmpdata();
  await upsertAccounts(dir, [
    { account_id: A, key: 'hvk_a', label: 'Acme' },
    { account_id: B, key: 'hvk_b', label: 'Beta' },
  ]);
  await upsertAccounts(dir, [{ account_id: A, key: 'hvk_a_rotated', label: 'Acme' }]);
  const creds = await readCredentials(dir);
  assert.equal(creds.accounts[A].key, 'hvk_a_rotated', 'rotated key must replace the dead one');
  assert.equal(creds.accounts[B].key, 'hvk_b', 'the untouched account must survive');
});

test('created_at survives a rotation but updated_at moves', async () => {
  const dir = await tmpdata();
  await upsertAccounts(dir, [{ account_id: A, key: 'hvk_a', label: 'Acme' }]);
  const first = (await readCredentials(dir)).accounts[A];
  await new Promise((r) => setTimeout(r, 5));
  await upsertAccounts(dir, [{ account_id: A, key: 'hvk_a2', label: 'Acme' }]);
  const second = (await readCredentials(dir)).accounts[A];
  assert.equal(second.created_at, first.created_at);
  assert.notEqual(second.updated_at, first.updated_at);
});

test('removeAccount deletes exactly one and reports whether it existed', async () => {
  const dir = await tmpdata();
  await upsertAccounts(dir, [
    { account_id: A, key: 'hvk_a', label: 'Acme' },
    { account_id: B, key: 'hvk_b', label: 'Beta' },
  ]);
  assert.equal(await removeAccount(dir, A), true);
  assert.equal(await removeAccount(dir, A), false, 'second removal must report not-found, not throw');
  const creds = await readCredentials(dir);
  assert.equal(creds.accounts[A], undefined);
  assert.equal(creds.accounts[B].key, 'hvk_b');
});

test('a corrupt store degrades to empty instead of throwing', async () => {
  // This runs inside the MCP server. Throwing here would fail the server for
  // the whole session, including in projects that have nothing to do with Hiveku.
  const dir = await tmpdata();
  await writeFileSecure(credentialsPath(dir), 'this is not json{{{');
  const creds = await readCredentials(dir);
  assert.deepEqual(creds.accounts, {});
  assert.equal(creds.corrupt, true);
});

test('a missing store is empty and is NOT reported as corrupt', async () => {
  const dir = await tmpdata();
  const creds = await readCredentials(dir);
  assert.deepEqual(creds.accounts, {});
  assert.equal(creds.corrupt, undefined);
});

// A store that read as unreadable (keychain locked, or damaged) must never be
// the basis for a write: merging one account onto its empty map and saving
// would erase every key it held. Reading tolerates it; MUTATING must refuse.
// A garbage aes-256-gcm envelope reads as locked (no key) or corrupt (key
// present, decrypt fails) — either way, the mutation must throw and change
// nothing on disk.
async function writeUnreadableEnvelope(dir) {
  const file = credentialsPath(dir);
  const body = JSON.stringify({ v: 1, enc: 'aes-256-gcm', iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA', data: 'AAAA' }, null, 2) + '\n';
  await writeFileSecure(file, body);
  return { file, body };
}

test('upsertAccounts REFUSES to clobber an unreadable encrypted store', async () => {
  const dir = await tmpdata();
  const { file, body } = await writeUnreadableEnvelope(dir);
  await assert.rejects(
    () => upsertAccounts(dir, [{ account_id: A, key: 'hvk_' + 'a'.repeat(64), label: 'Acme' }]),
    /keychain|could not be read|CredentialStoreUnavailable/,
  );
  assert.equal(await fs.readFile(file, 'utf8'), body, 'the store must be byte-unchanged after a refused write');
});

test('removeAccount REFUSES to act on an unreadable encrypted store', async () => {
  const dir = await tmpdata();
  const { file, body } = await writeUnreadableEnvelope(dir);
  await assert.rejects(() => removeAccount(dir, A), /keychain|could not be read|CredentialStoreUnavailable/);
  assert.equal(await fs.readFile(file, 'utf8'), body);
});

test('publicAccountList never exposes key material', async () => {
  const dir = await tmpdata();
  await upsertAccounts(dir, [{ account_id: A, key: 'hvk_' + 'z'.repeat(64), label: 'Acme' }]);
  const creds = await readCredentials(dir);
  const listed = publicAccountList(creds.accounts);
  assert.equal(listed[0].account_id, A);
  assert.equal(listed[0].key, undefined);
  assert.ok(!JSON.stringify(listed).includes('z'.repeat(64)));
});

test('refuses a data dir inside a cloud-synced folder', async () => {
  // Writing account keys into iCloud or Dropbox replicates them to every other
  // device on that cloud account, silently and permanently.
  const home = os.homedir();
  assert.equal(isSyncedLocation(path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/x')), true);
  assert.equal(isSyncedLocation(path.join(home, 'Dropbox/hiveku')), true);
  assert.equal(isSyncedLocation(path.join(home, 'Library/CloudStorage/OneDrive/x')), true);
  assert.equal(isSyncedLocation(path.join(home, '.claude/plugins/data/hiveku-hiveku')), false);

  assert.throws(
    () => resolveDataDir({ CLAUDE_PLUGIN_DATA: path.join(home, 'Library/Mobile Documents/hiveku') }),
    /cloud-synced/,
  );
});

test('never uses an UNSUBSTITUTED placeholder as a path', () => {
  // "${CLAUDE_PROJECT_DIR}" is a truthy string. Claude Code leaves such a
  // reference literal when it cannot resolve it, so every falsy check and every
  // `||` fallback sails straight past it and the plugin quietly operates on a
  // directory named after the placeholder. This is the exact shape that made
  // the first shipped .mcp.json non-functional.
  //
  // This asserts the INVARIANT, not one implementation path. The earlier version
  // required a throw, which only happens when directory discovery ALSO fails, so
  // it passed on a clean machine and failed on any machine where the plugin was
  // actually installed. Rejecting the placeholder and then discovering the real
  // directory is correct behaviour, and the test was calling it a failure.
  //
  // What must always hold: the placeholder never reaches the filesystem. Either
  // we resolve a genuine directory, or we refuse with a message the user can act
  // on. discoverDataDir reads os.homedir() rather than env.HOME, so which of
  // those two happens is a property of the machine, not of the input.
  for (const env of [
    { HIVEKU_PLUGIN_DATA: '${CLAUDE_PLUGIN_DATA}' },
    { CLAUDE_PLUGIN_DATA: '${CLAUDE_PLUGIN_DATA}' },
    { HIVEKU_PLUGIN_DATA: '${CLAUDE_PROJECT_DIR}' },
    { CLAUDE_PLUGIN_DATA: '${ANYTHING_AT_ALL}' },
  ]) {
    let resolved;
    try {
      resolved = resolveDataDir(env);
    } catch (err) {
      assert.match(err.message, /could not locate/, `wrong error for ${JSON.stringify(env)}`);
      continue;
    }
    assert.ok(
      !resolved.includes('${') && !resolved.includes('PLUGIN_DATA') && !resolved.includes('PROJECT_DIR'),
      `resolved a placeholder into a real path for ${JSON.stringify(env)}: ${resolved}`,
    );
    assert.ok(path.isAbsolute(resolved), `not absolute: ${resolved}`);
  }
});

test('an explicit data dir is honoured verbatim', () => {
  const dir = path.join(os.tmpdir(), 'hiveku-explicit');
  assert.equal(resolveDataDir({ HIVEKU_PLUGIN_DATA: dir }), path.resolve(dir));
});

// The version string is the ONLY update signal for installed users, and it lives
// in three files. plugin.json wins SILENTLY over marketplace.json, so drift means
// shipping a release nobody receives (or receives wrongly) with no error anywhere.
test('the plugin version is identical in all three places it is declared', async () => {
  const root = new URL('../', import.meta.url);
  const plugin = JSON.parse(await fs.readFile(new URL('.claude-plugin/plugin.json', root), 'utf8'));
  const market = JSON.parse(await fs.readFile(new URL('.claude-plugin/marketplace.json', root), 'utf8'));
  const util = await fs.readFile(new URL('lib/util.mjs', root), 'utf8');
  const entry = market.plugins.find((p) => p.name === plugin.name);
  const inUtil = /export const PLUGIN_VERSION = '([^']+)'/.exec(util)[1];
  assert.equal(entry.version, plugin.version, 'marketplace.json entry version != plugin.json');
  assert.equal(inUtil, plugin.version, 'lib/util.mjs PLUGIN_VERSION != plugin.json');
});
