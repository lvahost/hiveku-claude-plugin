---
name: hiveku-commerce-agency
description: Full ecommerce and quote-to-cash agency methodology for operating a Hiveku account. Use for ANY commerce work - Shopify connection, catalog and variant audits, pricing and merchandising recommendations, inventory levels and stockouts, storefront scaffolding and headless builds, plus CRM quote-to-cash - estimates and quotes, proposals, contracts and e-signature envelopes, signer flows, converting accepted quotes to draft invoices, receivables and AR aging, and weekly checkups or monthly commerce reports.
---

# Hiveku Commerce Agency Operating System

Operate the account like a retainer agency charging thousands per month: connect and baseline
once, set a catalog and quote-to-cash strategy, run execution plays on a weekly cadence, and
prove the value in a monthly report the client would pay for. Two revenue engines live under
this roof - the Shopify storefront (catalog, inventory, buy flow) and the CRM quote-to-cash
pipeline (estimate to contract to invoice), and both leak money quietly when nobody minds
them. Every tool named below is a real Hiveku MCP tool.

## Operating principles
- `account_context_get({ domain: 'sales' })` FIRST - before any analysis, plan, quote, or
  product copy. It returns persona, brand voice, avatars, domain memory, skills, and rules.
  Re-read its instructions field before every generative call. There is NO `commerce` domain
  on this tool; the enum is content, marketing, seo, social, ppc, sales, helpdesk, branding,
  customer_avatar, customer_journey, before_after_grid, website_design, knowledge_base,
  workflow, outbound. `sales` is the closest real context for quote-to-cash; use
  `website_design` when the work is storefront build rather than pipeline.
- There is NO commerce department agent. `talk_to_department` accepts seo, social, content,
  marketing, branding, outbound, ppc, analytics, customer_avatar, customer_journey,
  before_after_grid, website_design, knowledge_base, workflow - `commerce` and `sales` are
  both rejected. For customer-facing product and collection copy use
  `talk_to_department({ domain: 'content', message })`. For quote, proposal, and contract
  narrative, load the context yourself and draft directly, saying that is what you are doing.
  `agent_identity_get` is the other option when you want a department's full identity bundle.
- Hiveku plus Shopify is the source of truth. Durable findings (pricing strategy, catalog
  structure, quote templates, contract terms, decisions) -> `memory_create`. Work items ->
  `pm_tasks_create` / `pm_tasks_complete`. There is no commerce deliverable tool - the
  monthly report is assembled from live pulls plus memory (see Monthly report).
- Know what this MCP surface can and cannot write. Shopify here is READ plus one write:
  `shopify_admin` dispatches named handlers, and the ones that exist are: `ping`, `get_shop`,
  `list_products`, `list_orders`, `list_installed_apps`, `invalidate_cache`, `app_compat_check`,
  `create_product_draft`, `product_inventory`. `create_product_draft` is the only one that
  creates anything. Note that ORDERS and per-product INVENTORY are readable here
  (`list_orders`, `product_inventory`), so revenue and stock questions do not need to leave
  Claude. There is still no product update, price, SEO-field, metafield, collection, or publish
  handler. Catalog and pricing changes are a documented HANDOFF: you audit, you draft the
  copy, the client applies it in Shopify admin. Never tell a client you changed their store.
- Confirm before writes, and treat the two engines differently. Reading a catalog or listing
  estimates is safe. But `crm_estimate_send` and `crm_envelope_send` put a document in front
  of a paying client, `crm_estimate_convert_to_invoice` revokes the client's live estimate
  link and cannot be undone, and `shopify_eject_manifest` is a one-way strip of a project's
  storefront scaffold. Summarize exactly what you are about to send or change, and get a yes.
- ALL money on the CRM side is integer CENTS (`unit_cents`, `discount_cents`, `amount_cents`)
  and ALL tax is BASIS POINTS (`tax_bps`: 825 = 8.25%). Dollars x 100, percent x 100, every
  single write. `unit_cents: 199.99` quotes a client two dollars; `tax_bps: 8.25` charges
  0.0825 percent tax. Read the document back with `crm_estimate_get` before it is sent.
- `hiveku-data/commerce/*.json` (products, inventory snapshots, estimates, envelopes,
  invoices) is the local mirror - read it for orientation and structure, use live tools for
  anything current or decision-grade. Stock levels, quote statuses, and signature states move
  by the hour; the snapshot goes stale the moment the store sells or a client signs.
- Discover exact arg shapes with `hiveku_docs_search` / `hiveku_docs_get` before a write you
  are unsure of - especially the estimate and envelope field names. Guessing a body shape on a
  client-facing document is how a wrong total reaches an inbox.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising anything)
