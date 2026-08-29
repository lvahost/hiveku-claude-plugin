# CRO experiments - money pages, form truth, ICE, and the backlog

Play 8 depth. Load this when a page converts poorly, the ask is "improve the landing page" or
"should we test X", or before any `seo_cro_audit` / `ice_score` / experiment-backlog work. The
play command is /hiveku:cro; the read-only planning subagent is `hiveku-cro-analyst`.

Vocabulary, fixed so every artifact in this lane matches: an **experiment** is one proposed page
change framed as a hypothesis; a **hypothesis** is the sentence "because [evidence], changing
[element] on [page] should move [metric]; review by [date]"; an **ICE score** is `ice_score`'s
impact x confidence x ease (1-1000); the **backlog** is the ranked list of experiments persisted
as pm_tasks. The discipline stays read-only like the rest of this skill: it audits, ranks, and
files - the page edit itself always belongs to the web/code lane.

## The loop (find money pages, audit, hypothesize, rank, run, measure)

### Pick money pages, and name what feeds them

- `analytics_pages({ project_id, from_date, to_date })` for traffic and
  `analytics_traffic_sources({ project_id, from_date, to_date })` for the channel mix, same
  window on both (28 full days is the workable default; pass `project_id` explicitly - both
  tools silently fall back to account scope without it). A money page is traffic times
  conversion intent: a mid-traffic pricing page outranks a high-traffic blog post.
- Where a page is fed FROM changes what "converting" means, so read the two tools together
  before judging any page. A paid-fed landing page converts on the ad's promised action (the
  form fill, the call); an organic-fed post converts on the next-step click toward a money
  page; a direct/email-fed page converts on the branded ask. "This page converts poorly" with
  the feed unnamed is not a finding yet.
- Cap the working set at 3-5 pages per pass. The loop is per-page and the audit below is
  per-URL; a 40-page sweep produces 40 shallow verdicts and no backlog.

### When NOT to run the play

- A red tracking verdict stops the play the same way it stops the weekly report (SKILL.md,
  weekly cadence step 1): a CRO conclusion drawn over a broken pipe is wrong in an unknown
  direction. Route Play 5 / the tracking lane first; the play resumes when the verdict is clean.
- A page with near-zero traffic is not a CRO problem. CRO multiplies the traffic a page already
  gets; it does not create traffic. If the window's views cannot produce a readable conversion
  count (the sample-size rule below), the finding is "acquire traffic first" and the page routes
  to the SEO or PPC lane, not to an experiment.

### Audit each page with `seo_cro_audit`

`seo_cro_audit({ url })` is the page instrument: a heuristic conversion audit of ONE landing
page. Pure read - nothing persisted, no credit spend - and v1 is audit only, NOT experiment
tracking; experiments run as pm_tasks (the backlog section below). It fetches the page
(SSRF-guarded) and scores five sections 0-100:
- **speed** - CrUX real-user p75 plus PageSpeed lab. The one section that degrades (the rest
  still audit) if the web-signals key is missing.
- **clarity** - H1/title/meta, image alt coverage. Low clarity on a paid-fed page is usually a
  message-match problem with the ad - a seam finding (below), not only a page edit.
- **friction** - form field counts, labels, and whether a conversion path exists at all. A page
  with NO conversion path is the headline finding; nothing else on the page matters until one
  exists.
- **trust** - testimonials, reviews, guarantees, badges, social-proof numbers, a visible phone.
- **cta** - action-verb copy plus an above-fold heuristic (header/hero or the first 35% of the
  page).

Each finding carries `{issue, why_it_costs_conversions, fix}`, plus a `quick_wins` shortlist of
cheap edits. Triage in this order: quick_wins first (they become experiments too, just high-ease
ones), then the lowest-scoring section on the highest-traffic page. The section score localizes
the problem; the finding's `fix` is the raw material for the hypothesis.

### The competitor technique

Run `seo_cro_audit({ url })` on the top rival's equivalent landing page beside yours - it works
on any public URL, free, so a competitor audit costs nothing. The section deltas write the trust
and cta hypotheses for you: they show a guarantee and six review badges where you show none, or
their form asks 3 fields to your 9. Two limits, stated when you use it:
- The audit sees their page anatomy, never their conversion numbers - do not invent a competitor
  "rate" from a structure score.
