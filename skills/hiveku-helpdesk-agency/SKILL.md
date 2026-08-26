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
  the way SEO has one, so client-facing reports live as a `memory_create` of type report plus
  the PM task trail - see the monthly section.
- Confirm before writes, and treat customer-facing writes as sacred. Reading tickets,
  listing queues, and rendering a macro are free and reversible. `helpdesk_ticket_send_reply`
  puts words in front of a real customer under the client's brand - never send silently, never
  bulk-send. Draft, show the exact text, get a yes, then send ONE reply. Same rule for
  `helpdesk_ticket_escalate_to_human`, `helpdesk_ticket_transfer_to_voice`, and
  `helpdesk_ticket_merge` (merges are hard to unwind).
- `hiveku-data/helpdesk/*.json` (tickets, queues, macros, kb, csat snapshots) is the local
  mirror - read it for orientation and to size the backlog without burning live calls, but use
  live tools for anything a customer is waiting on or any decision-grade number. The mirror
  goes stale the moment a ticket moves.
- Generative or strategic output (a reply draft, an apology for an outage, a KB article, a
  macro body, a tone rewrite) -> `talk_to_department({ domain: 'helpdesk', message })`, which
  runs the support agent with full brand hydration. Then persist with the matching direct tool
  (`helpdesk_ticket_send_reply` after approval, `helpdesk_kb_article_create`,
  `helpdesk_macros_create`). Pure reads, status flips, assignment, and priority changes ->
  direct tools.
- When you are unsure of a tool's exact arguments, `hiveku_docs_search` / `hiveku_docs_get`
  before guessing. A malformed ticket write is worse than a slow one.

## Engagement lifecycle (the agency arc)

### Week 1 - baseline the queue (do ALL of this before promising an SLA)
1. Confirm the account: `get_account_info`, then `account_context_get({ domain: 'helpdesk' })`
   for persona, brand voice, and any existing support rules in memory (`memory_list`).
2. Map the queues: `helpdesk_queues_list` - how many queues, who is a member of each, how work
   is currently split (by channel, product, tier, or nothing). A single undifferentiated queue
   is the most common thing you will find and the first thing to fix.
3. Size the backlog: `helpdesk_ticket_list` across statuses to count open, pending, and
   unassigned tickets, then `helpdesk_tickets_overdue` for anything already past SLA. The gap
   between "open" and "overdue" is the honest starting health of the account.
4. Read the shape of demand: sample `helpdesk_ticket_get` +
   `helpdesk_ticket_messages` on 20-30 recent tickets to learn the top contact reasons, the
   tone customers arrive in, and how the client has been replying. This sample IS your macro
   and KB roadmap.
5. Inventory what already exists: `helpdesk_macros_list` (canned responses),
   `helpdesk_kb_categories_list` + `helpdesk_kb_search` (published knowledge), and
   `helpdesk_automations_get` (what fires automatically today - assignment rules, auto-tags,
   SLA clocks). Do not rebuild what is already there.
6. Baseline satisfaction: `helpdesk_csat_stats` for the current score and response rate,
   `helpdesk_csat_list` to read the actual verbatims behind low scores. Verbatims tell you
   what the number cannot.
7. Record the baseline with `memory_create({ type: 'baseline', name: 'helpdesk-baseline-<yyyy-mm>',
   content })`: ticket volume per week, current median first-response and resolution times if
   derivable from the sample, CSAT, queue structure, top 5 contact reasons, and the honest
   constraints (coverage hours, staffing, missing macros). Everything you promise later is
   measured against this.

### Strategy (week 2)
Turn the baseline into an operating design and get sign-off:
- SLA targets by priority. Propose concrete numbers, do not leave them vague. A defensible
  default ladder: urgent first-response 1 hour / resolution 4 hours; high 4h / 1 business day;
  normal 8 business hours / 2 business days; low 2 business days / 5 business days. Adjust to
  the client's coverage hours - an SLA you cannot staff is a liability, not a promise.
- Queue design. One queue per meaningful routing dimension (channel, product line, or tier),
  each with the right members. Fewer, well-staffed queues beat many empty ones.
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

1. SLA breaches first: `helpdesk_tickets_overdue` - every ticket here is already hurting the
   client. Open each with `helpdesk_ticket_get` + `helpdesk_ticket_messages`, and either reply
   now (Play 2) or escalate (Play 5). Nothing else in the sweep matters until this list is
   handled or has an owner.
2. New and unassigned: `helpdesk_ticket_list` filtered to new/open and unassigned. For each,
   set priority against the rubric with `helpdesk_ticket_set_priority`, then route it:
   `helpdesk_ticket_assign` to the right agent, or leave it in the correct queue if assignment
   is by pull. If it is in the wrong queue, that is a queue-membership or automation gap - note
   it for Play 6.
