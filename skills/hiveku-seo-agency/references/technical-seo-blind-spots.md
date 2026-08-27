# Technical SEO Blind Spots - Operator Manual

## What this covers / when to load this

The technical checks that are easy to miss and expensive to miss: X-Robots-Tag headers, canonical
validity across the whole URL set rather than per page, redirect chain depth, near-duplicate
templated pages, thin pages, and the gap between what a site claims is indexed and what Google
says. Several of these have NO Hiveku tool at all, and this file says which, by name, verified
against `hiveku-mcp-api-server/src/tools/*.ts` and the builder routes on 2026-08-26.

Load it before running a site audit you will report on, before shipping a Next.js site, when a site
has hundreds of pages and no rankings, when pages are "indexed" per the sitemap but absent from
search, or any time you are about to write the sentence "the audit found no issues".

`references/technical-seo.md` is the main manual: the CIRR ladder, the plays, the thresholds. This
file is the adversarial companion. It exists because the same defect keeps shipping in this
codebase and in SEO tooling generally: **something reports success while silently doing less than
it claims.** A digest reporting zero active campaigns while the account spent 200 dollars a day. A
pacing report summing 51 phantom targets. A helpdesk reply recorded but never sent. An audit that
reads 4 pages out of 40 and calls itself a site audit is the same shape, and it is the shape
clients notice.

Two corrections to `references/technical-seo.md` that this file supersedes, both verified below:

- It lists `web_scrape` on robots.txt as the fallback for "robots.txt, meta robots, X-Robots-Tag".
  That covers the first two. `web_scrape` returns no response headers, so it cannot see an
  X-Robots-Tag at all. Section 2 has the real path.
- Its threshold table sources "Redirect chain length" to "audit". The audit crawler computes it and
  the result never reaches you. Section 4 explains, and gives what does work.

---

## 0. The output contract: state your coverage or the audit is worthless

The single most damaging audit failure is not a wrong answer. It is an unstated one. An audit that
examined 4 URLs out of roughly 40 and never said so is worse than no audit, because the client now
believes the other 36 were checked.

**Every technical finding you report carries its denominator.** Not as a footnote, in the finding.

Before the findings, always emit a coverage block in this shape:

```
COVERAGE
  URL set:        847 URLs discovered (web_map, sitemap + link following)
  Examined:       50 URLs (seo_gsc_index_coverage, batch 1 of 17) + 100 pages (web_crawl)
  Selection:      home, 6 money pages, 1 per template family (9 families), then top traffic
  Templates hit:  9 of 9 known families
  NOT examined:   the /blog archive (612 URLs, sampled 4), /legacy (89 URLs, 0)
  Header checks:  production headers NOT read - no Hiveku tool reads them (section 2)
  Confidence:     template-level findings HIGH; site-wide counts are ESTIMATES from a 6 pct sample
```

Rules that make this real rather than decorative:

1. **A sample is a sample.** "Duplicate titles on 12 pages" from a 50-page crawl of an 847-page
   site is "12 of the 50 pages examined", never "12 pages on the site".
2. **A cap is a coverage limit.** `seo_gsc_index_coverage` stops at 50 URLs per call. If you ran
   one batch, you audited 50 URLs. Say the batch number and how many remain.
3. **Empty is not clean.** Several Hiveku SEO tools return empty when their weekly cron has not run
   or a source is not connected. Empty means "no data", and you report it as no data. This is
   explicit in the tool descriptions for `seo_internal_links`, `seo_cannibalization`,
   `seo_content_decay`, and `seo_eeat_scores`: "never read empty as no-issues".
4. **A check you could not run is a finding.** "Response headers were not verified" belongs in the
   report at the same weight as any issue. Silence reads as a pass.
5. **Template families, not URL counts, are the unit of confidence.** One good sample of each of 9
   template families beats 200 random URLs, and it is honest to say so. What is not honest is
   sampling 4 families and reporting on 9.

---

## 1. Ground truth: what Hiveku can actually read

### 1.1 Response headers - the verified table

Verified by reading each tool definition in `hiveku-mcp-api-server/src/tools/` and the builder route
behind it, 2026-08-26.

