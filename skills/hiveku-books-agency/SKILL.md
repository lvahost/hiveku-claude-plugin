---
name: hiveku-books-agency
description: Full bookkeeping and back-office methodology for operating a Hiveku account's money. Use for ANY accounting work - vendor bills and accounts payable, bill approval and pay runs, vendors and 1099s, expense categories and the chart of accounts, recurring bill schedules, accounts receivable and invoice chasing, recording payments in or out, profit and loss, payroll runs and timesheets, PTO queues, accounting settings, and month-end or year-end close.
---

# Hiveku Books Agency Operating System

Operate the account's books like a controller who signs their name to the numbers: set the
account up once, keep AP and AR moving on a weekly rhythm, close each month against an explicit
period, and never report a figure you cannot trace to a named tool call. Every tool named below
is a real Hiveku MCP tool. Where a capability has no tool, the play says so and hands off to the
dashboard rather than inventing one.

**There is no accounting department agent.** `talk_to_department({ domain: 'accounting' })` is
refused server-side with `Unknown domain 'accounting'`, and `account_context_get({ domain:
'accounting' })` is not in that enum either. So all accounting judgment lives in this file. When
you need brand-voiced client-facing copy (an AR reminder, an owner update), load context with
`account_context_get({ domain: 'sales' })` and draft it yourself, or route the reminder through
`talk_to_department({ domain: 'outbound', message })`, which is a real department.

## The money rule, before anything else
- **Every accounting money field is an integer of CENTS**: `amount_cents`, `unit_cents`,
  `discount_cents`, `total_cents`, `balance_due_cents`, `revenue_cents`, `expenses_cents`,
  `profit_cents`. Tax is BASIS POINTS: `tax_bps: 875` is 8.75%. `margin_bps` reads the same way.
- **The one exception in the whole surface is `accounting_member_create.pay_rate`, which is
  DOLLARS** (per hour when `pay_rate_type: 'hourly'`, per period when `fixed`). The route
  multiplies it by 100 for you.
- Before any write carrying a number, echo BOTH forms back and get the integer confirmed:
  "$1,200.00 = amount_cents: 120000". A missing 00 books $12.00 against a $1,200 bill and leaves
  an $1,188 phantom balance that no tool can undo.

## Operating principles
- Hiveku is the source of truth. Durable findings (the chart of accounts you settled on, vendor
  terms, who approves what, the close calendar, recurring-schedule inventory) go to department
  memory: read the current document with `memory_list({ domain })`, append your note to the
  `content` it returns, and send the WHOLE merged body to `memory_update({ memory_id, content })`,
  which REPLACES the document - sending only the new note destroys what was there.
  `memory_create({ type: 'memory', name: '<dept>', content })` only when no entry exists yet. Work
  items -> `pm_tasks_create` / `pm_tasks_complete`.
- Reads are free, writes are not. Listing bills, invoices, aging, P&L, members, time, PTO and
  settings is safe to run freely. Every write here either commits a payable, books cash, or pays
  people, so each one gets an explicit confirmation naming the party, the document number and the
  cents integer.
- One write is genuinely irreversible: see the one-way door below. Two others are effectively
  one-way in practice - `accounting_member_create` and `accounting_vendor_create` have no update
  or delete tool, so a wrong `is_1099` or `tax_id` on a vendor, or a wrong `pay_rate`,
  `pay_period` or `target_currency` on a member, is stuck until someone fixes it in the dashboard.
- `hiveku-data/` snapshots are for orientation only. Balances, statuses and aging move whenever
  anyone pays anything; pull live for any number that reaches a client or a payment.

## The one-way door: recording a payment
`accounting_bill_record_payment` (AP, money out) and `accounting_invoice_record_payment` (AR,
cash in) both **book the payment only. Neither moves money.** Record AFTER the wire or check has
actually left, never before, or the books say paid while the money never went.

**Nothing in the tool surface reverses a recorded payment.** There is no payment delete, void or
reversal tool and no Olympus route behind one. Worse, once a bill carries any payment,
`accounting_bill_void` refuses it: 409 `This bill has payments recorded and cannot be voided.
Reverse the payments first.` A mistyped cents integer is permanent until someone edits the
database. Confirm vendor, `bill_number` and the exact integer before the call, every time.

**Always pass a distinct `reference` and `paid_at` / `received_at`.** The MCP proxy stamps every
write with an idempotency hash over account + path + body, and the builder replays a matching
response for one hour. Two genuinely separate $500 partial payments on the same bill, minutes
apart, with no `reference` and no date, produce a byte-identical body: the second call replays
the first response - same `payment_id`, same balance - writes nothing, and looks like success.
Only $500 is booked. The tool does not declare `idempotency_key` in its schema, so the proxy
drops it and you cannot set the key yourself; a distinct `reference` (check number, ACH trace,
confirmation code) is the only lever you have. Verify `balance_due_cents` in the response
actually moved before reporting a payment as recorded.

