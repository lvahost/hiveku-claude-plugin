---
description: "\"Write a brief for a post about X\" / \"what should the new page cover?\" / \"outline an article that can actually rank\" - the SERP-evidenced content brief: the brief is BUILT on the calendar row by content_brief_build (one live SERP read, the top three parsed, the intent and page-type verdicts, the outline benchmark, the word-count band, the questions people also ask) and read back from the row, then completed with the entity and question coverage, the money-page and pillar link targets, the author and the schema, and saved as a content_brief deliverable. Nothing is published; the brief is the deliverable."
argument-hint: "<topic or target keyword> [content id, when the calendar row exists]"
---
Content brief for $ARGUMENTS. Follow the **hiveku-seo-agency** skill; load
`references/content-strategy.md` (the five-way disposition, the refresh depth ladder, the brief
contract in Play C2 step 3) and the content skill's `references/structure-and-conversion.md` (the
SERP brief the row stores, the author, the answer block and FAQ). A brief without SERP evidence is
a guess with good grammar - so the SERP is read by the route that stamps the row, never recalled.
1. Context: `account_context_get({ domain: "seo" })` for voice, avatars, the claims rules and protected
   topics; `memory_list({ domain: "seo" })` for intent verdicts already settled and pages declared
   off-limits. `sites_list` for the website `project_id` (the brief resolves the SEO tracking project
   from the site's host itself); `seo_connections_list` for the GSC property string.
2. Refresh or new, before anything else: `content_keyword_map({ project_id })` - a keyword the map
   lists under `collisions[]` (two of our items on one keyword, or an open cannibalisation with its
   `recommended_primary_url`) is a refresh brief for THAT page (`/hiveku:refresh`), never a second
   page on a covered intent; the cluster's `missing_subtopics[]` are the keywords nobody targets. Then
   `seo_gsc_search_analytics({ site_url, start: <day -31>, end: <day -3>, dimensions: ["page"],
   filters: [{ dimension: "query", operator: "contains", expression: <head term> }] })` for a URL
   already earning impressions on the head term: a URL in the top 50 with the right intent is a
   refresh brief for that page.
3. The row. A brief lives on a calendar row so the department, the check and the refresh loop read
   the same thing: `content_get({ content_id })` when one exists, else `content_create({ status:
   "draft", title, content_type, target_keyword, avatar_id, journey_id, journey_stage,
   before_after_grid_id, topic_cluster_id, cluster_role })` with the cell it fills (ids from the
   content skill's Play 1 lists; a foreign id is 400 `invalid_reference` and nothing is created). A
   topic with no row yet and no cell to fill goes through `content_brief_topic({ topic, keyword })`
   instead - the artifact is the deliverable, read back with `kb_artifact_get({ artifact_id })`.
4. Build the brief [SPENDS - class C, one SERP read plus three on-page parses against the monthly
   research cap, and at most one model call; say so first]: `content_brief_build({ content_id,
   keyword: <target keyword>, project_id, location_code? })`. A spent cap is a 402 with nothing
   written; 400 `keyword_required` when the row has no keyword and none was sent. It stamps the row's
   `search_intent` and `page_type`, the full `serp_brief` (read-only from then on) and the
   `serp_brief` artifact in the Content research KB; a brief captured in the last 30 days is reused
   by the research run, so this comes before `content_research_run`.
5. Read it back - `content_brief_get({ content_id })` - and reason from the stored brief, never from
   the SERP as you remember it: `intent` and `intent_decided_by` (rules | model | default - a
   `default` verdict had no signal; say so), the result-type mix in `result_types`, who holds the top
   five in `top_10` (three national brands means re-scope), `features[]` (the feature tax),
   `featured_snippet`, `top_results[].outline` and `word_count` (the outline benchmark: cover every
   subtopic two of three cover, in the shape the SERP rewards), `word_count_band` (a BAND with a
   `target`, never a target alone), `paa[]` and `related_searches[]`, and `what_the_top_3_all_say[]`
   (what the piece must cover, and the consensus line the thesis will argue against). A
   `parse_error` on a result is a partial benchmark; name it. Numbers for the head and its variants
   come from `dataforseo_labs_google_keyword_overview({ keywords, location_code: 2840 })` [SPENDS -
   class B, one request] or the universe tab `/hiveku:seo-keywords` already paid for; never a
   recalled volume.
6. Entity and question coverage: `seo_entity_check({ query: <topic> })` for the entity the page must
   resolve and the `sameAs` targets; `seo_aeo_audit_get({ domain })` where an audit exists;
   `seo_featured_snippets({ project_id })` for the winnable format (paragraph, list, table). The
   answer block is written to it: 40 to 60 words under the H1 that restate the query and answer it
   (the row's `answer_block`, and the lead paragraph); the three to six `paa[]` questions that are
   real become the FAQ section and the row's `faq[]` - never padded.
7. Link targets: `content_site_links({ project_id, content_id })` - money pages first, then the
   piece's own pillar (`is_pillar_for_item`), each with its `suggested_anchor`: the brief names the
   money page and the pillar the draft MUST link (the check errors on a consideration or decision
   piece with no money-page link, and on a spoke that does not link its pillar; `notes[]` says when
   no money page is marked - `site_page_roles_get` then `site_page_roles_set` fixes that first).
   Then `seo_internal_links({ project_id })` for donors and orphans and the striking-distance pages
   from `seo_rankings_list({ domain, min_position: 4, max_position: 15 })`: three to eight named
   source pages with varied anchors, plus where this page links out.
8. The author and the schema: `content_authors_list` for the byline (the brief names the author and
   `author_id` goes on the row; an account with no authors is a brief that names the gap and offers
   `content_authors_create` - never an invented byline). The markup is built by the publish from the
   row (Article with that author as a Person, BreadcrumbList, FAQPage only when `faq[]` has real
   pairs), so the brief specifies the answer block and the FAQ, not hand-written JSON-LD. One success
   metric with its date (position at a named location and device, or clicks, at 90 days; net-new
   content moves in 3 to 6 months, say so).
9. Draft the brief: `talk_to_department({ domain: "seo", message })` carrying the intent and
   page-type verdicts, the top-3 outlines, the entity and question list, the money page and pillar
   with their anchors, the author, the band, the thesis line to argue (`brand_positioning_get`) and
   the voice rules. Reconcile every number it returns against the call that produced it; its prose
   is a draft and it will state numbers it did not read.
10. Save: `seo_deliverable_save({ title, slug: "brief-<topic-slug>-<yyyy-mm>", deliverable_type:
    "content_brief", status: "draft", target_domain, target_keywords, content, summary })` [CONFIRM];
    read `existed` (true means the slug was taken and nothing was written; switch to
    `seo_deliverable_update({ id })`). The row already carries the machine-readable half
    (`serp_brief`, `search_intent`, `page_type`); write the human half onto it too -
    `content_update({ content_id, author_id, answer_block, faq })` - so the draft and the check read
    the same brief. Then `pm_tasks_create({ project_id, title, description, task_type: "content" })`
    flat, with the target URL as the first line of the description, and `content_link_tasks`. Nothing
    publishes from here: the draft is the content lane's Play 3, with the client seeing the brief
    before the draft. Honesty rules: the benchmark is three pages and says so; a missing source (no
    GSC, a spent cap) makes its section partial and is named, never filled from recall.
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