| Tool | Reads response headers? | What you actually get back |
| --- | --- | --- |
| `fetch_url` | **No.** One header only. | `{ url, status, content_type, body, truncated, byte_count }`. `content_type` is the only response header exposed. Its `headers` INPUT parameter forwards REQUEST headers (Accept, Accept-Language, User-Agent, Authorization only) - it does not return response headers. |
| `web_scrape` | **No.** | Formats markdown / html / rawHtml / links / branding / summary / images / screenshot, plus `metadata` carrying `statusCode`. No header field is declared or parsed anywhere. |
| `web_extract` | **No.** | LLM extraction over a URL list against your schema or prompt. |
| `web_crawl` | **No.** | Per-page scrape output for many pages. Same formats as `web_scrape`. |
| `web_map` | **No.** | `data.links` as a flat string array of URLs. Discovery only. |
| `web_actions` | Not directly. See note below. | Browser actions then a scrape. Supports an `executeJavaScript` action. |
| `analytics_probe_page` | **No.** | Classifies the REQUEST urls a page fired under two consent states. The classifier's input is a list of request URLs; no response is inspected. Also refuses any domain the account does not own (403). |
| `analytics_diagnose_tracking` | **No.** | Conversion-tracking findings from source scan plus a browser load. Scoped to tracking, not robots directives. |
| `seo_audit_start` / `seo_run_audit` / `seo_audit_get` / `seo_list_audits` | **No.** | A DataForSEO OnPage crawl. Section 1.2 covers what it does and does not surface. |
| `seo_gsc_inspect_url`, `seo_gsc_index_coverage` | Indirectly, and this is the useful one. | Google reports the effect of the header rather than the header text. See section 2. |
| `preview_http_get` | **Yes.** The only one. | `headers_only: true` returns `data.headers`, the raw header block, capped at 16 KB. `include_headers: true` returns headers alongside the body, capped at 8 KB. It runs `curl -i` against localhost INSIDE the running preview container (default port 3001). |

Two things to internalize from that table.

**`preview_http_get` is preview-tier only.** It hits the dev server inside the container, not
production. A header set by CloudFront, by a production-only code branch, or by anything in front of
the app will not appear. It is the right pre-deploy gate and the wrong post-deploy proof.

**`web_actions` + `executeJavaScript` is a plausible path, not a verified one.** The scrape result
type declares `actions.javascriptReturns`, and a `fetch(location.href)` from inside the page is
same-origin, so the browser would expose every response header to that script. I have not run it
end to end. Treat it as an experiment to validate once on a known-noindex URL before you rely on it,
and never report its output as confirmed until you have seen it agree with a `curl` on the same URL.

### 1.2 The site audit: its caps, and the checks it computes but never gives you

`seo_audit_start({ project_id, target_url, max_crawl_pages })` queues a DataForSEO OnPage crawl.
Verified behavior of the route:

- **`max_crawl_pages` defaults to 50 and is hard-clamped to 500.** Omit it and you crawled 50 pages,
  whatever the site's size. This is the coverage trap of section 0 living inside Hiveku's own tool.
  Always pass it, always compare it to the URL count from `web_map`, and always report both.
- It returns `202` with `{ task_id, target, status: 'queued' }` and does not wait. The crawl runs
  1 to 5 minutes on DataForSEO.
- `503 dataforseo_unconfigured` when the credentials are absent; `402` when the account's metered
  research budget is exhausted. Neither is "the site is clean".

**The audit surfaces 12 issue types.** The result builder emits exactly these and no others:
`is_4xx_code`, `is_5xx_code`, `no_title`, `no_description`, `no_h1_tag`, `duplicate_title`,
`duplicate_description`, `large_page_size`, `high_loading_time`, `no_image_alt`, `title_too_long`,
`title_too_short`.

**The crawler computes far more than it returns.** The affected-URL lookup in the same client
carries filter mappings for 84 checks, including every one this file is about:
`canonical_chain`, `canonical_to_redirect`, `canonical_to_broken`, `recursive_canonical`,
`redirect_chain`, `is_redirect`, `has_links_to_redirects`, `has_meta_refresh_redirect`,
`is_orphan_page`, `duplicate_content`, `low_character_count`, `low_word_count` (word count under
300), `low_text_rate`. That function has **no caller outside its own file**: no API route and no MCP
tool reaches it. The data is paid for, computed, and discarded.

**The affected-page counts under-report at 100.** Affected URLs are fetched with a limit of 100, and
the reported count is the length of that list falling back to the raw check value. At 100 or more
affected pages the list saturates and the count reports 100. A template regression on 400 pages
reads as "Found on 100 pages". Treat any count of exactly 100 as "100 or more" and go count it
yourself.

**Verify the audit actually landed before you read it.** The Olympus start route creates no database
row, and I found no writer for the `seo_site_audits` table anywhere in `hiveku_builder/src`; the only
writer in the workspace lives in `hiveku_saas_deprecated`. The practical consequence: after
`seo_audit_start`, `seo_list_audits` may return nothing, or only rows that predate the split. If the
listing is empty or the newest row is older than your start call, **say the audit did not deliver**.
Do not report an empty issue list as a clean site. The dashboard's own site-audit screen is a
separate pipeline on a different table and is the place to confirm.

The consequence for everything below: for most of these blind spots the audit is not your
instrument, so each section names what is.

---

## 2. X-Robots-Tag headers

### What it is

`X-Robots-Tag: noindex` is an HTTP response header. Per Google's own documentation the header and
the `<meta name="robots">` tag **have the same effect**. A noindex header deindexes a page exactly
as the meta tag would, and it is completely invisible to anything that reads only the HTML.

### Why it gets missed

Every convenient tool reads HTML. `web_scrape`, `web_crawl`, `fetch_url`, and a browser's view-source
all show you a clean `<head>` with no robots meta tag, and the page reports as healthy while the
whole site is out of the index.

