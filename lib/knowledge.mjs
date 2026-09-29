/**
 * Account knowledge sync: memory, rules, skills, commands, agents, identity —
 * written BY OWNER (<type folder>/<owner folder>/<slug>.md), the extension's
 * type-first layout, per the adopted decision: one layout, owned here, rather
 * than a second flat tree fighting it in the same folder.
 *
 * Ported from hiveku-vscode/src/knowledge.ts with its semantics kept:
 *  - identity is the entry's DOMAIN, not its id — that is what the manifest keys.
 *  - WHO OWNS AN ENTRY COMES FROM THE BUILDER (memory surfaces audit G14).
 *    memory_list returns each entry's `owner`, THE owner rule the Memory page
 *    uses (hiveku_builder memory-department.ts), and the entry files under that
 *    owner's folder (lib/memory-owner.mjs ownerFolder): sales/, helpdesk/,
 *    comms/, production/, accounting/, coder/, orchestrator/, marketing/ (the
 *    Marketing lead), marketing/<topic>/, or shared/ when no agent owns it
 *    ("Shared with every agent"). A builder that does not return `owner` yet
 *    gets today's filing: department = domain, unless it starts with '_'
 *    (reserved: _command:/_agent: prefixes), else a department tag in the
 *    content, else 'general'.
 *  - the `_account:*` rows are listed the way the page lists them: the chief of
 *    staff's own rows under orchestrator/, Voice and pronunciation under
 *    memory/business/voice/, and the legacy shapes the page drops left out
 *    (memory-owner.mjs accountRowPlace). They come from one extra listing with
 *    no type filter, since no type filter returns them.
 *  - Only a plain lowercase name (DEPARTMENT_NAME) that is not a Windows
 *    device name is ever used as an owner directory; any other owner or domain
 *    files under 'general', and no file is written outside the root folder
 *    (isInsideRoot). A file stem that names a Windows device is renamed
 *    (safeFileStem). A row that cannot be written is reported (failed) and the
 *    rest of the pull carries on.
 *  - deletion is ADVISORY: entries gone upstream are reported (deleted_remote),
 *    never deleted locally. Nothing here destroys a user's local edit. Two
 *    cases are not deletions and are tidied: a file this sync wrote whose
 *    entry now files under another folder (a new owner) is moved, and a Claude
 *    Code skill copy (below) of a skill that is gone is removed, because Claude
 *    Code would keep following it. Either happens only when the file is
 *    byte-for-byte what the last pull wrote; an edited copy stays and is reported.
 *  - skills are also written as Claude Code skills (memory surfaces audit G13):
 *    .claude/skills/hiveku-<agent>-<slug>/SKILL.md with a name and a
 *    description, so a session in this folder finds the account's playbooks
 *    without being told to load them.
 *  - .hiveku/knowledge-manifest.json records what was synced (per-domain sha),
 *    .hiveku/knowledge-status.json records the drift report.
 *  - the ACCOUNT memory (About your business: domains `account` and
 *    `account-suggestions`) is not a department and is never filed as one: an
 *    entry with either domain is skipped here, whatever memory_list returns,
 *    and the document is written instead as the read-only
 *    hiveku-data/account/ACCOUNT_MEMORY.md (lib/account-memory.mjs). It never
 *    enters the manifest, so nothing here can report it as changed, new or
 *    deleted, and nothing uploads it.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { readJson, slugify, USER_AGENT, CLIENT_ID, HIVEKU_APP_URL } from './util.mjs';
import { isAccountMemoryDomain, syncAccountMemory, accountMemoryDashboardUrl } from './account-memory.mjs';
import {
  accountRowPlaceFromBuilder,
  isAccountRowDomain,
  normalizeKey,
  ownerFolder,
  ownerNoun,
  SHARED_FOLDER,
} from './memory-owner.mjs';

export const TYPE_TO_FOLDER = {
  memory: 'memory',
  rule: 'rules',
  skill: 'skills',
  command: 'commands',
  agent: 'agents',
  identity: 'identity',
};
export const SUPPORTED_TYPES = Object.keys(TYPE_TO_FOLDER);

/**
 * The listing that returns the `_account:*` rows: memory_list with no type.
 * Named like a type in `failed_types` and in each manifest row's `listing`, so
 * a failed listing carries its rows forward exactly as a failed type does.
 */
