/**
 * HK-692 (2026-10-25): hiveku_tool_schema answered available:true with a full
 * schema for pm_tasks_comment, and calling mcp__plugin_hiveku_hk__pm_tasks_comment
 * then failed in Claude Code with "No such tool available": a client runs only
 * a tool it was given in tools/list, and this plugin lists a short core set
 * plus what a search promoted. The same call worked through hiveku_batch.
 *
 * The shim runs for real (runShim over in-memory stdio, as in
 * test/answer-files.test.mjs) against a fake Hiveku MCP server behind
 * globalThis.fetch: the key is a placeholder and nothing reaches the network.
 *
 * Pinned:
 *   1. pm_tasks_comment sits where pm_tasks_create and pm_tasks_list do: all
 *      three are listed up front (CORE_TOOLS) and survive a focus
 *      (ALWAYS_AVAILABLE), only when the server offers them. The search
 *      tool's description leaves only the rest of PM to search.
 *   2. Every tool a hiveku_tool_schema answer reports says callable_directly
 *      and how_to_call, and callable_directly agrees with the tools/list the
 *      session is given next, for every tool in the answer. The search tool's
 *      own entry promises to add only tools served to this connection.
 *   3. A tool the answer reports as available and the list does not hold yet
 *      is added to the list (with its real schema), and the client is told
 *      the list changed, after the answer. One the server does not list, and
 *      one this connection cannot call, are never claimed callable.
 *   4. The same holds in a focused folder (tool_mode all + departments), where
 *      the lookup and the batch tool themselves now survive the focus, and in
 *      an unfocused one, where everything is listed already.
 *   5. With no readable tool list nothing is added, and the answer still tells
 *      the truth; an error answer passes through untouched.
 *   6. The writes stay out of the auto-approve set: a direct pm_tasks_comment
 *      or pm_tasks_create follows the person's settings, a batch carrying one
 *      asks, and the lookup itself stays a pre-approved read.
 *   7. HK-1866: a tool a search or a lookup surfaced is announced to the
 *      client (notifications/tools/list_changed) for as long as the client
 *      was not sent it, not only the first time: the client's refresh can be
 *      lost (the bridge's own connect timeouts), and then the tool was found
 *      and listed but "No such tool available". A failed list fetch is tried
 *      once more when it failed fast (a connect timeout, an unreachable edge),
 *      and not again after a rate limit, a timeout (a search must not wait twice
 *      while Hiveku hangs) or the edge's own timeout. An answer with no list in it
 *      (an error, an empty list) is a failed refresh too, never "NOT served", and
 *      is not kept; a result says to run a tool through hiveku_batch when it is
 *      not callable by its own name.
 *
 * Run: node --test test/tool-schema-direct-call.test.mjs
 */
import './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { runShim } from '../lib/shim.mjs';
import { fetchBodyText } from './request-body.mjs';
import { bindingPathFor, writeBinding } from '../lib/binding.mjs';
import { CORE_TOOLS, FIND_TOOL_NAME, findToolDefinition, indexModeTools } from '../lib/tool-index.mjs';
import { ALWAYS_AVAILABLE, filterTools } from '../lib/tool-focus.mjs';
import { decideForPayload, isAutoApprovable } from '../lib/tool-safety.mjs';
import { batchRoute, directCallFacts, noSuchToolFallback, schemaReport, withDirectCallFacts } from '../lib/tool-schema-answer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const PFX = 'mcp__plugin_hiveku_hk__';
const PM_LOOP = ['pm_tasks_list', 'pm_tasks_create', 'pm_tasks_comment'];
const REGISTRY_META = { hiveku: { registry: 'test-stamp' } };

/* ── the fake server ─────────────────────────────────────────────────────── */

const schemaOf = (name) => ({
  type: 'object',
  properties: { [`${name}_arg`]: { type: 'string', description: `the real schema of ${name}` } },
});

/** What the fake server's tools/list serves this key. */
const SERVED = [
  'hiveku_tool_schema', 'hiveku_batch', 'get_account_info', 'account_context_get',
  'pm_tasks_list', 'pm_tasks_create', 'pm_tasks_comment', 'pm_tasks_update',
  'crm_list_contacts', 'ppc_budget_update',
];
/** Reported available by hiveku_tool_schema but absent from tools/list. */
const AVAILABLE_NOT_LISTED = ['helpdesk_ticket_get'];
/** Reported unavailable: this connection may not call it. */
const UNAVAILABLE = { accounting_bill_pay: 'This key is read-only; accounting_bill_pay writes.' };

const servedTool = (name) => ({ name, description: `${name} does its job.`, inputSchema: schemaOf(name) });

