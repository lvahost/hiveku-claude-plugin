/**
 * HK-838 (2026-10-28): a refusal from the web edge in front of Hiveku fails
 * only the request it refused, and every body the plugin sends to core goes
 * gzip-compressed (lib/upstream.mjs, lib/shim.mjs, lib/knowledge.mjs,
 * lib/pulldata.mjs).
 *
 * What happened: a teammate's pm_tasks_create got an HTML 403 page titled
 * "Blocked" from the edge in front of core, because of what the task's text
 * held. The call never reached Hiveku. The bridge read that 403 as a key
 * refusal and latched deadReason, so every later call in the session (a plain
 * one-line task, and the report about it) failed without being sent.
 *
 * Everything here runs against a local HTTP stub on 127.0.0.1. No request
 * reaches a live host, and no test holds an attack-shaped string: the stub
 * refuses on a marker of its own.
 *
 * Pinned:
 *   1. An HTML 403 fails that call with edge_blocked (dispatched false,
 *      response_started false, the status and the ray id as data), nothing
 *      latches, and the NEXT call is sent and answered.
 *   2. Every other answer that is not Hiveku's own JSON-RPC error, on 401,
 *      403 or 429, is an edge refusal too, and none of them latches.
 *   3. Hiveku's own refusals, replayed exactly as hiveku-mcp-api-server sends
 *      them (src/middleware/mcp-auth.ts at origin/main e17b01b): the JSON 403
 *      still latches with today's words, the JSON 401 (a revoked key) still
 *      latches, and a latched bridge sends nothing more.
 *   4. Hiveku's own 429 (src/middleware/rate-limiter.ts) passes through
 *      exactly as before. A 503 is never called a refusal, whatever its body:
 *      the proxy in front of Hiveku also answers 503 when a deploy cuts a call
 *      that was already delivered, so a 503 keeps the generic path it always
 *      had, which says nothing about what was saved, and latches nothing.
 *   5. A refusal whose body cannot be read latches nothing, and a refusal page
 *      or an answer that stalls part way is given up on when the body timer
 *      fires, instead of holding the call open.
 *   6. The shim gives the model kind edge_blocked, the status and ray_id, and
 *      the session goes on working.
 *   7. The server receives gzip: Content-Encoding gzip, Content-Type
 *      unchanged, and the original JSON once inflated, from the bridge and
 *      from the knowledge and data pulls; the customer's text is not
 *      readable in the bytes on the wire. The pulls do it without importing
 *      anything new, because hiveku-desktop vendors those files.
 *   8. The words: plain, no em dash, no vendor names, and nothing the bridge
 *      cannot know: a 401/403's cause is hedged, it never says other calls
 *      still work, and it says what to do when every call is refused.
 *
 * Run: env -u CLAUDE_CONFIG_DIR node --test test/edge-refusal.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp, readFileSync } from 'node:fs';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Upstream, UpstreamError, edgeRayId, hivekuErrorAnswer } from '../lib/upstream.mjs';
import { runShim } from '../lib/shim.mjs';
import { writeBinding } from '../lib/binding.mjs';
import { pullKnowledge } from '../lib/knowledge.mjs';
import { runPullData } from '../lib/pulldata.mjs';
import { HIVEKU_MCP_URL } from '../lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const RAY = '8f1c2d3e4f5a6b7c-SJC';
/** The stub refuses a tools/call whose arguments hold this. Not an attack string: a label. */
const REFUSE_MARKER = 'stub-edge-refuses-this';

/* ── what core and the edge send ─────────────────────────────────────────── */

/**
 * hiveku-mcp-api-server src/middleware/mcp-auth.ts, authenticateMCPRequest:
 * the refusal for a revoked, rotated or unknown key (401) and for a key used
 * for another account (403, also account-resolver.ts
 * customer_key_account_mismatch). mcpAuthMiddleware sends both as
 * res.status(status).json({ jsonrpc: '2.0', id: req.body?.id || null,
 * error: { code: -32001, message } }), the 401 with WWW-Authenticate.
 */
