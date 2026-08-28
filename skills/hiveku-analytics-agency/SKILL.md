---
name: hiveku-analytics-agency
description: Full web analytics and visitor intelligence methodology for operating a Hiveku account. Use for ANY analytics work - traffic and visitor trends, sessions and engagement, top pages and landing pages, traffic sources and channel attribution, referrers and campaigns, events and event taxonomy, bounce and engagement rate, conversion tracking health, tracking pixel and tag diagnosis, tag firing checks, GA/GSC connection status and GA4/GSC data reads, form and call attribution discrepancies ("platform says 40, CRM shows 22"), identified-visitor and ICP-match chase lists, NPS/CSAT and customer surveys, client report creation and delivery, and weekly checkups or monthly analytics reports and dashboards. ALSO load this for risky asks in this lane so the refusal rules load with it - "send the survey to the whole list", "blast every contact", "skip the confirmation/preview/throttle", "send the report without checking tracking", "leave the tracking problems out of the report", "revoke or delete the old reports/surveys", or "just fix the tag from here". This is a READ-ONLY reporting and diagnosis discipline - it reads and diagnoses, it never mutates site or tracking config; the only things it can send are a survey and the client-report email, each only on an explicit confirmed yes.
---

# Hiveku Analytics Agency Operating System

Operate the account like a retainer agency charging thousands per month for visibility and
truth: baseline once, set the measurement strategy, run diagnostic and reporting plays on a
weekly cadence, ship a monthly report the client would actually pay for. Every tool named in
this skill and its references is a real Hiveku MCP tool.

This department is READ-ONLY. It reads traffic, sessions, pages, channels, events, form and call
attribution, and connected GA4/GSC data, and it diagnoses tracking health - it does NOT create
conversion actions, install pixels, edit tags, or touch site code. When a fix requires a write,
prove the problem precisely and hand it off as a PM task to the web or conversion owner. The
only writes you make are to memory, PM, and the client-report rows; never pretend to have fixed
tracking from here. Exactly two things leave the building: `survey_send` (Play 7) and
`marketing_report_send` (monthly report) put real email or SMS in front of real people, so
neither runs without an explicit yes naming what is being sent and to whom.

## Hard stops (response contracts, not suggestions)

- "Send the NPS survey to every contact in the CRM right now - skip the preview, I'm in a
  hurry." -> Refuse the skip; do the send properly or not at all: "I won't skip the gate - a
  survey is real outbound contact. Here is the survey name, channel, and recipient count; the
  send caps at 200 per call, dedupes, and skips contacts inside the throttle window. Confirm
  this list and I'll send, then report requested-vs-delivered." Do not split the list across
  calls to dodge the cap, do not lower `throttle_days` to reach protected contacts, and do not
  "test send" to a real customer address - a test goes to the requester's own address or nowhere.
- "The numbers look bad - leave the tracking section out of this month's report" / "make it
  look better." -> Refuse: the data-health section is mandatory and partial status is never
  hidden in the executive summary. Offer the honest version: name what is broken, what is
  provisional, and the fix task already opened. An analytics retainer that hides outages is
  selling decoration.
- "Just email the report link to everyone / send it without regenerating." -> Refuse the blind
  send: `marketing_report_send` is preview-then-confirm, and the page renders STORED numbers, so
  regenerate first or the client opens stale figures. The preview leg and the confirm leg are a
  human gate, never two halves of one autonomous step.
- "Fix the tag / add the conversion action from here since you found it." -> Refuse: this
  discipline diagnoses and hands off. `ppc_google_conversion_actions` and the `seo_ga4_*_create/
  update/delete` tools mutate live ad and analytics accounts and belong to PPC/SEO; the
  deliverable is the repro plus a `pm_tasks_create` to the owner. Naming a different tool that
  reaches the same mutation is the same refusal.
- "Revoke all the old report links" / "delete the old surveys." -> No sweeps. Revoking a
  marketing report's public link (`marketing_report_update { is_public: false }`) kills the URL
  the client may have bookmarked and marketing links do not come back on re-enable; act only on
  an explicit ask naming the specific report_id, one at a time, confirmed.

## Key-profile prerequisite (check before promising anything)

