# Publishing, scheduling, and approval mechanics

Load this before any create/update/schedule/publish/reject call, before touching the
calendar or the recurring slots, and before answering "why didn't my post go out".
Every state transition and failure mode in this rail is documented here.

## The calendar (events, not a container)

There is no calendar OBJECT to create and fill. The calendar IS its events: one
`social_calendar_create` call per planned slot. Required: `title`, `event_type`, and
`start_date` - miss any one and the call is a 400 "title, event_type, and start_date
are required". Full shape:
`social_calendar_create({ title, event_type, start_date, end_date, description,
target_platforms, tags, linked_post_id, color, icon })`.
- `event_type` is free text (no server-side enum). Pick one convention up front and
  keep it - `planned_post`, `campaign`, `holiday` is the intent the registry
  documents. Nothing validates it, so a typo silently creates a second category.
- `start_date` is stored as a DATE. A time component is dropped. Per-slot times live
  on `social_calendar_update` (`start_time`, `end_time`, `timezone`), not on create.
- `linked_post_id` is what makes the calendar operational: it binds the event to the
  actual `social_posts` row. Create the post, then create (or update) the event with
  its id. An unlinked event is a sticky note.

Read with `social_calendar_list({ from_date, to_date, event_type, status, page,
limit })` - limit max 100, default 50, ordered by start date. `social_calendar_get`
returns one event with its linked post and content pillar - use it after
`social_calendar_list` to see what a slot actually holds before rescheduling it.
Adjust with `social_calendar_update({ event_id, ... })`; remove a slot with
`social_calendar_delete({ event_id })`. Deleting an event does not touch the linked
post; deleting a post leaves its event behind with `linked_post_id` set to null. Keep
the two in sync yourself.

Recurrence is an UPDATE-only capability: create the event, then
`social_calendar_update({ event_id, is_recurring: true, recurrence_rule, start_time,
timezone })`. There are no recurrence fields on create.

## The recurring slot calendar (the cadence as data)

The agreed posting cadence belongs in first-class fields the same way pillar ratios
live in `target_percentage` - not in a memory note. The slot tools encode it:

- `social_schedule_slot_create({ weekday, minute_of_day, timezone })` - creating a
  slot schedules NO posts; it only defines a time that `social_schedule_slot_next_open`
  will offer. `weekday` is 0-6 with 0 = Sunday, `minute_of_day` is 0-1439 local to the
  given timezone (so 9:30am is 570). `timezone` must be a valid IANA name such as
  America/Chicago. Optional: `social_account_id` restricts the slot to one connection
  (omit or null for all accounts), `label` (trimmed to 100 chars), `is_active`.
- `social_schedule_slot_list` - the account's slots. A slot with `social_account_id`
  null applies to every connection; one with it set applies only to that connection.
  Slots describe WHEN the account wants to post; they do not schedule anything.
- `social_schedule_slot_next_open({ count, social_account_ids })` - the next OPEN slot
  occurrences over a 14-day horizon: defined slots with no post already scheduled into
  them. Call this before scheduling instead of picking a time and hoping it is free.
  An empty list when no slots are defined is not an error - it means schedule by hand.
  `count` is 1-100, default 5; `social_account_ids` is a comma-separated string of
  connection UUIDs.
- `social_schedule_slot_update({ slot_id, ... })` - only supplied fields change;
  setting `social_account_id` to null widens the slot back to every connection.
  `social_schedule_slot_delete({ slot_id })` - posts already scheduled at that time
  KEEP their `scheduled_at` and still publish; deleting a slot only stops it being
  offered in future. To stop a post, unschedule the post.

Seed the slot times from `social_analytics_best_times` - suggested posting times
computed from THIS account's own engagement history, returned as concrete future
timestamps ready to pass as `scheduled_at`. An empty list on a new account or one with
too few samples is the honest answer, not a failure, and means schedule by the
calendar instead. Never substitute a generic best-times chart for the account's own
history.

## Creating a post - every field trap

- `social_create_post({ title, content, content_type, target_platforms, target_accounts,
  media_urls, tags, category, pillar_id })`. Required: `content` and
  `target_platforms`. Confirm the copy with the user before creating when it is
  client-facing. The schema also advertises `ai_generated`, and the create route never
  reads it - it hardcodes the flag itself. Passing it is a silent no-op, so leave it out.
