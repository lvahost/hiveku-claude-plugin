---
name: hiveku-helpdesk-agency
description: Full customer-support and helpdesk agency methodology for operating a Hiveku account. Use for ANY support work - ticket queues and triage, SLA and first-response times, backlog and overdue tickets, drafting and sending replies, macros and canned responses, knowledge base articles and deflection, escalations to human or voice, ticket merging and assignment, CSAT and satisfaction scores, response-time and resolution reporting, and weekly support checkups or monthly support reports.
---

# Hiveku Helpdesk Agency Operating System

Operate the account like a managed-support retainer charging thousands per month: baseline
the queue once, set an SLA and coverage strategy, run the execution plays every day, and
ship a monthly report the client would pay for. Every tool named below is a real Hiveku MCP
tool - do not invent others. Where a capability has no tool, the play says so and routes you
to the dashboard.

## Operating principles
- `account_context_get({ domain: 'helpdesk' })` FIRST - before any triage strategy, reply
  drafting, or KB work. It returns persona, brand voice, avatars, domain memory, skills, and
  rules. The brand voice governs every customer-facing reply; re-read its instructions field
  before every generative call.
- Hiveku is the source of truth. Durable findings (agreed SLA targets, queue design, tone
  rules, top deflection topics, recurring root causes) -> `memory_create`. Work items ->
  `pm_tasks_create` / `pm_tasks_complete`. There is no separate deliverable store for support
  the way SEO has one, so client-facing reports live as their own memory entry plus the PM task
  trail - see the monthly section. `memory_create` accepts only `type: memory | skill | rule |
  command | agent | identity`; there is no `report` or `baseline` type and anything else is a 400.
  Durable policy belongs in the `helpdesk` document itself (that is the one hydration loads), so
  read it with `memory_list({ domain: 'helpdesk' })` and merge into it - `memory_update` REPLACES
  the whole document.
- Confirm before writes, and treat customer-facing writes as sacred. Reading tickets and
  listing queues, macros, and KB articles is free and reversible. `helpdesk_ticket_send_reply`
  puts words in front of a real customer under the client's brand - never send silently, never
  bulk-send. Draft, show the exact text, get a yes, then send ONE reply. Same rule for
  `helpdesk_ticket_escalate_to_human` (it forces priority=urgent, not just a reassignment),
  `helpdesk_ticket_transfer_to_voice`, `helpdesk_ticket_merge` (merges are hard to unwind), and
  `helpdesk_ticket_create` (it can auto-acknowledge the customer by email on its own). Note that
  rendering a macro is a read for your purposes but still bumps that macro's `usage_count`.
- `hiveku-data/helpdesk/*.json` (tickets, queues, macros, kb, csat snapshots) is the local
  mirror - read it for orientation and to size the backlog without burning live calls, but use
  live tools for anything a customer is waiting on or any decision-grade number. The mirror
  goes stale the moment a ticket moves.
- **There is no helpdesk department agent.** `talk_to_department` accepts exactly 14 domains -
  seo, social, content, marketing, branding, outbound, ppc, analytics, customer_avatar,
  customer_journey, before_after_grid, website_design, knowledge_base, workflow - and
  `{ domain: 'helpdesk' }` is refused with `Unknown domain 'helpdesk'`. For generative or
  strategic output (a reply draft, an apology for an outage, a KB article, a macro body, a tone
  rewrite), load `agent_identity_get({ domain: 'helpdesk' })` and write it yourself. That call
  returns the same hydration the live agent would get: the support persona, brand guide, account
  memory, every skill and rule tagged helpdesk, avatars, journeys, KB index, plus cross-domain
  memory. `format: 'markdown'` gives you a ready-assembled CLAUDE.md under `data.content` if you
  are spending the whole session in support. Then persist with the matching direct tool
  (`helpdesk_ticket_send_reply` after approval, `helpdesk_kb_article_create`,
  `helpdesk_macros_create`). Pure reads, status flips, assignment, and priority changes ->
  direct tools.
- Ticket status is exactly `open | pending | resolved | closed`. Priority is exactly
  `low | normal | high | urgent`. Channel is `email | chat | voice | sms`. Do not use Zendesk or
  Intercom vocabulary - there is no "new", no "solved", no "pending-customer". A wrong status on
  `helpdesk_ticket_set_status` is rejected; a wrong status on `helpdesk_ticket_list` just returns
  nothing, which reads as an empty queue on an account that is drowning. `set_status` auto-sets
  `resolved_at` / `closed_at` on the flip, so never try to write those timestamps yourself.
- When you are unsure of a tool's exact arguments, `hiveku_docs_search` / `hiveku_docs_get`
  before guessing. A malformed ticket write is worse than a slow one.

## Engagement lifecycle (the agency arc)

