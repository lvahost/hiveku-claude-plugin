/**
 * Post in Discussions in the automation doctrine (Discussions in workflows, wave 1).
 *
 * A workflow can post in Discussions, Hiveku's own team chat, the way it posts to
 * Slack: a Post in Discussions step (`discussionsAddMessage`) posts as the
 * workflow, with its name and an Automation tag, sent with the access of the
 * workflow's owner, to a channel or to a teammate (the direct message between
 * the owner and them). Only the owner sets a step that posts to a teammate or
 * into a private channel; anyone else is refused with 403
 * discussions_owner_only. The owner is read with workflow_get and
 * workflow_list, and taken with workflow_update { take_ownership: true }.
 *
 * Wherever the skills name the Slack step as a workflow's team alert, they
 * name Post in Discussions beside it, and node-rail says how it is set up and
 * who may set which. These pin that, so a recipe rewritten later cannot drop
 * Discussions back out of a team alert.
 */
import './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const SKILL = 'skills/hiveku-automation-agency/SKILL.md';
const NODE_RAIL = 'skills/hiveku-automation-agency/references/node-rail.md';
const RECIPES = 'skills/hiveku-automation-agency/references/recipes.md';

/** The paragraph of node-rail that starts with `start`, whitespace collapsed. */
function paragraphFrom(text, start) {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `missing "${start}"`);
  const end = text.indexOf('\n\n', at);
  return flat(end < 0 ? text.slice(at) : text.slice(at, end));
}

/** Numbered steps, bullets and bold-led lines of a markdown file, each with its wrapped lines joined. */
function itemsOf(text) {
  const items = [];
  let current = null;
  for (const line of text.split('\n')) {
    const starts = /^\s*(\d+\.\s|[-*]\s|\*\*)/.test(line) || line.trim() === '' || /^#/.test(line);
    if (starts) {
      if (current !== null) items.push(flat(current));
      current = line.trim() === '' || /^#/.test(line) ? null : line;
    } else if (current !== null) {
      current += ` ${line}`;
    } else if (line.trim() !== '') {
      current = line;
    }
  }
  if (current !== null) items.push(flat(current));
  return items;
}

test('node-rail names Post in Discussions first among the team notifications', () => {
  const rail = flat(read(NODE_RAIL));
  assert.match(
    rail,
    /\*\*Team notifications\*\*: `discussionsAddMessage` \(Post in Discussions, the team chat inside Hiveku\), `slackNotification`, `discordNotification`, `teamsNotification`, `pushNotification`\./,
  );
});

test('node-rail says how a Post in Discussions step is set up, who may set which, and how the owner is taken', () => {
  const p = paragraphFrom(read(NODE_RAIL), 'Post in Discussions posts as the workflow');
  for (const part of [
    'Post in Discussions posts as the workflow (its name, with an Automation tag), sent with the access of the workflow\'s owner.',
    "`postTo` (`'channel'`, the default, or `'person'`)",
    '`threadId` (a channel, from `workflow_field_options` with `discussion-channel-options`; `shared_with` names any other workspace that reads it)',
    "`userId` (a teammate, from `team-member-options`, or a teammate's email: the post goes to the direct message between the owner and them)",
    'an `@Name` typed there mentions that person',
    '`@here` or `@channel` tell a channel at most once every 10 minutes',
    '`mentionIds` (up to 20 people)',
    '`replyTo` (the `message_id` of an earlier post in the same conversation)',
    'A name a variable fills in mentions nobody.',
    "it posts nothing, answers `posted: false` with `skipped: 'hourly_limit'`, and the run goes on",
    "Only the workflow's owner adds or changes a step that posts to a teammate or into a private channel; anyone else gets 403 `discussions_owner_only`",
    '`workflow_get` and `workflow_list` show the owner',
    '`workflow_update({ id, take_ownership: true })`, sent on its own, makes the person behind the key the owner',
    'an account owner or admin may take any workflow, anyone else one with no owner or whose owner left the team',
    'Ask that person first: the workflow\'s posts then go out with their access.',
    'In `workflow_test` it posts nothing and says what it would have posted',
  ]) {
    assert.ok(p.includes(part), `node-rail's Post in Discussions paragraph is missing: ${part}`);
  }
});

test('node-rail no longer files Post in Discussions under collaboration, and says Create Discussion cannot run yet', () => {
  const rail = flat(read(NODE_RAIL));
  const collab = rail.slice(rail.indexOf('**Collaboration and infrastructure**'), rail.indexOf('## Part 7'));
  assert.ok(collab.length > 0, 'node-rail lost its collaboration list');
  assert.match(collab, /`discussionsCreate` \(it cannot run yet: a workflow cannot start a Discussions channel, so the step stops with an error\)/);
  assert.match(collab, /Post in Discussions \(`discussionsAddMessage`\) is a team notification: see 6\.2\./);
  assert.doesNotMatch(collab, /`discussionsAddMessage`,/);
});

test('every recipe step that sends a team alert to Slack names Post in Discussions beside it', () => {
  const items = itemsOf(read(RECIPES)).filter((item) => item.includes('`slackNotification`'));
  assert.ok(items.length >= 7, `expected the seven recipe steps that name the Slack step, found ${items.length}`);
  const alone = items.filter((item) => !item.includes('`discussionsAddMessage`'));
  assert.deepEqual(alone, [], 'a team alert names Post in Discussions beside Slack');
  // The one about telling the assigned rep: a direct message is the owner's to set up.
  assert.match(flat(read(RECIPES)), /Post in Discussions with `postTo: 'person'` lands in the direct message between the workflow's owner and that rep, and only the workflow's owner can set that step up\./);
  assert.match(flat(read(RECIPES)), /\*\*Ship\.\*\* Enable, and confirm the channel \(in Discussions or Slack\) is one somebody reads\./);
});

test('the skill says a live workflow posts in Discussions, and a test posts nothing there', () => {
  const skill = flat(read(SKILL));
  assert.match(skill, /posts to the client's real Slack and Discussions\./);
  assert.match(skill, /\*\*What it skips\*\* \(no real side effect fires\): outbound email\/SMS\/Slack\/Discord, posts in Discussions \(Post in Discussions says what it would have posted\)/);
});

test('the new words are plain, with nothing internal in them (this repository is public)', () => {
  const added = [
    paragraphFrom(read(NODE_RAIL), 'Post in Discussions posts as the workflow'),
    paragraphFrom(read(NODE_RAIL), '**Team notifications**'),
    ...itemsOf(read(RECIPES)).filter((item) => item.includes('`discussionsAddMessage`')),
  ];
  for (const text of added) {
    assert.doesNotMatch(text, /[–—]/, `no long dash: ${text.slice(0, 80)}`);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `no emoji: ${text.slice(0, 80)}`);
    assert.doesNotMatch(text, /hiveku_builder|src\/|\.tsx?\b|notes\/|HK-\d/, `nothing internal: ${text.slice(0, 80)}`);
  }
});
