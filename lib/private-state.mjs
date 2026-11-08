/**
 * Small JSON files the plugin keeps for itself in its data folder (offboarding
 * O8b): the folders `hiveku setup` made, and what lib/key-standing.mjs and
 * lib/offboarding.mjs remember between processes.
 *
 * Kept apart from lib/util.mjs on purpose: hiveku-desktop vendors util.mjs
 * byte for byte (its config/hiveku/vendor-plugin.mjs), so a new helper there
 * would change the desktop's copy too.
 *
 * Reads never follow a link and never throw: a file that is a link, not a plain
 * file, too large or not JSON reads as absent, which every caller treats as
 * "nothing recorded" (the side that removes nothing). Writes are 0600, through
 * a temp file created exclusively under a name of its own, then renamed: two
 * writers in one process never share a temp file, and a rename over a link
 * replaces the link itself, never what it points at.
 */
import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** No state file the plugin writes comes near this. */
const MOST_BYTES = 4 * 1024 * 1024;

function code(err) {
  return err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined;
}

/** The parsed JSON at `file`, or null when it is absent, a link, not a plain file, too large or not JSON. */
export async function readPrivateJson(file, { mostBytes = MOST_BYTES } = {}) {
  let st;
  try {
    st = await fs.lstat(file);
  } catch {
    return null;
  }
  if (st.isSymbolicLink() || !st.isFile() || st.size > mostBytes) return null;
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes `value` as JSON to `file`, mode 0600, atomically. Its folder is made 0700 when missing. */
export async function writePrivateJson(file, value) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await fs.open(tmp, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmp, file);
  } catch (err) {
    if (handle) await handle.close().catch(() => undefined);
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Deletes `file` when it is there; a missing file is not an error. Never a folder. */
export async function removePrivateFile(file) {
  try {
    await fs.unlink(file);
    return true;
  } catch (err) {
    if (code(err) === 'ENOENT') return false;
    throw err;
  }
}
