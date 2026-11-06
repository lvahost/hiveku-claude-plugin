/**
 * HK-1162: the plugin teaches the canvas timing key the editor and the render read.
 *
 * The skills said `_animation: { duration_ms, fps, loop }` on the root, with THE KEYS ARE EXACT. Nothing but
 * design_state_get ever read that key, so an agent that followed the text wrote timing the editor and the MP4
 * ignored, and the state read came back null on every design the editor saved. The key is `animation`. An old
 * design's `_animation` is still read, and moved when the design is saved: the text may say so, never teach it.
 *
 * Also pinned (HK-1161): the post-time ceilings the social skill names are the vendors' current ones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const TEACHING = [
  'commands/design.md',
  'skills/hiveku-creative-agency/SKILL.md',
  'skills/hiveku-creative-agency/references/design-canvas.md',
  'skills/hiveku-creative-agency/references/self-review.md',
  'skills/hiveku-creative-agency/references/video.md',
];

// A line that tells an agent to write the old key: `_animation:` or `"_animation":` as a key to set.
const TEACHES_OLD_KEY = /(^|[^A-Za-z0-9_`])`?"?_animation"?`?\s*:|root `_animation`|`_animation\.duration_ms`|and `_animation` fields/m;

test('no skill or command teaches the old canvas timing key', () => {
  for (const rel of TEACHING) {
    assert.doesNotMatch(read(rel), TEACHES_OLD_KEY, `${rel} still teaches _animation`);
  }
});

test('the creative skill and the canvas reference name `animation` on the root', () => {
  assert.match(read('skills/hiveku-creative-agency/SKILL.md'), /Canvas motion is `animation: \{ duration_ms, fps, loop \}` on the root/);
  assert.match(read('skills/hiveku-creative-agency/references/design-canvas.md'), /sits on the root: `"animation": \{ "duration_ms": 6000/);
  assert.match(read('commands/design.md'), /Root: `animation: \{ duration_ms, fps, loop \}`/);
});

test("the eval fixture's state read follows the route: `animation` first, an old row's `_animation` after", async () => {
  const source = read('evals/fixtures/design-social-set/tools.mjs');
  assert.match(source, /canvasAnimation: \(canvas && \(canvas\.animation \|\| canvas\._animation\)\) \|\| null/);
});

test('the social skill names the current post-time ceilings, the Reels file cap with them', () => {
  const text = read('skills/hiveku-social-agency/references/short-form-and-ugc.md');
  assert.doesNotMatch(text, /Reels 90s|Shorts 60s/);
  assert.match(text, /Shorts up to 3 minutes, Reels up to\s+15 minutes in a file of at most 300 MB/);
});

test('the media command names the same ceilings and the canvas key the render reads (HK-1161, HK-1162)', () => {
  const text = read('commands/media.md');
  assert.doesNotMatch(text, /Reels 90s|Shorts 60s/);
  assert.match(text, /Shorts 3 minutes, Reels 15 minutes and 300 MB/);
  assert.doesNotMatch(text, TEACHES_OLD_KEY, 'commands/media.md still teaches _animation');
  assert.match(text, /Canvas-level timing is `animation: \{ duration_ms, fps, loop \}` on the root/);
});