export const ACCOUNT_ROWS_LISTING = '_account';

/** Where the Claude Code copies of the account's skills go (memory surfaces audit G13). */
export const CLAUDE_SKILLS_DIR = path.join('.claude', 'skills');
/** Claude Code's limits on a skill's name and description. */
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
/** Only ever touch a skill copy of this shape: `.claude/skills/hiveku-<name>/SKILL.md`. */
const CLAUDE_SKILL_REL = /^\.claude\/skills\/hiveku-[a-z0-9-]{1,57}\/SKILL\.md$/;
/** Only ever move a knowledge file of this shape: `<type folder>/.../<name>.md`. */
const KNOWLEDGE_FILE_REL = /^(?:memory|rules|skills|commands|agents|identity)\/.+\.md$/;

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

  /** memory_list for one type, or with no type filter at all when `type` is null. */
  async listMemory(type) {
    await this.ensureInitialized();
    const label = type ?? 'all';
    const result = await this.rpc('tools/call', { name: 'memory_list', arguments: type ? { type } : {} });
    if (result?.isError) throw new Error(`memory_list(${label}) errored: ${result.content?.[0]?.text || 'unknown'}`);
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error(`memory_list(${label}) returned no text`);
    const parsed = JSON.parse(text);
    const data = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    if (!Array.isArray(data)) throw new Error(`memory_list(${label}) did not return an array`);
    return data;
  }
}

/* ── Entry shaping (knowledge.ts semantics) ─────────────────────────────── */

