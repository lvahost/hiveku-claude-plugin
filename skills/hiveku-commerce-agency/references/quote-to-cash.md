# Quote-to-cash - estimates, quotes, contracts, and e-signature envelopes (Plays 5-6 depth)

The CRM revenue engine, and the fastest ROI in most engagements is working the pipeline
that already exists. Flow: draft -> send -> accepted -> (contract) -> invoice -> invoice
SENT. For the invoice half - including the `accounting_invoice_get` read-back and the
confirm-gated `accounting_invoice_send` that completes the chain - load
`references/invoicing-receivables.md`.

UNITS, before anything else: `unit_cents`, `discount_cents`, and `amount_cents` are
integer CENTS. `tax_bps` is BASIS POINTS (825 = 8.25%). $199.99 is `unit_cents: 19999`.
8.25 percent is `tax_bps: 825`. Get this wrong and a client receives a two-dollar quote
or a rounding-error tax line on a document you already sent.

## Build the quote

- `crm_estimate_template_list` -> start from an approved template so branding, terms, and
  tax handling are consistent. If the client has no clean template, that is the first
  deliverable - draft and approve one before sending a single real quote.
  `crm_estimate_template_get` reads one back; `crm_estimate_template_update` /
  `crm_estimate_template_delete` complete the lifecycle (and unlike invoice templates,
  `crm_estimate_template_create` does expose `is_default`).
- Line-item and narrative language (scope, package framing) is generative. There is no
  commerce department agent, so load `account_context_get({ domain: 'sales' })` and draft
  it yourself with that hydration, or use
  `talk_to_department({ domain: 'content', message })` when the language is
  customer-facing marketing copy. Numbers are not generative - set prices and quantities
  deliberately, never let the model invent a figure.
- `crm_estimate_create({ line_items, ... })`. `line_items` is the only formally required
  field, but either `contact_id` OR `company_id` must be present or the call fails. Each
  item is `{ description, quantity, unit_cents, discount_cents?, tax_bps?, sort_order?,
  product_id?, metadata? }`. Estimate-level knobs: `deal_id`, `currency`, `expires_at`,
  `notes`, `terms`, `tax_bps`, `discount_cents`, `estimate_template_id`.
  `estimate_number` auto-generates server-side - never pass one. Omit
  `estimate_template_id` to inherit the account default.
- `crm_estimate_get` to proof it before anything leaves the building - read the computed
  total back and confirm it against the dollars you intended. `crm_estimate_update` to
  correct.

## Immutability and 409s (all four of these bite)

- `crm_estimate_update` on an accepted or converted estimate returns 409. Duplicate it
  instead.
- Passing `line_items` to `crm_estimate_update` REPLACES THE FULL SET. A partial array
  silently deletes every item you left out. Re-read with `crm_estimate_get` and resend
  the complete array.
- `crm_estimate_delete` soft-deletes AND revokes the portal tokens, so the client's live
  link dies instantly. It refuses (409) on accepted/converted estimates.
- `crm_estimate_mark_accepted({ estimate_id, signer_name })` - `signer_name` is REQUIRED
  (the name the customer agreed under, 1-200 chars); optional `acceptance_note` (max
  500). It stamps `accepted_offline=true` and renders an acceptance certificate PDF, so
  treat it as a record-keeping write, not a status flip. Returns 409 if the estimate is
  declined or expired, and is idempotent on an already-accepted one
  (`already_accepted=true`). Only on real acceptance - never to flatter a report, and
  never to clear a convert-time 409.

## Send it

- `crm_estimate_send({ estimate_id, channel, to_email?, to_phone?, cc?, bcc?, subject?,
  message?, sms_body?, attach_pdf?, idempotency_key })`. `channel` is REQUIRED and is
  'email' | 'sms' | 'both'. Pass an `idempotency_key` on every send - a repeat with the
  same key returns `idempotent_replay=true` instead of a second email landing in the
  client's inbox.
- `attach_pdf: true` renders and attaches the PDF; text plus the portal link is otherwise
  sufficient. The SMS branch requires the voice add-on enabled on the account - an
  SMS-channel failure on an account without it is entitlement, not payload.
- The portal token TTL is 30 DAYS, regardless of `expires_at`. A quote with a 60-day
  expiry has a dead client link on day 31. Never set an expiry past 30 days without
  planning a re-send.
- CONFIRM recipient, total, and expiry first. A wrong number in a sent quote is a real
  problem, not a typo you quietly fix.
- Draft-and-send is TWO steps, always: create, read back with `crm_estimate_get`, show
  the client, then send on a yes. Never collapse them into one exchange, and never "test
  send" to a real customer address - there is no test mode on this rail.

## Work the pipeline (where the money is)

- `crm_estimate_list({ status: 'sent', order: 'created_asc' })` -> the oldest stalled
  quotes first, each a follow-up task. `{ status: 'viewed' }` is the stronger signal:
  opened and not answered. A sent quote with no accept and no decline is not a no; it is
  a conversation nobody restarted, and restarting it is the retainer's job.
- Sweep `{ status: 'draft' }` too: a quote built and never sent is the same
  stalled-pipeline leak as one sent and ignored - send it, or close it, but never let it
  age silently.
- It PAGES: `limit` defaults to 50 and maxes at 200, with `offset` - so "every estimate"
  on a busy account means walking pages, not one call.
- When a client accepts but the system still shows "sent", `crm_estimate_mark_accepted`
  records it so the pipeline stays honest and the quote is eligible to convert. Expired
  quotes get re-issued with fresh pricing and a new expiry (`crm_estimate_create`, or
  `crm_estimate_update` then re-send), not resurrected stale.

## Contracts: template library

