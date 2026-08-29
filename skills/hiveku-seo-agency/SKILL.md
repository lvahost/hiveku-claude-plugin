---
name: hiveku-seo-agency
description: "Full SEO agency methodology for operating a Hiveku account. Load when someone says \"we're not showing up on Google\", \"we dropped off page one\", \"why does [competitor] come up above us?\", \"our Google listing has the wrong hours\", \"someone left us a bad review on Google\", \"our old blog posts don't bring in leads anymore\", or \"ChatGPT never mentions us\" - and for ANY SEO work: keyword research, technical or content audits, rank tracking and ranking movements, content gaps, decay, cannibalization, on-page and schema fixes, backlinks and link building, competitor intelligence, local SEO and Google Business Profile (the map pack, listings, review replies), AEO / AI-answer visibility, and weekly checkups or monthly SEO reports and deliverables. ALSO load before risky SEO asks - deleting tracked keywords, projects, or GBP review replies, replying to all reviews at once, skipping the audit or baseline - the refusal rules live here."
---

# Hiveku SEO Agency Operating System

Operate the account like a retainer agency charging thousands per month: baseline once,
set strategy, run execution plays on a weekly cadence, ship a monthly report the client
would pay for. Every tool named below is a real Hiveku MCP tool.

## Operating principles
- `account_context_get({ domain: 'seo' })` FIRST - before any analysis, plan, or copy.
  It returns persona, brand voice, avatars, domain memory, skills, and rules. Re-read its
  instructions field before every generative call.
- Hiveku is the source of truth. Durable findings (agreed strategy, target clusters,
  competitor set, decisions) -> the `seo` memory document. Work items -> `pm_tasks_create` /
  `pm_tasks_complete`. Client-facing artifacts -> `seo_deliverable_save`.
- There is ONE memory document per domain and `memory_update` REPLACES it. Every write is
  read-merge-write: `memory_list({ domain: "seo" })`, append to the `content` it returns,
  then `memory_update({ memory_id, content })` with the whole merged body. Sending only the
  new note destroys every prior entry. `memory_create({ type: "memory", name: "seo", content })`
  only on the first run (a 409 means one already exists). If a document does get clobbered,
  `memory_list_versions({ memory_id })` then `memory_restore_version({ version_id })` recovers it.
  One catch on the read: `memory_list({ domain: "seo" })` returns ACCOUNT-level rows only. A
  project-scoped document needs `memory_list({ domain: "seo", project_id })` or
  `include_project_scoped: true`. Skip that and the account looks empty, you `memory_create` a
  second document, and the account splits its SEO history across two rows.
- Confirm before writes. Summarize what you are about to create, update, publish, or
  submit and get a yes first. Tracking a keyword is cheap and reversible; publishing
  pages, submitting sitemaps, and deploying are not.
- Every number in a deliverable traces to a tool call. The model is the interface,
  never the source of a datum: model-recalled volumes, KDs and backlink counts run
  wildly off measured reality. A source that failed to return makes that section
  partial or `insufficient_evidence` - never zero, never filled from priors.
- `hiveku-data/seo/*.json` (and `localseo/`, `aeo/`) is the local snapshot - read it
  for orientation, but use live tools for anything current or decision-grade.
- Generative or strategic output (briefs, strategy docs, page copy) ->
  `talk_to_department({ domain: 'seo', message })`, then persist with the matching
  direct tool. Pure reads and CRUD -> direct tools.
- Metered tools cost real money per call: `dataforseo_labs_*`, `backlinks_*`, `serp_*`,
  `on_page_*`, `keywords_data_*`, `seo_aeo_audit_run`. Batch inputs, persist results to
  deliverable sheets, never re-pull unchanged data. Catalog and batching rules:
  `references/metered-research-suite.md`.
