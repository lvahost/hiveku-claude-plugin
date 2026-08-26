---
description: Work the AP books — aging, draft/submitted/open sweeps, approve queue, exceptions to PM. Confirms every approval.
---
Books pass. **All accounting money is integer CENTS and tax is BASIS POINTS (875 = 8.75%).** The one
exception in the whole surface is `accounting_member_create.pay_rate`, which is DOLLARS. Echo both
forms before any write that carries a number: "$1,200.00 = amount_cents: 120000".

1. **State.** `accounting_ap_aging` + `accounting_ar_aging` return bucket TOTALS only (current /
   1-30 / 31-60 / 61-90 / 90+ and `total_cents`) — no per-bill or per-invoice rows, so detail always
   comes from `accounting_bill_list` / `accounting_invoice_list`. AP aging counts only `open`,
   `partially_paid`, `submitted`, `approved` — **drafts are excluded from it entirely**.
   Then `accounting_pnl_summary({ period_start, period_end })` — **always pass an explicit period**;
   omitting both returns all-time, which is not a close. It returns exactly `revenue_cents`,
   `expenses_cents`, `profit_cents`, `margin_bps` — no category or vendor breakdown, so do not
   promise one. It is CASH basis and expenses are vendor bill PAYMENTS only, so payroll runs and
   approved-but-unpaid bills are not in it. Label it "cash basis, excludes payroll" anywhere a client
   will read it, and present it next to AP aging.
2. **Sweep all three live states, paginated.** `accounting_bill_list` defaults to `limit: 50` and
   caps at 200, with `offset` paging; the response carries a `total`, so loop `limit: 200` with a
   rising `offset` until you have seen `total` rows. A 50-row default on a real book silently hides
   the rest.
   - `status: "draft"` FIRST — stuck and unsubmitted. These appear in no aging report and no approve
     queue, so a bill created and never submitted ages past due invisibly. Submit
     (`accounting_bill_submit`) or void (`accounting_bill_void`) each one.
   - `status: "submitted"` — the approve queue.
   - `status: "open"` — approved and unpaid. That is the pay run; hand it to `/hiveku:books-pay`,
     do not pay it from here.
3. **Approve one at a time.** Show each bill (vendor, bill_number, amount, due date), get explicit
   approval, then `accounting_bill_approve({ bill_id })`. `approve: false` rejects it back to draft.
   The route accepts both `draft` and `submitted`, so a draft can be approved without ever being
   submitted — do that only when the owner says so, otherwise submit first so the trail is real.
   Any other status returns 409 `Cannot approve a bill in status "<x>"`.
4. **Before creating any bill, read `accounting_bill_schedules_list`.** These are the recurring
   definitions that generate bills on a cadence (retainers, SaaS). If a schedule already covers the
   vendor and period, hand-creating the bill double-books the payable. Schedules are READ-ONLY from
   here — no create or update tool exists; changes happen in the dashboard. When you do create one,
   `accounting_bill_create` requires `vendor_id` and `line_items`, produces a DRAFT, and should
   always carry a `category_id` from `accounting_expense_category_list` or the expense grouping is
   wrong for the rest of the year.
5. **Exceptions become PM tasks, not guesses** — duplicate vendor, missing terms, an amount out of
   pattern, a bill with no matching schedule.
6. **Payments are not part of this pass.** `accounting_bill_record_payment` is a ONE-WAY door:
   nothing in the tool surface reverses a recorded payment, and once a bill has any payment
   `accounting_bill_void` refuses with 409 "This bill has payments recorded and cannot be voided.
   Reverse the payments first." It also moves no money — it books the payment only, so record it
   AFTER the wire or check actually leaves. Run it through `/hiveku:books-pay`, with the cents
   integer confirmed out loud.
7. Finish every session of work the same way: persist notable learnings to department memory — read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
