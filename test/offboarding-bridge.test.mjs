// End to end through the MCP bridge (offboarding O8b): lib/upstream.mjs hears
// Hiveku's own 401, lib/shim.mjs asks the website (lib/key-standing.mjs) and,
// on the second sighting of a removal answer about a key /hiveku:connect stored,
// removes the account (lib/offboarding.mjs); the hooks say it once (bin/hiveku).
// The tool server and the website are local servers on 127.0.0.1, the folders
// are made by the real `hiveku setup` under a temporary home, the clock is the
// test's own, and the keychain tools are stubbed (test/offboarding-world.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { PassThrough, Writable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  A,
  B,
  childEnv,
  exists,
  fakeClock,
  madeUpKey,
  plantContent,
  readCredsFile,
  snapshot,
  standing,
  startRoute,
  world,
  writeCreds,
} from './offboarding-world.mjs';
import { runSetup } from '../lib/setup.mjs';
import { runShim } from '../lib/shim.mjs';
import { Upstream } from '../lib/upstream.mjs';
import { CONFIRM_AFTER_MS, askKeyStanding } from '../lib/key-standing.mjs';
import { addNotice, takeNotices } from '../lib/offboarding.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'hiveku');

/* ── a stand-in for the tool server ──────────────────────────────────────── */

/** hiveku-mcp-api-server's own refusal of a revoked key (src/middleware/mcp-auth.ts), as sent. */
const HIVEKU_401 = {
  status: 401,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Invalid or inactive API key.' } }),
};
const EDGE_401 = { status: 401, headers: { 'content-type': 'text/html' }, body: '<html><title>Blocked</title></html>' };
const HIVEKU_403 = {
  status: 403,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'API key does not belong to the specified account' } }),
};
const HIVEKU_429 = {
  status: 429,
  headers: { 'content-type': 'application/json', 'retry-after': '5' },
  body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limit exceeded.', data: { retry_after_seconds: 5 } } }),
};

async function startCore(reply = () => HIVEKU_401) {
  let calls = 0;
  const server = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      calls += 1;
      const r = reply(calls);
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, calls: () => calls, close: () => new Promise((r) => server.close(r)) };
}

/* ── the listener ────────────────────────────────────────────────────────── */

test("only Hiveku's own 401 is heard: once, and never the edge's page, a 403 or a 429", async (t) => {
  for (const [name, reply, heard] of [
    ["Hiveku's own 401", HIVEKU_401, 1],
    ["the edge's 401 page", EDGE_401, 0],
    ["Hiveku's own 403", HIVEKU_403, 0],
    ["Hiveku's own 429", HIVEKU_429, 0],
  ]) {
    const core = await startCore(() => reply);
    t.after(() => core.close());
    let told = 0;
    const up = new Upstream({ key: madeUpKey(), accountId: A, label: 'Northwind', url: core.url, onKeyRefused: () => (told += 1) });
    for (let i = 0; i < 3; i++) {
      await up.forward({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'get_account_info', arguments: {} } }).catch(() => undefined);
    }
    assert.equal(told, heard, name);
  }
});

test('a listener that throws never changes what the call answers', async (t) => {
  const core = await startCore();
  t.after(() => core.close());
  const up = new Upstream({ key: madeUpKey(), accountId: A, label: 'Northwind', url: core.url, onKeyRefused: () => { throw new Error('boom'); } });
  await assert.rejects(
    () => up.forward({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'x', arguments: {} } }),
    (err) => err.kind === 'auth' && /rejected/.test(err.message),
  );
});

/* ── the bridge, end to end ──────────────────────────────────────────────── */

