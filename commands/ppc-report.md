---
description: Period-over-period ads report - winners, losers, spend story.
argument-hint: "[days, default 28]"
---
PPC report for the last $ARGUMENTS days (default 28). Follow the **hiveku-ppc-agency** skill
(section 8 is the report contract); budget and pacing depth lives in
`references/bidding-budgets-pacing.md`. Context: `account_context_get({ domain: "ppc" })` for brand
voice, target CPA/ROAS, and protected campaigns.
1. `ppc_digest` first - a stale connection makes every number below it a lie. Its `warnings[]`
   flags connections stale by over 25h: `ppc_sync({ connection_id })` before reading anything else.
   The digest's per-platform `pacing` block is the cross-platform month-pacing read;
   `ppc_pacing_summary` is Google-only and per-campaign - the granular view, never the account view.
2. `ppc_period_comparison` (this window vs prior, scope campaign; Google - non-Google platforms go
   through `ppc_platform_period_comparison`) + `ppc_metrics` (daily series, any platform) -
   winners, losers, CPC movers, conversion trends. Absolute numbers next to every percentage.
3. `ppc_segment_report` - its `dimensions` array replaces a dozen named reports: `dimensions:
   ['hour']` for dayparting, `['day_of_week']` for when in the week, `['device']` for the
   mobile/desktop/tablet split. Pull the two or three cuts that explain this period's story.
4. `ppc_impression_share` (Google only) - report lost-to-budget and lost-to-rank as two different
   stories with two different fixes: high lost-to-budget means raise the budget (the cheapest
   growth there is); high lost-to-rank means raise bids or fix Quality Score, NOT budget.
5. `ppc_google_pmax_performance` (Google only) where PMax runs - per-asset-group metrics plus the
   per-channel split the PMax UI hides (Search vs Search Partners vs Display vs YouTube vs Gmail).
6. Deliverable is BOTH of these, not one:
   - A short client-readable memo: plain language, the numbers that matter, next tests. Where more
     than one platform appears, the memo states the comparability caveat: a Meta "conversion" is
     not a Google "conversion" - report conversions per platform, blend only spend.
   - The branded client-report page: `marketing_report_create` with `include_sections:
     ['overview', 'ppc', 'search_terms', 'calls', 'work_log']`, then `marketing_report_regenerate`
     (the public page renders the stored blob verbatim, so regenerate or the client opens stale
     numbers), then `marketing_report_share_link` for the URL the client opens.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