const REVOKED_KEY_MESSAGE =
  'Invalid or inactive API key. Verify the key in your Hiveku dashboard ' +
  '(Settings → API & Connectors) and confirm it\'s active. If you rotated the ' +
  'key, update .mcp.json (or your client\'s env) and restart the MCP client.';
const OTHER_ACCOUNT_MESSAGE = 'API key does not belong to the specified account';

function coreAuthRefusal(status, id, message) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Every answer through core's zone carries a ray id, Hiveku's own too:
      // a cf-ray header alone never makes an answer the edge's.
      'cf-ray': RAY,
      ...(status === 401
        ? { 'www-authenticate': 'Bearer realm="hiveku-mcp", resource_metadata="https://core.hiveku.com/.well-known/oauth-protected-resource/mcp"' }
        : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: id || null, error: { code: -32001, message } }),
  };
}

/** hiveku-mcp-api-server src/middleware/rate-limiter.ts rateLimitMiddleware's 429, as sent. */
function coreRateLimit(id) {
  return {
    status: 429,
    headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '42', 'cf-ray': RAY },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32000,
        message: 'Rate limit exceeded. Maximum 100 requests per 60 seconds. Retry after 42 seconds.',
        data: {
          kind: 'rate_limit',
          retry_after_seconds: 42,
          limit: 100,
          window_seconds: 60,
          hint: 'Poll-style tools are cheap (job_status_get supports wait_seconds for server-side long-polling — prefer it over sleep loops). Batch reads where a bulk tool exists.',
        },
      },
    }),
  };
}

/** The edge's block page, in the shape seen on 2026-10-28: HTML, titled "Blocked". */
const BLOCK_PAGE = {
  status: 403,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cf-ray': RAY },
  body: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Blocked</title>' +
    '<style>body{font-family:Roobert,sans-serif}</style></head><body><h1>Blocked</h1>' +
    '<p>This request was blocked.</p></body></html>',
};

/** The edge turning a request away with a page of its own on 429. */
const EDGE_429_PAGE = {
  status: 429,
  headers: { 'content-type': 'text/html', 'cf-ray': RAY },
  body: '<html><title>Too many requests</title></html>',
};

/* ── the stub ────────────────────────────────────────────────────────────── */

const toolResult = (id, text = '{"ok":true}') => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }),
});

function defaultAnswer(rpc) {
  if (rpc?.method === 'initialize') {
    return {
      status: 200,
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'stub-session' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'stub', version: '0' } },
      }),
    };
  }
  if (rpc?.method === 'notifications/initialized') return { status: 204, headers: {}, body: '' };
  if (rpc?.method === 'tools/call') return toolResult(rpc.id, JSON.stringify({ data: [] }));
  return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rpc?.id ?? null, result: {} }) };
}

/**
 * A local MCP endpoint. `answer(rpc, seen)` returns { status, headers, body },
 * a function that writes the response itself, or undefined for the default.
 * Every request is kept: its headers, the raw bytes, and what core's body
 * parser would make of them (inflated when sent gzip).
 */
async function startStub(answer = () => undefined) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      let text = null;
      let rpc = null;
      try {
        text = (req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString('utf8');
        rpc = JSON.parse(text);
      } catch {
        // Kept as null: a test that expects JSON fails on it.
      }
      const seen = { method: req.method, headers: req.headers, raw, text, rpc };
      requests.push(seen);
      const reply = answer(rpc, seen) ?? defaultAnswer(rpc);
      if (typeof reply === 'function') return reply(res);
      res.writeHead(reply.status, reply.headers);
      res.end(reply.body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    requests,
    toolCalls: () => requests.filter((r) => r.rpc?.method === 'tools/call'),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const upstreamFor = (stub) => new Upstream({ key: 'hvk_test_placeholder', accountId: ACCOUNT, label: 'Acme', url: stub.url });

let nextId = 1;
const call = (name, args) => ({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } });

/** A tools/call whose arguments hold the marker is refused with `reply`; everything else is answered. */
const refuseMarked = (reply) => (rpc) =>
  rpc?.method === 'tools/call' && JSON.stringify(rpc.params?.arguments ?? {}).includes(REFUSE_MARKER)
    ? typeof reply === 'function' ? reply(rpc) : reply
    : undefined;

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('the call was expected to fail');
}

