import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, bodyError, NEEDS_PARAMS_RE } from '../lib/sweep-classify.mjs';

/**
 * The sweep's whole value is the sentence "these N tools are broken". Every
 * misclassification costs that sentence twice — a real failure buried under
 * noise, or a healthy tool reported as broken to someone who then goes looking
 * for an incident that does not exist.
 *
 * Both directions have now happened on a live account:
 *   PPC-12  a 200 carrying {"error":"Missing required parameter: id"} was
 *           counted as `ok`, and the tool it marked green turned out to 500 on
 *           every real input.
 *   PPC-metrics  "Provide one of: campaign_id | ad_group_id | ad_id" was filed
 *           as an ERROR, because the pattern knew "pass one of" and
 *           "must provide" but not "provide one of".
 *
 * These fix the phrasing in place so the next route wording does not quietly
 * reopen it.
 */

/** The MCP result shape for a tool that answered with an error envelope. */
const isErrorResult = (text) => ({ result: { isError: true, content: [{ text }] } });
/** The MCP result shape for a 200 whose failure is in the body. */
const okEnvelope = (text) => ({ result: { content: [{ text }] } });

test('a parameter refusal is needs-params, in every phrasing the routes use', () => {
  const refusals = [
    // The one that was misfiled for weeks (ppc_metrics).
    'Provide one of: campaign_id | ad_group_id | ad_id',
    'Missing required parameter: id',
    'Specify one of: a | b',
    'You must supply one of campaign_id or ad_group_id',
    'Provide exactly one of: x | y',
    'at least one of campaign_id, ad_group_id is required',
    'Pass exactly one of ad_group_id or campaign_id',
    'validation failed: connection_id',
  ];
  for (const text of refusals) {
    assert.equal(
      classify(isErrorResult(text)).status,
      'needs-params',
      `"${text}" should be a parameter refusal, not a failure`,
    );
  }
});

test('a real failure stays an error and is never laundered into needs-params', () => {
  const failures = [
    'Olympus API returned 500',
    'Hiveku returned HTTP 502. [ppc_google_ads] client library=31.4.0 google-ads-api=unknown',
    'The network edge in front of Hiveku stopped waiting for a response (HTTP 524)',
    'Connection not found',
    'Hiveku returned a response that was not JSON',
  ];
  for (const text of failures) {
    assert.equal(
      classify(isErrorResult(text)).status,
      'error',
      `"${text}" is a genuine failure and must be reported as one`,
    );
  }
});

test('the rate-limit message stays detectable, so pacing still engages', () => {
  // callOnce greps the classified detail for /rate limit/i to decide whether to
  // back off. A classification change that dropped the phrase from `detail`
  // would silently turn the sweep's pacing off and reproduce the 547-false-
  // failures run.
  const text = 'Rate limit exceeded. Maximum 100 requests per 60 seconds. Retry after 12 seconds';
  const c = classify(isErrorResult(text));
  assert.match(c.detail, /rate limit/i);
});

test('a 200 carrying an error body is a failure, not a pass', () => {
  // PPC-12: this exact shape was reported `ok`.
  const c = classify(okEnvelope('{"error":"Olympus API returned 500"}'));
  assert.equal(c.status, 'error');
  // and the reported detail is the unwrapped error, not the raw envelope
  assert.equal(c.detail, 'Olympus API returned 500');
});

test('a 200 whose error body is a parameter refusal is needs-params', () => {
  const c = classify(okEnvelope('{"error":"Missing required parameter: id"}'));
  assert.equal(c.status, 'needs-params');
});

test('a tool that answered is ok', () => {
  assert.equal(classify(okEnvelope('{"data":[{"id":"1"}]}')).status, 'ok');
  assert.equal(classify(okEnvelope('[]')).status, 'ok');
});

