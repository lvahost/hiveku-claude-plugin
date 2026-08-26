---
name: hiveku-social-agency
description: Full organic social media agency methodology for operating a Hiveku account. Use for ANY organic social work - content calendars and scheduling, content pillars and post ideation, writing and drafting posts, captions and hooks, hashtag strategy and research, multi-platform publishing across Meta and Instagram and Facebook and LinkedIn and X and TikTok and Google Business Profile posts, post images and creative and carousels, comment monitoring and engagement, social analytics and reach and engagement rate and follower growth, and weekly checkups or monthly social media reports and deliverables.
---

# Hiveku Social Media Agency Operating System

Operate the account like a retainer agency charging thousands per month: baseline once,
set strategy, run execution plays on a weekly cadence, ship a monthly report the client
would pay for. This is organic social - posting and engaging across every connected
platform (Meta/Facebook, Instagram, LinkedIn, X, TikTok, and Google Business Profile
posts). Paid social lives in the PPC discipline, not here. Every tool named below is a
real Hiveku MCP tool.

## Operating principles
- `account_context_get({ domain: 'social' })` FIRST - before any calendar, plan, or
  caption. It returns persona, brand voice, avatars, domain memory, skills, and rules.
  Re-read its instructions field before every generative call. A post written without
  brand voice is a post you will rewrite.
- Hiveku is the source of truth. Durable findings (agreed pillars, posting cadence,
  hashtag sets, winning formats, competitor set, decisions) -> `memory_create`. Work
  items -> `pm_tasks_create` / `pm_tasks_complete`. Content pillars (with their
  `target_percentage` and `target_posts_per_week`) -> `social_pillar_create`. Each
  planned slot -> one `social_calendar_create` event.
- Confirm before writes. Summarize what you are about to draft, schedule, publish, or
  delete and get a yes first. SCHEDULING IS PUBLISHING ON A TIMER: `social_create_post`
  with a `scheduled_at` is written as status 'scheduled', and the every-minute cron
  publishes every scheduled post whose `approval_status` is not 'pending' or 'rejected'.
  That column defaults to 'not_required', which the cron reads as a green light - so a
  "proposed" schedule goes live on the client's public profiles with no human in the
  loop. To stage without shipping, create the post with NO `scheduled_at` (it lands as
  status 'draft') and add the time with `social_update_post` only after the client signs
  off. `social_publish_post` runs the other way: on an unapproved post it does NOT
  publish, it stages the post into the dashboard approval queue (Play 7). Never
  bulk-schedule or bulk-publish a week of content in one action - each post is a
  separate confirm.
- `hiveku-data/social/*.json` (accounts, posts, calendar, pillars, hashtags,
  analytics) is the local snapshot - read it for orientation, brand voice recall, and
  cheap counts, but use live tools for anything current or decision-grade (a post's
  live status, today's engagement, whether an account is still connected).
- Generative or strategic output (captions, hooks, carousel copy, campaign concepts,
  the pillar strategy itself) -> `talk_to_department({ domain: 'social', message })`
  (`social` is a valid domain for both `account_context_get` and `talk_to_department`),
  which runs the social agent with full brand hydration. Then persist the chosen output
  with the matching direct tool (`social_create_post`, `content_create`,
  `social_pillar_create`). Pure reads and CRUD (status, lists, scheduling a
  pre-approved draft) -> direct tools.
- Every post tool is account-scoped. `social_list_accounts` gives you the connected
  platforms and their account ids. A post targets one or more of those accounts; if the
  platform the client wants is not in the list it is not connected - raise that as a
  task, do not pretend to post to it. Presence is not health: each row also carries
  `is_active`, `connection_status`, `last_error`, `last_sync_at`, and the per-capability
  flags `can_post`, `can_read_analytics`, `can_manage_comments`. Read those, not just the
  platform name.
- The only platform slugs the publisher accepts are `linkedin`, `twitter`, `facebook`,
  `instagram`, `tiktok`, and `google_business_profile`. X is `twitter`, and Google
  Business Profile is `google_business_profile` - not `x`, not `gbp`,
  not `google_my_business`. A slug outside that set resolves to no publisher.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising a calendar)
1. Context: `account_context_get({ domain: 'social' })` for persona, brand voice, and
   avatars, then `get_account_info` to confirm the account, then
   `social_list_accounts` -> which platforms are connected, their row ids, and their
   health. Record per account: `is_active`, `connection_status`, `can_post`,
   `can_read_analytics`, `last_error`, `last_sync_at`, `follower_count`. A row that is
   present but has `can_post: false`, `is_active: false`, or a non-connected
   `connection_status` is a silent publish failure waiting to happen - the cron will
   try, the version row will land 'failed', and nothing surfaces in the agent's view.
   Missing or broken platforms cap what you can honestly deliver - flag them first as
   tasks.
