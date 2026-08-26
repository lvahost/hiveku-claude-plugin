---
description: Payroll run — reconcile timesheets first, never duplicate a period, then hand the draft run to the dashboard to finalize and export.
---
Payroll. Three traps here produce wrong pay, and the play does not end with payroll paid.
`accounting_member_create.pay_rate` is the ONE dollars field in accounting; everything else on this
page is integer CENTS.

1. **Never create a duplicate run.** `accounting_payroll_run_list` FIRST (it returns the 50 most
   recent runs with period, status, total and item count). There is no unique constraint on
   `(account_id, period_start, period_end)` — a second create for the same period makes a SECOND run
   and a second payable total. If a run already covers this period, read it with the run detail and
   stop; do not generate another.
2. **Roster.** `accounting_member_list` — only members with `status: "active"` are picked up by a
   run. There is no member update or delete tool, so a wrong rate, `pay_period` or `target_currency`
   is a dashboard fix, not something to work around. Adding someone is
   `accounting_member_create({ name, email, pay_rate, pay_rate_type, pay_period, target_currency })`
   where **`pay_rate` is DOLLARS** (per hour when `pay_rate_type: "hourly"`, per period when
   `"fixed"`); `pay_period` is weekly | bi_weekly | semi_monthly | monthly.
3. **Reconcile time BEFORE generating.** The run computes each hourly member from tracked time in
   the period and the flat rate for fixed members. **A run generated with no logged time snapshots
   every hourly member at ZERO and still returns a valid-looking run.**
   - `accounting_time_entries_list({ member_id?, from, to })` returns `{ entries, total_minutes }`,
     capped at 500 rows. Total the minutes per hourly member and confirm against what they actually
     worked. A member with zero minutes is a blocker, not a zero paycheck.
   - Missing time: `accounting_time_entry_create`. Its inputSchema declares **no properties** ("Body
     mirrors the accounting dashboard's timesheet form"), so the shape is not discoverable from the
     tool — the real body is `{ member_id (uuid, required, validated against this account),
     work_date ("YYYY-MM-DD", required), minutes | hours (one of the two; minutes 0-1440, hours
     0-24), project?, billable? (default true), note? }`. Zero or missing time returns 400 `Enter
     time worked`; an unknown or foreign `member_id` returns 400 `Unknown member`.
   - Approved PTO does NOT create time entries and does not feed hourly payroll. Paid leave for an
     hourly member is a deliberate `accounting_time_entry_create` the owner has to authorize.
4. **Generate.** `accounting_payroll_run_create({ period_start, period_end, source_currency?,
   label? })` — dates are `YYYY-MM-DD`. It returns the run with per-member items. Show every
   member's minutes and `amount_cents` and get approval on the list before anyone acts on it.
5. **Hand off — do not claim payroll is done.** The run is created in status `draft`. There is no
   MCP tool to finalize it (the Olympus payroll detail route is GET only), and the Wise batch CSV at
   `/api/accounting/payroll/<run_id>/export` is **not reachable with a Hiveku API key** — it is
   session-authenticated in the dashboard, and it refuses a draft run with 409 `Finalize this
   payroll run before exporting the Wise CSV.` End by telling the owner the exact run id and label
   to finalize and export in the Hiveku dashboard.
6. **Payroll is invisible to the P&L.** Runs write payroll rows, never bill payments, and
   `accounting_pnl_summary` counts vendor bill payments only. Report the period's payroll total as
   its own line in any owner update, and never let the P&L profit number stand as "profit" without
   it.
7. Finish every session of work the same way: persist notable learnings to department memory — read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
