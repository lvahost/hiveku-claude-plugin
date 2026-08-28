# Shopify connection - connect, reconnect, cache, and sender branding (Play 0 depth)

Do this before any Shopify play, run `shopify_connection_status` as step 0 of the weekly
cadence (a lapsed token discovered mid-play costs the week's inventory check), and
re-check whenever calls start failing.

## Resolve the connection and (where needed) the project

- `shopify_connection_status` (optionally `{ shop_domain }`) -> every store on the
  account (shop_domain, shop_name, shop_id, scope, purpose, installed_at,
  disconnected_at, is_dev_store; never tokens). A live connection is a row with
  `disconnected_at = null`.
- `shopify_status({ project_id })` -> THIS project's effective connection, which is
  either a per-project override or the account default. Connection is a per-project
  question, so ask it per project. `shopify_status({ project_id, include: 'catalog' })`
  returns a product and collection sample in the same call - use it at baseline.
- `project_id`: required by `shopify_status`, `shopify_admin`, `shopify_catalog_list`,
  `shopify_inventory_get`, `shopify_scaffold_compat`, `shopify_storefront_scaffold`, and
  `shopify_eject_manifest`; OPTIONAL on the newer tool families, where omitting it uses
  the account default connection. Resolve it from `sites_list` when that tool is visible
  to your key. VISIBILITY FLAG: the commerce-scoped key profile does not grant
  `sites_list` - under it, get the project_id from the account binding, the dashboard, or
  the client. NEVER substitute `list_projects` / `get_project`: those return pm_projects,
  NOT the buildable code projects, and their ids fail every project-scoped Shopify call.

## Connect a store (bring-your-own OAuth app)

- Prereq: the account needs a bring-your-own Shopify OAuth app. Find it with
  `oauth_app_list` - note its published `provider` enum is google | microsoft | meta
  only, so `provider: 'shopify'` is off-schema; nothing validates args against the schema
  server-side and the route does accept it, but the safe call is `oauth_app_list({})` and
  filtering the rows yourself. Without an app, `shopify_connect_start` returns 412 with
  `code='no_oauth_app'`.
- Registering that app: prefer the Hiveku dashboard (Commerce -> Settings -> Shopify; the
  connect dialog takes name, client_id, client_secret from the client's Shopify Partner
  or custom app, and is the ONLY place that also stores the App Automation Token used for
  headless extension deploys). `oauth_app_create({ provider: 'shopify', name, client_id,
  client_secret, products: ['shopify_storefront'] })` does reach the same table - the
  route's provider list includes shopify and `shopify_storefront` is a valid product for
  it - but 'shopify' is likewise absent from that tool's published enum, `name` is
  required (omit it and the route 400s), and it cannot set the automation token. Raise a
  `pm_tasks_create` ticket for the dashboard step unless the client explicitly wants it
  done from here. VISIBILITY FLAG: `oauth_app_list` / `oauth_app_create` are not in the
  commerce key profile - under a commerce-scoped key a call to them fails as
  unknown/forbidden, which is a scope symptom, not a platform bug.
- Not connected: `shopify_connect_start({ oauth_app_id, shop_domain, intent_type })`, all
  three required. `intent_type` is an ENUM VALUE, not a tool name:
  `shopify_account_connect` (account default), `shopify_project_connect` (bind to one
  project - also pass `project_id`; this is the Ecommerce-tab case), `shopify_reconnect`
  (re-auth an existing connection - also pass `connection_id`). Optional `scopes`
  overrides the default set and must match the app config.
- The response carries `data.setup_url` (hand it to the merchant; you cannot approve
  their own Shopify consent screen) and `data.callback_url`, which MUST already be listed
  in the Shopify app's Allowed redirection URLs or the merchant's approval dead-ends with
  no error you will see. Then poll `shopify_connection_status({ shop_domain })` until a
  row appears with `disconnected_at = null`.
- OAuth redirect and app-install steps happen in a browser, not from here. When a step
  needs the client to click "Install" or approve scopes in their Shopify admin, raise a
  `pm_tasks_create` task with exact instructions - do not pretend to complete a browser
  consent from a tool call.

## Reconnect and scope drift

- Token expired or scopes changed: run `shopify_connect_start` again with
  `intent_type: 'shopify_reconnect'` and the existing `connection_id`. A silent 401 or
  empty result from a Shopify read almost always means a lapsed token - reconnect before
  debugging.
- A connection made with a custom `scopes` override may be missing `read_orders`, and
  that reads as an empty order list, not an error. Check the `scope` column on the
  connection row before diagnosing "no orders".
- Scope revocation has a second silent casualty: Shopify DELETES shop-scoped webhook
  subscriptions whose scope is revoked, with no error anywhere (see
  `references/storefront-scaffold.md`).

## Caching and freshness

- Your own reads are never stale: `shopify_catalog_list`, `shopify_inventory_get`, and
  `list_orders` all hit the Admin API with `cache: 'no-store'`, so they are live every
  time. `invalidate_cache` is for the DEPLOYED SITE, not for you - it fans a cache-tag
  bust out to every deployed Hiveku site rendering that store, so a headless storefront
  stops serving the pre-edit page. It REQUIRES a `tags` array (1-20 strings, 1-64 chars
  each) and 400s without one; the tags the platform itself uses are `shopify-products`
  and `shopify-collections`:
  `shopify_admin({ project_id, admin_action: 'invalidate_cache', params: { tags: ['shopify-products'] } })`.
  It reports `{ attempted, succeeded, failed }` - `attempted: 0` means no deployed site
  uses this connection, which is normal on a native-Shopify store.
- After a catalog write of your own on an account with a headless Hiveku storefront,
  follow up with `invalidate_cache` and its required `tags` so the deployed page stops
  serving the old data. On a native Shopify theme there is nothing to bust.

## Contract sender branding (CRM side, decided at connection time)

- One CRM-side setting belongs here too, and it is a BRANDING choice, not a blocker.
  `crm_envelope_send` does NOT require the `from_email` on `crm_payment_integrations`:
  with it set (and the domain verified) the contract sends from the client's own commerce
  domain via SES; with it unset the route falls back to Hiveku's contract sender
  (`agreements@notifications.hiveku.com`) via Resend and the signer still gets the email.
  It is a dashboard setting with no MCP tool, so you cannot read or set it - ask the
  client which sender they want before the engagement's first contract send.
