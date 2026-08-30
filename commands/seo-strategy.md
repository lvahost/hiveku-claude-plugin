---
description: "\"What should our SEO plan be?\" / \"build us a 6-month roadmap\" / \"what can we expect from SEO?\" - strategy: cluster the qualified universe, score the priority matrix, decide refresh vs new against cannibalization, band the forecast, write the roadmap, get sign-off, then stand up the tracking list. Never quotes a point forecast, never plans a second page on an intent a URL already covers, never tracks a keyword the client has not seen on the list."
argument-hint: "[horizon, default 6 months]"
---
SEO strategy and roadmap ($ARGUMENTS, default 6 months). Follow the **hiveku-seo-agency** skill; load
`references/seo-playbooks.md` and run Recipe 2. Preconditions: `/hiveku:seo-onboard` has run and a
qualified keyword universe sits in a sheet tab from `/hiveku:seo-keywords`; business value per cluster
(do they sell this, here, at this price) is confirmed with the client, not assumed.
1. Context: `account_context_get({ domain: "seo" })` (what they sell, geography, protected terms) and
   `memory_list({ domain: "seo" })` (the competitor set, location code, rejected terms, prior verdicts).
   `seo_list_projects` for the SEO tracking `project_id`.
2. Clusters: `seo_keyword_clusters({ project_id })` reads STORED rows only (empty means nothing saved,
   not that research failed). Audit the grouping for mega-clusters, singleton spray and intent bleed,
   present the structure, then `seo_keyword_cluster_create` per agreed cluster [CONFIRM the list, then
   one write per cluster; `cluster_name` is unique per account and a 409 means it exists]. Pillars:
   `seo_topic_clusters({ project_id })` then `seo_topic_cluster_create` [CONFIRM]; never both cluster
   types on one keyword set. Read back both list tools. Editing or deleting a saved cluster is a
   capability shipping now: see `references/keyword-research.md` Availability; today a wrong cluster is
   recreated under a new name and the old one noted in memory.
3. Priority matrix: SKILL.md's formula (volume x intent weight x business value / difficulty band) with
   the three adjustments in `references/keyword-research.md` 1.5: serviceability (0 or 1), SERP feature
   drag (0.5 to 1.0), asset readiness (0.7 to 1.3). Tear down each top cluster head before committing
   it: `seo_serp_get({ keyword })` for stored rows, or the live SERP via `seo_research({ action: "serp",
   keyword, location_code })` [SPENDS - class C, one per head; say the count]; `seo_serp_features({
   keyword })` for the feature tax. Three or more national brands in the top 5 means re-scope,
   whatever the difficulty number says.
4. Refresh vs new: `seo_cannibalization({ project_id })`, `seo_content_decay({ project_id })` and
   `seo_rankings_list({ domain, group_by_keyword: true, limit: 200 })` against the matrix, applying the
   five-way disposition in `references/content-strategy.md` 1.2. Sequence by time to value: harvest
   striking distance (positions 4 to 15), refresh, fill, build, siege. Never open on net-new pillars.
5. Forecast per `references/forecasting-and-seasonality.md`: the tool method
   (`seo_ranking_predictions({ domain, risk_level, limit })`, linear extrapolation, gated on 8 weeks of
   history and never for a top-3 projection) beside the hand-built method (MSV x seasonal index x CTR at
   target position x feature factor x geo share), presented as a band: plus or minus 30 percent at 90
   days, 50 percent at six months, with "the plan ships on time" stated as the assumption. Never a
   point. Disagreement over 2x between methods is a data problem, not a forecast.
6. Narrative: `talk_to_department({ domain: "seo", message })` with the matrix, the SERP verdicts, the
   disposition list, the technical debt from `/hiveku:seo-technical`, the link lane from
   `/hiveku:seo-links`, and the constraints from step 1. Reconcile every number it returns against the
   call that produced it; its prose is a draft.
7. Deliverable: `seo_deliverable_save({ title, slug: "seo-strategy-<yyyy-mm>", deliverable_type:
   "strategy", status: "draft", target_domain, summary, recommendations })` [CONFIRM]; read `existed`.
   The matrix as `seo_sheet_create_tab({ deliverable_slug, name: "<yyyy-mm> Priority matrix", columns
   })` plus one `seo_sheet_add_rows`, so nobody re-pays for the research next quarter.
8. Sign-off [CONFIRM - the client's yes on the ORDERED roadmap], then `seo_deliverable_update({ id,
   status: "published" })`.
9. Tracking list [CONFIRM - the reviewed list of 20 to 100: about 40 percent money terms, 30 striking
   distance, 20 cluster heads in flight, 10 sentinels]: `seo_track_keyword({ keyword, target_domain,
   location_code })` per keyword, `location_code` explicit for any non-US client. AI-engine lanes cost
   about $0.10 per keyword per engine and are added only on the priority set. Read back
   `seo_rankings_list({ domain, group_by_keyword: true })`: `pagination.total_groups` equals the list
   you approved.
10. Tell the client: the ordered clusters with the reason for each, refresh vs new, the technical debt
    that goes first, the link targets and lane, the band and window per item (striking distance 2 to 6
    weeks, refresh 3 to 8, net-new 3 to 6 months, KD 60 plus a quarter or more). Honesty rules: every
    volume and difficulty comes from a tool call or the sheet tab, never recalled; a missing source
    (no GSC, no DataForSEO) makes its input partial and is named, never filled from priors.
11. File: `pm_tasks_create({ project_id, title, task_type: "seo", due_date })` for month 1 of the
    roadmap; the cluster order, scores, intent verdicts, forecast inputs and tracking convention go to
    memory through the closing step.
12. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
