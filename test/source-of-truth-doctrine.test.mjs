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
 *       closer every command ends with;
 *   (d) a local copy is re-read live before it is acted on (/hiveku:knowledge
 *       and orient).
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
 * src/services/mcp-instructions.service.ts (MCP #100, live 2026-10-03), line
 * breaks included. The plugin says the same words: change both together.
 */
const MCP_PARAGRAPH = `Hiveku Memory is the source of truth for this business: read it
  before you act, and follow it over your own assumptions, local files
  or earlier conversation. When something disagrees with memory, trust
  memory and say so. When \`memory_log_add\` is listed, record your
  work: a Doing line when you start a task for the person and a Done
  line when it ends. Save what you learned with the memory_* tools.`;

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
  // (d) a local copy is a mirror: re-read live, merge, send the version read.
  has(text, /A local copy is a mirror, and memory wins\./);
  has(text, /re-read the entry live \(`memory_get\(\{ memory_id \}\)`/);
  has(text, /send its `version` as `expected_version`/);
  // (c) the two call forms, one thread, and what a line may hold.
  has(text, /memory_log_add\(\{ phase: "doing", department, line, thread \}\)/);
  has(text, /memory_log_add\(\{ phase: "done", department, line, thread, outcome \}\)` with the same `thread`/);
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
  // (c) the closing section closes the Doing line.
  const ending = text.slice(text.indexOf('## Ending a session'), text.indexOf('## Offer the next play'));
  has(ending, /\*\*Close the work's Doing line\.\*\*/);
  has(ending, /memory_log_add\(\{ phase: "done", department, line, thread, outcome \}\)/);
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

test('(c) every command that carries the session closer records the Doing and Done lines', () => {
  const dir = path.join(root, 'commands');
  const carriers = [];
  const missing = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!text.includes('Finish every session of work the same way:')) continue;
    carriers.push(f);
    const closer = text.split('\n').find((line) => line.includes('Finish every session of work the same way:'));
    const doing = closer.indexOf('`memory_log_add({ phase: "doing", department: "<dept>", line, thread })`');
    const done = closer.indexOf('`memory_log_add({ phase: "done", department: "<dept>", line, thread, outcome })`');
    if (doing < 0 || done < doing || !closer.includes('when `memory_log_add` is listed')) missing.push(f);
  }
  assert.ok(carriers.length >= 90, `only ${carriers.length} closer carriers found`);
  assert.deepEqual(missing, [], `these closers do not record the Doing and Done lines:\n  ${missing.join('\n  ')}`);
});

test('(d) /hiveku:knowledge says the files are a mirror and re-reads an entry before acting on one', () => {
  const text = flat(read('commands/knowledge.md'));
  has(text, /\*\*The files here are a mirror, and memory wins\.\*\*/);
  has(text, /re-read the entry live \(`memory_get\(\{ memory_id \}\)` with the `id` in the file's front matter\)/);
  has(text, /where it disagrees with the file, trust memory and say so/);
  has(text, /send its `version` as `expected_version`/);
  // The mirror rule comes before the write steps it governs.
  assert.ok(text.indexOf('The files here are a mirror') < text.indexOf('To change knowledge, use the live memory_* MCP tools'));
});