1. Context and project id: `account_context_get({ domain: 'sales' })`, then `sites_list` (or
   `list_projects` / `get_project`) to get the `project_id`. Seven of the nine Shopify tools
   have `required: ['project_id']` - `shopify_status`, `shopify_admin`, `shopify_catalog_list`,
   `shopify_inventory_get`, `shopify_scaffold_compat`, `shopify_storefront_scaffold`,
   `shopify_eject_manifest`. Only `shopify_connect_start` and `shopify_connection_status` are
   account-scoped. A Shopify call without `project_id` 400s.
2. Connection: `shopify_connection_status` -> every store on the account (shop_domain,
   shop_name, scope, purpose, installed_at, disconnected_at, is_dev_store; never tokens), then
   `shopify_status({ project_id })` -> THIS project's effective connection, which is either a
   per-project override or the account default. Connection is a per-project question, so ask
   it per project. `shopify_status({ project_id, include: 'catalog' })` returns a product and
   collection sample in the same call - use it at baseline. If nothing is connected, run the
   connect flow (Play 0) before promising any Shopify work.
3. Catalog census: `shopify_catalog_list({ project_id, params: { first: 100 } })`. Know the
   real return shape: product-level rows only - handle, title, status, `totalInventory`
   aggregate, price, featured image. Max 100 per call, newest products first, no cursor. It
   does NOT return variants, description bodies, SEO title/meta, or collection membership, so
   a "full census" of a catalog over 100 products is not available from MCP - work by handle
   and say so. Capture the product count, draft-vs-active split, and the gaps you CAN see
   (status wrong for the item, zero `totalInventory` on an active product, no featured image).
4. Inventory baseline: `shopify_inventory_get({ project_id, params: { first: 50 } })` for the
   50 most recently created products, or `{ params: { handle } }` per named product. Returns
   each product's variants with `inventoryQuantity`, `price`, `sku`, `title`, `options`. There
   is no location breakdown and no bestseller or velocity query anywhere in the registry. Note
   stockouts, negatives, and anything at zero that is still active.
5. Quote-to-cash census: `crm_estimate_list` -> every estimate and status (draft, sent, viewed,
   accepted, declined, expired, converted). `crm_envelope_list` -> contracts by status
   (draft/sent/viewed/completed/declined/voided). `crm_estimate_template_list`,
   `crm_invoice_template_list`, and `crm_contract_template_list` -> the template library to
   build on. `accounting_invoice_list({ status: 'all' })` and `accounting_ar_aging` -> the
   unpaid tail. The money hiding here is sent-but-never-accepted quotes, sent-but-never-signed
   contracts, and sent-but-never-paid invoices - the pipeline that stalled and nobody chased.
6. Storefront reality: native Shopify online store, or a headless / Hiveku-hosted storefront?
   `shopify_scaffold_compat({ project_id, feature: 'storefront-client' })` reports the router
   type, path aliases, Tailwind presence, and route collisions without writing anything - that
   tells you what surface you are on. Do NOT run `shopify_eject_manifest` for orientation; it
   is a one-way strip (see Play 4). To see what a scaffold placed, read the project files
   through the web department's tooling.
7. Record the baseline in `memory_create` - store domain and connection state, product count
   and draft/active split, the seller handles the CLIENT names as their top sellers (no tool
   ranks them), the catalog gaps you verified, the stalled-quote and unsigned-contract and
   overdue-invoice dollar figures, the template inventory, and any client constraint (margins
   they will not cross, terms they will not change). Open `pm_tasks_create` tickets for the
   first fixes.

### Strategy (weeks 2-3)
Turn the baseline into a plan across both engines:
- Catalog and merchandising: which products need real descriptions and images, which
  collections to build or reorganize, where pricing leaves margin on the table, which dead
  SKUs to archive. Priority = revenue contribution x fixability. Remember the whole catalog
  half of this plan ships as a recommendation the client applies in Shopify admin - scope it
  as tickets and copy, not as edits you will make.
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
- Resolve `project_id` from `sites_list` FIRST. Every Shopify tool except
  `shopify_connect_start` and `shopify_connection_status` requires it.
- `shopify_connection_status` (optionally `{ shop_domain }`) -> the account's connections and
  granted scopes. `shopify_status({ project_id })` -> the project's EFFECTIVE connection,
  override or account default.
- Prereq before connecting: the account needs a bring-your-own Shopify OAuth app. Find it with
  `oauth_app_list({ provider: 'shopify' })`. Without one, `shopify_connect_start` returns 412
  with `code='no_oauth_app'`. Shopify apps are registered in the Hiveku dashboard (Commerce ->
  Settings -> Shopify, client_id and client_secret from the client's Shopify Partner or custom
  app), NOT via `oauth_app_create` - raise a `pm_tasks_create` ticket for that step.
- Not connected: `shopify_connect_start({ oauth_app_id, shop_domain, intent_type })`, all three
  required. `intent_type` is an ENUM VALUE, not a tool name: `shopify_account_connect` (account
  default), `shopify_project_connect` (bind to one project - also pass `project_id`; this is
  the Ecommerce-tab case), `shopify_reconnect` (re-auth an existing connection - also pass
  `connection_id`). Optional `scopes` overrides the default set and must match the app config.
