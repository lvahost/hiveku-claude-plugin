---
description: Optimization pass - search terms to negatives, pacing, disapprovals. Confirms every write.
---
PPC optimization pass. Context: `account_context_get({ domain: "ppc" })`.
1. `ppc_search_terms_report` → wasted-spend queries → propose negatives; on approval
   `ppc_negative_keyword_add` (confirm EACH - never bulk-apply silently).
2. `ppc_pacing_summary` → over/under-pacing campaigns → propose `ppc_budget_update` changes (confirm each).
3. `ppc_disapprovals_list` → fixes per disapproved ad.
4. Respect account rules from context/memory (e.g. protected brand campaigns, approval thresholds).
5. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
