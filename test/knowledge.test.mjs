/**
 * Knowledge sync against an in-process MCP server. The semantics that matter:
 * by-department layout, domain-as-identity, ADVISORY deletes (a file gone
 * upstream is reported, never removed), and the drift states an agent reads to
 * decide whether the local copy can be trusted.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { pullKnowledge, knowledgeStatus, departmentOf } from '../lib/knowledge.mjs';
import { ACCOUNT_MEMORY_SAMPLE } from './account-memory-fixture.mjs';

let server;
let endpoint;
/** Every tool name called, so a test can prove nothing was written back. */
const toolCalls = [];
/** false: account_memory_get answers like a server that does not have it yet. */
const accountMemory = { deployed: true };
const ACCOUNT_ID = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';
/** Mutable upstream state so tests can simulate remote change/delete. */
const upstream = {
  memory: [
    { id: 'm1', name: 'Keyword strategy', domain: 'seo', content: 'target long-tail', version: 1, updated_at: '2026-08-01T00:00:00Z' },
    { id: 'm2', name: 'Brand voice', domain: '_identity:brand', content: '<!-- department: marketing -->\nwarm, direct', version: 2, updated_at: '2026-08-02T00:00:00Z' },
    { id: 'm3', name: 'Untagged note', content: 'no domain at all', version: 1, updated_at: '2026-08-01T00:00:00Z' },
  ],
  rule: [{ id: 'r1', name: 'No emojis', domain: 'sales', content: 'never', version: 3, updated_at: '2026-08-03T00:00:00Z' }],
  skill: [],
  command: [],
  agent: [],
  identity: [],
};

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
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
      if (rpc.method === 'tools/call') toolCalls.push(rpc.params.name);
      if (rpc.method === 'tools/call' && rpc.params.name === 'account_memory_get') {
        if (!accountMemory.deployed) {
          return reply({ isError: true, content: [{ type: 'text', text: 'Unknown tool: account_memory_get' }] });
        }
        return reply({ content: [{ type: 'text', text: JSON.stringify(ACCOUNT_MEMORY_SAMPLE) }] });
      }
      if (rpc.method === 'tools/call' && rpc.params.name === 'memory_list') {
        const type = rpc.params.arguments?.type;
        return reply({ content: [{ type: 'text', text: JSON.stringify({ data: upstream[type] || [] }) }] });
      }
      reply({});
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
});

after(() => server.close());

const OPTS = async () => ({
  rootDir: await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-knowledge-')),
  endpoint,
  key: 'hvk_test',
});

test('departmentOf: domain wins; _-prefixed domains fall to the content tag; else general', () => {
  assert.equal(departmentOf({ domain: 'seo', content: '' }), 'seo');
  assert.equal(departmentOf({ domain: '_command:x', content: '<!-- department: ppc -->' }), 'ppc');
  assert.equal(departmentOf({ content: 'department: sales' }), 'sales');
  assert.equal(departmentOf({ content: 'nothing' }), 'general');
});

test('pull writes the by-department layout with frontmatter and a manifest keyed by domain', async () => {
  const opts = await OPTS();
  const result = await pullKnowledge(opts);
  assert.equal(result.written, 4);

  const seo = await fs.readFile(path.join(opts.rootDir, 'memory/seo/keyword-strategy.md'), 'utf8');
  assert.match(seo, /^---\n/);
  assert.match(seo, /domain: "seo"/);
  assert.match(seo, /target long-tail/);

  // _identity: domain -> department comes from the content tag.
  await fs.access(path.join(opts.rootDir, 'memory/marketing/brand-voice.md'));
  // No domain, no tag -> general.
  await fs.access(path.join(opts.rootDir, 'memory/general/untagged-note.md'));
  await fs.access(path.join(opts.rootDir, 'rules/sales/no-emojis.md'));

  const manifest = JSON.parse(await fs.readFile(path.join(opts.rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
  assert.ok(manifest.entries['seo'], 'manifest must key by domain');
  assert.equal(manifest.entries['seo'].file, path.join('memory', 'seo', 'keyword-strategy.md'));
});

test('an upstream delete is REPORTED, never executed locally', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);
  const removed = upstream.rule.pop(); // sales rule vanishes upstream
  try {
    const second = await pullKnowledge(opts);
    assert.deepEqual(second.deletedRemote, ['sales']);
    // The local file must still exist.
    await fs.access(path.join(opts.rootDir, 'rules/sales/no-emojis.md'));
  } finally {
    upstream.rule.push(removed);
  }
});

test('status reports changed_remote on a version bump and locally_modified on a local edit', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);

  upstream.memory[0].version = 99;
  try {
    let status = await knowledgeStatus(opts);
    assert.deepEqual(status.changed_remote, ['seo']);

    await fs.appendFile(path.join(opts.rootDir, 'rules/sales/no-emojis.md'), '\nlocal edit\n');
    status = await knowledgeStatus(opts);
    assert.deepEqual(status.locally_modified, ['sales']);
    assert.ok(status.in_sync >= 1);
  } finally {
    upstream.memory[0].version = 1;
  }
});

