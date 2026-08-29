/**
 * Shared helpers. Zero dependencies by design: the plugin ships no
 * package.json and no lockfile, so Claude Code's npm auto-install (60s timeout,
 * --ignore-scripts) never runs for us and there is no third-party code sitting
 * next to a credential store.
 */
import { promises as fs } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const PLUGIN_VERSION = '0.10.9';
export const USER_AGENT = `hiveku-claude-plugin/${PLUGIN_VERSION}`;

/**
 * The upstream MCP endpoint is a CONSTANT, never read from a project file or an
 * environment variable. A directory's .hiveku/account.json is attacker-writable
 * (committed by a teammate, cloned, synced); if it could name an endpoint, a
 * planted file would redirect a live account key to a host of its choosing.
 */
export const HIVEKU_MCP_URL = 'https://core.hiveku.com/mcp';
export const HIVEKU_APP_URL = 'https://app.hiveku.com';

/** Identifies us to the rate limiter, which buckets per X-Hiveku-Client value. */
export const CLIENT_ID = 'claude-code-plugin';

export function slugify(value, fallback = 'item') {
  const s = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return s || fallback;
}

/** Matches hiveku-sync's convention so previews are comparable across tools. */
export function keyPreview(key) {
  return String(key ?? '').slice(0, 10);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes a file that never exists on disk in a readable-by-others state.
 *
 * Order matters: create the temp with mode 0600 via O_EXCL, write, fsync, then
 * rename. Writing first and chmod-ing after leaves a window where the content
 * is world-readable, and on a shared machine that window is the whole attack.
 * O_EXCL also means we never follow a symlink someone left at the temp path.
 */
export async function writeFileSecure(file, contents, mode = 0o600) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  let handle;
  try {
    handle = await fs.open(tmp, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, mode);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    if (handle) await handle.close();
  }
  await fs.rename(tmp, file);
}

/** Plain atomic write for non-secret files (bindings, manifests, data). */
export async function writeFileAtomic(file, contents) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, contents, 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Refuses a path that is a symlink or has extra hard links. Both are ways to
 * make us write credential material somewhere we did not choose.
 */
export async function assertNotRedirected(file) {
  try {
    const st = await fs.lstat(file);
    if (st.isSymbolicLink()) throw new Error(`refusing to use ${file}: it is a symlink`);
    if (st.nlink > 1) throw new Error(`refusing to use ${file}: it has ${st.nlink} hard links`);
  } catch (err) {
    if (err && err.code === 'ENOENT') return; // not existing yet is fine
    throw err;
  }
}

/**
 * Directories whose contents leave the machine. Credential material must never
 * land in one: iCloud Drive syncs ~/Documents on a default macOS setup, and the
 * others sync whatever you point them at.
 */
const SYNCED_MARKERS = [
  'Library/Mobile Documents', // iCloud Drive
  'Library/CloudStorage',     // OneDrive / Google Drive / Box via File Provider
  'Dropbox',
  'OneDrive',
  'Google Drive',
];

export function isSyncedLocation(absPath) {
  const p = path.resolve(absPath);
  const home = os.homedir();
  return SYNCED_MARKERS.some((marker) => {
    const needle = path.join(home, marker);
    return p === needle || p.startsWith(needle + path.sep) || p.includes(path.sep + marker + path.sep);
  });
}

/** Runs `tasks` with at most `limit` in flight, preserving result order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** ISO date N days before now, for the registry's rolling report windows. */
export function daysAgoIso(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Diagnostics go to stderr. stdout on the shim is protocol bytes only. */
export function warn(message) {
  process.stderr.write(`hiveku: ${message}\n`);
}

export function debug(message) {
  if (process.env.HIVEKU_DEBUG) process.stderr.write(`hiveku[debug]: ${message}\n`);
}