### Week 1 - baseline the queue (do ALL of this before promising an SLA)
1. Confirm the account: `get_account_info`, then `account_context_get({ domain: 'helpdesk' })`
   for persona, brand voice, and any existing support rules in memory (`memory_list`).
2. Map the queues: `helpdesk_queues_list` - how many queues, who is a member of each, how work
   is currently split (by channel, product, tier, or nothing). A single undifferentiated queue
   is the most common thing you will find and the first thing to fix.
3. Size the backlog: `helpdesk_ticket_list({ status })` once per status (`open`, `pending`) to
   count each, and count the unassigned by filtering the `open` rows client-side for a null
   assignee - there is NO unassigned filter on the tool. `helpdesk_ticket_list` is paged
   (`page` / `limit`), so page until a short page comes back and report the count you actually
   enumerated, never a page size. Then `helpdesk_tickets_overdue({ kind: 'first_response',
   limit: 500 })` and `({ kind: 'resolve', limit: 500 })` for anything already past SLA - the
   default limit is 100 and a truncated list looks like a healthy queue. The gap between "open"
   and "overdue" is the honest starting health of the account.
4. Read the shape of demand: sample `helpdesk_ticket_get` +
   `helpdesk_ticket_messages` on 20-30 recent tickets to learn the top contact reasons, the
   tone customers arrive in, and how the client has been replying. This sample IS your macro
   and KB roadmap.
5. Inventory what already exists: `helpdesk_macros_list` (canned responses),
   `helpdesk_kb_categories_list` + `helpdesk_kb_search` (published knowledge), and
   `helpdesk_automations_get` - which returns exactly `auto_acknowledge`, `auto_assign`, `sla`,
   `csat_survey`, `auto_close`, `team_notifications`, plus the widget config (color, greeting,
   position). There is no auto-tagging in that payload. Read `sla` here rather than assuming the
   ladder you are about to propose is what the account actually enforces, read `auto_close` before
   you plan to chase aging pending tickets by hand (the system may already close them on a timer),
   and read `csat_survey` before you interpret any CSAT number at all. Do not rebuild what is
   already there.
6. Baseline satisfaction: `helpdesk_csat_stats` for the current score and the per-assignee
   breakdown, `helpdesk_csat_list` to read the actual verbatims behind low scores. Ratings are
   `great | ok | not_great` and `csat_score = great / total`, so a middling "ok" counts AGAINST
   the score - our 90/80 bands assume that definition. If `csat_survey` is disabled in step 5,
   the score you are looking at is a config artifact, not customer sentiment; say so. Verbatims
   tell you what the number cannot.
7. Record the baseline with `memory_create({ type: 'memory', name: 'helpdesk-baseline-<yyyy-mm>',
   content })` - there is no `baseline` type; that is an archival entry, so also merge the two or
   three numbers you will actually hold yourself to into the `helpdesk` document, which is the one
   department agents hydrate. Capture: ticket volume per week, current median first-response and
   resolution times if derivable from the sample, CSAT, queue structure, top 5 contact reasons,
   and the honest constraints (coverage hours, staffing, missing macros). Everything you promise
   later is measured against this.

### Strategy (week 2)
Turn the baseline into an operating design and get sign-off:
- SLA targets by priority. Propose concrete numbers, do not leave them vague. A defensible
  default ladder: urgent first-response 1 hour / resolution 4 hours; high 4h / 1 business day;
  normal 8 business hours / 2 business days; low 2 business days / 5 business days. Adjust to
  the client's coverage hours - an SLA you cannot staff is a liability, not a promise.
- Queue design. One queue per meaningful routing dimension (channel, product line, or tier),
  each with the right members. Fewer, well-staffed queues beat many empty ones. For each queue
  pick a routing strategy explicitly - the dispatcher uses it to choose the assignee:
  `round_robin` (cycle members; right when ticket weight is homogeneous), `least_busy` (assigns to
  the member with the fewest OPEN tickets; better when handle times vary widely), or `fixed_user`
  (single owner; `fixed_user_id` is REQUIRED or the create fails). The default is `round_robin`,
  so an unstated choice is a choice - record the strategy per queue in the memory queue map so it
  is a design decision, not an accepted default.
- Priority rubric. Define what makes a ticket urgent vs normal in words the client agrees to,
  so `helpdesk_ticket_set_priority` is applied consistently and not by mood.
- Deflection plan. The top 5 contact reasons from the baseline become the first 5 KB articles
  and the first 5 macros. This is where the retainer earns margin: every deflected or macro-
  answered ticket is time back.
Persist the agreed SLA, queue map, and priority rubric with `memory_create`, then
`pm_tasks_create` the week-1 build work (queues, first macros, first articles) with owners and
due dates. Check `pm_milestones_list` so support tasks hang off the right client milestone.

