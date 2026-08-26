---
name: hiveku-seo-agency
description: Full SEO agency methodology for operating a Hiveku account. Use for ANY SEO work - keyword research, technical or content audits, rank tracking and ranking movements, content gaps, decay, cannibalization, on-page and schema fixes, backlinks and link building, competitor intelligence, local SEO and Google Business Profile, AEO, and weekly checkups or monthly SEO reports and deliverables.
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
- Confirm before writes. Summarize what you are about to create, update, publish, or
  submit and get a yes first. Tracking a keyword is cheap and reversible; publishing
  pages, submitting sitemaps, and deploying are not.
- `hiveku-data/seo/*.json` (projects, keywords, rankings, backlinks, audits,
  competitors) is the local snapshot - read it for orientation, but use live tools for
  anything current or decision-grade. Same for `hiveku-data/localseo/*.json` and
  `hiveku-data/aeo/audit.json`.
- Generative or strategic output (briefs, strategy docs, page copy) ->
  `talk_to_department({ domain: 'seo', message })`, then persist with the matching
  direct tool. Pure reads and CRUD -> direct tools.
- Metered tools cost real money per call: `dataforseo_labs_*`, `backlinks_*`,
  `serp_*`, `on_page_*`, `keywords_data_*`, `seo_aeo_audit_run`. Batch inputs,
  persist results into deliverable sheets, never re-pull data that has not changed.
- Nearly every `seo_*` tool takes `project_id` from `seo_list_projects`. If there
  is no project or no data sources, follow the SEO department SETUP.md first
  (`seo_connections_list`, `seo_create_project`, GSC OAuth, Bing API key) - do not
  improvise the connect flow.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising anything)
1. Context: `account_context_get({ domain: 'seo' })`, then `seo_list_projects` ->
   project_id, and `seo_connections_list` -> which sources exist (DataForSEO / GSC /
   Bing / GBP). Missing sources cap what you can honestly report - fix that first.
2. Fresh data: `seo_sync({ project_id, full: true })` pulls metrics + rankings from
   all configured connections.
3. Audits: `seo_run_audit({ project_id, audit_type: 'technical' })` and
   `seo_run_audit({ project_id, audit_type: 'content' })` (add 'mobile' for
   consumer-facing sites) -> `seo_audit_get({ audit_id })` once each completes.
4. GSC history - capture the FULL 16-month window now (that is all Google retains;
   this is your only chance to baseline it):
   - Trend: `seo_gsc_search_analytics({ site_url, start, end, dimensions: ['date'] })`
     across 16 months.
   - Demand map: `dimensions: ['query']` and `['page']` with `row_limit: 5000`;
     `['query','page']` answers which query drives which page.
5. Authority baseline: `backlinks_summary({ target })` for the domain AND each named
   competitor - one row per domain in the baseline sheet.
6. Competitor set: `dataforseo_labs_google_competitors_domain({ target })` for
   SERP-overlap competitors; cross-check against who the client THINKS competes (they
   are usually different lists - both matter). Persist the agreed set with
   `seo_add_competitor`; read back via `seo_list_competitors`.
7. Record the baseline as a deliverable (`seo_deliverable_save` with
   deliverable_type 'audit') and write headline facts to `memory_create`: domain,
   GSC property string, competitor set, traffic level, top pages, constraints.

### Strategy (weeks 2-3)
Build the keyword universe (Play 1), cluster it, score it into a priority matrix.
Output: a 6-month roadmap deliverable - which clusters in what order, refresh vs new,
technical debt to clear, link targets, expected impact per item. Get client sign-off,
then `memory_create` the decisions and `pm_tasks_create` the first month of work.

### Execution -> cadence
Run the plays below as tasks. The weekly checklist keeps the account healthy; the
monthly report proves the value. Never let a week pass without something shipping.

## Play 1 - Keyword research (the crown jewel)
Hiveku carries the full DataForSEO Labs suite. Work seed -> universe -> qualified ->
clustered -> prioritized -> tracked.

Expansion (batch seeds - do not call once per seed):
- `dataforseo_labs_google_keyword_ideas({ keywords: [...seeds], location_name,
  language_code, limit })` - category-relevant ideas, up to 200 seeds per call.
- `dataforseo_labs_google_keyword_suggestions` - long-tail phrases containing the seed.
- `dataforseo_labs_google_related_keywords` - depth-first related graph
  (people-also-search expansion).
