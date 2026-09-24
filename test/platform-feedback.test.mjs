/**
 * The agent feedback loop on the plugin side
 * (notes/DESIGN-agent-feedback-loop-2026-09-24.md, section 8).
 *
 * Four core tools let a session report a Hiveku defect, ask for a missing
 * capability, and hear back. Three things must hold here:
 *   - the four are advertised without a search and survive a focus filter,
 *     because a session whose tool just failed will not think to search;
 *   - the sweep can never call a filing tool: scripts/sweep-tools.mjs calls
 *     exactly what isAutoApprovable accepts, and a sweep that filed reports
 *     would flood the Hiveku team's queue from live accounts;
 *   - the rules reach a bound session through the two channels this plugin
 *     owns (the shim's initialize instructions and the session-start hook) as
 *     static text, with nothing server-supplied spliced in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable, Writable } from 'node:stream';
import { CORE_TOOLS, FIND_TOOL_NAME, indexModeTools } from '../lib/tool-index.mjs';
import { ALWAYS_AVAILABLE, filterTools } from '../lib/tool-focus.mjs';
import { isAutoApprovable } from '../lib/tool-safety.mjs';
import { runShim } from '../lib/shim.mjs';
import { writeBinding } from '../lib/binding.mjs';

const FEEDBACK = ['hiveku_report_issue', 'hiveku_request_feature', 'hiveku_feedback_status', 'hiveku_feedback_followup'];
const WRITES = ['hiveku_report_issue', 'hiveku_request_feature', 'hiveku_feedback_followup'];
const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const LABEL = 'Planted Label Acme';

test('the feedback tools are advertised without a search and survive a focus filter', () => {
  for (const name of FEEDBACK) {
    assert.ok(CORE_TOOLS.includes(name), `${name} must be in CORE_TOOLS`);
    assert.ok(ALWAYS_AVAILABLE.has(name), `${name} must be in ALWAYS_AVAILABLE`);
  }
  const upstream = [...FEEDBACK, 'crm_contact_delete', 'ppc_budget_update'].map((name) => ({ name }));
  assert.deepEqual(indexModeTools(upstream).map((t) => t.name), [FIND_TOOL_NAME, ...FEEDBACK]);
  assert.deepEqual(filterTools(upstream, 'ppc').map((t) => t.name), [...FEEDBACK, 'ppc_budget_update']);
});

test('the sweep can never file a report: no feedback write is auto-approvable', () => {
  for (const name of WRITES) {
    assert.equal(isAutoApprovable(name, {}), false, `${name} would be called by scripts/sweep-tools.mjs`);
  }
});

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

test('a bound session is told the feedback rules as static text; an unbound folder is not', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-feedback-'));
  try {
    const bound = path.join(tmp, 'bound');
    const unbound = path.join(tmp, 'unbound');
    const dataDir = path.join(tmp, 'data');
    await fs.mkdir(unbound, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await writeBinding(bound, { accountId: ACCOUNT, label: LABEL, keyPreview: 'hvk_test' });
    await fs.writeFile(
      path.join(dataDir, 'credentials.json'),
      JSON.stringify({ version: 1, accounts: { [ACCOUNT]: { key: 'hvk_test', label: LABEL, key_preview: 'hvk_test' } } }),
    );

    const [binding, block, ...rest] = (await initializeInstructions(bound, dataDir)).split('\n\n');
    assert.match(binding, /Hiveku is bound to/);
    assert.ok(block && rest.length === 0, 'the feedback block follows the binding paragraph');
    for (const name of WRITES) assert.ok(block.includes(name), `the block must name ${name}`);
    assert.match(block, /only if it changes what they get/);
    assert.match(block, /No error codes, blame, guesses or promised times/);
    assert.ok(block.split('\n').length <= 8, 'the short form stays at eight lines or fewer');
    assert.ok(!block.includes(ACCOUNT) && !block.includes(LABEL), 'nothing account-specific reaches the block');

    assert.doesNotMatch(await initializeInstructions(unbound, dataDir), /hiveku_report_issue/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('the session-start hook names the feedback tools in exactly one static line', async () => {
  const src = await fs.readFile(new URL('../bin/hiveku', import.meta.url), 'utf8');
  const pushes = [...src.matchAll(/lines\.push\(([\s\S]*?)\);/g)]
    .map((m) => m[1])
    .filter((body) => body.includes('hiveku_report_issue'));
  assert.equal(pushes.length, 1, 'exactly one session-start line names the report tool');
  assert.ok(!pushes[0].includes('${'), 'the feedback line must be static: nothing interpolated into it');
  assert.match(pushes[0], /hiveku_request_feature/);
  assert.match(pushes[0], /hiveku-orient/);
});
