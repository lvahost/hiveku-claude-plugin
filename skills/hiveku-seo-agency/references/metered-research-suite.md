# Metered Research Suite - DataForSEO Vendor Tools

## What this covers / when to load this

The per-call-billed DataForSEO vendor surface behind Play 1 (keyword expansion and
qualification) and Play 2 (competitor intelligence) in SKILL.md: the `dataforseo_labs_*`,
`keywords_data_*`, `backlinks_*`, `serp_*` and `on_page_*` tool families. Load this file when
you are about to spend research credits - building a keyword universe, qualifying it, sizing a
competitor, or running a gap analysis. SKILL.md keeps the funnel, the priority-score formula,
the clustering and tracking tools, and the shared CTR and difficulty tables; this file carries
the expansion, qualification and competitor catalogs that used to live there, plus the batching
and cost rules that keep the spend sane. The authority-profile catalog (`backlinks_summary`
and friends) lives in `references/link-building-and-competitors.md` with the outreach program.

These tools are proxied vendor modules (no builder route of their own). They are visible to
`full` keys and to the `marketing-seo` scoped profile (its profile rule sets
`includeDataForSEO: true` in `profiles.ts`); other marketing sub-profiles do not see them, so
a rejection of one of these names on a non-SEO key is a profile issue, not an outage.

## Cost rules (read before the first call)

- Every call in these families bills per request under the account's monthly SEO research
  cap. Batch inputs, persist results into deliverable sheet tabs (`seo_sheet_create_tab`),
  and never re-pull data that has not changed. Volumes and difficulty move monthly at most.
- Numbers come from these tools or they do not go in a deliverable. Never substitute a
  model-remembered volume, difficulty, or backlink count for a tool result - LLM-recalled
  keyword volumes run 2-4x off measured reality, and a report built on them is
  indefensible. If the suite is unreachable (profile, cap, or outage), say so and mark the
  research section `insufficient_evidence` - do not fill the gap from priors.
- When you report anything aggregated from a metered pull, disclose N, how the sample was
  chosen, and what was excluded. "Top 200 by volume from a 3,400-keyword universe,
  branded terms excluded" is a defensible sentence; a bare score is not.

## Play 1 catalog - expansion and qualification

Expansion (batch seeds - do not call once per seed):
- `dataforseo_labs_google_keyword_ideas({ keywords: [...seeds], location_name,
  language_code, limit })` - category-relevant ideas, up to 200 seeds per call.
- `dataforseo_labs_google_keyword_suggestions` - long-tail phrases containing the seed.
- `dataforseo_labs_google_related_keywords` - depth-first related graph
  (people-also-search expansion).
- `dataforseo_labs_google_keywords_for_site({ target })` - what the domain (or a
  competitor domain) already surfaces for. Run on us AND top competitors.

Qualification (dedupe the union first, then qualify in bulk):
- `dataforseo_labs_bulk_keyword_difficulty` - KD 0-100, hundreds of keywords per call.
- `dataforseo_labs_search_intent` - informational / navigational / commercial /
  transactional, in bulk.
- `keywords_data_google_ads_search_volume` - Google Ads-grade volumes when precision
  matters (labs volumes are fine for sorting).
- `dataforseo_labs_google_keyword_overview` - deep-dive ONE keyword (volume, CPC,
  difficulty, SERP info). Per-keyword cost - use sparingly, for finalists only.

Feed the qualified union back into SKILL.md Play 1: cluster with `seo_keyword_clusters` /
`seo_topic_clusters`, score with the priority formula, persist the matrix to a sheet tab,
track the winners with `seo_track_keyword`.

## The shared tables (moved from SKILL.md's benchmarks)

- CTR by position (blended averages - for opportunity sizing, never promises):
  p1 ~28%, p2 ~15%, p3 ~10%, p4 ~7%, p5 ~5%, p6-10 ~2-4%, page 2 <1%.
  Opportunity = volume x CTR(target position) - current clicks.
- Attackable difficulty by authority tier (KD from
  `dataforseo_labs_bulk_keyword_difficulty`, authority from `backlinks_summary`
  rank): new/weak domains -> KD 0-20 long-tail only; mid-authority -> up to ~40;
  strong -> up to ~60; KD 60+ needs a dedicated content + link campaign and a quarter
  of patience. When in doubt check who actually holds positions 1-5
  (`seo_serp_get`) - if it is all major brands, re-scope.

## Play 2 catalog - competitor intelligence

- `dataforseo_labs_google_competitors_domain({ target })` - who overlaps us in the
  SERPs, with metrics and intersection counts.
- `dataforseo_labs_google_serp_competitors({ keywords })` - who owns the SERPs for a
  specific keyword set (use on a priority cluster before writing for it).
- `dataforseo_labs_google_domain_intersection({ target1, target2 })` - THE gap tool:
  keywords they rank for that we do not. Filter to their positions 1-20 and our
  position absent/>30; feed the winners straight into Play 1 qualification.
- `dataforseo_labs_google_ranked_keywords({ target })` - a competitor's full keyword
  footprint; sort by estimated traffic to find their money pages.
- `dataforseo_labs_google_domain_rank_overview({ target })` - domain-level standing;
  `dataforseo_labs_google_historical_rank_overview` for trajectory;
  `dataforseo_labs_bulk_traffic_estimation` to size several rivals in one call.
- Link gaps: `backlinks_domain_intersection` (domains linking to 2+ competitors but
  not us = warmest outreach list) and `backlinks_competitors({ target })` (domains
  sharing our link profile).

Vendor traffic estimates are estimates. Never aggregate them with GSC clicks or analytics
sessions into one total - the sources define "traffic" differently. Report them side by side,
each labeled with its source, and compare a competitor only against the same source's number
for us.

## SERP and on-page inspection

- `seo_serp_get({ keyword })` / `seo_serp_features({ project_id, keyword })` - the live SERP
  and its features; `serp_organic_live_advanced` and `serp_locations` are the raw vendor
  equivalents when you need the unwrapped payload or a location id.
- `on_page_instant_pages({ url })` - full on-page check: title, meta, headings, load
  metrics. Works on competitor pages - ideal for outline benchmarking before a brief.
- `on_page_content_parsing({ url })` - extracted content structure.

## Persistence discipline

A metered pull that is not persisted is money burned twice - once now, once when the next
session re-pulls it. Land every qualified universe, gap analysis, and competitor sizing in a
deliverable sheet tab the same session it is pulled, and note the pull date in the tab so the
next operator can judge staleness instead of re-buying it.
