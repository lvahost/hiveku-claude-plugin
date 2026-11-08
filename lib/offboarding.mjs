/**
 * Removing an account from this computer when its person lost access to it
 * (offboarding O8b, notes/desktop-offboarding-o8b-2026-11-08.md). The VS Code
 * extension's src/offboarding.ts (O8a) is the model. lib/key-standing.mjs
 * decides WHEN (two definite answers from the website, minutes apart, about a
 * key /hiveku:connect minted here); this file decides WHAT, and does it.
 *
 * WHAT GOES: only folders `hiveku setup` made for that account
 * (lib/made-folders.mjs). A folder goes only when ALL of these hold, checked
 * when the removal is planned and again right before its delete
 * (checkRemovable):
 *   - it is recorded in made-folders.json for the account, and it is still
 *     that folder (the same device and inode);
 *   - its .hiveku/account.json is a plain file that names the account and says
 *     both bound_by and made_by "hiveku-claude-plugin";
 *   - it lies strictly inside the root it was made under, by its real path
 *     too, and is not the root; neither it nor any folder between the root and
 *     it is a link;
 *   - it is not the home folder or a folder holding it, and does not hold the
 *     plugin's own data folder;
 *   - it is not, is not inside and does not hold another account's folder the
 *     plugin knows of;
 *   - nothing inside it (all the way down, node_modules and .git aside, up to
 *     200,000 folders) is bound to another account, bound by the Hiveku app or
 *     another Hiveku tool, holds another account's site, or is hiveku-sync's
 *     (its key may be any account's), and it could be read through to tell.
 * Everything inside such a folder goes with it. A link inside it is unlinked
 * and what it points at stays: the delete never follows one.
 *
 * WHAT STAYS, and the person is told why: a folder the plugin did not make
 * (adopted by setup, bound with /hiveku:bind, made before this version), one
 * the Hiveku app or another Hiveku tool made, a link, anything outside the
 * root, anything that fails a check above. A file inside a folder the plugin
 * does not own is never deleted.
 *
 * WHERE IT LOOKS: the folders recorded for the account, the folder the session
 * is bound in, and under the default root and every recorded root, the
 * account's own folder name and the folders directly under the root whose
 * binding names the account. Nothing else on the computer.
 *
 * IN ORDER: plan (reads only); journal the removal; the key leaves
 * credentials.json (only while it is still the refused key: a reconnect stops
 * everything); each folder is checked again and, right before it goes, the key
 * store is read again (a reconnect stops there too: that folder and the rest
 * stay, and the person is told); moved whole into the plugin's own folder
 * offboarding/removing/ and deleted there for good (never the Trash: the plan's
 * call, the Trash is a copy); the person is told. A crash halfway is finished
 * at the next bridge start (finishPendingRemovals), only within
 * JOURNAL_MAX_AGE_MS of the removal starting, and never for an account
 * connected again since; a journal older than that stays and says so.
 *
 * Nothing here runs anything from a folder, and nothing reads the home folder
 * by itself: the home folder and the data folder are passed in.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BINDING_DIR, BINDING_FILE } from './binding.mjs';
import { readCredentials, removeAccountIfKey } from './credentials.mjs';
import {
  PLUGIN_BINDER,
  forgetMadeFolders,
  isAccountUuid,
  isInsideOrSame,
  isStrictlyInside,
  readMadeFolders,
  samePath,
} from './made-folders.mjs';
import { memoryStatePath } from './memory-changes.mjs';
import { readPrivateJson, removePrivateFile, writePrivateJson } from './private-state.mjs';
import { DEFAULT_ROOT_NAME, slugForAccount } from './setup.mjs';
import { safeDisplayText } from './util.mjs';

/** `bound_by` in the folders the Hiveku desktop app makes (hiveku-desktop account-folders.ts DESKTOP_BINDER). */
export const DESKTOP_BINDER = 'hiveku-desktop';

function code(err) {
  return err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined;
}

