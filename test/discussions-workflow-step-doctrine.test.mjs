/**
 * The Discussions steps in the automation doctrine (Discussions in workflows, waves 1 and 2).
 *
 * A workflow can post in Discussions, Hiveku's own team chat, the way it posts to
 * Slack: a Post in Discussions step (`discussionsAddMessage`) posts as the
 * workflow, with its name and an Automation tag, sent with the access of the
 * workflow's owner, to a channel, to a teammate (the direct message between the
 * owner and them), to a group of teammates (`postTo: 'group'`, with `userIds`)
 * or to the owner's own conversation (`postTo: 'yourself'`). Create a channel
 * (`discussionsCreate`) and Add people to a channel (`discussionsAddPeople`) act
 * as the owner too. Only the owner sets a step that messages a teammate, a group
 * or yourself, posts into a private channel or a channel shared in, or makes or
 * fills a private channel; anyone else is refused with 403
 * discussions_owner_only. The owner is read with workflow_get and
 * workflow_list, and taken with workflow_update { take_ownership: true }.
 *
 * Wherever the skills name the Slack step as a workflow's team alert, they
 * name Post in Discussions beside it, and node-rail says how the three steps are
 * set up and who may set which. These pin that, so a recipe rewritten later
 * cannot drop Discussions back out of a team alert.
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

/** The whole team notifications block of node-rail, from its first line to the Helpdesk entry, whitespace collapsed. */
function discussionsBlock() {
  const text = read(NODE_RAIL);
  const at = text.indexOf('**Team notifications**');
  assert.ok(at >= 0, 'node-rail lost its team notifications');
  const end = text.indexOf('**Helpdesk**', at);
  assert.ok(end > at, 'node-rail lost the Helpdesk entry after the team notifications');
  return flat(text.slice(at, end));
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

test('node-rail names the three Discussions steps first among the team notifications', () => {
  const rail = flat(read(NODE_RAIL));
  assert.match(
    rail,
    /\*\*Team notifications\*\*: `discussionsAddMessage` \(Post in Discussions, the team chat inside Hiveku\), `discussionsCreate` \(Create a channel\), `discussionsAddPeople` \(Add people to a channel\), `slackNotification`, `discordNotification`, `teamsNotification`, `pushNotification`\./,
  );
});

test('node-rail says how a Post in Discussions step is set up: its four targets, its words, its limit and its answer', () => {
  const p = paragraphFrom(read(NODE_RAIL), 'Post in Discussions posts as the workflow');
  for (const part of [
    'Post in Discussions posts as the workflow (its name, with an Automation tag), sent with the access of the workflow\'s owner.',
    "`postTo` (`'channel'`, the default, `'person'`, `'group'` or `'yourself'`)",
    '`threadId` for a channel, `userId` for a person or `userIds` for a group; `\'yourself\'` takes none',
    // The channel list: what each option carries, in the words of the tool.
    '`threadId` is a channel from `workflow_field_options` with `discussion-channel-options`: each option says its `kind` (`channel` or `shared_in`), `shared_with` (any other workspace that reads it) and `shared_from` (the workspace a shared-in channel comes from)',
    "`userId` is a teammate, from `team-member-options`, or a teammate's email: the post goes to the direct message between the owner and them (the owner's own id or email means the owner's own conversation)",
    '`userIds` is 2 to 20 teammates besides the owner, as ids or emails: the post goes to the group of exactly them and the owner, made on the first post and used again after (someone who leaves the group is in the next one this workflow makes)',
    "`'yourself'` posts in the owner's own conversation, where the owner is told and the post stays unread until they open it",
    'an `@Name` typed there mentions that person',
    '`@here` or `@channel` tell a channel at most once every 10 minutes',
    '`mentionIds` (up to 20 people) are mentioned too and named at the end of the message',
    "in a direct message, a group, a private channel or the owner's own conversation, only people in it are",
    '`replyTo` (the `message_id` of an earlier post in the same conversation)',
    'A name a variable fills in mentions nobody.',
    "it posts nothing, answers `posted: false` with `skipped: 'hourly_limit'`, and the run goes on",
    "`conversation` (`'channel'`, `'direct'`, `'group'` or `'self'`)",
  ]) {
    assert.ok(p.includes(part), `node-rail's Post in Discussions paragraph is missing: ${part}`);
  }
});

test('node-rail says how Create a channel and Add people to a channel are set up, and what each answers', () => {
  const make = paragraphFrom(read(NODE_RAIL), 'Create a channel (`discussionsCreate`) makes a channel');
  for (const part of [
    "makes a channel as the workflow's owner, with their access",
    '`name` (required; a leading `#` is dropped; at most 500 characters once filled in)',
    "`private` (true or false, or a variable; true, or a variable, counts as a private channel for the owner's rule below)",
    "`people` (up to 50 user ids or teammates' emails)",
    '`project_id` (a website, from `site-options`)',
    "`ifTaken`: `'use'`, the default, takes the channel with that name when there is one and adds the people to it, and `'stop'` stops the step",
    'a channel with that name that was archived stops it either way',
    "A public channel starts the account's `discussionCreatedTrigger` workflows like any new channel",
    '`created`, `thread_id`, `name` ("#acme", or "a private channel"), `private`, `link`, `added` and `already_in` (each a list of `{ user_id, name }`)',
    // The chain people ask for: a later step reads the new channel's id, as steps one after another.
    'A later step reaches the new channel with `{{<createId>.thread_id}}`',
    'as steps one after another, never as siblings',
  ]) {
    assert.ok(make.includes(part), `node-rail's Create a channel paragraph is missing: ${part}`);
  }
  const add = paragraphFrom(read(NODE_RAIL), 'Add people to a channel (`discussionsAddPeople`) adds');
  for (const part of [
    "`people` (1 to 50 user ids or teammates' emails, all on the team: when one is not, nobody is added)",
    '`threadId`, a channel of this workspace (a public one from `discussion-channel-options`, kind `channel`, or a private one the owner is in; never a direct or group message, an archived channel or one shared in)',
    "as the workflow's owner",
    'Someone already in the channel is listed in `already_in`, the rest in `added`',
  ]) {
    assert.ok(add.includes(part), `node-rail's Add people paragraph is missing: ${part}`);
  }
});

test('node-rail says who may set which, the wider owner rule, and how the owner is taken', () => {
  const p = paragraphFrom(read(NODE_RAIL), 'Who may set which:');
  for (const part of [
    'anyone who may edit workflows sets a post in a public channel, a public channel to make, or people to add to a public channel',
    "Only the workflow's owner adds or changes a step that messages a teammate, a group or yourself, posts into a private channel or a channel shared in, or makes or fills a private channel",
    // The whole workflow is the owner's while it holds such a step, not only that step (the server's gate).
    'while a workflow holds such a step only its owner saves, renames, restores or changes any of it, or runs that step for real; anyone else gets 403 `discussions_owner_only`',
    'A channel shared in has to be picked in the step, never named by a variable.',
    'except in a workflow that holds a step only its owner sets (making a private channel is one), where a variable such as `{{<createId>.thread_id}}` may reach it',
    'The channel list read through this connection never holds a private channel: the owner picks one in the app.',
    'Switching a workflow on or off, pausing it, testing it, simulating it, copying it and deleting it stay open to anyone who may manage it.',
    '`workflow_get` and `workflow_list` show the owner',
    '`workflow_update({ id, take_ownership: true })`, sent on its own, makes the person behind the key the owner',
    'an account owner or admin may take any workflow, anyone else one with no owner or whose owner left the team',
    "Ask that person first: the workflow's posts, channels and added people then go out with their access.",
    'In `workflow_test` these steps post, make and add nothing and say what they would have done',
    '"Would post in #sales as Lead alerts: ..."',
    '"Would make #acme."',
    '"Would add ... to #acme"',
  ]) {
    assert.ok(p.includes(part), `node-rail's owner paragraph is missing: ${part}`);
  }
  // Wave 1's narrower rule is gone: it named a teammate and a private channel only.
  assert.ok(!discussionsBlock().includes('adds or changes a step that posts to a teammate or into a private channel'));
});

test('node-rail files the three steps under team notifications, and the collaboration list holds only the two reads', () => {
  const rail = flat(read(NODE_RAIL));
  const collab = rail.slice(rail.indexOf('**Collaboration and infrastructure**'), rail.indexOf('## Part 7'));
  assert.ok(collab.length > 0, 'node-rail lost its collaboration list');
  // Create a channel runs now: it is no longer marked as unable to, and it is not listed here.
  assert.doesNotMatch(rail, /`discussionsCreate` \(it cannot run yet/);
  assert.doesNotMatch(rail, /a workflow cannot start a Discussions channel/);
  const listed = collab.slice(0, collab.indexOf('The two Discussions reads'));
  assert.ok(listed.length > 0, 'node-rail lost the sentence about the two Discussions reads');
  assert.doesNotMatch(listed, /`discussionsCreate`|`discussionsAddPeople`|`discussionsAddMessage`/);
  // The two reads, with their fields and the read permission they ask for.
  assert.match(collab, /`discussionsList` \(List channels: `search`, `project_id`, `archived` of `'exclude'`, the default, `'include'` or `'only'`, and `limit`, 20 unless set, at most 50\)/);
  assert.match(collab, /`discussionsGetThread` \(Read a channel: `threadId`, and `limit`, how many of its newest messages, 20 unless set, at most 100; newest first\)/);
  assert.match(collab, /The two Discussions reads take channels only, never a direct or group message or a private channel; saving, switching on, testing or running a workflow that holds either needs Discussions read, and the run's step outputs show only to people who may read Discussions\./);
  assert.match(collab, /Post in Discussions, Create a channel and Add people to a channel \(`discussionsAddMessage`, `discussionsCreate`, `discussionsAddPeople`\) are team notifications: see 6\.2\./);
});

test('every recipe step that sends a team alert to Slack names Post in Discussions beside it', () => {
  const items = itemsOf(read(RECIPES)).filter((item) => item.includes('`slackNotification`'));
  assert.ok(items.length >= 7, `expected the seven recipe steps that name the Slack step, found ${items.length}`);
  const alone = items.filter((item) => !item.includes('`discussionsAddMessage`'));
  assert.deepEqual(alone, [], 'a team alert names Post in Discussions beside Slack');
  // The one about telling the assigned rep: a direct message, a group and your own conversation are the owner's to set up.
  assert.match(
    flat(read(RECIPES)),
    /Post in Discussions with `postTo: 'person'` lands in the direct message between the workflow's owner and that rep, `postTo: 'group'` with `userIds` messages a group of them, and `postTo: 'yourself'` posts in the owner's own conversation; only the workflow's owner can set up any of those\./,
  );
  // Deal won: a channel of its own, made and filled one step after another.
  assert.match(
    flat(read(RECIPES)),
    /To give the deal its own channel, chain these one after another \(not as siblings\): `discussionsCreate` \(`name` from the deal, `ifTaken: 'use'`\), then `discussionsAddPeople` and `discussionsAddMessage`, each with `threadId: '\{\{<createId>\.thread_id\}\}'`\./,
  );
  assert.match(flat(read(RECIPES)), /\*\*Ship\.\*\* Enable, and confirm the channel \(in Discussions or Slack\) is one somebody reads\./);
});

test('the skill says a live workflow posts in Discussions, and a test posts, makes and adds nothing there', () => {
  const skill = flat(read(SKILL));
  assert.match(skill, /posts to the client's real Slack and Discussions\./);
  assert.match(
    skill,
    /\*\*What it skips\*\* \(no real side effect fires\): outbound email\/SMS\/Slack\/Discord, posts in Discussions, channels made and people added to them \(Post in Discussions, Create a channel and Add people to a channel say what they would have done\)/,
  );
});

test('the new words are plain, with nothing internal in them (this repository is public)', () => {
  const rail = flat(read(NODE_RAIL));
  const added = [
    discussionsBlock(),
    rail.slice(rail.indexOf('**Collaboration and infrastructure**'), rail.indexOf('## Part 7')),
    ...itemsOf(read(RECIPES)).filter((item) => item.includes('`discussionsAddMessage`') || item.includes('`discussionsCreate`')),
    flat(read(SKILL)).slice(flat(read(SKILL)).indexOf('**What it skips**'), flat(read(SKILL)).indexOf('**What it skips**') + 400),
  ];
  for (const text of added) {
    assert.doesNotMatch(text, /[–—]/, `no long dash: ${text.slice(0, 80)}`);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `no emoji: ${text.slice(0, 80)}`);
    assert.doesNotMatch(text, /hiveku_builder|src\/|\.tsx?\b|notes\/|HK-\d|feature\/|worktree/, `nothing internal: ${text.slice(0, 80)}`);
  }
});
