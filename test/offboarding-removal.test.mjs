// Removing an account from this computer when its person lost access
// (offboarding O8b, lib/offboarding.mjs). Real folders under a fresh temporary
// folder per test: a "home" with the default root in it, a folder outside it,
// and the plugin's data folder. The home folder and the data folder are passed
// in, so nothing outside the temporary folder can be reached even with a check
// broken. Folders are made by the real `hiveku setup` (lib/setup.mjs), so their
// mark and record are the real ones. Every key and account id is made up.
import './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chmod, lstat, mkdir, readdir, readFile, realpath, rename, symlink, writeFile, cp } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  A,
  B,
  exists,
  madeUpKey,
  openUp,
  plantBoundFolder,
  plantContent,
  readCredsFile,
  snapshot,
  world,
  writeCreds,
} from './offboarding-world.mjs';
import { runSetup } from '../lib/setup.mjs';
import { folderIdentity, readMadeFolders, recordMadeFolders } from '../lib/made-folders.mjs';
import {
  JOURNAL_MAX_AGE_MS,
  accountConnectedAgain,
  checkRemovable,
  finishPendingRemovals,
  oldRemovalNotice,
  otherAccountInside,
  removalNotice,
  removeAccountFromComputer,
  runAccountRemoval,
  takeNotices,
  tombstonePath,
} from '../lib/offboarding.mjs';
import { SIGHTING_TTL_MS } from '../lib/key-standing.mjs';

/** The account's folder as `hiveku setup` makes it, with what pulls and downloads put in it over time. */
async function madeFolder(w, { accountId = A, label = 'Northwind', root = w.root } = {}) {
  const { results } = await runSetup({
    root,
    accounts: { [accountId]: { label, key_preview: 'hvk_aaaaaa' } },
    homeDir: w.home,
    dataDir: w.data,
  });
  assert.equal(results[0].status, 'created', JSON.stringify(results[0]));
  return plantContent(results[0].dir, { accountId });
}

/** The world most tests start from: Northwind (A) made here with a connect key, Acme (B) made here too. */
async function standardWorld(t, { connect = true } = {}) {
  const w = await world(t);
  const key = madeUpKey();
  const otherKey = madeUpKey();
  await writeCreds(w, {
    [A]: { key, label: 'Northwind', connect },
    [B]: { key: otherKey, label: 'Acme', connect: true },
  });
  const mine = await madeFolder(w);
  const theirs = await madeFolder(w, { accountId: B, label: 'Acme' });
  return { w, key, otherKey, mine, theirs };
}

const remove = (w, key, extra = {}) =>
  removeAccountFromComputer({ dataDir: w.data, home: w.home, accountId: A, reason: 'removed_from_team', key, ...extra });

/* ── what goes ──────────────────────────────────────────────────────────── */

test("the account's own folder goes, with everything in it; its key goes first; nothing is left behind", async (t) => {
  const s = await standardWorld(t);
  assert.equal(path.basename(s.mine), 'northwind-a0a0a0a0');
  const theirsBefore = await snapshot(s.theirs);
  const result = await remove(s.w, s.key);
  assert.equal(await exists(s.mine), false);
  assert.deepEqual(result.removed, [s.mine]);
  assert.deepEqual(result.kept, []);
  assert.equal(result.keyRemoved, true);
  const creds = await readCredsFile(s.w);
  assert.equal(creds.accounts[A], undefined, 'the key left the store');
  assert.ok(creds.accounts[B], 'the other account is still connected');
  assert.deepEqual(await snapshot(s.theirs), theirsBefore);
  // Deleted for good: nothing waits in the removing folder, and the journal and the record are gone.
  assert.deepEqual(await readdir(tombstonePath(s.w.data)), []);
  assert.equal(await exists(path.join(s.w.data, 'offboarding', 'pending', `${A}.json`)), false);
  assert.deepEqual((await readMadeFolders(s.w.data)).map((r) => r.account_id), [B]);
  assert.equal(await exists(path.join(s.w.home, '.Trash')), false);
});

test('the key goes before any file, and the journal names the folders before anything is deleted', async (t) => {
  const s = await standardWorld(t);
  const order = [];
  const records = await readMadeFolders(s.w.data);
  await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'account_closed', home: s.w.home, dataDir: s.w.data, records },
    {
      journal: {
        add: async (entry) => order.push(`journal ${entry.folders.map((f) => path.basename(f.dir)).join(',')}`),
        remove: async () => order.push('journal done'),
      },
      forgetKey: async () => {
        order.push(`key (folder there: ${await exists(s.mine)})`);
        return 'removed';
      },
      connectedAgain: async () => 'no',
      tombstoneDir: tombstonePath(s.w.data),
    },
  );
  assert.deepEqual(order, ['journal northwind-a0a0a0a0', 'key (folder there: true)', 'journal done']);
  assert.equal(await exists(s.mine), false);
});

test('a folder the plugin bound inside its own folder for the same account goes with it', async (t) => {
  const s = await standardWorld(t);
  const nested = path.join(s.mine, 'sites', 'main-site');
  await writeFile(path.join(nested, '.hiveku', 'account.json'), JSON.stringify({ version: 1, account_id: A, bound_by: 'hiveku-claude-plugin' }));
  const result = await remove(s.w, s.key, { sessionFolder: nested });
  assert.deepEqual(result.removed, [s.mine]);
  assert.deepEqual(result.kept, [], 'the session folder inside it went with it, and is not reported as kept');
});

/* ── what stays ─────────────────────────────────────────────────────────── */

test("another account's folder stays, byte for byte, whatever made it", async (t) => {
  const s = await standardWorld(t);
  const byApp = await plantBoundFolder(path.join(s.w.root, 'acme-1a2b3c4d-2'), { accountId: B, boundBy: 'hiveku-desktop' });
  const before = [await snapshot(s.theirs), await snapshot(byApp)];
  const result = await remove(s.w, s.key);
  assert.equal(result.removed.length, 1);
  assert.deepEqual([await snapshot(s.theirs), await snapshot(byApp)], before);
});

