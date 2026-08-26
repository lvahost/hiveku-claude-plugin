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

test('the vendored manifest is real: 25 departments, 100+ datasets, every dataset names a tool', async () => {
  const { readFile } = await import('node:fs/promises');
  const vendored = JSON.parse(
    await readFile(new URL('../lib/dept-manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(vendored.departments.length, 25);
  const datasets = vendored.departments.flatMap((d) => d.datasets);
  assert.ok(datasets.length >= 100, `expected 100+ datasets, got ${datasets.length}`);
  for (const ds of datasets) {
    assert.equal(typeof ds.tool, 'string');
    assert.ok(ds.tool.length > 0, `dataset ${ds.id} has no tool`);
    if (ds.scope) assert.ok(Array.isArray(ds.scope), `dataset ${ds.id} scope must be an array`);
  }
});