2. Current state: `social_list_posts({ limit: 100 })` to see what has been posted and
   what is already scheduled or drafted. Read the last 60-90 days to learn the account's
   real voice, cadence, and format mix before you impose a new one.
3. Baseline performance per platform: `social_account_analytics({ social_account_id,
   from_date, to_date, limit })` - ONE call per connected account. The required arg is
   `social_account_id` (the connected-account row id from `social_list_accounts`, not
   the Hiveku account id and not the platform's own account id); omitting it is a 400
   `social_account_id is required`. It returns daily rows (followers, reach, avg
   engagement rate), newest day first, limit max 100 / default 30 - so a 90-day baseline
   needs `limit: 100` or paging. Empty rows mean the account-analytics sync has not run
   for that account yet; say so rather than reporting zeros as a result.
   Then `social_analytics_summary` for the blended topline. Know its window: the route
   reads only a `period` param the tool cannot send, so it ALWAYS returns the trailing
   7 days plus a comparison against the 7 before it. `from_date`/`to_date` on that tool
   are accepted and ignored. Use it for a week; never label its numbers as a month.
   This is the "where we started" row every monthly report measures against.
4. What already worked: `social_post_analytics` on the top handful of existing posts -
   that is the only per-post metric source, and it is one post per call.
   `social_analytics_timeseries` is a weak fourth: the tool exposes only `days`, the
   route never reads it, so it returns a FIXED trailing 30-day window no matter what you
   pass, and it can 404 or come back empty until analytics sync is enabled for the
   account. Do not plan a longer baseline window around it. The account's own past
   winners are the strongest evidence for the pillar and format mix you propose - lead
   the strategy with them, not with generic best practice.
5. Existing structure: `social_pillar_list`, `social_calendar_list`, and
   `social_hashtags_list` - inherit and refine what exists rather than duplicating it.
   A second calendar or a rival pillar set fragments the whole program.
6. Record the baseline: write headline facts to `memory_create` - connected platforms
   and account ids, follower counts per platform, current cadence, engagement-rate
   baseline, top-performing formats, brand voice notes, any platforms the client wants
   but has not connected. This is what the next session reads instead of re-deriving.

### Strategy (weeks 2-3)
Build the pillar system (Play 1), set cadence per platform, design the calendar
structure. Output: a content strategy the client signs off on - the pillars and their
target ratio, how many posts per week per platform, the format mix, the hashtag
approach, and a first month of concrete post concepts mapped to pillars. Persist pillars
with `social_pillar_create` (targets included - Play 1), one `social_calendar_create`
event per planned slot (Play 2), then `memory_create` the decisions and
`pm_tasks_create` the first month of production work.

### Execution -> cadence
Run the plays below as tasks. The weekly cadence keeps the account alive and engaged;
the monthly report proves the reach and growth. Never let a week pass without something
publishing - a quiet feed reads as a dead business.

## Play 1 - Content pillars and strategy (the foundation)
Pillars are the fixed set of themes every post ladders up to. They keep the feed
coherent, stop the account from becoming all-promotion, and make ideation fast because
you are filling buckets, not inventing from scratch.

Design the system:
- Generate the pillar set with `talk_to_department({ domain: 'social', message })` -
  feed it the brand voice, the avatars, the business goals, and the past winners from
  the baseline. Ask for four to six pillars with a one-line intent and example post
  types each. Fewer than four is thin; more than six is unfocused.
- A durable starting frame most B2B and local service accounts map onto: Educate (teach
  the avatar something useful), Authority (proof, results, credentials, behind-the-work),
  Connection (team, values, story, community), and Promotion (offers, launches, direct
  asks). Adapt names and add pillars to the brand - do not force a generic set.
- Persist each agreed pillar with the FULL structure, not just a name:
  `social_pillar_create({ name, description, target_percentage, target_posts_per_week,
  hashtags, example_topics, content_guidelines, auto_tags, color, icon })`. Only `name`
  is required. `target_percentage` (default 20) and `target_posts_per_week` (default 1)
  are the ratio and cadence as first-class fields - put the agreed numbers THERE, not in
  a free-text memory note, or nothing can check delivery against them later. Review and
  prune with `social_pillar_list`, `social_pillar_update`, `social_pillar_delete`.
  `social_pillar_delete` unlinks its posts (`pillar_id` set to null) rather than
  deleting them, so pruning a pillar is safe.
- Set the ratio in `target_percentage` on each pillar and record the reasoning in
  memory. A healthy default is roughly 80/20 value to promotion - about Educate 40,
  Authority 25, Connection 20, Promotion 15 percent of posts. A feed that is mostly
  Promotion trains the audience to scroll past.
- `social_pillar_list` returns a per-pillar post count, but it is LIFETIME, not
  windowed. For "did we hit the ratio this month" use `social_list_posts({ pillar_id,
  status: 'published', from_date, to_date })` per pillar and read `pagination.total`.
  Note `from_date`/`to_date` on `social_list_posts` filter `created_at`, NOT
  `published_at` - close enough for a month you produced in that month, wrong for
  anything drafted long before it shipped. Say which you used.

Set cadence per platform (record it as a decision):
- LinkedIn and Instagram feed: three to five posts per week is a strong retainer cadence.
- X (slug `twitter`): higher volume tolerated, five to fifteen posts per week, more
  conversational. HARD LIMIT: X is the one platform whose API bills Hiveku per post, so
  it is gated to the Premium plan and capped at 60 successfully-published posts per
  account per calendar month (resets on the 1st, UTC). Over the cap or off Premium, the
  X version of the post lands 'failed' with the reason on the version row while the
  other platforms on the same post still publish. Fifteen a week IS the cap - plan
  around 12-14 and check `social_get_post` versions for X failures.
- TikTok and Reels: two to four per week; consistency beats volume, but the algorithm
  rewards frequency more than the feed platforms do.
- Facebook: three to five per week, often the same asset as Instagram with copy tuned.
- Google Business Profile posts: one to two per week keeps the listing fresh and is a
  local-SEO signal - short, offer-or-update oriented, always with a call to action.
  There is NO direct GBP-post tool in the SEO lane. GBP What's New / offer / event posts
  are published through this lane: `social_create_post` with
  `target_platforms: ['google_business_profile']` and the GBP connected-account id in
  `target_accounts`. They run the same approval gate as everything else.

Persist the strategy decisions with `memory_create` (type 'strategy') so cadence and
ratio are not re-litigated every month.

## Play 2 - The content calendar (the production engine)
The calendar is where strategy becomes a shippable schedule. It answers "what is going
out, where, and when" - and it is a stream of events you add to every week, not a
container you build once.

- There is no calendar OBJECT to create and fill. The calendar IS its events: one
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
- Read with `social_calendar_list({ from_date, to_date, event_type, status, page,
  limit })` - limit max 100, default 50, ordered by start date. Adjust with
  `social_calendar_update({ event_id, ... })`; remove a slot with
  `social_calendar_delete({ event_id })`. Deleting an event does not touch the linked
  post; deleting a post leaves its event behind with `linked_post_id` set to null. Keep
  the two in sync yourself.
- Plan a week or a month at a time against the pillar ratio: lay out the slots (platform
  x day x pillar), then fill each slot with a concept. Batch planning beats
  post-by-post improvisation - it is what keeps the ratio honest and prevents three
  Promotion posts landing in the same week.
- Theme days give the calendar rhythm and make ideation trivial - a fixed weekly slot
  per recurring format (for example a Monday tip, a midweek proof/case, a Friday
  team/story). Recurrence is an UPDATE-only capability: create the event, then
  `social_calendar_update({ event_id, is_recurring: true, recurrence_rule, start_time,
  timezone })`. There are no recurrence fields on create. Record the theme-day map in
  memory once agreed.
- Every calendar slot should carry: the platform(s), the pillar, the format (single
  image, carousel, video/Reel, text, GBP update), the hook or angle, and the CTA.
  A slot without a hook is a slot you will stare at on production day.
- Leave deliberate gaps for reactive and timely posts - news, trends, customer moments.
  A calendar filled 100 percent leaves no room to be human.

## Play 3 - Ideation and drafting (turning slots into posts)
This is the daily craft. Work slot -> concept -> draft -> approved -> scheduled.

Ideate against the pillar and the evidence:
- Pull the account's own winners first: `social_post_analytics` on top past posts and
  `social_analytics_summary` to see which formats and pillars actually earn engagement
  on THIS account. Repeat what works before importing outside ideas.
- Generate concepts and copy with `talk_to_department({ domain: 'social', message })` -
  give it the pillar, the format, the platform, the hook direction, and the CTA from the
  calendar slot. Ask for platform-native copy, not one caption reused everywhere:
  LinkedIn wants a strong first line and a professional register; X wants a tight hook
  and a punchline; Instagram wants a scroll-stopping first line and line breaks; TikTok
  wants a spoken hook in the first two seconds; GBP wants a short update with an explicit
  action. The department agent has the brand voice loaded - use it rather than writing
  cold.

Draft the copy hook to CTA:
- The first line does all the work - it is the only line most of the audience reads
  before deciding to stop. Lead with the hook, never with a warm-up.
- One idea per post. A post trying to say three things says none.
- End with one clear CTA matched to the pillar (comment, save, share, click, book,
  call). Value posts can ask for a save or a comment; only Promotion posts ask for the
  sale.
- Match the platform's caption length and formatting norms - long-form storytelling on
  LinkedIn, tight on X, scannable with line breaks on Instagram.

Persist the draft:
- `social_create_post({ title, content, content_type, target_platforms, target_accounts,
  media_urls, tags, category, pillar_id, ai_generated })`. Required: `content` and
  `target_platforms`. Confirm the copy with the user before creating when it is
  client-facing.
- ALWAYS pass `target_accounts` as well - the connected-account row ids from
  `social_list_accounts`. It is not required by the tool and defaults to `[]`, and the
  publish path hard-fails a post with none: 400 "Post has no target accounts
  configured". A post with platforms but no accounts is a dead post that only fails
  AFTER the client approved it.
- OMIT `scheduled_at` here. A create with `scheduled_at` is not a proposal, it is a
  scheduled publish (see Operating principles and Play 7). Add the time later with
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
- Review and revise drafts with `social_get_post` and `social_update_post` before
  anything is scheduled or published. Two limits on that revise loop:
  - `social_update_post` advertises `status` and `approval_status` in its schema, and
    the server never reads either one. The call returns 200 and those two fields come
    back exactly as they were - a silent no-op, not an error. Never use them to approve
    a post or to force a state; approval is dashboard-only (Play 8).
  - A post at status 'publishing' or 'published' is EDIT-LOCKED: any update is a 400
    "Cannot modify a published post" / "Cannot modify a publishing post". It has already
    been handed to the platform. To
    revise, create a new post with `social_create_post` or duplicate it in the
    dashboard - there is no duplicate tool in this lane.

## Play 4 - Creative and media (the asset half of the post)
A post is copy plus creative. The creative is often what stops the scroll.

- Use existing brand assets first: `marketing_media_list`, `marketing_media_folders`,
  and `marketing_media_get` to find approved photography, logos, and prior graphics.
  Reusing on-brand assets beats generating new ones - it keeps the feed visually
  consistent and respects the brand kit.
- Generate original imagery when nothing fits: `generate_image` for a single visual and
  `generate_image_set` for a carousel or a batch of variations to choose from. Prompt
  with the brand's colors, style, and subject from `account_context_get`; generic stock
  imagery reads as generic and underperforms.
- Bring in externally sourced or client-supplied visuals with
  `marketing_media_register_external_url` so they live in the media library and can be
  attached to posts like any other asset.
- Attach the chosen media to the post via `social_create_post` / `social_update_post`.
- Platform format notes worth respecting: square or 4:5 for Instagram feed, vertical
  9:16 for Reels/TikTok/Stories, landscape or square for LinkedIn, and a clean
  landscape/square with legible text for GBP. Carousels earn saves and dwell time -
  lean on `generate_image_set` for those.
- Video has three real lanes. Pick one before spending anything:
  - MULTI-SCENE Reel/TikTok/promo: `marketing_storyboard_create` (pass exactly one of
    `template_id` + `substitutions`, or a hand-authored `storyboard`). It is FREE and
    fast - it validates, prices, and stores; nothing is billed or enqueued until a human
    approves. THE AGENT CANNOT APPROVE: after
    `marketing_storyboard_submit_for_approval({ storyboard_id })`, report scenes,
    runtime, and cost, then STOP. Do not fan out single clips to work around the gate.
    Track an approved run with `marketing_video_pipeline_status({ pipeline_id })` - same
    id as the storyboard. Full procedure with every trap: `/hiveku:media`.
  - ONE CLIP: `marketing_generate_video({ prompt, aspect_ratio })` - ~10s, 720p, PAID
    (~$1 each), Premium-plan only, 20 clips per account per month. ALWAYS call with
    `dry_run: true` first and tell the user the remaining quota before spending. Animate
    an existing still by passing it as `reference_media_asset_id`.
  - MOTION GRAPHICS (text/layout/branded cards, no generation cost): build it in Creative
    Studio and render with `design_export_mp4({ id, canvas_json, width, height,
    duration_seconds })`.
- Client-supplied or agency-produced footage still comes in through
  `marketing_media_register_external_url` - that is the import path, not the only video
  option. Never claim a clip was generated when it was not.

## Play 5 - Hashtag strategy
Hashtags widen reach on Instagram and TikTok, help discovery on LinkedIn, and matter
little on X or Facebook. Treat them as a curated, per-platform inventory grouped by
pillar, not as an afterthought typed at publish time. The tracked-hashtag records are
inventory and performance history only: nothing attaches them to a post automatically.
The tags that actually publish are the ones you write into the post's `content` string.

- The registry has no "set" object. `social_hashtags_create({ hashtag, platform,
  category, is_branded, is_favorite })` registers ONE hashtag on ONE platform, and both
  `hashtag` and `platform` are required. Build a set by looping one call per tag per
  platform, using `category` as the pillar or campaign grouping - it is the only
  set-like field. Two behaviors worth relying on: it UPSERTS on hashtag+platform (a
  re-run updates category and flags instead of duplicating, so re-running a set is
  safe), and a leading "#" is added automatically ('tag' and '#tag' are the same row).
- Audit before you prune, do not guess. `social_hashtags_list({ sort_by: 'engagement',
  limit: 100 })` ranks the account's tag inventory by earned engagement and returns
  times used, avg engagement, and avg reach per tag. Keep the top tier plus everything
  `is_branded`; delete the high-used / low-engagement tail with
  `social_hashtags_delete({ hashtag_id })`. Other sorts: `used`, `reach`, `trending`.
  Filters `is_trending` / `is_branded` / `is_favorite` take the STRING "true".
- Research the tags with `talk_to_department({ domain: 'social', message })` - ask for a
  laddered mix per pillar: a few large-reach tags, several mid-size niche tags, and a few
  small/branded tags. All-huge tags bury the post instantly; all-tiny tags reach no one.
  The niche-tier tags are where a smaller account actually gets found.
- Platform application: Instagram tolerates a fuller set placed in the caption or first
  comment; TikTok wants three to five sharp, relevant tags; LinkedIn wants three to five;
  X and Facebook want one or two at most, and only when they add meaning. Never paste the
  Instagram set onto LinkedIn.
- Include a branded hashtag on every post to build a searchable body of content over
  time. Its structural home is `social_hashtags_create({ hashtag, platform,
  is_branded: true })` per platform, not a memory note - that way
  `social_hashtags_list({ is_branded: 'true' })` answers "what is our branded tag" for
  every future session. Record the reasoning in memory as well if it is contested.

## Play 6 - Engagement and community management
Publishing is half the service. The other half is the two-way engagement that the
algorithms actually reward and that turns followers into customers.

- Monitor with two concrete calls, not one blind list:
  - `social_comments_list({ requires_response: 'true', limit: 100 })` - the response
    queue, the thing you actually work.
  - `social_comments_list({ sentiment: 'negative', limit: 100 })` - reputation risk,
    handled same-day.
  `search` does a case-insensitive contains match on comment text when you are chasing a
  specific thread, and `status` filters the triage state. The boolean filters are
  STRINGS ("true"), not booleans - same for `ai_generated` on `social_list_posts` and
  `is_active` on `social_list_accounts`. Limit is max 100 and DEFAULTS TO 30, so a bare
  call silently truncates a busy week; pass `limit: 100` and page.
- New comments in the first hour after publishing are the highest-leverage replies you
  will make; the algorithm reads early engagement as a quality signal.
- Draft replies in the brand voice with `talk_to_department({ domain: 'social',
  message })` for anything nuanced (a complaint, a sales-adjacent question, a sensitive
  topic). Straightforward thank-yous can be written directly. Confirm any reply that is
  public-facing and non-trivial before it goes out.
- Replying, liking, DMs, and outbound engagement on other accounts are done in the
  native platform apps or the Hiveku social inbox UI - there is no tool here that posts
  a comment reply. Surface the comments that need a response as tasks or handle them in
  the dashboard; do not claim to have replied from a tool that only lists comments.
- Route the signals: a lead in the comments or DMs is a CRM job (hand to the CRM/inbox
  discipline), a support question is a helpdesk job, a review mention is a reputation
  job. Social listening feeds the other departments - do not let a hot lead die in a
  comment thread.

## Play 7 - Publishing and scheduling
The moment content goes from draft to live. There are exactly two paths to a live post,
and only one of them involves `social_publish_post`. Know which one you are on.

Path A - the schedule. This is the one that actually ships content, and it needs no
approval anywhere:
- Set the time with `social_update_post({ post_id, scheduled_at })`. The post moves to
  status 'scheduled'. The publish cron runs every minute and takes every post with
  status 'scheduled' and `scheduled_at <= now` whose `approval_status` is not 'pending'
  or 'rejected'. The column defaults to 'not_required', which passes. So a schedule IS
  an unattended publish - treat setting `scheduled_at` with the same confirm you would
  give a publish, and never batch it across a week of drafts in one action.
- `scheduled_at` must be in the FUTURE on create: a past timestamp is a 400
  ("scheduledAt must be in the future"). On update the check only runs when you MOVE the
  schedule, so an already-overdue post can be edited and left overdue. Schedule in the
  account's own timezone; a timezone slip is a rejected create at best and a same-minute
  publish at worst.
- Scheduling is reversible until it fires - you can still edit the post or move the
  time. After it fires the post is edit-locked (Play 3).

Path B - `social_publish_post`. It is a governance gate, not a publish button:
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
- No tool in this lane can approve a post. The approve route exists but is deliberately
  not mapped to any MCP tool. Approval happens in the dashboard SocialApprovalQueue, by
  a human. Do not promise a client that you will approve their post.
- You cannot publish to a subset. The `platforms` arg is deprecated and ignored; the
  route always publishes to ALL of the post's `target_accounts`, and a post with none is
  a 400 "Post has no target accounts configured". Fix targeting with
  `social_update_post` before publishing, not with a publish argument.
- Confirm the exact post and account(s) before every publish, and never loop
  `social_publish_post` over a batch of drafts.
- Post one asset to several platforms only after the copy is tuned per platform - which
  in this lane means one post per platform (Play 3), because a single post carries one
  `content` string to all of its targets.
- Best-time-to-post: use the account's own `social_account_analytics` and
  `social_post_analytics` history to find when THIS audience engages, not a generic
  chart. Record the per-platform windows in memory and schedule into them.
- After a post goes live, `social_post_sync_analytics` pulls its real reach and
  engagement back from the platform so the numbers are current for the report. Live
  metrics lag the platform by minutes to hours - sync before you read, not after you
  reported.
- `social_delete_post` is NOT a takedown. It deletes the Hiveku row and its versions and
  does nothing to Instagram, LinkedIn, Facebook, X, TikTok, or GBP - the post stays live
  publicly, and the record that held the platform post id and url is now gone, so the
  pointer you would need to find and remove it is destroyed along with the analytics
  history. To take a published post down, remove it in the native platform app (or the
  dashboard) FIRST, then decide whether the Hiveku record should go too. Use
  `social_delete_post` only on explicit instruction, never as cleanup.

## Play 8 - The approval queue (the highest-frequency real workflow)
Draft -> client approves in the dashboard -> it goes out. Posts stall in that middle
step constantly, and nothing chases them on its own.

- Find the queue: `social_list_posts({ status: 'pending_approval', limit: 100 })`. Also
  sweep the legacy shape - posts left at status 'draft' or 'scheduled' with
  `approval_status: 'pending'` are held too and will not publish.
- Report the queue to the client by name, platform, and intended slot, and say plainly
  that the approval action lives in the dashboard SocialApprovalQueue and only they can
  take it. You cannot approve from any tool here.
- Know what approval does, because it differs by post and it can go live instantly:
  - The post HAS a `scheduled_at` -> approving releases it back to status 'scheduled'
    and the cron ships it at that time. If the slot has already passed, it publishes on
    the next cron tick.
  - The post has NO `scheduled_at` -> approving PUBLISHES IT IMMEDIATELY. Tell the
    client that before they click.
  - Rejecting returns the post to status 'draft' with `approval_status: 'rejected'`.
    A rejected post cannot be published or scheduled out until it is revised and
    re-staged - `social_publish_post` on it is a 400.
- After approval, verify rather than assume: `social_get_post({ post_id })` and read
  `status`, `published_at`, and each version's `status` / `error_message`. A post can
  report success at the route level and still have a failed version (an expired token,
  the X plan cap).
- A post staged into the queue by a publish attempt has LOST its schedule. If the client
  approves it late and it had a slot, re-set `scheduled_at` yourself.

## Weekly cadence (every week, the heartbeat of the retainer)
1. Fill and confirm next week's calendar: check `social_calendar_list` and
   `social_list_posts` for gaps against the pillar ratio, ideate the empty slots
   (Play 3), draft, and schedule. Aim to be one full week ahead at all times.
2. Engagement pass, ideally daily but no less than three times a week:
   `social_comments_list` across recent posts, reply to what needs replying (Play 6),
   flag leads and support issues to the right department.
3. Performance check: `social_post_sync_analytics({ post_id })` on each of the week's
   posts FIRST so the numbers are fresh, then `social_analytics_summary` - its fixed
   trailing-7-day window is exactly the weekly view, and it also hands back
   `changes` versus the prior week and a `best_post` / `worst_post`. For per-post
   detail use `social_post_analytics({ post_id })`, one post per call. Feed the winners
   back into next week's ideation.
4. Account health, two parts:
   - `social_list_accounts` and read `connection_status`, `is_active`, `can_post`, and
     `last_error` per account. A connected-but-erroring account is a silent publish
     failure - the cron will try, the version row lands 'failed', and nothing tells you.
     Check this BEFORE scheduling a week, and raise a reconnect task the same day.
   - `social_account_analytics({ social_account_id, from_date, to_date })` per connected
     account for follower movement and reach trend. A sudden reach drop is investigated
     the same week (posting gap, format change, a flagged post), not at month end.
5. Approval sweep: `social_list_posts({ status: 'pending_approval', limit: 100 })` -
   anything sitting in the queue is content the client is paying for that is not
   shipping. Chase it (Play 8).
6. Pipeline: review the production board against the month's milestones
   (`pm_milestones_list`) - what is drafted, scheduled, published, blocked. Update
   statuses honestly with `pm_tasks_update`; a stalled approval is escalated, not
   silently left.
7. Anomaly rule: any post more than 2-3x the account's normal engagement is studied and
   its format banked as a repeatable play; any week with zero posts published on a
   connected platform is a service failure - never let it happen quietly.

## Monthly report (the artifact the retainer pays for)
The report proves reach, growth, and engagement, and shows the client where the money
went. Build it from named tool calls only - every number must be reproducible.

1. Gather the month's data, in this order, and know what each call can and cannot give
   you - there is no single tool that returns "the month":
   - `social_post_sync_analytics({ post_id })` on every post in the month, first. Nothing
     downstream is current until this runs.
   - `social_account_analytics({ social_account_id, from_date, to_date, limit: 100 })`
     once PER connected account. This is the month's real per-platform series (daily
     followers, reach, avg engagement rate) and the only source of follower growth over
     an arbitrary window. Empty rows mean the sync has not run - report that, do not
     report zero.
   - `social_post_analytics({ post_id })` on the top posts, one call each. This is the
     only per-post metric source: impressions, reach, engagements, likes, comments,
     shares, saves, clicks, video views, engagement rate, plus the per-platform version
     breakdown with each version's platform URL.
   - `social_list_posts({ status: 'published', from_date, to_date, limit: 100 })` for the
     DELIVERY count only. It returns no metrics at all - id, title, content, platforms,
     accounts, status, approval_status, pillar and so on. Its date filter is on
     `created_at`, not `published_at`.
   - `social_analytics_summary` gives the trailing 7 DAYS only (the route reads a
     `period` param the tool cannot send; `from_date`/`to_date` are ignored). Use it as
     the closing-week snapshot, never as the month's topline. Its `accounts` array is a
     good current follower-count-per-platform read, and its `engagement_rate` is
     engagements over impressions - say which denominator you are quoting.
   - `social_analytics_timeseries` returns a fixed trailing 30-day window regardless of
     any argument, and can 404 or come back empty. If it is empty, build the trend from
     the `social_account_analytics` daily rows instead and say the blended series was
     unavailable. Never leave a hole or invent the line.