- Nearly every `seo_*` tool takes `project_id` from `seo_list_projects`
  (`seo_project_list_active` is the richer read: is_active / search / page filters). If
  there is no project or no data sources, run the setup path - do not improvise it:
  `seo_connections_list` shows what exists, `seo_create_project` creates the tracking
  project, `seo_connection_create` creates a data source (BYOK; per-platform arguments,
  the GSC full-scope trap, and `seo_connection_delete` for phantom rows are in
  `references/outcomes-and-measurement.md`), then `seo_sync` verifies. The department
  SETUP.md, when it exists, is `hiveku-data/seo/SETUP.md` - `/hiveku:pull` writes it only
  where an integration needs connecting, so a missing file is normal on a fresh workspace.

## Hard stops (response contracts, not suggestions)
- "Reply to all the unanswered reviews in one go." -> Refuse the batch. Each
  `seo_gbp_review_reply` posts publicly on the live listing and REPLACES any existing
  owner reply: draft per review, show the human, confirm one at a time. Do not loop the
  confirm call, do not pre-collect one blanket yes for N reviews, do not post replies
  through `social_create_post` to dodge the confirm.
- "Clear the report workspace so we can start this month clean." -> Warn first:
  `seo_report_clear` wipes EVERY Report Preview section in the account's single
  workspace - `deliverable_slug` is a legacy no-op, so last month's sections go too
  (sheet tabs survive). Get an explicit yes on that exact blast radius.
- "Just approve the staged deploy for me." -> Refuse. `agent_approval_approve` EXECUTES
  a production deploy to the client's live site; the human reads the staged preview and
  says yes, every time. "Implement this" is not pre-approval, and re-dispatching
  `seo_task_implement` to route around a rejection is the same violation.
- "Skip the audit / baseline, we already know what's wrong." -> The baseline is the one
  chance to capture GSC's 16-month window and the before-state every future report
  reconciles against. Offer to compress it, never to skip it.
- Deletion targets are never derived by pattern ("delete all keywords with zero
  volume") - only ids the user named or a reviewed list they approved. Prefer archive
  (`seo_deliverable_update({ status: 'archived' })`) over `seo_deliverable_delete`
  (permanent, no undo). `seo_ga4_key_event_delete` is irreversible - any Ads conversion
  imported from it flatlines silently - same named-target discipline plus its own
  two-step confirm.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising anything)
1. Context: `account_context_get({ domain: 'seo' })`, then `seo_list_projects` ->
   project_id, and `seo_connections_list` -> which sources exist (DataForSEO / GSC /
   Bing / GBP / GA4). Missing sources cap what you can honestly report - fix that first.
2. Fresh data: `seo_sync({ project_id, full: true })` pulls from all connections.
3. Audits: `seo_run_audit({ project_id, audit_type: 'technical' })` and 'content' (add
   'mobile' for consumer sites) -> `seo_audit_get({ audit_id })` once each completes.
4. GSC history - capture the FULL 16-month window now (that is all Google retains;
   this is your only chance to baseline it): trend via `seo_gsc_search_analytics({
   site_url, start, end, dimensions: ['date'] })` across 16 months; demand map via
   `dimensions: ['query']` and `['page']` with `row_limit: 5000` (`['query','page']`
   answers which query drives which page). Store the aggregates in the baseline
   deliverable.
5. Authority baseline: `backlinks_summary({ target })` for the domain AND each named
   competitor - one row per domain in the baseline sheet.
6. Competitor set: `dataforseo_labs_google_competitors_domain({ target })` for
   SERP-overlap competitors; cross-check against who the client THINKS competes (usually
   different lists - both matter). Persist with `seo_add_competitor`; read back via
   `seo_list_competitors`.
7. Outcomes baseline: with a google_analytics connection, `seo_ga4_conversion_audit`
   - which key events exist and which recorded NOTHING in the window. A client with no
   working conversion definition cannot be shown that SEO traffic converts; stand one
   up in Month 1 ("Outcomes and measurement" below), not when the report needs it.
8. Record the baseline as a deliverable (`seo_deliverable_save` with
   deliverable_type 'audit') and write headline facts to `memory_create`: domain,
   GSC property string, competitor set, traffic level, top pages, constraints.

### Strategy (weeks 2-3)
Build the keyword universe (Play 1), cluster it, score it into a priority matrix.
Output: a 6-month roadmap deliverable - clusters in order, refresh vs new, technical
debt, link targets, expected impact per item. Get client sign-off, then `memory_create`
the decisions and `pm_tasks_create` the first month of work.

