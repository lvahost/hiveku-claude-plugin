/**
 * The folders `hiveku setup` made, and the mark it leaves in each (offboarding
 * O8b, notes/desktop-offboarding-o8b-2026-11-08.md).
 *
 * ★ `bound_by: "hiveku-claude-plugin"` NEVER MEANT THE PLUGIN MADE A FOLDER.
 * Setup writes it into a folder it makes, and also into an existing unbound
 * folder it adopts (the VS Code extension's, or anyone's), and /hiveku:bind
 * writes it into any folder the person picks. So when a person loses an
 * account, that field alone cannot say which folders are the plugin's to
 * remove. From this version setup leaves two things, and only in a folder it
 * has just made (one that was not there, or held nothing but a .DS_Store):
 *
 *   1. the binding, created exclusively (never over a file that is there,
 *      never through a link), with `made_by: "hiveku-claude-plugin"` beside
 *      `bound_by`. Other tools go on reading `bound_by`; the plugin's own
 *      /hiveku:bind over it drops the mark;
 *   2. a record in the plugin's own data folder, made-folders.json (0600):
 *      the account, the folder's path, the root setup made it under, and the
 *      folder's file identity (device and inode), so a copy, a replacement or
 *      a folder made again at that path is never taken for it.
 *
 * lib/offboarding.mjs removes a folder only when both are there and every
 * other check holds. A folder with neither (adopted, bound by hand, made
 * before this version) is never removed.
 *
 * The binding is untrusted input (lib/binding.mjs says why): it is read without
 * following a link, and it carries no secret and no address.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BINDING_DIR, BINDING_FILE } from './binding.mjs';
import { readPrivateJson, writePrivateJson } from './private-state.mjs';
import { safeDisplayText } from './util.mjs';

/** `bound_by` and `made_by` in the folders this plugin makes. */
export const PLUGIN_BINDER = 'hiveku-claude-plugin';
export const MADE_FOLDERS_FILE = 'made-folders.json';

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGITS = /^\d{1,40}$/;

/** True for an account id as the website names accounts: a lower-case UUID. */
export function isAccountUuid(value) {
  return typeof value === 'string' && LOWER_UUID.test(value);
}

function code(err) {
  return err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined;
}

/* ── Paths ────────────────────────────────────────────────────────────────── */

/** Paths compare without letter case where the disk ignores it (macOS, Windows). */
const FOLD_CASE = process.platform === 'darwin' || process.platform === 'win32';
const keyOf = (p) => (FOLD_CASE ? path.resolve(p).toLowerCase() : path.resolve(p));

export function samePath(a, b) {
  return keyOf(a) === keyOf(b);
}

/** Whether `p` lies inside `folder`, and is not `folder` itself. */
export function isStrictlyInside(p, folder) {
  const rest = path.relative(keyOf(folder), keyOf(p));
  return rest !== '' && rest !== '..' && !rest.startsWith(`..${path.sep}`) && !path.isAbsolute(rest);
}

export function isInsideOrSame(p, folder) {
  return samePath(p, folder) || isStrictlyInside(p, folder);
}

/* ── The mark ─────────────────────────────────────────────────────────────── */

/**
 * True when `folder` is not there, or is a real folder holding nothing (a stray
 * .DS_Store aside): one setup can call its own once it makes it. False for a
 * link, a file, or a folder with anything in it, which another tool or a person
 * may have made.
 */