### Execution -> cadence
Run the plays below as the daily and weekly rhythm. The daily loop keeps SLA green; the weekly
loop keeps the account healthy; the monthly report proves the value. Never let a business day
pass without the queue being triaged.

## Play 1 - Triage and the daily queue sweep (the core service)
This is the play you run most. Order matters: protect SLA first, then reduce backlog.

0. Log demand that arrived outside the widget first, so the sweep is working the real queue: a
   phone call, a forwarded email, an issue raised in a client meeting all need a ticket.
   `helpdesk_ticket_create({ subject, contact_email | crm_contact_id, channel, priority,
   first_message, queue_id, tags, source_meta })`. Pass exactly ONE of `crm_contact_id` /
   `contact_email` - an unknown email lazy-creates a contact with `lead_source='helpdesk'`, so
   search CRM contacts first or you duplicate a known customer. `first_message` attaches the
   customer's opening message in the same call (`first_message_direction` defaults to `inbound`).
   `channel` defaults to email, `priority` to normal. `source_meta` holds provider/thread_id for
   deduping against an inbox. CONFIRM BEFORE CREATING: the create fires the
   `helpdesk_ticket_created` workflow trigger and runs the account's auto-acknowledge /
   auto-assign / SLA automations, so it can email the customer on its own. Read
   `helpdesk_automations_get` before back-filling anything historical, or a customer gets an
   acknowledgement for a ticket they filed last month.
1. SLA breaches first: `helpdesk_tickets_overdue({ kind: 'first_response', limit: 500 })` before
   `({ kind: 'resolve', limit: 500 })` - missed reply windows are the breaches customers actually
   feel, and the two failures have different fixes. `kind` defaults to `both`; `limit` defaults to
   100 and maxes at 500, and a truncated list looks like a healthy queue. A ticket is here when
   `first_response_due_at` or `resolve_due_at` is in the past AND the matching actual timestamp is
   missing; resolved and closed tickets are excluded. Open each with `helpdesk_ticket_get` +
   `helpdesk_ticket_messages`, and either reply now (Play 2) or escalate (Play 5). Nothing else in
   the sweep matters until this list is handled or has an owner.
2. New and unassigned: `helpdesk_ticket_list({ status: 'open', sort: 'created' })`, then filter
   client-side for rows with a null assignee - there is NO unassigned filter, and an invented
   `unassigned: true` is silently dropped, so the call succeeds and hands you the whole open list
   which you then misreport as the unassigned queue. To see one agent's load use `assigned_to_id`;
   for a queue's, `queue_id`. `sort` accepts `last_activity` or `created` only. For each ticket,
   set priority against the rubric with `helpdesk_ticket_set_priority`, then route it:
   `helpdesk_ticket_assign` to the right agent, or leave it in the correct queue if assignment
   is by pull. If it is in the wrong queue, that is a queue-membership or automation gap - note
   it for Play 6.
3. Aging `pending` tickets: tickets waiting on the customer that have gone quiet are candidates
   for a polite follow-up (Play 2) and then a close. Check `auto_close` in
   `helpdesk_automations_get` first - the account may already sweep these on a timer, and chasing
   them by hand is wasted retainer time. Do not let `pending` become a graveyard that hides real
   backlog.
4. Context before you route hard cases: `helpdesk_ticket_list_for_contact` and
   `helpdesk_ticket_list_for_company` show whether this is a first-time issue or the fifth
   ticket from an angry account. A repeat contact reason from one company is an escalation
   signal, not just another ticket.
5. Duplicates: when the same customer opened two tickets for one issue, propose a
   `helpdesk_ticket_merge` (confirm first - merges are hard to reverse) so the thread and SLA
   clock live in one place.
6. Log the sweep: update `pm_tasks_update` on the triage task with counts handled, and raise a
   new `pm_tasks_create` for anything that needs engineering, billing, or a KB article. A
   triage sweep that produces no follow-up tasks means you missed the systemic issues.

Batch discipline: read the whole overdue and new list before replying to any single ticket, so
you triage by priority across the queue rather than first-in-first-out down the list.

## Play 2 - Replies (where the brand voice lives)
Every reply is the client's brand talking to a customer. The bar is high.

1. Load full context: `helpdesk_ticket_get` for status, priority, and fields, and
   `helpdesk_ticket_messages` for the entire thread. Never reply from the subject line alone.
