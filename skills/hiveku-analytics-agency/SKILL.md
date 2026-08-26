---
name: hiveku-analytics-agency
description: Full web analytics and visitor intelligence methodology for operating a Hiveku account. Use for ANY analytics work - traffic and visitor trends, sessions and engagement, top pages and landing pages, traffic sources and channel attribution, referrers and campaigns, events and event taxonomy, bounce and engagement rate, conversion tracking health, tracking pixel and tag diagnosis, tag firing checks, GA/GSC connection status, and weekly checkups or monthly analytics reports and dashboards. This is a READ-ONLY reporting and diagnosis discipline - it reads and diagnoses, it never mutates site or tracking config.
---

# Hiveku Analytics Agency Operating System

Operate the account like a retainer agency charging thousands per month for visibility and
truth: baseline once, set the measurement strategy, run diagnostic and reporting plays on a
weekly cadence, ship a monthly report the client would actually pay for. Every tool named below
is a real Hiveku MCP tool.

This department is READ-ONLY. It reads traffic, sessions, pages, channels, and events, and it
diagnoses tracking health - it does NOT create conversion actions, install pixels, edit tags, or
touch site code. When a fix requires a write, prove the problem precisely and hand it off as a PM
task to the web or conversion owner. The only writes you make are to memory and PM; never pretend
to have fixed tracking from here.

## Operating principles
- `account_context_get({ domain: 'analytics' })` FIRST - before any analysis, plan, or narrative.
  It returns persona, brand voice, avatars, domain memory, and rules; re-read its instructions
  field before every generative call. Skipping it is the most common cause of a report that
  misreads what the business actually cares about.
- Hiveku is the source of truth. Durable findings (agreed KPIs, channel taxonomy, what counts as
  a conversion, known tracking gaps, seasonality) go to `memory_create`; work items (a tag to
  fix, a pixel to install, a report to ship) go to `pm_tasks_create` / `pm_tasks_update` /
  `pm_tasks_complete`. There is no analytics-deliverable tool - the report is assembled as a
  document and the decisions behind it live in memory.
- Confirm before writes. This department reads freely, but a `memory_create`, a `pm_tasks_create`,
  or a `talk_to_department` call still gets a one-line summary and a yes first. The client's task
  board and memory are not a scratchpad.
- `hiveku-data/analytics/*.json` (overview snapshots, sessions, pages, sources, events,
  conversion config) is the local snapshot - read it for orientation without spending a live
  call. Use live tools for anything current or decision-grade. Snapshots go stale the moment
  traffic moves; never quote a snapshot number in a client-facing figure without a live re-check.
- Generative or strategic output (a report narrative, an insights write-up, a measurement-plan
  doc) goes through `talk_to_department({ domain: 'analytics', message })` with the numbers you
  already pulled, then you persist the decisions with `memory_create`. Pure reads and diagnosis
  go to the direct `analytics_*` tools. Never ask the agent to invent numbers - feed it the tool
  output and let it write the story.
- Confirm the account when anything is ambiguous with `get_account_info`, and when unsure of a
  tool's argument shape reach for `hiveku_docs_search` / `hiveku_docs_get` rather than guessing -
  a wrong date range or dimension silently returns a plausible-but-wrong number.

## The measurement stack (know what you are reading)
Hiveku analytics is served from the first-party tracking worker (`track.hiveku.com`) plus any
connected GA4 / Search Console properties, and two consequences shape every number you report:
- First-party analytics counts only what the site's own embed saw. If the embed is missing on a
  page, that page is invisible here even though real humans visited it - `analytics_pages`
  showing zero for a page that clearly gets traffic is a tracking gap, not a traffic gap. Prove
  it with `analytics_probe_page` before reporting the page as dead.
- GA4 and GSC are separate connected sources with their own sampling, attribution windows, and
  latency (`seo_connections_list` tells you which are connected). A report that blends first-party
  sessions with GA4 users without labeling them will not reconcile. Label every figure by source.

