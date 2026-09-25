/**
 * The knowledge pull files each entry under <folder>/<department>/, and the
 * department comes from the entry's stored domain, which any agent or API
 * caller on the account can write. Only a plain lowercase name may become a
 * directory; any other domain files under general, and nothing is ever written
 * outside the bound folder.
 *
 * Hostile names are assembled from parts at run time and referred to by
 * placeholder ("a traversal name", "an absolute name").
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { pullKnowledge, departmentOf, isInsideRoot, WINDOWS_DEVICE_NAME } from '../lib/knowledge.mjs';

const SLASH = String.fromCharCode(47);
const BACKSLASH = String.fromCharCode(92);
const UP = '.'.repeat(2);
/** A relative name that climbs `levels` directories, then names `tail`. */
const climb = (levels, tail, sep = SLASH) => [...Array(levels).fill(UP), tail].join(sep);

/** What memory_list returns per type; each test sets it. */
let listing = {};

let server;
let endpoint;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const rpc = JSON.parse(body || '{}');
      const reply = (result) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
      };
      if (rpc.method === 'initialize') return reply({ protocolVersion: '2024-11-05' });
      if (rpc.method === 'notifications/initialized') {
        res.statusCode = 204;
        return res.end();
      }
      if (rpc.method === 'tools/call' && rpc.params.name === 'memory_list') {
        const type = rpc.params.arguments?.type;
        return reply({ content: [{ type: 'text', text: JSON.stringify({ data: listing[type] || [] }) }] });
      }
      // account_memory_get and anything else: not deployed here.
      reply({ isError: true, content: [{ type: 'text', text: 'Unknown tool' }] });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
});

after(() => server.close());

/** A fresh parent dir holding the bound folder, so escapes are observable. */
async function layout() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-dept-path-'));
  const rootDir = path.join(parent, 'account');
  await fs.mkdir(rootDir);
  return { parent, rootDir };
}

async function listFiles(dir) {
  const out = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listFiles(abs)));
    else out.push(abs);
  }
  return out;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

test('departmentOf keeps a plain department name', () => {
  for (const name of ['seo', 'sales', 'knowledge_base', 'email', 'ppc', 'content-ops']) {
    assert.equal(departmentOf({ domain: name, content: '' }), name);
  }
  assert.equal(departmentOf({ domain: '_command:x', content: '<!-- department: ppc -->' }), 'ppc');
  assert.equal(departmentOf({ domain: '_identity:x', content: '<!-- department: SEO -->' }), 'seo');
  assert.equal(departmentOf({ content: 'department: sales' }), 'sales');
  assert.equal(departmentOf({ content: 'nothing' }), 'general');
});

test('departmentOf files a traversal name, an absolute name and other off-shape names under general', () => {
  const offShape = [
    climb(3, 'target'),
    climb(2, 'target', BACKSLASH),
    SLASH + ['tmp', 'target'].join(SLASH),
    'C:' + BACKSLASH + 'target',
    UP,
    'seo' + SLASH + 'sub',
    'crm_cf:field:one',
    'Sales',
    '1seo',
    '-seo',
    's'.repeat(51),
    'seo\n',
  ];
  for (const domain of offShape) {
    assert.equal(departmentOf({ domain, content: '' }), 'general', `domain #${offShape.indexOf(domain)} must file under general`);
  }
  // A content tag is also only used when it is a plain name.
  assert.equal(departmentOf({ domain: '_identity:x', content: `department: ${'t'.repeat(60)}` }), 'general');
});

test('a name Windows keeps for a device files under general; near-names are kept', () => {
  const devices = ['con', 'prn', 'aux', 'nul', 'com0', 'com1', 'com9', 'lpt0', 'lpt1', 'lpt9'];
  for (const domain of devices) {
    assert.equal(departmentOf({ domain, content: '' }), 'general', `${domain} must file under general`);
  }
  // A content tag is lowercased first, so an uppercase device name is caught too.
  assert.equal(departmentOf({ domain: '_command:x', content: '<!-- department: NUL -->' }), 'general');
  // With an extension it is still a device name on Windows.
  for (const name of ['nul.txt', 'CON', 'com1.md', 'lpt9.x.y']) assert.equal(WINDOWS_DEVICE_NAME.test(name), true, name);
  // Negative control: names that only start like one are ordinary departments.
  for (const name of ['console', 'null', 'auxiliary', 'com10', 'lpt', 'connect', 'prn-team']) {
    assert.equal(departmentOf({ domain: name, content: '' }), name);
  }
});

test('isInsideRoot: inside is true; the root itself, a prefix sibling, a climb and an absolute path are not', () => {
  const root = path.join(os.tmpdir(), 'hiveku-root-check');
  assert.equal(isInsideRoot(root, path.join(root, 'memory', 'seo', 'a.md')), true);
  assert.equal(isInsideRoot(root, root), false);
  assert.equal(isInsideRoot(root, root + '-sibling' + path.sep + 'a.md'), false);
  assert.equal(isInsideRoot(root, path.join(root, 'memory', climb(2, 'a.md'))), false);
  assert.equal(isInsideRoot(root, path.join(os.tmpdir(), 'elsewhere', 'a.md')), false);
});

