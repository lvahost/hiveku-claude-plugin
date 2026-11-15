/**
 * The AI rank lanes as AEO wave A leaves them (HK-1701).
 *
 * Until then the perplexity lane was read from Google's AI Overview answers and a scheduled chatgpt check could not
 * record a mention. The SEO prose said so in its own way: footnote the perplexity lane and never sell it as Perplexity,
 * and the sync was "one LLM Mentions call" whose read-out was mentions_count and ai_search_volume. Since wave A the
 * ranking worker reads each assistant's own answer, a sync queues its check and answers within about 45 seconds
 * (pending: true past that, or when the checker has not confirmed the checks), and a chatgpt or perplexity reading
 * from before the change shows as not checked until its next check.
 *
 * The rule goes by the change, never a date: readings change when the ranking worker writes the new source mark on a
 * lane, which happens on that lane's own next check, whenever the worker ships (review C4).
 *
 * These pin the new rule where a session loads it (references/aeo.md 5.2 and its Play H read-out, the SKILL.md lanes
 * table, /hiveku:aeo step 6), that no AI-lane line names a date, and that no SEO prose repeats an old claim. They read
 * files only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Prose wraps at ~100 columns, so compare with whitespace collapsed. */
const flat = (text) => text.replace(/\s+/g, ' ');
/** An en or em dash: these lines carry neither. */
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
/** A calendar date, as a switch date was written. */
const A_DATE = /\b20\d\d-\d\d-\d\d\b/;

/** Every SEO file a session can load: the skill and its references, the SEO and AEO commands, and the analyst. */
function seoProse() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.md')) out.push(rel);
    }
  };
  walk('skills/hiveku-seo-agency');
  for (const f of fs.readdirSync(path.join(root, 'commands'))) {
    if (/^(seo-.*|aeo)\.md$/.test(f)) out.push(path.join('commands', f));
  }
  out.push('agents/hiveku-seo-analyst.md');
  return out;
}

/** The old claims, in the shapes they took. */
const STALE = [
  /routes through Google/i,
  /not a native Perplexity platform/i,
  /read from Google's AI Overview for now/i,
  /footnote it, never sell it as Perplexity/i,
  /\bLLM Mentions? call/i,
  /\| LLM mentions \|/i,
  /`mentions_count`, `ai_search_volume`/,
];
const staleIn = (text) => STALE.filter((re) => re.test(flat(text))).map(String);

test('the old claims are caught by the check (negative control)', () => {
  for (const old of [
    '**5.2 Do not present `perplexity` rankings-sync data as Perplexity.** That engine key currently\nroutes through Google, not a native Perplexity platform, so "Perplexity visibility" in a paid',
    'The perplexity lane routes through Google today: footnote it, never sell it as\n   Perplexity.',
    '| `seo_aeo_rankings_sync` | LIVE | G | one LLM Mentions call per keyword x engine; `location_code` is a STRING |',
    '**Read out:** per row, citation position, `ai_mentioned`, `mentions_count`, `ai_search_volume`.',
    '| G | LLM mentions | one live check per keyword per engine, against the daily re-check limit |',
  ]) {
    assert.notDeepEqual(staleIn(old), [], `the check must catch: ${old}`);
  }
});

test('no SEO prose repeats an old claim about the AI lanes', () => {
  const offenders = seoProse()
    .map((f) => [f, staleIn(read(f))])
    .filter(([, hits]) => hits.length > 0);
  assert.deepEqual(offenders, []);
});

