/**
 * Plain words for team chat find the Discussions tools, through the plugin's own search (lib/search-plain-words.mjs,
 * lib/tool-index.mjs searchTools).
 *
 * Measured before the rules, on the index of 2026-11-09: "team chat" found only website chat tools, "post in a
 * channel" put discussion_channel_share_request_answer first, "reply in a thread" offered the email inbox's thread
 * reads, "make many channels" offered discussion_channels_browse and accounting_marketing_channels, and "slack" a
 * project's webhook test.
 *
 * Two of the tools these words mean are not served yet (making many channels at once, and the person's own direct
 * messages), so the live index cannot carry them. The second half of this file runs the same search from a copy of the
 * plugin whose index also carries them, as the release that regenerates the index will.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { searchTools, loadIndex, renderResults } from '../lib/tool-index.mjs';
import { plainWordTools, PLAIN_WORD_RULES } from '../lib/search-plain-words.mjs';
import { isMeteredVendorRead, isReadOnlyTool } from '../lib/tool-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = (search, query, n = 5, opts = {}) => search(query, { limit: n, ...opts }).map((t) => t.name);

/** What each plain phrase must find first, among the tools served today. */
const SERVED_TODAY = [
  ['team chat', 'discussion_list'],
  ['slack', 'discussion_list'],
  ['discussions', 'discussion_list'],
  ['read a channel', 'discussion_messages_list'],
  ['catch me up on the launch channel', 'discussion_messages_list'],
  ['make a summary of the channel', 'discussion_messages_list'],
  ['post in a channel', 'discussion_reply'],
  ['send a message to the team chat', 'discussion_reply'],
  ['reply in a thread', 'discussion_reply'],
  ['search the channels for the launch date', 'discussion_search'],
  ['make a channel', 'discussion_create'],
  ['start a discussion', 'discussion_create'],
];

test('plain words for team chat find the Discussions tool that answers them first', () => {
  assert.ok(loadIndex().length > 1000, 'the catalogue is missing');
  for (const [query, first] of SERVED_TODAY) {
    assert.equal(names(searchTools, query, 1)[0], first, `"${query}": ${names(searchTools, query, 5).join(', ')}`);
  }
  // Reading the channel comes with finding it, and the team chat with its main reads and the post.
  assert.deepEqual(names(searchTools, 'read a channel', 3), ['discussion_messages_list', 'discussion_list', 'discussion_get']);
  assert.deepEqual(names(searchTools, 'team chat', 4),
    ['discussion_list', 'discussion_messages_list', 'discussion_search', 'discussion_reply']);
});

test('words for another part of Hiveku, or for one Discussions job by itself, are left to the scoring', () => {
  for (const query of [
    'reply in the email thread', 'reply to the sms thread', 'marketing channel roi', 'youtube channel',
    'chat history', 'website chat', 'slack webhook', 'test the slack integration', 'post on facebook',
    'post on threads', 'share a channel with another workspace', 'unread messages', 'pin a message in the channel',
    'archive a channel', 'add people to a channel', 'schedule a post at 3 pm', 'list contacts', 'secrets for a project',
    "what's new in the channel", 'start a DM', 'make a private channel', 'instagram direct messages',
  ]) {
    assert.deepEqual(plainWordTools(query), [], `"${query}" must get no rule`);
  }
  // As before the rules: the email inbox's thread read, the channel ROI report and the project's webhook test.
  assert.equal(names(searchTools, 'reply in the email thread', 1)[0], 'crm_inbox_reply_thread_get');
  assert.equal(names(searchTools, 'marketing channel roi', 1)[0], 'marketing_channel_roi');
  assert.equal(names(searchTools, 'slack webhook', 1)[0], 'pm_project_slack_test');
});

test('a query that names a tool exactly gets that tool first, never a rule\'s', () => {
  for (const query of ['discussion_get', 'discussion get', 'select:mcp__plugin_hiveku_hk__discussion_get']) {
    assert.equal(names(searchTools, query, 1)[0], 'discussion_get', query);
  }
});

