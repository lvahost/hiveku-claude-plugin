---
description: Audit every integration on the bound account - what is connected, what is broken, and the exact next step for each gap.
argument-hint: "[optional provider or department - e.g. 'gtm', 'google analytics', 'seo', 'ppc', 'email', 'social', 'shopify']"
---
Audit the integrations on the account this directory is bound to$ARGUMENTS.

This command answers "is X connected, and if not, what do I do about it" WITHOUT the user watching
you reverse-engineer it. A real session spent its time calling `integration_list`, reading consent
scopes by hand, calling `oauth_app_list`, and diffing which products the OAuth client was registered
for, only to conclude that three separate things were missing. All of that is below already. Do the
detective work once, here, and hand over a verdict plus a next step.

Confirm the account with `get_account_info` before reporting, so the audit is not attributed to the
wrong tenant. Read `references/integrations.md` from the **hiveku-orient** skill for the deep
per-provider mechanics rather than re-deriving them in the transcript.

## 1. Inventory - three calls, in this order

1. **`connections_status`** (no arguments). The one-shot inventory. Returns
   `{ seo, ppc, email, cold_email, llm }`. Only the `seo`, `ppc` and `email` rows carry the full
   `connection_status` + `is_active` + `last_synced_at` trio. The tool's own description claims all
   five groups do; they do not, so read the per-group fields below and never key a verdict on a field
   a group never returns:
   - `seo[]`: `platform`, `display_name`, `site_url`, `site_url_bing`, `gbp_account_id`. Covers GSC,
     GBP, Bing Webmaster and Google Analytics, because all four are rows in the same table.
   - `ppc[]`: `platform`, `display_name`, `customer_id`, `ad_account_id`. Google, Meta, Microsoft,
     LinkedIn, TikTok, Amazon.
   - `email[]`: `platform`, `email_address`, `push_enabled`. These are the connected Gmail/Outlook
     INBOXES, not sending platforms.
   - `cold_email[]`: `provider`, `is_active`, `sync_status`, `last_synced_at`. No `connection_status`
     here at all - `sync_status` is the health field for this group.
   - `llm[]`: `provider`, `is_active`, `last_used_at`. Three fields, and that is the whole row: no
     `connection_status` and no `last_synced_at`. Note the rename too - the stored columns are
     `platform` and `last_connected_at`; the route normalizes them on the way out, so do not go
     looking for a `platform` key here.
2. **`social_list_accounts`** - social is deliberately NOT in `connections_status`. Meta/Instagram,
   LinkedIn, X, TikTok and GBP posting only appear here. Optional filters: `platform`, `is_active`
   ("true"/"false" as strings), `connection_status`. Skipping this call is how an audit reports
   "nothing social is connected" on an account with four live social accounts.
3. **`marketing_setup_status`** - only when email work is implied (the user asked about email, or the
   `email` / `cold_email` groups matter to the scope). It returns `ready_to_send` plus `blockers[]`,
   each with its fix: marketing enabled, not paused, SES tenant provisioned, a verified sending
   domain, and the CAN-SPAM mailing address. These block a send SILENTLY, so a campaign can look
   perfect and never be able to leave.

Two more, only when the scope calls for them: `outbound_health_status` for the cold-email lane
(readiness score, blockers, per-mailbox health) and `voice_diagnose_setup` for telephony
(`tenant_provisioned`, DIDs missing E911, `blocking_issues[]`).

**Read two caveats into every number you report from `connections_status`:**
- Its rows are NOT filtered by `is_active`. A soft-deleted connection still appears in the list. Read
  `is_active` per row; do not count rows.
- All five of its queries are individually wrapped so a failure returns an empty array. An empty
  group therefore means "nothing connected OR that read failed", not "nothing connected". Before you
  report a whole department as absent, confirm with its own list tool: `seo_connections_list`,
  `ppc_connection_list`, `crm_list_email_connections`.

## 2. Report grouped by department

For every department in scope give exactly one of three verdicts per provider, and never a bare
status word without the consequence:

