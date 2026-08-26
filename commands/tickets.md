---
description: Work the overdue ticket queue with macro-based drafts. Nothing sends without approval.
---
Ticket pass. 1. `helpdesk_tickets_overdue` → queue by priority/age.
2. Per ticket: `helpdesk_ticket_get` + `helpdesk_ticket_messages` for context; find a fitting macro
   (`helpdesk_macros_list` → `helpdesk_macros_render`) or draft fresh; check `helpdesk_kb_search`
   for citable articles.
3. Show each draft; on approval `helpdesk_ticket_send_reply` + status via `helpdesk_ticket_set_status`.
4. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
