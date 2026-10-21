/**
 * HK-341 and HK-346 (2026-10-21): no stdout line above 8 MiB, and hiveku_batch
 * with output "file" (lib/answer-files.mjs, lib/data-file.mjs, lib/shim.mjs).
 *
 * The shim runs for real (runShim over in-memory stdio, as in
 * test/source-of-truth-doctrine.test.mjs) against a fake Hiveku MCP server
 * behind globalThis.fetch: the key is a placeholder, every request stops in
 * the fake, and nothing reaches the network.
 *
 * Pinned:
 *   1. An answer over the ceiling is saved whole to hiveku-data/.spill/, the
 *      file holds exactly the text the server sent, the summary keeps the
 *      small fields and gives lists as lengths, and the line written is under
 *      the ceiling.
 *   2. The ceiling is exact: a line of 8 MiB is written untouched, one byte
 *      more is saved to a file.
 *   3. A file that cannot be written gives the isError with the size and the
 *      paging arguments, and nothing is written through a symlink.
 *   4. No tool name reaches the file system as a path.
 *   5. hiveku_batch with output "file": `output` is taken out and
 *      max_bytes_per_result is 32768 in what is forwarded (the caller's own
 *      cap is kept), the file holds the answer, and the counts and trimmed
 *      labels are right.
 *   6. The safety hooks still judge the call: the PreToolUse hook decides an
 *      output "file" batch exactly as the same batch without it, and the
 *      PostToolUse ledger still records its members' writes.
 *   7. Without a folder that can take the file, the call is refused and
 *      nothing is forwarded.
 *   8. tools/list shows the option on hiveku_batch; the server's own text wins
 *      when it declares one.
 *   9. git ignores what the writer saves, through the .gitignore setup writes
 *      and through the writer's own.
 *
 * Run: node --test test/answer-files.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runShim } from '../lib/shim.mjs';
import { writeBinding } from '../lib/binding.mjs';
import { runSetup } from '../lib/setup.mjs';
import {
  BATCH_FILE_PAYLOAD_BUDGET,
  BATCH_OUTPUT_PROPERTY,
  MAX_STDOUT_LINE_BYTES,
  batchForwardMessage,
  fileModeCap,
  guardedLine,
  isBatchFileCall,
  pagingFor,
  serializeLine,
  summarizeAnswer,
  withBatchOutputOption,
} from '../lib/answer-files.mjs';
import {
  BATCH_DIR,
  DATA_DIR,
  DataFileError,
  SPILL_DIR,
  fileStamp,
  safeNamePart,
  writeDataFile,
} from '../lib/data-file.mjs';
import { classifyHookPayload } from '../lib/vcs-ledger.mjs';
import { probeIsStale, updateCheckPath } from '../lib/update-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIB = 1024 * 1024;
const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const PROJECT = '6d676101-0000-4000-8000-00000000000a';
const PFX = 'mcp__plugin_hiveku_hk__';
const STAMP_RE = /\d{8}T\d{9}Z(-\d+)?-[0-9a-f]{6}/;

/* ── harness ─────────────────────────────────────────────────────────────── */

/** A bound account folder and a credentials store holding a placeholder key for it. */
async function boundFolder() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-answer-files-'));
  const project = path.join(tmp, 'acct');
  const dataDir = path.join(tmp, 'data');
  await fsp.mkdir(dataDir, { recursive: true });
  await writeBinding(project, { accountId: ACCOUNT, label: 'Acme', keyPreview: 'hvk_test' });
  await fsp.writeFile(
    path.join(dataDir, 'credentials.json'),
    JSON.stringify({
      version: 1,
      accounts: { [ACCOUNT]: { key: 'hvk_test_placeholder', label: 'Acme', key_preview: 'hvk_test', scope: 'full' } },
    }),
  );
  return { tmp, project, dataDir, cleanup: () => fsp.rm(tmp, { recursive: true, force: true }) };
}

const jsonResponse = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * A fake Hiveku MCP server behind globalThis.fetch. It answers the handshake,
 * records every message it is sent, and answers tools/call and tools/list
 * with the handlers given (each returns the JSON-RPC `result`).
 */
function fakeUpstream(handlers) {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const message = JSON.parse(init.body);
    seen.push(message);
    if (message.method === 'initialize') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: message.id,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake-hiveku', version: '0' } },
      });
    }
    if (message.method === 'notifications/initialized') return new Response(null, { status: 204 });
    const handler = handlers[message.method];
    if (!handler) throw new Error(`the fake has no handler for ${message.method}`);
    return jsonResponse({ jsonrpc: '2.0', id: message.id, result: await handler(message) });
  };
  return {
    seen,
    toolCalls: () => seen.filter((m) => m.method === 'tools/call'),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

async function waitFor(predicate, what, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * One shim process over in-memory stdio. `send(message)` writes a request,
 * `answer(id)` waits for its response line, `close()` ends stdin. Every line
 * the shim writes is kept raw (newline included) in `lines`.
 */
function startShim({ project, dataDir }) {
  const stdin = new PassThrough();
  const lines = [];
  let buffer = '';
  const stdout = new Writable({
    write(chunk, _encoding, done) {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, nl + 1);
        buffer = buffer.slice(nl + 1);
        lines.push({ raw, msg: JSON.parse(raw) });
      }
      done();
    },
  });
  const finished = runShim({ projectDir: project, dataDir, stdin, stdout });
  return {
    lines,
    send: (message) => stdin.write(JSON.stringify(message) + '\n'),
    async answer(id) {
      await waitFor(() => lines.some((l) => l.msg.id === id), `the answer to id ${id}`);
      return lines.find((l) => l.msg.id === id);
    },
    async close() {
      stdin.end();
      await finished;
    },
  };
}

const callMsg = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

