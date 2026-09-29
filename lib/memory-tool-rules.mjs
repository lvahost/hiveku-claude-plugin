/**
 * PreToolUse reasons for the memory writes, naming the agent that follows
 * what is changed (memory surfaces audit 2026-09-27, m14/P18), and the one
 * memory write that asks only for some arguments: memory_create of a rule,
 * skill, shortcut or specialist that names no agent.
 *
 * ★ WHY memory_create ASKS NOW. A rule, skill, command (Shortcut) or agent
 * (Specialist) saved without a department is "Shared with every agent": every
 * agent follows it in chats (audit G7). The MCP tool could not even send a
 * department until fix/memory-gaps-department, so every one a connected app
 * made was shared unless someone typed a hidden marker into its text, and the
 * hook said nothing because memory_create was deliberately left off the
 * always-ask set ("it only makes a new entry"). It asks now only for that
 * case: a typed entry at account level whose call names no owner. A note or a
 * profile belongs to the agent its name says, a website's own entry
 * (project_id) to the Website agent, and a call that names its owner (a
 * `department` argument, "shared" included, or a `<!-- department: x -->`
 * line or front matter in its text) was a choice, so those stay silent and the
 * user's settings decide them as before.
 *
 * ★ WHERE THE AGENT'S NAME COMES FROM. The hook sees only the call's
 * arguments: memory_update and memory_delete carry an id, not a name or an
 * owner. The owner is known locally only from the last /hiveku:knowledge pull
 * (.hiveku/knowledge-manifest.json records each entry's id and, from the
 * builder, its owner), or from a department the call's own text declares. The
 * reason says which it used, and says it does not know rather than guessing.
 * Nothing here calls the network: the hook runs before every Hiveku call.
 *
 * Reasons are shown to the PERSON, so they use the Memory page's words.
 * Kept out of lib/tool-safety.mjs on purpose, like lib/vcs-tool-rules.mjs:
 * that file calls `memoryWriteDecision` and the always-ask set reads
 * MEMORY_ASK_BASE, so each reason is written once.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  declaredDepartment,
  followersOf,
  isDepartment,
  newEntryOwner,
  normalizeKey,
  typedKindOf,
  VOICE_FOLDER,
} from './memory-owner.mjs';

/**
 * What each memory write does, before the part that names who follows it.
 * lib/tool-safety.mjs ALWAYS_ASK_WRITES uses these texts for its set.
 */
export const MEMORY_ASK_BASE = Object.freeze({
  memory_update:
    'replaces the whole text of a memory entry with the text you send. Anything left out of the '
    + 'new text is gone from what its agents read from their next conversation (earlier versions '
    + 'stay in the version history)',
  memory_delete:
    'deletes a memory entry. Its agents stop reading it straight away; it can be put back from its '
    + 'version history',
  memory_restore_version:
    'puts an older version of a memory entry back over the current one, and its agents read the '
    + 'older text from their next conversation',
  memory_bulk_create:
    'writes many memory entries in one call, and their agents read each of them from their next '
    + 'conversation',
  account_memory_append:
    'suggests a line for About your business. Until an owner or admin reviews it on the Memory '
    + 'page, every agent reads it (marked as not reviewed) when your team chats with them, so a '
    + 'wrong line steers all of them',
});

/** Said when the owner cannot be known here. */
const UNKNOWN_FOLLOWERS =
  'the agent the Memory page files it under, or every agent if it is shared (a /hiveku:knowledge '
  + 'pull lets this prompt name it)';

/** A stored name fit to show in a prompt, or null. */
function shownName(domain) {
  return typeof domain === 'string' && /^[A-Za-z0-9_:.-]{1,80}$/.test(domain) ? domain : null;
}

const MANIFEST_REL = path.join('.hiveku', 'knowledge-manifest.json');
/** A manifest bigger than this is not read by the hook (it runs before every call). */
const MANIFEST_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The entry the last /hiveku:knowledge pull recorded for `memoryId`, from the
 * nearest .hiveku/knowledge-manifest.json at or above `startDir` (not above
 * the home folder). Null when there is none, it is unreadable or too big, or
 * the id is not in it. Never throws.
 */
export function manifestEntryFor(memoryId, startDir) {
  const id = typeof memoryId === 'string' ? memoryId.trim() : '';
  if (!id) return null;
  let dir = path.resolve(startDir || process.cwd());
  const home = os.homedir();
  for (let depth = 0; depth < 20; depth++) {
    if (dir === home || path.dirname(dir) === dir) break;
    const file = path.join(dir, MANIFEST_REL);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MANIFEST_MAX_BYTES) return null;
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entries = manifest && typeof manifest.entries === 'object' && manifest.entries ? manifest.entries : {};
      for (const row of Object.values(entries)) {
        if (row && typeof row === 'object' && row.id === id) return row;
      }
      return null;
    } catch {
      /* not at this level, or unreadable */
    }
    dir = path.dirname(dir);
  }
  return null;
}

