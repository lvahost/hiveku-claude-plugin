---
description: Pipeline pass - at-risk and stuck deals, one next step each.
---
Pipeline pass. Context: `account_context_get({ domain: "sales" })`.
1. `crm_deals_at_risk({ stuck_days })` + `crm_deals_stuck({ days })` + `crm_pipeline_stage_summary({
   pipeline_id })`. Union the lists, sort by value, cap the working set around 15.
2. Per deal: `crm_get_deal({ deal_id })` (the argument is `deal_id`, never `id`), then the ONE next
   step (call, email, proposal) - log it as `crm_create_activity` and, where a follow-up is due, a PM
   task with the due date.
3. Correct the record, not just the notes: `crm_update_deal({ deal_id, stage_id, close_date, status
   })` for any past-due close date or stage whose exit criteria were never actually met. `stage_id`
   is a stage UUID from `crm_list_pipelines`, not a stage name; ownership lives on the deal -
   reassign with `crm_update_deal({ deal_id, owner_id, assigned_to_id? })` (user UUIDs from
   `crm_list_users`; `assigned_to_id` defaults to the owner when only `owner_id` is given;
   `unowned: true` clears both), not with a contact write. List every change
   you intend to make and get confirmation before applying more than one or two - an uncorrected
   close date is a forecast lie that survives every future run of this command.
4. Dead deals close CODED. A stuck deal with no path forward is closed-lost with its
   `lost_reason_code` (no_decision | price | competitor | timing | no_budget | bad_fit | ghosted |
   other - an unknown code is a 400 listing the vocabulary) set in the closing call itself:
   `crm_deal_move_stage` takes the code when the destination stage is a closing one, and on a
   non-closing move it writes NO loss fields and returns `loss_fields_ignored: true` - that call
   recorded no reason; use `crm_update_deal` (lost_reason_code + free-text `lost_reason`, max 500
   chars) after the real close. Deals that die from this pass mostly die of no_decision - code
   them that way, and check the aggregate with `crm_report_loss_reasons` (its `uncoded` bucket is
   migration debt to surface as its own line, never folded into 'other'; the window dates on
   `closed_at` - the status flip to lost stamps it - with rows still lacking one falling back to
   `updated_at` and counted in `dating.fallback_updated_at_rows`, which you quote with the figure).
5. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
