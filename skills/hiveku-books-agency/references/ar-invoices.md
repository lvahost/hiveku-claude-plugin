# AR invoices: get, create, send

Load this before authoring or sending a customer invoice, and whenever an invoice read does
not match what a human expects. Recording cash against an invoice
(`accounting_invoice_record_payment`) stays in `references/payment-refusals.md`; this file is
the other three verbs. Money is integer CENTS everywhere here.

## `accounting_invoice_get` - the only line-item read

Read one invoice by UUID: the full row plus `line_items` (sorted by `sort_order`),
`payment_applications`, and the linked contact (name/email/phone), company and deal. This is
the ONLY Olympus read of an invoice's line items - `accounting_invoice_list` returns summary
rows without them.

- Each payment application carries `amount_applied_cents`, `applied_at` and a display-safe
  payment: `amount_cents`, `refunded_cents`, method, gateway, `gateway_transaction_id`,
  status, card brand/last4, captured/settled/refunded timestamps, and the metadata holding
  any reference/note from `accounting_invoice_record_payment` - never the raw gateway
  payload.
- **Balance fields come back exactly as stored** - `total_cents`, `amount_paid_cents`,
  `balance_due_cents` - because the record-payment transaction is their single writer. Never
  recompute them from the applications.
- REVERSED payment applications are excluded (the same surface the dashboard shows), and the
  stored balance already reflects any reversal - so the visible applications may sum to LESS
  than `amount_paid_cents` implies historically. That gap is expected, not corruption; do
  not "fix" it.
- A refunded payment shows `refunded_cents` on the ORIGINAL payment row, never as a separate
  negative application.
- Unknown id, another tenant's id, or a soft-deleted invoice is a 404.

## `accounting_invoice_create` - a draft, and only a draft

Creating does NOT send. The draft is invisible to the client until it is sent - never tell
anyone the invoice went out because a create succeeded.

- Exactly one of `contact_id` or `company_id` is REQUIRED (400 with neither; both together is
  allowed), and every linked contact/company/deal must belong to this account or the call
  400s.
- `line_items` needs at least one of `{ description (plain text or simple HTML, up to 2,000
  visible characters), quantity, unit_cents, discount_cents?, tax_bps?, product_id?,
  sort_order?, metadata? }`. Money in CENTS.
- A line's `product_id` comes from `accounting_product_list` - the account's Products &
  services catalog (`q`, `archived`, `plan_only`, `limit` up to 200, `offset`; page until
  `next_offset` is null). Each row carries `id`, `name`, `sku`, `default_unit_price_cents`,
  `unit_label`, `tax_default_bps`, `is_plan` and `is_archived`; active products only unless
  `archived: true`, and a 403 when the key's creator may not read products in the app. The
  `product_id` only links the line to the catalog - it fills in nothing, so send the
  `description` and `unit_cents` yourself.
- `invoice_number` is minted by the per-account atomic counter (INV-YYYY-000042 style) when
  you omit it, and a gap in the sequence after a failed create is NORMAL - do not chase it.
  Supply one only to keep the ORIGINAL number of an invoice moved over from another app: at
  most 20 characters, letters, digits, spaces and `. _ / # -`, starting with a letter or
  digit, never starting `P-` (400 `invoice_number_invalid` otherwise), and unique per
  account (409 `invoice_number_taken` - pick another, never retry the same one).
- **`tax_bps` is deliberately THREE-STATE**: omit it (or send null) and the rate resolves
  from the customer's jurisdiction and the account default; send a number - INCLUDING an
  explicit 0 - and that is stamped forever (a later tax-rule edit never re-rates an issued
  document). A line-level `tax_bps` overrides the document rate for that line. Confirm which
  of the three the human means before the call.
- Document `discount_cents` is clamped to the subtotal, and tax applies to the post-discount
  base.
- `issue_date` defaults to today; `issue_date`/`due_date` parse LENIENTLY and an unparseable
  string stores the default/NULL rather than rejecting - echo dates back, and re-read the
  created row when a date matters.
- Optional: `currency` (ISO 4217, default USD), `po_number`, `title` (the client-facing
  headline), `notes`.
- `crm_estimate_convert_to_invoice({ estimate_id })` remains the authoring path from an
  accepted estimate: also a DRAFT, 409 if already converted.

## `accounting_invoice_send` - the confirm contract

Emails/texts the invoice with its secure tokenized pay link. **Without `confirm: true` the
call SENDS NOTHING**: it returns a preview of exactly what would go out - the resolved
recipient with its source (explicit override, then the invoice's saved delivery prefs, then
the invoice contact), from name/address (including the invoices@notifications.hiveku.com
platform fallback), subject, attach_pdf, and the channel legs - minting no token and burning
no rate-limit budget. The procedure is fixed: preview call first, ALWAYS show the preview to
the human, and only on their explicit yes repeat the SAME call with `confirm: true`.

- Refusals: 409 on a void or FULLY PAID invoice; 400 when the invoice has zero line items or
  no reachable recipient for the requested channel; 404 on an unknown or foreign id.
- `channel`: email (default) | sms | both. 'both' sends email THEN texts the pay link, and an
  SMS failure never unsends the email - read the per-channel results in the response. SMS
  goes through the shared rail with STOP opt-out suppression.
- Email is rate-limited per account: 429 with Retry-After. Wait it out; never hammer.
- A successful send flips a draft to `sent`, stamps `sent_at`, logs an invoice.sent billing
  event, and writes a `crm_activities` note so the send shows on the contact's CRM timeline
  - it logs itself.
- Idempotent within the ~1h replay window automatically: the proxy injects an
  Idempotency-Key derived from account + path + body. Do NOT invent per-retry keys, and know
  that two SEPARATE identical-body sends inside the window collapse into one - the second
  returns the first's response and sends nothing new.

## What is still missing

No invoice void tool, no reminder-template tool, and no AR payment reversal - a wrong
`accounting_invoice_record_payment` is still a dashboard/database fix. Say so rather than
improvising.
