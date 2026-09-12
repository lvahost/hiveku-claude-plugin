/**
 * The image doctrine the plugin teaches must match what the server does
 * (the 2026-09-12 images program: GPT Image 2.5 as the default model, the
 * brand image profile with the brand_reference tag, and article imagery as
 * one pipeline call).
 *
 * Three drifts this pins, each a sentence that would read fine and send an
 * operator the wrong way:
 *
 *   - The creative skill and /hiveku:media called gemini "the default lane".
 *     The registry default is gpt-image-2.5 (src/lib/media/image-models.ts);
 *     an operator told otherwise would explain a fallback as the primary.
 *   - Brand mode was described as "palette, fonts, voice". It now sends the
 *     brand image profile plus the logo and the brand_reference images, and
 *     a customer who is never told about the tag never gets their own
 *     photography onto a render.
 *   - The content skill's Play 3 said "generated images auto-register" and
 *     stopped. A long-form piece ships with a hero and one image per major
 *     section from content_images_generate, after the draft is on its row
 *     and before the gate; the allowance is read first; alt text is
 *     mandatory. A session that loops generate_image over headings spends
 *     the allowance with no plan and no alt text.
 *
 * The two tool names ride on PENDING_TOOLS (batch IMAGES-1) until the live
 * index carries them; tool-names.test.mjs forces the entries out then.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const CONTENT_SKILL = 'skills/hiveku-content-agency/SKILL.md';
const MEDIA_AND_VISUALS = 'skills/hiveku-content-agency/references/media-and-visuals.md';
const CREATIVE_SKILL = 'skills/hiveku-creative-agency/SKILL.md';
const BRAND_AND_ASSETS = 'skills/hiveku-creative-agency/references/brand-and-assets.md';
const MEDIA_COMMAND = 'commands/media.md';

const toolIndex = () =>
  new Set(JSON.parse(read('lib/tool-index.json')).tools.map((t) => t.name));

// ── the two contracted names exist somewhere real ───────────────────────────

test('content_images_generate and brand_image_profile_get are live or pending under IMAGES-1', () => {
  const index = toolIndex();
  for (const name of ['content_images_generate', 'brand_image_profile_get']) {
    const pending = PENDING_TOOLS.get(name);
    assert.ok(index.has(name) || pending, `${name} is neither in lib/tool-index.json nor test/pending-tools.mjs`);
    if (pending) {
      assert.equal(pending.batch, 'IMAGES-1', `${name} is pending under the wrong batch`);
      assert.equal(pending.since, '2026-09-12', `${name} carries the wrong since date`);
    }
  }
});

// ── the content skill: one call, after the draft, before the gate ───────────

test('Play 3 illustrates with content_images_generate after the draft and before the quality gate, allowance first, alt text mandatory', () => {
  const skill = read(CONTENT_SKILL);
  const draft = skill.indexOf('2. **Draft via the department.**');
  const illustrate = skill.indexOf('4. **Illustrate - after the draft is on its row, before the gate and the publish.**');
  const gate = skill.indexOf('5. **Quality gate');
  assert.ok(draft > 0, 'Play 3 step 2 (the draft) is gone from the content skill');
  assert.ok(illustrate > draft, 'Play 3 no longer illustrates after the draft');
  assert.ok(gate > illustrate, 'the quality gate no longer follows the illustrate step');
  const step = skill.slice(illustrate, gate);

  const required = [
    ['a hero and one image per major section', /a hero and one image per major section/],
    ['the one call, by name', /`content_images_generate\(\{ content_id \}\)`/],
    ['never generate_image per heading', /not from `generate_image` per\s+heading/],
    ['the allowance is read first', /Read the allowance FIRST -\s+`media_image_quota`/],
    ['null remaining is unknown', /`remaining` null is UNKNOWN, never a green light/],
    ['the count is confirmed with the user', /confirm the count\s+with the user/],
    ['the partial result at the allowance', /returns what it made plus a warning/],
    ['alt text is mandatory', /Alt text is mandatory/],
    ['alt read back on every image and the row', /`images\[\]\.alt` for each, and\s+`featured_image_alt` on the row/],
    ['brand honesty', /`brand_applied` false means the pictures went out unbranded/],
    ['the reference file is loaded first', /Load `references\/media-and-visuals\.md` before any media or video\s+work/],
    ['content_media_attach stays a manifest', /`content_media_attach` is a manifest only/],
  ];
  const missing = required.filter(([, re]) => !re.test(step)).map(([name]) => name);
  assert.deepEqual(missing, [], 'the illustrate step lost these rules');

  // The old sentence that let a session stop at "auto-register" must not come back.
  assert.doesNotMatch(step, /^4\. \*\*Visuals:\*\*/m, 'Play 3 step 4 is the old Visuals paragraph again');
  // The workaround closure names the loop it closes.
  assert.match(skill, /no\s+`generate_image` loop over a post's headings to route around the allowance read/, 'the hard stops no longer close the generate_image-per-heading workaround');
  // The reference list tells a session what the file now carries.
  assert.match(skill, /`references\/media-and-visuals\.md` - before generating[\s\S]{0,200}the article-images call and its allowance/, 'the reference list no longer says media-and-visuals.md carries the article-images contract');
});

