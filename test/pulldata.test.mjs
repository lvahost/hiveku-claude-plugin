/**
 * The data engine, exercised against a real in-process MCP server rather than
 * stubs — the wire protocol (initialize, 204 on notifications, tool-result
 * envelopes), the scoped fan-out, pagination, the file shapes the extension
 * also writes, and the two protections that matter most: a failed refresh
 * never clobbers a good snapshot, and STATUS.json survives the extension's
 * incompatible `departments` array.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { runPullData } from '../lib/pulldata.mjs';
import { ACCOUNT_MEMORY_SAMPLE } from './account-memory-fixture.mjs';

const MANIFEST = {
  version: 1,
  generated_at: '2026-08-25T00:00:00.000Z',
  default_departments: ['crm'],
  departments: [
    {
      id: 'crm',
      label: 'CRM / Sales',
      datasets: [
        { id: 'deals', label: 'Deals', tool: 'crm_list_deals' },
        { id: 'notes', label: 'Notes by project', tool: 'notes_list', scope: [
          { parentTool: 'projects_list', parentIdKey: 'id', parentLabelKey: 'name', argKey: 'project_id' },
        ] },
        { id: 'broken', label: 'Broken dataset', tool: 'always_fails' },
      ],
      references: [{ id: 'account', label: 'Account info', tool: 'get_account_info' }],
    },
    { id: 'empty', label: 'References only', datasets: [] },
  ],
};

/** Two pages of deals so pagination is actually followed. */
const PAGE1 = { data: [{ id: 'd1', name: 'Deal One' }], pagination: { page: 1, total_pages: 2, total: 3 } };
const PAGE2 = { data: [{ id: 'd2', name: 'Deal Two' }, { id: 'd3', name: 'Deal Three' }], pagination: { page: 2, total_pages: 2, total: 3 } };

let server;
let endpoint;
const seenAuth = new Set();
const seenClients = new Set();
/** Every tool name called, in order, so a test can prove what was NOT called. */
const toolCalls = [];
/** 'ok' answers with the real account_memory_get shape; 'fail' errors like an undeployed tool. */
const accountMemoryMode = { value: 'ok' };
const ACCOUNT_ID = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';

function toolResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seenAuth.add(req.headers.authorization || '');
      seenClients.add(req.headers['x-hiveku-client'] || '');
      const rpc = JSON.parse(body || '{}');
      const reply = (result) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
      };
      if (rpc.method === 'initialize') {
        res.setHeader('Mcp-Session-Id', 'test-session');
        return reply({ protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock' } });
      }
      if (rpc.method === 'notifications/initialized') {
        res.statusCode = 204;
        return res.end();
      }
      if (rpc.method === 'tools/call') {
        const { name, arguments: args } = rpc.params;
        toolCalls.push(name);
        if (name === 'account_memory_get') {
          if (accountMemoryMode.value === 'fail') {
            return reply({ isError: true, content: [{ type: 'text', text: 'Unknown tool: account_memory_get' }] });
          }
          return reply(toolResult(ACCOUNT_MEMORY_SAMPLE));
        }
        if (name === 'crm_list_deals') return reply(toolResult(args?.page === 2 ? PAGE2 : PAGE1));
        if (name === 'projects_list') return reply(toolResult({ data: [{ id: 'p1', name: 'Site A' }, { id: 'p2', name: 'Site B' }] }));
        if (name === 'notes_list') return reply(toolResult({ data: [{ id: `n-${args.project_id}`, text: 'hello' }] }));
        if (name === 'get_account_info') return reply(toolResult({ data: [{ account_id: 'acc-1', name: 'Mock Co' }] }));
        if (name === 'always_fails') return reply({ isError: true, content: [{ type: 'text', text: 'boom' }] });
        return reply(toolResult({ data: [] }));
      }
      reply({});
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
});

after(() => server.close());

async function freshDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-pull-'));
}

