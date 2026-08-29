---
description: Cash-flow forecast - "can we afford X" as a 13-week view built from open AP, AR collection reality, recurring schedules, and payroll cadence. Pure reads, every assumption stated.
argument-hint: "[optional question - e.g. 'can we afford a $12k hire in October?']"
---
Cash-flow forecast. **All accounting money is integer CENTS.** Convert for the human, keep the
integer in the math. This command is PURE READS - it records nothing, approves nothing, pays
nothing. Its output is a 13-week table where every line names the tool call it came from and every
assumption is written down, because **the platform holds no bank data at all**: no balance, no
transactions, no reconciliation. A recorded payment is self-attestation that money moved, not proof.

1. **Anchor cash.** Ask the owner for today's actual bank balance - no tool can fetch it. If they
   cannot give one, still build the table but label it **"FLOWS ONLY - no starting balance"** and
   answer affordability questions as net-flow deltas, never as "you will have $X."
2. **Money out - the payable, paginated and reconciled.** Loop
   `accounting_bill_list({ status: "all", limit: 200, offset: N })` until you have seen `total` rows
   (default limit is 50 - one unpaged call on a real book hides the rest). Partition locally, then
   **reconcile before projecting**: sum `balance_due_cents` across `open`, `partially_paid`,
   `submitted`, `approved` and compare to `accounting_ap_aging.total_cents` - those are exactly the
   statuses aging counts. If they disagree, page again; never forecast off an unreconciled pull.
   Bucket each live bill's `balance_due_cents` into the week of its `due_date`; anything already
   overdue lands in week 1 - it is payable now, not on some future date. List `draft` bills as a
   separate "not yet approved" line (they are in no aging report, but they are still real money
   about to enter the queue), and leave `paid`/`void` out of the outflow entirely.
3. **Money out - recurring schedules.** `accounting_bill_schedules_list`, then
   `accounting_bill_schedule_get` per schedule (by UUID) for `next_run_at`, `last_run_at`,
   cadence and the line template amount. Project future ticks across the horizon from
   `next_run_at`. Two traps:
 - `is_active: true` with `next_run_at: null` is exhausted or stopped and **will never fire** -
     project zero from it, however active it looks.
 - Bills a schedule already generated are sitting in step 2 (they are born `status: open` with
     `approval_status: not_required` - a schedule is a standing authorization to pay). Project only
     ticks strictly after `next_run_at`; counting the generated bill AND its tick double-books the
     week.
4. **Money out - payroll, its own line.** `accounting_payroll_run_list` (period, status, total,
   member count). Payroll never touches bills, so nothing upstream carries it. Infer cadence from
   the spacing of past runs and project forward at the average of the last 2-3 run totals; if there
   is no history, ask the owner for cadence and amount. Either way, write the assumption into the
   output ("payroll projected at $X every 2 weeks from run history"). A run still in `draft` is not
   finalized and nobody has been paid from it - flag it, do not assume the cash left.
5. **Money in - AR discounted by how this account actually collects.** Loop
   `accounting_invoice_list({ status: "all", limit: 200, offset: N })` to `total`, reconcile the
   summed `balance_due_cents` of `sent` + `viewed` + `partially_paid` against
   `accounting_ar_aging.total_cents`, then project inflows by aging bucket, not by `due_date` - a
   due date is a hope, the aging buckets are the account's actual behavior. Default assumptions
   (state them, and let the owner override): current collects in its terms week
   (`accounting_settings_get` carries `default_payment_terms`); 1-30 over the next two weeks;
   31-60 late in the horizon; 61+ counts as $0 inside 13 weeks unless a chase is actively working
   it - optimistic inflow is how a forecast lies. `draft` invoices are inflow NOBODY is tracking
   (not in aging, never sent) - flag them for `/hiveku:books-chase`, count them as $0.
6. **Assemble and answer.** One row per week: in, out, net, running balance from the anchor. Then
   answer the actual question: "week N dips to $Y; with the purchase it dips to $Z in week M" -
   with/without, named week, named low point. Follow with the assumptions block and a source line
   naming every tool call behind every number. Sanity-check the projection against history:
   `accounting_pnl_summary({ period_start, period_end })` for the trailing month (always pass the
   explicit period; it is cash basis and **excludes payroll**) - if trailing net and projected
   weekly net diverge wildly, a source is missing; say which.
7. **A failed source makes a PARTIAL forecast, never a silent hole.** If any call in steps 2-5
   errors or a reconcile will not converge, keep going with what you have but title the output
   **"PARTIAL FORECAST - missing <source>"** and state the bias direction (missing AP overstates
   cash; missing AR understates it). Never present a partial as complete, and never fill a gap with
   an estimate dressed as a read.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
