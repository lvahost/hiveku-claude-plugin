/**
 * First-run workspace setup: one folder per connected account, each bound.
 *
 * This is the plugin's answer to the VS Code extension's "pick accounts and it
 * creates the folders" onboarding. After /hiveku:connect stores N keys, one
 * `hiveku setup` creates <root>/<label-slug>-<id8>/ for each account and writes
 * its binding — so a desktop-app user selects a folder and works, instead of
 * hand-creating and hand-binding N folders.
 */
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { writeBinding, resolveBinding, bindingPathFor } from './binding.mjs';
import { folderIdentity, folderIsNewOrEmpty, isAccountUuid, markMadeFolder, recordMadeFolders } from './made-folders.mjs';
import { readJson, pathExists } from './util.mjs';

export const DEFAULT_ROOT_NAME = 'Hiveku-Accounts';

/**
 * Folder naming, BYTE-COMPATIBLE with the extension's slugForAccount
 * (hiveku-vscode/src/knowledge.ts) — both tools must derive the SAME folder
 * name for the same account, or a machine running both ends up with
 * `acme-corp-7f6bb2cf/` and a second `acme.corp-7f6bb2cf/` for one client.
 * Note the charset ([a-z0-9._-], keeps dots) and the 100-char cap differ from
 * util.slugify — that is why this does not reuse it.
 */
export function slugForAccount(label, accountId) {
  const name =
    String(label || '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'unnamed';
  const id = String(accountId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  return id ? `${name !== 'unnamed' ? name : 'account'}-${id}` : name || 'account';
}

/**
 * Creates + binds a folder per account under `root`. Idempotent and
 * conflict-safe: an existing folder bound to the SAME account is left alone
 * (reported as existing), one bound to a DIFFERENT account is never touched
 * (reported as a conflict). Returns per-account results; throws only on a root
 * that cannot be created.
 *
 * Offboarding O8b (lib/made-folders.mjs): a folder setup MAKES (status
 * 'created': it was not there, or held nothing but a .DS_Store) gets the
 * plugin's mark in its binding and, when `dataDir` is given, a record in the
 * plugin's data folder, so it can be removed if the person later loses the
 * account. An adopted folder gets neither and is never removed. `recorded`
 * counts the folders recorded; `record_error` says why none were.
 */
export async function runSetup({ root, accounts, homeDir = os.homedir(), dataDir }) {
  const rootAbs = path.resolve(root);
  if (rootAbs === path.resolve(homeDir)) {
    throw new Error('Refusing to use your home directory itself as the accounts root — pass a subfolder, e.g. ~/Hiveku-Accounts.');
  }
  await fs.mkdir(rootAbs, { recursive: true });

  const results = [];
  const made = [];
  for (const [accountId, account] of Object.entries(accounts)) {
    const dir = path.join(rootAbs, slugForAccount(account.label, accountId));
    const bindingFile = bindingPathFor(dir);

    if (await pathExists(bindingFile)) {
      const existing = await readJson(bindingFile);
      if (existing?.account_id === accountId) {
        results.push({ account_id: accountId, label: account.label, dir, status: 'exists' });
      } else {
        results.push({
          account_id: accountId,
          label: account.label,
          dir,
          status: 'conflict',
          bound_to: existing?.account_id || 'unreadable',
        });
      }
      continue;
    }

    // An existing UNBOUND folder with this name is almost certainly the VS Code
    // extension's workspace for the same account — the extension uses the same
    // root name, the same slug, and binds via its own globalState instead of a
    // binding file. The id8 in the folder name ties it to this account, so
    // ADOPT it: add the missing binding, touch nothing else it contains.
    // Only a folder that was not there, or held nothing, is the plugin's own.
    const fresh = await folderIsNewOrEmpty(dir);

    await fs.mkdir(dir, { recursive: true });
    // The mark is only for an id as the website names accounts (a lower-case
    // UUID); any other id is bound as before, unmarked.
    if (fresh && isAccountUuid(accountId)) {
      const marked = await markMadeFolder(dir, { accountId, label: account.label, keyPreview: account.key_preview });
      if (marked === 'already_bound') {
        // Bound a moment ago by someone else: theirs, left exactly as it is.
        const existing = await readJson(bindingFile);
        results.push(
          existing?.account_id === accountId
            ? { account_id: accountId, label: account.label, dir, status: 'exists' }
            : { account_id: accountId, label: account.label, dir, status: 'conflict', bound_to: existing?.account_id || 'unreadable' },
        );
        continue;
      }
      if (marked !== 'marked') {
        results.push({ account_id: accountId, label: account.label, dir, status: 'error', error: 'could not write the binding' });
        continue;
      }
      const identity = await folderIdentity(dir);
      if (identity) made.push({ account_id: accountId, dir, root: rootAbs, ...identity, made_at: new Date().toISOString() });
    } else {
      await writeBinding(dir, { accountId, label: account.label, keyPreview: account.key_preview });
    }
    await ensureSetupGitignore(dir);
    results.push({ account_id: accountId, label: account.label, dir, status: fresh ? 'created' : 'adopted' });
  }

  // One write for the whole batch. Without it the folders work as before; they
  // are just never removed if the person loses the account.
  let recorded = 0;
  let recordError = null;
  if (dataDir && made.length) {
    try {
      recorded = await recordMadeFolders(dataDir, made);
    } catch (err) {
      recordError = err?.code || err?.message || 'write failed';
    }
  }

  // Sanity: every folder we bound must actually resolve to its account.
  for (const r of results) {
    if (r.status !== 'created' && r.status !== 'adopted') continue;
    const resolved = await resolveBinding(r.dir, homeDir);
    if (!resolved || resolved.accountId !== r.account_id) {
      r.status = 'error';
      r.error = 'binding did not resolve after write';
    }
  }
  return { root: rootAbs, results, recorded, ...(recordError ? { record_error: recordError } : {}) };
}

/** The folder starts life ignoring the local-data trees, same set bind uses. */
async function ensureSetupGitignore(dir) {
  const file = path.join(dir, '.gitignore');
  const wanted = ['.hiveku/', 'hiveku-data/', '.env', '.env.local'];
  let current = '';
  try {
    current = await fs.readFile(file, 'utf8');
  } catch {
    /* new folder */
  }
  const present = new Set(current.split('\n').map((l) => l.trim()));
  const missing = wanted.filter((w) => !present.has(w));
  if (!missing.length) return;
  const addition = (current && !current.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n';
  await fs.writeFile(file, current + addition, 'utf8');
}