test("the account's folder the Hiveku app, the extension or hiveku-sync made stays; the key still goes", async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  const byApp = await plantBoundFolder(path.join(w.root, 'northwind-a0a0a0a0'), { boundBy: 'hiveku-desktop' });
  const byExtension = await plantBoundFolder(path.join(w.root, 'northwind-a0a0a0a0-2'), { boundBy: 'hiveku-vscode' });
  const bySync = await plantBoundFolder(path.join(w.root, 'northwind-a0a0a0a0-3'), { boundBy: 'hiveku-sync' });
  // Even one that copied the plugin's own mark: it is in no record of the plugin's.
  const copiedMark = await plantBoundFolder(path.join(w.root, 'northwind-a0a0a0a0-4'), { boundBy: 'hiveku-claude-plugin', madeBy: 'hiveku-claude-plugin' });
  const before = await Promise.all([byApp, byExtension, bySync, copiedMark].map(snapshot));
  const result = await remove(w, key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => [path.basename(k.path), k.why]).sort(), [
    ['northwind-a0a0a0a0', 'desktop'],
    ['northwind-a0a0a0a0-2', 'other_tool'],
    ['northwind-a0a0a0a0-3', 'other_tool'],
    ['northwind-a0a0a0a0-4', 'not_made_here'],
  ]);
  assert.deepEqual(await Promise.all([byApp, byExtension, bySync, copiedMark].map(snapshot)), before);
  assert.equal(result.keyRemoved, true);
});

test('a folder setup adopted (it had files) stays, and the notice says where it is and why', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  const dir = path.join(w.root, 'northwind-a0a0a0a0');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '.env'), `OLYMPUS_API_KEY=${madeUpKey()}\n`);
  const { results } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: w.data });
  assert.equal(results[0].status, 'adopted');
  await plantContent(dir);
  const before = await snapshot(dir);
  const result = await remove(w, key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['not_made_here']);
  assert.deepEqual(await snapshot(dir), before);
  assert.match(
    removalNotice(result, w.home),
    /Left in place: ~\/Hiveku-Accounts\/northwind-a0a0a0a0 \(the plugin did not make it: it was bound with \/hiveku:bind or set up before this version; delete it yourself if you no longer need it\)\./,
  );
});

test("a folder bound with /hiveku:bind (the session's own) stays, and is named", async (t) => {
  const s = await standardWorld(t);
  const own = path.join(s.w.outside, 'my-code', 'northwind-site');
  await plantBoundFolder(own, { boundBy: 'hiveku-claude-plugin' });
  const before = await snapshot(own);
  const result = await remove(s.w, s.key, { sessionFolder: own });
  assert.deepEqual(result.removed, [s.mine]);
  assert.deepEqual(result.kept, [{ path: own, why: 'not_made_here' }]);
  assert.deepEqual(await snapshot(own), before, 'not one file inside it is touched, its binding and data included');
});

test('an old folder with no binding at the account\'s name stays', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  const old = await plantBoundFolder(path.join(w.root, 'northwind-a0a0a0a0'), { boundBy: null });
  const before = await snapshot(old);
  const result = await remove(w, key);
  assert.deepEqual(result.kept.map((k) => k.why), ['no_mark']);
  assert.deepEqual(await snapshot(old), before);
});

test('a folder made again at the recorded path, or a copy put there, is not the folder setup made', async (t) => {
  const s = await standardWorld(t);
  const aside = path.join(s.w.outside, 'aside');
  await rename(s.mine, aside);
  await cp(aside, s.mine, { recursive: true });
  const before = await snapshot(s.mine);
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['replaced']);
  assert.deepEqual(await snapshot(s.mine), before);
});

test('a made folder bound again with /hiveku:bind (the mark dropped) stays', async (t) => {
  const s = await standardWorld(t);
  const { writeBinding } = await import('../lib/binding.mjs');
  await writeBinding(s.mine, { accountId: A, label: 'Northwind', keyPreview: 'hvk_aaaa' });
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.kept.map((k) => k.why), ['not_made_here']);
  assert.equal(await exists(path.join(s.mine, 'sites', 'main-site', 'index.html')), true);
});

test('a recorded folder replaced by a link stays: the link itself, and what it points at', async (t) => {
  const s = await standardWorld(t);
  const target = path.join(s.w.outside, 'northwind-real');
  await rename(s.mine, target);
  await symlink(target, s.mine);
  const before = await snapshot(target);
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['link']);
  assert.equal((await lstat(s.mine)).isSymbolicLink(), true);
  assert.deepEqual(await snapshot(target), before);
});

test('a link inside the folder goes with it, and what it points at stays', async (t) => {
  const s = await standardWorld(t);
  const precious = path.join(s.w.outside, 'precious');
  await mkdir(precious);
  await writeFile(path.join(precious, 'keep.txt'), "mine, not the account's\n");
  await symlink(precious, path.join(s.mine, 'linked-folder'));
  await symlink(path.join(precious, 'keep.txt'), path.join(s.mine, 'sites', 'main-site', 'linked-file.txt'));
  const before = await snapshot(precious);
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.removed, [s.mine]);
  assert.deepEqual(await snapshot(precious), before);
});

test('a made folder reached through a linked folder between the root and it stays', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  const realParent = path.join(w.outside, 'real-parent');
  await mkdir(realParent);
  const linkedParent = path.join(w.root, 'linked-parent');
  await symlink(realParent, linkedParent);
  // A real made folder behind the link, recorded under the root above the link.
  const made = await madeFolder(w, { root: linkedParent });
  await writeFile(path.join(w.data, 'made-folders.json'), JSON.stringify({ version: 1, folders: [] }));
  await recordMadeFolders(w.data, [{ account_id: A, dir: made, root: w.root, ...(await folderIdentity(made)) }]);
  const before = await snapshot(path.join(realParent, path.basename(made)));
  const result = await remove(w, key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept, [{ path: made, why: 'link' }]);
  assert.deepEqual(await snapshot(path.join(realParent, path.basename(made))), before);
});

test('a link that appears between the link checks and the delete is still caught by the real path', async (t) => {
  const s = await standardWorld(t);
  const realParent = path.join(s.w.outside, 'real-parent');
  await mkdir(realParent);
  const linkedParent = path.join(s.w.root, 'parent');
  await symlink(realParent, linkedParent);
  const moved = path.join(realParent, 'northwind-a0a0a0a0');
  await rename(s.mine, moved);
  const identity = await folderIdentity(moved);
  const entry = { account_id: A, dir: path.join(linkedParent, 'northwind-a0a0a0a0'), root: s.w.root, ...identity };
  const before = await snapshot(moved);
  // White box: the folder-by-folder link check is told the parent is a plain folder, as it was a moment earlier.
  const fsp = createRequire(import.meta.url)('fs/promises');
  const realLstat = fsp.lstat;
  fsp.lstat = async (p, ...rest) => (p === linkedParent ? realLstat(realParent, ...rest) : realLstat(p, ...rest));
  t.after(() => { fsp.lstat = realLstat; });
  const verdict = await checkRemovable(entry, { accountId: A, home: s.w.home, dataDir: s.w.data, otherAccountFolders: [] });
  fsp.lstat = realLstat;
  assert.deepEqual(verdict, { ok: false, why: 'outside_root' });
  assert.deepEqual(await snapshot(moved), before);
});

