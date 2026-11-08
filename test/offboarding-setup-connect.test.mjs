// What makes a folder and a key the plugin's own (offboarding O8b):
// `hiveku setup` marks and records only a folder it has just made
// (lib/setup.mjs, lib/made-folders.mjs), and only a key /hiveku:connect stored
// carries a connect hash (lib/credentials.mjs, bin/hiveku storeConnectPayload).
// Temporary folders only; the exchange is a local server; the keychain tools
// are stubbed (test/offboarding-world.mjs).
import './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A, B, childEnv, connectHashOf, exists, madeUpKey, readCredsFile, world, writeCreds } from './offboarding-world.mjs';
import { runSetup } from '../lib/setup.mjs';
import { folderIdentity, markMadeFolder, readMadeFolders } from '../lib/made-folders.mjs';
import {
  connectKeyHash,
  keyCameFromConnect,
  publicAccountList,
  readCredentials,
  removeAccountIfKey,
  upsertAccounts,
} from '../lib/credentials.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'hiveku');
const binding = async (dir) => JSON.parse(await readFile(path.join(dir, '.hiveku', 'account.json'), 'utf8'));

/* ── setup's mark and record ──────────────────────────────────────────────── */

test('setup marks a folder it makes, and records it with its file identity', async (t) => {
  const w = await world(t);
  const { results, recorded } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind', key_preview: 'hvk_aaaaaa' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'created');
  assert.equal(recorded, 1);
  const dir = results[0].dir;
  const b = await binding(dir);
  assert.equal(b.account_id, A);
  assert.equal(b.bound_by, 'hiveku-claude-plugin');
  assert.equal(b.made_by, 'hiveku-claude-plugin');
  const [record] = await readMadeFolders(w.data);
  assert.deepEqual({ ...record, made_at: undefined }, { account_id: A, dir, root: w.root, ...(await folderIdentity(dir)), made_at: undefined });
  const st = await lstat(path.join(w.data, 'made-folders.json'));
  assert.equal(st.mode & 0o077, 0, 'the record is private');
});

test('an existing folder holding nothing but a .DS_Store counts as made', async (t) => {
  const w = await world(t);
  const dir = path.join(w.root, 'northwind-a0a0a0a0');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '.DS_Store'), '');
  const { results } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'created');
  assert.equal((await binding(dir)).made_by, 'hiveku-claude-plugin');
  assert.equal((await readMadeFolders(w.data)).length, 1);
});

test('a folder that had files is adopted: bound, never marked, never recorded', async (t) => {
  const w = await world(t);
  const dir = path.join(w.root, 'northwind-a0a0a0a0');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '.env'), `OLYMPUS_API_KEY=${madeUpKey()}\n`);
  const { results } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'adopted');
  const b = await binding(dir);
  assert.equal(b.bound_by, 'hiveku-claude-plugin');
  assert.equal(b.made_by, undefined);
  assert.deepEqual(await readMadeFolders(w.data), []);
});

test('a folder another tool bound is left exactly as it is, and not recorded', async (t) => {
  const w = await world(t);
  const dir = path.join(w.root, 'northwind-a0a0a0a0');
  await mkdir(path.join(dir, '.hiveku'), { recursive: true });
  const theirs = JSON.stringify({ version: 1, account_id: A, bound_by: 'hiveku-desktop' });
  await writeFile(path.join(dir, '.hiveku', 'account.json'), theirs);
  const { results } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'exists');
  assert.equal(await readFile(path.join(dir, '.hiveku', 'account.json'), 'utf8'), theirs);
  assert.deepEqual(await readMadeFolders(w.data), []);
});

test('a link at the account folder\'s path is never marked or recorded', async (t) => {
  const w = await world(t);
  const target = path.join(w.outside, 'somewhere');
  await mkdir(target);
  await symlink(target, path.join(w.root, 'northwind-a0a0a0a0'));
  await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.deepEqual(await readMadeFolders(w.data), []);
  const b = await binding(target).catch(() => null);
  assert.ok(!b || b.made_by === undefined, 'no mark was written through the link');
});

