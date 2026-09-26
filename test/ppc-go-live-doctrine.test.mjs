/**
 * The paid-ads go-live doctrine (2026-09-26, from a client Microsoft Ads go-live).
 *
 * An agent enabling a paused Bing campaign under Claude Code's auto mode had the
 * enable denied by the auto-mode classifier ("[Production Deploy]") and told the
 * owner they would approve it when it asked. No prompt was ever coming: an
 * auto-mode denial does not turn into a prompt by itself. The owner has to act:
 * retry that one call from /permissions (Recently denied, r), or make the next
 * enable prompt with Manual mode or an ask rule for the tool (an ask rule forces
 * a prompt on later calls; it does not reopen the denied one). The same report
 * repeated two stale beliefs from the prose: that the Bing keyword tools can be
 * called without ad_group_id, and that Microsoft rejects in-place match-type
 * edits (both false on the live server).
 *
 * These pins keep:
 *   - the auto-mode rule, the exact owner steps (the Recently denied retry,
 *     Manual for the go-live turn, or an ASK rule naming both enable tools under
 *     both prefixes) and the no-ALLOW rule in the PPC hub SKILL.md and in
 *     spend-change-discipline.md;
 *   - the re-test-before-"broken" rule in the hub;
 *   - no "approve it when it asks" promise anywhere in the plugin's prose, and
 *     neither retracted claim (a denial is "final for that call"; an ask rule
 *     "takes no wildcard" - current Claude Code docs say otherwise for both);
 *   - every Bing keyword bid / match-type call example carrying ad_group_id,
 *     and no claim that Microsoft rejects in-place match-type edits.
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

const HUB = 'skills/hiveku-ppc-agency/SKILL.md';
const DISCIPLINE = 'skills/hiveku-ppc-agency/references/spend-change-discipline.md';

/** The auto-mode rule, as both files that teach the enable must state it. */
const AUTO_MODE_TOKENS = [
  'A Claude Code auto-mode denial never turns into a prompt',
  'ever promise the owner a prompt', // "never" mid-sentence in the hub, "Never" in 4.5
  'Recently denied',
  'switch the chat to Manual',
  'Shift+Tab',
  'mcp__plugin_hiveku_hk__ppc_platform_enable_resource',
  'mcp__plugin_hiveku_hk__ppc_enable_resource',
  'mcp__hiveku__ppc_platform_enable_resource',
  'mcp__hiveku__ppc_enable_resource',
  'Never propose an ALLOW rule for a tool that starts spend',
];

function assertAutoModeRule(text, label) {
  const f = flat(text);
  for (const token of AUTO_MODE_TOKENS) {
    assert.ok(f.includes(token), `${label} does not teach the auto-mode rule: ${token}`);
  }
}

/**
 * The false promise an account agent made (a denial never turns into a prompt),
 * plus the two claims an earlier draft of this doctrine made and the Claude
 * Code docs contradict: a denial can be retried from /permissions (Recently
 * denied), and ask rules accept tool-name globs.
 */
const FORBIDDEN_PROMISES = [
  /approve (it|this|them) when (it|they|claude code) asks?\b/i,
  /denial is final for (that|the) call/i,
  /ask rule takes no wildcard/i,
];
function assertNoPromise(text, label) {
  const f = flat(text);
  for (const re of FORBIDDEN_PROMISES) assert.doesNotMatch(f, re, `${label} says ${re}`);
}

const BING_KEYWORD_CALL = /ppc_platform_keyword_(?:bid_update|match_type_change)\(\{([^}]*)\}\)/g;
const STALE_BING_CLAIMS = [/may reject in-place edits/i, /Microsoft (may|will) reject (an )?in-place/i];
function assertBingKeywordExamples(text, label) {
  const f = flat(text);
  for (const match of f.matchAll(BING_KEYWORD_CALL)) {
    assert.match(match[1], /\bad_group_id\b/, `${label} calls a Bing keyword write without ad_group_id: ${match[0]}`);
  }
  for (const re of STALE_BING_CLAIMS) assert.doesNotMatch(f, re, `${label} says ${re}`);
}

test('the PPC hub and spend-change discipline both teach the auto-mode rule for the enable', () => {
  assertAutoModeRule(read(HUB), HUB);
  assertAutoModeRule(read(DISCIPLINE), DISCIPLINE);
});

test('the PPC hub tells the agent to re-test a tool before calling it broken', () => {
  assert.ok(
    flat(read(HUB)).includes('"broken" is a claim to re-test, not a fact'),
    `${HUB} lacks the stale-belief rule`,
  );
});

test('no prose promises the owner a prompt after a denial', () => {
  assert.ok(PROSE.length > 50, 'the prose walk found too few files');
  for (const rel of PROSE) assertNoPromise(read(rel), rel);
});

test('every Bing keyword bid or match-type example passes ad_group_id, and none says Microsoft rejects in-place edits', () => {
  let examples = 0;
  for (const rel of PROSE) {
    const text = read(rel);
    examples += [...flat(text).matchAll(BING_KEYWORD_CALL)].length;
    assertBingKeywordExamples(text, rel);
  }
  assert.ok(examples >= 2, `found ${examples} Bing keyword call examples, so this test proves nothing`);
});

test('the checks fail on the old wording (negative control)', () => {
  const oldHub =
    '**Before enabling ANY Search campaign** run `ppc_launch_qa`, then the enable. If it is blocked,\n' +
    "tell the owner you'll approve it when it asks.";
  assert.throws(() => assertAutoModeRule(oldHub, 'old hub'));
  assert.throws(() => assertNoPromise(oldHub, 'old hub'));
  assert.throws(() => assertNoPromise('They can approve this when Claude Code asks.', 'variant'));

  // The first draft of this doctrine: "final", and the Google enable names left out.
  const firstDraft =
    '**A Claude Code auto-mode denial is final for that call.** ... add a permissions ASK rule naming\n' +
    'the enable tool (`mcp__plugin_hiveku_hk__ppc_platform_enable_resource` and/or\n' +
    '`mcp__hiveku__ppc_platform_enable_resource`). Whole names only: an ask rule takes no wildcard.';
  assert.throws(() => assertAutoModeRule(firstDraft, 'first draft'), /never turns into a prompt/);
  assert.throws(() => assertNoPromise(firstDraft, 'first draft'), /final for/);
  assert.throws(() => assertNoPromise('Remember: an ask rule\ntakes no wildcard.', 'wildcard'), /wildcard/);

  const oldKeywords =
    '**Bing:** `ppc_platform_keyword_match_type_change({ connection_id, keyword_id, match_type })`. Microsoft\n' +
    'may reject in-place edits; the documented fallback is add the new keyword and pause the old one.';
  assert.throws(() => assertBingKeywordExamples(oldKeywords, 'old keywords'));
  assert.throws(() =>
    assertBingKeywordExamples('`ppc_platform_keyword_bid_update({ connection_id, keyword_id, bid })`', 'bid'),
  );
});
