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

let server;
let endpoint;
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

test('status before any pull says initialized:false instead of inventing drift', async () => {
  const opts = await OPTS();
  const status = await knowledgeStatus(opts);
  assert.equal(status.initialized, false);
  assert.equal(status.in_sync, 0);
});
