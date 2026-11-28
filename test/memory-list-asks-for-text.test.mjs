/**
 * HK-2244: every memory_list call this plugin makes asks for each row's text
 * by name (include_content: true), and the knowledge sync never keeps a row
 * that still came without it (its `content` is not a string; the builder then
 * sends `content_chars` instead):
 *   - not written: no file is emptied, and its Claude Code skill copy is not
 *     rewritten;
 *   - not pruned: the file and skill copy the last pull wrote stay exactly as
 *     they were, both records keep its rows, it is not reported deleted, and
 *     no other entry takes its file name;
 *   - not pushed: nothing here sends a memory write;
 *   - said once, in one WARNING line that is true with or without a copy here
 *     and says nothing in Hiveku changed;
 *   - in the status file the pull writes: in `left_without_text` and
 *     `changed_remote`, never counted in `in_sync`.
 * A row whose text is "" is a real empty entry and is written as before.
 *
 * An in-process MCP server that records every tool call's arguments.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs, readFileSync } from 'node:fs';
import { readRequestText } from './request-body.mjs';
import { pullKnowledge, knowledgeStatus, leftAsItWasLine } from '../lib/knowledge.mjs';
import { runPullData } from '../lib/pulldata.mjs';
import { ACCOUNT_MEMORY_SAMPLE } from './account-memory-fixture.mjs';

const DEPT_MANIFEST = JSON.parse(readFileSync(new URL('../lib/dept-manifest.json', import.meta.url), 'utf8'));

let server;
let endpoint;
/** Every tool call, with its arguments. */
const calls = [];
/** What memory_list answers, by listing ('all' for the one with no type). */
let upstream = {};

const toolResult = (payload) => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] });