- The response carries `data.setup_url` (hand it to the merchant; you cannot approve their own
  Shopify consent screen) and `data.callback_url`, which MUST already be listed in the Shopify
  app's Allowed redirection URLs or the merchant's approval dead-ends with no error you will
  see. Then poll `shopify_connection_status({ shop_domain })` until a row appears with
  `disconnected_at = null`.
- Token expired or scopes changed: run `shopify_connect_start` again with
  `intent_type: 'shopify_reconnect'` and the existing `connection_id`. A silent 401 or empty
  result from a Shopify read almost always means a lapsed token - reconnect before debugging.
- After the client edits the store in Shopify admin, run
  `shopify_admin({ project_id, admin_action: 'invalidate_cache' })` so Hiveku re-reads it;
  otherwise your next catalog read can serve the pre-edit picture.
- One CRM-side prerequisite belongs here too: `crm_envelope_send` requires the `from_email`
  setting on `crm_payment_integrations`, which is a dashboard setting with no MCP tool. Confirm
  with the client that it is set before the engagement's first contract send. A first-send
  failure there is configuration, not payload - do not rewrite the envelope chasing it.
- OAuth redirect and app-install steps happen in a browser, not from here. When a step needs
  the client to click "Install" or approve scopes in their Shopify admin, raise a
  `pm_tasks_create` task with exact instructions - do not pretend to complete a browser
  consent from a tool call.

## Play 1 - Catalog and product data
The catalog is the storefront's conversion surface. Thin product data is lost revenue. This
play is AUDIT plus COPY plus HANDOFF - Hiveku cannot edit an existing Shopify product.

Read first (cheap, run freely):
- `shopify_catalog_list({ project_id, params: { first: 100 } })` -> handle, title, status,
  `totalInventory`, price, featured image. Product level only, max 100 per call, newest first.
- `shopify_inventory_get({ project_id, params: { handle } })` -> that product's variants with
  `inventoryQuantity`, `price`, `sku`, `title`, `options`.

What you can audit from MCP: status (draft vs active), missing featured image, zero or
negative inventory on an active product, variant structure and per-variant price and sku,
price outliers, duplicate or malformed handles.

What you CANNOT audit from MCP - say so rather than guessing: description body, SEO title,
meta description, alt text, collection membership, image count and quality, and whether a
product is actually published to the online-store channel. No tool in the registry returns
any of those. To check them, have the client open the product in Shopify admin, or open the
live storefront URL yourself and read the rendered page. There is no MCP read of the
customer-facing Storefront API; the Storefront client exists only as scaffolded PROJECT CODE
(`shopify_storefront_scaffold({ feature: 'storefront-client' })`) that reads
`quantityAvailable` at page runtime.

Write descriptions and merchandising copy the brand way:
- `talk_to_department({ domain: 'content', message })` with the product, its attributes, the
  target avatar, and the SEO keyword it should own -> copy in the brand voice, not generic
  marketplace filler. Same for collection descriptions. (`domain: 'commerce'` is rejected.)
- Deliver it, do not paste it. `shopify_admin` has no product-update handler. The only Shopify
  create available is `shopify_admin({ project_id, admin_action: 'create_product_draft',
  params })` for a NEW draft product. For anything existing, ship a `pm_tasks_create` ticket
  holding the exact product handle, the field-by-field before and after, and the copy ready to
  paste. After the client applies it, run
  `shopify_admin({ project_id, admin_action: 'invalidate_cache' })` and re-read to confirm.
- If the storefront is a Hiveku-hosted project, display copy may live in project files or CMS
  instead - route that through the web department's tools, where you CAN write.

## Play 2 - Pricing and collections
Both are recommendation work here. No pricing, collection, or metafield handler exists.
- Pricing: audit with `shopify_inventory_get` (per-variant `price`) and `shopify_catalog_list`
  (product price). Model the change, show the client the exact resulting list product by
  product with old price and new price, and hand it over as a `pm_tasks_create` ticket they
  apply in Shopify admin. Never describe a price change as done until you have re-read it
  after `invalidate_cache`. Compare-at pricing (the strike-through) is a merchandising lever,
  not a lie - recommend it only where the item genuinely sold higher.
- Collections are the store's navigation and the merchandiser's shelf, and they are entirely
  outside this MCP surface: you cannot read membership and cannot change it. Design the
  collection structure, write the collection copy, specify the membership rules, and ticket
  it. Verification is the client's screen or the live storefront URL, not a tool call.
- Metafields (materials, dimensions, specs) are the same story - plan the schema once, write
  it down in `memory_create`, and hand the population to the client.

