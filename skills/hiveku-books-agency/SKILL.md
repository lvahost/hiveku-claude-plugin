---
name: hiveku-books-agency
description: "\"Bill the client\" / \"send them an invoice\" is money IN (an AR invoice out to a customer); \"the internet bill came in - pay it\" is money OUT (AP). Load for both, and when someone says \"who still owes us money?\", \"run payroll\" / \"it's the 15th\", \"can we refund them?\" (no tool reverses a recorded payment - load this to say so honestly), or \"it's Danny's last day Friday\" (offboarding = off payroll, timesheets closed, PTO paid out). Full bookkeeping and back-office methodology for operating a Hiveku account's money - vendor bills and accounts payable, bill approval and pay runs, vendors and 1099s, expense categories and the chart of accounts, recurring bill schedules, accounts receivable and invoice chasing, recording payments in or out, profit and loss, payroll runs and timesheets, PTO queues, accounting settings, and month-end or year-end close. ALSO load for risky books asks - \"pay all the bills\", batch approvals, deleting vendors/bills/time entries, \"skip the approval step\" - the refusal rules live here."
---

# Hiveku Books Agency Operating System

Operate the account's books like a controller who signs their name to the numbers: set the
account up once, keep AP and AR moving weekly, close each month against an explicit period, and
never report a figure you cannot trace to a named tool call. Every tool named below is a real
Hiveku MCP tool. Where a capability has no tool, the play says so and hands off to the
dashboard rather than inventing one.

**There is no accounting department agent.** `talk_to_department({ domain: 'accounting' })` is
refused server-side with `Unknown domain 'accounting'` - the domain enum does not include it -
so all accounting judgment lives in this file. For brand-voiced client-facing copy, route
through `talk_to_department({ domain: 'outbound', message })`, a real department that, like
`list_departments` and `audit_query`, is always available under every key profile.
`account_context_get` is NOT visible to this department's commerce-scoped key profile - do not
build a play on it.

## The money rule, before anything else

- **Every accounting money field is an integer of CENTS**: `amount_cents`, `unit_cents`,
  `discount_cents`, `total_cents`, `balance_due_cents`, `revenue_cents`, `expenses_cents`,
  `profit_cents`. Tax is BASIS POINTS: `tax_bps: 875` is 8.75%. `margin_bps` reads the same way.
- **The dollars seam has three edges, all payroll members**: `accounting_member_create.pay_rate`
  and `accounting_member_update.pay_rate` / `.bill_rate` are DOLLARS (per hour when hourly, per
  period when fixed; the route multiplies by 100), while every READ reports `pay_rate_cents` /
  `bill_rate_cents`. Sending 5000 for $50/hr books a $5,000/hr rate; sending `pay_rate_cents`
  to the update is silently dropped (200, unchanged).
- **PTO writes take HOURS**, stored as minutes (hours x 60): `references/pto-administration.md`.
- Before any write carrying a number, echo BOTH forms back and get the integer confirmed:
  "$1,200.00 = amount_cents: 120000". A missing 00 books $12.00 against a $1,200 bill and leaves
  an $1,188 phantom balance that no tool can undo.

**"Can we afford X?"** goes to `/hiveku:cash-flow`. Route "can we afford X" to `/hiveku:cash-flow` - it assembles the forecast from AR aging, open AP, recurring schedules and payroll cadence with stated assumptions.

## Operating principles

- Hiveku is the source of truth. Durable findings (the chart of accounts you settled on, vendor
  terms, who approves what, the close calendar, recurring-schedule inventory) go to department
  memory: read the current document with `memory_list({ domain })`, append your note to the
  `content` it returns, and send the WHOLE merged body to `memory_update({ memory_id, content })`,
  which REPLACES the document - sending only the new note destroys what was there.
  `memory_create({ type: 'memory', name: '<dept>', content })` only when no entry exists yet. Work
  items -> `pm_tasks_create` / `pm_tasks_complete`.
