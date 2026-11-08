// Why a refused key stopped working, and when that removes anything
// (offboarding O8b, lib/key-standing.mjs). The website's route is a local
// server on 127.0.0.1; the watcher's sightings live in a temporary data folder;
// the clock is the test's own. Every key and account id is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, symlink, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { A, B, fakeClock, madeUpKey, standing, startRoute, world } from './offboarding-world.mjs';
import {
  CONFIRM_AFTER_MS,
  KeyRefusalWatcher,
  QUIET_AFTER_ACTIVE_MS,
  QUIET_AFTER_NO_ANSWER_MS,
  QUIET_AFTER_SWITCHED_OFF_MS,
  SIGHTING_TTL_MS,
  STANDING_PATH,
  askKeyStanding,
  keyFingerprint,
  readStandingAnswer,
  readWatch,
  watchStatePath,
} from '../lib/key-standing.mjs';

/* ── reading the answer ───────────────────────────────────────────────────── */

test('only status 200 with exactly one of the four answers is an answer', () => {
  for (const s of ['active', 'key_switched_off', 'removed_from_team', 'account_closed']) {
    assert.deepEqual(readStandingAnswer(200, JSON.stringify({ standing: s })), { kind: 'answer', standing: s });
  }
  for (const [status, text] of [
    [201, '{"standing":"removed_from_team"}'],
    [500, '{"standing":"removed_from_team"}'],
    [200, '{"standing":"removed_from_team","extra":1}'],
    [200, '{"standing":"removed"}'],
    [200, '{"standing":["removed_from_team"]}'],
    [200, '["removed_from_team"]'],
    [200, '<html>removed_from_team</html>'],
    [200, ''],
    [200, 'null'],
  ]) {
    assert.equal(readStandingAnswer(status, text).kind, 'no_answer', `${status} ${text}`);
  }
});

/* ── asking ───────────────────────────────────────────────────────────────── */

test('the question: POST to the route, the refused key as the bearer, exactly { account_id }', async (t) => {
  const route = await startRoute(() => standing('removed_from_team'));
  t.after(() => route.close());
  const key = madeUpKey();
  const reply = await askKeyStanding({ appUrl: route.appUrl, key, accountId: A });
  assert.deepEqual(reply, { kind: 'answer', standing: 'removed_from_team' });
  assert.equal(route.count(), 1);
  const [req] = route.requests;
  assert.equal(req.method, 'POST');
  assert.equal(req.url, STANDING_PATH);
  assert.equal(req.headers.authorization, `Bearer ${key}`);
  assert.deepEqual(JSON.parse(req.body), { account_id: A });
});

for (const [name, reply, why] of [
  ['a 500', { status: 500, body: '{"error":"unavailable"}' }, 'unavailable'],
  ['a 502 page', { status: 502, body: 'Bad gateway', headers: { 'content-type': 'text/html' } }, 'unavailable'],
  ['a 503', { status: 503, body: '{"error":"unavailable"}' }, 'unavailable'],
  ['a 404', { status: 404, body: 'Not found' }, 'refused'],
  ['a 400', { status: 400, body: '{"error":"invalid_request"}' }, 'refused'],
  ['a 401', { status: 401, body: '{"standing":"removed_from_team"}' }, 'refused'],
  ['a body with more in it', { status: 200, body: '{"standing":"account_closed","account":"x"}' }, 'unreadable'],
]) {
  test(`${name} is no answer`, async (t) => {
    const route = await startRoute(() => reply);
    t.after(() => route.close());
    assert.deepEqual(await askKeyStanding({ appUrl: route.appUrl, key: madeUpKey(), accountId: A }), { kind: 'no_answer', why });
  });
}