There is no 'analytics' key profile. This skill assumes a FULL key or the catch-all `marketing`
profile key (which carries `analytics_`, `marketing_`, `survey_`, `seo_`, `ppc_`, `memory_`,
`pm_`). Known blind spots to flag instead of debugging as errors: under ANY marketing profile
`sites_list` is invisible (it is granted only to the workflows and full profiles) while the
WRONG tool `list_projects` IS visible - see the scoping trap below; `connections_status` and the
`helpdesk_csat_*` pair match no marketing prefix and need a full key (or a by-name grant);
`marketing-seo` keys lack `ppc_`, `marketing-ads` keys lack `seo_`. A tool-refused error on a
named tool here is usually the key profile, not a missing tool.

## Operating principles

- `account_context_get({ domain: 'marketing' })` FIRST - before any analysis, plan, or narrative.
  It returns persona, brand voice, avatars, domain memory, and rules; re-read its instructions
  field before every generative call. Skipping it is the most common cause of a report that
  misreads what the business actually cares about. **`domain: 'analytics'` is NOT valid here** -
  the context route accepts 15 values and analytics is not one of them, so it returns HTTP 400
  `invalid_domain`. It IS a valid `talk_to_department` domain, which is exactly the trap; the two
  enums differ. Use `marketing` for context, `analytics` for the chat.
- Hiveku is the source of truth. Durable findings (agreed KPIs, channel taxonomy, what counts as
  a conversion, known tracking gaps, seasonality) go to memory under the `marketing` domain -
  `account_context_get` hydrates the memory row whose `domain` matches the domain you asked for,
  and it cannot be asked for `analytics` at all, so a row filed under `analytics` is never read
  back by the tool this skill opens with. Work items (a tag to fix, a pixel to install, a report
  to ship) go to `pm_tasks_create` / `pm_tasks_update` / `pm_tasks_complete`. The client-facing
  deliverable has its own rail: `marketing_report_create` and its siblings (see
  references/monthly-report.md) - the decisions behind it still live in memory.
- Memory is ONE document per domain and `memory_update` REPLACES it. Read before you write:
  `memory_list({ domain: 'marketing' })`, append to the `content` it returns, then
  `memory_update({ memory_id, content })` with the whole merged body. `memory_create({ type:
  'memory', name: 'marketing', content })` only when nothing exists (a 409 means it does).
- Confirm before writes. This department reads freely, but a `memory_create`, a
  `pm_tasks_create`, a `marketing_report_create` (it schedules recurring client email), or a
  `talk_to_department` call still gets a one-line summary and a yes first. The client's task
  board, memory, and report cadence are not a scratchpad.
- Every analytics read is project-scoped. Get the project UUID from `sites_list` FIRST and pass
  `project_id` on every call. **`list_projects` is NOT a substitute**: it returns
  project-management rows (`pm_projects`), a different table from the buildable
  `website_projects` that analytics reads - its own description says "NOT the buildable code
  projects" and points at `sites_list`. Which tools require vs silently default `project_id`,
  plus pagination guardrails, live in references/tool-scoping-and-schemas.md - load it before
  any first-party read you have not run this session. Say which scope every figure came from.
- The conversion layer is a DIFFERENT scope: connection, not project - `ppc_connection_list`
  UUIDs for the ad platforms, `seo_connections_list` UUIDs (platform `google_analytics`) for the
  GA4 lane. The full per-platform matrix, the GA4 conversion audit, the form/call discrepancy
  audits, and the CRUD-tool warnings live in references/conversion-layer-matrix.md - load it
  before any conversion-layer call.
- Every number in any output must trace to a tool call made this session (or a labeled
  snapshot). The model is the interface to the data, never the source of a datum - no figure
  from memory or priors, ever.
- Generative or strategic output (a report narrative, an insights write-up, a measurement-plan
  doc) goes through `talk_to_department({ domain: 'analytics', message })` with the numbers you
  already pulled, then you persist the decisions with the memory read-merge-update. Pure reads
  and diagnosis go to the direct `analytics_*` tools. Never ask the agent to invent numbers -
  feed it the tool output and let it write the story.
- Confirm the account when anything is ambiguous with `get_account_info`, and when unsure of a
  tool's argument shape reach for `hiveku_docs_search` / `hiveku_docs_get` rather than guessing -
  a wrong date range or dimension silently returns a plausible-but-wrong number.

## The measurement stack (know what you are reading)

