/**
 * Which Hiveku tools this plugin will pre-approve, and which it will not vouch
 * for.
 *
 * ★ Scope, stated once so no comment below has to imply more than it delivers:
 * this file feeds a PreToolUse hook, which can ADD an allow, force an `ask`, or
 * say nothing. Saying nothing is NOT neutral: under the permissions shape
 * INSTALL.md hands out (`allow: ["mcp__plugin_hiveku_hk__*"]`) silence resolves
 * to the blanket allow and the call runs unattended.
 *
 * That is why two sets now return a real `ask` on a DIRECT call rather than
 * declining quietly: metered vendor reads (they bill the account) and
 * NEVER_AUTO_APPROVE (a hazardous response, or code execution). Until
 * 2026-09-11 both fell through to null and therefore ran unprompted — the
 * classification refused to vouch for them and nothing acted on the refusal.
 * A third set joined them on 2026-09-24: ALWAYS_ASK_WRITES, the memory writes
 * that replace, delete, restore or bulk-write what department agents read, and
 * the two form-capture writes (which forms a site records, and the erase). The
 * lead-email change (who gets a site's lead emails) joined it on 2026-10-15.
 * A fourth joined on 2026-09-25 (versions, Wave 2): the two version tools,
 * judged on one argument each in lib/vcs-tool-rules.mjs. project_vcs_commit
 * with no files and a project_vcs_rollback dry run are ALLOWED; a save with
 * files and a rollback apply ASK. Settings ask rules still apply over the
 * allow (see that module's header). The conflict resolve joined that module
 * on 2026-10-08 (release 0.27.16): it has no dry run, so every call asks.
 *
 * ARG_GATED_READS still goes silent when its predicate fails: the tool is a
 * legitimate read and only a specific argument form is hazardous, so it is left
 * to the user's own settings rather than prompted on every call.
 *
 * On 2026-09-26 (release 0.26.30) the always-ask set gained a second map,
 * LIVE_CHANGE_WRITES: the writes that release put on the INSTALL.md ask list
 * (paid-ads settings, experiments, conversion uploads, the budget guardrail,
 * the staged-deploy approval, GA4 conversion settings). Release 0.26.36 added
 * the paid-ads calls that switch ads on or restart them, and the two workflow
 * calls that switch a workflow on or clear its pause. It is checked in the
 * same branch and asks with the same prompt, so it counts with
 * ALWAYS_ASK_WRITES as one of the three direct-call sets below.
 *
 * The places this file genuinely withholds: the `hiveku_batch` branch (`ask`),
 * `.hiveku/guardrails.json` (`deny`/`ask`), the three direct-call sets above,
 * and the version tools' `ask` answers.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Every Hiveku tool call in auto mode needs a fresh permission decision, and
 * that decision costs a round trip to a classifier model. When that classifier
 * is slow, or the provider behind it hiccups, the call fails with
 *
 *     "<model> is temporarily unavailable, so auto mode cannot determine the
 *      safety of mcp__plugin_hiveku_hk__<tool> right now."
 *
 * and the tool never runs. A staff member sweeping a couple of hundred
 * read-only tools hits that wall repeatedly, and the only fixes on offer were
 * per-machine: hand-edit a settings file, or paste a flag. Neither scales to
 * 400+ accounts, and neither is something a non-technical person should do.
 *
 * A PreToolUse hook ships INSIDE the plugin, so it applies to everyone who
 * installs it, with nothing to configure.
 *
 * ── The source of truth is the SERVER, not the name ───────────────────────
 * `lib/readonly-tools.json` is generated from the MCP server's own route
 * mappings: every entry has `mapping.method === 'GET'`, which is the server
 * stating that the tool reads and does not write.
 *
 * ★ This replaced a naming heuristic, and the replacement was not cosmetic.
 * Audited against all 1531 live tools, the naming rule auto-approved
 * `voice_voicemail_mark_read` — it ends in "read", carries no write verb, and
 * plainly mutates. A rule that infers intent from a name cannot be trusted
 * from inspection; the server's own method can.
 *
 * ── Defence in depth ──────────────────────────────────────────────────────
 * The generated list is the gate. WRITE_VERBS is a second, independent gate
 * applied on top, so a tool would have to be BOTH declared GET by the server
 * AND free of any write verb in its name. It exists to catch a mis-generated
 * list, and it can only ever shrink the auto-approved set.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
// The version tools' argument rules (a promote is allowed, a save with files
// and a rollback apply ask). Their logic and tests live in that module.
import { argGatedWriteDecision } from './vcs-tool-rules.mjs';
// The memory writes' reasons name the agent that follows what changes, and a
// rule, skill, shortcut or specialist created for no agent asks (memory
// surfaces audit m14). Their logic and tests live in that module.
import { memoryWriteDecision, MEMORY_ASK_BASE } from './memory-tool-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Generated. See scripts/gen-readonly-tools.mjs. */
function loadReadOnly() {
  try {
    const raw = fs.readFileSync(path.join(HERE, 'readonly-tools.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed?.tools) ? parsed.tools : []);
  } catch {
    // A missing or corrupt list means we approve NOTHING and every tool goes
    // through the normal flow. Degraded, never unsafe.
    return new Set();
  }
}

const READ_ONLY = loadReadOnly();

/**
 * The DataForSEO vendor tools, classified in data/vendor-tool-classification.json.
 *
 * ── Why these need a THIRD category rather than joining READ_ONLY ───────────
 * They are declared POST (DataForSEO carries its query in a request body), so
 * gen-readonly-tools.mjs — which derives the allowlist from the server's own
 * HTTP method — never listed them. The reported consequence was that ~65 pure
 * reads prompted as if they mutated something.
 *
 * But the obvious fix, adding them to READ_ONLY, would have been worse than the
 * bug. `isReadOnlyTool` is what scripts/sweep-tools.mjs calls to decide what to
 * sweep, and the sweep invokes every tool it is given with `arguments: {}`.
 * Several vendor tools have NO required parameter — domain_analytics_whois_overview
 * is entirely optional — so `{}` is a valid, billable call. Every sweep would
 * quietly spend DataForSEO credits, which is a larger version of the very
 * defect (a paid call that returns nothing useful) this work set out to fix.
 *
 * So the question is split in two, because it is two questions:
 *   - does it WRITE?         no, for all 65. None posts a task; all are /live
 *                            or /available_filters.
 *   - does it COST MONEY?    yes, for 57 of them.
 * READ_ONLY answers the first. VENDOR_METERED answers the second.
 */
function loadVendorClassification() {
  try {
    const raw = fs.readFileSync(path.join(HERE, '..', 'data', 'vendor-tool-classification.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const arr = (v) => (Array.isArray(v) ? v : []);
    // ★ WHICH KEYS MEAN WHAT COMES FROM THE FILE, not from this function.
    // Naming the arrays here fitted this loader to the keys that existed the day
    // it was written: when Firecrawl arrived under firecrawlMeteredReads, every
    // guard reading a fixed key list silently stopped covering it. `_lists` is
    // the file stating its own schema, so a new vendor is one edit in one place.
    const lists = parsed?._lists ?? {};
    const gather = (keys) => arr(keys).flatMap((k) => arr(parsed?.[k]));
    return {
      free: new Set(gather(lists.free)),
      metered: new Set(gather(lists.metered)),
    };
  } catch {
    // Same posture as loadReadOnly: a missing or corrupt file classifies
    // nothing. Degraded, never unsafe.
    return { free: new Set(), metered: new Set() };
  }
}

const { free: VENDOR_FREE, metered: VENDOR_METERED } = loadVendorClassification();

/**
 * Read-only tools the server defines without an HTTP mapping, so the generator
 * cannot see a method for them. Added ONE AT A TIME, each verified by reading
 * the tool's implementation — never by pattern.
 *
 *   list_departments — returns the static department roster. The only other
 *     unmapped tool, `talk_to_department`, is deliberately NOT here: it runs a
 *     department agent, which has side effects.
 */
const EXTRA_READ_ONLY = new Set([
  'list_departments',
  // Local tools have no mapping, so gen-readonly-tools.mjs - which derives the
  // list from the server's declared HTTP methods - cannot see them at all.
  // hiveku_tool_schema is a pure in-memory registry read that returns nothing a
  // tools/list does not already carry, and prompting for it would tax the one
  // call an agent makes precisely to avoid guessing.
  //
  // hiveku_batch is deliberately NOT here: it can carry writes, and each member
  // is gated on its own server-side.
  'hiveku_tool_schema',
  // hiveku_find_tools is answered locally out of lib/tool-index.json; its only
  // outbound call is a tools/list forward (usually served from the session
  // cache) used to intersect matches with what this key can actually see. It
  // reads and promotes; it writes nothing.
  //
  // Leaving it off had two costs. A reads-only folder DENIED it with the
  // reason "hiveku_find_tools writes" — telling the model a local index lookup
  // is a write. And in index mode this is the ONLY route to the ~2,000-tool
  // surface, so a reads-only ceiling (or a guardrails.json with a typo, which
  // fails closed to reads-only) left the session with the core tools and no way
  // to discover anything else — the opposite of the intended "a read-shaped
  // play degrades to a proposal" behaviour.
  'hiveku_find_tools',
]);

/**
 * A backstop over the generated list, never the primary gate.
 *
 * ★ DELIBERATELY NARROW, and it was narrowed by measurement. A broad verb list
 * -- the obvious first attempt -- rejected 35 tools the server itself declares
 * GET, because this naming scheme uses those words as NOUNS:
 *
 *     accounting_payroll_run_get    a payroll RUN, fetched
 *     workflow_run_status           the status of a RUN
 *     deploy_history                the history of DEPLOYS
 *     social_get_post               get a POST
 *     crm_email_send_queue_list     list the SEND QUEUE
 *
 * Rejecting those costs real tools and buys nothing: the server already said
 * GET. So this list holds only words that are never nouns in a Hiveku tool
 * name and always mean destruction. If one of these ever appears on a
 * server-declared GET, that is a bug in the mapping worth failing loudly over,
 * which is what the cross-check test asserts.
 */
const WRITE_VERBS = /(^|_)(delete|destroy|purge|wipe|revoke|refund|uninstall|truncate|drop)(_|$)/;

/** The MCP tool-name prefix this plugin's server publishes. */
export const HIVEKU_TOOL_PREFIX = 'mcp__plugin_hiveku_hk__';

/**
 * Strip the MCP wrapper to get the bare Hiveku tool name.
 * Returns null for anything that is not one of this plugin's tools -- the hook
 * must never express an opinion about another server's tools.
 */
export function hivekuToolName(toolName) {
  if (typeof toolName !== 'string') return null;
  if (!toolName.startsWith(HIVEKU_TOOL_PREFIX)) return null;
  const bare = toolName.slice(HIVEKU_TOOL_PREFIX.length);
  return bare.length ? bare : null;
}

/**
 * Is this bare Hiveku tool name safe to auto-approve AND safe to sweep?
 *
 * ★ THIS PREDICATE GATES THE SWEEP, so a name here may be called unattended
 * with no arguments. Metered vendor tools are deliberately NOT included; ask
 * `isMeteredVendorRead` for those.
 */
export function isReadOnlyTool(bare) {
  if (typeof bare !== 'string' || !bare) return false;
  const name = bare.toLowerCase();
  if (!READ_ONLY.has(name) && !EXTRA_READ_ONLY.has(name) && !VENDOR_FREE.has(name)) return false;
  if (WRITE_VERBS.test(name)) return false;
  return true;
}

/**
 * Does this tool read a third-party API and BILL THE ACCOUNT for it?
 *
 * True means: it cannot write anything, so a reads-only ceiling must not deny
 * it — and it costs money, so it must never be swept and must not be
 * pre-approved. The existing precedent in this plugin is that metered
 * DataForSEO calls prompt (data/permission-critical-tools.json gates
 * seo_listings_scan for exactly this reason), and this keeps that consistent.
 */
export function isMeteredVendorRead(bare) {
  if (typeof bare !== 'string' || !bare) return false;
  return VENDOR_METERED.has(bare.toLowerCase());
}

/** Reads that cannot write, whether or not they cost money. */
export function isNonMutatingTool(bare) {
  // ★ NEVER_AUTO_APPROVE names belong here too. They are server-declared reads
  // whose RESPONSE is the hazard (an unrevocable recording link, a plaintext
  // credential), deliberately kept off the generated read list so nothing
  // pre-approves them. But "may not run unattended" is not "writes": leaving
  // them out made the reads-only ceiling refuse voice_recording_url_get with
  // the reason "voice_recording_url_get writes" — telling the operator a GET is
  // a write, and refusing a read under a ceiling whose whole promise is that
  // reads still work. They are read-shaped here and caught instead by the
  // response-hazard ask in decideWithGuardrails, which is the honest answer.
  return isReadOnlyTool(bare) || isMeteredVendorRead(bare) || NEVER_AUTO_APPROVE.has(String(bare).toLowerCase());
}

/** How many tools the generated list covers. Used by the drift test. */
export function readOnlyCount() {
  return READ_ONLY.size;
}

/**
 * Server-declared GETs this plugin declines to PRE-APPROVE, because what the
 * READ RETURNS is itself the hazard.
 *
 * ★ READ THIS BEFORE ADDING A NAME: THIS LIST DOES NOT GATE ANYTHING.
 * A PreToolUse hook can only ever ADD an allow to a call the permission system
 * was going to decide anyway; it cannot take back an allow the user's own
 * settings already grant. A name here makes `isAutoApprovable` return false,
 * which makes `decideForPayload` return null, and null means "no opinion" — the
 * call then falls through to the normal permission flow. Under the install
 * shape INSTALL.md documents (`allow: ["mcp__plugin_hiveku_hk__*"]` plus a
 * literal `ask` list), that flow is the blanket allow, so a direct call to a
 * name on this list runs with NO PROMPT, exactly as if the list were empty.
 * What this list actually buys is narrower and worth having anyway: in auto
 * mode, and on any machine without a blanket allow, the plugin declines to
 * hand out its own free pass, so the call goes to the classifier or the user
 * instead of being waved through by us.
 *
 * ★ WHAT DOES GATE: the `ask` list in INSTALL.md (exact names — partial
 * wildcards in an `ask` rule are skipped, so a half-name looks like protection
 * and is not), and a folder's `.hiveku/guardrails.json`, which is the one path
 * in this file that emits a real `deny`/`ask`. A GET cannot go on the ask list
 * (data/permission-critical-tools.json is asserted GET-free, because an ask
 * rule on a read stalls every sweep that touches it), so for a hazardous READ
 * the honest answer today is guardrails or a read-only key — NOT this list.
 * Adding a name here in the belief that it stops the call is the mistake this
 * paragraph exists to prevent.
 *
 * ★ The one place these names DO stop a call is inside `hiveku_batch`: that
 * branch of `decideForPayload` never returns null, so a vetoed member turns the
 * whole batch into an `ask`. A hook `ask` DOES override a settings allow. The
 * asymmetry is real — the same tool is prompted when batched and silent when
 * called directly — and it is a consequence of null-means-silence, not a
 * design anyone chose.
 *
 * The entries, each with the incident that earned it:
 *
 *   voice_recording_url_get — GET, but the response is an UNAUTHENTICATED,
 *     non-revocable presigned URL to a call recording. Fetching it is
 *     distribution: the link lands in a transcript, a log, a pasted report,
 *     and there is no way to take it back (2026-08-29 voice audit).
 *   voice_tts_preview — POST at the route (spends Cartesia money unless
 *     cached, returns a 5-minute unauthenticated audio URL). It should never
 *     appear in a GET-derived list at all; this entry is defence in depth so
 *     that a mis-generated list still cannot auto-approve it.
 *   design_render_job_get — a GET whose own registered description says the
 *     call "does not just read the row, it ADVANCES it": the handler runs the
 *     same pollAndAdvance as the reconcile cron, so a "poll" finishes a paid
 *     render and registers the asset in the media library. The generator now
 *     excludes it from readonly-tools.json (SENSITIVE_READ_EXCLUSIONS,
 *     2026-09-01); this entry is defence in depth so a regenerated list that
 *     lost the exclusion still cannot auto-approve a write dressed as a read.
 *   marketing_form_attachment_download_url — POST, and the response is a
 *     short-lived signed URL to a document a site visitor uploaded through a
 *     form (a resume, an ID scan, a medical intake). Same class as
 *     voice_recording_url_get: minting the link is distribution, the link
 *     lands in a transcript or a pasted report, and it cannot be revoked
 *     before it expires. Every mint must be an explicit operator ask, never a
 *     sweep (2026-09-03 form attachments program).
 *
 * Names here are exact bare names, lowercase, added one at a time with the
 * incident that earned the entry.
 *
 * ★ SINCE 2026-09-11 THIS SET IS A REAL GATE ON A DIRECT CALL, not merely a
 * withheld pre-approval. It returns `ask` with a per-name reason (VETO_REASONS)
 * instead of null, because null resolved to the blanket allow and these ran
 * unattended — which is the one outcome every entry here was added to prevent.
 */
export const NEVER_AUTO_APPROVE = new Set([
  'voice_recording_url_get',
  'voice_tts_preview',
  'design_render_job_get',
  'marketing_form_attachment_download_url',
  // 2026-09-03: a GET that can register a media_assets pointer row for the hero image.
  'social_repurpose_source',
  // 2026-09-08: Firecrawl-backed. execute_js runs ARBITRARY JAVASCRIPT in a
  // browser against a third-party page before scraping it. It sits in the same
  // served group as md/html/screenshot and shares their method:null, so the
  // next person to classify that group by shape will sweep it in with the
  // reads. It is not a read, and the vendor proxy records no usage, so a
  // mistake here is both unattended code execution and invisible spend.
  'execute_js',
  // 0.27.24: the reveal (builder #993, MCP #188) answers with a site's plaintext values. A
  // person also approves it in the dashboard, but the client asks first every time.
  'project_secrets_reveal',
  // 2026-10-19 (Email Service program): a sent email's whole content. An app's
  // password-reset, sign-in and invite emails hold live links. The builder also
  // requires the "Open sent emails" permission and audits every open.
  'email_message_get',
  // 2026-10-28 (the desktop app's help desk; builder #1869, MCP #319). Two GETs
  // whose answer is the hazard. helpdesk_ticket_attachment_links hands out
  // download links that work for 15 minutes, to files customers and website
  // visitors uploaded; anyone holding one can fetch the file, and it cannot be
  // revoked early. helpdesk_contact_data_export answers with one person's
  // whole website chat history, for an access request; the builder also asks
  // an account owner or admin for it and audits each export.
  'helpdesk_ticket_attachment_links',
  'helpdesk_contact_data_export',
  // 2026-10-30 (the desktop app's contact record, CRM parity R28; builder and MCP
  // branches fix/crm-record-b1-contact). A GET whose answer is an hour-long link
  // to a call recording a person attached to a logged call: anyone holding it
  // can play the call, and it cannot be revoked early. The default sentence
  // (an unrevocable link) is true of it.
  'crm_activity_recording_link',
]);

/**
 * Why a particular NEVER_AUTO_APPROVE name is vetoed, when the default sentence
 * would be wrong about it.
 *
 * ★ THE DEFAULT SENTENCE IS A CLAIM, AND IT CAN BE FALSE. The ceiling prompt
 * says the tool "reads, but its RESPONSE is the hazard (an unrevocable link, a
 * plaintext credential, or a row it advances)". True of
 * voice_recording_url_get, which is what it was written for. Flatly untrue of
 * execute_js, whose hazard is that it EXECUTES ARBITRARY JAVASCRIPT — an
 * operator told the danger is in the response would weigh the wrong risk and
 * approve on that basis.
 *
 * Kept as a separate map rather than turning NEVER_AUTO_APPROVE into a Map:
 * that set is iterated with `for...of` and spread in three test files, all of
 * which expect bare names.
 */
export const VETO_REASONS = {
  execute_js:
    'runs ARBITRARY JAVASCRIPT in a browser against a third-party page before scraping it, '
    + 'billed by Firecrawl with no usage recorded anywhere',
  email_message_get:
    'returns the full content of a sent email, which can include live sign-in, password-reset '
    + 'and invite links that work for whoever reads them',
  // The default sentence (an unrevocable link, a plaintext credential, or a row it advances) is
  // true of helpdesk_ticket_attachment_links, so only the export gets its own.
  helpdesk_contact_data_export:
    'returns one person\'s whole website chat history, for an access request: their messages, '
    + 'what they typed about themselves and the pages they visited',
};

/**
 * Memory writes that ALWAYS ASK on a direct call, whatever the user's settings
 * say. Bare name -> the plain-language reason the prompt shows.
 *
 * ★ WHY THE HOOK AND NOT ONLY THE INSTALL.md ASK LIST (memory-surface gaps G2
 * and G4, 2026-09-24). Under the install shape INSTALL.md hands out
 * (`allow: ["mcp__plugin_hiveku_hk__*"]`), a write this file says nothing about
 * runs unprompted. memory_update REPLACES a department's whole memory document
 * and memory_delete removes an entry, and both ran with no prompt: the only
 * guard was wording in the orient skill. account_memory_append was on the
 * INSTALL.md ask list, but that list only exists on machines set up after it
 * was added; anyone who installed earlier keeps a bare blanket allow, and
 * users are spread over roughly ten plugin versions. A hook `ask` overrides a
 * settings allow and ships with the plugin itself, so this is the one rail
 * that reaches every install on its next update.
 *
 * The set is the writes that change what an agent reads wholesale or cannot be
 * taken back by the writer's next call:
 *   memory_update           replaces the whole document (not an append);
 *   memory_delete           removes an entry (restorable from its version
 *                           history, but agents stop seeing it at once);
 *   memory_restore_version  puts an older version back over the current one;
 *   memory_bulk_create      writes many entries in one call;
 *   account_memory_append   a suggested line every department agent reads
 *                           until an owner reviews it.
 * memory_create is deliberately NOT here as a whole tool: a new note (a 409
 * refuses a second one for the same department) or a profile would prompt on
 * every first write-back of a new account for no protection. It asks only for
 * the one call that changes what every agent follows: a rule, skill, shortcut
 * or specialist that names no agent, which is Shared with every agent
 * (lib/memory-tool-rules.mjs, memoryWriteDecision). Reads (memory_get,
 * memory_list, memory_list_versions) stay pre-approved.
 *
 * The prompt for each memory write names the agent that follows what it
 * changes (memory surfaces audit m14): the texts below are the first half, and
 * memoryWriteDecision adds who follows it, from the last /hiveku:knowledge pull
 * or the department the new text declares, and for an update whether the new
 * text moves the entry to another agent. None of these tools takes a
 * `department`, and a restore names only a version (PR #50 review, F4, F5).
 *
 * Inside hiveku_batch these names already turn the batch into an `ask`
 * (a write is never an auto-approvable member); `isAutoApprovable` also refuses
 * them by name, so a mis-generated read list cannot pre-approve one either.
 * A folder's reads-only ceiling still DENIES them outright, as it does every
 * write.
 *
 * Two form-capture writes joined the set on 2026-09-24 (form capture
 * controls), for the same reason and one more:
 *   marketing_form_capture_settings_update  decides which of a site's forms
 *                           are captured; an exclude, Web app mode or the
 *                           switch stops real enquiries from the next
 *                           submission, and nothing on the site shows it;
 *   marketing_form_capture_purge  permanently erases captured submissions and
 *                           the contacts that exist only because of them.
 * The builder refuses to EXECUTE the purge through an agent key (403
 * agent_execute_disabled) until this rule, the INSTALL.md ask entries and the
 * Codex prompt have shipped, because an install without them would run it
 * unprompted. The gate is by name, so a dry run prompts too; its reason says a
 * dry run only counts.
 *
 * The search engine indexing switch joined the set on 2026-09-26 (HK-29):
 *   project_indexing_set  turns a site's search engine indexing on or off
 *                         (Site > Hosting > Production). Off tells Google and
 *                         every other search engine to drop the live site from
 *                         their results on every production address, custom
 *                         domain included, and getting listed again can take
 *                         weeks. On lists a site the owner may be keeping out
 *                         of search on purpose.
 * Its `confirm: true` argument is not a gate: the model fills it in itself (see
 * test/permission-critical.test.mjs). The builder's 400 confirm_required and
 * its Hosting & Domains check do not put a person in the loop either; this
 * `ask` does, on every install that has updated, whatever its settings allow.
 * The ask list (data/permission-critical-tools.json, mirrored in INSTALL.md and
 * the Codex plugin's prompts) names it too, but only settings copied from this
 * release carry that entry. A binding in toolMode 'all' sees a new tool as soon
 * as the server serves it, so the builder refuses every change through its
 * Olympus route (403 agent_changes_not_enabled) until this rule, the ask-list
 * entry and the Codex prompt have shipped. The tool index carries both tools
 * since release 0.26.31. Its read, project_indexing_get, is a GET on the
 * read-only list and is not on this set.
 *
 * The desktop app's Memory page writes joined the set on 2026-10-31 (MCP
 * feature/memory-desktop-tools, not yet served; batch MEMORY-DESKTOP-1 in
 * test/pending-tools.mjs), right after the memory writes above and for the
 * same reason: each changes what agents read and follow, or whether an agent
 * works at all. They are About your business and its suggestions, an agent's
 * rules, skills and notes, the chief of staff's, a website's memory files, an
 * agent's profile and switch, Voice and pronunciation, and a Marketplace
 * install. The About your business changes and the agent switch are taken
 * from the Hiveku app's own key only (403 app_key_required to every other key,
 * this plugin's included); they ask anyway, so a later widening on the server
 * never meets an install unasked. None of them goes through
 * memoryWriteDecision: none names an entry the last /hiveku:knowledge pull
 * recorded, so each reason is written once, here. Their reads (the _get and
 * _list tools beside them) are not on this set, and neither are the knowledge
 * base upload and page scrape that came with them.
 */
export const ALWAYS_ASK_WRITES = new Map([
  ['memory_update', MEMORY_ASK_BASE.memory_update],
  ['memory_delete', MEMORY_ASK_BASE.memory_delete],
  ['memory_restore_version', MEMORY_ASK_BASE.memory_restore_version],
  ['memory_bulk_create', MEMORY_ASK_BASE.memory_bulk_create],
  ['account_memory_append', MEMORY_ASK_BASE.account_memory_append],
  // The desktop app's Memory page (2026-10-31, MCP feature/memory-desktop-tools). See the note above
  // the set. On the ask list too, in this order.
  ['account_memory_save',
    'replaces the whole of About your business, the one document every agent reads, with the text you '
    + 'send. Anything left out is gone from what every agent reads from their next conversation '
    + '(history keeps the old text). Hiveku takes it from the Hiveku app\'s own key only'],
  ['account_memory_restore',
    'puts an older version of About your business back over the current one, and every agent reads '
    + 'the older text from their next conversation (the text it replaces stays in history). Hiveku '
    + 'takes it from the Hiveku app\'s own key only'],
  ['account_memory_suggest',
    'files a line for About your business. It waits until an owner or admin keeps or removes it, and '
    + 'once kept every agent reads it. Hiveku takes it from the Hiveku app\'s own key only'],
  ['account_memory_suggestion_keep',
    'adds a suggested line to About your business, which every agent reads from their next '
    + 'conversation. Hiveku takes it from the Hiveku app\'s own key only'],
  ['account_memory_suggestions_remove',
    'removes suggested lines for About your business without keeping them. Hiveku takes it from the '
    + 'Hiveku app\'s own key only'],
  ['account_memory_suggestions_restore',
    'puts removed suggestions for About your business back, to wait for an owner or admin again. '
    + 'Hiveku takes it from the Hiveku app\'s own key only'],
  ['agent_memory_save',
    'replaces the whole text of one of an agent\'s rules, skills or notes, and the agent follows the '
    + 'new text from its next conversation (history keeps the old version)'],
  ['agent_memory_remove',
    'deletes one of an agent\'s rules, skills or notes. The agent stops following it straight away; '
    + 'it can be put back from Recently deleted in its history'],
  ['agent_memory_create',
    'adds a rule, skill, shortcut or specialist to an agent, and the agent follows it from its next '
    + 'conversation'],
  ['agent_memory_restore',
    'puts an older version of one of an agent\'s rules, skills or notes back over the current one, '
    + 'and the agent follows the older text from its next conversation'],
  ['chief_of_staff_memory_save',
    'replaces the whole text of one of the chief of staff\'s rules or notes, or adds a new one, and '
    + 'the chief of staff follows it from the next conversation (history keeps the old version)'],
  ['chief_of_staff_memory_remove',
    'deletes one of the chief of staff\'s rules or notes. The chief of staff stops following it '
    + 'straight away; a copy is kept under Recently deleted'],
  ['website_memory_file_save',
    'replaces the whole text of one of a website\'s memory files (CLAUDE.md and the rest), which the '
    + 'website agent follows from its next turn (history keeps the old version)'],
  ['website_memory_file_restore',
    'puts an older version of a website\'s memory file back as the current one, and the website '
    + 'agent follows the older text from its next turn'],
  ['agent_profile_save',
    'changes an agent\'s profile: its name, picture, role, tone and instructions, which shape every '
    + 'conversation it has from the next one'],
  ['agent_switch_set',
    'switches an agent on or off. Switched off, it stops working for the account (Support hands its '
    + 'website chats to the team); switched on, it adds its starter rules and skills. Hiveku takes it '
    + 'from the Hiveku app\'s own key only'],
  ['voice_pronunciations_save',
    'changes how the phone agents say names and words on every call, and how fast they speak. The '
    + 'list you send replaces the whole list'],
  ['marketplace_template_install',
    'writes a Marketplace pack of rules and skills into an agent\'s memory (a website pack into one '
    + 'website\'s, or every website\'s), and the agent follows them from its next conversation'],
  // Form capture controls (2026-09-24). See the note above the set.
  ['marketing_form_capture_settings_update',
    'changes which of this site\'s forms Hiveku captures. From the next submission, an excluded '
    + 'form or path, Web app mode or the switch turned off stops those submissions becoming '
    + 'contacts, notifications, workflow runs and ad conversions, with no redeploy'],
  ['marketing_form_capture_purge',
    'can PERMANENTLY erase captured form submissions, their files and the contacts that exist '
    + 'only because of them, with no undo. A dry run (the default) only counts; confirm: true '
    + 'with a confirm_token erases'],
  // A site's lead inbox and the move between workspaces (2026-10-30, Website Builder wave B; builder
  // #1896, MCP #345). The delete erases the leads it names with their uploaded files (a CRM contact
  // made from one stays); the move takes a site, its leads and its pages out of this workspace. On the
  // ask list too.
  ['marketing_form_inbox_delete',
    'PERMANENTLY deletes the form leads it names, with the files their visitors uploaded. A CRM '
    + 'contact made from one stays'],
  ['site_transfer',
    'moves a website, with its leads, pages and content, to another workspace, where this '
    + 'workspace\'s people no longer reach it. Shared variables, PM project settings, boards, '
    + 'discussions and domain links stay behind'],
  // Search engine indexing (HK-29, 2026-09-26). See the note above the set.
  ['project_indexing_set',
    'turns this site\'s search engine indexing on or off. Turned off, it tells Google and every '
    + 'other search engine to drop the live site from their results, custom domain included, and '
    + 'getting listed again can take weeks. Turned on, it lets them list a site that may be kept '
    + 'out of search on purpose'],
  // The secrets reveal (0.27.25; builder #993, MCP #188). Its answer is a site's plaintext
  // values, so it asks on every direct call whatever the settings allow, like the VS Code ask
  // rule and the Codex prompt. It stays on NEVER_AUTO_APPROVE as well, so a reads-only ceiling
  // treats it as a read whose response is the hazard.
  ['project_secrets_reveal',
    'hands the AI the plaintext values of a site\'s non-sensitive variables for one tier. A '
    + 'person also approves each reveal in the Hiveku dashboard; use the values only for the task '
    + 'at hand'],
  // Page A/B tests (builder #1022, MCP #187). Each changes which page a site's live visitors get,
  // or commits a test copy to the site's code. The tools answer with a preview until confirm: true;
  // this ask makes that yes the person's, like the VS Code ask rule and the Codex prompt.
  ['project_ab_test_create',
    'drafts a page A/B test. With make_copy it also commits a copy of the page to the site\'s code '
    + '(saved as a version, not deployed)'],
  ['project_ab_test_update',
    'changes a page A/B test. On a running test a new split moves this site\'s live visitors '
    + 'between the original and the second version, and a new main goal recounts the whole result'],
  ['project_ab_test_action',
    'starts, pauses, resumes or ends a page A/B test on the live site, which decides the page real '
    + 'visitors get. Ending on a winner also adds a redirect to it. After a test ends, promote or '
    + 'remove_copy saves a version on Main that changes the site\'s code, live after the next deploy'],
  ['project_ab_test_delete',
    'deletes a page A/B test for good: a draft, or an ended test together with its results. A '
    + 'running or paused test must end first; the test\'s pages stay on the site'],
  // Mobile (Expo) app settings (MCP #167, #170, #195). Each tool's own description says to ask the
  // person first, but the SDK upgrade's confirm: true is filled in by the model and the other two
  // take no confirm at all. This ask makes the yes the person's, like the VS Code ask rule and the
  // Codex prompt. Their reads (mobile_app_identity_get, mobile_app_apple_account_get,
  // mobile_app_preflight, mobile_app_sdk_upgrade_plan) are GETs and stay pre-approved.
  ['mobile_app_sdk_upgrade',
    'moves a mobile app to a newer Expo SDK. It rewrites the app\'s package files, app config and '
    + 'the template files it never changed in one go (a checkpoint is saved first, so it can be '
    + 'undone), then restarts its preview'],
  ['mobile_app_identity_set',
    'sets a mobile app\'s store identity: its iOS bundle ID, Android package and link scheme. The '
    + 'IDs become permanent once a build is uploaded to a store'],
  ['mobile_app_apple_account_set',
    'chooses which Apple developer account (store connection) this mobile app\'s builds and App '
    + 'Store submissions use. One shared by another account publishes the app from that account\'s '
    + 'Apple team'],
  // The PPC change ledger's override (MCP #211, builder #1246). Its answer is a person's yes to going
  // over someone else's recent change to the same budget, bid or setting, which the hold (7 days for
  // budget and bidding, 24 hours for the rest) exists to protect; the model must never give it on its
  // own. Asks on every direct call whatever the settings allow, like the Codex prompt and VS Code's
  // ask rule; the MCP server refuses it inside hiveku_batch. Inert until the ledger enforces.
  ['ppc_recent_change_override',
    'is a person\'s yes to going over someone else\'s recent PPC change: the same change sent again '
    + 'within 15 minutes goes ahead though they changed that budget, bid or setting within its hold. '
    + 'Only the person whose change was refused can say yes'],
  // Deleting an ad account connection (2026-10-30, the desktop app's Ads area, wave B; MCP #346). A
  // hard delete of Hiveku's own copy, which the builder cascades to the account's campaigns, ad
  // groups, ads and numbers, its change history, and its conversion uploads and designations. Nothing
  // reaches the ad platform, so it sits here with the other erases rather than on LIVE_CHANGE_WRITES.
  // On the ask list too.
  ['ppc_connection_delete',
    'PERMANENTLY deletes Hiveku\'s copy of an ad account: its campaigns, ad groups, ads and numbers, '
    + 'its change history and its conversion uploads, with no undo. Nothing changes on the ad '
    + 'platform itself'],
  // The desktop app's SEO page, wave B (2026-10-30; builder #1900, MCP #353). Erases and overwrites of
  // Hiveku's own copy, nothing at Google: a keyword's rank history, a site audit, the working sheet's
  // rows and tabs, the report beside it, a saved report, and an SEO connection with all its saved
  // history (since #353 a hard delete, where it used to hide the row). None can be brought back. The
  // saved report write is gated by name, so a new saved report asks too. The tab create
  // (seo_sheet_create_tab) is left off on purpose: the SEO commands write a new dated tab on every
  // run, scheduled runs could not answer an ask, and its tool text says to ask before replacing a
  // tab of the same name. The writes that reach Google, a live site, a public page or the bill are
  // on LIVE_CHANGE_WRITES. On the ask list too.
  ['seo_rankings_keyword_delete',
    'stops tracking a keyword on every platform and PERMANENTLY deletes its rank history, with no undo. '
    + 'Pausing it instead stops its checks and its bill and keeps the history'],
  ['seo_audit_delete',
    'PERMANENTLY deletes a site audit and its results, with no undo'],
  ['seo_sheet_rows_delete',
    'PERMANENTLY deletes rows from the SEO working sheet that everyone on the account sees, with no undo'],
  ['seo_sheet_tab_delete',
    'PERMANENTLY deletes a whole tab of the SEO working sheet with all its rows, with no undo'],
  ['seo_report_clear',
    'PERMANENTLY removes every section of the SEO report beside the working sheet, with no undo. The '
    + 'sheet\'s tabs stay'],
  ['seo_deliverable_save_from_workspace',
    'saves the SEO working sheet as a saved report. Saved over one (deliverable_id), it replaces that '
    + 'report\'s sheet and sections, and what it held before cannot be brought back. A new report asks '
    + 'too, because the gate is on the tool name'],
  ['seo_connection_delete',
    'removes an SEO data connection and PERMANENTLY deletes all its saved history: search numbers, '
    + 'Business Profile numbers, reviews, posts, sitemaps and page checks, with no undo. Nothing at '
    + 'Google is deleted'],
  // Who gets a site's lead emails (HK-255; builder #1403, MCP #228). Turning lead emails off,
  // muting a form or rerouting its leads is the owner's choice, so it asks on every direct call
  // whatever the settings allow, like the Codex prompt and VS Code's ask rule; the MCP server
  // refuses it inside hiveku_batch. The builder holds it for agents (403 agent_changes_not_enabled)
  // until this rule, the ask-list entry and the Codex prompt have shipped. Its read,
  // marketing_form_notifications_get, is a GET on the read-only list and is not on this set.
  // Since the desktop app's wave S1 (2026-10-31, MCP #364) it also sets the Notifications panel's
  // other settings: the subject, reply to the visitor, sending from the account's own domain, the
  // visitor's automatic reply, a Slack address and each form's visible reCAPTCHA. Two of them send
  // lead data somewhere new, so the reason names them.
  ['marketing_form_notifications_update',
    'changes who gets this site\'s lead emails. "Don\'t email anyone" or a muted form stops the '
    + 'lead email, Slack post, phone alert and visitor\'s automatic reply from the next lead (leads '
    + 'are still recorded and workflows still run); a changed or emptied list sends leads to other '
    + 'people (an empty list goes to the billing email, else every member). A Slack address posts '
    + 'every new lead to that Slack channel, and the automatic reply emails each visitor who fills '
    + 'in a form, with their replies going to the address it names'],
  // Running a review's checks again (2026-10-19, CI checks plan step 6, builder #1650, MCP #253):
  // it spends the site's test builds, which people and the merge line share. On PENDING_TOOLS until
  // the regenerated index carries it.
  ['project_vcs_checks_rerun',
    'runs a review\'s build and checks again, which spends the site\'s test builds (six per 15 '
    + 'minutes, shared with people and the merge line)'],
  // The Email Service setup writes (2026-10-25, Email Service program; builder write tools, MCP
  // feature/email-project-connect-tools). Two send email to real people, one rewrites how a live
  // site sends its email, and one adds suppression rows that can never be removed. Each tool's own
  // description says to ask the person first; this makes the yes the person's on every direct call
  // whatever the settings allow, like the VS Code ask rule and the Codex prompt. The builder holds
  // all four for agents (403 agent_changes_not_enabled) until this rule, the ask-list entries and
  // the Codex prompt have shipped. On PENDING_TOOLS until the regenerated index carries them.
  ['email_send',
    'sends a real email through the account\'s Email Service as one of its API keys. With a '
    + 'production key it is delivered to the people named, and an email that went cannot be taken back'],
  ['email_domain_send_instructions',
    'emails a sending domain\'s DNS records to the person named, often someone outside the account, '
    + 'from Hiveku\'s platform address with replies going to the account\'s team'],
  ['email_project_connect',
    'makes a website\'s email keys and writes them, with its email settings, into the site\'s '
    + 'variables (replace overwrites what is there), which changes how the live site sends its email'],
  ['email_suppression_import',
    'adds up to 5,000 addresses to the account\'s suppression list at once. Nothing is emailed to '
    + 'them again, and imported bounces and complaints can never be removed'],
  // "Ask them to record again" (2026-10-27, builder #1841, MCP #309): an email, or a text when email
  // cannot go, to a customer whose video testimonial the recording limit cut off. It reaches a real
  // person and goes once per testimonial, so the yes is the person's on every direct call, like
  // email_send. Its preview, marketing_testimonial_rerecord_preview, is a GET and stays read only.
  ['marketing_testimonial_rerecord_send',
    'emails or texts a customer a link to record their video testimonial again. It reaches a real '
    + 'person, goes once per testimonial, and a message that went cannot be taken back'],
  // Emailing a number transfer's letter of authorization (2026-10-29; builder #1883, MCP
  // feature/calls-wave1-tools). The signing link goes to the address the call names, and whoever
  // opens that email can sign the transfer for the account, so the yes is the person's on every
  // direct call whatever the settings allow, like email_send and the Codex prompt. The ask list and
  // the INSTALL.md block name it too, but only settings pasted from this release carry that entry;
  // this ask reaches every install that updates. Its progress read, voice_port_order_loa_get, is a
  // GET and is not on this set. On PENDING_TOOLS until the regenerated index carries it.
  ['voice_port_order_loa_send',
    'emails a number transfer\'s letter of authorization to the address given. Whoever opens that '
    + 'email can sign the transfer for the account, and the send stops any earlier signing link'],
  // Confirm on your phone (2026-10-31; builder #1908, MCP #359, dialer wave 2): the start pushes a
  // request to the person's own Hiveku phone app to accept the 911 notice, and the cancel ends one the
  // person may be confirming there right now. Neither accepts anything (only the person does, on their
  // phone, with Face ID, a fingerprint or the passcode), but each is the person's to start, so the yes
  // is theirs on every direct call whatever the settings allow, like the LOA send and the Codex prompt.
  // The two reads, confirm_on_phone_get and confirm_phones_list, are GETs and are not on this set. On
  // PENDING_TOOLS until the regenerated index carries them.
  ['confirm_on_phone_start',
    'sends a request to your Hiveku phone app to accept the 911 notice. Nothing is accepted until you '
    + 'read it and confirm on your phone, but it pushes your phone and counts against the 10 starts an hour'],
  ['confirm_on_phone_cancel',
    'cancels a Confirm on your phone request that may be open on your phone right now. It accepts nothing'],
  // The desktop app's help desk (2026-10-28; builder #1869, MCP #319): erasing one person's website
  // chats, and how long every website chat is kept. The builder holds both for keys today (403
  // agent_execute_disabled, its AGENT_ERASE_EXECUTE and AGENT_RETENTION_EXECUTE holds, the form-capture
  // purge's pattern); this ask, the ask-list entries and the Codex prompt make it safe to lift that
  // hold later. The gate is by name, so a retention dry run prompts too, and its reason says a dry run
  // only counts. The erase preview (helpdesk_contact_data_erase_preview) is not on it. On PENDING_TOOLS
  // until the regenerated index carries them.
  ['helpdesk_contact_data_erase',
    'PERMANENTLY erases one person\'s website chats: their messages and uploaded files, their chat '
    + 'visits, the CRM records kept for the chats and the recordings of their own meetings, with no '
    + 'undo. Hiveku refuses it through a key for now; this ask keeps a person deciding once that is lifted'],
  ['helpdesk_chat_retention_set',
    'changes how long this account keeps website chats. Every night, chats older than that are deleted '
    + 'for good with their messages, files and chat visits. A dry run (dry_run: true) only counts; '
    + 'Hiveku refuses a real change through a key for now'],
  // The desktop app's Mission Control person actions (2026-11-01; builder Olympus routes
  // mission-control/tasks/:id/claim and /answer, MCP #370, desktop parity S1 to S3): claiming a card or
  // taking it over from a teammate, letting your own claim go, and recording your own decision on a
  // card. Each acts as the person whose key makes the call: the builder takes the person from the key
  // and refuses a call that names nobody (403 no_person), and the MCP keeps all three off Hiveku's own
  // agent servers. A take-over (force) and an answer are the person's own choices, which the tools'
  // descriptions say to ask about; this makes the yes the person's on every direct call whatever the
  // settings allow, like the ask list and the Codex prompt. The card reads (mc_task_get,
  // mc_decision_check) are GETs and are not on this set. On PENDING_TOOLS (MISSION-CONTROL-DESKTOP-1)
  // until the regenerated index carries them.
  ['mc_task_claim',
    'claims a Mission Control card as yours, so the team sees you are deciding it. With force it '
    + 'takes the card over from the teammate who holds it, and the take-over is recorded on the card'],
  ['mc_task_release',
    'lets go of your claim on a Mission Control card, so anyone on the team can pick it up and '
    + 'decide it'],
  ['mc_task_answer',
    'records your decision on a Mission Control card and marks it done. You are recorded as the '
    + 'person who decided, and an agent waiting on the card acts on the choice it records'],
]);

/**
 * Reads whose PRE-APPROVAL depends on their ARGUMENTS. Each entry maps a bare
 * tool name to a predicate over the call's `tool_input`: return true to keep
 * the auto-approval, anything else (false, throw, missing input) withholds it.
 * Fail closed: an absent or malformed input is NOT pre-approved.
 *
 * ★ SAME HONESTY AS NEVER_AUTO_APPROVE ABOVE — a failing predicate is not a
 * gate. It only means this plugin declines to add its own allow, and
 * `decideForPayload` then returns null. "Falls back to the normal permission
 * prompt" is true only where the normal flow HAS a prompt; under the
 * INSTALL.md install shape (`allow: ["mcp__plugin_hiveku_hk__*"]`) the normal
 * flow is the blanket allow, and the call runs unprompted with whatever
 * arguments it likes. The predicate earns its keep in auto mode and on
 * machines without a blanket allow; it is not a rail, and a hazardous argument
 * form that must actually be stopped needs `.hiveku/guardrails.json` or a
 * read-only key. (As above, the exception is inside `hiveku_batch`, whose
 * branch turns a failing member into a real `ask`.)
 *
 *   voice_voicemails_list — the route returns a presigned recording URL per
 *     voicemail unless `audio_urls: 'false'` is passed. A metadata sweep is a
 *     read; a sweep that mints a page of shareable audio links is not
 *     (2026-08-29 voice audit). Auto-approve only the explicit metadata form.
 *
 * ★ voice_sms_thread_messages_list is deliberately NOT here: its route now
 * defaults `mark_read` to false for API keys (read-only by default), so the
 * plain call really is a read. Re-add a gate only if that default flips back.
 */
export const ARG_GATED_READS = {
  voice_voicemails_list: (input) => input?.audio_urls === 'false',
};

/**
 * Writes that change a live campaign, a live site, account spend, or data a
 * third party keeps, and that ALWAYS ASK on a direct call whatever the user's
 * settings say. Bare name -> the plain-language reason the prompt shows. Same
 * branch and same prompt as ALWAYS_ASK_WRITES; kept as its own map so the
 * memory and form-capture pins above stay about memory and form capture.
 *
 * ★ WHY THE HOOK AND NOT ONLY THE ASK LIST (release 0.26.30, 2026-09-26).
 * Release 0.26.30 put these names on data/permission-critical-tools.json and
 * the INSTALL.md ask block. That list is a copy in each user's settings file:
 * it reaches only a machine whose settings are pasted from 0.26.30 or later.
 * Every earlier install keeps `allow: ["mcp__plugin_hiveku_hk__*"]` with an
 * older ask list, and on those machines a write this file says nothing about
 * runs unprompted. The first cut of 0.26.30 stopped at the ask list, so
 * ppc_conversion_adjustments_run (a retraction Google and Microsoft cannot
 * undo) would still have run with no prompt on every existing install. A hook
 * `ask` ships with the plugin and overrides a settings allow, so this map is
 * the rail that reaches those installs on their next update.
 *
 * Most of these tools also confirm on the server (a preview_hash, or a
 * two-step `confirm: true`). That stops a STALE write, not an UNATTENDED one:
 * the model reads the hash or the confirm field off the first answer and sends
 * it straight back (test/permission-critical.test.mjs says the same of
 * `confirm: true`). The gate is by name, so the preview call prompts too, as
 * it does under the INSTALL.md ask rule.
 *
 * Every name here must also be on the ask list, so INSTALL.md and the Codex
 * plugin's prompt list carry it (test/permission-critical.test.mjs). A
 * folder's reads-only ceiling still DENIES them, as it does every write.
 *
 * The budget guardrail writes are here because they can switch an owner's
 * auto-pause off with no prompt: the daily sweep measures pause_at_pct as a
 * percentage of connections[].monthly_budget_target_cents, and with no target
 * it evaluates no budget line at all (parseGuardrailConfig in the builder's
 * ppc-guardrail-sweep.service.ts). Clearing the target switches the auto-pause
 * off; raising it moves the pause point up by the same factor.
 *
 * ★ SWITCHING ADS ON (release 0.26.36). Every other spend change asked
 * (budgets, bids, bidding strategy, campaign create), but the call that turns
 * ads on did not: ppc_enable_resource and ppc_platform_enable_resource have no
 * confirm and no budget check, and "created paused" is only a rail if the
 * enable asks. The skills told owners to add an ask rule for them by hand.
 * Two groups below close that:
 *   - The five tools that can switch a paused or new campaign, ad set, ad
 *     group, ad or creative on by its status. Three of them are MIXED:
 *     ppc_bulk_edit also pauses, ppc_linkedin_creatives also lists and
 *     pauses, ppc_tiktok_split_tests also reads.
 *   - The four that can restart or widen delivery without a status change:
 *     ppc_recommendation_apply (a Google recommendation can change the bidding
 *     strategy or switch on broad match or search partners, around the gated
 *     bidding writes), and the three update tools whose end date can put a
 *     campaign that has ended back into delivery: stop_time on
 *     ppc_meta_campaign_update, end_date on ppc_linkedin_campaign_update and
 *     ppc_linkedin_campaign_group_update (which also sets the group budgets,
 *     set nowhere else). Their renames ask too.
 * All nine are gated by NAME, whole tool, on purpose: the INSTALL.md ask rule
 * and the Codex prompt entry can only name a tool, so an argument-aware rule
 * here would leave the three lists disagreeing. test/spend-start-writes.test.mjs
 * pins both groups and lists the tools judged and left off, each with its
 * reason. Pausing one resource (ppc_pause_resource,
 * ppc_platform_pause_resource) stays silent: it is the safe direction.
 *
 * ★ SWITCHING A WORKFLOW ON (release 0.26.36). workflow_enable is the one tool
 * that switches a workflow on: from MCP #47, every create, clone, template
 * install and webhook provision makes the workflow switched off, and
 * workflow_update refuses is_enabled: true. workflow_resume clears an
 * automatic pause, so the workflow's triggers run it again. Both were on the
 * ask list only, so an install with an older copy of that list and the
 * blanket allow ran them unasked; from either call the workflow's webhook,
 * schedule or event trigger runs it with nobody watching.
 *
 * ★ A WORKFLOW'S VARIABLES (release 0.27.73). workflow_env_set creates or
 * changes a workflow variable ({{env.NAME}}, kept per account) and
 * workflow_env_delete removes one. Switched-on workflows read the new value, or
 * nothing, from their next run with nobody watching. The set can store a
 * secret, or link one of a site's own environment variables at one tier, whose
 * value a run sends only as a request header and only to that same site. Both
 * are on the ask list and here, so an install whose settings predate this
 * release asks too. workflow_env_list answers names only, never a value, and
 * stays a pre-approved read.
 *
 * ★ SWITCHING EMAIL MARKETING ON (release 0.27.76). marketing_activate is the
 * dashboard's Activate marketing for an agent: it switches email marketing on
 * and sets up the account's campaign sending, or runs that setup again. It
 * sends nothing itself, and every campaign send still asks, but two senders
 * that never ask wait on it: a switched-on workflow's Email Marketing: Send
 * Email step sends nothing while marketing is off or not set up, and the drip
 * tick holds an active enrollment while marketing is off. From this call both
 * email real contacts with nobody watching. Its attest_consent records a
 * consent confirmation in the name of the person who created the connection,
 * which only that person can give. It is on the ask list and here;
 * marketing_setup_status, the read beside it, stays pre-approved.
 *
 * ★ A SITE'S SERVER CAPACITY AND PAGE CACHING (2026-10-24, MCP #288).
 * project_concurrency_set (HK-660) changes how many copies of a tier's server may run at once,
 * and project_page_cache_set (HK-662) switches whether the edge keeps a Production site's
 * shareable pages. Both change how a live site is served at once, for every visitor. Both are
 * on the ask list and here, so an install whose settings predate this release asks too. Their
 * reads, project_concurrency_get and project_page_cache_get, stay pre-approved.
 *
 * ★ THE DESKTOP APP'S ADS AREA, WAVE B (2026-10-30; builder #1898, MCP #346). That day Abe opened
 * the three conversion go-live switches and the Ads approvals to a person's own key, reversing their
 * people-only design, so the desktop app calls them after its own confirm dialog. Claude Code and
 * Codex ask the person first, on every call: approving what the Ads AI staged; the three go-live
 * switches (conversion uploads and conversion corrections out of validate-only, Meta lead quality
 * on); the campaign, ad group and ad edits on the platform; and the four conversion-upload writes
 * that arm a source, point it at a conversion action, re-arm the parked backlog and run the uploads.
 * The go-live switches confirm on the server with a preview_hash, which the model fills in itself,
 * and the MCP server refuses them inside hiveku_batch. The status tools pause as well as enable;
 * they are gated by name, whole tool, like ppc_bulk_edit. The connection delete is on
 * ALWAYS_ASK_WRITES (it erases Hiveku's own copy, not a platform). Their reads stay pre-approved;
 * rejecting a staged action, the default-account flag and the Hiveku-only draft deletes do not ask.
 *
 * ★ THE DESKTOP APP'S SEO PAGE, WAVE B (2026-10-30; builder #1900, MCP #353). The desktop app runs the
 * SEO page with a person's own key and calls these after its own confirm dialog; in Claude Code the
 * hook asks the person first, on every call: publishing an SEO task's change to the client's live
 * site; the three Business Profile post writes, public on the live listing (their two-step confirm is
 * filled in by the model, so the preview call asks too); the rank tracker's check now (it uses the
 * day's on-demand checks), bulk add (a keyword past the plan's included count is billed) and AI
 * platforms for every tracked keyword at once; and the website report writes that spend research and
 * make, change or delete a public page. The erases and overwrites of Hiveku's own copy (a keyword's
 * rank history, a site audit, the working sheet, a saved report, an SEO connection's saved history)
 * are on ALWAYS_ASK_WRITES. Their reads stay pre-approved; the connection settings and not-applicable
 * marks, a second Business Profile location, a report cancel, the sheet's cell and column edits, a
 * keyword's check frequency, a task made from an issue and a saved report's copy do not ask.
 *
 * ★ THE DESKTOP APP'S SITE PAGES, WAVE S1 (2026-10-31; builder #1925, MCP #364). Three writes came with
 * the site pages' reads. deploy_build_cancel asks: it stops a site's waiting and running builds (every
 * build of the site when no build_type is named), and a production build it stops never goes live, so
 * a change someone published waits with nothing on the site to show it. The writes that start a deploy
 * beside it (deploy_site, deploy_run, deploy_serve_version) are on the ask list. Two are left without
 * an ask on purpose, like their neighbours: site_thumbnail_capture takes a new picture for the site's
 * card on the Websites page, which no visitor sees (the picture is Hiveku's own cost, and the server
 * takes one at a time, at most one a minute per site, and never wakes a sleeping Live Preview), as
 * sites_capture_stale_previews does for every stale card; and project_missing_page_set saves what
 * visitors get for a page that does not exist, which reaches them only with the redirects deploy
 * (project_redirects_deploy), like a saved redirect (project_redirect_create). The ten reads stay
 * pre-approved.
 */
export const LIVE_CHANGE_WRITES = new Map([
  // Google Ads settings on live campaigns.
  ['ppc_google_auto_apply_set',
    'can let Google apply its own recommendations (new keywords, broad match, search partners, '
    + 'CPA and ROAS targets) with nobody asking, so reach and spend change unattended'],
  ['ppc_google_campaign_settings_set',
    'changes a live Google campaign\'s networks, location option and URL options: a network '
    + 'turned on widens reach and spend, and a tracking template or final URL suffix rewrites '
    + 'every click\'s URL at once'],
  ['ppc_google_ad_schedule_set',
    'changes when a live Google campaign serves and its schedule bid adjustments: adding the '
    + 'first window stops the campaign serving in every hour it does not cover, and clearing the '
    + 'schedule serves (and spends) all week again'],
  ['ppc_google_audience_exclusions_set',
    'changes who a live Google campaign or ad group reaches: removing an exclusion shows the ads, '
    + 'and spends, on people it was keeping out (existing customers, for example)'],
  ['ppc_google_call_settings_set',
    'changes which calls Google counts as conversions across the account; turning call '
    + 'conversion reporting off takes that signal away from Smart Bidding'],
  ['ppc_google_campaign_ai_settings_set',
    'can let Google write the ad text customers see, send clicks to other pages, or widen '
    + 'matching with AI Max on a live campaign'],
  ['ppc_bing_campaign_ai_settings_set',
    'turns AI Max and automatically generated ad text on or off for a live Microsoft campaign; '
    + 'on lets Microsoft write the ad text customers see and widen matching'],
  ['ppc_bing_url_tracking_set',
    'rewrites the tracking template, URL suffix or UTM auto-tagging on live Microsoft campaigns; '
    + 'an account-level template reaches every campaign without its own, so a wrong one breaks '
    + 'click URLs and attribution everywhere'],
  // Live ad text, negatives and extensions.
  ['ppc_google_ad_text_update',
    'rewrites the text customers see on a live Google ad; the ad goes back through policy review'],
  ['ppc_google_ads_text_replace',
    'finds and replaces text across up to 100 live Google ads in one call; every edited ad goes '
    + 'back through policy review'],
  ['ppc_bing_rsa_text_update',
    'rewrites the text customers see on a live Microsoft ad; the ad goes back through editorial '
    + 'review'],
  ['ppc_meta_ad_text_update',
    'rewrites the text customers see on a live Meta ad; Meta reviews the ad again, and the new '
    + 'creative can put its ad set back into learning'],
  ['ppc_negatives_remove',
    'removes negative keywords, which widens reach at once: blocked searches show the ads and '
    + 'spend again, and detaching a list reopens every term in it'],
  ['ppc_bing_ad_extension_update',
    'edits a live Microsoft ad extension (a phone number, sitelink or callout customers see) '
    + 'everywhere it is attached'],
  ['ppc_bing_ad_extension_remove',
    'detaches extensions from live Microsoft ads, or deletes them from the library, which '
    + 'Microsoft cannot restore'],
  ['ppc_google_sitelink_update',
    'rewrites a live Google sitelink (the link text, description lines or landing page customers '
    + 'see) everywhere it is attached; the sitelink goes back through policy review'],
  ['ppc_bing_campaign_budget_move',
    'moves a live Microsoft campaign onto or off a shared budget, which changes how much it '
    + 'can spend from that moment'],
  ['ppc_bing_shared_budget_update',
    'changes a live Microsoft shared budget\'s daily amount, and every campaign on that budget '
    + 'spends at the new amount'],
  ['ppc_google_campaign_conversion_goals_set',
    'changes which conversions a live Google campaign counts and bids toward, which changes '
    + 'its bidding at once'],
  // Experiments: the steps that start, widen or adopt a test.
  ['ppc_bing_experiment_create',
    'creates a Microsoft experiment that starts serving on its start date on a share of the base '
    + 'campaign\'s budget and searches (Microsoft has no setup state)'],
  ['ppc_bing_experiment_update',
    'changes a Microsoft experiment\'s dates or status: graduated adds the base campaign\'s daily '
    + 'budget to account spend, and ended cannot be restarted'],
  ['ppc_experiment_schedule',
    'starts a Google Ads experiment: from then on the test copy serves and spends its share of '
    + 'the base campaign\'s budget'],
  ['ppc_experiment_graduate',
    'turns a Google Ads experiment\'s test copy into a permanent campaign on a NEW daily budget '
    + 'while the original keeps running, so account spend goes up by that budget every day'],
  ['ppc_experiment_promote',
    'adopts an experiment\'s treatment into the base campaign, which then serves all traffic on '
    + 'the treatment\'s bidding and URLs; on Microsoft, changes made to the base during the test '
    + 'are deleted'],
  ['ppc_experiment_treatment_set',
    'puts a bidding switch or landing-page swap into an experiment\'s copy, which serves on its '
    + 'share of traffic once the experiment starts (on Microsoft, automatically on the start date)'],
  // Switching ads on (release 0.26.36). See the note above the map.
  ['ppc_enable_resource',
    'turns a paused Google Ads campaign, ad group, ad or keyword back on. It serves and spends from '
    + 'that moment, and the call has no confirm step and no budget check of its own'],
  ['ppc_platform_enable_resource',
    'turns a paused campaign, ad set, ad group or ad back on (Google, Microsoft, Meta, LinkedIn, '
    + 'TikTok, Amazon, Vibe or ChatGPT Ads). It serves and spends from that moment, and the call has '
    + 'no confirm step and no budget check of its own'],
  ['ppc_bulk_edit',
    'sets the status of up to 100 Google Ads campaigns, ad groups or keywords in one call, and any '
    + 'ENABLED operation starts spend at once. It asks on every call, pause-only ones too; a single '
    + 'pause through ppc_pause_resource or ppc_platform_pause_resource does not ask'],
  ['ppc_linkedin_creatives',
    'can set a LinkedIn creative to enabled, which makes the ad deliverable at once when its '
    + 'campaign and group are active (its confirm field is filled in by the agent, not a person). '
    + 'List and detail calls ask too, because the gate is on the tool name'],
  ['ppc_tiktok_split_tests',
    'can create a TikTok split test, which copies the campaigns or ad groups under test into cells '
    + 'and spends its budget from the start time, or extend a running one, with no confirm step. '
    + 'Its reads ask too, because the gate is on the tool name'],
  // Restarting or widening delivery without a status change (release 0.26.36).
  ['ppc_recommendation_apply',
    'applies a Google Ads recommendation to the live account with Google\'s default settings for '
    + 'its type. Depending on the type it can change the bidding strategy, switch on broad match or '
    + 'search partners, or add keywords, so reach and spend change from that moment'],
  ['ppc_meta_campaign_update',
    'changes a live Meta campaign. A later stop_time puts a campaign that has ended back into '
    + 'delivery, or keeps one spending past the date it was set to stop, and a new bid strategy '
    + 'changes what it pays. A rename asks too, because the gate is on the tool name'],
  ['ppc_linkedin_campaign_update',
    'changes a LinkedIn campaign\'s run dates, or archives it for good. A later end_date puts a '
    + 'campaign that has ended back into delivery, or keeps one spending past the date it was set '
    + 'to stop. A rename asks too, because the gate is on the tool name'],
  ['ppc_linkedin_campaign_group_update',
    'changes a LinkedIn campaign group\'s run dates or budgets, or archives it for good. A later '
    + 'end_date puts the group\'s campaigns back into delivery after it has ended, and a higher daily '
    + 'or total budget lets them spend more. A rename asks too, because the gate is on the tool name'],
  // Switching a workflow on (release 0.26.36). See the note above the map.
  ['workflow_enable',
    'switches a workflow on. From this call its webhook, schedule or event trigger runs it with '
    + 'nobody watching, and its steps email, text, post and change records for real customers'],
  ['workflow_resume',
    'clears an automatic pause, so the workflow\'s triggers run it for real again. Hiveku paused it '
    + 'because its runs kept failing or it looped, so a workflow that is still broken fails again, '
    + 'and whatever it sends reaches real customers'],
  // A workflow's variables (release 0.27.73). See the note above the map.
  ['workflow_env_set',
    'creates or changes a workflow variable, and switched-on workflows use the new value from their '
    + 'next run with nobody watching. It can store a secret, or link one of a site\'s own environment '
    + 'variables, whose value a workflow\'s HTTP request step then sends to that site in a header'],
  ['workflow_env_delete',
    'removes a workflow variable, and switched-on workflows that still read it get nothing in its '
    + 'place from their next run, with nobody watching, so the steps that use it can stop working'],
  // The desktop app's Automations editor and Pending AI actions (2026-10-31, MCP feature/automations-desktop-tools):
  // running one step for real, and deciding an AI step's staged action. On the ask list too.
  ['workflow_node_run',
    'runs one step of a workflow for real (the steps before it are only simulated): an email, text, '
    + 'record change or outside call in that step happens to real customers and cannot be undone. '
    + 'workflow_test is the dry run'],
  ['workflow_pending_action_decide',
    'approves or rejects an action an AI step staged for a person. Approving sends the email or reply, '
    + 'or makes the change, for real at once; rejecting throws the staged action away. The decision is '
    + 'meant to be a person\'s'],
  // Switching email marketing on (release 0.27.76). See the note above the map.
  ['marketing_activate',
    'switches email marketing on, or runs its setup again. Where it was off or not set up, '
    + 'switched-on workflows\' Email Marketing: Send Email steps, which sent nothing until now, email '
    + 'real contacts from their next run with nobody watching, and drip emails held while it was off '
    + 'go out within minutes. attest_consent: true records a consent confirmation in the name of the '
    + 'person who created this connection'],
  // Conversions and audiences sent to the ad platforms.
  ['ppc_conversion_adjustments_run',
    'retracts or restates conversions Hiveku uploaded to Google and Microsoft; a retraction '
    + 'cannot be undone and moves Smart Bidding'],
  ['ppc_conversion_adjustments_set',
    'chooses which CRM outcomes the conversion-correction job retracts or restates on every run; '
    + 'once an owner has taken that lane live, those retractions reach Google and Microsoft and '
    + 'cannot be undone'],
  ['ppc_offline_conversion_upload',
    'uploads conversions to a Google Ads conversion action; Google keeps them and Smart Bidding '
    + 'starts learning from them, so a wrong row changes bidding before anyone notices'],
  ['ppc_customer_match_upload',
    'uploads hashed customer details to a Google Ads Customer Match list, and the confirmed call '
    + 'also accepts Google\'s Customer Match terms for the account; campaigns using the list then '
    + 'target or exclude those people'],
  ['ppc_meta_lead_quality_test',
    'sends an event into the client\'s Meta dataset; Meta keeps test events and uses them for '
    + 'targeting and measurement, and there is no way to take one back'],
  // The budget guardrail. See the note above the map.
  ['ppc_goals_set',
    'records the client\'s paid-ads goals, including each ad account\'s monthly budget target. '
    + 'The daily guardrail and any auto-pause the owner switched on are measured against that '
    + 'target, so clearing it switches the auto-pause off and raising it moves the pause point up'],
  ['ppc_budget_target_set',
    'sets or clears an ad account\'s monthly budget target. The daily guardrail and any '
    + 'auto-pause the owner switched on are measured against it, so clearing it switches the '
    + 'auto-pause off and raising it moves the pause point up'],
  ['ppc_connection_update',
    'changes an ad account connection: its budget guardrail and auto-pause settings, whether it '
    + 'is active, or its credentials. Clearing pause_at_pct or the budget target switches off an '
    + 'auto-pause the owner set, and new credentials stop syncing until the connection is tested'],
  // The desktop app's Ads area, wave B (2026-10-30). See the note above the map. On the ask list too.
  ['marketing_approval_approve',
    'carries out an action the Ads AI staged on the client\'s ad platforms, for real and as the person '
    + 'who owns this key, so what the client\'s ads serve and spend can change from that moment. The '
    + 'approval is meant to be a person\'s yes'],
  ['marketing_offline_conversions_go_live',
    'takes the conversion uploads out of validate-only: from then on conversions are recorded on the '
    + 'ad platforms for real, reach the client\'s automated bidding and cannot be un-sent'],
  ['ppc_conversion_adjustments_go_live',
    'takes the conversion corrections out of validate-only: from then on retractions and restatements '
    + 'change the conversion counts and values on Google and Microsoft for real, and a retraction '
    + 'cannot be undone'],
  ['ppc_meta_lead_quality_enable',
    'turns Meta lead quality on: from then on the client\'s qualified leads and won deals are sent to '
    + 'their Meta dataset, and an event Meta has received cannot be un-sent'],
  ['ppc_campaign_update',
    'changes a live campaign on its ad platform at once: enabled, it serves and spends from that '
    + 'moment, and a new daily or total budget changes what the client spends. A pause or a rename '
    + 'asks too, because the gate is on the tool name'],
  ['ppc_ad_group_status_set',
    'pauses or enables a live ad group on its ad platform at once; enabled, it serves and spends from '
    + 'that moment. A pause asks too, because the gate is on the tool name'],
  ['ppc_ad_status_set',
    'pauses or enables a live ad on its ad platform at once; enabled, it serves and spends from that '
    + 'moment. A pause asks too, because the gate is on the tool name'],
  ['marketing_offline_conversions_set_enabled',
    'arms or disarms a source that uploads conversions to an ad platform: armed, the next '
    + 'marketing_offline_conversions_run uploads from it, for real once the account is live'],
  ['marketing_offline_conversions_run',
    'finds and uploads offline conversions: on a live account they are recorded on the ad platforms '
    + 'for real, reach the client\'s automated bidding and cannot be un-sent'],
  ['marketing_offline_conversions_requeue',
    'queues the conversions parked during validate-only for real upload: on a live account the next '
    + 'run sends them to the ad platforms, and they cannot be un-sent'],
  ['marketing_offline_conversions_designate',
    'points a conversion source at an ad platform\'s conversion action and can arm it, so the next run '
    + 'uploads that source\'s conversions against it (for real once the account is live). It saves the '
    + 'whole designation again, and a field it is not sent is cleared'],
  // A live site, and the GA4 settings Google Ads conversions are imported from.
  ['agent_approval_approve',
    'carries out a staged coder-agent action for real: deploy_project deploys code to the '
    + 'client\'s live production site, and github_commit pushes to their repository. The approval '
    + 'is meant to be a person\'s yes'],
  ['seo_ga4_key_event_update',
    'changes a GA4 key event\'s counting method or value. The change is live at once and flows '
    + 'into every Google Ads conversion imported from it, which moves reported CPA and makes Smart '
    + 'Bidding relearn'],
  ['seo_ga4_event_create_rule_update',
    'changes a GA4 event create rule, live at once. Renaming its destination event, or dropping a '
    + 'condition (the list is replaced, not appended), can silently stop an imported Google Ads '
    + 'conversion'],
  // 0.27.14: server-confirm writes new in MCP #143 and #146.
  ['accounting_subscription_create',
    'starts a customer subscription and can charge the client\'s saved card for the first period at '
    + 'once; the preview_hash it confirms with is filled in by the model, not a person'],
  ['seo_ga4_custom_definition_archive',
    'archives a GA4 custom dimension or metric: reports on it stop at once and Google holds its slot '
    + 'for 48 hours, and the two-step confirm is filled in by the model'],
  // 0.27.19: joining the merge line (builder #977, MCP #182) is the approval to merge, and the
  // line then merges into its target unattended, so every call asks.
  ['project_vcs_queue_add',
    'adds a review to its merge line, which merges it into its target (into main: Your site) in '
    + 'the background with nobody asking again: joining the line is the approval to merge'],
  // 0.27.58: the account's timezone (builder #1576, MCP #243) moves every schedule and report day
  // at once, and a knowledge-source change (builder #1569, MCP #239) decides what the website
  // assistant may tell anyone who opens the chat. The builder can also pause the source change for
  // every person's key (403 agent_changes_not_enabled); this ask stays whether it does or not.
  ['account_timezone_set',
    'changes the account\'s timezone for everyone: scheduled posts and calendar days, report and '
    + 'dashboard day boundaries, and a phone receptionist with no zone of its own move with it; '
    + 'clearing it leaves each viewer\'s browser zone in charge'],
  ['helpdesk_assistant_knowledge_sources_update',
    'changes what the website assistant may tell anyone who opens the chat on the business\'s site: '
    + 'turning on its Google listing, website pages or documents, or sharing a knowledge base with '
    + 'it, lets visitors be told what those hold'],
  // 0.27.24: a site's secrets (plan B3). A write reaches the running site through the live
  // sync, and a key without a tier reaches production.
  ['project_secrets_set',
    'writes a site\'s environment variables; a key without a tier reaches production, and the '
    + 'change is synced into the running site at once'],
  ['project_secrets_delete',
    'removes a site\'s environment variable (with all: true, every one), and the running site '
    + 'loses it on its next sync or deploy'],
  ['project_secrets_apply_to_preview',
    'copies the site\'s stored development values into the live preview, where code an AI writes '
    + 'runs, and restarts it'],
  // 0.27.30: secrets writes at Render parity (builder #1063 and #1073, MCP #193).
  ['project_secrets_mark_sensitive',
    'makes a site\'s stored variables write-only: their values are never shown again, to people or '
    + 'to AI tools, and only a person can make one readable again, with a new value'],
  ['project_secrets_replace',
    'replaces one tier\'s environment variables with the set given: with apply it adds, changes and '
    + 'removes variables in one write, synced into the running site'],
  // 0.27.58: an account's environment groups (builder #1517, MCP #236). A group's variables reach
  // every site linked to it, so a write to the group, a link and an unlink each reach running sites
  // at once; create, rename and delete ask too, as in Codex and VS Code.
  ['env_group_create',
    'creates an account environment group, a set of variables every site linked to it receives; '
    + 'it reaches no site until variables are set and a site is linked'],
  ['env_group_update',
    'renames an account environment group or changes its description; people and agents pick '
    + 'groups by name, so a rename changes which group they link and edit'],
  ['env_group_delete',
    'deletes an account environment group and every value in it, which cannot be restored (a group '
    + 'still linked to a site is refused)'],
  ['env_group_set',
    'writes or removes variables in an account environment group; every site linked to it gets the '
    + 'change in its running functions at once, and a name without a tier reaches production'],
  ['env_group_link',
    'links an account environment group to a site: its variables join the site\'s environment in '
    + 'every tier, synced into the running site at once (the site\'s own variables still win)'],
  ['env_group_unlink',
    'unlinks an account environment group from a site: the running site loses the group\'s '
    + 'variables at once, which can break code that reads them'],
  // 2026-10-22: a site's trusted networks. On the hook as well as the ask list, so an install whose
  // settings predate this release asks too, instead of running it under the blanket allow.
  ['site_firewall_trust_range',
    'trusts one of a site\'s own networks at the edge firewall: that address range then skips the '
    + 'per-address limit on the site, so a wrong or too-wide range lets one network send the site '
    + 'unlimited counted requests'],
  // A site's server capacity and page caching (2026-10-24). See the note above the map.
  ['project_concurrency_set',
    'changes how many copies of a live site\'s server may run at once. A limit below its busy '
    + 'moments turns visitors\' requests into error pages, and removing a limit lets a burst open '
    + 'more database connections than the site\'s database allows'],
  ['project_page_cache_set',
    'switches page caching for a live site\'s Production. On, the edge keeps the pages the site '
    + 'marks as shareable and hands them to visitors without reaching the server; off, every view '
    + 'reaches the server again'],
  // Visitor Intelligence on a site (2026-10-27, HK-727, MCP #301 and #304). VS Code's HIVEKU_ASK has
  // asked since 0.91.29; MCP's DIRECT_CALL_ONLY_TOOLS follows once this and the Codex prompt ship.
  ['analytics_visitor_intelligence_start',
    'starts identifying the people and companies who visit a live site. Each one it finds counts '
    + 'against the account\'s monthly allowance, and stop_on_project_ids switches it off on the '
    + 'other sites named'],
  // Lead lists (2026-10-27, MCP #307). VS Code's HIVEKU_ASK asks for every lead list write from
  // 0.91.30 and Codex prompts for these two from 0.3.39.
  ['outbound_lead_list_run_start',
    'starts a run of a lead list column: it can spend money (email checks, AI calls) on every row '
    + 'it covers and add leads to an Outbound campaign that is sending, so they start getting its '
    + 'emails'],
  ['outbound_lead_list_run_control',
    'pauses, resumes or cancels a lead list run: resuming spends again and can add leads to a '
    + 'campaign that is sending'],
  // The desktop app's workflow grid (2026-11-01, MCP feature/lead-grid-desktop-tools, wave G): deleting a list or
  // rows, releasing held rows, the AI formula writer, imports and auto-run. On the ask list too.
  ['outbound_lead_grid_delete',
    'deletes a whole lead list with every row and column in it; it cannot be undone'],
  ['outbound_lead_grid_rows_delete',
    'deletes rows from a lead list, or every row matching a filter; undo cannot bring them back'],
  ['outbound_lead_grid_rows_hold',
    'holds or releases lead list rows: released rows are new to the list\'s auto-run again, which can spend on them and add them to a sending campaign'],
  ['outbound_lead_grid_formula_write',
    'asks Hiveku\'s AI to write a formula column, which spends the account\'s AI allowance'],
  ['outbound_lead_grid_import_start',
    'imports a CSV file\'s rows into a lead list, up to the list\'s limit, from a file a person uploaded'],
  ['outbound_lead_grid_import_auto_run',
    'lets an imported file\'s rows run through the list\'s auto-run, which spends money on each row; only a person in the Hiveku app may'],
  ['outbound_lead_grid_auto_run_enable',
    'turns a column\'s auto-run on or changes its monthly limit: it then spends money on new rows every month with nobody watching; only a person in the Hiveku app may'],
  ['outbound_lead_grid_auto_run_control',
    'pauses, resumes, continues or turns off a column\'s auto-run: resuming or continuing spends again; only a person in the Hiveku app may resume or continue'],
  // Contract alerts and templates (2026-10-30, Agent Feedback wave 73, HK-906 to HK-910): each can
  // add outside email addresses that receive a client's signed contract. On the ask list too, so
  // INSTALL.md, Codex, hiveku-sync and VS Code ask before them.
  ['crm_envelope_alerts_set',
    'can add outside email addresses that get a contract\'s alerts and the client\'s signed '
    + 'contract, or turn its alerts off'],
  ['crm_contract_template_create',
    'can add outside email addresses that get each client\'s signed contract for every contract '
    + 'started or bulk sent from the template'],
  ['crm_contract_template_update',
    'can add outside email addresses that get each client\'s signed contract for every contract '
    + 'started or bulk sent from the template'],
  // Contract starts, edits and signer changes (2026-10-30, wave 73 step A2): starting or editing a
  // contract can add outside addresses that get the client's signed contract, and reassigning a
  // signer emails a new person a signing link. On the ask list too.
  ['crm_envelope_create_from_template',
    'can start a contract with outside email addresses, given or copied from its template, that get '
    + 'the client\'s signed contract'],
  ['crm_envelope_signer_reassign',
    'changes who signs a sent contract and emails the new person a signing link'],
  ['crm_envelope_create',
    'can start a contract with outside email addresses that get its alerts and the client\'s signed '
    + 'contract'],
  ['crm_envelope_update',
    'can add outside email addresses that get a contract\'s alerts and the client\'s signed '
    + 'contract, or turn its alerts off'],
  // A site's test lead email and a content entry's scheduled publish (2026-10-30, Website Builder wave
  // B; builder #1896, MCP #345): the test sends a real email to the site's lead email addresses, and a
  // schedule publishes the site at the time it names (the whole site, HK-947). On the ask list too.
  ['marketing_form_notifications_test',
    'sends a real test lead email to this site\'s lead email addresses'],
  ['cms_schedule_set',
    'schedules a content entry to publish at a set time; Hiveku then publishes the whole site at '
    + 'that time'],
  // A contact email waiting to send, cancelled (2026-10-30, the desktop app's contact record; MCP
  // 52fbc5e5a8bd): the email will not go and the cancel cannot be undone. On the ask list too, beside
  // voice_sms_scheduled_cancel. Forced here as well, so an install whose settings predate this release
  // asks too, and so the VS Code extension's ask rule for it matches a prompt the plugin forces.
  ['crm_email_scheduled_cancel',
    'cancels a contact email that is waiting to send; it will not go and the cancel cannot be undone'],
  // The desktop app's SEO page, wave B (2026-10-30). See the note above the map. On the ask list too.
  ['seo_task_deploy',
    'publishes an SEO task\'s change to the client\'s live site at once, approved in the name of the '
    + 'person who owns this key, so visitors see it from that moment'],
  ['seo_gbp_post_create',
    'publishes a post on the client\'s live Google Business Profile, public as the business from that '
    + 'moment; its confirm: true is filled in by the model, not a person. The preview call asks too, '
    + 'because the gate is on the tool name'],
  ['seo_gbp_post_update',
    'changes a public post on the client\'s live Google Business Profile at once; its confirm: true is '
    + 'filled in by the model, not a person. The preview call asks too, because the gate is on the '
    + 'tool name'],
  ['seo_gbp_post_delete',
    'deletes a post from the client\'s live Google Business Profile for good, with no undo; its '
    + 'confirm: true is filled in by the model, not a person. The preview call asks too, because the '
    + 'gate is on the tool name'],
  ['seo_rankings_refresh',
    'runs rank checks now out of the plan\'s on-demand checks for the day (shared with the SEO page), '
    + 'one for each keyword on each platform, device and location it covers. A re-send counts them '
    + 'again'],
  ['seo_rankings_bulk_add',
    'starts tracking keywords, up to 1,000 rows in one call, each checked on a schedule from then on. '
    + 'Each keyword past the plan\'s included count is billed $1.50 a month'],
  ['seo_rankings_ai_backfill',
    'adds the AI search platforms to every tracked keyword of the account in one call, each checked '
    + 'from the next run. The bill does not change, but taking a platform off a keyword later deletes '
    + 'that platform\'s rank history'],
  ['seo_website_report_create',
    'makes a website report: it spends this month\'s research checks and publishes a report page that '
    + 'anyone with its link can open. A re-send makes a second report and spends again'],
  ['seo_website_report_delete',
    'deletes a website report for good, with no undo, and its public link stops working for everyone '
    + 'it was shared with'],
  ['seo_website_report_sections_set',
    'changes which sections a website report\'s shared page shows, and the client sees the change at '
    + 'once'],
  // The desktop app's site pages, wave S1 (2026-10-31; builder #1925, MCP #364): the Build Logs
  // drawer's Cancel build. See the note above the map. On the ask list too, beside deploy_serve_version.
  ['deploy_build_cancel',
    'stops this site\'s waiting and running builds: every build of the site unless build_type names '
    + 'one. The site keeps serving what it served before, so a change someone just published does not '
    + 'go live until it is deployed again'],
]);

/**
 * The reason a write always asks on a direct call, from either always-ask map,
 * or null when it is on neither.
 */
function alwaysAskReason(name) {
  return ALWAYS_ASK_WRITES.get(name) ?? LIVE_CHANGE_WRITES.get(name) ?? null;
}

/**
 * The full PRE-APPROVAL decision for one call: the server must declare the
 * tool a read (both name-pure gates in `isReadOnlyTool`), the name must not be
 * on NEVER_AUTO_APPROVE, and any argument predicate must pass for THIS call's
 * input. `isReadOnlyTool` itself stays name-pure — it answers about the tool,
 * this answers about the call.
 *
 * False here means "this plugin will not vouch for the call", NOT "this call is
 * blocked". Who decides after that is the caller's business: `decideForPayload`
 * turns false into silence for a single tool and into `ask` inside a batch.
 */
export function isAutoApprovable(bareName, toolInput) {
  if (!isReadOnlyTool(bareName)) return false;
  const name = bareName.toLowerCase();
  if (NEVER_AUTO_APPROVE.has(name)) return false;
  if (alwaysAskReason(name) !== null) return false;
  if (Object.prototype.hasOwnProperty.call(ARG_GATED_READS, name)) {
    try {
      return ARG_GATED_READS[name](toolInput) === true;
    } catch {
      return false; // a gate that cannot decide must not approve
    }
  }
  return true;
}

/**
 * The decision for one PreToolUse payload.
 *
 * Returns null when the hook should stay silent, which is the correct answer
 * for every tool that is not ours and every Hiveku tool that writes. Silence
 * means "no opinion" and leaves the normal permission flow untouched.
 *
 * ★ What silence RESOLVES TO is the user's settings, not a prompt. On a machine
 * configured per INSTALL.md that is `allow: ["mcp__plugin_hiveku_hk__*"]`, so
 * null runs the tool unprompted. Read that both ways before trusting this
 * function as a safety boundary:
 *   - a bug that returns null too often costs nothing, because the settings
 *     decide exactly as they would with no hook installed;
 *   - but null is ALSO how NEVER_AUTO_APPROVE and ARG_GATED_READS fail to bind
 *     (see their comments) — declining to pre-approve is not the same as
 *     gating, and only the batch branch below closes that gap.
 *
 * The single-tool path can therefore only ADD an approval. The batch path
 * deliberately does not: it returns `ask`, which a hook may do and which DOES
 * override a settings allow. `decideWithGuardrails` goes further and can
 * return `deny`. So "this hook never withholds" describes this path only.
 */
export function decideForPayload(payload) {
  const bare = hivekuToolName(payload?.tool_name);
  if (!bare) return null;
  // A batch is auto-approvable only if EVERY member is, judged on that member's
  // own arguments. Returning null here would be the bypass: null means "no
  // opinion", and a user whose settings allow the Hiveku MCP wildcard then runs
  // the batch unprompted - which is how a denied tool got laundered.
  const members = batchMemberNames(bare, payload?.tool_input);
  if (members !== null) {
    if (members === false) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason:
            `${bare} carries other tool calls but its \`calls\` list could not be read, so its `
            + 'members could not be checked. Confirm this one by hand.',
        },
      };
    }
    const calls = Array.isArray(payload?.tool_input?.calls) ? payload.tool_input.calls : [];
    // A version call that changes no file (a save with no files, a rollback
    // dry run) is judged exactly as it would be on its own: pre-approved.
    const gated = members.filter(
      (m, i) => !isAutoApprovable(m, calls[i]?.args)
        && argGatedWriteDecision(m, calls[i]?.args)?.decision !== 'allow',
    );
    if (gated.length === 0) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason:
            `Hiveku batch of ${members.length} tool(s); every member is pre-approved on its own `
            + '(a read, or a version call that changes no file).',
        },
      };
    }
    // HK-246: the reason used to say each member "would prompt on its own". Most writes do not:
    // on their own they follow the person's settings, and a blanket allow runs them unprompted.
    // The batch asks because it hides its members from those settings, so the reason says that
    // and how to avoid the prompt.
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          `${bare} contains ${gated.length} call(s) that are not pre-approved reads: `
          + `${[...new Set(gated)].slice(0, 8).join(', ')}. A batch asks once for all of them, `
          + 'because it hides each call from your own permission settings. Made one at a time, '
          + 'each call follows your settings, and the changes Hiveku always asks about still ask.',
      },
    };
  }
  // ★ SILENCE IS NOT A GATE — it is the blanket allow.
  //
  // This returned null for everything not auto-approvable, and null means "no
  // opinion". Under the permissions shape INSTALL.md hands out
  // (`allow: ["mcp__plugin_hiveku_hk__*"]`) no opinion IS the allow, so every
  // metered vendor read ran UNPROMPTED and billed the account — and so did
  // execute_js, which runs arbitrary JavaScript in a browser against a
  // third-party page. The classification correctly refused to pre-approve
  // them; the hook then said nothing, and nothing is a yes here.
  //
  // The batch path three branches up already returns an explicit `ask` for a
  // gated member. This is the same decision for a single call, which is the
  // form these are actually invoked in.
  //
  // Scoped to the sets we can justify naming: the writes on ALWAYS_ASK_WRITES
  // and LIVE_CHANGE_WRITES, reads that COST MONEY, and names on
  // NEVER_AUTO_APPROVE (a hazardous response, or code execution). Everything
  // else still returns null, so this cannot broaden into a prompt storm over
  // ordinary tools.
  if (!isAutoApprovable(bare, payload?.tool_input)) {
    const name = String(bare).toLowerCase();
    // The memory writes (lib/memory-tool-rules.mjs): the always-ask ones with a
    // reason that names who follows what changes, and a memory_create of a
    // rule, skill, shortcut or specialist that names no agent. Checked first
    // so the prompt names the agent instead of the set's generic text.
    const memoryRule = memoryWriteDecision(name, payload?.tool_input, payload?.cwd);
    if (memoryRule) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: memoryRule.decision,
          permissionDecisionReason:
            `${bare} ${memoryRule.reason}. Hiveku asks before every change like this, `
            + 'even when your settings allow all Hiveku tools. Confirm you want this change.',
        },
      };
    }
    // The always-ask writes (ALWAYS_ASK_WRITES, LIVE_CHANGE_WRITES): the third
    // set that asks on a direct call. Checked first so its own reason is
    // shown, not a read's.
    const alwaysAsk = alwaysAskReason(name);
    if (alwaysAsk !== null) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason:
            `${bare} ${alwaysAsk}. Hiveku asks before every change like this, `
            + 'even when your settings allow all Hiveku tools. Confirm you want this change.',
        },
      };
    }
    // The version tools (lib/vcs-tool-rules.mjs): a save with no files and a
    // rollback dry run are allowed; a save with files, a rollback apply and a
    // conflict resolve ask.
    const versionRule = argGatedWriteDecision(name, payload?.tool_input);
    if (versionRule) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: versionRule.decision,
          permissionDecisionReason: versionRule.reason,
        },
      };
    }
    const metered = isMeteredVendorRead(name);
    const vetoed = NEVER_AUTO_APPROVE.has(name);
    if (metered || vetoed) {
      const why = VETO_REASONS[name]
        ? `${bare} ${VETO_REASONS[name]}`
        : metered
          ? `${bare} reads a third-party API and BILLS THIS ACCOUNT for the call`
          : `${bare} reads, but its RESPONSE is the hazard (an unrevocable link, a plaintext `
            + 'credential, or a row it advances)';
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason:
            `${why}. It is deliberately not pre-approved, and without this prompt a blanket `
            + 'allow would run it unattended. Confirm you intend to spend/return it.',
        },
      };
    }
    return null;
  }
  return {
    // Envelope verified against Claude Code 2.1.114: `hookEventName` is
    // mandatory and the CLI THROWS on a mismatch, so it is spelled exactly.
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `Hiveku read-only tool (${bare}); the plugin pre-approves reads so a sweep does not stall on one permission check per tool.`,
    },
  };
}

