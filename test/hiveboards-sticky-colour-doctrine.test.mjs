/**
 * What the Hiveboards skill says a sticky note does with a colour outside its six names
 * (HK-858, from the HK-840 review).
 *
 * The skill taught that the renderer looks the colour up in a table and that a miss takes
 * the whole board down. Since HK-840 every renderer (the editor, the shared link,
 * hiveboard_render, the export, the mobile app) draws such a note yellow, so the text sent
 * an agent away from boards that open fine. The rules themselves did not change: create
 * stores yellow and reports it in coercions, the patch paths refuse the colour.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const FILES = [
  'skills/hiveku-hiveboards/SKILL.md',
  'skills/hiveku-hiveboards/references/board-recipes.md',
  'skills/hiveku-hiveboards/references/element-reference.md',
];

/** The paragraph or bullet that teaches a sticky note's colour, in each file. */
function stickyColourPassages(text) {
  return text
    .split(/\n\s*\n|\n(?=- )/)
    .filter((block) => /sticky/i.test(block) && /yellow/.test(block) && /orange/.test(block));
}

test('no Hiveboards skill text says an unknown sticky colour takes the board down', () => {
  for (const file of FILES) {
    for (const block of stickyColourPassages(read(file))) {
      assert.doesNotMatch(block, /render\s+down|takes?\s+the\s+(whole|entire)\s+board|dereferenc|undefined\.bg|crash/i, `${file}:\n${block}`);
    }
  }
});

test('the skill says what a note does with such a colour: it draws yellow', () => {
  for (const file of FILES) {
    const passages = stickyColourPassages(read(file));
    assert.ok(passages.length > 0, `${file} no longer teaches the sticky colour rule`);
    assert.ok(
      passages.some((block) => /draws?\s+any\s+other\s+value\s+(as|in)\s+yellow/i.test(block)),
      `${file} does not say an unknown colour draws yellow`,
    );
  }
});

test('the rules stay: create stores yellow and reports it, the patch paths refuse', () => {
  const reference = stickyColourPassages(read('skills/hiveku-hiveboards/references/element-reference.md')).join('\n');
  assert.match(reference, /coerced\s+to\s+`yellow`/);
  assert.match(reference, /`coercions`/);
  assert.match(reference, /REFUSED\s+rather\s+than\s+mirrored/);
});
