---
description: "\"Do we have the hours to take this on?\" / \"are we actually making money on this client?\" - capacity and margin per client: timesheets vs rates vs invoiced revenue, from the reads that exist. Honest about what is not recorded."
argument-hint: "[period - e.g. 'this week' or '2026-08-01..2026-08-31']"
---
Capacity and margin$ARGUMENTS. Run this in the AGENCY's own bound folder - the account holding the
roster, timesheets and the invoices clients pay - not in a client folder. Two money rails, two
units: every `accounting_*` read reports integer CENTS (`pay_rate_cents`, `bill_rate_cents`,
`balance_due_cents`); PM time logs are DOLLARS. Convert for the human, never sum across rails.

1. **Period.** Ask for start/end (`YYYY-MM-DD`) if not named. Every number below is scoped to it.
2. **Roster and rates.** `accounting_member_list` for active members, then `accounting_member_get`
   per member for the whole row: `pay_rate_cents`, `bill_rate_cents`, `pay_rate_type`
   (hourly | fixed), `weekly_limit_minutes` / `daily_limit_minutes`, and archived members the list
   hides. A member with no `bill_rate_cents` has no computable billable value - their hours appear
   in cost only, flagged. If a rate is wrong, that is a confirmed separate write:
   `accounting_member_update` takes `pay_rate` / `bill_rate` in DOLLARS (sending `pay_rate_cents`
   returns 200 with nothing changed - the proxy silently drops it).
3. **Timesheets.** `accounting_time_entries_list({ member_id, from, to })` per member - it returns
   `{ entries, total_minutes }` capped at 500 rows with no documented paging, so keep ranges narrow
   and if a pull hits exactly 500, split the range; a silently truncated pull understates cost.
   Entries carry `work_date`, `minutes`, `billable` and a free-text `project`.
4. **Map hours to clients.** The entry's `project` is FREE TEXT - the platform makes no join. Group
   by it, then reconcile the names against the client list the invoices carry (step 6). Show the
   proposed name mapping and let the owner confirm it once; persist the confirmed map to memory.
   Entries with an empty or unmatched `project` go in an "unattributed" bucket, reported with its
   size - never spread pro-rata, never dropped. Note the second rail: PM tracks its own time
   (`pm_projects_list` → `pm_tasks_list({ project_id })` → `pm_task_time_logs_list` per task -
   hours, billable flag, hourly rate, total cost in DOLLARS, human-or-agent attribution). No tool
   description names a sync between PM time logs and accounting timesheets, so pick ONE rail per
   number, name it in the report, and never add them (that is double counting). Accounting
   timesheets are the payroll rail; default to them for cost.
5. **Cost per client.** Hourly members: minutes × `pay_rate_cents` / 60. Fixed members are paid per
   period, not per hour - an hourly cost is an ASSUMPTION (period pay ÷ period minutes logged);
   either state that assumption on the line or exclude them from per-client cost and say so.
   Payroll runs snapshot at creation and never recompute, so cost here is your live number, not
   theirs.
6. **Revenue per client.** `accounting_invoice_list` - each row includes the linked contact and
   company; page `limit: 200` with `offset` until you have seen `total`. Group the period's
   invoices by company. This is INVOICED revenue, not collected: `balance_due_cents` is still
   unpaid, and `accounting_ar_aging` is the aggregate check (it counts `sent`, `viewed`,
   `partially_paid` - drafts are invisible to it). `accounting_pnl_summary` returns four account
   totals and NO per-client split - do not promise one from it and do not pass this assembled split
   off as the P&L.
7. **Margin per client** = invoiced revenue − loaded time cost, with the definition printed beside
   it. Refuse to total lines whose currency, period or definition differ - present them side by
   side instead. A client with a failed or truncated pull is "unknown", excluded from the
   denominator, never a silent zero or a silent 100%.
8. **Capacity this week.** Per member: `weekly_limit_minutes` − minutes logged this week − approved
   PTO in the window (`accounting_pto_requests_list({ status: "approved" })`,
   `accounting_pto_balances_list` for context). Approved PTO creates NO time entries, so it must be
   subtracted here explicitly. A member with no `weekly_limit_minutes` has UNKNOWN capacity -
   report their logged hours and say the ceiling is not declared; never assume 40.
9. **Say what is not recorded** - in the report, not a footnote: unattributed hours count;
   fixed-pay allocation assumption; contractor/vendor cost sits in AP by vendor with no client
   mapping (so client cost here is TIME cost only); revenue is invoiced-not-collected; the two time
   rails are independent. "Which client is unprofitable" from this play means "negative margin on
   time cost vs invoiced" - nothing more, and the owner should hear it that precisely.
10. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