test('the home folder is never deleted, even recorded and marked; a record of the root itself counts for nothing', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  await mkdir(path.join(w.home, '.hiveku'), { recursive: true });
  await writeFile(path.join(w.home, '.hiveku', 'account.json'), JSON.stringify({ account_id: A, bound_by: 'hiveku-claude-plugin', made_by: 'hiveku-claude-plugin' }));
  await writeFile(path.join(w.home, 'notes.txt'), 'mine\n');
  await recordMadeFolders(w.data, [
    { account_id: A, dir: w.home, root: w.base, ...(await folderIdentity(w.home)) },
    { account_id: A, dir: w.root, root: w.root, ...(await folderIdentity(w.root)) },
  ]);
  assert.equal((await readMadeFolders(w.data)).length, 1, 'a record of a root as its own folder is not kept');
  const before = await snapshot(w.home);
  const result = await remove(w, key);
  assert.deepEqual(result.removed, []);
  assert.ok(result.kept.some((k) => k.path === w.home && k.why === 'home'), JSON.stringify(result.kept));
  assert.deepEqual(await snapshot(w.home), before);
});

test("a folder holding another account's folder, deep down, stays; a deep tree of its own does not", async (t) => {
  const deepPath = ['sites', 'main-site', 'src', 'app', '(group)', 'clients', '[slug]', 'archive', '2026', 'acme', 'export'];
  const s = await standardWorld(t);
  const deep = path.join(s.mine, ...deepPath);
  await mkdir(path.join(deep, '.hiveku'), { recursive: true });
  await writeFile(path.join(deep, '.hiveku', 'account.json'), JSON.stringify({ version: 1, account_id: B, bound_by: 'hiveku-claude-plugin' }));
  const before = await snapshot(s.mine);
  assert.equal(await otherAccountInside(s.mine, A), 'holds_other_account');
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.kept.map((k) => k.why), ['holds_other_account']);
  assert.deepEqual(await snapshot(s.mine), before);

  const s2 = await standardWorld(t);
  await mkdir(path.join(s2.mine, ...deepPath), { recursive: true });
  await writeFile(path.join(s2.mine, ...deepPath, 'page.tsx'), 'export default function Page() { return null }\n');
  const result2 = await remove(s2.w, s2.key);
  assert.deepEqual(result2.kept, []);
  assert.equal(await exists(s2.mine), false);
});

test("a folder holding the account's own folder that the Hiveku app or another Hiveku tool bound stays", async (t) => {
  for (const boundBy of ['hiveku-desktop', 'hiveku-vscode', 'hiveku-sync', null]) {
    const s = await standardWorld(t);
    const nested = path.join(s.mine, 'sites', 'main-site', 'apps', 'web');
    await mkdir(path.join(nested, '.hiveku'), { recursive: true });
    await writeFile(path.join(nested, '.hiveku', 'account.json'), JSON.stringify({ version: 1, account_id: A, ...(boundBy ? { bound_by: boundBy } : {}) }));
    await writeFile(path.join(nested, 'notes.md'), "that tool's own work\n");
    const before = await snapshot(s.mine);
    const result = await remove(s.w, s.key);
    assert.deepEqual(result.removed, [], String(boundBy));
    assert.deepEqual(result.kept.map((k) => k.why), ['holds_other_tool'], String(boundBy));
    assert.deepEqual(await snapshot(s.mine), before, String(boundBy));
  }
});

test("hiveku-sync's files in the folder or below it keep it: its key may be any account's", async (t) => {
  for (const where of [[], ['projects', 'acme-site']]) {
    for (const file of ['manifest.json', 'projects.json', 'made-by-hiveku-sync.json']) {
      const s = await standardWorld(t);
      await mkdir(path.join(s.mine, ...where, '.hiveku'), { recursive: true });
      await writeFile(path.join(s.mine, ...where, '.hiveku', file), JSON.stringify({ api_key_preview: 'hvk_bbbbbb' }));
      const before = await snapshot(s.mine);
      const result = await remove(s.w, s.key);
      assert.deepEqual(result.kept.map((k) => k.why), ['holds_other_tool'], `${where.join('/')} ${file}`);
      assert.deepEqual(await snapshot(s.mine), before);
    }
  }
});

test('a folder hiveku-sync init made and nothing pulled yet keeps the folder it is in, .env and all; the notice leaves it to the person', async (t) => {
  const s = await standardWorld(t);
  // What `hiveku-sync init` leaves before the first pull: its mark, and the key pasted into .env. No binding, no manifest.
  const sync = path.join(s.mine, 'sync-work');
  await mkdir(path.join(sync, '.hiveku'), { recursive: true });
  await writeFile(path.join(sync, '.hiveku', 'made-by-hiveku-sync.json'), JSON.stringify({ version: 1, made_by: 'hiveku-sync' }));
  await writeFile(path.join(sync, '.env'), `OLYMPUS_API_KEY=${madeUpKey()}\n`);
  const before = await snapshot(s.mine);
  assert.equal(await otherAccountInside(s.mine, A), 'holds_other_tool');
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['holds_other_tool']);
  assert.deepEqual(await snapshot(s.mine), before);
  const notice = removalNotice(result, s.w.home);
  assert.match(
    notice,
    /Left in place: ~\/Hiveku-Accounts\/northwind-a0a0a0a0 \(it holds files the Hiveku app or another Hiveku tool made, so the plugin leaves it alone; delete it yourself if you no longer need it\)\./,
  );
  assert.doesNotMatch(notice, /removes it itself/);
});

test("a folder hiveku-sync made for the account stays, and the notice does not say another tool removes it", async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  // hiveku-sync removes nothing, so the person is told it is theirs to delete.
  const bySync = await plantBoundFolder(path.join(w.root, 'northwind'), { boundBy: 'hiveku-sync' });
  const before = await snapshot(bySync);
  const result = await remove(w, key);
  assert.deepEqual(result.kept.map((k) => k.why), ['other_tool']);
  assert.deepEqual(await snapshot(bySync), before);
  const notice = removalNotice(result, w.home);
  assert.match(
    notice,
    /Left in place: ~\/Hiveku-Accounts\/northwind \(another Hiveku tool made it, so the plugin leaves it alone; delete it yourself if you no longer need it\)\./,
  );
  assert.doesNotMatch(notice, /removes it itself/);
});

