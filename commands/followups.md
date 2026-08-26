---
description: Re-engage gone-cold contacts with brand-aligned drafts. Nothing sends without approval.
---
Follow-ups. 1. `crm_contacts_gone_cold` → prioritize by lead_score/deal value.
2. Draft re-engagement per contact via `talk_to_department({ domain: "outbound", message })`.
3. Show drafts. Only on explicit approval: `crm_enroll_sequence` or send via the connected inbox.
4. Update `crm_update_contact` stages + log activities. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