2. Check for a macro first: `helpdesk_macros_list` (sorted most-used first; filters are
   `is_active`, `tag`, `search`) to find a fitting one, `helpdesk_macros_get({ id })` to read its
   raw body and see which `{{placeholders}}` it uses, then
   `helpdesk_macros_render({ id, variables: { contact_first_name: '...', ticket_short_id: '...' } })`.
   YOU build the variables map, from what `helpdesk_ticket_get` gave you - the render tool has no
   awareness of tickets and takes no ticket argument. The response returns the filled body plus a
   list of any placeholder you failed to supply: if that list is non-empty, DO NOT send, fill it
   and re-render. Rendering does not send - it returns the resolved text for you to review - but
   it does bump the macro's `usage_count`, which is the most-used sort order, and it refuses with
   400 on an `is_active=false` macro. A good macro answers 80 percent of the reply; you
   personalize the rest.
3. For anything non-routine (a complaint, an outage apology, a nuanced how-to), load
   `agent_identity_get({ domain: 'helpdesk' })` and write the reply yourself in that persona and
   brand voice, holding the full thread, the customer's tone, the resolution you intend to offer,
   and any constraint (refund policy, what you can and cannot promise). There is no helpdesk
   department agent to delegate to.
4. Internal notes vs customer replies are different tools and must never be confused:
   `helpdesk_ticket_add_message({ id, body })` records an internal note (`direction` defaults to
   `internal`) or logs context on the ticket; `helpdesk_ticket_send_reply({ id, body })` sends to
   the customer. Never fake a reply with `helpdesk_ticket_add_message({ direction: 'outbound' })` - only
   `send_reply` stamps `first_response_at`, so an outbound `add_message` answers the customer while
   leaving the ticket in `helpdesk_tickets_overdue` as a first-response breach forever.
   `add_message` also defaults `author_kind` to `ai_agent`, so pass `author_kind` / `author_id`
   when you are logging on behalf of a human. Draft into a note if you want a second set of eyes
   before it goes out.
5. Confirm, then send ONE: show the exact reply text, confirm, then a single
   `helpdesk_ticket_send_reply`. After sending, set the resulting state with
   `helpdesk_ticket_set_status({ id, status })` - `resolved` when the issue is done, `pending`
   when the ball is back with the customer - so the queue reflects reality and CSAT can fire. The
   enum is only `open | pending | resolved | closed`.
6. If your draft would make a good reusable answer, that is a macro candidate - note it for
   Play 4 rather than rewriting the same thing next week.

Reply quality rules: acknowledge the specific problem in the first sentence, answer the actual
question before any upsell or policy, give a concrete next step or timeline, and never blame the
customer. Match the brand voice from `account_context_get`, not a generic support tone.

## Play 3 - Knowledge base and deflection
The KB is the highest-leverage asset in support: it answers tickets before they are opened and
gives macros something to link to.

- Find gaps from real demand: the top contact reasons from the Play 1 baseline that have no
  article are your writing queue. Check current coverage with `helpdesk_kb_categories_list` and
  `helpdesk_kb_search` before writing anything, so you extend rather than duplicate.
- Let the system point at gaps too: `helpdesk_kb_suggest_articles({ q })` surfaces articles the
  system believes are relevant (use it against a ticket to see whether an answer already exists,
  and where it returns nothing for a common question, that is a gap). It returns PUBLIC articles
  only, which is exactly why it is the tool to use when picking links for an outbound reply - you
  cannot accidentally link an internal doc to a customer. `helpdesk_kb_search({ q, visibility })`
  takes `public | internal | all` and defaults to `all`, so search results you paste into a
  customer reply must be visibility-checked by hand.
- Draft articles yourself against `agent_identity_get({ domain: 'helpdesk' })` - the question, the
  correct answer, and the audience - then create with
  `helpdesk_kb_article_create({ title, body, excerpt, category_id, tags, visibility })`. It
  defaults to `visibility: 'draft'` with `publish: false`, which is HIDDEN from search: creating an
  article does not publish it, so never report a create as "published". Create as a draft, get the
  client's sign-off, then `helpdesk_kb_article_update({ id, visibility: 'public' })` - and know
  that setting `public` AUTO-PUBLISHES to customers immediately, so that flip is the live moment,
  not a staging step. `internal` is agents-only. Always write an `excerpt`; it is what customers
  see in search results. Confirm title, category, body, and visibility before the call.
- To pull an article back down: `helpdesk_kb_article_update({ id, published_at: null })`
  unpublishes. `published_at` is tri-state - `null` to unpublish, `true` to publish now, or an ISO
  datetime to backdate. Update existing articles with `helpdesk_kb_article_update` when a product
  change makes them wrong - a stale KB article is worse than none because it fails customers
  confidently, and if you cannot fix it in the moment, unpublish it.
- Read before you edit: `helpdesk_kb_read_article` to load the current body so an update is a
  surgical edit, not a blind overwrite.
- Close the loop with replies: when a reply answers a question the KB should own, write the
  article and then have macros link to it (Play 4). Track deflection candidates and articles
  shipped as `pm_tasks_create` items so the monthly report can show KB growth.