test("a folder holding a site of another account stays", async (t) => {
  const s = await standardWorld(t);
  await writeFile(path.join(s.mine, 'sites', 'main-site', '.hiveku', 'project.json'), JSON.stringify({ project_id: 'p2', account_id: B }));
  const before = await snapshot(s.mine);
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.kept.map((k) => k.why), ['holds_other_account']);
  assert.deepEqual(await snapshot(s.mine), before);
});

test('a folder that cannot be read through stays: it might hold another account\'s folder', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async (t) => {
  const s = await standardWorld(t);
  const locked = path.join(s.mine, 'sites', 'locked');
  await mkdir(path.join(locked, 'inner'), { recursive: true });
  await chmod(locked, 0o000);
  const result = await remove(s.w, s.key);
  await openUp(s.w.base);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['not_read_through']);
  assert.equal(await exists(path.join(s.mine, 'sites', 'main-site', 'index.html')), true);
});

test("a folder holding the plugin's own data folder stays", async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  const setupData = path.join(w.base, 'setup-data');
  const { results } = await runSetup({ root: w.root, accounts: { [A]: { label: 'Northwind' } }, homeDir: w.home, dataDir: setupData });
  assert.equal(results[0].status, 'created');
  // An odd HIVEKU_PLUGIN_DATA inside the account's folder: every account's keys would go with it.
  const data = path.join(results[0].dir, 'plugin-data');
  await mkdir(data, { recursive: true });
  await recordMadeFolders(data, await readMadeFolders(setupData));
  w.data = data;
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true } });
  const result = await remove(w, key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['holds_plugin_data']);
  assert.equal(await exists(path.join(data, 'credentials.json')), true);
});

test("a recorded folder that is another account's folder (its name) stays", async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect: true }, [B]: { key: madeUpKey(), label: 'Acme', connect: true } });
  // B's name gives this folder; a record says the plugin made it for A.
  const dir = path.join(w.root, 'acme-1a2b3c4d');
  await mkdir(path.join(dir, '.hiveku'), { recursive: true });
  await writeFile(path.join(dir, '.hiveku', 'account.json'), JSON.stringify({ account_id: A, bound_by: 'hiveku-claude-plugin', made_by: 'hiveku-claude-plugin' }));
  await recordMadeFolders(w.data, [{ account_id: A, dir, root: w.root, ...(await folderIdentity(dir)) }]);
  const result = await remove(w, key);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['other_account_folder']);
  assert.equal(await exists(dir), true);
});

test('each folder is checked again right before it is deleted: a mark that changed keeps it', async (t) => {
  const s = await standardWorld(t);
  const records = await readMadeFolders(s.w.data);
  const result = await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'removed_from_team', home: s.w.home, dataDir: s.w.data, records },
    {
      journal: { add: async () => {}, remove: async () => {} },
      // Between the plan and the delete, the Hiveku app takes the folder over.
      forgetKey: async () => {
        await writeFile(path.join(s.mine, '.hiveku', 'account.json'), JSON.stringify({ account_id: A, bound_by: 'hiveku-desktop' }));
        return 'removed';
      },
      connectedAgain: async () => 'no',
      tombstoneDir: tombstonePath(s.w.data),
    },
  );
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map((k) => k.why), ['desktop']);
  assert.equal(await exists(path.join(s.mine, 'sites', 'main-site', 'index.html')), true);
});

/* ── a reconnect, a locked store ────────────────────────────────────────── */

test('a reconnect (another key stored since) stops the removal before anything is deleted', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  const result = await remove(s.w, madeUpKey());
  assert.equal(result.stopped, 'reconnected');
  assert.deepEqual(await snapshot(s.mine), before);
  assert.equal((await readCredsFile(s.w)).accounts[A].key, s.key, 'the stored key stays');
  assert.equal(await exists(path.join(s.w.data, 'offboarding', 'pending', `${A}.json`)), false);
  assert.deepEqual(await takeNotices(s.w.data), [], 'no notice: the person has the account again');
});

test('a key store that cannot be read removes nothing', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  await writeFile(path.join(s.w.data, 'credentials.json'), 'this is not json{{{');
  assert.equal(await remove(s.w, s.key), null);
  assert.deepEqual(await snapshot(s.mine), before);
});

/* ── a crash halfway ────────────────────────────────────────────────────── */

test('a removal left halfway is finished at the next start, checked again, and the person is told', async (t) => {
  const s = await standardWorld(t);
  const records = await readMadeFolders(s.w.data);
  const mineRecord = records.find((r) => r.account_id === A);
  // The key went, and then the session ended before the folder did.
  const creds = await readCredsFile(s.w);
  delete creds.accounts[A];
  await writeFile(path.join(s.w.data, 'credentials.json'), JSON.stringify(creds));
  await mkdir(path.join(s.w.data, 'offboarding', 'pending'), { recursive: true });
  await writeFile(
    path.join(s.w.data, 'offboarding', 'pending', `${A}.json`),
    JSON.stringify({ v: 1, account_id: A, label: 'Northwind', reason: 'account_closed', folders: [mineRecord], at: new Date().toISOString() }),
  );
  const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].removed, [s.mine]);
  assert.equal(await exists(s.mine), false);
  assert.equal(await exists(s.theirs), true);
  assert.equal(await exists(path.join(s.w.data, 'offboarding', 'pending', `${A}.json`)), false);
  const [notice] = await takeNotices(s.w.data);
  assert.match(notice, /^You no longer have access to "Northwind": the account was closed\./);
});

test('a removal left halfway for an account connected again since deletes nothing', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  const records = await readMadeFolders(s.w.data);
  await mkdir(path.join(s.w.data, 'offboarding', 'pending'), { recursive: true });
  await writeFile(
    path.join(s.w.data, 'offboarding', 'pending', `${A}.json`),
    JSON.stringify({ v: 1, account_id: A, label: 'Northwind', reason: 'removed_from_team', folders: records.filter((r) => r.account_id === A), at: '' }),
  );
  const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home });
  assert.deepEqual(results, []);
  assert.deepEqual(await snapshot(s.mine), before);
  assert.equal(await exists(path.join(s.w.data, 'offboarding', 'pending', `${A}.json`)), false);
});

