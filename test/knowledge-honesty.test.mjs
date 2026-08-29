/**
 * What `knowledge status` is allowed to CLAIM.
 *
 * The bug these pin: seconds after a pull fetched 196 entries with valid
 * upstream frontmatter, status reported every one of them "deleted upstream" —
 * because the listings for three types failed (fresh off a pull, straight into
 * the rate limit) and the diff treated missing-from-a-failed-listing as
 * deleted. A status probe may only call something deleted when the listing
 * that should contain it SUCCEEDED.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { pullKnowledge, knowledgeStatus } from '../lib/knowledge.mjs';

let server;
let endpoint;

const upstream = {
  memory: [{ id: 'm1', name: 'Keyword strategy', domain: 'seo', content: 'x', version: 1, updated_at: '2026-08-01T00:00:00Z' }],
  rule: [],
  skill: [],
  command: [{ id: 'c1', name: 'Weekly sweep', domain: '_command:weekly', content: '<!-- department: seo -->\nrun', version: 1, updated_at: '2026-08-01T00:00:00Z' }],
  agent: [],
  identity: [],
};

/** Per-type behaviour switch: 'ok' | 'error' | 'empty' | 'ratelimit-once'. */
const mode = {};
const rateLimited = new Set();

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
      if (rpc.method === 'notifications/initialized') { res.statusCode = 204; return res.end(); }
      if (rpc.method === 'tools/call' && rpc.params.name === 'memory_list') {
        const type = rpc.params.arguments?.type;
        const m = mode[type] || 'ok';
        if (m === 'error') return reply({ isError: true, content: [{ type: 'text', text: 'boom' }] });
        if (m === 'empty') return reply({ content: [{ type: 'text', text: JSON.stringify({ data: [] }) }] });
        if (m === 'ratelimit-once' && !rateLimited.has(type)) {
          rateLimited.add(type);
          return reply({ isError: true, content: [{ type: 'text', text: 'Rate limit exceeded. Maximum 100 requests per 60 seconds. Retry after 0 seconds.' }] });
        }
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
  rootDir: await fs.mkdtemp(path.join(os.tmpdir(), 'hk-honesty-')),
  endpoint,
  key: 'hvk_test',
});

test('★ an entry whose type FAILED to list is unverifiable, never deleted', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);
  mode.command = 'error';
  try {
    const status = await knowledgeStatus(opts);
    assert.deepEqual(status.deleted_remote, [], 'a failed listing must not produce deletions');
    assert.equal(status.unverifiable.length, 1);
    assert.deepEqual(status.failed_types, ['command']);
    assert.equal(status.in_sync, 1, 'the healthy type still verifies');
    assert.ok(!status.verify_failed);
  } finally { delete mode.command; }
});

test('★ a remote that returns NOTHING for a populated manifest is a failed verify, not a mass deletion', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);
  for (const t of Object.keys(upstream)) mode[t] = 'empty';
  try {
    const status = await knowledgeStatus(opts);
    assert.equal(status.verify_failed, true);
    assert.deepEqual(status.deleted_remote, []);
    assert.equal(status.unverifiable.length, 2, 'every known entry is merely unverified');
  } finally { for (const t of Object.keys(upstream)) delete mode[t]; }
});

test('a rate-limited listing is retried after the server\'s own delay and does not fail the type', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);
  rateLimited.clear();
  mode.memory = 'ratelimit-once';
  try {
    const status = await knowledgeStatus(opts);
    assert.equal(status.failed_types, undefined, 'one rate-limit response must not mark the type failed');
    assert.equal(status.in_sync, 2);
    assert.deepEqual(status.deleted_remote, []);
  } finally { delete mode.memory; rateLimited.clear(); }
});

test('a REAL deletion, confirmed by a successful listing, is still reported', async () => {
  const opts = await OPTS();
  await pullKnowledge(opts);
  const removed = upstream.command.pop();
  try {
    const status = await knowledgeStatus(opts);
    assert.equal(status.deleted_remote.length, 1, 'honesty must not mean blindness');
    assert.deepEqual(status.unverifiable, []);
  } finally { upstream.command.push(removed); }
});
