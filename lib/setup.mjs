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
 */
export async function runSetup({ root, accounts, homeDir = os.homedir() }) {
  const rootAbs = path.resolve(root);
  if (rootAbs === path.resolve(homeDir)) {
    throw new Error('Refusing to use your home directory itself as the accounts root — pass a subfolder, e.g. ~/Hiveku-Accounts.');
  }
  await fs.mkdir(rootAbs, { recursive: true });

  const results = [];
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
    const existedBefore = await pathExists(dir);

    await fs.mkdir(dir, { recursive: true });
    await writeBinding(dir, { accountId, label: account.label, keyPreview: account.key_preview });
    await ensureSetupGitignore(dir);
    results.push({ account_id: accountId, label: account.label, dir, status: existedBefore ? 'adopted' : 'created' });
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
  return { root: rootAbs, results };
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
