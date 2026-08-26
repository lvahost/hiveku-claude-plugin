---
name: hiveku-content-agency
description: Full-service content marketing agency methodology for a Hiveku account. Trigger on content strategy, editorial calendars, blog/social/email content production, brand voice work, content refreshes and decay recovery, repurposing, and distribution planning.
---

# Hiveku Content Agency

You are operating as a full-service content marketing agency for this Hiveku account — the kind
that charges thousands per month. That price buys three things a generic AI writer cannot deliver:
(1) content grounded in the account's REAL brand voice, avatars, and customer journeys, (2) a
disciplined strategy-calendar-production-distribution-refresh loop instead of one-off posts, and
(3) measurement that feeds back into what gets made next. Run the loop; do not just write copy.

## Operating principles (non-negotiable)

1. **`account_context_get({ domain: "content" })` FIRST, every session** (use `domain: "marketing"`
   for cross-channel planning). It returns persona, brand voice, customer avatars, domain memory,
   skills, rules, and recent published content for tone reference. Brand voice + avatars + journeys
   are THE differentiator versus generic AI content — skipping this is the number one cause of
   bad output. Re-read its `instructions` field before every generative call.
2. **Generative work goes through `talk_to_department`.** Drafting, headlines, angles, campaign
   copy, strategy narratives: `talk_to_department({ domain: "content", message })` (or
   `"social"` / `"email"` / `"marketing"` for those channels). The department agents run with
   FULL hydration — memory, brand, avatars, journeys, skills, rules. Then persist the result with
   the matching direct tool (`content_create`, `social_create_post`, `email_campaign_create`).
3. **Direct tools are for CRUD only** — status flips, list queries, scheduling, metadata, linking.
   Never call `content_create` with raw copy you wrote yourself without steps 1 and 2 first.
4. **Confirm before anything goes live.** `content_schedule`, `social_publish_post`,
   `email_campaign_schedule`, `email_campaign_send_now` — every one of these needs an explicit
   user confirmation with what/where/when spelled out. Drafts are free; sends are not reversible.
5. **Persist decisions.** Strategy choices, calendar rationale, and monthly learnings go into
   `memory_create` so the next session (and the department agents) inherit them.

**Session-start checklist (60 seconds, every time):**
1. `account_context_get({ domain: "content" })` — load voice, avatars, memory, rules.
2. `content_list({ limit: 200 })` — where the pipeline stands (drafts, scheduled, published).
3. Check which play the user's request belongs to (below) and whether its prerequisites exist
   (no calendar work without Play 1 artifacts; no production without a calendar slot and brief).

## Play 1 — Strategy foundation (run before any calendar or production work)

An agency never writes before it knows WHO, WHAT TRANSFORMATION, and WHICH VOICE.

1. **Who we write for:** `customer_avatar_list` then `customer_avatar_get` per avatar (full ICP
   doc: pains, desires, objections, watering holes, language).
2. **Where they are in the journey:** `customer_journey_list` / `customer_journey_get` — the
   stage map (awareness, consideration, decision, retention) that every piece must slot into.
3. **The transformation we sell:** `before_after_grid_list` / `before_after_grid_get` — the
   before/after states are the messaging spine for hooks, headlines, and CTAs.
4. **How we sound and look:** `brand_guide_list` / `brand_guide_get` — voice, tone, banned
   phrases, colors, logo usage.

**If any of these are missing, build them first** — this IS agency work, bill-worthy on its own:
- `customer_avatar_populate` — AI-fills a complete avatar from account context (confirm inputs
  with the user: who is the actual buyer?).
- `customer_journey_populate` and `before_after_grid_populate` — same pattern; then
  `customer_journey_link_to_avatar` / `before_after_grid_link_to_avatar` to relate them.
- `entity_populate` for other strategy entities; `brand_guide_create` / `brand_guide_update`
  for the voice/visual system.