/** Who follows an entry the manifest recorded, or null when the pull could not say. */
function followersFromManifest(row) {
  if (!row) return null;
  if (Object.hasOwn(row, 'owner') && (row.owner === null || typeof row.owner === 'string')) return followersOf(row.owner);
  if (row.department === VOICE_FOLDER) return 'the agents that speak on calls and in voice huddles (Voice and pronunciation)';
  return null;
}

/**
 * "Who follows it: ..." for an existing entry named by `memory_id`, from the
 * `department` the call sends, the last knowledge pull, or the department the
 * new text declares, in that order.
 */
function whoFollowsExisting(input, cwd, { newText = false } = {}) {
  const department = normalizeKey(input?.department);
  if (department === 'shared') return `Who follows it: ${followersOf(null)}`;
  if (isDepartment(department)) return `Who follows it: ${followersOf(department)}`;
  const row = manifestEntryFor(input?.memory_id, cwd);
  const fromPull = followersFromManifest(row);
  if (fromPull) {
    const name = shownName(row.domain);
    return `Who follows ${name ? `\`${name}\`` : 'it'}: ${fromPull} (as of the last /hiveku:knowledge pull)`;
  }
  const declared = newText ? declaredDepartment(input?.content) : null;
  if (declared) return `Who follows it: ${followersOf(declared)} (the department its new text names)`;
  return `Who follows it: ${UNKNOWN_FOLLOWERS}`;
}

/** Who a NEW entry is for, when the call says (a note or profile by its name). */
function newEntryFollowerKey(entry) {
  const { owner } = newEntryOwner(entry);
  if (owner !== undefined) return owner;
  const domain = normalizeKey(entry?.domain) || normalizeKey(entry?.name);
  const type = normalizeKey(entry?.type);
  if (domain.startsWith('_identity:')) {
    const slug = domain.slice('_identity:'.length);
    return isDepartment(slug) ? slug : undefined;
  }
  if ((type === 'memory' || (!type && domain && !domain.startsWith('_'))) && isDepartment(domain)) return domain;
  return undefined;
}

/** "Who follows them: every agent ... (2 entries); the SEO topic ... (1)". */
function whoFollowsBulk(input) {
  const list = Array.isArray(input?.entries) ? input.entries : null;
  if (!list || list.length === 0) return `Who follows them: ${UNKNOWN_FOLLOWERS}`;
  const counts = new Map();
  for (const entry of list) {
    const key = newEntryFollowerKey(entry);
    const label = followersOf(key) ?? UNKNOWN_FOLLOWERS;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const parts = [...counts].map(([label, n]) => `${label} (${n} entr${n === 1 ? 'y' : 'ies'})`);
  return `Who follows them: ${parts.join('; ')}`;
}

/**
 * The ask for one memory write, or null when this module has nothing to say
 * about the call (not a memory write, or a memory_create that names its owner
 * or is not a rule, skill, shortcut or specialist). `reason` is a clause that
 * follows the tool name; lib/tool-safety.mjs adds the closing sentence.
 */
export function memoryWriteDecision(bareName, toolInput, cwd) {
  const name = typeof bareName === 'string' ? bareName.toLowerCase() : '';
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {};
  try {
    switch (name) {
      case 'memory_update':
        return { decision: 'ask', reason: `${MEMORY_ASK_BASE.memory_update}. ${whoFollowsExisting(input, cwd, { newText: true })}` };
      case 'memory_delete':
        return { decision: 'ask', reason: `${MEMORY_ASK_BASE.memory_delete}. ${whoFollowsExisting(input, cwd)}` };
      case 'memory_restore_version':
        return { decision: 'ask', reason: `${MEMORY_ASK_BASE.memory_restore_version}. ${whoFollowsExisting(input, cwd)}` };
      case 'memory_bulk_create':
        return { decision: 'ask', reason: `${MEMORY_ASK_BASE.memory_bulk_create}. ${whoFollowsBulk(input)}` };
      case 'account_memory_append':
        return { decision: 'ask', reason: MEMORY_ASK_BASE.account_memory_append };
      case 'memory_create': {
        const kind = typedKindOf(input);
        if (!kind) return null;
        const { owner, named } = newEntryOwner(input);
        if (named || owner !== null) return null;
        return {
          decision: 'ask',
          reason:
            `creates a ${kind} that names no agent, so it is Shared with every agent: every agent follows `
            + 'it in chats from its next conversation (calls follow only the receptionist\'s own call '
            + 'rules). To give it to one agent instead, pass `department` (or start its text with '
            + '<!-- department: x -->)',
        };
      }
      default:
        return null;
    }
  } catch {
    // A rule that cannot read the call still asks for the writes that always ask.
    return name in MEMORY_ASK_BASE ? { decision: 'ask', reason: MEMORY_ASK_BASE[name] } : null;
  }
}