This is the classic Next.js and Vercel footgun, and **Hiveku builds and deploys Next.js sites**, so
it is a live risk on every project the account ships. It is not hypothetical inside Hiveku either:
the builder's own middleware sets `X-Robots-Tag: noindex, nofollow` on routes it wants private
(`hiveku_builder/src/middleware.ts` and `src/lib/portal/middleware-portal.ts`). The pattern that
bites a client site is the same one: a middleware matcher or a `headers()` entry in `next.config`
whose path pattern is broader than the author believed, or a staging guard that ships to production
because the tier check reads an env var that is set everywhere.

The failure is silent in both directions. Nothing errors. Traffic decays over weeks. By the time
anyone asks, the deploy that caused it is 40 commits back.

### How to check it with Hiveku tools

**The one that works on a live site: `seo_gsc_index_coverage`.** Google reports the effect rather
than the header text, which is better evidence anyway. Per URL it returns `verdict`,
`coverage_state`, `indexing_state`, `last_crawl_time`, `crawled_as`, `google_canonical`,
`user_canonical`, `page_fetch_state`, and `robots_txt_state`, copied verbatim from Google's URL
Inspection response. Google's `indexingState` enum distinguishes `BLOCKED_BY_META_TAG` from
`BLOCKED_BY_HTTP_HEADER` from `BLOCKED_BY_ROBOTS_TXT`. **`BLOCKED_BY_HTTP_HEADER` is the X-Robots-Tag
signal, and it is the only one Hiveku can see.** Confirm the literal enum string the first time you
see one rather than pattern-matching on my spelling.

```
seo_gsc_index_coverage({ site_url, urls: [ /* up to 50 */ ] })
  -> results[].indexing_state === 'BLOCKED_BY_HTTP_HEADER'  => a noindex HEADER
  -> results[].indexing_state === 'BLOCKED_BY_META_TAG'     => a noindex TAG
```

Three limits to state whenever you use it: it inspects **the indexed snapshot, not the live page**,
so a header added yesterday may not show; it needs a connected GSC property and only covers URLs
inside it, so it cannot audit a competitor or a pre-launch site; and it caps at **50 URLs per call**.

**Before a deploy, on a Hiveku-hosted project: `preview_http_get`.** The only tool that returns the
header text.

```
preview_http_get({ project_id, path: '/', headers_only: true })
preview_http_get({ project_id, path: '/services/plumbing-austin', headers_only: true })
```

Run it on the home page plus one path per template family. Preview tier only, so it proves the
application code is clean, not that production is.

**In the source, on a Hiveku-hosted project: `project_files_search`.** Grep the code for the places
the header is produced, and read every match rather than counting them.

```
project_files_search({ project_id, query: 'X-Robots-Tag', case_insensitive: true })
project_files_search({ project_id, query: 'noindex',      case_insensitive: true })
project_files_search({ project_id, query: 'robots',       glob: 'next.config.*' })
project_files_search({ project_id, query: 'robots',       glob: '**/middleware.*' })
```

What you are looking for is not the presence of a noindex - it is a **matcher wider than the intent**.
A `middleware.ts` matcher of `/:path*` with a noindex behind a tier check is one bad env read away
from deindexing the site. Note the 500-match cap; if you hit it, narrow the glob rather than
concluding.

**Do not use for this**: `web_scrape`, `web_crawl`, `fetch_url`, `web_extract`, `analytics_probe_page`.
None returns response headers. `fetch_url`'s `headers` parameter is for outbound request headers and
is a genuine trap - it reads like header support and is not.

### When no tool covers it

For **production headers on a live domain there is no Hiveku tool.** Say that in the report rather
than implying the check ran. Then get the answer one of these ways:

```
# Full response headers over GET (preferred - some servers answer HEAD differently)
curl -sS -D - -o /dev/null 'https://example.com/services/plumbing-austin'

# As Googlebot, since some stacks vary the header by user agent
curl -sS -D - -o /dev/null \
  -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' \
  'https://example.com/services/plumbing-austin'
```

Grep the output for `x-robots-tag`. Do this on the home page and one URL per template family, and
against both `www` and apex if both resolve. The Search Console UI's URL Inspection live test also
answers it and is the client-facing version of the same evidence.

If you cannot run either, the finding is: "X-Robots-Tag was not verified on production. No Hiveku
tool reads response headers on a live domain. This is the single check most likely to explain a
sitewide indexing loss, and it takes one `curl` to close."

---

## 3. Canonical validity across the URL set

### What it is

A canonical tag is only meaningful in relation to the rest of the site. The failures that matter are
relational, and every one of them passes a per-page check:

- **Canonical to a redirect.** `/a` canonicals to `/b`, and `/b` 301s to `/c`. Google has to guess.
- **Canonical to a noindex page.** Contradictory instructions: consolidate here, but do not index
  here. Google resolves it by ignoring you.