test('the mark is never written over a binding that is there, through a linked .hiveku, or for an id that is not an account id', async (t) => {
  const w = await world(t);
  const there = path.join(w.base, 'there');
  await mkdir(path.join(there, '.hiveku'), { recursive: true });
  await writeFile(path.join(there, '.hiveku', 'account.json'), '{"account_id":"x"}');
  assert.equal(await markMadeFolder(there, { accountId: A, label: 'N' }), 'already_bound');
  assert.equal(await readFile(path.join(there, '.hiveku', 'account.json'), 'utf8'), '{"account_id":"x"}');

  const linked = path.join(w.base, 'linked');
  await mkdir(linked);
  const elsewhere = path.join(w.outside, 'hk');
  await mkdir(elsewhere);
  await symlink(elsewhere, path.join(linked, '.hiveku'));
  assert.equal(await markMadeFolder(linked, { accountId: A, label: 'N' }), 'not_marked');
  assert.equal(await exists(path.join(elsewhere, 'account.json')), false);

  const plain = path.join(w.base, 'plain');
  await mkdir(plain);
  assert.equal(await markMadeFolder(plain, { accountId: A.toUpperCase(), label: 'N' }), 'not_marked');
  assert.equal(await exists(path.join(plain, '.hiveku', 'account.json')), false);
});

test('an account id that is not lower-case is bound as before, unmarked and unrecorded', async (t) => {
  const w = await world(t);
  const upper = A.toUpperCase();
  const { results } = await runSetup({ root: w.root, accounts: { [upper]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'created');
  assert.equal((await binding(results[0].dir)).made_by, undefined);
  assert.deepEqual(await readMadeFolders(w.data), []);
});

test('without a data folder, or when the record cannot be written, the folders are made but never recorded', async (t) => {
  const w = await world(t);
  const { results, recorded } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home });
  assert.equal(results[0].status, 'created');
  assert.equal(recorded, 0);
  assert.deepEqual(await readMadeFolders(w.data), []);

  const w2 = await world(t);
  const blocked = path.join(w2.base, 'a-file');
  await writeFile(blocked, 'not a folder');
  const second = await runSetup({ root: w2.root, accounts: { [B]: { label: 'Acme' } }, homeDir: w2.home, dataDir: blocked });
  assert.equal(second.results[0].status, 'created');
  assert.equal(second.recorded, 0);
  assert.ok(second.record_error, 'the failure is said');
});

test('setup run again changes neither the binding nor the record', async (t) => {
  const w = await world(t);
  await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  const before = [await readFile(path.join(w.root, 'northwind-a0a0a0a0', '.hiveku', 'account.json'), 'utf8'), await readFile(path.join(w.data, 'made-folders.json'), 'utf8')];
  const { results } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'exists');
  assert.deepEqual(
    [await readFile(path.join(w.root, 'northwind-a0a0a0a0', '.hiveku', 'account.json'), 'utf8'), await readFile(path.join(w.data, 'made-folders.json'), 'utf8')],
    before,
  );
});

test('a record entry that is not a folder strictly inside its root is never read as one', async (t) => {
  const w = await world(t);
  await writeFile(
    path.join(w.data, 'made-folders.json'),
    JSON.stringify({
      version: 1,
      folders: [
        { account_id: A, dir: w.root, root: w.root, dev: '1', ino: '2' },
        { account_id: A, dir: path.join(w.outside, 'x'), root: w.root, dev: '1', ino: '2' },
        { account_id: A, dir: 'relative/x', root: w.root, dev: '1', ino: '2' },
        { account_id: A.toUpperCase(), dir: path.join(w.root, 'x'), root: w.root, dev: '1', ino: '2' },
        { account_id: A, dir: path.join(w.root, 'x'), root: w.root, dev: 'one', ino: '2' },
        { account_id: A, dir: `${w.root}/x/../y`, root: w.root, dev: '1', ino: '2' },
        { account_id: A, dir: path.join(w.root, 'ok'), root: w.root, dev: '1', ino: '2' },
      ],
    }),
  );
  assert.deepEqual((await readMadeFolders(w.data)).map((r) => path.basename(r.dir)), ['ok']);
});

/* ── which keys connect stored ────────────────────────────────────────────── */

