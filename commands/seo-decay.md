---
description: "\"Our old posts don't get traffic anymore\" / \"two of our pages are fighting for the same search\" / \"which content should we refresh?\" - the decay and cannibalization sweep: pull the Sunday sweep's rows, run the cause test on each candidate, assign one of five dispositions (leave, refresh, rewrite, consolidate, new), brief the survivors, and file a consolidation's 301s through project_redirect_create on a confirmed list. Never refreshes a stable top-3 page, never deletes a page without a redirect, never lets a generated draft reach a live site unread."
argument-hint: "[domain or section, optional]"
---
Content decay sweep ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/content-strategy.md` (1.2 the five-way disposition, 1.6 the cause test, Plays C2 and C3).
Recipe 11 of `references/seo-playbooks.md` is the monthly sprint this feeds.
1. Context: `account_context_get({ domain: "seo" })` and `memory_list({ domain: "seo" })` for money
   pages, protected pages, the consolidation map already agreed, and intent verdicts.
2. Rows: `seo_content_decay({ project_id })` and `seo_cannibalization({ project_id })`. Both are
   account-scoped (the route ignores `project_id`), capped at the worst 30, and forward no filters:
   filter to this domain yourself. A `note` saying no analysis exists means NOT ANALYZED, never clean;
   `last_analyzed_at` older than 8 days means the sweep skipped the account; empty with GSC unconnected
   means "cannot see decay until this is fixed", plus a task. Copy `peak_traffic`, `current_traffic`,
   `traffic_decline_pct` and `top_declining_keywords` into your notes now: resolved rows self-delete
   on the next run.
3. Cannibalization FIRST (refreshing one of two competing pages just moves the split). Per finding,
   `seo_serp_get({ keyword })`: same intent, or two legitimate pages sharing a long-tail query?
   Consolidate onto `recommended_primary_url` only when neither page is stable in the top 5; if one
   clearly wins, leave it and retitle the loser toward its own intent.
4. Cause test per decay survivor: one `seo_serp_get` on the highest `clicks_lost` query (stale stored
   rows: `seo_research({ action: "serp", keyword, location_code, device: "mobile" })` [SPENDS - class
   C, one per page; say the count first]). Read `peak_avg_position` vs `current_avg_position`: flat with
   clicks down hard means the SERP changed around the page (layout shift, route to `/hiveku:aeo`);
   down 3 or more means it was beaten (staleness or displacement, a refresh). A different content type
   in the top 5 is an intent shift (rewrite, not refresh). A redeploy, noindex or vanished link block
   is self-inflicted: `/hiveku:seo-technical`, not copy.
5. Disposition per URL from the five-way table (leave / refresh / rewrite / consolidate / new), tier
   from the depth ladder, and the priority score `recoverable x confidence x business_value / effort`.
   A stable top-3 page is never in the cohort. Present the cohort [CONFIRM which URLs proceed].
6. Briefs: `on_page_content_parsing({ url })` on the top 3 for the outline benchmark [SPENDS - class E,
   three per page], then `talk_to_department({ domain: "seo", message })` carrying the declining-keyword
   table verbatim, peak vs current, the benchmark, internal-link targets from `seo_internal_links({
   project_id })`, schema, tier and the voice rules. Persist each with `content_create` [CONFIRM]. The
   client sees the brief before the draft and the draft before it ships; invented statistics are the
   standard failure, so nothing generated reaches a live page unread.
7. Consolidation: name every source URL, the target and the redirect type, then
   `project_redirect_create({ project_id: <website id>, from_path, to_path, status_code: 301,
   match_type: "exact" })` per losing URL [CONFIRM - each rule], `project_redirects_deploy({ project_id,
   tier })` [CONFIRM - nothing serves until this runs], verify with `fetch_url` (`data.url` equals the
   target in one hop), then re-point internal links through the write path
   `references/on-page-optimization.md` section 1 assigns. Never delete a page: that throws away its
   links. On a marketing-seo key the redirect tools are not visible: file the rules as a task, verbatim.
8. Tasks: `pm_tasks_create({ project_id, title, description, task_type: "seo" })` per refresh and per
   consolidation, flat (never `parent_task_id`), with the before-numbers and the disposition in the
   body. Memory: the consolidation map by read-merge-write so a future session does not rebuild a page
   you redirected.
9. Proof at 28 days: `seo_gsc_time_series({ site_url, start, end, filters: [{ dimension: "page",
   operator: "equals", expression: <url> }] })` beside the same call unfiltered (the site moving the
   same amount means you shipped nothing), and the decay row vanishing after the next sweep.
10. Honesty rules: a vanished row is not proof (rows also vanish below the 100-impression floor); the
    cohort is 30 rows at most and says so; recovery is quoted as the tier's band, never a promise; a
    failed read makes the sweep partial, never "no decay".
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
