/**
 * What the CRO, PPC and SEO texts say about A/B tests after phase 3 (goals, results by source,
 * "Also compared", notifications, edit warnings, and what happens to the test copy after a test).
 *
 *   - CRO: the goals include stayed 30/60 seconds, scrolled 50/75% and bought something; secondary
 *     goals and alsoCompared never decide the verdict; results break down by traffic channel and ad
 *     platform; a save on a tested page answers abTestWarnings; promote and remove_copy answer a
 *     preview without confirm, and the copy's address becomes a permanent 301 only after the next
 *     production deploy. "Making the winner the page is a code change" is no longer true.
 *   - PPC: "did Version B win for Google Ads clicks?" is read from the ad platform rows, and a
 *     promote needs no ad change.
 *   - SEO: after a promote or a removal the copy's address is a permanent 301 that stays.
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
const CRO_COMMAND = 'commands/cro.md';
const PPC_SKILL = 'skills/hiveku-ppc-agency/SKILL.md';
const PPC_ANALYST = 'agents/hiveku-ppc-analyst.md';
const SEO_SKILL = 'skills/hiveku-seo-agency/SKILL.md';
const SEO_ANALYST = 'agents/hiveku-seo-analyst.md';

test('CRO: the phase 3 goals, and secondary goals never decide', () => {
  const cro = flat(CRO);
  assert.ok(cro.includes('{ "type": "engaged", "seconds": 30 | 60 }'));
  assert.ok(cro.includes('{ "type": "scrolled", "depth": 50 | 75 }'));
  assert.ok(cro.includes('{ "type": "purchase" }'));
  assert.ok(cro.includes('Secondary goals never decide the verdict'));
  assert.ok(cro.includes('Only a storefront built or rebuilt on Hiveku since purchases became a goal puts that id on the cart, and only for visitors who allowed analytics'));
  assert.ok(cro.includes('A new main goal on a running or paused test recalculates the whole result'));
});

test('CRO: results by channel and ad platform, alsoCompared is context, notifications, edit warnings', () => {
  const cro = flat(CRO);
  assert.ok(cro.includes('by traffic channel (channels) and by ad platform (adPlatforms)'));
  assert.ok(cro.includes('"Not from an ad"'));
  assert.ok(cro.includes('It is context and never decides the verdict: the main goal does.'));
  assert.ok(cro.includes('is rough below 30 buyers'));
  assert.ok(cro.includes('when it pauses a test, when a verdict is reached'));
  assert.ok(cro.includes('answers abTestWarnings'));
  assert.ok(cro.includes('records page_changed'));
  for (const rel of [CRO_ANALYST, CRO_COMMAND]) {
    const text = flat(rel);
    assert.ok(text.includes('channels, adPlatforms'), rel);
    assert.ok(/never decides? the winner/.test(text), rel);
    assert.ok(text.includes('abTestWarnings'), rel);
  }
});

test('CRO: promote and remove_copy preview first, and the 301 comes after the next production deploy', () => {
  const cro = flat(CRO);
  assert.ok(cro.includes('action: "promote"'));
  assert.ok(cro.includes('action: "remove_copy"'));
  assert.ok(cro.includes('Without confirm: true it answers a preview'));
  assert.ok(cro.includes("once the next production deploy that carries it is live (/hiveku:deploy, with its own yes), Hiveku adds a permanent 301 from the copy's address to the original"));
  for (const code of ['not_ended', 'not_a_copy', 'wrong_outcome', 'already_done', 'already_requested', 'site_not_ready']) {
    assert.ok(cro.includes(code), code);
  }
  // Hiveku now makes Version B the page itself: it is no longer a code change by hand.
  assert.ok(!cro.includes('Making the winner the page itself later is a code change'));
  for (const rel of [CRO_ANALYST, CRO_COMMAND]) {
    const text = flat(rel);
    assert.ok(text.includes('the preview, the user\'s yes, then confirm: true'), rel);
    assert.ok(text.includes("once the next production deploy is live, the copy's address becomes a permanent 301 to the original"), rel);
  }
});

test('PPC: results by ad platform, and a promote needs no ad change', () => {
  for (const rel of [PPC_SKILL, PPC_ANALYST]) {
    const text = flat(rel);
    assert.ok(/[Dd]id Version B win for Google Ads clicks\?/.test(text), rel);
    assert.ok(text.includes('adPlatforms'), rel);
    assert.ok(text.includes('a row is not a verdict'), rel);
    assert.ok(text.includes("a permanent 301 from the copy's address"), rel);
  }
  assert.ok(flat(PPC_SKILL).includes('No ad change is needed'));
  assert.ok(flat(PPC_ANALYST).includes('plan no ad change for it'));
});

test('SEO: after a promote or removal the copy is a permanent 301 that stays', () => {
  for (const rel of [SEO_SKILL, SEO_ANALYST]) {
    const text = flat(rel);
    assert.ok(text.includes("turns the copy's address into a permanent 301 to the original once the next production deploy is live; that 301 is meant to stay."), rel);
  }
});