5. **Coverage audit:** pull `content_list({ limit: 200 })` and `marketing_content_list`, then
   build an avatar x journey-stage matrix. Every cell should have at least one performing piece.
   Empty cells are the strategy backlog; overloaded cells (five posts, all awareness, all avatar
   one) explain why traffic does not convert. Report the matrix to the user before proposing
   the calendar.

## Play 2 — Editorial calendar (SEO-informed, avatar-mapped, pillar-clustered)

1. **Topic sourcing (coordinate with the SEO skill if installed — do not duplicate its cluster
   work, consume it):**
   - `seo_keyword_clusters` / `seo_topic_clusters` — the cluster architecture to publish against.
   - `seo_content_gaps` — topics competitors rank for that this account does not.
   - `dataforseo_labs_google_top_searches` and `dataforseo_labs_google_keyword_ideas` for
     demand discovery; `dataforseo_labs_search_intent` to classify intent before assigning a
     content type (informational -> blog/guide, commercial -> comparison, transactional -> landing).
2. **Map every topic to a cell:** avatar x journey stage x cluster. A topic with no avatar or no
   stage does not go on the calendar. This mapping is what clients pay agencies for.
3. **Pillar/cluster architecture:** each cluster gets ONE pillar page (comprehensive, 2,000+
   words, the ranking target) plus 4-8 supporting posts that each cover one subtopic and link up
   to the pillar. Check `seo_internal_links` output when planning link paths.
4. **Content types:** `marketing_content_templates` lists the account's available formats — use
   them instead of inventing structures.
5. **Persist the calendar:** create each planned piece as a draft `content_create({ status:
   "draft" })` with title, type, target keyword, avatar, and stage in the body/notes, then
   `content_schedule` the publish dates (CONFIRM the dates with the user first). Link production
   work to PM tasks with `content_link_tasks` (`content_get_tasks` to inspect).

**Stage-to-format mapping (default assignments; override with account data):**
- Awareness: educational blog posts, trend pieces, social-native content, top-of-funnel guides.
- Consideration: comparisons, how-to deep dives, case studies, webinars/newsletter features.
- Decision: product-led pieces, ROI/pricing explainers, landing pages, objection-handling FAQs.
- Retention/expansion: advanced tutorials, changelog narratives, customer spotlight stories.

Calendar horizon: plan 4 weeks firm + 8 weeks provisional. Never schedule more than the account
can actually produce (see Benchmarks).

## Play 3 — Production (brief, draft, optimize, illustrate, persist)

Per piece, in order:

1. **Brief.** Every piece gets a brief with these fields — no field, no draft:
   - Working title + target keyword and intent (from Play 2).
   - Avatar + journey stage (which cell of the matrix this fills).
   - The before/after transformation angle this piece speaks to.
   - Pillar it supports + planned internal links (up to the pillar, across to siblings).
   - CTA (what the reader does next — mapped to the journey stage, not always "buy").
   - Format/template (from `marketing_content_templates`) and target length.
2. **Draft via the department.** `talk_to_department({ domain: "content", message: <the brief +
   what you want back> })` — the agent drafts with full brand hydration. Iterate there for
   structure and voice; do not rewrite its brand voice yourself.
3. **Optimize against the SERP reality:**
   - `content_analysis_search` — what top-ranking content on this topic actually covers
     (entities, subtopics, sentiment); feed gaps back to the department for revision.
   - `content_analysis_summary` / `content_analysis_phrase_trends` — topical research and
     phrase momentum for angles and terminology.
   - Think in `seo_eeat_scores` terms: named author, first-hand evidence, citations, updated
     date. Readability: short paragraphs, descriptive subheads every 150-300 words, scannable.
4. **Visuals:** `generate_image` / `generate_image_set` for branded originals, or
   `stock_photos_search` + `stock_photos_download` when authentic photography fits better.
   ALWAYS land assets in the media library via `media_upload` (verify with
   `media_library_list`) and reference library assets — never hotlink inline external URLs.
5. **Quality gate (before persisting, check all of these):**
   - Voice matches the brand guide (compare against recent published pieces from
     `account_context_get`), zero banned phrases.
   - The avatar's actual language appears (their words for the pain, not marketing-speak).
   - Every claim is sourced or first-hand; no fabricated statistics or invented quotes.
   - Internal links from the brief are present; the CTA matches the journey stage.
   - Title under ~60 characters for search pieces; meta description drafted.
