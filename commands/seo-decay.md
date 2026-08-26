---
description: Find decaying + cannibalizing content and produce a refresh plan.
---
Content decay sweep. Context: `account_context_get({ domain: "seo" })`.
1. `seo_content_decay` + `seo_cannibalization` → pages losing traffic or competing with themselves.
2. For the top candidates, get a brand-aligned refresh plan: `talk_to_department({ domain: "seo", message })`.
3. Create one PM task per refresh (`pm_tasks_create`) with the plan in the description.
4. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
