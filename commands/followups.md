---
description: Re-engage gone-cold contacts with brand-aligned drafts. Nothing sends without approval.
---
Follow-ups. 1. `crm_contacts_gone_cold({ days, limit })` → prioritize by lead_score/deal value.
Contacts that have never been scored carry no lead_score at all — run `crm_contact_score_compute({
contact_id })` on the shortlist rather than ranking off blanks.
2. Gate the list before writing a word: `crm_get_dnc_status({ contact_id })` per contact plus
`crm_list_email_suppressions` for the batch. Drop anyone DNC'd or suppressed on either, and say who
you dropped and why. No exceptions, not even for "just a re-engagement".
3. Read before drafting: `crm_thread_for_contact({ contact_id })` for what was actually said, and
`crm_calls_list({ contact_id })` if the relationship was phone-led. Then draft a personal,
context-aware touch per contact via `talk_to_department({ domain: "outbound", message })` — gone-cold
contacts reference the last real conversation; they do not get a cold cadence.
4. Show drafts. Only on explicit approval, send via the connected inbox. Sequence enrollment
(`crm_enroll_sequence({ id, contact_id })`) is the stale/never-engaged play, not this one — and if
you do enroll, re-check DNC and suppression at enroll time and make sure every merge tag the steps
use already has a value (`crm_set_custom_field_value`), or enrollment is refused with a 422.
5. Update `crm_update_contact({ contact_id, lifecycle_stage })` + log every touch with
`crm_create_activity`. Finish every session of work the same way: persist notable learnings to department memory — read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