async function bridgeWorld(t, { connect = true, answer, coreReply, ask } = {}) {
  // Registered before the world's own clean-up, so the bridge has stopped before its folders go.
  let closeShim = async () => {};
  t.after(() => closeShim());
  const w = await world(t);
  const key = madeUpKey();
  await writeCreds(w, { [A]: { key, label: 'Northwind', connect }, [B]: { key: madeUpKey(), label: 'Acme', connect: true } });
  const { results } = await runSetup({
    root: w.root,
    accounts: { [A]: { label: 'Northwind' }, [B]: { label: 'Acme' } },
    homeDir: w.home,
    dataDir: w.data,
  });
  const mine = await plantContent(results.find((r) => r.account_id === A).dir);
  const theirs = await plantContent(results.find((r) => r.account_id === B).dir, { accountId: B });
  const before = { mine: await snapshot(mine), theirs: await snapshot(theirs) };
  const core = await startCore(coreReply);
  t.after(() => core.close());
  const route = await startRoute(answer ?? (() => standing('removed_from_team')));
  t.after(() => route.close());
  const clock = fakeClock();
  let watcher = null;
  let finishing = null;
  const stdin = new PassThrough();
  const lines = [];
  let buffer = '';
  const stdout = new Writable({
    write(chunk, _enc, done) {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        lines.push(JSON.parse(buffer.slice(0, nl)));
        buffer = buffer.slice(nl + 1);
      }
      done();
    },
  });
  const finished = runShim({
    projectDir: mine,
    dataDir: w.data,
    stdin,
    stdout,
    offboarding: {
      home: w.home,
      appUrl: route.appUrl,
      mcpUrl: core.url,
      now: clock.now,
      schedule: clock.schedule,
      log: () => undefined,
      ...(ask ? { ask } : {}),
      onWatcher: (x) => { watcher = x; },
      onFinishing: (p) => { finishing = p; },
    },
  });
  let nextId = 1;
  const call = async () => {
    const id = nextId++;
    stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'get_account_info', arguments: {} } })}\n`);
    const until = Date.now() + 20_000;
    for (;;) {
      const found = lines.find((l) => l.id === id);
      if (found) return found;
      if (Date.now() > until) throw new Error(`no answer to ${id}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  closeShim = async () => {
    watcher?.dispose();
    stdin.end();
    await finished;
    await finishing;
  };
  return { w, key, mine, theirs, before, core, route, clock, call, watcher: () => watcher };
}

/** The session's calls are refused; an hour of the bridge's own clock passes. */
async function refusedForAnHour(b) {
  const first = await b.call();
  assert.ok(first.error, 'the call was refused');
  await b.watcher().settled();
  for (let i = 0; i < 12; i++) {
    await b.clock.advance(5 * 60 * 1000, b.watcher());
    await b.call();
  }
}

test('end to end: removed_from_team twice removes the account\'s own folder and key, and nothing else', async (t) => {
  const b = await bridgeWorld(t);
  const first = await b.call();
  assert.equal(first.error.data.kind, 'auth');
  await b.watcher().settled();
  assert.equal(b.route.count(), 1);
  assert.equal(await exists(b.mine), true, 'one answer removes nothing');
  await b.clock.advance(CONFIRM_AFTER_MS, b.watcher());
  assert.equal(b.route.count(), 2);
  assert.equal(await exists(b.mine), false);
  assert.deepEqual(await snapshot(b.theirs), b.before.theirs);
  const creds = await readCredsFile(b.w);
  assert.equal(creds.accounts[A], undefined);
  assert.ok(creds.accounts[B]);
  // Every later call in the session says what happened, in plain words.
  const later = await b.call();
  assert.match(later.error.message, /^You no longer have access to "Northwind": you were removed from its team\. Removed from this computer: its folder ~\/Hiveku-Accounts\/northwind-a0a0a0a0 \(with everything in it\) and its saved key\./);
  assert.equal(b.core.calls(), 1, 'nothing more was sent to the tool server after its refusal');
  // And the hooks have it, once.
  const notices = await takeNotices(b.w.data);
  assert.equal(notices.length, 1);
  await refusedForAnHour(b);
  assert.equal(b.route.count(), 2, 'quiet afterwards');
});

