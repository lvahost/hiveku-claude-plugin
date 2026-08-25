/**
 * Per-directory account binding.
 *
 * One folder = one Hiveku account. This exists because a customer key is
 * hard-pinned server-side to exactly one account (the MCP server 403s a key
 * presented with a mismatched account), so multi-account cannot be a runtime
 * switch — it has to be N keys plus a rule for choosing between them. The
 * directory is that rule, because it matches how people already work.
 *
 * .hiveku/account.json is UNTRUSTED INPUT. It gets committed, cloned, and
 * cloud-synced, so anyone who can put a file in a repo can put one there. It
 * therefore carries no secret and no endpoint: the worst a hostile copy can do
 * is select a different account the user already holds a key for, and the
 * session banner names that account out loud.
 */
import path from 'node:path';
import os from 'node:os';
import { readJson, writeFileAtomic, isUuid, pathExists } from './util.mjs';

export const BINDING_DIR = '.hiveku';
export const BINDING_FILE = 'account.json';
const MAX_WALK_DEPTH = 20;

export function bindingPathFor(dir) {
  return path.join(dir, BINDING_DIR, BINDING_FILE);
}

/**
 * Walks up from `startDir` looking for a binding.
 *
 * Walking up is required: an account folder holds site projects in
 * subdirectories, and working inside one of those must still resolve to the
 * account. It stops BEFORE the home directory — a binding dropped at ~ or / would
 * silently claim every directory on the machine, which is precisely the
 * accident this design exists to prevent.
 */
export async function resolveBinding(startDir, homeDir = os.homedir()) {
  let dir = path.resolve(startDir);
  const home = path.resolve(homeDir);
  const root = path.parse(dir).root;

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    // Never accept a binding at or above $HOME.
    if (dir === home || dir === root) return null;

    const file = bindingPathFor(dir);
    if (await pathExists(file)) {
      const parsed = await readJson(file);
      const binding = validateBinding(parsed, file, dir);
      if (binding) return binding;
      return null; // present but invalid: stop, do not silently inherit a parent's
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Accepts only the fields we understand, and only in the shapes we expect.
 *
 * Note what is deliberately NOT read: any URL or endpoint. The upstream host is
 * a constant in util.mjs. If a binding file could name a host, a planted file
 * would redirect a live account key to an attacker's server, which turns a
 * cosmetic annoyance into credential theft.
 */
export function validateBinding(parsed, file, dir) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (!isUuid(parsed.account_id)) return null;
  return {
    accountId: parsed.account_id,
    label: typeof parsed.label === 'string' && parsed.label ? parsed.label : parsed.account_id,
    keyPreview: typeof parsed.key_preview === 'string' ? parsed.key_preview : null,
    dir,
    file,
  };
}

export async function writeBinding(dir, { accountId, label, keyPreview }) {
  const file = bindingPathFor(dir);
  const body = {
    version: 1,
    account_id: accountId,
    label: label || accountId,
    // A prefix, not a secret: enough to notice a rotated key, useless to a thief.
    key_preview: keyPreview || null,
    bound_at: new Date().toISOString(),
    bound_by: 'hiveku-claude-plugin',
    note: 'Directory-to-account binding for the Hiveku Claude Code plugin. Contains no credentials.',
  };
  await writeFileAtomic(file, JSON.stringify(body, null, 2) + '\n');
  return file;
}

export async function removeBinding(dir) {
  const file = bindingPathFor(dir);
  if (!(await pathExists(file))) return false;
  const { promises: fs } = await import('node:fs');
  await fs.unlink(file);
  return true;
}

/**
 * True when the folder looks like Hiveku's even though nothing is bound —
 * used to decide whether an unbound directory should say anything at all.
 * In a folder with no Hiveku history we stay completely silent, because the
 * plugin is installed once at user scope and must not editorialize inside
 * unrelated projects.
 */
export async function looksLikeHivekuFolder(dir) {
  for (const marker of ['.hiveku', 'hiveku-data']) {
    if (await pathExists(path.join(dir, marker))) return true;
  }
  return false;
}