/* ── 1. the edge's HTML 403: this call fails, the next is sent ───────────── */

test('an HTML 403 from the edge fails that call as edge_blocked, latches nothing, and the next call is sent and answered', async () => {
  const stub = await startStub(refuseMarked(BLOCK_PAGE));
  try {
    const up = upstreamFor(stub);
    const err = await rejection(up.forward(call('pm_tasks_create', { title: `Fix the path ${REFUSE_MARKER}` })));
    assert.ok(err instanceof UpstreamError);
    assert.equal(err.kind, 'edge_blocked');
    assert.equal(err.httpStatus, 403);
    assert.equal(err.rayId, RAY);
    assert.equal(err.dispatched, false);
    assert.equal(err.response_started, false);
    assert.equal(up.deadReason, null, 'an edge refusal must not latch the key as refused');

    const before = stub.toolCalls().length;
    const answer = await up.forward(call('pm_tasks_create', { title: 'A plain one-line task' }));
    assert.equal(stub.toolCalls().length, before + 1, 'the next call must be SENT, not refused from memory');
    assert.deepEqual(JSON.parse(answer.result.content[0].text), { data: [] });
    // And the one after that, so nothing latched on the way either.
    await up.forward(call('hiveku_report_issue', { what_happened: 'plain words' }));
    assert.equal(stub.toolCalls().length, before + 2);
  } finally {
    await stub.close();
  }
});

/* ── 2. every non-Hiveku body on the three statuses is the edge's ────────── */