Hiveku analytics is served from the first-party tracking worker (`track.hiveku.com`) plus any
connected GA4 / Search Console properties, and these consequences shape every number you report:
- First-party analytics counts only what the site's own embed saw. If the embed is missing on a
  page, that page is invisible here even though real humans visited it - `analytics_pages`
  showing zero for a page that clearly gets traffic is a tracking gap, not a traffic gap. Prove
  it with `analytics_probe_page` before reporting the page as dead.
- GA4 and GSC are separate connected sources with their own sampling, attribution windows,
  latency, and timezones. `seo_connections_list` tells you which are connected, and the data
  itself is readable: `seo_gsc_search_analytics` / `seo_gsc_time_series` / `seo_gsc_top_pages` /
  `seo_gsc_search_queries` / `seo_gsc_period_comparison` for GSC, and the `seo_ga4_*` read lane
  for GA4 conversions (references/conversion-layer-matrix.md). A report that blends first-party
  sessions with GA4 users without labeling them will not reconcile. Label every figure by source.
- The comparability gate: never sum or diff across sources until they share the same event
  definition, attribution window, timezone, and currency - until then, side by side with
  definitions stated. The per-source timezone table (first-party UTC, platforms ad-account TZ,
  GSC Pacific, GA4 property TZ) is in references/monthly-report.md.
- On a full key, `connections_status` is the one-shot integration inventory (SEO + PPC + email +
  LLM, each with connection_status / last_synced_at) - social accounts are NOT included (that is
  `social_list_accounts`). On a marketing key it is invisible; fall back to
  `seo_connections_list` + `ppc_connection_list` and say so.

## Engagement lifecycle (the agency arc)

### Month 1 - measurement baseline (do ALL of this before promising a single insight)
1. Context: `account_context_get({ domain: 'marketing' })` for what the business sells and cares
   about, `get_account_info` to confirm the account, then the connection inventory
   (`connections_status` on a full key, else `seo_connections_list` + `ppc_connection_list`).
   Missing or half-connected sources cap what you can honestly report - name the gap before you
   name a number.
2. Scope: `sites_list` for the project UUIDs on this account. Pick the site the retainer covers
   and carry its `project_id` into every analytics call below. Multi-site accounts get one
   baseline per project, never a blended one.
3. Tracking health FIRST, numbers second. `analytics_diagnose_tracking({ project_id })` for the
   project-level verdict, then `analytics_probe_page({ url })` on the homepage and top 3-5 money
   pages. A baseline built on a broken pixel is worse than no baseline - you anchor the client
   to a number that only rises because tracking leaked.
4. Traffic shape: `analytics_overview({ project_id, from_date, to_date })` over a stable window -
   90 days averages out weekly noise. It is also the device/geography/landing-page source.
   Capture the numbers AND the window.
5. Behavior and content: `analytics_sessions` and `analytics_pages` over the same 90 days
   (schemas and their non-features: references/tool-scoping-and-schemas.md).
6. Acquisition: `analytics_traffic_sources({ project_id, from_date, to_date })` - the grouped
   channel breakdown and the reportable channel artifact. Do NOT reach for
   `analytics_channel_scorecard` here - despite the name it is not a channel-volume report, it
   is a slow live-browser conversion-tracking audit (Play 5).
7. Who the traffic actually is: `analytics_visitors({ has_icp_match: 'true', sort_by:
   'icp_confidence', min_events: 3 })` - visitor identification and ICP matching, account-scoped
   (Play 6).
8. Events and conversions: `analytics_events_list` for what is actually tracked and whether the
   taxonomy is coherent, then the full conversion layer per
   references/conversion-layer-matrix.md - Google/Bing/Meta health reads, LinkedIn/TikTok
   config lists, the GA4 audit, and the form/call attribution baselines. A site with pageviews
   and zero configured conversion actions has no way to prove ROI - a headline finding, not a
   footnote.
9. Deliverable check: `seo_automated_reports` - does a scheduled client report already exist and
   deliver? Note its cadence and sections; do not create a duplicate.
10. Record the baseline into the `marketing` memory (read-merge-update): the project ids it was
   measured on, the 90-day levels per metric, connected sources, channel mix, tracking gaps
   found and where, configured conversion actions, and any seasonality the client warns you
   about. This memory makes month 2 a comparison instead of a re-derivation. Turn every
   tracking gap into a `pm_tasks_create` addressed to the web/conversion owner.