- `dataforseo_labs_google_keywords_for_site({ target })` - what the domain (or a
  competitor domain) already surfaces for. Run on us AND top competitors.

Qualification (dedupe the union first, then qualify in bulk):
- `dataforseo_labs_bulk_keyword_difficulty` - KD 0-100, hundreds of keywords per call.
- `dataforseo_labs_search_intent` - informational / navigational / commercial /
  transactional, in bulk.
- `keywords_data_google_ads_search_volume` - Google Ads-grade volumes when precision
  matters (labs volumes are fine for sorting).
- `dataforseo_labs_google_keyword_overview` - deep-dive ONE keyword (volume, CPC,
  difficulty, SERP info). Per-keyword cost - use sparingly, for finalists only.

Clustering and prioritization:
- `seo_keyword_clusters({ project_id })` - intent + semantic clusters.
- `seo_topic_clusters({ project_id })` - hub-and-spoke pillar mapping (pillar page +
  cluster keywords). Plan one pillar + spokes per priority cluster.
- Priority score per cluster:
  volume x intent weight x business value / difficulty band, where intent weight is
  transactional 1.0, commercial 0.8, informational 0.4, navigational 0.1, and business
  value is client-confirmed 1-3 (do they sell this?). Rank descending - that ordering
  IS the roadmap.
- Persist the matrix into the strategy deliverable via
  `seo_sheet_create_tab({ deliverable_slug, name, columns, rows })` so nobody re-pays
  for the same research next quarter.

Track the winners: `seo_track_keyword({ keyword, target_domain })` for every priority
keyword (goal_id auto-derives from the domain so they group; location_code defaults
2840/US). Review with `seo_tracked_keywords_list`, prune with
`seo_tracked_keyword_delete`. Track 20-100 keywords, not 1000 - track what you report on.

## Play 2 - Competitor intelligence
- `dataforseo_labs_google_competitors_domain({ target })` - who overlaps us in the
  SERPs, with metrics and intersection counts.
- `dataforseo_labs_google_serp_competitors({ keywords })` - who owns the SERPs for a
  specific keyword set (use on a priority cluster before writing for it).
- `dataforseo_labs_google_domain_intersection({ target1, target2 })` - THE gap tool:
  keywords they rank for that we do not. Filter to their positions 1-20 and our
  position absent/>30; feed the winners straight into Play 1 qualification.
- `dataforseo_labs_google_ranked_keywords({ target })` - a competitor's full keyword
  footprint; sort by estimated traffic to find their money pages.
- `dataforseo_labs_google_domain_rank_overview({ target })` - domain-level standing;
  `dataforseo_labs_google_historical_rank_overview` for trajectory;
  `dataforseo_labs_bulk_traffic_estimation` to size several rivals in one call.
- Link gaps: `backlinks_domain_intersection` (domains linking to 2+ competitors but
  not us = warmest outreach list) and `backlinks_competitors({ target })` (domains
  sharing our link profile).
- Monitoring: `seo_competitor_changes({ project_id })` surfaces detected changes on
  tracked competitor sites - review weekly; brief the client when a rival ships
  something material.

Deliverable: quarterly competitor teardown (`seo_deliverable_save`, type
'competitor_analysis') - their clusters, publishing velocity, link velocity, and our
counter-moves.

## Play 3 - Content and on-page
Find opportunities (all project-scoped DB reads - cheap, run freely):
- `seo_content_gaps({ project_id, competitor_domain })` - topics a competitor covers
  that we do not.
- `seo_content_decay({ project_id })` - pages losing organic clicks = the refresh
  queue. Refresh beats new (see decision rules).
- `seo_cannibalization({ project_id })` - multiple URLs competing for one query;
  consolidate or differentiate (thresholds below).
- `seo_internal_links({ project_id })` - link-graph opportunities; point authority at
  striking-distance pages first.
- `seo_eeat_scores({ project_id })` - per-page E-E-A-T weak spots (bylines,
  citations, trust signals) - fix on money pages first.
- `seo_schema_markup({ project_id })` - detected vs suggested structured data.
- `seo_featured_snippets({ project_id })` - winnable snippet targets; verify the
  snippet format with `seo_serp_get({ keyword })` or
  `seo_serp_features({ project_id, keyword })` before formatting the answer block.

Inspect any URL on demand (works on competitor pages too - ideal for outline
benchmarking before a brief):
- `on_page_instant_pages({ url })` - full on-page check: title, meta, headings,
  load metrics.