## Play 4 - Macros (canned responses that scale the team)
Macros turn a repeated answer into a two-second reply and keep tone consistent across agents.

- Inventory and audit: `helpdesk_macros_list`, then `helpdesk_macros_get({ id })` - the argument
  is `id`, not `macro_id` - to read the raw body with all its `{{placeholders}}` showing. That raw
  body is how you learn which variables `helpdesk_macros_render` needs. Macros drift out of date
  silently.
- Build from the reply data: the drafts you write more than twice in Play 2 are macro candidates.
  Write the body against the persona and brand guide from `agent_identity_get({ domain:
  'helpdesk' })` so it lands in brand voice, then create it with
  `helpdesk_macros_create({ title, body, description, tags })` - the field is `title`, not `name`,
  and `title` + `body` are the required pair. Confirm title, body, and placeholders first. Use the
  supported template vars so `helpdesk_macros_render` can personalize per ticket:
  `{{contact_first_name}}`, `{{ticket_short_id}}`, `{{account_name}}`, `{{agent_name}}`,
  `{{portal_url}}`. Tag them or the picker stops being navigable.
- Maintain them: `helpdesk_macros_update({ id, ... })` when a policy or product changes;
  allow-listed fields are title, body, description, tags, is_active. A wrong macro multiplies a
  mistake across every ticket it touches, so treat a macro edit with the same care as a KB edit.
  Retire rather than delete where you can - `is_active: false` makes `helpdesk_macros_render`
  refuse with 400, which is a safe stop, while `helpdesk_macros_delete` is gone for good.
- Test before trusting: `helpdesk_macros_render({ id, variables })` with a realistic variables map
  to confirm every placeholder resolves before an agent relies on it live. Remember every render
  bumps `usage_count`, so test renders nudge the account's most-used ordering - test once, not in
  a loop.
- Coverage goal: a macro (or KB article, or both) for each of the top contact reasons. That set
  is what lets the team hold SLA when volume spikes.

## Play 5 - Escalation and cross-channel handoff
Knowing when to escalate is as valuable as knowing how to answer.

- To a human specialist: `helpdesk_ticket_escalate_to_human({ id, assigned_to_id?, queue_id? })`
  when the issue needs judgement, authority, or expertise the agent cannot supply (billing
  exceptions, legal, a bug that needs engineering). It is NOT just a reassignment: it FORCES
  `priority=urgent` and adds an `escalated` tag, whatever the rubric said. Because urgent carries
  the tightest SLA in our ladder (1h first-response), escalating re-clocks the ticket and can
  manufacture a breach on a ticket that was fine - escalating a routine billing question is how
  you damage your own SLA number. Use it when the issue genuinely is urgent-tier. Escalate with a
  clean internal summary added via `helpdesk_ticket_add_message` first, so the human does not
  re-read the whole thread. Confirm before escalating - it changes who owns the customer AND the
  priority. Footnote escalated tickets when you report monthly SLA attainment.
- To voice: `helpdesk_ticket_transfer_to_voice({ id, target_user_id? })` when the problem is
  faster or safer on a call (an upset customer, a complex multi-step fix, anything where tone
  matters more than text). Know what it actually does: it only ANNOTATES the ticket. The dial is
  executed by voice_server, asynchronously and outside this tool's control, and the call returns
  success whether or not a call is ever placed - if voice_server is not running or not configured
  for the account, nothing happens and nothing errors. Never tell a customer "we are calling you
  now" on the strength of this call alone. There is a concrete check: run `voice_diagnose_setup`
  (no arguments) and read `tenant_provisioned`. False means the account has no voice tenant, so the
  annotation is a dead end and the ticket would carry a callback expectation nothing will honor -
  do not transfer, reply in the ticket instead. Verification is NOT in helpdesk: the handler writes
  a `source_meta` marker (`transfer_to_voice_requested_at`, `transfer_to_voice_target`) and bumps
  `last_activity_at`, and adds no ticket message - so `helpdesk_ticket_messages` shows nothing about
  the transfer whether or not a call happened, and `helpdesk_ticket_get({ id })` only proves the
  marker was written. Call evidence lives in voice/CRM: `voice_recent_calls({ hours_back })` or
  `voice_calls_list({ direction: 'outbound', hours_back })`, or `crm_calls_list({ contact_id })`
  using the ticket's `crm_contact_id`. Nothing joins a call row to the ticket, so match it yourself
  on number and timestamp. Never close the ticket on the marker alone.
- Assignment vs escalation: reassigning within the team is `helpdesk_ticket_assign({ id,
  assigned_to_id | queue_id })` and is routine - no priority change, no tag. Escalation changes
  the tier of ownership and forces urgent, so it is not. When all you need is a different owner,
  use `helpdesk_ticket_assign`. Do not use escalation as a substitute for simply routing to the
  right queue member.
