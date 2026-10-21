/**
 * The Stop hook's version reminder (lib/stop-version.mjs), end to end over a
 * real ledger file.
 *
 * The cases are the design's (Part 2 E1): a clean ledger says nothing; a dirty
 * one blocks with the exact reason; `stop_hook_active` only tells the person,
 * once; a status that says clean clears it; a network failure or a timeout
 * trusts the ledger and blocks; the folder opt-out silences it; a thrown error
 * is silent. The last tests run the real `bin/hiveku hook post-tool-use` and
 * `hook stop` processes, because the dispatch and the explicit exit are part of
 * the contract too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendLedger, readLedger, classifyHookPayload } from '../lib/vcs-ledger.mjs';
import {
  runStopHook,
  blockReason,
  unversionedNotice,
  readStatusAnswer,
  readBranchesAnswer,
  confirmPairs,
  upstreamStatusCaller,
  versionReminderOptedOut,
  MAX_CONFIRM,
} from '../lib/stop-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = '6d676101-0000-4000-8000-00000000000a';
const ids = Array.from({ length: 6 }, (_, i) => `6d676101-0000-4000-8000-00000000001${i}`);

function tmp(prefix = 'hk-stop-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A fresh world: its own ledger dir, its own folder (no guardrails), a fake home above neither. */
function world() {
  const tmpDir = tmp();
  const cwd = tmp('hk-stop-cwd-');
  const homeDir = tmp('hk-stop-home-');
  return { tmpDir, cwd, homeDir };
}

const write = (w, project_id = P, branch = 'main', session = 's') =>
  appendLedger(session, [{ kind: 'write', project_id, branch, tool: 'project_file_save' }], { tmpDir: w.tmpDir });
const versioned = (w, project_id = P, branch = 'main', session = 's') =>
  appendLedger(session, [{ kind: 'versioned', project_id, branch }], { tmpDir: w.tmpDir });

/** A status caller that answers from a table and records who it was asked about. */
function statusFrom(answers, asked = []) {
  return async (pair) => {
    asked.push(`${pair.project_id}:${pair.branch}`);
    const a = answers[`${pair.project_id}:${pair.branch}`] ?? answers['*'];
    if (a instanceof Error) throw a;
    return a;
  };
}

const run = (w, extra = {}, opts = {}) =>
  runStopHook(
    { session_id: 's', cwd: w.cwd, hook_event_name: 'Stop', stop_hook_active: false, ...extra },
    { tmpDir: w.tmpDir, homeDir: w.homeDir, callStatus: statusFrom({ '*': 'unknown' }), budgetMs: 1_000, ...opts },
  );

const EXACT_MAIN_REASON =
  `Before you finish: your changes to project \`${P}\` are live in the preview but not saved as a version. ` +
  `Call \`project_vcs_commit({ project_id: "${P}", message: "<plain-language name of what changed for visitors, ` +
  'e.g. Updated the pricing section on the Home page>" })` with NO files — one version for this piece of work. ' +
  "It also holds others' unsaved changes: check `project_vcs_status({ project_id, detail: \"files\" })` first " +
  'and name it for all of it. ' +
  '(Not in your tool list? `hiveku_find_tools` finds it.) If the user asked you not to save a version yet, say ' +
  'so in one line and stop.';

/* ── silence ─────────────────────────────────────────────────────────────── */

test('no ledger, or a clean one, says nothing and asks no one', async () => {
  const w = world();
  const asked = [];
  assert.equal(await run(w, {}, { callStatus: statusFrom({ '*': 'dirty' }, asked) }), '');
  write(w);
  versioned(w);
  assert.equal(await run(w, {}, { callStatus: statusFrom({ '*': 'dirty' }, asked) }), '');
  assert.deepEqual(asked, [], 'a clean ledger costs no network call');
});

/* ── blocking ────────────────────────────────────────────────────────────── */

test('dirty ledger, status unknown: blocks with the exact reason', async () => {
  const w = world();
  write(w);
  const out = JSON.parse(await run(w));
  assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason']);
  assert.equal(out.decision, 'block');
  assert.equal(out.reason, EXACT_MAIN_REASON);
  assert.ok(out.reason.length <= 700, `reason is ${out.reason.length} chars`);
});

test('a branch is named in the reason and passed as `branch`', async () => {
  const w = world();
  write(w, P, 'feature/pricing');
  const { reason } = JSON.parse(await run(w));
  assert.match(reason, /on branch `feature\/pricing`/);
  assert.match(reason, /branch: "feature\/pricing"/);
});

