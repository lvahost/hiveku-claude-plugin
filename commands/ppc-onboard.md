---
description: "First session on a new or unfamiliar ad account - \"we just took over the client's Google Ads\" - the onboarding audit: connections, measurement, structure, who touched it, headroom. Do NOT optimize yet; nothing on the ad platforms changes."
---
Onboarding audit for an ad account this operator has not worked before. Follow the
**hiveku-ppc-agency** skill's section 1.1 onboarding audit ("first session on any account - do NOT
optimize yet"): audited before touched, measured before optimized. Context:
`account_context_get({ domain: "ppc" })` + `memory_list({ domain: "ppc" })` for anything already
on record (monthly ceiling, target CPA/ROAS, protected campaigns).
1. `ppc_connection_list`, then `ppc_connection_test` on anything suspect, then
   `ppc_sync({ connection_id })` - nothing below is trusted on a stale connection.
2. Measurement before money, on EVERY connected platform (the skill's section 1.1.3 gate - no
   optimization on a platform until ITS tracking is verified): Google
   `ppc_conversion_tracking_status({ days: 30 })` - silent conversion actions (enabled, zero
   recent fires: dead tags) live in its `warnings[]`; Microsoft
   `ppc_bing_conversion_tracking_status`; Meta `ppc_meta_custom_conversions` +
   `ppc_meta_conversion_volume`; TikTok `ppc_tiktok_pixels`; LinkedIn `ppc_linkedin_conversions`.
   If measurement is broken anywhere, the deliverable is "fix measurement before optimizing" for
   that platform, full stop - optimizing to a broken signal is agency malpractice. Semantics and
   repair depth: `references/measurement-and-conversions.md`.
3. Structure read: `ppc_campaign_list({ limit: 200 })` + `ppc_ad_group_list` against the skill's
   structure standard (section 1.2): brand/non-brand split at campaign level, themed ad groups
   (not SKAGs), and the RSA build standard of 12-15 headlines, 4 descriptions, max 3 pinned
   (`references/ads-assets-quality.md`).
4. `ppc_change_history` for the last 30 days (the Google API maximum) - who has been touching
   this account. Never blame "the algorithm" for something a human changed Tuesday.
5. Headroom, where Google is connected: `ppc_impression_share` - lost-to-budget and lost-to-rank
   are two different stories with two different fixes (budget vs bids/quality) - and
   `ppc_google_pmax_performance` for per-asset-group PMax reads plus the per-channel split the
   PMax UI hides.
6. Deliverable, three parts, the writes each gated:
   - Findings memo: connections, a measurement verdict per platform (pass | fail | unknown |
     not_applicable - unknown is a valid verdict and never becomes a pass), structure gaps,
     history, headroom.
   - STOP: show the proposed PM task (title + findings summary), one confirmation, then
     `pm_tasks_create`.
   - STOP: OFFER to arm the budget guardrail via `ppc_connection_update` with
     `settings.monthly_budget_target_cents` (it PATCHes the WHOLE `settings` object - read the
     connection first and merge, or unrelated keys are silently lost). The user may decline;
     record the decision either way.
7. ZERO other writes in this command. Before the first write in any LATER session on this
   account, load `references/spend-change-discipline.md` - that ordering is the point of the
   onboarding audit.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