- Escalation triggers worth codifying in memory: any second contact on the same unresolved
  issue, any ticket that will breach SLA before you can resolve it, any mention of churn/refund/
  legal, and any repeat from a high-value company (seen via `helpdesk_ticket_list_for_company`).

## Play 6 - Queue and automation health
The structure that routes work is itself a deliverable you maintain.

- Right-size queues: `helpdesk_queues_list` regularly (filter `is_active` to hide retired ones);
  `helpdesk_queues_get({ id })` for one queue's current active member list. Create a new queue
  with `helpdesk_queues_create({ name, description, strategy, fixed_user_id?, is_active })` only
  when a real routing dimension emerges (a new product line, a new tier). `strategy` is
  `round_robin` (cycle members) | `least_busy` (the member with the fewest open tickets) |
  `fixed_user` (always `fixed_user_id`, which is REQUIRED for that strategy or the create fails),
  defaulting to `round_robin`. Reshape with `helpdesk_queues_update` - it patches the same
  strategy fields, so a load-balance problem is often a one-field fix from `round_robin` to
  `least_busy` rather than a new queue. Manage staffing with
  `helpdesk_queues_add_member({ queue_id, user_id, role? })` (409 if already a member) /
  `helpdesk_queues_remove_member({ queue_id, user_id })` (does NOT unassign that user's existing
  tickets - they stay with the person after they leave the queue) so no queue is unstaffed and no
  agent is drowning. `helpdesk_queues_delete` orphans every ticket still pointing at the queue -
  reassign them first, and prefer `is_active: false`.
- Watch the automations: `helpdesk_automations_get` returns exactly `auto_acknowledge`,
  `auto_assign`, `sla`, `csat_survey`, `auto_close`, `team_notifications`, plus the widget config
  (color, greeting, position). There is no auto-tagging config to read. When tickets keep landing
  in the wrong queue or SLA clocks look wrong, the fix is usually here, not in manual triage.
  There is no tool to edit automations from here - it is read-only via Olympus because
  misconfiguring these has tenant-wide impact - so if the rule itself needs changing, raise it as
  a `pm_tasks_create` and make the change in the helpdesk dashboard, then confirm the new behavior
  by watching the next day's routing.
- The signal to act: if Play 1 routing keeps correcting the same misroute by hand, that is an
  automation or queue-membership gap, not a triage task. Fix the system, not the symptom.

## Daily cadence (every business day, protects SLA)
1. `helpdesk_tickets_overdue({ kind: 'first_response', limit: 500 })` then
   `({ kind: 'resolve', limit: 500 })` - clear or assign every breach before anything else. Never
   run it bare: the default limit is 100 and the truncation is invisible.
2. `helpdesk_ticket_list({ status: 'open' })`, filter client-side for a null assignee (there is no
   unassigned filter) - prioritize (`helpdesk_ticket_set_priority`) and route
   (`helpdesk_ticket_assign`).
3. Reply to what you own (Play 2), macro-first, brand-voice always, one confirmed send each.
   Every customer-facing send is `helpdesk_ticket_send_reply`, never an outbound `add_message`.
4. Follow up aging `pending` tickets; close the genuinely resolved.
5. Update the triage `pm_tasks_update` with counts, and raise tasks for systemic issues found.

## Weekly cadence (every week, ~30 minutes of tool time)
1. `helpdesk_csat_stats({ since })` week over week - is satisfaction moving, and which direction?
   It also returns a per-assignee breakdown sorted by `csat_score` desc and per-source counts:
   scan for an outlier agent BEFORE concluding the account has a satisfaction problem, then
   `helpdesk_csat_list({ assigned_to_id, since })` to read that agent's verbatims. Per-source
   counts tell you which channel generates the unhappiness. Ratings are `great | ok | not_great`
   and `csat_score = great / total`, so an "ok" counts against the score - that is the definition
   our 90/80 bands assume. Check `csat_survey` in `helpdesk_automations_get` before you read
   anything into a low `response_count`: a survey that is disabled, or that fires on a transition
   the team rarely uses, is a config problem, not customer sentiment. Each low-CSAT ticket gets a
   root-cause note and, where warranted, a follow-up.
2. Backlog trend: `helpdesk_ticket_list` counts by status vs last week (page through with
   `page` / `limit`; a single page is not a count), and the
   `helpdesk_tickets_overdue({ limit: 500 })` count - is the queue growing or shrinking? A rising
   overdue count is a staffing or automation problem to name now, not at month end.
3. Contact-reason review: what were the top reasons this week? New recurring reason with no
   macro or KB article = write one (Plays 3 and 4). Recurring root cause that is a product bug =
   `pm_tasks_create` for engineering with the ticket ids as evidence.
