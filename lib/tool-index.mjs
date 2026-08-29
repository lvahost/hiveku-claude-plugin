/**
 * Search the local tool catalogue instead of advertising all of it.
 *
 * ── The trade this replaces ───────────────────────────────────────────────
 * Advertising every tool costs ~255 tokens each — 447.4k measured, 224% of the
 * budget, before the first message. Hiding tools by department buys that back
 * but destroys discovery: you must already know which department owns the
 * answer before you can look for it, and the interesting questions cross
 * departments ("are leads recording?" spans seo, analytics and voice).
 *
 * So: advertise a small always-useful core plus ONE search tool, and keep the
 * full catalogue on disk. Everything stays findable; nothing is paid for until
 * it matches.
 *
 * ★ SEARCH IS NOT A GATE. `tools/call` is never filtered — a tool that was
 * never surfaced still runs when named. This shortens a menu; it does not
 * restrict access, and the real access boundary remains a scoped key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let CACHE = null;
export function loadIndex() {
  if (CACHE) return CACHE;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'tool-index.json'), 'utf8'));
    CACHE = Array.isArray(raw?.tools) ? raw.tools : [];
  } catch {
    // No index means we must NOT switch to index mode — falling back to
    // advertising everything is worse than ideal but always correct, whereas
    // advertising a search tool that finds nothing is a dead end.
    CACHE = [];
  }
  return CACHE;
}

/** Tools worth advertising unconditionally: orientation, and the five every key can call. */
export const CORE_TOOLS = [
  'get_account_info',
  'account_context_get',
  'account_entitlements',
  'account_audit_health',
  'connections_status',
  'list_departments',
  'talk_to_department',
  'list_projects',
  'sites_list',
  'audit_query',
  'web_search',
  'fetch_url',
];

export const FIND_TOOL_NAME = 'hiveku_find_tools';

/**
 * The synthetic tool that replaces ~1,500 definitions.
 *
 * Its description has to do real work: a model that does not realise the rest
 * of the surface exists will answer "Hiveku cannot do that" instead of
 * searching, which is a worse failure than the token cost this saves.
 */
export function findToolDefinition(total) {
  return {
    name: FIND_TOOL_NAME,
    description:
      `Search all ${total} Hiveku tools by keyword and get their exact names and descriptions. ` +
      'ONLY a small core set is listed directly; everything else — CRM, PPC, SEO, email, social, ' +
      'voice, accounting, projects, commerce, helpdesk, workflows, PM — is found through here. ' +
      'ALWAYS search before concluding a capability is missing: if it is not in your tool list, ' +
      'that means it was not listed, not that it does not exist. ' +
      'Every tool a search returns is ADDED to your callable tool list at that moment, so search ' +
      'first, then call. Example queries: "google ads wasted spend", "conversion tracking", ' +
      '"list contacts", "send invoice", "rankings".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords describing what you want to do.' },
        department: {
          type: 'string',
          description: 'Optional filter, e.g. ppc, seo, crm, email, voice, accounting, project.',
        },
        limit: { type: 'number', description: 'Max results (default 15, max 50).' },
      },
      required: ['query'],
    },
  };
}

/**
 * ★ `get` and `all` are NOT stopwords here, though they are in ordinary prose.
 *
 * This is a catalogue where `get` is a core verb — `project_get`, `get_project`,
 * `deploy_get`. Stripping it meant a query of `project_get` reduced to
 * `["project"]`, could never match the tool exactly, and returned `get_project`
 * instead. Naming a tool precisely and being handed a different one is the worst
 * failure a search can have.
 */
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'is', 'are', 'my', 'me', 'i', 'what', 'how']);

/**
 * Score a tool against query terms.
 *
 * A name hit outweighs a description hit heavily: `crm_contact_list` matching
 * "contact" is a far stronger signal than some unrelated tool that mentions
 * contacts in passing. Whole-token name matches outrank substring matches for
 * the same reason.
 */
