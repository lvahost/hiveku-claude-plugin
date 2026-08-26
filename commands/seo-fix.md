---
description: Audit this account's site, fix the top SEO issues, track the keywords.
argument-hint: "[site or focus, optional]"
---
SEO fix loop$ARGUMENTS. Context first: `account_context_get({ domain: "seo" })`.
1. `seo_run_audit` (or latest `seo_list_audits` → `seo_audit_get`) → rank issues by impact.
2. Fix the top issues: if the site project is downloaded in this workspace, edit the files locally
   (then `/hiveku:code`); otherwise use the live tools
   (`pages_update`, `cms_*`, `seo_schema_markup`). Confirm before each write.
3. Track new targets: `seo_track_keyword`. Re-run the audit to verify the score moved.
4. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
