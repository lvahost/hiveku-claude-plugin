/**
 * The credential store.
 *
 * Threat model note that shapes every choice here: on a single-user machine,
 * mode 0600 defends against OTHER USERS, not against the user's own processes.
 * Every npm postinstall, every dependency, every other MCP server runs as the
 * same uid we do. So the file is encrypted at rest with a master key held in
 * the OS keychain, and 0600 is the floor rather than the ceiling.
 *
 * The invariant worth protecting above all others: the set of accounts this
 * plugin can ever act on equals the set of keys in this file, and only the
 * consent flow can add to it. A poisoned project file can select among them; it
 * can never introduce a new one, and it can never redirect one elsewhere.
 */
import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import {
  readJson,
  writeFileSecure,
  assertNotRedirected,
  isSyncedLocation,
  keyPreview,
  warn,
  debug,
} from './util.mjs';

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = 'com.hiveku.claude-plugin';
const KEYCHAIN_ACCOUNT = 'credentials-master-key';
const CREDENTIALS_FILE = 'credentials.json';
const FORMAT_VERSION = 1;

/**
 * Resolves the plugin's persistent data directory.
 *
 * ${CLAUDE_PLUGIN_DATA} survives plugin updates and is deleted only on
 * uninstall, which is exactly the lifetime credentials want. We refuse to run
 * if it resolves into a synced folder — writing account keys into iCloud or
 * Dropbox would quietly replicate them to every other device on the account.
 */
export function resolveDataDir(env = process.env) {
  let raw = env.HIVEKU_PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA;

  // An unsubstituted placeholder is a truthy string, so it would otherwise sail
  // through every falsy check and be used as a literal directory name.
  if (raw && /^\$\{.*\}$/.test(raw)) raw = null;

  // The CLI is launched through the Bash tool, and Bash-spawned processes do
  // NOT inherit CLAUDE_PLUGIN_DATA — only MCP servers and hooks get it. So for
  // every slash command this must be discovered rather than read.
  if (!raw) raw = discoverDataDir();

  if (!raw) {
    throw new Error(
      'Hiveku: could not locate the plugin data directory. If you are running this binary directly, ' +
        'set HIVEKU_PLUGIN_DATA to a private directory.',
    );
  }
  const dir = path.resolve(raw);
  if (isSyncedLocation(dir)) {
    throw new Error(
      `Hiveku: refusing to store account keys in ${dir} because it is inside a cloud-synced folder ` +
        '(iCloud, Dropbox, OneDrive or Google Drive). Account keys must not leave this machine.',
    );
  }
  return dir;
}

export function credentialsPath(dataDir) {
  return path.join(dataDir, CREDENTIALS_FILE);
}

/**
 * Finds our data directory under ~/.claude/plugins/data/.
 *
 * The directory is named `<plugin>-<marketplace>`, and the marketplace segment
 * is not fixed: installing the same plugin from a marketplace versus inline
 * produces `hiveku-hiveku` and `hiveku-inline` side by side (both variants of
 * other plugins exist on real machines). So we match the prefix and, when more
 * than one candidate exists, prefer whichever already holds credentials — that
 * is the one the user actually connected. Ties fall back to the marketplace
 * install, which is the documented path.
 */
