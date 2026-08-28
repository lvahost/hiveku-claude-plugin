# Tool scoping, argument schemas, and read mechanics

Per-tool depth for the first-party reads (Plays 1, 2, 3, 6). Load this before running any of
those plays, and any time a number will not reconcile - scope mismatch is the usual cause.

## Scope discipline (which UUID goes where)

- Every analytics read is project-scoped. Get the project UUID from `sites_list` FIRST and pass
  `project_id` on every call. **Do NOT substitute `list_projects`**: its own description says it
  returns PROJECT-MANAGEMENT projects (`pm_projects`) and is "NOT the buildable code projects" -
  a pm_projects UUID fed to an analytics tool is the wrong table's id and cannot resolve to a
  website. `sites_list` returns `website_projects`; that is the only valid UUID source here.
  (Profile trap: under a marketing-scoped key `sites_list` is invisible while the wrong tool
  `list_projects` IS callable - see the key-profile prerequisite in SKILL.md.)
- `analytics_overview` REQUIRES `project_id` (`required: ['project_id']`) and errors without it.
  `analytics_pages` / `analytics_sessions` / `analytics_traffic_sources` accept it optionally and
  silently fall back to account scope, so a report that omits it on some calls and not others
  will not reconcile on a multi-site account. `analytics_visitors` and `analytics_events_list`
  are different again: visitors is account-scoped with no project filter at all, events takes
  `project_id` optionally. `analytics_diagnose_tracking` and `analytics_channel_scorecard` take
  it optionally too, and omitting it does NOT mean account-wide: the server picks one project for
  you (the primary published site, and for the scorecard the most recently updated published
  project with a custom domain). On a multi-site account that silently diagnoses the wrong site,
  so always pass it. Say which scope every figure came from.
- Pagination guardrails: `analytics_sessions`, `analytics_pages` and `analytics_events_list` are
  all paged (`page` / `limit`). A 90-day sessions or events pull at the default limit silently
  truncates, and a truncated event count fed into the Play 4 KPI cross-check produces a false
  "broken tag" verdict. Before comparing an event count against CRM or platform totals, page
  until exhausted or narrow the window, and disclose the row count you actually read.

## Local snapshots

`hiveku-data/analytics/*.json` is the local snapshot and it holds exactly three files:
`visitors.json` (`analytics_visitors`, limit 100), `top_pages.json` (`analytics_pages`, 90d,
limit 200) and `sessions.json` (`analytics_sessions`, 90d, limit 200), the last two scoped per
project from `sites_list`. There is NO overview, traffic-sources, events or conversion-config
export - do not go looking for one. Read the three for orientation without spending a live
call. Snapshots go stale the moment traffic moves; never quote a snapshot number in a
client-facing figure without a live re-check.

## Play 1 - Traffic and audience intelligence

The "how many and who" foundation - all first-party reads, cheap, run freely.
- `analytics_overview({ project_id, from_date, to_date })` - the traffic topline for a window
  PLUS top devices, countries, and landing pages. `project_id` is REQUIRED; the call errors
  without it. This one tool is the device, geography and landing-page source for the whole
  report. Always compare two windows (this period vs prior equal period) rather than reporting a
  bare number - a level with no comparison tells the client nothing.
- `analytics_sessions({ project_id, from_date, to_date, device_category?, country? })` - the
  session rows, filterable by device and country. Sessions, not visitors, are the unit of
  "visits". The hierarchy is always visitors (unique people) < sessions (visits) < pageviews; if
  a report inverts it, the window or source is mismatched - stop and check before publishing.
- New vs returning is NOT available from any first-party tool in this lane. `analytics_visitors`
  is visitor identification and ICP matching (Play 6), not a demographics or loyalty report. If
  the client asks for new-vs-returning, say it is a dashboard view, not an MCP read, and do not
  estimate it.
- Segment before concluding: a flat overall trend often hides a collapsing channel propped up by
  a surging one, so cross-reference the channel breakdown (Play 3) before writing "traffic is
  stable". Engagement rate is the inverse of the old bounce framing - a low rate on a landing
  page is a message-match problem, not a traffic problem.

## Play 2 - Page and content performance

Where attention goes and where it leaks - first-party reads.
- `analytics_pages({ project_id, from_date, to_date, limit })` - top pages by traffic for the
  window. That is its entire job: there is no entrances, exits, or landing-page dimension on this
  tool, so never report one from it. Landing pages come from `analytics_overview` - pull both and
  read them together: views tell you what gets consumed, the overview's landing pages tell you
  what the market lands on.
- For any anomalous page - huge traffic and no engagement, or zero traffic where you expect some
  - `analytics_probe_page({ url })` before concluding anything. It tells you whether tracking is
  even present. Half of "this page is dead" findings are actually "this page has no pixel". It
  takes a full URL and REFUSES a URL on a domain this account does not own, so a competitor or
  staging host is not probeable from here.
