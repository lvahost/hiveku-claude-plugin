/**
 * Account knowledge sync: memory, rules, skills, commands, agents, identity —
 * written BY DEPARTMENT (memory/<dept>/<slug>.md), the extension's layout, per
 * the adopted decision: one layout, owned here, rather than a second flat tree
 * fighting it in the same folder.
 *
 * Ported from hiveku-vscode/src/knowledge.ts with its semantics kept:
 *  - identity is the entry's DOMAIN, not its id — that is what the manifest keys.
 *  - department = domain, unless it starts with '_' (reserved: _command:/_agent:
 *    prefixes), else a department tag in the content, else 'general'. Only a
 *    plain lowercase name (DEPARTMENT_NAME) that is not a Windows device name
 *    is ever used as a directory; any other domain files under 'general', and
 *    no file is written outside the root folder (isInsideRoot). A file stem
 *    that names a Windows device is renamed (safeFileStem). A row that cannot
 *    be written is reported (failed) and the rest of the pull carries on.
 *  - deletion is ADVISORY: entries gone upstream are reported (deleted_remote),
 *    never deleted locally. Nothing here destroys a user's local edit.
 *  - .hiveku/knowledge-manifest.json records what was synced (per-domain sha),
 *    .hiveku/knowledge-status.json records the drift report.
 *  - the ACCOUNT memory (domains `account` and `account-suggestions`) is not a
 *    department and is never filed as one: an entry with either domain is
 *    skipped here, whatever memory_list returns, and the document is written
 *    instead as the read-only hiveku-data/account/ACCOUNT_MEMORY.md
 *    (lib/account-memory.mjs). It never enters the manifest, so nothing here
 *    can report it as changed, new or deleted, and nothing uploads it.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { readJson, slugify, USER_AGENT, CLIENT_ID, HIVEKU_APP_URL } from './util.mjs';
import { isAccountMemoryDomain, syncAccountMemory } from './account-memory.mjs';

export const TYPE_TO_FOLDER = {
  memory: 'memory',
  rule: 'rules',
  skill: 'skills',
  command: 'commands',
  agent: 'agents',
  identity: 'identity',
};
export const SUPPORTED_TYPES = Object.keys(TYPE_TO_FOLDER);

const MANIFEST_REL = path.join('.hiveku', 'knowledge-manifest.json');
const STATUS_REL = path.join('.hiveku', 'knowledge-status.json');

/* ── MCP: memory_list per type ──────────────────────────────────────────── */

class KnowledgeClient {
  constructor({ endpoint, key }) {
    this.endpoint = endpoint;
    this.key = key;
    this.rpcId = 1;
    this.sessionId = null;
    this.initialized = false;
  }

  async rpc(method, params) {
    const headers = {
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'X-Hiveku-Client': CLIENT_ID,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: this.rpcId++, method, params }),
    });
    const sh = res.headers.get('mcp-session-id');
    if (sh) this.sessionId = sh;
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const body = await res.json();
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    return body.result;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'hiveku-claude-plugin-knowledge', version: '1' },
    });
    await this.rpc('notifications/initialized', {}).catch(() => undefined);
    this.initialized = true;
  }

  /** One read tool, parsed. Used for account_memory_get. */
  async callTool(name, args) {
    await this.ensureInitialized();
    const result = await this.rpc('tools/call', { name, arguments: args || {} });
    if (result?.isError) throw new Error(`Tool ${name} errored: ${result.content?.[0]?.text || 'unknown'}`);
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error(`Tool ${name} returned no text content`);
    return JSON.parse(text);
  }

  async listMemory(type) {
    await this.ensureInitialized();
    const result = await this.rpc('tools/call', { name: 'memory_list', arguments: { type } });
    if (result?.isError) throw new Error(`memory_list(${type}) errored: ${result.content?.[0]?.text || 'unknown'}`);
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error(`memory_list(${type}) returned no text`);
    const parsed = JSON.parse(text);
    const data = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    if (!Array.isArray(data)) throw new Error(`memory_list(${type}) did not return an array`);
    return data;
  }
}

/* ── Entry shaping (knowledge.ts semantics) ─────────────────────────────── */

function extractDepartmentTag(content) {
  const m =
    /<!--\s*department:\s*([a-z0-9_-]+)\s*-->/i.exec(content || '') ||
    /^department:\s*([a-z0-9_-]+)\s*$/im.exec(content || '');
  return m ? m[1].toLowerCase() : null;
}

