---
description: "\"We just signed a new SEO client\" / \"set up SEO for this account\" / \"capture the baseline before we start\" - month-1 onboarding: projects and connections, the full 16-month Search Console capture, the first crawl, vitals, AI readiness, authority, the competitor set, the outcomes audit, the local branch, one baseline deliverable and the month-1 tickets. Nothing on the site changes; no crawl is bought and no competitor is added without a named count and a yes."
argument-hint: "[domain, optional]"
---
New-client onboarding ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/seo-playbooks.md` and run Recipe 1. The baseline is never skipped: offer to compress it,
not to drop it. Nothing on the site changes in this command.
1. Context: `account_context_get({ domain: "seo" })`, `memory_list({ domain: "seo" })` (add
   `include_project_scoped: true` on project-scoped accounts), `get_account_info` to confirm the bound
   account.
2. Project: `seo_list_projects` for the SEO tracking `project_id`; none yet means `seo_create_project({
   domain, name, target_country, target_language })` [CONFIRM]. Read back `seo_list_projects`.
   `sites_list` gives the WEBSITE project id, a different id space; note both.
3. Sources: `seo_connections_list`. For each of google_search_console, bing_webmaster,
   google_business_profile, google_analytics and DataForSEO: present or not, status, `last_error`.
   Copy the GSC `site_url` VERBATIM (sc-domain vs url-prefix are different properties). A missing
   source caps what you can honestly report: connect it with `seo_connection_create` using the
   per-platform arguments in `references/outcomes-and-measurement.md` [CONFIRM - BYOK credentials;
   GSC needs the FULL webmasters scope], then verify with `seo_sync`.
4. Fresh data: `seo_sync({ project_id, full: true })` [CONFIRM on a large account: it fans out across
   every connection]. Read back `seo_rankings_list({ domain, group_by_keyword: true, limit: 200 })`:
   `pagination.total_groups` is the keyword count; a blank AI column is untracked, never not-ranking.
5. Crawl: `web_map({ url })` for the URL count FIRST, then `seo_audit_start({ project_id, target_url,
   max_crawl_pages })` [SPENDS - class F per page; default 50, clamp 500; state the count against the
   `web_map` total and get the yes]. It returns `{ task_id, status: "queued" }` and a 25-page crawl
   finishes in about 4 minutes. Read it through `seo_research` with `target` = that task id: `action`
   `non-indexable`, `redirect-chains`, `internal-links` and `keyword-density` return results with
   `crawl_status { pages_crawled }` (empty items on a finished crawl means none found in the pages
   crawled: state the sample); `duplicate-content` REQUIRES `url` (the page to compare) or returns an
   empty array; `duplicate-tags` is title-only [SPENDS - class B per request]; `instant-page` takes
   `url`, one page per template [class E]. Never read an empty `seo_list_audits` as a clean site; every
   finding carries the coverage block from `references/technical-seo-blind-spots.md` section 0.
6. The GSC capture, all ~16 months Google retains (this is the only chance): `seo_gsc_list_sites` as
   the heartbeat, then `seo_gsc_search_analytics({ site_url, start: <16 months back>, end: <day -3>,
   data_state: "final", dimensions: ["date"] })`, then `["query"]`, `["page"]` and `["query","page"]`,
   each with `row_limit: 5000`, paginating with `start_row` whenever a call returns exactly `row_limit`
   rows. Land each set in a dated sheet tab (step 14). Never sum across dimension sets.
7. Bing baseline, free: `seo_bing_list_sites`, `seo_bing_stats({ site_url })`, `seo_bing_crawl_stats({
   site_url })`.
8. Vitals, free: `seo_core_web_vitals({ url: <home>, include: "field" })` and one URL per template;
   `url` first, `origin` when `field.available` is false; label field vs lab in every number.
9. AI readiness and entity, free: `seo_aeo_readiness({ domain })` and `seo_entity_check({ query:
   "<Brand Name>" })`. A blocked AI crawler or no Knowledge Graph entity is a headline finding.
10. Authority: `backlinks_summary({ target })` for the client and each rival [SPENDS - class D, one
    request per domain; name the count]. Report `referring_domains`, never `total_backlinks`.
11. Competitors: `dataforseo_labs_google_competitors_domain({ target, location_code: 2840 })` [SPENDS -
    class B, one request; Labs takes COUNTRY codes only]. Cross-check against who the client THINKS
    competes; both lists matter. Persist 4 to 8 with `seo_add_competitor({ project_id,
    competitor_domain })` [CONFIRM by name, one at a time; a 409 is a no-op]. Read back
    `seo_list_competitors({ project_id })`: null metrics mean not analyzed yet, not zero.
12. Outcomes: with a google_analytics connection, `seo_ga4_conversion_audit({ connection_id, days: 90
    })`; a key event that recorded nothing is a month-1 measurement task. No connection: the Outcomes
    section reads "not measurable yet" with the setup task attached, never a silent omission.
13. Local branch: physical locations or a service area means `/hiveku:local` runs as part of this
    baseline.
14. Record it: `seo_deliverable_save({ title, slug: "seo-baseline-<yyyy-mm>", deliverable_type:
    "audit", status: "draft", target_domain, summary, content, recommendations })` [CONFIRM]; read back
    `existed` (true means the slug was taken and nothing was written: switch to
    `seo_deliverable_update({ id })`). Tables go to `seo_sheet_create_tab({ deliverable_slug, name:
    "<yyyy-mm> ...", columns })` then one batched `seo_sheet_add_rows` per tab; date-prefix every tab
    name, because create-tab is replace-by-name.
15. Tell the client: what is connected and what that caps, site size vs pages crawled, the 16-month
    traffic shape with seasonal peaks, the authority tier and what it makes attackable, the competitor
    set and why, whether conversions are measurable, and the month-1 tickets with their windows.
    Honesty rules throughout: every aggregate states N, how chosen, what was excluded; a failed source
    is partial, never zero; GSC, Bing, the tracker and vendor estimates are never summed.
16. File: `pm_tasks_create({ project_id, title, task_type: "seo" })` per month-1 ticket, flat, never
    with `parent_task_id`. The memory facts (domain, exact property string, competitor set, traffic
    level and peaks, top pages, constraints, accepted exclusions) go in through the closing step.
17. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
