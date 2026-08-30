---
description: Period win/loss review - wins and losses with their codes (the uncoded bucket named, never folded into 'other'), what the closing calls actually said, learnings persisted to memory and the objection library.
argument-hint: "[period - e.g. 'Q3' or 'last 30 days']"
---
Win/loss review$ARGUMENTS. Context: `account_context_get({ domain: "sales" })`, and load
`hiveku-sales-agency/references/win-loss-review.md` + `references/forecasting-reporting.md` for the
methodology and the reporting honesty rules.
1. The numbers, with their caveats attached every time they're quoted:
 - `crm_report_loss_reasons({ from, to })` - closed-lost bucketed by `lost_reason_code`. The
     `uncoded` bucket is migration debt and coding-discipline debt: report it as ITS OWN line,
     never folded into 'other'. The window dates on `closed_at` (the actual close timestamp) now,
     so "deals closed in <period>" is the honest phrase - with two caveats attached every time:
     rows still carrying no `closed_at` fall back to `updated_at` and are counted in the
     response's `dating.fallback_updated_at_rows` (quote it: "N of these are dated by last touch,
     not by close"), and closes from before 2026-08-29 carry a backfilled `closed_at` (the rep-typed
     `close_date` where one existed, else `updated_at`), so for those the close date is a proxy,
     not the moment the deal died.
 - `crm_list_deals({ status: "won" })` and `({ status: "lost" })` for the rosters, walked
     page-by-page; `crm_rep_win_leaderboard` for by-rep totals - same `closed_at` dating with the
     same `dating.fallback_updated_at_rows` count, and rep attribution is `deal.owner_id` (the
     contact owner no longer drives it); ownerless wins land on its `unattributed` line - report
     that line, never drop it. It also stopped filtering on a 'closed_won' status nothing writes,
     so an empty leaderboard is a real zero now, not the old bug.
 - When the review is "vs quota": `crm_report_attainment({ period_start?, period_end?, user_id?,
     pipeline_id? })` (default window = the current calendar quarter). Won = deals in a won status
     (the account's is_won slugs ∪ 'won' ∪ 'closed_won') dated by `closed_at`, attributed by
     `deal.owner_id`, with `won.unattributed` and the same `dating.fallback_updated_at_rows`.
     Read `quotas.team` / `quotas.by_user[]` (each `period_match: "exact" | "overlap"` - an
     overlapping quota is prorated by days into `prorated_amount_cents`, say so), then
     `attainment.team` (quota_cents, quota_basis, won_cents, attainment_pct, gap_cents, and
     projected_pct, which adds the open weighted forecast - value x stage probability - for open
     deals whose close_date falls in the window) and `attainment.by_user[]`, and `pacing`
     (days_elapsed, days_total, expected_share_pct, on_pace, weighted_open_forecast_cents,
     open_deals_due_in_window, note). `attainment.team` can be null - report "not available", never
     0%. Quotas on file: `crm_quotas_list({ user_id?, active_on? })` (`user_id: "team"` for the team
     row); setting one is `crm_quota_set({ user_id?, period_start, period_end, amount_cents })` in
     CENTS ($150,000 = 15000000), which upserts by scope + period - an internal record, no send gate.
2. The stories behind the top deals (by value, both columns): `crm_get_deal({ deal_id })` →
   `crm_calls_list({ deal_id, has_transcript: true })` → `voice_call_transcript_get` on the closing
   calls. QUOTE what was said for every load-bearing claim - "they said the price was fine, the
   timeline wasn't" is evidence; a paraphrased vibe is not. No transcript rail exists for
   Meet/Zoom - where the story lives in a notetaker doc, ask for the paste. Also read the thread:
   `crm_thread_for_contact` on the primary contact.
3. **Confirm-gated backfill.** For uncoded lost deals where the evidence names the reason, propose
   the `lost_reason_code` backfills as ONE listed batch - deal, proposed code, and the quoted
   evidence line - then apply each `crm_update_deal({ deal_id, lost_reason_code, lost_reason })`
   only on a single approval of the set. No evidence, no code: leave it uncoded and count it.
4. Feed the loops so the next quarter starts smarter:
 - Objection patterns from the transcripts → `outbound_log_objection({ objection_type,
     objection_text, response_text?, response_outcome })` / `outbound_update_objection` - the
     seen-count IS the signal, so log repeats.
 - Copy verdicts (a sequence step that kept booking, a subject that kept dying) →
     `outbound_record_sequence_learning`.
5. The owner report, in the closed reporting vocabulary (reported / not available / not
   applicable): dollars and counts by loss code, the uncoded count as a trending discipline metric,
   the win patterns with their quoted evidence, 2-3 keep/change recommendations, and anything that
   needs an owner decision (pricing, ICP, a rep coaching signal - a coaching signal is raised
   privately, not in a group report).
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