For deals that need a signed agreement before work or fulfillment, route the accepted
quote through a signature envelope.
- `crm_contract_template_list({ archived? })` -> the non-archived templates by default.
  `crm_contract_template_get({ template_id })` -> `layout_json` + `compiled_html` on the
  block path, or `source_pdf_s3_key` + `fields_json` on the legacy PDF path, plus the
  `signers[]` role skeleton and `default_consent`. That is exactly the payload
  `crm_envelope_create` needs.
- A template body is IMMUTABLE. `crm_contract_template_update` mutates only `name`,
  `description`, and `is_archived` - to change the document body you
  `crm_contract_template_create` a NEW template, because existing envelopes reference the
  template id for audit. `crm_contract_template_delete` only archives; nothing is
  hard-deleted.
- No approved template on the account? Building one is the first deliverable of this
  play, and it goes to the client's counsel before it goes to a client's signature.

## Envelopes: create and send

- `crm_envelope_create({ title, signers, ... })` - `title` and `signers` are BOTH
  required, and `signers` is 1-10 items of `{ name, email, role?, contact_id?,
  access_code?, is_cc_only?, local_id? }`. You cannot create an empty envelope and
  populate it afterwards; that 400s. You must also provide EITHER `layout_json`
  (block-based, compiled to HTML server-side, sourced from `crm_contract_template_get`)
  OR `source_pdf_s3_key` + `fields[]` (legacy PDF plus coordinate fields). Link it with
  `subject_type: 'estimate'`, `subject_id: <estimate_id>`, `contact_id`, `company_id`,
  `deal_id`, and set `signing_order` ('parallel' or 'sequential', default parallel) and
  `expires_at`.
- The create response includes PLAINTEXT signer tokens. Capture them if you may need to
  send a manual signing link - they are not derivable from the stored hash and cannot be
  recovered.
- `crm_envelope_add_signer({ envelope_id, name, email, role?, contact_id?, access_code?,
  is_cc_only? })` only APPENDS a forgotten signer to a still-DRAFT envelope (409
  otherwise) and auto-assigns signing order to max+1. It is not the way you populate a
  new envelope.
- `crm_envelope_update` PATCHes a draft only (409 if not draft); passing `signers`
  replaces the roster but preserves tokens for signers identified by id.
- Cover language and scope summaries are generative - draft them yourself off
  `account_context_get({ domain: 'sales' })`, or use
  `talk_to_department({ domain: 'content' })` for client-facing narrative
  (`domain: 'commerce'` is rejected). Binding legal terms are not something to
  improvise - use the template language and flag anything nonstandard for review.
- `crm_envelope_send({ envelope_id, message? })` -> dispatch for signature. The tool's
  registry line says it "requires the from_email setting on crm_payment_integrations";
  the Olympus route does not - it resolves `from_email` if set (send from the client's
  verified commerce domain via SES) and otherwise falls back to Hiveku's
  `agreements@notifications.hiveku.com` via Resend, so the signer is emailed either way.
  Treat `from_email` as a branding question for the client, not a blocker, and never
  blame a failed send on it without evidence. On first send status moves draft -> sent
  and per-signer plaintext access tokens are minted server-side; omitting
  `signer_tokens` regenerates fresh ones, which stales any token you captured at create
  time. On a PARALLEL envelope every pending signer is emailed; on a SEQUENTIAL envelope
  only the first pending signer is - the downstream invites fire when the prior signer
  completes. Do not report a sequential envelope as broken because signers 2 and 3 got
  nothing; that is the design.
- Client-facing and legally meaningful. CONFIRM the document, every signer, and the order
  before sending - and the read-back for that confirmation is `crm_envelope_get`: one
  envelope by UUID with signers, fields, recent events (last 100), and the full CRM
  linkage (contact, company, deal). Proof the envelope from that read, not from what you
  intended to create. Never send silently.
- `crm_envelope_send` has NO idempotency_key parameter. After an AMBIGUOUS send (timeout,
  no response), do not send again blind: read `crm_envelope_get` first - status 'sent'
  and the events list tell you whether the first dispatch landed. A second send
  regenerates tokens and can re-email signers.

## Track signature state

- `crm_envelope_list({ status })` where status is draft | sent | viewed | completed |
  declined | voided | all; filters for contact_id, company_id, deal_id, subject_type.
  "Partially signed" is NOT a status and cannot be filtered - asking for it returns
  nothing and the chase silently finds zero envelopes.
- Paging: `limit` defaults to 50 and maxes at 200, and there is NO offset parameter on
  this tool - set `limit: 200` explicitly on the weekly chase, and if 200 rows come back,
  narrow with the status/contact/deal filters rather than assuming you saw everything.
- Partially signed is derived: `crm_envelope_list({ status: 'sent' })` for the roster,
  then `crm_envelope_list_signers({ envelope_id })` per envelope. That returns per-signer
  metadata only (status, `signed_at`, `viewed_at`, `reminder_count`) and never token
  hashes. Some `signed_at` set and others null = partially signed. Chase those weekly;
  they are the contract equivalent of a stalled quote.
- `viewed` is its own signal (opened, not signed). `declined` is a real outcome - handle
  it as a lost or renegotiated deal, do not leave it sitting in the chase list.
- `crm_envelope_void({ envelope_id, reason? })` -> void an envelope that went out wrong
  (wrong signer or document, superseded terms); it stamps `voided_at` and `void_reason`
  and refuses (409) on completed envelopes. Voiding is the fix for a bad send; do not
  send a second conflicting envelope on top of a live one. CONFIRM before voiding - it
  invalidates a document the client may have started signing. `crm_envelope_delete` also
  lands the envelope in voided (plus `deleted_at`) and likewise refuses on completed.