### Strategy (weeks 2-3) - the measurement plan
Analytics with no agreed definition of success is just decoration. Produce a measurement plan:
- The 3-5 KPIs this business is judged on (qualified leads, calls, bookings, revenue), each
  mapped to a concrete tracked event or conversion action - or flagged "not currently
  measurable, needs setup". Calls count: the call-attribution lane reads them.
- The channel taxonomy: how sources roll up into channels for THIS client. Agree it once so
  every report groups the same way. Plus the event taxonomy: which events matter, consistent
  naming, what to ignore.
- Draft the plan with `talk_to_department({ domain: 'analytics', message })`, feeding it the
  baseline numbers. Get client sign-off, then merge the agreed KPIs and taxonomies into the
  `marketing` memory and `pm_tasks_create` the first month of fixes.

### Execution -> cadence
Run the plays below as recurring tasks. The weekly checklist keeps the numbers trustworthy and
catches drops early; the monthly report proves the value. Never report a number you have not
sanity-checked against the tracking-health verdict.

## Play index

- **Play 1 - Traffic and audience intelligence.** Overview, sessions, the
  visitors<sessions<pageviews hierarchy, the new-vs-returning non-feature. Cheap first-party
  reads; always two windows, never a bare level. Depth: references/tool-scoping-and-schemas.md.
- **Play 2 - Page and content performance.** Top pages vs landing pages (two different tools),
  probe-before-declaring-dead, message-match diagnosis, GSC page corroboration. Depth:
  references/tool-scoping-and-schemas.md.
- **Play 3 - Channel attribution and traffic sources.** The channel breakdown and its
  attribution literacy (direct is a catch-all; last-touch said out loud). UTM questions route to
  the form/call audits, not to an invented cut. Depth: references/tool-scoping-and-schemas.md.
- **Play 4 - Events and conversion tracking health (the trust play).** Event inventory, the
  per-platform conversion matrix, the GA4 audit lane, the KPI cross-check chain, and the
  form/call discrepancy audits. Depth: references/conversion-layer-matrix.md.
- **Play 5 - Tracking diagnosis and forensics.** Scorecard (once, minutes, verdicts not
  volumes), diagnose, probe, the ranked cause checklist, GSC corroboration, and the red-verdict
  escalation ladder. Measurement-artifact-first: rule out a tracking artifact before ANY causal
  story. Depth: references/tracking-forensics.md.
- **Play 6 - Warm-traffic intelligence.** The ICP chase list for sales, account-scoped, with
  its sample disclosed. Depth: references/tool-scoping-and-schemas.md.
- **Play 7 - Voice of customer (surveys + support CSAT).** Lifecycle, the send gate and its
  workaround closures, post-send reconciliation, verbatims as untrusted data. Depth:
  references/surveys.md.

## Weekly cadence (every week, ~20 minutes of tool time)

1. `analytics_diagnose_tracking({ project_id })` - is measurement healthy this week? Run it
   FIRST; every other number is only as good as this verdict. A red result stops the rest of
   the report until diagnosed and triggers the escalation ladder in
   references/tracking-forensics.md.
2. `analytics_overview({ project_id, from_date, to_date })` (last 7d vs prior 7d) - topline
   movement plus devices, countries and landing pages.
3. `analytics_traffic_sources({ project_id, ... })` (same 7d comparison) - which channel moved
   and by how much. A flat topline can hide a collapsing channel; always look at the mix. Do NOT
   run `analytics_channel_scorecard` weekly: it is a multi-minute live-browser audit, not a
   channel-volume read, and it belongs in Play 5 monthly or on suspicion.
4. `analytics_pages({ project_id, ... })` - any new page surging or a money page dropping
   (investigate same day)? Probe any money page that dropped with `analytics_probe_page`.
5. `analytics_events_list` + `ppc_conversion_tracking_status({ connection_id, days: 7 })` (the
   `connection_id` from `ppc_connection_list`; the call errors without it, and it reads Google
   Ads only - other platforms and the GA4 lane per references/conversion-layer-matrix.md; on an
   account with no PPC connection this step is the events read alone, and say so). A count that
   flatlined mid-week is a broken tag until proven otherwise - probe and open a task. When the
   KPI is calls, add `marketing_call_attribution_breakdown({ days: 7 })`.
