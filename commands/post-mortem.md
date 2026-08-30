---
description: End-of-campaign post-mortem - actuals vs the goal, winners/losers, learnings persisted where the next campaign will see them.
argument-hint: "[campaign name or id]"
---
Post-mortem for the campaign: $ARGUMENTS. This is the close-the-loop step /hiveku:campaign does not
do - without it every campaign starts from the same blank context and repeats last quarter's losing
hook. Context first: `account_context_get({ domain: "marketing" })`.
1. **Recover the goal.** Find the campaign's PM project and tasks (`pm_projects_list` - it filters
   only by `status`, so filter the returned list yourself - then `pm_tasks_list`) and check the
   `marketing` memory (`memory_list({ domain: "marketing" })`) for the goal recorded when the
   campaign was planned. If NO goal was ever written down, ask the user what success was supposed
   to look like BEFORE judging anything - a post-mortem against a retro-fitted goal is theater -
   then write the agreed goal into the PM project description (`pm_projects_update`) so it is on
   record. When planning the NEXT campaign, record a one-line goal at /hiveku:campaign time so
   this step never starts blind again.
2. **Gather actuals, with the caveats stated out loud** (scope every read to the flight window):
   - Email: `email_campaign_list` to find the campaign's sends, then `email_campaign_metrics({ id })`
     per send - `by_status` is the delivery review (sent / failed / skipped_*), and `engagement`
     ({ delivered, opened, clicked, bounced, complained, open_rate, click_rate }) is the campaign
     engagement read on EVERY send, at any list size - rates are percentages against delivered,
     `null` until anything delivered (say "not yet delivered", never 0%). A campaign carrying
     variants (or the legacy ab_test_enabled pair) ALSO returns `by_variant`, so the split-test
     winner is read here too - by clicks (Apple MPP inflates opens). Per-message detail:
     `email_logs_list({ campaign_id, limit: 500 })`, newest first, still capped at 500 rows, so it
     is a sample, not the denominator. What no tool returns: unsubscribe counts.
   - Social: `social_list_posts({ status: "published", from_date, to_date })` to enumerate the
     campaign's posts (its date filter is on `created_at`, not `published_at`, and it returns NO
     metrics), then `social_post_sync_analytics({ post_id })` followed by
     `social_post_analytics({ post_id })` per post - the only per-post metric source.
   - Paid: `ppc_digest` FIRST - a connection stale by >25h makes its platform's numbers a lie;
     sync before reading. Then `ppc_period_comparison` at campaign scope, flight window vs the
     same-length pre-flight window (Google), and `ppc_platform_period_comparison` for
     Meta/Microsoft/LinkedIn/TikTok (Bing's reporting API is async-only - expect the
     client-side-diff note).
   - Landing pages / content: do NOT read `content_analytics_get` for performance - nothing in the
     app writes content_analytics, so it returns 200 with empty data and all-zero summaries for
     effectively every item (a missing collector, not a dead post). Use `analytics_pages` and
     `analytics_overview` landing pages for the campaign URLs instead.
   - Leads: `marketing_form_conversion_audit` over the flight window - `buckets.counted` is the
     real lead count; explain any gap with the named buckets (spam, duplicate, workflow_failed...)
     rather than a bare number.
3. **Verdict vs goal.** Hit or miss, with the number and the source call named. Then the learning
   table: WINNERS (kept - which hook/offer/audience/channel earned its spend), LOSERS (killed -
   and why, with the number), TRY-NEXT (one or two testable bets). Every line backed by a tool
   call from step 2, no vibes - and state what you CANNOT know (uncollected metrics, unsubscribe
   counts, per-message detail past the 500-row log cap) as explicitly as what you can.
4. **Close the loop in PM:** `pm_tasks_complete({ id, summary })` on the campaign's tasks with a
   one-line result each; create one follow-up task per TRY-NEXT bet (confirm before creating).
5. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth. The memory note here is the whole point of this command: write it like a sequence learning - hook/offer/audience verdicts the next /hiveku:campaign can act on, not a status update.