### Execution -> cadence
Run the plays below as tasks. The weekly checklist keeps the account healthy; the
monthly report proves the value. Never let a week pass without something shipping.

## Play 1 - Keyword research (the crown jewel)
Hiveku carries the full DataForSEO Labs suite. Work seed -> universe -> qualified ->
clustered -> prioritized -> tracked. The expansion and qualification catalog (which
tool for which step, batch sizes, per-call cost rules) is in
`references/metered-research-suite.md` - load it before spending research credits.

Clustering and prioritization:
- `seo_keyword_clusters({ project_id })` - intent + semantic clusters.
- `seo_topic_clusters({ project_id })` - hub-and-spoke pillar mapping (pillar page +
  cluster keywords). Plan one pillar + spokes per priority cluster.
- Priority score per cluster:
  volume x intent weight x business value / difficulty band, where intent weight is
  transactional 1.0, commercial 0.8, informational 0.4, navigational 0.1, and business
  value is client-confirmed 1-3 (do they sell this?). Rank descending - that ordering
  IS the roadmap.
- Persist the matrix into the strategy deliverable via `seo_sheet_create_tab` so
  nobody re-pays for the same research next quarter.
- Before any net-new content plan leaves this play, check it against what already
  ranks (`seo_cannibalization`, current rankings) - a plan drawn up blind manufactures
  cannibalization against the client's own ranking pages.

Track the winners: `seo_track_keyword({ keyword, target_domain })` for every priority
keyword (goal_id auto-derives from the domain so they group; location_code defaults
2840/US). Review with `seo_tracked_keywords_list`, prune with
`seo_tracked_keyword_delete`. Track 20-100 keywords, not 1000 - track what you report on.

## Play 2 - Competitor intelligence
The metered gap-and-sizing catalog (`dataforseo_labs_google_domain_intersection` - THE
gap tool - plus serp_competitors, ranked_keywords, rank overviews, traffic estimation,
and the link-gap pair) is in `references/metered-research-suite.md`; run it on a
priority cluster before writing for it, and feed the winners into Play 1 qualification.
Monitoring: `seo_competitor_changes({ project_id })` - review weekly; brief the client
when a rival ships something material. Deliverable: quarterly competitor teardown
(`seo_deliverable_save`, type 'competitor_analysis') - their clusters, publishing
velocity, link velocity, and our counter-moves.

## Play 3 - Content and on-page
Find opportunities (all project-scoped DB reads - cheap, run freely):
- `seo_content_gaps({ project_id, competitor_domain })` - topics they cover, we do not.
- `seo_content_decay({ project_id })` - pages losing clicks = the refresh queue.
- `seo_cannibalization({ project_id })` - URLs competing for one query (thresholds below).
- `seo_internal_links({ project_id })` - point authority at striking-distance pages first.
- `seo_eeat_scores({ project_id })` - per-page E-E-A-T weak spots; money pages first.
- `seo_schema_markup({ project_id })` - detected vs suggested structured data.
- `seo_featured_snippets({ project_id })` - winnable snippet targets; verify the format
  with `seo_serp_get({ keyword })` / `seo_serp_features` before writing the answer block.
- `seo_cro_audit({ url })` - heuristic conversion audit of ONE landing page: five
  sections scored 0-100 (speed, clarity, friction, trust, cta), findings each carrying
  issue / why_it_costs_conversions / fix, plus a quick_wins shortlist. Pure read, no
  credit spend, works on competitor pages. Run it on striking-distance pages that
  already earn traffic. v1 is audit only; run experiments as pm_tasks.

Inspect any URL on demand (`on_page_instant_pages`, `on_page_content_parsing` - metered;
see `references/metered-research-suite.md`) - ideal for outline benchmarking before a brief.

Briefs and drafts: `talk_to_department({ domain: 'seo', message })` with the target
cluster, SERP intent evidence, top-3 competitor outlines, internal-link targets and
required schema - a brief without SERP evidence is a guess. Persist with
`content_create` or as deliverables.