/**
 * Per-folder guardrail ceilings — the claude-ads "absent ceilings mean no
 * write" model, adapted honestly.
 *
 * `.hiveku/guardrails.json` next to a folder's account.json declares what THIS
 * FOLDER'S sessions may do, regardless of who opened it. The owner writes it
 * once; a junior opening the client folder gets the ceiling, not the full
 * write surface. Shape:
 *
 *   { "version": 1,
 *     "mode": "full" | "reads-only",
 *     "deny_tools": ["ppc_budget_update", ...],     // always refused here
 *     "ask_tools":  ["email_campaign_send_now"],    // always prompt here
 *     "arg_ask":    { "social_create_post": ["scheduled_at", "scheduled_at_local"] } }
 *                                                   // prompt when a listed arg is SET
 *
 * `arg_ask` (2026-09-03, the social program) ceilings an ARGUMENT rather than
 * a tool. Creating a social draft is harmless; setting scheduled_at IS the
 * publish, because the every-minute cron ships whatever carries a time. An
 * ask_tools entry would prompt on every draft of a week plan, so the folder
 * names the field instead: the tool prompts only when one of its listed keys
 * is present in tool_input with a value other than null, undefined or ''.
 * A value that is not `{ tool: [names] }` (or an entry that is not an array)
 * is ignored, not fatal - the file parsed, and its other ceilings stand.
 *
 * Honest limits, stated where they matter: this is a CLIENT-SIDE rail. A
 * ceiling here beats convention and stops accidents; it does not stop a user
 * who edits the file. The wall that cannot be argued with is a read-only KEY
 * (connect the account read-only), and the file's own docs must say so.
 *
 * Precedence inside this hook: deny beats the reads-only ceiling beats
 * ask_tools beats arg_ask beats the read-only auto-allow. Inside hiveku_batch
 * every rule is judged per member on that member's own `args`, and the
 * strictest member decides (see decideWithGuardrails). Absent file = "full"
 * (no new restriction; the INSTALL.md ask-list and the user's own settings
 * still apply). Malformed file = fail CLOSED to reads-only for write tools,
 * because a broken ceiling that silently vanishes is how a cap stops existing
 * without anyone deciding that.
 */
