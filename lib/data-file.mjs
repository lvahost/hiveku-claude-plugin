/**
 * The one writer for files the plugin itself puts in a bound folder's
 * hiveku-data/ (HK-341 and HK-346, 2026-10-21): an answer too large for a chat
 * (hiveku-data/.spill/) and a batch answer asked for as a file
 * (hiveku-data/batches/). /hiveku:pull writes the same folder
 * (lib/pulldata.mjs), and the .gitignore the plugin writes on bind and setup
 * names hiveku-data/, so none of it is committed. Each folder this writer
 * creates also gets its own .gitignore of `*`, for a folder bound some other
 * way whose .gitignore lacks that line.
 *
 * What lands here is customer data from a live account, and the folder it
 * lands in may be a cloned repository, so three rules:
 *
 *   - Names: the caller passes a folder this module owns (SPILL_DIR or
 *     BATCH_DIR) and a file name built from safeNamePart() and fileStamp().
 *     The writer checks both again, so no path from an answer or from tool
 *     arguments can reach the file system through it.
 *   - Atomic: the text goes to a new temporary file in the target folder
 *     (O_CREAT | O_EXCL | O_NOFOLLOW), which is then renamed over the name. A
 *     reader sees the old file or the whole new one, never part of one.
 *   - Never through a symlink: hiveku-data/ and the folder under it must each
 *     be a real folder (lstat), and the temporary file is opened without
 *     following one. A planted `hiveku-data -> ~/.ssh` in a cloned repository
 *     makes the write fail; it never redirects it. The final rename replaces
 *     a symlink at the file's name instead of following it.
 *
 * Honest limit: Node has no openat(), so a process of this same user that
 * swaps a checked folder for a symlink between the check and the write is not
 * stopped. Such a process can already write anywhere this one can; the rule is
 * for links that arrive with a repository.
 */
import { promises as fsp, constants as fsc } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const DATA_DIR = 'hiveku-data';
/** Answers over the stdout ceiling (lib/answer-files.mjs, HK-341). */
export const SPILL_DIR = '.spill';
/** hiveku_batch answers asked for with output "file" (HK-346). */
export const BATCH_DIR = 'batches';

const OWNED_DIRS = new Set([SPILL_DIR, BATCH_DIR]);

/** A file name this writer accepts: safe characters only, one `.json` suffix. */
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}\.json$/;

const O_NOFOLLOW = fsc.O_NOFOLLOW ?? 0;

const IGNORE_ALL = '# Written by the Hiveku plugin. Nothing in this folder is committed.\n*\n';

/**
 * Why a write did not happen. `code` is one of:
 *   no_bound_folder  the bound folder is not given, missing, or not a folder
 *   symlink          hiveku-data/ or the folder under it is a symbolic link
 *   not_a_directory  one of them exists and is not a folder
 *   bad_name         a folder or file name this writer does not accept
 *   write_failed     the disk said no (full, read-only, permissions)
 */
export class DataFileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DataFileError';
    this.code = code;
  }
}

/**
 * A part of a file name: letters, digits, `_` and `-` only, never starting
 * with `-` or `_` (so it cannot read as an option or a hidden file), at most
 * `max` characters. Anything that leaves nothing gives `fallback`.
 * '../../etc/passwd' gives 'etc_passwd'; a tool name passes unchanged.
 */
export function safeNamePart(raw, { max = 64, fallback = 'item' } = {}) {
  const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  const cleaned = text
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[_-]+/, '')
    .slice(0, max)
    .replace(/[_-]+$/, '');
  return cleaned || fallback;
}

/** A timestamp for a file name: 2026-10-21T12:00:00.123Z gives 20261021T120000123Z. */
export function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, '');
}

async function assertRealDir(dir) {
  let st;
  try {
    st = await fsp.lstat(dir);
  } catch (err) {
    throw new DataFileError('write_failed', `Cannot read ${dir} (${err?.code || 'error'}).`);
  }
  if (st.isSymbolicLink()) {
    throw new DataFileError(
      'symlink',
      `${dir} is a symbolic link. The Hiveku plugin writes only into real folders inside ${DATA_DIR}/.`,
    );
  }
  if (!st.isDirectory()) throw new DataFileError('not_a_directory', `${dir} exists and is not a folder.`);
}

