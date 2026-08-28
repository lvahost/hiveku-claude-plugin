# Monthly commerce report - assembly, benchmarks, and the honesty rules

There is no commerce deliverable tool - assemble the report from live pulls plus the
month's memory, draft the narrative off `account_context_get({ domain: 'sales' })`
yourself (there is no commerce department agent to hand it to), and deliver it as a
document or a hosted page via the web department. Every number must trace to a named
tool call.

## The honesty rules (apply to every section)

- CLOSED VERDICT VOCABULARY. Every audit check reports pass | fail | unknown |
  not_applicable. Unknown and not_applicable are valid outputs and are NEVER converted
  into passes. Publication state is UNKNOWN on every product (read_product_listings is
  not held) - a catalog section that says "all products verified" is lying about that
  column.
- SAMPLE TRANSPARENCY. Any aggregate figure or verdict discloses N, how the sample was
  chosen, and what was excluded. "Revenue: $X across 214 orders, 2026-08-01 to
  2026-08-28, read via shopify_order_list (60-day API horizon; orders older than 60 days
  are silently invisible)" is a defensible number. "$X this month" is not.
- A FAILED SOURCE IS PARTIAL, NOT ZERO. If the Shopify connection lapsed mid-month, the
  store section is `partial` with the gap dated - never a zero revenue line, and never
  silently dropped. Never hide partial status in an executive summary.
- MEASUREMENT ARTIFACTS BEFORE NARRATIVE. Before any causal story ("sales dropped",
  "the promo worked"), rule out the artifacts this surface actually produces: the 60-day
  read_orders horizon rolling forward (last month's orders aging out is not a sales
  drop); a lapsed token or scope change (empty list, not zero sales); protected-data
  nulls (missing emails are Level 2 approval, not anonymous buyers); currency mixing;
  and the UPDATED_AT sort on catalog reads (the top of the list is recently edited, not
  new). The data was fine and the interpretation wasn't is the default failure - check
  the pipe first.
- COMPARABILITY GATE. Do not add numbers whose definitions differ. Shopify order revenue
  (order-date, per-currency, gross of refunds unless you read order_transactions), CRM
  estimate totals (quoted, not collected), and AR aging (billed, not collected) are three
  different quantities - report them side by side with their definitions; never compute
  a blended "total revenue". Never add two currencies into one figure (`currencyCode` is
  per order). Compare against the same account's prior period first; broad benchmarks
  are directional only.
- SYNTHESIZE, DON'T RESTATE. The report adds prioritization by business impact and
  reconciliation across sources - a restated tool dump is not a deliverable the retainer
  pays for.

## Section assembly

1. Executive summary - 5 bullets: headline revenue or pipeline metric, biggest win,
   biggest risk (a persistent stockout, a stalled high-value contract), what we did, what
   is next. Written last, placed first. Partial sections stay flagged here too.
2. Catalog and merchandising - the recommendations shipped, the changes applied (now
   often by you, through the write tools, each with its read-back), and the ones the
   client applied, from completed `pm_tasks` plus re-reads. `shopify_product_get`
   verifies title, status, description body, SEO fields, variants, price, and media;
   `shopify_collection_get` verifies membership; `shopify_metafields_get` verifies
   specs. The ONE thing no tool verifies is publication to the online-store channel -
   that is the live product URL, linked, or the client's screen; report it as such.
3. Inventory - stockouts caught and cleared, dead stock addressed, current watchlist,
   from `shopify_inventory_get` per-variant `inventoryQuantity`. Frame stockouts as
   revenue protected. Per-location stock is not readable; say so where it matters.
4. Store revenue - from `shopify_order_list`, Relay-paged to completion over the report
   window (250 per page, pass `endCursor` as `after`), summing
   `totalPriceSet.shopMoney.amount` per currency. State the window, the order count, and
   the 60-day horizon. Order count, average order value, and the unpaid/unfulfilled
   split from `displayFinancialStatus` / `displayFulfillmentStatus` are all defensible.
   Per-SKU units and revenue ARE now derivable - walk the window's orders with
   `shopify_order_get` line items - and the seller ranking that produces supersedes
   client say-so within the window; disclose that it covers at most 60 days and N orders.
   Refund-adjusted figures need `shopify_order_transactions`; without that read, label
   revenue gross.
5. Quote-to-cash - from `crm_estimate_list` (sent / viewed / accepted / declined /
   expired / converted counts and value, paged with limit/offset to completion),
   `crm_envelope_list` (limit: 200; no offset - narrow by filters if full) plus
   `crm_envelope_list_signers` (contracts sent, partially signed, completed, declined),
   `accounting_invoice_list` (invoices raised, by status, paged) and
   `accounting_ar_aging` (dollars outstanding, by bucket), and closed deals in memory.
   There is no "partially signed" status to filter, so that figure is derived from the
   signer read - derive it, do not estimate it. Usually the clearest ROI story - lead
   with it when the numbers are good.
6. Work completed and next-month plan - from `pm_tasks_complete`, with expected impact
   per item. Every figure must be reproducible from a named tool call - no vibes. If a
   number the client wants is not obtainable from any tool (publication state,
   per-location stock, orders older than 60 days, refund-level margin), say that in the
   report instead of producing one. Cross-check against `pm_milestones_list` so the
   report aligns with committed milestones.

## Benchmarks and decision rules (defaults - account memory overrides)

- Stockout urgency: an out-of-stock active seller loses both direct sales and ranking in
  Shopify's catalog sort. Any handle on the seller watchlist at zero is a same-day
  escalation; everything off the watchlist waits for the weekly cycle. Build the
  watchlist from order-line data over the trailing 60 days where volume allows, and from
  the client's named sellers beyond that window - the report says which. Reorder floor =
  average daily units x lead-time days, plus a safety buffer sized to demand volatility.
- Dead stock: meaningful on-hand plus near-zero sales over the observable window =
  promote, bundle, or archive (`shopify_product_update` status ARCHIVED - reversible,
  unlike delete). The markdown that clears it funds restocking a seller.
- Product "done" = real description in brand voice, at least one quality image, SEO
  title and handle set, correct collection membership, and every variant that should
  exist. All of that is now verifiable from MCP (`shopify_product_get`,
  `shopify_collection_get`) EXCEPT publication to the sales channel - confirmed on the
  live product URL or by the client, and the report says which is which.
- Quote follow-up: sent with no response -> follow up around day 3 and day 7-10, then
  decide (re-issue, revise, or close). A quote that ages past expiry untouched is a
  coaching failure, not a lost deal - the client rarely said no; nobody asked.
- Quote-to-cash sequence is non-negotiable: accepted before contract, signed before
  invoice on gated deals. Skipping a step to move faster is how you bill a deal that
  later evaporates.
- Acceptance and close rates are the pipeline's vital signs. Track sent -> accepted and
  accepted -> invoiced month over month: a falling acceptance rate is a pricing or
  scoping problem, a falling accepted-to-invoiced rate is a follow-through problem you
  own. That is the number the retainer is ultimately measured on.
- End every report with owners, next actions, measurement windows, and rollback notes -
  a recommendation without a measurement plan does not ship.