test('the isError branch classifies on the FULL text, not the truncated detail', () => {
  // `short()` cuts at 160 chars. Testing the truncation made the verdict depend
  // on how far into the envelope the phrase happened to sit — so an envelope
  // that pushes the keyword past the cut must still classify correctly.
  const padding = 'x'.repeat(400);
  const text = `{"context":"${padding}","error":"Provide one of: campaign_id | ad_group_id | ad_id"}`;
  assert.ok(text.length > 160);
  assert.equal(classify(isErrorResult(text)).status, 'needs-params');
});

test('bodyError reads a top-level error only, and treats absent/false as no error', () => {
  assert.equal(bodyError('{"error":"boom"}'), 'boom');
  assert.equal(bodyError('[{"error":"boom"}]'), 'boom');
  assert.equal(bodyError('{"data":{"error":"nested is not top-level"}}'), null);
  assert.equal(bodyError('{"error":null}'), null);
  assert.equal(bodyError('{"error":false}'), null);
  assert.equal(bodyError('not json at all'), null);
  assert.equal(bodyError(''), null);
});

test('the needs-params pattern does not match an empty or trivial string', () => {
  // A pattern broad enough to match anything would silently reclassify every
  // failure as "the tool just wants arguments".
  assert.equal(NEEDS_PARAMS_RE.test(''), false);
  assert.equal(NEEDS_PARAMS_RE.test('ok'), false);
  assert.equal(NEEDS_PARAMS_RE.test('{}'), false);
});

/**
 * ── The narrow-fix problem (INFRA-02) ────────────────────────────────────────
 *
 * The ppc_metrics fix above was applied to the PHRASE it was reported with,
 * so the pattern learned "provide one of" and nothing else. An account-wide
 * sweep of 806 read-only tools then found four more parameter refusals still
 * filed as failures, in three shapes the verb list cannot reach:
 *
 *   crm_contacts_missing_field     "field must be one of: email, phone, …"
 *   social_analytics_by_dimension  "group_by must be one of: hook, format, …"
 *   social_posts_analytics_list    "Pass post_ids (comma-separated UUIDs) or a
 *                                   from_date/to_date window."
 *   workflow_resolve_short_id      "`short_id` must be 4-12 hex characters …"
 *
 * The first two are `<param> must BE one of` — the verb is "be", and the
 * pattern only knows pass/provide/specify/supply/give/include/set. The third
 * is "Pass X or Y" with no "one of" at all. The fourth carries no enum: it is
 * a FORMAT constraint on a named parameter.
 *
 * Every one of these strings was captured from a live sweep, not imagined —
 * which matters, because the previous fix was fitted to the single sample it
 * was reported with and that is exactly why these four survived it.
 *
 * ★ THE ASYMMETRY IS REAL BUT NOT UNLIMITED. sweep-classify.mjs argues that a
 * false "needs-params" costs one tool reported as uncovered while a false
 * "error" manufactures an incident. True — but a genuinely broken tool filed
 * as needs-params does not get reported as uncovered, it vanishes into a
 * bucket nobody reads. So the guard test below is load-bearing: it holds real
 * failures OUT of the bucket, and it is the half of this change that must
 * never be relaxed to make a matching test pass.
 */
test('a parameter refusal is needs-params in the shapes a live sweep actually found', () => {
  const refusals = [
    // `<param> must be one of` — the verb is "be", not one of the action verbs.
    'field must be one of: email, phone, first_name, last_name, job_title, lead_source, owner_id, assigned_to_id, lead_status',
    'group_by must be one of: hook, format, pillar, persona, stage, platform, asset, grid',
    // "Pass X or Y" — alternatives, with no "one of" to anchor on.
    'Pass post_ids (comma-separated UUIDs) or a from_date/to_date window.',
    // A format constraint on a named parameter, carrying no enum at all.
    '`short_id` must be 4-12 hex characters (the prefix the dashboard displays).',
  ];
  for (const text of refusals) {
    assert.equal(
      classify(isErrorResult(text)).status,
      'needs-params',
      `"${text}" is a live route refusing for want of an argument the sweep withheld — ` +
        'filing it as a failure buries the real ones',
    );
  }
});