test("a 429 is no answer, and carries the route's Retry-After", async (t) => {
  const route = await startRoute(() => ({ status: 429, body: '{"error":"too_many_requests"}', headers: { 'retry-after': '120' } }));
  t.after(() => route.close());
  assert.deepEqual(await askKeyStanding({ appUrl: route.appUrl, key: madeUpKey(), accountId: A }), {
    kind: 'no_answer',
    why: 'busy',
    retryAfterSeconds: 120,
  });
});

test('a redirect is never followed', async (t) => {
  const target = await startRoute(() => standing('removed_from_team'));
  t.after(() => target.close());
  const route = await startRoute(() => (res) => {
    res.writeHead(307, { location: `${target.appUrl}${STANDING_PATH}` });
    res.end();
  });
  t.after(() => route.close());
  assert.deepEqual(await askKeyStanding({ appUrl: route.appUrl, key: madeUpKey(), accountId: A }), { kind: 'no_answer', why: 'refused' });
  assert.equal(target.count(), 0, 'the redirect target was never asked');
});

test('a route that never answers is a timeout', async (t) => {
  const route = await startRoute(() => () => {});
  t.after(() => route.close());
  assert.deepEqual(await askKeyStanding({ appUrl: route.appUrl, key: madeUpKey(), accountId: A, timeoutMs: 100 }), {
    kind: 'no_answer',
    why: 'timeout',
  });
});

test('the timeout covers the body: headers and then nothing is a timeout', async (t) => {
  const route = await startRoute(() => (res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"standing":');
  });
  t.after(() => route.close());
  assert.deepEqual(await askKeyStanding({ appUrl: route.appUrl, key: madeUpKey(), accountId: A, timeoutMs: 150 }), {
    kind: 'no_answer',
    why: 'timeout',
  });
});

test('at most 4 KB is read: a longer body is no answer, with or without a Content-Length', async (t) => {
  const big = JSON.stringify({ standing: 'removed_from_team', pad: 'x'.repeat(5000) });
  const declared = await startRoute(() => ({ status: 200, body: big }));
  t.after(() => declared.close());
  assert.deepEqual(await askKeyStanding({ appUrl: declared.appUrl, key: madeUpKey(), accountId: A }), { kind: 'no_answer', why: 'unreadable' });
  // Streamed without a length: cut off once past 4 KB, the rest never read.
  let wrote = 0;
  const streamed = await startRoute(() => (res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    const chunk = 'x'.repeat(1024);
    const timer = setInterval(() => {
      if (wrote > 64) {
        clearInterval(timer);
        res.end();
        return;
      }
      wrote += 1;
      res.write(chunk);
    }, 2);
    res.on('close', () => clearInterval(timer));
  });
  t.after(() => streamed.close());
  assert.deepEqual(await askKeyStanding({ appUrl: streamed.appUrl, key: madeUpKey(), accountId: A }), { kind: 'no_answer', why: 'unreadable' });
  assert.ok(wrote < 64, `the whole body was read (${wrote} KB)`);
});

test('nothing listening is no answer', async () => {
  const route = await startRoute(() => standing('active'));
  const appUrl = route.appUrl;
  await route.close();
  assert.equal((await askKeyStanding({ appUrl, key: madeUpKey(), accountId: A })).kind, 'no_answer');
});

/* ── the watcher ──────────────────────────────────────────────────────────── */

/**
 * A watcher over a temporary data folder, asking `answers` in order (the last
 * repeats), with the test's clock. `connect` says whether the key came from
 * /hiveku:connect here; `stored` is the key stored now.
 */
