/**
 * Account knowledge sync: memory, rules, skills, commands, agents, identity —
 * written BY DEPARTMENT (memory/<dept>/<slug>.md), the extension's layout, per
 * the adopted decision: one layout, owned here, rather than a second flat tree
 * fighting it in the same folder.
 *
 * Ported from hiveku-vscode/src/knowledge.ts with its semantics kept:
 *  - identity is the entry's DOMAIN, not its id — that is what the manifest keys.
 *  - department = domain, unless it starts with '_' (reserved: _command:/_agent:
 *    prefixes), else a department tag in the content, else 'general'.
 *  - deletion is ADVISORY: entries gone upstream are reported (deleted_remote),
 *    never deleted locally. Nothing here destroys a user's local edit.
 *  - .hiveku/knowledge-manifest.json records what was synced (per-domain sha),
 *    .hiveku/knowledge-status.json records the drift report.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { readJson, slugify, USER_AGENT, CLIENT_ID } from './util.mjs';

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

  async listMemory(type) {
    if (!this.initialized) {
      await this.rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'hiveku-claude-plugin-knowledge', version: '1' },
      });
      await this.rpc('notifications/initialized', {}).catch(() => undefined);
      this.initialized = true;
    }
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

export function departmentOf(entry) {
  const domain = typeof entry.domain === 'string' ? entry.domain : '';
  if (domain && !domain.startsWith('_')) return domain;
  return extractDepartmentTag(entry.content) || 'general';
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
        for (const e of await client.listMemory(type)) entries.push({ ...e, type: e.type || type });
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
export async function pullKnowledge({ rootDir, endpoint, key, log = () => {} }) {
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
  for (const entry of entries) {
    const type = entry.type;
    const folder = TYPE_TO_FOLDER[type];
    if (!folder) continue;
    const department = departmentOf(entry);
    const name = entry.name || String(entry.domain || '').replace(/^_[^:]+:/, '') || 'unnamed';
    const file = path.join(folder, department, `${slugify(name, 'unnamed')}.md`);
    const abs = path.join(rootDir, file);
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
  }

  // Advisory deletion report: what the PREVIOUS manifest had that upstream no
  // longer returns. The local file stays — flagging beats deleting.
  const deletedRemote = Object.keys(prior.entries || {}).filter((k) => !(k in manifest.entries));

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
  return { written, byType, deletedRemote, failedTypes };
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