test('what a crash left in the removing folder is deleted at the next start, and a link there is only unlinked', async (t) => {
  const s = await standardWorld(t);
  const tomb = tombstonePath(s.w.data);
  await plantContent(path.join(tomb, 'mzz-abc123'));
  await mkdir(path.join(s.w.outside, 'pointed-at'));
  await writeFile(path.join(s.w.outside, 'pointed-at', 'keep.txt'), 'x');
  await symlink(path.join(s.w.outside, 'pointed-at'), path.join(tomb, 'a-link'));
  await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home });
  assert.deepEqual(await readdir(tomb), []);
  assert.equal(await readFile(path.join(s.w.outside, 'pointed-at', 'keep.txt'), 'utf8'), 'x');
});

/* ── a reconnect after the key went (HK-1383) ───────────────────────────── */

/** What a removal in a test passes for the steps it does not care about. */
const quietDeps = (s) => ({
  journal: { add: async () => {}, remove: async () => {} },
  connectedAgain: async () => 'no',
  tombstoneDir: tombstonePath(s.w.data),
});

/** The account's key back in the store, as a reconnect leaves it. Plain JSON, as the world's store is. */
function reconnectInStore(w, newKey, others = {}) {
  writeFileSync(
    path.join(w.data, 'credentials.json'),
    JSON.stringify({ version: 1, accounts: { [A]: { key: newKey, label: 'Northwind', key_preview: newKey.slice(0, 10), scope: 'full' }, ...others } }),
  );
}

test('accountConnectedAgain: a different key is a reconnect, the refused key still stored is not, no record is not, an unreadable store is unknown', async (t) => {
  const s = await standardWorld(t);
  assert.equal(await accountConnectedAgain(s.w.data, A, s.key), 'no', 'the refused key is still stored (its removal failed): not a reconnect');
  assert.equal(await accountConnectedAgain(s.w.data, A, madeUpKey()), 'again', 'a different key stored');
  assert.equal(await accountConnectedAgain(s.w.data, A), 'again', 'after a crash the old key is gone, so any key is a reconnect');
  const creds = await readCredsFile(s.w);
  delete creds.accounts[A];
  await writeFile(path.join(s.w.data, 'credentials.json'), JSON.stringify(creds));
  assert.equal(await accountConnectedAgain(s.w.data, A, s.key), 'no', 'no key stored');
  await writeFile(path.join(s.w.data, 'credentials.json'), 'this is not json{{{');
  assert.equal(await accountConnectedAgain(s.w.data, A, s.key), 'unknown');
});

test('a reconnect that lands during the look through the folder keeps it: the removal stops and says so (the original case)', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  const realMine = await realpath(s.mine);
  const newKey = madeUpKey();
  // White box: the delete's own look through the folder is the second time this folder is read (the plan's was the first).
  const fsp = createRequire(import.meta.url)('fs/promises');
  const realReaddir = fsp.readdir;
  let looks = 0;
  fsp.readdir = async (p, ...rest) => {
    if (p === realMine) {
      looks += 1;
      if (looks === 2) reconnectInStore(s.w, newKey, { [B]: { key: s.otherKey, label: 'Acme', key_preview: s.otherKey.slice(0, 10), scope: 'full' } });
    }
    return realReaddir(p, ...rest);
  };
  t.after(() => { fsp.readdir = realReaddir; });
  const result = await remove(s.w, s.key);
  fsp.readdir = realReaddir;
  assert.equal(looks, 2, 'the plan and the delete each looked through it once');
  assert.equal(result.stopped, 'reconnected');
  assert.equal(result.keyRemoved, true);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept, [{ path: s.mine, why: 'connected_again' }]);
  assert.deepEqual(await snapshot(s.mine), before, 'nothing in the folder was touched');
  assert.equal((await readCredsFile(s.w)).accounts[A].key, newKey, 'the new key stays');
  assert.equal(await exists(path.join(s.w.data, 'offboarding', 'pending', `${A}.json`)), false, 'the removal is over');
  assert.deepEqual((await readMadeFolders(s.w.data)).filter((r) => r.account_id === A).map((r) => r.dir), [s.mine], 'still recorded: a later removal on fresh answers can take it');
  assert.equal(await exists(tombstonePath(s.w.data)), false, 'nothing was moved');
  const notices = await takeNotices(s.w.data);
  assert.deepEqual(notices, [
    '"Northwind" was connected again while the plugin was removing it from this computer, so the plugin stopped. ' +
      'Nothing else of it was removed. Left in place: ~/Hiveku-Accounts/northwind-a0a0a0a0 (you connected this account again).',
  ]);
  assert.doesNotMatch(notices[0], /[\u2014\u2013]/);
});

test('a reconnect that lands before the look through the folder also stops it: the store is read after the look, right before the move', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  const newKey = madeUpKey();
  const records = await readMadeFolders(s.w.data);
  const result = await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'removed_from_team', home: s.w.home, dataDir: s.w.data, records, otherAccounts: [{ accountId: B, label: 'Acme' }] },
    {
      ...quietDeps(s),
      // The key goes; right after, the person is added back and connects again.
      forgetKey: async () => {
        reconnectInStore(s.w, newKey);
        return 'removed';
      },
      connectedAgain: () => accountConnectedAgain(s.w.data, A, s.key),
    },
  );
  assert.equal(result.stopped, 'reconnected');
  assert.deepEqual(result.kept, [{ path: s.mine, why: 'connected_again' }]);
  assert.deepEqual(await snapshot(s.mine), before);
});

/** Standard world plus two more folders made for the account under other roots: three to work through. */
async function threeFolders(t) {
  const s = await standardWorld(t);
  const secondRoot = path.join(s.w.home, 'Second-Root');
  const thirdRoot = path.join(s.w.home, 'Third-Root');
  await mkdir(secondRoot, { recursive: true });
  await mkdir(thirdRoot, { recursive: true });
  const second = await madeFolder(s.w, { root: secondRoot });
  const third = await madeFolder(s.w, { root: thirdRoot });
  return { ...s, second, third };
}