test('the rules keep the department, the folder focus, the limit and a read-only key\'s marks', () => {
  assert.ok(!names(searchTools, 'team chat', 5, { department: 'crm' }).some((n) => n.startsWith('discussion_')));
  assert.ok(!names(searchTools, 'post in a channel', 5, { focus: ['ppc'] }).some((n) => n.startsWith('discussion_')));
  assert.deepEqual(names(searchTools, 'post in a channel', 1), ['discussion_reply']);
  const marked = searchTools('post in a channel', { limit: 2, readOnlySet: new Set(['discussion_list']) });
  assert.deepEqual(marked.map((t) => [t.name, t.blockedByScope === true]), [['discussion_reply', true], ['discussion_list', false]]);
});

test('every rule names Discussions tools only, and each it names is served or contracted', async () => {
  const { PENDING_TOOLS } = await import('./pending-tools.mjs');
  const served = new Set(loadIndex().map((t) => t.name));
  for (const rule of PLAIN_WORD_RULES) {
    assert.ok(rule.tools.length > 0 && rule.says, 'a rule says what it is for and names its tools');
    for (const name of rule.tools) {
      assert.ok(name.startsWith('discussion_'), `${rule.says}: ${name}`);
      assert.ok(served.has(name) || PENDING_TOOLS.has(name), `${rule.says}: ${name} is neither served nor contracted`);
    }
  }
});

/* ── once the release carries making many channels and the private reads ─────────────────────────────────────── */

/** The four tools as the MCP release declares them (the first sentence of each description). */
const NOT_SERVED_YET = [
  {
    name: 'discussion_channels_bulk_create', dept: 'discussion', method: 'POST', timeoutMs: null,
    description: 'Make many Discussions channels at once, for a team moving its chat over or setting up a workspace: up '
      + 'to 100 a call, each written as the person who created this connection, its author and first member.',
  },
  {
    name: 'discussion_private_list', dept: 'discussion', method: 'GET', timeoutMs: null,
    description: "Show the person's own direct messages, group messages and private channels, most recent first, as "
      + 'their Discussions sidebar lists them.',
  },
  {
    name: 'discussion_private_messages', dept: 'discussion', method: 'GET', timeoutMs: null,
    description: "Read one of the person's own direct messages, group messages or private channels, a page at a time, "
      + 'newest first.',
  },
  {
    name: 'discussion_private_search', dept: 'discussion', method: 'GET', timeoutMs: null,
    description: "Search the words of the person's own direct messages, group messages and private channels, newest "
      + 'first, a page at a time, as discussion_search searches channels.',
  },
];

const copies = [];
after(() => {
  for (const dir of copies) fs.rmSync(dir, { recursive: true, force: true });
});