/** One tools/call through a fresh shim: returns the raw answer line and every line written. */
async function callOnce(session, id, name, args) {
  const shim = startShim(session);
  try {
    shim.send(callMsg(id, name, args));
    const answer = await shim.answer(id);
    return { answer, lines: shim.lines };
  } finally {
    await shim.close();
  }
}

const bodyOf = (answer) => JSON.parse(answer.msg.result.content[0].text);

function assertEveryLineUnderCeiling(lines) {
  for (const l of lines) {
    assert.ok(Buffer.byteLength(l.raw, 'utf8') <= MAX_STDOUT_LINE_BYTES, `a ${Buffer.byteLength(l.raw)} byte line was written`);
  }
}

/** Every path under `dir`, relative, sorted. */
async function tree(dir) {
  const out = [];
  async function walk(d) {
    for (const entry of await fsp.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      out.push(path.relative(dir, full));
      if (entry.isDirectory()) await walk(full);
    }
  }
  await walk(dir);
  return out.sort();
}

/* ── 1-4: HK-341, answers over the ceiling ──────────────────────────────── */

test('the ceiling is 8 MiB, counted on the serialized line', () => {
  assert.equal(MAX_STDOUT_LINE_BYTES, 8 * 1024 * 1024);
  assert.equal(serializeLine({ a: 'é' }), '{"a":"é"}\n');
});