async function realOrNull(p) {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

/* ── The plugin's own folder for all of this ─────────────────────────────── */

export function offboardingDir(dataDir) {
  return path.join(dataDir, 'offboarding');
}
export function tombstonePath(dataDir) {
  return path.join(offboardingDir(dataDir), 'removing');
}
function pendingPath(dataDir, accountId) {
  if (!isAccountUuid(accountId)) throw new Error('not an account id');
  return path.join(offboardingDir(dataDir), 'pending', `${accountId}.json`);
}
function noticesDir(dataDir) {
  return path.join(offboardingDir(dataDir), 'notices');
}

/* ── Whose a folder says it is ───────────────────────────────────────────── */

/** Reads `.hiveku/account.json` without following a link: none, link, unreadable, or bound. */
export async function readFolderBinding(folder) {
  const dir = path.join(folder, BINDING_DIR);
  const file = path.join(dir, BINDING_FILE);
  let dirStat;
  try {
    dirStat = await fs.lstat(dir);
  } catch (err) {
    return code(err) === 'ENOENT' || code(err) === 'ENOTDIR' ? { kind: 'none' } : { kind: 'unreadable' };
  }
  if (dirStat.isSymbolicLink()) return { kind: 'link' };
  if (!dirStat.isDirectory()) return { kind: 'none' };
  let fileStat;
  try {
    fileStat = await fs.lstat(file);
  } catch (err) {
    return code(err) === 'ENOENT' ? { kind: 'none' } : { kind: 'unreadable' };
  }
  if (fileStat.isSymbolicLink()) return { kind: 'link' };
  if (!fileStat.isFile() || fileStat.size > 64 * 1024) return { kind: 'unreadable' };
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return { kind: 'unreadable' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'unreadable' };
  const { account_id: accountId, bound_by: boundBy, made_by: madeBy } = parsed;
  if (typeof accountId !== 'string' || !accountId.trim()) return { kind: 'unreadable' };
  return {
    kind: 'bound',
    accountId: accountId.trim().toLowerCase(),
    boundBy: typeof boundBy === 'string' ? boundBy : null,
    madeBy: typeof madeBy === 'string' ? madeBy : null,
  };
}

/** Why a folder with this binding is not the plugin's to delete for the account, or null when it is. */
function bindingWhy(binding, accountId) {
  if (binding.kind === 'none') return 'no_mark';
  if (binding.kind === 'link') return 'link';
  if (binding.kind === 'unreadable') return 'unreadable_mark';
  if (binding.accountId !== accountId.toLowerCase()) return 'other_account';
  if (binding.boundBy === PLUGIN_BINDER && binding.madeBy === PLUGIN_BINDER) return null;
  if (binding.boundBy === PLUGIN_BINDER) return 'not_made_here';
  return binding.boundBy === DESKTOP_BINDER ? 'desktop' : 'other_tool';
}

/* ── What a folder holds ──────────────────────────────────────────────────── */

/** No account's binding or site link lives in these, and they are most of a site folder's size. */
const NEVER_BOUND = new Set(['node_modules', '.git']);
/** A folder with more folders than this is not looked through whole, and so is not deleted. */
const MOST_FOLDERS = 200_000;
/** hiveku-sync's own records (src/pull.mjs, src/projects.mjs) and init's mark (src/folder-binding.mjs): its key in .env may be any account's. */
const HIVEKU_SYNC_FILES = ['manifest.json', 'projects.json', 'made-by-hiveku-sync.json'];

/** The account a site folder's .hiveku/project.json names, 'unreadable', or null for none. */
async function siteAccountAt(dir) {
  const file = path.join(dir, BINDING_DIR, 'project.json');
  let st;
  try {
    st = await fs.lstat(file);
  } catch (err) {
    return code(err) === 'ENOENT' ? null : 'unreadable';
  }
  if (st.isSymbolicLink() || !st.isFile() || st.size > 256 * 1024) return 'unreadable';
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return typeof parsed?.account_id === 'string' && parsed.account_id.trim()
      ? parsed.account_id.trim().toLowerCase()
      : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** Whether hiveku-sync keeps its records in this folder's .hiveku (or cannot be told). */
async function hivekuSyncAt(dir) {
  for (const name of HIVEKU_SYNC_FILES) {
    try {
      await fs.lstat(path.join(dir, BINDING_DIR, name));
      return true;
    } catch (err) {
      if (code(err) !== 'ENOENT') return true;
    }
  }
  return false;
}

/**
 * Whether a folder holds anything of another account or another Hiveku tool: a
 * binding below it naming another account (or one that cannot be read, or sits
 * behind a link), the account's own folder the Hiveku app or another Hiveku
 * tool bound, a site linked to another account, or hiveku-sync's records or
 * mark anywhere in it. Looks all the way down; reads only; never follows a link.
 */
export async function otherAccountInside(folder, accountId) {
  const mine = accountId.toLowerCase();
  let visited = 0;
  let level = [folder];
  for (let depth = 0; level.length > 0; depth += 1) {
    const below = [];
    for (const dir of level) {
      visited += 1;
      if (visited > MOST_FOLDERS) return 'not_read_through';
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (code(err) === 'ENOENT') continue;
        return 'not_read_through';
      }
      for (const entry of entries) {
        if (entry.name === BINDING_DIR) {
          // A linked .hiveku is never read through: whatever it points at may be another account's.
          if (entry.isSymbolicLink()) return depth > 0 ? 'holds_other_account' : 'not_read_through';
          if (depth > 0) {
            const binding = await readFolderBinding(dir);
            if (binding.kind === 'link' || binding.kind === 'unreadable') return 'holds_other_account';
            if (binding.kind === 'bound' && binding.accountId !== mine) return 'holds_other_account';
            // The account's own folder that the Hiveku app or another Hiveku tool bound: that tool removes its own.
            if (binding.kind === 'bound' && binding.boundBy !== PLUGIN_BINDER) return 'holds_other_tool';
          }
          if (await hivekuSyncAt(dir)) return 'holds_other_tool';
          const site = await siteAccountAt(dir);
          if (site === 'unreadable') return 'not_read_through';
          if (site !== null && site !== mine) return 'holds_other_account';
        } else if (entry.isDirectory() && !NEVER_BOUND.has(entry.name)) {
          below.push(path.join(dir, entry.name));
        }
      }
    }
    level = below;
  }
  return 'clear';
}

/* ── The check every delete goes through ──────────────────────────────────── */

/**
 * Whether the recorded folder `entry` may be deleted for this account now (see
 * the header). Reads only. ctx: { accountId, home, dataDir, otherAccountFolders }.
 */
export async function checkRemovable(entry, ctx) {
  const refuse = (why) => ({ ok: false, why });
  if (!ctx || !ctx.home || !isAccountUuid(ctx.accountId)) return refuse('home');
  if (!entry || entry.account_id !== ctx.accountId) return refuse('not_made_here');
  const folder = entry.dir;
  if (typeof folder !== 'string' || !path.isAbsolute(folder) || path.resolve(folder) !== folder) return refuse('outside_root');
  if (typeof entry.root !== 'string' || !path.isAbsolute(entry.root)) return refuse('outside_root');
  const root = path.resolve(entry.root);
  if (samePath(folder, root)) return refuse('is_root');
  if (!isStrictlyInside(folder, root)) return refuse('outside_root');

  let st;
  try {
    st = await fs.lstat(folder, { bigint: true });
  } catch (err) {
    return code(err) === 'ENOENT' ? { ok: true, gone: true } : refuse('not_read_through');
  }
  if (st.isSymbolicLink()) return refuse('link');
  if (!st.isDirectory()) return refuse('not_read_through');
  for (let up = path.dirname(folder); isStrictlyInside(up, root); up = path.dirname(up)) {
    const between = await fs.lstat(up).catch(() => null);
    if (!between || between.isSymbolicLink()) return refuse('link');
  }
  // Still the folder setup made there: a copy, a replacement or a folder made again at that path is not.
  if (String(st.dev) !== entry.dev || String(st.ino) !== entry.ino) return refuse('replaced');

  // By the real paths too: a link that appeared between the checks above and here still never leads out.
  const realRoot = await realOrNull(root);
  const real = await realOrNull(folder);
  if (!realRoot || !real) return refuse('not_read_through');
  if (!isStrictlyInside(real, realRoot)) return refuse('outside_root');
  // Never the home folder or a folder holding it.
  const realHome = (await realOrNull(ctx.home)) ?? path.resolve(ctx.home);
  if (isInsideOrSame(realHome, real)) return refuse('home');
  // Never the plugin's own data folder (every account's keys) or a folder holding it.
  if (ctx.dataDir) {
    const realData = (await realOrNull(ctx.dataDir)) ?? path.resolve(ctx.dataDir);
    if (isInsideOrSame(realData, real) || isInsideOrSame(path.resolve(ctx.dataDir), folder)) return refuse('holds_plugin_data');
  }

  for (const other of ctx.otherAccountFolders ?? []) {
    if (!other) continue;
    const lexical = path.resolve(other);
    const realOther = (await realOrNull(lexical)) ?? lexical;
    if (
      isInsideOrSame(lexical, folder) ||
      isStrictlyInside(folder, lexical) ||
      isInsideOrSame(realOther, real) ||
      isStrictlyInside(real, realOther)
    ) {
      return refuse('other_account_folder');
    }
  }

  const why = bindingWhy(await readFolderBinding(real), ctx.accountId);
  if (why) return refuse(why);

  const inside = await otherAccountInside(real, ctx.accountId);
  if (inside !== 'clear') return refuse(inside);
  return { ok: true, real };
}

/* ── Planning ─────────────────────────────────────────────────────────────── */

/** Real folders directly under `root` (never through a link). */
async function childFolders(root) {
  const st = await fs.lstat(root).catch(() => null);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) return [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name));
}