## Engagement lifecycle (the agency arc)

### Month 1 - measurement baseline (do ALL of this before promising a single insight)
1. Context: `account_context_get({ domain: 'analytics' })` for what the business sells and cares
   about, `get_account_info` to confirm the account, then `seo_connections_list` for which data
   sources exist (first-party embed, GA4, GSC). Missing or half-connected sources cap what you
   can honestly report - name the gap before you name a number.
2. Tracking health FIRST, numbers second. `analytics_diagnose_tracking` for the account-level
   verdict (embed present, firing, events landing, obvious gaps), then `analytics_probe_page({
   url })` on the homepage and top 3-5 money pages. A baseline built on a broken pixel is worse
   than no baseline - you anchor the client to a number that only rises because tracking leaked.
3. Traffic shape: `analytics_overview` for the topline (visitors, sessions, pageviews,
   engagement, trend) over a stable window - 90 days averages out weekly noise and shows the
   real level. Capture the number AND the window.
4. Audience and behavior: `analytics_visitors` (new vs returning, geography, device) and
   `analytics_sessions` (session count, duration, pages per session, entry/exit) over the same
   90 days. These answer "how many, who, and how deep".
5. Content: `analytics_pages` - top pages by views, and (critically) top LANDING pages by
   entrances. Landing pages are where acquisition happens; the most-viewed page is often a shared
   nav destination, not an entry point. Note both.
6. Acquisition: `analytics_traffic_sources` for the raw referrer/source picture and
   `analytics_channel_scorecard` for the grouped channel view (direct, organic, paid, social,
   referral, email). The scorecard is what you report; the raw sources are how you debug a
   channel that looks wrong.
7. Events and conversions: `analytics_events_list` for what is actually tracked (form submits,
   clicks, custom events) and whether the taxonomy is coherent. Then the conversion layer:
   `ppc_conversion_tracking_status` for the health verdict, `ppc_conversion_actions_list` (and
   `ppc_google_conversion_actions` for detail) for what is configured to count as a conversion. A site with
   pageviews but zero configured conversion actions has no way to prove ROI - a headline finding,
   not a footnote.
8. Record the baseline with `memory_create` - the 90-day levels per metric, connected sources,
   channel mix, tracking gaps found and where, configured conversion actions, and any seasonality
   the client warns you about. This memory makes month 2 a comparison instead of a re-derivation.
   Turn every tracking gap into a `pm_tasks_create` addressed to the web/conversion owner.

### Strategy (weeks 2-3) - the measurement plan
Analytics with no agreed definition of success is just decoration. Produce a measurement plan:
- The 3-5 KPIs this business is judged on (qualified leads, calls, bookings, revenue), each
  mapped to a concrete tracked event or conversion action - or flagged "not currently
  measurable, needs setup".
- The channel taxonomy: how sources roll up into channels for THIS client (a Google Ads client
  needs paid split out; a purely organic one does not). Agree it once so every report groups the
  same way. Plus the event taxonomy: which events matter, consistent naming, what to ignore.
- Draft the plan with `talk_to_department({ domain: 'analytics', message })`, feeding it the
  baseline numbers. Get client sign-off, then `memory_create` the agreed KPIs and taxonomies and
  `pm_tasks_create` the first month of fixes (tracking gaps, missing conversion actions).

### Execution -> cadence
Run the plays below as recurring tasks. The weekly checklist keeps the numbers trustworthy and
catches drops early; the monthly report proves the value. Never report a number you have not
sanity-checked against the tracking-health verdict.

## Play 1 - Traffic and audience intelligence
The "how many and who" foundation - all first-party reads, cheap, run freely.
- `analytics_overview` - visitors, sessions, pageviews, engagement rate, and trend for a window.
  Always compare two windows (this period vs prior equal period) rather than reporting a bare
  number - a level with no comparison tells the client nothing.