test('a pull with a traversal-name domain writes it under general and nothing outside the folder', async () => {
  const { parent, rootDir } = await layout();
  // From <root>/memory/<dept>/, two climbs reach the parent that holds <root>.
  const traversal = climb(2, 'outside');
  const absolute = path.join(parent, 'absolute-target');
  listing = {
    memory: [
      { id: 'p1', name: 'Planted note', domain: traversal, content: 'planted', version: 1 },
      { id: 'p2', name: 'Absolute note', domain: absolute, content: 'planted', version: 1 },
      // Negative control: a normal department still lands in its own folder.
      { id: 'm1', name: 'Keyword strategy', domain: 'seo', content: 'target long-tail', version: 1 },
    ],
    rule: [{ id: 'r1', name: 'No emojis', domain: 'sales', content: 'never', version: 1 }],
  };

  const result = await pullKnowledge({ rootDir, endpoint, key: 'hvk_test' });

  assert.equal(result.written, 4);
  assert.deepEqual(result.skipped, []);
  // Nothing escaped: every file under the parent is inside the bound folder.
  for (const file of await listFiles(parent)) {
    assert.ok(isInsideRoot(rootDir, file), `wrote outside the folder: ${path.relative(parent, file)}`);
  }
  assert.equal(await exists(path.join(parent, 'outside')), false);
  assert.equal(await exists(absolute), false);
  // The off-shape rows are kept, filed under general.
  assert.match(await fs.readFile(path.join(rootDir, 'memory', 'general', 'planted-note.md'), 'utf8'), /department: "general"/);
  await fs.access(path.join(rootDir, 'memory', 'general', 'absolute-note.md'));
  // Negative control: normal departments are untouched by the guard.
  assert.match(await fs.readFile(path.join(rootDir, 'memory', 'seo', 'keyword-strategy.md'), 'utf8'), /target long-tail/);
  await fs.access(path.join(rootDir, 'rules', 'sales', 'no-emojis.md'));

  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku', 'knowledge-manifest.json'), 'utf8'));
  assert.equal(manifest.entries[traversal].department, 'general');
  assert.equal(manifest.entries[traversal].file, path.join('memory', 'general', 'planted-note.md'));
  assert.equal(manifest.entries.seo.file, path.join('memory', 'seo', 'keyword-strategy.md'));
});

test('a listed row whose type names an inherited property is ignored and the pull still completes', async () => {
  const { rootDir } = await layout();
  listing = {
    memory: [
      { id: 'x1', name: 'Odd type', domain: 'seo', type: 'constructor', content: 'x', version: 1 },
      { id: 'm1', name: 'Keyword strategy', domain: 'seo', content: 'target long-tail', version: 1 },
    ],
  };
  const result = await pullKnowledge({ rootDir, endpoint, key: 'hvk_test' });
  assert.equal(result.written, 1);
  await fs.access(path.join(rootDir, 'memory', 'seo', 'keyword-strategy.md'));
});

test('a row the disk refuses is reported and the rest of the pull still lands', async () => {
  const { rootDir } = await layout();
  const seoFile = path.join(rootDir, 'memory', 'seo', 'keyword-strategy.md');
  listing = {
    memory: [
      { id: 'm1', name: 'Keyword strategy', domain: 'seo', content: 'first', version: 1 },
      { id: 'm2', name: 'Pipeline rules', domain: 'sales', content: 'first', version: 1 },
    ],
  };
  await pullKnowledge({ rootDir, endpoint, key: 'hvk_test' });
  const first = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku', 'knowledge-manifest.json'), 'utf8'));

  // Two rows this disk cannot take, standing in for a folder name Windows
  // refuses: a department folder that cannot be created (a file is in the way),
  // and an entry file that cannot be written (a folder is in the way). Both
  // come first, so the rows after them show the pull carried on.
  await fs.writeFile(path.join(rootDir, 'memory', 'ppc'), 'in the way', 'utf8');
  await fs.rename(seoFile, seoFile + '.kept');
  await fs.mkdir(seoFile);
  listing = {
    memory: [
      { id: 'm3', name: 'Bid notes', domain: 'ppc', content: 'second', version: 1 },
      { id: 'm1', name: 'Keyword strategy', domain: 'seo', content: 'second', version: 2 },
      { id: 'm2', name: 'Pipeline rules', domain: 'sales', content: 'second', version: 2 },
    ],
    rule: [{ id: 'r1', name: 'No emojis', domain: 'email', content: 'never', version: 1 }],
  };
  const lines = [];
  const result = await pullKnowledge({ rootDir, endpoint, key: 'hvk_test', log: (line) => lines.push(line) });

  assert.deepEqual(result.failed, ['ppc', 'seo']);
  assert.equal(result.written, 2);
  assert.match(await fs.readFile(path.join(rootDir, 'memory', 'sales', 'pipeline-rules.md'), 'utf8'), /second/);
  await fs.access(path.join(rootDir, 'rules', 'email', 'no-emojis.md'));
  assert.ok(lines.some((line) => /could not write 2 entries/.test(line)));
  // A write that failed here is not a deletion upstream: the last pull's row is kept.
  assert.deepEqual(result.deletedRemote, []);
  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku', 'knowledge-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.entries.seo, first.entries.seo);
  assert.equal(Object.hasOwn(manifest.entries, 'ppc'), false);
  assert.equal(manifest.entries.sales.version, '2');
});