function addPath(list, p) {
  if (!p) return;
  const resolved = path.resolve(p);
  if (!list.some((q) => samePath(q, resolved))) list.push(resolved);
}

/**
 * What goes and what stays for this account. Reads only.
 * ctx: { accountId, label, home, dataDir, records (every made-folders entry), sessionFolder,
 *        otherAccounts ([{ accountId, label }] the plugin holds keys for) }.
 * Returns { remove: [record entries], kept: [{ path, why }], others: [other accounts' folders] }.
 */
/**
 * Where the plugin looks for an account, and the other accounts' folders it
 * knows of: their records, the folders directly under each root bound to them,
 * and the folders their names give there, bound or not.
 */
async function lookAround(ctx) {
  const accountId = ctx.accountId;
  const records = Array.isArray(ctx.records) ? ctx.records : [];
  const others = records.filter((r) => r.account_id !== accountId).map((r) => r.dir);
  const roots = [];
  if (ctx.home) addPath(roots, path.join(ctx.home, DEFAULT_ROOT_NAME));
  for (const r of records) addPath(roots, r.root);
  const looked = [];
  for (const root of roots) {
    for (const child of await childFolders(root)) {
      const binding = await readFolderBinding(child);
      if (binding.kind === 'bound' && binding.accountId !== accountId) addPath(others, child);
      else if (binding.kind === 'bound') addPath(looked, child);
    }
    if (ctx.label !== undefined) addPath(looked, path.join(root, slugForAccount(ctx.label, accountId)));
    for (const other of ctx.otherAccounts ?? []) {
      if (other?.accountId && other.accountId !== accountId) addPath(others, path.join(root, slugForAccount(other.label, other.accountId)));
    }
  }
  if (ctx.sessionFolder) addPath(looked, ctx.sessionFolder);
  return { looked, others };
}