- **Connected and healthy** - `is_active` true, `connection_status` connected, and `last_synced_at`
  recent. Call out anything stale by more than about 25 hours; a stale connection makes every number
  downstream of it a lie, which is the same threshold `ppc_digest` warns on.
- **Connected but erroring** - the row exists but `connection_status` is not connected, or
  `is_active` is false, or the sync is dead. Quote the row's own error text verbatim rather than
  paraphrasing it, and say which surface is affected.
- **Absent** - no row at all. Say which capability that removes, not just that a row is missing.

The first two verdicts read `connection_status` and `last_synced_at`, so they apply literally only to
the `seo`, `ppc` and `email` groups. Substitute for the other two rather than reporting a field as
missing: for `cold_email` read `sync_status` where the rule says `connection_status`; for `llm` there
is no status field and no sync timestamp, so healthy means `is_active` true, and judge staleness from
`last_used_at` if at all - a BYOK key that has simply not been used recently is not broken, so do not
apply the 25-hour threshold to it.

Then, per department, name the gaps. Nothing about a healthy connection needs a paragraph.

## 3. Every gap gets a concrete next step

Never end on "this is not connected". Each gap resolves to a named tool, or to the honest statement
that it is dashboard-only or Google-Cloud-Console-only.

| Gap | The actual next step |
|---|---|
| Google Ads, Search Console, GBP, Analytics | `integration_oauth_initiate({ provider_slug })`. Returns `setup_url`, `setup_token`, `oauth_app_id`, and for ads/gsc/gbp a `connection_id`. Hand the user the `setup_url`; poll `integration_oauth_check({ setup_token })` at ~5s until `completed` (it expires, so re-initiate rather than polling forever). |
| Gmail / Outlook / Calendar / Meet | `email_connect_start`. NOT `integration_oauth_initiate` - it refuses those slugs with `wrong_tool_for_provider` because Gmail, Calendar and Meet share one consent flow that writes `email_connections`, the table the CRM inbox, calendar and triage tools read. Returns a `setup_url` valid for 5 minutes. Default `scope_label` is `modify_with_calendar`. |
| Dead Google refresh token (re-auth) | `integration_oauth_initiate({ provider_slug, target_connection_id })` pointing at the existing row. Credentials are replaced in place and the bindings on the row survive. `target_connection_id` only applies to google_ads, google_search_console and google_business_profile. |
| Bing Webmaster | `seo_connection_create({ platform: 'bing_webmaster', site_url, api_key })`. No OAuth at all; the key comes from bing.com/webmasters, Settings, API access. |
| GSC or GBP by BYOK refresh token | `seo_connection_create` with `client_id` + `client_secret` + `refresh_token`. GSC needs the FULL `auth/webmasters` scope, not `.readonly`, or sitemap submit and delete return 403. |
| Ads platform by BYOK credentials | `ppc_connection_create({ platform, ... })`. Per-platform requirements differ: google_ads needs developer_token + client_id + client_secret + refresh_token + customer_id; microsoft_ads needs client_id + client_secret + refresh_token + customer_id (plus manager_id for campaign calls); meta_ads, tiktok_ads and linkedin_ads need access_token + ad_account_id. A 400 carries the per-platform setup guide - relay it. |
| Connection exists but is unbound | GSC: `seo_gsc_discover_sites` then `seo_connection_update({ site_url })`. GBP: `seo_gbp_discover_locations` then `seo_connection_update({ gbp_account_id, gbp_location_id })`. Google Ads: `ppc_ads_discover_customers` then `ppc_connection_update`. Status auto-promotes from pending to connected once the final identifier lands, so an unbound row is a two-minute fix, not a reconnect. |
| No OAuth client for the product | `oauth_app_create({ provider, name, client_id, client_secret, products })`, or `oauth_app_update({ oauth_app_id, add_products: [...] })` to extend an existing app. Obtaining the client_id and client_secret is Google Cloud Console work the user must do - see step 4. |
| Shopify | `shopify_connect_start({ oauth_app_id, shop_domain, intent_type })`, then poll `shopify_connection_status` until a row appears with `disconnected_at` null. Needs a Shopify OAuth app first. |
| Social accounts | Dashboard only. There is no MCP tool that starts a social connect flow. Send the user to `/<accountId>/dashboard/marketing/social/accounts`. |
| Meta Ads / Amazon Ads quick-connect | Dashboard, at `/<accountId>/dashboard/marketing/ppc`, unless you are going the BYOK route above. |
| Email sending blocked | Whatever `marketing_setup_status` named in `blockers[]`. Relay each blocker with its fix; do not summarize them into "email is not set up". |