**Refusals are guardrails, not obstacles.** Expect these, and match on a distinctive prefix rather
than the whole string - AP and AR word several of them differently and some carry an em dash:
- 400 `Amount exceeds balance due` (AP) / `Amount exceeds the invoice balance` (AR). Overpayment
  is refused, never split. One wire covering three invoices is three calls against three ids.
- 409 `A card charge on this invoice is still being confirmed with the payment processor. Resolve
  that hold before recording a manual payment, so the client cannot end up paying twice.` STOP
  and escalate to a human. Never route around this one.
- 409 `Cannot pay a "void" bill` / `Cannot record payment on a voided invoice`.
- 409 `This bill was just updated by another payment. Reload and try again.` (AR: `This invoice
  was just updated by another payment. Reload and try again.`) Re-read with `accounting_bill_get`
  or a fresh `accounting_invoice_list` and re-confirm the amount before retrying. Never
  blind-retry a payment.
- 409 `Duplicate idempotency key`. Match on exactly that prefix. AR returns it bare with no
  suffix; AP appends an EM DASH and "this payment was already recorded." Treat as already done,
  then re-read the record to confirm what is actually booked.

## Play 0 - Account setup (do this the first time you touch an account's books)
1. `accounting_settings_get` -> `bill_prefix`, `default_currency`, `default_payment_terms`.
   **There is no dashboard page for these - this tool pair is the only surface that reads or
   writes them.** `accounting_settings_update({ bill_prefix, default_currency,
   default_payment_terms })` sets them. Do it before the first bill is created, because
   `bill_prefix` shapes every generated bill number from then on.
2. `accounting_expense_category_list` -> the chart of accounts bills code to. It **auto-seeds
   niche defaults from the account industry on the first call**, so calling it early is how the
   account gets a chart of accounts at all. There is no category create tool here; extra
   categories are a dashboard job.
3. `accounting_bill_schedules_list` -> the recurring definitions already generating bills.
   Inventory these into memory before you create anything by hand.
4. `accounting_vendor_list` and `accounting_member_list` -> who gets paid, and how.
5. Record the baseline with `memory_create`: settings, category ids you will actually use, the
   recurring schedules, vendor and member counts, and who signs off on payments.

## Play 1 - Vendor onboarding and 1099 setup
Decisions made at creation are stuck: **there is no `accounting_vendor_update` tool.**
1. `accounting_vendor_list({ q: '<name>' })` first - duplicate vendors are the commonest source
   of a double-booked payable.
2. `accounting_expense_category_list` -> pick the category this vendor's bills will code to.
3. `accounting_vendor_create({ name, email, default_payment_terms, is_1099, tax_id, phone,
   notes })`. `name` is the only required field, but decide all of these up front:
   `default_payment_terms` is free text ("Net 30"), and `is_1099` plus `tax_id` (EIN or SSN) are
   what year-end 1099 reporting reads. Getting `is_1099` wrong is a January problem you cannot
   fix from here.
   **Do not pass `target_currency`.** The tool advertises it and the registry description calls it
   "the payout currency for the Wise export", but the route parses with `vendorBaseSchema`, which
   has no such key, so zod strips it and the create never writes it - `accounting_vendors` has no
   `target_currency` column at all. Payout currency is a PAYROLL MEMBER field
   (`accounting_member_create.target_currency`); the Wise CSV is built from payroll run items, not
   vendors. Sending it looks accepted and stores nothing.

## Play 2 - Accounts payable, end to end
Lifecycle: **create (draft) -> submit -> approve (open) -> record payment (partially_paid ->
paid)**, with `void` available only until the first payment lands.

Before creating anything, `accounting_bill_schedules_list`. If a schedule already covers this
vendor and cadence, the bill will be generated for you and a hand-created one double-books the
payable. Schedules are READ-ONLY from here - no create or update tool exists; the dashboard owns
them.

- `accounting_bill_create({ vendor_id, line_items, ... })` - `vendor_id` and `line_items` are
  required. Each line item is `{ description, quantity, unit_cents, discount_cents?, tax_bps?,
  category_id?, sort_order? }`. `bill_number` is auto-generated from `bill_prefix`. **Always set
  `category_id`** (bill level, line level, or both) or the expense lands uncategorized and the
  P&L grouping is wrong for the rest of the year. Optional but worth filling: `bill_date`,
  `due_date`, `vendor_invoice_number`, `po_number`, `terms`, `currency`. Both ids are
  ownership-checked: a `vendor_id` from another account returns 400 `Unknown vendor`, and a
  foreign `category_id` (bill level or line level) is rejected too.
