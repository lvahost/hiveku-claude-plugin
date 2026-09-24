/**
 * The account memory, mirrored to disk as a READ-ONLY file:
 *
 *   hiveku-data/account/ACCOUNT_MEMORY.md
 *
 * The account memory is the one document of business facts every department
 * agent reads (plan A7, memory-ui-and-account-memory-plan.md 2.9). It belongs
 * to the account's owners and admins, who edit it on the Hiveku dashboard.
 * There is no set tool and never will be one from here: the builder only ever
 * sees a service key and cannot tell an owner from an agent.
 *
 * So this module only READS (account_memory_get) and only writes the local
 * copy. Three rules follow from that, each pinned by test/account-memory.test.mjs:
 *
 *  - The file says, at the top, that it is a copy, that edits here are not
 *    saved, and where the owner edits it (the dashboard link).
 *  - The file is written with mode 0444, and a local edit is REPLACED on the
 *    next pull. Nothing in the plugin uploads it: there is no push for it.
 *  - A failed read never clobbers a good copy, same as every dataset file.
 *
 * The same two domains (`account`, `account-suggestions`) must never be filed
 * as a department by the knowledge sync (memory/account/...), so the domain
 * test lives here and knowledge.mjs asks it.
 *
 * Layout is shared with hiveku-sync and the VS Code extension: an agent reads
 * ONE file regardless of which tool refreshed it last.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { HIVEKU_APP_URL, isUuid } from './util.mjs';

export const ACCOUNT_MEMORY_DOMAIN = 'account';
export const ACCOUNT_SUGGESTIONS_DOMAIN = 'account-suggestions';
export const ACCOUNT_MEMORY_DOMAINS = Object.freeze([ACCOUNT_MEMORY_DOMAIN, ACCOUNT_SUGGESTIONS_DOMAIN]);
export const ACCOUNT_MEMORY_TOOL = 'account_memory_get';

/** Relative to the bound folder. */
export const ACCOUNT_MEMORY_DIR_REL = path.join('hiveku-data', 'account');
export const ACCOUNT_MEMORY_FILE = 'ACCOUNT_MEMORY.md';
export const ACCOUNT_MEMORY_REL = path.join(ACCOUNT_MEMORY_DIR_REL, ACCOUNT_MEMORY_FILE);

/** The builder's dashboard page (src/app/dashboard/memory, scoped mirror under /[accountId]). */
const DASHBOARD_PATH = 'dashboard/memory';

export function isAccountMemoryDomain(domain) {
  return typeof domain === 'string' && ACCOUNT_MEMORY_DOMAINS.includes(domain.trim().toLowerCase());
}

/**
 * The page where owners and admins edit it. Account-scoped when the account id
 * is a real UUID (the scoped route opens on the right account for a person in
 * several); the unscoped page otherwise, never a half-built URL.
 */
export function accountMemoryDashboardUrl(accountId, appUrl = HIVEKU_APP_URL) {
  const base = String(appUrl || HIVEKU_APP_URL).replace(/\/+$/, '');
  return isUuid(accountId) ? `${base}/${accountId.toLowerCase()}/${DASHBOARD_PATH}` : `${base}/${DASHBOARD_PATH}`;
}

/**
 * The tool result, checked. account_memory_get returns the builder's
 * `{ data: { content, version, updated_at, bytes, suggestions, suggestions_version,
 * injected, truncated } }`. Anything else is an error, not an empty memory:
 * writing "nothing written yet" over a real document because the shape moved
 * would be a lie on disk.
 */
export function normalizeAccountMemory(payload) {
  const inner = payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload ? payload.data : payload;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
    throw new Error(`${ACCOUNT_MEMORY_TOOL} returned an unexpected shape (no object)`);
  }
  if (typeof inner.content !== 'string' || !Number.isFinite(Number(inner.version))) {
    throw new Error(`${ACCOUNT_MEMORY_TOOL} returned an unexpected shape (no content or version)`);
  }
  const suggestions = Array.isArray(inner.suggestions) ? inner.suggestions : [];
  return {
    content: inner.content,
    version: Number(inner.version),
    updated_at: typeof inner.updated_at === 'string' ? inner.updated_at : null,
    suggestions: suggestions
      .filter((s) => s && typeof s === 'object' && typeof s.text === 'string' && s.text.trim())
      .map((s) => ({
        id: typeof s.id === 'string' ? s.id : '',
        at: typeof s.at === 'string' ? s.at : '',
        source: typeof s.source === 'string' && s.source.trim() ? s.source : 'Unknown',
        text: s.text,
      })),
    suggestions_version: Number.isFinite(Number(inner.suggestions_version)) ? Number(inner.suggestions_version) : 0,
    truncated: inner.truncated === true,
  };
}