export async function planAccountRemoval(ctx) {
  const accountId = ctx.accountId;
  const records = Array.isArray(ctx.records) ? ctx.records : [];
  const mine = records.filter((r) => r.account_id === accountId);
  // Every other place it looks is reported, never removed.
  const { looked, others } = await lookAround(ctx);

  const checkCtx = { accountId, home: ctx.home, dataDir: ctx.dataDir, otherAccountFolders: others };
  const plan = { remove: [], kept: [], others };
  for (const entry of mine) {
    const verdict = await checkRemovable(entry, checkCtx);
    if (!verdict.ok) plan.kept.push({ path: entry.dir, why: verdict.why });
    else if (verdict.real && !plan.remove.some((r) => samePath(r.dir, entry.dir))) plan.remove.push(entry);
  }

  for (const p of looked) {
    if (mine.some((e) => samePath(e.dir, p))) continue;
    // Inside a folder that goes, it goes with it.
    if (plan.remove.some((e) => isInsideOrSame(p, e.dir))) continue;
    const st = await fs.lstat(p).catch(() => null);
    if (!st) continue;
    if (st.isSymbolicLink()) {
      plan.kept.push({ path: p, why: 'link' });
      continue;
    }
    if (!st.isDirectory()) continue;
    const binding = await readFolderBinding(p);
    if (binding.kind === 'bound' && binding.accountId !== accountId) continue;
    // Marked but not recorded is not the plugin's either: the record is what says it made this folder here.
    plan.kept.push({ path: p, why: bindingWhy(binding, accountId) ?? 'not_made_here' });
  }
  return plan;
}

/* ── Deleting ─────────────────────────────────────────────────────────────── */

/**
 * ★ HAS THE ACCOUNT COME BACK (HK-1383). The key leaves the store before any
 * folder does, and a person re-added to the team can connect again at any moment
 * after that; the look through a large folder can take a while. So right before
 * a folder is moved, the key store is read again: 'again' when a key other than
 * the refused one is stored for the account now (the removal stops and the
 * folder stays), 'unknown' when the store cannot be read, otherwise 'no'.
 * `refusedKey` absent (a removal finished after a crash): any key stored now is
 * a reconnect, because the removal took the old one out before anything else.
 */
export async function accountConnectedAgain(dataDir, accountId, refusedKey) {
  const store = await readCredentials(dataDir);
  if (store.locked || store.corrupt) return 'unknown';
  const record = store.accounts[accountId];
  return record && record.key !== refusedKey ? 'again' : 'no';
}

const RM_OPTIONS = { recursive: true, force: true, maxRetries: 3 };

/** A fresh name inside the plugin's own removing folder, or null when that folder is not a plain folder. */
async function tombstoneFor(tombstoneDir) {
  try {
    await fs.mkdir(tombstoneDir, { recursive: true, mode: 0o700 });
    const st = await fs.lstat(tombstoneDir);
    if (st.isSymbolicLink() || !st.isDirectory()) return null;
  } catch {
    return null;
  }
  return path.join(tombstoneDir, `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`);
}

/**
 * Deletes one planned folder for good, after checking it again and, last of all,
 * asking `connectedAgain` (HK-1383, accountConnectedAgain above): moved whole
 * into the plugin's own removing folder first (one rename, so the account's path
 * is gone at once), then deleted there. A folder that cannot be moved (another
 * disk) is deleted where it is. Never the Trash. Never throws. Outcomes: removed,
 * gone, refused (with a why), failed (with a why), or stopped (the account was
 * connected again).
 */
export async function deleteFolderForGood(entry, ctx, tombstoneDir, connectedAgain) {
  const verdict = await checkRemovable(entry, ctx);
  if (!verdict.ok) return { outcome: 'refused', why: verdict.why };
  if (!verdict.real) return { outcome: 'gone' };
  // Asked here, after the look through the folder, so a reconnect during that look is seen before the move.
  let again = 'unknown';
  try {
    again = await connectedAgain();
  } catch {
    // Cannot tell: the folder stays, the same as a store that cannot be read.
  }
  if (again === 'again') return { outcome: 'stopped' };
  if (again !== 'no') return { outcome: 'failed', why: 'store_unreadable' };
  let target = verdict.real;
  const tomb = await tombstoneFor(tombstoneDir);
  if (tomb && !isInsideOrSame(tomb, verdict.real)) {
    try {
      await fs.rename(verdict.real, tomb);
      target = tomb;
    } catch {
      // Another disk, or held open: deleted where it is.
    }
  }
  try {
    await fs.rm(target, RM_OPTIONS);
    return { outcome: 'removed' };
  } catch {
    return { outcome: 'failed' };
  }
}

