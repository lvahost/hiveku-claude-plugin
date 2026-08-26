# Link Building and Competitor Intelligence - Operator Manual

**What this covers.** The authority baseline, the opportunity queue, lost-link recovery, the
competitor set, the change-response loop, SERP-level link-gap work on one money keyword, and the
outreach handoff to Outbound. **Load this when** the ask is backlinks, referring domains, anchor
text, link velocity, toxic links, link reclamation, "why did they hold and we dropped", competitor
teardowns, or the Authority section of the monthly report. SKILL.md gives the arc (Plays 2 and 5);
this is the manual those plays point at, with the response shapes, traps, numbers and sequencing.

---

## 0. Ground truth: where this data actually lives

Four stores sit behind these nine tools, populated by different pipelines, and three can be
legitimately empty on a healthy account. Confusing "not populated" with "no links" is the most
expensive mistake here: it becomes a false client-facing claim.

| Tool | Store | Scope | Populated by | Sort |
|---|---|---|---|---|
| `seo_backlinks_list` | backlink **profile** (one row per SEO project) + link rows | SEO project (required) | the dashboard's Domain Analysis run. The link rows have **no writer** in the API | links by domain_rating desc |
| `seo_backlink_opportunities` | prospect queue | **account-wide** | dashboard prospecting, imports | opportunity_score desc |
| `seo_new_lost_backlinks` | the **manual link tracker** (links built or pursued) | website project, optional | you, in the dashboard | created_at desc |
| `seo_bing_backlinks` | Bing Webmaster link counts | Bing connection site | Bing, live | Bing's order |
| `seo_competitors_list` / `seo_list_competitors` | competitor analysis rows | SEO project (required) | Domain Analysis, or `seo_add_competitor` | organic_traffic desc |
| `seo_competitor_changes` | competitor activity feed | **account-wide** | an SEO competitor-change workflow node | change_detected_at desc |
| `seo_serp_get` | live SERP (metered) | keyword | live, per call | SERP order |

Work from local files: `hiveku-data/seo/backlinks.json` (`seo_backlinks_list` per project, limit
200), `hiveku-data/seo/competitors.json` (`seo_list_competitors`), and
`hiveku-data/localseo/bing_backlinks.json` - Bing backlinks land under **localseo**, not seo, so do
not conclude the pull failed. Read `hiveku-data/STATUS.json` `failed[]` first: empty rows after an
`error` mean NOT RETRIEVED, never "no data". **No local snapshot exists** for
`seo_backlink_opportunities` or `seo_competitor_changes`; both are live and cheap. `seo_serp_get` is
the only metered call here.

---

## 1. Decision frameworks

### 1.1 The authority question, in order

Never open with "how do we get links". An earlier answer usually kills the work implied by a later
one.

1. **Is authority actually the constraint?** If we rank 4-15 for the cluster it is not: on-page and
   internal linking are, and striking-distance harvesting beats a link campaign on speed and cost.
   Authority binds only when we are absent from the top 50 and the top 5 are materially stronger
   domains.
2. **Are we losing what we already have?** Recovery is 5-10x cheaper than acquisition and is the
   only link work with a predictable close rate. Lane 1 before Lane 4.
3. **Where would a new link even land?** Links to commercial money pages arrive slowly and look
   forced. With no linkable asset, the first deliverable is the asset, not the outreach.
4. **Can we route authority internally instead?** One earned link into a hub feeding 12 spokes beats
   three on orphan pages. Internal routing lives in the technical reference.

### 1.2 Scoring one opportunity: R-A-P-D

`opportunity_score` is a **relative sort key within one pull**, not an absolute grade: a stored
decimal whose scale is not guaranteed across import batches. Normalize by rank inside the batch,
then re-score the top on four axes.

- **R - Relevance** (`topical_relevance`, `industry_match`, verified with `web_scrape`). Predicts
  movement best, so weight it hardest.
- **A - Authority** (`domain_rating`, `domain_traffic`). Directional only: a DR 45 niche publication
  beats a DR 78 aggregator for a specialist client.
