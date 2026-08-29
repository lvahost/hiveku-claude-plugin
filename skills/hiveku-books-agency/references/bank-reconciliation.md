# Bank reconciliation: import, review, suggest, match

Load this before any `accounting_bank_import` or `accounting_bank_match` call. This surface
reconciles the books against what the bank actually cleared - statement upload, not a live
feed. There is still NO bank connection and NO balance fetch; the cash-flow anchor question
("what is actually in the account today?") remains a question for the owner.

## Import - `accounting_bank_import`

- **CSV ONLY. OFX/QFX is not supported yet** - have the bank export CSV instead; do not
  promise an OFX path.
- `column_mapping` maps fields to the file's header names: `{ posted_at, description,
  amount }` for a single signed amount column, OR `{ posted_at, description, debit, credit }`
  for two-column statements. Optional `currency`.
- **Pass the bank's own reference column as `txn_id` whenever the file has one** - strongly
  recommended: without it, ids are derived from row content and duplicate detection across
  overlapping files is weaker.
- Re-importing the same or an overlapping statement is SAFE: already-imported rows are
  skipped, keyed on (source_name, transaction id). Prefer re-importing the full statement
  over hand-trimming a file to "just the new rows".
- **Malformed rows NEVER abort the file** - they come back per-row in `errors`. Read that
  array after every import and report the skipped rows; a partial import that looks clean is
  how a reconcile lies.
- Amounts are signed cents: negative = money out.
- The import writes NOTHING to bills, invoices or payment rows - it only fills the
  reconciliation ledger.

## Review - `accounting_bank_transactions_list`

- `matched` filters: `unmatched` (never reconciled - the work queue), `matched` (linked to a
  payment on either ledger), `ignored` (written off - fees/interest/transfers),
  `bill_payment`, `crm_payment`, or `all`.
- `from`/`to` are inclusive calendar days on the POSTED date.
- `pagination.total` is the whole-filter count, not the page size - page to it before calling
  a queue empty.

## Suggest - `accounting_bank_suggestions`

For each unmatched line, candidate matches from the payment ledgers - bill payments for
money-out lines, customer payments for money-in - by EXACT amount within +/-`window_days`,
ranked by date proximity. **SUGGESTIONS ONLY: nothing is written and no payment row is
touched**; every match is confirmed one at a time with `accounting_bank_match`. Payments
already matched to another bank line are excluded from candidacy.

A line with NO suggestion is a finding with three shapes - triage it, never shrug:
1. **Off by a fee** - the books entry exists at a nearby amount. Match it anyway (the
   mismatch is allowed and echoed back as `amount_delta_cents`) and note the fee.
2. **Unrecorded** - the bank moved money the books never booked: a candidate for a
   payment-ledger entry, or for a reversal where the books show a payment the bank
   contradicts. Raise it to the human; never invent the missing entry silently.
3. **Ignorable** - bank fees, interest, internal transfers: `matched_kind: 'ignored'`.

## Match - `accounting_bank_match`

- Link ONE bank line to the payment row it cleared: `matched_kind: 'bill_payment'` or
  `'crm_payment'` with `matched_id`; `matched_kind: 'ignored'` for fees/interest/transfers
  (`matched_id: null`); `matched_kind: null` to UNMATCH.
- **It annotates the bank line ONLY - it never mutates the payment row.** Matching is
  metadata, not money; unmatching is always safe.
- Direction must agree with the line's sign - a money-out line cannot claim a customer
  payment.
- A payment already claimed by another bank line returns 409 - unmatch that line first,
  deliberately; never force a claim through.
- Amount mismatches are allowed (fees) and echoed back as `amount_delta_cents` - report the
  delta, do not hide it.

## The pass (weekly, and again at month-end)

1. Import the latest statement; read `errors`.
2. `matched: 'unmatched'` queue, paged to `pagination.total`.
3. Suggestions per line; confirm each match one at a time by EXPLICIT id - a suggestion is
   never a match until a human-confirmed `accounting_bank_match` says so.
4. Triage the no-suggestion lines by the three shapes above.
5. Report: lines imported, matched, ignored, still unmatched - with the unmatched NAMED. A
   cleared bank line with no books entry (or a recorded payment no line cleared) is the
   finding this play exists to produce.
