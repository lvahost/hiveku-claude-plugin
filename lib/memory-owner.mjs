/**
 * Who owns a Hiveku memory entry, and which agents follow it, in the Memory
 * page's own words (memory surfaces audit 2026-09-27: G13, G14 and m14,
 * notes/memory-pages-audit-2026-09-22/memory-surfaces-audit-2026-09-27.md).
 *
 * THE BUILDER DECIDES OWNERSHIP. The one owner rule lives in hiveku_builder
 * (src/lib/olympus/memory-department.ts, resolveOwnerDepartment) and the
 * page's placement rule beside it (src/components/memory/tree/tree-model.ts,
 * placeRow). memory_list returns each entry's `owner` and `placement` (builder
 * PR fix/memory-gaps-whole-team). Nothing here re-derives an owner from a
 * stored row, because a local copy of that rule is exactly how the plugin
 * came to file memory differently from the page (G14). This module only:
 *
 *   - names the folder an owner files under (/hiveku:knowledge, lib/knowledge.mjs);
 *   - places the `_account:*` rows the way the page does: the chief of staff's
 *     own rows under her, Voice and pronunciation under About your business,
 *     and the legacy shapes the page drops left out (tree-model.ts placeAccountRow);
 *   - reads the declaration a caller can SEE before a write (a `department`
 *     argument, a canonical `<!-- department: x -->` marker, or front matter),
 *     so the permission hook can say which agent a new rule is for
 *     (lib/tool-safety.mjs); and
 *   - says, in plain words, which agents follow an owner's entries.
 *
 * Who follows what (Abe's decisions, 2026-09-28):
 *   - an agent follows the entries it owns plus the shared ones;
 *   - every Marketing topic also follows the entries the Marketing lead owns;
 *   - the Website agent follows its own, the Marketing lead's and the
 *     website-relevant topics' entries (CODER_RULE_OWNERS in hiveku_agent_server
 *     app/services/account_memory_files.py), plus the shared ones;
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
const WEBSITE_TOPIC_SET = new Set(WEBSITE_RELEVANT_TOPICS);

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

/**
 * The folder an owner's entries file under: `sales`, `helpdesk`, `comms`,
 * `production`, `accounting`, `coder`, `orchestrator`, `marketing` (the
 * Marketing lead), `marketing/<topic>`, or `shared` for null (no agent owns
 * it). Undefined for a key no agent has: the caller decides where that goes.
 */
export function ownerFolder(owner) {
  if (owner === null) return SHARED_FOLDER;
  const key = normalizeKey(owner);
  if (!key) return undefined;
  if (TOPIC_SET.has(key)) return `marketing/${key}`;
  if (TEAM_SET.has(key)) return key;
  return undefined;
}

/** "Sales", "SEO", "Chief of staff", or null for a key no agent has. */
export function agentName(owner) {
  const key = normalizeKey(owner);
  return AGENT_NAMES[key] ?? TOPIC_NAMES[key] ?? null;
}

/**
 * Which agents follow an entry, in plain words, from the key it is filed
 * under. `null` is shared with every agent; `undefined` (not known) returns
 * null so the caller can say it does not know.
 */
export function followersOf(owner) {
  if (owner === undefined) return null;
  if (owner === null) return 'every agent, in chats (it is shared with every agent; calls follow only the receptionist\'s own call rules)';
  const key = normalizeKey(owner);
  if (!key) return null;
  if (key === 'marketing') return 'the Marketing team (its lead and every Marketing topic) and the Website agent';
  if (key === 'coder') return 'the Website agent';
  if (key === 'orchestrator') return 'the chief of staff';
  if (TOPIC_SET.has(key)) {
    const topic = `the ${TOPIC_NAMES[key]} topic of the Marketing team`;
    return WEBSITE_TOPIC_SET.has(key) ? `${topic} and the Website agent` : topic;
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

const MARKER_RE = /<!--\s*department:\s*([A-Za-z0-9_]+)\s*-->/i;
const LEADING_MARKER_RE = /^[\s﻿]*<!--\s*department:\s*[A-Za-z0-9_]+\s*-->[ \t]*\r?\n/i;
const FRONT_MATTER_DEPARTMENT_RE = /^department:\s*["']?([A-Za-z0-9_]+)["']?\s*$/im;

/**
 * The department a text declares, the way the builder reads it
 * (departmentTagFromContent): a canonical `<!-- department: x -->` marker
 * anywhere, else a canonical `department:` line in the front matter at the
 * top. A token that is no department is not a declaration. Null for none.
 */
export function declaredDepartment(content) {
  if (typeof content !== 'string' || !content) return null;
  const marker = normalizeKey(content.match(MARKER_RE)?.[1]);
  if (DEPARTMENT_SET.has(marker)) return marker;
  const text = content.replace(LEADING_MARKER_RE, '').replace(/^[\s﻿]+/, '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const declared = normalizeKey(text.slice(3, end).match(FRONT_MATTER_DEPARTMENT_RE)?.[1]);
  return DEPARTMENT_SET.has(declared) ? declared : null;
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
 *   { owner: '<key>' }   a `department` argument that is an agent, a website's
 *                        own entry (project_id: always the Website agent), or a
 *                        declaration in the text (see declaredDepartment);
 *   { owner: null }      shared with every agent: `department: "shared"`, or a
 *                        rule, skill, shortcut or specialist that names none;
 *   { owner: undefined } a note or a profile (it belongs to the agent its name
 *                        says), or a `department` value no agent has (the MCP
 *                        server refuses it before anything is written).
 * `named` says whether the call named the owner itself (an argument, a
 * website, or a declaration in the text), as opposed to leaving it out.
 */
export function newEntryOwner(input) {
  if (!input || typeof input !== 'object') return { owner: undefined, named: false };
  if (typeof input.project_id === 'string' && input.project_id.trim()) return { owner: 'coder', named: true };
  const department = normalizeKey(input.department);
  if (department === 'shared') return { owner: null, named: true };
  if (DEPARTMENT_SET.has(department)) return { owner: department, named: true };
  if (department) return { owner: undefined, named: true };
  const declared = declaredDepartment(input.content);
  if (declared) return { owner: declared, named: true };
  if (typedKindOf(input)) return { owner: null, named: false };
  return { owner: undefined, named: false };
}
