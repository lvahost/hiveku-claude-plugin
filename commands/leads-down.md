---
description: "Diagnose \"why are leads down?\" - first checks whether the tracking broke (measurement artifacts, so a counting bug isn't blamed on the market), then per-channel deltas, then a client-ready answer."
argument-hint: "[period, default last 28 days vs the prior 28]"
---
The client asked why leads are down ($ARGUMENTS - default: last 28 days vs the prior 28). The first
fork decides the whole conversation: "leads are down" and "RECORDING of leads is down" are
different answers, and sending the causal story before ruling out the measurement artifact is the
failure mode this play exists to prevent. Follow the **hiveku-analytics-agency** skill's Play 5
(measurement-artifact-first) and the **hiveku-conversion-tracking** skill's triage ladder.
1. **Frame it.** `account_context_get({ domain: "marketing" })` for brand voice and what a "lead"
   means on this account (form? call? deal?); `sites_list` for the `project_id`. Pin BOTH windows
   as full days in a NAMED timezone before pulling anything - ad platforms date conversions by
   click time in the ad account's timezone, GSC dates rows in Pacific, first-party buckets in UTC
   unless you pass a timezone - a one-day window-edge mismatch manufactures exactly the false drop
   you are here to investigate. On a low-traffic account, absolute numbers next to every
   percentage; a 40% swing on 10 leads is noise until proven otherwise.
2. **Measurement fork FIRST - is the drop real?** Dispatch the `hiveku-tracking-auditor` subagent
   (this is its exact charter: per-channel verdicts on whether the plumbing records) in parallel
   with the demand reads in step 3; if subagents are unavailable, run the ladder inline:
   `analytics_diagnose_tracking({ project_id })`, then `analytics_probe_page({ url })` on each
   money page its findings name, and `analytics_channel_scorecard({ project_id, days })` ONCE and
   only if a paid channel's counts are in question - it loads live pages in a real browser and
   takes minutes; never loop it. Alongside the tag layer, check the three lead-swallowing pipes:
   - Form pipeline: `marketing_form_conversion_audit` for BOTH windows - its discrepancy buckets
     SUM to the total (deleted, duplicate, spam, archived, workflow_failed, no_attribution,
     unpaid_attribution, counted). Compare `buckets.counted` across the windows: a jump in spam
     or workflow_failed IS the "drop", and `has_click_id` isolates the paid slice.
   - Delivery pipeline: `workflow_runs_recent({ status: "failed", since })` - a failed form
     workflow means the lead was captured and nobody was told, which reads as "down" from the
     inbox. If a lead-carrying workflow was PAUSED during the window,
     `workflow_stranded_list({ workflow_id })` - a paused workflow's webhook still accepts
     payloads that produce no CRM record and no notification; those leads are invisible, not
     lost. It takes ONE workflow id; there is no account-wide stranded sweep.
   - Data freshness: `ppc_digest` - its `warnings[]` flags connections stale by >25h, and a stale
     connection makes every number on that platform a lie. Sync before reading deltas.
   If the fork lands on measurement: STOP the causal investigation, name the broken link out loud
   ("the tag is in the code but not the served HTML", "the form workflow has been failing since
   Tuesday"), quantify the client's REAL lead flow from the buckets, and route the fix -
   /hiveku:tracking-check for the per-channel verdict and one PM task per finding with the
   `coding_agent_brief` pasted in.
3. **Only after measurement is ruled healthy (or bounded): attribute the real delta per channel**,
   the same two windows everywhere:
   - Total demand: `analytics_overview` + `analytics_traffic_sources`, this window vs prior -
     which channel shrank and by how much. A flat topline can hide a collapsing channel; always
     read the mix.
   - Paid: `ppc_period_comparison` at campaign scope (Google) and
     `ppc_platform_period_comparison` for Meta/Microsoft/LinkedIn/TikTok (Bing's reporting API is
     async-only - expect its client-side-diff note). Cross-check spend: a lead drop that tracks a
     budget cut or a paused campaign is a one-sentence answer.
   - Organic: `seo_gsc_period_comparison` (position deltas are signed Google-style - lower is
     better, climbers have NEGATIVE position_delta; read the sign before writing "dropped"), plus
     `seo_bing_period_comparison` where Bing matters.
   - Calls, when the KPI includes them: `marketing_call_attribution_breakdown` and
     `voice_calls_list` for the window; if call volume cratered, `voice_diagnose_setup` - a dead
     phone system is a measurement artifact wearing a demand costume.
   - Pages: `analytics_pages` for a money/landing page that dropped - a redesign, a removed form,
     or a dead page shows up here before it shows up anywhere else.
4. **Name the mechanism, with numbers.** One sentence the client could repeat: "form leads are
   down 34%, and 90% of that is Google paid clicks after the budget cut on the 12th." A verdict
   without a named mechanism and a named channel is a guess - keep digging or say honestly what is
   still unknown and what you will do to find out.
5. **Draft the client-ready reply** in the brand voice (step 1's context): the honest cause -
   distinguishing "we found and fixed a tracking fault; your real lead flow was X" from "demand
   actually fell, here's where" - what we are doing about it, and when they will see the effect.
   Show the draft to the user; NOTHING is sent by this command, and the reply goes out only after
   the user explicitly approves it through their own channel.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
