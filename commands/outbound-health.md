---
description: "Cold email not working, or nobody responding? Health check on the whole outbound program - readiness score, blockers, mailbox health, reply SLA, and what to fix first."
---
Outbound health.
1. `outbound_health_status` FIRST (no arguments). Report in this order: `blockers[]` →
   `warnings[]` → `readinessScore` (0-100) + `healthStatus` → `replyCoverage` (24h reply SLA) →
   `inboxHealth[]` (per mailbox: email, status, warmupScore, dailySent, dailyLimit) → `metrics`
   (activeCampaigns, draftCampaigns, totalInboxes, healthyInboxes, warmingInboxes, totalSent,
   bounceRate, unsubRate, pendingReplies, positiveReplies, overdueReplies).
   `totalSent`, `bounceRate` and `unsubRate` are summed over campaigns with status ACTIVE only,
   with NO date filter - lifetime totals for currently-active campaigns, not a period. Pausing a
   campaign removes its volume from them. Quote them as a live-risk gauge and label them
   "lifetime, active campaigns only"; never present them as this week's or this month's numbers.
   Server thresholds so your advice matches the score: bounce > 10% and >5 unhandled positive
   replies are BLOCKERS; bounce > 5% / > 2%, unsub > 2%, fewer than 3 connected inboxes, no
   warming inbox, and >5 replies over 24h old are warnings.
2. Drill down only after step 1: `outbound_list_campaigns` (per-campaign sent_count, reply_count,
   positive_reply_count, bounce_count, unsubscribe_count, total_leads) + `outbound_list_leads`
   counts by `internal_status` / `has_replied` / `is_interested`.
   Do NOT reconstruct bounce rate, unsub rate, or warmup state from lead rows - those live on
   campaign and mailbox counters. Step 1 is the only source for the mailbox/warmup side; for
   volume and bounce/unsub across paused, completed and draft campaigns, use these per-campaign
   counters, which cover every status. Neither source is date-windowed: both are lifetime-to-date.
   Do NOT use `email_stats` here: it reports Hiveku's OWN transactional/marketing email, not cold
   sending. If that channel is genuinely in scope, report it under a separate heading labeled
   "Hiveku transactional/marketing email" and never sum it with outbound volume.
3. Reply backlog: `outbound_list_inbox({ thread_status: "needs_reply" })` and
   `outbound_list_reply_drafts({ status: "pending" })` - unapproved drafts are unanswered
   prospects. `crm_contacts_gone_cold` for the re-engagement pool.
4. Top 3 actions (kill/scale campaigns, list hygiene, copy tests) → PM tasks on approval. Any
   blocker from step 1 outranks all three.
5. For continuous coverage, point the user at the local reply-triage automation
   (`.claude/AUTOMATION.md`, `node automations/manage.mjs list`) as a backstop - Hiveku's own
   inbox sync is the primary loop. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
