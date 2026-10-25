/**
 * Narrow the advertised tool list to the departments a directory cares about.
 *
 * ── The problem, measured ─────────────────────────────────────────────────
 * The account exposes ~1,531 tools. A session's context breakdown, taken from
 * a real machine:
 *
 *     MCP tools        447.4k tokens   223.7% of budget   (1753 tools)
 *     Free space            0            0.0%
 *
 * The context is full before the first message. A handful of tool calls then
 * tips it into "Prompt is too long", which reads as "the sweep was too big"
 * and is actually "there was never any room".
 *
 * ★ TOOL SEARCH DOES NOT SOLVE THIS, and believing it did cost a day. Deferral
 * withholds a tool's INPUT SCHEMA; the name and description still ship for
 * every tool, every session. Hiveku's descriptions are unusually long -- 203
 * chars on average and over 4,600 for the worst -- so ~255 tokens per tool are
 * spent before anyone types. Measured with the toggle ON.
 *
 * The only lever that moves that number is advertising fewer tools:
 *
 *     everything (today)   ~1005 tools   ~256k tokens
 *     ads work              207 tools    ~53k
 *     ads + seo             319 tools    ~81k
 *     crm / sales           239 tools    ~61k
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 * ★ A CONTEXT OPTIMISATION, NOT A SECURITY BOUNDARY. Every tool still exists
 * server-side and the key still reaches all of them; this only changes what is
 * ADVERTISED. The real boundary is a scoped key, minted with one of the
 * server's profiles. Anyone reading this to mean "the assistant cannot touch
 * accounting now" would be wrong, and that misreading is worse than the tokens.
 *
 * For the same reason, filtering applies to `tools/list` ONLY, never to
 * `tools/call`. A tool that is out of focus but named explicitly -- by a
 * playbook, a skill, or the person -- still works. Hiding a tool from a menu is
 * a kindness; making it fail is a bug.
 *
 * ★ A client runs only a tool it was GIVEN, though (HK-692: "No such tool
 * available" for a tool hiveku_tool_schema had just reported available). So an
 * out-of-focus tool is reached in one of two ways, and both survive every
 * focus: looking it up with hiveku_tool_schema adds it to the session's list
 * (lib/shim.mjs; the `keep` set below), and hiveku_batch runs it by name.
 *
 * ── Aliases ───────────────────────────────────────────────────────────────
 * A focus word is normally the tool name's first token, but `seo` is an ALIAS
 * (lib/dept-aliases.mjs): it also keeps the DataForSEO vendor prefixes
 * (`backlinks_`, `dataforseo_labs_`, `serp_`, `on_page_`, `keywords_data_`,
 * `content_analysis_`, `domain_analytics_`, `business_data_`,
 * `ai_optimization_`, bare `crawl`) that a first-token match could never
 * reach. `localseo` and `aeo` alias the manifest's department ids. Every
 * other focus word matches exactly as before.
 */
import { deptMatches } from './dept-aliases.mjs';

/**
 * Tools that must survive every filter.
 *
 * The first five are what every key can always call, scoped or not, so a
 * focused directory must not lose them. The rest are how a session works out
 * where it is and what it is allowed to do -- `hiveku-orient` opens by calling
 * them, and `/hiveku:start` cannot function without them.
 */
export const ALWAYS_AVAILABLE = new Set([
  'list_departments',
  'talk_to_department',
  'web_search',
  'fetch_url',
  'audit_query',
  'get_account_info',
  'account_context_get',
  'account_entitlements',
  // The plan and its usage: a focused folder still reads where the account
  // stands against its plan before work the plan counts, and after a limit.
  'account_usage_get',
  'account_audit_health',
  'connections_status',
  'list_projects',
  'sites_list',
  // The feedback loop (2026-09-24): a focused folder must still be able to
  // report a Hiveku defect or a missing capability, and to hear back.
  'hiveku_report_issue',
  'hiveku_request_feature',
  'hiveku_feedback_status',
  'hiveku_feedback_followup',
  // How an out-of-focus tool is still reached (HK-692, header above): a
  // lookup adds it to the list, and a batch runs it by name. Their first
  // token is `hiveku`, so no department focus kept them.
  'hiveku_tool_schema',
  'hiveku_batch',
  // The PM task loop, as in lib/tool-index.mjs CORE_TOOLS (HK-692): every
  // department's work is logged on a PM task, so a focus on one department
  // must not hide reading, creating or commenting on one.
  'pm_tasks_list',
  'pm_tasks_create',
  'pm_tasks_comment',
]);

/**
 * Department is the tool name's first underscore-separated token, which is how
 * this surface is already organised: `ppc_*`, `crm_*`, `seo_*`. A handful of
 * tools are bare verbs (`list_projects`, `deploy_site`) and belong to no
 * department -- they are only ever reachable via ALWAYS_AVAILABLE or an
 * explicit call, which is the conservative outcome.
 */
export function departmentOf(toolName) {
  if (typeof toolName !== 'string' || !toolName) return null;
  const i = toolName.indexOf('_');
  return i === -1 ? null : toolName.slice(0, i).toLowerCase();
}

/**
 * Normalise what a person wrote into department tokens.
 * Accepts an array or a comma/space separated string; ignores junk.
 */
export function parseFocus(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,\s]+/);
  const out = [];
  for (const item of raw) {
    const d = String(item ?? '').trim().toLowerCase();
    if (!d || !/^[a-z][a-z0-9]*$/.test(d)) continue;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * Filter an MCP `tools/list` payload.
 *
 * An empty or absent focus means NO filtering -- the full surface, exactly as
 * before. Focus is opt-in, so an existing directory behaves identically until
 * someone chooses otherwise.
 *
 * `keep` (optional, a Set of names): tools this session promoted into its list
 * (a hiveku_tool_schema lookup, lib/shim.mjs). They survive the focus, because
 * the model asked for them by name.
 */
export function filterTools(tools, focus, keep = null) {
  if (!Array.isArray(tools)) return tools;
  const wanted = parseFocus(focus);
  if (!wanted.length) return tools;
  return tools.filter((t) => {
    const name = t?.name;
    if (typeof name !== 'string') return true;   // never drop something unrecognisable
    if (ALWAYS_AVAILABLE.has(name)) return true;
    if (keep && keep.has(name)) return true;
    // deptMatches is the first-token rule plus the aliases; a bare name
    // (no underscore) still only survives through an alias's names list.
    return wanted.some((d) => deptMatches(name, d));
  });
}

/**
 * A one-line report for the session banner, or null when nothing is filtered.
 * Silence when there is no focus: a banner that fires for everyone is noise.
 */
export function describeFocus(total, kept, focus) {
  const wanted = parseFocus(focus);
  if (!wanted.length || kept >= total) return null;
  return (
    `Hiveku: showing ${kept} of ${total} tools (${wanted.join(', ')}). ` +
    'This trims context only — every tool is still reachable if named directly. ' +
    'Run /hiveku:focus to change or clear it.'
  );
}
