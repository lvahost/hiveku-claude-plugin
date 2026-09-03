/**
 * Which Hiveku tools this plugin will pre-approve, and which it will not vouch
 * for.
 *
 * ★ Scope, stated once so no comment below has to imply more than it delivers:
 * this file feeds a PreToolUse hook, and a hook's realistic power is to ADD an
 * allow. Declining to add one (the NEVER_AUTO_APPROVE and ARG_GATED_READS
 * lists) does not take away an allow the user's settings already grant — under
 * the INSTALL.md shape it changes nothing at all for a direct call. The two
 * places this file genuinely withholds are the `hiveku_batch` branch (`ask`)
 * and `.hiveku/guardrails.json` (`deny`/`ask`). Everything else is a
 * convenience layer over the permission system, not a replacement for it.
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

/** Is this bare Hiveku tool name safe to auto-approve? Both gates must pass. */
export function isReadOnlyTool(bare) {
  if (typeof bare !== 'string' || !bare) return false;
  const name = bare.toLowerCase();
  if (!READ_ONLY.has(name) && !EXTRA_READ_ONLY.has(name)) return false;
  if (WRITE_VERBS.test(name)) return false;
  return true;
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
 * incident that earned the entry. This set can only ever SHRINK the surface
 * THIS PLUGIN pre-approves, never grow it — and, per the warning above, never
 * shrink the surface the user's own settings already allow.
 */
export const NEVER_AUTO_APPROVE = new Set([
  'voice_recording_url_get',
  'voice_tts_preview',
  'design_render_job_get',
  'marketing_form_attachment_download_url',
  // 2026-09-03: a GET that can register a media_assets pointer row for the hero image.
  'social_repurpose_source',
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
    const gated = members.filter((m, i) => !isAutoApprovable(m, calls[i]?.args));
    if (gated.length === 0) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason:
            `Hiveku batch of ${members.length} read-only tool(s); every member is a pre-approved read.`,
        },
      };
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          `${bare} contains ${gated.length} call(s) that are not auto-approved reads: `
          + `${[...new Set(gated)].slice(0, 8).join(', ')}. Batching does not lower the bar - `
          + 'each of these would prompt on its own.',
      },
    };
  }
  if (!isAutoApprovable(bare, payload?.tool_input)) return null;
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
      ? isReadOnlyTool(bare)
      : Array.isArray(members) && members.every((m) => isReadOnlyTool(m));
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
      const writers = members ? members.filter((m) => !isReadOnlyTool(m)) : [];
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
