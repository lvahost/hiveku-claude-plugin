/**
 * `hiveku reports`: every connected account's Agent Feedback reports in one
 * read-only view (lib/feedback-reports.mjs, bin/hiveku, commands/reports.md).
 *
 *   - each account is read with ITS OWN key, one hiveku_feedback_status call
 *     each, and nothing else is ever called (no acknowledge, no follow-up);
 *   - an account whose read fails is UNKNOWN, never "no reports", and does
 *     not stop the others;
 *   - answers waiting to be passed on lead the text view;
 *   - the command can run only the reports subcommand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { collectReports, formatReports, readFeedbackList, REPORTS_TOOL } from '../lib/feedback-reports.mjs';

const A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const C = 'a1b2c3d4-0000-4000-8000-000000000003';

const toolResult = (body) => ({ result: { content: [{ type: 'text', text: JSON.stringify(body) }] } });

const item = (over = {}) => ({
  ref: 'HK-128', kind: 'issue', status: 'resolved', status_label: 'Resolved',
  title: 'project_domains_add: permission or auth', public_title: 'Agents can add custom domains again',
  needs_attention: true, updated_at: '2026-10-03T13:00:00.000Z',
  your_report: { summary: 'x', first_reported_at: '2026-10-02T20:15:00.000Z', occurrences: 2, acknowledged: false, verification: null },
  ...over,
});

function fakeUpstreams(answers) {
  const calls = [];
  const make = ({ key, accountId, label }) => ({
    async forward(req) {
      calls.push({ key, accountId, label, name: req.params?.name, args: req.params?.arguments, method: req.method });
      const answer = answers[accountId];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  return { calls, make };
}

const ACCOUNTS = {
  [A]: { key: 'olp_key_for_a', label: 'Acme Stairlifts' },
  [B]: { key: 'olp_key_for_b', label: 'Cook Shop' },
  [C]: { key: 'olp_key_for_c', label: 'Quiet Co' },
};

test('each account is read once, with its own key, through the read tool only', async () => {
  const { calls, make } = fakeUpstreams({
    [A]: toolResult({ items: [item()], needs_attention_count: 1 }),
    [B]: toolResult({ data: { items: [item({ ref: 'HK-130', kind: 'feature', status: 'planned', status_label: 'Planned', public_title: null, title: 'Feature: reports', needs_attention: false })], needs_attention_count: 0 } }),
    [C]: toolResult({ items: [], needs_attention_count: 0 }),
  });
  const rows = await collectReports(ACCOUNTS, make);
  assert.deepEqual(calls.map((c) => [c.accountId, c.key]), [[A, 'olp_key_for_a'], [B, 'olp_key_for_b'], [C, 'olp_key_for_c']]);
  assert.ok(calls.every((c) => c.method === 'tools/call' && c.name === REPORTS_TOOL), 'only hiveku_feedback_status is ever called');
  assert.deepEqual(calls[0].args, { limit: 50 });

  const byId = Object.fromEntries(rows.map((r) => [r.account_id, r]));
  assert.equal(byId[A].needs_attention_count, 1);
  assert.deepEqual(byId[A].reports[0], {
    ref: 'HK-128', kind: 'issue', status: 'resolved', status_label: 'Resolved',
    title: 'Agents can add custom domains again', needs_attention: true, updated_at: '2026-10-03T13:00:00.000Z',
  });
  // A {data: ...} envelope reads the same; no published title falls back to the item's title.
  assert.equal(byId[B].reports[0].title, 'Feature: reports');
  assert.deepEqual(byId[C].reports, []);
  // The key never reaches the output.
  assert.ok(!JSON.stringify(rows).includes('olp_key_for'));
});

test('a failed read is UNKNOWN for that account and does not stop the others', async () => {
  const { make } = fakeUpstreams({
    [A]: new Error('HTTP 401 from Hiveku'),
    [B]: { result: { isError: true, content: [{ type: 'text', text: 'Read-only key refused' }] } },
    [C]: toolResult({ items: [item({ needs_attention: false })], needs_attention_count: 0 }),
  });
  const rows = await collectReports(ACCOUNTS, make);
  const byId = Object.fromEntries(rows.map((r) => [r.account_id, r]));
  assert.equal(byId[A].reports, null);
  assert.match(byId[A].error, /401/);
  assert.equal(byId[B].reports, null);
  assert.equal(byId[B].needs_attention_count, null);
  assert.equal(byId[C].reports.length, 1);

  const text = formatReports(rows);
  assert.match(text, /Acme Stairlifts \(3f2504e0\): UNKNOWN - HTTP 401/);
  assert.match(text, /Cook Shop \(7c9e6679\): UNKNOWN - Read-only key refused/);
  assert.doesNotMatch(text, /Acme Stairlifts.*no reports/);
});

test('answers waiting to be passed on come first in the text view', async () => {
  const { make } = fakeUpstreams({
    [A]: toolResult({ items: [], needs_attention_count: 0 }),
    [B]: toolResult({ items: [item({ ref: 'HK-126', needs_attention: true })], needs_attention_count: 1 }),
    [C]: toolResult({ items: [item({ ref: 'HK-90', kind: 'feature', needs_attention: false, status_label: 'Planned' })], needs_attention_count: 0 }),
  });
  const lines = formatReports(await collectReports(ACCOUNTS, make)).trim().split('\n');
  assert.match(lines[0], /^Cook Shop \(7c9e6679\): 1 report, 1 with an answer to pass on$/);
  assert.match(lines[1], /^ {2}ANSWER {2}HK-126 +problem +Resolved/);
  assert.ok(lines.includes('Acme Stairlifts (3f2504e0): no reports'));
  assert.ok(lines.some((l) => /^ {10}HK-90 +feature +Planned/.test(l)));
});

test('an unreadable result is never read as an empty list', () => {
  assert.equal(readFeedbackList(undefined), null);
  assert.equal(readFeedbackList({ result: { content: [{ type: 'text', text: 'not json' }] } }), null);
  assert.equal(readFeedbackList(toolResult({ error: 'boom' })), null);
  assert.deepEqual(readFeedbackList(toolResult({ data: [{ items: [] }] })), { items: [] });
});

test('the CLI wires `reports`, and the command may run nothing else', async () => {
  const bin = await fs.readFile(new URL('../bin/hiveku', import.meta.url), 'utf8');
  assert.match(bin, /case 'reports': return cmdReports\(flags\);/);
  assert.match(bin, /\n {2}reports \[--json\] +read-only list of every connected account's Agent Feedback reports\n/);
  const cmd = await fs.readFile(new URL('../commands/reports.md', import.meta.url), 'utf8');
  const allowed = cmd.match(/^allowed-tools: (.*)$/m)?.[1];
  assert.deepEqual(JSON.parse(allowed), ['Bash("${CLAUDE_PLUGIN_ROOT}/bin/hiveku" reports:*)']);
  assert.match(cmd, /never as "no reports"/);
});
