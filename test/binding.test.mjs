/**
 * Binding resolution decides WHICH TENANT a directory talks to, so these tests
 * are weighted toward the direction that causes harm. A wrong "no binding" is a
 * user running /hiveku:bind again. A wrong "binding" is work landing in another
 * client's account, which is not recoverable by apologising.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveBinding, writeBinding, validateBinding, looksLikeHivekuFolder } from '../lib/binding.mjs';

const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_ACCOUNT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-binding-'));
}

test('resolves a binding in the directory itself', async () => {
  const dir = await tmpdir();
  await writeBinding(dir, { accountId: ACCOUNT, label: 'Acme Corp', keyPreview: 'hvk_abc123' });
  const b = await resolveBinding(dir, '/nonexistent-home');
  assert.equal(b.accountId, ACCOUNT);
  assert.equal(b.label, 'Acme Corp');
});

test('walks UP so a site subfolder inherits the account folder binding', async () => {
  // Account folders hold site projects in subdirectories. Working inside one
  // must still resolve to the account, or every project would need its own bind.
  const root = await tmpdir();
  await writeBinding(root, { accountId: ACCOUNT, label: 'Acme Corp' });
  const nested = path.join(root, 'sites', 'marketing-site', 'src');
  await fs.mkdir(nested, { recursive: true });
  const b = await resolveBinding(nested, '/nonexistent-home');
  assert.equal(b.accountId, ACCOUNT);
});

test('a nearer binding wins over a parent one', async () => {
  const root = await tmpdir();
  await writeBinding(root, { accountId: ACCOUNT, label: 'Acme Corp' });
  const child = path.join(root, 'client-b');
  await fs.mkdir(child, { recursive: true });
  await writeBinding(child, { accountId: OTHER_ACCOUNT, label: 'Beta LLC' });
  const b = await resolveBinding(child, '/nonexistent-home');
  assert.equal(b.accountId, OTHER_ACCOUNT, 'the closest binding must win');
});

test('STOPS at $HOME: a binding at home does not claim the whole machine', async () => {
  // A binding written at ~ (or above) would bind every directory on the
  // machine, silently attaching an account to unrelated work. This is the
  // single most dangerous placement, so it is refused rather than honoured.
  const home = await tmpdir();
  await writeBinding(home, { accountId: ACCOUNT, label: 'Acme Corp' });
  const work = path.join(home, 'some', 'unrelated', 'project');
  await fs.mkdir(work, { recursive: true });
  const b = await resolveBinding(work, home);
  assert.equal(b, null, 'a binding at $HOME must never be honoured');
});

test('returns null when nothing is bound anywhere up the tree', async () => {
  const dir = await tmpdir();
  const nested = path.join(dir, 'a', 'b');
  await fs.mkdir(nested, { recursive: true });
  assert.equal(await resolveBinding(nested, '/nonexistent-home'), null);
});

test('a present-but-invalid binding does not fall through to a parent', async () => {
  // Falling through would mean a corrupted or tampered child binding silently
  // adopts the parent's tenant, which is a quiet cross-account write.
  const root = await tmpdir();
  await writeBinding(root, { accountId: ACCOUNT, label: 'Acme Corp' });
  const child = path.join(root, 'child');
  await fs.mkdir(path.join(child, '.hiveku'), { recursive: true });
  await fs.writeFile(path.join(child, '.hiveku', 'account.json'), '{"account_id":"not-a-uuid"}');
  assert.equal(await resolveBinding(child, '/nonexistent-home'), null);
});

test('validateBinding rejects anything that is not a real account id', async () => {
  for (const bad of [null, {}, { account_id: '' }, { account_id: 'abc' }, { account_id: 123 }, 'string']) {
    assert.equal(validateBinding(bad, 'f', 'd'), null, `must reject ${JSON.stringify(bad)}`);
  }
});

test('IGNORES any endpoint the file tries to specify', async () => {
  // The upstream host is a constant in util.mjs. If a binding file could name a
  // host, a planted account.json would redirect a live account key to an
  // attacker's server — turning a cosmetic nuisance into credential theft.
  const parsed = {
    account_id: ACCOUNT,
    label: 'Acme',
    base_url: 'https://evil.tld/mcp',
    url: 'https://evil.tld/mcp',
    endpoint: 'https://evil.tld',
    key: 'hvk_stolen',
  };
  const b = validateBinding(parsed, 'f', 'd');
  assert.equal(b.accountId, ACCOUNT);
  assert.equal(b.base_url, undefined);
  assert.equal(b.url, undefined);
  assert.equal(b.endpoint, undefined);
  assert.equal(b.key, undefined, 'a binding must never carry key material');
});

test('the written binding contains no secret', async () => {
  const dir = await tmpdir();
  const file = await writeBinding(dir, { accountId: ACCOUNT, label: 'Acme', keyPreview: 'hvk_abc123' });
  const raw = await fs.readFile(file, 'utf8');
  assert.ok(!/hvk_[0-9a-f]{16}/.test(raw), 'must not contain a full key');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.account_id, ACCOUNT);
  assert.equal(parsed.key, undefined);
  assert.equal(parsed.key_preview, 'hvk_abc123', 'a short prefix is fine: useless to a thief');
});

test('looksLikeHivekuFolder only fires on real Hiveku artifacts', async () => {
  const plain = await tmpdir();
  assert.equal(await looksLikeHivekuFolder(plain), false);
  const withData = await tmpdir();
  await fs.mkdir(path.join(withData, 'hiveku-data'), { recursive: true });
  assert.equal(await looksLikeHivekuFolder(withData), true);
});
