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