## Play 3 - Inventory health
Stockouts on sellers and dead stock on shelves both cost money. Your job is to surface, the
client's job is usually to buy.
- `shopify_inventory_get({ project_id, params })` -> per-VARIANT `inventoryQuantity`, `price`,
  `sku`, `title`, `options`. Selection is `{ handle }` for one product or `{ first: N }` (max
  50) for the most RECENTLY CREATED products. There is no way to query by sales velocity or
  bestseller rank - `{ first: 50 }` is newest, not top.
- Build the seller watchlist by hand and persist it: ask the client which handles are their
  sellers, store that list with `memory_create`, and each week iterate `{ handle }` calls over
  it. That list is the only "top sellers" this skill has.
- Stockout watchlist: any active seller at or near zero is an active revenue leak - every
  day out of stock is lost orders plus a demotion in Shopify's own product ranking. Surface
  these the day they cross the line, as a task with the SKU and on-hand. Velocity is not
  available from any tool - if you quote a units-per-day figure, it came from the client or
  from an analytics source you name, never from Shopify here.
- Reorder points: for each core SKU set a floor (average daily sales x lead time in days, plus
  a safety buffer, with the sales figure supplied by the client); when on-hand crosses it,
  raise a restock task. There is no automated reorder tool - the discipline is the weekly check.
- Dead stock: SKUs with meaningful on-hand and near-zero sales are cash on a shelf. Flag for a
  promotion, a bundle, or archival - all client-applied.
- Untracked or negative inventory is a data-integrity bug that breaks storefront availability.
  There is no inventory-tracking write here; ticket the fix for Shopify admin.
- `inventoryQuantity` is a single rollup number. If the store is multi-location, that rollup is
  all Hiveku can see - a product "in stock" overall can be zero at the location that fulfills a
  given customer. Flag location risk as a client-side check; do not claim to have read it.

## Play 4 - Storefront (headless / Hiveku-hosted)
When the buy experience lives in a Hiveku project rather than the native Shopify theme.
Scaffolding is PER FEATURE, one call each. Both tools take a required `feature` from the same
8-value enum: storefront-client | revalidate-route | cart | sitemap | customer-account |
product-detail-route | reviews | subscriptions.

Run the loop per feature, in this order:
1. `shopify_scaffold_compat({ project_id, feature })` -> router type, path aliases, Tailwind
   presence, and route collisions FOR THAT FEATURE. It is not a general project check.
2. `shopify_storefront_scaffold({ project_id, feature, dry_run: true })` -> preview the file
   plan plus compat without writing.
3. The real call, once the plan looks right.

Feature order that works: `storefront-client` FIRST (the live Storefront API client that
exposes `quantityAvailable`), then `product-detail-route` (the full PDP flow: client plus
revalidate plus reviews), then `cart`, then `revalidate-route` (the cache-bust receiver for
product and inventory webhooks - this is what stops a headless PDP serving stale stock), then
optionally `sitemap`, `customer-account`, `reviews`, `subscriptions`.

- Scaffolding is idempotent: existing files are SKIPPED unless `overwrite: true`. Never pass
  `overwrite: true` on a project someone has hand-edited without confirming - it clobbers.
- After scaffolding, the coder/deploy pipeline picks up the new files. Use `preview_sync` /
  deploy to make them live. Scaffolded is not shipped.
- `shopify_eject_manifest({ project_id })` is DESTRUCTIVE and ONE-WAY BY DESIGN. It ejects the
  Shopify storefront manifest from the project and cannot be undone. Never run it to inspect,
  orient, or "see what the scaffold placed" - to do that, read the project files through the
  web department's tooling. Run it only on an explicit client instruction to take the
  storefront off Hiveku's managed scaffold, and only after you have restated in plain words
  what will be removed and gotten a yes.
- The scaffolded storefront reads Shopify live at runtime, so the catalog work in Plays 1-2
  (applied by the client in Shopify admin) powers the headless pages - catalog first,
  storefront second. Code edits, build, and deploy belong to the web department's tooling.

## Play 5 - Quote-to-cash: estimates and quotes
The CRM revenue engine, and the fastest ROI in most engagements is working the pipeline that
already exists. Flow: draft -> send -> accepted -> (contract) -> invoice.

UNITS, before anything else: `unit_cents`, `discount_cents`, and `amount_cents` are integer
CENTS. `tax_bps` is BASIS POINTS (825 = 8.25%). $199.99 is `unit_cents: 19999`. 8.25 percent is
`tax_bps: 825`. Get this wrong and a client receives a two-dollar quote or a rounding-error tax
line on a document you already sent.

Build the quote:
- `crm_estimate_template_list` -> start from an approved template so branding, terms, and tax
  handling are consistent. If the client has no clean template, that is the first deliverable -
  draft and approve one before sending a single real quote.
- Line-item and narrative language (scope, package framing) is generative. There is no commerce
  department agent, so load `account_context_get({ domain: 'sales' })` and draft it yourself
  with that hydration, or use `talk_to_department({ domain: 'content', message })` when the
  language is customer-facing marketing copy. Numbers are not generative - set prices and
  quantities deliberately, never let the model invent a figure.
