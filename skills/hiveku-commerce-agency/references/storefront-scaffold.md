# Storefront surfaces - headless scaffold, native pages/blogs/themes, webhooks (Play 4 depth)

Two storefront realities exist and they take different tools. HEADLESS / Hiveku-hosted:
the buy experience lives in a Hiveku project - scaffold it. NATIVE Shopify online store:
pages, blogs, articles, and theme files are now directly readable and writable. Decide
which surface you are on first: `shopify_scaffold_compat` reports the project's router
type without writing anything, and `shopify_theme_list` shows the native themes.

## Headless: the scaffold loop

Scaffolding is PER FEATURE, one call each. Both tools take a required `feature` from the
same 8-value enum: storefront-client | revalidate-route | cart | sitemap |
customer-account | product-detail-route | reviews | subscriptions.

Run the loop per feature, in this order:
1. `shopify_scaffold_compat({ project_id, feature })` -> router type, path aliases,
   Tailwind presence, and route collisions FOR THAT FEATURE. It is not a general project
   check.
2. `shopify_storefront_scaffold({ project_id, feature, dry_run: true })` -> preview the
   file plan plus compat without writing.
3. The real call, once the plan looks right.

Feature order that works: `storefront-client` FIRST (the live Storefront API client that
exposes `quantityAvailable`), then `product-detail-route` (the full PDP flow: client plus
revalidate plus reviews), then `cart`, then `revalidate-route` (the cache-bust receiver
for product and inventory webhooks - this is what stops a headless PDP serving stale
stock), then optionally `sitemap`, `customer-account`, `reviews`, `subscriptions`.

- Scaffolding is idempotent: existing files are SKIPPED unless `overwrite: true`. Never
  pass `overwrite: true` on a project someone has hand-edited without confirming - it
  clobbers.
- `shopify_storefront_scaffold` 412s with "No Shopify connection is active for this
  project" when the project has no effective connection. Run the connect flow first
  (`references/shopify-connection.md`); that 412 is not a scaffold bug.
  `shopify_scaffold_compat` has no such gate - it only analyzes the project, so it
  answers even with no store connected.
- After scaffolding, the coder/deploy pipeline picks up the new files. Use
  `preview_sync` / deploy to make them live. Scaffolded is not shipped. VISIBILITY FLAG:
  `preview_sync` and the web-department code tools are not in the commerce key profile -
  under a commerce-scoped key, hand the deploy step to the web department or the
  operator's full-profile session rather than reporting the tool broken.
- The scaffolded storefront reads Shopify live at runtime, so catalog work applied
  through the catalog write tools powers the headless pages - catalog first, storefront
  second. Code edits, build, and deploy belong to the web department's tooling.
- To see what a scaffold actually placed, read the project files through the web
  department's tooling - `shopify_eject_manifest` will not tell you: it returns a
  migration plan, not a listing of what a scaffold wrote.

## Webhooks - wiring the revalidate route, and the trap in listing them

The revalidate-route scaffold is the RECEIVER; these tools are how the subscriptions that
feed it get registered.
- `shopify_webhook_create` - one topic to one https callback URL, shop-scoped.
  Confirm-gated. It refuses, by name, any topic whose scope Hiveku does not request or
  this store did not grant.
- `shopify_webhook_list` - returns ONLY shop-scoped subscriptions, never the app-scoped
  ones declared in the app TOML, so an EMPTY RESULT DOES NOT MEAN NO WEBHOOKS ARE
  RUNNING. Never report "no webhooks configured" from this list alone.
- `shopify_webhook_delete` - confirm-gated for a reason bigger than tidiness: deleting
  one of Hiveku's own standard topics breaks order ingest and the review-request flow
  (orders/create, orders/updated), storefront cache invalidation (products/create,
  products/update, products/delete, collections/update) or uninstall detection
  (app/uninstalled), with no error anywhere. Read the topic and endpoint in the response
  before confirming, and never delete a subscription you cannot attribute.
- Shopify silently DELETES subscriptions whose scope is later revoked - a subscription
  can vanish without anyone calling delete. A headless storefront serving stale stock
  after a scope change is this failure; re-create the subscription after reconnecting.

## Native online store: pages, blogs, articles, comments

