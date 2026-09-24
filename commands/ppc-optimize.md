---
description: Optimization pass - search terms to negatives, pacing, disapprovals. Confirms every write.
---
PPC optimization pass. Follow the **hiveku-ppc-agency** skill; load
`references/spend-change-discipline.md` BEFORE the first write of the session and
`references/keywords-search-terms-negatives.md` for negative and match-type depth. Context:
`account_context_get({ domain: "ppc" })` + `memory_list({ domain: "ppc" })` for protected brand
campaigns and approval thresholds, and `ppc_goals_get({ evaluate: true })` for the targets (target
CPA, cost per lead, monthly budget) and each stop-loss rule's state - optimize toward those instead of
stopping to ask.
1. `ppc_digest` first - a stale connection makes every number below it a lie. Its `warnings[]`
   flags connections stale by over 25h: `ppc_sync({ connection_id })` before reading further.
2. `ppc_anomaly_check` (Google Ads only) - yesterday vs the prior-7-day average, flagging swings
   over 50%. Investigate every flag before optimizing anything: a conversion cliff with steady
   clicks is a tracking incident, not an optimization target.
3. `ppc_change_history` for the last 14-30 days BEFORE proposing anything. Two checks:
   - Paused-winner check: a "loser" in this window may be a recently-paused winner - read what
     changed before judging what is happening.
   - Ownership check: anything recently changed by someone else is not yours to re-change. Flag
     it with who and when; never silently revert another operator's work.
4. Waste, per connection (Google and Microsoft): `ppc_search_terms_mine({ connection_id, params: {
   days: 28, protected_terms, target_cpa } })` first (`target_cpa` in currency units: the goals'
   `target_cpa_cents` / 100). Its `verdict.kind` decides the fix: `long_tail` is structure (match
   type, AI expansion), not more negatives; `concentrated` is negatives; `no_conversions_measured`
   stops here for tracking. Then `ppc_search_terms_report({ days: 28 })` / `ppc_bing_search_terms_report`
   for the rows behind each candidate. The cut threshold is a number, not a feeling: propose a negative
   when spend >= 1x target CPA with 0 conversions; 0.5x-1x goes on the watchlist. Target CPA comes from
   `ppc_goals_get`; if it reports none, ask the user ONCE, record the answer with `ppc_goals_set`, and
   carry on - never invent one. Brand or protected terms under the account rules get flagged for
   sign-off, never silently proposed. EVERY proposed negative goes through `ppc_negatives_lint` (pass
   the miner's `lint_handoff.params`, or your list with its reach): only `clear` items reach the
   batch. Always pass `match_type` explicitly: `ppc_negative_keyword_add` defaults to broad, and a
   broad negative can nuke good traffic (`ppc_platform_negative_keyword_add` is the non-Google write).
   Existing negatives: `ppc_negatives_audit` for self-blocking ones; removing one is
   `ppc_negatives_remove`, which WIDENS reach - its own preview and yes, never part of the batch.
5. Disapprovals on EVERY connected platform, per the skill's weekly play: `ppc_disapprovals_list`
   (Google), `ppc_bing_disapprovals_list` (Microsoft; a `partial` coverage is not a clean account),
   `ppc_meta_disapprovals_list`, `ppc_tiktok_disapprovals`,
   `ppc_linkedin_creative_disapprovals` - a disapproved ad is a zero-traffic ad silently starving
   its ad group; propose one fix per disapproved ad.
6. Pacing from the digest's per-platform `pacing` block (`ppc_pacing_summary` stays Google-only
   per-campaign). Before proposing any budget raise or looser target, `ppc_bid_budget_simulate`
   (Google or Microsoft): quote its marginal cost per extra conversion and `calibration`; its
   `next_step` is a proposal you make, never something done. Where the waste is a slice (hours,
   places, devices), `ppc_performance_breakdown` names it with an evidence level; a setting fix
   (ad schedule, location option PRESENCE, search partners off) goes through the preview-first
   settings writes after `ppc_google_campaign_settings_get` shows the live value. Any
   bidding-strategy proposal obeys the change-velocity rule: one bidding-strategy change per
   campaign per 2 weeks, with a ~7-day learning phase after each - the write discipline behind
   that rule is `references/spend-change-discipline.md`.
7. STOP before writing, with the consent cadence the skill sets per write class
   (`keywords-search-terms-negatives.md` section 0): negatives and promotions are structure
   changes - present the WHOLE classified list with the numbers behind each ("negative 'free
   widgets': $412 spend, 0 conversions, target CPA $85"), take ONE confirmation for that batch,
   then execute item by item via `ppc_negative_keyword_add`. Bid and budget changes stay one
   confirmation PER change via `ppc_budget_update` - never bundled. `ppc_bulk_edit` handles up to
   100 STATUS ops in one call but refuses budget ops by design (`budget_op_in_bulk_edit`) - it
   never turns spend changes into one consented batch. Enabling a paused Search campaign: run
   `ppc_launch_qa` first and fix every fail with the tool it names; `incomplete` is not a pass.
8. Read back every applied change with `ppc_change_history` - a write you did not verify is a
   write you do not know happened. A settings write returns `after` (trust it over what you asked
   for) and re-reads in `ppc_google_campaign_settings_get`; removed negatives re-read in
   `ppc_negatives_audit`.
9. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
