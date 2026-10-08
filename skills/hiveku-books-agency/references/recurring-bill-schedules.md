# Recurring bill schedules - full semantics

Load this before ANY write to `accounting_bill_schedule_create`, `accounting_bill_schedule_update`
or `accounting_bill_schedule_delete`, and when diagnosing why a schedule did or did not generate
a bill. Every claim below is from the tools' registered descriptions or, where the server's
rules have moved on from a description, from the builder routes behind them - the route is
what answers.

## What a schedule IS

A schedule is a **standing authorization to pay**. Bills it generates are created `status: open`
with `approval_status: not_required` - they never pass submit or approve, so the entire
submit -> approve gate that Play 2 is built on is bypassed for every schedule-generated bill.
Creating or reactivating a schedule is therefore payment-grade: confirm it with the same rigor
as a payment (vendor, cadence, the per-cycle cents total, and a human yes on that exact plan).

The compile-bills cron runs daily at 05:00 UTC and issues a bill for every schedule matching
`is_active: true` AND `next_run_at` at or before now.

**What a generated bill looks like.** It is dated the day of the period it pays for (the
scheduled date, not the moment the cron ran) and falls due by payment terms: its vendor's
`default_payment_terms`, else the account's `default_payment_terms` from
`accounting_settings_get`. `Net 15` is 15 days after the bill date; with no terms, or terms
that name no days, the bill is due on its bill date. The next run then keeps the schedule's
day of the month, clamped to a shorter month - a schedule on the 31st bills February 28 and
March 31, with no skipped month and no drift to the 28th. `accounting_bill_create` does none
of this: a bill created through it gets no terms and no due date unless you send them.

## Create (`accounting_bill_schedule_create`)

- `name` and `line_items` are required (at least one line, each carrying `description`,
  `quantity`, `unit_cents`). The lines are stored as `template_json`, the template every
  generated bill is built from. Money is CENTS; `tax_bps` is basis points (875 = 8.75%).
- **The first bill can land on the next tick.** `next_run_at` is taken straight from
  `start_date`; an omitted or unparseable `start_date` falls back to now, and a PAST
  `start_date` is kept as-is. Only a FUTURE `start_date` defers the first bill. Never "test" a
  schedule by creating it with a past or missing start date - that is a real payable on the
  next 05:00 UTC tick, and a start several periods back bills one period per daily tick until
  it has caught up.
- **`is_active` is NOT in the create schema** - `is_active: false` is silently stripped and the
  schedule goes live anyway. To create paused: create, then immediately
  `accounting_bill_schedule_update({ schedule_id, is_active: false })`, and verify the
  returned `is_active` before walking away. `pause_reason`, `next_run_at` and `template_json`
  are stripped on create the same way.
- `interval_count` is ignored for the first run and applies only to later ones. `anchor_day`
  must be 1-28 (else 400) and applies only when `interval_unit` is `month`, where it rewrites
  the day-of-month of the first run and can therefore move it into the past.
- `vendor_id` and every `category_id` (schedule level and per line) are ownership-checked; a
  foreign id is a 400, not a silent attach.
- The proxy's Idempotency-Key means an identical retry replays the cached 201 for an hour
  instead of creating a second schedule - and a rejected payload replays the same 400 for an
  hour until the body changes.

## Update (`accounting_bill_schedule_update`) - a real cadence change is a billing event

- `next_run_at` is re-armed in two cases only: a cadence field (`interval_unit`,
  `interval_count`, `anchor_day`, `start_date`) arrives with a value that DIFFERS from the
  stored one, or `is_active: true` arrives while the schedule is paused or its `next_run_at`
  is null. Resending the stored values - a full read-modify-write, a rename, a line edit -
  moves nothing, so an edit that leaves the cadence alone never bills.
- A resume keeps the stored next date when it is still ahead; otherwise it takes the first
  scheduled date AFTER now, so the dates missed while paused are not billed. It also clears
  `pause_reason`.
- A real cadence change never picks a date already past. On a schedule that has billed and
  whose next date is still ahead, the billed period runs out first: the new cadence starts on
  or after that next date. Otherwise it starts from today - a `start_date` still ahead is
  that date, but with no future start the first new date CAN be today, and the cron bills it
  at the next 05:00 UTC tick. Confirm a real cadence change like a payment, and read
  `next_run_at` back.
- **This route is NOT idempotency-protected**, but a repeat does not re-arm: the second
  identical edit carries values equal to the stored ones and changes nothing. One confirmed
  edit, then verify via `accounting_bill_schedule_get`.
- Reactivating a schedule that already reached `max_iterations` resets `iteration_count` to 0,
  granting the whole allowance again.
- `line_items` REPLACES the entire template instead of merging - a one-line payload deletes
  every other line. Read-modify-write: `accounting_bill_schedule_get` first, edit the full
  array, resend everything. **The read and write shapes differ**: the template comes back as
  `template_json`, but writing it back requires the key `line_items`; a `template_json` key
  sent to update is silently dropped, returning 200 with nothing changed.
- `is_active: false` stamps `paused_at` and stops generation - this is THE reversible way to
  stop a runaway schedule. `vendor_id: null` detaches the vendor, and bills generated
  afterwards carry no vendor. `pause_reason`, `next_run_at`, `last_run_at` and
  `iteration_count` are stripped by the parse - a call carrying only those returns 200 having
  changed nothing. Omitted keys keep their stored value; schema defaults do NOT re-apply.

## Read (`accounting_bill_schedule_get`) - the diagnosis tool

Returns the full runtime state: `next_run_at`, `last_run_at`, `iteration_count` against
`max_iterations`, `is_active`, `paused_at`, `pause_reason` and the line template.
**`is_active: true` with `next_run_at: null` means the schedule is exhausted or stopped and
will NEVER fire again, however active it looks** - read both fields before concluding anything.
`is_active: false` with `pause_reason` `Paused: the vendor was archived.` is the compiler's
own stop: the schedule came due while its vendor was archived or deleted.
A schedule owned by another account 404s exactly like a missing id.

## Delete (`accounting_bill_schedule_delete`) - prefer pause, almost always

A HARD row delete: no soft-delete column, no confirm field, no restore path. Bills the schedule
already generated are NOT deleted but are silently orphaned - `accounting_bills.schedule_id` is
ON DELETE SET NULL, so every past bill loses its link to the schedule and can no longer be
traced back to it, including bills still sitting unpaid in the pay queue. To stop future
billing while keeping the row, its counters and the provenance of past bills, send
`is_active: false` through update; that is reversible, delete is not. Delete only on an
explicit human yes naming the schedule.

## Cross-tool traps

- **An archived or deleted vendor stops its schedules - at their next due run, not at once.**
  The compiler checks the vendor when a schedule comes due: if the vendor is archived or
  deleted it pauses the schedule (`is_active: false`, `paused_at`, the `pause_reason` above)
  and makes no bill. Until that run the schedule still reads active. Bringing the vendor
  back does not resume it - that is a deliberate `is_active: true`, confirmed like any
  reactivation - and resuming while the vendor is still archived only pauses it again.
- **An archived expense category does not stop schedules coding to it** - archiving a category
  leaves every schedule's `category_id` in place and new bills keep landing in it.
- Weekly reconciliation: for every `open` bill, check its `schedule_id`. A schedule-generated
  bill that nobody expected means a real cadence change or a resume re-armed something, or a
  schedule everyone forgot is still live. A hand-created bill duplicating a schedule's
  cadence is a double-booked payable.
