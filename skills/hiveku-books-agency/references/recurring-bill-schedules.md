# Recurring bill schedules - full semantics

Load this before ANY write to `accounting_bill_schedule_create`, `accounting_bill_schedule_update`
or `accounting_bill_schedule_delete`, and when diagnosing why a schedule did or did not generate
a bill. Every claim below is from the tools' registered descriptions.

## What a schedule IS

A schedule is a **standing authorization to pay**. Bills it generates are created `status: open`
with `approval_status: not_required` - they never pass submit or approve, so the entire
submit -> approve gate that Play 2 is built on is bypassed for every schedule-generated bill.
Creating or reactivating a schedule is therefore payment-grade: confirm it with the same rigor
as a payment (vendor, cadence, the per-cycle cents total, and a human yes on that exact plan).

The compile-bills cron runs daily at 05:00 UTC and issues a bill for every schedule matching
`is_active: true` AND `next_run_at` at or before now.

## Create (`accounting_bill_schedule_create`)

- `name` and `line_items` are required (at least one line, each carrying `description`,
  `quantity`, `unit_cents`). The lines are stored as `template_json`, the template every
  generated bill is built from. Money is CENTS; `tax_bps` is basis points (875 = 8.75%).
- **The first bill can land on the next tick.** `next_run_at` is taken straight from
  `start_date`; an omitted or unparseable `start_date` falls back to now, and a PAST
  `start_date` is kept as-is. Only a FUTURE `start_date` defers the first bill. Never "test" a
  schedule by creating it with a past or missing start date - that is a real payable on the
  next 05:00 UTC tick.
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

## Update (`accounting_bill_schedule_update`) - a cadence edit is a billing event

- Sending `interval_unit`, `interval_count`, `anchor_day` or `start_date` - or sending
  `is_active: true` while the schedule is paused or its `next_run_at` is null - RECOMPUTES
  `next_run_at`, and only a FUTURE `start_date` defers it. Anything else recomputes to now
  (for monthly schedules with an `anchor_day`, to that day of the CURRENT month, already past
  once the day has gone by), so the cron issues a bill at the next 05:00 UTC tick.
- **This route is NOT idempotency-protected.** Repeating a cadence edit re-arms `next_run_at`
  every time and can produce a second bill. One confirmed edit, then verify via
  `accounting_bill_schedule_get`; never re-send an edit because the response was slow.
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

- **A deleted vendor does not stop its schedules.** `accounting_vendor_delete` retires the
  vendor, but any active schedule pointed at it KEEPS generating bills on its cron - the
  compiler copies `vendor_id` forward without checking `deleted_at`. Stopping the money means
  pausing the schedule, not deleting the vendor.
- **An archived expense category does not stop schedules coding to it** - archiving a category
  leaves every schedule's `category_id` in place and new bills keep landing in it.
- Weekly reconciliation: for every `open` bill, check its `schedule_id`. A schedule-generated
  bill that nobody expected means a cadence edit re-armed something or a schedule everyone
  forgot is still live. A hand-created bill duplicating a schedule's cadence is a
  double-booked payable.
