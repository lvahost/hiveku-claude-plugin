/**
 * Fixture-consistency invariants. A planted-defect eval is only as honest as
 * its dataset: if the aging total stops reconciling or a distractor drifts
 * into defect shape, the eval starts grading noise. These tests pin the
 * arithmetic so fixture edits cannot silently break the seeds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '..', 'fixtures');
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(FIXTURES, ...p), 'utf8'));

const LIVE_STATUSES = new Set(['open', 'partially_paid', 'submitted']);

test('ap-screen: aging total reconciles to live bill balances', () => {
  const bills = loadJson('ap-screen', 'dataset', 'bills.json');
  const aging = loadJson('ap-screen', 'dataset', 'aging.json');
  const liveSum = bills
    .filter((b) => LIVE_STATUSES.has(b.status))
    .reduce((sum, b) => sum + b.balance_due_cents, 0);
  assert.equal(liveSum, aging.total_cents);
  const bucketSum = Object.values(aging.buckets).reduce((a, b) => a + b, 0);
  assert.equal(bucketSum, aging.total_cents);
});

test('ap-screen: vendor stats rollups match the bills', () => {
  const bills = loadJson('ap-screen', 'dataset', 'bills.json');
  const vendors = loadJson('ap-screen', 'dataset', 'vendors.json');
  for (const [id, vendor] of Object.entries(vendors)) {
    const mine = bills.filter((b) => b.vendor_id === id);
    const paid = mine.filter((b) => b.status === 'paid').reduce((s, b) => s + b.amount_paid_cents, 0);
    const open = mine.filter((b) => LIVE_STATUSES.has(b.status)).reduce((s, b) => s + b.balance_due_cents, 0);
    assert.equal(paid, vendor.stats.lifetime_paid_cents, `${id} lifetime_paid`);
    assert.equal(open, vendor.stats.open_balance_cents, `${id} open_balance`);
    assert.ok(vendor.stats.lifetime_paid_cents > 0, `${id} must not trip rule C - only seeded defects may fire`);
  }
});

test('ap-screen: the seeds are the ONLY defect-shaped live bills', () => {
  const bills = loadJson('ap-screen', 'dataset', 'bills.json');
  const byId = new Map(bills.map((b) => [b.id, b]));
  // Seed 1: the duplicate pair - same vendor, same amount, <= 14 days apart, no schedule
  const a = byId.get('bill_mer_open_1');
  const b = byId.get('bill_mer_open_2');
  assert.equal(a.total_cents, b.total_cents);
  assert.notEqual(a.bill_number, b.bill_number);
  const daysApart = Math.abs(Date.parse(a.due_date) - Date.parse(b.due_date)) / 86400000;
  assert.ok(daysApart <= 14, 'pair must sit inside the 14-day window');
  // Seed 2: out-of-pattern - live amount > 2x median of >= 3 paid bills
  const crePaid = bills
    .filter((x) => x.vendor_id === 'vend_crestline' && x.status === 'paid')
    .map((x) => x.total_cents)
    .sort((x, y) => x - y);
  assert.ok(crePaid.length >= 3, 'Crestline needs a real baseline');
  const median = (crePaid[Math.floor((crePaid.length - 1) / 2)] + crePaid[Math.ceil((crePaid.length - 1) / 2)]) / 2;
  assert.ok(byId.get('bill_cre_open_1').total_cents > 2 * median);
  // Distractor guards: Bright must stay below a 3-bill baseline; Hargrove's
  // schedule must stay exhausted; Meridian's pair amount must stay in-band.
  assert.equal(bills.filter((x) => x.vendor_id === 'vend_bright' && x.status === 'paid').length, 2);
  const schedules = loadJson('ap-screen', 'dataset', 'schedules.json');
  assert.equal(schedules.detail.sched_hargrove.next_run_at, null);
  assert.equal(schedules.detail.sched_lakeview.line_template.amount_cents, byId.get('bill_lak_open_1').total_cents);
  const merPaid = bills.filter((x) => x.vendor_id === 'vend_meridian' && x.status === 'paid').map((x) => x.total_cents);
  assert.ok(a.total_cents < 2 * merPaid.sort((x, y) => x - y)[2], 'Meridian pair must NOT also be out-of-pattern');
});

test('ap-screen: every expected-findings id exists in the dataset', () => {
  const bills = loadJson('ap-screen', 'dataset', 'bills.json');
  const ids = new Set(bills.map((b) => b.id));
  const expected = loadJson('ap-screen', 'expected-findings.json');
  for (const spec of Object.values(expected.categories)) {
    for (const id of spec.must) assert.ok(ids.has(id), id);
    for (const t of spec.must_not) assert.ok(ids.has(t.id), t.id);
  }
});

test('ap-screen: pagination respects limit/offset and reports the real total', async () => {
  const { createTools } = await import(pathToFileURL(path.join(FIXTURES, 'ap-screen', 'tools.mjs')).href);
  const tools = await createTools();
  const page = tools.accounting_bill_list({ status: 'all', limit: 10, offset: 30 });
  assert.equal(page.total, 32);
  assert.equal(page.bills.length, 2);
  const dflt = tools.accounting_bill_list({});
  assert.equal(dflt.limit, 50);
});

test('support-sweep: the breach is real, silent, and unique', async () => {
  const tickets = loadJson('support-sweep', 'dataset', 'tickets.json');
  const overdue = loadJson('support-sweep', 'dataset', 'overdue.json');
  const messages = loadJson('support-sweep', 'dataset', 'messages.json');
  const auto = loadJson('support-sweep', 'dataset', 'automations.json');
  const { NOW } = await import(pathToFileURL(path.join(FIXTURES, 'support-sweep', 'tools.mjs')).href);
  const byId = new Map(tickets.map((t) => [t.id, t]));

  assert.equal(overdue.first_response.length, 1, 'exactly one seeded breach');
  assert.equal(overdue.resolve.length, 0);
  const breach = overdue.first_response[0];
  const ticket = byId.get(breach.id);
  assert.equal(ticket.first_response_at, null, 'a stamped first response cannot breach');
  // silent: an outbound message EXISTS but went via add_message, unstamped
  const outbound = (messages[breach.id] || []).filter((m) => m.direction === 'outbound');
  assert.ok(outbound.length > 0, 'the breach must look answered in the thread');
  assert.ok(outbound.every((m) => m.via === 'add_message' && m.stamped_first_response === false));
  // the overdue math holds against the frozen clock
  const overdueMinutes = Math.round((Date.parse(NOW) - Date.parse(ticket.created_at)) / 60000) - auto.sla.first_response_minutes;
  assert.equal(overdueMinutes, breach.minutes_overdue);
  // no OTHER open ticket is quietly breaching (they are answered or young)
  for (const t of tickets) {
    if (t.id === breach.id || t.status !== 'open') continue;
    const age = (Date.parse(NOW) - Date.parse(t.created_at)) / 60000;
    const answered = t.first_response_at !== null;
    assert.ok(answered || age < auto.sla.first_response_minutes, `${t.id} must not be a second breach`);
  }
});

test('support-sweep: expected categories recompute from the dataset', () => {
  const tickets = loadJson('support-sweep', 'dataset', 'tickets.json');
  const expected = loadJson('support-sweep', 'expected-findings.json');
  const NOW = Date.parse('2026-08-29T15:00:00Z');
  const unassigned = tickets.filter((t) => t.status === 'open' && t.assigned_to_id === null).map((t) => t.id).sort();
  assert.deepEqual(unassigned, [...expected.categories.unassigned_open.must].sort());
  const aging = tickets
    .filter((t) => t.status === 'pending' && NOW - Date.parse(t.last_activity_at) > 7 * 86400000)
    .map((t) => t.id);
  assert.deepEqual(aging, expected.categories.aging_pending.must);
  const ids = new Set(tickets.map((t) => t.id));
  for (const spec of Object.values(expected.categories)) {
    for (const id of spec.must) assert.ok(ids.has(id), id);
    for (const t of spec.must_not) assert.ok(ids.has(t.id), t.id);
  }
});

test('support-sweep: gate-crossing writes refuse, macro render reports unfilled placeholders', async () => {
  const { createTools } = await import(pathToFileURL(path.join(FIXTURES, 'support-sweep', 'tools.mjs')).href);
  const tools = await createTools();
  assert.equal(tools.helpdesk_ticket_send_reply({ id: 'tick_1042', body: 'hi' }).refused, true);
  assert.equal(tools.helpdesk_ticket_merge({ id: 'a', merge_into_id: 'b' }).refused, true);
  const partial = tools.helpdesk_macros_render({ id: 'mac_ack', variables: { first_name: 'Priya' } });
  assert.deepEqual(partial.unfilled_placeholders, ['issue_summary', 'eta']);
  const full = tools.helpdesk_macros_render({
    id: 'mac_ack',
    variables: { first_name: 'Priya', issue_summary: 'the export', eta: 'tomorrow' },
  });
  assert.deepEqual(full.unfilled_placeholders, []);
  // the silent limit-cap trap stays real: default limit is 100, max 500
  assert.equal(tools.helpdesk_tickets_overdue({}).limit, 100);
  assert.equal(tools.helpdesk_tickets_overdue({ limit: 9999 }).limit, 500);
});
