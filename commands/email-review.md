---
description: Email program review - stats, winners/losers, next test.
---
Email review. Know what the tools can and cannot tell you before you write a word of this - the
per-campaign engagement numbers a client expects are NOT reachable from these tools on any list over
500 recipients, and inventing them is the failure mode this play exists to prevent.

1. `email_stats` (account-wide send volume: sent_today / sent_week / sent_month, by_status across all
   email_messages, domain_count, api_key_count - NOT per campaign) + `email_campaign_list`, then
   `email_campaign_metrics({ id })` per recent send. Metrics returns ONLY
   `{ campaign_id, status, by_status, total }` - the send rows counted by status (queued / sending /
   sent / failed / skipped_suppressed / skipped_unsubscribed / skipped_frequency_cap). There is NO
   open, click, delivery, bounce or conversion figure in it, despite what its own tool description
   claims, and no A/B variant breakout.
2. **Delivery review** (what the tools DO support): per campaign, sent vs the skipped_* buckets. A
   large skipped_frequency_cap means the 7-day per-contact cap ate the send
   (`marketing_frequency_cap_get`); skipped_suppressed / skipped_unsubscribed mean list health.
   Cross-check the account's sending health with `email_service_status` (read `sending_enabled` first
 - a suspension blocks everything) and list hygiene with `email_suppression_list({ type })`.
3. **Engagement**, only where it is real: `email_logs_list({ limit: 500 })` returns per-message
   open_count, click_count, delivered_at, bounced_at, complained_at. It has NO campaign filter and
   caps at 500 rows. On any send under 500 recipients you can attribute rows by subject and report a
   rate; above that you CANNOT compute a true campaign open or click rate from tools - say so plainly
   and point the client at the dashboard. Never estimate a rate, and never call opens a win on their
   own (Apple MPP inflates them) - clicks are the signal.
4. ONE next A/B test recommendation with rationale. Running it: `ab_test_enabled: true` +
   `ab_subject_b` on `email_campaign_create` / `email_campaign_update`. It is a flat 50/50 split of
   the SUBJECT LINE ONLY - no body variants, no auto-promotion of the winner, and metrics does not
   break out by variant, so the result is read in the dashboard. Tell the client that when you
   recommend the test.
5. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