- ALWAYS pass `target_accounts` as well - the connected-account row ids from
  `social_list_accounts`. It is not required by the tool and defaults to `[]`, and the
  publish path hard-fails a post with none: 400 "Post has no target accounts
  configured". A post with platforms but no accounts is a dead post that only fails
  AFTER the client approved it.
- OMIT `scheduled_at` on the draft. A create with `scheduled_at` is not a proposal, it
  is a scheduled publish (see Path A below). Add the time later with
  `social_update_post` once the slot is signed off.
- ONE POST PER PLATFORM. `social_create_post` takes a single `content` string applied to
  every entry in `target_platforms`, and per-platform copy (`platform_overrides`) is not
  in the tool's schema - the proxy drops undeclared args on mutating calls, so passing
  it silently does nothing. The only way to ship tuned copy is a separate post per
  platform: one-element `target_platforms`, its own `target_accounts`, its own tuned
  `content`, and all of them pointed at the same calendar event via `linked_post_id`.
- `link_url`, `media_types`, `link_title`/`link_description` and `linkedin_visibility`
  are likewise not exposed on the tool. A link CTA has to live inside the `content`
  string; a post that needs a real link card is a dashboard job.
- Field limits: `title` is clamped to 255 chars and `category` to 100 - over-long values
  are silently truncated, not rejected. Write titles that survive the cut.
- For longer-form or cross-channel content that lives in the content library first,
  `content_create` then bring it into a social post. Use `content_schedule` when the
  content workflow owns the timing.

## Revising a post - what update can and cannot do

Review and revise drafts with `social_get_post` and `social_update_post` before
anything is scheduled or published. Three limits on that revise loop:
- `social_update_post` can only change FOUR things: `title`, `content`,
  `target_platforms`, and `scheduled_at`. That is its entire schema.
  `target_accounts`, `media_urls`, `media_types`, `tags`, `category`, `pillar_id`,
  `content_type` and `platform_overrides` are NOT on it, so the proxy drops them and
  the call returns 200 having changed nothing. Get all of those right on
  `social_create_post`; if one is wrong, the fix is a new post (or the dashboard), not
  an update.
- `social_update_post` CANNOT change status or approval state, and `status` /
  `approval_status` are no longer even advertised on its schema - they were removed
  rather than implemented, because a caller setting `approval_status: 'approved'` was
  once told it worked while the post stayed held. Passing either now is an undeclared
  arg the proxy silently drops. Never use them to approve a post or to force a state;
  approval is dashboard-only (see the approval queue below).
- A post at status 'publishing' or 'published' is EDIT-LOCKED: any update is a 400
  "Cannot modify a published post" / "Cannot modify a publishing post". It has already
  been handed to the platform. To revise, create a new post with `social_create_post`
  or duplicate it in the dashboard - there is no duplicate tool in this lane.

## Path A - the schedule (the one that actually ships content)

This path needs no approval anywhere:
- Set the time with `social_update_post({ post_id, scheduled_at })`. A clean draft moves
  to status 'scheduled'. Two posts do NOT, and both are silent:
  - A post already HELD for approval (status 'pending_approval' OR
    `approval_status: 'pending'`) keeps its status. The timestamp updates so the approver
    sees the new slot, but the post is still held and the cron will not touch it. Setting
    a time does not release it.
  - A REJECTED post (`approval_status: 'rejected'`) is sent straight back through
    approval: the service writes status 'pending_approval' and `approval_status:
    'pending'`. Re-scheduling a rejected post re-stages it into the queue, it does not
    schedule it. Say that, do not report it as scheduled.
  The publish cron runs every minute and takes every post with
  status 'scheduled' and `scheduled_at <= now` whose `approval_status` is not 'pending'
  or 'rejected'. The column defaults to 'not_required', which passes. So a schedule IS
  an unattended publish - treat setting `scheduled_at` with the same confirm you would
  give a publish, and never batch it across a week of drafts in one action.
- `scheduled_at` must be in the FUTURE on create: a past timestamp is a 400
  ("scheduledAt must be in the future"). On update the check only runs when you MOVE the
  schedule, so an already-overdue post can be edited and left overdue. Schedule in the
  account's own timezone; a timezone slip is a rejected create at best and a same-minute
  publish at worst.