- `analytics_visitors` - new vs returning, geography, device. New/returning is the
  acquisition-vs-loyalty tell: an all-new-visitor spike is a campaign or viral moment; a shift
  toward returning is brand/retention working.
- `analytics_sessions` - session volume, average duration, pages per session, entry/exit
  behavior. Sessions, not visitors, are the unit of "visits". The hierarchy is always visitors
  (unique people) < sessions (visits) < pageviews; if a report inverts it, the window or source
  is mismatched - stop and check before publishing.
- Segment before concluding: a flat overall trend often hides a collapsing channel propped up by
  a surging one, so cross-reference the channel scorecard (Play 3) before writing "traffic is
  stable". Engagement rate is the inverse of the old bounce framing - a low rate on a landing
  page is a message-match problem, not a traffic problem.

## Play 2 - Page and content performance
Where attention goes and where it leaks - first-party reads.
- `analytics_pages` - top pages by views AND top landing pages by entrances. Report both: views
  tell you what gets consumed, entrances tell you what the market lands on. Exit-heavy pages in a
  funnel are the leak points.
- For any anomalous page - huge traffic and no engagement, or zero traffic where you expect some
  - `analytics_probe_page({ url })` before concluding anything. It tells you whether tracking is
  even present. Half of "this page is dead" findings are actually "this page has no pixel".
- Landing-page diagnosis pattern: high entrances with low engagement/high exit is either a
  message-match failure (ad/organic promise does not match the page) or a tracking artifact (the
  downstream conversion event is not firing so the page looks like a dead end). Probe the page,
  check the events, THEN diagnose - and hand any message-match fix to the web or SEO owner.
- There is no per-page heatmap or scroll tool here. When the client wants scroll/click heat, say
  so plainly: no tool for this yet - it lives in the dashboard's behavior view, not the MCP.

## Play 3 - Channel attribution and traffic sources
Where the traffic comes from - the play that decides where the client should spend next.
- `analytics_channel_scorecard` - the grouped channel view (direct, organic, paid, social,
  referral, email) with volume and engagement per channel. This is the reportable artifact:
  channel, sessions, share, engagement, trend vs prior period.
- `analytics_traffic_sources` - the raw source/medium/referrer detail underneath the channels.
  Use it to debug: a "direct" spike is often untagged campaign traffic (missing UTMs) collapsing
  into direct; a "referral" surge can be spam or one big placement. Drill from the scorecard into
  sources whenever a channel moves past the anomaly threshold.
- Attribution literacy, to keep the report honest:
  - Direct traffic is a catch-all, not a loyalty metric. Dark social, untagged email, and
    stripped referrers all land in direct, so a rising direct share often means a tagging problem,
    not rising brand - check UTM coverage on campaigns before you celebrate.
  - First-party analytics uses last-touch by default. A conversion credited to organic may have
    been assisted by an earlier paid click - do not claim single-channel causation from
    last-touch data, say "last-touch" out loud, and never double-count across first-party and GA4.
  - Self-referrals and unfiltered staff/preview traffic inflate referral/direct, meaningfully
    skewing small-site numbers - flag it as a tracking-config task, not a data insight.
- Campaign questions (which UTM drove what) drill `analytics_traffic_sources` on the campaign
  dimension. Campaign ROI joined to ad spend is a paid-media report (the PPC discipline), not
  this one - say so and route it.

## Play 4 - Events and conversion tracking health (the trust play)
The play that earns the retainer: numbers only matter if the tracking is sound, and proving it is
- or precisely where it is not - is the highest-value thing this read-only department does.
- Event inventory: `analytics_events_list` - what events exist, their volumes, and whether the
  naming is coherent. Look for: events that should exist and do not (a form page with zero submit
  events = broken form tracking); events firing implausibly often (a click on every pageview =
  mis-bound selector); inconsistent names for one action (`form_submit`, `formSubmit`, `lead` =
  a taxonomy problem that makes every downstream count unreliable).
