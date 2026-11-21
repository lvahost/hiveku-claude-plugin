/**
 * Review with AI of a social post, and who the posts were for (2026-11-21).
 *
 * The tool server adds three tools:
 *   - social_post_strategy_review (POST): Review with AI of a saved post, the button of the same name in the Hiveku
 *     app. The Social team scores the post per network on the seven axes of references/anti-fluff.md and names its
 *     hard fails by the seven ids that file lists. It spends the account's AI credit in the name of the person behind
 *     the key, and its description says ASK THE PERSON FIRST, so the tool server's build fails until this plugin's ask
 *     list (data/permission-critical-tools.json, mirrored in the INSTALL.md ask block) and the hook's always-ask maps
 *     (lib/tool-safety.mjs) name it.
 *   - social_post_strategy_review_get (GET): the stored review, whether it is still current, the live run and the last
 *     failure.
 *   - social_analytics_who_for (GET): what went out and what is coming up, by ICP and by journey stage, and the gaps.
 *
 * What this file holds:
 *   1. The review asks on every direct call and through a batch, whatever the settings allow, and the real hook
 *      process says so; a reads-only folder denies it; it is on the ask list and INSTALL.md's ask block. The two
 *      reads are on no ask list and no ask map. All three are contracted in test/pending-tools.mjs until the tool
 *      index carries them.
 *   2. The texts: read the stored review first; a fresh review needs no new run; ask the person first and never run
 *      it on their behalf; never send it twice after a timeout; nothing it says blocks a post. The audit and the
 *      analyst read a stored review as a second opinion, after their own score, and grade afresh; the analyst never
 *      runs one and reads who the posts are for with social_analytics_who_for. The hard fails a review names are the
 *      seven of anti-fluff.md section 4 (test/social-hard-fails-hk1793.test.mjs pins that list in full).
 *
 * Run: node --test test/*.test.mjs
 */
import { isolatedEnv } from './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALWAYS_ASK_WRITES,
  HIVEKU_TOOL_PREFIX,
  LIVE_CHANGE_WRITES,
  NEVER_AUTO_APPROVE,
  decideWithGuardrails,
  isAutoApprovable,
  isReadOnlyTool,
} from '../lib/tool-safety.mjs';
import { probeIsStale, updateCheckPath } from '../lib/update-check.mjs';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Line breaks and their indent folded to one space, and the plugin-only tags taken out, so a rewrap never fails a pin. */
const fold = (text) => text.replace(/ *<!-- plugin-only -->/g, '').replace(/\s*\n\s*/g, ' ');

const REVIEW = 'social_post_strategy_review';
const REVIEW_GET = 'social_post_strategy_review_get';
const WHO_FOR = 'social_analytics_who_for';
const READS = [REVIEW_GET, WHO_FOR];

const SKILL = 'skills/hiveku-social-agency/SKILL.md';
const MECHANICS = 'skills/hiveku-social-agency/references/publishing-approval-mechanics.md';
const ANTI_FLUFF = 'skills/hiveku-social-agency/references/anti-fluff.md';
const ANALYTICS = 'skills/hiveku-social-agency/references/analytics-and-reporting.md';
const AUDIT = 'commands/social-audit.md';
const ANALYST = 'agents/hiveku-social-analyst.md';

/** The seven hard fails by id, in the order anti-fluff.md section 4 lists them (decision P20). */
const HARD_FAIL_IDS = [
  'banned_phrase',
  'no_persona_and_stage',
  'competitor_swap',
  'variance_breach',
  'unbacked_claim',
  'alt_text_over_125',
  'platform_not_used',
];

