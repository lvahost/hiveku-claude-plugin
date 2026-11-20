import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * The social texts the 2026-11-18 review corrected:
 *   - HK-1747: Facebook's 10 pictures and LinkedIn's 9 are Hiveku's own caps, not the networks', and say so;
 *   - HK-1775: a post whose every TikTok copy is a draft in the creator's inbox is counted in counts.tiktok_inbox, not
 *     in counts.published, while a status "published" list still holds it.
 */

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');

test("the picture caps say Facebook's and LinkedIn's are Hiveku's own (HK-1747)", () => {
  const text = read('skills/hiveku-social-agency/references/creative-and-video.md');
  assert.ok(text.includes("Hiveku sends at most 10 pictures to Facebook and 9 to LinkedIn (or one document): those two are Hiveku's own caps, not the networks'"));
  assert.equal(text.includes('Facebook 10 images'), false);
  assert.equal(text.includes('LinkedIn 9 images or one document'), false);
});

test('a TikTok draft is counted apart from published, and a published list still holds it (HK-1775)', () => {
  const text = read('agents/hiveku-social-analyst.md');
  assert.ok(text.includes('`counts.tiktok_inbox` on `social_list_posts` counts it and `counts.published` does not'));
  assert.ok(text.includes('a `status: "published"` list and its `pagination.total` still hold it'));
  assert.equal(text.includes('is in `published` too'), false);
});
