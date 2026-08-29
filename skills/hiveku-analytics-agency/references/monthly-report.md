# The monthly report - deliverable rail, assembly, benchmarks, comparability

Load this for the monthly report, for any client-facing report or dashboard request, and before
touching any `marketing_report_*` tool.

## The client-report rail (the deliverable is now a first-class object)

The platform ships a scheduled, branded, public-share client report; use the rail instead of
hand-assembling a document, and keep the decisions behind it in memory.
- `seo_automated_reports({ project_id? })` FIRST - lists the scheduled/automated reports that
  already exist. Check whether a client report is already configured and delivering before
  building a second one; duplicate cadences double-email the client.
- `marketing_report_create({ report_name, report_type })` - creates the report row.
  `report_type: 'marketing'` is the cross-channel client report (the usual choice; sections:
  overview, web, ppc, seo, listings, social, email, calls, rankings, search_terms, aeo, local,
  work_log - omit `include_sections` for all); `'social'` is social-only. `schedule` is
  weekly | monthly | none (default weekly; `none` = on-demand only) and `next_scheduled_at` is
  stamped so the scheduler cron actually delivers on cadence - creating a scheduled report is a
  standing commitment, so confirm cadence and recipients with the client first.
  `delivery_config.recipients` is who `marketing_report_send` emails. Marketing reports are
  PUBLIC BY DEFAULT (`is_public` defaults true - the share link is the point); pass
  `is_public: false` at create if the client has not approved a public link.
- `marketing_report_regenerate({ report_id, days })` - rebuilds the numbers NOW and stores them
  (`last_report_data`). The public page and the emailed summary render this stored blob
  VERBATIM, so regenerate is the only way numbers change - always regenerate before send or
  share, or the client opens stale numbers. `days` is 7 or 30 (monthly wants 30). It does NOT
  email anyone and does NOT advance the schedule. It can take a while - the marketing assembly
  includes live Google Ads pulls.
- `marketing_report_send({ report_id, recipients?, confirm? })` - REAL MAIL LANDS IN THE
  CLIENT'S INBOX, so it is confirm-gated: first call WITHOUT `confirm` returns a preview (title,
  exact recipient list, the public URL that will be mailed) - show that to the user and get a
  yes; re-call with `confirm: true` (strict boolean) to send. The preview-then-confirm pair is
  a human gate, not two halves of one autonomous step - never call the confirm leg without the
  user having seen the preview. Marketing reports require an existing public link to send.
  `recipients` (max 20) replaces the stored list.
- `marketing_report_share_link({ report_id })` - the public URL
  (`/public/marketing-report/[token]`), no login required. Read-only; returns `url: null` with a
  fix-it note when the report is not public.
- `marketing_report_pdf({ report_id })` - the marketing report as a PDF rendered from the SAME
  stored blob (base64 in `data_base64`; 409 if never generated - regenerate first; social
  reports 400 - share their link instead).
- `marketing_report_update({ report_id, ... })` - rename, cadence (re-stamps
  `next_scheduled_at`), section list, recipients, `is_active`, `is_public`. GOTCHA:
  `is_public: false` on a marketing report REVOKES the link outright (social keeps its token, so
  re-enabling restores the same URL; marketing does not). Revoking is a client-visible act:
  only on an explicit ask naming the specific report, never as a sweep.

## Assembly (what goes in and where the numbers come from)

1. Pull the month's numbers with `project_id` on every call that takes one, all with an explicit
   window and its prior-period comparison: `analytics_overview` (topline, devices, countries,
   landing pages), `analytics_sessions`, `analytics_pages`, `analytics_traffic_sources`
   (channels), `analytics_events_list`, then the conversion layer per
   references/conversion-layer-matrix.md - `ppc_conversion_tracking_status({ connection_id,
   days: 30 })` (`days` defaults to 7, so pass 30 for a month) and
   `ppc_conversion_actions_list({ connection_id })` for Google, the Bing/Meta pairs or the
   LinkedIn/TikTok list operations for those platforms, `seo_ga4_conversion_audit` for the GA4
   lane, `marketing_form_conversion_audit` for the form reconciliation and
   `marketing_call_attribution_breakdown` for calls - plus `analytics_visitors` for the
   account-wide ICP-matched list. Two marketing-side reads complete the reconciliation:
   `content_comments_recent` is the feedback-loop read - what the client actually said about
   shared drafts since the last report (`since` is a strict greater-than on created_at, so the
   last processed comment's own timestamp is the cursor; `source: 'share-link'` rows are the
   client), each row carrying its content_item so the work-log names the draft, not a UUID.
   And per email campaign, `email_campaign_metrics` - by_status delivery counts plus an
   `engagement` block on every campaign ({ delivered, opened, clicked, bounced, complained,
   open_rate, click_rate }; distinct recipients, rates against delivered, `null` until anything
   delivered - label that "not yet delivered", never 0), and on variant-carrying campaigns (an
   N-way `variants` test or the legacy ab_test_enabled pair) `by_variant` with per-variant sent /
   skipped / opened / clicked. Unsubscribe counts come from no tool - omit rather than estimate.
   If a platform has no readable source this month, state that
   as `not_applicable` (no connection) or `partial` (connected but the read failed) - never
   omit the section silently and never write a zero for a failed read.
   Run `analytics_diagnose_tracking({ project_id })` so the report can state the data is
   trustworthy (or name where it is not). Run `analytics_channel_scorecard({ project_id, days })`
   ONCE here if a paid channel's conversion counts are in question - it takes minutes and
   returns verdicts, not volumes.