export async function folderIsNewOrEmpty(folder) {
  let st;
  try {
    st = await fs.lstat(folder);
  } catch (err) {
    return code(err) === 'ENOENT';
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return false;
  try {
    return (await fs.readdir(folder)).every((name) => name === '.DS_Store');
  } catch {
    return false;
  }
}

/** The folder's device and inode as strings, or null when it is a link, not a folder, or not there. */
export async function folderIdentity(folder) {
  try {
    const st = await fs.lstat(folder, { bigint: true });
    if (st.isSymbolicLink() || !st.isDirectory()) return null;
    return { dev: String(st.dev), ino: String(st.ino) };
  } catch {
    return null;
  }
}

/**
 * Writes the binding with the plugin's mark into a folder setup has just made.
 * Created exclusively, never through a link, and only for an account id the
 * website names accounts by. 'already_bound': a binding was there (someone
 * else's, or written a moment ago), and it is left exactly as it is.
 */
export async function markMadeFolder(folder, { accountId, label, keyPreview }, now = new Date()) {
  if (!isAccountUuid(accountId)) return 'not_marked';
  const dir = path.join(folder, BINDING_DIR);
  try {
    const folderStat = await fs.lstat(folder);
    if (folderStat.isSymbolicLink() || !folderStat.isDirectory()) return 'not_marked';
    await fs.mkdir(dir, { recursive: true });
    const dirStat = await fs.lstat(dir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return 'not_marked';
  } catch {
    return 'not_marked';
  }
  const body = {
    version: 1,
    account_id: accountId,
    label: safeDisplayText(label, { fallback: accountId }),
    // A prefix, not a secret (lib/binding.mjs writeBinding).
    key_preview: typeof keyPreview === 'string' ? keyPreview : null,
    bound_at: now.toISOString(),
    bound_by: PLUGIN_BINDER,
    made_by: PLUGIN_BINDER,
    note: 'Directory-to-account binding for the Hiveku Claude Code plugin, which made this folder. Contains no credentials.',
  };
  try {
    await fs.writeFile(path.join(dir, BINDING_FILE), JSON.stringify(body, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return 'marked';
  } catch (err) {
    return code(err) === 'EEXIST' ? 'already_bound' : 'not_marked';
  }
}

/* ── The record ───────────────────────────────────────────────────────────── */

export function madeFoldersPath(dataDir) {
  return path.join(dataDir, MADE_FOLDERS_FILE);
}

/** An entry as it must be to count: a lower-case account id, absolute paths, the folder strictly inside its root. */
function validEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const { account_id: accountId, dir, root, dev, ino, made_at: madeAt } = e;
  if (!isAccountUuid(accountId)) return null;
  if (typeof dir !== 'string' || typeof root !== 'string') return null;
  if (!path.isAbsolute(dir) || !path.isAbsolute(root)) return null;
  if (path.resolve(dir) !== dir || path.resolve(root) !== root) return null;
  if (!isStrictlyInside(dir, root)) return null;
  if (typeof dev !== 'string' || typeof ino !== 'string' || !DIGITS.test(dev) || !DIGITS.test(ino)) return null;
  return { account_id: accountId, dir, root, dev, ino, made_at: typeof madeAt === 'string' ? madeAt : null };
}

/** Every folder setup recorded making, for every account. An unreadable record reads as none. */
export async function readMadeFolders(dataDir) {
  if (!dataDir) return [];
  const raw = await readPrivateJson(madeFoldersPath(dataDir));
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.folders)) return [];
  return raw.folders.map(validEntry).filter(Boolean);
}

/**
 * Records folders setup has just made and marked. A later entry for the same
 * path replaces the earlier one (setup made a folder again where the old one
 * had gone). One write for the whole batch.
 */
export async function recordMadeFolders(dataDir, entries) {
  const fresh = entries.map(validEntry).filter(Boolean);
  if (!fresh.length) return 0;
  const kept = (await readMadeFolders(dataDir)).filter((e) => !fresh.some((f) => samePath(f.dir, e.dir)));
  await writePrivateJson(madeFoldersPath(dataDir), { version: 1, folders: [...kept, ...fresh] });
  return fresh.length;
}

/** Drops the record of folders that are gone (removed, or deleted by the person). */
export async function forgetMadeFolders(dataDir, dirs) {
  const all = await readMadeFolders(dataDir);
  const left = all.filter((e) => !dirs.some((d) => samePath(d, e.dir)));
  if (left.length === all.length) return 0;
  await writePrivateJson(madeFoldersPath(dataDir), { version: 1, folders: left });
  return all.length - left.length;
}
