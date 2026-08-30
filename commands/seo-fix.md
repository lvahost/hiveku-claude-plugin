---
description: "\"Fix the SEO issues on the site\" / \"the audit found problems, ship the fixes\" / \"our titles and metas are all wrong\" - the audit-to-fix loop: take the crawl and index findings, route each fix to the ONE write path that actually changes the live page, run the pre-flight card before every write, verify on the live URL, and report each fix as 'fixed, awaiting recrawl'. Never fixes anything through seo_schema_markup (a read), never bulk-applies an audit list, never approves its own staged deploy."
argument-hint: "[site or focus, optional]"
---
SEO fix loop ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/on-page-optimization.md` (its section 1 is the write-path matrix that decides where every
fix ships) and run the pre-flight card from `references/seo-change-discipline.md` before the first
write of the session.
1. Context: `account_context_get({ domain: "seo" })`, then `memory_list({ domain: "seo" })` for
   protected templates, accepted exclusions ("the /legacy tree is intentionally noindexed") and the
   exact GSC property string. Two id spaces: `seo_list_projects` gives the SEO tracking id (audits,
   keywords); `sites_list` gives the WEBSITE project id (`pages_*`, `project_*`, `deploy_site`). Say
   which one every call below takes.
2. Findings: `seo_list_audits({ project_id })` then `seo_audit_get({ audit_id })` for the newest crawl
   (the lane persists, live since 2026-08-30); an empty list means no crawl has run: start one with
   `seo_audit_start({ project_id, target_url, max_crawl_pages })` [SPENDS - class F per page; state the
   count against `web_map({ url })`] and read it through `seo_research` with `target` = the returned
   task id and `action` `non-indexable`, `redirect-chains`, `internal-links` (each returns
   `crawl_status { pages_crawled }`; empty items on a finished crawl means none found, state the
   sample), `duplicate-tags` (title-only) and `duplicate-content` (REQUIRES `url`, the page to compare)
   [SPENDS - class B per request], plus `instant-page` with `url` on one page per template [class E].
   Never read an empty audit list as a clean site. Add `seo_gsc_index_coverage({ site_url, urls })` on
   the top 50 URLs by value (batch 1 of M, say so) and `seo_schema_markup({ project_id })`, which is a
   READ of detected vs suggested markup and changes nothing.
3. Rank: priority = (severity x blast radius) / effort, per `references/technical-seo.md` 1.2. Think in
   templates: 380 findings sharing a path prefix are ONE ticket. Present the ranked list and take the
   client's yes on WHICH fixes ship [CONFIRM the list].
4. Route each accepted fix to its write path (section 1 of the reference): a pages-model title, meta,
   slug or SEO field -> `pages_update` (only the fields you pass change); a CMS entry ->
   `cms_write_entry`; a template, JSON-LD block, canonical, robots directive or redirect -> the code
   lane: `project_files_bulk_get` -> edit -> `project_files_bulk_save` in ONE call ->
   `project_test_build({ use_db_state: true })` -> `project_vcs_commit` -> `deploy_site`, or
   `/hiveku:code` when the project is downloaded here; redirects -> `project_redirect_create({
   project_id, from_path, to_path, status_code: 301, match_type: "exact" })` then
   `project_redirects_deploy({ project_id, tier })`; a narrow mechanical page edit on a hosted site ->
   `seo_task_implement` (two-step, human `agent_approval_approve`, never yours). `seo_project_update({
   robots_txt_content })` only fills in at the next deploy, where the code ships no robots source: a
   real robots.txt is `public/robots.txt` through the code lane. On a marketing-seo key `cms_*`, `project_*` and `deploy_site` are not visible: say "not
   visible to this key", use `pages_update` or the implement rail, never "does not exist".
5. Pre-flight card before EACH write [CONFIRM - one artifact per yes]: the object and its id space, the
   exact before/after diff, blast radius (pages and templates touched), reversibility, the verification
   call and its date. Anything index-affecting (canonical, noindex, robots, redirects, sitemap, deploy)
   and anything on a protected template needs its own explicit yes; never a blanket one.
6. Verify on the live URL, never on the 200: `fetch_url({ url })` and read `status`, `data.url` (a
   redirect must land on the target in one hop) and the changed element in the body. Before a deploy on
   a hosted site, `preview_http_get({ project_id, path, headers_only: true })` on the home page and one
   path per template catches a noindex header shipping to production.
7. Report each fix as "fixed, awaiting recrawl". Only after the fix is live: `seo_gsc_submit_sitemap({
   site_url, sitemap_url })` or `seo_bing_submit_url({ site_url, url })` to accelerate discovery
   [CONFIRM]; submission is never the fix. `seo_gsc_inspect_url` re-verifies after 3 to 14 days (indexed
   snapshot only). A re-crawl to prove it is `seo_audit_start` plus `instant-page` [SPENDS], never
   weekly without a deploy.
8. Track: `seo_track_keyword({ keyword, target_domain, location_code })` for the pages you fixed
   [CONFIRM the reviewed list; `location_code` explicit for non-US]; read back `seo_rankings_list({
   domain, group_by_keyword: true })` and note the date for the next report's before/after.
9. Honesty rules: every finding carries its denominator (N URLs examined of how many, batch N of M); a
   check you could not run (production response headers) is reported at the same weight as a finding;
   a failed source makes a section partial, never zero; a fix is "shipped" only after step 6.
10. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
