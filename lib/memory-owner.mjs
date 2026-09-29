/**
 * Who owns a Hiveku memory entry, and which agents follow it, in the Memory
 * page's own words (memory surfaces audit 2026-09-27: G13, G14 and m14,
 * notes/memory-pages-audit-2026-09-22/memory-surfaces-audit-2026-09-27.md).
 *
 * THE BUILDER DECIDES OWNERSHIP. The one owner rule lives in hiveku_builder
 * (src/lib/olympus/memory-department.ts, resolveOwnerDepartment) and the
 * page's placement rule beside it (src/components/memory/tree/tree-model.ts,
 * placeRow). memory_list returns each entry's `owner` and `placement` (builder
 * PR fix/memory-gaps-whole-team). Nothing the pull FILES is re-derived from a
 * stored row, because a local copy of that rule is exactly how the plugin
 * came to file memory differently from the page (G14). This module only:
 *
 *   - names the folder an owner files under (/hiveku:knowledge, lib/knowledge.mjs);
 *   - places the `_account:*` rows the way the page does: the chief of staff's
 *     own rows under her, Voice and pronunciation under About your business,
 *     and the legacy shapes the page drops left out (tree-model.ts placeAccountRow);
 *   - reads the declaration a caller can SEE before a write (a `department`
 *     the server applies, a canonical `<!-- department: x -->` marker, or front
 *     matter), so the permission hook can say which agent a new rule is for
 *     (lib/tool-safety.mjs);
 *   - predicts, for the hook only, who owns a rule, skill, shortcut or
 *     specialist AFTER a write the builder has not seen yet (typedRowOwner: the
 *     builder's rule for those four kinds, pinned to its canonical cases in
 *     test/fixtures/memory-ownership-cases.json); and
 *   - says, in plain words, which agents follow an owner's entries.
 *
 * Who follows what (Abe's decisions, 2026-09-28, and the builder's follow rule
 * in the same fixture):
 *   - an agent follows the entries it owns plus the shared ones;
 *   - every Marketing topic also follows the entries the Marketing lead owns;
 *   - the Website agent follows its own, the Marketing lead's and the
 *     website-relevant topics' entries (CODER_RULE_OWNERS in hiveku_agent_server
 *     app/services/account_memory_files.py), and SEO's skills (never its rules),
 *     plus the shared ones;
 *   - the chief of staff follows her own `_account:*` entries: a rule, skill,
 *     shortcut or specialist filed under her anywhere else is followed by no
 *     one (the Memory page hides it);
 *   - calls follow only the receptionist's own call rules, so "every agent"
 *     means every agent in chats.
 *
 * The lists mirror hiveku_builder src/lib/olympus/memory-types.ts (the Marketing
 * family and the agents with their own servers), with `analytics` as a
 * Marketing topic (decision 6); memory_list may already return it as an owner.
 * Pure: no network, no disk.
 */

/** Every agent with a row of its own on the Memory page, in the page's order (team-keys.ts). */
export const TEAM_AGENTS = Object.freeze(['orchestrator', 'sales', 'helpdesk', 'marketing', 'production', 'accounting', 'coder', 'comms']);

/** The Marketing team's topics: peers under the Marketing lead, each its own owner key. */
export const MARKETING_TOPICS = Object.freeze([
  'content',
  'seo',
  'social',
  'ppc',
  'outbound',
  'branding',
  'customer_avatar',
  'customer_journey',
  'website_design',
  'knowledge_base',
  'workflow',
  'before_after_grid',
  'email',
  'analytics',
]);

/** Every key an entry can be filed under. */
export const DEPARTMENTS = Object.freeze([...TEAM_AGENTS, ...MARKETING_TOPICS]);

/**
 * The Marketing family: the lead and its topics (hiveku_builder memory-types.ts
 * MARKETING_FAMILY_DEPARTMENTS). A marker naming one of these beats an empty
 * or `marketing` column on a rule, skill, shortcut or specialist (the owner
 * rule's (b), typedRowOwner).
 */
export const MARKETING_FAMILY = Object.freeze(['marketing', ...MARKETING_TOPICS]);

/** The Marketing topics whose entries the Website agent also follows (CODER_RELEVANT_MARKETING). */
export const WEBSITE_RELEVANT_TOPICS = Object.freeze([
  'branding',
  'customer_avatar',
  'customer_journey',
  'knowledge_base',
  'before_after_grid',
  'website_design',
  'content',
]);