4. Macro and KB hygiene: any macro or article made wrong by a product change this week? Update
   it (`helpdesk_macros_update` / `helpdesk_kb_article_update`) before it misinforms at scale.
5. Pipeline: review open support tasks - update statuses with `pm_tasks_update`, complete the
   finished ones with `pm_tasks_complete`, escalate anything stalled. Record any durable
   decision (an SLA change, a new escalation rule) on the standing support memory so it survives
   the session: `memory_list({ domain: 'helpdesk' })`, append to the `content` it returns, then
   `memory_update({ memory_id, content })` with the whole merged document.

## Monthly report (the artifact the retainer pays for)
There is no support-specific deliverable store, so assemble the report as structured markdown,
persist it with `memory_create({ type: 'memory', name: 'helpdesk-monthly-<yyyy-mm>', content })`
(there is no `report` type - that call is a 400; this dated entry is archival and is retrieved with
`memory_list`, while the standing `helpdesk` document is what agents hydrate),
and deliver it to the client the way the account expects (dashboard share or the agreed channel).
Include, in this order:
1. Executive summary - 5 bullets: headline metric (CSAT, or the overdue-count trend), biggest win,
   biggest risk, what we did, what is next. Written last, placed first. Do not lead with a median
   first-response time unless you computed it yourself from timestamps on tickets you actually
   read - no tool returns it.
2. Volume and SLA - tickets received / resolved / still open from `helpdesk_ticket_list`, overdue
   count trend from `helpdesk_tickets_overdue`, and SLA attainment against the agreed targets.
   State the numerator and denominator; no bare percentages. Both sources are limited and the
   limit is invisible: `helpdesk_ticket_list` is paged, so page with `page` / `limit` until a short
   page returns and report the count you actually enumerated - never a page size as a total. Call
   `helpdesk_tickets_overdue` with `limit: 500` (default 100, max 500) and split it by
   `kind: 'first_response'` vs `kind: 'resolve'` - missed reply windows and missed resolutions are
   two different failures with two different fixes. If a list comes back at exactly its limit,
   your figure is a floor, and you must say so rather than report it as the total.
3. Satisfaction - `helpdesk_csat_stats({ since })` month over month with the per-assignee split,
   the `response_count` it returns in `totals` as your sample size, and 2-3 representative
   verbatims from `helpdesk_csat_list` (one glowing, one critical, one typical) so the client
   hears real customers. State the CSAT definition you are using: `csat_score = great / total`
   over `great | ok | not_great`. Do not report a survey response rate: no helpdesk tool returns
   surveys-sent, so the denominator does not exist. Report the response count instead, and say
   plainly when a score rests on a handful of responses.
4. Top contact reasons - the demand map, with what you shipped to deflect each (KB articles and
   macros created this month).
5. Knowledge and automation - articles created/updated, macros created/updated, any queue or
   automation change. There is no handle-time metric in this tool family, so show effect with what
   you can measure: macro `usage_count` from `helpdesk_macros_list` (it sorts most-used first) and
   ticket volume on that contact reason before vs after, counted from `helpdesk_ticket_list`. KB
   article view counts are not exposed by any tool here - `helpdesk_kb_read_article` increments the
   counter but is not a reporting surface, so get views from the dashboard or leave them out. Do
   not assert a handle-time reduction you cannot source.
6. Work completed - from completed pm tasks; link the escalations resolved and the systemic
   fixes shipped.
7. Next month plan - the SLA and deflection priorities for the coming month, with expected
   impact.
Every figure must trace to a named tool call. No vibes, no rounded-up guesses.

## Benchmarks and decision rules
- First-response is the number customers feel most. Blended good-practice targets by priority:
  urgent within 1 hour, high within 4 business hours, normal within 8 business hours, low within
  2 business days. Resolution runs roughly 4x the first-response target. Adjust to the client's
  actual coverage hours - promise only what the staffing can hold.
- CSAT reference band: 90%+ is excellent, 80-90% solid, below 80% needs a root-cause plan this
  month. Those bands assume Hiveku's definition, `csat_score = great / total` across
  `great | ok | not_great`, so "ok" ratings drag the number down - do not silently rebase it
  against a scale where "ok" is a pass. Sample size matters as much as the score - a great score
  on four responses is not a great score - so read `response_count` from the `totals` block and
  quote it next to every CSAT figure. There is no response-rate metric in this tool family:
  nothing exposes surveys-sent, so responses are a numerator with no denominator. When the count
  is low, check `csat_survey` in `helpdesk_automations_get` - a disabled or mistimed survey is a
  config problem, not customer sentiment.
- Deflection is the margin lever. Each of the top 5 contact reasons answered by a KB article
  plus a macro removes real handle time; prioritize writing those over one-off polish.