const EDGE_SHAPES = [
  { what: 'a plain-text 403 with a ray id header', reply: { status: 403, headers: { 'content-type': 'text/plain', 'cf-ray': RAY }, body: 'Forbidden' }, ray: RAY },
  { what: 'an empty 403 with no ray id', reply: { status: 403, headers: {}, body: '' }, ray: null },
  {
    what: 'a JSON 403 that is not a JSON-RPC error, ray id in the body',
    reply: { status: 403, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Forbidden', status: 403, ray_id: '8f1c2d3e4f5a6b7d' }) },
    ray: '8f1c2d3e4f5a6b7d',
  },
  {
    what: 'a block page that names its ray id in the HTML',
    reply: { status: 403, headers: { 'content-type': 'text/html' }, body: '<html><title>Attention Required!</title><p>Ray ID: <strong class="font-semibold">8f1c2d3e4f5a6b7e</strong></p></html>' },
    ray: '8f1c2d3e4f5a6b7e',
  },
  { what: 'an HTML 401', reply: { status: 401, headers: { 'content-type': 'text/html', 'cf-ray': RAY }, body: '<html><title>Unauthorized</title></html>' }, ray: RAY },
  { what: 'an HTML 429', reply: EDGE_429_PAGE, ray: RAY },
];

for (const shape of EDGE_SHAPES) {
  test(`${shape.what} is the edge refusing this one request, and nothing latches`, async () => {
    const stub = await startStub(refuseMarked(shape.reply));
    try {
      const up = upstreamFor(stub);
      const err = await rejection(up.forward(call('crm_contacts_create', { notes: REFUSE_MARKER })));
      assert.equal(err.kind, 'edge_blocked', err.message);
      assert.equal(err.httpStatus, shape.reply.status);
      assert.equal(err.rayId, shape.ray);
      assert.equal(err.dispatched, false);
      assert.equal(err.response_started, false);
      assert.equal(up.deadReason, null);
      const before = stub.toolCalls().length;
      await up.forward(call('crm_contacts_list', {}));
      assert.equal(stub.toolCalls().length, before + 1);
    } finally {
      await stub.close();
    }
  });
}

/* ── 3. Hiveku's own refusals still latch, with today's words ────────────── */

test("Hiveku's own JSON 403 (a key used for another account) still latches with today's words", async () => {
  let refusalBody = null;
  const stub = await startStub(refuseMarked((rpc) => {
    const reply = coreAuthRefusal(403, rpc.id, OTHER_ACCOUNT_MESSAGE);
    refusalBody = reply.body;
    return reply;
  }));
  try {
    const up = upstreamFor(stub);
    const err = await rejection(up.forward(call('pm_tasks_create', { title: REFUSE_MARKER })));
    const todays =
      'Hiveku refused this key for Acme (403). This is a scope or permission refusal, not a dead key: ' +
      `reconnecting will not change it. ${refusalBody.slice(0, 200)}`;
    assert.equal(err.kind, 'auth');
    assert.equal(err.httpStatus, 403);
    assert.equal(err.message, todays);
    assert.equal(up.deadReason, todays);

    const sent = stub.requests.length;
    const again = await rejection(up.forward(call('pm_tasks_list', {})));
    assert.equal(again.kind, 'auth');
    assert.equal(again.message, todays);
    assert.equal(stub.requests.length, sent, 'a latched bridge sends nothing more');
  } finally {
    await stub.close();
  }
});

test("Hiveku's own JSON 401 (a revoked key) still latches, at the handshake as in a real session", async () => {
  const stub = await startStub((rpc) => (rpc?.method === 'initialize' ? coreAuthRefusal(401, rpc.id, REVOKED_KEY_MESSAGE) : undefined));
  try {
    const up = upstreamFor(stub);
    const err = await rejection(up.forward(call('get_account_info', {})));
    const todays =
      'The Hiveku key for Acme was rejected (revoked or rotated). Two steps, and the second is NOT optional: ' +
      'run /hiveku:connect, then START A NEW SESSION. This connection pinned the old key when it started and ' +
      'cannot pick up the new one — reconnecting alone will fail exactly the same way.';
    assert.equal(err.kind, 'auth');
    assert.equal(err.httpStatus, 401);
    assert.equal(err.message, todays);
    assert.equal(up.deadReason, todays);

    const sent = stub.requests.length;
    const again = await rejection(up.forward(call('get_account_info', {})));
    assert.equal(again.kind, 'auth');
    assert.equal(stub.requests.length, sent, 'a latched bridge sends nothing more');
  } finally {
    await stub.close();
  }
});

/* ── 4. Hiveku's own 429, and every 503 ──────────────────────────────────── */

test("Hiveku's own 429 passes through exactly as before, and nothing latches", async () => {
  let sentBody = null;
  const stub = await startStub(refuseMarked((rpc) => {
    const reply = coreRateLimit(rpc.id);
    sentBody = JSON.parse(reply.body);
    return reply;
  }));
  try {
    const up = upstreamFor(stub);
    const err = await rejection(up.forward(call('crm_contacts_list', { q: REFUSE_MARKER })));
    assert.equal(err.kind, 'rate_limit');
    assert.equal(err.httpStatus, 429);
    assert.equal(err.retryAfterSeconds, 42);
    assert.equal(err.message, 'Hiveku rate limit reached; retry in 42s.');
    assert.deepEqual(err.passthrough, sentBody.error);
    assert.equal(up.deadReason, null);
    await up.forward(call('crm_contacts_list', {}));
  } finally {
    await stub.close();
  }
});

/**
 * A 503 is not a refusal. The proxy in front of Hiveku answers 503 when a
 * deploy stops the MCP server under a call it already delivered ("upstream
 * connect error or disconnect/reset before headers"), so a write behind a 503
 * may have landed. It keeps the generic path it had before HK-838, whatever
 * its body: no edge_blocked, no dispatched false, no "nothing was saved".
 */
const ANY_503 = [
  {
    what: "carrying Hiveku's own JSON",
    type: 'application/json',
    body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'stub says try later' } }),
  },
  { what: 'with an HTML page', type: 'text/html', body: '<html><title>Service unavailable</title></html>' },
  {
    what: 'the proxy sends after its connection to Hiveku was reset',
    type: 'text/plain',
    body: 'upstream connect error or disconnect/reset before headers. reset reason: connection termination',
  },
];

