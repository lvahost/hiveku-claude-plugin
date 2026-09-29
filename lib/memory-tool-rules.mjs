/**
 * PreToolUse reasons for the memory writes, naming the agent that follows
 * what is changed (memory surfaces audit 2026-09-27, m14/P18), and the one
 * memory write that asks only for some arguments: memory_create of a rule,
 * skill, shortcut or specialist that names no agent.
 *
 * ★ WHY memory_create ASKS NOW. A rule, skill, command (Shortcut) or agent
 * (Specialist) saved without a department is "Shared with every agent": every
 * agent follows it in chats (audit G7). The MCP tool could not even send a
 * department until fix/memory-gaps-department (hiveku-mcp-api-server PR #63),
 * so every one a connected app made was shared unless someone typed a hidden
 * marker into its text, and the hook said nothing because memory_create was
 * deliberately left off the always-ask set ("it only makes a new entry"). It
 * asks now only for that case: a typed entry at account level whose call does
 * not decide its owner. A note or a profile belongs to the agent its name says,
 * a website's own entry (project_id) to the Website agent, and a call whose
 * text names its agent (a `<!-- department: x -->` line or front matter) or
 * that passes `department: "shared"` made a choice, so those stay silent and
 * the user's settings decide them as before.
 *
 * ★ A `department` ARGUMENT COUNTS ONLY WHERE IT REACHES HIVEKU (PR #50
 * review, F3). The live MCP server drops memory_create's `department` (the
 * tool does not declare it until PR #63), so a rule "for Sales" made that way
 * is shared with every agent: counting the argument would stay silent exactly
 * when the person meant one agent and got all of them. MEMORY_CREATE_SENDS_
 * DEPARTMENT says which is true; test/memory-hook-reasons.test.mjs holds it to
 * the tool index, so the release that regenerates the index from a server with
 * PR #63 live has to flip it. memory_bulk_create's entries carry `department`
 * to the builder today (the proxy sends `entries` whole), so it counts there.
 * memory_update, memory_delete and memory_restore_version take no
 * `department` at all (F4), so a stray one says nothing about the entry.
 *
 * ★ WHERE THE AGENT'S NAME COMES FROM. The hook sees only the call's
 * arguments: memory_update and memory_delete carry an id, not a name or an
 * owner, and memory_restore_version only a version id (F5: this prompt cannot
 * name that entry at all). The owner is known locally only from the last
 * /hiveku:knowledge pull: .hiveku/knowledge-plugin.json records each entry's
 * id, the builder's owner and the stored department column (the shared
 * .hiveku/knowledge-manifest.json, which the VS Code extension also writes,
 * gives the id and the name only). For a memory_update of a rule, skill,
 * shortcut or specialist, the reason also says when the new text moves the
 * entry to another agent (F4): the update keeps the column and replaces the
 * text, and the owner rule (typedRowOwner) reads both. The reason says which
 * source it used, and says it does not know rather than guessing. Nothing here
 * calls the network: the hook runs before every Hiveku call.
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
  isTypedDomain,
  newEntryOwner,
  normalizeKey,
  ownerNoun,
  typedKindOf,
  typedRowOwner,
  VOICE_FOLDER,
} from './memory-owner.mjs';

/**
 * Whether memory_create's `department` argument reaches the builder. False
 * until hiveku-mcp-api-server PR #63 (fix/memory-gaps-department) is live: the
 * proxy drops an argument the tool does not declare. The test that pins this
 * to lib/tool-index.json fails once a regenerated index shows the tool takes it.
 */
export const MEMORY_CREATE_SENDS_DEPARTMENT = false;

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

/**
 * Said for a restore (F5): the call names a version, not an entry, so no pull
 * can let this prompt name the entry or its agent.
 */
const RESTORE_FOLLOWERS =
  'Who follows it: this prompt cannot say, because a restore names only a version, not its entry '
  + '(the entry\'s history on the Memory page, or memory_list_versions for that entry, shows which '
  + 'entry and agent it is)';

/** A stored name fit to show in a prompt, or null. */
function shownName(domain) {
  return typeof domain === 'string' && /^[A-Za-z0-9_:.-]{1,80}$/.test(domain) ? domain : null;
}

