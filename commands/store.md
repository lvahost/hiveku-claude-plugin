---
description: Weekly Shopify store check - connection, catalog drift, orders, stockouts and dead stock.
---
Store check. Shopify is READ-ONLY from here: the one write handler (`create_product_draft`) carries
`policy: 'admin'` and the Olympus proxy forwards no `x-builder-user-id`, so it 403s every time. Every
fix ships as a ticket the client applies in Shopify admin.
1. `sites_list` → `project_id`. Every Shopify tool except `shopify_connect_start` and
   `shopify_connection_status` requires it.
2. `shopify_status({ project_id })` → the project's effective connection (override or account default).
   Empty or 401 usually means a lapsed token: `shopify_connection_status`, then re-run
   `shopify_connect_start({ intent_type: "shopify_reconnect", connection_id, ... })`.
3. Catalog drift: `shopify_catalog_list({ project_id, params: { first: 100 } })` - product level only
   (handle, title, status, `totalInventory`, price, featured image), `first` 1-100 (default 20), sorted
   MOST RECENTLY UPDATED first (`sortKey: UPDATED_AT`), NOT newest-created - so the top row is what
   changed last, not a new product. Diff handles against last week's memory snapshot to find genuinely
   new SKUs. Flag products stuck in draft, active products at zero inventory, and missing featured
   images. Description, SEO fields, publication channel, and collection membership are NOT readable
   from any tool - check those on the live product URL or hand them to the client.
4. Orders: `shopify_admin({ project_id, admin_action: "list_orders", params: { first: 100 } })` →
   per-order `name`, `processedAt`, `email`, `displayFinancialStatus`, `displayFulfillmentStatus`,
   `totalPriceSet.shopMoney { amount, currencyCode }`, `customer`. Newest-processed first, `first`
   1-100 (default 25), optional `query` is a Shopify search filter (max 200 chars). Flag unfulfilled
   and unpaid orders. No line items come back, so no per-SKU units or per-SKU revenue - order count and
   order value only, and never sum two `currencyCode`s into one number.
5. Stockouts: `shopify_inventory_get({ project_id, params: { handle } })` over the seller handles in
   memory (`memory_list`) → per-variant `inventoryQuantity`, `price`, `sku`, `options`. No location
   split and no velocity or bestseller query exists; `{ first: N }` (1-50) is the LAST-UPDATED
   products, not the newest and not the top ones. If you cite a units-per-day figure, name where it
   came from - it is not in any Shopify tool here.
6. Output: a stockout / dead-stock / catalog-gap ticket list via `pm_tasks_create`, each naming the
   handle and the exact before-and-after the client should apply. After they apply it, just re-read -
   `shopify_catalog_list` and `shopify_inventory_get` hit the Admin API with `cache: "no-store"` and are
   always live. `invalidate_cache` is for DEPLOYED headless sites, not for your reads, and it REQUIRES
   `params: { tags: [...] }` (the platform's own are `shopify-products` / `shopify-collections`); bare,
   it 400s. Do not call `shopify_eject_manifest` - the registry maps it to POST, the route is GET-only,
   so it 405s, and behind it is a read-only migration-plan preview that changes nothing.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
