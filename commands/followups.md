---
description: Re-engage gone-cold contacts with brand-aligned drafts. Nothing sends without approval.
---
Follow-ups. 1. `crm_contacts_gone_cold({ days, limit })` → prioritize by lead_score/deal value.
Contacts that have never been scored carry no lead_score at all - run `crm_contact_score_compute({
contact_id })` on the shortlist rather than ranking off blanks.
2. Gate the list before writing a word: `crm_get_dnc_status({ contact_id })` per contact plus
`crm_list_email_suppressions` for the batch. Drop anyone DNC'd or suppressed on either, and say who
you dropped and why. No exceptions, not even for "just a re-engagement". Then check each one is a
permission contact (`platform_rules` in `account_context_get`): they replied, met or called (a
conversation), bought, signed up or asked to be contacted. Opening or clicking a sequence email is
not permission: a contact who came from a bought, scraped, directory, member or event list and did
no more than that is cold - no send from the business's own inbox; hand them to `/hiveku:prospect`
for Outbound.
3. Read before drafting: `crm_thread_for_contact({ contact_id })` for what was actually said (plus
`crm_contact_emails_list({ contact_id })` for the synced 1:1 history), and
`crm_calls_list({ contact_id })` if the relationship was phone-led. Then draft a personal,
context-aware touch per contact via `talk_to_department({ domain: "outbound", message })` - gone-cold
contacts reference the last real conversation; they do not get a cold cadence.
4. Show drafts. Only on explicit approval, send via the connected inbox:
`crm_contact_email_send({ contact_id, subject, body, reply_to_message_id?, thread_id? })` - it
sends to the contact's address on file with NO draft state, recall, or idempotency key, threads
via the ids from `crm_thread_for_contact`, and self-logs the activity (do not double-log). On an
ambiguous timeout, read `crm_contact_emails_list` back before ANY retry. If that tool is not on
your key, hand the finished draft to the user - never route it through another send rail.
Sequence enrollment
(`crm_enroll_sequence({ id, contact_id })`) is the stale/never-engaged play, not this one (a cold
contact rides a CRM sequence only from a connected inbox on a separate domain, never the business's
main domain) - and if you do enroll, re-check DNC and suppression at enroll time and make sure every merge tag the steps
use already has a value (`crm_set_custom_field_value`), or enrollment is refused with a 422.
5. Update `crm_update_contact({ contact_id, lifecycle_stage })` + log every touch with
`crm_create_activity`. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })` and note its `version` and when you read it, append your note to the `content` it returns, then check `memory_log_list({ memory_id, since: "<when you read it>" })` and merge any newer change into your text (a department agent or a person may have edited it since), and send the WHOLE merged document to `memory_update({ memory_id, content, reason, expected_version })`, which REPLACES it (sending only the new note destroys everything that department had accumulated; `reason` is one plain line on why, and `expected_version` is the version you merged into, so a 409 `version_conflict` means it changed again: merge into the `content` that answer carries and save with its `version`, never resend blind); use `memory_create({ type: "memory", name: "<dept>", content, reason })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id, reason })` restores one (it works for deleted entries too). Hiveku records the session's Doing in the memory log at its first change, and its Done, counting the changes, when the session goes quiet. When `memory_log_add` is listed, end with a Done line that says what you did, if you want the log to say more than that: `memory_log_add({ phase: "done", department: "<dept>", line, outcome })`, `outcome` ok, failed or stopped, which closes the session's run with your line; leave `thread` out, and a Doing line sent once the session's is recorded answers `already_open`, which is not an error. Each `line` is one plain sentence of at most 160 characters in your own words, never a customer's words, a secret or personal details. Hiveku, not this folder, is the source of truth.