Ship fixes where the site actually lives:
- Hiveku-hosted pages: `pages_list` -> `pages_update` (titles, meta, slugs, SEO
  fields); CMS content via `cms_list_collections` / `cms_read_entry` / `cms_write_entry`.
- Code-level changes (templates, JSON-LD, redirects): pull the project, edit,
  `project_files_bulk_save` in ONE call, `project_vcs_commit`, verify the build,
  `deploy_site` only after approval. Commit is not live.
- Scoped-key caveat: on a `marketing-seo` scoped key the `cms_*`, `project_*` and
  `deploy_site` tools above are NOT visible (the profile grants `pages_`, the legacy
  content tools, and `seo_` - not those prefixes). There, ship page-level fixes via
  `pages_update` and route code-level changes through the implement rail
  (`seo_task_implement` -> staged deploy -> `agent_approval_approve`; procedure in
  `references/reporting-and-delivery.md`) or a full-profile key. Never report a fix as
  shipped because the edit call succeeded - verify the live URL.

After shipping: note the date, then `seo_gsc_time_series` with a page filter (e.g.
{ dimension: 'page', operator: 'contains', expression: '/blog/' }) proves the change
worked in the next report.

## Play 4 - Technical SEO
- `seo_run_audit({ project_id, audit_type: 'technical' })` monthly; 'content'
  quarterly; 'mobile' when UX matters. History via `seo_list_audits`; findings via
  `seo_audit_get({ audit_id })`.
- Triage on a severity x effort matrix:
  1. Crawl blockers, accidental noindex, broken canonicals, redirect chains, 5xx -
     high severity, usually low effort. Fix this week.
  2. Template-level issues (one fix, many pages) - high leverage. Fix this sprint.
  3. Page-by-page cosmetics - batch into content refreshes, never standalone work.
  Turn each accepted fix into `pm_tasks_create` - an audit without tickets is a PDF,
  not a service. Mechanical fixes can go down the implement rail (`seo_task_implement`
  stages a production deploy behind `agent_approval_approve` - never auto-approve;
  procedure in `references/reporting-and-delivery.md`).
- Speed and rendering signals surface in the technical audit and in
  `on_page_instant_pages` load metrics. Treat a slow template as ONE ticket, not N
  page tickets.
- Indexation: `seo_gsc_index_coverage({ site_url, urls })` (max 50 URLs per call -
  report the result as the sample it is, N/how chosen/what was left out, never a census)
  and `seo_gsc_inspect_url` (indexed snapshot only; no live-test via the API).
  "Discovered/Crawled - currently not indexed" at scale is a quality or internal-linking
  problem, not a submission problem. Full triage: `references/technical-seo.md`.
- Sitemaps: `seo_generate_sitemap({ project_id })`, then `seo_gsc_submit_sitemap`
  and `seo_bing_submit_sitemap` (single URLs: `seo_bing_submit_url`). Verify with
  `seo_gsc_list_sitemaps`.

## Play 5 - Authority and links
The full play - the metered `backlinks_*` profile catalog, prospecting
(`seo_backlink_opportunities`, domain/page intersection), digital-PR angles, and the
four-step outreach program handed to Outbound - lives in
`references/link-building-and-competitors.md` (section 7 is this play's body; plays A-F
there are the project-scoped weekly motions). Load it before any link work. Two rules
never leave this file: aim campaigns at linkable assets and route authority internally
(`seo_internal_links`) - links to money pages look unnatural when forced; and outreach
never sends from this skill - drafting and handoff here, sending is Outbound's.

## Play 6 - Local SEO (clients with physical locations or a service area)
- Data sources first: `seo_connections_list` must show GBP + GSC connected. If not,
  run the connect flow (GBP OAuth via `seo_connection_create` ->
  `seo_gbp_discover_locations` -> `seo_connection_update` with gbp_account_id +
  gbp_location_id).
- GBP health: `seo_gbp_insights({ connection_id })` (website clicks, calls,
  direction requests - Maps vs Search) and `seo_gbp_reviews({ connection_id })`
  (rating trend, unanswered reviews).
