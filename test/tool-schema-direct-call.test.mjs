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
 *
 * Run: node --test test/tool-schema-direct-call.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { runShim } from '../lib/shim.mjs';
import { bindingPathFor, writeBinding } from '../lib/binding.mjs';
import { CORE_TOOLS, FIND_TOOL_NAME, findToolDefinition, indexModeTools } from '../lib/tool-index.mjs';
import { ALWAYS_AVAILABLE, filterTools } from '../lib/tool-focus.mjs';
import { decideForPayload, isAutoApprovable } from '../lib/tool-safety.mjs';
import { directCallFacts, schemaReport, withDirectCallFacts } from '../lib/tool-schema-answer.mjs';

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
    if (message.method === 'tools/list') return jsonResponse({ jsonrpc: '2.0', id: message.id, result: list() });
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

test('looking a tool up again says it is listed, and does not announce a change twice', async () => {
  await withShim({}, async (shim) => {
    await shim.listed();
    await shim.lookup(['pm_tasks_update']);
    assert.equal(shim.listChanged().length, 1);
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
