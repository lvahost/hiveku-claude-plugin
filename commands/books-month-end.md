---
description: Month-end close - period P&L with its real caveats, AP/AR aging snapshot, payroll total, bank reconcile, CPA payments journal, owner update. Every figure traceable.
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
5. **Bank reconcile.** Import the month's statement with `accounting_bank_import` - **CSV only;
   OFX/QFX is not supported yet**, so have the bank export CSV. Map columns explicitly
   (`column_mapping`: a single signed `amount` column, or `debit`/`credit`), and pass the bank's
   own reference column as `txn_id` when the file has one - duplicate detection across overlapping
   files is weaker without it. Re-importing the same or an overlapping statement is SAFE
   (already-imported rows are skipped), and malformed rows NEVER abort the file - they come back
   per-row in `errors`; read that array instead of assuming a clean load. Amounts are signed cents
   (negative = money out) and the import writes nothing to bills, invoices or payment rows. Then
   `accounting_bank_transactions_list({ matched: "unmatched" })` (`pagination.total` is the
   whole-filter count - page to it), `accounting_bank_suggestions` for candidates (EXACT amount
   within the window, ranked by date proximity - suggestions only, nothing written), and confirm
   each match one at a time with `accounting_bank_match` by explicit id (`bill_payment` /
   `crm_payment` with `matched_id`; `ignored` for fees/interest/transfers; `null` unmatches; it
   annotates the bank line ONLY and never touches the payment row; a payment already claimed by
   another line is a 409 - unmatch that line first; fee-sized mismatches are allowed and echo back
   as `amount_delta_cents`). A cleared line still unmatched at close - or a recorded payment no
   line cleared - is a named exception in the owner update, not a footnote.
6. **CPA handoff.** `accounting_payments_list({ from: period_start, to: period_end })` - the
   unified payments journal, both directions, every payment that actually moved money in the
   window. `from`/`to` are REQUIRED (YYYY-MM-DD, inclusive, max 366 days per call); money is
   integer CENTS. `format: "json"` (the default) returns `pagination` with
   `out_total`/`in_total`/`total` so completeness is provable - page to it - and `format: "csv"`
   is the file form. Read the refund semantics before handing it over: a refund appears as
   `refunded_cents` ON the original captured row, dated by CAPTURE and lifetime-to-date at export
   time - a January payment refunded in June shows its refund in the January export, NOT as June
   cash movement. Payroll and platform billing are excluded BY NAME (payroll has its own Wise CSV
   rail; Hiveku charging this account is not the tenant's books) - which is why step 4's payroll
   line stays its own line. This journal is also the year-end 1099 rail: `direction: "out"` with
   `vendor_id` (400 without `direction: "out"` - AR rows have no vendor) gives per-vendor payment
   rows, and a calendar year fits in one call.
7. **Owner update.** Two to four calm sentences plus the numbers: cash in, cash out, payroll
   separately, what we owe, what is owed to us, and the decisions you need. Every figure traceable
   to a named tool call - no derived metric the tools do not return. If a number the owner asks for
   does not exist in the surface (expense by category, revenue by client, accrual profit), say so
   plainly and name where it does live rather than estimating one.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
