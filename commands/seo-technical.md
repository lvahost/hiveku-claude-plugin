---
description: "\"Is the site technically healthy?\" / \"why aren't our pages getting indexed?\" / \"run a technical SEO audit\" - the technical pass: the T1 baseline or T2 regression sweep, the blind-spots checklist (response headers, the canonical graph, redirect chains, near-duplicate templates, thin pages, index truth), and a coverage statement of N URLs examined out of how many. Read-only: every fix goes to /hiveku:seo-fix or a task; nothing is deployed, submitted or deleted from here."
argument-hint: "[baseline | regression, default regression when a prior audit exists]"
---
Technical SEO pass ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/technical-seo.md` (the CIRR ladder, Plays T1 and T2, the thresholds) together with its
adversarial companion `references/technical-seo-blind-spots.md` (the hub says to load them as a pair:
section 0 is the coverage contract, section 8 the checklist). Read-only throughout.
1. Context: `account_context_get({ domain: "seo" })`, `memory_list({ domain: "seo" })` for the exact
   GSC property string, the CWV baseline with its date, the last audit id, protected templates and
   accepted exclusions. `seo_list_projects` for the SEO tracking id; `sites_list` for the WEBSITE
   project id; `seo_project_get({ project_id: <website id> })` for site-level settings;
   `seo_connections_list`: without Search Console this is a crawl opinion, not an indexation report,
   and the output says so.
2. The denominator before any finding: `web_map({ url, limit: 5000 })` for the URL universe,
   `fetch_url` on the live sitemap.xml for its count (200 KB body cap, one fetch per child of an
   index), group URLs into template families, then write the coverage block from blind-spots section
   0. Every later finding carries its N.
3. Crawl: `seo_list_audits({ project_id })`; a crawl inside 14 days is reused. Otherwise
   `seo_audit_start({ project_id, target_url, max_crawl_pages })` [SPENDS - class F per page; default
   50, clamp 500; state the count against step 2 and get the yes]. It returns `{ task_id, status:
   "queued" }`, persists nothing you can list, and a 25-page crawl finishes in about 4 minutes. Read it
   through `seo_research` with `target` = that task id: `non-indexable`, `redirect-chains`,
   `internal-links` and `keyword-density` return results with `crawl_status { pages_crawled }` (empty
   items on a finished crawl means none found in the pages crawled: state the sample);
   `duplicate-content` REQUIRES `url` (the page to compare) or returns an empty array;
   `duplicate-tags` is title-only [SPENDS - class B per request]; `instant-page` takes `url`, one page
   per template [class E]; `lighthouse` takes `url` when a lab score is wanted. An affected count of
   exactly 100 means 100 or more. Never read an empty audit list as a clean site.
4. Index truth: `seo_gsc_index_coverage({ site_url, urls })` on batch 1 of M, value-ordered (home,
   money pages, one per template, then top clicks); read `indexing_state` (a noindex header vs tag vs
   robots), `user_canonical` vs `google_canonical`, `robots_txt_state`, `page_fetch_state`. Deep-dive
   the odd ones with `seo_gsc_inspect_url({ site_url, inspection_url })` (indexed snapshot only).
   Second engine: `seo_bing_inspect_url({ site_url, url })` and `seo_bing_crawl_stats({ site_url })`.
   Sitemaps: `seo_gsc_list_sitemaps({ site_url })` and `seo_gsc_get_sitemap` for submitted vs indexed.
5. Headers: no Hiveku tool reads a production X-Robots-Tag. On a hosted project,
   `preview_http_get({ project_id, path, headers_only: true })` on the home page and one path per
   template (preview tier only) and `project_files_search({ project_id, query: "X-Robots-Tag" })` plus
   `noindex` in `next.config.*` and `middleware.*` for over-broad matchers. The production check is an
   EXTERNAL row: report it as not checked, with the one-line escalation from blind-spots section 2.
6. Canonicals and redirects: `project_redirects_list({ project_id })` and walk the rule graph for
   chains, loops and dead terminals (exclude `is_active: false`, expand prefix rules); `web_crawl({ url,
   limit, scrapeOptions: { formats: ["rawHtml"], onlyMainContent: false } })` for the canonical graph
   across the set (to-redirect, to-noindex, to-404, chains, loops, host and protocol drift); `fetch_url`
   on live URLs that matter (`data.url` differs from the input means a redirect happened; hop count is
   not reported below 5). Live chain depth is EXTERNAL: say so.
7. Near-duplicates and thin pages: `web_crawl` with `formats: ["markdown"], onlyMainContent: true`
   over a sample per template family; the substitution test on two members of each family (swap the
   city or service token, diff what remains), word-count buckets, unique share as a sentence a client
   acts on. Corroborate with `seo_gsc_index_coverage` duplicate states and `seo_cannibalization({
   project_id })` (empty means not computed, never no-issues); reconcile thin pages against demand with
   `seo_gsc_top_pages({ site_url })`.
8. Architecture and signals: `seo_internal_links({ project_id })` (orphans, depth, counts; Hiveku-hosted
   published projects only, static weekly scan), `seo_core_web_vitals({ url, include: "field" })` per
   template against the baseline (over 15 percent movement is a lead; mobile is what matters),
   `seo_schema_markup({ project_id })` detected vs suggested, `seo_entity_check({ query: "<Brand>" })`,
   `seo_aeo_readiness({ domain })` for blocked AI crawlers and homepage JSON-LD.
9. Regression mode (T2, monthly and within 24 hours of any deploy): diff this crawl against the prior
   audit id; hunt the four classics (a staging noindex shipped, robots.txt replaced with a blanket
   Disallow, slugs changed without 301s, canonicals pointing at staging or home). Any NEW severity-5
   finding is a same-day escalation, not a report line.
10. Output: priority = (severity x blast radius) / effort, tickets by template not by page, a NOT
    CHECKED section immediately after the findings listing every EXTERNAL row you did not run, and the
    direction of your sample's bias (a value-weighted sample overstates health). Fixes go to
    `/hiveku:seo-fix`; `pm_tasks_create({ project_id, title, description, task_type: "seo" })` per
    accepted fix with the finding, the priority inputs, the affected pattern and the verification call
    and date. Honesty rules: N of how many in every finding; empty is never clean; a failed source is
    partial, never zero; nothing here submits, deletes or deploys.
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