- Review replies ARE tool-driven: `seo_gbp_review_reply` posts PUBLICLY on the client's
  live listing, REPLACES any existing owner reply, and is two-step confirmed (first call
  previews, identical call with `confirm: true` publishes). One review at a time, never
  looped - see the hard stop above. The full mechanics, the negative-review protocol, and
  `seo_gbp_review_reply_delete` are in `references/local-seo.md` - load it before any
  review, listing, media, services or citations play.
- GBP POSTS (What's New, offers, events) have no tool in this lane by design - publish them via
  `social_create_post` with platform `google_business_profile`, which goes through the approval
  queue. Do not claim to have posted from here.
- Local performance: `seo_local_search_performance({ days: 90, source: 'all' })`;
  `seo_local_top_queries` / `seo_local_top_pages` (GSC + Bing merged);
  `seo_local_rank_changes({ days: 30, min_drop: 3 })`; `seo_local_rank_history` and
  `seo_local_compare_periods` for trends. Track "keyword + city" terms with
  `seo_track_keyword`; build or refresh location pages through Play 3.

## Play 7 - AEO (answer engines)
- `seo_aeo_audit_run({ domain, keywords, max_keywords: 25, location_code: 2840 })`
  probes AI Overview / featured snippet / PAA presence and whether the domain is
  cited. About one DataForSEO call per keyword - run monthly on the priority set only.
- `seo_aeo_audit_get({ domain })` - free DB read of the latest results.
- `seo_aeo_rankings_sync({ target_domain, keywords, search_engines: ['ai_overview'] })`
  refreshes tracked AI positions (also 'chatgpt', 'perplexity'; skip_sync: true creates
  tracking rows without paying yet).
- Gap = SERP has an AI Overview but the domain is not cited -> schema plus concise
  answer-first restructuring via Play 3.

## Outcomes and measurement (GA4 + GTM)
The retainer is defended by what SEO traffic DID, not by clicks. All of it runs on the
google_analytics connection from `seo_connections_list`; full detail in
`references/outcomes-and-measurement.md` - load it before any GA4/GTM work.
- `seo_ga4_conversion_audit({ connection_id, days })` - START HERE: which key events
  exist, which URL rules feed them, which recorded NOTHING in the window (a zero-event
  key event is an imported Ads conversion reporting zero with no error).
- Standing up a conversion from a URL: `seo_ga4_event_create_rule_create` ->
  `seo_ga4_key_event_create`, preflighted by `seo_ga4_admin_scopes` (analytics.edit).
  GA4 accepts a key event for an event name it has never received and then records
  nothing forever with no error - confirm arrival with the conversion audit.
- GA4 writes are LIVE on return and propagate into imported Ads conversions;
  `seo_ga4_key_event_delete` is irreversible (see hard stops).
- GTM: `seo_gtm_install_status` before and after any tag or publish work - a published
  container that is not installed fires on nobody while every tag call reports success.
  Tag writes are drafts serving nothing until `seo_gtm_version_create` then
  `seo_gtm_publish` (two-step confirmed - it changes the live site). Deep tag work is
  the `hiveku-conversion-tracking` skill's discipline - route there.

## Weekly cadence (every week, ~30 minutes of tool time)
1. `seo_rankings_list({ project_id, limit: 200 })` - movements on tracked keywords.
   Investigate any top-10 loss the same day: the URL, the live SERP via `seo_serp_get`,
   and `seo_competitor_changes`.
2. `seo_gsc_period_comparison` (last 7d vs prior 7d, dimensions ['query'] then
   ['page']) - winners/losers, climbers/droppers. Deltas are signed Google-style:
   negative = improved.
3. `seo_new_lost_backlinks({ project_id, since: <last week> })` - lost links from real
   pages get a reclamation task; new links get logged for the report.
4. Audit delta: anything new in `seo_audit_get` since the last run? Broken deploys
   show up here first.
5. Pipeline: `pm_tasks_list` - what published, refreshed, blocked. Update statuses
   honestly; stalled = escalate.
6. Anomaly rule: any traffic move > 20 percent WoW on a money page = same-day
   investigation. Rule out measurement artifacts BEFORE any causal story (property-string
   mismatch, GSC's ~2-day lag, impression-weighted position, a dead connection -
   `references/rankings-and-search-console.md` section 6 is the checklist); only then
   indexation via `seo_gsc_inspect_url`, SERP-feature shifts, competitor launches.
   Never let the client find out first.

**Install the recurring ones instead of re-deriving them.** Several plays ship as workflow
templates (lost-backlink alert, tech-audit regression, rank-drop response, content-decay
refresh, monthly AEO visibility, GBP review SLA, CWV watch): `workflow_templates_list` ->
`workflow_create_from_template({ slug, overrides })`. Read `variables[]` first (missing
required variable = 400); it defaults `is_enabled: true`, so confirm or pass
`is_enabled: false` and enable after review. Full manual: `hiveku-automation-agency`.

## Monthly report (the artifact the retainer pays for)
1. Shell: `seo_deliverable_save({ title: 'SEO Monthly Report - <Month Year>',
   slug: 'seo-monthly-<yyyy-mm>', deliverable_type: 'monthly_report', target_domain,
   summary })`.
2. Sections via `seo_report_add_section({ deliverable_slug, title, content })`
   (markdown body), in this order:
 - Executive summary - 5 bullets max: headline metric, biggest win, biggest risk,
     what we did, what is next. Written last, placed first. If any section below is
     partial, the summary says so - never hide partial status there.
 - Rankings movement - `seo_rankings_list` + `seo_gsc_period_comparison` (MoM):
     climbers, droppers, striking-distance list for next month.
 - Organic traffic - `seo_gsc_time_series` MoM and YoY (YoY keeps you honest about
     seasonality), top pages and queries, annotated with ship dates.
 - Outcomes - `seo_ga4_conversion_audit`: did the traffic convert? Zero-recording
     key events flagged as measurement gaps. No GA4 connection = the section reads
     "not measurable yet" with the setup task attached, never a silent omission.
 - Authority - `backlinks_summary` delta, notable new/lost links, outreach status.
 - Work completed - from completed pm tasks; link every shipped URL.
 - Next month plan - the roadmap slice, expected impact per item.
 - (Local clients: a Local section from `seo_gbp_insights` +
     `seo_local_compare_periods`.)
3. Data appendices as sheet tabs (`seo_sheet_create_tab` / `seo_sheet_add_rows`) for
   the full keyword table - keeps the narrative readable.
4. Revise with `seo_report_update_section`. `seo_report_clear` is NOT scoped - it wipes
   every section in the account's single workspace (see the hard stop; mechanics in
   `references/reporting-and-delivery.md`). Check `seo_automated_reports({ project_id })` -
   if a scheduled report exists, align with it rather than duplicating.
