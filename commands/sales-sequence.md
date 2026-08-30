---
description: The CRM sales follow-up sequence rail (crm_* tools) - clone, rewrite steps, spam check, activate, DNC-gated enroll. The marketing nurture rail (email_sequence_*) is /hiveku:sequence.
argument-hint: "[what the follow-up sequence should do, or which one to work]"
---
Sales sequence: $ARGUMENTS. This is the CRM rail (`crm_*_sequence` - 1:1 sales follow-ups from the
connected inbox), NOT the marketing drip rail (`email_sequence_*` → `/hiveku:sequence`). Context:
`account_context_get({ domain: "sales" })`, and load
`hiveku-sales-agency/references/sequence-program.md` - the id-vs-sequence_id argument matrix and the
full program discipline live there.
1. Build by cloning - there is no callable create: `crm_list_sequences` → `crm_sequence_clone({
   sequence_id })` (lands INACTIVE, all steps copied) → rewrite with `crm_update_sequence_step` per
   step (preferred; passing `steps` to `crm_update_sequence` REPLACES the whole array). Draft step
   copy yourself from the loaded sales context - personal, plain, referencing something true.
2. Preflight, always, before activation:
 - `crm_inbox_connections` - no connected sendable inbox means the sequence sends nothing.
 - Merge tags: every `{{tag}}` the steps use needs a value per enrollee
     (`crm_set_custom_field_value` / `crm_get_custom_field_values`) or enrollment is refused with a
     422 listing the missing tags.
 - `crm_sequence_spam_check({ sequence_id })` per step - score bands clean / review /
     likely_filtered; fix `likely_filtered` copy before it burns the domain.
3. **Activation confirm gate.** `crm_update_sequence({ id, is_active: true })` is the switch that
   makes every current and future enrollment SEND - explicit yes first, with the step list read
   back (`crm_get_sequence`).
4. **Enrollment confirm gate.** Per contact: `crm_get_dnc_status` + the suppression check - then
   show the batch (25-50 at a time) and enroll on approval: `crm_enroll_sequence({ id, contact_id,
   deal_id? })` per contact, or `crm_sequence_enroll_bulk({ id, contact_ids })` for the batch - it
   applies the same gates per row and returns `{ enrolled, skipped_duplicates, failed: [{contact_id,
   reason}] }`; read the `failed[]` list back to the user instead of calling the batch enrolled.
   409 duplicate = idempotency working, not an error.
5. Monitor and iterate: `crm_sequence_status` (cheap snapshot), `crm_sequence_analytics` (per-step
   funnel), `crm_sequences_compare` (reply-rate leaderboard across sequences). A reply exits that
   contact from the automation conversation: `crm_unenroll_sequence` and go answer like a person.
6. Stopping: pause (`crm_pause_sequence_enrollment` / deactivate with `is_active: false`) is a REAL
   stop - the send-queue dispatcher re-checks the enrollment at dispatch time and cancels queued
   rows whose enrollment is no longer active; only a row already claimed `sending` at that moment
   goes out. `crm_delete_sequence` hard-deletes and cascades steps AND enrollments - deactivate
   instead, and treat delete as an owner-confirmed act.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