test('status says dirty: blocks; says clean: no block, and the ledger records the version', async () => {
  const dirty = world();
  write(dirty);
  assert.equal(JSON.parse(await run(dirty, {}, { callStatus: statusFrom({ '*': 'dirty' }) })).decision, 'block');

  const clean = world();
  write(clean);
  assert.equal(await run(clean, {}, { callStatus: statusFrom({ '*': 'clean' }) }), '');
  assert.equal(readLedger('s', { tmpDir: clean.tmpDir }).at(-1).kind, 'versioned');
  // And the next Stop reads the ledger alone: clean, silent, no call.
  const asked = [];
  assert.equal(await run(clean, {}, { callStatus: statusFrom({ '*': 'dirty' }, asked) }), '');
  assert.deepEqual(asked, []);
});

test('network failure trusts the ledger and blocks', async () => {
  const w = world();
  write(w);
  const out = await run(w, {}, { callStatus: statusFrom({ '*': new Error('fetch failed') }) });
  assert.equal(JSON.parse(out).decision, 'block');
});

test('a status call that never answers is cut at the budget, and the ledger is trusted', async () => {
  const w = world();
  write(w);
  const started = Date.now();
  const out = await run(w, {}, { callStatus: () => new Promise(() => {}), budgetMs: 150 });
  assert.equal(JSON.parse(out).decision, 'block');
  assert.ok(Date.now() - started < 5_000, 'the budget bounds the wait');
});

test('one episode of unversioned work earns one block, not one per turn', async () => {
  const w = world();
  write(w);
  assert.equal(JSON.parse(await run(w)).decision, 'block');
  // The agent declined (the user said not yet); the next turns wrote nothing.
  assert.equal(await run(w), '');
  assert.equal(await run(w), '');
  // New work re-opens it.
  write(w);
  assert.equal(JSON.parse(await run(w)).decision, 'block');
});

test('at most three projects are confirmed; the rest trust the ledger', async () => {
  const w = world();
  for (const id of ids.slice(0, 5)) write(w, id);
  const asked = [];
  const out = JSON.parse(await run(w, {}, { callStatus: statusFrom({ '*': 'clean' }, asked) }));
  assert.equal(asked.length, MAX_CONFIRM);
  assert.equal(out.decision, 'block');
  // The three confirmed clean are dropped; the two unasked remain, by name.
  for (const id of ids.slice(0, 3)) assert.ok(!out.reason.includes(id), `${id} was confirmed clean`);
  for (const id of ids.slice(3, 5)) assert.ok(out.reason.includes(id), `${id} is still unversioned`);
});

/* ── many branches of one project (HK-335) ───────────────────────────────── */

const BRANCHES = Array.from({ length: 20 }, (_, i) => `feat/${i}-mirror`);

/** A branches caller that answers from a table and records which projects it was asked about. */
function branchesFrom(states, askedProjects = []) {
  return async (projectId) => {
    askedProjects.push(projectId);
    if (states instanceof Error) throw states;
    return states;
  };
}

test('many pending branches of one project: one project_vcs_branches call settles them all (HK-335)', async () => {
  const w = world();
  for (const b of BRANCHES) write(w, P, b);
  const asked = [];
  const askedProjects = [];
  const states = new Map(BRANCHES.map((b) => [b, 'clean']));
  const out = await run(w, {}, { callStatus: statusFrom({ '*': 'dirty' }, asked), callBranches: branchesFrom(states, askedProjects) });
  assert.equal(out, '', 'every branch was saved as a version, so the turn is not blocked');
  assert.deepEqual(askedProjects, [P], 'one call for the whole project');
  assert.deepEqual(asked, [], 'no per-branch status calls');
  // Recorded as versioned: the next Stop reads the ledger alone.
  assert.equal(await run(w, {}, { callStatus: statusFrom({ '*': 'dirty' }, asked), callBranches: branchesFrom(null, askedProjects) }), '');
  assert.deepEqual(askedProjects, [P]);
});

test('the branches answer clears the clean branches and blocks on the dirty ones, by name', async () => {
  const w = world();
  for (const b of BRANCHES) write(w, P, b);
  const states = new Map(BRANCHES.map((b) => [b, b === 'feat/3-mirror' || b === 'feat/7-mirror' ? 'dirty' : 'clean']));
  const out = JSON.parse(await run(w, {}, { callBranches: branchesFrom(states) }));
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /feat\/3-mirror/);
  assert.match(out.reason, /feat\/7-mirror/);
  assert.doesNotMatch(out.reason, /more/, 'only the two dirty branches remain');
});

