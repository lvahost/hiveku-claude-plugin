---
description: "\"Write a brief for a post about X\" / \"what should the new page cover?\" / \"outline an article that can actually rank\" - the SERP-evidenced content brief: intent from the SERP, the outline benchmark from the top 3, entity and question coverage, internal-link targets, schema, a word-count band and a success metric, drafted through the department agent and saved as a content_brief deliverable. Nothing is published; the brief is the deliverable."
argument-hint: "<topic or target keyword>"
---
Content brief for $ARGUMENTS. Follow the **hiveku-seo-agency** skill; load
`references/content-strategy.md` (the five-way disposition, the refresh depth ladder, the brief
contract in Play C2 step 3). A brief without SERP evidence is a guess with good grammar.
1. Context: `account_context_get({ domain: "seo" })` for voice, avatars, the claims rules and protected
   topics; `memory_list({ domain: "seo" })` for intent verdicts already settled and pages declared
   off-limits. `seo_list_projects` for the SEO tracking `project_id`; `seo_connections_list` for the
   GSC property string.
2. Refresh or new, before anything else: `seo_gsc_search_analytics({ site_url, start: <day -31>, end:
   <day -3>, dimensions: ["page"], filters: [{ dimension: "query", operator: "contains", expression:
   <head term> }] })` for a URL already earning impressions, and `seo_cannibalization({ project_id })`
   for pages already splitting it. A URL in the top 50 with the right intent is a refresh brief for
   THAT page; never a second page on a covered intent.
3. Intent from the SERP: `seo_serp_get({ keyword })` for stored rows, or `seo_research({ action:
   "serp", keyword, location_code })` for the live SERP [SPENDS - class C, one request; say so];
   `seo_serp_features({ keyword })` for the layout. Read the result-type mix (product pages vs
   listicles vs guides), who holds 1 to 5 (three national brands means re-scope), freshness (top five
   dated inside 90 days makes this a recurring-refresh piece), and the feature tax.
4. Numbers for the head and its variants [SPENDS - class B, one request]:
   `dataforseo_labs_google_keyword_overview({ keywords, location_code: 2840 })`, or read them from the
   universe tab if `/hiveku:seo-keywords` already paid for them. Never a recalled volume.
5. Outline benchmark: `on_page_content_parsing({ url })` on the top 3 [SPENDS - class E, three URLs]:
   headings in order, word count, tables, media, links out. The brief's outline covers every subtopic
   two of three cover, in the shape the SERP rewards.
6. Entity and question coverage: `seo_entity_check({ query: <topic> })` for the entity the page must
   resolve and the `sameAs` targets; the PAA questions from the SERP and `seo_aeo_audit_get({ domain })`
   where an audit exists; `seo_featured_snippets({ project_id })` for the winnable format (paragraph,
   list, table) so the answer block is written to it. One question per block, 40 to 60 words, under an
   H2 that restates it.
7. Internal-link targets: `seo_internal_links({ project_id })` for donors and orphans (Hiveku-hosted
   published projects only; suggestions are not computed) and the striking-distance pages from
   `seo_rankings_list({ domain, min_position: 4, max_position: 15 })`: three to eight named source
   pages with varied anchors, plus where this page links out.
8. Schema and the band: the template from `references/on-page-optimization.md` (Article with a real
   author and `dateModified`, FAQPage only where the FAQ is visible, HowTo retired, Product needs
   Offer), a word-count BAND from the top 3 (never a target), and one success metric with its date
   (position at a named location and device, or clicks, at 90 days; net-new content moves in 3 to 6
   months, say so).
9. Draft the brief: `talk_to_department({ domain: "seo", message })` carrying the intent verdict, the
   top-3 outlines, the entity and question list, the link targets, the schema spec, the band and the
   voice rules. Reconcile every number it returns against the call that produced it; its prose is a
   draft and it will state numbers it did not read.
10. Save: `seo_deliverable_save({ title, slug: "brief-<topic-slug>-<yyyy-mm>", deliverable_type:
    "content_brief", status: "draft", target_domain, target_keywords, content, summary })` [CONFIRM];
    read `existed` (true means the slug was taken and nothing was written; switch to
    `seo_deliverable_update({ id })`). Then `pm_tasks_create({ project_id, title, description, task_type:
    "content" })` flat, with the target URL as the first line of the description. Nothing publishes
    from here: the draft is `/hiveku:seo-onpage` and the content lane's job, with the client seeing
    the brief before the draft. Honesty rules: the benchmark is three pages and says so; a missing
    source (no GSC, no DataForSEO) makes its section partial and is named, never filled from recall.
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
