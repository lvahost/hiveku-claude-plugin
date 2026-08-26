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
  items -> `pm_tasks_create` / `pm_tasks_complete`. Content pillars ->
  `social_pillar_create`. Calendar structure -> `social_calendar_create`.
- Confirm before writes. Summarize what you are about to draft, schedule, publish, or
  delete and get a yes first. Drafting and moving a scheduled post is cheap and
  reversible; `social_publish_post` pushes to a live public profile and cannot be
  un-posted. Never bulk-publish a week of content in one action - each post is a
  separate confirm.
- `hiveku-data/social/*.json` (accounts, posts, calendar, pillars, hashtags,
  analytics) is the local snapshot - read it for orientation, brand voice recall, and
  cheap counts, but use live tools for anything current or decision-grade (a post's
  live status, today's engagement, whether an account is still connected).
- Generative or strategic output (captions, hooks, carousel copy, campaign concepts,
  the pillar strategy itself) -> `talk_to_department({ domain: 'social', message })`,
  which runs the social agent with full brand hydration. Then persist the chosen output
  with the matching direct tool (`social_create_post`, `content_create`,
  `social_pillar_create`). Pure reads and CRUD (status, lists, scheduling a
  pre-approved draft) -> direct tools.
- Every post tool is account-scoped. `social_list_accounts` gives you the connected
  platforms and their account ids. A post targets one or more of those accounts; if the
  platform the client wants is not in the list it is not connected - raise that as a
  task, do not pretend to post to it.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising a calendar)
1. Context: `account_context_get({ domain: 'social' })` for persona, brand voice, and
   avatars, then `get_account_info` to confirm the account, then
   `social_list_accounts` -> which platforms are connected and their ids. Missing
   platforms cap what you can honestly deliver - flag them first as tasks.
2. Current state: `social_list_posts({ limit: 100 })` to see what has been posted and
   what is already scheduled or drafted. Read the last 60-90 days to learn the account's
   real voice, cadence, and format mix before you impose a new one.
3. Baseline performance per platform: `social_account_analytics({ account_id })` for
   each connected account (followers, reach, engagement rate, growth trend) and
   `social_analytics_summary` for the blended topline. This is the "where we started"
   row every monthly report measures against - capture it now.
4. What already worked: `social_analytics_timeseries` over the longest window
   available, and `social_post_analytics` on the top handful of existing posts. The
   account's own past winners are the strongest evidence for the pillar and format mix
   you propose - lead the strategy with them, not with generic best practice.
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
with `social_pillar_create`, the calendar shell with `social_calendar_create`, then
`memory_create` the decisions and `pm_tasks_create` the first month of production work.

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
- Persist each agreed pillar with `social_pillar_create({ name, description })`. Review
  and prune with `social_pillar_list`, `social_pillar_update`, `social_pillar_delete`.
- Set the ratio and record it in memory. A healthy default is roughly 80/20 value to
  promotion - about Educate 40, Authority 25, Connection 20, Promotion 15 percent of
  posts. A feed that is mostly Promotion trains the audience to scroll past.

Set cadence per platform (record it as a decision):
- LinkedIn and Instagram feed: three to five posts per week is a strong retainer cadence.
- X: higher volume tolerated, five to fifteen posts per week, more conversational.
- TikTok and Reels: two to four per week; consistency beats volume, but the algorithm
  rewards frequency more than the feed platforms do.
- Facebook: three to five per week, often the same asset as Instagram with copy tuned.
- Google Business Profile posts: one to two per week keeps the listing fresh and is a
  local-SEO signal - short, offer-or-update oriented, always with a call to action.

Persist the strategy decisions with `memory_create` (type 'strategy') so cadence and
ratio are not re-litigated every month.

## Play 2 - The content calendar (the production engine)
The calendar is where strategy becomes a shippable schedule. It is the single artifact
that answers "what is going out, where, and when" - build it once, fill it every week.

- Create the calendar shell with `social_calendar_create` (name it by quarter or by
  campaign). Read structure with `social_calendar_list`; adjust with
  `social_calendar_update`; retire old ones with `social_calendar_delete` rather than
  letting stale calendars accumulate.
