---
description: Period-over-period ads report — winners, losers, spend story.
argument-hint: "[days, default 28]"
---
PPC report for the last $ARGUMENTS days (default 28). Context: `account_context_get({ domain: "ppc" })`.
1. `ppc_period_comparison` + `ppc_metrics` + `ppc_digest` → winners/losers, CPC movers, conv trends.
2. Write a short client-readable memo (plain language, numbers that matter, next tests).
3. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
