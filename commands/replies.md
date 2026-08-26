---
description: Triage new Smartlead/HeyReach replies — classify, draft, update leads + CRM. Idempotent.
---
Reply triage. Context: `account_context_get({ domain: "outbound" })`.
1. Get new replies: if the local automations worker runs here, read its state/log under
   `automations/`; else pull from Smartlead/HeyReach REST (keys in `automations/.env`;
   endpoints in `.claude/AUTOMATION.md`). Track handled reply ids — never process one twice.
2. Classify each: interested / question / objection / unsubscribe / bounce.
3. Interested + questions: draft replies via `talk_to_department({ domain: "outbound", message })` —
   show drafts, do NOT send without approval.
4. Persist EVERY reply: `outbound_update_lead({ lead_id, is_interested, internal_status })` +
   `crm_contact_upsert_by_email` + `crm_create_activity` (the reply + your draft).
5. Unsubscribes → `crm_set_dnc` immediately. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
