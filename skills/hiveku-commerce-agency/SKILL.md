---
name: hiveku-commerce-agency
description: Full ecommerce and quote-to-cash agency methodology for operating a Hiveku account. Use for ANY commerce work - Shopify connection and catalog, product and variant edits, pricing and collections, inventory levels and stockouts, storefront scaffolding and headless builds, plus CRM quote-to-cash - estimates and quotes, proposals, contracts and e-signature envelopes, signer flows, converting accepted quotes to invoices, and weekly checkups or monthly commerce reports.
---

# Hiveku Commerce Agency Operating System

Operate the account like a retainer agency charging thousands per month: connect and baseline
once, set a catalog and quote-to-cash strategy, run execution plays on a weekly cadence, and
prove the value in a monthly report the client would pay for. Two revenue engines live under
this roof - the Shopify storefront (catalog, inventory, buy flow) and the CRM quote-to-cash
pipeline (estimate to contract to invoice), and both leak money quietly when nobody minds
them. Every tool named below is a real Hiveku MCP tool.

## Operating principles
- `account_context_get({ domain: 'commerce' })` FIRST - before any analysis, plan, quote, or
  product copy. It returns persona, brand voice, avatars, domain memory, skills, and rules.
  Re-read its instructions field before every generative call.
- Hiveku plus Shopify is the source of truth. Durable findings (pricing strategy, catalog
  structure, quote templates, contract terms, decisions) -> `memory_create`. Work items ->
  `pm_tasks_create` / `pm_tasks_complete`. There is no commerce deliverable tool - the
  monthly report is assembled from live pulls plus memory (see Monthly report).
- Confirm before writes, and treat the two engines differently. Reading a catalog or listing
  estimates is safe. But a `shopify_admin` write touches a LIVE store the public can buy
  from, `crm_estimate_send` and `crm_envelope_send` put a document in front of a paying
  client, and `crm_estimate_convert_to_invoice` creates a bill. Never bulk-apply price
  changes, never send a quote or contract silently. Summarize exactly what you are about to
  change or send, and get a yes first.
- `hiveku-data/commerce/*.json` (products, inventory snapshots, estimates, envelopes,
  invoices) is the local mirror - read it for orientation and structure, use live tools for
  anything current or decision-grade. Stock levels, quote statuses, and signature states move
  by the hour; the snapshot goes stale the moment the store sells or a client signs.
- Generative output (product descriptions, collection copy, quote line-item language,
  proposal narrative, contract cover notes) -> `talk_to_department({ domain: 'commerce',
  message })`, then persist with the matching direct tool. Pure reads and CRUD -> direct
  tools. A description written without the brand voice from `account_context_get` reads like
  every other AI store; avoiding that is what the retainer is paid for.
- Discover exact arg shapes with `hiveku_docs_search` / `hiveku_docs_get` before a write you
  are unsure of - especially the `shopify_admin` payload shape and the estimate and envelope
  field names. Guessing a mutation body against a live store overwrites a price with null.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising anything)
1. Context and connection: `account_context_get({ domain: 'commerce' })`, then
   `shopify_status` and `shopify_connection_status` -> is a store connected, which scopes,
   which plan. If nothing is connected, run the connect flow (Play 0) before promising any
   Shopify work. A disconnected store caps everything you can honestly report.
2. Catalog census: `shopify_catalog_list` -> full product and variant set. Capture counts
   (products, variants, collections) and flag the structural gaps up front - no image, no
   description, one lonely variant that should be several, missing SEO title or handle,
   anything in draft that should be active or vice versa.
3. Inventory baseline: `shopify_inventory_get` across the catalog (or the top sellers if it
   is huge) -> on-hand by location. Note stockouts, negative or untracked items, and
   anything on zero that is still set to active.
4. Quote-to-cash census: `crm_estimate_list` -> every estimate and status (draft, sent,
   accepted, converted, expired). `crm_envelope_list` -> contracts and signature state (sent,
   partially signed, completed, voided). `crm_estimate_template_list` and
   `crm_invoice_template_list` -> existing templates to build on. The money hiding here is
   sent-but-never-accepted quotes and sent-but-never-signed contracts - the pipeline that
   stalled and nobody chased.