/** Each agent's job, as the page says it (memory-categories.ts AGENT_JOBS). */
export const AGENT_NAMES = Object.freeze({
  orchestrator: 'Chief of staff',
  sales: 'Sales',
  helpdesk: 'Support',
  marketing: 'Marketing',
  production: 'Production',
  accounting: 'Accounting',
  coder: 'Website',
  comms: 'Communications',
});

/** The Marketing topics in owner words (memory-categories.ts MARKETING_TOPIC_NAMES). */
export const TOPIC_NAMES = Object.freeze({
  content: 'Content',
  seo: 'SEO',
  social: 'Social',
  ppc: 'Paid ads',
  outbound: 'Outbound',
  branding: 'Branding',
  customer_avatar: 'Ideal customers',
  customer_journey: 'Customer journey',
  website_design: 'Website design',
  knowledge_base: 'Knowledge base',
  workflow: 'Workflow',
  before_after_grid: 'Before and after',
  email: 'Email',
  analytics: 'Analytics',
});

/** The folder for what no agent owns: "Shared with every agent". */
export const SHARED_FOLDER = 'shared';
/** About your business > Voice and pronunciation. */
export const VOICE_FOLDER = 'business/voice';

const TEAM_SET = new Set(TEAM_AGENTS);
const TOPIC_SET = new Set(MARKETING_TOPICS);
const DEPARTMENT_SET = new Set(DEPARTMENTS);
const FAMILY_SET = new Set(MARKETING_FAMILY);
const WEBSITE_TOPIC_SET = new Set(WEBSITE_RELEVANT_TOPICS);
/** The domains of a rule, skill, shortcut or specialist (`_account:_rule:x` is not one). */
const TYPED_DOMAIN_RE = /^_(?:rule|skill|command|agent):/;

/** Trimmed and lowercased, or '' for anything that is not a string. */
export function normalizeKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isDepartment(value) {
  return DEPARTMENT_SET.has(normalizeKey(value));
}

export function isMarketingTopic(value) {
  return TOPIC_SET.has(normalizeKey(value));
}

export function isTeamAgent(value) {
  return TEAM_SET.has(normalizeKey(value));
}

/** True for a `_rule:` / `_skill:` / `_command:` / `_agent:` domain, trimmed and lower-cased. */
export function isTypedDomain(domain) {
  return TYPED_DOMAIN_RE.test(normalizeKey(domain));
}

/**
 * The folder an owner's entries file under: the owner's own key (`sales`,
 * `helpdesk`, `comms`, `production`, `accounting`, `coder`, `orchestrator`,
 * `marketing` for the Marketing lead, and each Marketing topic by its own key:
 * `seo`, `email`, `analytics`, `customer_avatar`, ...), or `shared` for null
 * (no agent owns it). The topics sit beside the lead, not under it: that is the
 * layout the VS Code extension writes into the same account folder
 * (hiveku-vscode src/knowledge.ts departmentOf), and two layouts in one folder
 * make each tool move the other's files on every sync (PR #50 review, F7).
 * Undefined for a key no agent has: the caller decides where that goes.
 */
export function ownerFolder(owner) {
  if (owner === null) return SHARED_FOLDER;
  const key = normalizeKey(owner);
  if (!key) return undefined;
  return DEPARTMENT_SET.has(key) ? key : undefined;
}

/** "Sales", "SEO", "Chief of staff", or null for a key no agent has. */
export function agentName(owner) {
  const key = normalizeKey(owner);
  return AGENT_NAMES[key] ?? TOPIC_NAMES[key] ?? null;
}

/**
 * Which agents follow an entry, in plain words, from the key it is filed
 * under. `null` is shared with every agent; `undefined` (not known) returns
 * null so the caller can say it does not know. `domain`, when known, makes two
 * cases of the builder's follow rule exact: the Website agent also follows
 * SEO's skills (not its rules), and a rule, skill, shortcut or specialist filed
 * under the chief of staff outside her own `_account:*` entries is followed by
 * no one.
 */
export function followersOf(owner, { domain } = {}) {
  if (owner === undefined) return null;
  if (owner === null) return 'every agent, in chats (it is shared with every agent; calls follow only the receptionist\'s own call rules)';
  const key = normalizeKey(owner);
  if (!key) return null;
  const d = normalizeKey(domain);
  if (key === 'marketing') return 'the Marketing team (its lead and every Marketing topic) and the Website agent';
  if (key === 'coder') return 'the Website agent';
  if (key === 'orchestrator') {
    return isTypedDomain(d)
      ? 'no agent (the chief of staff follows only her own entries, and the Memory page hides one filed under her anywhere else)'
      : 'the chief of staff';
  }
  if (TOPIC_SET.has(key)) {
    const topic = `the ${TOPIC_NAMES[key]} topic of the Marketing team`;
    const website = WEBSITE_TOPIC_SET.has(key) || (key === 'seo' && d.startsWith('_skill:'));
    return website ? `${topic} and the Website agent` : topic;
  }
  if (TEAM_SET.has(key)) return `the ${AGENT_NAMES[key]} agent`;
  return `no agent on the Memory page (it is filed under "${key.replace(/[^a-z0-9_-]/g, '').slice(0, 40)}", which is not an agent)`;
}

