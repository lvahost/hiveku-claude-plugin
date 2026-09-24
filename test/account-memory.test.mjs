/**
 * The read-only account memory copy (lib/account-memory.mjs, plan A7).
 *
 * What must hold, whichever command refreshed it:
 *  - the file says it is a copy, that edits are not saved, and links the page
 *    where owners and admins edit it;
 *  - suggestions are listed under it with who suggested them and when;
 *  - it is written read-only, a local edit is replaced on the next pull, and
 *    the only tool it ever calls is the read (account_memory_get);
 *  - a failed read never replaces a good copy;
 *  - the two account domains are never a department.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  ACCOUNT_MEMORY_REL,
  accountMemoryDashboardUrl,
  isAccountMemoryDomain,
  normalizeAccountMemory,
  renderAccountMemoryFile,
  syncAccountMemory,
  writeReadOnlyFile,
} from '../lib/account-memory.mjs';
import { ACCOUNT_MEMORY_SAMPLE as SAMPLE } from './account-memory-fixture.mjs';

const ACCOUNT_ID = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';


async function freshDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-acctmem-'));
}

test('the two account domains are recognised, and nothing else is', () => {
  assert.equal(isAccountMemoryDomain('account'), true);
  assert.equal(isAccountMemoryDomain('account-suggestions'), true);
  assert.equal(isAccountMemoryDomain(' Account '), true);
  // Negative controls: the orchestrator's own `_account:*` rows and real
  // departments stay what they were.
  for (const d of ['_account:memory:goals', 'accounting', 'sales', '_identity:account', '', null, undefined]) {
    assert.equal(isAccountMemoryDomain(d), false, `${d} must not be the account memory`);
  }
});

test('the dashboard link is account-scoped for a real account id, and never half-built otherwise', () => {
  assert.equal(accountMemoryDashboardUrl(ACCOUNT_ID), `https://app.hiveku.com/${ACCOUNT_ID}/dashboard/memory`);
  assert.equal(accountMemoryDashboardUrl(null), 'https://app.hiveku.com/dashboard/memory');
  assert.equal(accountMemoryDashboardUrl('../../evil'), 'https://app.hiveku.com/dashboard/memory');
  assert.equal(accountMemoryDashboardUrl(ACCOUNT_ID, 'http://localhost:3001/'), `http://localhost:3001/${ACCOUNT_ID}/dashboard/memory`);
});

test('an unexpected tool answer is an error, never an empty memory', () => {
  // The generic mock answer `{ data: [] }` (and a moved shape) must not render
  // as "nothing written yet" over a real document.
  assert.throws(() => normalizeAccountMemory({ data: [] }), /unexpected shape/);
  assert.throws(() => normalizeAccountMemory({}), /unexpected shape/);
  assert.throws(() => normalizeAccountMemory({ data: { version: 2 } }), /unexpected shape/);
  // Control: the real shape, wrapped or not, parses.
  assert.equal(normalizeAccountMemory(SAMPLE).version, 7);
  assert.equal(normalizeAccountMemory(SAMPLE.data).suggestions.length, 2);
});

test('the file says it is a read-only copy, links the dashboard, and lists suggestions with who and when', () => {
  const text = renderAccountMemoryFile({
    memory: normalizeAccountMemory(SAMPLE),
    accountId: ACCOUNT_ID,
    fetchedAt: '2026-09-24T10:00:00.000Z',
  });
  assert.match(text, /^---\nread_only: true\n/);
  assert.match(text, /^version: 7$/m);
  assert.match(text, /^fetched_at: "2026-09-24T10:00:00.000Z"$/m);
  assert.match(text, new RegExp(`^edit_url: "https://app\\.hiveku\\.com/${ACCOUNT_ID}/dashboard/memory"$`, 'm'));

  const header = text.slice(0, text.indexOf('## About the business'));
  assert.match(header, /read-only copy of the account memory/);
  assert.match(header, /Owners and admins edit it on the Hiveku dashboard/);
  assert.match(header, new RegExp(`> https://app\\.hiveku\\.com/${ACCOUNT_ID}/dashboard/memory`));
  assert.match(header, /Changes made to this file are not saved to Hiveku/);
  assert.match(header, /do not quote it to customers/);
  assert.match(header, /Version 7, last changed 2026-09-23 14:02 UTC\./);

  // The owner's text, whole, BEFORE the suggestions.
  const body = text.indexOf('Family-run stairlift installer in Leeds.');
  const sugg = text.indexOf('# Suggestions from agents, not reviewed yet');
  assert.ok(body > 0 && sugg > body, 'owner text first, suggestions under it');
  assert.match(
    text.slice(sugg),
    /- Closed on Mondays from November to March\. \(suggested by Sales agent, 2026-09-23 15:30 UTC\)/,
  );
  assert.match(text.slice(sugg), /- Prefers phone calls to email\. \(suggested by MCP \(Claude Code\), 2026-09-24 09:05 UTC\)/);

  // No GitHub assumption anywhere in what a customer reads.
  assert.doesNotMatch(text, /github/i);
});

test('an empty account memory says who can start it, and a suggestion cannot break out of its line', () => {
  const text = renderAccountMemoryFile({
    memory: normalizeAccountMemory({
      data: {
        content: '',
        version: 0,
        updated_at: null,
        suggestions: [{ id: 'x', at: 'not a date', source: 'Sales agent', text: 'Line one\n# Fake heading\u2028more' }],
        suggestions_version: 1,
        truncated: false,
      },
    }),
    accountId: null,
    fetchedAt: '2026-09-24T10:00:00.000Z',
  });
  assert.match(text, /Nothing has been written yet\. An owner or admin can start it on the dashboard\./);
  assert.match(text, /https:\/\/app\.hiveku\.com\/dashboard\/memory/);
  assert.match(text, /^- Line one # Fake heading more \(suggested by Sales agent, not a date\)$/m);
  assert.doesNotMatch(text, /^# Fake heading/m);
});

test('sync writes the copy read-only, calls ONLY the read tool, and replaces a local edit on the next pull', async () => {
  const rootDir = await freshDir();
  const calls = [];
  const callTool = async (name, args) => {
    calls.push(name);
    assert.deepEqual(args, {}, 'the read takes no arguments');
    return SAMPLE;
  };
  const first = await syncAccountMemory({ rootDir, callTool, accountId: ACCOUNT_ID });
  assert.equal(first.ok, true);
  assert.equal(first.file, ACCOUNT_MEMORY_REL);
  assert.equal(first.version, 7);
  assert.equal(first.suggestions, 2);

  const file = path.join(rootDir, 'hiveku-data', 'account', 'ACCOUNT_MEMORY.md');
  const good = await fs.readFile(file, 'utf8');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o444, 'the copy is read-only on disk');

  // Someone makes it writable and edits it. The next pull replaces the edit,
  // and nothing reads the local file back or uploads it.
  await fs.chmod(file, 0o644);
  await fs.writeFile(file, good.replace('Leeds', 'Paris'), 'utf8');
  await fs.chmod(file, 0o444); // and even when they put the read-only bit back
  const second = await syncAccountMemory({ rootDir, callTool, accountId: ACCOUNT_ID });
  assert.equal(second.ok, true);
  const after = await fs.readFile(file, 'utf8');
  assert.match(after, /Leeds/);
  assert.doesNotMatch(after, /Paris/);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o444);

  assert.deepEqual(calls, ['account_memory_get', 'account_memory_get'], 'the only tool ever called is the read');
  const leftovers = (await fs.readdir(path.dirname(file))).filter((f) => f !== 'ACCOUNT_MEMORY.md');
  assert.deepEqual(leftovers, [], 'no temp file is left beside the copy');
});

test('a failed read keeps the previous copy and says so; with no copy it writes nothing', async () => {
  const rootDir = await freshDir();
  const file = path.join(rootDir, ACCOUNT_MEMORY_REL);

  const none = await syncAccountMemory({
    rootDir,
    callTool: async () => {
      throw new Error('Unknown tool: account_memory_get');
    },
  });
  assert.equal(none.ok, false);
  assert.equal(none.kept, false);
  await assert.rejects(fs.access(file), 'no copy is invented when the first read fails');

  await syncAccountMemory({ rootDir, callTool: async () => SAMPLE, accountId: ACCOUNT_ID });
  const good = await fs.readFile(file, 'utf8');
  const lines = [];
  const failed = await syncAccountMemory({
    rootDir,
    callTool: async () => ({ data: [] }),
    accountId: ACCOUNT_ID,
    log: (l) => lines.push(l),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.kept, true);
  assert.match(failed.error, /unexpected shape/);
  assert.equal(await fs.readFile(file, 'utf8'), good, 'the good copy is untouched');
  assert.ok(lines.some((l) => /kept previous copy/.test(l)), lines.join(' | '));
});

test('writeReadOnlyFile replaces a read-only file in place', async () => {
  const dir = await freshDir();
  const file = path.join(dir, 'x.md');
  await writeReadOnlyFile(file, 'one');
  await writeReadOnlyFile(file, 'two');
  assert.equal(await fs.readFile(file, 'utf8'), 'two');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o444);
});