/** Deletes what an earlier removal left in the plugin's removing folder. Returns how many it cleared. */
export async function clearTombstones(tombstoneDir) {
  const st = await fs.lstat(tombstoneDir).catch(() => null);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) return 0;
  let cleared = 0;
  for (const entry of await fs.readdir(tombstoneDir, { withFileTypes: true }).catch(() => [])) {
    const left = path.join(tombstoneDir, entry.name);
    try {
      if (entry.isSymbolicLink() || !entry.isDirectory()) await fs.unlink(left);
      else await fs.rm(left, RM_OPTIONS);
      cleared += 1;
    } catch {
      // Tried again at the next start.
    }
  }
  return cleared;
}

/* ── The whole removal ────────────────────────────────────────────────────── */

/**
 * Remove the account from this computer: plan, journal, key first, then the
 * folders. Never throws.
 * ctx: { accountId, label, reason, home, dataDir, records, sessionFolder, otherAccounts }.
 * deps: { forgetKey: () => 'removed'|'changed'|'gone', forgetState, journal: { add, remove }, tombstoneDir, log,
 *         connectedAgain: () => 'again'|'no'|'unknown', read right before each folder goes (HK-1383),
 *         beforeDone(result): called before the journal is dropped, so a notice kept there survives a crash }.
 * `stopped: 'reconnected'` when another key was stored since: before the key went, nothing is deleted
 * and nothing is said; after it went, the folders not yet deleted stay and the person is told.
 */
export async function runAccountRemoval(ctx, deps) {
  const log = deps.log ?? (() => undefined);
  const plan = await planAccountRemoval(ctx);
  const checkCtx = { accountId: ctx.accountId, home: ctx.home, dataDir: ctx.dataDir, otherAccountFolders: plan.others };
  const result = {
    accountId: ctx.accountId,
    label: ctx.label,
    reason: ctx.reason,
    removed: [],
    kept: [...plan.kept],
    keyRemoved: false,
    stopped: null,
  };
  try {
    await deps.journal.add({
      account_id: ctx.accountId,
      label: ctx.label,
      reason: ctx.reason,
      folders: plan.remove,
      at: new Date().toISOString(),
    });
  } catch (err) {
    log(`[offboarding] Could not note the removal before starting (${code(err) ?? 'error'}); going on.`);
  }

  let key = 'failed';
  try {
    key = await deps.forgetKey();
  } catch (err) {
    log(`[offboarding] Could not delete the saved key (${code(err) ?? err?.name ?? 'error'}).`);
  }
  if (key === 'changed') {
    // Another key was stored since: the person has the account again. Nothing more happens.
    result.stopped = 'reconnected';
    result.kept = [];
    await deps.journal.remove().catch(() => undefined);
    log('[offboarding] The account has another key now; nothing is removed.');
    return result;
  }
  result.keyRemoved = key === 'removed';
  await Promise.resolve()
    .then(() => deps.forgetState?.())
    .catch(() => undefined);

  let failed = false;
  const gone = [];
  for (const [index, entry] of plan.remove.entries()) {
    const done = await deleteFolderForGood(entry, checkCtx, deps.tombstoneDir, deps.connectedAgain);
    if (done.outcome === 'stopped') {
      // Connected again while this ran: this folder and the rest stay, and the removal is over.
      result.stopped = 'reconnected';
      for (const left of plan.remove.slice(index)) result.kept.push({ path: left.dir, why: 'connected_again' });
      log('[offboarding] The account was connected again during the removal; the folders not yet deleted stay.');
      break;
    }
    if (done.outcome === 'removed' || done.outcome === 'gone') {
      result.removed.push(entry.dir);
      gone.push(entry.dir);
    } else if (done.outcome === 'refused') {
      result.kept.push({ path: entry.dir, why: done.why });
    } else {
      failed = true;
      result.kept.push({ path: entry.dir, why: done.why ?? 'failed' });
    }
  }
  if (gone.length && ctx.dataDir) await forgetMadeFolders(ctx.dataDir, gone).catch(() => undefined);
  await Promise.resolve()
    .then(() => deps.beforeDone?.(result))
    .catch(() => undefined);
  if (!failed || result.stopped) await deps.journal.remove().catch(() => undefined);
  return result;
}

/**
 * The removal as the bridge runs it, on the second sighting: everything read
 * from the plugin's data folder, the key compared and removed, the person's
 * notice kept for the hooks. `key` is the key Hiveku refused.
 */
