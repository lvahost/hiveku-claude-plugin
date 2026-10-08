---
description: Payroll run - reconcile timesheets first, never duplicate a period, then hand the draft run to the dashboard to finalize and export.
---
Payroll. Three inputs decide what a run pays - the roster, the period's dates and the time logged in
it - and the play does not end with payroll paid. The payroll member rates
(`accounting_member_create.pay_rate`, `accounting_member_update.pay_rate` / `.bill_rate`) are the
dollars fields in accounting; everything else on this page is integer CENTS.

1. **Never pay the same time twice.** `accounting_payroll_run_list` FIRST (it returns the 50 most
   recent runs with period, status, total and item count). A create whose period shares a day with
   ANY other run - draft, finalized or paid - is refused 409, with `overlapping_run_id` naming the
   run in the way, so a second run for a period cannot be made. If a run already covers this
   period, stop; do not shift the dates to get another one through. The list carries only
   `_count: { items: true }`, a member count and never the per-member amounts -
   `accounting_payroll_run_get({ payroll_run_id })` returns the run with every item. **Pay is
   private**: the run reads and the member reads answer only for a key whose creator may read
   payroll in the app (403 otherwise; a key with no recorded owner is refused). Report that as an
   access gap, not a missing tool.
2. **Roster.** `accounting_member_list` - a run pays only members who are `status: "active"` AND
   not archived. A wrong rate, `pay_period` or `target_currency` is fixable with
   `accounting_member_update({ member_id, ... })`, confirmed, with `pay_rate` in DOLLARS; read it
   back with `accounting_member_get` (cents). Taking someone off payroll is `status: "inactive"`
   or `is_archived: true` on that update; `accounting_member_delete` is one-way. Adding someone is
   `accounting_member_create({ name, email, pay_rate, pay_rate_type, pay_period, target_currency })`
   where **`pay_rate` is DOLLARS** (per hour when `pay_rate_type: "hourly"`, per period when
   `"fixed"`); `pay_period` is weekly | bi_weekly | semi_monthly | monthly.
3. **Reconcile time BEFORE generating.** An hourly member is paid their rate x (logged time entries
   + task time from the workspaces the account counts toward pay + approved PAID leave in the
   period). A fixed member's rate is PRORATED to how much of their own pay period the run's dates
   cover - a monthly rate on a half-month run pays half - so the dates are a pay input, not a
   label. **An hourly member with nothing logged is snapshotted at ZERO and the run still looks
   valid.**
 - `accounting_time_entries_list({ member_id?, from, to })` returns `{ entries, total_minutes }`,
     capped at 500 rows. Total the minutes per hourly member and confirm against what they actually
     worked. A member with zero minutes is a blocker, not a zero paycheck. The list shows logged
     entries only; task time and paid leave are added by the run.
 - **Missing time is loggable from here.** `accounting_time_entry_create({ member_id, work_date,
     hours, project?, billable?, note? })` (`minutes` in place of `hours` works too) - `member_id`
     and `work_date` (`YYYY-MM-DD`) are required and the time must come to more than zero. Name
     the member, the date and the hours, get the owner's yes, log it, then re-run
     `accounting_time_entries_list` and confirm the minutes landed before step 4. A day inside a
     finalized or paid run's period is locked: create, update and delete there return 409, and
     late time goes in the next period.
 - Approved PTO does NOT create time entries, but approved leave under a PAID policy IS paid: the
     run adds those hours for an hourly member. Never also log that leave as a time entry - it
     would be paid twice.
4. **Generate.** `accounting_payroll_run_create({ period_start, period_end, source_currency?,
   label? })` - dates are `YYYY-MM-DD`; a period that starts after it ends is a 400, and one that
   overlaps another run is the 409 from step 1. It returns the run with per-member items. Show
   every member's minutes and `amount_cents` and get approval on the list before anyone acts on it.
5. **Hand off - do not claim payroll is done.** The run is created in status `draft` and moves only
   draft -> finalized -> paid, each move a person's step in the dashboard: there is no MCP tool to
   finalize it or mark it paid (the Olympus payroll detail route is GET only). Finalize locks the
   amounts and the period's time; until then the owner can press Recalculate on the draft to pick
   up time logged after it was built. The payout downloads at
   `/api/accounting/payroll/<run_id>/export` - Wise, a plain CSV, Gusto and a QuickBooks journal -
   are **not reachable with a Hiveku API key**: they are session-authenticated in the dashboard and
   refuse a draft run with 409 `Finalize this payroll run before exporting it.` End by telling the
   owner the exact run id and label to finalize and export in the Hiveku dashboard.
6. **Payroll is invisible to the P&L.** Runs write payroll rows, never bill payments, and
   `accounting_pnl_summary` counts vendor bill payments only. Report the period's payroll total as
   its own line in any owner update, and never let the P&L profit number stand as "profit" without
   it.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })` and note its `version` and when you read it, append your note to the `content` it returns, then check `memory_log_list({ memory_id, since: "<when you read it>" })` and merge any newer change into your text (a department agent or a person may have edited it since), and send the WHOLE merged document to `memory_update({ memory_id, content, reason, expected_version })`, which REPLACES it (sending only the new note destroys everything that department had accumulated; `reason` is one plain line on why, and `expected_version` is the version you merged into, so a 409 `version_conflict` means it changed again: merge into the `content` that answer carries and save with its `version`, never resend blind); use `memory_create({ type: "memory", name: "<dept>", content, reason })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id, reason })` restores one (it works for deleted entries too). Record the work in the memory log when `memory_log_add` is listed: a Doing line before the first step (`memory_log_add({ phase: "doing", department: "<dept>", line, thread })`) and a Done line at the end (`memory_log_add({ phase: "done", department: "<dept>", line, thread, outcome })`, the same `thread`, `outcome` ok, failed or stopped), each `line` one plain sentence of at most 160 characters in your own words, never a customer's words, a secret or personal details. Hiveku, not this folder, is the source of truth.