/** Create one folder level (never recursively: its parent was checked first), then check it. */
async function ensureRealDir(dir) {
  try {
    await fsp.mkdir(dir, { mode: 0o700 });
  } catch (err) {
    if (err?.code !== 'EEXIST') {
      throw new DataFileError('write_failed', `Cannot create ${dir} (${err?.code || 'error'}).`);
    }
  }
  await assertRealDir(dir);
}

/** `<dir>/.gitignore` of `*`, created once. Best effort: the folder rule in the root .gitignore is the first line. */
async function ensureIgnoreAll(dir) {
  let handle = null;
  try {
    handle = await fsp.open(
      path.join(dir, '.gitignore'),
      fsc.O_WRONLY | fsc.O_CREAT | fsc.O_EXCL | O_NOFOLLOW,
      0o644,
    );
    await handle.writeFile(IGNORE_ALL, 'utf8');
  } catch {
    /* already there, or not writable: the write below says so if it matters */
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/**
 * Check the bound folder and make `<rootDir>/hiveku-data/<subdir>/`, refusing
 * a symlink at either level. Returns the folder's path. Throws DataFileError.
 * A hiveku_batch with output "file" calls this BEFORE anything is sent, so a
 * folder that cannot take the answer refuses the call instead of losing it.
 */
export async function prepareDataDir({ rootDir, subdir }) {
  if (typeof rootDir !== 'string' || rootDir === '' || !path.isAbsolute(rootDir)) {
    throw new DataFileError('no_bound_folder', 'This session has no bound project folder to write into.');
  }
  if (!OWNED_DIRS.has(subdir)) {
    throw new DataFileError('bad_name', `${String(subdir)} is not a folder this writer owns.`);
  }
  let st;
  try {
    // stat, not lstat: the bound folder itself may sit behind a link the
    // person made (/tmp on macOS is one). The rule is about hiveku-data/.
    st = await fsp.stat(rootDir);
  } catch (err) {
    throw new DataFileError('no_bound_folder', `The bound folder ${rootDir} cannot be read (${err?.code || 'error'}).`);
  }
  if (!st.isDirectory()) throw new DataFileError('no_bound_folder', `The bound folder ${rootDir} is not a folder.`);
  const dataDir = path.join(rootDir, DATA_DIR);
  await ensureRealDir(dataDir);
  const dir = path.join(dataDir, subdir);
  await ensureRealDir(dir);
  await ensureIgnoreAll(dir);
  return dir;
}

/**
 * Write `text` to `<rootDir>/hiveku-data/<subdir>/<fileName>`, atomically and
 * never through a symlink. Returns `{ path, relPath, bytes }`. Throws
 * DataFileError, and leaves no temporary file behind when it does.
 */
export async function writeDataFile({ rootDir, subdir, fileName, text }) {
  if (typeof fileName !== 'string' || !FILE_NAME_RE.test(fileName)) {
    throw new DataFileError('bad_name', 'Refusing a file name that is not letters, digits, _ and - with .json.');
  }
  if (typeof text !== 'string') throw new DataFileError('write_failed', 'Nothing to write: the text is not a string.');
  const dir = await prepareDataDir({ rootDir, subdir });
  const target = path.join(dir, fileName);
  const tmp = path.join(dir, `.${fileName}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  let handle = null;
  try {
    handle = await fsp.open(tmp, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_EXCL | O_NOFOLLOW, 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.close();
    handle = null;
    // Still the real folder that was checked, right before the name appears.
    await assertRealDir(dir);
    await fsp.rename(tmp, target);
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fsp.unlink(tmp).catch(() => {});
    if (err instanceof DataFileError) throw err;
    throw new DataFileError('write_failed', `Cannot write ${DATA_DIR}/${subdir}/${fileName} (${err?.code || 'error'}).`);
  }
  return {
    path: target,
    relPath: `${DATA_DIR}/${subdir}/${fileName}`,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}