export async function removeAccountFromComputer({ dataDir, home, accountId, reason, key, sessionFolder, log = () => undefined }) {
  if (!dataDir || !home || !isAccountUuid(accountId)) return null;
  const creds = await readCredentials(dataDir);
  // A store that cannot be read cannot say the key is still the refused one: nothing happens.
  if (creds.locked || creds.corrupt) return null;
  const label = safeDisplayText(creds.accounts[accountId]?.label, { fallback: accountId });
  const otherAccounts = Object.entries(creds.accounts)
    .filter(([id]) => id !== accountId)
    .map(([id, a]) => ({ accountId: id, label: a?.label }));
  const records = await readMadeFolders(dataDir);
  const journalFile = pendingPath(dataDir, accountId);
  const result = await runAccountRemoval(
    { accountId, label, reason, home, dataDir, records, sessionFolder, otherAccounts },
    {
      forgetKey: () => removeAccountIfKey(dataDir, accountId, key),
      connectedAgain: () => accountConnectedAgain(dataDir, accountId, key),
      forgetState: () => removePrivateFile(memoryStatePath(dataDir, accountId)),
      journal: {
        add: (entry) => writePrivateJson(journalFile, { v: 1, ...entry }),
        remove: () => removePrivateFile(journalFile),
      },
      tombstoneDir: tombstonePath(dataDir),
      log,
      beforeDone: async (done) => {
        for (const line of removalLogLines(done)) log(line);
        await addNotice(dataDir, { accountId, kind: 'removed', text: removalNotice(done, home) }).catch((err) =>
          log(`[offboarding] Could not keep the notice (${code(err) ?? 'error'}).`),
        );
      },
    },
  );
  return result;
}

/**
 * ★ HOW OLD A JOURNAL MAY BE AND STILL BE FINISHED (HK-1384). A journal is what is
 * left of a decision made on two answers from Hiveku, and an answer is only good
 * for a short while: the sightings themselves must be within 30 minutes
 * (lib/key-standing.mjs SIGHTING_TTL_MS). A removal cut short (a closed session, a
 * key store that stayed locked for days) can be finished for the same 30 minutes
 * from when it started. After that its answers are old, and the plugin cannot ask
 * again: the question needs the refused key as its bearer, and that key left the
 * store before anything else. So an older journal STAYS AND SAYS SO: nothing more
 * is deleted, the person is told once which folders stayed and why, and the journal
 * is dropped. The folders stay recorded, so a later removal on fresh answers can
 * still take them. What was already moved into the removing folder is finished
 * whatever the age: that folder left the person's path while the answer was fresh.
 */
export const JOURNAL_MAX_AGE_MS = 30 * 60 * 1000;

/** Whether a journal from `at` (its ISO time) may be finished at `now`. An unreadable or future time may not. */
function journalIsRecent(at, now) {
  const age = now - Date.parse(at);
  return age >= 0 && age <= JOURNAL_MAX_AGE_MS;
}

/**
 * Finish removals a crash or a closed session left halfway: each journaled
 * folder is checked again and deleted, and what an earlier removal moved into
 * the removing folder is deleted. An account connected again since keeps
 * everything, and so does every account while the key store cannot be read. A
 * journal older than JOURNAL_MAX_AGE_MS deletes nothing more (see above).
 * `now` is a test's own clock.
 */
export async function finishPendingRemovals({ dataDir, home, log = () => undefined, now = () => Date.now() }) {
  if (!dataDir || !home) return [];
  const results = [];
  const dir = path.join(offboardingDir(dataDir), 'pending');
  let names = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  if (names.length) {
    const creds = await readCredentials(dataDir);
    if (creds.locked || creds.corrupt) return [];
    const records = await readMadeFolders(dataDir);
    for (const name of names) {
      const accountId = name.slice(0, -'.json'.length);
      if (!isAccountUuid(accountId)) continue;
      const file = pendingPath(dataDir, accountId);
      const entry = await readPrivateJson(file);
      if (!entry || entry.v !== 1 || entry.account_id !== accountId || !Array.isArray(entry.folders)) continue;
      if (creds.accounts[accountId]) {
        log('[offboarding] An account whose removal was left halfway is connected again; its files stay.');
        await removePrivateFile(file).catch(() => undefined);
        continue;
      }
      // The record as it is now: a folder whose record is gone is no longer the plugin's to delete.
      const folders = entry.folders
        .map((folder) => records.find((r) => r.account_id === accountId && samePath(r.dir, folder?.dir ?? '')))
        .filter(Boolean);
      const label = safeDisplayText(entry.label, { fallback: accountId });
      if (!journalIsRecent(entry.at, now())) {
        results.push(await giveUpOldRemoval({ dataDir, home, accountId, label, folders, file, log }));
        continue;
      }
      const otherAccounts = Object.entries(creds.accounts).map(([id, a]) => ({ accountId: id, label: a?.label }));
      const { others } = await lookAround({ accountId, home, records, otherAccounts });
      const ctx = { accountId, home, dataDir, otherAccountFolders: others };
      const reason = entry.reason === 'account_closed' ? 'account_closed' : 'removed_from_team';
      const result = { accountId, label, reason, removed: [], kept: [], keyRemoved: true, stopped: null };
      let failed = false;
      const gone = [];
      for (const [index, recorded] of folders.entries()) {
        const done = await deleteFolderForGood(recorded, ctx, tombstonePath(dataDir), () => accountConnectedAgain(dataDir, accountId));
        if (done.outcome === 'stopped') {
          // Connected again while this ran: this folder and the rest stay, and the removal is over.
          result.stopped = 'reconnected';
          for (const left of folders.slice(index)) result.kept.push({ path: left.dir, why: 'connected_again' });
          log('[offboarding] The account was connected again while its removal was finished; the folders not yet deleted stay.');
          break;
        }
        if (done.outcome === 'removed' || done.outcome === 'gone') {
          // Gone already: the removal that was cut short had deleted it.
          result.removed.push(recorded.dir);
          gone.push(recorded.dir);
        } else if (done.outcome === 'refused') {
          result.kept.push({ path: recorded.dir, why: done.why });
        } else {
          failed = true;
          result.kept.push({ path: recorded.dir, why: done.why ?? 'failed' });
        }
      }
      if (gone.length) await forgetMadeFolders(dataDir, gone).catch(() => undefined);
      if (result.removed.length || result.kept.length) {
        for (const line of removalLogLines(result)) log(line);
        await addNotice(dataDir, { accountId, kind: 'removed', text: removalNotice(result, home) }).catch(() => undefined);
      }
      if (!failed || result.stopped) await removePrivateFile(file).catch(() => undefined);
      results.push(result);
    }
  }
  await clearTombstones(tombstonePath(dataDir));
  return results;
}