async function watcherWorld(t, { answers, connect = true, key = madeUpKey(), data } = {}) {
  const w = data ? { data } : await world(t);
  const clock = fakeClock();
  const asked = [];
  const removed = [];
  const told = [];
  const env = { stored: key };
  const watcher = new KeyRefusalWatcher({
    dataDir: w.data,
    appUrl: 'http://127.0.0.1:9',
    ask: async (q) => {
      asked.push(q);
      const a = answers[Math.min(asked.length - 1, answers.length - 1)];
      return typeof a === 'string' ? { kind: 'answer', standing: a } : a;
    },
    storedKey: async () => env.stored,
    fromConnect: async (_id, k) => connect && k === key,
    remove: async (accountId, reason, k) => removed.push({ accountId, reason, key: k }),
    keyStopped: (accountId) => told.push(accountId),
    log: () => undefined,
    now: clock.now,
    schedule: clock.schedule,
  });
  t.after(() => watcher.dispose());
  return { w, clock, watcher, asked, removed, told, key, env };
}

test('two removal answers, two minutes apart, about the same stored key: removed once, with that reason', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 1);
  assert.deepEqual(s.removed, [], 'one answer removes nothing');
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  assert.equal(s.asked.length, 2, 'the bridge asked once more by itself');
  assert.deepEqual(s.removed, [{ accountId: A, reason: 'removed_from_team', key: s.key }]);
});

test('the second question comes minutes later, never seconds', async (t) => {
  const s = await watcherWorld(t, { answers: ['account_closed'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  await s.clock.advance(CONFIRM_AFTER_MS - 10_000, s.watcher);
  assert.equal(s.asked.length, 1);
  // A refusal in between asks nothing: the confirming question is already set.
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 1);
  assert.deepEqual(s.removed, []);
  await s.clock.advance(10_000, s.watcher);
  assert.equal(s.removed.length, 1);
  assert.equal(s.removed[0].reason, 'account_closed');
});

for (const [name, second] of [
  ['key_switched_off', 'key_switched_off'],
  ['active', 'active'],
  ['an error', { kind: 'no_answer', why: 'unavailable' }],
  ['a timeout', { kind: 'no_answer', why: 'timeout' }],
  ['a 429', { kind: 'no_answer', why: 'busy', retryAfterSeconds: 60 }],
]) {
  test(`a removal answer, then ${name}: nothing is removed`, async (t) => {
    const s = await watcherWorld(t, { answers: ['removed_from_team', second] });
    s.watcher.onRefused(A, s.key);
    await s.watcher.settled();
    await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
    assert.equal(s.asked.length, 2);
    assert.deepEqual(s.removed, []);
  });
}

test('an answer that removes nothing forgets the first sighting at once', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team', 'key_switched_off', 'removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  assert.equal((await readWatch(s.w.data, A)).sighting, null);
  // Quiet for that key now; even after the quiet hours, a removal answer is a first sighting again.
  await s.clock.advance(QUIET_AFTER_SWITCHED_OFF_MS, s.watcher);
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 3);
  assert.deepEqual(s.removed, []);
  assert.ok((await readWatch(s.w.data, A)).sighting, 'a new first sighting');
});

test('no answer keeps the first sighting, and the bridge asks again itself after the quiet hours', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team', { kind: 'no_answer', why: 'unavailable' }, 'removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  assert.equal(s.asked.length, 2);
  assert.ok((await readWatch(s.w.data, A)).sighting, 'kept');
  assert.deepEqual(s.removed, []);
  await s.clock.advance(QUIET_AFTER_NO_ANSWER_MS, s.watcher);
  assert.equal(s.asked.length, 3);
  assert.equal(s.removed.length, 1, 'a second definite removal answer within 30 minutes confirms it');
});

test('a first sighting not confirmed within 30 minutes is forgotten: the next removal answer starts again', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team', { kind: 'no_answer', why: 'busy', retryAfterSeconds: 3600 }, 'removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  // An hour of quiet: past the sighting's 30 minutes, so the bridge does not ask again by itself.
  await s.clock.advance(SIGHTING_TTL_MS + 60 * 60 * 1000, s.watcher);
  assert.equal(s.asked.length, 2);
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 3);
  assert.deepEqual(s.removed, [], 'an expired sighting confirms nothing');
});