2. Report sections, in this order:
   - Executive summary - five bullets max: headline metric (reach or follower growth),
     the single best post and why, biggest learning, what we shipped, what is next.
     Written last, placed first.
   - Growth and reach - followers gained per platform MoM and the reach/impressions
     trend, both built from the `social_account_analytics` daily rows per account
     (first row of the month versus last). Show the direction, not just a snapshot.
     `social_analytics_timeseries` is a nice-to-have overlay when it returns data.
   - Top content - the three to five best posts by engagement (`social_post_analytics`),
     each with the pillar, format, and the reason it worked. This is where you prove the
     strategy, not just the activity.
   - Pillar and cadence delivery - posts published per platform vs the committed cadence
     (`social_list_posts({ status: 'published', platform, from_date, to_date })`, read
     `pagination.total`), and the actual pillar ratio vs target: one
     `social_list_posts({ pillar_id, status: 'published', from_date, to_date })` per
     pillar, compared against that pillar's `target_percentage` and
     `target_posts_per_week` from `social_pillar_list`. Do not use the pillar's own post
     count for this - it is lifetime, not the month. Honesty here builds trust.
   - Approval queue - anything still at status 'pending_approval' at month end, named,
     with how long it has waited. Unshipped approved-pending content is the single most
     common reason a month underdelivers, and it is the client's action, not yours.
   - Engagement and community - comments handled, notable conversations, leads or
     support issues routed to other departments.
   - Next month plan - the calendar theme, any campaign, the format experiments queued.
   - Local clients: a Google Business Profile line - posts published
     (`social_list_posts({ platform: 'google_business_profile', status: 'published',
     from_date, to_date })`). Listing-side signals (views, calls, direction requests)
     come from the SEO lane's GBP tools, not from these; if that connection is not
     available, say the listing engagement was not measured rather than implying zero.