- `accounting_bill_submit({ bill_id })` - draft -> submitted.
- `accounting_bill_approve({ bill_id })` - -> open, ready to pay. `approve: false` rejects back to
  draft. The route accepts **both** `draft` and `submitted`, so a draft can be approved without
  ever being submitted; do that only on the owner's word. Any other status returns 409
  `Cannot approve a bill in status "<x>"`.
- `accounting_bill_void({ bill_id, reason })` - only while `amount_paid_cents` is 0.
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
  estimate. It creates a **draft** invoice, copies line items, totals, notes and terms, links back
  via `converted_invoice_id`, moves the estimate to `converted`, revokes portal tokens, and
  returns 409 if already converted. See the commerce skill for the quote-to-cash arc.
- Draft invoices are **not** in AR aging, which counts only `sent`, `viewed` and
  `partially_paid`. A converted-but-never-sent invoice is receivable nobody is tracking. Surface
  those; sending is a dashboard action.
- `accounting_invoice_list({ status, q, limit, offset })` returns `{ data, total }` with the same
  50/200 defaults. Loop it, then **reconcile**: sum `balance_due_cents` across the `sent`,
  `viewed` and `partially_paid` rows and compare to `accounting_ar_aging.total_cents`. If they
  disagree you have not seen every invoice. Do that before writing any chase list, or you will
  report a client's receivables as clean because you only read page one.
- Reminder copy: `talk_to_department({ domain: 'outbound', message })`, show the draft, send
  nothing without approval. Log each chase with `crm_create_activity` and put promised dates in
  `pm_tasks_create`.
- Cash arrives -> `accounting_invoice_record_payment({ invoice_id, amount_cents, method,
  reference, received_at })`. `method` is one of check, wire, cash, credit_note, manual, ach.
  **Always send it.** The tool's `required` is only `invoice_id` and `amount_cents`, but the AR
  schema's `method` is a bare enum with no default and no `.optional()`, unlike the AP side which
  defaults to `check` - omit it and the call dies on 400 `Invalid payload`. Re-read the one-way
  door section first.

## Play 4 - Timesheets and payroll
Payroll has three traps that produce wrong pay, and it does not finish here.

1. **`accounting_payroll_run_list` FIRST.** There is no unique constraint on the run period, so a
   second create for the same period makes a SECOND run and a second payable total. Check before
   you generate, every time.
2. **`accounting_member_list`** -> the roster. Only members with `status: 'active'` are picked up
   by a run. `pay_rate` was set in dollars at creation and is stored as cents; there is no member
   update tool.
3. **Reconcile time before generating.** `accounting_payroll_run_create` computes each hourly
   member from the time entries logged over the period; fixed members get the
   flat rate. **A run generated with no logged time snapshots every hourly member at ZERO and
   still looks like a valid run.** So: `accounting_time_entries_list({ member_id?, from, to })` -
   it returns `{ entries, total_minutes }`, capped at 500 rows - and confirm the hours per hourly
   member against what they actually worked before you generate anything.
   **You cannot log time from here.** `accounting_time_entry_create` is in the registry but is
   not callable. It declares `properties: {}`, and the proxy's no-allowlist branch builds its
   allowlist from `Object.keys(inputSchema.properties)` - an EMPTY set, not an absent one - so it
   drops `member_id`, `work_date`, `minutes`, `hours`, `project`, `billable` and `note` alike and
   POSTs `{}`. The route requires `member_id` and `work_date`, so every call comes back 400
   `Invalid payload`. Missing time is a dashboard entry, the same hand-off as payroll finalize:
   name the member, the date and the hours, have the owner add them on the accounting timesheet,
   then re-run `accounting_time_entries_list` and confirm the minutes landed before you generate.
4. `accounting_payroll_run_create({ period_start, period_end, source_currency?, label? })` -
   dates are `YYYY-MM-DD`. It returns the run with per-member items; show those amounts for
   approval before anyone acts on them.
5. **Then hand off, and do not claim payroll is done.** A run is created in `draft`. There is no
   MCP tool to finalize it (the Olympus payroll detail route is GET only), and the Wise batch CSV
   at `/api/accounting/payroll/<run_id>/export` is **not reachable with a Hiveku API key** - it is
   session-authenticated in the dashboard, and it refuses a draft run with 409 `Finalize this
   payroll run before exporting the Wise CSV.` End the play by telling the owner exactly which run
   id to finalize and export in the Hiveku dashboard.

Payroll also never touches AP: runs write payroll rows, not bill payments, so nothing you do here
appears in `accounting_pnl_summary`. See the P&L caveats below.

## Play 5 - PTO (read-only from here)
- `accounting_pto_policies_list` - accrual rules, carry-over, entitlement.
- `accounting_pto_balances_list` - granted, used and remaining per member.
- `accounting_pto_requests_list({ member_id?, status: 'pending' })` - the approver's queue.