test('a reconnect between folders: the first has gone, this one and the rest stay, and the person is told both', async (t) => {
  const s = await threeFolders(t);
  const beforeSecond = await snapshot(s.second);
  const beforeThird = await snapshot(s.third);
  const records = await readMadeFolders(s.w.data);
  // The answer after the stop would let the third go if the stop did not stop the removal.
  const answers = ['no', 'again', 'no'];
  const notices = [];
  const result = await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'removed_from_team', home: s.w.home, dataDir: s.w.data, records, otherAccounts: [{ accountId: B, label: 'Acme' }] },
    {
      ...quietDeps(s),
      forgetKey: async () => 'removed',
      connectedAgain: async () => answers.shift() ?? 'again',
      beforeDone: (done) => notices.push(removalNotice(done, s.w.home)),
    },
  );
  assert.equal(result.stopped, 'reconnected');
  assert.deepEqual(result.removed, [s.mine]);
  assert.deepEqual(result.kept, [
    { path: s.second, why: 'connected_again' },
    { path: s.third, why: 'connected_again' },
  ]);
  assert.equal(await exists(s.mine), false);
  assert.deepEqual(await snapshot(s.second), beforeSecond);
  assert.deepEqual(await snapshot(s.third), beforeThird, 'the stop stops the removal: no later folder goes');
  assert.deepEqual(notices, [
    '"Northwind" was connected again while the plugin was removing it from this computer, so the plugin stopped. ' +
      'It had already removed its folder ~/Hiveku-Accounts/northwind-a0a0a0a0 (with everything in it). ' +
      'Left in place: ~/Second-Root/northwind-a0a0a0a0 (you connected this account again); ~/Third-Root/northwind-a0a0a0a0 (you connected this account again).',
  ]);
});

test('a key store that cannot be read at that moment keeps the folder and the journal, to try again', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  const records = await readMadeFolders(s.w.data);
  let journalRemoved = false;
  const result = await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'removed_from_team', home: s.w.home, dataDir: s.w.data, records, otherAccounts: [{ accountId: B, label: 'Acme' }] },
    {
      ...quietDeps(s),
      forgetKey: async () => 'removed',
      connectedAgain: async () => 'unknown',
      journal: { add: async () => {}, remove: async () => { journalRemoved = true; } },
    },
  );
  assert.equal(result.stopped, null);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept, [{ path: s.mine, why: 'store_unreadable' }]);
  assert.deepEqual(await snapshot(s.mine), before);
  assert.equal(journalRemoved, false, 'the journal stays, so the next start can try again');
});

test('a re-read that throws counts as cannot tell: the folder stays', async (t) => {
  const s = await standardWorld(t);
  const records = await readMadeFolders(s.w.data);
  const result = await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'removed_from_team', home: s.w.home, dataDir: s.w.data, records, otherAccounts: [{ accountId: B, label: 'Acme' }] },
    { ...quietDeps(s), forgetKey: async () => 'removed', connectedAgain: async () => { throw new Error('boom'); } },
  );
  assert.deepEqual(result.kept, [{ path: s.mine, why: 'store_unreadable' }]);
  assert.equal(await exists(s.mine), true);
});

test('the refused key still stored because its removal failed is no reconnect: the folder still goes', async (t) => {
  const s = await standardWorld(t);
  const records = await readMadeFolders(s.w.data);
  const result = await runAccountRemoval(
    { accountId: A, label: 'Northwind', reason: 'removed_from_team', home: s.w.home, dataDir: s.w.data, records, otherAccounts: [{ accountId: B, label: 'Acme' }] },
    {
      ...quietDeps(s),
      forgetKey: async () => { throw new Error('the write failed'); },
      connectedAgain: () => accountConnectedAgain(s.w.data, A, s.key),
    },
  );
  assert.equal(result.stopped, null);
  assert.deepEqual(result.removed, [s.mine]);
  assert.equal(await exists(s.mine), false);
});

test('a removal finished after a crash stops the same way when the account is connected again while it runs', async (t) => {
  const s = await threeFolders(t);
  const beforeSecond = await snapshot(s.second);
  const beforeThird = await snapshot(s.third);
  const realMine = await realpath(s.mine);
  // The key went before the crash; the journal lists both folders.
  const creds = await readCredsFile(s.w);
  delete creds.accounts[A];
  await writeFile(path.join(s.w.data, 'credentials.json'), JSON.stringify(creds));
  const records = await readMadeFolders(s.w.data);
  await writeJournal(s.w, records.filter((r) => r.account_id === A), new Date().toISOString());
  const newKey = madeUpKey();
  // White box: the reconnect lands right after the first folder is moved away.
  const fsp = createRequire(import.meta.url)('fs/promises');
  const realRename = fsp.rename;
  fsp.rename = async (from, to) => {
    const done = await realRename(from, to);
    if (from === realMine) reconnectInStore(s.w, newKey, { [B]: { key: s.otherKey, label: 'Acme', key_preview: s.otherKey.slice(0, 10), scope: 'full' } });
    return done;
  };
  t.after(() => { fsp.rename = realRename; });
  const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home });
  fsp.rename = realRename;
  assert.equal(results.length, 1);
  assert.equal(results[0].stopped, 'reconnected');
  assert.deepEqual(results[0].removed, [s.mine]);
  assert.deepEqual(results[0].kept, [
    { path: s.second, why: 'connected_again' },
    { path: s.third, why: 'connected_again' },
  ]);
  assert.deepEqual(await snapshot(s.second), beforeSecond);
  assert.deepEqual(await snapshot(s.third), beforeThird);
  assert.equal((await readCredsFile(s.w)).accounts[A].key, newKey);
  assert.equal(await exists(journalPath(s.w)), false, 'the removal is over');
  const [notice] = await takeNotices(s.w.data);
  assert.match(notice, /^"Northwind" was connected again while the plugin was removing it from this computer, so the plugin stopped\. It had already removed its folder ~\/Hiveku-Accounts\/northwind-a0a0a0a0 \(with everything in it\)\. Left in place: ~\/Second-Root\/northwind-a0a0a0a0 \(you connected this account again\); ~\/Third-Root\/northwind-a0a0a0a0 \(you connected this account again\)\.$/);
});

/* ── a journal too old to finish (HK-1384) ──────────────────────────────── */

const journalPath = (w) => path.join(w.data, 'offboarding', 'pending', `${A}.json`);

/** Plants a journal for account A, as a removal cut short leaves it. */
async function writeJournal(w, folders, at, extra = {}) {
  await mkdir(path.dirname(journalPath(w)), { recursive: true });
  await writeFile(journalPath(w), JSON.stringify({ v: 1, account_id: A, label: 'Northwind', reason: 'removed_from_team', folders, at, ...extra }));
}

/** The world after a removal was cut short: the key gone, the folder still there, the journal written at `at`. */
async function leftHalfway(t, at) {
  const s = await standardWorld(t);
  const records = await readMadeFolders(s.w.data);
  const creds = await readCredsFile(s.w);
  delete creds.accounts[A];
  await writeFile(path.join(s.w.data, 'credentials.json'), JSON.stringify(creds));
  await writeJournal(s.w, records.filter((r) => r.account_id === A), at);
  return s;
}