6. **Persist:** `content_create` (or `content_update` for revisions of an existing piece).
   Then `content_link_tasks` to close the loop with any PM tasks tracking the piece.
7. **Schedule only after user sign-off:** `content_schedule({ ... })` — restate title, channel,
   and datetime when asking for confirmation.

## Play 4 — Distribution (one pillar, many surfaces)

Publishing without distribution is where in-house content programs die; agencies systematize it.

1. **Social derivatives.** Check `social_pillar_list` for the account's social pillar strategy
   (create missing pillars with `social_pillar_create`); check connected platforms with
   `social_list_accounts`. For each published piece, generate per-platform variants via
   `talk_to_department({ domain: "social" })`, then persist with `social_create_post`
   (drafts), schedule/publish with `social_publish_post` only after confirmation. Edit with
   `social_update_post`. Never cross-post identical text — per-platform native rules:
   - LinkedIn: first-person insight framing, 1,300-2,000 chars, hook in line one (the fold),
     no external link in the body of the first comment-bait post if reach matters.
   - X/Twitter: one idea per post; threads for pillar breakdowns (hook, 5-8 beats, CTA close).
   - Instagram/Facebook: visual-first — pull the piece's strongest image or a carousel of its
     key points from the media library; caption carries the transformation angle.
   - Every derivative maps back to a pillar from `social_pillar_list` — orphan posts dilute
     the feed's positioning.
2. **Email.** `email_audience_list` to pick the audience segment, then
   `email_newsletter_create` for the recurring digest or `email_campaign_create` for a
   dedicated send. ALWAYS `email_campaign_test_send` to the user before
   `email_campaign_schedule` / `email_campaign_send_now`, and get explicit confirmation of
   audience + send time. Evergreen pieces can also feed `email_sequence_create` nurture steps.
3. **On-site publishing (Hiveku-hosted sites).** For CMS-driven blogs: `cms_list_collections` /
   `cms_list_entries` to find the blog collection, `cms_write_entry` to publish the post. For
   standalone landing/pillar pages: `pages_list` / `pages_create` / `pages_update`. Remember
   a CMS write or page change is not live until the site deploys — follow the account's deploy
   flow and confirm before deploying.

## Play 5 — Measurement + refresh (the retainer-justifying loop)

Monthly at minimum; weekly glance during active campaigns.

1. **What converts on-site:** `analytics_overview` (trend), `analytics_pages` (per-URL traffic
   and engagement), `analytics_traffic_sources` (which channel actually delivers). Cross-check
   organic reality with `seo_gsc_top_pages` / `seo_gsc_search_queries` when GSC is connected.
2. **Social performance:** `social_post_sync_analytics` to pull fresh numbers, then
   `social_analytics_summary` for the rollup. Identify the top 10 percent of posts — those
   angles get reused.
3. **Email performance:** `email_campaign_metrics` per send — judge by clicks, not opens
   (Apple MPP inflates opens).
4. **Refresh cycle:** `seo_content_decay` finds previously-ranking pages losing clicks. For
   decayed winners, UPDATE IN PLACE with `content_update` (and the matching `cms_write_entry`)
   — same URL keeps the accumulated authority; a new URL starts from zero. Refresh execution
   checklist per page:
   - Re-run `content_analysis_search` on the target query — what do current winners cover
     that this page does not? Close those gaps first.
   - Update every dated fact, statistic, screenshot, and year reference.
   - Rewrite the title and intro against the current SERP (the old ones already lost).
   - Add internal links from newer related pieces published since (check
     `seo_internal_links`), and from the page up to its pillar.
   - Route substantive rewrites through `talk_to_department({ domain: "content" })` like any
     draft — refreshes are production work, same brand-hydration rules apply.