/**
 * The same, as a short noun for a skill's description: "every agent", "the
 * Sales agent", "the SEO topic of the Marketing team". Null when not known.
 */
export function ownerNoun(owner) {
  if (owner === undefined) return null;
  if (owner === null) return 'every agent';
  const key = normalizeKey(owner);
  if (key === 'marketing') return 'the Marketing team';
  if (key === 'coder') return 'the Website agent';
  if (key === 'orchestrator') return 'the chief of staff';
  if (TOPIC_SET.has(key)) return `the ${TOPIC_NAMES[key]} topic of the Marketing team`;
  if (TEAM_SET.has(key)) return `the ${AGENT_NAMES[key]} agent`;
  return null;
}

/* ── The `_account:*` rows, placed the way the page places them ──────────── */

const ACCOUNT_PREFIX = '_account:';
const VOICE_DOMAINS = new Map([
  ['_account:pronunciations', 'pronunciations'],
  ['_account:voice_settings', 'voice-settings'],
]);

/**
 * The five business topics the chief of staff used to keep in her own notes,
 * now kept in About your business (hiveku_builder src/lib/account-memory/
 * import-draft.ts TEMPLATE_SECTIONS). The page lists them under her as
 * "Moved to About your business".
 */
export const MOVED_TOPICS = Object.freeze([
  '_account:memory:about-this-business',
  '_account:memory:team-and-roles',
  '_account:memory:current-quarter-goals',
  '_account:memory:active-initiatives',
  '_account:memory:user-preferences',
]);
const MOVED_SET = new Set(MOVED_TOPICS);

/** The page's group words (memory-categories.ts MEMORY_WORDS). */
const GROUP_WORDS = Object.freeze({
  'how-it-works': 'How it works',
  background: 'Background',
  rules: 'Rules',
  skills: 'Skills',
  notes: 'Notes',
  moved: 'Moved to About your business',
  voice: 'Voice and pronunciation',
});

/** Which local type folder a page group lands in, and the kind of entry it holds. */
const GROUP_KIND = Object.freeze({
  'how-it-works': ['identity', 'identity'],
  background: ['identity', 'identity'],
  rules: ['rules', 'rule'],
  skills: ['skills', 'skill'],
  notes: ['memory', 'memory'],
  moved: ['memory', 'memory'],
  voice: ['memory', 'memory'],
});

export function isAccountRowDomain(domain) {
  return typeof domain === 'string' && domain.trim().toLowerCase().startsWith(ACCOUNT_PREFIX);
}

function orchestratorPlace(group, stem) {
  const [typeFolder, type] = GROUP_KIND[group];
  return { owner: 'orchestrator', folder: 'orchestrator', group, typeFolder, type, stem, label: `${AGENT_NAMES.orchestrator} > ${GROUP_WORDS[group]}` };
}

/**
 * Where the page puts one `_account:*` row, or null when the page leaves it
 * out (a legacy `_account:_agent:*` row, or any shape the chief of staff's
 * route never returns). The same order as tree-model.ts placeAccountRow:
 *   _account:pronunciations, _account:voice_settings  About your business > Voice and pronunciation
 *   _account:soul                                     Chief of staff > How it works
 *   _account:claude                                   Chief of staff > Background
 *   _account:_skill:<slug>                            Chief of staff > Skills
 *   _account:_rule:<slug>                             Chief of staff > Rules
 *   _account:memory:<topic>                           Chief of staff > Notes (the five
 *                                                     moved topics: Moved to About your business)
 * `stem` is the file name the local copy gets; `type` is the kind of entry.
 * `group` is the page's group key: pass the builder's own placement group to
 * `accountRowPlaceFromGroup` when memory_list returned one.
 */
