/**
 * The orient skill's Discussions section (2026-11-10): when a tool counts as missing, and who can send in a person's
 * own conversations.
 *
 * By default the plugin's bridge lists only a small core set of tools, and every other tool appears once a search
 * (hiveku_find_tools, or hiveku_tool_schema with its name) adds it. "A tool named here that is not among your tools has
 * not reached your connection yet" therefore told an agent that discussion_list, the bulk channel tool and the private
 * reads were missing at the start of every session, and steered it to making channels one at a time. A tool is missing
 * only when a search does not find it.
 *
 * "No tool can send there" was untrue as well: the Hiveku app's own key sends in a person's direct messages for them.
 * No AI app's connection can, which is what the tool server's own texts say.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orient = fs.readFileSync(path.join(ROOT, 'skills', 'hiveku-orient', 'SKILL.md'), 'utf8');

/** The orient skill's Discussions section. */
function discussionsSection() {
  const start = orient.indexOf('## Discussions - the team\'s chat');
  assert.ok(start !== -1, 'the orient skill has no Discussions section');
  const end = orient.indexOf('\n## ', start + 1);
  return orient.slice(start, end === -1 ? undefined : end);
}

test('a tool named in the Discussions section is missing only when a search does not find it', () => {
  const section = discussionsSection();
  assert.match(
    section,
    /A tool named here that a search does not find\*\* \(`hiveku_find_tools`, or `hiveku_tool_schema`\s+with its name\) has not reached your connection yet: say so plainly\./,
  );
  assert.match(section, /Your tool list may not show\s+every tool, so look one up before you say it is missing\./);
  assert.doesNotMatch(section, /not among your tools/);
});

test('no AI app\'s connection sends in the person\'s own conversations; the Hiveku app\'s own key does, for them', () => {
  const section = discussionsSection();
  assert.match(section, /No AI\s+app's connection, yours included, can send, reply, react or start one there\./);
  assert.doesNotMatch(section, /No tool can\s+send/);
  // Plain words: no em dash, and no other chat product's name in what a customer's agent reads.
  assert.doesNotMatch(section, /\u2014|\u2013/);
  assert.doesNotMatch(section, /slack/i);
});