2. Organic corroboration, MoM: `seo_gsc_period_comparison` compares two periods on the same
   site and returns winners/losers and rank climbers/droppers (position deltas are signed
   Google-style - lower is better, so rank climbers have NEGATIVE position_delta; read the sign
   before writing "improved"). `seo_gsc_top_pages` / `seo_gsc_search_queries` for the top-N
   cuts. Label all of it GSC.
3. Draft the narrative with `talk_to_department({ domain: 'analytics', message })`, feeding it
   every figure. Sections, in this order:
   - Executive summary - 5 bullets max: headline metric MoM, biggest win, biggest risk, the one
     thing that changed, what is next. Written last, placed first. Never hide a partial or
     provisional status here - if a section below is provisional, the summary says so.
   - Data health - one honest paragraph: is tracking sound this month, what gaps exist, what got
     fixed. Leading with this is what separates an agency from a dashboard screenshot.
   - Audience and traffic - overview + sessions, MoM and YoY (YoY keeps you honest about
     seasonality): device and geography from `analytics_overview`. There is no new-vs-returning
     figure available; omit it rather than estimating it. Add the account-wide ICP-matched
     visitor count from `analytics_visitors`, labeled account-wide.
   - Channels - `analytics_traffic_sources` MoM: which channel grew, which shrank, share shift,
     and the last-touch caveat stated plainly.
   - Content - top pages (`analytics_pages`) and top landing pages (`analytics_overview`),
     biggest movers.
   - Email - per-campaign delivery from `email_campaign_metrics` (sent vs the skipped_*
     buckets) and engagement from its `engagement` block (open_rate and click_rate against
     delivered, delivered as the N, judged by clicks); where a campaign carried variants,
     `by_variant` gives the split - name the winner by clicks, with each variant's N. A `null`
     engagement block means nothing delivered yet, not zero engagement - label it so rather than
     writing 0. Fold the month's client feedback (`content_comments_recent`) into
     the work-log narrative: what the client flagged, what changed because of it.
   - Conversions - status + actions + relevant events: conversions by action, rate vs prior
     period, measurement caveats, the form-audit reconciliation and the call-quality read. If a
     KPI is not yet measurable, say so and point to the task.
   - Work completed and next - from completed/open PM tasks: fixes shipped, plan for next, with
     owners and the measurement window each next action will be judged on.
4. Numbers must reconcile: every figure must be reproducible from a named tool call and labeled
   with its source (first-party vs GA4 vs GSC vs platform) and window. No blended, unlabeled
   numbers, no vibes, and no number from model memory - if no tool produced it, it does not go
   in the report. Then persist the report's key decisions and any newly discovered gaps into
   the `marketing` memory (read-merge-update) so next month is a comparison, not a
   re-derivation.
5. Synthesis test before shipping: does the report add prioritization by business impact and
   cross-source reconciliation, or does it restate tool output? A summary of the tools' own
   summaries is not a deliverable - rewrite until each section answers "so what should we do".
6. Deliver via the rail: regenerate (days: 30), then share link or confirm-gated send as the
   client prefers. The narrative document and the rail's rendered page are two artifacts of the
   same numbers - they must agree.

## The comparability gate (before any cross-source aggregate)

Reject aggregation until the sources share the same conversion event and value definition,
attribution window, timezone, and currency. Until then, report the values side by side with
their definitions - do not compute a total. The timezone row alone breaks most naive joins:
- First-party analytics and the form audit bucket days in UTC by default (the audit and call
  tools accept an IANA `timezone` - pass the ad account's).
- Ad platforms report in the AD ACCOUNT's timezone and date conversions by CLICK time.
- GSC dates rows in PACIFIC time.
- GA4 buckets in the PROPERTY's configured timezone.
A one-day misalignment at a window edge manufactures exactly the false drop Play 5 exists to
catch - compare full days vs full days in a NAMED timezone, and when two sources disagree on a
single day, check the timezone row before anything else.

## Benchmarks and decision rules

- Engagement benchmark (blended, for orientation not promises): a healthy content site is engaged
  on a majority of sessions and a landing page under a strong campaign clears that comfortably;
  a top landing page with low engagement is a message-match or tracking problem, not a traffic one.
- Conversion-tracking rule: a configured conversion action with zero events in 30 days is broken
  or dead - never report it as "0 conversions" without probing the page and reading the events
  first. Zero can mean "no one converted" or "the tag never fired"; opposite stories.
- Anomaly rule: more than 20 percent WoW on a money page or KPI = same-day Play 5 diagnosis.
  Separate measurement change from real change every time.
- Sample-size rule: on low-traffic sites, weekly percentage swings are mostly noise. Report
  absolute numbers alongside percentages and lengthen the window (28 days) before calling a trend
  on a site under a few hundred sessions a week. Do not alert on percentage changes with trivial
  denominators or incomparable windows.
- Sample transparency, everywhere a score or aggregate ships: disclose N, how the sample was
  chosen, and what was excluded (truncated scans, capped pages, skipped recipients, channels
  with no connection). An aggregate whose denominator the reader cannot see is a vibe.
