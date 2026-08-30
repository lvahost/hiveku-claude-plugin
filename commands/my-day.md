---
description: The rep's morning queue - reminders due, today's meetings, waiting replies, new leads, follow-ups, pending drafts - one ranked list with the next action each. The account-wide brief is /hiveku:daily.
argument-hint: "[optional: rep name/email to scope to, if not you]"
---
The rep's day$ARGUMENTS. Context: `account_context_get({ domain: "sales" })`. Resolve the rep:
`crm_list_users` → the `owner_id` UUID. Be honest about scope as you go: only some queues filter
by owner (gone-cold does; reminders, inboxes, and triage are account-wide - label those lines
"account-wide" rather than implying they're personal).
1. Reminders: `crm_reminder_list({ status: "scheduled" })` - overdue and due-today first. Each
   reminder's `prompt` is self-contained; do what it says or surface it.
2. Meetings: `crm_calendar_list({ time_min: <today 00:00 ISO>, time_max: <today 23:59 ISO> })` -
   for each client-facing one, offer `/hiveku:call-prep` (and `/hiveku:call-capture` for yesterday's
   meetings that never got logged - an unlogged touch did not happen).
3. Replies waiting on a human:
 - Warm 1:1: `gmail_inbox_lead_replies` (pre-filtered to prospects; team + noise excluded) and
     `crm_inbox_list({ folder: "inbox" })` for the connected-mailbox tail (last N, no search).
 - Cold: `outbound_list_inbox({ thread_status: "needs_reply" })`, positives first, plus
     `outbound_list_reply_drafts({ status: "pending" })` - an unapproved draft is an unanswered
     prospect. Working these is `/hiveku:replies`; here they are counted and ranked. An
     already-drafted reply CAN go out from here, but only on an explicit yes: call
     `outbound_reply_draft_send({ draft_id })` WITHOUT `confirm` first (a preview - the draft, the
     recipient, `in_reply_to`, warnings; it sends nothing), show it, and only on the user's yes to
     that preview `outbound_reply_draft_send({ draft_id, confirm: true })`. Never automatically,
     never in bulk - one shown preview, one yes, one send; a 409 `not_sendable` means the draft
     is no longer sendable (already sent, discarded, or mid-send) - read
     `outbound_list_reply_drafts({ status: "sent" })` before claiming it went out.
4. New leads: `crm_lead_triage({ query })` - saved query patterns live in memory under
   `domain='lead_intake_query'` (`memory_list` first; no saved pattern → ask what the intake inbox
   looks like and save the query back). Hot inbound gets drafted within the hour, ahead of
   everything below it.
5. Follow-ups and tasks: `crm_contacts_gone_cold({ days, owner_id, limit })` for the rep's own
   cold list (the deeper play is `/hiveku:followups`), and the PM queue via `list_tasks` /
   `pm_tasks_list` for overdue items.
6. Emit ONE ranked list, 5-10 items, each a single line: who/what, why now, the next action with
   the tool or `/hiveku:*` command that does it. Rank: overdue reminders and hot inbound → today's
   meetings (prep) → waiting replies → follow-ups → admin.
7. Act only on request. Drafting is free; SENDING is not: a 1:1 email goes out only via
   `crm_contact_email_send` after the exact subject + body were shown and explicitly approved -
   there is no draft state, no recall, and no idempotency key on that tool, and it sends from the
   connected inbox to the contact's address on file. On a key where that tool isn't visible, hand
   the finished draft to the user instead - never work around it through another send rail.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