- Before picking a time, check `social_schedule_slot_next_open` so two posts do not
  collide in one slot, and prefer a slot over a hand-picked timestamp.
- Scheduling is reversible until it fires - you can still edit the post or move the
  time. After it fires the post is edit-locked.

## Path B - `social_publish_post` (a governance gate, not a publish button)

- `social_publish_post({ post_id })` has three outcomes, and you must read the response
  body to know which one you got:
  - `approval_status` is 'approved' -> it publishes to the post's configured target
    accounts. This is the only outcome that puts a post live.
  - `approval_status` is 'not_required' (the default on everything you create) -> it
    does NOT publish. It writes `{ approval_status: 'pending', status: 'pending_approval' }`
    and returns HTTP 200 with `{ pending_approval: true, message: 'Post moved to the
    approval queue...' }`. Report that as "queued for approval in the dashboard". Never
    report it as published.
  - `approval_status` is 'pending' -> 400 "Post requires approval before publishing".
    'rejected' -> 400 "Post was rejected and cannot be published".
- NEVER call `social_publish_post` on a post that already has a `scheduled_at`. If it is
  unapproved, staging it moves it out of status 'scheduled' and the cron can no longer
  ship it - the post silently loses its slot until a human acts. If it IS approved and
  the schedule is still in the future, the call is refused with a 409 saying the post
  will publish automatically at that time. Either way the call only does harm.
- You cannot publish to a subset. The `platforms` arg is deprecated and ignored; the
  route always publishes to ALL of the post's `target_accounts`, and a post with none is
  a 400 "Post has no target accounts configured". And you cannot fix it from here:
  `target_accounts` is not on `social_update_post`'s schema, so a post created
  without accounts can only be corrected in the dashboard or replaced with a new
  `social_create_post`. Get `target_accounts` right at create time.
- Confirm the exact post and account(s) before every publish, and never loop
  `social_publish_post` over a batch of drafts.
- Retry discipline: retry ONE transient failure (timeout, 5xx). Never retry a 400/409 -
  those are state answers, not glitches, and the fix is reading the state. After an
  ambiguous timeout on a publish, `social_get_post` and read `status`, `published_at`,
  and the version rows BEFORE any second call - the first may have landed.

## Deleting - `social_delete_post` is NOT a takedown