- Conversion configuration: `ppc_conversion_tracking_status` for the overall verdict (healthy, are
  actions receiving data), then `ppc_conversion_actions_list` for the configured conversion actions
  and `ppc_google_conversion_actions` for the detail of one. A configured action with zero events in 30 days
  is a dead funnel or a broken tag - probe the page it should fire on and read the events first.
- Cross-check the chain end to end for each KPI:
  1. Does an event exist for the KPI action? (`analytics_events_list`)
  2. Is its volume consistent with reality? (event count vs known CRM lead volume)
  3. Is it wired to a conversion action? (`ppc_conversion_actions_list` / `ppc_google_conversion_actions`)
  4. Is that action healthy and receiving data? (`ppc_conversion_tracking_status`)
  A break anywhere means the KPI is not truly measured. Report the exact broken link, the page it
  lives on (`analytics_probe_page`), and hand the fix to the owning department as a
  `pm_tasks_create` with the repro. You diagnose; they fix.

## Play 5 - Tracking diagnosis and forensics
The read-only department's core craft: turning "the numbers look wrong" into a precise, handoff-
ready defect. Run this any time a metric moves in a way the business cannot explain.
- Start account-wide: `analytics_diagnose_tracking` - embed present, firing, events landing,
  container health. This separates "traffic changed" from "measurement changed", the single most
  important distinction in this discipline. Then localize with `analytics_probe_page({ url })` on
  the pages that dropped - is the pixel present, firing, and sending events?
- Corroborate against connected sources: `seo_connections_list` to confirm GA4/GSC are still
  connected (an expired GA4 connection zeroes that source without touching first-party). If
  first-party dropped but GSC organic is flat, the drop is measurement, not traffic.
- Common causes to check, in order of likelihood:
  1. A site deploy dropped the embed or tag container (probe a page changed in that deploy).
  2. A consent/cookie banner change is blocking the tracker before consent (traffic looks like
     it fell off a cliff on a specific date - correlate with the banner change).
  3. A connected source's OAuth expired (GA4/GSC) - `seo_connections_list` shows it.
  4. A bot or self-referral surge inflated a channel (drill `analytics_traffic_sources`).
  5. A UTM/tagging change collapsed a channel into direct.
- Output of this play is never a fix - it is a diagnosis. Write the finding to `memory_create`
  and open a `pm_tasks_create` for the department that owns the fix (web for embed/deploy,
  conversion owner for tags, connection owner for OAuth). Confirm the task before creating it.

## Weekly cadence (every week, ~20 minutes of tool time)
1. `analytics_diagnose_tracking` - is measurement healthy this week? Run it FIRST; every other
   number is only as good as this verdict. A red result stops the rest of the report until
   diagnosed.
2. `analytics_overview` (last 7d vs prior 7d) - topline movement: visitors, sessions, engagement,
   direction.
3. `analytics_channel_scorecard` (same 7d comparison) - which channel moved and by how much. A
   flat topline can hide a collapsing channel; always look at the mix.
4. `analytics_pages` - any new page surging or a money page dropping (investigate same day)?
   Probe any money page that dropped with `analytics_probe_page`.
5. `analytics_events_list` + `ppc_conversion_tracking_status` - are conversions still firing at the
   expected rate? A count that flatlined mid-week is a broken tag until proven otherwise - probe
   and open a task.
6. Anomaly rule: any metric moving more than 20 percent WoW on a money page or a KPI conversion
   gets same-day investigation via Play 5. Measurement break or real change - decide which before
   the client asks. Never let the client discover a data outage in the monthly report.
7. Pipeline: `pm_tasks_update` on any open tracking-fix tasks; `pm_milestones_list` to keep the
   week's diagnostics tied to milestones. Escalate anything stalled.