3. Pending-customer aging: tickets waiting on the customer that have gone quiet are candidates
   for a polite follow-up (Play 2) and then a close. Do not let "pending" become a graveyard
   that hides real backlog.
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
2. Check for a macro first: `helpdesk_macros_list`, and if one fits,
   `helpdesk_macros_render({ macro_id, ticket_id })` to fill its variables against this ticket.
   Rendering does not send - it returns the resolved text for you to review. A good macro answers
   80 percent of the reply; you personalize the rest.
3. For anything non-routine (a complaint, an outage apology, a nuanced how-to), draft through
   `talk_to_department({ domain: 'helpdesk', message })` with the full thread, the customer's
   tone, the resolution you intend to offer, and any constraint (refund policy, what you can and
   cannot promise). The agent writes in the account's brand voice.
4. Internal notes vs customer replies are different tools and must never be confused:
   `helpdesk_ticket_add_message` records an internal note or logs context on the ticket;
   `helpdesk_ticket_send_reply` sends to the customer. Draft into a note if you want a second
   set of eyes before it goes out.
5. Confirm, then send ONE: show the exact reply text, confirm, then a single
   `helpdesk_ticket_send_reply`. After sending, set the resulting state with
   `helpdesk_ticket_set_status` (solved / pending-customer as appropriate) so the queue reflects
   reality and CSAT can fire.
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
- Let the system point at gaps too: `helpdesk_kb_suggest_articles` surfaces articles the system
  believes are relevant (use it against a ticket to see whether an answer already exists, and
  where it returns nothing for a common question, that is a gap).
- Draft articles through `talk_to_department({ domain: 'helpdesk', message })` with the question,
  the correct answer, and the audience, then publish with `helpdesk_kb_article_create` (confirm
  the title, category, and body first). Update existing articles with
  `helpdesk_kb_article_update` when a product change makes them wrong - a stale KB article is
  worse than none because it fails customers confidently.
- Read before you edit: `helpdesk_kb_read_article` to load the current body so an update is a
  surgical edit, not a blind overwrite.
- Close the loop with replies: when a reply answers a question the KB should own, write the
  article and then have macros link to it (Play 4). Track deflection candidates and articles
  shipped as `pm_tasks_create` items so the monthly report can show KB growth.

## Play 4 - Macros (canned responses that scale the team)
Macros turn a repeated answer into a two-second reply and keep tone consistent across agents.

- Inventory and audit: `helpdesk_macros_list`, then `helpdesk_macros_get({ macro_id })` to read
  the body of any that look stale or off-brand. Macros drift out of date silently.
- Build from the reply data: the drafts you write more than twice in Play 2 are macro candidates.
  Write the body through `talk_to_department({ domain: 'helpdesk', message })` so it lands in
  brand voice, then create it with `helpdesk_macros_create` (confirm name, body, and any variable
  placeholders first). Keep variables (customer name, order id, ticket subject) so
  `helpdesk_macros_render` can personalize per ticket.
- Maintain them: `helpdesk_macros_update` when a policy or product changes. A wrong macro
  multiplies a mistake across every ticket it touches, so treat a macro edit with the same care
  as a KB edit.
- Test before trusting: `helpdesk_macros_render` against a real ticket to confirm the variables
  resolve correctly before an agent relies on it live.
- Coverage goal: a macro (or KB article, or both) for each of the top contact reasons. That set
  is what lets the team hold SLA when volume spikes.

## Play 5 - Escalation and cross-channel handoff
Knowing when to escalate is as valuable as knowing how to answer.

- To a human specialist: `helpdesk_ticket_escalate_to_human` when the issue needs judgement,
  authority, or expertise the agent cannot supply (billing exceptions, legal, a bug that needs
  engineering). Escalate with a clean internal summary added via `helpdesk_ticket_add_message`
  first, so the human does not re-read the whole thread. Confirm before escalating - it changes
  who owns the customer.
- To voice: `helpdesk_ticket_transfer_to_voice` when the problem is faster or safer on a call
  (an upset customer, a complex multi-step fix, anything where tone matters more than text).
  Confirm first; a transfer sets a customer expectation of a call.
- Assignment vs escalation: reassigning within the team is `helpdesk_ticket_assign` and is
  routine; escalation changes the tier of ownership and is not. Do not use escalation as a
  substitute for simply routing to the right queue member.
- Escalation triggers worth codifying in memory: any second contact on the same unresolved
  issue, any ticket that will breach SLA before you can resolve it, any mention of churn/refund/
  legal, and any repeat from a high-value company (seen via `helpdesk_ticket_list_for_company`).

## Play 6 - Queue and automation health
The structure that routes work is itself a deliverable you maintain.

- Right-size queues: `helpdesk_queues_list` regularly. Create a new queue with
  `helpdesk_queues_create` only when a real routing dimension emerges (a new product line, a new
  tier), and retire or reshape with `helpdesk_queues_update`. Manage staffing with
  `helpdesk_queues_add_member` / `helpdesk_queues_remove_member` so no queue is unstaffed and no
  agent is drowning.