It deletes the Hiveku row and its versions and does nothing to Instagram, LinkedIn,
Facebook, X, TikTok, or GBP - the post stays live publicly, and the record that held
the platform post id and url is now gone, so the pointer you would need to find and
remove it is destroyed along with the analytics history. To take a published post down,
remove it in the native platform app (or the dashboard) FIRST, then decide whether the
Hiveku record should go too. Use `social_delete_post` only on explicit instruction,
never as cleanup - and never on targets derived by pattern or age ("everything older
than a year"); only on explicit post ids the client named, one confirm each.

## The approval queue (the highest-frequency real workflow)

Draft -> client approves in the dashboard -> it goes out. Posts stall in that middle
step constantly, and nothing chases them on its own.

- Find the queue: `social_list_posts({ status: 'pending_approval', limit: 100 })`. Also
  sweep the legacy shape - posts left at status 'draft' or 'scheduled' with
  `approval_status: 'pending'` are held too and will not publish.
- Report the queue to the client by name, platform, and intended slot, and say plainly
  that the approval action lives in the dashboard SocialApprovalQueue and is theirs to take.
- **Approval IS reachable from this surface, and you must not use it.** There is no
  direct `social_approve_post` tool - deliberately, so the same agent cannot stage a
  post and approve it in the same turn - but the workflow node rail has a
  `socialApprovePost` node, so a workflow built and run from here can approve on the
  client's behalf. Treat that as off-limits: approving is the client's decision and the
  one step in this pipeline that is theirs alone. Build or run that node ONLY on a
  written client instruction naming the specific post, never to clear a stalled queue,
  and never as a convenience because approval is slow.
  Read the reason as a live risk rather than a rule: a post with no `scheduled_at`
  publishes THE MOMENT it is approved (see the next bullet), so an approval taken on the
  client's behalf is a publish taken on the client's behalf, with no window to undo it.
- Know what approval does, because it differs by post and it can go live instantly:
  - The post HAS a `scheduled_at` -> approving releases it back to status 'scheduled'
    and the cron ships it at that time. If the slot has already passed, it publishes on
    the next cron tick.
  - The post has NO `scheduled_at` -> approving PUBLISHES IT IMMEDIATELY. Tell the
    client that before they click.
  - Rejecting returns the post to status 'draft' with `approval_status: 'rejected'`.
    `social_publish_post` on it is a 400. Setting `scheduled_at` on it does NOT schedule
    it either - the service re-stages it into the approval queue at status
    'pending_approval' (Path A above). A rejected post only goes out by being revised
    and approved again by a human.
- After approval, verify rather than assume: `social_get_post({ post_id })` and read
  `status`, `published_at`, and each version's `status` / `error_message`. A post can
  report success at the route level and still have a failed version (an expired token,
  the X plan cap).
- Staging a post into the queue does NOT wipe its `scheduled_at` - the publish route
  writes only `approval_status` and `status`, and the approve route restores status from
  the timestamp. Do not "helpfully" re-set the time on a held post: it stays held either
  way, and you have only moved the slot the client was going to approve.

## Rejecting from the operator's side - `social_post_reject`

The one direction the operator CAN move a held post is backwards. When a factual error,
a wrong asset, or an off-brand claim is found in a post sitting in the approval queue,
do not just chase the client - a post with no `scheduled_at` is one client click from
an instant publish. Pull it:
- `social_post_reject({ post_id, reason })` rejects a post that is HELD for approval:
  it returns the post to draft with `approval_status: 'rejected'` and records the
  reason, which is stored and shown to the author. Safe and reversible - the post can
  be edited and staged again.
- It fails with 404 if the post is not currently awaiting approval, and 409 if someone
  approved it first. A 409 means the post may already be live or scheduled - go
  straight to `social_get_post` and check, then handle it as a takedown conversation if
  it shipped.
- There is deliberately no matching approve tool: releasing a held post is a human
  decision, made in the dashboard approval queue. Reject moves posts backwards only.
- Always write a real `reason` - it is the note the author reads - and tell the client
  what you pulled and why.

## The emergency brake (crisis hold)

When a client says "stop everything" (a PR incident, a death, a breaking story that
makes the queue tone-deaf), there is no single pause switch. The procedure:
1. Get the instruction in writing (who authorized the hold, and until when), and record
   it with `memory_create` plus a `pm_tasks_create` to lift the hold later.
2. List what will fire: `social_list_posts({ status: 'scheduled', limit: 100 })`. These
   are the live risk - the cron ships them minute by minute.
3. Per post, move `scheduled_at` to a far-future timestamp with `social_update_post` -
   one post at a time, confirmed. Moving the time is the verified brake; whether
   passing a null `scheduled_at` reverts a post to draft is NOT verified from this
   surface, so do not rely on clearing it - unschedule outright in the dashboard if
   draft status is required.
4. Posts at 'pending_approval' are already inert, but tell the client NOT to approve
   during the hold - approval of an unscheduled post publishes instantly.
5. Slots need no touching - slots schedule nothing themselves.
6. A post at 'publishing' or 'published' is already out; that is a platform-side
   takedown conversation, not a hold.

## Pitfalls specific to this rail

- Setting `scheduled_at` IS publishing. The every-minute cron ships any post at status
  'scheduled' whose `approval_status` is not 'pending' or 'rejected', and the default
  'not_required' passes. There is no "propose a time" state. Confirm a schedule with the
  same seriousness as a publish, and never batch one across a week of drafts.
- `social_publish_post` on an unapproved post does NOT publish. It returns HTTP 200 with
  `pending_approval: true` and stages the post into the dashboard approval queue. Read
  the response body and report "queued for approval", never "published".
- No tool here can APPROVE a post; `social_post_reject` can only move a held post back
  to draft. Approval is a human action in the dashboard SocialApprovalQueue.
- A post at status 'publishing' or 'published' cannot be edited at all -
  `social_update_post` is a 400. There is no duplicate tool; recreate it or duplicate
  in the dashboard.
- A post created with `target_platforms` but no `target_accounts` cannot publish - 400
  "Post has no target accounts configured", discovered only at publish time, after the
  client approved it. Always pass both.