function discoverDataDir() {
  const base = path.join(os.homedir(), '.claude', 'plugins', 'data');
  let entries;
  try {
    entries = fsSync.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((e) => e.isDirectory() && (e.name === 'hiveku' || e.name.startsWith('hiveku-')))
    .map((e) => path.join(base, e.name));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const withCreds = candidates.filter((d) => fsSync.existsSync(path.join(d, CREDENTIALS_FILE)));
  if (withCreds.length === 1) return withCreds[0];
  const preferred = (withCreds.length ? withCreds : candidates).find((d) => d.endsWith('hiveku-hiveku'));
  return preferred || (withCreds.length ? withCreds : candidates)[0];
}

/* ── Master key: OS keychain, with a documented plaintext fallback ───────── */

async function keychainGet() {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w',
      ]);
      return Buffer.from(stdout.trim(), 'base64');
    } catch {
      return null;
    }
  }
  if (process.platform === 'linux') {
    try {
      const { stdout } = await execFileAsync('secret-tool', [
        'lookup', 'service', KEYCHAIN_SERVICE, 'account', KEYCHAIN_ACCOUNT,
      ]);
      const v = stdout.trim();
      return v ? Buffer.from(v, 'base64') : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function keychainSet(key) {
  const b64 = key.toString('base64');
  if (process.platform === 'darwin') {
    try {
      // -U updates in place if the item already exists.
      await execFileAsync('security', [
        'add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w', b64, '-U',
      ]);
      return true;
    } catch (err) {
      debug(`keychain store failed: ${err.message}`);
      return false;
    }
  }
  if (process.platform === 'linux') {
    try {
      await execFileAsync(
        'secret-tool',
        ['store', '--label=Hiveku Claude plugin', 'service', KEYCHAIN_SERVICE, 'account', KEYCHAIN_ACCOUNT],
        { input: b64 },
      );
      return true;
    } catch (err) {
      debug(`secret-tool store failed: ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Returns the master key, creating it on first use.
 *
 * If no keyring is available we fall back to file-only protection and say so
 * loudly — a silent downgrade from "encrypted" to "not encrypted" is the kind
 * of thing that gets discovered during an incident.
 */
async function getMasterKey(dataDir, { create = true } = {}) {
  const existing = await keychainGet();
  if (existing && existing.length === 32) return { key: existing, viaKeychain: true };
  if (!create) return { key: null, viaKeychain: false };

  const fresh = randomBytes(32);
  const stored = await keychainSet(fresh);
  if (!stored) {
    warn(
      'no OS keyring available, so account keys are protected by file permissions (0600) alone. ' +
        'Any process running as your user can read them.',
    );
    return { key: null, viaKeychain: false };
  }
  return { key: fresh, viaKeychain: true };
}

function encrypt(masterKey, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: FORMAT_VERSION,
    enc: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  };
}

function decrypt(masterKey, envelope) {
  const decipher = createDecipheriv('aes-256-gcm', masterKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/* ── Read / write ────────────────────────────────────────────────────────── */

const EMPTY = { version: FORMAT_VERSION, accounts: {} };

/**
 * Reads the store. Never throws on a damaged file: a corrupt store must degrade
 * to "no accounts" with a clear message, not crash the MCP server and take down
 * the whole session.
 */
export async function readCredentials(dataDir) {
  const file = credentialsPath(dataDir);
  const raw = await readJson(file);
  if (!raw) {
    if (await fileExists(file)) {
      warn(`could not parse ${file}. Treating it as empty; run /hiveku:connect to reconnect.`);
      return { ...EMPTY, corrupt: true, path: file };
    }
    return { ...EMPTY };
  }

  // Encrypted envelope
  if (raw && raw.enc === 'aes-256-gcm') {
    const { key } = await getMasterKey(dataDir, { create: false });
    if (!key) {
      warn(
        'account keys are encrypted but the master key is not in the keychain on this machine. ' +
          'Run /hiveku:connect to reconnect.',
      );
      return { ...EMPTY, locked: true, path: file };
    }
    try {
      const parsed = JSON.parse(decrypt(key, raw));
      return normalize(parsed);
    } catch {
      warn(`could not decrypt ${file} (wrong key or damaged file). Run /hiveku:connect to reconnect.`);
      return { ...EMPTY, corrupt: true, path: file };
    }
  }

  return normalize(raw);
}

function normalize(parsed) {
  const accounts = parsed && typeof parsed.accounts === 'object' && parsed.accounts ? parsed.accounts : {};
  return { version: FORMAT_VERSION, accounts };
}

async function fileExists(f) {
  try {
    await fs.access(f);
    return true;
  } catch {
    return false;
  }
}

export async function writeCredentials(dataDir, creds) {
  const file = credentialsPath(dataDir);
  await assertNotRedirected(file);
  const payload = JSON.stringify({ version: FORMAT_VERSION, accounts: creds.accounts || {} }, null, 2);

  const { key } = await getMasterKey(dataDir, { create: true });
  const body = key ? JSON.stringify(encrypt(key, payload), null, 2) : payload;
  await writeFileSecure(file, body + '\n', 0o600);
}

/**
 * Adds or refreshes accounts.
 *
 * Merge semantics mirror the VS Code extension: incoming wins for an account we
 * already hold (a rotated key must replace the dead one), and accounts absent
 * from this batch are left alone (a single-account reconnect must not wipe the
 * other twelve).
 */
export async function upsertAccounts(dataDir, incoming) {
  const creds = await readCredentials(dataDir);
  const accounts = { ...creds.accounts };
  const now = new Date().toISOString();

  for (const acct of incoming) {
    if (!acct || !acct.account_id || !acct.key) continue;
    const prior = accounts[acct.account_id];
    accounts[acct.account_id] = {
      key: acct.key,
      label: acct.label || prior?.label || acct.account_id,
      key_preview: keyPreview(acct.key),
      scope: acct.scope || prior?.scope || 'full',
      connected_as: acct.connected_as ?? prior?.connected_as ?? null,
      departments: acct.departments || prior?.departments || [],
      created_at: prior?.created_at || now,
      updated_at: now,
    };
  }

  await writeCredentials(dataDir, { accounts });
  return accounts;
}

export async function removeAccount(dataDir, accountId) {
  const creds = await readCredentials(dataDir);
  if (!creds.accounts[accountId]) return false;
  const accounts = { ...creds.accounts };
  delete accounts[accountId];
  await writeCredentials(dataDir, { accounts });
  return true;
}

export async function getAccount(dataDir, accountId) {
  const creds = await readCredentials(dataDir);
  return creds.accounts[accountId] || null;
}

/** Non-secret view, safe to print or hand to the model. */
export function publicAccountList(accounts) {
  return Object.entries(accounts).map(([id, a]) => ({
    account_id: id,
    label: a.label,
    key_preview: a.key_preview,
    scope: a.scope || 'full',
    connected_as: a.connected_as || null,
  }));
}

export { keychainGet as __keychainGetForTest };
