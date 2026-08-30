---
description: "\"We need more backlinks\" / \"did we lose any links?\" / \"who links to our competitors but not to us?\" - the authority pass: the baseline, lost-link recovery, the link gap, unlinked brand mentions, and a scored prospect list handed to Outbound. Nothing sends, nothing is bought, nothing is disavowed from here."
argument-hint: "[money keyword or page, optional]"
---
Authority and links pass ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/link-building-and-competitors.md` (the authority question in order, R-A-P-D scoring, the
four lanes, Plays A to F, the outreach handoff). Unlinked mentions follow
`references/digital-pr-and-brand-mentions.md`; open it only at step 5.
1. Context: `account_context_get({ domain: "seo" })` and `memory_list({ domain: "seo" })` for the
   agreed lanes, vetoed domains, the anchor rules and the disavow stance. `seo_list_projects` for the
   SEO tracking `project_id`. Ask the authority question first: if the cluster already ranks 4 to 15,
   authority is not the constraint and this pass ends with an on-page handoff.
2. Baseline: `seo_backlinks_list({ project_id, limit: 100 })` for `data.profile` (`referring_domains`,
   dofollow share, `avg_domain_rating`, `toxic_score`, `last_updated`); an empty `backlinks` array means
   NOT POPULATED, never no links. `backlinks_summary({ target })` for the client and each tracked rival
   [SPENDS - class D, one request per domain; say the count]. `seo_bing_backlinks({ site_url })` as the
   free second opinion. Report `referring_domains`, never `total_backlinks`.
3. Lost-link recovery, the highest close rate on the board: `seo_new_lost_backlinks({})` reads the
   MANUAL tracker (no `project_id` on the first call; `since` is ignored). DataForSEO's view:
   `backlinks_bulk_new_lost_backlinks({ targets: [<domain>] })` and
   `backlinks_timeseries_new_lost_summary({ target, date_from, date_to })` [SPENDS - class D, one
   request each], then `backlinks_backlinks({ target })` filtered to lost links for the list [SPENDS -
   class D; check the tool's schema for the filter shape]. Classify each with `web_scrape`: page live
   and link removed (outreach), page 404 (hunt a replacement with `web_map`), OUR target 404s or chains
   (a redirect fix today via `/hiveku:seo-fix`), crawler artifact (do not chase).
4. Link gap: `backlinks_domain_intersection` with the tracked rivals as targets and the client excluded
   [SPENDS - class D, one request; check the schema for the targets shape] for domains linking to two
   or more rivals but not us, the warmest cold list there is. For one money keyword ($ARGUMENTS), the
   top-ranking URLs into `backlinks_page_intersection` [SPENDS - class D]. `seo_backlink_opportunities({
   limit: 100 })` is account-wide: filter on `target_domain`, drop `status` outside new or contacted,
   `outreach_attempts` of 3 or more, and `spam_score` above 30.
5. Unlinked mentions: `content_analysis_search({ keyword: "<brand>" })` and `content_analysis_summary({
   keyword: "<brand>" })` [SPENDS - metered per request, one each] for pages that name the brand, minus
   the referring domains from `backlinks_backlinks`; what remains is the reclamation list, lane 1.
   Sentiment beside it is a watch item, not a link task.
6. Score survivors on R-A-P-D (relevance weighted hardest, then authority, placement, durability) and
   check anchors: `backlinks_anchors({ target })` [SPENDS - class D, one request]; exact-match
   commercial anchors above 10 percent means the next asks are branded. `opportunity_score` is a sort
   key within one pull, never a grade.
7. Angles and handoff: `talk_to_department({ domain: "seo", message })` for one angle per segment with
   the client's assets and the rival link that proves relevance; then `talk_to_department({ domain:
   "outbound", message })` with the segmented list, angles and target pages [CONFIRM - segment counts,
   five sample prospects with why each qualifies, the angle copy]. Outbound owns loading, sequencing
   and sending. Nothing sends from here, no paid placement, no PBN, and no disavow file (escalate a
   toxic profile with evidence, never act).
8. Tasks: `pm_tasks_create({ project_id, title })` per recoverable link (source domain plus
   classification in the title), per campaign with segment counts and a target link count, per asset
   to build. The PM task is the record of a won link; a write to the link tracker is a capability
   shipping now (see the reference's Availability table), and `crm_create_activity` is not visible on
   a marketing-seo key.
9. Honesty rules: a data event (referring domains moving over 20 percent between reads) is verified
   with the second source before it is reported; vendor DR is directional; close rates are quoted as
   the reference's bands (reclamation 30 to 60 percent, relevance gap 3 to 8), never as this client's
   number; a 402 or 503 on any metered call makes that section partial, never zero.
10. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
