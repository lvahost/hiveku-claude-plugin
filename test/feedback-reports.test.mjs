/**
 * `hiveku reports`: every connected account's Agent Feedback reports in one
 * read-only view (lib/feedback-reports.mjs, bin/hiveku, commands/reports.md).
 *
 *   - each account is read with ITS OWN key, one hiveku_feedback_status call
 *     each, and nothing else is ever called (no acknowledge, no follow-up);
 *   - an account whose read fails is UNKNOWN, never "no reports", and does
 *     not stop the others;
 *   - answers waiting to be passed on lead the text view;
 *   - who filed each one, and when and how it closed, are carried through
 *     (HK-323), and --account / --filer / --closed-since narrow the view;
 *   - the command can run only the reports subcommand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import {
  collectReports, filterReports, formatReports, parseClosedSinceDay, pickAccounts, readFeedbackList, REPORTS_TOOL,
} from '../lib/feedback-reports.mjs';

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
  // A server that sends no filing fields (older, or before HK-323) reads them as null, never "".
  assert.deepEqual(byId[A].reports[0], {
    ref: 'HK-128', kind: 'issue', status: 'resolved', status_label: 'Resolved',
    title: 'Agents can add custom domains again', needs_attention: true, updated_at: '2026-10-03T13:00:00.000Z',
    filed_by: null, closed_at: null, resolution_kind: null, resolution_label: null, answer_text: null, ticket_url: null,
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

const FILED = {
  filed_by: {
    account_id: A, account_label: 'Acme Stairlifts', filer_type: 'person',
    filer_name: 'Claude Code - a***@acme.test', via: 'Claude Code plugin',
  },
  closed_at: '2026-10-03T13:00:00.000Z', resolution_kind: 'fixed', resolution_label: 'Fixed',
  answer_text: 'Custom domains can be added again.', ticket_url: 'https://app.hiveku.com/dashboard/saas-admin/platform-feedback/HK-128',
};

test('who filed it, and when and how it closed, are carried through with caps (HK-323)', async () => {
  const { make } = fakeUpstreams({
    [A]: toolResult({ items: [item(FILED)], needs_attention_count: 1 }),
    [B]: toolResult({ items: [item({
      ref: 'HK-131', status: 'triaged', needs_attention: false,
      filed_by: { account_id: B, account_label: 'Cook Shop', filer_type: 'nonsense', filer_name: 'x'.repeat(500), via: null },
      closed_at: null, resolution_kind: null, resolution_label: null, answer_text: 'y'.repeat(5000), ticket_url: 'javascript:alert(1)',
    })], needs_attention_count: 0 }),
  });
  const rows = await collectReports({ [A]: ACCOUNTS[A], [B]: ACCOUNTS[B] }, make);
  const [a, b] = [rows[0].reports[0], rows[1].reports[0]];
  assert.deepEqual(a.filed_by, FILED.filed_by);
  assert.equal(a.closed_at, '2026-10-03T13:00:00.000Z');
  assert.equal(a.resolution_kind, 'fixed');
  assert.equal(a.resolution_label, 'Fixed');
  assert.equal(a.answer_text, 'Custom domains can be added again.');
  assert.equal(a.ticket_url, FILED.ticket_url);
  // A filer type outside the three is dropped, long text is clipped, and only an https link is kept.
  assert.equal(b.filed_by.filer_type, null);
  assert.equal(b.filed_by.filer_name.length, 100);
  assert.equal(b.filed_by.via, null);
  assert.equal(b.answer_text.length, 2000);
  assert.equal(b.ticket_url, null);
  assert.equal(b.closed_at, null);
});

test('the text view says who filed each one and how it closed', async () => {
  const { make } = fakeUpstreams({
    [A]: toolResult({ items: [item(FILED)], needs_attention_count: 1 }),
    [B]: toolResult({ items: [item({
      ref: 'HK-140', kind: 'feature', status: 'planned', status_label: 'Planned', needs_attention: false,
      filed_by: { account_id: B, account_label: 'Cook Shop', filer_type: 'department_agent', filer_name: 'Sales agent', via: null },
    })], needs_attention_count: 0 }),
    [C]: toolResult({ items: [item({ ref: 'HK-141', needs_attention: false, filed_by: { account_id: C, filer_type: 'assistant', filer_name: null, via: null } })], needs_attention_count: 0 }),
  });
  const lines = formatReports(await collectReports(ACCOUNTS, make)).trim().split('\n');
  const after = (ref) => lines[lines.findIndex((l) => l.includes(` ${ref} `)) + 1];
  assert.equal(after('HK-128'), `${' '.repeat(18)}filed by Claude Code - a***@acme.test (Claude Code plugin); closed 2026-10-03: Fixed`);
  assert.equal(after('HK-140'), `${' '.repeat(18)}filed by Sales agent`);
  // No name: the filer type in words.
  assert.equal(after('HK-141'), `${' '.repeat(18)}filed by an assistant session`);
});

test('--account picks accounts by id, id start or part of the name', () => {
  assert.deepEqual(Object.keys(pickAccounts(ACCOUNTS, A)), [A]);
  assert.deepEqual(Object.keys(pickAccounts(ACCOUNTS, '7C9E6679')), [B]);
  assert.deepEqual(Object.keys(pickAccounts(ACCOUNTS, 'stairlift')), [A]);
  assert.deepEqual(Object.keys(pickAccounts(ACCOUNTS, 'co')).sort(), [B, C].sort());
  // Fewer than 8 characters of an id is not an id match.
  assert.deepEqual(Object.keys(pickAccounts(ACCOUNTS, '3f25')), []);
  assert.deepEqual(Object.keys(pickAccounts(ACCOUNTS, 'nobody')), []);
});

test('--closed-since takes a real day only', () => {
  assert.equal(parseClosedSinceDay('2026-10-01'), Date.UTC(2026, 9, 1));
  for (const bad of ['2026-02-31', '1', '2026-10-1', '2026-10-01T00:00:00Z', '', undefined, true]) {
    assert.equal(parseClosedSinceDay(bad), null, String(bad));
  }
});

test('--filer and --closed-since narrow the reports; an unread account stays UNKNOWN', async () => {
  const { make } = fakeUpstreams({
    [A]: toolResult({ items: [
      item(FILED),
      item({ ref: 'HK-150', needs_attention: true, filed_by: { ...FILED.filed_by, filer_type: 'department_agent', filer_name: 'Sales agent' }, closed_at: '2026-09-20T10:00:00.000Z' }),
      item({ ref: 'HK-151', needs_attention: false, status: 'triaged', filed_by: FILED.filed_by, closed_at: null }),
    ], needs_attention_count: 2 }),
    [B]: new Error('HTTP 401 from Hiveku'),
  });
  const rows = await collectReports({ [A]: ACCOUNTS[A], [B]: ACCOUNTS[B] }, make);

  const byType = filterReports(rows, { filer: 'department_agent' });
  assert.deepEqual(byType[0].reports.map((r) => r.ref), ['HK-150']);
  assert.equal(byType[0].needs_attention_count, 1);
  assert.equal(byType[1].reports, null, 'an unread account is never filtered into "no reports"');

  const byName = filterReports(rows, { filer: 'A***@ACME' });
  assert.deepEqual(byName[0].reports.map((r) => r.ref), ['HK-128', 'HK-151']);

  const closed = filterReports(rows, { closedSinceMs: parseClosedSinceDay('2026-10-01') });
  assert.deepEqual(closed[0].reports.map((r) => r.ref), ['HK-128'], 'an open ticket and an older close are left out');

  const both = filterReports(rows, { filer: 'person', closedSinceMs: parseClosedSinceDay('2026-09-01') });
  assert.deepEqual(both[0].reports.map((r) => r.ref), ['HK-128']);

  // No filter: the rows as read, the server's own count kept.
  assert.equal(filterReports(rows, {}), rows);
  assert.equal(rows[0].needs_attention_count, 2);
});

test('the CLI wires `reports`, and the command may run nothing else', async () => {
  const bin = await fs.readFile(new URL('../bin/hiveku', import.meta.url), 'utf8');
  assert.match(bin, /case 'reports': return cmdReports\(flags\);/);
  assert.match(bin, /\n {2}reports \[--json\] +read-only list of every connected account's Agent Feedback reports\n/);
  assert.match(bin, /\[--account <id\|name>\] \[--filer <person\|assistant\|department_agent\|name>\]\n +\[--closed-since <YYYY-MM-DD>\]/);
  // The filters take a value, so `--filer person` is not read as a bare flag.
  const valued = bin.match(/const valued = new Set\((\[.*?\])\);/)?.[1];
  assert.ok(valued && ['account', 'filer', 'closed-since'].every((f) => valued.includes(`'${f}'`)), valued);
  const cmd = await fs.readFile(new URL('../commands/reports.md', import.meta.url), 'utf8');
  const allowed = cmd.match(/^allowed-tools: (.*)$/m)?.[1];
  assert.deepEqual(JSON.parse(allowed), ['Bash("${CLAUDE_PLUGIN_ROOT}/bin/hiveku" reports:*)']);
  assert.match(cmd, /never as "no reports"/);
  assert.match(cmd, /only Hiveku staff can\s+open/);
});