5. Numbers must reconcile: every figure in the narrative must be reproducible from a
   named tool call. No vibes. Verdicts use a closed vocabulary - pass / fail / unknown /
   not_applicable - and unknown or not_applicable never becomes a pass; a failed source
   makes its section partial, not zero. Every aggregate discloses its sample (N, how
   chosen, what was excluded). GSC, Bing, the rank tracker and vendor estimates define
   their numbers differently - never sum across them; report side by side, each labeled
   with its source. The report synthesizes (impact prioritization, cross-source
   reconciliation) - it never restates tool output the appendix already carries.

## Benchmarks and decision rules
- The shared CTR-by-position and attackable-difficulty tables (opportunity sizing,
  which KD each authority tier can win) live in `references/metered-research-suite.md`
  next to the tools that produce their inputs. The tie-break rule stays here: when in
  doubt check who holds positions 1-5 (`seo_serp_get`) - all major brands means re-scope.
- Striking distance = positions 4-15. The cheapest wins on the board: on-page tune +
  internal links + content additions. Harvest before writing anything net-new, and run
  `seo_cro_audit` on the ones already earning traffic.
- Refresh vs new: URL already ranks 5-30 for the target and `seo_content_decay`
  shows decline -> refresh (update, expand, re-date, re-link). No URL in the top 50
  for the cluster head, or the ranking URL has the wrong intent -> write new. Never
  spawn a second page on the same intent - that manufactures cannibalization.
