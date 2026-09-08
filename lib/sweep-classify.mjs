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
const NEEDS_PARAMS_RE =
  /required|missing|invalid_?param|expected .* argument|validation|(?:must |please )?(?:pass|provide|specify|supply|give|include|set)\s+(?:exactly\s+|at least\s+|either\s+)?one of|one of .* is required|requires? (?:a|an|the) \w+/i;

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
 *   needs-params — the tool refused for want of an argument the sweep withheld;
 *   error        — anything else that failed, INCLUDING a 200 with an error body;
 *   ok           — the tool answered.
 */
function classify(msg) {
  if (msg?.error) {
    const text = `${msg.error.message || ''} ${JSON.stringify(msg.error.data || '')}`;
    // Report the same string that was classified: a needs-params signal living
    // in error.data used to classify correctly and then vanish from the report.
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
    if (NEEDS_PARAMS_RE.test(full)) return { status: 'needs-params', detail };
    return { status: 'error', detail };
  }
  const inBody = bodyError(text);
  if (inBody !== null) {
    const detail = short(inBody);
    if (NEEDS_PARAMS_RE.test(inBody)) return { status: 'needs-params', detail };
    return { status: 'error', detail };
  }
  return { status: 'ok', detail: short(text, 80) };
}

export { short, bodyError, classify, NEEDS_PARAMS_RE };