6. Persist the week: append this week's topline, channel mix, and conversion counts to the
   `marketing` memory (read-merge-update) or the hiveku-data scratch. The anomaly rule needs
   last week's numbers COMPUTED, not recalled - a WoW delta from memory of a memory is how
   silent drift ships.
7. Anomaly rule: any metric moving more than 20 percent WoW on a money page or a KPI conversion
   gets same-day investigation via Play 5. Measurement break or real change - decide which
   before the client asks. Never let the client discover a data outage in the monthly report.
   (On low-traffic sites apply the sample-size rule first - see references/monthly-report.md.)
8. Pipeline: `pm_tasks_update` on any open tracking-fix tasks; `pm_milestones_list` to keep the
   week's diagnostics tied to milestones. Escalate anything stalled.

## Monthly report (the artifact the retainer pays for)

The deliverable is a first-class object now: `marketing_report_create` builds the scheduled,
branded, public-share client report (sections include overview, web, ppc, seo, calls, work_log),
`marketing_report_regenerate` rebuilds its stored numbers, `marketing_report_share_link` /
`marketing_report_pdf` hand it over, and `marketing_report_send` emails it behind a
preview-then-confirm gate. The full assembly order, the rail's gotchas (regenerate before send;
send requires a public link; `is_public: false` revokes a marketing link outright), the section
template, the comparability gate, and the benchmarks live in references/monthly-report.md -
load it before starting the report. Non-negotiables that ride along everywhere: the data-health
section leads; every figure is labeled source + window and traces to a named tool call; a
failed source is `partial` and a missing one `not_applicable` - neither is a zero and neither
is silently dropped; `unknown` verdicts stay unknown; the executive summary never hides a
partial status.

## Pitfalls (data, source, and read-only traps)

- Tracking gaps masquerade as traffic gaps. A page with no embed reports zero here while getting
  real visits. ALWAYS `analytics_probe_page` before reporting a page or funnel as dead, and
  `analytics_diagnose_tracking({ project_id })` before trusting a site-wide drop - it is a
  per-project diagnosis, so run it per project on a multi-site account.
- Source blending breaks reconciliation. First-party sessions, GA4 users, and GSC clicks are
  three different systems with different definitions, windows, and timezones - never sum across
  them. Side by side with definitions, or not at all (the comparability gate).
- Latency and windows. Fresh first-party data can still be settling for the current day, and
  GA4/GSC lag further. Compare like windows (full days vs full days, in a named timezone) and
  state the window on every number. A partial-day comparison invents a false drop.
- Truncation lies. Paged reads at default limits and capped scans (`totals.truncated`) turn
  totals into samples - page to exhaustion or disclose the sample before comparing counts.
- This department writes nothing to the site. When the diagnosis is "the tag is broken" or "add
  a conversion action", the deliverable is a precise, reproducible PM task plus a memory note -
  not an edit from here. Never claim a tracking fix was applied by this discipline; it cannot be.
- Deploys are the number-one silent data killer: a deploy that drops the embed or tag container
  zeroes the data with no error, so `analytics_diagnose_tracking` is the first step of every
  weekly check and runs again after every known deploy.
- Confirm before every write, and log every material decision via the memory read-merge-update
  so the next session does not re-litigate it - a bad `pm_tasks_create` or `memory_create`
  pollutes both the client's board and the next session's context.

## Reference files (load on demand - an unnamed reference is invisible)

- `references/tool-scoping-and-schemas.md` - load before any first-party read: per-tool
  project_id rules, argument schemas and non-features, pagination guardrails, snapshots, and
  the full Plays 1, 2, 3, and 6.
- `references/conversion-layer-matrix.md` - load before any conversion-layer work: the
  per-platform read matrix, the GA4 audit lane, CRUD-tool warnings, and the form/call
  attribution discrepancy audits (full Play 4).
- `references/tracking-forensics.md` - load when a number looks wrong or a verdict is red:
  scorecard/diagnose/probe mechanics, the cause checklist, GSC corroboration, the escalation
  ladder (full Play 5).
- `references/surveys.md` - load before any survey or CSAT work, and ALWAYS before
  `survey_send`: lifecycle, the send gate and workaround closures, post-send reconciliation,
  helpdesk CSAT (full Play 7).
- `references/monthly-report.md` - load before any client report or dashboard: the
  marketing_report_* rail and its gotchas, assembly order, section template, comparability
  gate and timezone table, benchmarks and decision rules.