/**
 * What the last /hiveku:knowledge pull recorded, nearest folder first: this
 * plugin's own state (the builder's owner and the stored column), then the
 * manifest it shares with the VS Code extension (the id and the name only).
 * Kept equal to lib/knowledge.mjs KNOWLEDGE_PLUGIN_STATE_REL and
 * KNOWLEDGE_MANIFEST_REL by test/memory-hook-reasons.test.mjs (the hook does
 * not import the sync, which it would load before every Hiveku call).
 */
export const RECORD_FILES = Object.freeze(['.hiveku/knowledge-plugin.json', '.hiveku/knowledge-manifest.json']);
/** A record bigger than this is not read by the hook (it runs before every call). */
const RECORD_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The entry the last /hiveku:knowledge pull recorded for `memoryId`, from the
 * nearest folder at or above `startDir` (not above the home folder) that has
 * either record: this plugin's own state first, then the shared manifest.
 * Null when there is none, it is unreadable or too big, or the id is not in
 * it. Never throws.
 */
export function manifestEntryFor(memoryId, startDir) {
  const id = typeof memoryId === 'string' ? memoryId.trim() : '';
  if (!id) return null;
  let dir = path.resolve(startDir || process.cwd());
  const home = os.homedir();
  for (let depth = 0; depth < 20; depth++) {
    if (dir === home || path.dirname(dir) === dir) break;
    let found = false;
    for (const rel of RECORD_FILES) {
      const file = path.join(dir, ...rel.split('/'));
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue; // not at this level
      }
      found = true;
      if (!stat.isFile() || stat.size > RECORD_MAX_BYTES) continue;
      try {
        const record = JSON.parse(fs.readFileSync(file, 'utf8'));
        const entries = record && typeof record.entries === 'object' && record.entries ? record.entries : {};
        for (const row of Object.values(entries)) {
          if (row && typeof row === 'object' && row.id === id) return row;
        }
      } catch {
        /* unreadable: the other record may still say */
      }
    }
    // The folder a pull recorded is the bound folder: never look above it.
    if (found) return null;
    dir = path.dirname(dir);
  }
  return null;
}

/** The owner a pull recorded: a key, null (shared), or undefined when it could not say. */
function recordedOwner(row) {
  if (!row || !Object.hasOwn(row, 'owner')) return undefined;
  if (row.owner === null) return null;
  return typeof row.owner === 'string' && normalizeKey(row.owner) ? normalizeKey(row.owner) : undefined;
}

/** Who follows an entry the pull recorded, or null when the pull could not say. */
function followersFromManifest(row) {
  if (!row) return null;
  const owner = recordedOwner(row);
  if (owner !== undefined) return followersOf(owner, { domain: row.domain });
  if (row.department === VOICE_FOLDER) return 'the agents that speak on calls and in voice huddles (Voice and pronunciation)';
  return null;
}

/**
 * For a memory_update of a rule, skill, shortcut or specialist: the sentence
 * that says the new text moves it to another agent, or null when it stays
 * where it is (or the pull did not record enough to tell). The update keeps
 * the stored column and replaces the text, so the owner afterwards is
 * typedRowOwner over the recorded column and the new text (F4).
 */
function movedByNewText(row, newContent) {
  if (!row || typeof newContent !== 'string' || !isTypedDomain(row.domain)) return null;
  if (!Object.hasOwn(row, 'column') || !(row.column === null || typeof row.column === 'string')) return null;
  const before = recordedOwner(row);
  if (before === undefined) return null;
  const after = typedRowOwner({ column: row.column, content: newContent });
  if (after === before) return null;
  const noun = (key) => ownerNoun(key) ?? 'no agent on the Memory page';
  let how;
  if (after === null) how = 'its new text names no agent, so it becomes shared with every agent';
  else if (declaredDepartment(newContent) === after) how = `the department line in its new text files it under ${noun(after)}`;
  // A `marketing` column with no Marketing topic named in the text any more (rule c).
  else how = `its new text no longer names ${noun(before)}, so it goes back to ${noun(after)}`;
  return `This change moves it: ${how}. Who follows it after this change: ${followersOf(after, { domain: row.domain })}`;
}