export function accountRowPlace(domain) {
  if (!isAccountRowDomain(domain)) return null;
  const d = domain.trim().toLowerCase();
  if (VOICE_DOMAINS.has(d)) {
    return {
      owner: undefined,
      folder: VOICE_FOLDER,
      group: 'voice',
      typeFolder: 'memory',
      type: 'memory',
      stem: VOICE_DOMAINS.get(d),
      label: `About your business > ${GROUP_WORDS.voice}`,
    };
  }
  if (d === '_account:soul') return orchestratorPlace('how-it-works', 'how-it-works');
  if (d === '_account:claude') return orchestratorPlace('background', 'background');
  const after = (prefix) => (d.startsWith(prefix) ? d.slice(prefix.length).trim() : '');
  if (after('_account:_skill:')) return orchestratorPlace('skills', after('_account:_skill:'));
  if (after('_account:_rule:')) return orchestratorPlace('rules', after('_account:_rule:'));
  if (after('_account:memory:')) return orchestratorPlace(MOVED_SET.has(d) ? 'moved' : 'notes', after('_account:memory:'));
  return null;
}

/**
 * The same place, when memory_list said where the page shows the row
 * (`placement`): a row the page hides is left out, and the builder's group
 * wins over the local one. A placement this module cannot read changes
 * nothing: the local rule above decides.
 */
export function accountRowPlaceFromBuilder(domain, placement) {
  const local = accountRowPlace(domain);
  if (!local || !placement || typeof placement !== 'object') return local;
  if (placement.where === 'hidden') return null;
  const group = placement.group;
  if (placement.where === 'agent' && placement.agent === 'orchestrator' && group !== 'voice' && Object.hasOwn(GROUP_KIND, group)) {
    const place = orchestratorPlace(group, local.stem);
    return typeof placement.label === 'string' ? { ...place, label: placement.label } : place;
  }
  return local;
}

/* ── What a caller can see before a write ───────────────────────────────── */

/**
 * The marker, as the builder reads it (memory-department.ts DEPARTMENT_MARKER_RE):
 * the FIRST `<!-- department: x -->` anywhere in the text. A later one never counts.
 */
const MARKER_RE = /<!--\s*department:\s*([A-Za-z0-9_]+)\s*-->/i;
/** ASCII whitespace, as the builder reads it around a leading marker (agent-identity.ts MARKER_SPACE). */
const MARKER_SPACE = '[ \\t\\n\\r\\f\\v]*';
/** The ONE leading marker line the builder skips before front matter (LEADING_DEPARTMENT_MARKER). */
const LEADING_MARKER_LINE_RE = new RegExp(
  `^${MARKER_SPACE}<!--${MARKER_SPACE}department:${MARKER_SPACE}[A-Za-z0-9_]+${MARKER_SPACE}-->${MARKER_SPACE}\\n`,
  'i',
);
/** Front matter at the very top (agent-identity.ts splitIdentity): no byte-order mark, no CR LF. */
const FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
/** Its `department:` field, quoted or not (agent-identity.ts readField). */
const FRONT_MATTER_DEPARTMENT_RE = /^department:\s*"((?:[^"\\\n]|\\.)*)"|^department:\s*(\S.*)$/im;

/** The first marker's word, trimmed and lower-cased, whatever it names; null without one. */
export function firstMarker(content) {
  return typeof content === 'string' ? normalizeKey(content.match(MARKER_RE)?.[1]) || null : null;
}

/** A double-quoted value as the builder decodes it (agent-identity.ts decodeQuoted). */
function decodeQuoted(inner) {
  try {
    const decoded = JSON.parse(`"${inner}"`);
    return typeof decoded === 'string' ? decoded : inner;
  } catch {
    return inner;
  }
}

/**
 * The department the front matter declares, read the way the builder reads it
 * (parseIdentity: skip one leading marker line, then the text must open with
 * `---\n`), when it names a department; null otherwise.
 */
export function frontMatterDepartment(content) {
  if (typeof content !== 'string' || !content) return null;
  const header = content.replace(LEADING_MARKER_LINE_RE, '').match(FRONT_MATTER_RE)?.[1];
  if (header === undefined) return null;
  const field = header.match(FRONT_MATTER_DEPARTMENT_RE);
  if (!field) return null;
  const value = normalizeKey(field[1] !== undefined ? decodeQuoted(field[1]) : field[2]);
  return DEPARTMENT_SET.has(value) ? value : null;
}

/**
 * The department a text declares, the way the builder reads it
 * (departmentTagFromContent): the first `<!-- department: x -->` marker when it
 * names a department, else the front matter's `department:` when it names one.
 * A word that is no department is not a declaration. Null for none.
 */
