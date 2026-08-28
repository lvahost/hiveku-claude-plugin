# Week 1-2 - Baseline and strategy (engagement lifecycle detail)

Load this when onboarding a new account or re-baselining one. It is the full detail behind the
lifecycle summary in SKILL.md: the 7-step week-1 baseline and the week-2 operating design.

## Week 1 - baseline the queue (do ALL of this before promising an SLA)

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
   and KB roadmap. Record the sample honestly: N tickets, how they were selected (e.g. the 30
   most recent open), and what was excluded (closed tickets, a whole channel). A baseline claim
   built on a sample must disclose the sample - "30 recent tickets" and "the queue" are
   different claims, and the tickets a convenience sample skips are exactly where the real
   problems can hide.
5. Inventory what already exists: `helpdesk_macros_list` (canned responses),
   `helpdesk_kb_categories_list` + `helpdesk_kb_search` (published knowledge), and
   `helpdesk_automations_get` - which returns exactly `auto_acknowledge`, `auto_assign`, `sla`,
   `csat_survey`, `auto_close`, `team_notifications`, plus the widget config (color, greeting,
   position). There is no auto-tagging in that payload. Read `sla` here rather than assuming the
   ladder you are about to propose is what the account actually enforces, read `auto_close` before
   you plan to chase aging pending tickets by hand (the system may already close them on a timer),
   and read `csat_survey` before you interpret any CSAT number at all. Do not rebuild what is
   already there. If `helpdesk_kb_categories_list` comes back empty, the KB has no structure yet:
   article creation requires a `category_id`, so on a fresh account the deflection plan below
   starts with `helpdesk_kb_categories_create({ name, parent_id? })` (slug auto-derives from the
   name; `parent_id` makes a sub-category) - create the 3-5 categories the contact-reason map
   implies before drafting the first article, not while drafting it.
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
   later is measured against this. Know the failure mode: `memory_create` returns 409 when the
   (domain, project_id) pair already exists. That is not an error to route around with a new
   name - it means the document exists, so `memory_list` to read it, merge, and `memory_update`
   with the whole merged body.

## Strategy (week 2)

Turn the baseline into an operating design and get sign-off:
- SLA targets by priority. Propose concrete numbers, do not leave them vague. A defensible
  default ladder: urgent first-response 1 hour / resolution 4 hours; high 4h / 1 business day;
  normal 8 business hours / 2 business days; low 2 business days / 5 business days. Adjust to
  the client's coverage hours - an SLA you cannot staff is a liability, not a promise. Once
  agreed, the ladder in memory is the contract; the weekly cadence diffs
  `helpdesk_automations_get.sla` against it so dashboard drift cannot silently change what
  "attainment" measures.
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
  answered ticket is time back. (Categories first on a fresh account - see step 5 above.)

Persist the agreed SLA, queue map, and priority rubric with `memory_create`, then
`pm_tasks_create` the week-1 build work (queues, first macros, first articles) with owners and
due dates. Check `pm_milestones_list` so support tasks hang off the right client milestone.
