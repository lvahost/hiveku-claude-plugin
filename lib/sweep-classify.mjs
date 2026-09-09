/**
 * How the tool sweep decides whether a result is a pass, a parameter refusal,
 * or a failure.
 *
 * ── Why this is its own module ────────────────────────────────────────────
 * It lived inside scripts/sweep-tools.mjs, which runs `main()` on import and
 * exports nothing, so none of it could be tested. That is how two
 * misclassifications survived a live account sweep: a 200-with-an-error-body
 * counted as a pass (PPC-12), and `ppc_metrics` refusing with "Provide one of:
 * campaign_id | ad_group_id | ad_id" was filed as an ERROR because the regex
 * only knew "pass one of" and "must provide".
 *
 * A sweep exists to answer "what is actually broken". Every misclassification
 * costs that answer twice: a real failure buried under noise, or a healthy
 * tool reported as broken. Both are worse than not sweeping.
 */

const short = (v, n = 160) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
};

/**
 * "The tool wants an argument this sweep withheld" -- as distinct from "the
 * tool is broken".
 *
 * ★ Match the phrasing the ROUTES actually use, not the phrasing this regex
 * was first written against. `ppc_metrics` refuses with "Provide one of:
 * campaign_id | ad_group_id | ad_id" and was bucketed as an ERROR for weeks
 * because the pattern only knew "pass one of" and "must provide". A sweep that
 * files a healthy tool's parameter refusal as a failure buries the real ones,
 * which is the entire reason it is worth running.
 *
 * The verb list is deliberately broad and the object list is narrow: the cost
 * of a false "needs-params" is one tool reported as uncovered, while the cost
 * of a false "error" is a manufactured incident.
 */
/**
 * "This account cannot exercise this tool at all" -- as distinct from both
 * "broken" and "wants an argument".
 *
 * ★ WHY THIS BUCKET EXISTS. An 806-tool account-wide sweep reported 106
 * errors. Adjudicated one by one against the live results: 97 not connected,
 * 5 not entitled, 4 parameter refusals the pattern above now catches, and
 * ZERO actually broken. That is PPC-12 inverted -- it overstates breakage in
 * the exact number a reader uses to decide whether to go looking for an
 * incident, and a failure list that is 100% noise teaches its reader to stop
 * opening it.
 *
 * These are not needs-params either, and the distinction is the whole point:
 * no argument the sweep could pass would make "No Webflow connection is
 * active for this account" succeed. It is a property of the ACCOUNT. Folding
 * it into needs-params would inflate the coverage ceiling with tools that can
 * never be covered from here.
 *
 * Checked BEFORE the parameter pattern: unavailability dominates: a tool that
 * also wants arguments still cannot be run on an account with no connection.
 */
const UNAVAILABLE_RE = new RegExp(
  [
    // "No Webflow connection is active…", "No Bing Webmaster connection
    // configured…", "No active Gmail connection found on this account".
    // Bounded by [^.] so it cannot reach across a sentence into unrelated prose.
    '\\bno\\b[^.]{0,60}\\bconnections?\\b',
    // "HubSpot not connected for this account". Deliberately "not connected"
    // and not merely "connect", so ECONNREFUSED and "connection reset by peer"
    // -- real transport failures -- stay in the failure list.
    '\\bnot connected\\b',
    // "Connect a Webflow site first" / "Connect a store first (…)"
    '\\bconnect (?:a|an|your) [^.]{0,40}\\bfirst\\b',
    // Terse entitlement codes returned as the whole body: sales_agent_disabled,
    // no_brand. Anchored end-to-end so the words cannot match inside prose.
    '^\\s*\\w*_?disabled\\s*$',
    '^\\s*no_\\w+\\s*$',
  ].join('|'),
  'i',
);