- **Canonical to a 404 or 5xx.** The consolidation target does not exist.
- **Canonical chains.** `/a` -> `/b` -> `/c`, each canonicalizing to the next.
- **Canonical loops.** `/a` -> `/b` -> `/a`. Google picks one, usually not the one you wanted.
- **Canonical to another domain.** Sometimes deliberate on a syndication partner, usually a staging
  domain or a CDN host left in a template, and it hands your equity away.
- **Protocol and host drift.** Half the set canonicals to `https://www.`, half to `https://`.

### Why it gets missed

Because the per-page check passes. Every one of those pages has a well-formed, absolute, self-
consistent canonical tag. The tag is valid; the graph is incoherent. A checklist that asks "does
this page have a canonical" cannot see it, and that is the checklist most audits run.

### How to check it with Hiveku tools

**`seo_gsc_index_coverage` is the strongest signal available, because it gives you both sides.** Each
result carries `user_canonical` (what your tag says) and `google_canonical` (what Google chose).

```
seo_gsc_index_coverage({ site_url, urls })
  user_canonical !== google_canonical   => Google rejected your canonical. Read coverage_state
                                           for why ("Duplicate without user-selected canonical",
                                           "Duplicate, Google chose different canonical...").
  google_canonical points off-property  => you are consolidating into someone else's URL.
```

Batch by business value, not alphabetically: home, money pages, one representative per template
family, then top traffic from `seo_gsc_top_pages`. 50 per call. Report the batch number.

**Build the graph yourself for the rest of the set.** This is the part no tool does.

1. `web_map({ url })` for the URL universe (`data.links`, default limit 5000).
2. `web_crawl({ url, limit, includePaths, scrapeOptions: { formats: ['rawHtml'], onlyMainContent: false } })`
   over the set. `onlyMainContent` must be **false** here or you may lose the `<head>`.
   Alternatively `web_extract({ urls, prompt })` asking for the canonical href, the robots meta
   content, and the status per URL - fewer tokens, at the cost of an LLM in the loop.
3. Build the edge list `page -> canonical target` yourself and then check the four relational
   properties: does each target appear in the crawled set as a 200 (`metadata.statusCode`), does the
   target itself declare a different canonical (chain), does following the edges revisit a node
   (loop), does the target's robots meta say noindex.
4. Compare hosts and protocols across every canonical. One-line summary: "812 of 847 canonicals use
   `https://www.`, 35 use `https://` - both hosts resolve, so those 35 are self-referential in name
   only."

For a Hiveku-hosted project you can also read the canonical source directly:
`project_files_search({ project_id, query: 'canonical' })` finds every template that emits one, which
is usually 3 to 5 files rather than 847 pages, and it tells you whether the bug is per-page data or a
template.

### When no tool covers it

There is **no Hiveku tool that validates canonicals across a URL set.** The audit crawler computes
`canonical_chain`, `canonical_to_redirect`, `canonical_to_broken`, and `recursive_canonical`, and
none of them is reachable (section 1.2). Do not report canonical health as clean on the strength of
an audit run.

Manual next step: a desktop crawler (Screaming Frog, Sitebulb) does this natively and completely,
and for a site over about 1000 URLs it is the correct tool and worth the client saying so. Failing
that, the `web_crawl` plus your own graph pass above is real work but it is honest work, and you
report the sample size.

---

## 4. Redirect chain depth

### What it is

One hop is normal and costs almost nothing. Three or more is a crawl-budget tax and an equity leak,
and every hop is a chance for something to break. Chains accumulate from history rather than from
one bad decision: a 2019 URL migration, a 2022 trailing-slash normalization, a 2024 http-to-https
sweep, each layered onto the last. Nobody chose `/old-page -> /older-page -> /new-page/ ->
https://www.site.com/new-page/`. It assembled itself.

Watch for the chain that ends in a 404, which is a broken link wearing a 301, and the chain that
loops, which is an infinite redirect a browser reports as "too many redirects" and a crawler
reports as nothing at all.

### Why it gets missed

Every hop returns a healthy 301. Every crawler that follows redirects by default reports the final
200 and moves on. The chain is only visible if you ask for it specifically, and by default nothing
asks.

### How to check it with Hiveku tools

**`project_redirects_list` gives you the rule table, and you compute chains from it yourself.** This
is the check Hiveku can actually do well.

```
project_redirects_list({ project_id })
  -> { redirects: [{ id, from_path, to_path, status_code, match_type, is_active, created_at, notes }],
       hosting_config }
```

Treat each active rule as a directed edge `from_path -> to_path` and walk it:

- **Depth**: for each `from_path`, follow `to_path` into any rule whose `from_path` matches it, and
  count. Two or more edges is a chain to flatten. Flattening is mechanical: rewrite every rule so
  its `to_path` is the final destination, which turns an N-hop chain into N one-hop rules.
- **Loops**: a node revisited during the walk.
- **Terminal validity**: does the final `to_path` correspond to a real page? Cross-check against
  `pages_list({ project_id })` for a Hiveku-hosted site, or `fetch_url` on the absolute URL and read
  `status`.
