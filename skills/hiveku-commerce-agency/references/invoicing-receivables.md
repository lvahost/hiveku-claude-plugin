# Invoicing, receivables, and close (Play 7 depth)

Turn the accepted, signed deal into a bill, then get it paid. Note the seam: estimates
live under `crm_*`, invoices live under `accounting_*`. There is no `crm_invoice_get`,
`crm_invoice_list`, or `crm_invoice_send` - `crm_invoice_template_*` is TEMPLATES ONLY.

## Invoice templates (dashboard reach only)

- Invoice templates are a DASHBOARD surface, and they do not touch the conversion path.
  You can read them (`crm_invoice_template_list` / `crm_invoice_template_get`) and write
  them (`crm_invoice_template_create({ name, line_items, ... })`,
  `crm_invoice_template_update`, `crm_invoice_template_delete`) - create and update
  accept `default_due_days`, `tax_bps`, `notes`, `terms`, `currency`. What you CANNOT do
  from here is mark one the account default: `is_default` exists only on the dashboard
  route, not on the Olympus route or either MCP tool (unlike
  `crm_estimate_template_create`, which does expose it). And `default_due_days` is read
  by exactly one consumer, the dashboard's new-invoice screen, which prefills a due date
  from the template you pick there. So a template is worth building for the operator who
  invoices in the dashboard - but do not tell a client it sets net terms on any invoice
  you raise from here.

## Convert the accepted estimate

- `crm_estimate_convert_to_invoice({ estimate_id })` - `estimate_id` is the ONLY
  argument. It takes no template selection; do not look for one, and do not expect one to
  apply. It creates a fresh DRAFT invoice copying line items, totals, `currency`,
  `tax_bps`, `notes`, and `terms` FROM THE ESTIMATE, stamps `issue_date` as today, and
  writes NO due_date at all - the invoice it makes has no net terms until someone sets
  them in the dashboard. It also links back via `converted_invoice_id`, moves the
  estimate to status 'converted', increments the linked deal's `invoice_count` and
  `total_invoiced_cents`, and REVOKES the estimate's portal tokens so the client's quote
  link dies instantly.
- It is a GATE THE SERVER ENFORCES, not a discipline you keep. Three separate 409s, and
  you need to know which one you got:
  - already converted (`converted_invoice_id` set) - the response carries the existing
    `invoice_id`; go look at that invoice rather than making a second.
  - `status !== 'accepted'` - "Only accepted estimates can be converted to invoices
    (current status: X)", hinting at mark-accepted. A sent-but-unaccepted quote CANNOT be
    converted; record the real acceptance with `crm_estimate_mark_accepted` first, or
    have the client accept in the portal. Never mark-accept just to clear this 409.
  - the estimate carries a payment plan (`payment_plan_schedule_id` or
    `payment_plan_json`) - "its invoices were created by the plan at acceptance.
    Converting would bill the full amount a second time." That is a double-billing guard.
    Do not work around it: the invoices already exist, so find them with
    `accounting_invoice_list` instead.
- Nothing is emailed to the client on that call and nothing is charged. It is still
  irreversible: the status change sticks and the client's live estimate link is gone. It
  also fires the `estimate.converted` workflow trigger, so if the account has a workflow
  on that event, something downstream CAN reach the client - check before you convert on
  an account you did not configure. Confirm real acceptance (and signature on a gated
  deal) first.
- Find what you just made: `accounting_invoice_list({ status: 'draft' })`. Statuses are
  draft | sent | viewed | partially_paid | paid | void | all, and each row carries the
  linked contact and company. It pages: `limit` defaults to 50, maxes at 200, with
  `offset` - the AR sweep on a busy account walks pages, or the outstanding figure
  silently truncates.
- SENDING an invoice is a dashboard action. No MCP tool sends an invoice. Say that
  plainly to the client and raise a `pm_tasks_create` ticket for it; never imply you
  emailed a bill.

## Receivables and recording payments

- Receivables: `accounting_ar_aging` -> open invoices bucketed by due date. That, plus
  `accounting_invoice_list`, is the only source for "dollars outstanding" figures.
  Overdue buckets drive the weekly chase - see `/hiveku:books-chase`.
- Payment received: `accounting_invoice_record_payment({ invoice_id, amount_cents,
  method, reference?, received_at? })`. `amount_cents` is CENTS. `method` is REQUIRED
  with NO default here, and its enum is check | wire | cash | credit_note | manual | ach -
  the AP bill-payment tool takes a DIFFERENT set (card, credit and other instead of
  credit_note and manual), so never copy a method between the two. It BOOKS cash already
  received and does NOT move money - never describe it to a client as taking a payment.
- Double-record guard, both directions:
  - Before recording, re-read the invoice (`accounting_invoice_list` filtered to it) -
    a partially_paid or paid status means someone already booked cash; reconcile before
    adding more.
  - The MCP proxy derives an Idempotency-Key from the exact request body on every write,
    and the accounting routes enforce it: a byte-identical retry within the replay window
    returns the FIRST response instead of recording again. That protects you from
    accidental double-submits - and it also means two genuinely SEPARATE payments of the
    same amount on the same invoice in quick succession collide, with the second
    silently returning the first's success and booking nothing. Differentiate real
    repeat payments in the body: a distinct `reference` (check number, confirmation
    code) or `received_at` per payment.
  - After an ambiguous record (timeout), read the invoice back before retrying.

## Sequence and close

- Sequence is the guardrail: quote accepted -> contract signed (if required) -> invoice
  -> payment recorded. Never invoice ahead of acceptance, nor ahead of signature on a
  gated deal. Skipping a step to move faster is how you bill a deal that later
  evaporates.
- Then log the closed deal to `memory_create` (value, terms, close date) and
  `pm_tasks_complete` the pipeline task so the monthly report reconciles.
