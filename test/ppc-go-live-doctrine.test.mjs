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
 * Release 0.26.34 made the plugin ask on its own before the five calls that
 * can switch ads on by status and the four that can restart or widen delivery
 * (test/spend-start-writes.test.mjs), so the ask-rule step now names only the
 * VS Code extension's tools: that extension does not run the plugin's hook,
 * and the hook ignores its mcp__hiveku__ prefix anyway.
 *
 * These pins keep:
 *   - the auto-mode rule, the exact owner steps (the Recently denied retry,
 *     Manual for the go-live turn, or an ASK rule naming both enable tools
 *     under the extension's prefix) and the no-ALLOW rule in the PPC hub
 *     SKILL.md and in spend-change-discipline.md;
 *   - that both say the plugin asks before each enable and name the nine
 *     tools it asks about, and that neither tells owners to add an ask rule
 *     for the plugin's own names, says enabling has no gate, or claims the
 *     plugin asks before "every call that can switch ads on" (the 0.26.32
 *     draft said so while the end-date edits did not ask);
 *   - that the discipline names the keyword adds as a rail that does not
 *     exist, and says the Codex prompt on hiveku_batch covers batches;
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

/** What the plugin now does on its own, as both files that teach the enable must state it. */
const PLUGIN_ASKS_TOKENS = [
  'The plugin asks before each enable',
  'ppc_enable_resource',
  'ppc_platform_enable_resource',
  'ppc_bulk_edit',
  'ppc_linkedin_creatives',
  'ppc_tiktok_split_tests',
  'ppc_recommendation_apply',
  'ppc_meta_campaign_update',
  'ppc_linkedin_campaign_update',
  'ppc_linkedin_campaign_group_update',
];
/**
 * Claims 0.26.34 made false: that enabling has no gate at all, and an ASK-rule
 * instruction naming the plugin's own prefix (its hook asks already, and an
 * owner told to add rules for it would believe the plugin does not).
 */
const STALE_GATE_CLAIMS = [
  /Enabling has no gate on the Google lane/i,
  /ASK rule[\s\S]{0,400}?mcp__plugin_hiveku_hk__ppc_(?:platform_)?enable_resource/i,
  // Inexact while any call that can switch ads on or restart them is not gated.
  /asks?(?: the owner)? before every (?:call|tool) that can switch (?:ads|delivery) on/i,
];
function assertPluginAsks(text, label) {
  const f = flat(text);
  for (const token of PLUGIN_ASKS_TOKENS) {
    assert.ok(f.includes(token), `${label} does not say the plugin asks before each enable: ${token}`);
  }
  for (const re of STALE_GATE_CLAIMS) assert.doesNotMatch(f, re, `${label} says ${re}`);
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

test('both say the plugin asks before each enable, and neither asks owners for a plugin ask rule', () => {
  assertPluginAsks(read(HUB), HUB);
  assertPluginAsks(read(DISCIPLINE), DISCIPLINE);
  for (const rel of PROSE) {
    assert.doesNotMatch(flat(read(rel)), STALE_GATE_CLAIMS[0], `${rel} says enabling has no gate`);
  }
});

test('the discipline names the keyword adds as ungated and says batches prompt in Codex', () => {
  const f = flat(read(DISCIPLINE));
  assert.ok(f.includes('Adding keywords does not ask.'), `${DISCIPLINE} must say keyword adds do not ask`);
  assert.ok(f.includes('ppc_keyword_add and ppc_platform_keyword_add'), DISCIPLINE);
  assert.match(f, /prompts before every hiveku_batch call, so none of them runs inside a batch without a yes/);
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

  // The 0.26.31 wording: enabling "has no gate", and step 3 told owners to add
  // ask rules for the plugin's own names.
  const oldGoLive =
    '- **Enabling has no gate on the Google lane.** `ppc_enable_resource` has no confirm flag.\n' +
    '  3. Add a permissions ASK rule naming the enable tool, via `/permissions`. The plugin\'s names are\n' +
    '     `mcp__plugin_hiveku_hk__ppc_platform_enable_resource` and `mcp__plugin_hiveku_hk__ppc_enable_resource`.';
  assert.throws(() => assertPluginAsks(oldGoLive, 'old go-live'), /does not say the plugin asks/);
  assert.throws(
    () => assertPluginAsks(`${PLUGIN_ASKS_TOKENS.join(' ')}. ${oldGoLive}`, 'old go-live with tokens'),
    /Enabling has no gate/,
  );
  // The 0.26.32 draft: "every call that can switch ads on" while the end-date
  // edits did not ask.
  const draft32 = `${PLUGIN_ASKS_TOKENS.join(' ')}. The plugin now asks the owner before every call that can switch ads on.`;
  assert.throws(() => assertPluginAsks(draft32, '0.26.32 draft'), /switch/);
  assert.throws(
    () => assertPluginAsks(PLUGIN_ASKS_TOKENS.filter((t) => t !== 'ppc_meta_campaign_update').join(' '), 'no Meta'),
    /ppc_meta_campaign_update/,
  );
  const oldStep3 = oldGoLive.split('\n').slice(1).join('\n');
  assert.throws(
    () => assertPluginAsks(`${PLUGIN_ASKS_TOKENS.join(' ')}. ${oldStep3}`, 'old step 3'),
    /ASK rule/,
  );

  const oldKeywords =
    '**Bing:** `ppc_platform_keyword_match_type_change({ connection_id, keyword_id, match_type })`. Microsoft\n' +
    'may reject in-place edits; the documented fallback is add the new keyword and pause the old one.';
  assert.throws(() => assertBingKeywordExamples(oldKeywords, 'old keywords'));
  assert.throws(() =>
    assertBingKeywordExamples('`ppc_platform_keyword_bid_update({ connection_id, keyword_id, bid })`', 'bid'),
  );
});

test('no playbook still says Hiveku cannot read Microsoft per-goal conversions', () => {
  // Hiveku reads Microsoft's goals report since the conversion-goal-volume action shipped.
  const stale = /does not yet read Microsoft'?s per-goal/i;
  const hits = PROSE.filter((file) => stale.test(flat(read(file))));
  assert.deepEqual(hits, [], `stale per-goal claim in: ${hits.join(', ')}`);
});