function extractDepartmentTag(content) {
  const text = content || '';
  const m = text.match(/<!--\s*department:\s*([a-z0-9_-]+)\s*-->/i) || text.match(/^department:\s*([a-z0-9_-]+)\s*$/im);
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

/** Today's filing, for a builder that does not return `owner`: domain, else content tag, else general. */
export function departmentOf(entry) {
  const domain = typeof entry.domain === 'string' ? entry.domain : '';
  if (domain && !domain.startsWith('_')) return asDepartment(domain) || 'general';
  return asDepartment(extractDepartmentTag(entry.content)) || 'general';
}

/**
 * The owner memory_list returned for an entry: a key, `null` (no agent owns
 * it), or `undefined` when the builder sent none (or sent something that is
 * neither), which keeps today's filing.
 */
export function builderOwnerOf(entry) {
  if (!entry || typeof entry !== 'object' || !Object.hasOwn(entry, 'owner')) return undefined;
  if (entry.owner === null) return null;
  const key = normalizeKey(entry.owner);
  return key || undefined;
}

/**
 * The folder under the type folder that an entry files in: its owner's
 * (ownerFolder), an owner no agent has under its own plain name, else
 * 'general'; or today's filing when memory_list returned no owner.
 */
export function ownerFolderOf(entry) {
  const owner = builderOwnerOf(entry);
  if (owner === undefined) return departmentOf(entry);
  return ownerFolder(owner) ?? asDepartment(owner) ?? 'general';
}

/**
 * Where one listed entry goes, or null for an entry that is not written: a
 * type no folder takes, or an `_account:*` row the page does not show.
 * `owner` keeps the three states of builderOwnerOf (a key, null, undefined).
 */
export function placeEntry(entry) {
  const domain = typeof entry?.domain === 'string' ? entry.domain : '';
  if (isAccountRowDomain(domain)) {
    const place = accountRowPlaceFromBuilder(domain, entry.placement);
    if (!place) return null;
    return {
      type: place.type,
      typeFolder: place.typeFolder,
      folder: place.folder,
      stem: place.stem,
      owner: place.owner,
      label: place.label,
    };
  }
  const type = entry?.type;
  // Own keys only: a listed type like "constructor" must not index the prototype.
  const typeFolder = Object.hasOwn(TYPE_TO_FOLDER, type) ? TYPE_TO_FOLDER[type] : null;
  if (!typeFolder) return null;
  const owner = builderOwnerOf(entry);
  const label = typeof entry.placement?.label === 'string' ? entry.placement.label : undefined;
  return {
    type,
    typeFolder,
    folder: ownerFolderOf(entry),
    stem: entry.name || String(domain).replace(/^_[^:]+:/, '') || 'unnamed',
    owner,
    label,
  };
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

/** One line of front matter text: no line breaks or control characters, quotes escaped. */
function frontValue(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/** Text for one markdown line: no line breaks or control characters, at most `max` characters. */
function markdownLine(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, max);
}

/** A Memory page link the builder returned, kept only when it is a plain https address. */
function pageUrlOf(entry) {
  const url = entry?.memory_page_url;
  return typeof url === 'string' && /^https:\/\/[^\s"'<>\\]+$/.test(url) && url.length <= 500 ? url : undefined;
}

function frontmatter(entry, place) {
  const rows = [];
  for (const [k, v] of Object.entries({
    id: entry.id,
    name: entry.name,
    type: entry.type,
    domain: entry.domain,
    department: place.folder,
    // Who owns it, as the Memory page files it: an agent key, or "shared".
    owner: place.owner === undefined ? undefined : (place.owner ?? SHARED_FOLDER),
    memory_page: place.label,
    memory_page_url: pageUrlOf(entry),
    project_id: entry.project_id,
    version: entry.version,
    updated_at: entry.updated_at,
  })) {
    if (v == null || v === '') continue;
    rows.push(`${k}: "${frontValue(v)}"`);
  }
  return `---\n${rows.join('\n')}\n---\n\n`;
}

/**
 * The file text for one entry. `place` is placeEntry's answer; a bare
 * department string is accepted for callers that only have that.
 */
export function renderEntry(entry, place) {
  const where = typeof place === 'string' ? { folder: place } : place || { folder: departmentOf(entry) };
  return frontmatter(entry, where) + (entry.content || '');
}

/* ── Claude Code skills (G13) ───────────────────────────────────────────── */

/** Lowercase letters, digits and single hyphens: the only characters a skill name may hold. */
function skillNamePart(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The Claude Code skill name for one account skill: `hiveku-<agent>-<slug>`,
 * where the agent is the folder it files under (`shared` for every agent, the
 * topic alone for a Marketing topic), at most SKILL_NAME_MAX characters. A
 * name another skill already took this pull gets a short hash of its stored
 * name, so every pull names the same skill the same way.
 */
export function claudeSkillName(folder, stem, domain, used = new Set()) {
  const agent = skillNamePart(String(folder).split('/').pop()) || 'shared';
  const slug = skillNamePart(stem) || 'skill';
  const fit = (text) => text.slice(0, SKILL_NAME_MAX).replace(/-+$/, '');
  let name = fit(`hiveku-${agent}-${slug}`);
  for (let attempt = 0; used.has(name); attempt++) {
    const suffix = '-' + sha256(`${domain}#${attempt}`).slice(0, 8);
    name = fit(`hiveku-${agent}-${slug}`.slice(0, SKILL_NAME_MAX - suffix.length)) + suffix;
  }
  used.add(name);
  return name;
}

/**
 * What a skill is for, from its own text: the first `# ` heading and the first
 * line of prose after it (the shape Hiveku's starter skills use: a title, then
 * "When the user asks for ..."). Same reading as the website agent's
 * derive_skill_description (hiveku_agent_server account_memory_files.py).
 */
export function skillSummary(content) {
  let text = String(content ?? '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
  // Leading `<!-- department: x -->` lines, then the skill's own front matter:
  // its one-line `description:` when it has one, else the text after the block.
  text = text.replace(/^(?:[ \t]*<!--[^\n]*-->[ \t]*\n)+/, '');
  const front = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (front) {
    const own = front[1].match(/^description:[ \t]*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
    if (own && !/^[>|][+-]?$/.test(own)) return own;
    text = text.slice(front[0].length);
  }
  let heading = '';
  let prose = '';
  let fenced = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line) continue;
    if (!heading && line.startsWith('# ')) {
      heading = line.slice(2).trim();
      continue;
    }
    if (/^(#|<!--|---|\|)/.test(line)) continue;
    prose = line.replace(/^(?:[-*+>]\s+|\d+[.)]\s+)/, '').trim();
    if (prose) break;
  }
  if (heading && prose) return `${heading}${/[.!?:]$/.test(heading) ? ' ' : '. '}${prose}`;
  return heading || prose;
}

/** A double-quoted YAML scalar on one line, at most `max` characters inside the quotes. */
function yamlOneLine(text, max) {
  let value = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\\/g, '/')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length > max) value = value.slice(0, max - 3).replace(/\s+\S*$/, '').trimEnd() + '...';
  return `"${value}"`;
}

/**
 * The SKILL.md text for one account skill. Only `name` and `description` are
 * written as front matter: the skill's own text follows unchanged, so any
 * front matter inside it (a tool list, for one) is text Claude Code does not
 * act on. The note under the front matter says where the skill lives and how
 * to change it.
 */
export function renderClaudeSkill({ name, entry, place, pageUrl }) {
  const who = ownerNoun(place.owner);
  const fallback = String(place.stem).replace(/[-_]+/g, ' ');
  const summary = skillSummary(entry.content) || fallback;
  const description = yamlOneLine(`${summary} (A Hiveku skill${who ? ` for ${who}` : ''}.)`, SKILL_DESCRIPTION_MAX);
  const stored = String(entry.domain ?? '').replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, 80);
  const lines = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    `> Synced from Hiveku by /hiveku:knowledge: the skill \`${stored}\`${place.label ? ` (${markdownLine(place.label)})` : ''}.`,
    `> Hiveku is the source of truth: change it on the Memory page${pageUrl ? ` (${pageUrl})` : ''} or with memory_update,`,
    '> then pull again. A local edit here is replaced by the next pull. It was written for Hiveku\'s own',
    '> agents: where it names a tool this session does not have (for example `python /app/tools/...`),',
    '> find the matching Hiveku tool with hiveku_find_tools instead.',
    '',
  ];
  return lines.join('\n') + (entry.content || '');
}

/** A path the manifest recorded, as a safe relative path inside the root, or null. */
function recordedPath(rootDir, rel, shape) {
  if (typeof rel !== 'string' || !rel) return null;
  const posix = rel.split(path.sep).join('/');
  if (shape && !shape.test(posix)) return null;
  const abs = path.join(rootDir, rel);
  return isInsideRoot(rootDir, abs) ? abs : null;
}

/**
 * Removes a file this sync wrote, only when it still holds exactly what was
 * written (`sha`), and then the folders it leaves empty, up to `stopAt`.
 * Returns 'removed', 'kept' (edited since, or not a plain file) or 'gone'.
 */
async function removeIfUnchanged(rootDir, abs, sha, stopAt) {
  let stat;
  try {
    stat = await fs.lstat(abs);
  } catch {
    return 'gone';
  }
  if (!stat.isFile()) return 'kept';
  let text;
  try {
    text = await fs.readFile(abs, 'utf8');
  } catch {
    return 'kept';
  }
  if (!sha || sha256(text) !== sha) return 'kept';
  await fs.unlink(abs);
  const stop = path.resolve(rootDir, stopAt);
  for (let dir = path.dirname(abs); isInsideRoot(rootDir, dir) && path.resolve(dir) !== stop; dir = path.dirname(dir)) {
    try {
      await fs.rmdir(dir);
    } catch {
      break; // not empty, or not ours to remove
    }
  }
  return 'removed';
}

/* ── Pull ───────────────────────────────────────────────────────────────── */

async function fetchKnowledge(client) {
  const entries = [];
  const failedTypes = [];
  const seen = new Set();
  // ★ A status check often runs SECONDS after a pull that just spent the whole
  // 100-per-60s budget, so the very first listings meet "Rate limit exceeded.
  // ... Retry after N seconds." Treating that as a dead type is how a fresh
  // pull got reported as 196 upstream deletions. Honour the server's own
  // number once per type; only a second failure counts as failed.
  const RETRY_AFTER = /retry after (\d+)/i;
  // The six typed listings, then one listing with no type for the `_account:*`
  // rows, which no type filter returns (their names start with `_account:`).
  for (const listing of [...SUPPORTED_TYPES, ACCOUNT_ROWS_LISTING]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rows = await client.listMemory(listing === ACCOUNT_ROWS_LISTING ? null : listing);
        for (const e of rows) {
          // The account memory is not a department memory (see the header).
          if (isAccountMemoryDomain(e?.domain)) continue;
          if (listing === ACCOUNT_ROWS_LISTING) {
            // Everything else in the unfiltered listing already came from a typed one.
            if (!isAccountRowDomain(e?.domain) || seen.has(keyOf(e))) continue;
          } else {
            seen.add(keyOf(e));
          }
          entries.push({ ...e, type: e.type || (listing === ACCOUNT_ROWS_LISTING ? 'memory' : listing), listing });
        }
        break;
      } catch (err) {
        const msg = String(err?.message || err);
        const secs = msg.match(RETRY_AFTER)?.[1];
        if (attempt === 0 && secs != null) {
          await new Promise((r) => setTimeout(r, Math.min(65, Number(secs)) * 1000 + 250));
          continue;
        }
        // One failing listing must not sink the others; report it instead.
        failedTypes.push(listing);
        break;
      }
    }
  }
  return { entries, failedTypes };
}