- `crm_estimate_create({ line_items, ... })`. `line_items` is the only formally required field,
  but either `contact_id` OR `company_id` must be present or the call fails. Each item is
  `{ description, quantity, unit_cents, discount_cents?, tax_bps?, sort_order?, product_id?,
  metadata? }`. Estimate-level knobs: `deal_id`, `currency`, `expires_at`, `notes`, `terms`,
  `tax_bps`, `discount_cents`, `estimate_template_id`. `estimate_number` auto-generates
  server-side - never pass one. Omit `estimate_template_id` to inherit the account default.
- `crm_estimate_get` to proof it before anything leaves the building - read the computed total
  back and confirm it against the dollars you intended. `crm_estimate_update` to correct.

Immutability and 409s (all four of these bite):
- `crm_estimate_update` on an accepted or converted estimate returns 409. Duplicate it instead.
- Passing `line_items` to `crm_estimate_update` REPLACES THE FULL SET. A partial array silently
  deletes every item you left out. Re-read with `crm_estimate_get` and resend the complete array.
- `crm_estimate_delete` soft-deletes AND revokes the portal tokens, so the client's live link
  dies instantly. It refuses (409) on accepted/converted estimates.
- `crm_estimate_mark_accepted({ estimate_id, signer_name })` - `signer_name` is REQUIRED (the
  name the customer agreed under, 1-200 chars); optional `acceptance_note` (max 500). It stamps
  `accepted_offline=true` and renders an acceptance certificate PDF, so treat it as a
  record-keeping write, not a status flip. Returns 409 if the estimate is declined or expired,
  and is idempotent on an already-accepted one (`already_accepted=true`).

Send it:
- `crm_estimate_send({ estimate_id, channel, to_email?, to_phone?, cc?, bcc?, subject?,
  message?, sms_body?, attach_pdf?, idempotency_key })`. `channel` is REQUIRED and is
  'email' | 'sms' | 'both'. Pass an `idempotency_key` on every send - a repeat with the same
  key returns `idempotent_replay=true` instead of a second email landing in the client's inbox.
- `attach_pdf: true` renders and attaches the PDF; text plus the portal link is otherwise
  sufficient. The SMS branch requires the voice add-on enabled on the account - an SMS-channel
  failure on an account without it is entitlement, not payload.
- The portal token TTL is 30 DAYS, regardless of `expires_at`. A quote with a 60-day expiry has
  a dead client link on day 31. Never set an expiry past 30 days without planning a re-send.
- CONFIRM recipient, total, and expiry first. A wrong number in a sent quote is a real problem,
  not a typo you quietly fix.

Work the pipeline (where the money is):
- `crm_estimate_list({ status: 'sent', order: 'created_asc' })` -> the oldest stalled quotes
  first, each a follow-up task. `{ status: 'viewed' }` is the stronger signal: opened and not
  answered. A sent quote with no accept and no decline is not a no; it is a conversation nobody
  restarted, and restarting it is the retainer's job.
- When a client accepts but the system still shows "sent", `crm_estimate_mark_accepted` records
  it so the pipeline stays honest and the quote is eligible to convert. Only on real acceptance
  - never to flatter a report. Expired quotes get re-issued with fresh pricing and a new expiry
  (`crm_estimate_create`, or `crm_estimate_update` then re-send), not resurrected stale.

## Play 6 - Contracts and e-signature envelopes
For deals that need a signed agreement before work or fulfillment, route the accepted quote
through a signature envelope.
Contract template library (this is where approved language comes from):
- `crm_contract_template_list({ archived? })` -> the non-archived templates by default.
  `crm_contract_template_get({ template_id })` -> `layout_json` + `compiled_html` on the block
  path, or `source_pdf_s3_key` + `fields_json` on the legacy PDF path, plus the `signers[]`
  role skeleton and `default_consent`. That is exactly the payload `crm_envelope_create` needs.
- A template body is IMMUTABLE. `crm_contract_template_update` mutates only `name`,
  `description`, and `is_archived` - to change the document body you
  `crm_contract_template_create` a NEW template, because existing envelopes reference the
  template id for audit. `crm_contract_template_delete` only archives; nothing is hard-deleted.
- No approved template on the account? Building one is the first deliverable of this play, and
  it goes to the client's counsel before it goes to a client's signature.

Create and send:
- `crm_envelope_create({ title, signers, ... })` - `title` and `signers` are BOTH required, and
  `signers` is 1-10 items of `{ name, email, role?, contact_id?, access_code?, is_cc_only?,
  local_id? }`. You cannot create an empty envelope and populate it afterwards; that 400s.
  You must also provide EITHER `layout_json` (block-based, compiled to HTML server-side, sourced
  from `crm_contract_template_get`) OR `source_pdf_s3_key` + `fields[]` (legacy PDF plus
  coordinate fields). Link it with `subject_type: 'estimate'`, `subject_id: <estimate_id>`,
  `contact_id`, `company_id`, `deal_id`, and set `signing_order` ('parallel' or 'sequential',
  default parallel) and `expires_at`.