function score(tool, terms, department) {
  if (department && tool.dept !== department) return 0;
  const name = tool.name.toLowerCase();
  const nameTokens = new Set(name.split('_'));

  // ★ An EXACT name, anywhere in the query, outranks everything.
  //
  // Without this, `project_get` and `get_project` split to the same token set,
  // score identically, and the alphabetical tiebreak returned the WRONG one
  // first — so naming a tool exactly still did not find it. That is the worst
  // possible search behaviour: confident, wrong, and indistinguishable from a
  // hit.
  if (terms.length && terms.join('_') === name) return 1000;
  const desc = (tool.description || '').toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (nameTokens.has(t)) s += 10;
    else if (name.includes(t)) s += 5;
    if (desc.includes(t)) s += 1;
  }
  // ★ The terms as a COMPOUND identifier, e.g. "dev preview url" ->
  // `dev_preview_url`. A description that names the exact field someone is
  // asking for is a far stronger signal than a tool whose NAME happens to share
  // one common word — which is how "development environment url" returned
  // `fetch_url` and four media tools while missing `project_get`, the one tool
  // that actually returns it.
  if (terms.length > 1) {
    const compound = terms.join('_');
    if (name.includes(compound)) s += 25;
    else if (desc.includes(compound)) s += 20;
  }

  // Every term matched somewhere is much better than one term matching loudly.
  const covered = terms.filter((t) => name.includes(t) || desc.includes(t)).length;
  if (covered === terms.length && terms.length > 1) s += 5;
  return s;
}