3. Persist the report as a deliverable so the client can read it: capture it with
   `content_create` (or the account's reporting surface) and log the delivery decision
   with `memory_create`. Reflect completed production against `pm_tasks_complete`.
4. Numbers must reconcile: every figure in the narrative traces to a specific tool call.
   No vibes, no rounding a flat month up into a win.

## Benchmarks and decision rules
- Engagement-rate reality (for orientation, never a promise). Name the denominator every
  time: `social_analytics_summary` computes `engagement_rate` as engagements over
  IMPRESSIONS, while `social_account_analytics` rows carry `avg_engagement_rate` from
  the platform's own daily sync. They are not the same number and must never be mixed in
  one trend line. Organic feed engagement in the low single digits is normal and healthy;
  1 percent-plus on a sizeable Instagram or LinkedIn account is solid; anything much
  higher usually means a small account or a genuinely strong post. Judge every account
  against ITS OWN baseline from month 1, not against a global average.
- The 80/20 value-to-promotion ratio is the load-bearing rule. Audiences follow for
  value and tune out promotion; earn attention with the 80 so the 20 lands. If the
  calendar tilts toward Promotion, the whole account decays - rebalance before adding
  reach tactics.
- Consistency beats volume beats perfection. A reliable three-a-week that never misses
  outperforms a burst of ten followed by silence. Protect the cadence first, raise
  volume second, chase the perfect post never.
- Platform-native always. The same idea, re-cut and re-captioned per platform, beats one
  asset cross-posted verbatim on every metric. Budget the extra ten minutes per platform.
- Hooks win or lose the post in the first line and first two seconds. If engagement is
  soft, fix hooks before anything else - format, hashtags, and timing are all downstream
  of whether anyone stopped scrolling.
- Format follows the platform's current preference: video and carousels are earning
  outsized reach on the feed platforms; short vertical video carries TikTok and Reels.
  Weight the calendar toward what the account's own `social_post_analytics` shows is
  working now, and re-check monthly - the platforms shift.
- Growth timeline: organic social compounds slowly. Meaningful follower and reach growth
  shows over three to six months of consistent posting plus engagement, not in weeks.
  Put that window in the plan so the report never has to apologize for a patient month.

## Pitfalls (publish, platform, and data traps)
- Setting `scheduled_at` IS publishing. The every-minute cron ships any post at status
  'scheduled' whose `approval_status` is not 'pending' or 'rejected', and the default
  'not_required' passes. There is no "propose a time" state. Confirm a schedule with the
  same seriousness as a publish, and never batch one across a week of drafts.
- `social_publish_post` on an unapproved post does NOT publish. It returns HTTP 200 with
  `pending_approval: true` and stages the post into the dashboard approval queue. Read
  the response body and report "queued for approval", never "published". And never call
  it on a post that already has a `scheduled_at` - staging strips it out of status
  'scheduled' so the cron can no longer ship it, and an approved future-scheduled post
  refuses the call with a 409 anyway.
- No tool here can approve or reject a post. `social_update_post` advertises `status` and
  `approval_status` and the server ignores both, returning 200 with nothing changed.
  Approval is a human action in the dashboard SocialApprovalQueue.
- A post at status 'publishing' or 'published' cannot be edited at all - `social_update_post`
  is a 400. There is no duplicate tool; recreate it or duplicate in the dashboard.
- A platform absent from `social_list_accounts` is not connected - you cannot post to
  it. But presence is not health either: check `connection_status`, `is_active`,
  `can_post`, and `last_error`. A connected-but-erroring account fails at the cron with
  nothing in your view. Do not draft into a void; raise the connection as a task and note
  it in the report so the client knows why a channel is quiet.
- A post created with `target_platforms` but no `target_accounts` cannot publish - 400
  "Post has no target accounts configured", discovered only at publish time, after the
  client approved it. Always pass both.
- Platform slugs are exact: `linkedin`, `twitter`, `facebook`, `instagram`, `tiktok`,
  `google_business_profile`. X is `twitter`. There is no `x`, `gbp`, or
  `google_my_business`.
- X posting is Premium-plan-only and capped at 60 published posts per account per
  calendar month. Over the cap, only the X version fails; the rest of a multi-platform
  post still goes out, so the failure is easy to miss. Check the version rows.
- Live analytics lag. Run `social_post_sync_analytics` before reading a post's numbers
  for a report; reach and engagement keep climbing for hours to days after publish, so a
  number pulled too early understates the post.
- Never cross-post one identical caption to every platform - it underperforms everywhere
  and reads as automated. In this lane that means one post per platform: a single post
  carries one `content` string to all of its targets, and `platform_overrides` is not on
  the tool, so passing it is silently dropped by the proxy (Play 3).
- Hashtag sets are platform-specific. The full Instagram ladder pasted onto LinkedIn or X
  looks amateur and can suppress reach. Keep and apply per-platform sets (Play 5).
- `social_delete_post` is not a takedown. It deletes the Hiveku row only; the post stays
  live on Instagram, LinkedIn, Facebook, X, TikTok or GBP, and you have just destroyed
  both the analytics history and the platform post id/url you needed to find it. When a
  client says "delete that post", remove it in the platform first. Only on explicit
  instruction, never as cleanup.
- No tool here returns per-post metrics except `social_post_analytics`, one post per
  call. `social_list_posts` returns no metrics at all. `social_analytics_summary` is
  7 days, `social_analytics_timeseries` is a fixed 30 and may be empty. If a number the
  report calls for is not obtainable from one of those, say it is unavailable and why -
  never estimate it into the deliverable.
- `hiveku-data/social/` snapshots go stale the moment the account posts or a metric
  updates - read them for orientation and voice recall, but confirm anything
  decision-grade (live status, current followers, today's engagement) with a live tool.
- Comment replies, DMs, and outbound engagement are not done from these tools -
  `social_comments_list` only reads. Handle replies in the platform apps or the Hiveku
  inbox UI and surface them as tasks; never claim to have replied from a read-only tool.
- Nothing client-visible - a published post, a deleted post, a public comment reply -
  happens without explicit confirmation. Log every material decision (pillars, cadence,
  posting windows, branded hashtag) with `memory_create` so the next session does not
  re-litigate the strategy.