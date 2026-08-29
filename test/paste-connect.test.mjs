/**
 * The paste-back (oob) consent flow: the half of connect that works where a
 * loopback listener cannot exist (Claude Desktop's sandbox).
 *
 * The property under test is the two-invocation contract: start writes the
 * PKCE verifier to disk, finish reads it, exchanges, and deletes it — and a
 * WRONG code must NOT burn the verifier, or every typo costs the user the
 * whole browser round trip again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startPasteConsent, finishPasteConsent } from '../lib/connect.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-paste-'));

test('start writes a 0600 pending file and a consent URL with redirect=oob', async () => {
  const dataDir = tmp();
  const { url } = await startPasteConsent({ dataDir, alreadyConnected: ['a1'] });
  const u = new URL(url);
  assert.equal(u.pathname, '/connect/cli');
  assert.equal(u.searchParams.get('redirect'), 'oob');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('code_challenge'));

  const f = path.join(dataDir, 'pending-connect.json');
  const st = fs.statSync(f);
  assert.equal(st.mode & 0o777, 0o600, 'verifier file must be private');
  const pending = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(pending.verifier && pending.state);
});

test('finish without a start says start over, not a stack trace', async () => {
  await assert.rejects(
    () => finishPasteConsent({ dataDir: tmp(), code: 'x' }),
    /No connection is waiting/,
  );
});

test('an expired pending file is refused and cleaned up', async () => {
  const dataDir = tmp();
  await startPasteConsent({ dataDir });
  const f = path.join(dataDir, 'pending-connect.json');
  const pending = JSON.parse(fs.readFileSync(f, 'utf8'));
  pending.created_at = Date.now() - 16 * 60 * 1000;
  fs.writeFileSync(f, JSON.stringify(pending));
  await assert.rejects(() => finishPasteConsent({ dataDir, code: 'x' }), /expired/);
  assert.ok(!fs.existsSync(f), 'expired pending must not linger');
});

test('★ a failed exchange does NOT burn the verifier', async () => {
  // Point the exchange at a server that rejects the code. The pending file
  // must survive so the user can re-paste without redoing consent.
  const http = await import('node:http');
  const server = http.default.createServer((req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired code' }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const dataDir = tmp();
  await startPasteConsent({ dataDir, appUrl: `http://127.0.0.1:${port}` });
  await assert.rejects(
    () => finishPasteConsent({ dataDir, code: 'mistyped' }),
    /Invalid or expired code/,
  );
  assert.ok(
    fs.existsSync(path.join(dataDir, 'pending-connect.json')),
    'a typo must not cost the user the whole browser round trip',
  );
  server.close();
});

test('a successful exchange stores nothing pending afterwards', async () => {
  const http = await import('node:http');
  const server = http.default.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accounts: [{ account_id: 'a', api_key: 'hvk_x', account_name: 'A' }] }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const dataDir = tmp();
  await startPasteConsent({ dataDir, appUrl: `http://127.0.0.1:${port}` });
  const payload = await finishPasteConsent({ dataDir, code: 'good' });
  assert.equal(payload.accounts.length, 1);
  assert.ok(!fs.existsSync(path.join(dataDir, 'pending-connect.json')));
  server.close();
});