test('a type that FAILS to list carries its prior entries forward, not deletes them', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts); // full success: baseline includes the sales rule
  const before = JSON.parse(await fs.readFile(path.join(opts.rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
  assert.ok(before.entries['sales'], 'baseline: the rule entry exists');

  // Make memory_list('rule') fail on the next pull (the mock returns a non-array,
  // which listMemory rejects); every other type still succeeds.
  const savedRules = upstream.rule;
  upstream.rule = { __fail: true };
  try {
    const result = await pullKnowledge(opts);
    assert.ok(result.failedTypes.includes('rule'), 'rule must be reported as a failed type');
    const after = JSON.parse(await fs.readFile(path.join(opts.rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
    assert.ok(after.entries['sales'], "the failed type's prior entry must be carried forward, not erased");
    assert.ok(!result.deletedRemote.includes('sales'), 'a failed type must never be false-flagged as deleted');
    await fs.access(path.join(opts.rootDir, 'rules/sales/no-emojis.md'));
  } finally {
    upstream.rule = savedRules;
  }
});

test('status before any pull says initialized:false instead of inventing drift', async () => {
  const opts = await OPTS();
  const status = await knowledgeStatus(opts);
  assert.equal(status.initialized, false);
  assert.equal(status.in_sync, 0);
});

/* ── The account memory (plan A7) ──────────────────────────────────────── */

test('knowledge pull writes the read-only account memory copy, and never files it as a department', async () => {
  const opts = await OPTS();
  // A server that (wrongly, or from before the builder excluded them) lists
  // the two account rows as ordinary memory entries.
  const leaked = [
    { id: 'a1', name: 'Account memory', domain: 'account', content: 'owner text', version: 7, updated_at: '2026-09-23T00:00:00Z' },
    { id: 'a2', name: 'Suggestions', domain: 'account-suggestions', content: '{"v":1}', version: 3, updated_at: '2026-09-23T00:00:00Z' },
  ];
  upstream.memory.push(...leaked);
  toolCalls.length = 0;
  try {
    const result = await pullKnowledge({ ...opts, accountId: ACCOUNT_ID });
    assert.equal(result.written, 4, 'the two account rows are not counted as knowledge entries');
    await assert.rejects(fs.access(path.join(opts.rootDir, 'memory/account')), 'no memory/account/ department folder');
    await assert.rejects(fs.access(path.join(opts.rootDir, 'memory/account-suggestions')));
    // Control: an ordinary department entry from the same listing is still filed.
    await fs.access(path.join(opts.rootDir, 'memory/seo/keyword-strategy.md'));

    const manifest = JSON.parse(await fs.readFile(path.join(opts.rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
    assert.equal(manifest.entries['account'], undefined);
    assert.equal(manifest.entries['account-suggestions'], undefined);

    assert.equal(result.accountMemory.ok, true);
    const file = path.join(opts.rootDir, 'hiveku-data/account/ACCOUNT_MEMORY.md');
    const text = await fs.readFile(file, 'utf8');
    assert.match(text, /read-only copy of the account memory/);
    assert.match(text, new RegExp(`https://app\\.hiveku\\.com/${ACCOUNT_ID}/dashboard/memory`));
    assert.match(text, /Prefers phone calls to email\. \(suggested by MCP \(Claude Code\), 2026-09-24 09:05 UTC\)/);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o444);

    // Status: the account rows are neither new upstream nor anything else.
    const status = await knowledgeStatus(opts);
    for (const bucket of ['new_remote', 'changed_remote', 'deleted_remote', 'locally_modified', 'missing_local']) {
      assert.ok(!status[bucket].some((k) => k === 'account' || k === 'account-suggestions'), `${bucket}: ${status[bucket]}`);
    }

    // Read-only: the only non-listing call is the read. Nothing was written back.
    assert.deepEqual([...new Set(toolCalls)].sort(), ['account_memory_get', 'memory_list']);
  } finally {
    upstream.memory.splice(upstream.memory.length - leaked.length, leaked.length);
  }
});

test('a manifest that already filed the account rows as a department does not report them as deleted', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);
  const manifestPath = path.join(opts.rootDir, '.hiveku/knowledge-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.entries['account'] = { id: 'a1', type: 'memory', department: 'account', domain: 'account', file: 'memory/account/x.md' };
  await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

  const status = await knowledgeStatus(opts);
  assert.ok(!status.deleted_remote.includes('account'), `deleted_remote: ${status.deleted_remote}`);
  assert.ok(!status.missing_local.includes('account'));
  const second = await pullKnowledge(opts);
  assert.ok(!second.deletedRemote.includes('account'));
});

test('knowledge pull still succeeds when the account memory tool is not deployed yet', async () => {
  const opts = await OPTS();
  accountMemory.deployed = false;
  try {
    const result = await pullKnowledge(opts);
    assert.equal(result.written, 4);
    assert.equal(result.accountMemory.ok, false);
    assert.match(result.accountMemory.error, /Unknown tool/);
    await assert.rejects(fs.access(path.join(opts.rootDir, 'hiveku-data/account/ACCOUNT_MEMORY.md')));
  } finally {
    accountMemory.deployed = true;
  }
});