/**
 * A department becomes a DIRECTORY under <root>/<folder>/, and the domain it
 * comes from is stored account data that any agent or API caller on the
 * account can write. A domain used verbatim could therefore name a directory
 * outside the bound folder (a parent-directory walk, an absolute path, a
 * backslash on Windows), and the pull would write the entry there on the
 * operator's own machine. So only a plain lowercase name is ever a directory;
 * anything else files under 'general'.
 */
export const DEPARTMENT_NAME = /^[a-z][a-z0-9_-]{0,49}$/;

/**
 * Names Windows keeps for devices, with or without an extension. They fit
 * DEPARTMENT_NAME, but Windows cannot create a directory with one of them, so
 * the pull would fail there. They file under 'general' too.
 */
export const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;

function asDepartment(value) {
  return typeof value === 'string' && DEPARTMENT_NAME.test(value) && !WINDOWS_DEVICE_NAME.test(value) ? value : null;
}

/** Added after the device part of a file stem that names a Windows device. */
export const DEVICE_STEM_SUFFIX = '-entry';

/**
 * The same device names are no safer as FILE names: on Windows, `nul.md` or
 * `com1.md` opens the device, not a file in the folder (the part before the
 * first dot decides, so `nul.txt.md` does too). An entry's file stem is its
 * name, and a plain memory row's name is its domain, so stored data picks it.
 * Such a stem gets DEVICE_STEM_SUFFIX after its device part (com1 becomes
 * com1-entry, nul.txt becomes nul-entry.txt). The result depends only on the
 * stem, so every pull writes the same file and the manifest records it.
 */
export function safeFileStem(stem) {
  return WINDOWS_DEVICE_NAME.test(stem) ? stem.replace(/^[^.]*/, (head) => head + DEVICE_STEM_SUFFIX) : stem;
}

export function departmentOf(entry) {
  const domain = typeof entry.domain === 'string' ? entry.domain : '';
  if (domain && !domain.startsWith('_')) return asDepartment(domain) || 'general';
  return asDepartment(extractDepartmentTag(entry.content)) || 'general';
}

/**
 * True when `target` resolves to a path strictly inside `rootDir`. The last
 * check before any knowledge write, so no future change to how a path is
 * built can put a file outside the bound folder.
 */
export function isInsideRoot(rootDir, target) {
  const root = path.resolve(rootDir);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return path.resolve(target).startsWith(prefix);
}

export function keyOf(entry) {
  return entry.domain ?? `${entry.type || 'unknown'}:unknown`;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function frontmatter(entry, department) {
  const rows = [];
  for (const [k, v] of Object.entries({
    id: entry.id,
    name: entry.name,
    type: entry.type,
    domain: entry.domain,
    department,
    project_id: entry.project_id,
    version: entry.version,
    updated_at: entry.updated_at,
  })) {
    if (v == null || v === '') continue;
    rows.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
  }
  return `---\n${rows.join('\n')}\n---\n\n`;
}

export function renderEntry(entry, department) {
  return frontmatter(entry, department) + (entry.content || '');
}

/* ── Pull ───────────────────────────────────────────────────────────────── */

async function fetchKnowledge(client) {
  const entries = [];
  const failedTypes = [];
  // ★ A status check often runs SECONDS after a pull that just spent the whole
  // 100-per-60s budget, so the very first listings meet "Rate limit exceeded.
  // ... Retry after N seconds." Treating that as a dead type is how a fresh
  // pull got reported as 196 upstream deletions. Honour the server's own
  // number once per type; only a second failure counts as failed.
  const RETRY_AFTER = /retry after (\d+)/i;
  for (const type of SUPPORTED_TYPES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        for (const e of await client.listMemory(type)) {
          // The account memory is not a department memory (see the header).
          if (isAccountMemoryDomain(e?.domain)) continue;
          entries.push({ ...e, type: e.type || type });
        }
        break;
      } catch (err) {
        const msg = String(err?.message || err);
        const secs = RETRY_AFTER.exec(msg)?.[1];
        if (attempt === 0 && secs != null) {
          await new Promise((r) => setTimeout(r, Math.min(65, Number(secs)) * 1000 + 250));
          continue;
        }
        // One failing type must not sink the other five; report it instead.
        failedTypes.push(type);
        break;
      }
    }
  }
  return { entries, failedTypes };
}

