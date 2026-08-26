---
description: Chase overdue receivables — reminders drafted per invoice, activity logged.
---
AR chase. 1. `accounting_ar_aging` + `accounting_invoice_list({ status: "all" })` → overdue invoices.
2. Per overdue invoice, draft a firm-but-brand-aligned reminder via
   `talk_to_department({ domain: "outbound", message })`. Show drafts — do NOT send anything without approval.
3. Log each chase as an activity (`crm_create_activity`) and record promised dates as PM tasks.
4. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