- Macro-first, not macro-only. A macro that is sent verbatim on an emotional ticket reads as a
  robot. Render the macro, then personalize the opening and the specific detail. Write the truly
  non-routine yourself off `agent_identity_get({ domain: 'helpdesk' })`.
- Escalate early, not late. A ticket that will breach SLA before you can resolve it should be
  escalated or transferred the moment you know, not after it goes red.
- Merge conservatively. Merge only genuine duplicates from the same customer for the same issue;
  merging distinct issues loses context and confuses the customer.

## Pitfalls (customer-facing and data traps)
- `helpdesk_ticket_send_reply`, `helpdesk_ticket_escalate_to_human`, and
  `helpdesk_ticket_transfer_to_voice` all touch the customer or their expectation. Never fire any
  of them silently or in bulk. One confirmed action at a time.
- `helpdesk_ticket_add_message` (internal note) vs `helpdesk_ticket_send_reply` (to the
  customer) is the highest-stakes tool confusion in this domain. An internal note sent as a reply
  leaks context; a reply logged as a note leaves the customer waiting. Beyond visibility there is
  an SLA consequence: only `send_reply` stamps `first_response_at`. `add_message` with
  `direction: 'outbound'` does NOT, so the ticket keeps showing up in `helpdesk_tickets_overdue`
  as a first-response breach even though the customer was answered - permanently skewing the SLA
  attainment number the retainer is sold on. Customer-facing text goes through `send_reply`,
  always. `add_message` also defaults `author_kind` to `ai_agent`; pass `author_kind` / `author_id`
  when logging on behalf of a human.
- Sending a macro with unfilled `{{vars}}` is the most embarrassing failure in this domain. The
  `helpdesk_macros_render` response lists every placeholder you did not supply - read that list
  before `helpdesk_ticket_send_reply`, every time. Non-empty means do not send.
- `helpdesk_ticket_merge({ id, merge_into_id })` is hard to unwind - `id` is the SOURCE and gets
  closed with a merge note, `merge_into_id` is the TARGET that receives the messages. Get them
  backwards and you close the wrong ticket. Confirm the two really are one issue and one customer,
  and confirm which one survives, before merging.
- `helpdesk_ticket_create` is not a quiet write. It fires the `helpdesk_ticket_created` workflow
  trigger and the account's auto-acknowledge / auto-assign / SLA automations, so it can email the
  customer by itself. Confirm before creating, and read `helpdesk_automations_get` before any
  back-fill of historical tickets.
- `helpdesk_kb_article_create` defaults to `visibility: 'draft'` - a create is not a publish, so
  never report one as live. The publish moment is `helpdesk_kb_article_update({ id, visibility:
  'public' })`, which auto-publishes to customers immediately with no staging step. Get sign-off
  before that call, and use `published_at: null` to pull an article back down.
- A wrong macro or KB article multiplies a single mistake across every customer it reaches. Treat
  `helpdesk_macros_update` and `helpdesk_kb_article_update` with the same care as a public
  publish, and test macros with `helpdesk_macros_render({ id, variables })` first.
- Do not fix systemic misrouting by hand forever. Repeated manual re-assignment is a signal to
  fix a queue or automation (Play 6), which for automation rules means the dashboard plus a
  `pm_tasks_create`, not a tool call from here.
- `hiveku-data/helpdesk/*.json` is a snapshot and goes stale the instant a ticket moves. Read it
  for orientation; use live tools for anything a customer is waiting on.
- The two silent wrong answers in this domain are invented filters and truncated lists. An
  argument that is not in a tool's schema (`unassigned`, `ticket_id` on a macro render, `macro_id`
  anywhere) is dropped by the mapping layer, so the call SUCCEEDS and returns something plausible
  and wrong. And `helpdesk_tickets_overdue` returns 100 by default while `helpdesk_ticket_list`
  pages - a capped list looks exactly like a healthy queue. Pass `limit: 500`, page to the end,
  and check whether a list came back at exactly its limit before you quote it.
- Report only numbers you can reproduce from a named tool call. There is no median-response-time
  or handle-time tool in this family: `helpdesk_tickets_overdue` gives breach counts,
  `helpdesk_ticket_list` gives volume by status, `helpdesk_csat_stats` gives satisfaction, and
  that is the set. Report what you can and say the rest needs the dashboard rather than inventing
  a figure - and never state a per-ticket first-response time you did not compute yourself from
  timestamps you actually read on the ticket.
- Log every material decision - an SLA change, a new escalation trigger, a retired queue - with
  `memory_create` (first time) or a read-merge-`memory_update` (every time after), so the next
  session does not re-litigate settled policy. `memory_update` overwrites the document, so never
  send it a bare note - send the full merged body. If one gets clobbered, recover it with
  `memory_list_versions({ memory_id })` then `memory_restore_version({ version_id })`.