/** searchTools from a copy of this plugin whose index also carries `extra`. */
async function searchWithIndexCarrying(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-discussions-search-'));
  copies.push(dir);
  fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data'), path.join(dir, 'data'), { recursive: true });
  const file = path.join(dir, 'lib', 'tool-index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  index.tools.push(...extra);
  fs.writeFileSync(file, JSON.stringify(index));
  return (await import(pathToFileURL(path.join(dir, 'lib', 'tool-index.mjs')).href)).searchTools;
}

test('once served: many channels and the person\'s own direct messages are found by their plain words', async () => {
  const live = new Set(loadIndex().map((t) => t.name));
  const search = await searchWithIndexCarrying(NOT_SERVED_YET.filter((t) => !live.has(t.name)));
  for (const [query, expected] of [
    ['make many channels', ['discussion_channels_bulk_create', 'discussion_create']],
    ['make a channel for each client', ['discussion_channels_bulk_create', 'discussion_create']],
    ['import our slack channels', ['discussion_channels_bulk_create', 'discussion_create']],
    ['move our team chat over', ['discussion_channels_bulk_create', 'discussion_create']],
    ['make a channel', ['discussion_create', 'discussion_channels_bulk_create']],
    ['my direct messages', ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search']],
    ['read my DMs', ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search']],
    ['group messages with Ben', ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search']],
    ['my private channels', ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search']],
    ['unread DMs', ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search']],
    ['search my direct messages for the contract', ['discussion_private_search', 'discussion_private_list', 'discussion_private_messages']],
  ]) {
    assert.deepEqual(names(search, query, expected.length), expected, query);
  }
  // Sending one is no AI app's: the private reads come first, and their words say no AI app's connection sends there.
  assert.equal(names(search, 'send a DM to Ben', 1)[0], 'discussion_private_list');
  // A channel is still a channel, and the served tools keep their places.
  assert.equal(names(search, 'read a channel', 1)[0], 'discussion_messages_list');
  assert.equal(names(search, 'post in a channel', 1)[0], 'discussion_reply');
  assert.equal(names(search, 'reply in a thread', 1)[0], 'discussion_reply');
  assert.equal(names(search, 'team chat', 1)[0], 'discussion_list');
});

/* ── a read-only key's marks ───────────────────────────────────────────────────────────────────────────────────── */

// What the bridge hands a read-only key's search (lib/shim.mjs readOnlySet): the plugin's own read list.
const READ_ONLY_KEY = { has: (n) => isReadOnlyTool(n) };

test('a read-only key may read the person\'s own direct messages: a GET is never marked as out of its reach', async () => {
  const live = new Set(loadIndex().map((t) => t.name));
  const search = await searchWithIndexCarrying(NOT_SERVED_YET.filter((t) => !live.has(t.name)));
  // The server lets a read-only key call every GET it declares, these three included, though nothing pre-approves them.
  const reads = search('my direct messages', { limit: 3, readOnlySet: READ_ONLY_KEY });
  assert.deepEqual(reads.map((t) => [t.name, t.blockedByScope === true]), [
    ['discussion_private_list', false],
    ['discussion_private_messages', false],
    ['discussion_private_search', false],
  ]);
  assert.doesNotMatch(renderResults(reads, 'my direct messages'), /NOT callable with this read-only key/);
  // Making many channels is a POST, which the server refuses to a read-only key: still marked.
  const bulk = search('make many channels', { limit: 1, readOnlySet: READ_ONLY_KEY });
  assert.deepEqual(bulk.map((t) => [t.name, t.blockedByScope === true]), [['discussion_channels_bulk_create', true]]);
  assert.match(renderResults(bulk, 'make many channels'), /discussion_channels_bulk_create {2}\[POST\] {2}\[NOT callable with this read-only key\]/);
});

test('the older reads nothing pre-approves are callable too, and a POST or a paid research read stays marked', () => {
  const mark = (name) => {
    const [first] = searchTools(name, { limit: 1, readOnlySet: READ_ONLY_KEY });
    assert.equal(first?.name, name, `the search for ${name} must find it first`);
    return first.blockedByScope === true;
  };
  // GETs off the read list, as a recording's link and a project's delete preview are: the server lets a read-only key
  // call them, and the hook still asks the person before each recording read.
  for (const name of ['voice_recording_url_get', 'analytics_recording_get', 'pm_project_delete_impact']) {
    assert.equal(isReadOnlyTool(name), false, `${name} is off the read list; the fixture is wrong`);
    assert.equal(mark(name), false, name);
  }
  // A POST the plugin will not pre-approve, and research the account pays for: the server refuses both to such a key.
  assert.equal(mark('project_secrets_reveal'), true);
  const paid = loadIndex().find((t) => isMeteredVendorRead(t.name) && !t.method);
  assert.ok(paid, 'the index carries a paid research read');
  assert.equal(mark(paid.name), true, paid.name);
});