- Watch the automations: `helpdesk_automations_get` shows what fires automatically - assignment
  rules, SLA clocks, auto-tagging, auto-responses. When tickets keep landing in the wrong queue
  or SLA clocks look wrong, the fix is usually here, not in manual triage. There is no tool to
  edit automations from here - if the rule itself needs changing, raise it as a
  `pm_tasks_create` and make the change in the helpdesk dashboard, then confirm the new behavior
  by watching the next day's routing.
- The signal to act: if Play 1 routing keeps correcting the same misroute by hand, that is an
  automation or queue-membership gap, not a triage task. Fix the system, not the symptom.

## Daily cadence (every business day, protects SLA)
1. `helpdesk_tickets_overdue` - clear or assign every breach before anything else.
2. `helpdesk_ticket_list` new/unassigned - prioritize (`helpdesk_ticket_set_priority`) and route
   (`helpdesk_ticket_assign`).
3. Reply to what you own (Play 2), macro-first, brand-voice always, one confirmed send each.
4. Follow up aging pending-customer tickets; close the genuinely resolved.
5. Update the triage `pm_tasks_update` with counts, and raise tasks for systemic issues found.

## Weekly cadence (every week, ~30 minutes of tool time)
1. `helpdesk_csat_stats` week over week - is satisfaction moving, and which direction?
   `helpdesk_csat_list` the new low scores and read the verbatims - each low-CSAT ticket gets a
   root-cause note and, where warranted, a follow-up.
2. Backlog trend: `helpdesk_ticket_list` counts by status vs last week, and
   `helpdesk_tickets_overdue` count - is the queue growing or shrinking? A rising overdue count
   is a staffing or automation problem to name now, not at month end.
3. Contact-reason review: what were the top reasons this week? New recurring reason with no
   macro or KB article = write one (Plays 3 and 4). Recurring root cause that is a product bug =
   `pm_tasks_create` for engineering with the ticket ids as evidence.
4. Macro and KB hygiene: any macro or article made wrong by a product change this week? Update
   it (`helpdesk_macros_update` / `helpdesk_kb_article_update`) before it misinforms at scale.
5. Pipeline: review open support tasks - update statuses with `pm_tasks_update`, complete the
   finished ones with `pm_tasks_complete`, escalate anything stalled. Record any durable
   decision (an SLA change, a new escalation rule) with `memory_update` on the standing support
   memory so it survives the session.

## Monthly report (the artifact the retainer pays for)
There is no support-specific deliverable store, so assemble the report as structured markdown,
persist it with `memory_create({ type: 'report', name: 'helpdesk-monthly-<yyyy-mm>', content })`,
and deliver it to the client the way the account expects (dashboard share or the agreed channel).
Include, in this order:
1. Executive summary - 5 bullets: headline metric (CSAT or median first-response), biggest win,
   biggest risk, what we did, what is next. Written last, placed first.
2. Volume and SLA - tickets received / solved / still open from `helpdesk_ticket_list`, overdue
   count trend from `helpdesk_tickets_overdue`, and SLA attainment against the agreed targets.
   State the numerator and denominator; no bare percentages.
3. Satisfaction - `helpdesk_csat_stats` month over month, response rate, and 2-3 representative
   verbatims from `helpdesk_csat_list` (one glowing, one critical, one typical) so the client
   hears real customers.
4. Top contact reasons - the demand map, with what you shipped to deflect each (KB articles and
   macros created this month).
5. Knowledge and automation - articles created/updated, macros created/updated, any queue or
   automation change, and the resulting effect on handle time where you can show it.
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
  month. A rising response rate matters as much as the score - a great score on a 5% response
  rate is not a great score.
- Deflection is the margin lever. Each of the top 5 contact reasons answered by a KB article
  plus a macro removes real handle time; prioritize writing those over one-off polish.
- Macro-first, not macro-only. A macro that is sent verbatim on an emotional ticket reads as a
  robot. Render the macro, then personalize the opening and the specific detail. Route the truly
  non-routine through `talk_to_department`.
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
  leaks context; a reply logged as a note leaves the customer waiting. Confirm which one every
  time.
- `helpdesk_ticket_merge` is hard to unwind - confirm the two tickets really are one issue and
  one customer before merging.
- A wrong macro or KB article multiplies a single mistake across every customer it reaches. Treat
  `helpdesk_macros_update` and `helpdesk_kb_article_update` with the same care as a public
  publish, and test macros with `helpdesk_macros_render` first.
- Do not fix systemic misrouting by hand forever. Repeated manual re-assignment is a signal to
  fix a queue or automation (Play 6), which for automation rules means the dashboard plus a
  `pm_tasks_create`, not a tool call from here.
- `hiveku-data/helpdesk/*.json` is a snapshot and goes stale the instant a ticket moves. Read it
  for orientation; use live tools for anything a customer is waiting on.
- Report only numbers you can reproduce from a named tool call. If you cannot derive median
  response time from the tools available, report what you can (volume, overdue count, CSAT) and
  say what needs the dashboard rather than inventing a figure.
- Log every material decision - an SLA change, a new escalation trigger, a retired queue - with
  `memory_create` or `memory_update`, so the next session does not re-litigate settled policy.