- `on_page_content_parsing({ url })` - extracted content structure.

Briefs and drafts: `talk_to_department({ domain: 'seo', message })` with the target
cluster, SERP intent evidence, top-3 competitor outlines, internal-link targets, and
required schema. A brief without SERP evidence is a guess. Persist briefs/drafts with
`content_create` or as deliverables.

Ship fixes where the site actually lives:
- Hiveku-hosted pages: `pages_list` -> `pages_update` (titles, meta, slugs, SEO
  fields); CMS-driven content via `cms_list_collections` / `cms_read_entry` /
  `cms_write_entry`.
- Code-level changes (templates, JSON-LD schema, redirects): download the project,
  edit, `project_files_bulk_save` in ONE call, `project_vcs_commit`, verify the
  build, and `deploy_site` only after approval. Commit is not live.

After shipping: note the date, then use `seo_gsc_time_series` with a page filter
(e.g. { dimension: 'page', operator: 'contains', expression: '/blog/' }) to prove the
change worked in the next report.

## Play 4 - Technical SEO
- `seo_run_audit({ project_id, audit_type: 'technical' })` monthly; 'content'
  quarterly; 'mobile' when UX matters. History via `seo_list_audits`; findings via
  `seo_audit_get({ audit_id })`.
- Triage on a severity x effort matrix:
  1. Crawl blockers, accidental noindex, broken canonicals, redirect chains, 5xx -
     high severity, usually low effort. Fix this week.
  2. Template-level issues (one fix, many pages) - high leverage. Fix this sprint.
  3. Page-by-page cosmetics - batch into content refreshes, never as standalone work.
  Turn each accepted fix into `pm_tasks_create` - an audit without tickets is a PDF,
  not a service.
- Speed and rendering signals surface in the technical audit and in
  `on_page_instant_pages` load metrics. Treat a slow template as ONE ticket, not N
  page tickets.
- Indexation:
  - `seo_gsc_index_coverage({ site_url, urls })` - buckets URL Inspection results by
    coverage_state. Capped at 50 URLs per call - batch the sitemap or top pages.
  - `seo_gsc_inspect_url({ site_url, inspection_url })` - single-URL deep dive
    (indexability, mobile usability, rich results). It inspects the indexed snapshot
    only; there is no live-test via the API.
  - "Discovered/Crawled - currently not indexed" at scale is a quality or
    internal-linking problem, not a submission problem. Fix the page, then resubmit.
- Sitemaps: `seo_generate_sitemap({ project_id })`, then `seo_gsc_submit_sitemap`
  and `seo_bing_submit_sitemap` (single URLs: `seo_bing_submit_url`). Verify with
  `seo_gsc_list_sitemaps`.

## Play 5 - Authority and links
Profile (target = any domain, ours or theirs):
- `backlinks_summary` - topline backlinks, referring domains, rank. Run monthly for
  us + the competitor set.
- `backlinks_backlinks` - individual links, filterable; `backlinks_referring_domains`
  - domain-level rollup.
- `backlinks_anchors` - anchor-text distribution; flag over-optimized exact-match
  anchors before they become a problem.
- `backlinks_bulk_spam_score` - spam scores in bulk. A spike in high-spam referrers
  is a hygiene item, not a panic item.
- `backlinks_timeseries_new_lost_summary` - new/lost trend over time;
  `seo_new_lost_backlinks({ project_id, since })` - project-scoped delta since the
  last review.

Prospecting:
- `seo_backlink_opportunities({ project_id })` - built-in gap analysis against
  tracked competitors.
- `backlinks_domain_intersection` - who links to multiple competitors but not us.
- `backlinks_page_intersection` - who links to the competitor PAGES ranking for our
  target keyword (link gap for a single SERP - the highest-relevance list there is).
- Digital-PR angles: `talk_to_department({ domain: 'seo', message })` with the
  client's assets (proprietary data, tools, expertise) to generate campaign angles
  worth a link. Persist chosen angles as pm tasks with owners and deadlines.

Rule: links to money pages arrive slowly and look unnatural when forced. Aim campaigns
at linkable assets, then route the authority internally (`seo_internal_links`).

Running the outreach (cross-discipline with Outbound - this is a paid agency service):
1. Build the target list from the prospecting tools above. For each domain record WHY
   it should link: which of our pages/assets, and the competitor link that proves the
   relevance (from `backlinks_page_intersection`).