test('a branch the answer does not list, or a failed or hung branches call, trusts the ledger', async () => {
  const partial = world();
  for (const b of BRANCHES) write(partial, P, b);
  const half = new Map(BRANCHES.slice(0, 10).map((b) => [b, 'clean']));
  const out = JSON.parse(await run(partial, {}, { callBranches: branchesFrom(half) }));
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /and 7 more/, 'the ten unlisted branches stay pending');

  const failed = world();
  for (const b of BRANCHES) write(failed, P, b);
  assert.equal(JSON.parse(await run(failed, {}, { callBranches: branchesFrom(new Error('fetch failed')) })).decision, 'block');

  const hung = world();
  for (const b of BRANCHES) write(hung, P, b);
  const started = Date.now();
  const outHung = await run(hung, {}, { callBranches: () => new Promise(() => {}), budgetMs: 150 });
  assert.equal(JSON.parse(outHung).decision, 'block');
  assert.ok(Date.now() - started < 5_000, 'the budget bounds the wait');
});

test('Your site and a lone pending branch still ask project_vcs_status; the branches list is not asked', async () => {
  const w = world();
  write(w, P, 'main');
  write(w, P, 'feature/pricing');
  const asked = [];
  const askedProjects = [];
  const out = await run(w, {}, { callStatus: statusFrom({ '*': 'clean' }, asked), callBranches: branchesFrom(new Map(), askedProjects) });
  assert.equal(out, '');
  assert.deepEqual(asked.sort(), [`${P}:feature/pricing`, `${P}:main`]);
  assert.deepEqual(askedProjects, []);
});

test('end to end: a hiveku_batch answer too big to read, then the Stop settles every branch in one call (HK-335)', async () => {
  const w = world();
  // Claude Code swapped the batch's large answer for a note, so the members
  // are assumed to have written and their saves are not credited.
  const calls = BRANCHES.flatMap((b) => [
    { tool: 'project_vcs_branch_create', args: { project_id: P, branch: b } },
    { tool: 'project_import_finalize', args: { project_id: P, branch: b, key: 'imports/x.tar.gz' } },
    { tool: 'project_vcs_commit', args: { project_id: P, branch: b } },
  ]);
  const lines = classifyHookPayload({
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__plugin_hiveku_hk__hiveku_batch',
    tool_input: { calls },
    tool_response: 'Output too large (812KB). Full output saved to a file.',
  });
  assert.equal(lines.length, BRANCHES.length, 'one assumed write per branch');
  appendLedger('s', lines, { tmpDir: w.tmpDir });
  const askedProjects = [];
  const out = await run(w, {}, { callBranches: branchesFrom(new Map(BRANCHES.map((b) => [b, 'clean'])), askedProjects) });
  assert.equal(out, '');
  assert.deepEqual(askedProjects, [P]);
});

test('readBranchesAnswer: each branch by its uncommitted flag; an unreadable answer is null', () => {
  const answer = (body, extra = {}) => ({ result: { content: [{ type: 'text', text: JSON.stringify(body) }], ...extra } });
  const states = readBranchesAnswer(answer({ data: [
    { branch_name: 'main', uncommitted: false },
    { branch_name: 'feat/a', uncommitted: true },
    { branch_name: 'feat/b', uncommitted: false },
    { branch_name: 'feat/c' },
    { uncommitted: true },
  ] }));
  assert.deepEqual([...states.entries()], [['main', 'clean'], ['feat/a', 'dirty'], ['feat/b', 'clean']]);
  assert.equal(readBranchesAnswer(answer({ data: [] }, { isError: true })), null);
  assert.equal(readBranchesAnswer({ result: { content: [{ type: 'text', text: 'not json' }] } }), null);
  assert.equal(readBranchesAnswer(answer({ error: 'nope' })), null);
  assert.equal(readBranchesAnswer({ error: { message: 'x' } }), null);
});

test('several projects: one reason names up to three and counts the rest, near 700 characters', () => {
  const pairs = ids.slice(0, 5).map((project_id, i) => ({ project_id, branch: i === 1 ? 'feature/x' : 'main' }));
  const reason = blockReason(pairs);
  assert.match(reason, /and 2 more/);
  assert.match(reason, /on branch `feature\/x`/);
  assert.match(reason, /Updated the pricing section on the Home page/);
  assert.match(reason, /with NO files/);
  assert.ok(reason.length <= 760, `reason is ${reason.length} chars`);
});

