---
description: Plan a week of posts from pillars + analytics, drafted on-brand.
---
Social week plan. Context: `account_context_get({ domain: "social" })`.
1. `social_analytics_summary` (what worked) + `social_pillar_list` (what we stand for).
2. Draft the week via `talk_to_department({ domain: "social", message })` — per-platform variants.
3. Persist as DRAFTS: `social_create_post` (scheduled times proposed, publishing only on approval).
4. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
