// Shared by the offboarding tests (O8b: lib/key-standing.mjs, lib/offboarding.mjs,
// lib/made-folders.mjs). Not a test file itself.
//
// Isolation that holds even with a safety check broken:
//   - every folder is made under a fresh temporary folder per test, and every
//     place the code looks is passed in (the home folder, the plugin's data
//     folder), so a removal can only ever see temporary folders;
//   - the keychain tools (security, secret-tool) and the browser openers are
//     stubbed, the keychain faked and the environment cleaned for this process
//     and every process it starts (test/isolated.mjs), BEFORE any credential
//     write, so a credential write can never read or create anything in the
//     login keychain, whatever runs the tests;
//   - every key and account id is made up, and no request leaves 127.0.0.1:
//     fetch in this process refuses any other host, and a spawned bin/hiveku
//     gets a proxy that is not there for every host but 127.0.0.1.
import { isolatedEnv } from './isolated.mjs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* ── no request leaves 127.0.0.1, even with a check broken ───────────────── */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  let host = '';
  try {
    host = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url).hostname;
  } catch {
    host = '';
  }
  if (!LOCAL_HOSTS.has(host)) return Promise.reject(new TypeError(`a test may only reach 127.0.0.1, not ${host || 'that address'}`));
  return realFetch(input, init);
};

/** The environment for a spawned bin/hiveku: test/isolated.mjs's, with this world's home and data folder. */
export function childEnv(w, extra = {}) {
  return isolatedEnv({ HOME: w.home, HIVEKU_PLUGIN_DATA: w.data, ...extra });
}

/* ── made-up accounts and keys ───────────────────────────────────────────── */

// The same made-up ids as the extension's O8a tests.
export const A = 'a0a0a0a0-0b0b-4c0c-8d0d-0e0e0e0e0e0e';
export const B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
export const madeUpKey = () => `hvk_${randomBytes(32).toString('hex')}`;

/* ── the planted world ───────────────────────────────────────────────────── */

/** Every folder under `dir` made readable and writable again (a test locks one), never through a link. */
export async function openUp(dir) {
  const st = await lstat(dir).catch(() => null);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) return;
  await chmod(dir, 0o700).catch(() => undefined);
  for (const name of await readdir(dir).catch(() => [])) await openUp(path.join(dir, name));
}

/** A fresh world: a home with the default root in it, a folder outside it, and the plugin's data folder. */
export async function world(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'hiveku-o8b-'));
  // Cleaned up even when a broken check moved a locked folder somewhere the test did not expect.
  t.after(async () => {
    await openUp(base);
    await rm(base, { recursive: true, force: true });
  });
  const home = path.join(base, 'home');
  const root = path.join(home, 'Hiveku-Accounts');
  const outside = path.join(base, 'outside');
  const data = path.join(base, 'plugin-data');
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await mkdir(data, { recursive: true });
  return { base, home, root, outside, data };
}

/** The connect hash, as lib/credentials.mjs keeps it (recomputed here, so a test sees a change to it). */
export function connectHashOf(key) {
  return createHash('sha256').update(`hiveku-claude-plugin connect key\n${key.trim()}`, 'utf8').digest('hex');
}

/**
 * A plain (unencrypted) credential store, written directly, so planting one
 * never touches a keychain. `connect: true` keeps the hash connect keeps.
 */
export async function writeCreds(w, accounts) {
  const out = {};
  for (const [id, a] of Object.entries(accounts)) {
    out[id] = {
      key: a.key,
      label: a.label ?? 'Northwind',
      key_preview: a.key.slice(0, 10),
      scope: 'full',
      ...(a.connect ? { connect_key_hash: connectHashOf(a.key) } : {}),
    };
  }
  await writeFile(path.join(w.data, 'credentials.json'), JSON.stringify({ version: 1, accounts: out }, null, 2), { mode: 0o600 });
}

export async function readCredsFile(w) {
  return JSON.parse(await readFile(path.join(w.data, 'credentials.json'), 'utf8'));
}

