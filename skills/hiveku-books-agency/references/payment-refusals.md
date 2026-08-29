# Payment refusals, replay, retries and ambiguous writes

Load this before working a pay run, when a `accounting_bill_record_payment` or
`accounting_invoice_record_payment` call comes back non-200, or when a payment call timed out
and you do not know what it did.

## The idempotency replay - why the second $500 books nothing

**Always pass a distinct `reference` and `paid_at` / `received_at`.** The MCP proxy stamps every
write with an idempotency hash over account + path + body, and the builder replays a matching
response for one hour. Two genuinely separate $500 partial payments on the same bill, minutes
apart, with no `reference` and no date, produce a byte-identical body: the second call replays
the first response - same `payment_id`, same balance - writes nothing, and looks like success.
Only $500 is booked. The tool does not declare `idempotency_key` in its schema, so the proxy
drops it and you cannot set the key yourself; a distinct `reference` (check number, ACH trace,
confirmation code) is the only lever you have. Verify `balance_due_cents` in the response
actually moved before reporting a payment as recorded.

## `method` on the AR side

`accounting_invoice_record_payment.method` is one of check, wire, cash, credit_note, manual,
ach. **Always send it.** The AR schema's `method` is a bare enum with no default and no
`.optional()`, unlike the AP side which defaults to `check` - omit it and the call dies on 400
`Invalid payload`. The AP tool also takes a DIFFERENT set (card, credit and other instead of
credit_note and manual) - never copy a method between the two.

## The refusal catalog

Refusals are guardrails, not obstacles. Expect these, and match on a distinctive prefix rather
than the whole string - AP and AR word several of them differently and some carry an em dash:

- 400 `Amount exceeds balance due` (AP) / `Amount exceeds the invoice balance` (AR). Overpayment
  is refused, never split. One wire covering three invoices is three calls against three ids.
  **Do not work around this by shaving the amount down until it fits** - the refusal means your
  allocation is wrong. Re-read the bill or invoice, re-derive the per-document amounts from the
  actual remittance, and confirm the new integers before any retry.
- 409 `A card charge on this invoice is still being confirmed with the payment processor. Resolve
  that hold before recording a manual payment, so the client cannot end up paying twice.` STOP
  and escalate to a human. Never route around this one.
- 409 `Cannot pay a "void" bill` / `Cannot record payment on a voided invoice`.
- 409 `This bill was just updated by another payment. Reload and try again.` (AR: `This invoice
  was just updated by another payment. Reload and try again.`) Re-read with `accounting_bill_get`
  or a fresh `accounting_invoice_list` and re-confirm the amount before retrying. Never
  blind-retry a payment.
- 409 `Duplicate idempotency key`. Match on exactly that prefix. AR returns it bare with no
  suffix; AP appends an EM DASH and "this payment was already recorded." Treat as already done,
  then re-read the record to confirm what is actually booked.
- 409 on a second `accounting_payment_reverse` of the same payment - a payment reverses
  exactly once, and the 409 means the offsetting row is already there. Re-read the bill; never
  retry.

## Reversing a booked AP payment

`accounting_payment_reverse` (the explicit payment id plus a REQUIRED `reason`) is the
correction rail for a wrong `accounting_bill_record_payment`: it writes an OFFSETTING negative
payment row pointing at the original via `reversal_of_payment_id` - the original row is never
edited or deleted and stays visible in the ledger, and the two rows net to zero in every SUM.
It restores the bill's balance and status in the same transaction; when the paid total returns
to zero the bill becomes voidable again. The `reason` is kept on the reversal row. A payment
reverses exactly ONCE - a second attempt is a 409 (see the catalog). Treat the reversal as
payment-grade: a named human's yes on that exact payment id, with the reason, one at a time,
and re-read the bill afterwards to confirm the balance moved. There is NO AR equivalent -
nothing in this surface reverses `accounting_invoice_record_payment`; a wrong AR payment is
still a dashboard/database fix, and you say so.

## Retry doctrine

- Retry ONE transient failure (network error, 5xx, timeout) - once, unchanged.
- Never retry a 400 or 409 with the same input. A validation or policy refusal does not go away
  by repetition; it goes away by changing the input, and changing a payment input means
  re-confirming the party, the document and the cents integer with a human first.
- Never re-send an identical payment body "to make sure it went through". The proxy's
  idempotency replay makes the second call return the first call's success while writing
  nothing - it cannot double-book, but it also cannot tell you anything new, and it trains you
  to trust a response that proves nothing.

## After an ambiguous write, read state before any second apply

A timeout or a replayed idempotency hit leaves you not knowing what the books say. Do not
guess and do not re-fire. In order:

1. **Re-read the record**: `accounting_bill_get({ bill_id })` (payments and
   `balance_due_cents` are on it) or a fresh `accounting_invoice_list` scoped by `q` to the
   invoice number. The balance either moved or it did not.
2. **`audit_query`** - it is always available under every key profile. Every MCP tool call on
   this account writes a row with the tool name, sanitized args summary, status
   (success/error/rate_limited) and which key made it. `{ tool_name:
   'accounting_bill_record_payment', since: '<a few minutes ago>' }` shows whether your call
   (or someone else's - you are not the only writer) actually succeeded. Use it to attribute a
   surprise balance move before assuming your own call did it.
3. Only after both reads agree do you report the payment as recorded or not recorded. If they
   disagree, escalate with both readings; never average them into a story.