To confirm a connection actually works rather than merely exists, use `integration_test` (for OAuth
providers it runs a real token refresh, so success proves the refresh_token is still live) or
`ppc_connection_test` for a Google Ads row specifically. A row reading connected has only ever proven
that a row exists.

## 4. The worked example: Google Tag Manager

Use this shape whenever a capability rides another product's connection. GTM is the case that burned
a real session, and it is three independent conditions that each fail differently.

GTM rides the **google_analytics** connection. One Google authorization covers both. So:

1. **A google_analytics connection row must exist.** An account can have perfectly healthy
   google_search_console and google_business_profile connections and still have no google_analytics
   row, because they are separate rows in the same table. `seo_gtm_status` then hard-404s. Find out
   with `seo_connections_list` and look for `platform: 'google_analytics'` - that tool takes no
   filters, so filter the returned list yourself.
2. **The token must carry the four Tag Manager scopes**: `tagmanager.readonly`,
   `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, and `tagmanager.publish`.
   Consenting to Analytics alone is not enough. `edit.containers` by itself can only edit drafts, so
   a connection missing the last two can build a tag and never publish it - and an unpublished
   conversion tag records nothing however complete it looks in GTM. The two publish scopes were only
   added to the consent screen in late August 2026 (the scope constant records 2026-08-22, the GTM
   route 2026-08-23), so any token minted before then fails with a 403 naming insufficient scopes and
   needs a reconnect, not a retry. Retrying will not help.
3. **The OAuth client must be registered for the `google_analytics` product.** A shared client
   registered only for google_search_console and google_ads cannot serve it, and
   `integration_oauth_initiate` returns 412 `integration_not_configured`. Check with `oauth_app_list`
   and read each app's `products`. Fix with `oauth_app_update({ oauth_app_id, add_products:
   ['google_analytics'] })` - use `add_products`, which merges, not `products`, which REPLACES the
   whole array and would silently drop the products already on that app.

Each failure looks different, so diagnose in that order: no row, then scopes, then product
registration.

**The trap that outranks all three.** `integration_oauth_initiate({ provider_slug:
'google_analytics' })` writes `account_integrations` only. The OAuth callback mirrors CLI-initiated
connections into the domain tables for google_search_console, google_business_profile and
google_ads - but there is no google_analytics mirror. `seo_gtm_status` reads `seo_connections`.
So that flow completes successfully, shows up in `integration_list`, and remains invisible to
`seo_connections_list` and to every GA4 and GTM tool. `seo_connection_create` cannot fill the gap
either; its platform enum is bing_webmaster, google_search_console and google_business_profile only.

The one path that creates the row GTM needs is the dashboard Analytics connect card at
`/<accountId>/dashboard/marketing/seo`. Say that plainly instead of sending the user round the CLI
loop a second time. Note that `seo_gtm_status`'s own error text recommends
`integration_oauth_initiate`; it is describing the consent, not the row, and following it alone will
not produce a working GTM connection.

Two further GTM facts worth stating up front, because both are silent: the container is PINNED to the
connection on first successful use and a later call naming a different container is refused with a
403, which is what stops one account editing another's container (clear it deliberately with
`seo_connection_update({ gtm_container_path: null })`; it cannot be set). And a container that has
NEVER been published loses every Ads conversion while looking fully configured - `seo_gtm_status`
with a `container_path` returns that warning plus the draft-versus-live tag split.

## 5. Offer the flow, do not start it

Consent opens a browser and belongs to the user, so:

- **Read freely.** `connections_status`, the list tools, `oauth_app_list`, `integration_test`,
  `marketing_setup_status`, `ppc_digest`, `voice_diagnose_setup` are all safe to call unprompted.
- **Never call `integration_oauth_initiate`, `email_connect_start`, or `shopify_connect_start`
  unprompted.** Each mints a short-lived setup URL that expires unused (5 minutes for
  `email_connect_start`), so an unrequested one is a dead link by the time the user reads it. Finish
  the audit with a short list of the flows you can start, and start one only when they pick it.
- Never call `oauth_app_create`, `oauth_app_update`, `ppc_connection_create`, `seo_connection_create`
  or any `*_delete` without an explicit yes. They write credentials.
- Never print a key, secret, token, or the full `credentials_preview`. Say a credential is present or
  absent and move on.
- When you do start a flow, hand the `setup_url` to the user rather than opening it - they need to be
  in their own browser session for the provider's consent screen.

Some of this is not yours to fix and saying so is the useful answer. Registering a Google Cloud
project, enabling the Tag Manager or Search Console API on it, adding scopes to the OAuth consent
screen, and adding `https://app.hiveku.com/api/oauth/google/callback` as an authorized redirect URI
all require Google Cloud Console access. List those as user steps, in order, and do not imply a tool
can do them.

