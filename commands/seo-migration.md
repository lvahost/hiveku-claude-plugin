---
description: "\"We're redesigning the site\" / \"we're moving to a new domain\" / \"the URLs are changing\" - the migration recipe: freeze the before-state, build the URL map, create redirects one row at a time, deploy them to staging and verify, then production, ship canonicals and robots through the code lane, regenerate and submit the sitemap, and watch the index daily for two weeks. Never a blanket redirect to home, never a production deploy without the staging fetch evidence, never deletes a sitemap that still exists at its path."
argument-hint: "[phase: freeze | map | redirects | launch | watch, default the next one]"
---
Site migration ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load `references/seo-playbooks.md`
and run Recipe 6; the redirect and canonical diff discipline is `references/seo-change-discipline.md`.
Preconditions: a full-profile key (`project_*`, `cms_*` and `deploy_site` are not visible to a
marketing-seo key today; a tool outside the profile fails exactly like a missing feature, so say "not
visible to this key"); the WEBSITE project id from `sites_list` (not the `seo_list_projects` id); a
checkpoint via `/hiveku:checkpoint` before anything changes.
1. Context: `account_context_get({ domain: "seo" })`, `memory_list({ domain: "seo" })` for the exact GSC
   property string, protected templates and accepted exclusions; `seo_connections_list` for the
   property; `sites_list` for the project, its tiers and whether staging is enabled.
2. Freeze the before-state into dated sheet tabs (`seo_sheet_create_tab({ deliverable_slug, name:
   "<yyyy-mm> Migration <set>", columns })` plus one `seo_sheet_add_rows` each): the 16-month GSC set
   (`seo_gsc_search_analytics` on `["date"]`, `["query"]`, `["page"]`, `["query","page"]`, `row_limit:
   5000`, paginated with `start_row`); `seo_backlinks_list({ project_id: <SEO id>, limit: 100 })` and
   `backlinks_domain_pages_summary({ target })` [SPENDS - class D, one request] for the pages that hold
   links; `seo_rankings_list({ domain, group_by_keyword: true, limit: 200 })`; `seo_core_web_vitals({
   url, include: "field" })` per template; `seo_schema_markup({ project_id })`; `pages_list({
   project_id: <website id> })`; `seo_gsc_list_sitemaps({ site_url })`.
3. The URL map as a tab: old URL, new URL, status, links, clicks in 28 days, notes. Every old URL with
   clicks or links gets a one-to-one row [CONFIRM the map]; never a blanket redirect to the home page.
4. Redirects: `project_redirects_list({ project_id })` for what exists, then `project_redirect_create({
   project_id, from_path, to_path, status_code: 301, match_type: "exact" })` per row [CONFIRM - each
   rule; a `prefix` rule has blast radius, name it]. The route refuses duplicates, self-loops and chains
   to depth 10; nothing serves until deploy. `project_redirects_deploy({ project_id, tier: "staging" })`
   (a 412 `staging_not_enabled` means enable it in the hosting dashboard first), verify with
   `fetch_url({ url })` on the staging host (`data.url` equals the mapped target in one hop, status
   200), then `project_redirects_deploy({ project_id, tier: "production" })` [CONFIRM - live].
5. Canonicals, noindex and robots through the code lane: `project_files_bulk_get` -> edit ->
   `project_files_bulk_save` in ONE call -> `project_test_build({ use_db_state: true })` ->
   `project_vcs_commit` [CONFIRM] -> `deploy_site({ environment })` [CONFIRM - commit is not live].
   `seo_project_update({ robots_txt_content })` is STORED, never served: the real robots.txt ships as
   `public/robots.txt` and is verified with `fetch_url` on the live URL. Before production,
   `preview_http_get({ project_id, path, headers_only: true })` on the home page and one path per
   template: a staging noindex header is the classic migration killer. Per-page SEO field and schema
   writes: `seo_page_seo_set` and `seo_page_schema_set` (`references/on-page-optimization.md`);
   `pages_update` and the code lane still work.
6. Sitemap: `seo_generate_sitemap({ project_id: <website id> })` returns `{ file_path:
   "public/sitemap.xml", content }`; save it with `project_files_bulk_save`, commit, deploy, `fetch_url`
   the live file, then `seo_gsc_submit_sitemap({ site_url, sitemap_url })` and
   `seo_bing_submit_sitemap({ site_url, sitemap_url })` [CONFIRM]. The old sitemap:
   `seo_gsc_delete_sitemap({ site_url, sitemap_url })` [CONFIRM - only when the file no longer exists
   at that path; deleting destroys the reporting history, not the URLs]. Read back
   `seo_gsc_list_sitemaps` and `seo_bing_list_sitemaps`.
7. Post-launch watch, daily for two weeks: `seo_gsc_index_coverage({ site_url, urls })` in 50-URL
   batches ordered by value (report batch N of M); `seo_gsc_inspect_url` on the home page and money
   pages; `seo_gsc_period_comparison` before vs after on `["query"]` (page keys changed, so `["page"]`
   shows a fictional total loss); `seo_bing_period_comparison({ site_url, period_a, period_b })` as the
   control; lost links via `backlinks_bulk_new_lost_backlinks({ targets: [<domain>] })` [SPENDS - class
   D]; `seo_core_web_vitals` against the frozen baseline at day 28.
8. Mechanical follow-ups on a hosted site may go down the implement rail: `seo_task_implement`
   two-step, then the human's `agent_approval_approve`, never yours; the staged action shows one line of
   prose, so the approver reads the staged diff with `seo_task_changes`
   (`references/reporting-and-delivery.md`).
9. Tell the client: the map and what each old URL now does, that redirects are live on production with
   the fetch evidence, what the sitemap lists, that Google re-evaluates over 2 to 6 weeks with the
   first two watched daily, and which numbers will look wrong during the swap. Honesty rules: coverage
   batches are stated as N of M; a rule saved but not deployed is not live; a check that could not run
   (production headers) is named; partial never zero.
10. File: `pm_tasks_create({ project_id, title, task_type: "seo" })` per unresolved coverage bucket and
    per lost link worth chasing; the cutover date, the map's tab name, the sitemap paths and accepted
    exclusions go to memory through the closing step.
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