/** The server's report for one name, shaped as hiveku-mcp-api-server describeTools answers. */
function reportEntry(name) {
  if (name === FIND_TOOL_NAME) {
    return {
      name,
      available: false,
      reason: `${name} is answered by the client, not this server: it searches the catalogue. ` +
        'It exists and you can call it directly; there is no server-side schema to return.',
    };
  }
  if (UNAVAILABLE[name]) return { name, available: false, reason: UNAVAILABLE[name] };
  if (SERVED.includes(name) || AVAILABLE_NOT_LISTED.includes(name)) {
    return {
      name,
      available: true,
      method: name.endsWith('_list') || name.endsWith('_get') ? 'GET' : 'POST',
      path: `/api/olympus/${name}`,
      description: `${name} does its job.`,
      required: [],
      properties: schemaOf(name).properties,
      forwarded_as: { [`${name}_arg`]: 'body' },
      shaping_supported: true,
    };
  }
  return null;
}

function schemaAnswer(args) {
  const names = Array.isArray(args?.names) ? args.names : [];
  const tools = [];
  const notFound = [];
  for (const name of names) {
    const entry = reportEntry(name);
    if (entry) tools.push(entry);
    else notFound.push(name);
  }
  return {
    content: [{ type: 'text', text: JSON.stringify({ tools, count: tools.length, not_found: notFound }) }],
    _meta: REGISTRY_META,
  };
}

const jsonResponse = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * A fake Hiveku MCP server behind globalThis.fetch. `list` answers tools/list
 * (a function, so a test can make it fail), and hiveku_tool_schema is
 * answered from the tables above.
 */
function fakeUpstream({ list = () => ({ tools: SERVED.map(servedTool) }), call = null } = {}) {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const message = JSON.parse(fetchBodyText(init));
    seen.push(message);
    if (message.method === 'initialize') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: message.id,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake-hiveku', version: '0' } },
      });
    }
    if (message.method === 'notifications/initialized') return new Response(null, { status: 204 });
    if (message.method === 'tools/list') {
      const answer = list();
      // A list that answers with a JSON-RPC error member instead of a result, as the server can (`{ jsonrpcError }`).
      return jsonResponse(
        answer?.jsonrpcError
          ? { jsonrpc: '2.0', id: message.id, error: answer.jsonrpcError }
          : { jsonrpc: '2.0', id: message.id, result: answer },
      );
    }
    if (message.method === 'tools/call') {
      const result = call
        ? call(message)
        : message.params.name === 'hiveku_tool_schema'
          ? schemaAnswer(message.params.arguments)
          : { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      return jsonResponse({ jsonrpc: '2.0', id: message.id, result });
    }
    throw new Error(`the fake has no handler for ${message.method}`);
  };
  return {
    seen,
    lists: () => seen.filter((m) => m.method === 'tools/list').length,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

/* ── the shim ────────────────────────────────────────────────────────────── */

/** A bound folder with a placeholder key; `extra` lands in .hiveku/account.json (tool_mode, departments). */
async function boundFolder(extra = {}) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hk-tool-schema-'));
  const project = path.join(tmp, 'acct');
  const dataDir = path.join(tmp, 'data');
  await fsp.mkdir(dataDir, { recursive: true });
  await writeBinding(project, { accountId: ACCOUNT, label: 'Acme', keyPreview: 'hvk_test' });
  if (Object.keys(extra).length) {
    const file = bindingPathFor(project);
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
    await fsp.writeFile(file, JSON.stringify({ ...parsed, ...extra }, null, 2) + '\n');
  }
  await fsp.writeFile(
    path.join(dataDir, 'credentials.json'),
    JSON.stringify({
      version: 1,
      accounts: { [ACCOUNT]: { key: 'hvk_test_placeholder', label: 'Acme', key_preview: 'hvk_test', scope: 'full' } },
    }),
  );
  return { project, dataDir, cleanup: () => fsp.rm(tmp, { recursive: true, force: true }) };
}

async function waitFor(predicate, what, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

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
  let nextId = 1;
  const shim = {
    lines,
    async request(method, params = {}) {
      const id = nextId++;
      stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      await waitFor(() => lines.some((l) => l.msg.id === id), `the answer to ${method} (${id})`);
      return { id, index: lines.findIndex((l) => l.msg.id === id), line: lines.find((l) => l.msg.id === id) };
    },
    async listed() {
      const { line } = await shim.request('tools/list');
      return line.msg.result.tools;
    },
    async lookup(names) {
      const answer = await shim.request('tools/call', { name: 'hiveku_tool_schema', arguments: { names } });
      const report = JSON.parse(answer.line.msg.result.content[0].text);
      return { ...answer, report, entry: (name) => report.tools.find((t) => t.name === name) };
    },
    /** A hiveku_find_tools call: `limit: 1` by default, so a query that names a tool exactly surfaces that tool alone. */
    async find(query, extra = { limit: 1 }) {
      const answer = await shim.request('tools/call', { name: FIND_TOOL_NAME, arguments: { query, ...extra } });
      return { ...answer, text: answer.line.msg.result.content[0].text };
    },
    listChanged: () => lines
      .map((l, index) => ({ ...l, index }))
      .filter((l) => l.msg.method === 'notifications/tools/list_changed'),
    async close() {
      stdin.end();
      await finished;
    },
  };
  return shim;
}