- **Match type matters.** A `prefix` or `regex` rule can feed a chain that no pair of `exact` rules
  reveals. Expand prefix rules against your real URL list before declaring the graph clean.
- **`is_active: false` rules are noise.** Exclude them or you will report chains that do not exist.

Two limits to state. `project_redirect_create` validates duplicate sources, self-loops,
trailing-slash-only rules, and circular chains to depth 10 - but **only at create time**, so a rule
set that arrived by import or predates that validation was never checked. And this list is only
Hiveku's own CloudFront redirect layer: redirects from `next.config`, from middleware, from the CMS,
or from anything upstream of CloudFront are not in it. Nothing changes on the live site until
`project_redirects_deploy` runs, so a "fixed" chain that was never deployed is still live.

**On a live URL, `fetch_url` gives you a partial answer.** It follows redirects manually with a cap
of 5 hops. `data.url` is the final URL, so `data.url !== <what you passed>` proves a redirect
happened. It does not report the hop count on success. Only when the chain exceeds 5 hops does it
fail with `too_many_redirects` and return the `visited` array - which is a crude detector for
catastrophic chains and no help at all for the 3-hop case that actually costs you.

### When no tool covers it

**No Hiveku tool reports redirect chain depth for a live URL.** The audit computes `redirect_chain`
and `has_links_to_redirects`; both are unreachable (section 1.2). `references/technical-seo.md`
sources its ">= 2 hops fix, >= 3 hops urgent" threshold to the audit, and that source does not
deliver. The threshold is right; the instrument is not.

Manual, and quick:

```
# Hop count and final URL for one URL
curl -sS -o /dev/null -L -w '%{num_redirects} hops -> %{url_effective} (%{http_code})\n' \
  'https://example.com/old-page'

# The full chain with each status
curl -sS -o /dev/null -L -D - 'https://example.com/old-page' | grep -Ei '^(HTTP/|location:)'
```

Feed it the list that matters: every `from_path` from `project_redirects_list`, plus every URL that
still has backlinks (`seo_backlinks_list`), plus the old URL set from any migration in memory. A
desktop crawler reports the whole chain graph natively and is the right answer above a few hundred
rules.

---

## 5. Near-duplicate content on templated pages

### What it is

Fifty location pages generated from one template where the only difference is the city name. Two
hundred service-area pages differing in a heading and a phone number. Each page passes every
individual check: unique title, unique H1, unique meta description, 600 words, valid schema. As a
set they are one page with a variable in it.

**This is acute for Hiveku specifically**, because Hiveku generates location and service pages from
templates. It is the most common cause of a site with hundreds of pages and no rankings, and it is
the one clients least expect, because the deliverable looked substantial.

### Why it gets missed

`duplicate_title` and `duplicate_description` are exact-match checks, and templated pages pass them
by construction - the city name is interpolated into both. The audit's 12 emitted issue types
(section 1.2) contain no similarity measure. Any check that operates on one page at a time is
structurally incapable of seeing this: the defect exists only in the relationship between pages.

### How to check it with Hiveku tools

Nothing measures it. You measure it, and the measurement is not hard.

1. **Enumerate the family.** `web_map({ url, search: '/locations/' })` or
   `pages_list({ project_id })` for a Hiveku-hosted site, to get the full member list and its size.
   Report that size: "the /locations family has 214 URLs".
2. **Pull the bodies.**
   ```
   web_crawl({
     url: 'https://example.com/locations/',
     limit: 40,
     includePaths: ['/locations/.*'],
     scrapeOptions: { formats: ['markdown'], onlyMainContent: true }
   })
   ```
   `onlyMainContent: true` matters here: it strips nav, header, and footer, which are identical
   across the family by design and would drown the signal you want.
3. **Run the substitution test first - it is the cheapest and it is usually decisive.** Take two
   pages from the family. In each, replace the varying token (the city, the service, the phone
   number) with a placeholder. Diff what remains. **If the two bodies are identical after
   substitution, they are one page.** No similarity math needed, and it is the finding a client
   immediately understands.
4. **If they differ, quantify how much.** Shingle each body into overlapping 5-word sequences and
   compute Jaccard overlap between pairs, or against the family's most common body. Read it as:
   - **above 0.90**: one page with a word swapped. Consolidate to a single page with a location
     selector, or make each page genuinely different.
   - **0.70 to 0.90**: thin variants. Each needs real local substance - a named project, staff,
     service-area specifics, local pricing, real photographs - or it should be merged.
   - **below 0.50**: genuinely distinct. Move on.
5. **Report unique share, not just overlap.** "Each location page carries 47 unique words out of
   612, about 8 percent" is a sentence a client acts on. "Jaccard 0.92" is not.
6. **Confirm with Google.** `seo_gsc_index_coverage` on 50 members of the family. Coverage states of
   "Duplicate without user-selected canonical", "Duplicate, Google chose different canonical", or
   large counts of "Crawled - currently not indexed" are Google telling you the same thing in its own
   words, and that is the version to put in the report.
