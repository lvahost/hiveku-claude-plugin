/**
 * The consent flow's client half.
 *
 * The load-bearing test here is the PKCE cross-repo contract: the challenge this
 * CLI derives must equal base64url(sha256(verifier)), byte for byte, because the
 * builder's exchange recomputes exactly that and compares. If the two ever
 * disagree, every /hiveku:connect fails PKCE verification with no other symptom.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makePkcePair, safeEqual, buildConnectedParam, exchangeCode, keysToRotate, isLoopbackHost } from '../lib/connect.mjs';

function serverSideChallenge(verifier) {
  // Byte-identical to hiveku_builder's pkceMatches / RFC 7636 S256.
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

test('PKCE challenge matches what the server will recompute (the cross-repo contract)', () => {
  for (let i = 0; i < 50; i++) {
    const { verifier, challenge } = makePkcePair();
    assert.equal(challenge, serverSideChallenge(verifier), 'CLI challenge diverged from server derivation');
    // RFC 7636 shape the server also enforces.
    assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
    assert.match(challenge, /^[A-Za-z0-9._~-]{43,128}$/);
  }
});

test('safeEqual is constant-time-ish and rejects mismatches and empties', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('', ''), false, 'empty must never match empty — an unset state is not a valid state');
  assert.equal(safeEqual(null, undefined), false);
});

test('buildConnectedParam stays under the request-line budget', () => {
  // The consent URL carries the already-connected ids for pre-selection. A huge
  // roster once pushed the request line past nginx's 8KB limit, so this caps at
  // ~1500 encoded chars and simply stops adding once the budget is spent.
  const many = Array.from({ length: 500 }, (_, i) => `acc-${String(i).padStart(36, '0')}`);
  const out = buildConnectedParam(many);
  assert.ok(out.length < many.length, 'must drop ids once the budget is exhausted');
  const encoded = out.join(',').length;
  assert.ok(encoded <= 1500, `encoded length ${encoded} exceeded the budget`);
});

test('buildConnectedParam includes everything when it fits', () => {
  const few = ['a', 'b', 'c'];
  assert.deepEqual(buildConnectedParam(few), few);
});

test('exchangeCode surfaces a server error message instead of a raw status', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'PKCE verification failed' }), { status: 400 });
  try {
    await assert.rejects(
      () => exchangeCode({ appUrl: 'https://example.test', code: 'x', verifier: 'y' }),
      /PKCE verification failed/,
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('exchangeCode rejects an empty accounts array rather than returning nothing', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ accounts: [], departments: [] }), { status: 200 });
  try {
    await assert.rejects(
      () => exchangeCode({ appUrl: 'https://example.test', code: 'x', verifier: 'y' }),
      /no accounts/i,
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('keysToRotate: only this device\'s replaced keys, never new or unchanged ones', () => {
  const prior = {
    'acc-1': { key: 'hvk_old1', label: 'Acme' },
    'acc-2': { key: 'hvk_same', label: 'Beta' },
    'acc-4': { key: 'hvk_other_device_only_local_absent' },
  };
  const incoming = [
    { account_id: 'acc-1', key: 'hvk_new1' },   // replaced -> rotate
    { account_id: 'acc-2', key: 'hvk_same' },   // unchanged -> leave
    { account_id: 'acc-3', key: 'hvk_new3' },   // brand new -> nothing to revoke
  ];
  const rotations = keysToRotate(prior, incoming);
  assert.deepEqual(rotations, [{ account_id: 'acc-1', label: 'Acme', oldKey: 'hvk_old1' }]);
});

test('keysToRotate: empty prior store rotates nothing', () => {
  assert.deepEqual(keysToRotate({}, [{ account_id: 'a', key: 'k' }]), []);
  assert.deepEqual(keysToRotate(undefined, [{ account_id: 'a', key: 'k' }]), []);
});


test('isLoopbackHost accepts every spelling of loopback on OUR port', () => {
  // A completed consent died at "Bad host" because the listener pinned the single
  // literal 127.0.0.1 while the browser arrived as localhost. The user had already
  // approved and a real code had already been minted, so the failure landed at the
  // last possible step.
  for (const h of ['127.0.0.1:55703', 'localhost:55703', '[::1]:55703', 'LOCALHOST:55703']) {
    assert.equal(isLoopbackHost(h, 55703), true, h);
  }
});

test('isLoopbackHost rejects rebinding and lookalike hosts', () => {
  // Exact host:port only. A substring or suffix match would pass the first three.
  for (const h of [
    'localhost.evil.tld:55703',
    'evil.tld:55703',
    'notlocalhost:55703',
    '127.0.0.1.evil.tld:55703',
    'localhost:1234',
    '127.0.0.1',
    'localhost',
    '',
  ]) {
    assert.equal(isLoopbackHost(h, 55703), false, h);
  }
});

test('isLoopbackHost does not throw on a missing or non-string Host header', () => {
  assert.equal(isLoopbackHost(undefined, 55703), false);
  assert.equal(isLoopbackHost(null, 55703), false);
  assert.equal(isLoopbackHost(12345, 55703), false);
});