- Plan a week or a month at a time against the pillar ratio: lay out the slots (platform
  x day x pillar), then fill each slot with a concept. Batch planning beats
  post-by-post improvisation - it is what keeps the ratio honest and prevents three
  Promotion posts landing in the same week.
- Theme days give the calendar rhythm and make ideation trivial - a fixed weekly slot
  per recurring format (for example a Monday tip, a midweek proof/case, a Friday
  team/story). Record the theme-day map in memory once agreed.
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
- `social_create_post` to create the post as a draft against its target account(s),
  with the caption, media, and pillar. Confirm the copy with the user before creating
  when it is client-facing.
- For longer-form or cross-channel content that lives in the content library first,
  `content_create` then bring it into a social post. Use `content_schedule` when the
  content workflow owns the timing.
- Review and revise drafts with `social_get_post` and `social_update_post` before
  anything is scheduled or published. Draft freely; publishing is the gate.

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
- Video generation and editing has no dedicated tool here yet - for produced video,
  source the asset (client upload or the creative team), register it with
  `marketing_media_register_external_url`, and attach it. Do not claim to have generated
  a video.

## Play 5 - Hashtag strategy
Hashtags widen reach on Instagram and TikTok, help discovery on LinkedIn, and matter
little on X or Facebook. Treat them as reusable sets per pillar, not as an afterthought
typed at publish time.

- Read existing sets with `social_hashtags_list`. Build curated sets with
  `social_hashtags_create` (one set per pillar or per campaign theme); prune dead or
  banned tags with `social_hashtags_delete`.
- Research the tags with `talk_to_department({ domain: 'social', message })` - ask for a
  laddered mix per pillar: a few large-reach tags, several mid-size niche tags, and a few
  small/branded tags. All-huge tags bury the post instantly; all-tiny tags reach no one.
  The niche-tier tags are where a smaller account actually gets found.
- Platform application: Instagram tolerates a fuller set placed in the caption or first
  comment; TikTok wants three to five sharp, relevant tags; LinkedIn wants three to five;
  X and Facebook want one or two at most, and only when they add meaning. Never paste the
  Instagram set onto LinkedIn.
- Include a branded hashtag on every post to build a searchable body of content over
  time - record it in memory so every post carries it.

## Play 6 - Engagement and community management
Publishing is half the service. The other half is the two-way engagement that the
algorithms actually reward and that turns followers into customers.

- Monitor with `social_comments_list` - review comments across posts on the cadence
  below. New comments in the first hour after publishing are the highest-leverage
  replies you will make; the algorithm reads early engagement as a quality signal.
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
The moment content goes from draft to live. Handle it deliberately - this is the
irreversible step.

- Schedule an approved draft by setting its scheduled time with `social_update_post`
  (or through `content_schedule` when the content workflow owns timing). Scheduling is
  reversible - you can still edit or move it before it fires.
- `social_publish_post` pushes a post live now (or fires a scheduled one). This is the
  irreversible action - it hits a public profile. Confirm the exact post and account(s)
  before every publish. Never loop `social_publish_post` over a week of drafts in one
  go; publish is one deliberate confirm per post.
- Post one asset to several platforms only after the copy is tuned per platform - same
  concept, different caption. A single caption blasted identically to five platforms
  reads as automated and underperforms on every one of them.
- Best-time-to-post: use the account's own `social_account_analytics` and
  `social_post_analytics` history to find when THIS audience engages, not a generic
  chart. Record the per-platform windows in memory and schedule into them.
- After a post goes live, `social_post_sync_analytics` pulls its real reach and
  engagement back from the platform so the numbers are current for the report. Live
  metrics lag the platform by minutes to hours - sync before you read, not after you
  reported.
- Remove a post with `social_delete_post` only on explicit instruction - deleting a
  live post also destroys its accumulated engagement and analytics history.

## Weekly cadence (every week, the heartbeat of the retainer)
1. Fill and confirm next week's calendar: check `social_calendar_list` and
   `social_list_posts` for gaps against the pillar ratio, ideate the empty slots
   (Play 3), draft, and schedule. Aim to be one full week ahead at all times.