test('a burst of refusals asks one question', async (t) => {
  const s = await watcherWorld(t, { answers: ['key_switched_off'] });
  for (let i = 0; i < 30; i++) s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  for (let i = 0; i < 30; i++) s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 1);
});

test('quiet hours: 6 hours after key_switched_off, 30 minutes after active, for that key only', async (t) => {
  const s = await watcherWorld(t, { answers: ['key_switched_off'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  await s.clock.advance(QUIET_AFTER_SWITCHED_OFF_MS - 60_000, s.watcher);
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 1);
  // A new key (a reconnect) is asked about at once.
  const other = madeUpKey();
  s.watcher.onRefused(A, other);
  await s.watcher.settled();
  assert.equal(s.asked.length, 2);
  await s.clock.advance(60_000, s.watcher);
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 3);

  const t2 = await watcherWorld(t, { answers: ['active'] });
  t2.watcher.onRefused(A, t2.key);
  await t2.watcher.settled();
  await t2.clock.advance(QUIET_AFTER_ACTIVE_MS - 1000, t2.watcher);
  t2.watcher.onRefused(A, t2.key);
  await t2.watcher.settled();
  assert.equal(t2.asked.length, 1);
  await t2.clock.advance(1000, t2.watcher);
  t2.watcher.onRefused(A, t2.key);
  await t2.watcher.settled();
  assert.equal(t2.asked.length, 2);
});

test("after no answer, the route's Retry-After is kept, up to an hour", async (t) => {
  const s = await watcherWorld(t, { answers: [{ kind: 'no_answer', why: 'busy', retryAfterSeconds: 7200 }] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  const { quiet } = await readWatch(s.w.data, A);
  assert.equal(quiet.until - s.clock.now(), 60 * 60 * 1000);
  const t2 = await watcherWorld(t, { answers: [{ kind: 'no_answer', why: 'timeout' }] });
  t2.watcher.onRefused(A, t2.key);
  await t2.watcher.settled();
  assert.equal((await readWatch(t2.w.data, A)).quiet.until - t2.clock.now(), QUIET_AFTER_NO_ANSWER_MS);
});

test('a key that did not come from /hiveku:connect here removes nothing, and the person is told once', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'], connect: false });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  assert.deepEqual(s.removed, []);
  assert.equal(s.asked.length, 1, 'no confirming question for a key not from connect');
  assert.equal((await readWatch(s.w.data, A)).sighting, null, 'no sighting kept');
  assert.deepEqual(s.told, [A]);
  // Quiet for 6 hours; then asked again, and not told twice about the same key.
  await s.clock.advance(QUIET_AFTER_SWITCHED_OFF_MS, s.watcher);
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.equal(s.asked.length, 2);
  assert.deepEqual(s.told, [A]);
  assert.deepEqual(s.removed, []);
});

test('an old key a newer one replaced is not told about', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'], connect: false });
  s.env.stored = madeUpKey();
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.deepEqual(s.told, []);
});

test('a reconnect between the two sightings removes nothing', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  s.env.stored = madeUpKey();
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  assert.deepEqual(s.removed, []);
  assert.equal(s.asked.length, 1, 'the confirming question is not asked about another key');
});

test('two removal answers about two keys are never two sightings', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  // Three minutes on, a removal answer about another key (from another session's bridge): a first sighting of its own.
  await s.clock.advance(CONFIRM_AFTER_MS - 1000, s.watcher);
  s.watcher.dispose();
  const other = madeUpKey();
  const asked = [];
  const removed = [];
  const clock = fakeClock(s.clock.now() + 60_000);
  const second = new KeyRefusalWatcher({
    dataDir: s.w.data,
    ask: async (q) => (asked.push(q), { kind: 'answer', standing: 'removed_from_team' }),
    storedKey: async () => other,
    fromConnect: async () => true,
    remove: async (...args) => removed.push(args),
    log: () => undefined,
    now: clock.now,
    schedule: clock.schedule,
  });
  t.after(() => second.dispose());
  second.onRefused(A, other);
  await second.settled();
  assert.deepEqual(removed, []);
  assert.equal((await readWatch(s.w.data, A)).sighting.key_fp, keyFingerprint(other));
});