- **P - Placement** (`source_type`). In-body editorial on an indexed, trafficked page, or a sitewide
  slot worth a fraction of it.
- **D - Durability.** Guest posts and listings churn; a link in a page that ranks and earns its own
  links compounds. Score paid or sponsored low.

Kill the prospect if R is low, however high A is. Two high-R links beat ten high-A ones.

### 1.3 The four lanes, in priority order

Later lanes get only the hours earlier ones do not consume.

1. **Reclamation.** Lost links, links pointed at our 404s or redirect chains, unlinked brand
   mentions. Highest close rate on the board, near 100 percent when the fix is our own redirect.
2. **Relationship.** Partners, vendors, associations, sponsorships, customers, press we already
   know (`account_context_get`, `get_account_info`). Clients typically have 10-30 unclaimed link
   relationships they never framed as SEO.
3. **Relevance gap.** Domains linking to two or more competitors but not us. Relevance is proven and
   the pitch writes itself: the warmest cold list that exists.
4. **Net new.** Digital PR, linkable assets, original data. Highest cost and ceiling, slowest, and
   never the first lane on a new engagement or the only lane on a mature one.

### 1.4 Competitor set doctrine, and sequencing

Keep three lists. **SERP competitors** (who occupies the SERPs for priority clusters, from
`seo_serp_get` plus the competitor analysis rows) drive tactics. **Business competitors** (who the
client believes they compete with - ask) overlap less than clients expect and drive what the client
believes about the report. **Link-profile competitors** (similar backlink profile, whatever they
sell) are the source of the warmest gap lists. Track **4 to 8**, never 20: each is a recurring cost
and a recurring paragraph, so drop any that has sat two quarters without changing a decision.
Confirm the set with the client and record it in memory - the most re-litigated decision in a
retainer. A row whose `last_analyzed` is older than 60 days is a historical artifact, not current
standing; a competitor gaining referring domains at more than 2x our rate for two straight months is
a strategy conversation, not an appendix bullet.

Quarter shape: month 1 baseline, set agreed, reclamation sweep, relationship list; month 2
relevance-gap list to outbound, assets scoped; month 3 net-new campaign, weekly reclamation habit,
teardown ships. Windows to put in the plan in writing: a recovered link restores rankings in 2-6
weeks, a net-new campaign moves them in 8-16, and link work never moves a SERP whose top results
beat us on relevance rather than authority.

---

## 2. The plays

Every play assumes `account_context_get({ domain: 'seo' })` has run and its instructions field has
been read: pitches written without brand voice get accounts flagged.

### Play A - Authority baseline (month 1, then monthly)

1. `seo_list_projects` for `project_id`; note the project's domain, which you compare against every
   `target_domain` you meet later.
2. `seo_backlinks_list({ project_id, limit: 100 })`. `data.profile` first: `referring_domains`,
   `total_backlinks`, `dofollow_backlinks`/`nofollow_backlinks`, `gov_backlinks`/`edu_backlinks`,
   `new_backlinks_30d`, `lost_backlinks_30d`, `toxic_score`, `avg_domain_rating`, `link_velocity`,
   `last_updated`. Then `data.backlinks[]`: `source_url`, `source_domain`, `target_url`,
   `anchor_text`, `domain_rating`, `page_rating`, `is_dofollow`, `link_type`, `first_seen`/
   `last_seen`, `is_active`, `traffic`.
