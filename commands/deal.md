---
description: One deal, done right - create, correct, move stage, or close it with the stage-UUID and loss-code discipline. The board-wide sweep is /hiveku:pipeline.
argument-hint: "[deal/contact + the action - e.g. 'close Acme lost, price' or 'new deal for Jane, $12k']"
---
Work one deal: $ARGUMENTS. Context: `account_context_get({ domain: "sales" })`.
1. Resolve it: `crm_list_deals({ search })` or via `crm_search_contacts` → `crm_get_deal({ deal_id })`
   (the argument is `deal_id`, never `id`). Two plausible matches → ask; never guess where a stage
   move or a close lands.
2. Creating: `crm_list_pipelines` FIRST - `pipeline_id` and `stage_id` are UUIDs, never names. But
   before a manual create for an outbound-sourced lead, CHECK whether the account's outbound board
   has a CRM rule on the matching stage (dashboard-configured; `outbound_list_pipeline_stages` shows
   the stages) - if a rule exists, flipping the lead's `is_interested`/`internal_status` creates the
   deal with its own idempotency keys, and a manual `crm_create_deal` next to it makes a DUPLICATE
   that inflates the client's pipeline number. Otherwise: `crm_create_deal({ pipeline_id, stage_id,
   name, value, close_date })` + `crm_link_deal_contact({ deal_id, contact_id })`. Ownership lives
   on the DEAL: `crm_update_deal({ deal_id, owner_id, assigned_to_id? })` with user UUIDs from
   `crm_list_users` (`assigned_to_id` defaults to the owner when only `owner_id` is given;
   `unowned: true` clears both). "Hand this deal to Sarah" is a deal write, not a contact write -
   the contact's own `owner_id` is a separate field and no longer drives deal attribution. Whether
   `crm_create_deal` takes `owner_id` directly is not verified - set it with the update right after.
3. Correcting: `crm_update_deal({ deal_id, stage_id, close_date, value, status, owner_id,
   assigned_to_id })`. A past-due close date or a stage whose exit criteria were never met is a
   correction to make now - an uncorrected close date is a forecast lie that survives every future
   `/hiveku:pipeline` run. Flipping `status` to won/lost stamps `closed_at` (the actual close
   timestamp) and flipping it back to open clears it; `lost_reason_code`, `lost_reason` and
   `won_reason` are in the schema now (they used to be silently dropped).
4. Moving/closing: `crm_deal_move_stage` appends to `stage_history` and takes the close fields ONLY
   when the destination is a closing stage - on a non-closing move it writes NO loss fields and
   returns `loss_fields_ignored: true` (that call recorded no reason). Lost closes CODED:
   `lost_reason_code` (no_decision | price | competitor | timing | no_budget | bad_fit | ghosted |
   other - unknown codes 400 listing the vocabulary) plus free-text `lost_reason` (max 500 chars);
   wins get `won_reason`. The aggregate these codes feed is `/hiveku:win-loss`, which now dates
   every close on `closed_at` - a close through `crm_update_deal({ status })` stamps it; whether
   `crm_deal_move_stage` into a closing stage stamps it too is not verified, so check `closed_at` on
   the `crm_get_deal` read-back and set `status` with `crm_update_deal` if it is still empty.
5. **Confirm gate:** read the full change set back as ONE list (stage, value, dates, close fields,
   ownership) before writing anything; whatever the user strikes is dropped without argument.
6. Close the loop: `crm_create_activity` for the decision, a PM task or `crm_reminder_schedule` for
   the next step - and on any close, sweep `crm_reminder_list({ status: "scheduled" })` and cancel
   (`crm_reminder_cancel`) reminders pointing at the dead deal, so the rep's `/hiveku:my-day` stops
   resurrecting it.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
