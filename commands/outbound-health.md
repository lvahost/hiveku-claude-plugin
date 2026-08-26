---
description: Outbound program health — campaign stats, reply/bounce rates, list quality, next actions.
---
Outbound health. 1. `outbound_list_campaigns` + per-campaign `outbound_list_leads` counts by
`internal_status` / `has_replied` / `is_interested` → reply rate, positive rate, bounce signals.
2. `email_stats` for the sending side; `crm_contacts_gone_cold` for the re-engagement pool.
3. Top 3 actions (kill/scale campaigns, list hygiene, copy tests) → PM tasks on approval.
4. For continuous coverage, point the user at the local reply-triage automation
   (`.claude/AUTOMATION.md`, `node automations/manage.mjs list`). Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
