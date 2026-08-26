---
description: Work the books — AP/AR aging, approve queue, exceptions to PM. Confirms every approval.
---
Books pass. 1. `accounting_ap_aging` + `accounting_ar_aging` + `accounting_pnl_summary` — the state.
2. `accounting_bill_list({ status: "submitted" })` → walk the approve queue: show each bill
   (vendor, amount, due), get explicit approval, then `accounting_bill_approve` — ONE at a time.
3. Anything odd (duplicate vendor, missing terms, unusual amount) becomes a PM task, not a guess.
4. Record payments only when told: `accounting_bill_record_payment` (confirm).
5. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
