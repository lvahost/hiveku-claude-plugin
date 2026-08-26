---
description: Standup — what's next, breached, stalled, and milestone health.
---
Standup. 1. `mc_tasks_next` (the queue) + `mc_sla_breached` + `mc_tasks_stalled` + `pm_milestones_list`.
2. Report per project: on-track / at-risk / blocked, with the ONE next action each.
3. Save the standup note to memory (name "workflow"). Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