/** Run `body(shim)` against one shim in one bound folder, then clean up. */
async function withShim({ binding = {}, upstream = {} } = {}, body) {
  const session = await boundFolder(binding);
  const up = fakeUpstream(upstream);
  const shim = startShim(session);
  try {
    return await body(shim, up);
  } finally {
    await shim.close();
    up.restore();
    await session.cleanup();
  }
}

const names = (tools) => tools.map((t) => t.name);

/** callable_directly agrees with the list the session is given, for every entry that carries it. */
function assertAgrees(report, listedTools) {
  const listed = new Set(names(listedTools));
  for (const entry of report.tools) {
    assert.equal(typeof entry.callable_directly, 'boolean', `${entry.name} says callable_directly`);
    assert.equal(typeof entry.how_to_call, 'string', `${entry.name} says how_to_call`);
    assert.equal(entry.callable_directly, listed.has(entry.name),
      `${entry.name}: callable_directly ${entry.callable_directly}, but the tool list ${listed.has(entry.name) ? 'holds' : 'lacks'} it`);
  }
}

/* ── 1: the PM task loop ─────────────────────────────────────────────────── */

test('pm_tasks_comment is listed where pm_tasks_create and pm_tasks_list are: up front, and through a focus', () => {
  for (const name of PM_LOOP) {
    assert.ok(CORE_TOOLS.includes(name), `${name} must be in CORE_TOOLS`);
    assert.ok(ALWAYS_AVAILABLE.has(name), `${name} must be in ALWAYS_AVAILABLE`);
  }
  const upstream = [...PM_LOOP, 'pm_tasks_update', 'crm_list_contacts'].map((name) => ({ name }));
  assert.deepEqual(names(indexModeTools(upstream)), [FIND_TOOL_NAME, ...PM_LOOP]);
  assert.deepEqual(names(filterTools(upstream, 'ppc')), PM_LOOP);
  // A key that is not served them never has them listed.
  assert.deepEqual(names(indexModeTools([{ name: 'crm_list_contacts' }])), [FIND_TOOL_NAME]);
  // The search tool no longer calls PM search-only: the loop is listed up front.
  assert.match(findToolDefinition(10).description, /workflows, the rest of PM — is found through here/);
});

