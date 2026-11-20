// One social post score (HK-1793). anti-fluff.md section 4 lists the seven hard fails by id, in order, in the words
// the Hiveku app and the Social team's agent say too, and two CTAs stay a score (one-idea 0, cta 0). Every command
// or agent text that spells the hard fails out names all seven, so no reader of this plugin passes a post another
// one blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANTI_FLUFF = 'skills/hiveku-social-agency/references/anti-fluff.md';
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Lowercase, no backticks, one space for every run of whitespace: a rewrap or a code span never fails a pin. */
const flat = (text) => text.replaceAll('`', '').replace(/\s+/g, ' ').toLowerCase();

/** The seven, in order: the id a report or a review names, and the words it is said in. */
const HARD_FAILS = [
  ['banned_phrase', "a banned phrase, including the account's own"],
  ['no_persona_and_stage', 'no persona-and-stage header'],
  ['competitor_swap', 'the competitor-swap test fails'],
  ['variance_breach', 'a variance breach'],
  ['unbacked_claim', 'a number, quote or result no data file or tool result backs'],
  ['alt_text_over_125', 'alt text over 125 characters'],
  ['platform_not_used', "a platform the persona's online_behavior.social_platforms does not list"],
];

/** The section 4 list: one entry per numbered item, its wrapped lines included. */
function hardFailItems() {
  const text = read(ANTI_FLUFF);
  const start = text.indexOf('Hard fails (any one blocks the write');
  assert.ok(start > -1, `${ANTI_FLUFF} lost its hard-fail list`);
  return text.slice(start).split(/\n\s*\n/)[0].split(/\n(?=\d+\. )/).slice(1);
}

test('anti-fluff.md lists the seven hard fails by id, in order, in their words', () => {
  const items = hardFailItems();
  assert.deepEqual(
    items.map((item) => item.match(/^\d+\. `([a-z0-9_]+)`:/)?.[1] ?? item.slice(0, 40)),
    HARD_FAILS.map(([id]) => id),
  );
  for (const [index, [id, words]] of HARD_FAILS.entries()) {
    assert.ok(flat(items[index]).includes(words), `${id} must say "${words}"`);
  }
});

test('two CTAs are a score in anti-fluff.md, never a hard fail', () => {
  assert.ok(!hardFailItems().some((item) => /two ctas/i.test(item)), 'two CTAs is in the hard-fail list');
  const text = flat(read(ANTI_FLUFF));
  assert.ok(text.includes('two ctas are a score, not a hard fail'), 'anti-fluff.md must say two CTAs are a score');
  assert.ok(text.includes('| one-idea | two or more ideas, or two ctas |'), 'the one-idea row must score two CTAs 0');
  assert.ok(text.includes('| cta | none, two, or a non-question'), 'the cta row must score two CTAs 0');
});

test('every command and agent text that spells the hard fails out names all seven', () => {
  const texts = ['commands', 'agents', 'skills']
    .flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).map((rel) => path.join(dir, String(rel))))
    .filter((rel) => rel.endsWith('.md'))
    .map((rel) => ({ rel, text: flat(read(rel)) }))
    .filter(({ text }) => text.includes('hard fail') && text.includes('variance breach'));
  // The six that list them, and anti-fluff.md itself: a new list is pinned the moment it is written.
  assert.ok(texts.length >= 7, `only ${texts.length} texts spell the hard fails out; the scan broke`);
  const needles = [
    'banned phrase',
    'competitor',
    'variance breach',
    'no data file or tool result backs',
    'alt text over 125 characters',
    'online_behavior.social_platforms does not list',
  ];
  const offenders = texts.flatMap(({ rel, text }) =>
    [...needles.filter((needle) => !text.includes(needle)), ...(/header|persona/.test(text) ? [] : ['the header'])].map(
      (needle) => `${rel}: ${needle}`,
    ),
  );
  assert.deepEqual(offenders, []);
});
