---
description: "\"Who are we really competing with?\" / \"why does [competitor] outrank us?\" / \"what are they doing that we aren't?\" - competitor intelligence: the SERP-overlap set against the client's own list, keyword and link gaps, their money pages, their tech stack, persisted as a competitor_analysis deliverable. Never bulk-adds competitors, never sums a vendor traffic estimate with real analytics, never presents an estimate as the rival's number."
argument-hint: "[competitor domain, optional]"
---
Competitor intelligence ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/link-building-and-competitors.md` (1.4 the three competitor lists and the 4-to-8 rule,
Plays D and E, the vendor catalog in section 7). Every metered call below is class B (Labs) or D
(backlinks) per request: state the count before spending.
1. Context: `account_context_get({ domain: "seo" })` and `get_account_info` often already name the
   client's own rival list; `memory_list({ domain: "seo" })` holds the agreed set and why, the most
   re-litigated decision in a retainer. `seo_list_projects` for the SEO tracking `project_id`.
2. Current set: `seo_list_competitors({ project_id })`; a row whose `last_analyzed` is older than 60
   days is history, not standing; null metrics on a manually added row mean not analyzed yet.
3. SERP overlap [SPENDS - class B, one request]: `dataforseo_labs_google_competitors_domain({ target,
   location_code: 2840 })` (COUNTRY codes only). Reality-check 3 to 5 cluster heads: `seo_serp_get({
   keyword })` for stored rows, or `seo_research({ action: "serp", keyword, location_code })` [SPENDS -
   class C per head]; fewer than half the top 10 in the tracked set means the set is stale. Keep the
   three lists apart: SERP competitors (tactics), business competitors (what the client believes), and
   link-profile competitors from `backlinks_competitors({ target })` [SPENDS - class D, one request].
4. Keyword gap: `dataforseo_labs_google_domain_intersection({ target1: <rival>, target2: <client> })`
   [SPENDS - class B, one request per rival; check the schema for the target arguments] filtered to
   their positions 1 to 20 and ours absent or beyond 30; the winners feed `/hiveku:seo-keywords`.
   `seo_content_gaps` reads STORED gap rows and is empty until its compute writer has run for this
   project (INCOMING; named with its spend in the Availability table and Play C4 of the SEO skill's
   `references/content-strategy.md`) - compute first, then read it back. Until that ships the
   intersection call above is the manual method, and an empty read is "not computed", never
   "no gaps".
5. Money pages: `dataforseo_labs_google_ranked_keywords({ target })` [SPENDS - class B] sorted by
   estimated traffic to find the URLs that earn, and `backlinks_domain_pages_summary({ target })`
   [SPENDS - class D] for the pages that earn links, which is where their linkable assets live.
6. Link gap: `backlinks_domain_intersection` with the rivals as targets and the client excluded
   [SPENDS - class D, one request; check the schema for the targets shape]: domains linking to two or
   more of them and not us. Hand the list to `/hiveku:seo-links`.
7. Tech stack: `domain_analytics_technologies_domain_technologies({ target })` [SPENDS - one request
   per rival] for CMS, framework, analytics and ad tech; a rival on a faster stack explains a vitals
   gap, a rival on the same stack removes that excuse.
8. Velocity and changes: publishing velocity has no tool, so `web_scrape` or `web_crawl` the rival's
   blog index and count posts per month over the last quarter; `seo_competitor_changes({})` filtered
   client-side to `our_domain` and `requires_response: true` (an empty feed with no competitor-change
   workflow installed is "monitoring is not running", never "no activity").
9. Persist: `seo_add_competitor({ project_id, competitor_domain })` [CONFIRM by name, one at a time;
   4 to 8 tracked, never 20; a 409 is a no-op]; read back `seo_list_competitors`. Edit a tracked
   competitor with `seo_competitor_update`; remove one with `seo_competitor_delete` [ask-gated, by
   name, one at a time]. A dashboard Domain Analysis run replaces the whole list,
   so memory keeps the agreed set as the restore point. The teardown: `seo_deliverable_save({ title,
   slug: "competitor-teardown-<yyyy>-q<n>", deliverable_type: "competitor_analysis", status: "draft",
   target_domain, summary, recommendations })` [CONFIRM]; read `existed`; the tables as dated sheet
   tabs via `seo_sheet_create_tab` and one `seo_sheet_add_rows` each.
10. Tell the client: the set and why each is on it, the clusters where a rival wins and the mechanism
    (depth, format, links, stack), the gap keywords worth chasing, their linkable assets, and the
    counter-moves. Honesty rules: vendor traffic estimates are labeled as estimates and compared only
    against the same source's number for the client, never summed with GSC or GA4; a rival's referring
    domains are normalized for age and size; a 402 or 503 on any metered call makes that section
    partial, never zero.
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