test('HK-692 itself: a lookup of pm_tasks_comment says it is callable directly, and it is in the list', async () => {
  await withShim({}, async (shim) => {
    const listed = await shim.listed();
    for (const name of PM_LOOP) assert.ok(names(listed).includes(name), `${name} is listed`);
    const { report, entry } = await shim.lookup(['pm_tasks_comment']);
    const comment = entry('pm_tasks_comment');
    assert.equal(comment.available, true);
    assert.equal(comment.callable_directly, true);
    assert.match(comment.how_to_call, new RegExp(`Call it directly as ${PFX}pm_tasks_comment\\.`));
    assert.match(comment.how_to_call, /It is in this session's tool list\./);
    assert.match(comment.how_to_call, new RegExp(`ToolSearch "select:${PFX}pm_tasks_comment"`));
    assertAgrees(report, await shim.listed());
    assert.deepEqual(shim.listChanged(), [], 'nothing was added, so the list did not change');
  });
});

/* ── 2-3: every tool in the answer, in index mode ───────────────────────── */

test('every tool in a lookup says how to call it, and the next tools/list agrees with each one', async () => {
  await withShim({}, async (shim, up) => {
    const before = await shim.listed();
    for (const name of ['pm_tasks_update', 'crm_list_contacts']) {
      assert.ok(!names(before).includes(name), `${name} is not listed before the lookup`);
    }
    const asked = [
      'pm_tasks_update', 'crm_list_contacts', 'get_account_info', 'helpdesk_ticket_get',
      'accounting_bill_pay', FIND_TOOL_NAME, 'no_such_tool',
    ];
    const lookup = await shim.lookup(asked);
    const { report, entry } = lookup;

    // Added by the lookup, so callable directly once the client lists again.
    for (const name of ['pm_tasks_update', 'crm_list_contacts']) {
      const e = entry(name);
      assert.equal(e.callable_directly, true, name);
      assert.match(e.how_to_call, /this lookup added it/);
      assert.match(e.how_to_call, new RegExp(`ToolSearch "select:${PFX}${name}"`));
      assert.ok(e.how_to_call.includes(`{"calls":[{"tool":"${name}","args":{...}}]}`), `${name} names the batch route`);
    }
    assert.match(entry('get_account_info').how_to_call, /It is in this session's tool list\./);
    // Available to this key, but the server's list does not carry it: never claimed.
    const unlisted = entry('helpdesk_ticket_get');
    assert.equal(unlisted.callable_directly, false);
    assert.match(unlisted.how_to_call, /No such tool available/);
    assert.ok(unlisted.how_to_call.includes('{"calls":[{"tool":"helpdesk_ticket_get","args":{...}}]}'));
    // Not callable on this connection at all: no route is offered.
    const refused = entry('accounting_bill_pay');
    assert.equal(refused.callable_directly, false);
    assert.equal(refused.reason, UNAVAILABLE.accounting_bill_pay, 'the server\'s reason is kept');
    assert.match(refused.how_to_call, /cannot call it, directly or through hiveku_batch/);
    // The plugin's own search tool is listed in index mode, whatever the server says.
    assert.equal(entry(FIND_TOOL_NAME).available, false);
    assert.equal(entry(FIND_TOOL_NAME).callable_directly, true);
    // A search adds only what the server's list carries, and the answer says no more than that.
    assert.match(entry(FIND_TOOL_NAME).how_to_call, /every tool it finds that is served to this connection is added/);
    // Everything else the server sent is kept.
    assert.deepEqual(report.not_found, ['no_such_tool']);
    assert.equal(report.count, 6);
    assert.deepEqual(entry('pm_tasks_update').forwarded_as, { pm_tasks_update_arg: 'body' });
    assert.equal(entry('pm_tasks_update').path, '/api/olympus/pm_tasks_update');
    assert.deepEqual(lookup.line.msg.result._meta, REGISTRY_META);
    // The two new fields come right after `available`.
    assert.deepEqual(Object.keys(entry('pm_tasks_update')).slice(0, 4), ['name', 'available', 'callable_directly', 'how_to_call']);

    // The client is told the list changed, once, AFTER the answer.
    const changed = shim.listChanged();
    assert.equal(changed.length, 1);
    assert.ok(changed[0].index > lookup.index, 'the notification follows the answer');

    // The next tools/list carries the added tools with their REAL schemas, and agrees with every entry.
    const after = await shim.listed();
    assert.deepEqual(after.find((t) => t.name === 'pm_tasks_update').inputSchema, schemaOf('pm_tasks_update'));
    assert.ok(!names(after).includes('helpdesk_ticket_get'));
    assertAgrees(report, after);
    assert.ok(up.lists() >= 2, 'the client\'s lists went upstream');
  });
});

test('looking a tool up again says it is listed, and does not announce a change twice once the client has listed it', async () => {
  await withShim({}, async (shim) => {
    await shim.listed();
    await shim.lookup(['pm_tasks_update']);
    assert.equal(shim.listChanged().length, 1);
    // The client lists again, as it does when told the list changed. Before it has, a second lookup announces the
    // change again (section 7): the notification stands for "list again", and the client has not.
    assert.ok(names(await shim.listed()).includes('pm_tasks_update'));
    const again = await shim.lookup(['pm_tasks_update']);
    assert.match(again.entry('pm_tasks_update').how_to_call, /It is in this session's tool list\./);
    assert.equal(shim.listChanged().length, 1, 'no second notification');
    assertAgrees(again.report, await shim.listed());
  });
});

/* ── 4: focused and unfocused folders ────────────────────────────────────── */

test('in a focused folder the lookup and the batch tool survive the focus, and a lookup adds an out-of-focus tool', async () => {
  await withShim({ binding: { tool_mode: 'all', departments: ['ppc'] } }, async (shim) => {
    const before = names(await shim.listed());
    for (const name of ['ppc_budget_update', 'hiveku_tool_schema', 'hiveku_batch', ...PM_LOOP, 'get_account_info']) {
      assert.ok(before.includes(name), `${name} survives the ppc focus`);
    }
    for (const name of ['crm_list_contacts', 'pm_tasks_update', FIND_TOOL_NAME]) {
      assert.ok(!before.includes(name), `${name} is not listed in a ppc focus`);
    }
    const lookup = await shim.lookup(['crm_list_contacts', 'ppc_budget_update', FIND_TOOL_NAME, 'helpdesk_ticket_get']);
    assert.equal(lookup.entry('crm_list_contacts').callable_directly, true);
    assert.match(lookup.entry('crm_list_contacts').how_to_call, /this lookup added it/);
    assert.match(lookup.entry('ppc_budget_update').how_to_call, /It is in this session's tool list\./);
    // The search tool is not listed in this mode, and the answer says so.
    assert.equal(lookup.entry(FIND_TOOL_NAME).callable_directly, false);
    assert.match(lookup.entry(FIND_TOOL_NAME).how_to_call, /hiveku_tool_schema/);
    assert.match(lookup.entry(FIND_TOOL_NAME).how_to_call, /a tool that is served to this connection but not listed yet is added/);
    assert.equal(lookup.entry('helpdesk_ticket_get').callable_directly, false);
    assert.equal(shim.listChanged().length, 1);
    const after = await shim.listed();
    assert.ok(names(after).includes('crm_list_contacts'), 'the focus no longer hides what was looked up');
    assert.ok(!names(after).includes('pm_tasks_update'), 'nothing else joined');
    assertAgrees(lookup.report, after);
  });
});

test('in an unfocused all-tools folder everything is listed already, and nothing is added', async () => {
  await withShim({ binding: { tool_mode: 'all' } }, async (shim) => {
    assert.deepEqual(names(await shim.listed()), SERVED);
    const lookup = await shim.lookup(['pm_tasks_update', 'helpdesk_ticket_get']);
    assert.equal(lookup.entry('pm_tasks_update').callable_directly, true);
    assert.match(lookup.entry('pm_tasks_update').how_to_call, /It is in this session's tool list\./);
    assert.equal(lookup.entry('helpdesk_ticket_get').callable_directly, false);
    assert.deepEqual(shim.listChanged(), []);
    assertAgrees(lookup.report, await shim.listed());
  });
});

/* ── 5: no readable list, and answers that are not reports ───────────────── */

test('with no readable tool list nothing is added, a core tool still reads as callable, and the rest go to hiveku_batch', async () => {
  // The server answers tools/list with no tools array; the client never got a list either.
  await withShim({ upstream: { list: () => ({}) } }, async (shim) => {
    const lookup = await shim.lookup(['pm_tasks_comment', 'pm_tasks_update']);
    assert.equal(lookup.entry('pm_tasks_comment').callable_directly, true);
    const update = lookup.entry('pm_tasks_update');
    assert.equal(update.callable_directly, false);
    assert.match(update.how_to_call, /could not be read this turn/);
    assert.ok(update.how_to_call.includes('{"calls":[{"tool":"pm_tasks_update","args":{...}}]}'));
    assert.deepEqual(shim.listChanged(), [], 'nothing was added');
  });
});

test('an error answer, and an answer that is not a schema report, pass through untouched', async () => {
  const refusal = { content: [{ type: 'text', text: JSON.stringify({ error: 'read-only key' }) }], isError: true };
  await withShim({ upstream: { call: () => refusal } }, async (shim) => {
    await shim.listed();
    const answer = await shim.request('tools/call', { name: 'hiveku_tool_schema', arguments: { names: ['x'] } });
    assert.deepEqual(answer.line.msg.result, refusal);
    assert.deepEqual(shim.listChanged(), []);
  });
  for (const result of [
    refusal,
    { content: [{ type: 'text', text: 'not json' }] },
    { content: [{ type: 'text', text: '{"tools":"nope"}' }] },
    { content: [{ type: 'text', text: '{"tools":[]}' }, { type: 'text', text: 'two blocks' }] },
    { content: [{ type: 'image', data: 'x' }] },
    // HK-1866: the server's answer to a call that named nothing to look up: an empty report that carries an error.
    { content: [{ type: 'text', text: JSON.stringify({ error: 'hiveku_tool_schema needs names or search.', tools: [], count: 0, not_found: [] }) }] },
  ]) {
    assert.equal(schemaReport({ jsonrpc: '2.0', id: 1, result }), null, JSON.stringify(result));
  }
  assert.equal(schemaReport({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'x' } }), null);
});

test('directCallFacts: the batch route is offered only when hiveku_batch is listed', () => {
  const ctx = (listed) => ({ listed: new Set(listed), added: new Set(), findTool: FIND_TOOL_NAME });
  const entry = { name: 'pm_tasks_update', available: true };
  assert.match(directCallFacts(entry, ctx(['hiveku_batch'])).how_to_call, /Instead, run it through hiveku_batch/);
  const noBatch = directCallFacts(entry, ctx([]));
  assert.equal(noBatch.callable_directly, false);
  assert.match(noBatch.how_to_call, /hiveku_batch is not in this session's tool list either/);
  assert.doesNotMatch(directCallFacts(entry, ctx(['pm_tasks_update'])).how_to_call, /hiveku_batch/);
  // An entry without a usable name or a boolean `available` is left as it came.
  assert.equal(directCallFacts({ name: 'x y', available: true }, ctx([])), null);
  assert.equal(directCallFacts({ name: 'pm_tasks_update' }, ctx([])), null);
  const response = { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: '{"tools":[{"name":"odd"}],"count":1}' }] } };
  const kept = withDirectCallFacts(response, schemaReport(response), ctx([]));
  assert.deepEqual(JSON.parse(kept.result.content[0].text), { tools: [{ name: 'odd' }], count: 1 });
});

/* ── 6: approvals ────────────────────────────────────────────────────────── */

test('the PM writes stay out of the auto-approve set; the list read and the lookup stay pre-approved', () => {
  const readOnly = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'readonly-tools.json'), 'utf8')).tools;
  const comment = { id: '7c1d7a52-0000-4000-8000-000000000001', content: 'Checked the redirect.' };
  for (const [name, args] of [['pm_tasks_comment', comment], ['pm_tasks_create', { project_id: 'p', title: 't' }]]) {
    assert.equal(isAutoApprovable(name, args), false, `${name} writes`);
    assert.ok(!readOnly.includes(name), `${name} is not on the read-only list`);
    // Direct: no opinion, so the person's own settings decide, as for any ordinary write.
    assert.equal(decideForPayload({ tool_name: `${PFX}${name}`, tool_input: args }), null, `${name} direct`);
    // In a batch it is hidden from those settings, so the batch asks.
    const batch = decideForPayload({ tool_name: `${PFX}hiveku_batch`, tool_input: { calls: [{ tool: name, args }] } });
    assert.equal(batch.hookSpecificOutput.permissionDecision, 'ask', `${name} in a batch`);
  }
  assert.equal(isAutoApprovable('pm_tasks_list', { project_id: 'p' }), true, 'reading the list is a read');
  // Adding a looked-up tool to the list writes nothing in Hiveku: the lookup stays a read.
  assert.equal(isAutoApprovable('hiveku_tool_schema', { names: ['pm_tasks_comment'] }), true);
});

