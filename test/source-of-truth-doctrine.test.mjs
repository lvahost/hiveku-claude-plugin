/**
 * Hiveku Memory is the source of truth (Abe, 2026-10-03: "This memory needs to
 * be the source of truth and the agents know it and obey it"; plan
 * notes/memory-pages-audit-2026-09-22/agent-log-source-of-truth-plan-2026-10-03.md,
 * sections 3 and 4), on the plugin side:
 *
 *   (a) the rule, in the same words as the MCP server's own instructions
 *       (MCP #100), reaches every bound session through the shim's initialize
 *       instructions (the shim answers initialize itself, so the server's
 *       paragraph never arrives), and hiveku-orient carries it with the
 *       local-copy and Doing/Done rules;
 *   (b) a refused memory write (403 memory_write_refused, builder #486; MCP #101
 *       puts its message, memory_page_url and hint at the top of the tool
 *       error) is named apart from "one sensible retry, then report" in every
 *       channel that states that rule: the shim, the session-start hook and
 *       hiveku-orient. Without it the general rule turned a deliberate refusal
 *       into a retry and a bogus report, and the person never saw the sentence;
 *   (c) Doing and Done lines with memory_log_add: advertised up front, never
 *       pre-approved, taught in orient's closing section and in the canonical
 *       closer every command ends with. Since MCP #174 the server writes a
 *       connected app's Doing at the session's first change and its Done when
 *       the session goes quiet or ends, so the plugin teaches a Done at the end
 *       in the model's own words (no `thread`: the server sets the session's),
 *       and a Doing sent once one is recorded answers already_open;
 *   (d) a local copy is re-read live before it is acted on (/hiveku:knowledge,
 *       /hiveku:pull and orient), About your business with account_memory_get
 *       (MCP #174: memory_list and memory_get leave it out).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  FEEDBACK_INSTRUCTIONS,
  MEMORY_EDIT_INSTRUCTIONS,
  SOURCE_OF_TRUTH_INSTRUCTIONS,
  WORK_LOG_INSTRUCTIONS,
  runShim,
} from '../lib/shim.mjs';
import { CORE_TOOLS, FIND_TOOL_NAME, indexModeTools } from '../lib/tool-index.mjs';
import { isAutoApprovable } from '../lib/tool-safety.mjs';
import { writeBinding } from '../lib/binding.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ').trim();
/** A match on a long text that names the pattern, not the whole text, when it fails. */
const has = (text, re) => assert.ok(re.test(text), `missing: ${re}`);
const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const LABEL = 'Planted Label Acme';

/**
 * The MCP server's paragraph, as it stands in hiveku-mcp-api-server
 * src/services/mcp-instructions.service.ts (MCP #100, live 2026-10-03, with
 * the two sentences MCP #174 adds), line breaks included. The plugin says the
 * same words: change both together.
 */
const MCP_PARAGRAPH = `Hiveku Memory is the source of truth for this business: read it
  before you act, and follow it over your own assumptions, local files
  or earlier conversation. When something disagrees with memory, trust
  memory and say so. About your business is read with
  \`account_memory_get\`; memory_list and memory_get leave it out. A
  local copy (ACCOUNT_MEMORY.md and the like) may be out of date: read
  it again from Hiveku before you act on it. When \`memory_log_add\` is
  listed, record your work: a Doing line when you start a task for the
  person and a Done line when it ends. Save what you learned with the
  memory_* tools.`;

/** The rule itself, and the two sentences MCP #174 puts right after it, word for word. */
const SOURCE_OF_TRUTH =
  'Hiveku Memory is the source of truth for this business: read it before you act, and follow it over your own assumptions, local files or earlier conversation. When something disagrees with memory, trust memory and say so.';
const ABOUT_YOUR_BUSINESS =
  'About your business is read with `account_memory_get`; memory_list and memory_get leave it out.';
const LOCAL_COPY =
  'A local copy (ACCOUNT_MEMORY.md and the like) may be out of date: read it again from Hiveku before you act on it.';

/** The rule, then the two sentences, each once and in that order with nothing between. */
function assertRuleThenSentences(text, where) {
  const folded = flat(text);
  assert.equal(folded.split(SOURCE_OF_TRUTH).length, 2, `${where}: the source-of-truth sentence, word for word, once`);
  assert.ok(
    folded.includes(`${SOURCE_OF_TRUTH} ${ABOUT_YOUR_BUSINESS} ${LOCAL_COPY}`),
    `${where}: the two sentences, word for word, right after the source-of-truth sentence`,
  );
}

