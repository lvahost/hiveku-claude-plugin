---
description: Hand the user one clickable Hiveku link that connects or re-authenticates any provider (Google Analytics, Search Console, Business Profile, Google Ads, Gmail, Calendar, Outlook, Microsoft Ads, Meta, LinkedIn, TikTok, X, Shopify) for the bound account, then confirm it landed.
argument-hint: "<connector> [reconnect] - e.g. 'ga4', 'gsc reconnect', 'google ads', 'gmail for jane@example.com', 'outlook', 'bing ads', 'facebook'"
---
Connect or re-authenticate an integration on the account this directory is bound to: $ARGUMENTS

The whole job is: one link, handed over properly, then one status check. Nobody should have to open
the Hiveku dashboard, register a Google Cloud project, or paste a 2 KB Google URL out of a chat.

Confirm the account with `get_account_info` first so the link is minted for the right tenant.

## 1. Find out what exists - one call

`integration_connectors_list` (no arguments). For every connector it returns `ready` (a link can be
minted now), the OAuth client it would use (`client.would_use`: the account's own app, or Hiveku's
platform app), the existing `connections[]` with their ids and statuses, and, when nothing can front
the consent, `client.how_to_get_ready` with the exact prerequisite.

Map the user's words to a connector slug (`ga4` / `analytics` -> `google_analytics`, `gsc` ->
`google_search_console`, `gbp` -> `google_business_profile`, `google ads` -> `google_ads`,
`bing` -> `microsoft_ads`, `facebook` / `instagram` -> `meta_social`, `facebook ads` -> `meta_ads`,
`twitter` -> `x`). The server accepts these aliases too, so do not guess a different vocabulary.

Decide the mode from the catalog, not from the request wording:
- A connection for that connector already exists and is `error`, `pending` with a dead token, or the
  user says the data stopped, the token died, or a scope is missing (the GA4 key-event case: "token
  lacks analytics.edit") -> **reconnect** with `target_connection_id` = that row's id. Credentials
  are replaced in place under the client that minted the row; bindings (property, site, customer id,
  location) are kept.
- No connection, or the user wants an additional one -> **create**.
- `ready` is false and `linkable` is true -> the account has no OAuth client for it and Hiveku has
  no platform app on this environment. Read `client.how_to_get_ready` aloud and stop; do not invent a
  workaround. Gmail and Outlook are always bring-your-own-client.
- `linkable` is false -> that provider is dashboard-only for now. Give the account-scoped path
  `https://app.hiveku.com/<accountId>/dashboard/<dashboard_path>` and stop.

## 2. Ask only for what the link needs

- `gmail`, `outlook`, `google_calendar`: whose inbox or calendar it is (`owner_user_email`). On a
  one-user account the server picks them; otherwise it answers 400 `owner_required` with the
  candidates - ask, do not guess.
- `google_ads` create with the account's OWN Google app: `developer_token` and `customer_id` up
  front (the server refuses without them). On Hiveku's app neither is needed; the customer is picked
  after consent.
- `shopify`: the `*.myshopify.com` domain.
- Everything else needs nothing. Bindings such as the Analytics property or the Search Console site
  are chosen after consent; the status tells you which ones are still missing.

## 3. Mint the link - once, when the user says go

`integration_connect_link_create({ connector, target_connection_id?, source: 'plugin', ...fields })`.
It returns `url`, `link_id`, `expires_at` (24 hours by default) and a `handoff` block. The URL is
shown once - the server keeps only a hash - so deliver it in the same message.

Do not mint links the user did not ask for. Offer, and mint when they pick it.

## 4. Hand it over so it actually gets clicked

Put the link at the END of the message, on its own line, and say five things (the `handoff` block
has all of them):

1. The URL itself, unmangled.
2. What they will see: a Hiveku page that explains the connection with a Continue button, then the
   provider's sign-in and consent screen.
3. Which account to pick on the provider's chooser (`handoff.pick_hint`), and what the scary-sounding
   permission is for (`handoff.permissions`).
4. That the link is valid until `expires_at`, and that the provider's own consent window is five
   minutes once they press Continue - so they should click when they are ready, not later.
5. What you will do next: "Tell me when you are through and I will confirm the connection and finish
   the setup."

The link can be forwarded: if the person who owns the Google or Microsoft account is not in this
chat (a client, a colleague), the user sends them the URL and they complete it on their own. Say so
when it is relevant. Never open the link yourself.

## 5. Confirm it landed

When they say they are through: `integration_connect_link_status({ link_id, wait_seconds: 8 })`.

- `completed`: `connection_id` is the domain row (`table` says which). If `needs_binding` is
  non-empty, finish it now: `seo_analytics_discover_properties` + `seo_connection_update` for
  `ga_property_id`, `seo_gsc_discover_sites` + `seo_connection_update` for `site_url`,
  `seo_gbp_discover_locations` + `seo_connection_update` for the location, `ppc_ads_discover_customers`
  + `ppc_connection_update` for `customer_id`. Then verify with the department's own check
  (`ppc_connection_test`, `seo_sync`, `crm_list_email_connections`, `social_list_accounts`) and run
  the first sync where one exists.
- `failed`: read `error` verbatim to the user. Consent denied or the wrong account picked can be
  retried from the SAME link; an error about the OAuth client means mint a fresh link after fixing
  the client.
- `opened` / `pending`: they have not finished. Ask, do not spin - poll again when they answer. The
  link stays valid until `expires_at`.
- `expired` / `revoked`: mint a new one.

Every admin on the account also gets an in-app notification (and email) when a link completes, so
"did anyone connect it yet" is answered by the bell too.

## Traps

- `integration_oauth_initiate` still exists and still works for the four Google products when the
  account has its own OAuth app; it hands out Google's raw consent URL. Prefer the connect link:
  it covers every provider, never dead-ends on a missing app when Hiveku's platform app can front
  the consent, lasts hours instead of minutes, and reports denial as `failed` instead of silence.
  When `integration_oauth_initiate` answers with `connect_link: true`, treat it exactly like a link
  from `integration_connect_link_create` (poll with `link_id`).
- Do not delete and recreate a connection to fix a token. Reconnect with `target_connection_id`.
- Never print secrets. The link itself is not a secret you must hide from the user, but it IS a
  credential-shaped URL: give it to the person who should click it and nobody else.
- Persist what you learned (which connector uses which client, which connections are the account's
  own app vs Hiveku's) to department memory: `memory_list({ domain })`, append, `memory_update`.