test("a sighting is kept on disk: the next session's bridge confirms it, never the same minute", async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  s.watcher.dispose(); // the session ends before its confirming question
  const asked = [];
  const removed = [];
  const later = fakeClock(s.clock.now() + 5 * 60 * 1000);
  const next = new KeyRefusalWatcher({
    dataDir: s.w.data,
    ask: async (q) => (asked.push(q), { kind: 'answer', standing: 'removed_from_team' }),
    storedKey: async () => s.key,
    fromConnect: async (_id, k) => k === s.key,
    remove: async (accountId, reason) => removed.push({ accountId, reason }),
    log: () => undefined,
    now: later.now,
    schedule: later.schedule,
  });
  t.after(() => next.dispose());
  next.onRefused(A, s.key);
  await next.settled();
  assert.equal(asked.length, 1);
  assert.deepEqual(removed, [{ accountId: A, reason: 'removed_from_team' }]);
});

test("another session's fresh sighting stays the first; its confirming question is set for when it is old enough", async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  s.watcher.dispose();
  const asked = [];
  const removed = [];
  const clock = fakeClock(s.clock.now() + 30_000);
  const next = new KeyRefusalWatcher({
    dataDir: s.w.data,
    ask: async (q) => (asked.push(q), { kind: 'answer', standing: 'removed_from_team' }),
    storedKey: async () => s.key,
    fromConnect: async () => true,
    remove: async (...args) => removed.push(args),
    log: () => undefined,
    now: clock.now,
    schedule: clock.schedule,
  });
  t.after(() => next.dispose());
  next.onRefused(A, s.key);
  await next.settled();
  assert.equal(asked.length, 0, 'thirty seconds after the first sighting nothing is asked');
  await clock.advance(CONFIRM_AFTER_MS - 30_000 - 1, next);
  assert.deepEqual(removed, []);
  await clock.advance(1, next);
  assert.equal(asked.length, 1);
  assert.equal(removed.length, 1);
});

test('what is kept on disk never holds the key', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'], connect: false });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  const text = await readFile(watchStatePath(s.w.data, A), 'utf8');
  assert.ok(!text.includes(s.key));
  assert.ok(!text.includes(s.key.slice(4, 20)));
});

test('a state file that is a link, or not JSON, is no sighting', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  const file = watchStatePath(s.w.data, A);
  const planted = path.join(s.w.data, 'planted.json');
  await writeFile(planted, await readFile(file, 'utf8'));
  const { rm } = await import('node:fs/promises');
  await rm(file);
  await symlink(planted, file);
  assert.equal((await readWatch(s.w.data, A)).sighting, null);
  await rm(file);
  await writeFile(file, '{"v":1,"sighting":');
  assert.equal((await readWatch(s.w.data, A)).sighting, null);
  await s.clock.advance(CONFIRM_AFTER_MS, s.watcher);
  assert.deepEqual(s.removed, [], 'no kept sighting, so the confirming question confirms nothing');
});

test('only a Hiveku key and an account id as the website names them are asked about', async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused('A0A0A0A0-0B0B-4C0C-8D0D-0E0E0E0E0E0E', s.key);
  s.watcher.onRefused('key-1a2b', s.key);
  s.watcher.onRefused(A, `olp_${'0'.repeat(64)}`);
  s.watcher.onRefused(A, undefined);
  await s.watcher.settled();
  assert.equal(s.asked.length, 0);
});

