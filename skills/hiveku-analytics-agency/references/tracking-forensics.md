# Tracking diagnosis and forensics (Play 5 depth)

Load this when a metric moved in a way the business cannot explain, when any conversion count
looks wrong, or when a scorecard/diagnose verdict came back non-green.

Measurement-artifact-first triage, always: before ANY causal narrative (algorithm update,
campaign fatigue, seasonality, "the market slowed"), rule out a measurement artifact. The data
being fine does not make the interpretation fine - a confident story built on a tracking change
is worse than no story. Decide "measurement changed" vs "reality changed" first; everything
below exists to make that call.

## The channel scorecard

When the question is "why isn't Google Ads / Meta / Microsoft recording conversions?", start
with ONE `analytics_channel_scorecard({ project_id, days })` call. What it actually does: it
loads the customer's live converting pages in a real browser TWICE (once as a first-time
visitor, once as one who already accepted cookies), records what each ad channel sends, and
compares that against what the platform says it received. It returns one verdict per ad channel
- `tracking | partially_tracking | not_tracking | unknown` - each with `headline`,
`hiveku_recorded` vs `platform_recorded` conversion counts, `how_we_know`, `how_to_fix` and
`agent_task`. Relay `headline` VERBATIM: it carries the number that makes the problem
undeniable ("24 leads arrived from Google Ads clicks and Google Ads recorded 0"). It is the
only tool that can tell "the tag is installed" from "the tag is firing".
Constraints, all of them real: `days` is 1-90 (default 30); it loads real pages so it takes
minutes (290s timeout); **call it ONCE, never in a loop and never per channel**. It is not a
traffic report and returns no sessions, share, or engagement. Run it monthly or on suspicion,
not in the weekly check.

Verdict honesty: `unknown` is a valid verdict and is NEVER converted into a pass. Report it as
unknown with what blocked the check. A channel with no ad connection is `not_applicable`, not
`tracking`. A scorecard that errored is a PARTIAL audit - name the channels it did cover and
the ones it did not; never average a failed channel in as zero.

## Project-level diagnosis and page-level localization

- `analytics_diagnose_tracking({ project_id })` - scans the project source AND loads the
  deployed pages, returning findings with `what_is_wrong` / `how_we_know` / `how_to_fix` /
  `agent_task` plus a `coding_agent_brief` written to hand straight to the coding agent. Use it
  on any channel the scorecard called `not_tracking`. This separates "traffic changed" from
  "measurement changed", the single most important distinction in this discipline.
- Then localize with `analytics_probe_page({ url })` on the pages that dropped - it returns
  `as_first_time_visitor` and `as_visitor_who_accepted`; compare their `observed` arrays. A tag
  present only in the accepted pass is a consent-gating finding, not a missing tag.

## Corroborate against connected sources

`seo_connections_list` confirms which sources are connected (GSC, GA4 as platform
`google_analytics`, Bing, GBP) - an expired connection zeroes that source without touching
first-party. Then actually read the independent source instead of only checking the plug:
- `seo_gsc_time_series` - daily clicks/impressions/CTR/position. Overlay the deploy or change
  date on the trend; accepts `filters[]` (e.g. `{dimension:'page', expression:'/blog/',
  operator:'contains'}`) to scope to one section. If first-party dropped but GSC organic is
  flat, the drop is measurement, not traffic - now provable in one call instead of asserted.
- `seo_gsc_search_analytics` - the full multi-dimension query (any combination of date | query |
  page | country | device | searchAppearance, up to 25000 rows, paginate with `start_row`) when
  the corroboration needs a specific cut.
- `seo_ga4_conversion_audit` - when the doubted number is a conversion that originates in GA4
  (see references/conversion-layer-matrix.md).
Remember the comparability gate: GSC dates rows in Pacific time and first-party buckets in UTC,
so a one-day edge disagreement between them is expected, not evidence. Compare shapes and
multi-day windows, not single days.

## Common causes to check, in order of likelihood

1. A site deploy dropped the embed or tag container (probe a page changed in that deploy).
2. A consent/cookie banner change is blocking the tracker before consent (traffic looks like
   it fell off a cliff on a specific date - correlate with the banner change).
3. A connected source's OAuth expired (GA4/GSC) - `seo_connections_list` shows it.
4. A bot or self-referral surge inflated a channel (drill `analytics_traffic_sources`).
5. A UTM/tagging change collapsed a channel into direct.

## Escalation ladder for a red verdict

A red `analytics_diagnose_tracking` or a `not_tracking` scorecard channel is a data outage, and
the discipline's rule is that the client never discovers a data outage in the monthly report.
1. Same day: open the `pm_tasks_create` to the owning department (web for embed/deploy,
   conversion owner for tags, connection owner for OAuth) with the `coding_agent_brief` or
   scorecard `agent_task` attached, and tell the account owner in plain words what is not being
   measured as of when.
2. While broken: every number touching the affected surface is labeled PROVISIONAL in anything
   that goes out - especially paid-spend reporting, which is now flying blind on that channel.
   Do not pause the reporting cadence; ship it with the outage named.
3. After the fix deploys: re-run `analytics_diagnose_tracking` (and the scorecard once, if the
   red was a channel verdict) to confirm green, then record the outage window in the marketing
   memory so the affected weeks are never later misread as a real traffic dip.
4. Output of this play is never a fix - it is a diagnosis. Write the finding to memory
   (read-merge-update) and confirm the PM task before creating it.