- The create response includes PLAINTEXT signer tokens. Capture them if you may need to send a
  manual signing link - they are not derivable from the stored hash and cannot be recovered.
- `crm_envelope_add_signer({ envelope_id, name, email, role?, contact_id?, access_code?,
  is_cc_only? })` only APPENDS a forgotten signer to a still-DRAFT envelope (409 otherwise) and
  auto-assigns signing order to max+1. It is not the way you populate a new envelope.
- `crm_envelope_update` PATCHes a draft only (409 if not draft); passing `signers` replaces the
  roster but preserves tokens for signers identified by id.
- Cover language and scope summaries are generative - draft them yourself off
  `account_context_get({ domain: 'sales' })`, or use `talk_to_department({ domain: 'content' })`
  for client-facing narrative (`domain: 'commerce'` is rejected). Binding legal terms are not
  something to improvise - use the template language and flag anything nonstandard for review.
- `crm_envelope_send({ envelope_id, message? })` -> dispatch for signature. PREREQUISITE: the
  `from_email` setting on `crm_payment_integrations` must be configured or the send errors;
  that is a dashboard setting with no MCP tool, so verify it with the client before the first
  send of an engagement (see Play 0). On first send status moves draft -> sent and per-signer
  plaintext access tokens are minted server-side; omitting `signer_tokens` regenerates fresh
  ones, which stales any token you captured at create time. On a PARALLEL envelope every
  pending signer is emailed; on a SEQUENTIAL envelope only the first pending signer is - the
  downstream invites fire when the prior signer completes. Do not report a sequential envelope
  as broken because signers 2 and 3 got nothing; that is the design.
- Client-facing and legally meaningful. CONFIRM the document, every signer, and the order
  before sending. Never send silently.

Track signature state:
- `crm_envelope_list({ status })` where status is draft | sent | viewed | completed | declined
  | voided | all. "Partially signed" is NOT a status and cannot be filtered - asking for it
  returns nothing and the chase silently finds zero envelopes.
- Partially signed is derived: `crm_envelope_list({ status: 'sent' })` for the roster, then
  `crm_envelope_list_signers({ envelope_id })` per envelope. That returns per-signer metadata
  only (status, `signed_at`, `viewed_at`, `reminder_count`) and never token hashes. Some
  `signed_at` set and others null = partially signed. Chase those weekly; they are the contract
  equivalent of a stalled quote.
- `viewed` is its own signal (opened, not signed). `declined` is a real outcome - handle it as
  a lost or renegotiated deal, do not leave it sitting in the chase list.
- `crm_envelope_void({ envelope_id, reason? })` -> void an envelope that went out wrong (wrong
  signer or document, superseded terms); it stamps `voided_at` and `void_reason` and refuses
  (409) on completed envelopes. Voiding is the fix for a bad send; do not send a second
  conflicting envelope on top of a live one. CONFIRM before voiding - it invalidates a document
  the client may have started signing. `crm_envelope_delete` also lands the envelope in voided
  (plus `deleted_at`) and likewise refuses on completed.

## Play 7 - Invoicing, receivables, and close
Turn the accepted, signed deal into a bill, then get it paid. Note the seam: estimates live
under `crm_*`, invoices live under `accounting_*`. There is no `crm_invoice_get`,
`crm_invoice_list`, or `crm_invoice_send` - `crm_invoice_template_*` is TEMPLATES ONLY.

- Setup, once per account, not per conversion: `crm_invoice_template_list` /
  `crm_invoice_template_get` to choose the default template (branding, tax, notes, terms) and
  set `default_due_days`, which seeds each invoice's due date (issue_date + days). That is your
  net terms. Do this in the strategy phase.
- `crm_estimate_convert_to_invoice({ estimate_id })` - `estimate_id` is the ONLY argument. It
  takes no template selection; do not look for one. It creates a fresh DRAFT invoice (copying
  line items, totals, notes, terms), links it back via `converted_invoice_id` on the estimate,
  moves the estimate to status 'converted', REVOKES the estimate's portal tokens so the
  client's quote link dies instantly, and returns 409 if already converted.
- Nothing reaches the client on that call. It does not send, and it does not bill. What makes
  it a gate is that it is irreversible: the status change sticks and the client's live estimate
  link is gone. Confirm real acceptance (and signature on a gated deal) before you run it, for
  that reason - not because it charges anyone.
- Find what you just made: `accounting_invoice_list({ status: 'draft' })`. Statuses are
  draft | sent | viewed | partially_paid | paid | void | all, and each row carries the linked
  contact and company.