/** "2026-09-23 14:02 UTC", or the raw value when it is not a date. */
function readableTime(value) {
  if (!value) return 'unknown time';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** One line, no line breaks: a suggestion is one line on the server too. */
function oneLine(value) {
  return String(value).replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The file text. Plain language: the person reading it may be the owner.
 * Held suggestions (from the agents that talk to customers, and onboarding)
 * are never in the tool's answer, so they are never here either.
 */
export function renderAccountMemoryFile({ memory, accountId, fetchedAt, appUrl = HIVEKU_APP_URL }) {
  const editUrl = accountMemoryDashboardUrl(accountId, appUrl);
  const fm = [
    '---',
    `read_only: true`,
    `source_tool: ${ACCOUNT_MEMORY_TOOL}`,
    `version: ${memory.version}`,
    ...(memory.updated_at ? [`updated_at: ${yamlString(memory.updated_at)}`] : []),
    `suggestions: ${memory.suggestions.length}`,
    `suggestions_version: ${memory.suggestions_version}`,
    `fetched_at: ${yamlString(fetchedAt)}`,
    `edit_url: ${yamlString(editUrl)}`,
    '---',
    '',
  ];
  const lines = [
    '# Account memory',
    '',
    '> This is a read-only copy of the account memory, the facts about the business that every',
    '> Hiveku department agent reads. Owners and admins edit it on the Hiveku dashboard:',
    `> ${editUrl}`,
    '>',
    '> Changes made to this file are not saved to Hiveku. The next pull replaces this file, and',
    '> nothing uploads it. To add a fact, suggest it with account_memory_append (an owner or admin',
    '> reviews it on the dashboard), or ask an owner or admin to change the document there.',
    '> It is internal to the team: do not quote it to customers.',
    '',
  ];
  if (memory.version > 0 && memory.content.trim()) {
    lines.push(`Version ${memory.version}, last changed ${readableTime(memory.updated_at)}.`);
    if (memory.truncated) {
      lines.push(
        'Agents see a shortened version: with the suggestions, it is longer than the 8,000 characters they read.',
      );
    }
    lines.push('', '---', '', memory.content.replace(/\s+$/, ''), '', '---', '');
  } else {
    lines.push('Nothing has been written yet. An owner or admin can start it on the dashboard.', '');
  }

  lines.push('# Suggestions from agents, not reviewed yet', '');
  if (memory.suggestions.length) {
    lines.push(
      'These lines are not part of the account memory until an owner or admin keeps them on the dashboard.',
      '',
    );
    for (const s of memory.suggestions) {
      lines.push(`- ${oneLine(s.text)} (suggested by ${oneLine(s.source)}, ${readableTime(s.at)})`);
    }
  } else {
    lines.push('None waiting.');
  }
  lines.push('');
  return fm.join('\n') + lines.join('\n');
}

/**
 * Replaces the file even when a previous pull left it read-only: write a temp
 * beside it, rename over it (a rename needs the FOLDER writable, not the file),
 * then mark the result read-only. Windows refuses a rename onto a read-only
 * file, so on that refusal the old copy is made writable first and the rename
 * retried.
 */
export async function writeReadOnlyFile(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, text, 'utf8');
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    if (err?.code !== 'EPERM' && err?.code !== 'EACCES') {
      await fs.unlink(tmp).catch(() => undefined);
      throw err;
    }
    await fs.chmod(file, 0o644);
    await fs.rename(tmp, file);
  }
  await fs.chmod(file, 0o444);
}

/**
 * Reads the account memory through `callTool(name, args)` (the caller's MCP
 * client, so it shares the session and the key) and writes the read-only copy.
 * Never throws: returns `{ ok, file, version, suggestions }` or
 * `{ ok: false, error, kept }`, where `kept` says a previous copy was left in place.
 */
export async function syncAccountMemory({ rootDir, callTool, accountId, appUrl = HIVEKU_APP_URL, log = () => {} }) {
  const file = path.join(rootDir, ACCOUNT_MEMORY_REL);
  const fetchedAt = new Date().toISOString();
  let memory;
  try {
    memory = normalizeAccountMemory(await callTool(ACCOUNT_MEMORY_TOOL, {}));
  } catch (err) {
    const error = String(err?.message || err);
    let kept = false;
    try {
      await fs.access(file);
      kept = true;
    } catch {
      /* no previous copy */
    }
    log(`  account/${ACCOUNT_MEMORY_FILE}: ERROR ${error.slice(0, 120)}${kept ? ' (kept previous copy)' : ''}`);
    return { ok: false, error, kept, fetched_at: fetchedAt };
  }
  await writeReadOnlyFile(file, renderAccountMemoryFile({ memory, accountId, fetchedAt, appUrl }));
  const n = memory.suggestions.length;
  log(
    `  account/${ACCOUNT_MEMORY_FILE}: ${memory.version > 0 ? `version ${memory.version}` : 'empty'}, ` +
      `${n} suggestion${n === 1 ? '' : 's'} (read-only; edit on the dashboard)`,
  );
  return {
    ok: true,
    file: ACCOUNT_MEMORY_REL,
    version: memory.version,
    suggestions: n,
    fetched_at: fetchedAt,
  };
}