/**
 * Writes every remote entry to <root>/<folder>/<dept>/<slug>.md and records the
 * manifest. Returns counts + the drift report. Never deletes local files.
 */
export async function pullKnowledge({ rootDir, endpoint, key, accountId = null, appUrl = HIVEKU_APP_URL, log = () => {} }) {
  const client = new KnowledgeClient({ endpoint, key });
  const { entries, failedTypes } = await fetchKnowledge(client);
  const syncedAt = new Date().toISOString();

  const manifestPath = path.join(rootDir, MANIFEST_REL);
  const prior = (await readJson(manifestPath)) || { entries: {} };
  const manifest = { synced_at: syncedAt, entries: {} };

  // A type whose listing FAILED this run returned nothing — that is not "the
  // account deleted all its skills". Carry every prior entry of a failed type
  // forward untouched, so a transient 429 on one type never erases those files
  // from the manifest, false-flags them as deleted, or blinds drift detection to
  // local edits until the next fully-successful pull.
  const failedSet = new Set(failedTypes);
  for (const [k, row] of Object.entries(prior.entries || {})) {
    if (failedSet.has(row.type)) manifest.entries[k] = row;
  }

  let written = 0;
  const byType = {};
  const skipped = [];
  const failed = [];
  for (const entry of entries) {
    try {
      const type = entry.type;
      // Own keys only: a listed type like "constructor" must not index the prototype.
      const folder = Object.hasOwn(TYPE_TO_FOLDER, type) ? TYPE_TO_FOLDER[type] : null;
      if (!folder) continue;
      const department = departmentOf(entry);
      const name = entry.name || String(entry.domain || '').replace(/^_[^:]+:/, '') || 'unnamed';
      const file = path.join(folder, department, `${safeFileStem(slugify(name, 'unnamed'))}.md`);
      const abs = path.join(rootDir, file);
      // One bad row is skipped, never the whole pull, and never written.
      if (!isInsideRoot(rootDir, abs)) {
        skipped.push(keyOf(entry));
        continue;
      }
      const body = renderEntry(entry, department);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body, 'utf8');
      written++;
      byType[type] = (byType[type] || 0) + 1;
      manifest.entries[keyOf(entry)] = {
        id: entry.id,
        type,
        department,
        domain: entry.domain,
        version: entry.version != null ? String(entry.version) : undefined,
        updated_at: entry.updated_at,
        file,
        content_sha: sha256(body),
        synced_at: syncedAt,
      };
    } catch {
      // A row the disk refuses (a name Windows keeps, a folder that cannot be
      // created, a permission error) must not abort the rest of the pull. Keep
      // what the last pull recorded for it: failing to write it here is not the
      // entry being deleted upstream, and its local file is still the old one.
      const key = keyOf(entry);
      failed.push(key);
      const priorEntries = prior.entries && typeof prior.entries === 'object' ? prior.entries : {};
      if (Object.hasOwn(priorEntries, key) && !Object.hasOwn(manifest.entries, key)) manifest.entries[key] = priorEntries[key];
    }
  }

  // Advisory deletion report: what the PREVIOUS manifest had that upstream no
  // longer returns. The local file stays — flagging beats deleting.
  const deletedRemote = Object.keys(prior.entries || {}).filter(
    (k) => !(k in manifest.entries) && !isAccountMemoryDomain(prior.entries[k]?.domain ?? k),
  );

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(
    path.join(rootDir, STATUS_REL),
    JSON.stringify(
      {
        initialized: true,
        checked_at: syncedAt,
        in_sync: written,
        changed_remote: [],
        new_remote: [],
        deleted_remote: deletedRemote,
        locally_modified: [],
        missing_local: [],
        ...(failedTypes.length ? { failed_types: failedTypes } : {}),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  for (const [type, n] of Object.entries(byType)) log(`  ${TYPE_TO_FOLDER[type]}/: ${n} ${type} file${n === 1 ? '' : 's'}`);
  if (deletedRemote.length) log(`  deleted upstream (kept locally): ${deletedRemote.join(', ')}`);
  if (failedTypes.length) log(`  WARNING: could not list: ${failedTypes.join(', ')}`);
  if (skipped.length) {
    log(`  WARNING: skipped ${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} whose file would land outside this folder`);
  }
  if (failed.length) {
    log(`  WARNING: could not write ${failed.length} entr${failed.length === 1 ? 'y' : 'ies'}; the rest of the pull completed`);
  }

  // The account memory: read-only copy, same file /hiveku:pull writes.
  const accountMemory = await syncAccountMemory({
    rootDir,
    callTool: (name, args) => client.callTool(name, args),
    accountId,
    appUrl,
    log,
  });
  return { written, byType, deletedRemote, failedTypes, skipped, failed, accountMemory };
}

/**
 * Drift check without writing content: compares the local manifest + files
 * against upstream. Writes knowledge-status.json. Semantics of knowledge.ts's
 * computeSyncStatus: version/updated_at mismatch = changed_remote; upstream key
 * missing locally = new_remote; manifest key gone upstream = deleted_remote;
 * local sha drift = locally_modified; unreadable local file = missing_local.
 */
export async function knowledgeStatus({ rootDir, endpoint, key }) {
  const manifestPath = path.join(rootDir, MANIFEST_REL);
  const prior = await readJson(manifestPath);
  const checkedAt = new Date().toISOString();
  if (!prior?.entries) {
    return { initialized: false, checked_at: checkedAt, in_sync: 0, changed_remote: [], new_remote: [], deleted_remote: [], locally_modified: [], missing_local: [] };
  }
  const client = new KnowledgeClient({ endpoint, key });
  const { entries, failedTypes } = await fetchKnowledge(client);
  const remote = new Map(entries.map((e) => [keyOf(e), e]));
  // A manifest from any older writer that filed the account memory as a
  // department is not drift: those rows are not this sync's to report.
  for (const k of Object.keys(prior.entries)) {
    if (isAccountMemoryDomain(prior.entries[k]?.domain ?? k)) delete prior.entries[k];
  }

  // ★ "MISSING FROM A LISTING THAT FAILED" IS NOT "DELETED UPSTREAM".
  // This function once ignored failedTypes entirely, so when the listings for
  // command/agent/identity errored, every one of their entries — pulled with
  // valid upstream frontmatter seconds earlier — was reported as deleted.
  // An entry can only be called deleted by a listing that SUCCEEDED.
  const priorKeys = Object.keys(prior.entries);
  const failedSet = new Set(failedTypes);
  const typeOf = (k) => prior.entries[k]?.type;

  // Wholesale-empty guard: a remote that returns NOTHING while the manifest
  // knows many entries is a failed verification, not a mass deletion — a true
  // wipe of a whole account's knowledge is announced by a human, not inferred
  // by a status probe. Flagging beats false deletion; a re-pull confirms.
  const wholesaleEmpty = remote.size === 0 && priorKeys.length > 0;

  const status = {
    initialized: true,
    checked_at: checkedAt,
    in_sync: 0,
    changed_remote: [],
    new_remote: [...remote.keys()].filter((k) => !(k in prior.entries)),
    deleted_remote: wholesaleEmpty
      ? []
      : priorKeys.filter((k) => !remote.has(k) && !failedSet.has(typeOf(k))),
    unverifiable: wholesaleEmpty
      ? [...priorKeys]
      : priorKeys.filter((k) => !remote.has(k) && failedSet.has(typeOf(k))),
    locally_modified: [],
    missing_local: [],
    ...(failedTypes.length ? { failed_types: failedTypes } : {}),
    ...(wholesaleEmpty ? { verify_failed: true } : {}),
  };

  for (const [key_, row] of Object.entries(prior.entries)) {
    const upstream = remote.get(key_);
    if (!upstream) continue;
    const changed =
      (row.version != null && String(upstream.version) !== String(row.version)) ||
      (upstream.updated_at && row.updated_at && upstream.updated_at > row.updated_at);
    if (changed) status.changed_remote.push(key_);
    let sha = null;
    try {
      sha = sha256(await fs.readFile(path.join(rootDir, row.file), 'utf8'));
    } catch {
      status.missing_local.push(key_);
      continue;
    }
    if (sha !== row.content_sha) status.locally_modified.push(key_);
    else if (!changed) status.in_sync++;
  }

  await fs.writeFile(path.join(rootDir, STATUS_REL), JSON.stringify(status, null, 2) + '\n', 'utf8');
  return status;
}