/**
 * "Who follows it: ..." for an existing entry named by `memory_id`, from the
 * last knowledge pull, and for an update, where its new text moves it.
 */
function whoFollowsExisting(input, cwd, { newText = false } = {}) {
  const row = manifestEntryFor(input?.memory_id, cwd);
  const fromPull = followersFromManifest(row);
  if (fromPull) {
    const name = shownName(row.domain);
    const now = `Who follows ${name ? `\`${name}\`` : 'it'}: ${fromPull} (as of the last /hiveku:knowledge pull)`;
    const moved = newText ? movedByNewText(row, input?.content) : null;
    return moved ? `${now}. ${moved}` : now;
  }
  const declared = newText ? declaredDepartment(input?.content) : null;
  if (declared) return `Who follows it: ${followersOf(declared)} (the department its new text names)`;
  return `Who follows it: ${UNKNOWN_FOLLOWERS}`;
}

/** The domain a new entry will have: its own, else `_<type>:<name>` for a typed one, else its name. */
function newEntryDomain(entry) {
  const domain = normalizeKey(entry?.domain);
  if (domain) return domain;
  const type = normalizeKey(entry?.type);
  const name = normalizeKey(entry?.name);
  return ['rule', 'skill', 'command', 'agent', 'identity'].includes(type) && name ? `_${type}:${name}` : name;
}

/** Who a NEW entry is for, when the call says (a note or profile by its name). */
function newEntryFollowerKey(entry) {
  // memory_bulk_create's entries carry `department` to the builder today.
  const { owner } = newEntryOwner(entry, { departmentArg: true });
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
    const label = followersOf(key, { domain: newEntryDomain(entry) }) ?? UNKNOWN_FOLLOWERS;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const parts = [...counts].map(([label, n]) => `${label} (${n} entr${n === 1 ? 'y' : 'ies'})`);
  return `Who follows them: ${parts.join('; ')}`;
}

/**
 * The memory_create ask, for a rule, skill, shortcut or specialist whose call
 * leaves it shared with every agent. A `department` the server does not send
 * yet is named, so the person sees why the call they read as "for Sales" asks.
 */
function createAskReason(kind, input) {
  const asked = normalizeKey(input?.department);
  const noun = isDepartment(asked) ? ownerNoun(asked) : null;
  const tail =
    'every agent follows it in chats from its next conversation (calls follow only the '
    + 'receptionist\'s own call rules)';
  if (noun) {
    return (
      `creates a ${kind} with \`department: "${asked}"\`, which Hiveku does not apply to a new `
      + `entry from this app yet, so it is Shared with every agent: ${tail}. To give it to `
      + `${noun} only, start its text with the line <!-- department: ${asked} -->`
    );
  }
  return (
    `creates a ${kind} that names no agent, so it is Shared with every agent: ${tail}. To give it `
    + 'to one agent instead, start its text with the line <!-- department: x -->, where x is that '
    + 'agent (for example sales or seo)'
  );
}

/**
 * The ask for one memory write, or null when this module has nothing to say
 * about the call (not a memory write, or a memory_create that decides its
 * owner or is not a rule, skill, shortcut or specialist). `reason` is a clause
 * that follows the tool name; lib/tool-safety.mjs adds the closing sentence.
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
        return { decision: 'ask', reason: `${MEMORY_ASK_BASE.memory_restore_version}. ${RESTORE_FOLLOWERS}` };
      case 'memory_bulk_create':
        return { decision: 'ask', reason: `${MEMORY_ASK_BASE.memory_bulk_create}. ${whoFollowsBulk(input)}` };
      case 'account_memory_append':
        return { decision: 'ask', reason: MEMORY_ASK_BASE.account_memory_append };
      case 'memory_create': {
        const kind = typedKindOf(input);
        if (!kind) return null;
        const { owner, named } = newEntryOwner(input, { departmentArg: MEMORY_CREATE_SENDS_DEPARTMENT });
        if (named || owner !== null) return null;
        return { decision: 'ask', reason: createAskReason(kind, input) };
      }
      default:
        return null;
    }
  } catch {
    // A rule that cannot read the call still asks for the writes that always ask.
    return name in MEMORY_ASK_BASE ? { decision: 'ask', reason: MEMORY_ASK_BASE[name] } : null;
  }
}