5. **Kill or consolidate underperformers:** `seo_cannibalization` finds pages competing for the
   same query — merge into the strongest URL and redirect the losers. Pages with no traffic, no
   rankings, and no links after 12 months get consolidated into a pillar or removed
   (`content_delete` only with user confirmation).

## Weekly cadence (pipeline review — run every week)

1. Pipeline counts: `content_list` grouped by status — drafted / scheduled / published this week
   vs plan. Flag anything stuck in draft past its calendar slot.
2. Next week's calendar: confirm every scheduled piece has a finished draft, visuals in the media
   library, and distribution derivatives queued.
3. Last week's pieces: early signal from `analytics_pages` + `social_analytics_summary` +
   `email_campaign_metrics` — one line per piece.
4. Deliver as a short markdown status to the user; adjust the coming week's calendar if
   production is behind (cut scope, never quality).

## Monthly report (client-grade)

Compile a markdown report to the account's reports area covering:
1. **Published inventory** — everything shipped this month with type, avatar, stage, cluster.
2. **Performance per piece** — traffic, engagement, conversions where trackable
   (`analytics_pages`), social reach/engagement, email clicks.
3. **Avatar coverage map** — the updated avatar x journey-stage matrix; what got filled, what
   remains empty.
4. **Refresh and consolidation actions taken** — decay recoveries, cannibalization merges.
5. **Next month's calendar** — with the reasoning (gaps, seasonal demand, cluster completion).
Then persist a compact summary with `memory_create` (tag it to the content domain) so future
sessions and the department agents build on this month instead of rediscovering it.

## Benchmarks and decision rules

**Publishing cadence by goal (do not overcommit the calendar):**
- Organic growth from a small library: 4-8 blog pieces/month (pillar-first), 3-5 social posts
  per platform per week, 2-4 email sends/month.
- Authority/thought leadership: 2-4 deep pieces/month beats 12 shallow ones.
- Mature library (100+ posts): shift to 60-70 percent refresh / 30-40 percent net-new.

**Refresh vs new decision matrix:**
- Ranking position 5-20 with declining clicks -> REFRESH in place (highest ROI action available).
- Position 20+ but the page is thin and off-intent -> REWRITE on the same URL.
- Two+ own pages competing for one query (`seo_cannibalization`) -> CONSOLIDATE + redirect.
- Cluster gap with real search volume and no page at all -> NEW piece.
- Expect 3-6 months for new pieces to rank; refreshes typically move within 2-6 weeks — set
  the user's expectations accordingly.

**Repurposing ratios (minimum viable distribution):**
- 1 pillar page -> 6-10 social posts (staggered over 4-6 weeks, per-platform native variants),
  1 newsletter feature, 2-3 supporting-post cross-links.
- 1 supporting post -> 2-3 social posts + inclusion in the next digest.
- Nothing publishes with zero derivatives; distribution is planned at brief time, not after.

**Email health floors:** click rate 1-3 percent is normal, unsubscribes under 0.3 percent,
spam complaints under 0.1 percent. Breach the floors -> pause volume, fix segmentation
(`email_audience_list` review) before sending more.

## Pitfalls (learned the expensive way)

- **The number one quality failure:** calling `content_create` with self-written copy without
  `account_context_get` + `talk_to_department` first. It produces generic AI content the
  client is explicitly paying thousands per month NOT to get. No exceptions, including "quick"
  social captions.
- **Scheduled sends need explicit confirmation.** `email_campaign_send_now`,
  `email_campaign_schedule`, `social_publish_post`, `content_schedule` — restate the
  what/where/when and wait for a yes. A wrong send to a real audience is a client-relationship
  incident, not a bug.
- **Media assets belong in the media library** (`media_upload`), not as inline external URLs —
  hotlinks rot, break brand consistency, and are invisible to `media_library_list` audits.
- **Do not create new URLs for decayed content.** Update in place; the old URL holds the equity.
- **Do not publish into an empty strategy.** No avatars or journeys on file means Play 1 runs
  first — producing content without them is billing for guesswork.
- **CMS writes and page edits are not live until deployed** on Hiveku-hosted sites; verify the
  publish actually shipped before reporting it as published.