- Reads are free, writes are not. Every write here commits a payable, books cash, pays people,
  or erases a record, so each one gets an explicit confirmation naming the party, the document
  number and the cents integer.
- **Absent ceilings mean no autonomous write.** Play 0 records the pay cap and approvers into
  memory; until that exists, fail closed - every payment, delete, schedule write and PTO
  approval needs an explicit yes from a named human on that exact record. A standing
  instruction ("keep the bills paid") never covers deletes, schedule creation, payroll
  generation, PTO approval, or any payment above the recorded cap.
- Silent-drop is the house style: nearly every PATCH strips unknown keys and returns 200 with
  nothing changed. **A 200 is not proof the field moved** - re-read the row.
- You are not the only writer: schedules bill on a cron, the dashboard and other keys write
  too. `audit_query` (always available) shows which key ran which tool - attribute a surprise
  row before assuming your own call made it.
- `hiveku-data/` snapshots are orientation only; pull live for any number that reaches a
  client or a payment.

## Destructive verbs - the delete ladder

The surface carries real deletes and none takes a confirm field - the route writes on the first
call, so the confirmation lives HERE:

1. **Prefer the reversible rung**: `is_archived: true` (vendor), `is_active: false` (schedule),
   `accounting_expense_category_archive` (soft), `status: 'inactive'` (member). Never delete
   when archive answers the actual request.
2. **Read the blast radius first**: `accounting_vendor_get` (`open_bill_count`,
   `open_balance_cents`) before a vendor delete; the matching `_get` before a bill or schedule
   delete. Show what dies or is orphaned.
3. **A named human yes per record.** Deletion targets are NEVER derived by pattern or filter -
   only explicit ids the human named.
4. **Know which are truly gone.** Schedule and time-entry deletes are HARD deletes, no restore;
   vendor, member and bill deletes are soft but nothing un-deletes them from here. Archive is
   the only reversible rung, and only while you hold the id - archived rows vanish from every
   list and only the matching `_get` still resolves them. Details:
   `references/record-editing.md`.

**Worked hard-stops** (response contracts, not suggestions):
- "Just pay all the approved bills." -> Refuse the batch. The pay run is one confirmed payment
  at a time: list `open` bills by `due_date`, pay exactly the ones the owner names, each with
  its own confirmation - a recorded payment is irreversible.
- "Delete every vendor we haven't used this year." -> Refuse pattern-derived deletion. Offer
  the candidate list with rollups, and archive per named vendor.
- "Record it now, the wire goes out tomorrow." -> Refuse. Record AFTER the money moved, never
  before - books saying paid while the money never went is this skill's nightmare.
- "Skip the checks, just approve the queue." -> Approval is per bill with the amount read
  back; a draft CAN be approved without submit, but only on the owner's word for that bill,
  never as a standing shortcut.

## The one-way door: recording a payment

`accounting_bill_record_payment` (AP, money out) and `accounting_invoice_record_payment` (AR,
cash in) both **book the payment only. Neither moves money.** Record AFTER the wire or check has
actually left, never before, or the books say paid while the money never went.

**Nothing in the tool surface reverses a recorded payment.** There is no payment delete, void or
reversal tool and no Olympus route behind one. Worse, once a bill carries any payment,
`accounting_bill_void` refuses it: 409 `This bill has payments recorded and cannot be voided.
Reverse the payments first.` - and `accounting_bill_delete` refuses too. **Do not reach for
delete to erase a paid bill because void is blocked; nothing removes a paid bill from here.**
A mistyped cents integer is permanent until someone edits the database. Confirm vendor,
`bill_number` and the exact integer before the call, every time.

**Always pass a distinct `reference` and `paid_at` / `received_at`.** The proxy replays an
identical write body for one hour, so two genuinely separate same-amount payments with no
reference and no date make the second call replay the first response - it writes NOTHING and
looks like success. A distinct `reference` per payment is the only lever (you cannot set the
idempotency key yourself). Verify `balance_due_cents` in the response actually moved before
reporting a payment as recorded.