5. Storefront reality: native Shopify online store, or a headless / Hiveku-hosted storefront?
   `shopify_scaffold_compat` and `shopify_eject_manifest` (Play 4) tell you which surface the
   buy button lives on - know that before planning any storefront change.
6. Record the baseline in `memory_create` - store domain and plan, product and collection
   counts, top sellers, the structural catalog gaps, the stalled-quote and unsigned-contract
   dollar figures, the template inventory, and any client constraint (margins they will not
   cross, terms they will not change). Open `pm_tasks_create` tickets for the first fixes.

### Strategy (weeks 2-3)
Turn the baseline into a plan across both engines:
- Catalog and merchandising: which products need real descriptions and images, which
  collections to build or reorganize, where pricing leaves margin on the table, which dead
  SKUs to archive. Priority = revenue contribution x fixability.
- Inventory discipline: reorder points per SKU, the stockout watchlist, who owns restocking
  (usually the client - you surface, they buy).
- Quote-to-cash: a clean estimate template set, standard contract terms and signer flow, and
  a follow-up rhythm for stalled quotes and unsigned contracts. Often the fastest ROI in the
  whole engagement - closing quotes already 80 percent of the way to yes.
Get client sign-off, then `memory_create` the decisions and `pm_tasks_create` the first month
of work. Never change catalog pricing or send a quote without an approved plan behind it. From
here, run the plays below as tasks: the weekly checklist keeps both engines healthy, the
monthly report proves the value, and no week passes without something shipping or some pipeline
moving.

## Play 0 - Connect and keep connected
Do this before any Shopify play, and re-check whenever calls start failing.
- `shopify_connection_status` -> current state and granted scopes; `shopify_status` ->
  store-level health.
- Not connected: `shopify_connect_start` begins the OAuth handshake. Bind at the right level -
  `shopify_account_connect` ties the store to the account, `shopify_project_connect` ties it
  to a specific Hiveku project (where a headless storefront lives). Choose based on whether
  the storefront is native Shopify or Hiveku-hosted.
- Token expired or scopes changed: `shopify_reconnect` refreshes the grant. A silent 401 from
  `shopify_admin` almost always means a lapsed token - reconnect before debugging a payload.
- OAuth redirect and app-install steps happen in a browser, not from here. When a step needs
  the client to click "Install" or approve scopes in their Shopify admin, raise a
  `pm_tasks_create` task with exact instructions - do not pretend to complete a browser
  consent from a tool call.

## Play 1 - Catalog and product data
The catalog is the storefront's conversion surface. Thin product data is lost revenue.

Read first (cheap, run freely):
- `shopify_catalog_list` -> products, variants, prices, status, images, SEO fields. Your
  working set for every audit below.
- `shopify_storefront` -> the Storefront API as the customer sees it (published products,
  collection membership, availability). Confirm what is actually shoppable versus what merely
  exists in admin - a product active in admin but excluded from every published collection is
  invisible to buyers, a common silent leak.