/** Which listing a manifest row came from (a row from an older pull carries only its type). */
function listingOf(row) {
  return row?.listing ?? row?.type;
}

/**
 * Writes every remote entry to <root>/<type folder>/<owner folder>/<slug>.md,
 * each skill also to .claude/skills/, and records the manifest. Returns counts
 * + the drift report. Never deletes an entry's local file (see the header for
 * the two things it tidies).
 */
export async function pullKnowledge({ rootDir, endpoint, key, accountId = null, appUrl = HIVEKU_APP_URL, log = () => {} }) {
  const client = new KnowledgeClient({ endpoint, key });
  const { entries, failedTypes } = await fetchKnowledge(client);
  const syncedAt = new Date().toISOString();

  const manifestPath = path.join(rootDir, MANIFEST_REL);
  const prior = (await readJson(manifestPath)) || { entries: {} };
  const priorEntries = prior.entries && typeof prior.entries === 'object' ? prior.entries : {};
  const manifest = { synced_at: syncedAt, entries: {} };

  // A listing that FAILED this run returned nothing — that is not "the
  // account deleted all its skills". Carry every prior entry of a failed
  // listing forward untouched, so a transient 429 on one type never erases
  // those files from the manifest, false-flags them as deleted, or blinds drift
  // detection to local edits until the next fully-successful pull.
  const failedSet = new Set(failedTypes);
  for (const [k, row] of Object.entries(priorEntries)) {
    if (failedSet.has(listingOf(row))) manifest.entries[k] = row;
  }

  const accountPageUrl = accountMemoryDashboardUrl(accountId, appUrl);
  let written = 0;
  const byType = {};
  const skipped = [];
  const failed = [];
  const moved = [];
  const movedKept = [];
  const usedFiles = new Map(); // relative file -> the key that took it this pull
  const usedSkillNames = new Set();
  const skills = { written: 0, removed: [], kept: [], failed: [] };
  for (const entry of entries) {
    const entryKey = keyOf(entry);
    const before = Object.hasOwn(priorEntries, entryKey) ? priorEntries[entryKey] : null;
    try {
      const place = placeEntry(entry);
      if (!place) continue;
      const stem = safeFileStem(slugify(place.stem, 'unnamed'));
      let file = path.join(place.typeFolder, place.folder, `${stem}.md`);
      // Two entries whose names reduce to one file (a chief of staff rule and a
      // shared rule of the same name, or `a_b` and `a-b`) get one each: the
      // later one in listing order takes a numbered name, the same every pull.
      for (let n = 2; usedFiles.has(file) && usedFiles.get(file) !== entryKey; n++) {
        file = path.join(place.typeFolder, place.folder, `${stem}-${n}.md`);
      }
      const abs = path.join(rootDir, file);
      // One bad row is skipped, never the whole pull, and never written.
      if (!isInsideRoot(rootDir, abs)) {
        skipped.push(entryKey);
        continue;
      }
      usedFiles.set(file, entryKey);
      const body = renderEntry(entry, place);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body, 'utf8');
      written++;
      byType[place.type] = (byType[place.type] || 0) + 1;
      const row = {
        id: entry.id,
        type: place.type,
        ...(entry.listing && entry.listing !== place.type ? { listing: entry.listing } : {}),
        department: place.folder,
        // Present only when it is known: the builder's owner (null = shared), or
        // the chief of staff for her own `_account:*` rows.
        ...(place.owner !== undefined ? { owner: place.owner } : {}),
        domain: entry.domain,
        version: entry.version != null ? String(entry.version) : undefined,
        updated_at: entry.updated_at,
        file,
        content_sha: sha256(body),
        synced_at: syncedAt,
      };

      // The entry's folder changed since the last pull (its owner moved, or the
      // builder started saying who owns it): the old copy goes if nobody edited it.
      // A path another entry already took this pull is that entry's now: not ours to touch.
      if (before && typeof before.file === 'string' && before.file !== file && !usedFiles.has(before.file)) {
        const oldAbs = recordedPath(rootDir, before.file, KNOWLEDGE_FILE_REL);
        const typeRoot = String(before.file).split(/[\\/]/)[0] || '.';
        const outcome = oldAbs ? await removeIfUnchanged(rootDir, oldAbs, before.content_sha, typeRoot) : 'kept';
        if (outcome === 'removed') moved.push({ key: entryKey, from: before.file, to: file });
        else if (outcome === 'kept') movedKept.push({ key: entryKey, from: before.file, to: file });
      }

      // The Claude Code copy of a skill (G13). Its failure never fails the entry.
      if (place.type === 'skill') {
        const name = claudeSkillName(place.folder, place.stem, entryKey, usedSkillNames);
        const skillFile = path.join(CLAUDE_SKILLS_DIR, name, 'SKILL.md');
        const skillAbs = path.join(rootDir, skillFile);
        try {
          if (!isInsideRoot(rootDir, skillAbs)) throw new Error('outside the folder');
          const text = renderClaudeSkill({ name, entry, place, pageUrl: pageUrlOf(entry) ?? accountPageUrl });
          await fs.mkdir(path.dirname(skillAbs), { recursive: true });
          await fs.writeFile(skillAbs, text, 'utf8');
          skills.written++;
          row.claude_skill = skillFile;
          row.claude_skill_sha = sha256(text);
        } catch {
          skills.failed.push(entryKey);
          // Keep what the last pull recorded, so a copy that is still there is not forgotten.
          if (before?.claude_skill) {
            row.claude_skill = before.claude_skill;
            row.claude_skill_sha = before.claude_skill_sha;
          }
        }
      }
      manifest.entries[entryKey] = row;
    } catch {
      // A row the disk refuses (a name Windows keeps, a folder that cannot be
      // created, a permission error) must not abort the rest of the pull. Keep
      // what the last pull recorded for it: failing to write it here is not the
      // entry being deleted upstream, and its local file is still the old one.
      failed.push(entryKey);
      if (before && !Object.hasOwn(manifest.entries, entryKey)) manifest.entries[entryKey] = before;
    }
  }

  // A Claude Code skill copy whose skill is gone (or now has another name): Claude
  // Code would keep following it, so the copy this sync wrote is removed. Every
  // copy the new manifest still names stays: this pull wrote it, or its listing
  // failed and it was carried forward. An edited copy is kept and reported.
  const keptSkillFiles = new Set(Object.values(manifest.entries).map((row) => row?.claude_skill).filter(Boolean));
  for (const [k, row] of Object.entries(priorEntries)) {
    if (!row?.claude_skill || keptSkillFiles.has(row.claude_skill)) continue;
    const abs = recordedPath(rootDir, row.claude_skill, CLAUDE_SKILL_REL);
    if (!abs) continue;
    const outcome = await removeIfUnchanged(rootDir, abs, row.claude_skill_sha, CLAUDE_SKILLS_DIR);
    if (outcome === 'removed') skills.removed.push(k);
    else if (outcome === 'kept') skills.kept.push(k);
  }

  // Advisory deletion report: what the PREVIOUS manifest had that upstream no
  // longer returns. The local file stays — flagging beats deleting.
  const deletedRemote = Object.keys(priorEntries).filter(
    (k) => !(k in manifest.entries) && !isAccountMemoryDomain(priorEntries[k]?.domain ?? k),
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

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  for (const [type, n] of Object.entries(byType)) log(`  ${TYPE_TO_FOLDER[type]}/: ${n} ${type} file${n === 1 ? '' : 's'}`);
  if (skills.written) log(`  .claude/skills/: ${plural(skills.written, 'skill', 'skills')} for Claude Code (hiveku-<agent>-<name>)`);
  if (moved.length) log(`  moved to their owner's folder: ${plural(moved.length, 'file', 'files')}`);
  if (movedKept.length) {
    log(`  WARNING: ${plural(movedKept.length, 'entry now files', 'entries now file')} under a new owner, but the old cop${movedKept.length === 1 ? 'y was' : 'ies were'} edited here and stay: ${movedKept.map((m) => m.from).join(', ')}`);
  }
  if (skills.removed.length) log(`  removed ${plural(skills.removed.length, 'Claude Code skill copy', 'Claude Code skill copies')} of skills that are gone: ${skills.removed.join(', ')}`);
  if (skills.kept.length) log(`  WARNING: kept ${plural(skills.kept.length, 'edited Claude Code skill copy', 'edited Claude Code skill copies')} of skills that are gone: ${skills.kept.join(', ')}`);
  if (skills.failed.length) log(`  WARNING: could not write ${plural(skills.failed.length, 'Claude Code skill copy', 'Claude Code skill copies')}`);
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
  return { written, byType, deletedRemote, failedTypes, skipped, failed, moved, movedKept, skills, accountMemory };
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
  // An `_account:*` row the page does not show is never written, so it is not
  // new upstream either.
  const remote = new Map(entries.filter((e) => !isAccountRowDomain(e?.domain) || placeEntry(e)).map((e) => [keyOf(e), e]));
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
  const listingOfKey = (k) => listingOf(prior.entries[k]);

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
      : priorKeys.filter((k) => !remote.has(k) && !failedSet.has(listingOfKey(k))),
    unverifiable: wholesaleEmpty
      ? [...priorKeys]
      : priorKeys.filter((k) => !remote.has(k) && failedSet.has(listingOfKey(k))),
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
