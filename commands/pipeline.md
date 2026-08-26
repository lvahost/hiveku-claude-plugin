---
description: Pipeline pass — at-risk and stuck deals, one next step each.
---
Pipeline pass. Context: `account_context_get({ domain: "sales" })`.
1. `crm_deals_at_risk` + `crm_deals_stuck` + `crm_pipeline_stage_summary`.
2. Per deal: the ONE next step (call, email, proposal) — log it as `crm_create_activity` and, where
   a follow-up is due, a PM task with the due date.
3. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