/**
 * The other half, and the one that keeps the change honest. Broadening a
 * needs-params pattern is how a sweep stops reporting real breakage: these are
 * the failures the Locus report was actually built to surface, and several are
 * deliberately adjacent to the phrasings above.
 */
test('a genuine failure is never laundered into needs-params', () => {
  const failures = [
    // PPC-04/05/08 — the bare wrapper, and a 500 with no fault attached.
    '[ppc_google_ads] client library=31.4.0 google-ads-api=unknown',
    'Olympus API returned 500',
    'Auction Insights is a Google Ads UI-only report — Google does not expose it through the API',
    // Adjacent to the enum shape above, but describing a BROKEN state.
    'The provided rule_type is not supported for the user list.',
    'The operation is not allowed for the given context.',
    "The string date's format should be yyyy-mm-dd.",
    // Says "must" about a thing that is not a parameter the caller withheld.
    'the campaign must be enabled before an experiment can start',
    'upstream timed out after 30000ms',
    'ECONNREFUSED 10.0.0.4:443',
  ];
  for (const text of failures) {
    assert.equal(
      classify(isErrorResult(text)).status,
      'error',
      `"${text}" is a real failure — laundering it into needs-params hides it in ` +
        'the one bucket nobody reads',
    );
  }
});

/**
 * ── "ERRORS 106" when nothing is broken ──────────────────────────────────────
 *
 * The same account-wide sweep that found the four refusals above reported 106
 * errors. Adjudicating every one of them against the live corpus:
 *
 *     97  not connected      "No Webflow connection is active for this account"
 *      5  not entitled       sales_agent_disabled, no_brand
 *      4  parameter refusal  (the four fixed above)
 *   ─────
 *      0  actually broken
 *
 * This is PPC-12 inverted, and worse by magnitude. PPC-12 overstated health by
 * counting an error body as a pass; this overstates BREAKAGE 106-to-0, and it
 * does it in the headline number a person reads to decide whether to go
 * looking for an incident. A sweep whose failure list is 100% noise trains its
 * reader to ignore the failure list — at which point the one real regression
 * lands in a bucket nobody opens.
 *
 * "No Webflow connection" is not a defect and is not a withheld argument
 * either: no argument the sweep could pass would make it succeed. It is a
 * property of the ACCOUNT, so it gets its own bucket rather than being folded
 * into a neighbour that would misdescribe it.
 */
test('an unexercisable tool is unavailable — not an error, not needs-params', () => {
  const unavailable = [
    'No Webflow connection is active for this account. Connect a Webflow site first.',
    'No Shopify connection is active for this account. Connect a store first (shopify_connect_start).',
    'No Bing Webmaster connection configured for this account',
    'HubSpot not connected for this account',
    'GoHighLevel not connected for this account',
    'No active Gmail connection found on this account',
    'sales_agent_disabled',
    'no_brand',
  ];
  for (const text of unavailable) {
    assert.equal(
      classify(isErrorResult(text)).status,
      'unavailable',
      `"${text}" cannot be exercised on this account — no argument would make it ` +
        'succeed, so counting it as a failure manufactures an incident',
    );
  }
});

/**
 * The guard, again, and for the same reason: a bucket that hides things is
 * only safe while it hides exactly the right things. Every string here is a
 * real failure, and several deliberately sit close to the connection phrasings
 * above — ECONNREFUSED contains "CONN", and "does not expose" contains "not".
 */
test('the unavailable bucket never swallows a real failure', () => {
  const failures = [
    'ECONNREFUSED 10.0.0.4:443',
    'Auction Insights is a Google Ads UI-only report — Google does not expose it through the API',
    'The provided rule_type is not supported for the user list.',
    'Olympus API returned 500',
    '[ppc_google_ads] client library=31.4.0 google-ads-api=unknown',
    'upstream timed out after 30000ms',
    'connection reset by peer',
  ];
  for (const text of failures) {
    assert.equal(
      classify(isErrorResult(text)).status,
      'error',
      `"${text}" is a real failure and must stay in the failure list`,
    );
  }
});