test('media-and-visuals.md carries the content_images_generate and brand_image_profile_get contracts as the routes return them', () => {
  const ref = read(MEDIA_AND_VISUALS);
  assert.match(ref, /^## Article images - `content_images_generate\(\{ content_id, max_images\?, model\?, quality\?, hero\?, sections\?, plan\? \}\)`$/m, 'the article-images section is gone');
  assert.match(ref, /^## The brand image profile - `brand_image_profile_get\(\{ project_id\? \}\)`$/m, 'the brand image profile section is gone');
  // The keys and codes a session reads, as src/lib/marketing/content-images.ts
  // and the image-profile route return them.
  for (const key of [
    'POST /api/olympus/marketing/content/:contentId/images',
    '`max_images` 1 to 8, default 4, hero included',
    '`gpt-image-2.5` (the default, GPT Image 2.5)',
    '`gpt-image-2.5-sunburst`',
    '`low` | `medium` |\n`high` | `xhigh` | `max` | `auto`',
    '400 `invalid_plan`',
    "`{ url, alt, heading, anchor, asset_id, role: 'hero' |\n'section' }`",
    '`content_changed`',
    '`featured_image_changed`',
    '`brand_reference_ids`',
    '`allowance` `{ used, limit, remaining }`',
    '402 `quota_exhausted` `{ remaining: 0, used, limit }`',
    '503 `brand_unavailable`',
    '`planner_unavailable` and `planner_bad_response`',
    '`content_image` and `content:<content_id>`',
    '`inline_image_alt_missing` and `hero_alt_missing`',
    '`prompt_block`',
    '`avoid_list`',
    '`reference_images` as `{ id, url, role }`',
    '`reference_tag`',
    '404 `no_active_brand_guide`',
    'GET\n/api/olympus/marketing/brand/image-profile?project_id=',
  ]) {
    assert.ok(ref.includes(key), `media-and-visuals.md no longer names ${JSON.stringify(key)}`);
  }
  assert.match(ref, /Read the allowance first\.\*\* `media_image_quota` before the call/, 'the allowance rule lost its tool');
  assert.match(ref, /only the three newest ride on a generation, so\s+re-tagging is how a newer image is promoted/, 'the brand_reference rule lost the three-newest limit');
  assert.match(ref, /Alt text is mandatory, and it is yours to check/, 'the alt-text rule is gone');
  assert.match(ref, /On a timeout do NOT call it\s+again blind/, 'the timeout rule is gone');
});

// ── the creative skill and /hiveku:media: the default model and what brand mode sends ──

test('the creative skill teaches gpt-image-2.5 as the default, sunburst for edits, the brand image profile and the brand_reference tag', () => {
  const skill = read(CREATIVE_SKILL);
  const rung = skill.slice(skill.indexOf('**2. One-off image.**'), skill.indexOf('**3. Editable design project.**'));
  assert.ok(rung.length > 0, 'rung 2 of the decision ladder is gone');
  assert.match(rung, /The default model is\s+`gpt-image-2\.5`/, 'rung 2 no longer names gpt-image-2.5 as the default');
  assert.match(rung, /`gemini-3\.1` is its fallback/, 'rung 2 no longer says gemini-3.1 is the fallback');
  assert.match(rung, /`gpt-image-2\.5-sunburst` is the premium pick for an edit/, 'rung 2 no longer names sunburst for edits');
  assert.match(rung, /brand mode now\s+sends the whole brand IMAGE profile, not three colours and two fonts/, 'rung 2 no longer says what brand mode sends');
  assert.match(rung, /the primary logo and up to three Media\s+Library images the client tagged `brand_reference`/, 'rung 2 no longer names the reference images and the tag');
  assert.match(rung, /the fal lane gets the text only/, 'rung 2 no longer says the fal lane gets no references');
  assert.match(rung, /`brand_image_profile_get`/, 'rung 2 no longer names brand_image_profile_get');
  assert.match(rung, /`brand_reference_ids` names the references that reached the\s+model/, 'rung 2 no longer names brand_reference_ids');
  assert.match(rung, /`content_images_generate`, one call per piece/, 'rung 2 no longer sends blog imagery to content_images_generate');
  assert.doesNotMatch(skill, /the default gemini lane/, 'the creative skill again calls gemini the default lane');

  assert.match(skill, /Only the three newest `brand_reference` images ride\./, 'the pitfalls lost the three-newest rule');
  assert.match(skill, /tag the photography the client has approved as the brand's look\s+`brand_reference`/, 'Play 3 no longer tags approved photography');
  assert.match(skill, /tag up to three approved photographs `brand_reference`/, 'Play 4 no longer tags approved photography');

  const ref = read(BRAND_AND_ASSETS);
  assert.match(ref, /\*\*How a client marks approved brand imagery:\*\* tag a Media Library image `brand_reference`/, 'brand-and-assets.md no longer says how the tag is set');
  assert.match(ref, /`brand_image_profile_get\(\{ project_id\? \}\)` returns exactly what a generation will send/, 'brand-and-assets.md no longer names brand_image_profile_get');
  assert.match(ref, /`model` defaults to `gpt-image-2\.5`/, 'Lane 1 no longer names the default model');
  assert.match(ref, /the dark, secondary, icon and monochrome slots never ride/, 'brand-and-assets.md no longer says only the primary logo rides');
});

test('/hiveku:media names the default model, what brand mode sends, the tag, and the one-call article lane', () => {
  const command = read(MEDIA_COMMAND);
  assert.match(command, /`model` defaults to `gpt-image-2\.5`/, 'media.md no longer names the default model');
  assert.match(command, /`gpt-image-2\.5-sunburst` is the\s+premium model for an edit/, 'media.md no longer names sunburst for edits');
  assert.match(command, /What brand mode sends now: the brand IMAGE profile/, 'media.md no longer says what brand mode sends');
  assert.match(command, /`brand_image_profile_get` returns exactly that set/, 'media.md no longer names brand_image_profile_get');
  assert.match(command, /tagging a library image `brand_reference`/, 'media.md no longer says how a customer marks approved imagery');
  assert.match(command, /`content_images_generate\(\{ content_id \}\)`/, 'media.md no longer sends blog imagery to content_images_generate');
  assert.match(command, /`media_image_quota` first, count confirmed/, 'media.md no longer reads the allowance before the article run');
  assert.doesNotMatch(command, /on the gemini lane/, 'media.md again calls gemini the lane the fal knobs 400 on');
});

// ── shipped copy: no exclamation marks in the new prose ─────────────────────

test('the image prose carries no exclamation marks', () => {
  for (const rel of [MEDIA_AND_VISUALS, MEDIA_COMMAND]) {
    const shouts = read(rel).split('\n').filter((line) => /!/.test(line) && !/exclamation/.test(line));
    assert.deepEqual(shouts, [], `${rel} carries an exclamation mark in shipped copy`);
  }
});
