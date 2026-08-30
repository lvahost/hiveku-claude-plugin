---
description: "What's going out this week (\"the client wants to see everything before it goes out\") - social, email, content, and sequences in one Mon-Sun grid, with collisions, empty days, and the rows that will NOT ship themselves."
argument-hint: "[optional week - e.g. 'next week' or a Monday date]"
---
What ships this week$ARGUMENTS. Context: `account_context_get({ domain: "marketing" })`. One grid
from four surfaces that never see each other - and the surfaces are NOT equally real: scheduled
social and scheduled email execute themselves on crons; a content-item schedule row executes
NOTHING. The whole point of this command is to say which is which before the week starts.

1. **Frame the window.** Default to Mon-Sun of the current week (account's timezone), or the week
   the operator named. Every lane below is filtered to that window.
2. **Social lane (self-executing).** `social_calendar_list` with the week's date range (planned
   posts, campaigns, holidays - ordered by start date), plus `social_list_posts` filtered to the
   same date range and status to catch scheduled posts never bound to a calendar event - the
   calendar alone is not the truth. A post in status 'scheduled' with a `scheduled_at` WILL publish:
   the every-minute cron picks it up (default `approval_status: 'not_required'` passes its filter).
   Also `social_pillar_list` for `target_posts_per_week` - that is the bar the empty-day check in
   step 6 measures against.
3. **Email lane (self-executing).** `email_campaign_list({ status: "scheduled" })` for the week's
   sends - keep each row's send time and its `audience_id` (the list filters by `audience_id`, so
   rows carry it). Also pull `{ status: "paused" }` and `{ status: "sending" }`: a campaign paused
   mid-flight is a decision the week view must surface, not hide. `marketing_frequency_cap_get`
   once - the 7-day per-contact cap silently eats sends (`skipped_frequency_cap`), and it is what
   turns a same-audience collision from "awkward" into "the second send under-delivers".
4. **Content lane (DEAD scheduler - nothing here ships itself).** `content_list` filtered by status
   to the not-yet-published set, then `content_schedule_list` per candidate item - it takes ONE
   `content_item_id`, there is no account-wide sweep, so keep the candidate list tight. Rows are
   intent only: NOTHING executes `content_publishing_schedule` - no cron or worker reads it (the
   real scheduler is a different table, `cms_scheduled_actions`, which this endpoint cannot see).
   So: a `pending` row inside the week = a human/session action to put on the plan; a `pending` row
   with `scheduled_at` already PAST has not failed - it was never picked up, and it never will be.
   Flag those loudest: "this will NOT publish itself - do it now or move it."
   Also one `content_comments_recent({ since: <the last sweep> })` call - a fresh client comment
   (`source: 'share-link'`) against an item due to publish this week means the client is still
   mid-review; `since` is a strict greater-than on created_at, so the last processed comment's
   own timestamp is the cursor, and each row carries its `content_item` so you can match it to
   the grid.
5. **Sequence lane (always-on band, not day cells).** `email_sequence_list({ is_active: true })`,
   then per active sequence `email_sequence_enrollments({ id, status: "active" })` for the live
   headcount. Sequence steps fire per-contact on their own cadence, so render this as background
   pressure across the whole week - it shares the plan cap and frequency cap with campaigns, so a
   heavy sequence quietly starves a campaign day.
6. **Render the grid and flag it.** Mon-Sun rows, one lane per channel, each entry marked
   self-executing vs manual. Then the flags, in this order:
   - Past-due or in-week `pending` content rows (step 4) - the will-not-ship list, first, always.
   - An in-week content item with a fresh, unanswered client comment (step 4) - publishing over
     open client feedback burns the sign-off; reply or revise first, and remember the thread is
     CLIENT-VISIBLE, so anything written back is client copy, never an internal note.
   - Two email campaigns, same `audience_id`, same day - message collision AND the second send
     under-delivers via the frequency cap. Different audiences can still overlap members; offer
     `email_audience_members_list` (static, or the materialized snapshot of a dynamic audience) to
     check only if the operator asks - it is heavy.
   - Campaign day landing on contacts inside an active sequence (step 5) - softer, but say it.
   - Email and social pushing different offers the same morning - judgment call, present it.
   - Empty days: nothing in any lane, and social days under the pillars' `target_posts_per_week`.
7. **Fix on approval only, one change at a time.** Move a social post:
   `social_update_post({ post_id, scheduled_at })` (future time, account timezone - a past one
   400s), or move the slot with `social_calendar_update`; do NOT "re-push" with
   `social_publish_post` - on an unapproved post it returns 200 with `pending_approval: true` and
   moves the post OUT of 'scheduled' into the dashboard approval queue, where it stops shipping.
   Move or edit a scheduled email with `email_campaign_update` (refuses only on sent/sending);
   `email_campaign_schedule` puts a draft on the calendar; `email_campaign_cancel` takes a
   scheduled one off it. Execute a stranded content row: for a CMS-linked item the real publish is
   `content_publish_to_site` - it reads NO body, no confirm flag, no dry run, calling it IS the
   commit and it FORCES the entry live - so name the item and get an explicit yes first. If a step's
   write fails, report the error verbatim, leave the grid entry flagged, and move on - never retry a
   send-adjacent write blind.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