test('a journal past the limit deletes nothing more: the folder stays, the person is told once, the journal goes', async (t) => {
  const started = Date.parse('2026-11-08T10:00:00.000Z');
  const s = await leftHalfway(t, new Date(started).toISOString());
  const before = await snapshot(s.mine);
  const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => started + JOURNAL_MAX_AGE_MS + 1 });
  assert.equal(results.length, 1);
  assert.equal(results[0].stopped, 'too_old');
  assert.deepEqual(results[0].removed, []);
  assert.deepEqual(results[0].kept, [{ path: s.mine, why: 'too_old' }]);
  assert.deepEqual(await snapshot(s.mine), before, 'not one file was touched');
  assert.equal(await exists(journalPath(s.w)), false, 'the journal is dropped: it is said once');
  const notices = await takeNotices(s.w.data);
  assert.deepEqual(notices, [
    'The plugin started removing "Northwind" from this computer earlier, after Hiveku said you no longer had access to it, and that removal had not finished when this session started. ' +
      'It started too long ago for this session to go on without asking Hiveku again, and the saved key it would ask with is gone, so this session removed nothing. ' +
      'Still on this computer: ~/Hiveku-Accounts/northwind-a0a0a0a0. If another session is still removing the account, it may yet delete it; if not, delete it yourself if you no longer need it. ' +
      'If you still have access to "Northwind", run /hiveku:connect to connect it again.',
  ]);
  assert.doesNotMatch(notices[0], /[\u2014\u2013]|Claude|Anthropic|OpenAI|Cloudflare|Render|Supabase/);
  // Still recorded: a later removal on fresh answers can take it, and the next start says nothing more.
  assert.deepEqual((await readMadeFolders(s.w.data)).filter((r) => r.account_id === A).map((r) => r.dir), [s.mine]);
  assert.deepEqual(await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => started + JOURNAL_MAX_AGE_MS + 2 }), []);
  assert.deepEqual(await takeNotices(s.w.data), []);
});

test('the limit is the window the two sightings use: an answer from Hiveku is good for the same 30 minutes', () => {
  assert.equal(JOURNAL_MAX_AGE_MS, SIGHTING_TTL_MS);
  assert.equal(JOURNAL_MAX_AGE_MS, 30 * 60 * 1000);
});

test('the limit itself: a journal exactly at it is still finished, a millisecond past it is not', async (t) => {
  const started = Date.parse('2026-11-08T10:00:00.000Z');
  const atLimit = await leftHalfway(t, new Date(started).toISOString());
  const results = await finishPendingRemovals({ dataDir: atLimit.w.data, home: atLimit.w.home, now: () => started + JOURNAL_MAX_AGE_MS });
  assert.deepEqual(results[0].removed, [atLimit.mine]);
  assert.equal(await exists(atLimit.mine), false);
});

test('a journal whose time is missing, unreadable or in the future counts as too old: nothing is deleted on a time nobody can trust', async (t) => {
  const now = Date.parse('2026-11-08T10:00:00.000Z');
  for (const at of ['', 'yesterday-ish', undefined, new Date(now + 60_000).toISOString()]) {
    const s = await leftHalfway(t, at);
    const before = await snapshot(s.mine);
    const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => now });
    assert.equal(results[0].stopped, 'too_old', String(at));
    assert.deepEqual(await snapshot(s.mine), before, String(at));
  }
});

test('the case from the report: a journal left while the key store stayed locked for days is not finished when it opens', async (t) => {
  const started = Date.parse('2026-11-05T09:00:00.000Z');
  const s = await leftHalfway(t, new Date(started).toISOString());
  const good = await readFile(path.join(s.w.data, 'credentials.json'), 'utf8');
  const before = await snapshot(s.mine);
  await writeFile(path.join(s.w.data, 'credentials.json'), 'this is not json{{{');
  const threeDaysLater = started + 3 * 24 * 60 * 60 * 1000;
  assert.deepEqual(await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => threeDaysLater }), []);
  assert.equal(await exists(journalPath(s.w)), true, 'still waiting while the store cannot be read');
  assert.deepEqual(await snapshot(s.mine), before);
  await writeFile(path.join(s.w.data, 'credentials.json'), good);
  const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => threeDaysLater + 1000 });
  assert.equal(results[0].stopped, 'too_old');
  assert.deepEqual(await snapshot(s.mine), before, 'days-old answers delete nothing');
  assert.match((await takeNotices(s.w.data))[0], /too long ago for this session/);
});

test('an old journal with every folder already gone says only what happened, forgets the records, and nothing is thrown', async (t) => {
  const started = Date.parse('2026-11-08T10:00:00.000Z');
  const s = await leftHalfway(t, new Date(started).toISOString());
  const aside = path.join(s.w.outside, 'moved-by-the-person');
  await rename(s.mine, aside);
  const results = await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => started + 2 * JOURNAL_MAX_AGE_MS });
  assert.deepEqual(results[0].kept, []);
  assert.equal(await exists(aside), true, 'a folder the person moved elsewhere is not looked for');
  assert.deepEqual((await readMadeFolders(s.w.data)).filter((r) => r.account_id === A), [], 'the record of the folder that is gone is forgotten');
  const [notice] = await takeNotices(s.w.data);
  assert.equal(
    notice,
    'The plugin started removing "Northwind" from this computer earlier, after Hiveku said you no longer had access to it, and that removal had not finished when this session started. ' +
      // HK-1417: with no folder left, nothing is said to stay or to have been kept back.
      'None of the folders the plugin made for it are left where it made them. ' +
      'If you still have access to "Northwind", run /hiveku:connect to connect it again.',
  );
});

test('an old journal still clears what the removing folder holds: that left the person\'s path while the answer was fresh', async (t) => {
  const started = Date.parse('2026-11-08T10:00:00.000Z');
  const s = await leftHalfway(t, new Date(started).toISOString());
  const tomb = tombstonePath(s.w.data);
  await plantContent(path.join(tomb, 'mzz-abc123'));
  await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home, now: () => started + 2 * JOURNAL_MAX_AGE_MS });
  assert.deepEqual(await readdir(tomb), [], 'the leftover goes, whatever the age');
  assert.equal(await exists(s.mine), true, 'the folder does not');
});

test('oldRemovalNotice names at most three folders and counts the rest', () => {
  const notice = oldRemovalNotice({ label: 'Northwind', left: ['/home/x/a', '/home/x/b', '/home/x/c', '/home/x/d', '/home/x/e'], home: '/home/x' });
  assert.match(notice, /Still on this computer: ~\/a, ~\/b and ~\/c, and 2 more\. If another session is still removing the account, it may yet delete them; if not, delete them yourself if you no longer need them\./);
  assert.doesNotMatch(notice, /~\/d/);
});