test('a connect check that fails counts as not from connect', async (t) => {
  const w = await world(t);
  const key = madeUpKey();
  const clock = fakeClock();
  const removed = [];
  const watcher = new KeyRefusalWatcher({
    dataDir: w.data,
    ask: async () => ({ kind: 'answer', standing: 'removed_from_team' }),
    storedKey: async () => key,
    fromConnect: async () => {
      throw new Error('store locked');
    },
    remove: async (...args) => removed.push(args),
    log: () => undefined,
    now: clock.now,
    schedule: clock.schedule,
  });
  t.after(() => watcher.dispose());
  watcher.onRefused(A, key);
  await watcher.settled();
  await clock.advance(CONFIRM_AFTER_MS, watcher);
  assert.deepEqual(removed, []);
});

test('without a data folder nothing is asked, so nothing is removed', async (t) => {
  const asked = [];
  const watcher = new KeyRefusalWatcher({
    dataDir: undefined,
    ask: async (q) => (asked.push(q), { kind: 'answer', standing: 'removed_from_team' }),
    storedKey: async () => 'hvk_x',
    fromConnect: async () => true,
    remove: async () => assert.fail('removed'),
    log: () => undefined,
  });
  t.after(() => watcher.dispose());
  watcher.onRefused(A, madeUpKey());
  await watcher.settled();
  assert.equal(asked.length, 0);
});

test('watch state is per account', async (t) => {
  const w = await world(t);
  await mkdir(path.join(w.data, 'offboarding', 'watch'), { recursive: true });
  const s = await watcherWorld(t, { answers: ['removed_from_team'], data: w.data });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  assert.deepEqual((await readdir(path.join(w.data, 'offboarding', 'watch'))).sort(), [`${A}.json`]);
  assert.equal((await readWatch(w.data, B)).sighting, null);
});

test('two bridges answered a moment apart: the second removal answer is never a second sighting', async (t) => {
  // Both asked before either kept a sighting; the second answer comes 30 seconds after the first.
  const w = await world(t);
  const key = madeUpKey();
  const clock = fakeClock();
  const removed = [];
  let releaseSecond;
  const secondAnswer = new Promise((resolve) => { releaseSecond = resolve; });
  const make = (ask) => {
    const watcher = new KeyRefusalWatcher({
      dataDir: w.data,
      ask,
      storedKey: async () => key,
      fromConnect: async () => true,
      remove: async (...args) => removed.push(args),
      log: () => undefined,
      now: clock.now,
      schedule: clock.schedule,
    });
    t.after(() => watcher.dispose());
    return watcher;
  };
  const first = make(async () => ({ kind: 'answer', standing: 'removed_from_team' }));
  const second = make(async () => secondAnswer);
  second.onRefused(A, key);
  first.onRefused(A, key);
  await first.settled();
  await clock.advance(30_000);
  releaseSecond({ kind: 'answer', standing: 'removed_from_team' });
  await second.settled();
  assert.deepEqual(removed, [], 'thirty seconds apart is not minutes apart');
});

test("an older session's bridge still holding the replaced key confirms nothing", async (t) => {
  const s = await watcherWorld(t, { answers: ['removed_from_team'] });
  s.watcher.onRefused(A, s.key);
  await s.watcher.settled();
  s.watcher.dispose(); // that session ends; the person reconnects, and a new key is stored
  const stored = madeUpKey();
  const removed = [];
  const clock = fakeClock(s.clock.now() + 3 * 60 * 1000);
  // A session started before the reconnect still holds the old key, and Hiveku refuses it.
  const older = new KeyRefusalWatcher({
    dataDir: s.w.data,
    ask: async () => ({ kind: 'answer', standing: 'removed_from_team' }),
    storedKey: async () => stored,
    fromConnect: async (_id, k) => k === s.key,
    remove: async (...args) => removed.push(args),
    log: () => undefined,
    now: clock.now,
    schedule: clock.schedule,
  });
  t.after(() => older.dispose());
  older.onRefused(A, s.key);
  await older.settled();
  assert.deepEqual(removed, [], 'the key stored now is another one: nothing is removed');
});