for (const [name, answer, ask] of [
  ['an error (the route answers 500)', () => ({ status: 500, body: '{"error":"unavailable"}' })],
  ['a 502 page', () => ({ status: 502, body: 'Bad gateway', headers: { 'content-type': 'text/html' } })],
  ['a 503', () => ({ status: 503, body: '{"error":"unavailable"}' })],
  ['a 404 (the route not live yet)', () => ({ status: 404, body: '<html>Not found</html>', headers: { 'content-type': 'text/html' } })],
  ['a 429', () => ({ status: 429, body: '{"error":"too_many_requests"}', headers: { 'retry-after': '60' } })],
  ['a timeout (the route never answers)', () => () => {}, (q) => askKeyStanding({ ...q, timeoutMs: 100 })],
  ['an unreadable answer', () => ({ status: 200, body: '<html>removed_from_team</html>' })],
  ['key_switched_off', () => standing('key_switched_off')],
  ['active', () => standing('active')],
  ['a removal answer once, then an error', (n) => (n === 1 ? standing('removed_from_team') : { status: 500, body: '{}' })],
  ['a removal answer, then key_switched_off', (n) => (n === 1 ? standing('account_closed') : standing('key_switched_off'))],
]) {
  test(`end to end: ${name} deletes nothing and keeps the key`, async (t) => {
    const b = await bridgeWorld(t, { answer, ask });
    await refusedForAnHour(b);
    assert.deepEqual(await snapshot(b.mine), b.before.mine);
    assert.deepEqual(await snapshot(b.theirs), b.before.theirs);
    assert.ok((await readCredsFile(b.w)).accounts[A], 'the key stays');
    assert.ok(b.route.count() >= 1);
  });
}

test('end to end: a key not from /hiveku:connect removes nothing, and the person is told once', async (t) => {
  const b = await bridgeWorld(t, { connect: false });
  await refusedForAnHour(b);
  assert.deepEqual(await snapshot(b.mine), b.before.mine);
  assert.ok((await readCredsFile(b.w)).accounts[A]);
  assert.equal(b.route.count(), 1, 'no confirming question');
  const notices = await takeNotices(b.w.data);
  assert.deepEqual(notices, [
    'Hiveku no longer accepts the key saved for "Northwind". Nothing was removed from this computer: its folders and its ' +
      'saved key stay. If you still have access to "Northwind", run /hiveku:connect to get a key of your own, then start a new session.',
  ]);
});

for (const [name, coreReply] of [
  ["the edge's 401 page", () => EDGE_401],
  ["Hiveku's own 403", () => HIVEKU_403],
]) {
  test(`end to end: ${name} asks the website nothing`, async (t) => {
    const b = await bridgeWorld(t, { coreReply });
    await refusedForAnHour(b);
    assert.equal(b.route.count(), 0);
    assert.deepEqual(await snapshot(b.mine), b.before.mine);
  });
}

/* ── the hooks say it once ───────────────────────────────────────────────── */

test('the next prompt says a kept notice once; so does the next session start, in any folder', async (t) => {
  const w = await world(t);
  await writeCreds(w, { [B]: { key: madeUpKey(), label: 'Acme' } });
  await addNotice(w.data, { accountId: A, kind: 'removed', text: 'You no longer have access to "Northwind": the account was closed.' });
  const hook = (which, cwd) =>
    spawnSync(process.execPath, [BIN, 'hook', which], { input: JSON.stringify({ cwd, source: 'startup' }), env: childEnv(w), encoding: 'utf8', timeout: 20_000 });
  const first = hook('prompt-submit', w.outside);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Hiveku: You no longer have access to "Northwind": the account was closed\. Tell the person this once, in plain words\./);
  assert.doesNotMatch(hook('prompt-submit', w.outside).stdout, /Northwind/);

  await addNotice(w.data, { accountId: A, kind: 'key_stopped', text: 'Hiveku no longer accepts the key saved for "Northwind".' });
  const start = hook('session-start', w.outside);
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /Hiveku: Hiveku no longer accepts the key saved for "Northwind"\./);
  assert.doesNotMatch(hook('session-start', w.outside).stdout, /no longer accepts/);
});