- Cannibalization action threshold (`seo_cannibalization`): two or more URLs each
  pulling impressions for the same query with neither holding a stable top-5 ->
  consolidate (301 the weaker into the stronger, merge content) or split the intents
  explicitly. If one page clearly wins, leave it alone.
- Expectation setting: new content moves in 3-6 months; refreshes and technical fixes
  can move in 2-6 weeks. Put those windows in the plan so the report never has to
  apologize.

## Pitfalls (cost, data, and property traps)
- Aliased reads ship under two names: `seo_rankings_list` = `seo_list_rankings`
  (identical), `seo_keywords_list` = `seo_list_keywords` (same capability) - call one,
  try the sibling if it rejects an argument shape. NOT aliases: `seo_run_audit` (the
  audit rail these plays use - technical/content/mobile) vs `seo_audit_start` (queues a
  DataForSEO site crawl that may persist nothing - `references/technical-seo-blind-spots.md`
  documents the missing writer; verify `seo_list_audits` shows a NEW row before reading,
  and never report an empty issue list as a clean site).
- `seo_project_get` / `seo_project_update` are NOT the SEO-tracking-project tools: they
  read/write a WEBSITE project's site-level SEO settings and take the builder project
  id - a different id space from the `seo_list_projects` id. Confirm which id you hold
  before any write.
- GSC retains only ~16 months (hence the month-1 baseline capture). Fresh GSC data
  lags ~2 days (data_state 'all' includes still-processing rows).
- sc-domain vs url-prefix: `sc-domain:example.com` covers all subdomains and
  protocols; a url-prefix property covers exactly that prefix. `site_url` must match
  the connected property string exactly or GSC calls return nothing - check
  `seo_connections_list` before debugging "empty" data.
- Rankings: lower position = better; deltas in `seo_gsc_period_comparison` are
  signed accordingly. Do not flip signs in reports.
- Run `seo_sync` after connecting a new source and before reading project metrics.
  `hiveku-data/` snapshots go stale the moment the account moves.
- Nothing client-visible (publishing, sitemap submissions, deploys, GBP replies, GTM
  publishes) without explicit confirmation of THAT exact artifact, not a blanket yes.
  Log every material decision to memory so the next session does not re-litigate it.

## Deep references: load one when the work goes past this file

Each reference below is a full operator manual behind one of the plays above, and each opens with
its own "what this covers" section. Load ONE when the work actually goes there rather than
preemptively: most run 25KB to 35KB.

| Reference | Load it when |
| --- | --- |
| `references/metered-research-suite.md` | About to spend DataForSEO credits: the Play 1/2 catalogs, batch sizes, cost rules. |
| `references/keyword-research.md` | Building a keyword universe, clustering, sizing opportunity, deciding what to target. |
| `references/rankings-and-search-console.md` | Reading GSC/Bing like an analyst: real move vs noise, seasonality, measurement artifact, algorithm update. |
| `references/content-strategy.md` | Deciding what to write, refresh, merge, or retire, and how to brief it. |
| `references/technical-seo.md` | Crawl and index health, Core Web Vitals, rendering, site architecture, anything structural. |
| `references/technical-seo-blind-spots.md` | Before any audit you will report on (load with `technical-seo.md`): the checks that pass per page and fail across the set, which checks Hiveku has no tool for, how to state sample coverage. |
| `references/link-building-and-competitors.md` | Any link work: authority baselines, the opportunity queue, lost-link recovery, competitor sets, and the full Play 5 catalog + outreach program (section 7). |
| `references/local-seo.md` | Before any GBP play: reviews, listings, media, services, citations. |
| `references/outcomes-and-measurement.md` | Any GA4/GTM work or connection setup: conversion audit, standing up a key event, GTM install truth, BYOK connection args. |
| `references/aeo.md` | How the brand appears inside AI answers and answer engines rather than the ten blue links. |
| `references/reporting-and-delivery.md` | When analysis becomes something a client sees or a machine executes: reports, deliverables, workspace destruction semantics, the implement rail and its `agent_approval_*` completion. |
