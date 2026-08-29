---
description: "\"Move budget from what's wasting to what's working\" / \"shift spend from Meta to Google\" - cross-platform budget reallocation: a zero-net move plan with its data gaps relayed verbatim, donor sanity-checks, then each move applied one confirmed step at a time."
argument-hint: "[optional focus, e.g. a platform or campaign to fund]"
---
Cross-platform budget reallocation ($ARGUMENTS). Follow the **hiveku-ppc-agency** skill; the write
discipline for every budget move is `references/spend-change-discipline.md` and the budget
economics are `references/bidding-budgets-pacing.md`. Context:
`account_context_get({ domain: "ppc" })` + `memory_list({ domain: "ppc" })` for the client's
monthly ceiling and target CPA/ROAS - if no ceiling is on record, STOP and get one before any
money moves.
1. `ppc_digest` first - a stale connection makes every number below it a lie, and a reallocation
   built on stale spend moves money in the wrong direction twice. Its `warnings[]` flags
   connections stale by over 25h: `ppc_sync({ connection_id })` before planning anything.
2. `ppc_reallocation_plan` - the plan engine. Its contract, stated to the user up front:
   - Moves are zero-net: money out equals money in, so the account total holds the client
     ceiling.
   - Each move is step-capped at 25% of a connection's monthly target per plan - no single plan
     empties or doubles a connection.
   - Each move carries a `confidence` (high | medium | low) and names its `apply_with` tool. The
     plan itself NEVER applies anything - it is read-only over synced data.
   - RELAY `data_gaps[]` VERBATIM to the user. A plan with data gaps is a draft, not a
     recommendation: zero-conversion spend may be a tracking gap rather than waste,
     sub-10-conversion CPAs are low-significance, mixed currencies and stale syncs distort the
     ranking, and connections without a `settings.monthly_budget_target_cents` get verdict cards
     but no moves.
3. Donor sanity-check, per proposed donor, before presenting anything:
   - Protected and brand campaigns named in account memory are never donors. If the plan drains
     one, strike the move and flag it - protection is not overridden by an efficiency ranking.
   - `ppc_impression_share` (Google; Microsoft via `ppc_bing_impression_share_report`) - a
     campaign losing impression share to BUDGET is a bad donor: it is budget-starved, not
     wasteful, and cutting it deepens the very constraint the plan read as inefficiency.
   - `ppc_segment_report` with `dimensions: ['hour']` - the waste may be dayparting, not the
     campaign: a campaign that bleeds overnight needs an ad schedule, not a budget cut. Add
     `['day_of_week']` when the hourly cut is ambiguous.
4. STOP: present the full move table - from, to, monthly amount, confidence, rationale, and the
   data gaps beneath it. Then apply moves ONE at a time, each via the move's named `apply_with`
   tool: `ppc_budget_update` (google_ads; a shared budget returns `explicitly_shared: true` and
   the change hits every campaign using it - re-confirm) or `ppc_platform_budget_update` (all
   platforms). Each move gets its own yes; one yes for the whole table is batched consent, and
   batched consent is refused. The code-enforced budget gates (the 2x step cap and daily-ceiling
   refusals) are the backstop, not the standard - `references/spend-change-discipline.md` draws
   the line between code-enforced gates and prose-only warnings, and for everything prose-only,
   you are the gate.
   A move the user declines is declined, not deferred: record it, and never re-propose it later
   in the session as if the earlier table were standing consent.
5. Read back per applied move: `ppc_change_history` after EACH write, before the next one - a
   moved budget you did not verify is a budget you do not know the location of. After the last
   applied move, `ppc_sync({ connection_id })` on every touched connection so the digest and the
   dashboards agree with what you just did.
6. Honesty lines, pre-scripted, said where the number is quoted:
   - "`ppc_pacing_summary` is Google-only and per-campaign; the cross-platform pacing read is
     `ppc_digest`'s per-platform `pacing` block." Say which one a pacing number came from.
   - "The reallocation plan reads synced local data and never fires live impression-share
     reports" - which is exactly why step 3's live headroom check exists.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
