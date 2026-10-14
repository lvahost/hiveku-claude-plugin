/**
 * Routes and tests for some visitors, as the CRO texts teach them (A/B tests phase 2).
 *
 * A route sends the visitors who match an audience to a page made for them. What the texts say
 * about it has to be what Hiveku does:
 *   - a route remembers a visitor who allowed analytics for the visit when nobody is kept on the
 *     original, and for 90 days when a share is kept; "stays routed for the visit" was true only
 *     without a share;
 *   - a click id counts as an ad click only when utm_medium does not say the visit was unpaid,
 *     the rule Hiveku's own source reports use (an organic post's link can carry fbclid too);
 *   - the audience shapes live in the `audience` parameter's own description: a pointer to the
 *     create tool's description lands past the 2,048 characters Claude Code shows of it;
 *   - a route or a test for some visitors needs `audience_ready`, not only `can_start_tests`;
 *   - a route keeping nobody on the original reads out with nothing to compare, and one that starts
 *     keeping a share later is compared from then on (`comparedFrom`);
 *   - on one page, routes are checked first and tests for some visitors next, each group in the order
 *     its tests started, then the test for everyone;
 *   - visitors who have not allowed analytics are not counted, and only a split test shows them
 *     the original: a route still sends them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace and drop backticks so a pinned phrase may wrap and carry code marks. */
const flat = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ');

const CRO = 'skills/hiveku-analytics-agency/references/cro-experiments.md';
const ANALYST = 'agents/hiveku-cro-analyst.md';

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}
const PROSE = [...walk('skills'), ...walk('commands'), ...walk('agents')];

/** The utm_medium values that say a visit was not paid, in the order Hiveku's source reports list them. */
const NON_PAID = ['social', 'organic', 'referral', 'email', 'newsletter', 'organic_social', 'organic-social', 'organic social', 'post', 'bio'];

test('a route remembers a visitor for the visit with nobody kept, and for 90 days with a share kept', () => {
  const cro = flat(read(CRO));
  assert.ok(
    cro.includes(
      'A visitor who allowed it is remembered for the visit when nobody is kept on the original, and for 90 days ' +
        'when a share is kept: a later visit that does not match (no click id, say) is still routed, or kept on the original.',
    ),
  );
  assert.ok(cro.includes('One who did not, or who withdrew it, is sent only on a request that carries the match.'));
  assert.ok(cro.includes('Only visitors who allowed analytics can be kept: the others are always sent.'));
  for (const rel of PROSE) assert.ok(!flat(read(rel)).includes('stays routed for the visit'), rel);
});

test('a click id is an ad click only when utm_medium does not say the visit was unpaid', () => {
  const list = `${NON_PAID.slice(0, -1).join(', ')} or ${NON_PAID.at(-1)}`;
  assert.ok(
    flat(read(CRO)).includes(
      `A click id counts as an ad click only when the visit's utm_medium does not say it was unpaid (${list}), ` +
        "the same rule Hiveku's own source reports use",
    ),
  );
});

test('the audience shapes are pointed to in the audience parameter, not in the create description', () => {
  const cro = flat(read(CRO));
  assert.ok(cro.includes('The exact shapes are in the description of the audience parameter itself (on project_ab_test_create and project_ab_test_update).'));
  assert.ok(!cro.includes('The exact shapes are in the project_ab_test_create description'));
});

test('a route needs an audience: one without is refused, as the builder refuses it (audience_required)', () => {
  assert.ok(flat(read(CRO)).includes('a draft like any test (a route without an audience is refused);'));
});

test('a route or a test for some visitors reads audience_ready, not only can_start_tests', () => {
  const cro = flat(read(CRO));
  assert.ok(cro.includes('A route or a test for some visitors also needs the edge to read audiences: audience_ready, and when false audience_why_not; until then it cannot start or resume.'));
  assert.ok(flat(read(ANALYST)).includes('(can_start_tests, why_not; for a route or a test for some visitors, audience_ready, audience_why_not)'));
});

test('a route keeping nobody compares nothing, and one that starts keeping a share later compares from then on', () => {
  const cro = flat(read(CRO));
  assert.ok(cro.includes('with nothing to compare (no lift, chance or p-value)'));
  assert.ok(cro.includes('A route that starts keeping a share later is compared only on the visitors from then on (comparedFrom in its results).'));
  // Routes first and tests for some visitors next, each group by when it started, then the test for everyone.
  assert.ok(cro.includes('routes first and tests for some visitors next, both in the order they started, then the one test for everyone; the first that applies wins.'));
  assert.ok(!cro.includes('tests for some visitors in the order they started'));
});

test('visitors without analytics are not counted, and only a split test shows them the original', () => {
  const cro = flat(read(CRO));
  assert.ok(!cro.includes('see the original and are not counted'), 'a route still sends them');
  assert.ok(cro.includes('are not counted, and a split test shows them the original (a route still sends them).'));
  assert.ok(cro.includes('are not counted (a split test shows them the original; a route still sends them)'));
  assert.ok(cro.includes('every visitor counted keeps the version they got for 90 days'));
});