Find the gaps (turn each into a task, not a vague "improve the catalog"): no description or a
one-line stub; no image or one low-res image (flag for the client to supply assets); missing
SEO title / meta / handle (the product's organic front door); a single variant where the
product clearly has sizes or colors; draft status on something that should sell, or active on
a dead SKU.

Write descriptions and merchandising copy the brand way:
- `talk_to_department({ domain: 'commerce', message })` with the product, its attributes, the
  target avatar, and the SEO keyword it should own -> copy in the brand voice, not generic
  marketplace filler. Same for collection descriptions.
- Persist to Shopify with `shopify_admin` (the Admin API write path - product update,
  description, SEO fields, metafields). CONFIRM the exact product and fields first, and change
  one product to verify the payload shape before running a batch. Never fire a catalog-wide
  write blind. (If the storefront is a Hiveku-hosted project, display copy may live in project
  files or CMS instead - route it through the web department's tools.)

## Play 2 - Pricing and collections
- Pricing changes go through `shopify_admin` and are the highest-risk write in this skill:
  they take effect the instant they land, on a store the public is buying from. Every price
  change gets explicit line-by-line confirmation - product, old price, new price, effective
  now. Never bulk-apply a percentage without the client signing off on the exact resulting
  list. Compare-at pricing (the strike-through) is a merchandising lever, not a lie - set it
  only where the item genuinely sold higher.
- Collections are the store's navigation and the merchandiser's shelf. Build or reorganize
  them via `shopify_admin`; read current membership back from `shopify_storefront` to confirm
  the customer-facing result matches intent. A well-built "best sellers" or seasonal
  collection lifts average order value more than any single product edit. Metafields
  (`shopify_admin`) hold structured attributes - materials, dimensions, specs - that power
  filtering and rich product pages; plan the schema once and populate consistently.

## Play 3 - Inventory health
Stockouts on sellers and dead stock on shelves both cost money. Your job is to surface, the
client's job is usually to buy.
- `shopify_inventory_get` -> on-hand by SKU and location. Run it weekly on the sellers, and
  fully at baseline and monthly.
- Stockout watchlist: any active seller at or near zero is an active revenue leak - every
  day out of stock is lost orders plus a demotion in Shopify's own product ranking. Surface
  these the day they cross the line, as a task with the SKU and the velocity so the client
  can reorder with numbers in hand.
- Reorder points: for each core SKU set a floor (average daily sales x lead time in days, plus
  a safety buffer); when on-hand crosses it, raise a restock task. There is no automated
  reorder tool - the discipline is the weekly check.
- Dead stock: SKUs with meaningful on-hand and near-zero velocity are cash on a shelf. Flag
  for a promotion, a bundle (a Play 2 collection), or archival.
- Untracked or negative inventory is a data-integrity bug that breaks storefront availability.
  Fix the tracking setting via `shopify_admin` (confirm each) first. Inventory is
  per-location: a product "in stock" overall can be zero at the location that fulfills a given
  customer, so read location-level, not just the rollup.

## Play 4 - Storefront (headless / Hiveku-hosted)
When the buy experience lives in a Hiveku project rather than the native Shopify theme.
- `shopify_scaffold_compat` -> confirm the target project can host a scaffolded storefront
  (framework, structure, conflicts) BEFORE scaffolding into an incompatible project you then
  have to unwind.
- `shopify_storefront_scaffold` -> lay down the storefront (listing, product detail, cart,
  checkout handoff) wired to the Storefront API. This writes files into the project - treat it
  like any code change: committed and reviewed first, not live until deployed.
- `shopify_eject_manifest` -> inspect what a scaffold placed (generated files and wiring) so
  you know what is safe to touch before hand-modifying it.
- Scaffolded storefront data comes live from `shopify_storefront` at runtime, so the catalog
  work in Plays 1-2 (written to Shopify admin) powers the headless pages - catalog first,
  storefront second. Code edits, build, and deploy belong to the web department's tooling.

## Play 5 - Quote-to-cash: estimates and quotes
The CRM revenue engine, and the fastest ROI in most engagements is working the pipeline that
already exists. Flow: draft -> send -> accepted -> (contract) -> invoice.

Build the quote:
- `crm_estimate_template_list` -> start from an approved template so branding, terms, and tax
  handling are consistent. If the client has no clean template, that is the first deliverable -
  draft and approve one before sending a single real quote.
- Line-item and narrative language (scope, package framing) is generative:
  `talk_to_department({ domain: 'commerce', message })` with the deal, avatar, and offer, then
  persist. Numbers are not generative - set prices and quantities deliberately, never let the
  model invent a figure.
- `crm_estimate_create` -> draft with contact, line items, quantities, prices, and expiry.
  `crm_estimate_get` to proof it before anything leaves the building; `crm_estimate_update` to
  correct.
- `crm_estimate_send` puts the quote in front of the client - CONFIRM recipient, total, and
  expiry first. A wrong number in a sent quote is a real problem, not a typo you quietly fix.

Work the pipeline (where the money is):
- `crm_estimate_list` filtered to "sent" and aged -> stalled quotes, each a follow-up task. A
  sent quote with no accept and no rejection is not a no; it is a conversation nobody
  restarted, and restarting it is the retainer's job.
- When a client accepts but the system still shows "sent", `crm_estimate_mark_accepted`
  records it so the pipeline stays honest and the quote is eligible to convert. Only on real
  acceptance - never to flatter a report. Expired quotes get re-issued with fresh pricing and
  a new expiry (`crm_estimate_create`, or `crm_estimate_update` then re-send), not resurrected
  stale.

## Play 6 - Contracts and e-signature envelopes
For deals that need a signed agreement before work or fulfillment, route the accepted quote
through a signature envelope.
- `crm_envelope_create` -> create the envelope with the contract document and deal context.
  `crm_envelope_add_signer` -> add each signer in order (client, then countersigner if the
  agency also signs). Get emails and order right - a misordered envelope stalls at the wrong
  person.
- Cover language and scope summaries are generative (`talk_to_department({ domain: 'commerce',
  message })`, then persist), but binding legal terms are not something to improvise - use
  approved language and flag anything nonstandard to the client for review.
- `crm_envelope_send` -> dispatch for signature. Client-facing and legally meaningful -
  CONFIRM the document, every signer, and the order before sending. Never send silently.
- `crm_envelope_list` -> track signature state (sent, partially signed, completed, voided).
  Partially-signed envelopes sitting for days are the contract equivalent of a stalled quote -
  chase them weekly.
- `crm_envelope_void` -> void an envelope that went out wrong (wrong signer or document,
  superseded terms). Voiding is the fix for a bad send; do not send a second conflicting
  envelope on top of a live one. CONFIRM before voiding - it invalidates a document the client
  may have started signing.

## Play 7 - Invoicing and close
Turn the accepted, signed deal into a bill.
- `crm_estimate_convert_to_invoice` -> convert an accepted estimate into an invoice, carrying
  the line items over so nothing is re-keyed. This creates a real financial document - CONFIRM
  the estimate, amount, and timing first, and confirm the template via
  `crm_invoice_template_list` (branding, payment terms, tax) as part of the conversion. Only
  convert once the quote is genuinely accepted (and the contract signed, if required);
  converting a still-negotiating quote bills for a deal that is not closed.
- Sequence is the guardrail: quote accepted -> contract signed (if required) -> invoice. Never
  invoice ahead of acceptance, nor ahead of signature on a gated deal. Then log the closed deal
  to `memory_create` (value, terms, close date) and `pm_tasks_complete` the pipeline task so
  the monthly report reconciles.

## Weekly cadence (every week, both engines)
1. Inventory: `shopify_inventory_get` on the sellers. Any active seller at or below its
   reorder floor -> a restock task the same day, velocity attached. Any new stockout ->
   surface immediately; do not let the client discover it from a lost sale.
2. Catalog and storefront drift: `shopify_catalog_list` for anything newly added or changed
   (new products with no description, image, or collection are the most common silent
   regression), and spot-check `shopify_storefront` that top sellers are shoppable and in
   their collections - an accidental unpublish or emptied collection is invisible in admin but
   fatal to conversion. Fix or ticket the week it appears.
3. Quote pipeline: `crm_estimate_list` -> "sent" and aging is a follow-up task; freshly
   accepted moves to contract or invoice; expired gets re-issued or closed. Never let a quote
   sit in limbo for two weeks.
4. Contract pipeline: `crm_envelope_list` -> partially-signed or long-sent envelopes get a
   nudge task. A signature that never lands is a deal that never closes.
5. Pipeline hygiene: `pm_tasks_update` on everything in flight - what shipped, what is
   blocked, what waits on the client. Stalled and waiting-on-client are different; label them
   honestly and escalate the ones actually stuck. A seller that stopped selling, an emptied
   collection, or a quote total that looks wrong gets a same-day look - before the client's.

## Monthly report (the artifact the retainer pays for)
There is no commerce deliverable tool - assemble the report from live pulls plus the month's
memory, draft the narrative with `talk_to_department({ domain: 'commerce' })`, and hand it over
as a document (or a hosted page via the web department). Every number must trace to a named
tool call:
1. Executive summary - 5 bullets: headline revenue or pipeline metric, biggest win, biggest
   risk (a persistent stockout, a stalled high-value contract), what we did, what is next.
   Written last, placed first.
2. Catalog and merchandising - products improved (descriptions, images, SEO, collections)
   from completed tasks and `shopify_catalog_list`; before/after on the items touched, live
   URLs linked.
3. Inventory - stockouts caught and cleared, dead stock addressed, current watchlist, from
   `shopify_inventory_get`. Frame stockouts as revenue protected, not just tasks done.
4. Quote-to-cash - from `crm_estimate_list`, `crm_envelope_list`, and closed deals in memory:
   quotes sent and value, acceptance rate, contracts sent and signed, invoices raised, and
   dollars still sitting in "sent" or "partially signed" that next month will chase. Usually
   the clearest ROI story - lead with it when the numbers are good.
5. Work completed and next-month plan - from `pm_tasks_complete`, with expected impact per
   item. Every figure must be reproducible from a named tool call - no vibes. Cross-check
   against `pm_milestones_list` so the report aligns with committed milestones.

## Benchmarks and decision rules
- Stockout urgency: an out-of-stock active seller loses both direct sales and ranking in
  Shopify's catalog sort. Any top-20 seller at zero is a same-day escalation; long-tail SKUs
  wait for the weekly cycle. Reorder floor = average daily units x lead-time days, plus a
  safety buffer sized to demand volatility.
- Dead stock: meaningful on-hand plus near-zero sales over 60-90 days = promote, bundle, or
  archive. The markdown that clears it funds restocking a seller.
- Product "done" = real description in brand voice, at least one quality image, SEO title and
  handle set, correct collection membership, and every variant that should exist.
- Quote follow-up: sent with no response -> follow up around day 3 and day 7-10, then decide
  (re-issue, revise, or close). A quote that ages past expiry untouched is a coaching failure,
  not a lost deal - the client rarely said no; nobody asked.
- Quote-to-cash sequence is non-negotiable: accepted before contract, signed before invoice on
  gated deals. Skipping a step to move faster is how you bill a deal that later evaporates.
- Acceptance and close rates are the pipeline's vital signs. Track sent -> accepted and
  accepted -> invoiced month over month: a falling acceptance rate is a pricing or scoping
  problem, a falling accepted-to-invoiced rate is a follow-through problem you own. That is the
  number the retainer is ultimately measured on.

## Pitfalls (live-store, legal, and data traps)
- `shopify_admin` writes hit a LIVE store instantly - no draft-then-publish buffer on a price
  or availability change. Confirm every write, verify one before a batch, never run a
  catalog-wide mutation you have not proofed on a single product. A silent 401 or empty result
  is almost always an expired token or changed scopes, not missing data - check
  `shopify_connection_status` and `shopify_reconnect` first.
- `shopify_admin` is what the merchant edits; `shopify_storefront` is what the customer can
  buy. A product perfect in admin but unpublished or out of every collection is invisible to
  buyers - confirm the customer-facing result. Never trust a `hiveku-data/commerce` snapshot
  for current stock or status; pull live.
- Sending is not reversible the way editing is. `crm_estimate_send` and `crm_envelope_send`
  put a document in a client's inbox; the remedy for a bad contract send is `crm_envelope_void`
  then a clean re-send - never a second conflicting envelope on top of a live one.
- `crm_estimate_convert_to_invoice` creates a bill. Converting a quote that is not truly
  accepted (or not yet signed on a gated deal) bills a client for a deal that is not closed -
  confirm acceptance and signature state first, every time.
- Nothing client- or store-visible - a price change, a sent quote or contract, a raised
  invoice, a deployed storefront - goes out without explicit confirmation. Reflect every
  material action in the PM tasks and every material decision in `memory_create`, so the
  account has a memory longer than one session.