# Outcomes and Measurement - GA4, GTM, and Data-Source Connections

## What this covers / when to load this

The layer that proves SEO traffic DID something: GA4 conversion definitions (key events),
the URL rules that feed them, the GTM container that carries tags, and the data-source
connections everything runs on. Load it when standing up a client's conversion measurement
in Month 1, when writing the monthly report's Outcomes section, when GA4 tools 403, or when
a connection needs creating or removing. Every GA4/GTM tool here runs on the
google_analytics connection from `seo_connections_list`. Deep tag work (conversion tags,
values, triggers) is the `hiveku-conversion-tracking` skill's discipline - this file covers
what the SEO operator needs to verify measurement and stand up a basic conversion, not to
run a tagging program.

## Connections (create, verify, remove)

`seo_connection_create` is BYOK, per platform:
- bing_webmaster is the simplest: `{ platform: 'bing_webmaster', site_url, api_key }` (the
  key from bing.com/webmasters -> Settings -> API access; no OAuth). For a site not yet in
  Bing, the user can one-click "Import from Google Search Console" at bing.com/webmasters.
- google_search_console: `{ platform, site_url, client_id, client_secret, refresh_token }`
  with scope `https://www.googleapis.com/auth/webmasters` - the FULL scope, not `.readonly`,
  or sitemap submit/delete will 403.
- google_business_profile: `{ platform, client_id, client_secret, refresh_token }`, then set
  gbp_account_id / gbp_location_id via `seo_connection_update`.

After create, verify with `seo_sync`. `seo_connection_delete` soft-deletes (sets
`is_active=false`, keeps the row for audit history) - use it to clean up a phantom or stuck
pending row from a failed OAuth, and expect downstream tools that filter on is_active to
stop finding it. The department SETUP.md, when present, is at `hiveku-data/seo/SETUP.md`
(written by `/hiveku:pull` only where an integration needs connecting - absent is normal).

## GA4: verify before you claim, create before you report

- `seo_ga4_conversion_audit({ connection_id, days })` - START HERE. Which key events
  (conversions) exist, which URL rules feed them, and which recorded NOTHING in the window.
  A key event with zero events is a Google Ads conversion action (origin GOOGLE_ANALYTICS)
  reporting zero with no error shown anywhere - this is where an "Ads conversion stopped
  recording" investigation starts.
- `seo_ga4_key_events_list` - key events with countingMethod and defaultValue, the two
  settings that make an imported Google Ads conversion wrong.
- `seo_ga4_data_streams_list` - the property's streams (name, type, defaultUri,
  measurementId). Event create rules hang off a STREAM, not the property, so this lookup
  precedes every rule action.
- `seo_ga4_event_create_rules_list` - the URL-driven rules that turn a thank-you-page URL
  into a distinct event. v1alpha resource: it can change without notice.
- `seo_ga4_admin_scopes` - does the token carry analytics.edit? Read-only preflight: call
  it before a write wave to learn the customer must reconnect, instead of discovering it
  from a 403 halfway through. (This is the GA4 parallel of the GSC 412 triage in
  `rankings-and-search-console.md` section 6.)

### Standing up a conversion from a URL (the Month-1 gap on most new clients)

GA4 cannot mark "a page_view whose URL contains /thank-you" as a conversion - only a whole
event name - so the chain is:
1. `seo_ga4_event_create_rule_create` - creates a distinct event from the URL. It defaults
   to CONTAINS matching because the URL lives in page_location, the FULL url including host
   and any ?utm_ query string, so EQUALS never matches a bare path; and it pins the source
   event automatically (a rule with no event_name condition would fire on nearly every
   event GA4 collects).
2. `seo_ga4_key_event_create` - marks the event as a key event. GA4 ACCEPTS A KEY EVENT FOR
   AN EVENT NAME IT HAS NEVER RECEIVED and then records nothing forever with no error -
   confirm the event actually arrives with `seo_ga4_conversion_audit`. counting_method:
   ONCE_PER_SESSION for lead forms (a reloaded thank-you page counts once), ONCE_PER_EVENT
   for purchases. default_value and default_currency must be sent together.
3. Google Ads imports it. GA4 never backfills - a new rule starts at zero.

### The GA4 writes that bite

- `seo_ga4_key_event_update` changes counting method / default value. eventName is
  IMMUTABLE - renaming means create + delete, two confirmed writes, not a shortcut. Both
  changes propagate AUTOMATICALLY into Google Ads conversions imported from the event,
  shifting reported volume or value without anyone touching Ads. Two-step confirm, because
  unlike GTM a GA4 change is LIVE ON RETURN.
- `seo_ga4_key_event_delete` is DESTRUCTIVE AND IRREVERSIBLE: any imported Ads conversion
  flatlines immediately and silently, and if it sits in a bidding goal Smart Bidding loses
  the signal. Two-step confirm (strict boolean; the string 'true' only previews). Same for
  `seo_ga4_event_create_rule_delete` - GA4 stops creating the destination event entirely.
  Named targets only, never derived by pattern.

## GTM: status, install truth, and the draft-until-published model

- `seo_gtm_status({ connection_id })` - without container_path lists the containers the
  connection's Google user can see; with it, the publish preview: pending workspace changes,
  the draft-vs-live tag split (draft_only tags are NOT serving), triggers and variables
  with ids, and a loud warning when the container has NEVER been published. Read it before
  any tag work. Container pinning: the first container used successfully is claimed onto
  the connection, and a later call naming a different container is refused with a 403 -
  that pin is what stops one account editing another tenant's container; clear it only
  deliberately via `seo_connection_update({ gtm_container_path: null })`.
- `seo_gtm_install_status` - is the container actually ON the site, per tier, head and body
  separately. ALWAYS check before and after tag or publish work: a published container that
  is not installed fires on nobody while every tag call still reports success. The findings
  that cost money: wrong container, duplicate install, half install.
- `seo_gtm_install` - writes the snippet (head script + body noscript; GTM needs BOTH) into
  one tier's site-wide custom code. Strict two-step confirm; never duplicates, does repair.
- Tag/trigger/variable writes (`seo_gtm_tag_create/_update/_delete`, trigger and variable
  equivalents) are WORKSPACE DRAFTS serving nothing until `seo_gtm_version_create` (which
  CONSUMES the workspace) then `seo_gtm_publish` - publish changes the client's live site
  and is two-step confirmed. Updates are a replace-not-patch that the tool merges for you;
  an empty string clears a field. The `_revert` tools are the rollback rail: they restore a
  workspace entity to the live published version (a tag ADDED in the workspace has nothing
  to restore to, so reverting it deletes it - the tool resolves that before writing).

## The monthly report's Outcomes section

From `seo_ga4_conversion_audit`: key events fired in the window, each tied to the organic
traffic story where the data supports it; zero-recording key events flagged as the
measurement gaps they are (a gap is a finding, not an embarrassment to hide). No
google_analytics connection = the section reads "not measurable yet" with the setup task
attached - never a silent omission, and never a number inferred from traffic. Honesty
vocabulary applies: unknown and not_applicable are valid outputs and never become passes;
a failed GA4 read makes the section partial, not zero.
