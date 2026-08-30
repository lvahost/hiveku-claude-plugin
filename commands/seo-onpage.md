---
description: "\"Optimize this page\" / \"why isn't this page ranking?\" / \"tune the title and content on /services\" - the 12-step on-page protocol on ONE URL: SERP teardown, intent, the page's real query set, title/H1/meta, entity and topic coverage, answer blocks, internal links, JSON-LD, images, vitals, the CTA, then ship through the right write path and verify on the live URL. Never runs across a URL list, never writes through a read tool, never reports shipped without the live-URL check."
argument-hint: "<url>"
---
On-page optimization of $ARGUMENTS (exactly one URL; a list is a `/hiveku:seo-fix` job). Follow the
**hiveku-seo-agency** skill; load `references/on-page-optimization.md` (the 12-step protocol, the
title and meta formulas, the JSON-LD templates and their 2025 eligibility, the write-path matrix in
section 1).
1. Context: `account_context_get({ domain: "seo" })` (voice, claims rules, protected pages) and
   `memory_list({ domain: "seo" })` (intent verdicts, the GSC property string). `seo_list_projects` for
   the SEO tracking id; `sites_list` for the WEBSITE project id and whether Hiveku hosts this page at
   all (an externally hosted page gets a spec the client's team ships, not a write).
2. The page's real query set: `seo_gsc_search_analytics({ site_url, start: <day -31>, end: <day -3>,
   dimensions: ["query"], filters: [{ dimension: "page", operator: "equals", expression: <url> }],
   row_limit: 1000 })`. The head term is what Google already serves the page for, not what the client
   wishes; positions 4 to 15 with impressions are the harvest.
3. SERP teardown on the head term: `seo_serp_get({ keyword })` for stored rows, or `seo_research({
   action: "serp", keyword, location_code })` for the live SERP [SPENDS - class C, one request];
   `seo_serp_features({ keyword })`. Read intent from what ranks (result type, who holds 1 to 5,
   freshness, depth). A page whose type cannot win this SERP is a rewrite or a re-scope, not a tune.
4. Benchmark the top 3 and the page itself: `on_page_content_parsing({ url })` on each [SPENDS - class
   E, four URLs; say so] for headings, word count, tables, links and media. Term coverage on the page:
   `seo_research({ action: "keyword-density", target })` needs a crawl task id from `seo_audit_start`
   (it returns `crawl_status { pages_crawled }`); without one, count from the parsed content.
5. Title, H1, meta: the formulas and length rules from the reference; the primary term and the city or
   qualifier inside the truncation point; brand suffix consistent with the template. Show the exact
   before/after strings.
6. Entity and topic coverage: `seo_entity_check({ query: <topic> })` and `seo_entity_check({ query:
   "<Brand>" })` for the `sameAs` targets; the subtopics the top 3 cover and the page does not become
   sections, not stuffing.
7. Answer blocks: `seo_featured_snippets({ project_id })` for the winnable format on this page's
   queries (empty until an AEO audit ran; `/hiveku:aeo`), and the PAA questions from the SERP: a 40 to
   60 word direct answer under an H2 that restates the question, one question per block.
8. Internal links: `seo_internal_links({ project_id })` (Hiveku-hosted published projects only, static
   weekly scan; `suggested_links_to` and `suggested_links_from` are not computed) plus the
   striking-distance donors from `seo_rankings_list({ domain, min_position: 4, max_position: 15 })`:
   three to eight named source pages with varied anchors.
9. JSON-LD per the templates (LocalBusiness NAP matching GBP character for character, Organization
   `sameAs` from the Knowledge Graph id, Article with author and `dateModified`, Product with Offer,
   FAQPage only where the FAQ is visible, HowTo retired); `seo_schema_markup({ project_id })` is the
   READ of what is detected. Images: descriptive alt, sized dimensions, a modern format, no lazy-load
   above the fold.
10. Vitals and CTA: `seo_core_web_vitals({ url: <url>, include: "field" })` (`url` first, `origin`
    when `field.available` is false; label field vs lab) and `seo_cro_audit({ url })` for the score and
    `quick_wins`. Attribute a poor LCP to TTFB vs the hero resource before proposing a fix.
11. Ship [CONFIRM - one write per yes, the exact diff shown]: a pages-model page -> `pages_update`; a
    CMS entry -> `cms_write_entry`; a template, JSON-LD or canonical -> the code lane
    (`project_files_bulk_save` in one call, `project_vcs_commit`, `deploy_site`); a mechanical edit on a
    hosted site -> `seo_task_implement` two-step with a human `agent_approval_approve`. A per-page SEO
    field and schema write that is live after deploy is a capability shipping now: see the reference's
    Availability table; today it is `pages_update` or the code lane. On a marketing-seo key the `cms_*`
    and `project_*` tools are not visible: say so, use `pages_update` or the implement rail.
12. Verify and track: `fetch_url({ url })` and read the changed title, meta, headings and JSON-LD in the
    body (never the write's 200); `seo_track_keyword({ keyword, target_domain, location_code })` for
    the head term if untracked [CONFIRM]; record the ship date. Proof at 28 days:
    `seo_gsc_time_series` with the page filter beside the unfiltered site trend. Honesty rules: the
    benchmark is three pages and says so; a check that could not run (an externally hosted page's
    headers) is named; "fixed, awaiting recrawl" until `seo_gsc_inspect_url` agrees.
13. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