/**
 * A journal too old to finish (JOURNAL_MAX_AGE_MS): nothing is deleted, the person
 * is told what stayed, the journal is dropped. The folders stay recorded; only the
 * records of folders already gone are forgotten.
 */
async function giveUpOldRemoval({ dataDir, home, accountId, label, folders, file, log }) {
  const left = [];
  const gone = [];
  for (const recorded of folders) {
    let there = true;
    try {
      await fs.lstat(recorded.dir);
    } catch (err) {
      there = code(err) !== 'ENOENT';
    }
    (there ? left : gone).push(recorded.dir);
  }
  if (gone.length) await forgetMadeFolders(dataDir, gone).catch(() => undefined);
  log(`[offboarding] A removal left halfway is too old to finish on Hiveku's old answers; ${left.length} folder(s) stay.`);
  await addNotice(dataDir, { accountId, kind: 'removed', text: oldRemovalNotice({ label, left, home }) }).catch(() => undefined);
  await removePrivateFile(file).catch(() => undefined);
  return {
    accountId,
    label,
    reason: null,
    removed: [],
    kept: left.map((p) => ({ path: p, why: 'too_old' })),
    keyRemoved: false,
    stopped: 'too_old',
  };
}

/* ── What the person is told ──────────────────────────────────────────────── */

const KEPT_WORDS = {
  not_made_here:
    'the plugin did not make it: it was bound with /hiveku:bind or set up before this version; delete it yourself if you no longer need it',
  no_mark: 'it has no Hiveku binding, so the plugin cannot tell who made it; delete it yourself if you no longer need it',
  desktop: 'the Hiveku app made it and removes it itself',
  other_tool: 'another Hiveku tool made it, so the plugin leaves it alone; delete it yourself if you no longer need it',
  other_account: 'it belongs to another account',
  unreadable_mark: 'its Hiveku file could not be read',
  link: 'it is a link, and links are never followed',
  outside_root: 'it is outside the folder the plugin set your accounts up in',
  is_root: 'it is the folder your accounts are set up in',
  home: 'it is your home folder',
  replaced: 'it is not the folder the plugin made there: it was replaced or copied since',
  other_account_folder: "it is part of another account's folder",
  holds_other_account: 'it holds a folder of another account',
  holds_other_tool:
    'it holds files the Hiveku app or another Hiveku tool made, so the plugin leaves it alone; delete it yourself if you no longer need it',
  holds_plugin_data: "it holds the plugin's own data folder",
  not_read_through: 'it could not be read through to make sure it holds nothing of another account',
  failed: 'it could not be deleted completely; the plugin tries again when a new session starts',
  connected_again: 'you connected this account again',
  store_unreadable:
    'the saved keys could not be read to make sure this account was not connected again; the plugin tries again when a new session starts',
};

/** A path as the person knows it: the home folder written as ~, and nothing in it that could break a line. */
export function shownPath(p, home) {
  const shown = home && isInsideOrSame(p, home) ? path.join('~', path.relative(path.resolve(home), path.resolve(p))) : p;
  return safeDisplayText(shown, { max: 300, fallback: '(a folder)' });
}

const REASON_WORDS = {
  removed_from_team: 'you were removed from its team',
  account_closed: 'the account was closed',
};

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The notice, in plain words: why, what went, what stayed. At most three kept folders are named; the log has all. */
export function removalNotice(r, home) {
  const name = safeDisplayText(r.label, { fallback: 'this account' });
  if (r.stopped === 'reconnected') return reconnectedNotice(r, name, home);
  const went = [];
  if (r.removed.length === 1) went.push(`its folder ${shownPath(r.removed[0], home)} (with everything in it)`);
  else if (r.removed.length > 1) went.push(`its folders ${list(r.removed.map((f) => shownPath(f, home)))} (with everything in them)`);
  if (r.keyRemoved) went.push('its saved key');
  const parts = [`You no longer have access to "${name}": ${REASON_WORDS[r.reason] ?? REASON_WORDS.removed_from_team}.`];
  parts.push(went.length ? `Removed from this computer: ${list(went)}.` : 'Nothing of it was removed from this computer.');
  if (r.kept.length) {
    const shown = r.kept.slice(0, 3).map((k) => `${shownPath(k.path, home)} (${KEPT_WORDS[k.why] ?? KEPT_WORDS.failed})`);
    const more = r.kept.length > 3 ? `, and ${r.kept.length - 3} more` : '';
    parts.push(`Left in place: ${shown.join('; ')}${more}.`);
  }
  return parts.join(' ');
}