- Landing-page diagnosis pattern: a top landing page (from `analytics_overview`) with low
  engagement is either a message-match failure (ad/organic promise does not match the page) or a
  tracking artifact (the downstream conversion event is not firing so the page looks like a dead
  end). Probe the page, check the events, THEN diagnose - and hand any message-match fix to the
  web or SEO owner.
- There is no per-page heatmap or scroll tool here. When the client wants scroll/click heat, say
  so plainly: no tool for this yet - it lives in the dashboard's behavior view, not the MCP.
- GSC page-level corroboration: `seo_gsc_top_pages` (dimensions: page, same params as
  `seo_gsc_search_queries`, default window last 28 days) gives Google's view of the same pages.
  Label it GSC, never sum it with first-party views.

## Play 3 - Channel attribution and traffic sources

Where the traffic comes from - the play that decides where the client should spend next.
- `analytics_traffic_sources({ project_id, from_date, to_date })` - the traffic source breakdown
  (organic, direct, referral, paid, social, email). This is the reportable channel artifact:
  run it on the period and the prior equal period and report the shift. Those three arguments
  are the whole schema - there is no campaign, medium, or referrer dimension to pass.
- `analytics_channel_scorecard` is NOT this tool. Despite the name it does not return sessions,
  share, or engagement by channel: it is a slow live-browser conversion-tracking audit. It lives
  in Play 5. Never put it in a traffic report.
- Reading the breakdown: a "direct" spike is often untagged campaign traffic (missing UTMs)
  collapsing into direct; a "referral" surge can be spam or one big placement. When a channel
  moves past the anomaly threshold, drill into the individual hits with
  `analytics_events_list({ project_id, page_path?, from_date, to_date })` rather than expecting
  a deeper cut from the sources tool.
- Attribution literacy, to keep the report honest:
  - Direct traffic is a catch-all, not a loyalty metric. Dark social, untagged email, and
    stripped referrers all land in direct, so a rising direct share often means a tagging problem,
    not rising brand - check UTM coverage on campaigns before you celebrate.
  - First-party analytics uses last-touch by default. A conversion credited to organic may have
    been assisted by an earlier paid click - do not claim single-channel causation from
    last-touch data, say "last-touch" out loud, and never double-count across first-party and GA4.
  - Self-referrals and unfiltered staff/preview traffic inflate referral/direct, meaningfully
    skewing small-site numbers - flag it as a tracking-config task, not a data insight.
- Campaign/UTM questions: no `analytics_*` tool accepts a campaign or UTM argument - do not
  invent a UTM cut from the sources tool. But the question IS now answerable at the conversion
  level: `marketing_form_conversion_audit` filters form fills by `utm_source` / `utm_medium` /
  `utm_campaign` / `utm_term` / `utm_content` and `has_click_id`, and
  `marketing_call_attribution_breakdown` groups calls by source/medium/campaign (see
  references/conversion-layer-matrix.md). Session-level UTM traffic cuts still have no tool, and
  campaign ROI joined to ad spend remains the PPC discipline - route it rather than approximating.

## Play 6 - Warm-traffic intelligence (the deliverable sales actually pays for)

`analytics_visitors` is visitor intelligence, not demographics. It returns visitor profiles with
identification (email, `identified_data`) and ICP matching (`matched_icp_id`,
`icp_match_confidence` / `_criteria` / `_source`), event counts, and first/last seen.
- The chase list: `analytics_visitors({ has_icp_match: 'true', sort_by: 'icp_confidence',
  min_events: 3 })`. `has_icp_match` is a STRING (`'true'` / `'false'`), not a boolean.
  `min_events` filters drive-bys; `min_confidence` (0-100) raises the bar. `limit` defaults to 30,
  max 100. Other sorts: `last_seen` (default), `first_seen`, `events`. `search` matches name or
  email.
- It is ACCOUNT-SCOPED across all sites - there is no `project_id` argument. On a multi-site
  account you cannot attribute a named visitor to one site from this tool, so label the list as
  account-wide and never fold it into a single-site report as if it were site traffic.
- Sample transparency: the chase list is a capped page, not a census. When you hand it over,
  disclose the filters and the cap ("top 30 by ICP confidence, min 3 events, account-wide") so
  nobody reads it as "all warm visitors".
- What to do with it: hand the ICP-matched, identified names to the sales or outbound lane with
  the page evidence beside them. Marketing uses the same list to judge whether the traffic is
  the right traffic - a rising session count with zero ICP matches is a relevance problem the
  topline hides.
- What it does NOT give you: new vs returning, geography, device, or a per-site cut. Those come
  from `analytics_overview` (devices, countries) and `analytics_sessions` (`device_category`,
  `country` filters), or not at all.
