/**
 * The E911 counts already leave toll-free numbers out, so no prose may tell an
 * agent to subtract them again.
 *
 * voice_diagnose_setup's dids_without_e911 counts only ACTIVE LOCAL numbers
 * with no E911 address, and reports the toll-free ones apart as
 * toll_free_dids_exempt_from_e911 (builder src/app/api/olympus/voice/
 * diagnostics/route.ts). Its two E911 blocking issues follow the same rule. The
 * compliance and saas-admin counts (builder #291) and the healthcheck's
 * active_dids_have_verified_e911 (voice server 32e57d8) leave toll-free out too.
 * The plugin still said the count "has no toll-free filter" and told the agent
 * to subtract the toll-free DIDs before reporting it. With the count already
 * local-only, that subtraction undercounts: one local number with no address,
 * minus two toll-free numbers, reads as nothing missing.
 *
 * The same program moved the tenant's fallback caller ID (what a seat with no
 * caller ID of its own presents, on a 911 call too) off toll-free numbers:
 * Hiveku's own picks already (builder #296), the voice server's re-pick only
 * after voice #7 is deployed (merged, not deployed). The caller-ID reference
 * said the default was "the oldest active main DID" and that click-to-call fell
 * back to "any active DID".
 *
 * These pins keep:
 *   - no prose (skills, commands, agents, the department manifest) telling the
 *     agent to subtract toll-free numbers from the E911 count, or saying the
 *     count is inflated by them;
 *   - the sites that teach the count saying it already leaves toll-free out,
 *     naming toll_free_dids_exempt_from_e911, and saying what it cannot see;
 *   - the fallback caller-ID rule described as it runs, with every mention of
 *     voice #7 conditional on its deploy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace and drop backticks and bold marks so a pinned phrase may wrap and carry markup. */