- `shopify_page_list` (id, title, handle, isPublished, publishedAt; Relay 250) /
  `shopify_page_get` (full HTML body). `shopify_page_create` is created as a DRAFT unless
  you pass `published: true` - Hiveku sends the flag explicitly and defaults it false, so
  an agent cannot publish to a client storefront by omission (raw Shopify defaults the
  OTHER way). `shopify_page_update` is partial; changing `handle` changes the live URL,
  so pass `redirect_new_handle: true`. `shopify_page_delete` is permanent and
  confirm-gated.
- `shopify_blog_list` / `shopify_blog_get` / `shopify_blog_create` (no draft state;
  `comment_policy` MODERATED means shopper comments wait for moderation) /
  `shopify_blog_update` (changing handle moves every article URL under it - pass
  `redirect_new_handle` and `redirect_articles`) / `shopify_blog_delete` (confirm-gated;
  the schema does not document what happens to the articles inside - move or export them
  first).
- `shopify_article_list` (across all blogs, or one via `blog_id`) /
  `shopify_article_get` (full HTML body) / `shopify_article_create` (`author_name`
  required; `published` defaults false here, `published: true` is live at once) /
  `shopify_article_update` (partial, but `tags` REPLACES the whole list;
  `redirect_new_handle` on handle changes) / `shopify_article_delete` (confirm-gated).
- `shopify_comment_list` (moderation status PENDING, UNAPPROVED, PUBLISHED, SPAM,
  REMOVED; author email and IP are protected data, not returned) /
  `shopify_comment_moderate` (approve PUBLISHES publicly; spam hides; not_spam returns to
  pending without publishing; reversible, so not confirm-gated; there is no
  comment_delete - deletion is deliberately not exposed).
- Publishing a page or article is client-visible content on the client's own storefront:
  draft first, show the client, publish on a yes. Brand voice comes from
  `talk_to_department({ domain: 'content', message })` or your own context-hydrated
  draft - never generic filler.

## Native theme files (the highest-blast-radius surface here)

- `shopify_theme_list` - exactly one theme has role MAIN and that is the published,
  shopper-visible one.
- `shopify_theme_file_list` (filename, content type, size, md5; `include_body` off by
  default because a page of liquid bodies is megabytes) / `shopify_theme_file_get` (one
  file, body normalised to { type, text, base64, url } - large or binary bodies come back
  as base64 or a short-lived URL).
- `shopify_theme_file_upsert` / `shopify_theme_file_delete` - one file per call,
  confirm-gated, and the theme ROLE IS READ FIRST: if it is MAIN, the call is REFUSED
  unless you pass `allow_live_theme: true`, because the change is live to every shopper
  at once with no undo. Target an UNPUBLISHED or DEVELOPMENT theme, verify there, and let
  the client publish. Passing `allow_live_theme: true` on a client's MAIN theme requires
  the client's explicit approval of the exact file diff - no exceptions. Upsert returns a
  Job: no userErrors means ACCEPTED, not finished.
- Theme-code writes also need a Shopify-granted app exemption on top of write_themes and
  whether Hiveku holds it is UNVERIFIED - the call can 403 while a scope audit reads
  green. A 403 here is possibly that exemption, not necessarily a lapsed token.
- Theme reads answer "what does the buyer actually see" questions structurally
  (templates, sections, settings) - but publication state of products remains unreadable,
  so the live URL is still the final check.

## Eject to Hydrogen/Oxygen

- `shopify_eject_manifest({ project_id })` is a READ, despite the name. It returns a
  migration plan for moving the project to a stand-alone Hydrogen/Oxygen repo: it
  persists nothing, transforms nothing, and performs no eject, because the eject runner
  is unbuilt. Safe to run to show a client what leaving would involve. Never promise an
  eject on the strength of it, and never warn a client that running it would strip their
  storefront - it would not. If a client genuinely wants off the managed scaffold, that
  is a scoped engineering project - ticket it with `pm_tasks_create`.
- History: until 2026-08-27 this tool 405'd on every call, because the registry mapped it
  POST at a GET-only route, and its description advertised a destructive "one-way" eject.
  Both are fixed; the registry maps it GET. If you are on an older MCP server and it
  still 405s, the read is unavailable, not dangerous.