- This is the ONLY competitor read in this lane: `analytics_probe_page` refuses URLs on domains
  this account does not own, so a rival page is auditable but never probeable from here.

## Form truth (`marketing_form_conversion_audit`)

The form-fill reconciliation read: "the platform says 40 conversions, the CRM shows 22 - where
did the other 18 go?". For CRO it is also the baseline instrument for any form-carrying money
page. Rules, stated wherever its numbers are quoted:

- **The buckets sum to the total.** Every submission lands in exactly one named discrepancy
  bucket - deleted, duplicate, spam, archived, workflow_failed, no_attribution,
  unpaid_attribution, counted - and the buckets sum to the total. `buckets.counted` is OUR
  number; the rest ARE the explanation of the gap ("40 vs 22, and here are 11 spam, 4
  duplicates, 3 with no UTMs"). Unlike the dashboard Forms tab it includes spam, deleted, and
  duplicate rows and labels them, because they are the answer. `has_click_id` isolates the paid
  slice, recovered from utm_params OR the landing-page URL.
- **The timezone rule: platforms date by click, in the AD ACCOUNT's timezone - and you must
  PASS that zone.** The audit buckets by day in whatever `timezone` you pass (IANA zone) and
  DEFAULTS TO UTC when you omit it, which is almost always wrong for a platform comparison.
  Pass the ad account's zone, and name which timezone the day boundary is in before quoting a
  daily figure - a one-day edge mismatch manufactures a false discrepancy.
- **`click_window.click_dated` = 0 means NOT MEASURABLE, never "zero".** `click_dated` counts
  the counted rows carrying a REAL click instant (embed v3.4+). Of those, `clicks_before_range`
  provably clicked before the window - a FINDING (the platform credited an earlier period), not
  a hedge - and `boundary_risk` covers only rows with no dated click; a row is never in both.
  When `click_dated` is 0, a `clicks_before_range` of 0 means the question is not measurable on
  this data - never report it as "no clicks fell outside the window".
- **`totals.truncated` means every count is a sample.** A truncated response turns each bucket
  into a floor, not a count - narrow the window or disclose the sample before comparing
  anything, and never compute a rate from a sampled numerator without saying so.
- **The baseline move for CRO:** `buckets.counted` over the window is the page's form-conversion
  numerator; page views from `analytics_pages` are the denominator from a different read. Both
  are first-party, so the ratio is honest ONLY when both windows are identical full UTC days -
  match the windows, label both sources, and record the pair (numerator, denominator, window)
  as the experiment's baseline. Read the response's caveats before reporting any discrepancy:
  view-through conversions have no click and can never appear here, cross-device joins are
  invisible, and the platform also counts conversion types that are not form fills at all.

## ICE discipline (`ice_score`)

`ice_score` is pure math, no persistence: score = impact * confidence * ease, each component
clamped to [1,10] with a per-item warning when out of range, score range 1-1000,
`normalized_score` = score/1000. Two modes: single (`{impact, confidence, ease}`) and batch
(`{items: [{label, impact, confidence, ease, ...passthrough}]}`). ALWAYS batch a backlog in one
call: batch mode preserves every passthrough field on each item (page, metric, evidence,
baseline), returns `{score, rank, input_index}` per item plus a summary, and scores the whole
list against one consistent frame instead of per-call drift.

The batch response is the backlog's working format: each item comes back as `{...passthrough,
score, rank, input_index}` sorted by score descending, and `summary` carries `{count, top_score,
mean_score}`. `input_index` is the round-trip key - it maps a ranked row back to the exact
candidate you fed in, so nothing is re-matched by label string.

What the components mean against THIS surface - anchor them or the score is decoration:
- **Impact** - how much of the KPI flows through this page and element. Anchored to
  `analytics_pages` traffic and the audit section hit: a cta finding on the top money page is
  8-10; a trust badge on a page with 12 views is 1-3.
- **Confidence** - the quality of the evidence behind the hypothesis. A measured finding (an
  audit section score, a form-bucket anomaly, a competitor delta) is 5-8; a taste-based rewrite
  is 2-3. **No baseline data = low confidence by definition (1-3):** if the page's current rate
  is not measurable - `click_dated` 0, an unverified tracking verdict, no counted baseline -
  you cannot know the change moved anything, and the score must say so.
- **Ease** - the cost to ship through the code lane. A copy or CTA swap is 8-10, a form rework
  4-6, a redesign or net-new page 1-3. quick_wins are high-ease by construction.

Reading the result honestly:
- The sort is score-desc with a **stable tiebreak on input order** - equal scores keep the order
  you fed them in, so feed the batch in your own prior order and break remaining ties by lower
  risk or shorter review window, saying which rule you applied.
- A per-item clamp warning means the inputs were out of range - fix the inputs and re-score;
  never report a clamped score as if it were chosen.
- The score ranks, it does not measure: 512 vs 490 is not a real difference. Present the ranked
  order and the components, not score-precision theater.
- When a score is a lie: any experiment scored against a metric nobody currently measures, or
  against a conversion number the tracking lane has not verified (seams below). The honest entry
  for those is "verify measurement first" at the top of the backlog, not a confident-looking
  number.

## The backlog (experiments live and run as pm_tasks)

No experimentation platform exists on this surface - `seo_cro_audit` v1 says it itself: audit
only, run experiments as pm_tasks for now. The backlog IS the PM board, and the task IS the
experiment record.

- **Anatomy of an experiment task** (`pm_tasks_create({ project_id, title })` - the field is
  `title`, not `name`): title = page + change ("Pricing page: cut form from 9 fields to 4");
  description = the hypothesis sentence, the page URL, the metric with its current baseline
  (number + source + window), the ICE score with all three components, and the review date. A
  task missing its baseline or review date is a to-do, not an experiment - it can never be read
  out.
- **Never duplicate an open experiment.** `pm_tasks_list({ project_id })` before filing; an
  experiment already open gets a `pm_tasks_comment` or `pm_tasks_update`, never a twin task.
- **Running splits across two lanes, by design.** Implementation routes to the web/code lane
  (/hiveku:code - it has its own review rail, verify gates, and deploy discipline; nothing in
  this skill edits a page). Measurement routes to the tracking lane (/hiveku:tracking-check)
  after the change ships, because a deploy is the number-one silent data killer - confirming the
  metric still records IS part of the experiment, not an optional extra.
- **Reading out:** at the review date, pull the same tool over the same window shape as the
  baseline - before window vs after window, full days, same timezone, same source - then
  `pm_tasks_complete({ id, summary })` with the observed result. "No detectable change" is a
  valid result and belongs in the summary. Wins AND losses go to the `marketing` memory
  (read-merge-update) so next quarter does not re-run a known loser.
- **Sample-size rule rides along:** on a low-traffic page a 40% swing on 10 conversions is
  noise - absolute numbers beside every percentage, and a review window long enough to
  accumulate a readable count before any verdict. Sizing anchor: the weekly cadence's anomaly
  threshold (20% movement, SKILL.md) is the smallest change worth calling real, so the review
  window must be long enough that a 20% move in the baseline count is visibly larger than the
  page's normal week-to-week wobble - on a page counting single-digit weekly conversions that
  means extending the window, not shrinking the claim.

### One worked experiment, end to end

The format every backlog entry follows, from a real-shaped finding:
- Finding (`seo_cro_audit` on /pricing, friction 34/100): "the quote form asks 9 fields, 3
  unlabeled; why_it_costs_conversions: every field past the fourth measurably raises
  abandonment; fix: cut to name, email, company, need."
- Baseline (`marketing_form_conversion_audit` + `analytics_pages`, same 28 full UTC days):
  counted 22 fills / 1,840 views.
- Hypothesis: "Because friction scored 34/100 and the audit flags 9 form fields, cutting the
  /pricing form to 4 fields should raise counted form fills; review 28 days after ship."
- ICE batch item: `{label: "/pricing form 9->4 fields", impact: 8, confidence: 6, ease: 7,
  page: "/pricing", metric: "counted form fills", baseline: "22/1840, 28d UTC"}` - impact 8
  (top money page, KPI metric), confidence 6 (measured finding, measured baseline), ease 7
  (form rework, no redesign). Score 336.
- Task: title "/pricing: cut quote form from 9 fields to 4"; description carries all of the
  above plus the review date; implementation to /hiveku:code, post-ship /hiveku:tracking-check,
  read-out at the review date, `pm_tasks_complete` with the observed before/after counts.

## Honesty (what this surface cannot do, and the truthful alternative)

Say these plainly, before the client asks, each with what you CAN do instead:
- **No A/B testing platform.** Nothing here serves variant A to half the visitors. The truthful
  alternative is a sequential before/after comparison over named equal windows, presented as
  exactly that - with the confounds stated (seasonality, traffic-mix shift, concurrent
  campaigns) - never as a controlled test result.
- **No traffic splitter.** Every shipped change reaches 100% of visitors immediately. That is
  why the backlog ships ONE experiment per page per review window: two simultaneous changes on
  one page cannot be attributed to either.
- **No heatmaps or scroll maps.** No tool for this - it lives in the dashboard's behavior view,
  not the MCP. The structural substitute is the audit's friction and cta sections, which
  localize above-fold and form problems without watching anyone.
- **No session recordings.** The substitutes are `analytics_sessions` and
  `analytics_events_list` for where the step drop-off happens, and survey verbatims
  (references/surveys.md) for the "why" in the visitor's own words.
- **The `marketing_funnel_appearance_update` trap** - relevant when the money page under test is
  a review-funnel page. That write restyles a LIVE PUBLIC PAGE: no draft, no preview, no publish
  step. `appearance` is a WHOLE-OBJECT REPLACE, not a merge: call
  `marketing_funnel_appearance_get` FIRST and send its `appearance` back edited, because every
  key you omit silently reverts to the brand value or product default. Nothing invalid is
  rejected either - a malformed color, a font outside `font_choices`, a non-http(s) URL all fall
  back silently, so compare the returned `appearance` against what you sent. This skill never
  makes that write; it belongs to the main session with confirmation, and any funnel-page
  experiment task states the get-first rule in its description.

## Seams (what this play hands off, both directions)

- **Measurement integrity belongs to the conversion-tracking skill.** A conversion rate is only
  as good as the pipe recording its numerator, so verify tracking BEFORE trusting a rate - a
  broken conversion number invalidates a CRO conclusion in either direction (the experiment
  "won" because the tag came back, or "lost" because it died mid-window). When a rate looks
  implausible, the first backlog entry is "verify tracking" via /hiveku:tracking-check or the
  `hiveku-tracking-auditor` subagent, not an experiment. When the KPI is GA4-fed,
  `seo_ga4_conversion_audit` (an `seo_connections` UUID, platform `google_analytics` - never a
  `ppc_connection_list` id) is the start: it names key events that recorded NOTHING in the
  window, which is an imported Ads conversion reporting zero with no error shown anywhere.
- **Spend-side findings route to the PPC lane.** A paid-fed page whose real problem is upstream
  - message match with the ad, the wrong search terms, budget still flowing to a losing lander -
  is handed to /hiveku:ppc-optimize or the `hiveku-ppc-analyst` subagent, not absorbed here. CRO
  fixes the page; PPC fixes what feeds it; and campaign ROI joined to ad spend remains the PPC
  discipline.
- **The SEO lane runs the same instrument - coordinate, do not collide.** hiveku-seo-agency's
  SKILL.md runs `seo_cro_audit` on striking-distance pages (positions 4-15) that already earn
  traffic. Same tool, different trigger: SEO audits pages it is about to push rankings on, this
  play audits money pages that already have traffic. Check `pm_tasks_list` for an open
  SEO-lane task on the same page before filing an experiment - two lanes editing one page in
  the same window makes both read-outs unattributable.
- **Writes stay where they live.** Page edits go to the web/code lane, GA4 and tag writes stay
  with the SEO/conversion owners as PM handoffs (the conversion-layer-matrix rules apply here
  unchanged), and this play's only writes are the ones this skill already allows: memory, PM
  tasks, nothing else.
