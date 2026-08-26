---
description: Triage pending intake — classify, assign, transition.
---
Triage pass. 1. `mc_tasks_list` (pending/unassigned) → for each, `mc_intake_classify` if unclassified.
2. Propose assignee + lane + priority; on approval `mc_task_update` / `mc_task_transition` (confirm each).
3. Anything needing a human decision → `mc_task_decide` queue, flagged in the summary.
4. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
