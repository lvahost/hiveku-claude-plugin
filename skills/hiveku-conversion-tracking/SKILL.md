---
name: hiveku-conversion-tracking
description: Operator manual for conversion tracking and attribution on a Hiveku account. Use for ANY report that conversions, leads, or attribution are wrong or missing - "conversion tracking is broken", "not recording conversions", "Google Ads shows zero", "the numbers don't match", "our leads aren't showing in Google Ads", "Awaiting conversions", form submissions missing or duplicated, spam leads, form tracking, call tracking, DNI, call attribution, GTM tags and containers, UET and Bing goals, Meta pixel and CAPI, offline conversions and deal-won uploads, gclid / msclkid / fbclid, consent mode, tag not firing, double counting, "why does this paid lead read as Organic".
---

# Hiveku Conversion Tracking

Real ad money rides on these verdicts: diagnose in order, quote the tool that proved it,
never conclude from an absent number.

## The chain, click to platform

A visitor arrives with a click id (`gclid`, `gbraid`, `wbraid`, `msclkid`, `fbclid`,
`ttclid`, `twclid`, `li_fat_id`) plus any `utm_*`. The `hiveku-analytics.js` embed (R2, via
`track.hiveku.com`) captures them unconditionally into localStorage `hiveku_utm_params` for
90 days, mints `hiveku_visitor_id` and a 30-minute session, and records the landing page.
Events POST to `track.hiveku.com/v1/visitor-tracking/ga4-event` (**204** = accepted; a
non-2xx is a rejection, never "processed"), queue, then fan out to ClickHouse and the
builder's `visitor-upsert` / `form-lead` endpoints. A form submission writes its
ledger row FIRST, then upserts the CRM contact, stamping click ids in four places: `gclid` /
`click_ids` (current touch), `original_gclid` / `original_click_ids` (write-once first
touch), and `source_history[]`, the only one that knows WHEN a click happened. The DNI
snippet adopts the same visitor id, so calls share that identity. A won deal or qualifying
call then uploads back to the platform as an offline conversion, which needs that click
dated from `source_history`. Every link fails silently, into a smaller plausible number.

## THE TRIAGE LADDER

Run this order for ANY "tracking is broken" report; do not skip to the interesting step.

**0.** `account_context_get({ domain })` before any strategy or client-facing writeup.

**1. Are the numbers trustworthy?** `ppc_digest` first, always: it flags stale connections
across platforms (over 25h since sync), and a stale connection makes every number below it
a lie. Fix the connection before diagnosing anything else.

**2. One scorecard call.** `analytics_channel_scorecard({ days })`. Slow: call it ONCE,
never in a loop or per channel. Per channel read `verdict`
(`tracking | partially_tracking | not_tracking | unknown`), `headline` (relay VERBATIM, it
carries the number that makes the problem undeniable), `hiveku_recorded` vs
`platform_recorded`, `missing`, `how_we_know`, `how_to_fix`, `how_deeply_we_can_see` and
`conversion_actions[]`, whose window is FIXED at 30 days and does NOT follow `days`.

**3. Branch on the verdict.**

| Symptom | Do | Reference |
|---|---|---|
| `not_tracking`, or a tag "definitely installed" | `analytics_diagnose_tracking({ project_id })`, then `analytics_probe_page` on the money URL | diagnosis, site-instr. |
| Google numbers wrong, actions look dead | `ppc_conversion_tracking_status` (judge silence on `all_conversions`, never `conversions`), then `ppc_conversion_actions_list`. Both GOOGLE ONLY: elsewhere they error, they do not return empty | diagnosis |
| Bing reports zero | `ppc_bing_conversion_tracking_status`, then `ppc_bing_uet_tag_list` | diagnosis |
| Meta looks quiet | `ppc_meta_custom_conversions` + `ppc_meta_conversion_volume` | diagnosis |
| Forms missing, duplicated, or spammy; leads the platform never got | `marketing_form_conversion_audit` | forms |
| Calls unattributed, or "stopped after a redeploy" | `marketing_call_attribution_breakdown`, then `marketing_call_attribution_list`, `voice_diagnose_setup` | calls |
| Real leads the platform cannot optimise on | the two-step offline upload lane | offline-conversions |
| GTM or a pasted tag involved | `seo_gtm_install_status` / `seo_gtm_status`, `project_custom_code_get` | site-instrumentation |