test('references/aeo.md rule 5.2: perplexity lanes read Perplexity since the change, an older reading shows as not checked', () => {
  const aeo = flat(read('skills/hiveku-seo-agency/references/aeo.md'));
  const rule = aeo.slice(aeo.indexOf('**5.2 '), aeo.indexOf('**5.3 '));
  assert.ok(rule.length > 100, 'found rule 5.2');
  assert.match(rule, /^\*\*5\.2 `perplexity` lanes read Perplexity's answer since the change; a reading from before it shows as not checked\.\*\*/);
  assert.match(rule, /a ChatGPT or Perplexity reading from before the lanes began reading each assistant's own answer is not that assistant's data, and it shows as not checked until its next check\./);
  assert.match(rule, /The rule goes by the change, never by a date: each lane changes at its own first check from the assistant's answer\./);
  assert.match(rule, /`seo_ai_visibility` counts the lanes checked before the change and not since in `notCheckedSinceChange`, and starts their trend at the change/);
  assert.match(rule, /never compare a reading from before the change with one after it, and never present an older reading as Perplexity's or ChatGPT's/);
  assert.doesNotMatch(rule, LONG_DASH);
  assert.doesNotMatch(rule, A_DATE);
});

test("references/aeo.md: the sync's cost class, availability row and read-out say the check is queued and may be pending", () => {
  const aeo = flat(read('skills/hiveku-seo-agency/references/aeo.md'));
  assert.match(aeo, /G = an AI-lane check, one per keyword per engine, queued for Hiveku's checker, against the account's daily re-check limit \(not billed per check\)/);
  assert.match(aeo, /\| `seo_aeo_rankings_sync` \| LIVE \| G \| one check per keyword x engine, queued for Hiveku's checker; the call answers within about 45 seconds and a lane not done by then answers `pending: true`;/);
  const playH = aeo.slice(aeo.indexOf('### Play H'), aeo.indexOf('## 3. Thresholds'));
  assert.match(playH, /\*\*Read out:\*\* per lane in `synced\.results`, `current_rank` \(the site's place among the sites the answer cites; null when the answer names the site without citing it\), `mentioned` and `checked_at`/);
  assert.match(playH, /or `pending: true` when the checker has not finished the lane in that time or not confirmed the checks: read it back with `seo_rankings_list` a few minutes later, never by running the sync again/);
  assert.match(playH, /keeps its last reading: never report it as not mentioned/);
});

test('the SKILL.md lanes table says where each AI lane is read and that a sync may answer pending', () => {
  const hub = flat(read('skills/hiveku-seo-agency/SKILL.md'));
  const row = hub.slice(hub.indexOf('| ai_overview, chatgpt, claude, gemini, perplexity |'));
  assert.match(row, /^\| ai_overview, chatgpt, claude, gemini, perplexity \| `seo_aeo_rankings_sync`, or `seo_track_keyword` with the engine as `search_engine`; citations, not positions\. chatgpt and perplexity now read the assistant's own answer \(a reading from before the lanes began reading it shows as not checked until its next check\)/);
  assert.match(row, /ai_overview reads Google's AI Overview with late ones included, and claude and gemini ask the model without web search\. A sync queues the check and answers within about 45 seconds; a lane not done by then answers `pending: true` \|/);
});

test('/hiveku:aeo step 6 says the sync is queued, and states the chatgpt and perplexity rule by the change', () => {
  const cmd = flat(read('commands/aeo.md'));
  assert.match(cmd, /class G - one check per keyword per engine, queued for Hiveku's checker, against the account's daily re-check limit; a lane not done within about 45 seconds answers `pending: true`/);
  assert.match(cmd, /The perplexity and chatgpt lanes now read each assistant's own answer; a reading from before the lanes began reading it shows as not checked until its next check, so never compare a reading from before the change with one after it\./);
});

test('no SEO line about the chatgpt or perplexity lanes names a date they changed on', () => {
  const offenders = seoProse().flatMap((f) =>
    read(f)
      .split('\n')
      .filter((line) => /perplexity|chatgpt/i.test(line) && A_DATE.test(line))
      .map((line) => `${f}: ${line.trim()}`),
  );
  assert.deepEqual(offenders, []);
  // The step 6 lines wrap: the date stood on the line after the lane names.
  const step6 = flat(read('commands/aeo.md'));
  assert.doesNotMatch(step6.slice(step6.indexOf('6. AI-lane read-back'), step6.indexOf('7. Brand side')), A_DATE);
});