test('both reasons say the version holds everyone else\'s unsaved changes, and to read the status first', () => {
  // A no-files version on Your site holds the editor's, the in-app AI's and
  // other sessions' unsaved changes too; a name that covers only this
  // session's part would sit in the owner's history for good.
  const one = blockReason([{ project_id: P, branch: 'main' }]);
  const several = blockReason(ids.slice(0, 2).map((project_id) => ({ project_id, branch: 'main' })));
  for (const reason of [one, several]) {
    assert.match(reason, /It also holds others' unsaved changes/);
    assert.match(reason, /project_vcs_status\(\{ project_id, detail: "files" \}\)` first and name it for all of it/);
  }
});

/* ── stop_hook_active ────────────────────────────────────────────────────── */

test('stop_hook_active: never blocks, tells the person once in plain words, asks no one', async () => {
  const w = world();
  write(w);
  write(w, ids[0], 'feature/x');
  const asked = [];
  const text = await run(w, { stop_hook_active: true }, { callStatus: statusFrom({ '*': 'dirty' }, asked) });
  const out = JSON.parse(text);
  assert.deepEqual(Object.keys(out), ['systemMessage']);
  assert.match(out.systemMessage, /Your site \(project 6d676101\)/);
  assert.match(out.systemMessage, /the branch "feature\/x"/);
  assert.match(out.systemMessage, /not a named version yet/);
  assert.doesNotMatch(out.systemMessage, /commit|HEAD|revert|\bmain\b/i);
  // Only saves that happen today are promised: the one before a publish. No
  // timed automatic save (that sweeper is not live), so no "in a few minutes".
  assert.match(out.systemMessage, /before the next publish/);
  assert.doesNotMatch(out.systemMessage, /minute/i);
  assert.deepEqual(asked, [], 'the notice path makes no network call');
  // Once: the same unversioned work does not produce a second notice.
  assert.equal(await run(w, { stop_hook_active: true }), '');
});

test('the notice is plain language for any set of projects', () => {
  const text = unversionedNotice(ids.slice(0, 5).map((project_id) => ({ project_id, branch: 'main' })));
  assert.match(text, /and 2 more/);
  assert.match(text, /^Hiveku: /);
  assert.doesNotMatch(text, /commit|HEAD|revert|\bmain\b/i);
});

/* ── the opt-out ─────────────────────────────────────────────────────────── */

function withGuardrails(w, content, sub = '') {
  const dir = path.join(w.cwd, sub);
  fs.mkdirSync(path.join(dir, '.hiveku'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.hiveku', 'guardrails.json'), typeof content === 'string' ? content : JSON.stringify(content));
}

test('opt-out: "version_reminder": false in .hiveku/guardrails.json silences both paths', async () => {
  const w = world();
  withGuardrails(w, { version: 1, mode: 'full', version_reminder: false });
  write(w);
  const asked = [];
  assert.equal(await run(w, {}, { callStatus: statusFrom({ '*': 'dirty' }, asked) }), '');
  assert.equal(await run(w, { stop_hook_active: true }), '');
  assert.deepEqual(asked, []);
});

test('opt-out is found walking up from a subfolder, and is never inferred', async () => {
  const w = world();
  withGuardrails(w, { version_reminder: false });
  const sub = path.join(w.cwd, 'projects', 'site');
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(versionReminderOptedOut(sub, { homeDir: w.homeDir }), true);
  for (const content of [{ version_reminder: true }, { version_reminder: 'false' }, { mode: 'reads-only' }, '{ not json']) {
    const other = world();
    withGuardrails(other, content);
    assert.equal(versionReminderOptedOut(other.cwd, { homeDir: other.homeDir }), false, JSON.stringify(content));
    write(other);
    assert.equal(JSON.parse(await run(other)).decision, 'block', `${JSON.stringify(content)} must not opt out`);
  }
  // A file at the home directory itself is ignored, as the guardrails loader does.
  const w2 = world();
  fs.mkdirSync(path.join(w2.homeDir, '.hiveku'), { recursive: true });
  fs.writeFileSync(path.join(w2.homeDir, '.hiveku', 'guardrails.json'), JSON.stringify({ version_reminder: false }));
  const insideHome = path.join(w2.homeDir, 'client');
  fs.mkdirSync(insideHome);
  assert.equal(versionReminderOptedOut(insideHome, { homeDir: w2.homeDir }), false);
});

/* ── failure-open ────────────────────────────────────────────────────────── */

test('a thrown error anywhere is silent', async () => {
  const w = world();
  write(w);
  const hostile = { get session_id() { throw new Error('boom'); } };
  assert.equal(await runStopHook(hostile, { tmpDir: w.tmpDir }), '');
  assert.equal(await runStopHook(null, { tmpDir: w.tmpDir }), '');
  assert.equal(await runStopHook(undefined), '');
});

/* ── the status answer ───────────────────────────────────────────────────── */

test('readStatusAnswer: clean only on a stated false with a known reason', () => {
  const res = (data, extra = {}) => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify({ data }) }], ...extra } });
  assert.equal(readStatusAnswer(res({ uncommitted: false, uncommitted_reason: null })), 'clean');
  assert.equal(readStatusAnswer(res({ uncommitted: true, uncommitted_reason: 'changed' })), 'dirty');
  assert.equal(readStatusAnswer(res({ uncommitted: false, uncommitted_reason: 'unknown', latest_changes: null })), 'unknown');
  assert.equal(readStatusAnswer(res({})), 'unknown');
  // Unknown tool on an older server, an error result, a JSON-RPC error, garbage.
  assert.equal(readStatusAnswer(res({ uncommitted: false }, { isError: true })), 'unknown');
  assert.equal(readStatusAnswer({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Unknown tool' } }), 'unknown');
  assert.equal(readStatusAnswer({ result: { content: [{ type: 'text', text: '<html>404</html>' }] } }), 'unknown');
  assert.equal(readStatusAnswer(null), 'unknown');
});

test('confirmPairs: a throw is unknown, a hang is cut, answers keep their order', async () => {
  const pairs = [{ project_id: 'a', branch: 'main' }, { project_id: 'b', branch: 'main' }, { project_id: 'c', branch: 'main' }];
  const answers = await confirmPairs(pairs, {
    budgetMs: 100,
    callStatus: async (p) => {
      if (p.project_id === 'a') return 'clean';
      if (p.project_id === 'b') throw new Error('x');
      return new Promise(() => {});
    },
  });
  assert.deepEqual(answers, ['clean', 'unknown', 'unknown']);
});

test('the real status caller answers unknown when the folder is not bound', async () => {
  const cwd = tmp('hk-stop-unbound-');
  const call = upstreamStatusCaller(cwd);
  assert.equal(await call({ project_id: P, branch: 'main' }), 'unknown');
});

/* ── the real hook processes ─────────────────────────────────────────────── */

function hook(which, payload, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'bin', 'hiveku'), 'hook', which], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

test('bin/hiveku: post-tool-use records the write, stop blocks, and both exit 0', { timeout: 120_000 }, async () => {
  const tmpDir = tmp('hk-e2e-tmp-');
  const cwd = tmp('hk-e2e-cwd-');
  const dataDir = tmp('hk-e2e-data-');
  const env = { TMPDIR: tmpDir, HIVEKU_PLUGIN_DATA: dataDir };
  const session = `e2e-${process.pid}`;

  const post = await hook('post-tool-use', {
    hook_event_name: 'PostToolUse', session_id: session, cwd,
    tool_name: 'mcp__plugin_hiveku_hk__project_files_bulk_save',
    tool_input: { project_id: P, files: [{ path: 'src/app/page.tsx', content: 'x' }] },
    tool_response: [{ type: 'text', text: JSON.stringify({ data: { uncommitted: true } }) }],
  }, env);
  assert.equal(post.code, 0, post.stderr);
  assert.equal(post.stdout, '', 'the PostToolUse hook prints nothing');
  assert.equal(readLedger(session, { tmpDir }).length, 1);

  // The folder is not bound, so the confirm step cannot ask: the ledger is trusted.
  const started = Date.now();
  const stop = await hook('stop', { hook_event_name: 'Stop', session_id: session, cwd, stop_hook_active: false }, env);
  assert.equal(stop.code, 0, stop.stderr);
  const out = JSON.parse(stop.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, new RegExp(P));
  assert.ok(Date.now() - started < 20_000, 'the Stop hook finishes inside its 20 s timeout');

  // The same session after the agent declined (stop_hook_active): the person
  // gets the notice once, no block.
  const again = await hook('stop', { hook_event_name: 'Stop', session_id: session, cwd, stop_hook_active: true }, env);
  assert.equal(again.code, 0);
  assert.match(JSON.parse(again.stdout).systemMessage, /not a named version yet/);
});

test('bin/hiveku: stop with no ledger prints nothing and exits 0', { timeout: 60_000 }, async () => {
  const tmpDir = tmp('hk-e2e-tmp-');
  const r = await hook('stop', { hook_event_name: 'Stop', session_id: 'never-wrote', cwd: tmp() }, { TMPDIR: tmpDir, HIVEKU_PLUGIN_DATA: tmp() });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '');
});
