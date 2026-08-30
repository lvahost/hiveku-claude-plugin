---
description: Work the AP books - aging, draft/submitted/open sweeps, approve queue with the receipt gate (no source doc, no approval), exceptions to PM. Confirms every approval.
---
Books pass. **All accounting money is integer CENTS and tax is BASIS POINTS (875 = 8.75%).** The one
exception in the whole surface is `accounting_member_create.pay_rate`, which is DOLLARS. Echo both
forms before any write that carries a number: "$1,200.00 = amount_cents: 120000".

1. **State.** `accounting_ap_aging` + `accounting_ar_aging` return bucket TOTALS only (current /
   1-30 / 31-60 / 61-90 / 90+ and `total_cents`) - no per-bill or per-invoice rows, so detail always
   comes from `accounting_bill_list` / `accounting_invoice_list`. AP aging counts only `open`,
   `partially_paid`, `submitted`, `approved` - **drafts are excluded from it entirely**.
   Then `accounting_pnl_summary({ period_start, period_end })` - **always pass an explicit period**;
   omitting both returns all-time, which is not a close. It returns exactly `revenue_cents`,
   `expenses_cents`, `profit_cents`, `margin_bps` - no category or vendor breakdown, so do not
   promise one. It is CASH basis and expenses are vendor bill PAYMENTS only, so payroll runs and
   approved-but-unpaid bills are not in it. Label it "cash basis, excludes payroll" anywhere a client
   will read it, and present it next to AP aging.
2. **Sweep all three live states, paginated.** `accounting_bill_list` defaults to `limit: 50` and
   caps at 200, with `offset` paging; the response carries a `total`, so loop `limit: 200` with a
   rising `offset` until you have seen `total` rows. A 50-row default on a real book silently hides
   the rest.
 - `status: "draft"` FIRST - stuck and unsubmitted. These appear in no aging report and no approve
     queue, so a bill created and never submitted ages past due invisibly. Submit
     (`accounting_bill_submit`) or void (`accounting_bill_void`) each one.
 - `status: "submitted"` - the approve queue.
 - `status: "open"` - approved and unpaid. That is the pay run; hand it to `/hiveku:books-pay`,
     do not pay it from here.
3. **Approve one at a time, receipt first.** Show each bill (vendor, bill_number, amount, due date)
   and its `attachment_count` - every `accounting_bill_list` / `accounting_bill_get` row carries it
   now. **No source doc, no approval**: `attachment_count: 0` means ask for the receipt before
   approving - `accounting_bill_attachment_create({ bill_id, file_name, content })` attaches it
   (base64, max 15MB, PDF/image only: pdf/jpeg/png/webp/heic, anything else 400; the same file
   uploaded twice stores TWO attachments - only literal retries of the same call dedupe, so
   `accounting_bill_attachment_list` first when unsure) - or take the owner's explicit
   on-the-record waiver for that bill. `accounting_bill_attachment_list` shows what is already
   there (newest first, with `cdn_url` to eyeball the document);
   `accounting_bill_attachment_delete` is by explicit id only, irreversible with no undelete route
   - confirm with the human first, especially where the receipt IS the approval evidence. Then get
   explicit approval and `accounting_bill_approve({ bill_id })`. `approve: false` rejects it back to draft.
   The route accepts both `draft` and `submitted`, so a draft can be approved without ever being
   submitted - do that only when the owner says so, otherwise submit first so the trail is real.
   Any other status returns 409 `Cannot approve a bill in status "<x>"`.
4. **Before creating any bill, read `accounting_bill_schedules_list`.** These are the recurring
   definitions that generate bills on a cadence (retainers, SaaS). If a schedule already covers the
   vendor and period, hand-creating the bill double-books the payable. Schedules are READ-ONLY from
   here - no create or update tool exists; changes happen in the dashboard. When you do create one,
   `accounting_bill_create` requires `vendor_id` and `line_items`, produces a DRAFT, and should
   always carry a `category_id` from `accounting_expense_category_list` or the expense grouping is
   wrong for the rest of the year.
5. **Exceptions become PM tasks, not guesses** - duplicate vendor, missing terms, an amount out of
   pattern, a bill with no matching schedule, a live bill with `attachment_count: 0`. One exception
   has a rail of its own now: **a wrong payment caught** is no longer a dead end -
   `accounting_payment_reverse` (the explicit payment id plus a REQUIRED `reason`, kept on the
   reversal row) writes an OFFSETTING negative payment row pointing at the original via
   `reversal_of_payment_id` (the original is never edited or deleted; the two rows net to zero in
   every SUM), restores the bill's balance and status in the same transaction, and works exactly
   ONCE per payment - a second attempt is a 409. It is a payment-grade write: name the payment id
   and the reason, get the owner's yes on that exact record, one at a time - or file the PM task
   and leave the reversal for the owner's call.
6. **Payments are not part of this pass.** `accounting_bill_record_payment` books the payment only
   and moves no money - record it AFTER the wire or check actually leaves. A wrong AP payment is
   correctable but never erasable: the reversal in step 5 writes a visible offsetting row, so the
   confirm-before doctrine stands. Once a bill has any payment `accounting_bill_void` refuses with
   409 "This bill has payments recorded and cannot be voided. Reverse the payments first." - an
   instruction you can now follow: reversed to zero paid, the bill becomes voidable again. Run
   payments through `/hiveku:books-pay`, with the cents integer confirmed out loud.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