2. Engagement pass, ideally daily but no less than three times a week:
   `social_comments_list` across recent posts, reply to what needs replying (Play 6),
   flag leads and support issues to the right department.
3. Performance check: `social_analytics_summary` and `social_analytics_timeseries` for
   the week - which posts over- and under-performed, and why. `social_post_sync_analytics`
   on the week's posts first so the numbers are fresh. Feed the winners back into next
   week's ideation - repeat formats that worked.
4. Account health: quick `social_account_analytics` per platform for follower movement
   and reach trend. A sudden reach drop is investigated the same week (posting gap,
   format change, a flagged post), not discovered at month end.
5. Pipeline: review the production board against the month's milestones
   (`pm_milestones_list`) - what is drafted, scheduled, published, blocked. Update
   statuses honestly with `pm_tasks_update`; a stalled approval is escalated, not
   silently left.
6. Anomaly rule: any post more than 2-3x the account's normal engagement is studied and
   its format banked as a repeatable play; any week with zero posts published on a
   connected platform is a service failure - never let it happen quietly.

## Monthly report (the artifact the retainer pays for)
The report proves reach, growth, and engagement, and shows the client where the money
went. Build it from named tool calls only - every number must be reproducible.

1. Gather the month's data: `social_post_sync_analytics` across the month's posts first,
   then `social_analytics_summary` (blended topline), `social_analytics_timeseries`
   (the trend), `social_account_analytics` per platform (follower and reach growth), and
   `social_post_analytics` on the top posts.
2. Report sections, in this order:
   - Executive summary - five bullets max: headline metric (reach or follower growth),
     the single best post and why, biggest learning, what we shipped, what is next.
     Written last, placed first.
   - Growth and reach - followers gained per platform MoM, total reach and impressions,
     engagement rate trend from `social_analytics_timeseries`. Show the direction, not
     just a snapshot.
   - Top content - the three to five best posts by engagement (`social_post_analytics`),
     each with the pillar, format, and the reason it worked. This is where you prove the
     strategy, not just the activity.
   - Pillar and cadence delivery - posts published per platform vs the committed cadence,
     and the actual pillar ratio vs target. Honesty here builds trust.
   - Engagement and community - comments handled, notable conversations, leads or
     support issues routed to other departments.
   - Next month plan - the calendar theme, any campaign, the format experiments queued.
   - Local clients: a Google Business Profile line - posts published and any listing
     engagement signal available.
3. Persist the report as a deliverable so the client can read it: capture it with
   `content_create` (or the account's reporting surface) and log the delivery decision
   with `memory_create`. Reflect completed production against `pm_tasks_complete`.
4. Numbers must reconcile: every figure in the narrative traces to a specific tool call.
   No vibes, no rounding a flat month up into a win.

## Benchmarks and decision rules
- Engagement-rate reality (as a share of followers or reach; for orientation, never a
  promise): organic feed engagement in the low single digits is normal and healthy;
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
- `social_publish_post` is irreversible - it posts to a live public profile. Confirm the
  post and the exact account(s) every single time, and never bulk-loop it over a batch
  of drafts. One deliberate confirm per publish.
- A platform absent from `social_list_accounts` is not connected - you cannot post to
  it. Do not draft into a void; raise the connection as a task and note it in the report
  so the client knows why a channel is quiet.
- Live analytics lag. Run `social_post_sync_analytics` before reading a post's numbers
  for a report; reach and engagement keep climbing for hours to days after publish, so a
  number pulled too early understates the post.
- Never cross-post one identical caption to every platform - it underperforms everywhere
  and reads as automated. Tune per platform (Play 3).
- Hashtag sets are platform-specific. The full Instagram ladder pasted onto LinkedIn or X
  looks amateur and can suppress reach. Keep and apply per-platform sets (Play 5).
- Deleting a live post with `social_delete_post` also destroys its engagement and its
  analytics history - only on explicit instruction, never as cleanup.
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