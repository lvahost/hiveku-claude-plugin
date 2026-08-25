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
import { makePkcePair, safeEqual, buildConnectedParam, exchangeCode } from '../lib/connect.mjs';

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
