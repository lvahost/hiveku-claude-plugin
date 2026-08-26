# Technical SEO - Operator Manual

## What this covers / when to load this

The deep manual behind Play 4 of the SEO agency skill: crawl and index health, Core Web Vitals,
sitemaps, structured data, internal linking, entity signals, and the Search Console and Bing surfaces
that prove any of it. Load it when running or reading an audit, when a client asks why pages are not
indexed or why the site is slow, after a deploy, when deciding whether a ranking loss is technical or
editorial, or before touching canonicals, sitemaps, robots directives, or schema on a live account.
SKILL.md gives the arc and cadence; this gives thresholds, tool chains, diagnosis trees, and the
mistakes that quietly cost money. Argument shapes below are the common form - confirm schemas with
`hiveku_docs_search` / `hiveku_docs_get` before any write.

---

## 0. Orientation before any technical work

1. `account_context_get({ domain: 'seo' })` - persona, brand voice, domain memory, rules, approval
   thresholds. Re-read its `instructions` field before any generative call.
2. `memory_list` - prior decisions, before re-deriving them: the exact GSC property string, canonical
   strategy, protected templates, accepted exclusions ("the /legacy tree is intentionally
   noindexed"), CWV baseline, last audit id. Then `hiveku-data/seo/projects.json` and `audits.json` -
   free and instant, orientation only; decision-grade data gets pulled live.
3. `seo_list_projects` -> `project_id`, then `seo_project_get({ project_id })` for domain, site_url,
   and which sources exist. Nearly every tool below needs `project_id`; `get_account_info` gives the
   account-level view when the project view is not enough.

If `seo_project_get` shows no GSC or Bing source, say so: a technical audit without Search Console is
a crawl opinion, not an indexation report. No tool here connects a source - that is the SEO
department setup doc (`hiveku_docs_search` then `hiveku_docs_get`) or the dashboard.

---

## 1. Decision frameworks

### 1.1 The CIRR ladder - which layer is actually broken

Work on a higher rung is wasted while a lower one is broken.

1. **Crawl** - can a bot fetch it? robots.txt Disallow, 5xx, timeouts, auth walls, parameter space,
   redirect chains.
2. **Index** - will the engine store it? noindex, canonical elsewhere, thin or duplicate, soft 404.
3. **Render** - does the stored version contain the content? JS-dependent copy, blocked resources.
4. **Rank** - does it compete? Internal links, schema, CWV, relevance.

A client says "our new service pages get no traffic": do not start with CWV, walk the ladder. This is
also the thirty-second triage. `seo_gsc_inspect_url` on the affected URL (crawlable, indexable, which
canonical Google picked, when it was last crawled) resolves rungs 1 to 3 in one call; if clean,
`seo_list_audits` and read the newest audit delta for a template regression; if still clean it is not
technical, so hand it to rankings, content, or authority and say so. A senior specialist is as
valuable for ruling technical causes out as for finding them.

### 1.2 Severity x effort x blast radius

- **Severity**: removes pages from the index (5), suppresses rankings sitewide (4), degrades a
  template (3), affects a handful of pages (2), cosmetic (1).
- **Effort**: one config or template change (1), template plus content pass (2), code change with a
  deploy and QA (3), migration (5). **Blast radius**: how many URLs one fix touches.

Priority = (Severity x Blast radius) / Effort. Above ~8 this week; 3 to 8 this sprint; below 3 gets
batched into the next content refresh and never becomes a standalone ticket. **An audit finding
without a `pm_tasks_create` is a PDF, not a service.**

Blast radius only works if you think in templates: almost every real problem is a template problem
wearing a page-count costume. If 380 of 400 findings share a path prefix or a CMS collection, that is
ONE ticket worth 380 pages. Junior audits are 900-row spreadsheets; senior ones are nine tickets.

### 1.3 Sequencing: fix, then ask for a recrawl

Never resubmit a sitemap or submit a URL *as* the fix, and never mass-submit weak URLs: submission is
not a ranking factor, it only accelerates discovery of a change you already made. Always diagnose ->
fix at source -> confirm live -> `seo_gsc_submit_sitemap` / `seo_bing_submit_url` -> re-verify with
`seo_gsc_inspect_url` after 3 to 14 days.

### 1.4 Is it technical at all?

Rule out three cheaper explanations for a drop first: seasonality (year over year), a core algorithm
update (`web_search` the date), and measurement breakage (tags removed, property changed, a filter
left on). Technical fixes verify slowly, so a wrong diagnosis costs a month.

---

## 2. Tool surface notes

- **Audits**: the account exposes a runner (`seo_run_audit`), a start/poll pair (`seo_audit_start` +
  `seo_audit_get`), and two listing variants (`seo_audit_list`, `seo_list_audits`). Call a listing
  first - free, instant, often already answers the question.
- **Caps that shape every play**: `seo_gsc_index_coverage` is **max 50 URLs per call** and slow;
  `seo_gsc_inspect_url` returns the **indexed snapshot only, with no live test via the API**;
  `seo_core_web_vitals` may return field or lab data and you must label which in every report.
- **Writes**: `pages_update` (Hiveku-hosted title, meta, slug, SEO fields), `cms_write_entry`,
  `seo_task_implement` (hands an accepted task to the implementation pipeline).

**No tool for these - name the fallback out loud:**
- robots.txt, meta robots, X-Robots-Tag: `web_scrape` `https://domain/robots.txt` and sample URLs.
- Ad-hoc crawl outside the audit: `seo_run_audit` is the crawler. For samples, `web_map` (discovery),
  `web_crawl` (scoped crawl), `web_extract` (fields across a URL list).
- Google crawl-stats report, Removals, live URL test: dashboard / Search Console UI only, with
  `seo_bing_crawl_stats` covering the Bing side. Server logs: no tool, client export only.
- Rendering diff: `web_scrape` raw HTML against what `seo_gsc_inspect_url` reports Google saw.
- Code-level fixes (redirects, template JSON-LD, headers) route through the site and VCS workflow,
  gated on approval. Client-facing deliverables and report sections belong to the
  reporting-and-delivery reference; here you produce findings, tickets, and memory entries.

---

## 3. The plays

### Play T1 - Technical baseline (onboarding, once)

1. Orientation per section 0, then `seo_list_audits({ project_id })` - if a technical audit ran
   within 14 days, read it instead of paying for a new crawl.
2. `seo_run_audit({ project_id, audit_type: 'technical' })` (or `seo_audit_start`). Note the id and
   poll `seo_audit_get({ audit_id })` until complete.
3. Read out of `seo_audit_get`, in order: URLs crawled vs known; status-code counts; indexability
   blockers (noindex, canonical mismatch, robots-blocked); duplicate titles and metas; redirect
   chains and loops; broken internal links; missing H1; thin pages.
4. `seo_core_web_vitals({ project_id })` - LCP, INP, CLS, TTFB, mobile and desktop, and which
   templates the sampled URLs represent.
5. `seo_gsc_index_coverage({ site_url, urls })` on the top 50 URLs **by business value** (home, money
   pages, one per template), not a random slice. Bucket the coverage states.
6. `seo_internal_links({ project_id })` - orphans, depth, most- and least-linked pages.
   `seo_schema_markup({ project_id })` - detected vs suggested per template.
   `seo_entity_check({ domain })` - does the brand resolve, are `sameAs` profiles consistent.
   `seo_bing_crawl_stats({ site_url })` - a free second opinion, and Bing crawls more literally, so
   its error list is often a cleaner read of server behaviour.

**Close the loop**: one `memory_create` entry, "<domain> technical baseline", holding audit id and
date, crawl size, index ratio, the CWV triple with its field/lab label, the top five findings with
priority scores, the exact GSC property string, and approved exclusions. Confirm the fix list, then
`pm_tasks_create` one ticket per accepted fix.

### Play T2 - Regression sweep (monthly, and after every deploy)

Run monthly, and again within 24 hours of any deploy touching templates, routing, or the CMS - the
post-deploy pass is the highest-value habit in technical SEO and the one nobody does.

1. `seo_list_audits({ project_id })` -> previous audit id, then
   `seo_run_audit({ project_id, audit_type: 'technical' })`.
2. `seo_audit_get` on both ids and **diff them**. The delta is the report, not the absolute counts.
   Hunt: a new noindex on a template, a flipped canonical, a jump in 404s (a deploy changed slugs), a
   new redirect chain, a title pattern that lost its brand suffix. Any **new** severity-5 finding is
   a same-day escalation, not a monthly-report line.
3. Post-deploy, hunt the four classic regressions: a staging noindex shipped to production;
   robots.txt replaced with a blanket Disallow; slugs changed without 301s, producing a 404 wall;
   canonicals pointing at staging or the home page. Smoke-test with `seo_gsc_inspect_url` on the home
   page and two money pages, plus `seo_bing_crawl_stats` for a fast independent error count, and
   re-check `seo_core_web_vitals` against the memory baseline (over 15 percent movement on any metric
   gets investigated, Play T3).
4. `pm_tasks_update` on in-flight tickets; `pm_tasks_complete` only with proof attached (inspection
   result, audit delta, GSC number). Never complete on "the code shipped" - complete on "the engine
   agrees". On a regression, escalate same day at severity 5, and only once the fix is live use
   `seo_gsc_submit_sitemap` and `seo_bing_submit_url` to accelerate recovery.

### Play T3 - Core Web Vitals remediation

Thresholds in section 4. A URL group passes only when LCP, INP, and CLS are all Good at p75. Field
data is a **28-day rolling window**, which drives the verification schedule below.

1. `seo_core_web_vitals({ project_id })` - mobile and desktop separately. Mobile is what matters;
   desktop passing while mobile fails is the normal shape, not a reason to relax.
2. Group failing URLs by template: /blog/* failing LCP while /product/* passes is one defect.
3. Attribute before proposing a fix. LCP poor **with** TTFB over 800 ms is server or cache and the
   image is a red herring; LCP poor with TTFB fine is the hero resource (preload, dimensions, format,
   or a lazy-load attribute wrongly applied above the fold); CLS poor is unsized images or embeds,
   injected banners, late webfonts; INP poor is main-thread work from third-party scripts, heavy
   hydration, or unthrottled handlers. For client-showable evidence, `web_scrape` the failing URL and
   note render-blocking resources and third-party origins.
4. Content-level fixes (oversized hero uploads, missing dimensions) via `pages_update` or
   `cms_write_entry` after confirmation. Code-level (preload hints, script deferral, caching headers)
   is a deploy - `pm_tasks_create` and get approval.
5. **Verification schedule**: no field movement for ~7 days, partial at 14, full at 28. Set the
   task's verification date at fix_date + 28. Do not re-report CWV weekly, and never call a fix
   failed before day 28.

Never chase a Lighthouse performance score: it is a lab composite that moves for reasons users never
feel, and "we made it faster" without a p75 number is not evidence.

### Play T4 - Indexation investigation

Trigger: pages not appearing, an index-count drop, "is Google seeing this?".

1. `seo_gsc_index_coverage({ site_url, urls })` in prioritized batches of 50. Read the bucket counts.
2. For each failing bucket, take one representative URL to
   `seo_gsc_inspect_url({ site_url, inspection_url })`. Read coverage state, Google-selected vs
   declared canonical, crawl and indexing allowed, last crawl date, referring page, mobile usability,
   and rich-result detection. This one call resolves CIRR rungs 1 to 3.
3. If indexing is disallowed, find the source: `web_scrape` the URL and robots.txt, and distinguish
   the three mechanisms, because they fail differently. **robots.txt Disallow** leaves the URL
   indexable URL-only and means Google **cannot see** a meta-noindex on that page, so never combine
   them. **meta robots noindex / X-Robots-Tag** removes reliably, but requires the page to be
   crawlable. **canonical** is a hint, not a directive; Google may pick a different URL.
4. Cross-check the other engine with `seo_bing_inspect_url({ site_url, url })` - free, often faster,
   and it crawls more literally. Bing indexed and Google not means the block is Google-side quality
   or canonicalization, not server or robots; neither engine having it means crawl access, so confirm
   with `seo_bing_crawl_stats`. A `web_search` site: query is a directional third signal.
5. Fix at source, Play T5 to resubmit, re-inspect after 3 to 14 days.

Bucket meanings: **Discovered - not indexed** = Google knows the URL and has not bothered (depth,
crawl budget, internal linking). **Crawled - not indexed** = Google fetched it and declined, a
quality problem no submission fixes. **Duplicate, Google chose a different canonical** = read which
URL Google picked, then either accept it and redirect, or align internal links, sitemap membership,
and the self-referencing canonical until the signals agree.

### Play T5 - Sitemap lifecycle

Non-negotiable: a sitemap holds only canonical, self-canonicalizing, 200-status, indexable URLs - no
noindexed URLs, redirects, parameterized duplicates, or 404s. Max 50,000 URLs and 50 MB per file, an
index file above that. `lastmod` must be truthful, or engines learn to ignore the field.

1. `seo_gsc_list_sitemaps({ site_url })`, then `seo_gsc_get_sitemap({ site_url, sitemap_url })` for
   submitted vs indexed counts, last read date, and errors. A sitemap last read months ago is itself
   a signal.
2. `seo_generate_sitemap({ project_id })`.
3. **Validate before submitting.** Diff the generated URL set against `web_map({ url: domain })` for
   discovery coverage, and spot-check a sample through `seo_gsc_index_coverage` for noindex or
   canonical-elsewhere URLs. A dirty sitemap teaches the engine your sitemap is unreliable, which is
   hard to un-teach.
4. Confirm with the client, then `seo_gsc_submit_sitemap({ site_url, sitemap_url })` and
   `seo_bing_submit_sitemap({ site_url, sitemap_url })`; verify with `seo_gsc_list_sitemaps` and
   `seo_bing_list_sitemaps`. For a few urgent URLs, `seo_bing_submit_url` nudges Bing and the
   IndexNow family directly - there is no equivalent Google submit-URL tool here, so Google discovery
   goes through the sitemap or the dashboard.
5. `seo_gsc_delete_sitemap({ site_url, sitemap_url })` is for one situation only: a sitemap file that
   no longer exists at that path, or one you created in error. Deleting does **not** deindex its
   URLs; it destroys the reporting row and the submission history you use to measure index ratio.
   Confirm explicitly; never call it to tidy an error count. The submitted-vs-indexed gap it reports
   is your cleanest index ratio, because you control the denominator: track it monthly in memory,
   and a gap widening while URL count is flat means quality or duplication, not crawling.

### Play T6 - Structured data program

1. `seo_schema_markup({ project_id })` - detected vs suggested per template. Templates with nothing
   at all come first; missing beats malformed.
2. Target set by business model, not by what is available. Every site: `Organization` and `WebSite`
   on the home page, `BreadcrumbList` on deep pages. Multi-location: `LocalBusiness` per location
   page, NAP matching the Google Business Profile character for character. Ecommerce: `Product` with
   `Offer` and genuine ratings only. Publisher: `Article` with author and `dateModified`. Services:
   `Service`, plus `FAQPage` only where a real FAQ exists on the page.
3. Reality checks so nobody over-promises: FAQ rich results are restricted to a narrow set of
   authoritative sites and HowTo rich results were retired (both still carry entity and AEO value -
   just do not sell them as rich results); self-serving reviews on `Organization` or `LocalBusiness`
   are not eligible for review snippets; markup that does not match visible content risks a manual
   action, because schema describes a page and never adds claims to it.
4. Implement: content-level fields via `cms_write_entry` or `pages_update` after confirmation;
   template-level JSON-LD is a code change, so `pm_tasks_create` and route to the deploy workflow.
   `seo_task_implement` hands an accepted task into the implementation pipeline - confirm the exact
   change first, because it writes.
5. Verify with `seo_gsc_inspect_url` (detected rich-result types), then re-run `seo_schema_markup`
   after the next crawl.
6. Entity layer: `seo_entity_check({ domain })` - does the brand resolve, does `sameAs` match real
   profiles, are name and description consistent across site, profiles, and schema? Inconsistent
   entity signals are the most commonly ignored ceiling on branded and answer-engine visibility;
   where entity data is thin, `web_search` and `web_extract` gather the profile URLs.

### Play T7 - Internal link architecture

1. `seo_internal_links({ project_id })` - opportunities, orphans, depth, link distribution.
2. Cross-reference striking-distance pages (positions 4 to 15, from the rankings reference). Routing
   authority at a page already on the cusp is the highest return per unit of effort here; pages
   ranking 30+ do not have an internal-link problem.
3. Plan specifically: per target page, three to eight named source pages and the exact anchor, varied
   rather than one exact-match phrase sitewide. Implement via `cms_write_entry` or `pages_update` in
   confirmed batches by template - never bulk-apply an opportunity list, which is how a footer ends
   up with 60 links. Re-run `seo_internal_links` after the next crawl to confirm depth and orphan
   counts moved, and record the ship date for attribution later.

---

## 4. Thresholds that trigger action

| Signal | Source | Act when |
|---|---|---|
| LCP p75 mobile | `seo_core_web_vitals` | > 2.5 s (poor > 4.0 s) |
| INP p75 mobile | `seo_core_web_vitals` | > 200 ms (poor > 500 ms) |
| CLS p75 mobile | `seo_core_web_vitals` | > 0.1 (poor > 0.25) |
| TTFB (diagnostic) | `seo_core_web_vitals` / audit | > 800 ms (poor > 1800 ms) |
| Index ratio (indexed/submitted) | `seo_gsc_get_sitemap` | < 80 pct investigate, < 60 pct escalate |
| Crawled - not indexed | `seo_gsc_index_coverage` | > 20 pct of submitted (quality problem) |
| Discovered - not indexed | `seo_gsc_index_coverage` | > 10 pct of submitted (crawl/linking) |
| Google chose different canonical | `seo_gsc_index_coverage` | > 5 pct of submitted |
| Soft 404 on a money page | `seo_gsc_inspect_url` | any, same day |
| Broken internal links | `seo_internal_links` / audit | > 1 pct of internal links |
| Redirect chain length | audit | >= 2 hops fix, >= 3 hops urgent |
| Click depth, money pages | `seo_internal_links` | > 3 (any indexable page > 4) |
| Internal links to a money page | `seo_internal_links` | < 10 from related pages |
| Orphan indexable pages | `seo_internal_links` | any |
| 4xx on indexable URLs | audit | > 1 pct of crawled |
| 5xx anywhere | audit / `seo_bing_crawl_stats` | any, same day |
| Duplicate titles | audit | > 5 pct of indexable pages |
| Bing crawl errors | `seo_bing_crawl_stats` | > 5 pct of crawled |

Expectations for every plan: technical fixes move in 2 to 6 weeks, CWV field data needs the full 28
days, new content takes 3 to 6 months.

---

## 5. Diagnosis: when the data looks wrong

**GSC calls return empty**, in order of likelihood: (1) property string mismatch -
`sc-domain:example.com` and `https://example.com/` are different properties and `site_url` must match
the connected string exactly, so check `seo_project_get` and memory; this is the number one cause and
costs people hours; (2) roughly two days of data lag, so a query for today correctly returns nothing;
(3) Google retains about 16 months; (4) OAuth expired or revoked - no reconnect tool here, so say so
rather than reporting a zero as a finding; (5) a filter matching nothing looks like a dead feed.

**The audit will not complete.** Check `seo_list_audits` for status before starting another; a
retrigger costs money and leaves two conflicting ids in memory. If it has been pending for hours,
read the newest completed audit and raise the stall. Similarly, when `seo_gsc_index_coverage` returns
fewer rows than you sent, the missing URLs are the interesting ones - re-run them individually
through `seo_gsc_inspect_url`, whose last-crawl date also tells you whether the engine has yet
re-evaluated your fix.

**CWV shows no movement.** At day 7 expect only a quarter of the eventual movement, and verify the
fix reached the template you measured - a fix on /product/ never moves /blog/. Lab-good with
field-poor is almost always third-party scripts or real-device CPU; field-good with lab-poor means
the synthetic run throttled harder than reality.

**Schema implemented but not detected.** JSON-LD injected by JavaScript after render, a syntax error
silently invalidating the block, or no recrawl yet: compare `web_scrape` raw HTML against
`seo_gsc_inspect_url` detection.

**Tools disagree.** Audit counts are your crawler's view, GSC counts are Google's, Bing's are Bing's.
Explain the difference rather than reconciling it away: one named source per metric, forever. Where a
source is missing entirely, report the ceiling honestly ("without Search Console connected I can
report crawl health but not indexation"), then get it connected. Never estimate the gap.

---

## 6. Edge cases and failure modes

- **noindex plus robots.txt Disallow on the same URL.** A blocked page cannot be crawled, so the
  noindex is never seen and the URL can stay indexed URL-only indefinitely. Allow the crawl, keep the
  noindex, wait for the drop, then block. Canonical plus noindex is likewise contradictory: pick one.
  Canonicalizing a paginated series to page one removes deep items; let those pages self-canonicalize.
- **Deleting a sitemap to fix an error count.** Hides the reporting, not the problem, and destroys
  the submitted-vs-indexed history you measure index ratio with.
- **Bulk canonical or redirect changes off an audit list.** Audit tools flag patterns but do not know
  which duplicate is business-critical. Review every canonical change individually or by template,
  with a named winner URL. If a fix implies a URL change, the redirect map is part of the same
  ticket, never a follow-up. And never block parameters in robots.txt to fix duplication: blocked
  pages keep their links and their duplication, they just become invisible to you.
- **Protected surfaces and approval thresholds.** Legal, pricing, checkout, and any template the
  account context marks protected get no edits without explicit itemized approval, even when an audit
  flags them - read the rules field from `account_context_get` first. Anything index-affecting
  (robots directives, canonicals, noindex, sitemaps, redirects, deploys) or client-visible is
  confirmed explicitly and applied in reviewed batches. `pages_update`, `cms_write_entry`,
  `seo_task_implement`, `seo_gsc_submit_sitemap`, `seo_bing_submit_sitemap`, `seo_bing_submit_url`,
  and `seo_gsc_delete_sitemap` are all writes: say what you will do, get a yes, then do it.
- **Cost discipline.** Read `seo_list_audits` and `hiveku-data/seo/audits.json` before re-crawling;
  never re-run an audit inside the same week without a deploy or incident to justify it.

---

## 7. Persistence and reporting

**Memory** (`memory_list({ domain: "seo" })` first, then `memory_create` only if nothing came back,
otherwise `memory_update({ memory_id, content })` carrying the WHOLE merged document, because that
call REPLACES the entry rather than appending to it). Keep current: the exact
GSC property string and Bing site_url; the canonical and indexation strategy including intentional
exclusions; the CWV baseline with date and field/lab label; the latest audit id and cadence;
protected templates and client constraints ("the dev team owns robots.txt"); and resolved decisions,
so a future session does not re-open them. `memory_update` rather than stacking near-duplicates:
five stale CWV baselines are worse than one current entry.

**PM tasks.** One `pm_tasks_create` per fix, after the client has agreed to the list. Each ticket
carries the finding, the priority score and its three inputs, the affected URL pattern or template,
the fix, the owner, and the verification date plus the exact tool call that will prove it.
`pm_tasks_update` when work starts or blocks; `pm_tasks_complete` only once the verification call
agrees. Completing on "shipped" instead of "verified" is how technical debt silently returns.

**Reporting.** Technical work is invisible unless translated. Per fix, one line in the client's
language: what was broken, how many pages it affected, what it cost, what changed, and when the
effect becomes measurable. Assemble from completed pm tasks plus the audit diff, hand it to the
reporting-and-delivery reference, and make every number reproducible from a named tool call. For
judgment rather than data, `talk_to_department({ domain: 'seo', message })` with the findings and
constraints attached, then persist the outcome with the direct tools above.