/* ── 7: a promotion the client lost (HK-1866) ───────────────────────────── */

/**
 * A fake tools/list that fails on the calls numbered in `failOn` (1 is the first), as the bridge's own connect timeout
 * does (UND_ERR_CONNECT_TIMEOUT: the request never leaves, the shim reads a network failure). The count is of upstream
 * lists: the client's own tools/list and the shim's promotion fetch both make them, and the shim keeps what it read.
 */
function listFailingOn(...failOn) {
  let calls = 0;
  return () => {
    calls += 1;
    if (failOn.includes(calls)) throw new Error('fetch failed: connect timeout');
    return { tools: SERVED.map(servedTool) };
  };
}

test('HK-1866: a search for a tool the client never got announces it again, until the client has listed it', async () => {
  // Upstream lists: 1 the client's first, 2 its refresh after the search (lost), 3 its next refresh.
  await withShim({ upstream: { list: listFailingOn(2) } }, async (shim, up) => {
    assert.ok(!names(await shim.listed()).includes('crm_list_contacts'));

    const found = await shim.find('crm_list_contacts');
    assert.match(found.text, /have just been added to this session's tool list/);
    assert.equal(shim.listChanged().length, 1, 'the first search announces the new tool');
    assert.ok(shim.listChanged()[0].index > found.index, 'the notification follows the answer');

    // The client lists again, as told, and that answer is lost: it still does not hold the tool.
    const lost = await shim.request('tools/list');
    assert.ok(lost.line.msg.error, 'the refresh failed');

    // The same search again. The name was exposed already, so this announced nothing: the tool was found, listed,
    // and "No such tool available", and nothing ever told the client to look again.
    const again = await shim.find('crm_list_contacts');
    assert.equal(shim.listChanged().length, 2, 'the second search announces it again');
    assert.ok(shim.listChanged()[1].index > again.index);

    // The client lists again and now holds it: a further search has nothing to announce.
    const refreshed = await shim.listed();
    assert.ok(names(refreshed).includes('crm_list_contacts'));
    assert.deepEqual(refreshed.find((t) => t.name === 'crm_list_contacts').inputSchema, schemaOf('crm_list_contacts'));
    await shim.find('crm_list_contacts');
    assert.equal(shim.listChanged().length, 2, 'the client holds it: nothing to announce');
    assert.equal(up.lists(), 3, 'the shim read the server list once for the client\'s first list and kept it');
  });
});

test('HK-1866: a lookup of a tool the client never got announces it again, as a search does', async () => {
  await withShim({ upstream: { list: listFailingOn(2) } }, async (shim) => {
    await shim.listed();
    await shim.lookup(['pm_tasks_update']);
    assert.equal(shim.listChanged().length, 1);
    assert.ok((await shim.request('tools/list')).line.msg.error, 'the refresh failed');

    const again = await shim.lookup(['pm_tasks_update']);
    assert.equal(shim.listChanged().length, 2, 'the second lookup announces it again');
    assert.ok(shim.listChanged()[1].index > again.index, 'after the answer');
    // The answer says it is listed, and it is, in the list the client is now asked for.
    assert.equal(again.entry('pm_tasks_update').callable_directly, true);
    assert.ok(names(await shim.listed()).includes('pm_tasks_update'));
    await shim.lookup(['pm_tasks_update']);
    assert.equal(shim.listChanged().length, 2, 'the client holds it: nothing to announce');
  });
});

test('HK-1866: a search or a lookup that surfaces only tools the client holds announces nothing', async () => {
  await withShim({}, async (shim) => {
    await shim.listed();
    // pm_tasks_comment is a core tool: listed from the start, so a search for it is not a change to the list
    // (it used to announce one, because the name was new to the exposed set).
    await shim.find('pm_tasks_comment');
    await shim.lookup(['pm_tasks_comment', 'get_account_info']);
    assert.deepEqual(shim.listChanged(), []);
  });
});

test('HK-1866: before the client has listed at all, a search announces what it surfaced', async () => {
  await withShim({}, async (shim) => {
    await shim.find('crm_list_contacts');
    assert.equal(shim.listChanged().length, 1);
  });
});

test('HK-1866: a list fetch that fails is tried once more: the tool is promoted, and the answer does not claim a failure', async () => {
  await withShim({ upstream: { list: listFailingOn(1) } }, async (shim, up) => {
    // No client list yet, so the search reads the server list itself, and its first read is lost.
    const found = await shim.find('crm_list_contacts');
    assert.equal(up.lists(), 2, 'tried once more');
    assert.match(found.text, /have just been added to this session's tool list/);
    assert.doesNotMatch(found.text, /could NOT be refreshed/);
    assert.equal(shim.listChanged().length, 1);
    assert.ok(names(await shim.listed()).includes('crm_list_contacts'));
  });
});

test('HK-1866: the lookup tries its list fetch once more too', async () => {
  await withShim({ upstream: { list: listFailingOn(1) } }, async (shim, up) => {
    const lookup = await shim.lookup(['pm_tasks_update']);
    assert.equal(up.lists(), 2, 'tried once more');
    assert.equal(lookup.entry('pm_tasks_update').callable_directly, true);
    assert.match(lookup.entry('pm_tasks_update').how_to_call, /this lookup added it/);
    assert.equal(shim.listChanged().length, 1);
  });
});

test('HK-1866: a second failure is reported, nothing is promoted, and the fetch is not tried a third time', async () => {
  await withShim({ upstream: { list: listFailingOn(1, 2) } }, async (shim, up) => {
    const found = await shim.find('crm_list_contacts');
    assert.equal(up.lists(), 2, 'one more try, not a loop');
    assert.match(found.text, /could NOT be refreshed/);
    assert.doesNotMatch(found.text, /have just been added to this session's tool list/);
    assert.deepEqual(shim.listChanged(), [], 'nothing was promoted');
    // The next search starts afresh and, with the server back, promotes it.
    const next = await shim.find('crm_list_contacts');
    assert.match(next.text, /have just been added to this session's tool list/);
    assert.equal(shim.listChanged().length, 1);
  });
});

test('HK-1866: a rate limit is not tried again', async () => {
  await withShim({}, async (shim) => {
    const standard = globalThis.fetch;
    let lists = 0;
    globalThis.fetch = async (url, init) => {
      const message = JSON.parse(fetchBodyText(init));
      if (message.method !== 'tools/list') return standard(url, init);
      lists += 1;
      const error = { code: -32000, message: 'Rate limit exceeded', data: { retry_after_seconds: 7 } };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, error }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    };
    const found = await shim.find('crm_list_contacts');
    assert.equal(lists, 1, 'a hidden second request would only add to a limit that is already reached');
    assert.match(found.text, /could NOT be refreshed/);
    assert.deepEqual(shim.listChanged(), []);
  });
});

test('HK-1866: the client is sent account_memory_get and account_memory_append in its first list, with no search', async () => {
  const served = [...SERVED, 'account_memory_get', 'account_memory_append'];
  await withShim({ upstream: { list: () => ({ tools: served.map(servedTool) }) } }, async (shim) => {
    const listed = names(await shim.listed());
    for (const name of ['account_memory_get', 'account_memory_append']) assert.ok(listed.includes(name), `${name} is listed up front`);
    assert.ok(!listed.includes('crm_list_contacts'), 'index mode still lists only the core set');
    assert.deepEqual(shim.listChanged(), []);
  });
});

test('HK-1866: the answer to a lookup that named nothing is passed through untouched, and reads no tool list for it', async () => {
  const answer = { error: 'hiveku_tool_schema needs names or search.', tools: [], count: 0, not_found: [] };
  const result = { content: [{ type: 'text', text: JSON.stringify(answer) }] };
  await withShim({ upstream: { call: () => result } }, async (shim, up) => {
    const lists = up.lists();
    const reply = await shim.request('tools/call', { name: 'hiveku_tool_schema', arguments: { query: 'memory_delete' } });
    assert.deepEqual(reply.line.msg.result, result);
    assert.equal(up.lists(), lists, 'no server list was read for an answer that names no tool');
    assert.deepEqual(shim.listChanged(), []);
  });
});

/* ── 7b: what a refresh that fails slowly, or answers with nothing, does (HK-1866) ── */

/** What Upstream.send reads as "Hiveku sent no response": the request's timer fired, so fetch rejects with an AbortError. */
const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

/** A tools/list answered with this HTTP status and body, for every call; every other request goes to the standard fake. */
function listAnsweredWith(status, body) {
  const standard = globalThis.fetch;
  const counted = { lists: 0 };
  globalThis.fetch = async (url, init) => {
    const message = JSON.parse(fetchBodyText(init));
    if (message.method !== 'tools/list') return standard(url, init);
    counted.lists += 1;
    return new Response(typeof body === 'string' ? body : JSON.stringify({ jsonrpc: '2.0', id: message.id, ...body }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return counted;
}

test('HK-1866: a timeout is not tried again: a search must not wait a second time while Hiveku hangs', async () => {
  // Upstream list 1 is the search's own read, which times out; a second try would wait another PROTOCOL_TIMEOUT_MS.
  const timesOutOnce = (() => {
    let calls = 0;
    return () => {
      calls += 1;
      if (calls === 1) throw abortError();
      return { tools: SERVED.map(servedTool) };
    };
  })();
  await withShim({ upstream: { list: timesOutOnce } }, async (shim, up) => {
    const found = await shim.find('crm_list_contacts');
    assert.equal(up.lists(), 1, 'one read, no second wait');
    assert.match(found.text, /could NOT be refreshed/);
    assert.deepEqual(shim.listChanged(), [], 'nothing was promoted');
    // The next search reads the list afresh and, with Hiveku answering, promotes it.
    const next = await shim.find('crm_list_contacts');
    assert.equal(up.lists(), 2);
    assert.match(next.text, /have just been added to this session's tool list/);
  });
});

test('HK-1866: the lookup does not try a timeout again either', async () => {
  await withShim({ upstream: { list: () => { throw abortError(); } } }, async (shim, up) => {
    const lookup = await shim.lookup(['pm_tasks_update']);
    assert.equal(up.lists(), 1, 'one read, no second wait');
    // The list could not be read, so the answer judges the tool on what it reports and sends it to hiveku_batch.
    assert.equal(lookup.entry('pm_tasks_update').callable_directly, false);
    assert.deepEqual(shim.listChanged(), []);
  });
});

test("HK-1866: the edge's own timeout (524, after its own long wait) is not tried again", async () => {
  await withShim({}, async (shim) => {
    const counted = listAnsweredWith(524, 'error code: 524');
    const found = await shim.find('crm_list_contacts');
    assert.equal(counted.lists, 1, 'the edge already waited its ceiling: a second wait would double it');
    assert.match(found.text, /could NOT be refreshed/);
    assert.deepEqual(shim.listChanged(), []);
  });
});

test('HK-1866: an edge that cannot reach Hiveku (523, an immediate answer) is tried once more', async () => {
  await withShim({}, async (shim) => {
    const counted = listAnsweredWith(523, 'error code: 523');
    const found = await shim.find('crm_list_contacts');
    assert.equal(counted.lists, 2, 'it fails at once, so one more try costs nothing');
    assert.match(found.text, /could NOT be refreshed/);
  });
});

test('HK-1866: a list answer with no tools is a failed refresh, never "NOT served to this connection", and it is not kept', async () => {
  // An empty list, an answer with no `tools` member, and an error member: none says the key is served nothing.
  for (const answer of [{ tools: [] }, {}, { jsonrpcError: { code: -32603, message: 'Internal error' } }]) {
    let serving = false;
    const list = () => (serving ? { tools: SERVED.map(servedTool) } : answer);
    await withShim({ upstream: { list } }, async (shim, up) => {
      const found = await shim.find('crm_list_contacts');
      assert.match(found.text, /could NOT be refreshed/, JSON.stringify(answer));
      assert.doesNotMatch(found.text, /NOT served to this connection/, 'a tool this key can call is not called unserved');
      assert.doesNotMatch(found.text, /read-only/, 'nor is the key said to be read-only');
      assert.match(found.text, /run it through hiveku_batch/, 'the way round is named');
      assert.deepEqual(shim.listChanged(), []);
      assert.equal(up.lists(), 1, 'an answer with no list is reported as it is, not tried again');

      // Hiveku answers properly the next time: the empty answer was not kept, so the tool is found and promoted.
      serving = true;
      const next = await shim.find('crm_list_contacts');
      assert.match(next.text, /have just been added to this session's tool list/, JSON.stringify(answer));
      assert.equal(shim.listChanged().length, 1);
      assert.ok(names(await shim.listed()).includes('crm_list_contacts'));
    });
  }
});

test('HK-1866: a result for a tool added to the list also says to run it through hiveku_batch if a direct call is refused', async () => {
  await withShim({}, async (shim) => {
    const found = await shim.find('crm_list_contacts');
    assert.match(found.text, /have just been added to this session's tool list/);
    assert.ok(found.text.includes(noSuchToolFallback('<tool_name>')), found.text);
    // The sentence a hiveku_tool_schema answer gives for a listed tool is the same one, word for word.
    const lookup = await shim.lookup(['pm_tasks_comment']);
    assert.ok(lookup.entry('pm_tasks_comment').how_to_call.includes(noSuchToolFallback('pm_tasks_comment')));
    assert.equal(noSuchToolFallback('x'), `If a direct call answers "No such tool available", ${batchRoute('x')}.`);
  });
});
