---
description: Weekly optimization pass (role: SEO Specialist) — the agency cadence, not just a status check.
---
Run this account's weekly pass. Follow the **hiveku-seo-agency** skill's weekly cadence.
1. Context first: `account_context_get({ domain: "seo" })`.
2. Work the checklist: rank movements (`seo_rankings_list`), GSC anomalies (`seo_gsc_period_comparison`), new/lost links (`seo_new_lost_backlinks`), audit deltas, this week's publish/refresh pipeline.
3. Every change is confirmed before applying; every work item lands as a PM task.
4. Close with a 5-line "what changed / what's next" note into the `seo` memory. Read it first with `memory_list({ domain: "seo" })`, append your 5 lines to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })` — it replaces the document, so a bare 5-line body wipes every prior week. If nothing exists yet, `memory_create({ type: "memory", name: "seo", content })`.
