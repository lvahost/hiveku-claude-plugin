---
description: Email program review - stats, winners/losers, next test.
---
Email review. Know what the tools can and cannot tell you before you write a word of this - for a
campaign with no variant data, the per-campaign engagement numbers a client expects are NOT
reachable from these tools on any list over 500 recipients, and inventing them is the failure mode
this play exists to prevent. Variant-carrying campaigns are the exception now: `by_variant` makes
per-variant opens and clicks reportable at any list size (steps 1 and 3).

1. `email_stats` (account-wide send volume: sent_today / sent_week / sent_month, by_status across all
   email_messages, domain_count, api_key_count - NOT per campaign) + `email_campaign_list`, then
   `email_campaign_metrics({ id })` per recent send. Metrics returns
   `{ campaign_id, status, by_status, total, by_variant? }` - the send rows counted by status
   (queued / sending / sent / failed / skipped_suppressed / skipped_unsubscribed /
   skipped_frequency_cap), plus, ONLY on campaigns that carry variant data (an N-way `variants`
   test or the legacy ab_test_enabled pair), `by_variant: [{ variant, subject, sent, skipped,
   opened, clicked }]` with per-variant opens/clicks derived from email_events. Campaigns without
   variant data return no by_variant and still have NO open, click, delivery, bounce, complaint or
   unsubscribe figure in this tool, and there is no campaign-level delivered/bounced/complained
   breakdown in either case.
2. **Delivery review** (what the tools DO support): per campaign, sent vs the skipped_* buckets. A
   large skipped_frequency_cap means the 7-day per-contact cap ate the send
   (`marketing_frequency_cap_get`); skipped_suppressed / skipped_unsubscribed mean list health.
   Cross-check the account's sending health with `email_service_status` (read `sending_enabled` first
 - a suspension blocks everything) and list hygiene with `email_suppression_list({ type })`.
3. **Engagement**, only where it is real. Variant-carrying campaigns first: `by_variant` from
   step 1 supports a true per-variant open and click rate at any list size - report those, name the
   winner by CLICKS (Apple MPP inflates opens), and disclose each variant's N (its `sent`). For
   campaigns without variant data: `email_logs_list({ limit: 500 })` returns per-message open_count,
   click_count, delivered_at, bounced_at, complained_at. It has NO campaign filter and caps at 500
   rows. On any send under 500 recipients you can attribute rows by subject and report a rate; above
   that you CANNOT compute a true campaign open or click rate from tools - say so plainly and point
   the client at the dashboard. Never estimate a rate, and never call opens a win on their own -
   clicks are the signal.
4. ONE next A/B test recommendation with rationale, and cite the per-variant numbers from step 3:
   "variant B out-clicked A 2.1% to 1.4% on 4,000 sends, so next we test the CTA" beats "we should
   test subjects". Running it: `variants` on `email_campaign_create` / `email_campaign_update` -
   2-5 weighted variants, each with its own subject and an optional from_name, assigned
   deterministically per recipient. MUTUALLY EXCLUSIVE with the legacy `ab_test_enabled: true` +
   `ab_subject_b` pair (flat 50/50, subject only) - pass one mechanism, never both. Still no body
   split and no auto-promotion of a winner: the readout is `email_campaign_metrics` `by_variant`,
   and promoting the winner is a human decision. Variants are NOT copied by
   `email_campaign_duplicate` - re-attach the split on any clone. Tell the client all of that when
   you recommend the test.
5. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