test('an answer over 8 MiB is saved whole to hiveku-data/.spill and the chat gets its summary', async () => {
  const session = await boundFolder();
  const files = Array.from({ length: 300 }, (_, i) => ({
    path: `src/f${i}.ts`,
    content: `${'x'.repeat(30_000)} "quoted" \\ back\n`,
    encoding: 'utf-8',
  }));
  const text = JSON.stringify({
    data: {
      project_id: PROJECT,
      files,
      count: files.length,
      partial: true,
      next_cursor: 'src/f299.ts',
      hint: 'h'.repeat(400),
      limits: { max_file_bytes: 1_048_576, max_total_bytes: 52_428_800 },
    },
  });
  assert.ok(text.length > MAX_STDOUT_LINE_BYTES, 'the fixture must be over the ceiling');
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text }] }) });
  try {
    const args = { project_id: PROJECT, max_total_bytes: 52_428_800 };
    const { answer, lines } = await callOnce(session, 2, 'project_files_bulk_get', args);
    assertEveryLineUnderCeiling(lines);
    assert.equal(answer.msg.result.isError, undefined);
    const body = bodyOf(answer);
    assert.equal(body.tool, 'project_files_bulk_get');
    assert.equal(body.bytes, Buffer.byteLength(text, 'utf8'));
    assert.equal(path.dirname(body.saved_to), path.join(session.project, DATA_DIR, SPILL_DIR));
    assert.match(path.basename(body.saved_to), new RegExp(`^project_files_bulk_get-${STAMP_RE.source}\\.json$`));
    assert.equal(await fsp.readFile(body.saved_to, 'utf8'), text, 'the file is the answer, byte for byte');
    assert.deepEqual(body.summary, {
      data: {
        project_id: PROJECT,
        files: { array_length: 300 },
        count: 300,
        partial: true,
        next_cursor: 'src/f299.ts',
        hint: { string_length: 400 },
        limits: { max_file_bytes: 1_048_576, max_total_bytes: 52_428_800 },
      },
    });
    assert.match(body.note, /next_cursor/);
    assert.match(body.note, /project_files_status/);
    assert.match(body.note, /project_files_snapshot/);
    // Not a batch: the call went upstream exactly as it was made.
    assert.deepEqual(up.toolCalls()[0].params, { name: 'project_files_bulk_get', arguments: args });
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('the ceiling is exact: a line of 8 MiB is written untouched, one byte more is saved to a file', async () => {
  const session = await boundFolder();
  const id = 3;
  const answerWith = (n) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'a'.repeat(n) }] } });
  const overhead = Buffer.byteLength(serializeLine(answerWith(0)), 'utf8');
  const atCeiling = MAX_STDOUT_LINE_BYTES - overhead;
  let size = atCeiling;
  const up = fakeUpstream({ 'tools/call': () => answerWith(size).result });
  try {
    const under = await callOnce(session, id, 'project_files_list', { project_id: PROJECT });
    assert.equal(Buffer.byteLength(under.answer.raw, 'utf8'), MAX_STDOUT_LINE_BYTES);
    assert.equal(under.answer.raw, serializeLine(answerWith(atCeiling)), 'written exactly as it came');
    assert.equal(fs.existsSync(path.join(session.project, DATA_DIR)), false, 'nothing is saved under the ceiling');

    size = atCeiling + 1;
    const over = await callOnce(session, id, 'project_files_list', { project_id: PROJECT });
    assertEveryLineUnderCeiling(over.lines);
    const body = bodyOf(over.answer);
    assert.equal(body.bytes, atCeiling + 1);
    assert.equal(await fsp.readFile(body.saved_to, 'utf8'), 'a'.repeat(atCeiling + 1));
    assert.deepEqual(body.summary, { not_json: true });
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('a file that cannot be written gives the isError with the size and the paging arguments', async () => {
  const session = await boundFolder();
  const text = JSON.stringify({ data: { files: [{ path: 'public/hero.png', content: 'z'.repeat(MAX_STDOUT_LINE_BYTES + 10) }], partial: true, next_cursor: 'public/hero.png' } });
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text }] }) });
  try {
    // hiveku-data is a symbolic link out of the folder: never written through.
    const outside = path.join(session.tmp, 'outside');
    await fsp.mkdir(outside);
    await fsp.symlink(outside, path.join(session.project, DATA_DIR));
    const linked = await callOnce(session, 4, 'project_files_bulk_get', {
      project_id: PROJECT, max_total_bytes: 52_428_800, cursor: 'public/a.png',
    });
    assertEveryLineUnderCeiling(linked.lines);
    assert.equal(linked.answer.msg.result.isError, true);
    const body = bodyOf(linked.answer);
    assert.equal(body.code, 'response_too_large_for_client');
    assert.equal(body.bytes, Buffer.byteLength(text, 'utf8'));
    assert.equal(body.ceiling_bytes, MAX_STDOUT_LINE_BYTES);
    assert.equal(body.tool, 'project_files_bulk_get');
    // The page that was too big never arrived: the SAME cursor again, a smaller page.
    assert.deepEqual(body.paging, { max_total_bytes: 4 * MIB, cursor: 'public/a.png' });
    assert.equal(body.file_error, 'symlink');
    assert.match(body.error, /Hiveku ran the call/);
    assert.deepEqual(await fsp.readdir(outside), [], 'nothing was written through the link');

    // hiveku-data is a file, and this was the first page: no cursor to send.
    await fsp.unlink(path.join(session.project, DATA_DIR));
    await fsp.writeFile(path.join(session.project, DATA_DIR), 'not a folder');
    const blocked = await callOnce(session, 5, 'project_files_bulk_get', { project_id: PROJECT });
    const second = bodyOf(blocked.answer);
    assert.equal(blocked.answer.msg.result.isError, true);
    assert.equal(second.file_error, 'not_a_directory');
    assert.deepEqual(second.paging, { max_total_bytes: 4 * MIB, cursor: null });
    assert.equal(await fsp.readFile(path.join(session.project, DATA_DIR), 'utf8'), 'not a folder');
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('no tool name reaches the file system as a path', async () => {
  const session = await boundFolder();
  const text = 'b'.repeat(MAX_STDOUT_LINE_BYTES + 1);
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text }] }) });
  const hostile = [
    '../../../outside',
    '/etc/passwd',
    '..',
    '.',
    'a/../../b',
    'C:\\Windows\\win.ini',
    '\u0000nul',
    '-rf',
    '..%2f..%2fx',
    '',
    'x'.repeat(500),
  ];
  try {
    let id = 100;
    for (const name of hostile) {
      const { answer, lines } = await callOnce(session, id, name, {});
      id += 1;
      assertEveryLineUnderCeiling(lines);
      const body = bodyOf(answer);
      assert.equal(path.dirname(body.saved_to), path.join(session.project, DATA_DIR, SPILL_DIR), JSON.stringify(name));
      assert.match(path.basename(body.saved_to), new RegExp(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}-${STAMP_RE.source}\\.json$`), JSON.stringify(name));
      assert.ok(!body.tool.includes('/') && !body.tool.includes('.') && !body.tool.startsWith('-'), JSON.stringify(name));
    }
    // Nothing anywhere else: the session folder holds the two fixtures and the spill files only.
    const all = await tree(session.tmp);
    const outsideSpill = all.filter((p) => !p.startsWith(path.join('acct', DATA_DIR, SPILL_DIR) + path.sep));
    assert.deepEqual(outsideSpill, [
      'acct',
      path.join('acct', '.hiveku'),
      path.join('acct', '.hiveku', 'account.json'),
      path.join('acct', DATA_DIR),
      path.join('acct', DATA_DIR, SPILL_DIR),
      'data',
      path.join('data', 'credentials.json'),
    ]);
    const spilled = await fsp.readdir(path.join(session.project, DATA_DIR, SPILL_DIR));
    assert.equal(spilled.filter((f) => f.endsWith('.json')).length, hostile.length);
    assert.ok(spilled.includes('.gitignore'));
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('safeNamePart keeps a tool name and turns anything else into a plain name part', () => {
  assert.equal(safeNamePart('project_files_bulk_get'), 'project_files_bulk_get');
  assert.equal(safeNamePart('0f3c2a9e-1111-4222-8333-444455556666'), '0f3c2a9e-1111-4222-8333-444455556666');
  assert.equal(safeNamePart('../../etc/passwd'), 'etc_passwd');
  assert.equal(safeNamePart('/'), 'item');
  assert.equal(safeNamePart('..', { fallback: 'tool' }), 'tool');
  assert.equal(safeNamePart('-rf'), 'rf');
  assert.equal(safeNamePart('a'.repeat(100)).length, 64);
  assert.equal(safeNamePart({ toString: () => '../x' }), 'item', 'only strings and numbers are read');
  for (const raw of ['a/b', 'a\\b', 'a.b', 'a\u0000b', 'a b', 'ä']) {
    assert.match(safeNamePart(raw), /^[A-Za-z0-9][A-Za-z0-9_-]*$/, JSON.stringify(raw));
  }
});

test('the writer refuses names and folders it does not own, before touching the disk', async () => {
  const session = await boundFolder();
  try {
    const attempts = [
      { subdir: SPILL_DIR, fileName: '../escape.json' },
      { subdir: SPILL_DIR, fileName: '.hidden.json' },
      { subdir: SPILL_DIR, fileName: 'a/b.json' },
      { subdir: SPILL_DIR, fileName: 'no-suffix' },
      { subdir: '..', fileName: 'x.json' },
      { subdir: '../..', fileName: 'x.json' },
      { subdir: 'other', fileName: 'x.json' },
    ];
    for (const a of attempts) {
      await assert.rejects(
        writeDataFile({ rootDir: session.project, text: '{}', ...a }),
        (err) => err instanceof DataFileError && err.code === 'bad_name',
        JSON.stringify(a),
      );
    }
    await assert.rejects(
      writeDataFile({ rootDir: 'relative/path', subdir: SPILL_DIR, fileName: 'x.json', text: '{}' }),
      (err) => err instanceof DataFileError && err.code === 'no_bound_folder',
    );
    assert.equal(fs.existsSync(path.join(session.project, DATA_DIR)), false);
    // A symlinked folder under hiveku-data is refused too, and its target stays empty.
    const outside = path.join(session.tmp, 'elsewhere');
    await fsp.mkdir(outside);
    await fsp.mkdir(path.join(session.project, DATA_DIR));
    await fsp.symlink(outside, path.join(session.project, DATA_DIR, SPILL_DIR));
    await assert.rejects(
      writeDataFile({ rootDir: session.project, subdir: SPILL_DIR, fileName: 'x.json', text: '{}' }),
      (err) => err instanceof DataFileError && err.code === 'symlink',
    );
    assert.deepEqual(await fsp.readdir(outside), []);
  } finally {
    await session.cleanup();
  }
});

test('the writer is atomic: it replaces a file whole and leaves no temporary file', async () => {
  const session = await boundFolder();
  try {
    const first = await writeDataFile({ rootDir: session.project, subdir: BATCH_DIR, fileName: 'b1.json', text: '{"v":1}' });
    const second = await writeDataFile({ rootDir: session.project, subdir: BATCH_DIR, fileName: 'b1.json', text: '{"v":2}' });
    assert.equal(first.path, second.path);
    assert.equal(second.relPath, `${DATA_DIR}/${BATCH_DIR}/b1.json`);
    assert.equal(await fsp.readFile(second.path, 'utf8'), '{"v":2}');
    assert.deepEqual((await fsp.readdir(path.dirname(second.path))).sort(), ['.gitignore', 'b1.json']);
    assert.equal(fs.statSync(second.path).mode & 0o777, 0o600);
    // A symlink planted at the file's name is replaced, not followed.
    const target = path.join(session.tmp, 'victim.txt');
    await fsp.writeFile(target, 'untouched');
    await fsp.symlink(target, path.join(path.dirname(second.path), 'b2.json'));
    await writeDataFile({ rootDir: session.project, subdir: BATCH_DIR, fileName: 'b2.json', text: '{"v":3}' });
    assert.equal(await fsp.readFile(target, 'utf8'), 'untouched');
    assert.equal(fs.lstatSync(path.join(path.dirname(second.path), 'b2.json')).isSymbolicLink(), false);
  } finally {
    await session.cleanup();
  }
});

test('fileStamp is a compact UTC timestamp', () => {
  assert.equal(fileStamp(new Date('2026-10-21T12:00:00.123Z')), '20261021T120000123Z');
});

test('the summary keeps small fields, gives lists as lengths, and stays small', () => {
  assert.deepEqual(summarizeAnswer([1, 2, 3]), { array_length: 3 });
  assert.deepEqual(summarizeAnswer({ a: 'x'.repeat(301), b: null, c: false, d: { e: { f: { g: 1 } } } }), {
    a: { string_length: 301 },
    b: null,
    c: false,
    d: { e: { f: { object_keys: 1 } } },
  });
  const wide = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, { inner: 'y'.repeat(290) }]));
  const summary = summarizeAnswer(wide);
  assert.ok(Buffer.byteLength(JSON.stringify(summary), 'utf8') <= 16 * 1024);
  assert.equal(summary.more_keys, 160);
  // A key JSON.parse makes an own __proto__ is summarized like any other.
  assert.equal(JSON.stringify(summarizeAnswer(JSON.parse('{"__proto__":[1,2],"a":1}'))), '{"__proto__":{"array_length":2},"a":1}');
  // Keys too long to summarize at any depth: the summary says so instead.
  const longKeys = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`${i}${'k'.repeat(5000)}`, 1]));
  assert.deepEqual(Object.keys(summarizeAnswer(longKeys)), ['summary_omitted']);
});

test('pagingFor: bulk_get asks for the same page smaller; other tools get their paging arguments and _max_bytes', () => {
  assert.deepEqual(pagingFor('project_files_bulk_get', {}, null), { max_total_bytes: 4 * MIB, cursor: null });
  assert.deepEqual(pagingFor('project_files_bulk_get', { max_total_bytes: 100 * 1024, cursor: 'src/a.ts' }, null), {
    max_total_bytes: 64 * 1024,
    cursor: 'src/a.ts',
  });
  assert.deepEqual(
    pagingFor('crm_list_contacts', { limit: 500, query: 'x' }, { cursor: {}, limit: {}, query: {} }),
    { cursor: null, limit: 500, _max_bytes: MIB },
  );
  assert.deepEqual(pagingFor('crm_list_contacts', {}, () => ({ page: {}, page_size: {} })), { page: null, page_size: null, _max_bytes: MIB });
  assert.deepEqual(pagingFor('project_vcs_checkout', { project_id: PROJECT }, null), { _max_bytes: MIB });
});

test('another tool over the ceiling with no file: its paging arguments come from its schema in tools/list', async () => {
  const session = await boundFolder();
  const contacts = {
    name: 'crm_list_contacts',
    description: 'List contacts.',
    inputSchema: { type: 'object', properties: { cursor: { type: 'string' }, limit: { type: 'number' }, query: { type: 'string' } } },
  };
  const up = fakeUpstream({
    'tools/list': () => ({ tools: [contacts] }),
    'tools/call': () => ({ content: [{ type: 'text', text: JSON.stringify({ data: { contacts: ['c'.repeat(MAX_STDOUT_LINE_BYTES)] } }) }] }),
  });
  try {
    await fsp.writeFile(path.join(session.project, DATA_DIR), 'not a folder');
    const shim = startShim(session);
    try {
      shim.send({ jsonrpc: '2.0', id: 50, method: 'tools/list', params: {} });
      await shim.answer(50);
      shim.send(callMsg(51, 'crm_list_contacts', { limit: 500, query: 'acme' }));
      const answer = await shim.answer(51);
      assertEveryLineUnderCeiling(shim.lines);
      assert.equal(answer.msg.result.isError, true);
      const body = bodyOf(answer);
      assert.equal(body.code, 'response_too_large_for_client');
      assert.deepEqual(body.paging, { cursor: null, limit: 500, _max_bytes: MIB });
      assert.match(body.error, /_fields/);
    } finally {
      await shim.close();
    }
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('guardedLine: any other message over the ceiling becomes an error, a notification is not written', () => {
  const big = 'c'.repeat(MAX_STDOUT_LINE_BYTES);
  const error = JSON.parse(guardedLine({ jsonrpc: '2.0', id: 9, result: { tools: [{ name: big }] } }));
  assert.equal(error.id, 9);
  assert.equal(error.error.data.code, 'response_too_large_for_client');
  assert.ok(error.error.data.bytes > MAX_STDOUT_LINE_BYTES);
  assert.equal(guardedLine({ jsonrpc: '2.0', method: 'notifications/message', params: { big } }), '');
  assert.equal(guardedLine({ jsonrpc: '2.0', id: 1, result: {} }), '{"jsonrpc":"2.0","id":1,"result":{}}\n');
});

/* ── 5-8: HK-346, hiveku_batch with output "file" ────────────────────────── */

const BATCH_ID = '0f3c2a9e-1111-4222-8333-444455556666';

function batchEnvelope(overrides = {}) {
  return {
    batch_id: BATCH_ID,
    count: 5,
    ok_count: 4,
    failed_count: 1,
    stopped_early: false,
    executed_in: 'sequential',
    results: [
      { label: 'plain', ok: true, status: 200, bytes: 50, duration_ms: 5, result: { data: { id: 1 }, _shaped: { max_bytes: { applied: false, reason: 'already_within_budget' } } } },
      { label: 'cut', ok: true, status: 200, bytes: 90_000, duration_ms: 5, result: { data: [1], _shaped: { max_bytes: { applied: 'array_trim', returned: 1, omitted: 9 } } } },
      { label: 'own-cap', ok: true, status: 200, bytes: 40_000, duration_ms: 5, result: { data: [2], _shaped: { max_bytes: { applied: false }, previous: { max_bytes: { applied: 'preview', truncated: true } } } } },
      { label: 'dropped', ok: true, status: 200, bytes: 70_000, duration_ms: 5, result: null, dropped: { reason: 'batch_response_budget', full_bytes: 70_000, hint: 'Re-run this label on its own.' } },
      { label: 'failed', ok: false, status: 404, bytes: 30, duration_ms: 5, error: { code: 'upstream_error', message: 'Not found' }, result: { error: 'Not found' } },
    ],
    ...overrides,
  };
}

const BATCH_CALLS = [
  { label: 'plain', tool: 'project_get', args: { project_id: PROJECT } },
  { label: 'cut', tool: 'project_files_list', args: { project_id: PROJECT } },
  { label: 'own-cap', tool: 'project_version_log', args: { project_id: PROJECT, _max_bytes: 1024 } },
  { label: 'dropped', tool: 'project_files_list', args: { project_id: PROJECT, branch: 'feature/x' } },
  { label: 'failed', tool: 'project_get', args: { project_id: '6d676101-0000-4000-8000-0000000000ff' } },
];

test('output "file": output is taken out, the cap is sized to the batch, the file holds the answer, the counts are right', async () => {
  const session = await boundFolder();
  const text = JSON.stringify(batchEnvelope());
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text }] }) });
  try {
    const { answer, lines } = await callOnce(session, 20, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' });
    assertEveryLineUnderCeiling(lines);
    const [forwarded] = up.toolCalls();
    assert.equal(forwarded.params.name, 'hiveku_batch');
    assert.equal(forwarded.id, 20);
    // Five calls share the batch's payload budget: 20,000 each, never the 32,768 that let the batch drop results.
    assert.deepEqual(forwarded.params.arguments, { calls: BATCH_CALLS, max_bytes_per_result: 20_000 });
    assert.equal(fileModeCap(BATCH_CALLS), 20_000);

    assert.equal(answer.msg.result.isError, undefined);
    const body = bodyOf(answer);
    assert.equal(body.saved_to, path.join(session.project, DATA_DIR, BATCH_DIR, `${BATCH_ID}.json`));
    assert.equal(await fsp.readFile(body.saved_to, 'utf8'), text, 'the file is the answer, byte for byte');
    assert.equal(body.batch_id, BATCH_ID);
    assert.equal(body.count, 5);
    assert.equal(body.ok_count, 4);
    assert.equal(body.failed_count, 1);
    assert.deepEqual(body.trimmed, ['cut', 'own-cap']);
    // A dropped member already ran: it is listed apart, with its ok and status, and never as one to send again.
    assert.deepEqual(body.dropped, [{ label: 'dropped', ok: true, status: 200 }]);
    assert.match(body.note, /each one already ran/);
    assert.match(body.note, /never send a dropped write again/);
    assert.equal('results' in body, false, 'no result comes back into the chat');
    assert.equal('incomplete' in body, false);
    assert.ok(Buffer.byteLength(answer.raw) < 4096, 'the chat gets a few hundred bytes');
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('output "file": a cap the caller set is kept, and a batch with no batch_id is named by time', async () => {
  const session = await boundFolder();
  const envelope = batchEnvelope({ batch_id: undefined, incomplete: { not_started: 1, read_cancelled: 0, still_running: 1 }, stopped_early: true });
  const text = JSON.stringify(envelope);
  const up = fakeUpstream({ 'tools/call': () => ({ isError: true, content: [{ type: 'text', text }] }) });
  try {
    const { answer } = await callOnce(session, 21, 'hiveku_batch', {
      calls: BATCH_CALLS, output: 'file', max_bytes_per_result: 4096, stop_on_error: true,
    });
    assert.deepEqual(up.toolCalls()[0].params.arguments, { calls: BATCH_CALLS, max_bytes_per_result: 4096, stop_on_error: true });
    assert.equal(answer.msg.result.isError, true, 'a batch that stopped early still says so');
    const body = bodyOf(answer);
    assert.match(path.basename(body.saved_to), new RegExp(`^${STAMP_RE.source}\\.json$`));
    assert.equal(await fsp.readFile(body.saved_to, 'utf8'), text);
    assert.equal(body.batch_id, null);
    assert.equal(body.stopped_early, true);
    assert.deepEqual(body.incomplete, { not_started: 1, read_cancelled: 0, still_running: 1 });
    assert.match(body.note, /batch_member_running/);
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('output "file": a batch refused before it ran comes back as it came, and nothing is saved', async () => {
  const session = await boundFolder();
  const refusal = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'Over 25 calls. Nothing was executed.', code: 'batch_invalid' }) }] };
  const up = fakeUpstream({ 'tools/call': () => refusal });
  try {
    const { answer } = await callOnce(session, 22, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' });
    assert.deepEqual(answer.msg.result, refusal);
    assert.deepEqual(await fsp.readdir(path.join(session.project, DATA_DIR, BATCH_DIR)), ['.gitignore']);
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('the batch id from an answer is sanitized before it names a file', async () => {
  const session = await boundFolder();
  const text = JSON.stringify(batchEnvelope({ batch_id: '../../../../outside/x' }));
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text }] }) });
  try {
    const { answer } = await callOnce(session, 23, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' });
    const body = bodyOf(answer);
    assert.equal(body.saved_to, path.join(session.project, DATA_DIR, BATCH_DIR, 'outside_x.json'));
    assert.equal(await fsp.readFile(body.saved_to, 'utf8'), text);
    assert.equal(fs.existsSync(path.join(session.tmp, 'outside')), false);
  } finally {
    up.restore();
    await session.cleanup();
  }
});

test('only output exactly "file" is taken over; anything else goes upstream as it was sent', async () => {
  for (const output of [undefined, 'inline', 'File', 'files', true]) {
    const args = { calls: BATCH_CALLS, ...(output === undefined ? {} : { output }) };
    assert.equal(isBatchFileCall(callMsg(1, 'hiveku_batch', args)), false, String(output));
  }
  assert.equal(isBatchFileCall(callMsg(1, 'project_get', { output: 'file' })), false, 'only hiveku_batch');
  assert.equal(isBatchFileCall(callMsg(1, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' })), true);
  for (const [cap, sent] of [[undefined, 32_768], [null, 32_768], ['', 32_768], ['abc', 32_768], [0, 32_768], [-5, 32_768], [512, 512], ['1024', '1024']]) {
    const forwarded = batchForwardMessage(callMsg(1, 'hiveku_batch', { calls: [], output: 'file', max_bytes_per_result: cap }));
    assert.equal(forwarded.params.arguments.max_bytes_per_result, sent, `cap ${JSON.stringify(cap)}`);
    assert.equal('output' in forwarded.params.arguments, false);
  }

  const session = await boundFolder();
  const text = JSON.stringify(batchEnvelope());
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text }] }) });
  try {
    const { answer } = await callOnce(session, 24, 'hiveku_batch', { calls: BATCH_CALLS, output: 'inline' });
    assert.deepEqual(up.toolCalls()[0].params.arguments, { calls: BATCH_CALLS, output: 'inline' });
    assert.equal(answer.msg.result.content[0].text, text, 'an inline batch answer is untouched');
    assert.equal(fs.existsSync(path.join(session.project, DATA_DIR)), false);
  } finally {
    up.restore();
    await session.cleanup();
  }
});

/** The real PreToolUse hook, as hooks/hooks.json runs it, with a fresh update stamp so it spawns no probe. */
function preToolUse(toolInput, cwd) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-answer-hook-'));
  try {
    fs.writeFileSync(updateCheckPath(dataDir), JSON.stringify({ checked_at: new Date().toISOString() }));
    assert.equal(probeIsStale(dataDir), false, 'the update probe would spawn; the fixture is wrong');
    const env = { ...process.env, HIVEKU_PLUGIN_DATA: dataDir };
    delete env.CLAUDE_PLUGIN_ROOT;
    delete env.CLAUDE_PLUGIN_DATA;
    const run = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'hiveku'), 'hook', 'pre-tool-use'], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: `${PFX}hiveku_batch`, tool_input: toolInput, cwd }),
      encoding: 'utf8',
      env,
      timeout: 20_000,
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim() ? JSON.parse(run.stdout).hookSpecificOutput.permissionDecision : null;
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('the PreToolUse hook judges an output "file" batch exactly as the same batch without it', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-answer-guard-'));
  try {
    const open = path.join(tmp, 'open');
    const ceilinged = path.join(tmp, 'ceilinged');
    await fsp.mkdir(open);
    await fsp.mkdir(path.join(ceilinged, '.hiveku'), { recursive: true });
    await fsp.writeFile(
      path.join(ceilinged, '.hiveku', 'guardrails.json'),
      JSON.stringify({ version: 1, mode: 'full', deny_tools: ['project_file_save'] }),
    );
    const reads = [{ tool: 'project_get', args: { project_id: PROJECT } }, { tool: 'list_projects', args: {} }];
    const write = [{ tool: 'project_file_save', args: { project_id: PROJECT, file_path: 'src/a.ts', content: 'x' } }];
    const cases = [
      { calls: reads, cwd: open, expected: 'allow' },
      { calls: write, cwd: open, expected: 'ask' },
      { calls: write, cwd: ceilinged, expected: 'deny' },
    ];
    for (const c of cases) {
      const plain = preToolUse({ calls: c.calls }, c.cwd);
      const asFile = preToolUse({ calls: c.calls, output: 'file' }, c.cwd);
      assert.equal(plain, c.expected, `fixture: ${c.expected}`);
      assert.equal(asFile, plain, `output "file" must not change the decision (${c.expected})`);
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('the PostToolUse ledger still records the writes of an output "file" batch', () => {
  const B = '6d676101-0000-4000-8000-00000000000b';
  const input = {
    output: 'file',
    calls: [
      { tool: 'project_files_bulk_save', args: { project_id: PROJECT, branch: 'feature/x', files: [] } },
      { tool: 'project_file_save', args: { project_id: B, file_path: 'a', content: 'x' } },
      { tool: 'project_get', args: { project_id: PROJECT } },
    ],
  };
  const kinds = (lines) => lines.map((l) => `${l.kind}:${l.project_id}:${l.branch}`);
  const summary = [{ type: 'text', text: JSON.stringify({ saved_to: '/x/hiveku-data/batches/b.json', batch_id: 'b', count: 3, ok_count: 3, failed_count: 0, trimmed: [] }) }];
  const post = { hook_event_name: 'PostToolUse', session_id: 's1', tool_name: `${PFX}hiveku_batch`, tool_input: input, tool_response: summary };
  assert.deepEqual(kinds(classifyHookPayload(post)), [`write:${PROJECT}:feature/x`, `write:${B}:main`]);

  // A refused output "file" call ran nothing and names no file: nothing is recorded.
  const refused = JSON.stringify({ error: 'output "file" ... Nothing was sent to Hiveku and nothing ran.', code: 'output_file_unavailable', reason: 'no_bound_folder', ran: false });
  assert.deepEqual(classifyHookPayload({ ...post, hook_event_name: 'PostToolUseFailure', tool_response: undefined, error: refused }), []);

  // The inline fallback (the file could not be written) is read member by member, as any batch answer.
  const envelope = { batch_id: 'b', count: 2, ok_count: 1, failed_count: 1, results: [{ label: 'a', ok: true, result: { data: { uncommitted: true } } }, { label: 'b', ok: false, error: { code: 'x', message: 'no' } }] };
  const fallback = [
    { type: 'text', text: 'output "file": the batch ran, but its answer could not be saved under hiveku-data/batches/ (write_failed), so it is here instead.' },
    { type: 'text', text: JSON.stringify(envelope) },
  ];
  assert.deepEqual(kinds(classifyHookPayload({ ...post, tool_response: fallback })), [`write:${PROJECT}:feature/x`]);

  // Without output "file", a readable answer with no results still records nothing (unchanged).
  const { output: _drop, ...plainInput } = input;
  assert.deepEqual(classifyHookPayload({ ...post, tool_input: plainInput }), []);
});

test('output "file" with no bound folder that can take the file: refused, and nothing is forwarded', async () => {
  // 1. Bound, but hiveku-data is a file.
  const session = await boundFolder();
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text: JSON.stringify(batchEnvelope()) }] }) });
  try {
    await fsp.writeFile(path.join(session.project, DATA_DIR), 'a file where the folder goes');
    const { answer } = await callOnce(session, 30, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' });
    assert.equal(answer.msg.result.isError, true);
    const body = bodyOf(answer);
    assert.equal(body.code, 'output_file_unavailable');
    assert.equal(body.reason, 'not_a_directory');
    assert.equal(body.ran, false);
    assert.match(body.error, /Nothing was sent to Hiveku and nothing ran/);
    assert.deepEqual(up.toolCalls(), [], 'nothing was forwarded');

    // 2. Bound when the session started, and the folder is gone by the call.
    await fsp.unlink(path.join(session.project, DATA_DIR));
    const shim = startShim(session);
    try {
      shim.send({ jsonrpc: '2.0', id: 31, method: 'ping' });
      await shim.answer(31);
      await fsp.rename(session.project, path.join(session.tmp, 'moved-away'));
      shim.send(callMsg(32, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' }));
      const gone = bodyOf(await shim.answer(32));
      assert.equal(gone.reason, 'no_bound_folder');
      assert.equal(gone.ran, false);
    } finally {
      await shim.close();
    }
    assert.deepEqual(up.toolCalls(), [], 'still nothing forwarded');
  } finally {
    up.restore();
    await session.cleanup();
  }

  // 3. Not bound at all: the bridge is inert, and nothing goes anywhere.
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-answer-unbound-'));
  const quiet = fakeUpstream({});
  try {
    const unbound = path.join(tmp, 'unbound');
    await fsp.mkdir(unbound);
    const { answer } = await callOnce({ project: unbound, dataDir: path.join(tmp, 'data') }, 33, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' });
    assert.equal(answer.msg.error.code, -32002);
    assert.deepEqual(quiet.seen, [], 'not one request left this process');
    assert.equal(fs.existsSync(path.join(unbound, DATA_DIR)), false);
  } finally {
    quiet.restore();
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('tools/list shows output on hiveku_batch; other tools and a server-declared output are left alone', async () => {
  const batch = {
    name: 'hiveku_batch',
    description: 'Run up to 25 tool calls in ONE round trip.',
    inputSchema: {
      type: 'object',
      properties: { calls: { type: 'array' }, max_bytes_per_result: { type: 'number' } },
      required: ['calls'],
    },
  };
  const info = { name: 'get_account_info', description: 'Who am I.', inputSchema: { type: 'object', properties: {} } };
  const session = await boundFolder();
  const up = fakeUpstream({ 'tools/list': () => ({ tools: [batch, info] }) });
  try {
    const shim = startShim(session);
    let listed;
    try {
      shim.send({ jsonrpc: '2.0', id: 40, method: 'tools/list', params: {} });
      listed = (await shim.answer(40)).msg.result.tools;
    } finally {
      await shim.close();
    }
    const shown = listed.find((t) => t.name === 'hiveku_batch');
    assert.deepEqual(shown.inputSchema.properties.output, { ...BATCH_OUTPUT_PROPERTY });
    assert.deepEqual(shown.inputSchema.properties.calls, batch.inputSchema.properties.calls);
    assert.deepEqual(shown.inputSchema.required, ['calls']);
    assert.equal(shown.description, batch.description, 'the description is the server\'s, untouched');
    assert.deepEqual(listed.find((t) => t.name === 'get_account_info'), info);
    assert.equal('output' in batch.inputSchema.properties, false, 'the upstream object is not mutated');
  } finally {
    up.restore();
    await session.cleanup();
  }

  const declared = { ...batch, inputSchema: { ...batch.inputSchema, properties: { ...batch.inputSchema.properties, output: { type: 'string', description: 'server text' } } } };
  assert.deepEqual(withBatchOutputOption([declared]), [declared]);
  const words = BATCH_OUTPUT_PROPERTY.description;
  for (const needed of ['hiveku-data/batches/<batch_id>.json', 'saved_to', 'trimmed', 'dropped', 'already ran', 'never send a write again', '32768', 'max_bytes_per_result']) {
    assert.ok(words.includes(needed), `the option text names ${needed}`);
  }
  assert.deepEqual(BATCH_OUTPUT_PROPERTY.enum, ['inline', 'file']);
});

test('the file-mode cap fits the whole batch in its size budget, and never drops below inline', () => {
  const calls = (n) => Array.from({ length: n }, (_, i) => ({ label: `c${i}`, tool: 'project_get', args: {} }));
  for (const [n, cap] of [[1, 32_768], [3, 32_768], [4, 25_000], [5, 20_000], [25, 4_000], [60, 2_048]]) {
    assert.equal(fileModeCap(calls(n)), cap, `${n} calls`);
  }
  assert.equal(fileModeCap([]), 32_768);
  assert.equal(fileModeCap(undefined), 32_768);
  // Up to the batch's 25 calls, the members' results together stay inside the payload budget.
  for (let n = 1; n <= 25; n++) assert.ok(n * fileModeCap(calls(n)) <= BATCH_FILE_PAYLOAD_BUDGET, `${n} calls`);
  // A batch with no dropped member says nothing about dropping.
  assert.equal(BATCH_FILE_PAYLOAD_BUDGET, 100_000);
});

test('output "file": a cancel that arrives while the folder is checked stops the call before anything is sent', async () => {
  const session = await boundFolder();
  const up = fakeUpstream({ 'tools/call': () => ({ content: [{ type: 'text', text: JSON.stringify(batchEnvelope()) }] }) });
  const shim = startShim(session);
  try {
    // Both lines arrive together: the cancel is handled while the call waits on the folder check.
    shim.send(callMsg(30, 'hiveku_batch', { calls: BATCH_CALLS, output: 'file' }));
    shim.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 30, reason: 'test' } });
    const answer = await shim.answer(30);
    assert.equal(up.toolCalls().length, 0, 'nothing was forwarded');
    assert.match(answer.msg.error.message, /Nothing was sent, so nothing ran/);
    assert.equal(answer.msg.error.data.dispatched, false);
  } finally {
    await shim.close();
    up.restore();
    await session.cleanup();
  }
});

test('no emojis or em dashes in the words this change puts in front of an agent', () => {
  const words = [
    BATCH_OUTPUT_PROPERTY.description,
    fs.readFileSync(path.join(ROOT, 'lib', 'answer-files.mjs'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'lib', 'data-file.mjs'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(words, /\u2014/);
  assert.doesNotMatch(words, /\p{Extended_Pictographic}/u);
});

/* ── 9: git ignores what the writer saves ────────────────────────────────── */

function gitIgnored(repo, rel) {
  const run = spawnSync('git', ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', rel], { cwd: repo, encoding: 'utf8' });
  assert.ok(run.status === 0 || run.status === 1, `git check-ignore failed: ${run.stderr}`);
  return run.status === 0;
}

test('git ignores the saved files: through the .gitignore setup writes, and through the writer\'s own', async (t) => {
  if (spawnSync('git', ['--version']).status !== 0) {
    t.skip('git is not installed');
    return;
  }
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-answer-git-'));
  try {
    const { results } = await runSetup({
      root: path.join(home, 'Hiveku-Accounts'),
      accounts: { [ACCOUNT]: { label: 'Acme', key: 'hvk_test_placeholder', key_preview: 'hvk_test', scope: 'full' } },
      homeDir: home,
    });
    const folder = results[0].dir;
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: folder }).status, 0);
    assert.match(await fsp.readFile(path.join(folder, '.gitignore'), 'utf8'), /^hiveku-data\/$/m);
    await writeDataFile({ rootDir: folder, subdir: SPILL_DIR, fileName: 'project_files_bulk_get-20261021T120000123Z.json', text: '{}' });
    await writeDataFile({ rootDir: folder, subdir: BATCH_DIR, fileName: `${BATCH_ID}.json`, text: '{}' });
    assert.equal(gitIgnored(folder, `${DATA_DIR}/${SPILL_DIR}/project_files_bulk_get-20261021T120000123Z.json`), true);
    assert.equal(gitIgnored(folder, `${DATA_DIR}/${BATCH_DIR}/${BATCH_ID}.json`), true);

    // A folder whose own .gitignore lacks the line: the writer's .gitignore still covers its folders.
    await fsp.writeFile(path.join(folder, '.gitignore'), 'node_modules/\n');
    assert.equal(gitIgnored(folder, `${DATA_DIR}/${SPILL_DIR}/project_files_bulk_get-20261021T120000123Z.json`), true);
    assert.equal(gitIgnored(folder, `${DATA_DIR}/${BATCH_DIR}/${BATCH_ID}.json`), true);
    // Negative control: the rest of hiveku-data is not ignored by anything else on this machine.
    await fsp.writeFile(path.join(folder, DATA_DIR, 'other.json'), '{}');
    assert.equal(gitIgnored(folder, `${DATA_DIR}/other.json`), false);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});