/* ── what the person is told ────────────────────────────────────────────── */

test('the notice says plainly what went and what stayed', async (t) => {
  const s = await standardWorld(t);
  await plantBoundFolder(path.join(s.w.root, 'northwind-a0a0a0a0-2'), { boundBy: 'hiveku-desktop' });
  const result = await removeAccountFromComputer({ dataDir: s.w.data, home: s.w.home, accountId: A, reason: 'account_closed', key: s.key });
  const notice = removalNotice(result, s.w.home);
  assert.equal(
    notice,
    'You no longer have access to "Northwind": the account was closed. Removed from this computer: its folder ' +
      '~/Hiveku-Accounts/northwind-a0a0a0a0 (with everything in it) and its saved key. ' +
      'Left in place: ~/Hiveku-Accounts/northwind-a0a0a0a0-2 (the Hiveku app made it and removes it itself).',
  );
  assert.doesNotMatch(notice, /[\u2014\u2013]|Claude|Anthropic|OpenAI|Cloudflare|Render|Supabase/);
  assert.deepEqual(await takeNotices(s.w.data), [notice], 'kept for the hooks, once');
  assert.deepEqual(await takeNotices(s.w.data), []);
});

test('at most three kept folders are named; the rest are counted', () => {
  const r = {
    label: 'Northwind',
    reason: 'removed_from_team',
    removed: [],
    keyRemoved: true,
    kept: [1, 2, 3, 4, 5].map((n) => ({ path: `/x/n${n}`, why: 'link' })),
  };
  const notice = removalNotice(r, '/home');
  assert.match(notice, /\/x\/n3 \(it is a link, and links are never followed\), and 2 more\.$/);
  assert.doesNotMatch(notice, /n4/);
});

test('the check itself refuses a record of another account, the root, and a folder outside the root', async (t) => {
  const s = await standardWorld(t);
  const records = await readMadeFolders(s.w.data);
  const theirs = records.find((r) => r.account_id === B);
  const ctx = { accountId: A, home: s.w.home, dataDir: s.w.data, otherAccountFolders: [] };
  assert.deepEqual(await checkRemovable(theirs, ctx), { ok: false, why: 'not_made_here' });
  const mineRecord = records.find((r) => r.account_id === A);
  assert.deepEqual(await checkRemovable({ ...mineRecord, dir: s.w.root, root: s.w.root, ...(await folderIdentity(s.w.root)) }, ctx), { ok: false, why: 'is_root' });
  const away = path.join(s.w.outside, 'northwind-a0a0a0a0');
  await rename(s.mine, away);
  assert.deepEqual(await checkRemovable({ ...mineRecord, dir: away, ...(await folderIdentity(away)) }, ctx), { ok: false, why: 'outside_root' });
  assert.equal(await exists(away), true);
  assert.equal(await exists(s.theirs), true);
});

test('a removal left halfway is not finished while the key store cannot be read', async (t) => {
  const s = await standardWorld(t);
  const before = await snapshot(s.mine);
  const records = await readMadeFolders(s.w.data);
  await mkdir(path.join(s.w.data, 'offboarding', 'pending'), { recursive: true });
  await writeFile(
    path.join(s.w.data, 'offboarding', 'pending', `${A}.json`),
    JSON.stringify({ v: 1, account_id: A, label: 'Northwind', reason: 'removed_from_team', folders: records.filter((r) => r.account_id === A), at: '' }),
  );
  await writeFile(path.join(s.w.data, 'credentials.json'), 'this is not json{{{');
  assert.deepEqual(await finishPendingRemovals({ dataDir: s.w.data, home: s.w.home }), []);
  assert.deepEqual(await snapshot(s.mine), before);
  assert.equal(await exists(path.join(s.w.data, 'offboarding', 'pending', `${A}.json`)), true, 'kept, to finish once the store can be read');
});

test('the check itself refuses a binding that now names another account, and a path that only leads into the root through a link', async (t) => {
  const s = await standardWorld(t);
  const record = (await readMadeFolders(s.w.data)).find((r) => r.account_id === A);
  const ctx = { accountId: A, home: s.w.home, dataDir: s.w.data, otherAccountFolders: [] };
  const original = await readFile(path.join(s.mine, '.hiveku', 'account.json'), 'utf8');
  await writeFile(path.join(s.mine, '.hiveku', 'account.json'), JSON.stringify({ account_id: B, bound_by: 'hiveku-claude-plugin', made_by: 'hiveku-claude-plugin' }));
  assert.deepEqual(await checkRemovable(record, ctx), { ok: false, why: 'other_account' });
  await writeFile(path.join(s.mine, '.hiveku', 'account.json'), original);
  const intoRoot = path.join(s.w.outside, 'into-root');
  await symlink(s.w.root, intoRoot);
  const roundabout = { ...record, dir: path.join(intoRoot, 'northwind-a0a0a0a0') };
  assert.deepEqual(await checkRemovable(roundabout, ctx), { ok: false, why: 'outside_root' });
  assert.equal(await exists(path.join(s.mine, 'sites', 'main-site', 'index.html')), true);
});

test("a folder holding a binding below it that cannot be read stays: it may be another account's", async (t) => {
  const s = await standardWorld(t);
  const nested = path.join(s.mine, 'clients', 'unknown');
  await mkdir(path.join(nested, '.hiveku'), { recursive: true });
  await writeFile(path.join(nested, '.hiveku', 'account.json'), 'not json{');
  const before = await snapshot(s.mine);
  const result = await remove(s.w, s.key);
  assert.deepEqual(result.kept.map((k) => k.why), ['holds_other_account']);
  assert.deepEqual(await snapshot(s.mine), before);
});

test('a folder that could not be deleted, or whose account could not be checked, says when a later start tries again (HK-1417)', () => {
  const home = '/Users/made-up';
  for (const why of ['failed', 'store_unreadable']) {
    const notice = removalNotice(
      { label: 'Northwind', reason: 'removed_from_team', removed: [], kept: [{ path: `${home}/Hiveku-Accounts/northwind`, why }], keyRemoved: true, stopped: null },
      home,
    );
    // A later start finishes the removal only within JOURNAL_MAX_AGE_MS of its start, so no open-ended promise.
    assert.equal(JOURNAL_MAX_AGE_MS, 30 * 60 * 1000);
    assert.match(notice, /a new session started within half an hour of the removal tries again, and after that it stays for you to delete/, why);
    assert.doesNotMatch(notice, /tries again when a new session starts/, why);
  }
});