const OPTS = (rootDir) => ({ rootDir, endpoint, key: 'hvk_test', vendoredManifest: MANIFEST });

test('pulls a department: pagination followed, scope fanned out, error isolated, reference written', async () => {
  const rootDir = await freshDir();
  const lines = [];
  const result = await runPullData({ ...OPTS(rootDir), argv: ['crm'], log: (l) => lines.push(l) });
  assert.equal(result.ok, true);

  const deals = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/crm/deals.json'), 'utf8'));
  assert.equal(deals.count, 3, 'both pages should be followed');
  assert.equal(deals.total, 3);
  assert.equal(deals.tool, 'crm_list_deals');
  assert.ok(!deals.truncated);

  const notes = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/crm/notes.json'), 'utf8'));
  assert.equal(notes.count, 2, 'one row per parent project');
  assert.deepEqual(new Set(notes.rows.map((r) => r._parent)), new Set(['Site A', 'Site B']));
  assert.equal(notes.scoped_by, 'projects_list');

  const broken = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/crm/broken.json'), 'utf8'));
  assert.match(broken.error, /boom/);
  assert.equal(broken.count, 0);

  const ref = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/crm/account.json'), 'utf8'));
  assert.equal(ref[0]?.name ?? ref.name, 'Mock Co');

  const status = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/STATUS.json'), 'utf8'));
  assert.equal(status.runner_version, 2);
  assert.deepEqual(status.failed, [{ department: 'crm', dataset: 'broken', error: 'Tool always_fails errored: boom' }]);

  const readme = await fs.readFile(path.join(rootDir, 'hiveku-data/crm/README.md'), 'utf8');
  assert.match(readme, /deals\.json/);
  assert.match(readme, /hiveku pull crm/);

  // The wire details that would break silently against the real server:
  assert.ok(seenAuth.has('Bearer hvk_test'), 'must send the account key as a Bearer');
  assert.ok(seenClients.has('claude-code-plugin'), 'must claim its own rate-limit bucket');
});

test('a failed refresh never clobbers a good snapshot', async () => {
  const rootDir = await freshDir();
  await runPullData({ ...OPTS(rootDir), argv: ['crm'] });
  const file = path.join(rootDir, 'hiveku-data/crm/deals.json');
  const good = await fs.readFile(file, 'utf8');

  // Same pull against a dead endpoint: deals errors, but the file must survive.
  const result = await runPullData({ ...OPTS(rootDir), endpoint: 'http://127.0.0.1:9/mcp', argv: ['crm'] });
  assert.equal(result.ok, false, 'every dataset failing must be reported');
  assert.equal(await fs.readFile(file, 'utf8'), good, 'previous snapshot must be untouched');
});

test('STATUS.json survives the extension exporter having written departments as an ARRAY', async () => {
  const rootDir = await freshDir();
  const dataDir = path.join(rootDir, 'hiveku-data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, 'STATUS.json'),
    JSON.stringify({ account: 'Mock Co', departments: ['crm', 'seo'], fetched_at: '2026-08-01T00:00:00Z' }),
  );
  await runPullData({ ...OPTS(rootDir), argv: ['crm'] });
  const status = JSON.parse(await fs.readFile(path.join(dataDir, 'STATUS.json'), 'utf8'));
  assert.equal(typeof status.departments, 'object');
  assert.ok(!Array.isArray(status.departments), 'array prior must be normalized to an object');
  assert.ok(status.departments.crm?.datasets?.deals, 'the pulled department must be recorded');
  assert.equal(status.account, 'Mock Co', 'unrelated prior fields must survive the merge');
});