2. Find the human: `web_search` / `web_scrape` the site for author, editor or
   contact pages; for local prospects `seo_research({ action: 'gbp-locations', query,
   location_name })` finds businesses by query and `seo_research({ action: 'gbp-info', domain })`
   (or `target` / `place_id`) returns one business's snapshot. Both spend DataForSEO credits
   under the account's monthly SEO research cap - confirm the spend with the human before
   calling. Verify addresses before loading - list quality IS deliverability.
3. Hand the list to the outbound program (the `hiveku-outbound-agency` skill has a
   dedicated "Backlink outreach campaigns" section): contacts loaded via
   `crm_contacts_bulk_create` tagged link-outreach, a Smartlead campaign for the
   sends, pitch copy per segment via `talk_to_department({ domain: "outbound" })`.
4. Track wins here: replies flow through the outbound triage loop; verify placements
   with `backlinks_backlinks` / `seo_new_lost_backlinks`; log each won link
   (`crm_create_activity`) and report links-won + cost-per-link in the monthly report.

## Play 6 - Local SEO (clients with physical locations or a service area)
- Data sources first: `seo_connections_list` must show GBP + GSC connected. If not,
  follow the Local SEO department SETUP.md (GBP OAuth -> `seo_gbp_discover_locations`
  -> `seo_connection_update` with gbp_account_id + gbp_location_id).
- GBP health: `seo_gbp_insights({ connection_id })` (website clicks, calls,
  direction requests - Maps vs Search) and `seo_gbp_reviews({ connection_id })`
  (rating trend, unanswered reviews).
- Review replies ARE tool-driven: `seo_gbp_review_reply({ connection_id, review_id, reply })`.
  The first call WITHOUT `confirm` publishes nothing - it returns a preview (reply text and
  length, the review, the connection) with `requires_confirm: true`; repeat the IDENTICAL call
  with `confirm: true` to publish. Max 4096 chars, it REPLACES any existing owner reply, and it
  posts publicly on the client's live listing. One review at a time, never looped.
  `seo_gbp_review_reply_delete({ connection_id, review_id })` removes a reply on the same
  two-step confirm.
- GBP POSTS (What's New, offers, events) have no tool in this lane by design - publish them via
  `social_create_post` with platform `google_business_profile`, which goes through the approval
  queue. Do not claim to have posted from here.
- The full review, listing, media, services and citations plays are in
  `references/local-seo.md`; load it before running any of them.
- Local performance: `seo_local_search_performance({ days: 90, source: 'all' })`
  summary; `seo_local_top_queries` / `seo_local_top_pages` (GSC + Bing merged);
  `seo_local_rank_changes({ days: 30, min_drop: 3 })` for drops;
  `seo_local_rank_history` and `seo_local_compare_periods` for trends.
- Track "keyword + city" terms with `seo_track_keyword` like any other priority
  keyword; build or refresh location and service-area pages through Play 3.

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

## Weekly cadence (every week, ~30 minutes of tool time)
1. `seo_rankings_list({ project_id, limit: 200 })` - movements on tracked keywords.
   Investigate any top-10 loss the same day: check the URL, the live SERP via
   `seo_serp_get`, and `seo_competitor_changes`.
2. `seo_gsc_period_comparison` (last 7d vs prior 7d, dimensions ['query'] then
   ['page']) - winners/losers and rank climbers/droppers. Position deltas are signed
   Google-style: negative = improved.
3. `seo_new_lost_backlinks({ project_id, since: <last week> })` - lost links from
   real pages get a reclamation task; new links get logged for the report.
4. Audit delta: anything new in `seo_audit_get` since the last run? Broken deploys
   show up here first.
5. Pipeline: `pm_tasks_list` - what published, what refreshed, what is blocked.
   Update statuses honestly; stalled = escalate.
6. Anomaly rule: any traffic move > 20 percent WoW on a money page = same-day
   investigation (indexation via `seo_gsc_inspect_url`, SERP-feature shifts,
   competitor launches). Never let the client find out first.

**Install the recurring ones instead of re-deriving them.** Several of these plays ship as
workflow templates: lost-backlink alert, tech-audit regression, rank-drop response,
content-decay refresh, monthly AEO visibility, GBP review SLA, weekly GBP post draft, and a
Core Web Vitals watch. `workflow_templates_list` → `workflow_create_from_template({ slug,
overrides })` installs one per client. Read the template's `variables[]` first (each has a
key, a type, and a required flag); a missing required variable fails with a 400. The tool
defaults `is_enabled: true`, so confirm with the operator or pass `is_enabled: false` and
enable after review. Full manual: the `hiveku-automation-agency` skill.