for (const shape of ANY_503) {
  test(`a 503 ${shape.what} keeps the generic path: not a refusal, no word on what was saved, nothing latched`, async () => {
    const reply = { status: 503, headers: { 'content-type': shape.type, 'cf-ray': RAY }, body: shape.body };
    const stub = await startStub(refuseMarked(reply));
    try {
      const up = upstreamFor(stub);
      const err = await rejection(up.forward(call('pm_tasks_create', { title: REFUSE_MARKER })));
      assert.equal(err.kind, 'http', err.message);
      assert.equal(err.httpStatus, 503);
      assert.equal(err.message, `Hiveku returned HTTP 503. ${shape.body.slice(0, 300)}`);
      assert.equal(err.dispatched, undefined, 'a 503 can follow a delivered write, so it must not say it was never sent');
      assert.equal(up.deadReason, null);
      const before = stub.toolCalls().length;
      await up.forward(call('pm_tasks_list', {}));
      assert.equal(stub.toolCalls().length, before + 1, 'the next call is sent');
    } finally {
      await stub.close();
    }
  });
}

/* ── 5. an unreadable or stalled refusal latches nothing ─────────────────── */

test('a 403 whose body is cut off before it can be read latches nothing', async () => {
  const cutOff = (res) => {
    res.writeHead(403, { 'content-type': 'application/json', 'content-length': '400' });
    res.write('{"jsonrpc":"2.0","id":1,"error":');
    setTimeout(() => res.socket.destroy(), 20);
  };
  const stub = await startStub(refuseMarked(() => cutOff));
  try {
    const up = upstreamFor(stub);
    const err = await rejection(up.forward(call('pm_tasks_create', { title: REFUSE_MARKER })));
    assert.equal(err.kind, 'http');
    assert.equal(err.httpStatus, 403);
    assert.match(err.message, /could not be read/);
    assert.equal(up.deadReason, null);
    await up.forward(call('pm_tasks_list', {}));
  } finally {
    await stub.close();
  }
});

/**
 * A stub writer that sends `status` headers and the start of a body, then
 * stalls: no more bytes and no end. Each stalled socket is kept so the test
 * can close it whatever the bridge did.
 */
const stallAfter = (status, contentType, start, stalled) => (res) => {
  res.writeHead(status, { 'content-type': contentType, 'cf-ray': RAY });
  res.write(start);
  stalled.add(res.socket);
};

/** `promise`, or a failure once `ms` pass. Without a body timer the read would wait minutes. */
async function within(ms, promise) {
  let timer;
  const late = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`the call was still waiting after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

const upstreamWithBodyTimer = (stub, bodyReadTimeoutMs) =>
  new Upstream({ key: 'hvk_test_placeholder', accountId: ACCOUNT, label: 'Acme', url: stub.url, bodyReadTimeoutMs });

test('a refusal page that stalls part way is given up on when the body timer fires, and latches nothing', async () => {
  const stalled = new Set();
  const stub = await startStub(refuseMarked(() => stallAfter(403, 'text/html', '<!DOCTYPE html><html><head><title>Blo', stalled)));
  let pending;
  try {
    const up = upstreamWithBodyTimer(stub, 200);
    pending = up.forward(call('pm_tasks_create', { title: REFUSE_MARKER }));
    const err = await rejection(within(5_000, pending));
    assert.equal(err.kind, 'http', err.message);
    assert.equal(err.httpStatus, 403);
    assert.match(err.message, /could not be read/);
    assert.equal(up.deadReason, null);
    const before = stub.toolCalls().length;
    await up.forward(call('pm_tasks_list', {}));
    assert.equal(stub.toolCalls().length, before + 1, 'the next call is sent');
  } finally {
    pending?.catch(() => {});
    for (const socket of stalled) socket.destroy();
    await stub.close();
  }
});

test('an answer that stalls part way is given up on by the same body timer, as truncated', async () => {
  const stalled = new Set();
  const stub = await startStub(refuseMarked(() => stallAfter(200, 'application/json', '{"jsonrpc":"2.0","id":', stalled)));
  let pending;
  try {
    const up = upstreamWithBodyTimer(stub, 200);
    pending = up.forward(call('pm_tasks_create', { title: REFUSE_MARKER }));
    const err = await rejection(within(5_000, pending));
    assert.equal(err.kind, 'truncated', err.message);
    assert.equal(err.dispatched, true);
    assert.equal(err.response_started, true);
  } finally {
    pending?.catch(() => {});
    for (const socket of stalled) socket.destroy();
    await stub.close();
  }
});

/* ── 6. through the shim, as the model sees it ───────────────────────────── */

async function boundFolder() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-edge-refusal-'));
  const project = path.join(tmp, 'acct');
  const dataDir = path.join(tmp, 'data');
  await fsp.mkdir(dataDir, { recursive: true });
  await writeBinding(project, { accountId: ACCOUNT, label: 'Acme', keyPreview: 'hvk_test' });
  await fsp.writeFile(
    path.join(dataDir, 'credentials.json'),
    JSON.stringify({ version: 1, accounts: { [ACCOUNT]: { key: 'hvk_test_placeholder', label: 'Acme', key_preview: 'hvk_test', scope: 'full' } } }),
  );
  return { project, dataDir, cleanup: () => fsp.rm(tmp, { recursive: true, force: true }) };
}

function startShim({ project, dataDir }) {
  const stdin = new PassThrough();
  const lines = [];
  let buffer = '';
  const stdout = new Writable({
    write(chunk, _encoding, done) {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        lines.push(JSON.parse(buffer.slice(0, nl)));
        buffer = buffer.slice(nl + 1);
      }
      done();
    },
  });
  const finished = runShim({ projectDir: project, dataDir, stdin, stdout });
  return {
    send: (message) => stdin.write(`${JSON.stringify(message)}\n`),
    async answer(id) {
      const until = Date.now() + 30_000;
      for (;;) {
        const found = lines.find((l) => l.id === id);
        if (found) return found;
        if (Date.now() > until) throw new Error(`no answer to id ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    async close() {
      stdin.end();
      await finished;
    },
  };
}

