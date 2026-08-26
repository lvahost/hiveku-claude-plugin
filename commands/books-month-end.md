---
description: Month-end close - period P&L with its real caveats, AP/AR aging snapshot, payroll total, owner update. Every figure traceable.
---
Month-end close for an explicit period. Ask for `period_start` / `period_end` (`YYYY-MM-DD`) if the
month was not named; **never run the P&L without both** - omitting them returns all-time, not the
month. All money is integer CENTS; convert for the human, keep the integer in the calls.

1. **Clear the decks first.** Run `/hiveku:books-close` so nothing is stranded in `draft` or
   `submitted` on the last day of the period, and `/hiveku:books-pay` for anything the owner
   intended to pay inside the month. Payments dated after the period end land in next month's
   cash-basis P&L.
2. **Period P&L.** `accounting_pnl_summary({ period_start, period_end })`. It returns exactly four
   numbers - `revenue_cents`, `expenses_cents`, `profit_cents`, `margin_bps`. **There is no
   category, vendor or client breakdown; do not promise one and do not assemble one by guessing.**
   State what it actually measures every time you present it:
 - Cash basis. Revenue is customer payments in status captured, settled or partial_refund, net of
     refunds, dated by settled → captured → created.
 - Expenses are **vendor bill PAYMENTS only**.
 - **Payroll is NOT in it** - payroll runs never write bill payments, so profit is overstated by
     the whole payroll for any account using Hiveku payroll.
 - Approved-but-unpaid bills are not in it either.
   Label it "cash basis, excludes payroll" on anything a client reads.
3. **Accrual reality.** `accounting_ap_aging` and `accounting_ar_aging` - bucket totals only
   (current / 1-30 / 31-60 / 61-90 / 90+ and `total_cents`), no rows. These are what the cash-basis
   P&L leaves out: what is owed, and what is owed to us. For detail, page
   `accounting_bill_list` / `accounting_invoice_list` (`limit: 200` with `offset` until you have
   seen `total`) and reconcile the summed `balance_due_cents` to each aging total before quoting a
   number. AP aging counts `open`, `partially_paid`, `submitted`, `approved`; AR aging counts
   `sent`, `viewed`, `partially_paid`. Drafts are in neither.
4. **Payroll total.** `accounting_payroll_run_list` - the runs whose period falls inside the month.
   Report it as its own line, because step 2 does not carry it. Note any run still in `draft`: it is
   not finalized, not exported, and nobody has been paid from it.
5. **Owner update.** Two to four calm sentences plus the numbers: cash in, cash out, payroll
   separately, what we owe, what is owed to us, and the decisions you need. Every figure traceable
   to a named tool call - no derived metric the tools do not return. If a number the owner asks for
   does not exist in the surface (expense by category, revenue by client, accrual profit), say so
   plainly and name where it does live rather than estimating one.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
