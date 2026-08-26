---
description: Plan + draft a campaign with the account's brand context, then schedule it.
argument-hint: "[campaign brief]"
---
Campaign: $ARGUMENTS. Context FIRST: `account_context_get({ domain: "marketing" })`.
1. Strategy + copy through the department agents (full brand/memory):
   `talk_to_department({ domain: "marketing", message })` then `{ domain: "content" }` for drafts.
2. Persist: `content_create` per asset; schedule with `content_schedule` / `email_campaign_create`
   (confirm before anything is scheduled to SEND).
3. Create the campaign's PM tasks. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