## 6. Traps that produce a wrong audit

- **Naming asymmetry.** It is `seo_connections_list` (plural) but `ppc_connection_list` (singular).
  Guessing the other spelling fails, and a failed list read reads exactly like an empty account.
- **PPC slug asymmetry.** `ppc_connection_list`'s `platform` filter takes the short forms
  (google, meta, linkedin, microsoft, tiktok) while `ppc_connection_create`'s `platform` takes the
  long forms (google_ads, meta_ads, microsoft_ads, tiktok_ads, linkedin_ads, chatgpt_ads, vibe_ctv,
  amazon_ads). Passing a create-style slug to the filter returns nothing.
- **Two different email tools.** `crm_list_email_connections` lists connected Gmail and Outlook
  INBOXES. `email_connections_list` lists email-MARKETING platforms (SES, Resend, SendGrid) and takes
  no arguments at all. `email_connect_start`'s own description points at the second one for
  confirming a Gmail connect; that is wrong. Confirm a Gmail or Outlook connect with
  `crm_list_email_connections` or the `email` group of `connections_status`.
- **The oauth_app tool schemas understate the server.** The `provider` enum on `oauth_app_list` and
  `oauth_app_create` lists google, microsoft and meta; the server also accepts shopify, linkedin, x
  and tiktok. For those four, call `oauth_app_list` with NO `provider` filter and read the rows, and
  expect a create through MCP to be refused by the schema before it reaches the server.
  `oauth_app_update` has no `provider` parameter at all, by design: provider cannot be changed on an
  existing app, so a wrong one is a delete plus a create, never an update. Likewise,
  `oauth_app_create`'s description lists seven products but the server accepts thirteen, adding
  `google_calendar_meet`, `shopify_storefront`, `social_meta`, `social_linkedin`, `social_x` and
  `social_tiktok`. GBP social posting has no product of its own - it reuses
  `google_business_profile`.
- **A masked credential preview is not a health check.** `integration_list` returns
  `credentials_preview` for confirmation only. Presence of a credential says nothing about whether it
  still refreshes; `integration_test` is what answers that.
- **`integration_create` is API-key providers only** (bing_webmaster, dataforseo). OAuth providers
  return 422 with a dashboard URL. Check `auth_type` and `can_create_from_cli` with
  `integration_providers_list` before offering a create.
- **`connection_status: 'pending'` is usually a missing binding, not a broken login.** Check for an
  unbound `site_url` / `gbp_*` / `customer_id` before recommending a reconnect.

## 7. Close the loop

State the verdict per department, the gaps in priority order, and the single next step for each.
If the audit found work worth tracking, create one `pm_tasks_create({ project_id, title })` per gap
after confirming the list with the user, with the concrete fix in the description. Persist anything
durable (which OAuth client serves which product, which connections are BYOK, which provider is
dashboard-only on this account) to department memory so the next session does not re-derive it: read
the current document with `memory_list({ domain: "<dept>" })`, append to the `content` it returns,
and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it.
Use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists.
