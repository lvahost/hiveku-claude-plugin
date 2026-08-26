---
description: Chase overdue receivables — full paginated AR pull reconciled to aging, reminders drafted per invoice, activity logged.
---
AR chase. **All accounting money is integer CENTS.** Echo dollars and cents together on every number
you write back: "$1,200.00 = amount_cents: 120000".

1. **Pull the whole ledger, not the first page.** `accounting_ar_aging` gives bucket totals only
   (current / 1-30 / 31-60 / 61-90 / 90+ and `total_cents`), no rows. `accounting_invoice_list`
   defaults to `limit: 50` and caps at 200 with `offset` paging, and returns a `total` — so loop
   `accounting_invoice_list({ status: "all", limit: 200, offset: N })` until you have seen `total`
   rows. **Then reconcile:** sum `balance_due_cents` across the invoices in status `sent`, `viewed`
   and `partially_paid` (exactly the statuses AR aging counts) and compare to
   `accounting_ar_aging.total_cents`. If they disagree you have not seen every invoice — page again
   before writing a chase list. Never report receivables as clean off an unpaginated pull.
2. **Know what this surface can and cannot do.** There is no invoice create, send, get, void or
   reminder tool anywhere in the registry. The only authoring path is
   `crm_estimate_convert_to_invoice({ estimate_id })` on an accepted estimate — it produces a DRAFT
   invoice and returns 409 if that estimate was already converted (see the commerce skill). Draft
   invoices are not in AR aging, so a converted-but-never-sent invoice is receivable nobody is
   tracking; flag those. From here you can only LIST invoices and RECORD payments, so a chase
   produces a drafted reminder plus a PM task — never a re-send, and there is no
   `accounting_invoice_get`, so per-invoice detail comes from the CRM tools or a `/hiveku:pull`.
3. **Draft per overdue invoice** via `talk_to_department({ domain: "outbound", message })` — firm and
   brand-aligned. Show drafts; do NOT send anything without approval.
4. **Recording a received payment: refusals are guardrails, not obstacles.**
   `accounting_invoice_record_payment({ invoice_id, amount_cents, method, reference, received_at })`
   books cash already received and moves no money. Four responses to expect:
   - 400 `Amount exceeds the invoice balance` — overpayment is refused, never split. One wire
     covering three invoices is three calls against three `invoice_id`s.
   - 409 `A card charge on this invoice is still being confirmed with the payment processor. Resolve
     that hold before recording a manual payment, so the client cannot end up paying twice.` —
     STOP and escalate to a human. Never route around this one; working past it is how a client
     gets charged twice.
   - 409 `Cannot record payment on a voided invoice`.
   - 409 `This invoice was just updated by another payment. Reload and try again.` — re-read the
     invoice and re-confirm the amount before any retry. Never blind-retry a payment.
   Always pass a distinct `reference` (check number, ACH trace, confirmation code) and `received_at`.
   The MCP proxy stamps every write with an idempotency hash over account + path + body, and the
   builder replays a matching response for one hour: two genuinely separate identical payments with
   no `reference` produce a byte-identical body, so the second call books NOTHING and still returns a
   success payload. Confirm `balance_due_cents` in the response actually moved before reporting a
   payment as recorded.
5. Log each chase as an activity (`crm_create_activity`) and record promised dates as PM tasks.
6. Finish every session of work the same way: persist notable learnings to department memory — read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