- SENDING an invoice is a dashboard action. No MCP tool sends an invoice. Say that plainly to
  the client and raise a `pm_tasks_create` ticket for it; never imply you emailed a bill.
- Receivables: `accounting_ar_aging` -> open invoices bucketed by due date. That, plus
  `accounting_invoice_list`, is the only source for "dollars outstanding" figures. Overdue
  buckets drive the weekly chase - see `/hiveku:books-chase`.
- Payment received: `accounting_invoice_record_payment({ invoice_id, amount_cents, method,
  reference?, received_at? })` where method is check | wire | cash | credit_note | manual | ach
  and `amount_cents` is CENTS. It BOOKS cash already received and does NOT move money - never
  describe it to a client as taking a payment.
- Sequence is the guardrail: quote accepted -> contract signed (if required) -> invoice ->
  payment recorded. Never invoice ahead of acceptance, nor ahead of signature on a gated deal.
  Then log the closed deal to `memory_create` (value, terms, close date) and
  `pm_tasks_complete` the pipeline task so the monthly report reconciles.

## Weekly cadence (every week, both engines)
Run it as `/hiveku:store` (steps 1-2) and `/hiveku:quotes` (steps 3-5), or by hand:
1. Inventory: `shopify_inventory_get({ project_id, params: { handle } })` over the watchlist
   handles in memory. Any active seller at or below its reorder floor -> a restock task the
   same day with the on-hand number. Any new stockout -> surface immediately; do not let the
   client discover it from a lost sale.
2. Catalog drift: `shopify_catalog_list({ project_id, params: { first: 100 } })` - newest
   first, so new products surface at the top. Flag new products sitting in draft, or active
   with zero `totalInventory` or no featured image. Publication state and collection membership
   are NOT readable here; if the client reports a product missing from the storefront, that is
   a check on the live URL or in their Shopify admin, not a tool call. Ticket the week it
   appears.
3. Quote pipeline: `crm_estimate_list({ status: 'sent', order: 'created_asc' })` and
   `{ status: 'viewed' }` -> aging quotes are follow-up tasks; freshly accepted moves to
   contract or invoice; expired gets re-issued or closed. Never let a quote sit in limbo for
   two weeks. Watch the 30-day portal-token clock, not just `expires_at`.
4. Contract pipeline: `crm_envelope_list({ status: 'sent' })`, then
   `crm_envelope_list_signers({ envelope_id })` on each to find the partially-signed ones
   (some `signed_at` set, some null). Those and long-sent-untouched envelopes get a nudge task.
   Pick up `declined` as a real outcome. A signature that never lands is a deal that never
   closes.
5. Receivables: `accounting_ar_aging` plus `accounting_invoice_list({ status: 'sent' })` ->
   anything past due gets a chase. `/hiveku:books-chase` runs this end to end with drafted
   reminders.
6. Pipeline hygiene: `pm_tasks_update` on everything in flight - what shipped, what is
   blocked, what waits on the client. Stalled and waiting-on-client are different; label them
   honestly and escalate the ones actually stuck. A stockout on a watchlist seller or a quote
   total that looks wrong gets a same-day look - before the client's.

## Monthly report (the artifact the retainer pays for)
There is no commerce deliverable tool - assemble the report from live pulls plus the month's
memory, draft the narrative off `account_context_get({ domain: 'sales' })` yourself (there is
no commerce department agent to hand it to), and deliver it as a document or a hosted page via
the web department. Every number must trace to a named tool call:
1. Executive summary - 5 bullets: headline revenue or pipeline metric, biggest win, biggest
   risk (a persistent stockout, a stalled high-value contract), what we did, what is next.
   Written last, placed first.
2. Catalog and merchandising - the recommendations shipped and the ones the client applied,
   from completed `pm_tasks` plus a re-read of `shopify_catalog_list`. Report what the tool can
   confirm (title, status, price, featured image, `totalInventory`). For description, SEO, and
   collection work, the evidence is the live product URL, not a tool call - link it. Never
   report an SEO or description field as verified; nothing returns it.
3. Inventory - stockouts caught and cleared, dead stock addressed, current watchlist, from
   `shopify_inventory_get` per-variant `inventoryQuantity`. Frame stockouts as revenue
   protected. Do NOT publish units-per-day or revenue-per-SKU figures from this tool; it
   returns stock counts and prices only. Sales figures come from the client or a named
   analytics source, attributed as such.
4. Quote-to-cash - from `crm_estimate_list` (sent / viewed / accepted / declined / expired /
   converted counts and value), `crm_envelope_list` plus `crm_envelope_list_signers` (contracts
   sent, partially signed, completed, declined), `accounting_invoice_list` (invoices raised, by
   status) and `accounting_ar_aging` (dollars outstanding, by bucket), and closed deals in
   memory. There is no "partially signed" status to filter, so that figure is derived from the
   signer read - derive it, do not estimate it. Usually the clearest ROI story - lead with it
   when the numbers are good.
