---
description: Optimization pass — search terms to negatives, pacing, disapprovals. Confirms every write.
---
PPC optimization pass. Context: `account_context_get({ domain: "ppc" })`.
1. `ppc_search_terms_report` → wasted-spend queries → propose negatives; on approval
   `ppc_negative_keyword_add` (confirm EACH — never bulk-apply silently).
2. `ppc_pacing_summary` → over/under-pacing campaigns → propose `ppc_budget_update` changes (confirm each).
3. `ppc_disapprovals_list` → fixes per disapproved ad.
4. Respect account rules from context/memory (e.g. protected brand campaigns, approval thresholds).
5. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
