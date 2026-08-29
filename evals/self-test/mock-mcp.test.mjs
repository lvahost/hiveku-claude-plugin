/**
 * The mock MCP server itself: handshake, tools/list, tools/call, and the
 * transcript side-effect the checkers depend on. Framing must match
 * lib/shim.mjs - newline-delimited JSON, protocol bytes only on stdout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.join(HERE, '..');

function rpcSession(fixture, transcriptPath, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(EVALS, 'bin', 'mock-mcp.mjs'),
      '--fixture', path.join(EVALS, 'fixtures', fixture),
      '--transcript', transcriptPath,
    ]);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('mock-mcp timed out'));
    }, 10000);
    let buf = '';
    const responses = [];
    const expected = messages.filter((m) => m.id !== undefined).length;
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) responses.push(JSON.parse(line));
      }
      if (responses.length >= expected) {
        clearTimeout(timer);
        child.kill();
        resolve(responses);
      }
    });
    child.on('error', reject);
    for (const m of messages) child.stdin.write(`${JSON.stringify(m)}\n`);
  });
}

test('mock-mcp: handshake, tools/list, tools/call, transcript written', async () => {
  const transcript = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hk-mock-')), 'transcript.jsonl');
  const responses = await rpcSession('ap-screen', transcript, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'accounting_ap_aging', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } },
  ]);

  const byId = new Map(responses.map((r) => [r.id, r]));
  assert.equal(byId.get(1).result.serverInfo.name, 'hk-mock');
  assert.equal(byId.get(1).result.protocolVersion, '2025-03-26');

  const toolNames = byId.get(2).result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('accounting_bill_list'));
  assert.ok(toolNames.includes('pm_tasks_create'));

  const aging = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(aging.total_cents, 975000);

  assert.equal(byId.get(4).result.isError, true);

  const logged = fs
    .readFileSync(transcript, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(logged.length, 2); // the real call and the unknown-tool attempt
  assert.equal(logged[0].tool, 'accounting_ap_aging');
  assert.equal(logged[0].result.total_cents, 975000);
});