/** A folder with an optional .hiveku/guardrails.json. */
function folderWith(guardrails) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'hk-review-'));
  if (guardrails !== undefined) {
    fs.mkdirSync(path.join(dir, '.hiveku'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.hiveku', 'guardrails.json'), JSON.stringify(guardrails));
  }
  return dir;
}
const payload = (tool, cwd, toolInput = {}) => ({ tool_name: `${HIVEKU_TOOL_PREFIX}${tool}`, tool_input: toolInput, cwd });
const batch = (calls, cwd) => ({ tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`, tool_input: { calls }, cwd });
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

/** The main permissions block of INSTALL.md (the one with the long ask list). */
function installPermissions() {
  const install = read('INSTALL.md');
  const blocks = [...install.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter((b) => Array.isArray(b?.permissions?.ask) && b.permissions.ask.length >= 10);
  assert.equal(blocks.length, 1, 'could not find the main permissions block in INSTALL.md');
  return blocks[0].permissions;
}

/** Runs the real hook as hooks/hooks.json does; a fresh update-check stamp keeps it off the network. */
function runPreToolUseHook(toolName, toolInput, cwd) {
  const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'hk-review-data-'));
  fs.writeFileSync(updateCheckPath(dataDir), JSON.stringify({ checked_at: new Date().toISOString() }));
  assert.equal(probeIsStale(dataDir), false, 'the update probe would spawn; the fixture is wrong');
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../bin/hiveku', import.meta.url)), 'hook', 'pre-tool-use'],
    {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, cwd }),
      encoding: 'utf8',
      env: isolatedEnv({ HIVEKU_PLUGIN_DATA: dataDir }),
      timeout: 20_000,
    },
  );
}

const REVIEW_REASON =
  /^social_post_strategy_review runs Review with AI on a saved social post: the Social team scores it, which spends the account's AI credit in the name of the person behind the key \(priced once it has run\)\. Read social_post_strategy_review_get first: a current review needs no new run\. Nothing it says blocks a post/;

// ── 1. The ask lists ─────────────────────────────────────────────────────────

test('1. Review with AI asks on every direct call and through a batch, whatever the settings allow; a reads-only folder denies it', () => {
  const cwd = folderWith(undefined);
  const readsOnly = folderWith({ version: 1, mode: 'reads-only' });
  for (const args of [{ post_id: 'p' }, { post_id: 'p', again: true }, { post_id: 'p', again: false }, {}]) {
    const direct = decideWithGuardrails(payload(REVIEW, cwd, args));
    assert.equal(decision(direct), 'ask', `${REVIEW} ${JSON.stringify(args)} must ask; silence resolves to the blanket allow`);
    assert.match(reason(direct), REVIEW_REASON);
    assert.match(reason(direct), /even when your settings allow all Hiveku tools/);
    assert.doesNotMatch(reason(direct), /[–—]/, 'no dashes in a reason the person reads');
  }
  const mixed = decideWithGuardrails(batch([
    { tool: REVIEW_GET, args: { post_id: 'p' } },
    { tool: REVIEW, args: { post_id: 'p' } },
  ], cwd));
  assert.equal(decision(mixed), 'ask', 'a batch carrying the review asks');
  assert.match(reason(mixed), new RegExp(REVIEW));
  assert.equal(decision(decideWithGuardrails(payload(REVIEW, readsOnly, { post_id: 'p' }))), 'deny', 'a reads-only folder denies it');
  assert.equal(isAutoApprovable(REVIEW, { post_id: 'p' }), false);
  assert.equal(isReadOnlyTool(REVIEW), false);
  assert.ok(LIVE_CHANGE_WRITES.has(REVIEW), `${REVIEW} is on LIVE_CHANGE_WRITES, beside seo_plan_suggest_phrases`);
  assert.equal(ALWAYS_ASK_WRITES.has(REVIEW), false, 'it is on LIVE_CHANGE_WRITES; a name belongs on one map');
});

test('1. the real hook process prints ask for Review with AI under the blanket allow', () => {
  const { allow, ask } = installPermissions();
  const full = `${HIVEKU_TOOL_PREFIX}${REVIEW}`;
  assert.ok(allow.some((rule) => (rule.endsWith('*') ? full.startsWith(rule.slice(0, -1)) : rule === full)), `no INSTALL.md allow rule matches ${full}; the premise of this test changed`);
  assert.ok(ask.includes(full), `INSTALL.md's ask block must name ${REVIEW}`);
  const run = runPreToolUseHook(full, { post_id: 'p' }, folderWith(undefined));
  assert.equal(run.status, 0, run.stderr);
  assert.notEqual(run.stdout, '', `the hook printed nothing, so the blanket allow would run ${REVIEW} unasked`);
  const out = JSON.parse(run.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, REVIEW_REASON);
});

test('1. the ask list and INSTALL.md name Review with AI, and neither read', () => {
  const list = JSON.parse(read('data/permission-critical-tools.json'));
  const entry = list.tools.find((t) => t.name === REVIEW);
  assert.ok(entry, `${REVIEW} is not on data/permission-critical-tools.json`);
  assert.equal(entry.method, 'POST');
  assert.match(entry.why_gated, /spends the account's AI credit in the name of the person behind the key/);
  assert.match(entry.why_gated, /Nothing it says blocks a post$/);
  const { ask } = installPermissions();
  for (const name of READS) {
    assert.equal(list.tools.some((t) => t.name === name), false, `${name} is a read: it belongs on no ask list`);
    assert.equal(ask.includes(`${HIVEKU_TOOL_PREFIX}${name}`), false, `${name} is a read: INSTALL.md must not ask for it`);
  }
  // The sentence after the ask block names the review among the writes the hook asks for.
  assert.match(fold(read('INSTALL.md')), /Review with AI of a social post, which spends AI credit too \(`social_post_strategy_review`\), whatever your settings allow/);
});

test('1. the two reads are on no ask map, so the read-only list pre-approves them once the index carries them', () => {
  const cwd = folderWith(undefined);
  for (const name of READS) {
    assert.equal(LIVE_CHANGE_WRITES.has(name) || ALWAYS_ASK_WRITES.has(name) || NEVER_AUTO_APPROVE.has(name), false, `${name} is on an ask map`);
    assert.notEqual(decision(decideWithGuardrails(payload(name, cwd, { post_id: 'p', days: 30 }))), 'ask', `${name} is a read and must not ask`);
  }
});

test('1. all three are contracted pending tools in one batch until the tool index carries them', () => {
  for (const name of [REVIEW, REVIEW_GET, WHO_FOR]) {
    assert.equal(PENDING_TOOLS.get(name)?.batch, 'SOCIAL-REVIEW', `${name} is not contracted in test/pending-tools.mjs`);
  }
  const header = fold(read('test/pending-tools.mjs'));
  assert.match(header, /SOCIAL-REVIEW social_post_strategy_review, social_post_strategy_review_get, social_analytics_who_for\./);
  assert.match(header, /the two reads join the read-only list, the review does not/);
});

// ── 2. The texts ─────────────────────────────────────────────────────────────

/** `text` holds each of `phrases`, in that order. */
function inOrder(text, phrases, where) {
  let at = -1;
  for (const phrase of phrases) {
    const next = text.indexOf(phrase, at + 1);
    assert.ok(next >= 0, `${where} no longer says ${JSON.stringify(phrase)}${at >= 0 ? ' after the words before it' : ''}`);
    at = next;
  }
}

test('2. the skill reads the stored review first, asks the person before a run, and never lets a review block a post', () => {
  const skill = read(SKILL);
  const start = skill.indexOf("- Review with AI is the person's to ask for, and it is charged.");
  assert.ok(start >= 0, 'the social skill lost its Review with AI principle');
  const principle = fold(skill.slice(start, skill.indexOf('\n- ', start + 1)));
  inOrder(principle, [
    `\`${REVIEW}({ post_id })\``,
    "It spends the account's AI credit in the name of the person behind the key",
    `read \`${REVIEW_GET}({ post_id })\` first`,
    'a `fresh` review already answers, so show it and run nothing',
    'ask the person first',
    'run it only on their yes, one post per yes, never on their behalf',
    `after a timeout or a 524, read \`${REVIEW_GET}\` and never send it twice`,
    'Nothing a review says blocks a post',
    'it is a second opinion beside your own grade, never a gate on what the person chooses',
  ], 'the skill\'s Review with AI principle');
  assert.doesNotMatch(principle, /social_post_strategy_check/, 'the review stays out of the check\'s principle: the check costs nothing');

  const stops = fold(skill.slice(skill.indexOf('## Hard stops'), skill.indexOf('## The agency arc')));
  inOrder(stops, [
    '"Review all our posts with AI." -> Refuse the loop.',
    `Read \`${REVIEW_GET}\` for each post first`,
    `then ask the person post by post and run \`${REVIEW}\` only on each yes`,
    '`person_key_required` or `unattributed_key` is final for that key',
  ], 'the hard stops');
});

test('2. the publishing reference reads first, asks second, runs third, follows the run and never sends it twice', () => {
  const ref = read(MECHANICS);
  const start = ref.indexOf(`## Review with AI: ${REVIEW} (charged, the person asks for it)`);
  assert.ok(start >= 0, 'the publishing reference lost its Review with AI section');
  const section = fold(ref.slice(start, ref.indexOf('## Path A', start)));
  inOrder(section, [
    'names any of the seven hard fails by id',
    "It spends the account's AI credit in the name of the person behind the key",
    'Nothing a review says blocks a post.',
    `1. Read first: \`${REVIEW_GET}({ post_id })\``,
    'A `fresh` review already answers: show it and run nothing.',
    '2. Ask the person first, every time',
    'Run it only on their yes, for the post they named, and never on their behalf.',
    '"Review all our posts" is one yes per post, never a loop.',
    `3. On the person's yes, \`${REVIEW}({ post_id })\``,
    'Send `again: true` only when the person asks for a new review',
    `\`${REVIEW_GET}({ post_id, only: 'run' })\``,
    'A started review cannot be stopped',
    '5. A 524, a timeout or a dropped answer reads as still running.',
    `Read \`${REVIEW_GET}\` before anything else, and never send the review again blindly`,
    'A suggestion goes into the post only as the person chooses',
    'is final for that key: nothing was charged; never call again with it and never move on to other posts',
    '409 `needs_who`',
  ], 'the Review with AI section');
  assert.ok(fold(ref.slice(0, ref.indexOf('## The calendar'))).includes('before Review with AI'), 'the reference\'s load line names Review with AI');
  // The hard fails a review names are anti-fluff.md section 4's seven.
  const antiFluff = read(ANTI_FLUFF);
  const list = antiFluff.slice(antiFluff.indexOf('Hard fails (any one blocks the write')).split(/\n\s*\n/)[0];
  assert.deepEqual([...list.matchAll(/^\d+\. `([a-z0-9_]+)`:/gm)].map((m) => m[1]), HARD_FAIL_IDS, 'anti-fluff.md section 4 is no longer the seven hard fails a review names');
});

test('2. anti-fluff.md section 1: a stored review is a second opinion, graded afresh, and it is the plugin\'s line alone', () => {
  const text = read(ANTI_FLUFF);
  const gate = fold(text.slice(text.indexOf('## 1. Why a gate'), text.indexOf('## 2. The banned list')));
  inOrder(gate, [
    'nothing on the server scores copy',
    'The one exception to "nothing on the server scores copy" is Review with AI, and it waits for the person',
    'only when the person asks for it',
    'ask the person first',
    `Its stored answer, read with \`${REVIEW_GET}\`, is a second opinion`,
    'read it, then grade afresh anyway, and when the two differ, say both and why.',
    'Nothing it says blocks a post, and it never stands in for this gate.',
  ], 'anti-fluff.md section 1');
  // The Social team's agent has none of the review tools: every line naming one is the plugin's alone.
  const untagged = text.split('\n').filter((line) => /social_post_strategy_review|Review with AI/.test(line) && !line.includes('<!-- plugin-only -->'));
  assert.deepEqual(untagged, [], 'tag these lines plugin-only: the Social team\'s agent has no review tool');
});

test('2. the audit reads a stored review only after its own score, as a second opinion, and never runs one', () => {
  const raw = read(AUDIT);
  const opening = fold(raw.slice(0, raw.indexOf('1. **Sync')));
  assert.ok(opening.includes(`It runs no Review with AI either: \`${REVIEW}\` is charged and the person's to ask for, post by post, outside this audit (ask the person first`), 'the audit must say it never runs Review with AI');
  const step2 = fold(raw.slice(raw.indexOf('2. **Score every post'), raw.indexOf('3. **Winners and losers')));
  inOrder(step2, [
    'Score each post on the seven axes',
    'Then, and only after your own score, the second opinion:',
    `\`${REVIEW_GET}({ post_id })\` per post`,
    'where the two differ, say both and why',
    'It never replaces your score and never blocks a post',
  ], 'the audit\'s step 2');
  assert.match(fold(raw), /the stored review beside it \(its total, hard fails and freshness, or "none"\)/, 'the audit table shows the stored review beside the audit\'s own line');
});

test('2. the analyst reads a stored review as a second opinion, reads who the posts are for, and never runs a review', () => {
  const analyst = read(ANALYST);
  const investigate = fold(analyst.slice(analyst.indexOf('Investigate with exactly these tools'), analyst.indexOf('Every number names its N')));
  assert.doesNotMatch(investigate, /never on the row/, 'the analyst still says the rubric is never on the row: a stored review is');
  inOrder(investigate, [
    'a second opinion, never your grade, so grade the copy afresh',
    '- **The stored review, a second opinion.**',
    `\`${REVIEW_GET}({ post_id })\``,
    'Read it only after your own score of that post',
    'It is never a fact to grade against',
    `You never run a new one: \`${REVIEW}\` is charged`,
    'the main session asks the person first, one post per yes',
    '- **Who the posts are for, and who is missing.**',
    `\`${WHO_FOR}({ days, ahead_days })\``,
    '"who are we posting for, and who are we missing"',
    'is a gap only when nothing went out and nothing is coming up',
  ], 'the analyst\'s tool list');
  const never = fold(analyst.slice(analyst.indexOf('You do not create, update, delete')));
  assert.ok(never.includes(`never \`${REVIEW}\``), 'the analyst\'s never-call list must name the review');
  const analytics = fold(read(ANALYTICS));
  assert.ok(analytics.includes(`\`${WHO_FOR}({ days, ahead_days })\``), 'the analytics reference must name the who-for read');
  assert.ok(analytics.includes('"who are we posting for, and who are we missing"'), 'the analytics reference must say what the who-for read answers');
});

test('2. the new words carry no long dashes', () => {
  const pieces = [
    [SKILL, "- Review with AI is the person's to ask for", '\n- `hiveku-data/social/'],
    [MECHANICS, `## Review with AI: ${REVIEW}`, '## Path A'],
    [ANALYST, '- **The stored review, a second opinion.**', '- **Engagement.**'],
    [ANALYST, '- **Who the posts are for, and who is missing.**', '- **Who did what.**'],
  ];
  for (const [rel, from, to] of pieces) {
    const text = read(rel);
    const piece = text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
    assert.ok(piece.length > 100, `${rel}: could not find ${JSON.stringify(from)}`);
    assert.doesNotMatch(piece, /[–—]/, `${rel}: a long dash in ${JSON.stringify(from)}`);
  }
});
