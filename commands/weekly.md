---
description: "\"How are our rankings this week?\" / \"anything I should know about search traffic?\" / \"what should we do about it?\" - the weekly SEO pass (role: SEO Specialist): rank movements on every lane, the 7-vs-7 Search Console comparison, lost links, the audit delta, competitor changes, the pipeline, and the anomaly rule with the measurement-artifact ladder first; the agency cadence, not a status check. Never re-crawls without a deploy, never names an algorithm update before the ladder, never ships a change from inside the pass."
---
Run this account's weekly pass. Follow the **hiveku-seo-agency** skill; load
`references/seo-playbooks.md` and run Recipe 3 with these arguments.
1. Context: `account_context_get({ domain: "seo" })`, `memory_list({ domain: "seo" })` for the money
   pages, the exact GSC property string and last week's note; `hiveku-data/STATUS.json` for freshness if
   you orient locally.
2. Tracker: `seo_rankings_list({ domain, group_by_keyword: true, limit: 200 })`. Read
   `pagination.total_groups` (the honest keyword count; `total` counts lanes), `current_rank` vs
   `previous_rank` (advances only on a new check day; `check_frequency` defaults to weekly),
   `best_rank`, and `last_checked_at` (over 48 hours on a daily row means the tracker stalled:
   `seo_sync({ project_id })` and re-read, never report a stale rank). A blank AI column means the
   keyword predates the AI engines: untracked, never "not ranking".
3. Top-10 losses, same day: `seo_rankings_list({ view: "history", ranking_id, from_date, to_date })`
   for the shape (one-day spike vs three consecutive checks; a `serp_features` change on the same date
   means the SERP changed shape), then `seo_serp_get({ keyword })` for the stored SERP or
   `seo_research({ action: "serp", keyword, location_code })` when it is stale [SPENDS - class C, one
   per keyword; say the count]. Below a 3-place move on one keyword, write nothing.
4. Search Console: `seo_gsc_period_comparison({ site_url, period_a: { start: <day -17>, end: <day
   -11> }, period_b: { start: <day -10>, end: <day -4> }, dimensions: ["query"], row_limit: 5000 })`,
   then `dimensions: ["page"]`. Read `summary.keys_in_both` first (a collapse against `keys_in_a` is
   coverage, not rankings); `winners` / `losers` and the climbers / droppers are capped at 50 rows, so
   totals come from `summary`; `position_delta` is signed Google-style, negative = improved, never
   flipped. Then `dimensions: ["query","page"]`: one query moving between two pages is a URL swap, not
   a loss (route to `/hiveku:seo-decay`).
5. Links: `seo_new_lost_backlinks({})` reads the MANUAL link-building tracker (no `project_id` on the
   first call; `since` is ignored, filter on `created_at` yourself). Lost links as DataForSEO sees them:
   `backlinks_bulk_new_lost_backlinks({ targets: [<domain>] })` [SPENDS - class D, one request].
   Classify each loss with `web_scrape` (page live and link removed / page 404 / OUR target 404s /
   crawler artifact); an our-fault 404 is a redirect fix today through `/hiveku:seo-fix`.
6. Audit delta: `seo_list_audits({ project_id })` and the newest findings against last week's. Do not
   re-crawl weekly without a deploy or incident. After any deploy this week: `seo_gsc_inspect_url({
   site_url, inspection_url })` on the home page and two money pages, and `seo_core_web_vitals({ url,
   include: "field" })` against the memory baseline (over 15 percent movement is a lead).
7. Competitors: `seo_competitor_changes({})` filtered client-side to this `our_domain` and
   `requires_response: true`; an empty feed with no competitor-change workflow installed means
   monitoring is not running, never "no activity" (offer `workflow_templates_list` to install it).
8. Pipeline: `pm_tasks_list({ project_id })`: what published, refreshed, blocked. `pm_tasks_update`
   the honest status; stalled means escalate, not re-date.
9. Anomaly rule: a money page moving 20 percent or more week over week, or sitewide clicks down 15
   percent with impressions down too, is a same-day investigation. Walk the measurement-artifact ladder
   FIRST (Recipe 9 step 1: the property string matches `seo_connections_list` exactly, connection
   status and `last_error`, `seo_sync`, GSC's ~3-day lag with `data_state: "final"`, local snapshot
   freshness) before any causal story; only then indexation, SERP shape, competitors, and last of all
   an update (Recipe 8). Never let the client find out first.
10. Every change this pass proposes is its own confirmed write in the command that owns it; nothing
    ships from here. Every work item lands as a PM task. Partial sources are reported as partial, never
    zero; every number names its source and window.
11. Close with a five-line "what changed / what's next" note into the `seo` memory by read-merge-write
    (the mechanics are the closing step below).
12. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