before(async () => {
  server = http.createServer((req, res) => {
    readRequestText(req).then((body) => {
      const rpc = JSON.parse(body || '{}');
      const reply = (result) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
      };
      if (rpc.method === 'initialize') return reply({ protocolVersion: '2024-11-05' });
      if (rpc.method === 'notifications/initialized') {
        res.statusCode = 204;
        return res.end();
      }
      if (rpc.method !== 'tools/call') return reply({});
      const { name, arguments: args } = rpc.params;
      calls.push({ name, args });
      if (name === 'account_memory_get') return reply(toolResult(ACCOUNT_MEMORY_SAMPLE));
      if (name === 'memory_list') return reply(toolResult({ data: upstream[args?.type ?? 'all'] ?? [] }));
      if (name === 'memory_get') return reply(toolResult({ data: { id: args?.memory_id, content: 'Full text.' } }));
      return reply(toolResult({ data: [] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
});

after(() => server.close());

beforeEach(() => {
  calls.length = 0;
  upstream = {};
});

const OPTS = async (log) => ({
  rootDir: await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-knowledge-no-text-')),
  endpoint,
  key: 'hvk_test',
  log,
});
const read = (rootDir, rel) => fs.readFile(path.join(rootDir, ...rel.split('/')), 'utf8');
const exists = (rootDir, rel) => fs.access(path.join(rootDir, ...rel.split('/'))).then(() => true, () => false);
const record = async (rootDir, rel) => JSON.parse(await read(rootDir, rel));

/** A row as the builder lists it without its text: no `content`, its length as `content_chars`. */
const withoutText = ({ content, ...row }) => ({ ...row, content_chars: content.length });

const TONE = { id: 'r1', name: 'tone', domain: '_rule:tone', department: 'sales', owner: 'sales', content: 'Warm, never pushy.', version: 3, updated_at: '2026-11-01T00:00:00Z' };
const PLAYBOOK = { id: 's1', name: 'discovery-call', domain: '_skill:discovery-call', department: 'sales', owner: 'sales', content: '# Discovery call\n\nRead the deal first.', version: 2, updated_at: '2026-11-01T00:00:00Z' };
const SOUL = { id: 'a1', domain: '_account:soul', department: 'orchestrator', content: '# How Iris works', version: 1, updated_at: '2026-11-01T00:00:00Z' };

test('every memory_list a knowledge pull and a status check make asks for the text by name', async () => {
  upstream = { rule: [TONE] };
  const opts = await OPTS();
  await pullKnowledge(opts);
  await knowledgeStatus(opts);
  const lists = calls.filter((c) => c.name === 'memory_list');
  assert.equal(lists.length, 14, 'six typed listings and the one with no type, twice');
  for (const { args } of lists) assert.equal(args.include_content, true, JSON.stringify(args));
  // The one listing with no filter at all is exactly that, plus the flag.
  assert.deepEqual(lists.filter((c) => !c.args.type).map((c) => c.args), [{ include_content: true }, { include_content: true }]);
  assert.deepEqual(lists.find((c) => c.args.type === 'rule').args, { type: 'rule', include_content: true });
});

test('the department data pull lists memory with its text by name', async () => {
  const { rootDir } = await OPTS();
  const knowledge = DEPT_MANIFEST.departments.find((d) => d.id === 'knowledge');
  assert.deepEqual(knowledge.datasets.find((ds) => ds.id === 'memory').args, { include_content: true });
  upstream = { all: [{ ...TONE }] };
  const result = await runPullData({ rootDir, endpoint, key: 'hvk_test', argv: ['--dataset', 'knowledge:memory'], vendoredManifest: DEPT_MANIFEST });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.filter((c) => c.name === 'memory_list').map((c) => c.args), [{ include_content: true }]);
});

test('a row without its text is not written, a row whose text is empty is, and the pull says so once', async () => {
  upstream = {
    rule: [withoutText(TONE), { id: 'r2', name: 'blank', domain: '_rule:blank', department: 'sales', owner: 'sales', content: '', version: 1 }],
    memory: [{ id: 'm1', name: 'sales', domain: 'sales', department: 'sales', owner: 'sales', content: 'Notes.', version: 1 }],
  };
  const lines = [];
  const opts = await OPTS((l) => lines.push(l));
  const result = await pullKnowledge(opts);
  assert.equal(await exists(opts.rootDir, 'rules/sales/tone.md'), false, 'never written, so never an empty copy');
  const blank = await read(opts.rootDir, 'rules/sales/blank.md');
  assert.match(blank, /domain: "_rule:blank"/);
  assert.ok(blank.endsWith('---\n\n'), 'an empty entry is written with nothing after its front matter');
  assert.equal(result.written, 2);
  assert.deepEqual(result.withoutText, ['tone']);
  assert.deepEqual(lines.filter((l) => /without its text|without their text/.test(l)), [
    '  WARNING: did not update tone: Hiveku sent it without its text. Nothing in Hiveku changed, and any copy here is as it was. Pull again to get it.',
  ]);
  const shared = await record(opts.rootDir, '.hiveku/knowledge-manifest.json');
  assert.equal(shared.entries['_rule:tone'], undefined, 'a row never written is never recorded as written');
  // The status file this pull wrote: the left row is not current here, and is never counted in sync.
  const status = await record(opts.rootDir, '.hiveku/knowledge-status.json');
  assert.equal(status.in_sync, 2, 'the two rows written, not the one left');
  assert.deepEqual(status.left_without_text, ['_rule:tone']);
  assert.deepEqual(status.changed_remote, ['_rule:tone'], 'a reader that trusts the file reads it again live');
  assert.ok(!calls.some((c) => /^memory_(create|update|delete|bulk)/.test(c.name)), 'nothing is sent back');
});

test("the file and skill copy an earlier pull wrote for a row now sent without its text stay as they were, recorded, and are not reported deleted", async () => {
  upstream = { rule: [TONE], skill: [PLAYBOOK], all: [SOUL] };
  const lines = [];
  const opts = await OPTS((l) => lines.push(l));
  await pullKnowledge(opts);
  const files = ['rules/sales/tone.md', 'skills/sales/discovery-call.md', '.claude/skills/hiveku-sales-discovery-call/SKILL.md', 'identity/orchestrator/how-it-works.md'];
  const before = Object.fromEntries(await Promise.all(files.map(async (rel) => [rel, await read(opts.rootDir, rel)])));
  const sharedBefore = await record(opts.rootDir, '.hiveku/knowledge-manifest.json');
  const stateBefore = await record(opts.rootDir, '.hiveku/knowledge-plugin.json');

  // Every row now comes without its text.
  upstream = { rule: [withoutText(TONE)], skill: [withoutText(PLAYBOOK)], all: [withoutText(SOUL)] };
  const result = await pullKnowledge(opts);

  for (const rel of files) assert.equal(await read(opts.rootDir, rel), before[rel], `${rel} is as it was`);
  assert.deepEqual(result.deletedRemote, []);
  assert.deepEqual(result.skills.removed, [], 'the Claude Code skill copy is not removed');
  assert.deepEqual(result.moved, []);
  assert.equal(result.written, 0);
  assert.deepEqual(result.withoutText.sort(), ['_account:soul', 'discovery-call', 'tone']);
  assert.ok(
    lines.includes(
      '  WARNING: did not update 3 entries: Hiveku sent them without their text (tone, discovery-call, _account:soul). Nothing in Hiveku changed, and any copies here are as they were. Pull again to get them.',
    ),
    lines.join('\n'),
  );

  const shared = await record(opts.rootDir, '.hiveku/knowledge-manifest.json');
  const state = await record(opts.rootDir, '.hiveku/knowledge-plugin.json');
  assert.deepEqual(shared.entries, sharedBefore.entries, 'the shared record keeps every row as it was');
  assert.deepEqual(state.entries, stateBefore.entries, "this plugin's record keeps every row as it was");
  const status = await record(opts.rootDir, '.hiveku/knowledge-status.json');
  assert.deepEqual(status.deleted_remote, []);
  assert.equal(status.in_sync, 0, 'nothing left without its text is in sync');
  assert.deepEqual([...status.left_without_text].sort(), ['_account:soul', '_rule:tone', '_skill:discovery-call']);
  assert.deepEqual([...status.changed_remote].sort(), ['_account:soul', '_rule:tone', '_skill:discovery-call']);

  // A status check sees the copies as in sync, not missing or deleted.
  const check = await knowledgeStatus(opts);
  assert.deepEqual(check.deleted_remote, []);
  assert.deepEqual(check.missing_local, []);
  assert.deepEqual(check.locally_modified, []);

  // When the text comes back, the entry is written again as usual.
  upstream = { rule: [{ ...TONE, content: 'Warm, and brief.', version: 4 }], skill: [PLAYBOOK], all: [SOUL] };
  const again = await pullKnowledge(opts);
  assert.ok((await read(opts.rootDir, 'rules/sales/tone.md')).endsWith('Warm, and brief.'));
  assert.deepEqual(again.withoutText, []);
  const current = await record(opts.rootDir, '.hiveku/knowledge-status.json');
  assert.deepEqual([current.in_sync, current.left_without_text, current.changed_remote], [3, [], []]);
});

test('no other entry takes the name of a file held for a row sent without its text', async () => {
  upstream = { rule: [{ ...TONE, id: 'x1', name: 'x', domain: '_rule:x', content: 'Sales rule X.' }] };
  const opts = await OPTS();
  await pullKnowledge(opts);
  const before = await read(opts.rootDir, 'rules/sales/x.md');

  // `_rule:x` comes without its text and now files under SEO; a second Sales rule named x is listed first.
  upstream = {
    rule: [
      { ...TONE, id: 'x2', name: 'x', domain: '_rule:x-two', content: 'Another rule.' },
      withoutText({ ...TONE, id: 'x1', name: 'x', domain: '_rule:x', owner: 'seo', content: 'Sales rule X.' }),
    ],
  };
  const result = await pullKnowledge(opts);
  assert.equal(await read(opts.rootDir, 'rules/sales/x.md'), before, 'the held file is never overwritten');
  assert.ok((await read(opts.rootDir, 'rules/sales/x-2.md')).endsWith('Another rule.'));
  assert.equal(await exists(opts.rootDir, 'rules/seo/x.md'), false);
  assert.deepEqual(result.movedKept, []);
  const shared = await record(opts.rootDir, '.hiveku/knowledge-manifest.json');
  assert.equal(shared.entries['_rule:x'].file, 'rules/sales/x.md');
  assert.equal(shared.entries['_rule:x-two'].file, 'rules/sales/x-2.md');
});

test('the line names one entry, or counts several, and is true with no copy here', () => {
  assert.equal(leftAsItWasLine([]), null);
  assert.equal(
    leftAsItWasLine(['tone']),
    'did not update tone: Hiveku sent it without its text. Nothing in Hiveku changed, and any copy here is as it was. Pull again to get it.',
  );
  assert.equal(
    leftAsItWasLine(['a', 'b', 'c']),
    'did not update 3 entries: Hiveku sent them without their text (a, b, c). Nothing in Hiveku changed, and any copies here are as they were. Pull again to get them.',
  );
  const many = Array.from({ length: 13 }, (_, i) => `r${i + 1}`);
  assert.match(leftAsItWasLine(many), /^did not update 13 entries: .*\(r1, .*, r10 and 3 more\)\. Nothing in Hiveku changed, .* Pull again to get them\.$/);
});
