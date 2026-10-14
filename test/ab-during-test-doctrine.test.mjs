/**
 * What the CRO, PPC and SEO texts say about a page A/B test that is running.
 *
 *   - CRO: while a test runs or is paused, neither page changes (a change mixes two versions into
 *     one result); a page that must change means ending the test, or ending it and starting a new
 *     one, and saying why. The second version is changed in the copy's files, never the original's.
 *   - PPC: list the site's tests before a budget, bid, targeting, audience or final-URL change on a
 *     campaign that lands on a tested page; hold the change or say it skews the result; final URLs
 *     stay on the original; a route sends one platform's clicks to its own page; page tests are not
 *     the ad platforms' campaign experiments.
 *   - SEO: the test copy is canonical to the original and kept out of the sitemap on purpose; the
 *     canonical travels in the HTTP headers, not the HTML, and a route's page gets none; the
 *     A/B redirect is a temporary 302; a running or recently ended test is ruled out first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Collapse whitespace and drop backticks so a pinned phrase may wrap and carry code marks. */
const flat = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/`/g, '').replace(/\s+/g, ' ');

const CRO = 'skills/hiveku-analytics-agency/references/cro-experiments.md';
const CRO_ANALYST = 'agents/hiveku-cro-analyst.md';
const PPC_SKILL = 'skills/hiveku-ppc-agency/SKILL.md';
const PPC_ANALYST = 'agents/hiveku-ppc-analyst.md';
const SEO_SKILL = 'skills/hiveku-seo-agency/SKILL.md';
const SEO_ANALYST = 'agents/hiveku-seo-analyst.md';

test('CRO: neither page changes while a test runs or is paused; end the test and say why', () => {
  const cro = flat(CRO);
  assert.ok(cro.includes('while a test runs or is paused, change neither page, the original or the second version.'));
  assert.ok(cro.includes('A change mixes two versions into one result'));
  assert.ok(cro.includes('If a page must change, end the test (or end it and start a new one) and tell the user why.'));
  assert.ok(cro.includes("/hiveku:code on the copy's files (never the original's), then a production deploy"));
  const analyst = flat(CRO_ANALYST);
  assert.ok(analyst.includes('While a test runs or is paused, neither page changes, the original or the second version'));
  assert.ok(analyst.includes('the plan says to end the test (or end it and start a new one) and why.'));
});

test('PPC: list the tests before a spend or URL change, keep final URLs on the original, routes, not campaign experiments', () => {
  for (const rel of [PPC_SKILL, PPC_ANALYST]) {
    const text = flat(rel);
    assert.ok(text.includes('budget, bid, targeting, audience or final-URL change on a campaign that lands on a Hiveku-hosted site'), rel);
    assert.ok(/hold the change until (it|the test) ends, or say plainly (in the plan )?that it will skew the result/.test(text), rel);
    assert.ok(/Keep (the )?ad(s')? final URLs on the original page; the split happens on the site and keeps gclid and UTM tags\./.test(text), rel);
    assert.ok(text.includes("A route can send one ad platform's clicks to a page of its own without changing the ad."), rel);
    assert.ok(/[Pp]age A\/B tests? (are|is) not (one of )?the ad platforms' own campaign experiments/.test(text), rel);
  }
  assert.ok(flat(PPC_SKILL).includes('list the site\'s tests (project_ab_tests_list)'));
  assert.ok(flat(PPC_ANALYST).includes('Page tests on the landing site: project_ab_tests_list'));
});

test('SEO: the copy is canonical and out of the sitemap on purpose, the redirect is a 302, rule out a test first', () => {
  for (const rel of [SEO_SKILL, SEO_ANALYST]) {
    const text = flat(rel);
    assert.ok(text.includes('A test copy (an address like /pricing-b) is canonical to the original while its test runs'), rel);
    assert.ok(text.includes('kept out of the sitemap on purpose'), rel);
    assert.ok(/link to it, add it to the sitemap or "fix" it as duplicate content/.test(text), rel);
    assert.ok(text.includes('The A/B redirect is a temporary 302'), rel);
    // The edge sends the canonical as an HTTP header, and never for a route's page.
    assert.ok(text.includes("The canonical is sent in the page's HTTP headers, not in its HTML, so an audit that reads only the HTML reports it missing."), rel);
    assert.ok(text.includes("A route's page gets no canonical."), rel);
    assert.ok(text.includes('running or recently ended'), rel);
  }
  // In the analyst it sits in the ordered "rule out the artifact" list, before the world.
  const analyst = flat(SEO_ANALYST);
  const ruleOut = analyst.indexOf('rule out the artifact in this order');
  const abTest = analyst.indexOf('a running or recently ended page A/B test or route on the page');
  const world = analyst.indexOf('and only then the world');
  assert.ok(ruleOut >= 0 && abTest > ruleOut && world > abTest);
});