const flat = (s) => s.replace(/`|\*\*/g, '').replace(/\s+/g, ' ');

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

/** Every string in the department manifest, joined, so its setup and crud text is prose too. */
function manifestProse() {
  const strings = [];
  const visit = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(JSON.parse(read('lib/dept-manifest.json')));
  return strings.join('\n');
}

const PROSE = [...walk('skills'), ...walk('commands'), ...walk('agents')];
const sources = () => [...PROSE.map((rel) => [rel, read(rel)]), ['lib/dept-manifest.json', manifestProse()]];

/** The ways prose names the diagnose count. */
const COUNT = /dids_without_e911|missing-E911 count|DIDs missing E911|E911 counts?\b/gi;
/** Said anywhere, these teach the retired correction. */
const RETIRED = [/no toll-free filter/i, /minus the toll-free/i, /toll-free (?:E911 )?(?:inflation|subtraction)/i];
/** A subtraction near the count is only allowed as the thing not to do. */
const REFUSES_SUBTRACTION = /undercount|(?:do not|never|not) subtract/i;

/** Every place in `text` that tells the agent to take toll-free numbers off the E911 count. */
function subtractionClaims(text) {
  const f = flat(text);
  const found = [];
  for (const re of RETIRED) {
    const hit = f.match(re);
    if (hit) found.push(hit[0]);
  }
  for (const m of f.matchAll(COUNT)) {
    const window = f.slice(Math.max(0, m.index - 160), m.index + m[0].length + 160);
    const inflate = window.match(/inflat\w*/i);
    if (inflate) found.push(`${m[0]} ... ${inflate[0]}`);
    const subtract = window.match(/subtract\w*/i);
    if (subtract && !REFUSES_SUBTRACTION.test(window)) found.push(`${m[0]} ... ${subtract[0]}`);
  }
  return [...new Set(found)];
}

test('no prose tells the agent to subtract toll-free numbers from the E911 count', () => {
  assert.ok(PROSE.length > 50, 'the prose walk found too few files');
  const offenders = [];
  for (const [rel, text] of sources()) {
    for (const claim of subtractionClaims(text)) offenders.push(`${rel}: ${claim}`);
  }
  assert.deepEqual(offenders, [], `prose still teaches the toll-free subtraction:\n  ${offenders.join('\n  ')}`);
});

/** file -> phrases (flattened) it must carry. */
const PINNED = {
  'commands/phone-check.md': [
    'dids_without_e911 already leaves toll-free DIDs out',
    'toll_free_dids_exempt_from_e911 says how many were left out',
    'subtracting the toll-free DIDs again undercounts',
    'a DID whose address is still pending verification is not in it',
    'joined against the active LOCAL DIDs from step 6',
  ],
  'agents/hiveku-voice-analyst.md': [
    'dids_without_e911 already leaves them out (toll_free_dids_exempt_from_e911 counts them), so never subtract them from it - that undercounts',
  ],
  'skills/hiveku-phone-agency/SKILL.md': [
    'A toll-free number cannot carry an E911 address',
    'the count already leaves them out (toll_free_dids_exempt_from_e911 says how many), so subtracting undercounts',
  ],
  'skills/hiveku-phone-agency/references/numbers-and-e911.md': [
    'What dids_without_e911 counts (toll-free is already left out)',
    'Toll-free numbers are left out of it and counted in toll_free_dids_exempt_from_e911',
    'subtracting the toll-free set again undercounts',
    'What the count cannot see: a local number whose address is attached but still pending carrier verification',
  ],
  'skills/hiveku-phone-agency/references/pbx-routing.md': [
    'the toll-free ones are already left out (toll_free_dids_exempt_from_e911), so never subtract them again',
    '409 no_e911_caller_id',
  ],
  'skills/hiveku-phone-agency/references/voice-playbooks.md': [
    "the diagnostic's dids_without_e911 already leaves them out, so do not subtract them from it",
  ],
  'skills/hiveku-phone-agency/references/caller-id-and-reputation.md': [
    'never a toll-free number, which cannot carry an E911 address',
    'Until voice #7 is deployed that re-pick is simply the oldest active number, toll-free and pool numbers included',
    'After voice #7 is deployed the voice server uses the same rule, so a toll-free number is never picked or written as the fallback caller ID',
  ],
};

test('the sites that teach the E911 count say toll-free is already out and what the count cannot see', () => {
  const missing = [];
  for (const [rel, phrases] of Object.entries(PINNED)) {
    const f = flat(read(rel));
    for (const phrase of phrases) if (!f.includes(phrase)) missing.push(`${rel}: ${phrase}`);
  }
  assert.deepEqual(missing, [], `missing:\n  ${missing.join('\n  ')}`);
});

/** Said anywhere, these describe the fallback caller-ID pick the live code no longer makes. */
const RETIRED_FALLBACK = [
  /DERIVED: the oldest active purpose: 'main' DID/,
  /the oldest main -> any active DID/,
  /the main-purpose DID, else the oldest\s+active one/,
  /unset = account default \(oldest main\)/,
];

function retiredFallbackClaims(text) {
  const f = flat(text);
  return RETIRED_FALLBACK.filter((re) => re.test(f)).map(String);
}

test('no prose describes the fallback caller ID as the oldest main number, else any active one', () => {
  const offenders = [];
  for (const [rel, text] of sources()) {
    for (const claim of retiredFallbackClaims(text)) offenders.push(`${rel}: ${claim}`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

/** voice #7 is merged but not deployed: every mention has to be conditional on the deploy. */
const VOICE_7 = /voice #7/g;
const VOICE_7_CONDITIONAL = /(?:until|after) voice #7 is deployed|check voice #7 adds/gi;

function unconditionalVoice7(text) {
  const f = flat(text);
  const all = (f.match(VOICE_7) || []).length;
  const conditional = (f.match(VOICE_7_CONDITIONAL) || []).length;
  return all - conditional;
}

test('every mention of voice #7 is conditional on its deploy, never stated as live', () => {
  let mentions = 0;
  const offenders = [];
  for (const [rel, text] of sources()) {
    mentions += (flat(text).match(VOICE_7) || []).length;
    const bare = unconditionalVoice7(text);
    if (bare !== 0) offenders.push(`${rel}: ${bare} mention(s) not tied to the deploy`);
  }
  assert.ok(mentions >= 3, `found ${mentions} mentions of voice #7, so this test proves little`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the checks fail on the old wording (negative control)', () => {
  const old = {
    phoneCheck:
      'Before reporting `dids_without_e911`, subtract the toll-free DIDs: toll-free numbers take no E911\n   registration and inflate that count.',
    voiceAnalyst:
      '`voice_e911_addresses_list`. Toll-free DIDs need no E911, so they INFLATE `dids_without_e911` -\n  subtract them before reporting a count',
    voiceAnalystClose:
      'never let a raw count (like `dids_without_e911`) into the\nreport before its known inflations are subtracted.',
    skillPitfall:
      "- Believing `voice_diagnose_setup`'s `dids_without_e911` before subtracting toll-free\n  numbers - toll-free is E911-exempt and inflates the count.",
    numbersSection:
      '`voice_diagnose_setup` reports `dids_without_e911` and a matching `blocking_issues` string with NO\ntoll-free filter.',
    numbersPitfall: '- **Reporting `dids_without_e911` verbatim.** Subtract the toll-free set first.',
    numbersQuickRef:
      '| "DIDs missing E911" reported | `voice_numbers_list`, subtract +1 800/833/844/855/866/877/888; report only the local remainder |',
    pbxRung1: 'string: `dids_without_e911` has no toll-free filter, so compliant toll-free numbers inflate it',
    pbxQuickRef: 'Surface `blocking_issues` near-verbatim, minus the toll-free E911 inflation (`numbers-and-e911.md`)',
    playbookRecipe8:
      "SUBTRACTING\n   toll-free numbers (800/833/844/855/866/877/888 - E911-exempt, and they inflate the\n   diagnostic's missing-E911 count).",
  };
  for (const [label, text] of Object.entries(old)) {
    assert.notDeepEqual(subtractionClaims(text), [], `${label}: the old wording should be caught`);
  }
  const oldFallback = {
    derived: "The default is not directly settable - it is DERIVED: the oldest active `purpose: 'main'` DID.",
    clickToCall: 'code, tracking and pool numbers excluded) -> the oldest `main` -> any active DID -> `409` with',
    repair: 'one DID baked in as the tenant-wide fallback caller ID (the `main`-purpose DID, else the oldest\nactive one)',
    quickRef: "unset = account default (oldest `main`). Then `voice_calls_list`",
  };
  for (const [label, text] of Object.entries(oldFallback)) {
    assert.notDeepEqual(retiredFallbackClaims(text), [], `${label}: the old fallback wording should be caught`);
  }
  assert.notEqual(
    unconditionalVoice7('After voice #7 the voice server never picks a toll-free number; voice #7 is live.'),
    0,
    'a voice #7 mention stated as live should be caught',
  );
});