**There is no PTO approval tool.** The wording of the request and balance tools implies an
approve action; the builder has a PATCH route for it that was never exposed. Review the pending
queue against real balances, then hand the approve or deny decision to the owner in the
dashboard. Do not invent a tool name. Note also that approved PTO does not create time entries,
so it does not feed hourly payroll - paid leave for an hourly member is a deliberate timesheet
entry the owner has to make in the dashboard, because `accounting_time_entry_create` cannot carry
a body (see Play 4).

## Play 6 - Profit and loss, honestly
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

So never present it alone. Present it with `accounting_ap_aging` (owed but unpaid), the period's
payroll totals from `accounting_payroll_run_list`, and the label "cash basis, excludes payroll"
on any client-facing surface.

## Weekly cadence
1. **AP sweep** - `accounting_bill_list` paginated across `draft` (stuck: submit or void),
   `submitted` (approve queue, one at a time with explicit approval), and `open` (approved and
   unpaid: the pay run).
2. **Pay run** - open bills sorted by `due_date`. Confirm each, pay only what the owner named,
   distinct `reference` and `paid_at` on every `accounting_bill_record_payment`, and verify
   `balance_due_cents` moved.
3. **AR chase** - `accounting_ar_aging` plus a full paginated `accounting_invoice_list`,
   reconciled to the aging total. Overdue rows get a drafted reminder and a PM task.
4. **Timesheets** - `accounting_time_entries_list({ from, to })` for the week. Missing time from
   an hourly member is next period's wrong paycheck; chase it now, not on run day. You cannot
   enter it for them - the entry is theirs to make in the dashboard.
5. **Exceptions to PM** - duplicate vendor, a bill with no matching schedule, an amount out of
   pattern, an invoice sitting in draft, a member with zero logged hours.

## Month-end close
Run it against an explicit period, in this order:
1. Finish the AP sweep so nothing is stranded in `draft` or `submitted` on the last day.
2. `accounting_pnl_summary({ period_start, period_end })` for the closed month, with the caveats
   above stated in the same breath as the number.
3. `accounting_ap_aging` and `accounting_ar_aging` snapshots - the accrual reality the cash-basis
   P&L leaves out.
4. `accounting_payroll_run_list` -> the period's payroll total, reported as its own line because
   the P&L does not carry it.
5. Owner update: cash in, cash out, payroll separately, what is owed, what is owed to us, and the
   three things that need a decision. Every figure traceable to a named tool call.
6. `memory_create` the close (the numbers and any judgment calls) and `pm_tasks_complete` the
   month's tasks.

## Year-end 1099
No tool aggregates 1099 totals - build it, and start in December, not April.
1. `accounting_vendor_list` -> filter to `is_1099`. Any flagged vendor missing `tax_id` is a
   blocker, and there is no vendor update tool, so it is a dashboard fix. Raise it as a PM task
   the moment you find it.
2. Per flagged vendor, `accounting_bill_list({ vendor_id, status: "all", limit: 200, offset })`
   paginated, then `accounting_bill_get` on each paid bill to sum the payments that fall inside
   the calendar year. Payment dates, not bill dates, decide the year.
3. Hand the owner a per-vendor total with the vendor's `tax_id`, and say plainly that Hiveku does
   not file 1099s - this is the worksheet, not the filing. Vendors carry no payout currency, so do
   not put one on the worksheet; if the owner needs it, it comes from their Wise records.

## Pitfalls
- Cents, always cents. Except `accounting_member_create.pay_rate`, which is dollars. Echo both
  forms before every numeric write.
- A recorded payment cannot be undone and blocks the void that would have fixed it. Confirm
  before, never after.
- Recording a payment moves no money, and generating a payroll run pays nobody. Both are
  bookkeeping. Say so when you report them, or an owner will assume the money went out.
- Identical payment bodies within an hour are deduplicated by the proxy and the second one books
  nothing while returning success. Distinct `reference` and date on every one.
- 50-row list defaults on bills and invoices. Paginate to `total`, and reconcile AR to the aging
  bucket before calling receivables clean.
- Drafts hide from aging on both sides: draft bills are out of AP aging, draft invoices are out of
  AR aging. Sweep them explicitly.
- P&L is cash basis and excludes payroll. Never hand that number to a client as "profit" without
  the label and the AP aging beside it.
- No update tool for vendors or members, no create tool for bill schedules, no PTO approval tool,
  no invoice create, send or get tool, no payroll finalize tool, and no working time-entry create
  (`accounting_time_entry_create` exists but drops every argument). When the play needs one of
  those, name the dashboard action and the exact record; do not guess a tool name that does not
  exist, and do not report a number you could only have gotten from one.
