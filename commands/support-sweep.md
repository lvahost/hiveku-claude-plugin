---
description: "Customers waiting too long? Full helpdesk queue triage - SLA breaches, new/unassigned, aging pending, each flagged ticket with the customer's history and a macro-based draft reply. Nothing sends without approval."
---
Queue sweep - the **hiveku-helpdesk-agency** skill's Play 1 end-to-end. Order matters: protect SLA
first, then reduce backlog. `/hiveku:tickets` is the overdue-reply half of this pass; run this one
for the full morning triage.
1. Context: `account_context_get({ domain: "helpdesk" })` for brand voice and the account's priority
   rubric (it lives in helpdesk memory, not in any tool - no rubric on file means propose one and
   persist it), plus `helpdesk_automations_get` for the config this sweep must respect: `sla`,
   `auto_assign`, `auto_close`, `auto_acknowledge`. That config is read-only via Olympus by design -
   a rule change is a pm_task routed to the dashboard, never a tool call. Demand that arrived
   outside the widget (a call, a forwarded email) gets ticketed FIRST so the sweep works the real
   queue: `crm_search_contacts({ search })` before `helpdesk_ticket_create` (an unknown
   `contact_email` lazy-creates a duplicate contact; there is no `contact_phone` at all), and
   confirm with the user before creating - the create fires the account's auto-acknowledge/
   auto-assign/SLA automations and can email the customer on its own.
2. Breaches first: `helpdesk_tickets_overdue({ kind: "first_response", limit: 500 })` then
   `({ kind: "resolve", limit: 500 })`. The default limit is 100, the max is 500, and the truncation
   is silent - a capped list reads as a healthy queue, so flag any list that returns at exactly its
   limit. Missed reply windows are the breaches customers feel; nothing else matters until every
   ticket here has a reply drafted (step 6) or an owner. This tool excludes resolved/closed - it
   shows current fires only and cannot compute last month's attainment number.
3. New and unassigned: `helpdesk_ticket_list({ status: "open", sort: "created" })`, paged with
   `page`/`limit` until a short page returns - report the count you enumerated, never a page size.
   Filter client-side for a null assignee: there is NO unassigned filter, and an invented
   `unassigned: true` is silently dropped, so the call succeeds and hands you the whole open list,
   which you then misreport as the unassigned queue. Set priority against the rubric
   (`helpdesk_ticket_set_priority`), then route: `helpdesk_ticket_assign({ id, assigned_to_id })`
   for a human or `({ id, queue_id })` for a queue, whose strategy picks the agent
   (`helpdesk_queues_list` shows strategy and member counts). The same misroute two mornings
   running is an automation gap - log it in step 8, do not keep hand-fixing it.
4. Aging `pending`: `helpdesk_ticket_list({ status: "pending", sort: "last_activity" })`. Check
   `auto_close` in the step-1 config FIRST - the account may already sweep these on a timer, and a
   manual chase stacked on an auto-close email double-messages the customer. Quiet ones get a
   polite follow-up draft (step 6) then a close proposal; `pending` must not become a graveyard
   that hides real backlog.
5. History at a glance, per flagged ticket (every breach, every urgent, every angry thread), before
   routing or wording anything hard: `helpdesk_ticket_list_for_contact` /
   `helpdesk_ticket_list_for_company` (first-time issue, or the fifth ticket from one account),
   `crm_contact_touch_history` (merged activity + sequence-email timeline),
   `crm_contact_engagement_summary` (value, last-inbound/outbound), and on a hard case
   `crm_email_thread_search({ q })` for what was already promised by email. Two open tickets from
   one customer for one issue: propose `helpdesk_ticket_merge({ id, merge_into_id })` - confirm
   BOTH ids with the user first; `id` is the SOURCE that gets closed with a merge note,
   `merge_into_id` survives, and backwards means you closed the wrong ticket.
6. Draft proposals, macro-first: group the flagged tickets by contact reason, then per ticket
   `helpdesk_macros_list` → `helpdesk_macros_get({ id })` for the raw `{{placeholders}}` →
   `helpdesk_macros_render({ id, variables })` - YOU build the variables map from the ticket, and a
   non-empty unfilled-placeholder list in the response means do not send; fill and re-render.
   `helpdesk_kb_suggest_articles({ q })` for citable links (public-only, while
   `helpdesk_kb_search` defaults to `visibility: "all"` and will hand you internal docs). Anything
   non-routine: write it yourself in the persona from `agent_identity_get({ domain: "helpdesk" })`.
7. THE GATE: present ONE approval list mapping ticket id → exact final text, plus every proposed
   assign, merge, priority change, and close. Nothing sends, merges, or closes without a yes, and
   the yes covers exactly the listed texts - nothing added or rephrased after. On approval act
   serially: `helpdesk_ticket_send_reply({ id, body })` (the ONLY tool that stamps
   `first_response_at` - an outbound `helpdesk_ticket_add_message` answers the customer but leaves
   the ticket a breach forever), verify each in `helpdesk_ticket_messages` before the next, stop on
   the first anomaly. Then `helpdesk_ticket_set_status` - `resolved` when done, `pending` when the
   ball is with the customer. A true escalation is `helpdesk_ticket_escalate_to_human`, which
   force-bumps priority to `urgent` and adds an "escalated" tag - it is not a routing tool; plain
   routing is `helpdesk_ticket_assign`.
8. Report + re-check: counts (breaches worked/owned, unassigned routed, pending chased, merges,
   escalations) logged to the triage task via `pm_tasks_update`; `pm_tasks_create` anything needing
   engineering, billing, or a KB article - a sweep that produces zero follow-up tasks means you
   missed the systemic issues. The sweep is a snapshot, not a feed - no delta or updated-since
   filter exists - so on a live queue re-run step 2 every hour or two, keep this pass's ticket ids,
   and report only what changed: new tickets, new breaches, priority changes.
9. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
