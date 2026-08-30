---
description: Chase overdue receivables - full paginated AR pull reconciled to aging, each disputed invoice read line by line, reminders drafted per invoice, sends preview-first on an explicit yes, activity logged.
---
AR chase. **All accounting money is integer CENTS.** Echo dollars and cents together on every number
you write back: "$1,200.00 = amount_cents: 120000".

1. **Pull the whole ledger, not the first page.** `accounting_ar_aging` gives bucket totals only
   (current / 1-30 / 31-60 / 61-90 / 90+ and `total_cents`), no rows. `accounting_invoice_list`
   defaults to `limit: 50` and caps at 200 with `offset` paging, and returns a `total` - so loop
   `accounting_invoice_list({ status: "all", limit: 200, offset: N })` until you have seen `total`
   rows. **Then reconcile:** sum `balance_due_cents` across the invoices in status `sent`, `viewed`
   and `partially_paid` (exactly the statuses AR aging counts) and compare to
   `accounting_ar_aging.total_cents`. If they disagree you have not seen every invoice - page again
   before writing a chase list. Never report receivables as clean off an unpaginated pull.
2. **Read the invoice before you chase it.** `accounting_invoice_get` (by UUID) is the ONLY read
   of an invoice's line items: the full row plus `line_items` (sorted by `sort_order`),
   `payment_applications` (each with `amount_applied_cents`, `applied_at` and a display-safe
   payment - amount, `refunded_cents`, method, gateway, card brand/last4 - never the raw gateway
   payload), and the linked contact, company and deal. Run it on every disputed or partially-paid
   invoice before drafting a word - "you owe $X" is indefensible without the lines and payments in
   front of you. Take `total_cents` / `amount_paid_cents` / `balance_due_cents` exactly as stored
   (the record-payment transaction is their single writer - never recompute them from the
   applications; REVERSED applications are excluded and the stored balance already reflects them,
   so visible applications can legitimately sum short, and a refund appears as `refunded_cents` on
   the ORIGINAL payment row, never as a negative application). Unknown, foreign or soft-deleted id
   is a 404. Authoring: `accounting_invoice_create` produces a DRAFT and **sends nothing** - never
   tell anyone an invoice went out on the strength of a create; `crm_estimate_convert_to_invoice({
   estimate_id })` remains the path from an accepted estimate (also a draft; 409 if already
   converted - see the commerce skill). Draft invoices are not in AR aging, so a
   drafted-but-never-sent invoice is receivable nobody is tracking - flag those; step 4 can now
   actually send them.
3. **Draft per overdue invoice** via `talk_to_department({ domain: "outbound", message })` - firm and
   brand-aligned, every number grounded in the step-2 `accounting_invoice_get` read. Show drafts;
   do NOT send anything without approval.
4. **Sending is real now - the confirm contract is the play.** `accounting_invoice_send` WITHOUT
   `confirm: true` sends nothing: it returns a preview of exactly what would go out - the resolved
   recipient and where it came from (explicit override, then the invoice's saved delivery prefs,
   then the invoice contact), from name/address (including the invoices@notifications.hiveku.com
   platform fallback), subject, attach_pdf, and the channel legs - minting no token and burning no
   rate-limit budget. ALWAYS run the preview first, show it next to the step-3 draft, and only on
   the human's explicit yes repeat the SAME call with `confirm: true`. `channel`: email (default) |
   sms | both - 'both' emails THEN texts the pay link, an SMS failure never unsends the email
   (read the per-channel results), and SMS rides the shared rail with STOP suppression. Refusals:
   409 on a void or fully paid invoice; 400 on zero line items or no reachable recipient for the
   channel; 429 rate limit with Retry-After - wait it out, never hammer. A successful send flips a
   draft to `sent`, stamps `sent_at`, and writes a `crm_activities` note onto the contact's CRM
   timeline - the send logs itself. The ~1h idempotency replay applies here too: the proxy injects
   the key itself (never invent per-retry keys), and two SEPARATE identical-body sends inside the
   window collapse into one - the second returns the first's response and sends nothing new.
5. **Recording a received payment: refusals are guardrails, not obstacles.**
   `accounting_invoice_record_payment({ invoice_id, amount_cents, method, reference, received_at })`
   books cash already received and moves no money. `method` is one of check, wire, cash,
   credit_note, manual, ach, and **you must send it**: the tool lists only `invoice_id` and
   `amount_cents` as required, but the AR schema's `method` is a bare enum with no default and no
   `.optional()` - unlike the AP side, which defaults to `check` - so omitting it fails the call
   with 400 `Invalid payload`. Responses to expect:
 - 400 `Amount exceeds the invoice balance` - overpayment is refused, never split. One wire
     covering three invoices is three calls against three `invoice_id`s.
 - 409 `A card charge on this invoice is still being confirmed with the payment processor. Resolve
     that hold before recording a manual payment, so the client cannot end up paying twice.` -
     STOP and escalate to a human. Never route around this one; working past it is how a client
     gets charged twice.
 - 409 `Cannot record payment on a voided invoice`.
 - 409 `This invoice was just updated by another payment. Reload and try again.` - re-read the
     invoice and re-confirm the amount before any retry. Never blind-retry a payment.
   Always pass a distinct `reference` (check number, ACH trace, confirmation code) and `received_at`.
   The MCP proxy stamps every write with an idempotency hash over account + path + body, and the
   builder replays a matching response for one hour: two genuinely separate identical payments with
   no `reference` produce a byte-identical body, so the second call books NOTHING and still returns a
   success payload. Confirm `balance_due_cents` in the response actually moved before reporting a
   payment as recorded.
6. Log each chase as an activity (`crm_create_activity`) and record promised dates as PM tasks - a
   confirmed `accounting_invoice_send` already wrote its own `crm_activities` note, so log the
   chases that did NOT send.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