7. **Go to the template, not the pages.** `project_files_search({ project_id, query: '<the shared
   phrase>' })` finds the generator. A 214-page problem usually has a 1-file fix.

`seo_cannibalization` is a useful corroborator when GSC has been connected long enough: it flags
queries where 2 or more pages of the domain each drew 50+ impressions (200+ combined) over the last
28 archived days. Templated families cannibalize each other constantly. It is computed by the Sunday
`seo-analysis-sweep` cron and is **empty until GSC is connected and the first weekly run completes**,
so an empty result means "not computed yet", never "no cannibalization".

### When no tool covers it

**No Hiveku tool detects near-duplicate content.** The audit crawler has a `duplicate_content`
filter, and it is unreachable (section 1.2). Say so, then do the substitution test on two pages per
template family and report the result - it takes minutes and it is the highest-value finding on most
templated sites.

---

## 6. Thin pages

### What it is

A page of 250 to 500 words will not rank for a competitive commercial term. Not because a word count
is a ranking factor, but because the page does not answer the query as completely as the ten pages
that already rank. Thin pages are also the raw material of the previous section: a thin template
multiplied 200 times is how a site acquires hundreds of pages that do nothing.

### Why it gets missed

The audit's 12 emitted issue types contain no word-count check. The crawler computes
`low_character_count` and `plain_text_word_count` and has a `low_word_count` filter set at under 300
words, and none of them reaches you (section 1.2). Meanwhile the naive check - count the text in the
HTML - reports a 250-word page with a large nav and a 900-word footer as a 1400-word page and passes
it.

### How to check it with Hiveku tools

**Count the main content yourself, from a crawl.**

```
web_crawl({ url, limit: 100, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } })
```

Count words in each page's markdown. `onlyMainContent: true` is doing the important work: it removes
the chrome, so what you count is what the page actually says. Bucket the result rather than listing
every page:

- under 300 words on a commercial term: thin, will not rank, decide expand or merge or remove
- 300 to 600: thin for competitive terms, adequate for long-tail support pages
- 600 to 1200: normal for a service page
- a whole template family clustered in one bucket: that is the finding, not the individual pages

**Then reconcile against demand, because a thin page with traffic is not the problem you thought.**

- `seo_gsc_top_pages({ site_url, start, end, row_limit })` - impressions and clicks per page.
- `analytics_pages({ project_id, from_date, to_date, limit })` - sessions per page.

The pattern that justifies work: **impressions present, clicks near zero, word count under 400.**
Google is showing the page and nobody chooses it. The pattern that says leave it alone: thin but
converting, which is common for a contact or booking page.

**`seo_eeat_scores` is a spot check, not a sweep.** It covers up to **10 pages per account**,
re-scored monthly by the Sunday sweep, LLM-scored with a static-signal fallback - check
`*_signals.method` for whether a given row is `llm` or `heuristic_only` before quoting it. It is
useful for depth on your money pages and useless as site-wide coverage. If you cite it, cite the 10.

**`seo_content_decay`** identifies pages losing traffic (last 28 archived days versus the prior 28,
floors of 100 impressions and 5 clicks, Sunday cron). Decaying and thin is the strongest refresh
candidate on the site. Empty until GSC is connected and the sweep has run once.

### When no tool covers it

**No Hiveku tool reports word count per page.** Compute it from `web_crawl` markdown as above and
state your sample: "word counts computed for 100 of 847 URLs, covering all 9 template families".

For a full-site count, a desktop crawler exports word count for every URL in one pass and is the
right tool above a few hundred pages.

---

## 7. Index coverage truth

### What it is

Three different populations that are routinely treated as one:

1. **What the site claims exists** - sitemap entries plus internally linked URLs.
2. **What Google knows about** - discovered, whether or not indexed.
3. **What Google actually indexes and can serve.**

The gaps between them are the diagnosis. Submitted but not indexed is a quality or crawl problem.
Indexed but not submitted is a sitemap that does not describe the site, or an unwanted URL space
(parameters, faceted navigation, staging paths) leaking into the index. Indexed under a different
canonical is a consolidation problem.

### Why it gets missed

Because "the sitemap has 847 URLs" gets reported as "the site has 847 indexed pages". They are not
the same number and the difference is the entire finding.

### How to check it with Hiveku tools

**Build all three populations, then subtract.**

The site's claim:
- `seo_gsc_list_sitemaps({ site_url })` - which sitemaps GSC has, and their submission state.
- `seo_gsc_get_sitemap({ site_url, feedpath })` - per sitemap: `lastSubmitted`, `lastDownloaded`,
  `isPending`, `isSitemapsIndex`, `errors[]`, `warnings[]`, `contents[]`. `contents[]` gives counts
  by type, **not the URL list**, so you cannot enumerate a sitemap from GSC. `fetch_url` on the
  sitemap XML gives you the actual URLs (body capped at 200 KB, so a large sitemap index needs one
  fetch per child).
