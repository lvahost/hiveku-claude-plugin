---
description: Find knowledge-base gaps from ticket themes + CSAT, draft the missing articles.
---
KB gap sweep. 1. `helpdesk_csat_stats` + recent `helpdesk_ticket_list` → recurring themes with no
KB coverage (`helpdesk_kb_search` per theme).
2. Draft the missing articles (`helpdesk_kb_suggest_articles` where available, else write them) →
   `helpdesk_kb_article_create` as DRAFTS for review.
3. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