**4. Name the broken link out loud** ("the click id never reached the CRM", "the tag is in
the code but not in the served HTML"). A verdict without a named link is a guess. Then
write, per the discipline below, recording durable conclusions with `memory_create` and
work items with `pm_tasks_create`.

## The traps that make a diagnosis WRONG

1. **Null is not zero, and silence can mean the check never ran.**
   `conversions_last_30_days: null` in `analytics_channel_scorecard` means WE COULD NOT
   READ IT; `depth: 'none'` is not healthy; an empty `ppc_meta_custom_conversions` list
   means none are defined, since a failed read returns `readability` / `coverage_gap`
   instead. With no probe `analytics_diagnose_tracking` emits NO runtime findings at all, so
   read `caveats` and `browser_checked`; it and the scorecard both need a custom domain
   (without one: 400, nothing checked). Reading any of it as zero declares a client's
   campaigns dead when the fault is a broken connection.

2. **`click_dated: 0` means NOT MEASURABLE.** In `marketing_form_conversion_audit`, if
   `click_window.click_dated` is 0 then `clicks_before_range: 0` proves nothing. Only
   `first_touch_from === 'captured_at'` DATES a click; the others merely BOUND it (the click
   happened at or before `first_touch_at`). A wrong timestamp is worse than none.

3. **Saved is not live, committing is not deploying.** Custom-code edits save instantly and
   apply only on the NEXT DEPLOY of that tier; GTM edits are workspace DRAFTS until
   `seo_gtm_version_create` then `seo_gtm_publish`; `seo_gtm_install_status` reports SAVED
   state, blind to a container hardcoded in the site's source. `tag-not-deployed` from
   `analytics_diagnose_tracking` ("in the code but not in the served HTML") is THE most
   common reason a tag that is definitely installed records nothing.

4. **Most embeds in the field are STALE.** Ingest worker, queue consumer and embed are three
   separate deploy artifacts and sites hard-cache the embed, so never explain a gap with
   "the embed does X now". Server-side paths exist to reconstruct what an old embed did not
   send, recovering attribution as `utm_params -> landing_page -> page_path`.

5. **First touch wins PERMANENTLY.** Once `hiveku_utm_params` is non-empty the embed returns
   it and never rewrites it: a LATER ad click is not added, does not move `capturedAt`, and
   survives only in the landing URL. Hence most "wrong attribution" reports, and its twin: a
   real Google Ads click reads as Organic whenever localStorage was unavailable (private
   mode, ITP, consent gate, stale embed) while the gclid sat in the landing URL.

6. **Spam still writes a row.** Spam is filed, not discarded, so a third-party beacon
   inflates the Forms tab (Meta's pixel posting `website_context.location` minted about 89 a
   day). And the reCAPTCHA hostname list is the ONLY domain gate: a token minted on a host
   missing from the project's registered hostnames scores 0 and that lead is SILENTLY filed
   to spam. Check hostnames before believing "leads stopped coming in".

## Write discipline

- CONFIRM every write. Nothing client-visible (a published GTM version, a deploy, an
  upload) without an explicit yes, and never bulk-apply. `project_custom_code_set_tier`
  REPLACES a whole tier, DELETING pages omitted from `pages`: read
  `project_custom_code_get` first and echo back what survives.
- `ppc_offline_conversion_upload` (Google Ads only) and `ppc_customer_match_upload` are
  TWO-STEP by design: the first call returns a dry-run preview with
  `requires_confirm: true` and uploads NOTHING; you repeat the IDENTICAL call with
  `confirm: true`. Show the preview and its refusal reasons first; never shortcut this lane.
- NO MCP TOOL exists for the structured call-conversion doctor (google_connection,
  conversion_action, tenant_opt_in, number_tracking, attribution_health, outbox_drain,
  reconciliation): dashboard UI only, visible here just through
  `analytics_channel_scorecard`'s call reconciliation causes. Send the operator there,
  likewise for the Google Ads "Import" conversion source setting.

## Reference map

| File | Load when |
|---|---|
| `references/the-chain.md` | Storage keys, ingest payloads, click-id fields, `first_touch_at`. |
| `references/diagnosis.md` | Any live investigation: finding codes, per-platform status tools. |
| `references/forms.md` | Missing, duplicate, or spam leads: `form_key`, sources, reCAPTCHA. |
| `references/calls.md` | Call tracking and DNI: pools, matchers, swap health, transcripts. |
| `references/offline-conversions.md` | Uploading deals and calls: gates, dating, consent, refusals. |
| `references/site-instrumentation.md` | Getting tags onto the page: code tiers, consent, GTM CRUD. |