**Refusals are guardrails, not obstacles.** Load `references/payment-refusals.md` before every
pay run and on any non-200 or timeout from a payment tool - the verbatim refusal catalog,
replay mechanics, retry doctrine, and the read-state-before-second-apply procedure with
`audit_query`. Two rules that cannot wait: the 409 about a card charge `still being confirmed
with the payment processor` means STOP and escalate to a human, never route around it; and
never blind-retry a payment.

## Play 0 - Account setup (first time on an account's books)

1. `accounting_settings_get` -> `bill_prefix`, `default_currency`, `default_payment_terms`.
   **There is no dashboard page for these - this tool pair is the only surface that reads or
   writes them.** `accounting_settings_update` sets them. Do it before the first bill is
   created, because `bill_prefix` shapes every generated bill number from then on.
2. `accounting_expense_category_list` -> the chart of accounts bills code to. It **auto-seeds
   niche defaults from the account industry on the first call**, so calling it early is how the
   account gets a chart of accounts at all. Extra categories:
   `accounting_expense_category_create({ name, code?, sort_order? })` returns the id ready for
   `accounting_bill_create`; a 409 on a name you cannot see means an ARCHIVED twin - restore
   it, do not rename around it. Category semantics: `references/record-editing.md`.
3. `accounting_bill_schedules_list` -> the recurring definitions already generating bills.
   Inventory these into memory before you create anything by hand;
   `accounting_bill_schedule_get` anything surprising - `is_active: true` with
   `next_run_at: null` will never fire again, however active it looks.
4. `accounting_vendor_list` and `accounting_member_list` -> who gets paid, and how.
5. Record the baseline with `memory_create`: settings, category ids, the schedules, vendor and
   member counts, **who signs off on payments, and the dollar cap above which everything stops
   for a human**. Until this memory exists, the fail-closed default applies.

## Play 1 - Vendors: onboarding, fixing, retiring

1. `accounting_vendor_list({ q: '<name>' })` first - duplicate vendors are the commonest source
   of a double-booked payable. **Do not create a fresh vendor to route around an archived or
   deleted one** without a human yes; that manufactures the duplicate.
2. `accounting_expense_category_list` -> pick the category this vendor's bills will code to.
3. `accounting_vendor_create({ name, email, default_payment_terms, is_1099, tax_id, phone,
   notes })`. `name` is the only required field; `is_1099` plus `tax_id` (EIN or SSN) are what
   the year-end 1099 worksheet walk reads.
   **Do not pass `target_currency`.** The tool advertises it, but `accounting_vendors` has no
   such column and both vendor writes silently drop it - it looks accepted and stores nothing.
   Payout currency is a PAYROLL MEMBER field; the Wise CSV is built from payroll run items,
   not vendors. Full mechanism: `references/record-editing.md`.
4. Wrong data is fixable in place: `accounting_vendor_update({ vendor_id, ... })` patches
   contact fields, `tax_id`, `is_1099`, defaults, `notes`, `is_archived` - stored labels with
   no automatic consumer (`accounting_bill_create` never inherits the default category or
   terms). Field list and traps: `references/record-editing.md`.
5. Retiring follows the delete ladder. Archive first - reversible, and `accounting_bill_create`
   STILL accepts an archived vendor (it checks `deleted_at` only). `accounting_vendor_delete`
   is one-way, and **any active recurring schedule pointed at the deleted vendor KEEPS
   generating bills on its cron** - pause the schedules first.

## Play 2 - Accounts payable, end to end

Lifecycle: **create (draft) -> submit -> approve (open) -> record payment (partially_paid ->
paid)**, with `void` available only until the first payment lands.

Before creating anything, `accounting_bill_schedules_list`: a schedule already covering this
vendor and cadence will generate the bill for you, and a hand-created one double-books the
payable. **Schedule-generated bills are born `status: open` with `approval_status:
not_required`, silently bypassing the submit -> approve gate this play is built on** - Play 6.

