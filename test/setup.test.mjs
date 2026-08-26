/**
 * First-run setup. The two things that must never go wrong: the folder name
 * must match the VS Code extension's byte-for-byte (or a machine running both
 * grows duplicate client folders), and setup must never rebind a folder that
 * belongs to a different account.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { runSetup, slugForAccount } from '../lib/setup.mjs';
import { resolveBinding } from '../lib/binding.mjs';

const ACCOUNTS = {
  '7f6bb2cf-1111-4222-8333-444455556666': { label: 'CTCA', key: 'hvk_a', key_preview: 'hvk_aaa...aaa', scope: 'full' },
  '9e0b2902-aaaa-4bbb-8ccc-ddddeeeeffff': { label: 'Blue Sky Media', key: 'hvk_b', key_preview: 'hvk_bbb...bbb', scope: 'read_only' },
};

test('slugForAccount matches the extension: charset keeps dots, id8 is alnum-lowercase', () => {
  // Vectors mirrored from hiveku-vscode/src/knowledge.ts slugForAccount/safeSlug.
  assert.equal(slugForAccount('CTCA', '7f6bb2cf-1111-4222-8333-444455556666'), 'ctca-7f6bb2cf');
  assert.equal(slugForAccount('Blue Sky Media', '9e0b2902-aaaa-4bbb-8ccc-ddddeeeeffff'), 'blue-sky-media-9e0b2902');
  assert.equal(slugForAccount('Acme.Corp LLC', 'ABCDEF12-0000-0000-0000-000000000000'), 'acme.corp-llc-abcdef12');
  assert.equal(slugForAccount('', '7f6bb2cf-1111-4222-8333-444455556666'), 'account-7f6bb2cf');
  assert.equal(slugForAccount('###', '7f6bb2cf-1111-4222-8333-444455556666'), 'account-7f6bb2cf');
  assert.equal(slugForAccount('No Id Account', ''), 'no-id-account');
});

test('setup creates one bound folder per account and each resolves', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-setup-home-'));
  const { root, results } = await runSetup({ root: path.join(home, 'Hiveku-Accounts'), accounts: ACCOUNTS, homeDir: home });

  assert.equal(results.length, 2);
  for (const r of results) assert.equal(r.status, 'created');

  const ctca = path.join(root, 'ctca-7f6bb2cf');
  const resolved = await resolveBinding(ctca, home);
  assert.equal(resolved.accountId, '7f6bb2cf-1111-4222-8333-444455556666');
  assert.equal(resolved.label, 'CTCA');

  const gitignore = await fs.readFile(path.join(ctca, '.gitignore'), 'utf8');
  assert.match(gitignore, /\.hiveku\//);
  assert.match(gitignore, /hiveku-data\//);
});

test('setup is idempotent: second run reports exists, changes nothing', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-setup-home-'));
  const root = path.join(home, 'Hiveku-Accounts');
  await runSetup({ root, accounts: ACCOUNTS, homeDir: home });
  const before = await fs.readFile(path.join(root, 'ctca-7f6bb2cf/.hiveku/account.json'), 'utf8');

  const { results } = await runSetup({ root, accounts: ACCOUNTS, homeDir: home });
  for (const r of results) assert.equal(r.status, 'exists');
  assert.equal(await fs.readFile(path.join(root, 'ctca-7f6bb2cf/.hiveku/account.json'), 'utf8'), before);
});

test('an existing UNBOUND folder (the VS Code extension shape) is ADOPTED, its files untouched', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-setup-home-'));
  const root = path.join(home, 'Hiveku-Accounts');
  // The extension's workspace: same name, .env + .mcp.json, NO binding file.
  const dir = path.join(root, 'ctca-7f6bb2cf');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '.env'), 'OLYMPUS_API_KEY=hvk_extension\n');
  await fs.writeFile(path.join(dir, '.mcp.json'), '{"mcpServers":{"hiveku":{}}}');
  await fs.writeFile(path.join(dir, '.gitignore'), '.mcp.json\n.env\n');

  const { results } = await runSetup({ root, accounts: ACCOUNTS, homeDir: home });
  const ctca = results.find((r) => r.label === 'CTCA');
  assert.equal(ctca.status, 'adopted');

  // The binding now exists and resolves; the extension's files are byte-identical.
  const resolved = await resolveBinding(dir, home);
  assert.equal(resolved.accountId, '7f6bb2cf-1111-4222-8333-444455556666');
  assert.equal(await fs.readFile(path.join(dir, '.env'), 'utf8'), 'OLYMPUS_API_KEY=hvk_extension\n');
  assert.equal(await fs.readFile(path.join(dir, '.mcp.json'), 'utf8'), '{"mcpServers":{"hiveku":{}}}');
  // .gitignore gains the plugin entries without losing the extension's.
  const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.mcp\.json$/m);
  assert.match(gitignore, /^\.hiveku\/$/m);
});

test('a folder bound to a DIFFERENT account is a conflict, never rebound', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-setup-home-'));
  const root = path.join(home, 'Hiveku-Accounts');
  // Pre-plant CTCA's canonical folder bound to some other account.
  const dir = path.join(root, 'ctca-7f6bb2cf', '.hiveku');
  await fs.mkdir(dir, { recursive: true });
  const foreign = { version: 1, account_id: '00000000-0000-4000-8000-000000000000', label: 'Foreign' };
  await fs.writeFile(path.join(dir, 'account.json'), JSON.stringify(foreign));

  const { results } = await runSetup({ root, accounts: ACCOUNTS, homeDir: home });
  const ctca = results.find((r) => r.label === 'CTCA');
  assert.equal(ctca.status, 'conflict');
  assert.equal(ctca.bound_to, '00000000-0000-4000-8000-000000000000');
  // The foreign binding must be byte-identical afterwards.
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'account.json'), 'utf8')), foreign);
  // The other account still sets up fine.
  assert.equal(results.find((r) => r.label === 'Blue Sky Media').status, 'created');
});

test('refuses the home directory itself as root', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-setup-home-'));
  await assert.rejects(() => runSetup({ root: home, accounts: ACCOUNTS, homeDir: home }), /home directory/);
});