const NEEDS_PARAMS_RE = new RegExp(
  [
    // Explicit "you left something out" vocabulary.
    'required|missing|invalid_?param|expected .* argument|validation',
    // "<verb> [exactly|at least|either] one of ..."
    '(?:must |please )?(?:pass|provide|specify|supply|give|include|set)\\s+(?:exactly\\s+|at least\\s+|either\\s+)?one of',
    'one of .* is required',
    'requires? (?:a|an|the) \\w+',

    // ── Added after an account-wide sweep (INFRA-02) ────────────────────────
    // The three shapes the verb list above cannot reach. Each is a string a
    // live route actually returned, not a guessed phrasing.

    // "field must be one of: email, phone, …"  /  "group_by must be one of: …"
    // The verb is "be". Anchored on "one of", which no real failure in the
    // guard corpus uses, so the subject can be anything.
    'must be one of',

    // "Pass post_ids (comma-separated UUIDs) or a from_date/to_date window."
    // An imperative naming a PARAMETER-SHAPED argument. The underscore (or
    // backticks) is what makes this safe: it distinguishes naming an argument
    // from prose that happens to start with the same verb. Note this cannot
    // fire on "The provided rule_type is not supported" — `provide` there is
    // followed by "d", not whitespace.
    '(?:pass|provide|specify|supply|give|include|set)\\s+`?\\w+_\\w+`?',

    // "`short_id` must be 4-12 hex characters (the prefix the dashboard displays)."
    // A FORMAT constraint carrying no enum. Requires the subject to be
    // parameter-shaped — backticked, or snake_case — precisely so that
    // "the campaign must be enabled before an experiment can start" (a broken
    // STATE, not a withheld argument) stays an error.
    '(?:`\\w+`|\\b\\w+_\\w+\\b)\\s+must be',
  ].join('|'),
  'i',
);

/**
 * The top-level `error` a tool put in its own JSON body, or null.
 *
 * ★ A 200 IS NOT A PASS. The transport is healthy on every Hiveku tool call —
 * the Olympus routes answer 200 and put failures in the BODY, and the MCP
 * result carries no isError for them. Classifying on the envelope alone marked
 * ppc_campaign_get "ok" while its own recorded detail read
 * {"error":"Missing required parameter: id"}, and that tool turned out to 500
 * on every real input. A sweep that counts an error body as a pass does not
 * measure health, it manufactures it (Locus PPC report, PPC-12).
 */
function bodyError(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch { return null; }
  const node = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!node || typeof node !== 'object') return null;
  // Some routes nest the payload under `data`; an error is always top-level.
  const err = node.error ?? node.errors;
  if (err === undefined || err === null || err === false) return null;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

/**
 * Classify one tool result.
 *
 * A tool that rejects empty arguments is NOT broken -- it wants parameters this
 * sweep has no business inventing. Reporting that as a failure would bury the
 * real ones, which is the whole reason a sweep is worth running.
 *
 * But "it wants parameters" and "it is fine" are different answers, and only
 * one of them may be counted as coverage. Three buckets, never two-and-a-half:
 *   unavailable  — the account cannot exercise it at all (no connection, not
 *                  entitled); no argument would help, so it is neither broken
 *                  nor uncovered-for-want-of-arguments;
 *   needs-params — the tool refused for want of an argument the sweep withheld;
 *   error        — anything else that failed, INCLUDING a 200 with an error body;
 *   ok           — the tool answered.
 */
function classify(msg) {
  if (msg?.error) {
    const text = `${msg.error.message || ''} ${JSON.stringify(msg.error.data || '')}`;
    // Report the same string that was classified: a needs-params signal living
    // in error.data used to classify correctly and then vanish from the report.
    if (UNAVAILABLE_RE.test(text)) return { status: 'unavailable', detail: short(text) };
    if (NEEDS_PARAMS_RE.test(text)) {
      return { status: 'needs-params', detail: short(text) };
    }
    return { status: 'error', detail: short(text) };
  }
  const result = msg?.result;
  const text = (result?.content || []).map((c) => c.text || '').join(' ');
  if (result?.isError) {
    // Classify on the FULL text and report the UNWRAPPED error, like the other
    // two branches. Testing the 160-char truncation made the verdict depend on
    // how far into the envelope the phrase happened to sit.
    const inner = bodyError(text);
    const full = inner ?? text;
    const detail = short(full);
    if (UNAVAILABLE_RE.test(full)) return { status: 'unavailable', detail };
    if (NEEDS_PARAMS_RE.test(full)) return { status: 'needs-params', detail };
    return { status: 'error', detail };
  }
  const inBody = bodyError(text);
  if (inBody !== null) {
    const detail = short(inBody);
    if (UNAVAILABLE_RE.test(inBody)) return { status: 'unavailable', detail };
    if (NEEDS_PARAMS_RE.test(inBody)) return { status: 'needs-params', detail };
    return { status: 'error', detail };
  }
  return { status: 'ok', detail: short(text, 80) };
}

export { short, bodyError, classify, NEEDS_PARAMS_RE, UNAVAILABLE_RE };