- `accounting_bill_create({ vendor_id, line_items, ... })` - both required; each line is
  `{ description, quantity, unit_cents, ... }` and `bill_number` is auto-generated from
  `bill_prefix`. **Always set `category_id`** (bill level, line level, or both) or the expense
  lands uncategorized and the P&L grouping is wrong for the rest of the year. Foreign
  `vendor_id` / `category_id` are rejected. Full shape: `references/record-editing.md`.
- `accounting_bill_update({ bill_id, ... })` - fix an unpaid bill in place instead of
  void-and-recreate (only while draft/submitted/approved/open AND nothing paid; else 409).
  **`line_items` REPLACES the whole set - a one-line payload silently destroys the rest.**
  Read-modify-write, always: `accounting_bill_get`, edit the FULL array, resend every line
  with `sort_order`. Full mechanics: `references/record-editing.md`.
- `accounting_bill_submit` (draft -> submitted), `accounting_bill_approve` (-> open; accepts a
  draft too - owner's word only; `approve: false` rejects), `accounting_bill_void({ bill_id,
  reason })` (only while nothing paid). Status-verb details: `references/record-editing.md`.
- `accounting_bill_delete({ bill_id })` - soft-delete for a bill no money has moved against
  (409 once any payment exists; no status guard otherwise). The right verb for a duplicate
  draft; void is the right verb for a cancelled bill that should stay on the record. One-way
  from here; the delete ladder applies.
- `accounting_bill_get({ bill_id })` - the only way to see line items and recorded payments.

**Drafts are invisible.** AP aging counts only `open`, `partially_paid`, `submitted` and
`approved`. A bill you create and forget to submit appears in no aging report and no approve
queue, and ages past due with nothing surfacing it. Sweep `status: "draft"` every pass.

**Paginate.** `accounting_bill_list` defaults to `limit: 50`, caps at 200, pages with `offset`,
and returns a `total`. Loop `limit: 200` with a rising `offset` until you have seen `total` rows.
The 50-row default is how an AP review misses the back half of a real book.

## Play 3 - Accounts receivable and the chase

What this surface can do is narrower than it looks. **There is no invoice create, send, get, void
or reminder tool in the registry** - only `accounting_invoice_list` and
`accounting_invoice_record_payment`.
- The only authoring path is `crm_estimate_convert_to_invoice({ estimate_id })` on an accepted
  estimate: it creates a **draft** invoice, copies lines/totals/terms, moves the estimate to
  `converted`, and 409s if already converted. See the commerce skill for the quote-to-cash arc.
- Draft invoices are **not** in AR aging, which counts only `sent`, `viewed` and
  `partially_paid`. A converted-but-never-sent invoice is receivable nobody is tracking. Surface
  those; sending is a dashboard action.
- `accounting_invoice_list({ status, q, limit, offset })` returns `{ data, total }` with the same
  50/200 defaults. Loop it, then **reconcile**: sum `balance_due_cents` across the `sent`,
  `viewed` and `partially_paid` rows and compare to `accounting_ar_aging.total_cents`. If they
  disagree you have not seen every invoice - reconcile before writing any chase list.
- Reminder copy: `talk_to_department({ domain: 'outbound', message })`, show the draft, send
  nothing without approval. Log each chase and promised date with `pm_tasks_create` and roll
  durable payer patterns into memory. (`crm_create_activity` is real but OUTSIDE this
  department's key profile - do not build the logging step on it; under a full-profile key it
  works, so flag which key you hold.)
- Cash arrives -> `accounting_invoice_record_payment({ invoice_id, amount_cents, method,
  reference, received_at })`. **Always send `method`** (check|wire|cash|credit_note|manual|
  ach): the AR schema has no default - omit it and the call 400s - and the AP set is
  DIFFERENT; never copy a method between the two (details in
  `references/payment-refusals.md`). Re-read the one-way door section first.

## Play 4 - Timesheets and payroll

Payroll has three traps that produce wrong pay, and it does not finish here.

1. **`accounting_payroll_run_list` FIRST.** There is no unique constraint on the run period, so a
   second create for the same period makes a SECOND run and a second payable total. Check before
   you generate, every time.
2. **`accounting_member_list`** -> the roster. Only members with `status: 'active'` are picked
   up by a run. **The off-switch is `accounting_member_update({ member_id, status: 'inactive'
   })` and nothing else: run creation never reads `is_archived`, so an ARCHIVED member is
   STILL PAID in every new run.** Wrong `pay_rate`, `pay_period` or Wise payout fields are
   fixable via `accounting_member_update` (rates in DOLLARS - see the money rule), verified
   with `accounting_member_get` (cents on the read). Field traps and member delete:
   `references/record-editing.md`.
3. **Reconcile time before generating.** `accounting_payroll_run_create` computes each hourly
   member from the time entries logged over the period; fixed members get the flat rate. **A
   run generated with no logged time snapshots every hourly member at ZERO and still looks
   like a valid run.** So: `accounting_time_entries_list({ member_id?, from, to })` (returns
   `{ entries, total_minutes }`, capped at 500 rows) and confirm the hours per hourly member
   against what they actually worked first.
   **You cannot log NEW time from here.** `accounting_time_entry_create` is in the registry
   but is not callable: its schema declares `properties: {}`, so the proxy drops every
   argument and the route 400s each call. Missing time is a dashboard entry - name the member,
   date and hours, have the owner add them, then confirm the minutes landed before you
   generate. **Existing entries ARE fixable**: `accounting_time_entry_update` (`member_id` NOT
   patchable) and `accounting_time_entry_delete` (HARD delete, unrecoverable - confirm first).
   Full mechanics: `references/record-editing.md`.
4. `accounting_payroll_run_create({ period_start, period_end, source_currency?, label? })` -
   dates are `YYYY-MM-DD`. It returns the run with per-member items; show those amounts for
   approval before anyone acts on them. For any run you did NOT just create,
   `accounting_payroll_run_get` is the only surface carrying per-member amounts.
5. **Runs are snapshots.** Amounts are computed at create time and NOTHING recomputes them:
   editing or deleting time entries afterwards never changes what a run pays, and a second
   `run_create` for the period ADDS a run rather than correcting the first (no Olympus tool
   deletes a run). Fix the time FIRST, then generate, once.
6. **Then hand off, and do not claim payroll is done.** A run is born `draft`; no MCP tool
   finalizes it, and the Wise batch CSV export is dashboard-session-only and refuses a draft
   run. End the play by telling the owner exactly which run id to finalize and export in the
   Hiveku dashboard. Run semantics: `references/record-editing.md`.

Payroll also never touches AP: runs write payroll rows, not bill payments, so nothing you do here
appears in `accounting_pnl_summary`. See the P&L caveats below.

## Play 5 - PTO administration

PTO is a full read-write surface: policies (`accounting_pto_policy_create` / `_update` /
`_deactivate`), grants (`accounting_pto_balance_set` - an ABSOLUTE set that overwrites the
previous grant with no history), requests (`accounting_pto_request_create`) and decisions
(`accounting_pto_request_review({ request_id, action: 'approve' | 'deny' | 'cancel' })`).
The tools carry none of the guardrails an approval flow needs - no balance check, no status
guard, and `reviewed_by_user_id` is forced to NULL, so the system records no approver. **Load
`references/pto-administration.md` before ANY PTO write**; the `_list` reads stay free. The
non-negotiables: balances before approvals; a NAMED human's yes per request (never
batch-approve - "approve all the PTO" gets the queue listed per member with balances, not a
loop of approvals); log the approver to memory/PM because nothing else will. Approved PTO
creates no time entries and feeds no payroll run.

## Play 6 - Recurring bill schedules

A schedule is a **standing authorization to pay**: its bills are born `open` with
`approval_status: not_required` - no submit, no approve. Schedule writes are confirmed like
payments, and `references/recurring-bill-schedules.md` is REQUIRED reading before any schedule
write. The headlines that must survive even a skim: only a FUTURE `start_date` defers the
first bill (anything else can bill at the next 05:00 UTC tick, and `is_active: false` on
create is silently stripped); **a cadence edit is a billing event** and `_update` is NOT
idempotency-protected - a repeated edit can generate a second bill; `is_active: false` via
`_update` is the reversible stop; `_delete` is a hard delete that orphans every generated
bill's provenance. Diagnose with `accounting_bill_schedule_get` - `is_active: true` with
`next_run_at: null` never fires again.

## Play 7 - Profit and loss, honestly

`accounting_pnl_summary({ period_start, period_end })` returns exactly four numbers:
`revenue_cents`, `expenses_cents`, `profit_cents`, `margin_bps`. There is no category, vendor or
client breakdown - do not promise one, and do not assemble one by guessing.

Read the definition before you report it:
- **Cash basis.** Revenue is customer payments in status captured, settled or partial_refund, net of
  refunds, dated by settled -> captured -> created. Expenses are **vendor bill PAYMENTS only.**
- **Payroll is not in it.** Payroll runs never write bill payments, so for any account using
  Hiveku payroll the expense side omits the entire payroll and profit is overstated by that
  amount. This is the fastest way to lose credibility with an owner.
- **Approved-but-unpaid bills are not in it either.** Cash basis means the payable is invisible
  until it is paid.
- **Omitting both dates returns all-time**, not the current month.

So never present it alone: pair it with `accounting_ap_aging` (owed but unpaid), the period's
payroll totals, and the label "cash basis, excludes payroll" on any client-facing surface.

**The comparability gate.** P&L revenue (cash captured), platform revenue (orders), AR aging
(billed and owed) and payroll totals are four different definitions of money. Never sum or
reconcile them into one figure; report them side by side, each with its definition - a "gap"
between them is usually definitional, not missing money.

**Artifact first, story second.** Before narrating any move ("expenses doubled"), rule out
measurement artifacts: all-time vs period P&L (omitted dates), truncated pagination (page one
vs `total`), a schedule burst from a cadence edit, a duplicate payroll run, cash-basis timing
(one big bill paid a week late moves two months' stories). Only then does the move get a
narrative.

## Weekly cadence

1. **AP sweep** - `accounting_bill_list` paginated across `draft` (stuck: submit, delete a
   duplicate, or void), `submitted` (approve queue, one at a time with explicit approval), and
   `open` (approved and unpaid: the pay run).
2. **Schedule reconcile** - for every `open` bill, note its `schedule_id`. A generated bill
   nobody expected, or a hand-created bill duplicating a live schedule, both surface here.
3. **Pay run** - open bills sorted by `due_date`. Confirm each, pay only what the owner named,
   distinct `reference` and `paid_at` on every `accounting_bill_record_payment`, and verify
   `balance_due_cents` moved.
4. **AR chase** - `accounting_ar_aging` plus a full paginated `accounting_invoice_list`,
   reconciled to the aging total. Overdue rows get a drafted reminder and a PM task.
5. **Timesheets** - `accounting_time_entries_list({ from, to })` for the week. Missing time
   from an hourly member is next period's wrong paycheck; chase it now, not on run day. Wrong
   hours on an EXISTING entry are fixable now (`accounting_time_entry_update`, confirmed);
   missing entries are theirs to make in the dashboard.
6. **Exceptions to PM** - duplicate vendor, a bill with no matching schedule, an amount out of
   pattern, an invoice sitting in draft, a member with zero logged hours.

## Month-end close

Run it against an explicit period, in this order:
1. Finish the AP sweep so nothing is stranded in `draft` or `submitted` on the last day.
2. `accounting_pnl_summary({ period_start, period_end })` for the closed month, with the caveats
   above stated in the same breath as the number.
3. `accounting_ap_aging` and `accounting_ar_aging` snapshots - the accrual reality the cash-basis
   P&L leaves out.
4. `accounting_payroll_run_list` -> the period's runs, then `accounting_payroll_run_get` per
   run for the per-member amounts. Payroll is its own line because the P&L does not carry it.
5. Owner update: cash in, cash out, payroll separately, what is owed, what is owed to us, and the
   three things that need a decision. Every figure traceable to a named tool call - never a
   model estimate. **Each line carries a status from a closed set: sourced, partial (a source
   call failed - state what is missing; a failed source is NEVER reported as zero), unknown,
   or not_applicable; unknown never quietly becomes a pass, and a partial never hides in the
   summary.** Disclose the sample: rows seen vs `total`, and what was excluded and why.
6. `memory_create` the close (the numbers and any judgment calls) and `pm_tasks_complete` the
   month's tasks.

## Year-end 1099

No tool aggregates 1099 totals - build it, and start in December, not April.
1. `accounting_vendor_list` -> filter to `is_1099`. A flagged vendor missing `tax_id` is now
   fixable in place via `accounting_vendor_update`; a wrongly un-flagged vendor gets
   `is_1099: true` the same way. These are stored labels - no 1099 generator reads them; the
   worksheet below is still the only aggregation. `accounting_vendor_get` per flagged vendor
   frames expectations (`lifetime_paid_cents` is all-time, never a period figure).
2. Per flagged vendor, `accounting_bill_list({ vendor_id, status: "all", limit: 200, offset })`
   paginated, then `accounting_bill_get` on each paid bill to sum the payments that fall inside
   the calendar year. Payment dates, not bill dates, decide the year.
3. Hand the owner a per-vendor total with the vendor's `tax_id`, disclose the sample (bills
   walked vs `total`, statuses excluded), and say plainly that Hiveku does not file 1099s -
   this is the worksheet, not the filing. Vendors carry no payout currency, so do not put one
   on the worksheet; if the owner needs it, it comes from their Wise records.

## Pitfalls

- Cents, always cents - except member `pay_rate` / `bill_rate` (dollars, create AND update)
  and PTO hours. Echo both forms before every numeric write.
- A recorded payment cannot be undone and blocks both void and delete. Confirm before, never
  after - and neither recording a payment nor generating a payroll run moves any money.
- Identical payment bodies within an hour are deduplicated; the second books nothing while
  returning success. Distinct `reference` and date on every one.
- A 200 from a PATCH proves nothing - unknown keys are silently stripped. Re-read the row.
- 50-row list defaults; paginate to `total` and reconcile AR to the aging bucket. Drafts hide
  from aging on BOTH sides - sweep them explicitly.
- Schedule-generated bills skip the approval gate, and a cadence edit can bill on the next
  tick. Schedule writes are payment-grade.
- Archived is recoverable, deleted is not - and an archived member is STILL PAID; only
  `status: 'inactive'` stops payroll.
- P&L is cash basis and excludes payroll - never hand it over as "profit" without the label
  and the AP aging beside it.
- Still missing from the surface, so name the dashboard action instead of guessing a tool: no
  invoice create, send or get tool, no payroll finalize (or run delete) tool, and no working
  time-entry create (`accounting_time_entry_create` exists but drops every argument). Do not
  report a number you could only have gotten from one.

## Reference files (load on demand)

- `references/payment-refusals.md` - refusal catalog, replay mechanics, retry and
  ambiguous-write procedure. Load before every pay run and on any payment non-200/timeout.
- `references/recurring-bill-schedules.md` - full schedule semantics. Load before ANY schedule
  write and when diagnosing bill generation.
- `references/pto-administration.md` - PTO policies, balances, requests, the approval
  procedure. Load before ANY PTO write.
- `references/record-editing.md` - field-level edit/delete semantics for vendors, members,
  bills, categories and time entries. Load before editing or deleting any of those records.