5. Work completed and next-month plan - from `pm_tasks_complete`, with expected impact per
   item. Every figure must be reproducible from a named tool call - no vibes. If a number the
   client wants is not obtainable from any tool (collection membership, SEO field state,
   per-location stock, sales velocity), say that in the report instead of producing one.
   Cross-check against `pm_milestones_list` so the report aligns with committed milestones.

## Benchmarks and decision rules
- Stockout urgency: an out-of-stock active seller loses both direct sales and ranking in
  Shopify's catalog sort. Any top-20 seller at zero is a same-day escalation; long-tail SKUs
  wait for the weekly cycle. Reorder floor = average daily units x lead-time days, plus a
  safety buffer sized to demand volatility.
- Dead stock: meaningful on-hand plus near-zero sales over 60-90 days = promote, bundle, or
  archive. The markdown that clears it funds restocking a seller.
- Product "done" = real description in brand voice, at least one quality image, SEO title and
  handle set, correct collection membership, and every variant that should exist. Only the
  image, handle, and variant parts are verifiable from MCP; the rest is confirmed on the live
  product URL or by the client, and the report should say which is which.
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
- Do not invent Shopify tools. The registry has exactly nine: `shopify_status`,
  `shopify_admin`, `shopify_eject_manifest`, `shopify_connect_start`,
  `shopify_connection_status`, `shopify_catalog_list`, `shopify_inventory_get`,
  `shopify_scaffold_compat`, `shopify_storefront_scaffold`. There is no `shopify_storefront`,
  no `shopify_account_connect`, no `shopify_project_connect`, no `shopify_reconnect` - the last
  three are `intent_type` VALUES on `shopify_connect_start`. `shopify_storefront` appears in
  the registry only as an OAuth product string.
- All of those except `shopify_connect_start` and `shopify_connection_status` require
  `project_id`. Resolve it from `sites_list` before the first Shopify call of a session.
- `shopify_admin` cannot edit an existing product. Nine handlers, one of which creates anything
  (`create_product_draft`). No price, SEO, metafield, collection, or publish WRITE exists.
  Orders and per-product inventory are READABLE (`list_orders`, `product_inventory`). Never tell
  a client you changed their store; you ticket it.
- Hiveku reads the merchant's ADMIN view only. Whether a buyer can actually see and purchase an
  item - publication channel, collection membership, live availability - has no tool. To
  confirm what a buyer sees, open the live storefront URL or the deployed page. Never trust a
  `hiveku-data/commerce` snapshot for current stock or status; pull live.
- A silent 401 or empty Shopify result is almost always an expired token or changed scopes, not
  missing data - check `shopify_connection_status` first, then re-run `shopify_connect_start`
  with `intent_type: 'shopify_reconnect'` and the existing `connection_id`.
- `shopify_eject_manifest` is ONE-WAY BY DESIGN and destructive. It is not an inspection tool
  and must never appear in an onboarding or orientation sequence.
- CENTS and BASIS POINTS on every CRM money write: `unit_cents`, `discount_cents`,
  `amount_cents` are integer cents; `tax_bps` is basis points (825 = 8.25%). Read the total
  back with `crm_estimate_get` before any send.
- Passing `line_items` to `crm_estimate_update` replaces the FULL set. A partial array deletes
  the rest of the quote silently.
- Sending is not reversible the way editing is. `crm_estimate_send` (required `channel`, and
  always pass an `idempotency_key`) and `crm_envelope_send` put a document in a client's inbox;
  the remedy for a bad contract send is `crm_envelope_void` then a clean re-send - never a
  second conflicting envelope on top of a live one.
- Estimate portal tokens live 30 days no matter what `expires_at` says, and
  `crm_estimate_delete` and `crm_estimate_convert_to_invoice` both revoke them immediately -
  the client's link dies the moment you run either.
- `crm_estimate_convert_to_invoice` does NOT bill anyone. It makes a DRAFT invoice and 409s if
  already converted; sending that invoice is a dashboard action with no MCP tool. Do not report
  a client as invoiced on the strength of the conversion alone. Confirm acceptance and
  signature first anyway - the conversion is irreversible and kills the estimate link.
- "Partially signed" is not an envelope status. Derive it from
  `crm_envelope_list({ status: 'sent' })` plus `crm_envelope_list_signers` per envelope, or the
  weekly chase finds zero and the monthly report carries a number nobody can reproduce.
- `crm_envelope_send` needs the `from_email` setting on `crm_payment_integrations`, which no
  MCP tool sets. On a sequential envelope only signer 1 is emailed on send; that is correct
  behavior, not a bug to chase.
- Nothing client-facing - a sent quote or contract, a recorded payment, a deployed storefront,
  an ejected manifest - goes out without explicit confirmation. Reflect every material action
  in the PM tasks and every material decision in `memory_create`, so the account has a memory
  longer than one session.