## Monthly report (the artifact the retainer pays for)
1. Shell: `seo_deliverable_save({ title: 'SEO Monthly Report - <Month Year>',
   slug: 'seo-monthly-<yyyy-mm>', deliverable_type: 'monthly_report', target_domain,
   summary })`.
2. Sections via `seo_report_add_section({ deliverable_slug, title, content })`
   (markdown body), in this order:
   - Executive summary - 5 bullets max: headline metric, biggest win, biggest risk,
     what we did, what is next. Written last, placed first.
   - Rankings movement - from `seo_rankings_list` + `seo_gsc_period_comparison`
     (MoM): climbers, droppers, striking-distance list for next month.
   - Organic traffic - `seo_gsc_time_series` MoM and YoY (YoY keeps you honest about
     seasonality), top pages and queries, annotated with ship dates.
   - Authority - `backlinks_summary` delta, notable new/lost links, outreach status.
   - Work completed - from completed pm tasks; link every shipped URL.
   - Next month plan - the roadmap slice, expected impact per item.
   - (Local clients: a Local section from `seo_gbp_insights` +
     `seo_local_compare_periods`.)
3. Data appendices as sheet tabs: `seo_sheet_create_tab` / `seo_sheet_add_rows` for
   the full keyword table - keeps the narrative readable.
4. Revise with `seo_report_update_section`; `seo_report_clear` rebuilds sections
   only (tabs survive). Check `seo_automated_reports({ project_id })` - if a
   scheduled report exists, align with it rather than duplicating.
5. Numbers must reconcile: every figure in the narrative must be reproducible from a
   named tool call. No vibes.

## Benchmarks and decision rules
- CTR by position (blended averages - for opportunity sizing, never promises):
  p1 ~28%, p2 ~15%, p3 ~10%, p4 ~7%, p5 ~5%, p6-10 ~2-4%, page 2 <1%.
  Opportunity = volume x CTR(target position) - current clicks.
- Attackable difficulty by authority tier (KD from
  `dataforseo_labs_bulk_keyword_difficulty`, authority from `backlinks_summary`
  rank): new/weak domains -> KD 0-20 long-tail only; mid-authority -> up to ~40;
  strong -> up to ~60; KD 60+ needs a dedicated content + link campaign and a quarter
  of patience. When in doubt check who actually holds positions 1-5
  (`seo_serp_get`) - if it is all major brands, re-scope.
- Striking distance = positions 4-15. The cheapest wins on the board: on-page tune +
  internal links + content additions. Harvest these before writing anything net-new.
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
- DataForSEO-metered calls (`dataforseo_labs_*`, `backlinks_*`, `serp_*`,
  `on_page_*`, `keywords_data_*`, `seo_aeo_audit_run`) bill per request. Batch
  (keyword_ideas takes up to 200 seeds; bulk difficulty takes hundreds of keywords),
  persist results to deliverable sheets, and re-pull volumes/difficulty monthly at
  most - they do not change daily.
- GSC retains only ~16 months. The month-1 baseline pull is your one chance to capture
  the full window - store the aggregates in the baseline deliverable. Fresh GSC data
  lags ~2 days (data_state 'all' includes still-processing rows).
- sc-domain vs url-prefix: `sc-domain:example.com` covers all subdomains and
  protocols; a url-prefix property covers exactly that prefix. `site_url` must match
  the connected property string exactly or GSC calls return nothing - check
  `seo_connections_list` before debugging "empty" data.
- `seo_gsc_index_coverage` fans out URL Inspection, max 50 URLs per call - batch it
  and expect it to be slow.
- Rankings: lower position = better; deltas in `seo_gsc_period_comparison` are
  signed accordingly. Do not flip signs in reports.
- Run `seo_sync` after connecting a new source and before reading project metrics.
  `hiveku-data/` snapshots go stale the moment the account moves - re-export after
  material changes.
- Nothing client-visible (publishing, sitemap submissions, deploys, emails) without
  explicit confirmation. Log every material decision with `memory_create` so the
  next session does not re-litigate it.
