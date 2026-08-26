---
description: Plan + draft a campaign with the account's brand context, then schedule it.
argument-hint: "[campaign brief]"
---
Campaign: $ARGUMENTS. Context FIRST: `account_context_get({ domain: "marketing" })`.
1. Strategy + copy through the department agents (full brand/memory):
   `talk_to_department({ domain: "marketing", message })` then `{ domain: "content" }` for drafts.
2. Persist: `content_create` per asset; schedule with `content_schedule` (confirm before anything is
   scheduled to SEND).
   If the campaign includes email, the send is GATED and the gates fail at SEND time, not at build
   time - run `marketing_setup_status` (do not build until `ready_to_send: true`) AND
   `email_service_status` (read `sending_enabled`; setup_status does not check SES suspension) BEFORE
   drafting, and every body needs `{{unsubscribe_link}}` plus the physical mailing address or
   validation fails even the test send. `email_campaign_create` is only the draft step - use
   `/hiveku:email` for the full sequence (dry run, test send, then send) rather than improvising it
   here.
3. Create the campaign's PM tasks. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
