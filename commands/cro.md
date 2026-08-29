---
description: "\"The page gets traffic but nobody buys\" / \"can we improve conversion?\" - CRO pass: money pages, the page audit beside a competitor's, form truth, then ICE-ranked experiments filed as pm_tasks. Audit-and-backlog only - no page is edited from here."
argument-hint: "[optional focus, e.g. a page URL or /pricing]"
---
CRO pass ($ARGUMENTS). Follow the **hiveku-analytics-agency** skill; the experiment discipline is
`references/cro-experiments.md` - vocabulary fixed there: an experiment is one page change framed
as a hypothesis, scored with `ice_score`, persisted as a pm_task in the backlog.
1. Context: `account_context_get({ domain: "marketing" })` (`analytics` is NOT a valid context
   domain - it returns 400) + `memory_list({ domain: "marketing" })` for what a conversion means
   on this account and any agreed KPIs; `sites_list` for the `project_id`.
2. Money pages: `analytics_pages({ project_id, from_date, to_date })` +
   `analytics_traffic_sources({ project_id, from_date, to_date })`, same 28-full-day window on
   both, pinned before pulling anything (first-party buckets in UTC; a partial-day edge invents
   a false level), and pass `project_id` explicitly - both silently fall back to account scope
   without it. Where a page is fed FROM changes what "converting" means: a paid-fed page
   converts on the ad's promised action, an organic-fed post on the next-step click, a
   direct/email-fed page on the branded ask. Pick 3-5 money pages (or the page in $ARGUMENTS)
   and name each page's feed. A near-zero-traffic page is not a CRO candidate - CRO multiplies
   traffic, it does not create it; route that page to the SEO or PPC lane instead.
3. Tracking precheck (optional but cheap): if any conversion number looks implausible - a money
   page with zero events, a KPI that flatlined mid-window - STOP and run /hiveku:tracking-check
   first. A broken conversion number invalidates every CRO conclusion below; verify tracking
   BEFORE trusting a rate.
4. Per-page audit: `seo_cro_audit({ url })` on each money page - five sections scored 0-100
   (speed, clarity, friction, trust, cta), findings each carrying issue /
   why_it_costs_conversions / fix, plus a `quick_wins` shortlist. Pure read, no credit spend. v1
   is audit only, NOT experiment tracking - experiments run as pm_tasks (step 9). Triage: quick
   wins first, then the lowest-scoring section on the highest-traffic page.
5. Competitor: `seo_cro_audit({ url })` on the top rival's equivalent landing page - it works on
   any public URL, free, and the section deltas write the trust and cta hypotheses. Two limits,
   said out loud: it sees their page anatomy, never their conversion numbers (do not invent a
   competitor "rate"), and it is the only competitor read here - `analytics_probe_page` refuses
   domains this account does not own.
6. Form truth, when a money page carries a form: `marketing_form_conversion_audit`, with both
   traps stated where the numbers are quoted:
   - The discrepancy buckets SUM to the total (deleted, duplicate, spam, archived,
     workflow_failed, no_attribution, unpaid_attribution, counted) - `buckets.counted` is OUR
     number and the rest are the explanation of any platform gap. `has_click_id` isolates the
     paid slice.
   - Platforms date conversions by CLICK in the AD ACCOUNT's timezone; PASS `timezone` as that
     account's IANA zone - the audit defaults to UTC day buckets when you omit it. Name the
     timezone before quoting a daily figure against a platform number.
   - `click_window.click_dated` = 0 means `clicks_before_range: 0` is NOT MEASURABLE, never
     "no clicks fell outside the window". And `totals.truncated` means every count is a sample -
     narrow the window or disclose it.
   The page's baseline = `buckets.counted` over the window against `analytics_pages` views for
   the SAME full UTC days, both sources labeled.
7. Candidate experiments: turn each finding into a hypothesis - "because [evidence], changing
   [element] on [page] should move [metric]; review by [date]" - quick wins included, ONE
   experiment per page per review window (every change ships to 100% of visitors, so two
   changes on one page cannot be attributed to either). Then `pm_tasks_list({ project_id })`:
   an experiment already open on the board is never filed twice - it gets a comment, not a twin
   - and an open SEO-lane task on the same page is a collision to flag, since two lanes editing
   one page in one window make both read-outs unattributable.
8. Score the WHOLE list in ONE `ice_score` batch call ({ items: [{label, impact, confidence,
   ease, ...passthrough}] }) - passthrough fields carry page, metric, evidence, and baseline
   through the scorer. Anchors from the reference: impact to the page's traffic and the KPI,
   ease to the code-lane cost, and NO baseline data = confidence 1-3 by definition. Components
   clamp to [1,10] with a per-item warning - a clamped score means wrong inputs, re-score. Each
   item returns `{...passthrough, score, rank, input_index}` sorted by score desc (score
   1-1000); ties keep input order, so break real ties by lower risk and say so. The score
   ranks, it does not measure - present the order and components, not score-precision theater.
9. STOP: present the ranked backlog table - rank, experiment, page, metric with baseline, the
   three ICE components and score, evidence - with absolute numbers beside every percentage on
   low-traffic pages (a 40% swing on 10 conversions is noise). Nothing has been created yet. On
   an explicit yes, `pm_tasks_create({ project_id, title })` one task per APPROVED experiment -
   confirm the exact
   list first, then one confirmation covers the batch (tasks are reversible), but say which
   experiments are being filed and skip any the user struck. Each task description carries the
   hypothesis, page URL, metric + baseline (number, source, window), ICE score with components,
   and the review date - a task missing its baseline or review date is a to-do, not an
   experiment.
10. Route the work, never do it here: implementation goes to /hiveku:code (the web lane's own
    review rail and verify gates), and post-ship measurement to /hiveku:tracking-check - a
    deploy is the number-one silent data killer, so confirming the metric still records IS part
    of the experiment. At the review date, read out before-vs-after over identical windows and
    `pm_tasks_complete({ id, summary })` with the observed result - "no detectable change" is a
    valid result.
    - When the KPI is a sale rather than a form fill, the sale reaches the ad platform through the declared offline-conversions lane (`marketing_offline_conversions_status` first; opting in lands in validate-only, nothing recorded until a human goes live in the dashboard) - doctrine in `hiveku-conversion-tracking/references/offline-conversions.md`, never run from this pass.
11. Honesty close, said to the client unprompted: this surface has no A/B platform, no traffic
    splitter, no heatmaps, and no session recordings. Experiments are sequential before/after
    comparisons over named equal windows with the confounds stated (seasonality, traffic-mix
    shift, concurrent campaigns) - never presented as a controlled test - and every change ships
    to 100% of visitors, which is why it is ONE experiment per page per review window. If the
    page under test is a review-funnel page, its styling write
    (`marketing_funnel_appearance_update`) replaces the WHOLE appearance object on a live public
    page - read `marketing_funnel_appearance_get` first, send its appearance back edited, and
    compare what returns against what was sent (invalid values substitute silently); that write
    belongs to the main session with its own confirmation, never to this pass.
12. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