/** The account was connected again partway through its removal (HK-1383): what went before the stop, what stayed. */
function reconnectedNotice(r, name, home) {
  const parts = [`"${name}" was connected again while the plugin was removing it from this computer, so the plugin stopped.`];
  if (r.removed.length === 1) parts.push(`It had already removed its folder ${shownPath(r.removed[0], home)} (with everything in it).`);
  else if (r.removed.length > 1) parts.push(`It had already removed its folders ${list(r.removed.map((f) => shownPath(f, home)))} (with everything in them).`);
  else parts.push('Nothing else of it was removed.');
  if (r.kept.length) {
    const shown = r.kept.slice(0, 3).map((k) => `${shownPath(k.path, home)} (${KEPT_WORDS[k.why] ?? KEPT_WORDS.failed})`);
    const more = r.kept.length > 3 ? `, and ${r.kept.length - 3} more` : '';
    parts.push(`Left in place: ${shown.join('; ')}${more}.`);
  }
  return parts.join(' ');
}

/**
 * A removal cut short too long ago to finish (HK-1384): nothing more was removed,
 * and the plugin cannot ask Hiveku again because the key it would ask with is gone.
 */
export function oldRemovalNotice({ label, left, home }) {
  const name = safeDisplayText(label, { fallback: 'this account' });
  const shown = left.slice(0, 3).map((p) => shownPath(p, home));
  const more = left.length > 3 ? `, and ${left.length - 3} more` : '';
  const parts = [
    `The plugin started removing "${name}" from this computer earlier, after Hiveku said you no longer had access to it, but it was stopped before it finished.`,
    "That was too long ago to go on without asking Hiveku again, and the saved key it would ask with is gone, so nothing more was removed.",
  ];
  if (left.length === 1) parts.push(`Left in place: ${shown[0]}. Delete it yourself if you no longer need it.`);
  else if (left.length > 1) parts.push(`Left in place: ${list(shown)}${more}. Delete them yourself if you no longer need them.`);
  parts.push(`If you still have access to "${name}", run /hiveku:connect to connect it again.`);
  return parts.join(' ');
}

/**
 * For a key that did not come from /hiveku:connect (pasted with `accounts
 * add`): it stopped working, nothing was removed, and how to go on. No reason
 * is given: the website's answer is about whoever made the key, who may be
 * someone else.
 */
export function keyStoppedNotice(label) {
  const name = safeDisplayText(label, { fallback: 'this account' });
  return (
    `Hiveku no longer accepts the key saved for "${name}". Nothing was removed from this computer: its folders and its ` +
    `saved key stay. If you still have access to "${name}", run /hiveku:connect to get a key of your own, then start a ` +
    'new session.'
  );
}

/** One line per folder for the bridge's own log: every full path, and why each stayed. */
export function removalLogLines(r) {
  return [
    `[offboarding] ${r.accountId}: ${r.reason}.${r.stopped ? ` Stopped (${r.stopped}).` : ''} Saved key ${r.keyRemoved ? 'deleted' : 'NOT deleted'}.`,
    ...r.removed.map((p) => `[offboarding]   deleted: ${p}`),
    ...r.kept.map((k) => `[offboarding]   left in place: ${k.path} (${k.why})`),
  ];
}

/* ── Notices, kept until said once ────────────────────────────────────────── */

/** Keeps a notice for the hooks to say once. */
export async function addNotice(dataDir, { accountId, kind, text }) {
  if (!dataDir || !isAccountUuid(accountId) || typeof text !== 'string' || !text) return false;
  const file = path.join(noticesDir(dataDir), `${accountId}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.json`);
  await writePrivateJson(file, { v: 1, account_id: accountId, kind, text, at: new Date().toISOString() });
  return true;
}

/** The notices not said yet, oldest first; each is deleted once read, so it is said once. Never throws. */
export async function takeNotices(dataDir) {
  if (!dataDir) return [];
  const dir = noticesDir(dataDir);
  let names;
  try {
    const st = await fs.lstat(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) return [];
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json') && !n.startsWith('.'));
  } catch {
    return [];
  }
  const found = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const notice = await readPrivateJson(file, { mostBytes: 16 * 1024 });
    // Taken before it is said: a notice is said at most once.
    const taken = await removePrivateFile(file).catch(() => false);
    if (!taken || !notice || notice.v !== 1 || typeof notice.text !== 'string') continue;
    found.push({ at: String(notice.at ?? ''), text: safeDisplayText(notice.text, { max: 4000 }) });
  }
  return found.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map((n) => n.text);
}
