/**
 * Which Hiveku tools are safe to auto-approve, and which must still be asked.
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
const EXTRA_READ_ONLY = new Set(['list_departments']);

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
 * The decision for one PreToolUse payload.
 *
 * Returns null when the hook should stay silent, which is the correct answer
 * for every tool that is not ours and every Hiveku tool that writes. Silence
 * means "no opinion" and leaves the normal permission flow untouched -- the
 * hook may only ever ADD an approval, never withhold one, so a bug here can
 * make Claude ask more often but never less.
 */
export function decideForPayload(payload) {
  const bare = hivekuToolName(payload?.tool_name);
  if (!bare) return null;
  if (!isReadOnlyTool(bare)) return null;
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
 *     "ask_tools":  ["email_campaign_send_now"] }   // always prompt here
 *
 * Honest limits, stated where they matter: this is a CLIENT-SIDE rail. A
 * ceiling here beats convention and stops accidents; it does not stop a user
 * who edits the file. The wall that cannot be argued with is a read-only KEY
 * (connect the account read-only), and the file's own docs must say so.
 *
 * Precedence inside this hook: deny beats ask beats the read-only auto-allow.
 * Absent file = "full" (no new restriction; the 25-tool INSTALL.md ask-list
 * and the user's own settings still apply). Malformed file = fail CLOSED to
 * reads-only for write tools, because a broken ceiling that silently vanishes
 * is how a cap stops existing without anyone deciding that.
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
          path: gp,
        };
      } catch {
        return { mode: 'reads-only', deny: new Set(), ask: new Set(), path: gp, malformed: true };
      }
    } catch { /* not at this level */ }
    dir = path.dirname(dir);
  }
  return null;
}

export function decideWithGuardrails(payload) {
  const bare = hivekuToolName(payload?.tool_name);
  if (!bare) return null;
  const g = loadGuardrails(payload?.cwd);
  if (g) {
    const readOnly = isReadOnlyTool(bare);
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
    if (g.deny.has(bare)) {
      return refuse(
        `${bare} is denied by this folder's guardrails (${g.path}). The account owner set a ` +
        'ceiling for this client; work within it or ask them to change the file.',
      );
    }
    if (!readOnly && (g.mode === 'reads-only' || g.malformed)) {
      return refuse(
        `${bare} writes, and this folder is ceilinged to reads-only` +
        (g.malformed
          ? ` because its guardrails file is MALFORMED (${g.path}) - a broken ceiling fails closed. Fix the JSON to restore writes.`
          : ` (${g.path}). The account owner set this; report what you would have done instead of doing it.`),
      );
    }
    if (g.ask.has(bare)) {
      return prompt(`${bare} is on this folder's always-ask list (${g.path}).`);
    }
  }
  return decideForPayload(payload);
}