function loadGuardrails(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  const home = os.homedir();
  for (let depth = 0; depth < 20; depth++) {
    if (dir === home || path.dirname(dir) === dir) break;
    const gp = path.join(dir, '.hiveku', 'guardrails.json');
    try {
      const raw = fs.readFileSync(gp, 'utf8');
      try {
        const g = JSON.parse(raw);
        return {
          mode: g?.mode === 'reads-only' ? 'reads-only' : 'full',
          deny: new Set(Array.isArray(g?.deny_tools) ? g.deny_tools : []),
          ask: new Set(Array.isArray(g?.ask_tools) ? g.ask_tools : []),
          argAsk: readArgAsk(g?.arg_ask),
          path: gp,
        };
      } catch {
        return { mode: 'reads-only', deny: new Set(), ask: new Set(), argAsk: new Map(), path: gp, malformed: true };
      }
    } catch { /* not at this level */ }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * The `arg_ask` ceiling as a Map of bare tool name -> argument names, or an
 * empty Map for anything that is not `{ tool: [name, ...] }`. Tolerant on
 * purpose: the file parsed, so its deny/ask/mode ceilings stand, and a typo in
 * this one block must not silently turn them off (that is what the malformed
 * branch above is for). Only non-empty string names count.
 */
function readArgAsk(raw) {
  const out = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [tool, names] of Object.entries(raw)) {
    if (!Array.isArray(names)) continue;
    const keys = names.filter((k) => typeof k === 'string' && k.trim() !== '');
    if (keys.length) out.set(tool, keys);
  }
  return out;
}

/**
 * Is `key` SET on a call's input? Present, and not null, undefined or ''.
 * Anything else counts, including 0 and false: the ceiling is on the field
 * being given, not on what it says.
 */
function argPresent(input, key) {
  if (!input || typeof input !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(input, key)) return false;
  const value = input[key];
  return value !== null && value !== undefined && value !== '';
}

/**
 * The first (tool, arg) the folder's arg_ask ceiling names among the calls
 * being judged: the one bare tool with its tool_input, or every batch member
 * with ITS OWN `args` (index-aligned with the member names, as in
 * decideForPayload). Null when nothing listed is set.
 */
function firstArgAskHit(argAsk, members, bare, toolInput) {
  if (!argAsk || argAsk.size === 0) return null;
  const calls = Array.isArray(toolInput?.calls) ? toolInput.calls : [];
  const pairs = members ? members.map((m, i) => [m, calls[i]?.args]) : [[bare, toolInput]];
  for (const [tool, input] of pairs) {
    const keys = argAsk.get(tool);
    if (!keys) continue;
    const hit = keys.find((k) => argPresent(input, k));
    if (hit) return { tool, arg: hit };
  }
  return null;
}

/**
 * Tools that carry OTHER tool calls inside their arguments.
 *
 * ★ THE BYPASS THIS CLOSES. Every gate in this file used to read one string:
 * the tool name on the payload. `hiveku_batch` puts the real calls in
 * `tool_input.calls[].tool`, so a batch of site_delete + deploy_site +
 * email_campaign_send_now presented as the single name `hiveku_batch`, matched
 * no deny rule, no ask rule and no read-only check, and fell through to the
 * user's own `allow: mcp__plugin_hiveku_hk__*` settings entry. Every one of
 * those calls prompts or is refused when made directly. Batched, they ran with
 * no prompt at all.
 *
 * A wrapper is only as safe as the strictest thing inside it, so the decision
 * below is the strictest member decision, and an unreadable wrapper is refused
 * rather than waved through.
 */
const BATCH_TOOLS = new Set(['hiveku_batch']);

/**
 * The bare tool names inside a wrapper call.
 *
 * Returns null when this is not a wrapper, and `false` when it IS one but the
 * members cannot be read - a distinction the callers depend on, because "not a
 * batch" and "a batch I cannot inspect" must not take the same branch.
 */
export function batchMemberNames(bare, toolInput) {
  if (!BATCH_TOOLS.has(String(bare).toLowerCase())) return null;
  const calls = toolInput?.calls;
  if (!Array.isArray(calls) || calls.length === 0) return false;
  const names = [];
  for (const c of calls) {
    const n = typeof c?.tool === 'string' ? c.tool.trim() : '';
    // One unreadable member makes the whole batch unreadable. Skipping it would
    // decide the batch on the members that happened to parse.
    if (!n) return false;
    names.push(n.startsWith(HIVEKU_TOOL_PREFIX) ? n.slice(HIVEKU_TOOL_PREFIX.length) : n);
  }
  return names;
}

export function decideWithGuardrails(payload) {
  const bare = hivekuToolName(payload?.tool_name);
  if (!bare) return null;
  const g = loadGuardrails(payload?.cwd);
  // A wrapper is judged by what it carries. `false` means it IS a batch whose
  // members could not be read, which is refused outright below rather than
  // being allowed to fall through to the wrapper's own (harmless) name.
  const members = batchMemberNames(bare, payload?.tool_input);
  if (g) {
    const readOnly = members === null
      ? isNonMutatingTool(bare)
      : Array.isArray(members) && members.every((m) => isNonMutatingTool(m));
    const refuse = (reason) => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    });
    const prompt = (reason) => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    });
    if (members === false) {
      return refuse(
        `${bare} carries other tool calls and this folder has guardrails (${g.path}), but its `
        + '`calls` list could not be read, so the members cannot be checked against them. A '
        + 'ceiling that cannot see what it is ceilinging fails closed. Make the calls '
        + 'individually, or fix the batch arguments.',
      );
    }
    const deniedMembers = (members || [bare]).filter((m) => g.deny.has(m));
    if (deniedMembers.length > 0) {
      const via = members ? ` (inside ${bare})` : '';
      return refuse(
        `${[...new Set(deniedMembers)].join(', ')}${via} is denied by this folder's guardrails ` +
        `(${g.path}). The account owner set a ceiling for this client; work within it or ask ` +
        'them to change the file.',
      );
    }
    if (!readOnly && (g.mode === 'reads-only' || g.malformed)) {
      // A metered vendor read is not a writer: a reads-only ceiling must permit
      // it, or SEO research breaks in exactly the folders most likely to have
      // a ceiling set.
      const writers = members ? members.filter((m) => !isNonMutatingTool(m)) : [];
      const subject = writers.length ? `${writers.join(', ')} (inside ${bare})` : bare;
      return refuse(
        `${subject} writes, and this folder is ceilinged to reads-only` +
        (g.malformed
          ? ` because its guardrails file is MALFORMED (${g.path}) - a broken ceiling fails closed. Fix the JSON to restore writes.`
          : ` (${g.path}). The account owner set this; report what you would have done instead of doing it.`),
      );
    }
    const askMembers = (members || [bare]).filter((m) => g.ask.has(m));
    if (askMembers.length > 0) {
      const via = members ? ` (inside ${bare})` : '';
      return prompt(
        `${[...new Set(askMembers)].join(', ')}${via} is on this folder's always-ask list (${g.path}).`,
      );
    }
    // ── A read whose RESPONSE is the hazard still needs an operator ─────────
    // The ceiling above asks "does this tool write". NEVER_AUTO_APPROVE exists
    // for tools that do not write and are still not safe to run unattended:
    // voice_recording_url_get mints an unauthenticated, non-revocable link to a
    // call recording, and minting it IS the distribution.
    //
    // Those names are server-declared GETs, so `readOnly` above is true and the
    // ceiling had no opinion — it fell through to the user's blanket allow and
    // ran unprompted. An owner who set `reads-only` on a client folder
    // specifically to stop recordings leaving got no protection from the one
    // setting that looked like it was for exactly that.
    //
    // Ask rather than deny: the tool is a legitimate read, so this makes it an
    // explicit operator decision, which is what NEVER_AUTO_APPROVE asks for.
    const vetoedMembers = (members || [bare]).filter((m) => NEVER_AUTO_APPROVE.has(m.toLowerCase()));
    if (vetoedMembers.length > 0) {
      const via = members ? ` (inside ${bare})` : '';
      const named = [...new Set(vetoedMembers)];
      // A tool with its own stated reason gets it; the default sentence is only
      // used where it is actually true. Saying "its RESPONSE is the hazard"
      // about execute_js would point the operator at the wrong risk.
      const specific = named.filter((n) => VETO_REASONS[n]);
      const why = specific.length
        ? specific.map((n) => `${n} ${VETO_REASONS[n]}`).join('; ')
        : 'reads, but its RESPONSE is the hazard (an unrevocable link, a plaintext credential, '
          + 'or a row it advances)';
      return prompt(
        `${named.join(', ')}${via} ${why}, so this folder's ceiling (${g.path}) will not run it ` +
        'unattended. Confirm you intend to run it.',
      );
    }
    // arg_ask: the ceiling is on a FIELD being set, judged per member on that
    // member's own args. Below ask_tools on purpose - a tool the folder always
    // prompts for is reported as that, not as an argument hit.
    const argHit = firstArgAskHit(g.argAsk, members, bare, payload?.tool_input);
    if (argHit) {
      const via = members ? ` inside ${bare}` : '';
      return prompt(
        `guardrails: ${argHit.tool} called with ${argHit.arg} (this folder asks before that)${via}. `
        + `Ceiling: ${g.path}`,
      );
    }
  }
  return decideForPayload(payload);
}