export function searchTools(query, { department = '', limit = 15, focus = [], readOnlySet = null } = {}) {
  const tools = loadIndex();
  const terms = String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
  const dept = String(department ?? '').trim().toLowerCase();
  const cap = Math.max(1, Math.min(50, Number(limit) || 15));

  // A directory focus narrows what search reaches BY DEFAULT - this is what
  // makes the 0.8.0 commit's claim true. An explicit department argument from
  // the model overrides it: focus is a default, never a wall.
  const focusSet = !dept && Array.isArray(focus) && focus.length
    ? new Set(focus.map((f) => String(f).toLowerCase()))
    : null;
  const inFocus = (t) => !focusSet || focusSet.has(t.dept);

  // A read-only key CAN still see write tools (the server refuses the call,
  // authoritatively), but recommending them wastes a turn and teaches the
  // model the key is broken. Annotate rather than hide: the model should know
  // the capability exists and why it is out of reach.
  const annotate = (t) =>
    readOnlySet && !readOnlySet.has(t.name) ? { ...t, blockedByScope: true } : t;

  if (!terms.length) {
    // No usable terms: a department listing is still a useful answer, and an
    // empty result would read as "Hiveku has nothing for this".
    return tools.filter((t) => (!dept || t.dept === dept) && inFocus(t)).slice(0, cap).map(annotate);
  }
  return tools
    .filter(inFocus)
    .map((t) => ({ t, s: score(t, terms, dept) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name))
    .slice(0, cap)
    .map((x) => annotate(x.t));
}

/** Render results as the text content of an MCP tool result. */
export function renderResults(matches, query) {
  if (!matches.length) {
    return (
      `No Hiveku tool matched "${query}". Try broader keywords (e.g. "ads" rather than ` +
      '"google ads campaign budget pacing"), or call list_departments to see the areas available.'
    );
  }
  // ★ Trim HERE, not in the index. The index keeps full text so search can
  // match on it; the model only needs enough to choose.
  //
  // ★ NEVER TRIM BY TAKING THE HEAD ALONE. Hiveku descriptions put the
  // orientation first and the load-bearing fact LAST — the response shape, the
  // null-means-not-deployed rule, the fallback ladder. A flat 500-char head cut
  // `project_get` one sentence before its response shape, so a search for it
  // rendered a result that never showed the field the session was looking for.
  // The session concluded the tool could not answer and read a memory file
  // instead. There was even a test asserting the description CONTAINED the
  // field: the fix had been made in the index and silently undone here.
  //
  // So: keep the head, then keep the two things Hiveku descriptions put last on
  // purpose — ★ segments, the convention for a fact someone already got burned
  // by, and the `Response shape:` sentence, which is the field list a model
  // needs before it can use what it just called.
  const HEAD = 420;
  const KEEP_BUDGET = 1100;
  const TAIL = 260;
  const MARKER = /★|Response shape/g;

  const brief = (d) => {
    const s = String(d ?? '');
    if (s.length <= HEAD + 80) return s;

    const cut = s.slice(0, HEAD);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' • '), cut.lastIndexOf('\n'));
    const head = (stop > 160 ? cut.slice(0, stop + 1) : cut).trimEnd();

    // Scan the REMAINDER for marker positions, so nothing is repeated from the
    // head and the runs can never overlap: each run ends where the next begins.
    const rest = s.slice(head.length);
    const starts = [];
    MARKER.lastIndex = 0;
    for (let m; (m = MARKER.exec(rest)); ) starts.push(m.index);

    const kept = [];
    let used = 0;
    for (let i = 0; i < starts.length; i++) {
      const run = rest.slice(starts[i], starts[i + 1] ?? rest.length).trim().replace(/\s+/g, ' ');
      if (!run) continue;
      if (used + run.length > KEEP_BUDGET) {
        const room = KEEP_BUDGET - used;
        if (room > 80) kept.push(run.slice(0, room).trimEnd() + '…');
        break;
      }
      kept.push(run);
      used += run.length;
    }
    // ★ When a description marks nothing, STILL KEEP A TAIL. Measured: only 5
    // of ~1,650 descriptions use ★ or `Response shape:`, but 268 run past 900
    // chars, and the closing sentence is where this catalogue habitually puts
    // the gotcha ("call X first", "this is stale", "not the same table"). A
    // head-only trim loses that on all 263 of them.
    if (!kept.length) {
      const tailCut = rest.slice(-TAIL);
      const from = tailCut.search(/(?<=[.!?])\s+/);
      const excerpt = (from > -1 ? tailCut.slice(from) : tailCut).trim().replace(/\s+/g, ' ');
      if (excerpt.length > 40) kept.push('… ' + excerpt);
    }
    const tail = kept.length ? '\n    ' + kept.join('\n    ') : '';
    return head + (head.length < s.length ? ' …' : '') + tail;
  };
  const lines = matches.map(
    (m) => `${m.name}${m.method ? `  [${m.method}]` : ''}` +
      `${m.blockedByScope ? '  [NOT callable with this read-only key]' : ''}\n    ${brief(m.description)}`,
  );
  const callable = matches.filter((m) => !m.blockedByScope).length;
  return (
    `${matches.length} Hiveku tool(s) matching "${query}". ` +
    (callable
      ? `The ${callable === matches.length ? '' : `${callable} callable `}tools above have just been ` +
        'added to your tool list and can be called now. '
      : '') +
    (callable < matches.length
      ? 'Tools marked read-only-blocked exist but this connection\'s key cannot call them - the ' +
        'account was connected read-only on purpose, so report the limitation rather than retrying. '
      : '') +
    `\n\n${lines.join('\n\n')}`
  );
}

/** Build the advertised list: core tools that exist upstream, plus the search tool. */
export function indexModeTools(upstreamTools, exposed = null) {
  const total = loadIndex().length;
  if (!total) return upstreamTools;      // no index — advertise everything, as before
  const core = new Set(CORE_TOOLS);
  // `exposed` is the session's promoted set: every tool a hiveku_find_tools
  // search has surfaced. Promotion is what closes the discovery-to-call loop -
  // a client only dispatches tool_use for REGISTERED tools, so a found tool
  // must join the advertised list (with its REAL schema, which only the
  // upstream list has; the on-disk index deliberately carries none) or it is
  // findable but uncallable. The upstream list is already server-filtered by
  // scope and profile, so a name absent from it stays unadvertised no matter
  // what was searched: promotion can never widen what the key can see.
  const kept = upstreamTools.filter((t) => core.has(t?.name) || (exposed && exposed.has(t?.name)));
  return [findToolDefinition(total), ...kept];
}