/** What a Doing/Done teaching says since MCP #174, in any of the plugin's wordings. */
function assertWorkLog(text, where) {
  const folded = flat(text);
  assert.match(folded, /Hiveku records (this|the) session's (work in the memory log itself: its )?Doing/, `${where}: Hiveku records the Doing`);
  assert.match(folded, /goes quiet/, `${where}: the Done when the session goes quiet`);
  assert.match(folded, /`thread` out/, `${where}: leave thread out`);
  assert.doesNotMatch(folded, /line, thread(, outcome)? \}\)/, `${where}: no call form with thread`);
  assert.doesNotMatch(folded, /with the same `thread`|the same `thread`/, `${where}: no "the same thread"`);
}

/** The carve-out every channel states, in any of the plugin's wordings. */
function assertRefusalCarveOut(text, where) {
  assert.match(text, /memory_write_refused/, `${where}: must name memory_write_refused`);
  assert.match(text, /message/, `${where}: must say to show the message`);
  assert.match(text, /link|memory_page_url/, `${where}: must say to give the link`);
  assert.match(
    text,
    /do not retry it or report it|never retry it unchanged or report it/,
    `${where}: must say not to retry it or report it`,
  );
}

/** One initialize round-trip through the shim; returns the instructions it answers with. */
async function initializeInstructions(projectDir, dataDir) {
  const chunks = [];
  const stdout = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const stdin = Readable.from([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n']);
  await runShim({ projectDir, dataDir, stdin, stdout });
  return JSON.parse(chunks.join('').trim().split('\n')[0]).result.instructions;
}

test('(a) the shim states the rule in the MCP server\'s own words', () => {
  assert.equal(flat(SOURCE_OF_TRUTH_INSTRUCTIONS), flat(MCP_PARAGRAPH));
  assert.ok(!SOURCE_OF_TRUTH_INSTRUCTIONS.includes('${'), 'static text only');
});

test('(a, d) the two MCP #174 sentences follow the rule word for word, in the shim and in orient', () => {
  assertRuleThenSentences(MCP_PARAGRAPH, 'the pinned MCP paragraph');
  assertRuleThenSentences(SOURCE_OF_TRUTH_INSTRUCTIONS, 'the shim');
  assertRuleThenSentences(read('skills/hiveku-orient/SKILL.md'), 'hiveku-orient');
});

test('(a, d) the sentence check fails on a removed or reworded sentence (negative control)', () => {
  const removed = SOURCE_OF_TRUTH_INSTRUCTIONS.replace(`${ABOUT_YOUR_BUSINESS} `, '');
  assert.throws(() => assertRuleThenSentences(removed, 'without About your business'));
  const reworded = SOURCE_OF_TRUTH_INSTRUCTIONS.replace('may be out of date', 'can be stale');
  assert.throws(() => assertRuleThenSentences(reworded, 'reworded local copy'));
  const moved = SOURCE_OF_TRUTH_INSTRUCTIONS.replace(`${LOCAL_COPY} `, '') + ` ${LOCAL_COPY}`;
  assert.throws(() => assertRuleThenSentences(moved, 'local copy moved away from the rule'));
  assert.throws(() => assert.equal(flat(removed), flat(MCP_PARAGRAPH)), 'the word-for-word check fails too');
});

test('(c) the shim says what Hiveku records itself, right after the rule, as static text', () => {
  assertWorkLog(WORK_LOG_INSTRUCTIONS, 'WORK_LOG_INSTRUCTIONS');
  assert.match(WORK_LOG_INSTRUCTIONS, /send a Done with `memory_log_add` and a one-line summary of what you did, if you want the log to say more than the count of changes/);
  assert.ok(!WORK_LOG_INSTRUCTIONS.includes('${'), 'static text only');
});

test('(a) a bound folder is told the rule before the memory edit rules; an unbound folder is not', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hiveku-sot-'));
  try {
    const bound = path.join(tmp, 'bound');
    const unbound = path.join(tmp, 'unbound');
    const dataDir = path.join(tmp, 'data');
    await fsp.mkdir(unbound, { recursive: true });
    await fsp.mkdir(dataDir, { recursive: true });
    await writeBinding(bound, { accountId: ACCOUNT, label: LABEL, keyPreview: 'hvk_test' });
    await fsp.writeFile(
      path.join(dataDir, 'credentials.json'),
      JSON.stringify({ version: 1, accounts: { [ACCOUNT]: { key: 'hvk_test', label: LABEL, key_preview: 'hvk_test' } } }),
    );
    const [binding, block, ...rest] = (await initializeInstructions(bound, dataDir)).split('\n\n');
    assert.equal(rest.length, 0, 'still two paragraphs: the binding paragraph and the feedback block');
    const rule = binding.indexOf(SOURCE_OF_TRUTH_INSTRUCTIONS);
    assert.ok(rule > 0, 'the binding paragraph carries the rule');
    assert.equal(
      binding.indexOf(WORK_LOG_INSTRUCTIONS),
      rule + SOURCE_OF_TRUTH_INSTRUCTIONS.length + 1,
      'what Hiveku records itself follows the rule',
    );
    assert.ok(binding.indexOf(MEMORY_EDIT_INSTRUCTIONS) > rule, 'the rule comes before the memory edit rules');
    assertRefusalCarveOut(block, 'the initialize feedback block');
    assert.doesNotMatch(await initializeInstructions(unbound, dataDir), /source of truth|memory_log_add/);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('(b) the shim feedback block names a refused memory write apart, and stays short and static', () => {
  assertRefusalCarveOut(FEEDBACK_INSTRUCTIONS, 'FEEDBACK_INSTRUCTIONS');
  assert.match(FEEDBACK_INSTRUCTIONS, /deliberate, not a fault: nothing was written/);
  // The one resend the MCP hint asks for (detail unclear_owner) is not a retry of the same call.
  assert.match(FEEDBACK_INSTRUCTIONS, /rewrite an unclear department line and send the change again/);
  assert.ok(FEEDBACK_INSTRUCTIONS.split('\n').length <= 8, 'the short form stays at eight lines or fewer');
  // The general rule is still there: the carve-out narrows it, it does not replace it.
  assert.match(FEEDBACK_INSTRUCTIONS, /one sensible retry with checked input has not fixed it: report it with hiveku_report_issue/);
});

test('(b) the carve-out detector fails on the block as it was before (negative control)', () => {
  const before = FEEDBACK_INSTRUCTIONS.split('\n').filter((line) => !line.includes('memory_write_refused')).join('\n');
  assert.throws(() => assertRefusalCarveOut(before, 'the old block'));
});

test('(b) the session-start line carves the refusal out of retry-then-report, as static text', () => {
  const src = read('bin/hiveku');
  const pushes = [...src.matchAll(/lines\.push\(([\s\S]*?)\);/g)]
    .map((m) => m[1])
    .filter((body) => body.includes('hiveku_report_issue'));
  assert.equal(pushes.length, 1, 'exactly one session-start line names the report tool');
  assert.ok(!pushes[0].includes('${'), 'the line is static: nothing interpolated into it');
  const line = pushes[0].replace(/'\s*\+\s*'/g, '');
  assertRefusalCarveOut(line, 'the session-start line');
  assert.match(line, /follow its hint/);
});

test('(a, b, c, d) hiveku-orient carries the rule in the same words, with the local-copy, Doing/Done and refusal rules', () => {
  const orient = read('skills/hiveku-orient/SKILL.md');
  const text = flat(orient);
  assert.ok(text.includes(flat(MCP_PARAGRAPH)), 'orient states the rule in the MCP server\'s words');
  // (d) a local copy is a mirror: re-read live, merge, send the version read; About your
  // business with account_memory_get; department data with the tool its file names.
  has(text, /A local copy is a mirror, and memory wins\./);
  has(text, /re-read the entry live \(`memory_get\(\{ memory_id \}\)`/);
  has(text, /About your business, `hiveku-data\/account\/ACCOUNT_MEMORY\.md`, with `account_memory_get`/);
  has(text, /before you act on a row, read it again live with the tool its file names/);
  has(text, /send its `version` as `expected_version`/);
  // (c) what Hiveku records itself, the Done in the model's words, the optional Doing, and
  // what a line may hold.
  const work = text.slice(text.indexOf('**Doing and Done lines.**'), text.indexOf('## Non-negotiables'));
  assertWorkLog(work, 'orient "Doing and Done lines"');
  has(work, /its Doing at the session's first change for an agent, and its Done when the session goes quiet or ends/);
  has(work, /send a Done with a one-line summary of what you did, if you want the log to say more/);
  has(work, /`memory_log_add\(\{ phase: "done", department, line, outcome \}\)`\. It closes the session's run with your line\./);
  has(work, /`memory_log_add\(\{ phase: "doing", department, line \}\)`, becomes the session's Doing/);
  has(work, /answers `already_open`, which is not an error/);
  has(work, /`result` \(`written`, `already_open`, `refused`, `not_installed` or `error`\) never needs a retry/);
  has(text, /Never a customer's words, a secret or anyone's personal details\./);
  has(text, /memory_log_list\(\{ kind: "doing,done" \}\)/);
  // (b) the refusal: what it is, what to show, the one resend.
  const refusal = text.slice(text.indexOf('**A refused memory write is an answer, not a fault.**'));
  assert.ok(refusal.length < text.length, 'the refusal paragraph is there');
  has(refusal, /403 `memory_write_refused`, with `message` \(one plain sentence\), `memory_page_url` and `hint`/);
  has(refusal, /do not retry it or report it with `hiveku_report_issue`/);
  has(refusal, /`detail: "unclear_owner"`/);
  const defects = text.slice(text.indexOf('**Not Hiveku defects - file nothing.**'));
  assertRefusalCarveOut(defects.slice(0, 600), 'orient "Not Hiveku defects"');
  // (c) the closing section closes the Doing line with the model's own Done.
  const ending = text.slice(text.indexOf('## Ending a session'), text.indexOf('## Offer the next play'));
  has(ending, /\*\*Close the work's Doing line\.\*\*/);
  has(ending, /Hiveku closes the session's Doing itself when the session goes quiet or ends/);
  has(ending, /memory_log_add\(\{ phase: "done", department, line, outcome \}\)/);
  has(ending, /if you want the log to say more than the count of changes/);
  assert.doesNotMatch(ending, /line, thread(, outcome)? \}\)|the same `thread`/, 'the closing section sends no thread');
});

test('(c) the Doing/Done check fails on the doctrine before MCP #174 (negative control)', () => {
  const before =
    'When you start a piece of work for the person, record `memory_log_add({ phase: "doing", department, line, thread })`, ' +
    'and when it ends, `memory_log_add({ phase: "done", department, line, thread, outcome })` with the same `thread`.';
  assert.throws(() => assertWorkLog(before, 'the old orient bullet'));
  const restored = read('skills/hiveku-orient/SKILL.md').replace(
    '`memory_log_add({ phase: "done", department, line, outcome })`',
    '`memory_log_add({ phase: "done", department, line, thread, outcome })` with the same `thread`',
  );
  const work = flat(restored).slice(flat(restored).indexOf('**Doing and Done lines.**'));
  assert.throws(() => assertWorkLog(work.slice(0, 2000), 'orient with the old Done call restored'));
});

test('(c) memory_log_add is advertised up front, only when the server offers it, and never pre-approved', () => {
  assert.ok(CORE_TOOLS.includes('memory_log_add'));
  const offered = indexModeTools([{ name: 'memory_log_add' }, { name: 'memory_update' }]).map((t) => t.name);
  assert.deepEqual(offered, [FIND_TOOL_NAME, 'memory_log_add']);
  assert.deepEqual(indexModeTools([{ name: 'memory_update' }]).map((t) => t.name), [FIND_TOOL_NAME]);
  // A write: the sweep never calls it and the plugin never vouches for it.
  assert.equal(isAutoApprovable('memory_log_add', { phase: 'doing', department: 'seo', line: 'x', thread: 't1' }), false);
  assert.ok(!JSON.parse(read('lib/readonly-tools.json')).tools.includes('memory_log_add'));
});

/** The closer's memory-log part since MCP #174: Hiveku records the run, the model ends with its own Done. */
function closerRecordsTheWork(closer) {
  const hiveku = closer.indexOf("Hiveku records the session's Doing in the memory log at its first change, and its Done, counting the changes, when the session goes quiet.");
  const done = closer.indexOf('`memory_log_add({ phase: "done", department: "<dept>", line, outcome })`');
  return (
    hiveku >= 0 &&
    done > hiveku &&
    closer.includes('When `memory_log_add` is listed, end with a Done line that says what you did') &&
    closer.includes('leave `thread` out') &&
    closer.includes('answers `already_open`, which is not an error') &&
    !/line, thread(, outcome)? \}\)|the same `thread`/.test(closer)
  );
}

test('(c) every command that carries the session closer ends with its own Done line, and sends no thread', () => {
  const dir = path.join(root, 'commands');
  const carriers = [];
  const missing = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!text.includes('Finish every session of work the same way:')) continue;
    carriers.push(f);
    const closer = text.split('\n').find((line) => line.includes('Finish every session of work the same way:'));
    if (!closerRecordsTheWork(closer)) missing.push(f);
  }
  assert.ok(carriers.length >= 90, `only ${carriers.length} closer carriers found`);
  assert.deepEqual(missing, [], `these closers do not teach the Done line as Hiveku records the run now:\n  ${missing.join('\n  ')}`);
});

test('(c) the closer check fails on the closer before MCP #174 (negative control)', () => {
  const old =
    'Finish every session of work the same way: ... Record the work in the memory log when `memory_log_add` is listed: a Doing line before the first step ' +
    '(`memory_log_add({ phase: "doing", department: "<dept>", line, thread })`) and a Done line at the end ' +
    '(`memory_log_add({ phase: "done", department: "<dept>", line, thread, outcome })`, the same `thread`, `outcome` ok, failed or stopped).';
  assert.equal(closerRecordsTheWork(old), false);
  const current = read('commands/kb-gaps.md').split('\n').find((line) => line.includes('Finish every session of work the same way:'));
  assert.equal(closerRecordsTheWork(current), true);
  assert.equal(closerRecordsTheWork(current.replace('line, outcome })', 'line, thread, outcome })')), false, 'a thread put back fails');
});

test('(d) /hiveku:knowledge says the files are a mirror and re-reads an entry before acting on one', () => {
  const text = flat(read('commands/knowledge.md'));
  has(text, /\*\*The files here are a mirror, and memory wins\.\*\*/);
  has(text, /re-read the entry live \(`memory_get\(\{ memory_id \}\)` with the `id` in the file's front matter\)/);
  has(text, /where it disagrees with the file, trust memory and say so/);
  has(text, /send its `version` as `expected_version`/);
  // About your business has no id in front matter, and memory_get does not return it.
  has(text, /About your business \(`hiveku-data\/account\/ACCOUNT_MEMORY\.md`, below\) is read again with `account_memory_get`: memory_list and memory_get leave it out\./);
  // The mirror rule comes before the write steps it governs.
  assert.ok(text.indexOf('The files here are a mirror') < text.indexOf('To change knowledge, use the live memory_* MCP tools'));
});

/** /hiveku:pull still pulls, and says the files are a copy to read again from Hiveku before acting. */
function assertPullRereads(text, where) {
  assert.match(text, /the files are a copy of the last pull, and Hiveku is the source of truth: read anything again from Hiveku before you act on it/, `${where}: the opening says the files are a copy`);
  assert.match(text, /The files are a copy of the last pull and may be out of date: Hiveku, not this folder, is the source of truth\. Before you act on anything in them, read it again from Hiveku with the live tools/, `${where}: re-read before acting`);
  assert.match(text, /`account_memory_get` for About your business/, `${where}: names account_memory_get`);
  assert.match(text, /It may be out of date: before you act on it, read it again with `account_memory_get`/, `${where}: the ACCOUNT_MEMORY.md copy too`);
  assert.doesNotMatch(text, /Local files beat live tool calls|work from these\s+files|analysis can then run entirely on disk/, `${where}: no longer says to work from the snapshot`);
}

test('(d) /hiveku:pull still pulls, and says to read again from Hiveku before acting on a file', () => {
  const raw = read('commands/pull.md');
  assertPullRereads(flat(raw), '/hiveku:pull');
  // Still the pull command: same runner, same arguments.
  assert.match(raw, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hiveku" pull --list/);
  assert.match(raw, /--dataset <dept>:<id>/);
  // The runner's own closing line says the same.
  assert.match(read('lib/pulldata.mjs'), /is a copy of this pull: read anything again from Hiveku before you act on it/);
  assert.doesNotMatch(read('lib/pulldata.mjs'), /work from these local files/);
});

test('(d) the pull check fails on the snapshot instruction as it was (negative control)', () => {
  const old = flat(read('commands/pull.md')).replace(
    /The files are a copy of the last pull and may be out of date:[\s\S]*?then refresh/,
    'Data is a SNAPSHOT: work from these files for reading and analysis, but make changes through the live MCP tools, then refresh',
  );
  assert.throws(() => assertPullRereads(old, 'the old pull.md'));
});