test('through the shim the model gets kind edge_blocked, the status and ray_id, and the session goes on', async () => {
  const stub = await startStub(refuseMarked(BLOCK_PAGE));
  const session = await boundFolder();
  const realFetch = globalThis.fetch;
  // The bridge's URL is a constant (lib/util.mjs); send it to the stub instead.
  globalThis.fetch = (url, init) => realFetch(String(url) === HIVEKU_MCP_URL ? stub.url : url, init);
  const shim = startShim(session);
  try {
    shim.send(call('pm_tasks_create', { title: REFUSE_MARKER }));
    const refused = await shim.answer(nextId - 1);
    assert.equal(refused.error.code, -32000);
    assert.equal(refused.error.data.kind, 'edge_blocked');
    assert.equal(refused.error.data.http_status, 403);
    assert.equal(refused.error.data.ray_id, RAY);
    assert.equal(refused.error.data.dispatched, false);
    assert.equal(refused.error.data.response_started, false);
    assert.match(refused.error.message, /web edge in front of Hiveku refused this one request/);

    shim.send(call('pm_tasks_create', { title: 'A plain one-line task' }));
    const answered = await shim.answer(nextId - 1);
    assert.equal(answered.error, undefined, JSON.stringify(answered.error));
    assert.deepEqual(JSON.parse(answered.result.content[0].text), { data: [] });
  } finally {
    await shim.close();
    globalThis.fetch = realFetch;
    await stub.close();
    await session.cleanup();
  }
});

/* ── 7. gzip on the wire ─────────────────────────────────────────────────── */

function assertGzipCarries(request, original) {
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['content-encoding'], 'gzip');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.deepEqual([...request.raw.subarray(0, 2)], [0x1f, 0x8b], 'the bytes on the wire are gzip');
  assert.equal(Number(request.headers['content-length']), request.raw.length);
  if (original !== undefined) assert.deepEqual(JSON.parse(gunzipSync(request.raw).toString('utf8')), original);
}

