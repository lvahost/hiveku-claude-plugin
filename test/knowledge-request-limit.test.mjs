/**
 * HK-2135: each request of the knowledge sync is held to 90 seconds, its body
 * too, as lib/pulldata.mjs holds the data pull. A request Hiveku never answers
 * stops the sync with a plain reason: it is not waited out as a 429 is, and no
 * other listing or handshake is tried after it. Before, the requests had no
 * limit of their own, and a server that took the connection and never answered
 * held the sync for about 35 minutes (seven listings, each after another
 * handshake, at Node's own limits). Fetch and the clock are stand-ins, so
 * nothing leaves this process and nothing really waits.
 */
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { gunzipSync } from 'node:zlib';
import { pullKnowledge } from '../lib/knowledge.mjs';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

const ENDPOINT = 'http://hiveku.invalid/mcp';
/** The limit itself (KNOWLEDGE_REQUEST_LIMIT_MS), written out so this file pins it. */
const KNOWLEDGE_REQUEST_LIMIT_MS = 90_000;

/** What a stubbed fetch was asked: the method, and the tool for a tool call. */
function asked(init) {
  const rpc = JSON.parse(gunzipSync(init.body).toString('utf8'));
  return rpc.method === 'tools/call' ? `${rpc.method} ${rpc.params.name}` : rpc.method;
}

/** Hiveku's answer, at once. */
const answer = (result) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { headers: { 'content-type': 'application/json' } });

/** A request Hiveku takes and never answers: it ends only when aborted, as a real fetch does. */
const never = (init) =>
  new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));

/** Lets the pull's own awaits run (setImmediate is not one of the stood-in timers). */
async function settle() {
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** Starts a pull with the clock stood in, and keeps how it ended without waiting on it. */
async function pulling() {
  mock.timers.enable({ apis: ['setTimeout'] });
  // Never made: the pull stops before it writes anything.
  const rootDir = path.join(os.tmpdir(), 'hiveku-knowledge-limit-never-written');
  const ended = { error: undefined, done: false };
  pullKnowledge({ rootDir, endpoint: ENDPOINT, key: 'hvk_test' }).then(
    () => (ended.done = true),
    (error) => {
      ended.done = true;
      ended.error = error;
    },
  );
  await settle();
  return ended;
}

function assertTimedOut(ended) {
  assert.equal(ended.done, true, 'the pull still waits');
  assert.equal(ended.error?.name, 'KnowledgeRequestTimeout', `ended with ${ended.error}`);
  assert.equal(ended.error.message, 'Hiveku did not answer within 90 seconds. Check the internet connection, then try again.');
  assert.doesNotMatch(ended.error.message, /retry after/i);
}

test('a handshake Hiveku never answers stops the pull at 90 seconds, and nothing else is asked', async () => {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(asked(init));
    return never(init);
  };
  const ended = await pulling();
  assert.deepEqual(calls, ['initialize']);
  mock.timers.tick(KNOWLEDGE_REQUEST_LIMIT_MS - 1);
  await settle();
  assert.equal(ended.done, false);
  mock.timers.tick(1);
  await settle();
  assertTimedOut(ended);
  // No handshake again before the next listing, and no listing at all.
  mock.timers.tick(10 * KNOWLEDGE_REQUEST_LIMIT_MS);
  await settle();
  assert.deepEqual(calls, ['initialize']);
});

test('a listing Hiveku never answers stops the pull, with no 429 wait and no other listing', async () => {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const what = asked(init);
    calls.push(what);
    if (what === 'initialize') return answer({ protocolVersion: '2024-11-05' });
    if (what === 'notifications/initialized') return new Response(null, { status: 204 });
    return never(init);
  };
  const ended = await pulling();
  assert.deepEqual(calls, ['initialize', 'notifications/initialized', 'tools/call memory_list']);
  mock.timers.tick(KNOWLEDGE_REQUEST_LIMIT_MS);
  await settle();
  assertTimedOut(ended);
  // A 429's wait is at most 65 seconds: well past it, still no other request.
  mock.timers.tick(10 * KNOWLEDGE_REQUEST_LIMIT_MS);
  await settle();
  assert.equal(calls.length, 3);
});

test('an answer whose body stops halfway stops the pull at 90 seconds too', async () => {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(asked(init));
    const halfway = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"result":'));
      },
    });
    return new Response(halfway, { headers: { 'content-type': 'application/json' } });
  };
  const ended = await pulling();
  assert.deepEqual(calls, ['initialize']);
  assert.equal(ended.done, false);
  mock.timers.tick(KNOWLEDGE_REQUEST_LIMIT_MS);
  await settle();
  assertTimedOut(ended);
  assert.deepEqual(calls, ['initialize']);
});
