---
description: Weekly AP pay run - approved unpaid bills by due date, one confirmed payment at a time. A recorded payment stays on the ledger forever; a wrong one gets an offsetting reversal, never an erasure.
---
Pay run. This is the only command that records money OUT. **All accounting money is integer CENTS.**
Echo both forms before every call: "$1,200.00 = amount_cents: 120000".

**Read this before the first call.** `accounting_bill_record_payment` books the payment in the ledger
and **moves no money** - record it AFTER the wire or check has actually left, never before. A
recorded payment is correctable, never erasable: `accounting_payment_reverse` (the explicit payment
id plus a REQUIRED `reason`, kept on the reversal row) writes an OFFSETTING negative payment row
pointing at the original via `reversal_of_payment_id` - the original is never edited or deleted, the
two rows net to zero in every SUM, and the bill's balance and status restore in the same
transaction. A payment reverses exactly ONCE (a second attempt is a 409). That is a correction rail,
not an undo button - a mistyped cents integer stays on the ledger forever as a payment plus a
reversal, in front of every future reader - so confirm vendor, `bill_number` and the exact integer
BEFORE every call. Once a bill carries any payment `accounting_bill_void` refuses it with 409 "This
bill has payments recorded and cannot be voided. Reverse the payments first." - now an actionable
instruction: reversed to zero paid, the bill becomes voidable again.

1. **Build the queue.** `accounting_bill_list({ status: "open", limit: 200, offset: N })` - approved
   and unpaid. Default `limit` is 50 and it caps at 200; the response carries a `total`, so page
   until you have seen `total` rows. Sort by `due_date`. Cross-check the sum of `balance_due_cents`
   against `accounting_ap_aging` (which counts `open`, `partially_paid`, `submitted`, `approved`) so
   you know what share of the payable this run covers. Also sweep `status: "partially_paid"` - those
   carry a remaining balance and are easy to forget.
2. **Confirm each bill individually.** `accounting_bill_get({ bill_id })` for line items and any
   payments already recorded. Show vendor, `bill_number`, `due_date`, `total_cents`,
   `amount_paid_cents`, `balance_due_cents`, and `attachment_count` - the list and get rows both
   carry it now. **No source doc, no approval** was the gate upstream; a bill arriving here with
   `attachment_count: 0` slipped through it - pause and ask for the receipt
   (`accounting_bill_attachment_create`: base64 PDF/image, max 15MB; it works on any non-deleted
   bill regardless of status, so even an already-paid bill can take its receipt after the fact) or
   get the owner's explicit waiver before paying. The owner names what gets paid; never batch-pay a
   list on a single yes.
3. **Record it, one call per bill.**
   `accounting_bill_record_payment({ bill_id, amount_cents, method, reference, paid_at })`.
 - `bill_id` and `amount_cents` are required. `method` is one of check, ach, wire, card, cash,
     credit, other (defaults to check).
 - **Always pass a distinct `reference`** (check number, ACH trace, confirmation code) **and
     `paid_at`.** The MCP proxy stamps every write with an idempotency hash over account + path +
     body and the builder replays a matching response for one hour, so two genuinely separate
     identical partial payments with no `reference` produce a byte-identical body: the second call
     replays the first response, books NOTHING, and looks like success. The tool does not declare
     `idempotency_key`, so the proxy drops it and you cannot set the key yourself - a distinct
     `reference` is the only lever.
 - **Verify `balance_due_cents` in the response actually moved** before reporting the payment as
     recorded. Then move to the next bill.
4. **Refusals are guardrails, not obstacles.** Do not work around them.
 - 400 `Amount exceeds balance due` - overpayment is refused, never split. One wire covering three
     bills is three calls against three `bill_id`s.
 - 409 `Cannot pay a "void" bill` (or any other terminal status).
 - 409 `This bill was just updated by another payment. Reload and try again.` - re-read with
     `accounting_bill_get` and re-confirm the amount. Never blind-retry a payment.
 - 409 `Duplicate idempotency key` - match on exactly that prefix. The AP route appends an EM DASH
     and "this payment was already recorded."; the AR twin returns the prefix bare, so a
     whole-string comparison misses one side or the other. Treat as already done, then verify what
     is actually booked with `accounting_bill_get`.
 - 409 on a second `accounting_payment_reverse` of the same payment - a payment reverses exactly
     once; the offsetting row is already there. Re-read the bill, never retry.
5. **Close out.** Report cash out for the run, what remains open, anything you deliberately did
   not pay, and any reversal made this run (payment id, reason, the offsetting row) beside the
   payments. Payroll is NOT part of this - it never touches bills. Run `/hiveku:books-payroll`.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