test('folder default_departments are preserved; vendored datasets win', async () => {
  const rootDir = await freshDir();
  const dataDir = path.join(rootDir, 'hiveku-data');
  await fs.mkdir(dataDir, { recursive: true });
  // A role-narrowed manifest the extension might have written, with a stale registry.
  await fs.writeFile(
    path.join(dataDir, 'manifest.json'),
    JSON.stringify({ version: 1, default_departments: ['empty'], departments: [{ id: 'stale', label: 'Old', datasets: [] }] }),
  );
  await runPullData({ ...OPTS(rootDir), argv: ['--default'] });
  const merged = JSON.parse(await fs.readFile(path.join(dataDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(merged.default_departments, ['empty'], 'the folder role-narrowing must survive');
  assert.ok(merged.departments.some((d) => d.id === 'crm'), 'the vendored registry must replace the stale one');
});

test('--stale skips fresh departments', async () => {
  const rootDir = await freshDir();
  await runPullData({ ...OPTS(rootDir), argv: ['--default'] });
  const lines = [];
  await runPullData({ ...OPTS(rootDir), argv: ['--stale', '12'], log: (l) => lines.push(l) });
  assert.ok(lines.some((l) => /fresh \(within 12h\)/.test(l)), `expected a freshness message, got: ${lines.join(' | ')}`);
});

test('--dataset refreshes one dataset and merges into the department status', async () => {
  const rootDir = await freshDir();
  await runPullData({ ...OPTS(rootDir), argv: ['crm'] });
  await runPullData({ ...OPTS(rootDir), argv: ['--dataset', 'crm:deals'] });
  const status = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/STATUS.json'), 'utf8'));
  assert.ok(status.departments.crm.datasets.broken, 'other datasets must survive a single-dataset refresh');
  assert.ok(status.departments.crm.datasets.deals);
});

test('STATUS.json preserves the extension\'s failures for departments this run did not touch', async () => {
  const rootDir = await freshDir();
  const dataDir = path.join(rootDir, 'hiveku-data');
  await fs.mkdir(dataDir, { recursive: true });
  // An extension-written STATUS.json: departments as an ARRAY, failures only in
  // the top-level `failed` array — including one for a department this pull will
  // NOT target.
  await fs.writeFile(
    path.join(dataDir, 'STATUS.json'),
    JSON.stringify({
      account: 'Mock Co',
      departments: ['seo', 'crm'],
      failed: [{ department: 'seo', dataset: 'audits', error: 'seo failed earlier' }],
    }),
  );
  await runPullData({ ...OPTS(rootDir), argv: ['crm'] }); // touches crm only
  const status = JSON.parse(await fs.readFile(path.join(dataDir, 'STATUS.json'), 'utf8'));
  const seoFail = status.failed.find((f) => f.department === 'seo');
  assert.ok(seoFail, "the extension's untouched-department failure must survive a targeted pull");
  assert.equal(seoFail.error, 'seo failed earlier');
  // And crm's own failure (the always-fails dataset) is recorded too.
  assert.ok(status.failed.some((f) => f.department === 'crm' && f.dataset === 'broken'));
});

test('detailSlug matches the extension runner byte-for-byte (dots/underscores collapse, cap 60)', async () => {
  const { detailSlug } = await import('../lib/pulldata.mjs');
  // The extension's deptData.slugify: /[^a-z0-9]+/ -> '-', trim, slice(0,60), 'item'.
  // util.slugify (WRONG for this) would keep dots and underscores and cap at 100.
  assert.equal(detailSlug('Acme.Corp_LLC'), 'acme-corp-llc');
  assert.equal(detailSlug('Q3 2026 — Report'), 'q3-2026-report');
  assert.equal(detailSlug(''), 'item');
  assert.equal(detailSlug('x'.repeat(80)).length, 60);
});

test('unknown department fails loudly, not silently', async () => {
  const rootDir = await freshDir();
  await assert.rejects(() => runPullData({ ...OPTS(rootDir), argv: ['nope'] }), /Unknown department/);
});

test('the vendored manifest is real: 27 departments, 100+ datasets, every dataset names a tool', async () => {
  const { readFile } = await import('node:fs/promises');
  const vendored = JSON.parse(
    await readFile(new URL('../lib/dept-manifest.json', import.meta.url), 'utf8'),
  );
  // 27 since the Webflow department landed (2026-09-06; 26 since Client
  // Review, 2026-08-31). An exact count, not a floor, on purpose: it catches a
  // HALF-synced manifest, which is the real failure mode here - the extension
  // and the plugin each vendor a copy.
  assert.equal(vendored.departments.length, 27);
  const datasets = vendored.departments.flatMap((d) => d.datasets);
  assert.ok(datasets.length >= 100, `expected 100+ datasets, got ${datasets.length}`);
  for (const ds of datasets) {
    assert.equal(typeof ds.tool, 'string');
    assert.ok(ds.tool.length > 0, `dataset ${ds.id} has no tool`);
    if (ds.scope) assert.ok(Array.isArray(ds.scope), `dataset ${ds.id} scope must be an array`);
  }
});

/* ── The account memory copy (plan A7) ─────────────────────────────────── */

const ACCOUNT_FILE = path.join('hiveku-data', 'account', 'ACCOUNT_MEMORY.md');

test('a department pull also writes the read-only account memory copy, linked to this account', async () => {
  const rootDir = await freshDir();
  toolCalls.length = 0;
  const result = await runPullData({ ...OPTS(rootDir), argv: ['crm'], accountId: ACCOUNT_ID });
  assert.equal(result.ok, true);
  const file = path.join(rootDir, ACCOUNT_FILE);
  const text = await fs.readFile(file, 'utf8');
  assert.match(text, /read-only copy of the account memory/);
  assert.match(text, new RegExp(`https://app\\.hiveku\\.com/${ACCOUNT_ID}/dashboard/memory`));
  assert.match(text, /Closed on Mondays from November to March\. \(suggested by Sales agent, 2026-09-23 15:30 UTC\)/);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o444);

  const status = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/STATUS.json'), 'utf8'));
  assert.equal(status.account_memory.read_only, true);
  assert.equal(status.account_memory.version, 7);
  assert.equal(status.account_memory.suggestions, 2);
  // It is not a department: nothing in the shared registry or per-department status.
  assert.equal(status.departments.account, undefined);
  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/manifest.json'), 'utf8'));
  assert.ok(!manifest.departments.some((d) => d.id === 'account'));
  assert.ok(!status.failed.some((f) => f.department === 'account'));

  // Never written back: no memory or account-memory write tool was called.
  const writes = toolCalls.filter((n) => /^account_memory_(?!get$)|^memory_(create|update|delete|bulk)/.test(n));
  assert.deepEqual(writes, []);
  assert.equal(toolCalls.filter((n) => n === 'account_memory_get').length, 1);
});

test('`pull account` refreshes only the account memory; an unknown name still fails', async () => {
  const rootDir = await freshDir();
  toolCalls.length = 0;
  const result = await runPullData({ ...OPTS(rootDir), argv: ['account'], accountId: ACCOUNT_ID });
  assert.equal(result.ok, true);
  await fs.access(path.join(rootDir, ACCOUNT_FILE));
  assert.deepEqual(toolCalls, ['account_memory_get'], 'no department dataset is fetched');
  await assert.rejects(fs.access(path.join(rootDir, 'hiveku-data/crm')));
  // Control: `account` is accepted by name only; the unknown-name guard is intact.
  await assert.rejects(() => runPullData({ ...OPTS(rootDir), argv: ['account', 'nope'] }), /Unknown department\(s\): nope/);
});

test('--dataset (a targeted refresh after a write) does not touch the account memory', async () => {
  const rootDir = await freshDir();
  toolCalls.length = 0;
  await runPullData({ ...OPTS(rootDir), argv: ['--dataset', 'crm:deals'], accountId: ACCOUNT_ID });
  assert.ok(toolCalls.includes('crm_list_deals'));
  assert.ok(!toolCalls.includes('account_memory_get'));
  await assert.rejects(fs.access(path.join(rootDir, ACCOUNT_FILE)));
});

test('a failed account memory read keeps the good copy, is recorded, and does not fail the department pull', async () => {
  const rootDir = await freshDir();
  await runPullData({ ...OPTS(rootDir), argv: ['crm'], accountId: ACCOUNT_ID });
  const file = path.join(rootDir, ACCOUNT_FILE);
  const good = await fs.readFile(file, 'utf8');

  accountMemoryMode.value = 'fail';
  try {
    const lines = [];
    const result = await runPullData({ ...OPTS(rootDir), argv: ['crm'], accountId: ACCOUNT_ID, log: (l) => lines.push(l) });
    assert.equal(result.ok, true, 'the department data still came down');
    assert.equal(await fs.readFile(file, 'utf8'), good, 'the good copy is untouched');
    assert.ok(lines.some((l) => /ACCOUNT_MEMORY\.md: ERROR .*kept previous copy/.test(l)), lines.join(' | '));
    const status = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/STATUS.json'), 'utf8'));
    assert.match(status.account_memory.error, /Unknown tool/);
    assert.equal(status.account_memory.kept_previous, true);
    assert.ok(status.failed.some((f) => f.department === 'account' && f.dataset === 'account-memory'));

    // A --dataset run does not read it, so it must not forget that failure either.
    await runPullData({ ...OPTS(rootDir), argv: ['--dataset', 'crm:deals'], accountId: ACCOUNT_ID });
    const kept = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/STATUS.json'), 'utf8'));
    assert.ok(kept.failed.some((f) => f.department === 'account'));

    // `pull account` alone, failing, is a failed run.
    const only = await runPullData({ ...OPTS(rootDir), argv: ['account'], accountId: ACCOUNT_ID });
    assert.equal(only.ok, false);
  } finally {
    accountMemoryMode.value = 'ok';
  }

  // The next good read clears the recorded failure.
  await runPullData({ ...OPTS(rootDir), argv: ['crm'], accountId: ACCOUNT_ID });
  const cleared = JSON.parse(await fs.readFile(path.join(rootDir, 'hiveku-data/STATUS.json'), 'utf8'));
  assert.ok(!cleared.failed.some((f) => f.department === 'account'));
  assert.equal(cleared.account_memory.error, undefined);
});

test('--list shows the account memory freshness; --stale refreshes it when old', async () => {
  const rootDir = await freshDir();
  let lines = [];
  await runPullData({ ...OPTS(rootDir), argv: ['--list'], log: (l) => lines.push(l) });
  assert.ok(lines.some((l) => /^\s+account\s+not downloaded \(account memory, read-only\)/.test(l)), lines.join(' | '));

  await runPullData({ ...OPTS(rootDir), argv: ['--default'], accountId: ACCOUNT_ID });
  lines = [];
  await runPullData({ ...OPTS(rootDir), argv: ['--list'], log: (l) => lines.push(l) });
  assert.ok(lines.some((l) => /^\s+account\s+fetched \d{4}-/.test(l)), lines.join(' | '));

  // Everything fresh: --stale does nothing, account memory included.
  toolCalls.length = 0;
  lines = [];
  await runPullData({ ...OPTS(rootDir), argv: ['--stale', '12'], log: (l) => lines.push(l) });
  assert.deepEqual(toolCalls, []);

  // Only the account memory is old: --stale refreshes it alone.
  const file = path.join(rootDir, ACCOUNT_FILE);
  const old = (await fs.readFile(file, 'utf8')).replace(/^fetched_at: "[^"]+"$/m, 'fetched_at: "2020-01-01T00:00:00.000Z"');
  await fs.chmod(file, 0o644);
  await fs.writeFile(file, old, 'utf8');
  toolCalls.length = 0;
  await runPullData({ ...OPTS(rootDir), argv: ['--stale', '12'], accountId: ACCOUNT_ID });
  assert.deepEqual(toolCalls, ['account_memory_get']);
});
