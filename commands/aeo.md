---
description: "\"ChatGPT never mentions us\" / \"are we showing up in Google's AI Overviews?\" / \"how do we get cited by AI?\" - the AEO pass: the free gates first (AI-crawler readiness, the Knowledge Graph entity), then the citation audit on the priority set with a confirmed spend, the AI-lane read-back, the brand profile and audit history, displacement analysis, and answer-block plus schema fixes filed as tasks. Never runs the paid audit before the free gates pass, never rewrites the brand profile without echoing the merged object, never publishes a page."
argument-hint: "[domain, optional]"
---
AEO pass ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load `references/aeo.md` (the four gates,
the two scoreboards, citation tiering, the answer-block format rules, the brand-profile trap).
1. Context: `account_context_get({ domain: "seo" })` (positioning, category phrasing, claims rules) and
   `memory_list({ domain: "seo" })` (the AEO baseline, the exact `category` string, the citation
   incumbents, crawler-access decisions). Read `hiveku-data/aeo/*.json` for orientation only.
2. Gate 1 and 2, free: `seo_aeo_readiness({ domain })` (score, `checks[]`, `crawlers[]`: any bot
   `blocked` is a same-day ticket; under 50 or an `ai_crawlers` fail blocks every paid step below) and
   `seo_entity_check({ query: "<Brand Name>", types: "Organization,LocalBusiness" })` (no entity means
   the brand is a string, the headline finding). Crawler access is the client's business decision:
   surface the tradeoff, never flip it. A readiness of 0 is usually a fetch failure, not a missing file:
   confirm with `web_scrape` on robots.txt.
3. Stored first: `seo_aeo_audit_get({ domain, limit: 100 })`. If `summary.checked_at` is inside the
   monthly window, use it and skip step 4; `since` filters later re-reads for free.
4. The paid audit on the priority set: 25 commercial and category keywords, the SAME list every month
   (rotating it changes the denominator). [CONFIRM the spend: domain, the list, count, location] then
   `seo_aeo_audit_run({ domain, keywords, max_keywords: 25, location_code: 2840, language_code: "en" })`
   [SPENDS - class C, one SERP request per keyword; `location_code` is a NUMBER here]. Never re-run the
   same day to "check" a result.
5. Read it: answer-layer coverage (`keywords_with_ai_overview / keywords_analyzed`) and citation rate
   (`domain_in_ai_overviews / keywords_with_ai_overview`); `aeo_readiness_pct` counts overview AND
   snippet per keyword, so a brand cited in every overview with no snippets scores 50, say so. Tier
   each gap keyword with section 1.3 (tier 1: overview present, not cited, organic 1 to 10, a format
   problem to fix this sprint).
6. AI-lane read-back: `seo_rankings_list({ domain, search_engine: "ai_overview" })` and the same for
   `chatgpt`, `claude`, `gemini`, `perplexity`. A blank lane means the keyword predates the engines:
   untracked, never "not ranking". To add lanes: `seo_aeo_rankings_sync({ target_domain, keywords,
   search_engines: ["ai_overview"], skip_sync: true })` creates rows free, then the identical call
   without `skip_sync` [CONFIRM; SPENDS - class G, about $0.10 per keyword per engine; `location_code`
   is a STRING here]. The perplexity lane routes through Google today: footnote it, never sell it as
   Perplexity.
7. Brand side: `seo_aeo_brand_profile_get({})` (`profile: null` means the brand audit 400s and the
   weekly cron skips the account, itself a finding) and `seo_aeo_brand_audit_history({ history: 12 })`
   for the free trend (`overall_avg`, per-provider `provider_scores`, `competitors_mentioned`,
   `inaccuracies`). A profile write is a FULL REPLACE: read, echo the merged object, then
   `seo_aeo_brand_profile_upsert` [CONFIRM - and never bundle it with an audit run]. A fresh
   `seo_aeo_brand_audit({})` [SPENDS - class H, the shared per-UTC-day budget; a refusal is not a zero]
   only when the history is stale relative to something you shipped.
8. Displacement: from `seo_aeo_audit_get`, tally `ai_overview_references` across the gap keywords;
   any domain on 3 or more is a citation incumbent. `web_scrape` two cited URLs for the format that
   earned it; `seo_entity_check` any incumbent brand not yet profiled. Publisher incumbents mean
   placement plus a better on-site answer; direct competitors mean a quarterly displacement project.
9. Fixes as tasks, never as writes from here: answer blocks (a 40 to 60 word direct answer under an H2
   that restates the question, one question per block, every claim beside its source and date) drafted
   with `talk_to_department({ domain: "seo", message })` and shipped through `/hiveku:seo-onpage`;
   schema per template from `seo_schema_markup({ project_id })` (Organization and WebSite on the home
   page first, FAQPage only where visible). `pm_tasks_create({ project_id, title, task_type: "seo" })`
   per tier-1 and tier-2 keyword naming the URL, organic position and required format, and one per
   inaccuracy. Generate llms.txt with `seo_llms_txt_generate` (WEBSITE project id) and read the one-call
   AI visibility rollup with `seo_ai_visibility`: see the reference's Availability table.
10. Honesty rules: per-provider overalls beside every average (a failed provider drops out and moves
    the mean with no real change); a budget refusal or a 402 is partial, never zero; model version
    changes move brand-side numbers more than your work does, footnote them; brand-side movement is
    quarters, SERP-side weeks, and the report never conflates the two scoreboards.
11. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