3. `seo_bing_backlinks({ site_url, limit: 200 })` as an independent second opinion (referring URLs
   and counts, no anchors, from Bing's index): for magnitude sanity, when `last_updated` is stale,
   and when a client disputes the numbers. `site_url` falls back to the connection's value, so omit
   rather than guess. Differing magnitudes are normal: name one source primary, never average.

**Read out of it:** `referring_domains`, never `total_backlinks` (40,000 links from 60 domains is a
sitewide footer, not authority). Dofollow share below 0.3 on a small profile means comment and
syndication noise. `avg_domain_rating` with `referring_domains` says broad-and-weak vs
narrow-and-strong, deciding whether the next campaign chases volume or a few real placements.
`last_updated` decides whether any of it is reportable (4.1).

**Quarterly, on the same pull:** page while `pagination.total_pages > 1` and build the anchor
distribution from `anchor_text` (branded, naked URL, generic, partial match, exact-match commercial)
against `profile.toxic_score`. Rising exact-match share becomes a real problem when those anchors
concentrate in a few low-quality domains acquired in a narrow window: a bought-link burst that
usually predates the engagement.

**Closes the loop** (the tier this sets caps attackable difficulty for the whole roadmap):
`memory_create` an authority-baseline note (domain, referring domains, dofollow ratio, avg DR, toxic
score, date), since next month's delta is only credible if this month was recorded. Then
`pm_tasks_create` one task per lane.

### Play B - Weekly link delta and lost-link recovery

Ten minutes weekly, and the highest-yield recurring habit in link work.

1. `seo_new_lost_backlinks({})` - deliberately with **no** `project_id` on the first call (trap
   4.2). Manual-tracker rows, newest first: `url`, `title`, `target_url`, `target_anchor`,
   `link_type`, `status` (`published` | `unpublished`), `date_published`, `page_authority`,
   `domain_authority`, `notes`.
2. Compare `profile.lost_backlinks_30d` and `new_backlinks_30d` from `seo_backlinks_list` with last
   week's recorded values.
3. For each loss worth chasing, `web_scrape({ url: <source_url> })` and classify it:
   - Page live, our link removed: editorial or redesign. Recoverable by outreach.
   - Page 404: host removed it. Not recoverable; hunt a replacement page with
     `web_map({ url: <source_domain> })`.
   - Our target URL 404s or chains: **our fault**. Fix the redirect. Free recovery, today.
   - Page live and link present: crawler artifact. Do not chase, do not report as lost.
4. `seo_serp_get({ keyword: <cluster head the link supported> })` only if a top-10 position moved
   the same week. A lost link plus a stable ranking is a logging item, not an incident.

**Closes the loop:** `pm_tasks_create` per recoverable link, titled with source domain plus
classification, so the report can count recoveries. Ship our-fault redirect fixes through the site
tools in the technical reference, then `pm_tasks_complete`. There is **no MCP write tool for the
link tracker**: logging a won link is a dashboard action, so say so plainly and mirror it in a PM
task.

### Play C - Opportunity triage and the outbound handoff

1. `seo_backlink_opportunities({ limit: 100 })`. Account-wide, `opportunity_score` desc. Decision
   fields: `target_domain`, `source_domain`, `source_type`, `domain_rating`, `domain_traffic`,
   `spam_score`, `topical_relevance`, `contact_email`, `competitors_linked`,
   `competitor_anchor_texts`, `status`, `outreach_attempts`.
2. **Filter by `target_domain` yourself.** The tool takes `project_id`; the endpoint ignores it, so
   on a multi-site account you are seeing every site's prospects at once.
3. Drop rows where `status` is not `new` or `contacted`, where `outreach_attempts >= 3`, or where
   `spam_score` breaches section 3. Re-contacting a prospect that already said no burns the client's
   sending domain.
4. Score survivors on R-A-P-D. `competitors_linked` is the gold column: two or more tracked
   competitors linked makes it Lane 3, and `competitor_anchor_texts` shows what they were willing to
   link with, which shapes the ask.
5. Fill contact gaps: `web_map({ url: <source_domain> })` for about / contact / write-for-us paths,
   then `web_extract` for the editor name and address. Verify before loading; list quality is
   deliverability.
6. Angles: `talk_to_department({ domain: 'seo', message })` with the client's assets, the segment
   and the competitor link that proves relevance. One angle per segment, not per prospect.
7. Handoff: `talk_to_department({ domain: 'outbound', message })` with the segmented list, angles
   and target pages. Outbound owns loading, sequencing and sending. **Do not send from here.**

**Closes the loop:** `pm_tasks_create` for the campaign with segment counts and target link count;
`memory_create` the angle and segments, or `memory_update` the existing link-strategy note.

**Confirm before handoff:** segment counts, five sample prospects with why each qualifies, and the
angle copy. Get a yes. Outreach is client-facing sending: never silent, never bulk-applied.

### Play D - Building and maintaining the competitor set

1. `seo_competitors_list({ project_id })`, or `seo_list_competitors({ project_id, limit: 50 })` when
   you need paging (same endpoint; `seo_list_competitors` is the one carrying `page`/`limit`). Rows:
   `competitor_domain`, `domain_rating`, `organic_keywords`, `organic_traffic`, `shared_keywords`,
   `keyword_gap`, `backlinks_count`, `referring_domains`, `market_share`, `trend_direction`,
   `last_analyzed`.
2. Cross-check SERP reality on 3-5 cluster heads with `seo_serp_get({ keyword, location_code,
   language_code, device })`. If fewer than half the top 10 belong to tracked domains, the set is
   stale or wrong.
3. Add what is missing with `seo_add_competitor({ project_id, competitor_domain })`, confirmed
   **by name, one at a time**. A duplicate returns 409 "already tracked": a successful no-op, not an
   error to retry.
4. Publishing velocity has no tool: `web_scrape` or `web_crawl` the competitor's blog index and
   count posts per month over the last quarter.

**Read out of it:** `keyword_gap` and `shared_keywords` size the overlap; `trend_direction` and
`market_share` say who is moving (`account_context_get` and `get_account_info` often already name
the client's own rival list). A rival with lower traffic, rising trend and 3x our velocity is a
bigger threat than the incumbent leader.

**Traps:** a competitor added via `seo_add_competitor` comes back with **null** metrics because the
tool writes only the domain; null means "not analyzed yet", not zero. And a dashboard Domain
Analysis run **replaces the whole competitor list for the project** (delete then re-insert from the
vendor list), so manually added competitors silently disappear. Re-check after any run and keep the
agreed set in `memory_create` as the restore point.

### Play E - Competitor change-response loop (weekly)

1. `seo_competitor_changes({})`. Account-wide, newest first, roughly 30 rows: `our_domain`,
   `competitor_domain`, `competitor_url`, `keyword`, `change_type`, `change_detected_at`,
   `before_snapshot`/`after_snapshot`, `changes`, `ranking_before`/`ranking_after`, `urgency`,
   `requires_response`, `response_status`.
2. Filter client-side to this project's `our_domain`, then `requires_response === true` or `urgency`
   high/critical. The tool passes no filters, so never claim "no urgent changes" from an unfiltered
   read that simply paged past them.
3. Read `before_snapshot` vs `after_snapshot` and `changes[]`, then confirm on the live SERP with
   `seo_serp_get({ keyword })`; the feed can lag.
4. `web_scrape({ url: competitor_url })`: is the win depth, a new asset, or a SERP-feature capture?

Most changes deserve nothing. Respond when a competitor took a position we held or captured a SERP
feature on a money term. **Closes the loop:** `pm_tasks_create` per counter-move, keyword and
competitor URL in the body. There is **no tool to mark a change row responded**: `response_status`
stays `pending` forever from here, so track it in the PM task and never report it as live state.

### Play F - SERP-level link gap for one money keyword

For a keyword worth the surgery: high commercial intent, stuck outside the top 10, content at
parity.

1. `seo_serp_get({ keyword, location_code: 2840, language_code: 'en', device: 'desktop' })`; add
   `device: 'mobile'` for consumer-facing clients, the sets differ. Take the top 5 URLs and
   `web_scrape` each to confirm intent and build the outline benchmark.
2. Pull the opportunity queue (Play C) and filter `competitors_linked` to those five domains: those
   prospects link to a page outranking us on this exact query, the highest-relevance list these
   tools can produce.
3. Where the queue is thin, `web_search` the keyword plus link-intent modifiers (resource lists,
   roundups, association directories) and `web_crawl` candidates for a contact path.

**Threshold for the metered call:** the keyword is on the tracked priority list AND either a top-10
position moved this week or a campaign is being planned against it. Weekly per keyword at most.

---

## 3. Thresholds and benchmarks

Triggers for investigation, never promises to clients.

**Profile health.** Referring domains under 20: authority is a real constraint (cap the roadmap at
KD 0-20 long-tail); 20-100: mid-tier, KD up to about 40. Dofollow share under 30 percent:
noise-heavy, investigate before reporting growth. `avg_domain_rating` under 15 across hundreds of
referring domains: near-certain directory or scraper inflation, so caveat the count. `toxic_score`
over 30: quarterly hygiene item; over 50: raise with the human and investigate the acquisition
window and anchor concentration, never acting unilaterally.

**Velocity and delta.** `lost_backlinks_30d` above 10 percent of `referring_domains`: same-week
investigation, and the number most likely to precede an unexplained ranking drop. Any loss from a
domain with DR above 40, or a page with `traffic` above 0: individual ticket. `new_backlinks_30d`
above 3x the trailing average with no campaign running: check for a scraper network before
celebrating. Referring domains moving over 20 percent between monthly reads: a data event until
verified with `seo_bing_backlinks`.

**Anchor distribution** (healthy organic profile, directional): branded plus naked URL 50 percent or
more; generic 15-30; partial match 10-25; exact-match commercial under 5, never over 10. Past 10,
stop requesting exact-match anchors and shift new asks to branded.

**Opportunity queue.** `spam_score` over 30: drop; over 15 with low `topical_relevance`: drop.
`domain_traffic` 0 or null with DR above 30: inflated or parked, verify with `web_scrape`.
`outreach_attempts >= 3`: dead. Working list 20-40 live prospects per month for a single-site
retainer; 300 is a deliverability incident waiting to happen. Close rates for sanity-checking a
forecast: reclamation 30-60 percent, warm relationship 20-40, relevance gap 3-8, cold net-new 1-3.

---

## 4. Diagnosis: when the data looks wrong

**4.1 `seo_backlinks_list` returns a profile but `backlinks: []`.** Expected, not broken: the
per-link table has no writer in the API surface, and the profile summary comes from the dashboard's
Domain Analysis run. Empty means **not populated**, never "no backlinks", and is never reported as
zero links. Recover by reading `profile.dataforseo_raw_data` for the vendor summary, cross-checking
`seo_bing_backlinks`, and asking the user to run Domain Analysis in the dashboard for this project.
Say exactly that; do not invent a refresh tool.

**4.2 `seo_new_lost_backlinks` returns an empty array.** Three causes, likeliest first. (a) **Wrong
project id**: this tool's `project_id` scopes to the **website/builder** project, not the SEO
project from `seo_list_projects`. Pass an SEO project id and you get zero rows with a 200 OK, so
call it with no `project_id` first and filter yourself. (b) **`since` does nothing**: the tool
accepts it, the endpoint ignores it. Rows are newest-first, so filter on `created_at` or
`date_published` client-side, and never say "no links lost since X" from a `since` you passed.
(c) The tracker is genuinely empty because it is manual and unused: the common case on a new
account, and a process fix rather than a tool fix.

**4.3 `seo_backlink_opportunities` shows another site's prospects.** `project_id` is accepted by the
tool and ignored by the endpoint; the queue is account-scoped, so filter on `target_domain`. Same
for `seo_competitor_changes` (`our_domain`) and unscoped `seo_new_lost_backlinks`. On an agency
account this is also confidentiality: never surface another client's rows in this client's report.

**4.4 `seo_competitor_changes` is empty.** The feed is written by an SEO competitor-change workflow
node; with no such workflow on the account it is permanently empty, and calling harder will not
populate it. Confirm with `hiveku_docs_search` then `hiveku_docs_get` on competitor change
detection, tell the user monitoring is not running, and offer the fallback: weekly `seo_serp_get` on
5 cluster heads plus `web_scrape` of competitor blog indexes. Never present an empty feed as "no
competitor activity".

**4.5 `min_authority` on `seo_backlinks_list` does nothing.** The endpoint does not read it. Rows
are already sorted by `domain_rating` desc, so page 1 is your high-DR set; filter client-side. Same
class as 4.2 and 4.3: **an accepted argument is not a honored argument**. When a filter feeds a
client-facing number, verify it by inspecting the returned rows.

**4.6 Numbers do not move.** Check in order: `last_updated` (if the analysis has not re-run, the
number cannot move); whether links landed on indexed, trafficked pages; whether target URLs resolve
without a redirect chain; whether the timeframe is honest against 1.4. Three of the four are
plumbing, not strategy.

---

## 5. Edge cases and failure modes

- **Never buy links, propose a paid placement network, or run a PBN.** Explain the risk and
  redirect to digital PR and relationships, whatever a competitor appears to do.
- **Never send outreach from this skill.** Sending is Outbound's job and needs explicit human
  approval; a silently sent campaign is a deliverability risk and a trust breach.
- **Never build a disavow file from these tools.** Nothing here exposes disavow, the data cannot
  support the judgment, and a bad disavow is one of the few irreversible harms in SEO. If it looks
  warranted, escalate to the human with the evidence.
- **Never bulk-add competitors.** Each `seo_add_competitor` is confirmed by name; a bulk-added set
  is one nobody agreed to, and it inflates every future report.
- **Do not treat vendor DR as truth, and never report `total_backlinks` growth as authority
  growth.** One sitewide footer link adds thousands of backlinks and zero authority. Report
  referring domains, normalized for the rival's age and size: a 15-year-old incumbent always wins
  raw count, so the reportable comparison is velocity and relevance.
- **Do not let an empty response become a claim** (4.1, 4.2, 4.4). Reported as "no links" or "no
  competitor activity", it is a false statement that will eventually be discovered.
- **Respect approval thresholds and protected assets.** Anything touching the live site, redirect
  fixes included, goes through SKILL.md's confirmation and deploy discipline: commit is not live,
  and an unreviewed redirect fix can take a page down.
- **Multi-site accounts:** filter every account-scoped read by domain before counting (4.3).

---

## 6. Persistence and reporting

**Memory (decisions, not data).** `memory_list` first to avoid duplicates, then `memory_create` for
a new decision or `memory_update` to amend one. In memory: the agreed competitor set and why; the
authority baseline with its date; the link strategy (lanes, assets, anchors we will and will not
request); vetoed domains; the disavow stance. Never link tables or prospect lists - those live in
deliverable sheets and `hiveku-data/`.

**PM tasks (the work).** `pm_tasks_create` per accepted item: one per recoverable link, campaign,
counter-move and asset, with source domain, target URL and lane in the title so the report assembles
from task titles alone. `pm_tasks_update` the moment one stalls or changes owner, and
`pm_tasks_complete` only when the link is live and verified, not when the email went out. With no write tool on the
tracker, the PM task **is** the record of a won link.

**The Authority section of the monthly report** (assembled with the reporting tools in the
reporting-and-delivery reference): referring domains this month vs last, delta stated first; links
won, each named with source domain, target page and lane (links won, not emails sent); links lost
and recovered with the Play B classification; anchor distribution only when it moved materially;
competitor movement, including why we did not respond where we did not; next month's lane,
prospects, asset and timing window from 1.4. Every number must be reproducible from a named tool
call, and a figure from `web_scrape` or a dashboard view is labelled as such.

**Capabilities with no tool** (name the fallback, never invent a tool): creating an opportunity row;
writing to the link tracker; marking a competitor change responded; editing or deleting a tracked
competitor; disavow; anchor-distribution reports; competitor link velocity. All are dashboard
actions or `web_*` research, mirrored into PM tasks and memory. And `seo_project_get` is not the
SEO-project read: it carries site-level SEO settings and takes the builder project id, not the
`seo_list_projects` id.