/** What an account folder holds over time: data, knowledge, a downloaded site, node_modules. */
export async function plantContent(dir, { accountId = A, siteAccountId } = {}) {
  await mkdir(path.join(dir, 'hiveku-data', 'crm'), { recursive: true });
  await writeFile(path.join(dir, 'hiveku-data', 'crm', 'contacts.json'), '[]\n');
  await mkdir(path.join(dir, 'memory', 'shared'), { recursive: true });
  await writeFile(path.join(dir, 'memory', 'shared', 'brand.md'), 'voice\n');
  await mkdir(path.join(dir, 'sites', 'main-site', '.hiveku'), { recursive: true });
  await writeFile(
    path.join(dir, 'sites', 'main-site', '.hiveku', 'project.json'),
    JSON.stringify({ project_id: 'p1', account_id: siteAccountId ?? accountId }),
  );
  await writeFile(path.join(dir, 'sites', 'main-site', 'index.html'), '<h1>site</h1>\n');
  await mkdir(path.join(dir, 'sites', 'main-site', 'node_modules', 'pkg'), { recursive: true });
  await writeFile(path.join(dir, 'sites', 'main-site', 'node_modules', 'pkg', 'index.js'), 'module.exports = 1\n');
  await writeFile(path.join(dir, '.env.local'), `SITE_SECRET=${randomBytes(8).toString('hex')}\n`);
  return dir;
}

/** A folder with a binding as another tool (or a person) writes it: `boundBy` null writes none. */
export async function plantBoundFolder(dir, { accountId = A, boundBy = 'hiveku-desktop', madeBy } = {}) {
  await mkdir(path.join(dir, '.hiveku'), { recursive: true });
  if (boundBy !== null) {
    await writeFile(
      path.join(dir, '.hiveku', 'account.json'),
      JSON.stringify({ version: 1, account_id: accountId, label: 'x', bound_by: boundBy, ...(madeBy ? { made_by: madeBy } : {}) }),
    );
  }
  await plantContent(dir, { accountId });
  return dir;
}

/** Every file, folder and link under `dir`, with contents and link targets: compared before and after. */
export async function snapshot(dir) {
  const out = [];
  async function walk(p) {
    const st = await lstat(p);
    const rel = path.relative(dir, p) || '.';
    if (st.isSymbolicLink()) out.push(`L ${rel} -> ${await readlink(p)}`);
    else if (st.isDirectory()) {
      out.push(`D ${rel}`);
      for (const name of (await readdir(p)).sort()) await walk(path.join(p, name));
    } else out.push(`F ${rel} ${createHash('sha256').update(await readFile(p)).digest('hex')}`);
  }
  await walk(dir);
  return out;
}

export const exists = (p) => lstat(p).then(() => true, () => false);

/* ── local servers ───────────────────────────────────────────────────────── */

/**
 * A stand-in for the website's standing route on 127.0.0.1. `answer(n, req)`
 * returns { status, body, headers }, or a function that writes the response
 * itself. Every request is kept.
 */
export async function startRoute(answer) {
  const sockets = new Set();
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const seen = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
    requests.push(seen);
    const reply = answer(requests.length, seen);
    if (typeof reply === 'function') return reply(res);
    res.writeHead(reply.status, { 'content-type': 'application/json', ...(reply.headers ?? {}) });
    res.end(reply.body);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    appUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    count: () => requests.length,
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

export const standing = (s) => ({ status: 200, body: JSON.stringify({ standing: s }) });

/* ── a clock the test moves ──────────────────────────────────────────────── */

export function fakeClock(start = Date.parse('2026-11-08T12:00:00Z')) {
  let now = start;
  const timers = [];
  return {
    now: () => now,
    schedule: (fn, ms) => {
      const timer = { at: now + ms, fn, cancelled: false, ran: false };
      timers.push(timer);
      return { cancel: () => { timer.cancelled = true; } };
    },
    pending: () => timers.filter((x) => !x.cancelled && !x.ran).length,
    /** Moves the clock on, running each timer that comes due, in order, and waiting for what it starts. */
    async advance(ms, watcher) {
      const until = now + ms;
      for (;;) {
        const due = timers.filter((x) => !x.cancelled && !x.ran && x.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        due.ran = true;
        due.fn();
        await watcher?.settled();
      }
      now = until;
      await watcher?.settled();
    },
  };
}