test("the bridge sends every body gzip, Content-Type unchanged, and the server inflates the original JSON", async () => {
  const stub = await startStub();
  try {
    const up = upstreamFor(stub);
    const text = `Ünïcode "quotes" \\ back, a path like src/app/page.tsx, and ${REFUSE_MARKER}`;
    const message = call('pm_tasks_create', { title: 'Plain', description: text });
    await up.forward(message);
    assert.deepEqual(stub.requests.map((r) => r.rpc?.method), ['initialize', 'notifications/initialized', 'tools/call']);
    for (const request of stub.requests) assertGzipCarries(request);
    assertGzipCarries(stub.toolCalls()[0], message);
    assert.ok(!stub.toolCalls()[0].raw.includes(Buffer.from(REFUSE_MARKER)), 'the text must not be readable on the wire');
  } finally {
    await stub.close();
  }
});

test('the knowledge pull and the data pull send their bodies gzip too', async () => {
  const stub = await startStub();
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-edge-pulls-'));
  await fsp.mkdir(path.join(tmp, 'knowledge'));
  await fsp.mkdir(path.join(tmp, 'data'));
  try {
    await pullKnowledge({ rootDir: path.join(tmp, 'knowledge'), endpoint: stub.url, key: 'hvk_test_placeholder' });
    const knowledgeRequests = stub.requests.length;
    assert.ok(stub.toolCalls().some((r) => r.rpc.params?.name === 'memory_list'), 'the knowledge pull must have listed memory');

    await runPullData({
      rootDir: path.join(tmp, 'data'),
      endpoint: stub.url,
      key: 'hvk_test_placeholder',
      argv: ['crm'],
      vendoredManifest: {
        version: 1,
        generated_at: '2026-10-28T00:00:00.000Z',
        default_departments: ['crm'],
        departments: [{ id: 'crm', label: 'CRM', datasets: [{ id: 'deals', label: 'Deals', tool: 'crm_list_deals' }] }],
      },
    });
    assert.ok(stub.requests.length > knowledgeRequests, 'the data pull must have sent requests');
    assert.ok(stub.toolCalls().some((r) => r.rpc.params?.name === 'crm_list_deals'), 'the data pull must have called its dataset');
    for (const request of stub.requests) {
      assertGzipCarries(request);
      assert.equal(request.rpc?.jsonrpc, '2.0', 'each inflated body is the JSON-RPC message');
    }
  } finally {
    await stub.close();
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('the files hiveku-desktop vendors import nothing it does not vendor, so the pulls gzip inline', () => {
  // hiveku-desktop config/hiveku/vendor-plugin.mjs FILES, as of 2026-10-28. It
  // copies these with `git show <ref>:lib/<file>` and nothing else, so an
  // import of any other plugin module breaks the desktop app's sync at load.
  const VENDORED = new Set(['knowledge.mjs', 'pulldata.mjs', 'account-memory.mjs', 'memory-owner.mjs', 'util.mjs', 'dept-manifest.json']);
  const IMPORT_RES = [
    /^\s*(?:import|export)\b[^'"]*?\bfrom\s+['"]([^'"]+)['"]/gm,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const file of [...VENDORED].filter((f) => f.endsWith('.mjs'))) {
    const source = readFileSync(path.join(ROOT, 'lib', file), 'utf8');
    const specifiers = IMPORT_RES.flatMap((re) => [...source.matchAll(re)].map((m) => m[1]));
    assert.ok(specifiers.length > 0 || file === 'memory-owner.mjs', `no imports read from lib/${file}: the reader is broken`);
    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) continue;
      assert.ok(
        specifier.startsWith('./') && VENDORED.has(specifier.slice(2)),
        `lib/${file} imports ${specifier}, which hiveku-desktop does not vendor`,
      );
    }
  }
});

/* ── 8. the words, and the two readers ───────────────────────────────────── */

test('the edge refusal is said plainly: what happened, that nothing was saved, and what to try', async () => {
  const NO_RAY_403 = { status: 403, headers: {}, body: '' };
  const stub = await startStub(refuseMarked((rpc) =>
    rpc.params.name === 'crm_contacts_list' ? EDGE_429_PAGE : rpc.params.name === 'crm_contacts_create' ? NO_RAY_403 : BLOCK_PAGE));
  try {
    const up = upstreamFor(stub);
    const blocked = await rejection(up.forward(call('pm_tasks_create', { title: REFUSE_MARKER })));
    const busy = await rejection(up.forward(call('crm_contacts_list', { q: REFUSE_MARKER })));
    const noRay = await rejection(up.forward(call('crm_contacts_create', { notes: REFUSE_MARKER })));
    for (const err of [blocked, busy, noRay]) {
      assert.match(err.message, /never reached Hiveku and nothing was saved/);
      assert.match(err.message, /This connection was not cut off: the next call is sent as usual/);
      // The bridge cannot know that: a block on where requests come from refuses every call.
      assert.doesNotMatch(err.message, /calls still work/i);
      assert.match(err.message, /do not reconnect/);
      assert.match(err.message, /rephrase/);
      assert.match(err.message, /code and file paths/);
      assert.match(err.message, /import upload \(project_import_presign, then project_import_finalize\)/);
      assert.match(err.message, /If this request keeps being refused, report it with hiveku_report_issue/);
      assert.doesNotMatch(err.message, /[—–]/, 'no em or en dash');
      assert.doesNotMatch(err.message, /cloudflare|render\b|waf|cdn/i, 'no vendor names in words a customer reads');
    }
    for (const err of [blocked, busy]) assert.match(err.message, new RegExp(`hiveku_report_issue: give ray id ${RAY} and`));
    assert.match(noRay.message, /hiveku_report_issue: give the time it happened and/);

    // A 401/403 names the usual cause without claiming it, and says what to
    // do when every call is refused (a block on where requests come from).
    assert.match(blocked.message, /refused this one request \(HTTP 403\), most often because of something in its text\./);
    const everyCall =
      'If every call is refused this way, even a plain one, the block is on where the requests come from, ' +
      'not on their text, and a report would be refused too: tell the person, and give them ';
    assert.ok(blocked.message.includes(`${everyCall}ray id ${RAY}.`), blocked.message);
    assert.ok(noRay.message.includes(`${everyCall}the time it happened.`), noRay.message);
    assert.match(busy.message, /turned this one request away \(HTTP 429\)\. It does that when it is busy/);
    assert.match(busy.message, /Wait a minute and try it once more/);
    assert.doesNotMatch(busy.message, /If every call is refused/, 'the every-call advice is for a 401/403 only');
  } finally {
    await stub.close();
  }
});

test("hivekuErrorAnswer accepts only Hiveku's JSON-RPC error, and edgeRayId only an id", () => {
  assert.ok(hivekuErrorAnswer(coreAuthRefusal(401, 1, REVOKED_KEY_MESSAGE).body));
  assert.ok(hivekuErrorAnswer(coreAuthRefusal(403, null, OTHER_ACCOUNT_MESSAGE).body));
  assert.ok(hivekuErrorAnswer(coreRateLimit(7).body));
  for (const notHiveku of [
    BLOCK_PAGE.body,
    '',
    'Forbidden',
    '[]',
    'null',
    JSON.stringify({ error: { code: -32001, message: 'no jsonrpc member' } }),
    JSON.stringify({ jsonrpc: '2.0', error: 'a string' }),
    JSON.stringify({ jsonrpc: '2.0', error: { code: '403', message: 'code is not a number' } }),
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001 } }),
    JSON.stringify({ jsonrpc: '2.0', result: {} }),
  ]) {
    assert.equal(hivekuErrorAnswer(notHiveku), null, notHiveku);
  }

  const headers = (ray) => new Headers(ray === undefined ? {} : { 'cf-ray': ray });
  assert.equal(edgeRayId(headers(RAY), ''), RAY);
  assert.equal(edgeRayId(headers('8f1c2d3e4f5a6b7c'), ''), '8f1c2d3e4f5a6b7c');
  assert.equal(edgeRayId(headers('<b>not an id</b>'), 'Cloudflare Ray ID: <strong>8f1c2d3e4f5a6b7f</strong>'), '8f1c2d3e4f5a6b7f');
  assert.equal(edgeRayId(headers(undefined), '<html>no id here 8f1c2d3e4f5a6b7c</html>'), null, 'a hex run that is not named as a ray id is not one');
  assert.equal(edgeRayId(headers(undefined), ''), null);
});