## Monthly report (the artifact the retainer pays for)
There is no analytics-deliverable tool - assemble the report as a document or artifact and keep
the decisions in memory. Write the narrative through the department agent, ground every number
in a named tool call.
1. Pull the month's numbers, all with an explicit window and its prior-period comparison:
   `analytics_overview`, `analytics_visitors`, `analytics_sessions`, `analytics_pages`,
   `analytics_channel_scorecard`, `analytics_traffic_sources`, `analytics_events_list`,
   `ppc_conversion_tracking_status`, `ppc_conversion_actions_list`. Run `analytics_diagnose_tracking` so
   the report can state the data is trustworthy (or name where it is not).
2. Draft the narrative with `talk_to_department({ domain: 'analytics', message })`, feeding it
   every figure. Sections, in this order:
   - Executive summary - 5 bullets max: headline metric MoM, biggest win, biggest risk, the one
     thing that changed, what is next. Written last, placed first.
   - Data health - one honest paragraph: is tracking sound this month, what gaps exist, what got
     fixed. Leading with this is what separates an agency from a dashboard screenshot.
   - Audience and traffic - overview + visitors + sessions, MoM and YoY (YoY keeps you honest
     about seasonality): new vs returning, device, geography.
   - Channels - the scorecard MoM: which channel grew, which shrank, share shift, and the
     last-touch caveat stated plainly.
   - Content - top pages, top landing pages, biggest movers, leak points.
   - Conversions - status + actions + relevant events: conversions by action, rate vs prior
     period, measurement caveats. If a KPI is not yet measurable, say so and point to the task.
   - Work completed and next - from completed/open PM tasks: fixes shipped, plan for next.
3. Numbers must reconcile: every figure must be reproducible from a named tool call and labeled
   with its source (first-party vs GA4 vs GSC) and window. No blended, unlabeled numbers, no
   vibes. Then persist the report's key decisions and any newly discovered gaps with
   `memory_create` so next month is a comparison, not a re-derivation.

## Benchmarks and decision rules
- Engagement benchmark (blended, for orientation not promises): a healthy content site is engaged
  on a majority of sessions and a landing page under a strong campaign clears that comfortably;
  high entrances with low engagement is a message-match or tracking problem, not a traffic one.
- Conversion-tracking rule: a configured conversion action with zero events in 30 days is broken
  or dead - never report it as "0 conversions" without probing the page and reading the events
  first. Zero can mean "no one converted" or "the tag never fired"; opposite stories.
- Anomaly rule: more than 20 percent WoW on a money page or KPI = same-day Play 5 diagnosis.
  Separate measurement change from real change every time.
- Sample-size rule: on low-traffic sites, weekly percentage swings are mostly noise. Report
  absolute numbers alongside percentages and lengthen the window (28 days) before calling a trend
  on a site under a few hundred sessions a week.

## Pitfalls (data, source, and read-only traps)
- Tracking gaps masquerade as traffic gaps. A page with no embed reports zero here while getting
  real visits. ALWAYS `analytics_probe_page` before reporting a page or funnel as dead, and
  `analytics_diagnose_tracking` before trusting an account-wide drop.
- Source blending breaks reconciliation. First-party sessions, GA4 users, and GSC clicks are
  three different systems with different definitions and windows - never sum across them.
- Latency and windows. Fresh first-party data can still be settling for the current day, and
  GA4/GSC lag further. Compare like windows (full days vs full days) and state the window on
  every number. A partial-day comparison invents a false drop.
- This department writes nothing to the site. When the diagnosis is "the tag is broken" or "add
  a conversion action", the deliverable is a precise, reproducible PM task plus a memory note -
  not an edit from here. Never claim a tracking fix was applied by this discipline; it cannot be.
- Deploys are the number-one silent data killer: a deploy that drops the embed or tag container
  zeroes the data with no error, so `analytics_diagnose_tracking` is the first step of every
  weekly check and runs again after every known deploy.
- Confirm before every write, and log every material decision with `memory_create` so the next
  session does not re-litigate it - a bad `pm_tasks_create` or `memory_create` pollutes both the
  client's board and the next session's context.