- `web_map({ url, limit })` - discovery combining sitemap entries and internal links, which finds the
  URLs the sitemap omits.
- `seo_generate_sitemap({ project_id, base_url })` on a Hiveku-hosted project - what the sitemap
  *should* contain from published pages honoring `show_in_sitemap`. Diffing that against the live
  sitemap.xml catches a stale committed file directly.

Google's answer:
- `seo_gsc_index_coverage({ site_url, urls })` - **capped at 50 URLs per call.** Google's public API
  has no bulk coverage endpoint; this tool fans out URL Inspection per URL and buckets by
  `coverage_state`. It returns `buckets` and `total` alongside per-URL results, and passing more than
  50 is a 400 error, not a silent truncation.
- `seo_gsc_inspect_url({ site_url, inspection_url })` for one URL in depth. **Indexed snapshot only -
  Google's API has no live test** - and manual actions and security issues are not in the response at
  all; those are Search Console UI only.

**The cap is a coverage statement, and this is where the defect this file is about actually bites.**
A 50-URL batch on an 847-URL site is 6 percent. That is a legitimate, useful sample if you select it
deliberately and report it as a sample:

```
Batch 1 of 17 (50 of 847 URLs): home, 6 money pages, 1 per template family (9), top 34 by clicks.
  Submitted and indexed ................ 31
  Crawled - currently not indexed ....... 9
  Discovered - currently not indexed .... 6
  Duplicate, Google chose different canonical .... 4

These are counts over 50 examined URLs. Site-wide figures are extrapolations from a 6 pct
non-random sample weighted toward high-value pages, so the true site-wide indexed share is
LOWER than 62 pct, not equal to it.
```

That last sentence is the difference between an analyst and a spreadsheet. A value-weighted sample
overstates health, and saying which direction your bias runs is most of the value.

Run more batches when the answer matters. 17 calls is a few minutes and it converts an estimate into
a census. If you stop at one batch, say you stopped at one batch.

Watch for `robots_txt_state` and `page_fetch_state` in the same results: they separate "Google will
not index this" from "Google could not fetch this", which are different problems with different
owners.

### When no tool covers it

**There is no bulk index coverage export.** This is Google's limitation, not Hiveku's - the public
API genuinely has no coverage endpoint, which is why the tool fans out inspection calls. The full
Index Coverage report with its complete URL lists exists only in the Search Console UI, and exporting
it there is the right escalation when the client needs the census rather than the sample. Server log
analysis, which is the definitive answer for what Googlebot actually fetched, has no tool at all and
requires a log export from the client's host.

---

## 8. The checklist

Run in order. Each step says what it needs and whether Hiveku can do it today. Steps marked EXTERNAL
have no Hiveku tool: run them elsewhere, or report them as not checked. **Omitting the EXTERNAL rows
from your report recreates the exact defect this file documents** - a checklist that silently drops
what it cannot check reads as a complete audit.

**Setup**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 1 | Load account context and prior decisions | `account_context_get({ domain: 'seo' })`, `memory_list` | YES |
| 2 | Resolve the project and its sources | `seo_list_projects`, `seo_project_get`, `list_projects`, `get_project` | YES |
| 3 | Confirm GSC is connected. Without it this is a crawl opinion, not an indexation report | `seo_project_get`, `seo_gsc_list_sitemaps` | YES |

**Establish the denominator before any finding**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 4 | Enumerate the URL universe and write down the number | `web_map({ url, limit })` | YES |
| 5 | Fetch the live sitemap and count its entries | `fetch_url` on sitemap.xml (200 KB body cap per fetch) | YES |
| 6 | Group URLs into template families and count each | your own pass over step 4 | YES (manual) |
| 7 | Write the coverage block from section 0 | - | YES |

**Crawl and index**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 8 | Start the audit with `max_crawl_pages` set explicitly against the step-4 count | `seo_audit_start({ project_id, target_url, max_crawl_pages })` | YES (default 50, max 500) |
| 9 | Confirm the audit actually landed; empty listing means it did not deliver | `seo_list_audits`, `seo_audit_get` | PARTIAL - verify per section 1.2 |
| 10 | Index coverage, batch 1, value-ordered | `seo_gsc_index_coverage({ site_url, urls })` | YES, 50 URLs per call |
| 11 | Read `indexing_state` for `BLOCKED_BY_HTTP_HEADER` (X-Robots-Tag) and `BLOCKED_BY_META_TAG` | same call as step 10 | YES |
| 12 | Read `user_canonical` vs `google_canonical` on every result | same call as step 10 | YES |
| 13 | Deep-dive any single URL that looks wrong | `seo_gsc_inspect_url` | YES (indexed snapshot only) |

