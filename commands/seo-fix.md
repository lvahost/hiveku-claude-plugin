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
4. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
