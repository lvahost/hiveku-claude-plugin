/**
 * The transcript-assertion helper (lib/transcript.mjs). The bug worth testing
 * is not "does a clean transcript pass" - it is "does a dirty one FAIL, with a
 * message a grader can print verbatim": the tool, the expected and actual
 * counts, and the transcript index of the offending call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertCalledExactly,
  assertEveryCall,
  assertNeverCalled,
  callsTo,
  countCalls,
  loadTranscript,
} from '../lib/transcript.mjs';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hk-transcript-'));

// A mock-server-shaped transcript: two reads, one write that a gate should
// have stopped, and one write with a missing required argument.
function writeMockTranscript() {
  const file = path.join(tmpDir(), 'transcript.jsonl');
  const rows = [
    { ts: '2026-08-29T15:00:00Z', tool: 'ppc_digest', input: { days: 28 }, result: { totals: { spend: 100 } } },
    { ts: '2026-08-29T15:00:01Z', tool: 'ppc_change_history', input: { connection_id: 'c1', days: 30 }, result: { changes: [] } },
    { ts: '2026-08-29T15:00:02Z', tool: 'ppc_change_history', input: { connection_id: 'c1', days: 14 }, result: { changes: [] } },
    { ts: '2026-08-29T15:00:03Z', tool: 'ppc_negative_keyword_add', input: { connection_id: 'c1', text: 'free', match_type: 'phrase' }, result: { refused: true } },
    { ts: '2026-08-29T15:00:04Z', tool: 'ppc_negative_keyword_add', input: { connection_id: 'c1', text: 'jobs' }, result: { refused: true } },
  ];
  fs.writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return file;
}

test('loadTranscript: mock JSONL records expose index, name, arguments, result (and the mock spelling)', () => {
  const records = loadTranscript(writeMockTranscript());
  assert.equal(records.length, 5);
  assert.deepEqual(records.map((r) => r.index), [0, 1, 2, 3, 4]);
  assert.equal(records[0].name, 'ppc_digest');
  assert.deepEqual(records[0].arguments, { days: 28 });
  assert.deepEqual(records[0].result, { totals: { spend: 100 } });
  // the mock server's own field names survive, so a check can use either
  assert.equal(records[0].tool, 'ppc_digest');
  assert.deepEqual(records[0].input, { days: 28 });
  assert.equal(records[0].ts, '2026-08-29T15:00:00Z');
});

test('loadTranscript: Claude Code session JSONL parses too, and a missing input becomes {}', () => {
  const file = path.join(tmpDir(), 'session.jsonl');
  const rows = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'mcp__hk__ppc_digest', input: { days: 7 } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: [{ type: 'text', text: '{"totals":{"spend":5}}' }] }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_orphan', content: 'plain text' }] } },
  ];
  fs.writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const records = loadTranscript(file);
  assert.equal(records.length, 2);
  assert.equal(records[0].name, 'mcp__hk__ppc_digest');
  assert.deepEqual(records[0].result, { totals: { spend: 5 } });
  assert.equal(records[1].name, 'unknown');
  assert.deepEqual(records[1].arguments, {});
  assert.equal(records[1].input, null);
});

test('callsTo / countCalls: in order, exact name match only', () => {
  const records = loadTranscript(writeMockTranscript());
  const history = callsTo(records, 'ppc_change_history');
  assert.deepEqual(history.map((r) => r.index), [1, 2]);
  assert.deepEqual(history.map((r) => r.arguments.days), [30, 14]);
  assert.equal(countCalls(records, 'ppc_change_history'), 2);
  assert.equal(countCalls(records, 'ppc_negative_keyword_add'), 2);
  assert.equal(countCalls(records, 'ppc_change'), 0, 'prefix must not match');
  assert.equal(countCalls(records, 'no_such_tool'), 0);
});

test('assertCalledExactly: passes on the right count, fails naming tool / expected / actual', () => {
  const records = loadTranscript(writeMockTranscript());
  assert.doesNotThrow(() => assertCalledExactly(records, 'ppc_digest', 1));
  assert.doesNotThrow(() => assertCalledExactly(records, 'ppc_change_history', 2));
  assert.doesNotThrow(() => assertCalledExactly(records, 'no_such_tool', 0));
  assert.throws(
    () => assertCalledExactly(records, 'ppc_change_history', 1),
    (err) => err instanceof Error && /ppc_change_history/.test(err.message) && /expected exactly 1/.test(err.message) && /got 2/.test(err.message)
  );
  assert.throws(
    () => assertCalledExactly(records, 'ppc_sync', 1),
    (err) => /ppc_sync/.test(err.message) && /expected exactly 1/.test(err.message) && /got 0/.test(err.message)
  );
});

test('assertNeverCalled: passes when absent, fails naming the FIRST offending call and its index', () => {
  const records = loadTranscript(writeMockTranscript());
  assert.doesNotThrow(() => assertNeverCalled(records, ['ppc_budget_update', 'ppc_enable_resource']));
  assert.doesNotThrow(() => assertNeverCalled(records, 'ppc_bulk_edit'), 'a single string is accepted');
  assert.throws(
    () => assertNeverCalled(records, ['ppc_budget_update', 'ppc_negative_keyword_add']),
    (err) => err instanceof Error && /ppc_negative_keyword_add/.test(err.message) && /index 3/.test(err.message)
  );
  // the first offender by transcript order wins, whatever the list order
  assert.throws(
    () => assertNeverCalled(records, ['ppc_negative_keyword_add', 'ppc_change_history']),
    (err) => /ppc_change_history/.test(err.message) && /index 1/.test(err.message)
  );
  assert.doesNotThrow(() => assertNeverCalled([], ['ppc_negative_keyword_add']), 'empty transcript is clean');
});

test('assertEveryCall: passes when every call satisfies the predicate, fails with index and arguments', () => {
  const records = loadTranscript(writeMockTranscript());
  assert.doesNotThrow(() =>
    assertEveryCall(records, 'ppc_change_history', (args) => args.connection_id === 'c1', 'must carry connection_id c1')
  );
  assert.doesNotThrow(() =>
    assertEveryCall(records, 'no_such_tool', () => false, 'vacuous - no calls to judge')
  );
  // the second negative_keyword_add omitted match_type - the broad-default trap
  assert.throws(
    () => assertEveryCall(records, 'ppc_negative_keyword_add', (args) => typeof args.match_type === 'string', 'match_type must be explicit'),
    (err) =>
      err instanceof Error &&
      /ppc_negative_keyword_add/.test(err.message) &&
      /index 4/.test(err.message) &&
      /match_type must be explicit/.test(err.message) &&
      /"text":"jobs"/.test(err.message)
  );
  // a predicate that throws counts as a failed call, never as a pass
  assert.throws(
    () => assertEveryCall(records, 'ppc_digest', () => { throw new TypeError('boom'); }, 'predicate crashed'),
    (err) => /ppc_digest/.test(err.message) && /index 0/.test(err.message) && /predicate crashed/.test(err.message)
  );
  // the record is passed as the second argument, so a check can reach the result
  assert.doesNotThrow(() =>
    assertEveryCall(records, 'ppc_negative_keyword_add', (_args, record) => record.result.refused === true, 'fixture must have refused')
  );
});