export function declaredDepartment(content) {
  if (typeof content !== 'string' || !content) return null;
  const marker = firstMarker(content);
  if (marker && DEPARTMENT_SET.has(marker)) return marker;
  return frontMatterDepartment(content);
}

/**
 * Who owns a rule, skill, shortcut or specialist, by THE ONE OWNER RULE
 * (hiveku_builder memory-department.ts resolveRowDepartment, memory surfaces
 * audit G9), from its stored `department` column and its text:
 *   (a) the column, when it is set and is not `marketing` (as written, even a
 *       word that is no department);
 *   (b) with no column or `marketing`, the first marker when it names the
 *       Marketing family: that topic (the seeded starter rows);
 *   (c) column `marketing` otherwise: the Marketing lead;
 *   (d) no column: the marker when it names any department, else the front
 *       matter's, else null (shared with every agent).
 * The hook uses it to say who follows an entry AFTER a write the builder has
 * not seen yet (a memory_update keeps the column and replaces the text). What
 * the pull files comes from the builder's own `owner`, never from here.
 */
export function typedRowOwner({ column, content } = {}) {
  const col = normalizeKey(column) || null;
  const marker = firstMarker(content);
  if ((col === null || col === 'marketing') && marker && FAMILY_SET.has(marker)) return marker;
  if (col !== null) return col;
  if (marker && DEPARTMENT_SET.has(marker)) return marker;
  return frontMatterDepartment(content);
}

/** The typed kinds that are shared with every agent when they name no department. */
const TYPED_KINDS = Object.freeze({ rule: 'rule', skill: 'skill', command: 'shortcut', agent: 'specialist' });
const TYPED_PREFIXES = Object.freeze([
  ['_rule:', 'rule'],
  ['_skill:', 'skill'],
  ['_command:', 'command'],
  ['_agent:', 'agent'],
]);

/**
 * The kind of a new entry as memory_create (or one memory_bulk_create entry)
 * describes it: its `domain` prefix, else its `type`. Returns the page's word
 * for the typed kinds (rule, skill, shortcut, specialist) and null for notes,
 * profiles and anything unreadable.
 */
export function typedKindOf(input) {
  if (!input || typeof input !== 'object') return null;
  const domain = normalizeKey(input.domain);
  if (domain) {
    const hit = TYPED_PREFIXES.find(([prefix]) => domain.startsWith(prefix));
    return hit ? TYPED_KINDS[hit[1]] : null;
  }
  return TYPED_KINDS[normalizeKey(input.type)] ?? null;
}

/**
 * Who a NEW entry will belong to, from what the call carries:
 *   { owner: '<key>' }   a website's own entry (project_id: always the Website
 *                        agent); a rule, skill, shortcut or specialist whose
 *                        `department` (when the server applies it) and text
 *                        give it an owner by typedRowOwner; or a note or
 *                        profile with a `department` or a declaration;
 *   { owner: null }      shared with every agent: `department: "shared"`, or a
 *                        rule, skill, shortcut or specialist that names none;
 *   { owner: undefined } a note or a profile that names no department (it
 *                        belongs to the agent its name says).
 * `departmentArg` says whether the tool's `department` argument reaches the
 * builder. The builder stores it as the column when it names a department
 * (memory/route.ts and memory/bulk/route.ts), and memory_bulk_create's entries
 * carry it there today. memory_create's does not until hiveku-mcp-api-server PR
 * #63 is live: the proxy drops an argument the tool does not declare, so the
 * rule would be shared with every agent (PR #50 review, F3). "shared" names the
 * same outcome either way, so it always counts.
 * `named` says whether the call itself decides the owner (as opposed to
 * leaving it out, which makes a rule, skill, shortcut or specialist shared).
 */
export function newEntryOwner(input, { departmentArg = true } = {}) {
  if (!input || typeof input !== 'object') return { owner: undefined, named: false };
  if (typeof input.project_id === 'string' && input.project_id.trim()) return { owner: 'coder', named: true };
  const department = normalizeKey(input.department);
  if (department === 'shared') return { owner: null, named: true };
  // The column the builder will store: a department it is sent, else none (a
  // typed domain has no shape of its own, memory-types.ts deriveDepartmentFromDomain).
  const column = departmentArg && DEPARTMENT_SET.has(department) ? department : null;
  if (typedKindOf(input)) {
    const owner = typedRowOwner({ column, content: input.content });
    return { owner, named: owner !== null };
  }
  if (column) return { owner: column, named: true };
  const declared = declaredDepartment(input.content);
  if (declared) return { owner: declared, named: true };
  return { owner: undefined, named: false };
}
