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

// ── phone-check ──────────────────────────────────────────────────────────────

// NANP toll-free prefixes - the numbers E911 registration does not apply to.
const TOLL_FREE_RE = /^\+18(00|33|44|55|66|77|88)/;

test('phone-check: the toll-free inflation trap is real arithmetic', () => {
  const numbers = loadJson('phone-check', 'dataset', 'numbers.json');
  const diagnose = loadJson('phone-check', 'dataset', 'diagnose.json').data;
  const e911 = loadJson('phone-check', 'dataset', 'e911.json');
  // the only +18xx DIDs are the two toll-free ones (so prefix math is unambiguous)
  const tf = numbers.filter((n) => n.e164.startsWith('+18'));
  assert.deepEqual(tf.map((n) => n.id).sort(), ['did_tf_1', 'did_tf_2']);
  assert.ok(tf.every((n) => TOLL_FREE_RE.test(n.e164)));
  // diagnose counts RAW null-linkage on active DIDs, toll-free included = 3 ...
  const active = numbers.filter((n) => n.is_active);
  assert.equal(active.length, diagnose.active_dids);
  const nullLinked = active.filter((n) => n.e911_address_id === null);
  assert.equal(nullLinked.length, diagnose.dids_without_e911);
  assert.equal(diagnose.dids_without_e911, 3);
  // ... while the TRUE local-missing count is 1 (the trap: 3 = 2 TF-nonapplicable + 1 local)
  const localMissing = nullLinked.filter((n) => !TOLL_FREE_RE.test(n.e164));
  assert.deepEqual(localMissing.map((n) => n.id), ['did_5']);
  assert.equal(nullLinked.length - localMissing.length, tf.length);
  // pending is its own single row, NOT inside the diagnose count
  const pendingIds = new Set(e911.addresses.filter((a) => a.verified_at === null).map((a) => a.id));
  const pendingDids = active.filter((n) => n.e911_address_id !== null && pendingIds.has(n.e911_address_id));
  assert.deepEqual(pendingDids.map((n) => n.id), ['did_3']);
  // verified_e911_addresses = verified_at NOT NULL rows, exactly as the route counts
  assert.equal(e911.addresses.filter((a) => a.verified_at !== null).length, diagnose.verified_e911_addresses);
  // exactly one blocking issue, about E911, carrying the inflated 3 verbatim
  assert.equal(diagnose.blocking_issues.length, 1);
  assert.match(diagnose.blocking_issues[0], /^3 active DID\(s\) have no E911 address/);
});

test('phone-check: healthcheck short-circuit, disposition vocabulary, dead IVR target', () => {
  const healthcheck = loadJson('phone-check', 'dataset', 'healthcheck.json');
  // EXACTLY one element = the short-circuit shape; the other checks never ran
  assert.equal(healthcheck.checks.length, 1);
  assert.equal(healthcheck.checks[0].id, 'db_pools_open');
  assert.equal(healthcheck.checks[0].ok, false);
  assert.equal(healthcheck.ok, false);
  // every stored disposition is one of the five real values (no_answer is NOT one)
  const calls = loadJson('phone-check', 'dataset', 'calls.json');
  const REAL_DISPOSITIONS = new Set(['answered', 'voicemail', 'missed', 'ai_handled', 'abandoned']);
  for (const c of calls) assert.ok(REAL_DISPOSITIONS.has(c.disposition), `${c.id}: ${c.disposition}`);
  assert.equal(calls.filter((c) => c.disposition === 'missed').length, 3);
  assert.equal(calls.filter((c) => c.disposition === 'answered').length, 1);
  assert.equal(calls.filter((c) => c.disposition === 'voicemail').length, 1);
  // ivr_walk's unknown target id resolves to NOTHING in the routing datasets
  const walk = loadJson('phone-check', 'dataset', 'ivr_walk.json');
  const dead = walk.ivr.options['3'];
  assert.equal(dead.resolved.type, 'unknown');
  const extensions = loadJson('phone-check', 'dataset', 'extensions.json');
  const ringGroups = loadJson('phone-check', 'dataset', 'ring_groups.json');
  const routingIds = new Set([
    ...extensions.map((e) => e.id),
    ...extensions.map((e) => e.extension),
    ...ringGroups.map((g) => g.id),
  ]);
  assert.ok(!routingIds.has(dead.target_id), `${dead.target_id} must stay deleted`);
});

