---
description: Work the overdue ticket queue with macro-based drafts. Nothing sends without approval.
---
Ticket pass. 1. `helpdesk_tickets_overdue({ kind: "first_response", limit: 500 })` then
   `({ kind: "resolve", limit: 500 })` → queue by priority/age. The default limit is 100 and the
   truncation is silent, so a capped list reads as a healthy queue. This is the LIVE-breach queue
   only - last week's or last month's attainment number is `helpdesk_sla_history` (resolved
   tickets included, whole-window counts), the weekly checkup's read, not this pass's.
2. Per ticket: `helpdesk_ticket_get` + `helpdesk_ticket_messages` for context; find a fitting macro
   (`helpdesk_macros_list` → `helpdesk_macros_get({ id })` to see its `{{placeholders}}` →
   `helpdesk_macros_render({ id, variables })` - YOU build the variables map from the ticket, the
   render tool takes no ticket argument, and its response lists any placeholder you left unfilled;
   non-empty means do not send) or draft fresh; use `helpdesk_kb_suggest_articles({ q })` for
   citable articles because it returns public-only, while `helpdesk_kb_search` defaults to
   `visibility: "all"` and will hand you internal docs you must never link to a customer.
3. Show each draft; on approval `helpdesk_ticket_send_reply` (the only tool that stamps
   `first_response_at` - an outbound `helpdesk_ticket_add_message` answers the customer but leaves
   the ticket an SLA breach forever) + status via `helpdesk_ticket_set_status({ id, status })`,
   where status is only `open | pending | resolved | closed`.
4. A pass is a snapshot, not a feed - `helpdesk_tickets_overdue` and `helpdesk_ticket_list` have no
   delta or updated-since filter, so a queue that read clean at 8am can be breaching again by noon.
   On a live queue, re-run step 1 every hour or two while working a long backlog and once more
   before ending the session; keep the previous pass's ticket ids and report only the deltas (new
   tickets, new breaches, priority changes). A fresh `urgent` or a new `first_response` breach
   preempts whatever you were drafting. For the full morning triage (unassigned routing, aging
   pending, history-at-a-glance, merges), run `/hiveku:support-sweep` instead.
5. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