**Headers**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 14 | Response headers on the PRODUCTION site, home plus one per template family | `curl -sS -D - -o /dev/null <url>`, or Search Console live test | **EXTERNAL** |
| 15 | Response headers on a Hiveku preview before deploy | `preview_http_get({ project_id, path, headers_only: true })` | YES (preview tier only) |
| 16 | Grep the source for noindex emitters and over-broad matchers | `project_files_search` on `X-Robots-Tag`, `noindex`, `next.config.*`, `**/middleware.*` | YES (Hiveku-hosted) |

**Canonicals and redirects**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 17 | Pull canonicals across the URL set | `web_crawl` with `formats: ['rawHtml'], onlyMainContent: false`, or `web_extract` | YES (you build the graph) |
| 18 | Validate the canonical graph: to-redirect, to-noindex, to-404, chains, loops, cross-domain, host and protocol drift | your own pass over step 17 | **no tool** - manual, or a desktop crawler |
| 19 | Pull the redirect rule table | `project_redirects_list({ project_id })` | YES (Hiveku CloudFront rules only) |
| 20 | Compute chain depth and loops from the rule graph; exclude `is_active: false`; expand prefix and regex rules | your own pass over step 19 | YES (manual) |
| 21 | Verify hop count on live URLs that matter | `curl -sS -o /dev/null -L -w '%{num_redirects} %{url_effective}\n'` | **EXTERNAL** (`fetch_url` only detects chains over 5 hops) |
| 22 | Confirm redirect fixes are deployed, not just saved | `project_redirects_deploy({ project_id, tier })` | YES |

**Content**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 23 | Pull main-content bodies for the crawl set | `web_crawl` with `formats: ['markdown'], onlyMainContent: true` | YES |
| 24 | Word count per page, bucketed | your own pass over step 23 | **no tool** - manual |
| 25 | Substitution test on two members of each template family | your own pass over step 23 | **no tool** - manual |
| 26 | Similarity scoring where the substitution test is inconclusive | your own pass over step 23 | **no tool** - manual |
| 27 | Corroborate duplicates against Google | `seo_gsc_index_coverage` duplicate coverage states | YES |
| 28 | Cannibalization, decay, E-E-A-T depth. Empty means not computed, never no-issues | `seo_cannibalization`, `seo_content_decay`, `seo_eeat_scores` (10 pages per account) | YES if GSC connected and the Sunday sweep has run |
| 29 | Reconcile thin pages against demand | `seo_gsc_top_pages`, `analytics_pages` | YES |

**Architecture**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 30 | Orphans, click depth, internal link counts. Static weekly scan; dynamic and CMS links are invisible; empty is never no-issues | `seo_internal_links` | YES (Hiveku-hosted published projects only) |
| 31 | Server log analysis: what Googlebot actually fetched | - | **EXTERNAL** - client host export, no tool |
| 32 | Full Index Coverage census with URL lists | - | **EXTERNAL** - Search Console UI export |

**Close**

| # | Step | Tool | Hiveku today |
| --- | --- | --- | --- |
| 33 | Re-read the coverage block and reconcile it against every finding's denominator | - | YES |
| 34 | List every EXTERNAL row you did not run, as findings | - | YES |
| 35 | Persist decisions and accepted exclusions so the next session does not re-derive them | `memory_create`, `memory_update` | YES |
| 36 | Turn accepted findings into work | `seo_task_implement`, `seo_deliverable_save` | YES |

---

## 9. Reporting the gaps

The uncomfortable part of this file is that a correct report often contains sentences like "this was
not checked". Write them anyway, and write them where they will be read.

A "Not checked" section belongs immediately after the findings, not in an appendix:

```
NOT CHECKED IN THIS AUDIT
  Production response headers (X-Robots-Tag). No Hiveku tool reads response headers on a live
    domain. GSC index coverage on 50 URLs showed no BLOCKED_BY_HTTP_HEADER, which covers those
    50 only. One curl per template family closes this; I can run it with shell access.
  Redirect chain depth on live URLs. Computed from the 41 Hiveku redirect rules (2 chains of 2
    hops, flattened below). Redirects originating outside that layer were not measured.
  Word count and similarity beyond the 100 crawled URLs (12 pct of the site). All 9 template
    families are represented; the /blog archive is sampled at 4 of 612.
```

Three habits that keep this honest:

- **Never let a tool's silence become your conclusion.** Several SEO tools here return empty when a
  cron has not run or a source is not connected, and their own descriptions say not to read empty as
  no-issues. Carry that forward: an empty result is reported as "not computed", with the reason.
- **Name the direction of your bias.** A value-weighted sample overstates health. An exact count of
  100 affected pages from the audit means 100 or more. Say which way the number is wrong.
- **Log the accepted exclusions.** `memory_create` the ones that are deliberate - "the /legacy tree
  is intentionally noindexed", "location pages consolidate to /service-areas by design" - so the next
  session does not rediscover them as findings and burn client trust re-litigating settled calls.

A client can act on "I checked 50 of 847 URLs and here is what I found". A client cannot act on an
audit that quietly checked 4 pages and said "the site looks healthy". The first is a professional
answer. The second is the bug.