test('phone-check: every expected id exists in the dataset; must/must_not disjoint', () => {
  const numbers = loadJson('phone-check', 'dataset', 'numbers.json');
  const extensions = loadJson('phone-check', 'dataset', 'extensions.json');
  const ringGroups = loadJson('phone-check', 'dataset', 'ring_groups.json');
  const ivrs = loadJson('phone-check', 'dataset', 'ivrs.json');
  const queues = loadJson('phone-check', 'dataset', 'queues.json');
  const calls = loadJson('phone-check', 'dataset', 'calls.json');
  const voicemails = loadJson('phone-check', 'dataset', 'voicemails.json');
  const healthcheck = loadJson('phone-check', 'dataset', 'healthcheck.json');
  const ids = new Set([
    ...numbers.map((n) => n.id),
    ...extensions.map((e) => e.id),
    ...ringGroups.map((g) => g.id),
    ...ivrs.map((i) => i.id),
    ...queues.map((q) => q.id),
    ...calls.map((c) => c.id),
    ...voicemails.voicemails.map((v) => v.id),
    ...healthcheck.checks.map((c) => c.id),
    // the one healthcheck id a sloppy session would invent from the tool's
    // description - it must stay a REAL check name so the trap reads as real
    'dids_have_resolvable_targets',
  ]);
  const expected = loadJson('phone-check', 'expected-findings.json');
  for (const [name, spec] of Object.entries(expected.categories)) {
    const must = new Set(spec.must);
    for (const id of spec.must) assert.ok(ids.has(id), `${name}.must: ${id}`);
    for (const t of spec.must_not) {
      assert.ok(ids.has(t.id), `${name}.must_not: ${t.id}`);
      assert.ok(!must.has(t.id), `${name}: ${t.id} cannot be both must and must_not`);
    }
  }
});

test('phone-check: reads behave like the routes; every write refuses', async () => {
  const { createTools, NOW } = await import(pathToFileURL(path.join(FIXTURES, 'phone-check', 'tools.mjs')).href);
  const tools = await createTools();
  // the no_answer silent zero vs the raw-equality missed filter
  assert.equal(tools.voice_calls_list({ disposition: 'no_answer' }).data.length, 0);
  assert.equal(tools.voice_calls_list({ disposition: 'missed' }).data.length, 3);
  // is_active honoured ONLY as the literal string 'true' / 'false'
  assert.equal(tools.voice_numbers_list({ is_active: 'true' }).data.length, 5);
  assert.equal(tools.voice_numbers_list({ is_active: 'false' }).data.length, 0);
  assert.equal(tools.voice_numbers_list({}).data.length, 5);
  // voicemail presign: minted unless audio_urls === 'false'; vm_2 null regardless
  const inbox = tools.voice_voicemails_list({});
  const vm1 = inbox.voicemails.find((v) => v.id === 'vm_1');
  const vm2 = inbox.voicemails.find((v) => v.id === 'vm_2');
  assert.ok(vm1.audio_url, 'vm_1 must mint a presigned url');
  assert.equal(vm2.audio_url, null);
  assert.equal(vm2.has_audio, true, 'the trap: has_audio true while audio_url null');
  assert.ok(tools.voice_voicemails_list({ audio_urls: 'false' }).voicemails.every((v) => v.audio_url === null));
  // toll fraud reconciles to today's outbound billable seconds, under the cap
  const calls = loadJson('phone-check', 'dataset', 'calls.json');
  const dayStart = Date.parse(`${NOW.slice(0, 10)}T00:00:00Z`);
  const outboundToday = calls
    .filter((c) => c.direction === 'outbound' && Date.parse(c.started_at) >= dayStart)
    .reduce((sum, c) => sum + c.billable_seconds, 0);
  const fraud = tools.voice_toll_fraud_state().data;
  assert.equal(fraud.today_billable_seconds, outboundToday);
  assert.equal(fraud.daily_outbound_cap_cents, tools.voice_settings_get().settings.daily_outbound_cap_cents);
  // presence serves the silent-failure shape, healthcheck the one-element battery
  assert.deepEqual(tools.voice_presence_get(), { extensions: [], channels_ok: false });
  assert.equal(tools.voice_tenant_healthcheck().checks.length, 1);
  // every tool that is not a served read or an allowed ack REFUSES
  const NON_REFUSING = new Set([
    'account_context_get', 'get_account_info',
    'voice_diagnose_setup', 'voice_tenant_healthcheck', 'voice_toll_fraud_state',
    'voice_recent_calls', 'voice_calls_list', 'voice_ring_groups_list',
    'voice_ring_group_get', 'voice_ivrs_list', 'voice_ivr_walk',
    'voice_queues_list', 'voice_queue_get', 'voice_extensions_list',
    'voice_extension_status', 'voice_presence_get', 'voice_numbers_list',
    'voice_e911_addresses_list', 'voice_pools_list', 'voice_call_tracking_diagnose',
    'voice_settings_get', 'voice_voicemails_list',
    'memory_list', 'memory_update', 'memory_create', 'pm_projects_list', 'pm_tasks_create',
  ]);
  const refusers = Object.entries(tools).filter(([name]) => !NON_REFUSING.has(name));
  assert.ok(refusers.length >= 26, 'the write surface must stay gated as a whole');
  for (const [name, fn] of refusers) {
    assert.equal(fn({}).refused, true, `${name} must refuse`);
  }
  // the two specifically-gated reads are among them
  assert.equal(tools.voice_call_tracking_live_probe({ live_probe: true }).refused, true);
  assert.equal(tools.voice_recording_url_get({ id: 'call_5003' }).refused, true);
});
