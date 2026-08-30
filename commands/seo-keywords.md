---
description: "\"What keywords should we go after?\" / \"find us more keywords\" / \"which of these are actually worth it?\" - keyword research: the seed set, ONE batched expansion with its request count confirmed first, bulk qualification, clustering, a SERP teardown on the top clusters, the universe persisted to a sheet tab, and a tracking proposal. Never spends without a named count and a yes, never tracks from a machine list, never quotes a model-recalled volume or difficulty."
argument-hint: "[seed keywords or topic, optional]"
---
Keyword research ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/keyword-research.md` (the funnel, seeds, the SERP-is-the-specification rule, the gates).
The batch sizes and cost rules for every metered call are in `references/metered-research-suite.md`;
open that only at step 3.
1. Context: `account_context_get({ domain: "seo" })` for what the client sells, the geography and the
   protected terms; `memory_list({ domain: "seo" })` for the seed vocabulary, rejected terms and
   location code a prior session agreed. `seo_list_projects` for the SEO tracking `project_id`;
   `seo_connections_list` to confirm DataForSEO is configured (a 503 `dataforseo_unconfigured` later
   means it is not; a 402 means the balance is negative; neither is "no keywords").
2. Seeds per section 1.2: offer, problem, comparison and geography seeds, in the customer's words
   (the avatars carry them). Validate vocabulary free: `web_search` two or three problem seeds and
   read the language in the results; `web_scrape` the client's service pages and one rival's for the
   recurring nouns. Segment brand terms out before anything is scored.
3. Expansion, ONE batched pass [SPENDS - class B; state the request count and the seed count, get the
   yes, then call]: `dataforseo_labs_google_keyword_ideas({ keywords: [...seeds], location_code: 2840,
   language_code })` (up to 200 seeds in one call), `dataforseo_labs_google_keyword_suggestions`,
   `dataforseo_labs_google_related_keywords`, and `dataforseo_labs_google_keywords_for_site({ target
   })` on the client and the top rivals. Labs takes COUNTRY codes only (2840 = US); the server retries
   with US and returns `location_note`. One call with 25 seeds, never 25 calls with one. Dedupe the
   union before qualifying.
4. Qualify in bulk [SPENDS - class B, batches up to 1,000 keywords]:
   `dataforseo_labs_bulk_keyword_difficulty({ keywords })` and `dataforseo_labs_search_intent({
   keywords })`; `keywords_data_google_ads_search_volume` only for the finalists when precision
   matters. Apply the gates in section 3.1 (volume floor with the transactional and geo exceptions,
   cluster viability, top-5 composition, difficulty vs the authority tier) and serviceability: a 0
   kills the keyword whatever the score.
5. Clusters: build the draft grouping from the qualified union (`seo_keyword_clusters({ project_id })`
   reads STORED rows and is empty until something saved them), audit it for mega-clusters, singleton
   spray and intent bleed, then `seo_keyword_cluster_create` per agreed cluster [CONFIRM the list, one
   write each; `cluster_name` unique per account]. Pillars with 12 plus keywords and 3 plus sub-intents:
   `seo_topic_cluster_create` [CONFIRM]. Read back both list tools.
6. SERP teardown on the top clusters (head plus two highest-volume members, not all): `seo_serp_get({
   keyword })` for stored rows, or `seo_research({ action: "serp", keyword, location_code })` for the
   live SERP [SPENDS - class C per keyword; say the count]; `seo_serp_features({ keyword })` for the
   feature layout; `seo_entity_check({ query })` on the topic entity for commercial clusters. Read the
   result-type mix, who holds 1 to 5, freshness and depth: that is the page specification.
7. Persist the universe the same session: `seo_sheet_create_tab({ deliverable_slug, name: "<yyyy-mm>
   Keyword universe", columns })` then ONE `seo_sheet_add_rows` with keyword, volume, KD, intent, CPC,
   cluster, score and the pull date. Date-prefix the tab name (create-tab is replace-by-name). A pull
   that is not persisted is paid for twice.
8. Tracking proposal, not executed here: 20 to 100 keywords in the 40/30/20/10 mix from section Play 7,
   presented as a list. Only on an explicit yes [CONFIRM]: `seo_track_keyword({ keyword,
   target_domain, location_code })` per keyword, `location_code` set for any non-US client (2840 on a
   Canadian client produces plausible, wrong rankings silently); AI lanes cost about $0.10 per keyword
   per engine and wait for the priority set. Read back `seo_rankings_list({ domain, group_by_keyword:
   true })`.
9. Honesty rules: every volume, KD and intent comes from a tool call in this session or the sheet tab,
   never from recall; every aggregate discloses N, how the sample was chosen and what was excluded
   ("top 200 by volume from a 3,400-keyword universe, brand excluded"); uniform, round or all-zero
   volumes are a provider fault, say so and do not forecast on them; under about 150 qualified
   keywords with meaningful volume is a low-demand niche, and the honest pivot is conversion, local and
   AEO rather than traffic promises.
10. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