test('a key stored by connect carries its hash; a key stored any other way carries none', async (t) => {
  const w = await world(t);
  const connected = madeUpKey();
  const pasted = madeUpKey();
  await upsertAccounts(w.data, [
    { account_id: A, key: connected, label: 'Northwind', via: 'connect' },
    { account_id: B, key: pasted, label: 'Acme' },
  ]);
  const creds = await readCredentials(w.data);
  assert.equal(creds.accounts[A].connect_key_hash, connectHashOf(connected));
  assert.equal(creds.accounts[B].connect_key_hash, undefined);
  assert.equal(keyCameFromConnect(creds.accounts[A], connected), true);
  assert.equal(keyCameFromConnect(creds.accounts[A], pasted), false);
  assert.equal(keyCameFromConnect(creds.accounts[B], pasted), false);
  // A hash of its own kind: neither the key nor its plain sha256.
  const { createHash } = await import('node:crypto');
  assert.notEqual(connectKeyHash(connected), createHash('sha256').update(connected).digest('hex'));
  assert.ok(!JSON.stringify(publicAccountList(creds.accounts)).includes(connectKeyHash(connected)), 'never listed');
});

test('pasting a key for an account connect connected drops the hash: the pasted key never counts as connect\'s', async (t) => {
  const w = await world(t);
  const connected = madeUpKey();
  await upsertAccounts(w.data, [{ account_id: A, key: connected, label: 'Northwind', via: 'connect' }]);
  const pasted = madeUpKey();
  await upsertAccounts(w.data, [{ account_id: A, key: pasted, label: 'Northwind' }]);
  const record = (await readCredentials(w.data)).accounts[A];
  assert.equal(record.connect_key_hash, undefined);
  assert.equal(keyCameFromConnect(record, pasted), false);
  assert.equal(keyCameFromConnect(record, connected), false);
});

test('the account leaves the store only while its stored key is the refused one', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, connect: true }, [B]: { key: madeUpKey() } });
  assert.equal(await removeAccountIfKey(w.data, A, madeUpKey()), 'changed');
  assert.ok((await readCredsFile(w)).accounts[A]);
  assert.equal(await removeAccountIfKey(w.data, A, key), 'removed');
  assert.equal((await readCredsFile(w)).accounts[A], undefined);
  assert.ok((await readCredsFile(w)).accounts[B]);
  assert.equal(await removeAccountIfKey(w.data, A, key), 'gone');
  await writeFile(path.join(w.data, 'credentials.json'), 'not json{');
  await assert.rejects(() => removeAccountIfKey(w.data, B, 'x'), /could not be read|CredentialStoreUnavailable/);
});

test('connect end to end (paste-back): every key it stores carries its hash', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  const otherKey = madeUpKey();
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      assert.equal(req.url, '/api/connect/vscode/exchange');
      assert.equal(JSON.parse(body).code, 'made-up-code');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        accounts: [
          { account_id: A, account_name: 'Northwind', api_key: key, scope: 'full' },
          { account_id: B, account_name: 'Acme', api_key: otherKey, scope: 'read_only' },
        ],
        connected_as: 'person@example.com',
        departments: [],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  // The paste-back flow's start step, as `connect --paste` leaves it, pointed at the local exchange.
  await writeFile(
    path.join(w.data, 'pending-connect.json'),
    JSON.stringify({ state: 's', verifier: 'v'.repeat(43), app_url: `http://127.0.0.1:${server.address().port}`, created_at: Date.now() }),
    { mode: 0o600 },
  );
  // Not spawnSync: the exchange answers from this process, so it must keep running.
  const run = await new Promise((resolve) => {
    execFile(process.execPath, [BIN, 'connect', '--code', 'made-up-code', '--json'], { env: childEnv(w), timeout: 30_000 }, (error, stdout, stderr) =>
      resolve({ status: error ? (error.code ?? 1) : 0, stdout, stderr }),
    );
  });
  assert.equal(run.status, 0, run.stderr);
  const creds = await readCredsFile(w);
  assert.equal(creds.accounts[A].connect_key_hash, connectHashOf(key));
  assert.equal(creds.accounts[B].connect_key_hash, connectHashOf(otherKey));
});

test('accounts add never says its key came from connect (source)', async () => {
  const src = await readFile(BIN, 'utf8');
  const add = src.slice(src.indexOf("if (sub === 'add')"), src.indexOf("if (sub === 'remove')"));
  assert.ok(add.length > 200, 'could not find accounts add');
  assert.ok(!add.includes('via'), 'accounts add must not mark its key as connect\'s');
  const store = src.slice(src.indexOf('async function storeConnectPayload'), src.indexOf('async function cmdConnect'));
  assert.match(store, /via: 'connect'/);
});
