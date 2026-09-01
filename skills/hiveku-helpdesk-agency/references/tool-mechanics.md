# Tool mechanics - exact arguments, defaults, side effects, failure modes

Load this before any write you have not run this session, and whenever an argument or default
matters. The two silent wrong answers in this domain are invented filters and truncated lists:
an argument that is not in a tool's schema (`unassigned`, `ticket_id` on a macro render,
`macro_id` anywhere) is dropped by the mapping layer, so the call SUCCEEDS and returns something
plausible and wrong.

## Enums (exact, closed)
Ticket status is exactly `open | pending | resolved | closed`. Priority is exactly
`low | normal | high | urgent`. Channel is `email | chat | voice | sms`. Do not use Zendesk or
Intercom vocabulary - there is no "new", no "solved", no "pending-customer". A wrong status on
`helpdesk_ticket_set_status` is rejected; a wrong status on `helpdesk_ticket_list` just returns
nothing, which reads as an empty queue on an account that is drowning. `set_status` auto-sets
`resolved_at` / `closed_at` on the flip, so never try to write those timestamps yourself.

## helpdesk_ticket_create
`helpdesk_ticket_create({ subject, crm_contact_id | contact_email | contact_phone, channel,
priority, first_message, queue_id, tags, source_meta })`. Contact resolution precedence:
`crm_contact_id` -> `contact_email` -> `contact_phone` (one is required). An email or phone
that isn't on file lazy-creates a contact with `lead_source='helpdesk'` (a phone-created
contact has no email), so search CRM contacts first (`crm_search_contacts({ search })` -
full-text over first_name, last_name, email) or you duplicate a known customer. The phone
boundary is cross-channel identity: phones are normalized to E.164 before lookup, and multiple
contacts can legitimately share a phone (shared office lines - there is deliberately NO unique
index), so a multi-match resolves to the OLDEST contact and the 201 body includes
`contact_resolution { matched_by: 'phone', ambiguous: true }` - use `crm_contact_merge` to heal
the split rather than ignoring it. Two simultaneous tickets from the same unknown phone can
race into twin contacts (same race the email branch has). `first_message` attaches the
customer's opening message in the same call (`first_message_direction` defaults to `inbound`).
`channel` defaults to email EVEN when resolving by `contact_phone` - pass `channel: 'sms'` when
ticketing a texter (`'voice'` for a caller). `priority` defaults to normal; `tags` are
free-form labels. `source_meta` holds provider/thread_id for deduping
against an inbox. CONFIRM BEFORE CREATING: the create fires the `helpdesk_ticket_created`
workflow trigger and runs the account's auto-acknowledge / auto-assign / SLA automations, so it
can email the customer on its own. Read `helpdesk_automations_get` before back-filling anything
historical, or a customer gets an acknowledgement for a ticket they filed last month.

If a duplicate contact was already lazy-created, the remediation is
`crm_contact_merge({ winner_id, loser_id })`: it merges the loser INTO the winner (reparents
activities, deals, tags, suppressions; backfills blank winner fields from the loser) and
soft-deletes the loser in one transaction. It is DESTRUCTIVE - confirm both ids with the user
before calling, never derive them by guess.

## Email intake (gmail_*)
For a forwarded email, obtain the real thread before creating a ticket: `gmail_parse_forward`
splits a forward on Gmail's delimiter and returns the original prospect message;
`gmail_search_messages({ q })` takes Gmail query syntax (e.g. `from:foo@bar.com newer_than:7d`)
and returns message ID stubs; `gmail_get_thread` fetches the complete thread with every message
parsed, and `gmail_get_message` one message. Store the provider and thread id in `source_meta`
on the ticket. Dedupe is manual: `helpdesk_ticket_list` has NO source_meta filter, so pull the
contact's recent tickets with `helpdesk_ticket_list_for_contact` and compare subject and
`source_meta` (via `helpdesk_ticket_get`) before creating a second ticket for one thread.

## helpdesk_tickets_overdue
A ticket is here when `first_response_due_at` or `resolve_due_at` is in the past AND the
matching actual timestamp is missing; resolved and closed tickets are excluded. `kind` defaults
to `both`; `limit` defaults to 100 and maxes at 500, and a truncated list looks like a healthy
queue - always pass `limit: 500` and check whether the list came back at exactly its limit.
Run `kind: 'first_response'` before `kind: 'resolve'`: missed reply windows are the breaches
customers actually feel, and the two failures have different fixes. This tool shows LIVE
breaches only - historical attainment, resolved tickets included, is `helpdesk_sla_history`
below.

## helpdesk_sla_history
SLA attainment over a window - the historical complement to `helpdesk_tickets_overdue`.
Includes ALL ticket statuses: a ticket that breached and was later resolved still counts as a
breach, where overdue only shows live breaches - this is what makes last month's attainment
provable instead of a dashboard rumor. The window is over `created_at`: `from`/`to` ISO
datetimes, default trailing 30 days, max 92 days per call. Optional scoping by `assigned_to_id`
or `queue_id`; `group_by: 'assignee' | 'queue'` adds per-group breakdowns. Each ticket is
classified twice - first_response (`first_response_at` vs `first_response_due_at`) and resolve
(`resolved_at` vs `resolve_due_at`) - as `met | breached | pending | no_sla`. HONESTY CONTRACT:
attainment_pct = met/(met+breached); no_sla tickets (no SLA policy applied) and pending tickets
(deadline not yet expired) are EXCLUDED from that denominator, and both counts are reported
alongside the percentage so the exclusion is visible, never silent - quote them with every
figure. `median_first_response_minutes` / `median_resolution_minutes` are computed only from
tickets carrying the real timestamps - never imputed. Counts are whole-window, not
page-limited, so the truncation trap does not apply here.

## helpdesk_workload
Per-agent staffing snapshot - the quantity read beside `helpdesk_csat_stats` (quality per
assignee). For every assignee plus the unassigned bucket: open/pending counts,
currently-breached SLA counts (same predicates as `helpdesk_tickets_overdue`: due date passed,
actual timestamp missing, ticket still open/pending), and `oldest_open_at`. Counts are
whole-table grouped aggregates, never page-limited. The unassigned bucket is the null-assignee
view the ticket-list API cannot filter for - it retires the count-by-hand workaround of paging
the open list and filtering client-side (that filter survives only to enumerate WHICH tickets
to route; reconcile it against this bucket's count). Assignees whose user record is outside
this account return `name: null` with the id - report those rows by id, do not drop them.
Optional `queue_id` scopes every count to one queue.

## helpdesk_ticket_list
Filters: status, priority, channel, `queue_id`, `assigned_to_id`, contact, company. `sort`
accepts `last_activity` or `created` only. There is NO unassigned filter - an invented
`unassigned: true` is silently dropped, so the call succeeds and hands you the whole open list
which you then misreport as the unassigned queue. The unassigned COUNT comes from
`helpdesk_workload` (its null group is the unassigned bucket); filter client-side for a null
assignee only to enumerate which tickets to route, and reconcile against that count. The list is
paged (`page` / `limit`): page until a short page comes back and report the count you actually
enumerated, never a page size.

## helpdesk_ticket_add_message vs helpdesk_ticket_send_reply
The highest-stakes tool confusion in this domain. `helpdesk_ticket_add_message({ id, body })`
records an internal note (`direction` defaults to `internal`); `helpdesk_ticket_send_reply({
id, body })` sends to the customer. An internal note sent as a reply leaks context; a reply
logged as a note leaves the customer waiting. Beyond visibility there is an SLA consequence:
only `send_reply` stamps `first_response_at`. `add_message` with `direction: 'outbound'` does
NOT, so the ticket keeps showing up in `helpdesk_tickets_overdue` as a first-response breach
even though the customer was answered - permanently skewing the SLA attainment number the
retainer is sold on. Customer-facing text goes through `send_reply`, always. `add_message` also
defaults `author_kind` to `ai_agent`; pass `author_kind: 'user'` plus `author_id` when logging
on behalf of a human. Use `'user'`, not `'human'` - an unrecognised value falls back to
`ai_agent`, and a human reply stored as `ai_agent` is shown to the CUSTOMER as the bot and
replayed to the model as its own prior turn.

The first-response clock stops only for an outbound message that a human or the AI wrote AND
that was actually delivered. An auto-acknowledgement never stops it, an internal note never
stops it, and a row recording a failed or skipped send never stops it - so a first-response
number now measures a real person answering, not the autoresponder.

Verify after sending: a success response from `send_reply` proves the write, not the delivery.
Re-read `helpdesk_ticket_messages` and confirm the outbound row is in the thread and
`first_response_at` is now set (via `helpdesk_ticket_get`) before you report the customer
answered or move to the next ticket. `send_reply` refuses with 422 `no_recipient` when an email
or SMS ticket has no reachable address - pass `to` to override the recipient rather than
recording a reply nobody receives.

## helpdesk_ticket_merge
`helpdesk_ticket_merge({ id, merge_into_id })` is hard to unwind - `id` is the SOURCE and gets
closed, `merge_into_id` is the TARGET that receives the messages. Get them backwards and you
close the wrong ticket. Confirm the two really are one issue and one customer, and confirm which
one survives, before merging.

A system note is written on BOTH threads recording the merge, and the response returns
`messages_moved` plus `messages_deduplicated` - two tickets ingested from the same email thread
can carry the same provider message, and the duplicate is discarded rather than duplicated into
the target. Moved messages keep their original timestamps, so they interleave into the target
thread in real chronological order; the system note is what tells a reader where they came
from. A self-merge is refused.

## Macro mechanics
`helpdesk_macros_get({ id })` - the argument is `id`, not `macro_id` - returns the raw body with
all its `{{placeholders}}` showing; that raw body is how you learn which variables the render
needs. `helpdesk_macros_render({ id, variables })`: YOU build the variables map, from what
`helpdesk_ticket_get` gave you - the render tool has no awareness of tickets and takes no ticket
argument. The response returns `rendered_body`, `required_placeholders` (everything the
template asks for) and `unfilled_placeholders`: if that last list is non-empty, DO NOT send,
fill it and re-render. A variable you supplied as an EMPTY STRING counts as unfilled - sending
"Hi ," to a customer is the hazard this exists to catch. Do not try to eyeball the rendered body
instead: an unsupplied placeholder renders as a blank, not as a visible `{{token}}`, so a
half-filled macro looks like clean prose. Rendering does not send - it returns the resolved text
for you to review - but it does bump the macro's `usage_count`, which is the most-used sort
order, so pass `count_usage: false` for a dry run. It refuses with 400 on an `is_active=false`
macro. `helpdesk_macros_create({ title, body, description, tags })` - the
field is `title`, not `name`, and `title` + `body` are the required pair; supported template
vars are `{{contact_first_name}}`, `{{ticket_short_id}}`, `{{account_name}}`, `{{agent_name}}`,
`{{portal_url}}`. `helpdesk_macros_update` allow-lists title, body, description, tags,
is_active. `helpdesk_macros_list` filters: `is_active`, `tag`, `search`; sorted most-used first.

## KB mechanics
`helpdesk_kb_article_create({ title, body, excerpt, category_id, tags, visibility })` defaults
to `visibility: 'draft'` with `publish: false`, which is HIDDEN from search: creating an article
does not publish it, so never report a create as "published". `category_id` is required, and on
a fresh account with no categories, create one first with `helpdesk_kb_categories_create({
name, parent_id? })` (slug auto-derives from the name). The publish moment is
`helpdesk_kb_article_update({ id, visibility: 'public' })`, which AUTO-PUBLISHES to customers
immediately with no staging step; `internal` is agents-only. Publishing fires on the TRANSITION
into public, so re-saving an already-public article never moves its publish date, and an
explicit `published_at` in the same call always wins. `published_at` is tri-state - `null` to
unpublish, `true` to publish now, or an ISO datetime to backdate. Update allow-lists: title,
body, excerpt, visibility, category_id, tags, slug, publish, published_at. Read before you edit
(`helpdesk_kb_read_article`) so an update is a surgical edit, not a blind overwrite - it returns
the article at any visibility, so check the `is_customer_safe` flag before linking one to a
customer, and note that reading increments the view counter (which is why article view counts
are not worth reporting).

`helpdesk_kb_search({ q, visibility })` takes `public | internal | draft | all` and defaults to
`all`, which means public + internal - DRAFTS ARE EXCLUDED unless you ask for `visibility:
'draft'`. It still returns INTERNAL articles by default, so visibility-check by hand before
linking anything. `helpdesk_kb_suggest_articles({ q })` is the safe link-picker for outbound
replies: it returns only articles that are BOTH public AND actually published, so it cannot
surface an internal doc or an unpublished draft. Both take a natural-language question and match
on tokens, not on the sentence as one literal string, and both return `matched_keywords`.

Categories are full CRUD: `helpdesk_kb_categories_create` / `_update` / `_delete` / `_list`.
Renaming does NOT change the slug - that slug is a live help-centre URL - so pass `slug`
explicitly or `regenerate_slug: true` when you mean to change it. Deleting a category that still
holds articles or subcategories is refused with 409 and the counts; pass `reassign_to` to move
the contents, or `force: true` to accept that articles become uncategorised.
`helpdesk_kb_article_delete` permanently deletes - prefer `published_at: null`; delete only
named junk or duplicates, never targets derived by age or pattern.

## Queue mechanics
`helpdesk_queues_create({ name, description, strategy, fixed_user_id?, is_active })`: `strategy`
is `round_robin` (cycle members) | `least_busy` (the member with the fewest open tickets) |
`fixed_user` (always `fixed_user_id`, which is REQUIRED for that strategy or the create fails),
defaulting to `round_robin`. `helpdesk_queues_update` patches the same strategy fields, so a
load-balance problem is often a one-field fix from `round_robin` to `least_busy` rather than a
new queue. `helpdesk_queues_add_member({ queue_id, user_id, role? })` accepts any user on the
account, including teammates who joined by invitation; it returns 409 if they are already a
member, and 400 `user_not_in_account` if they are not on the account at all. Assignment targets
(`helpdesk_ticket_assign`, `queues_create({ fixed_user_id })`) are validated the same way and
reject an unknown user rather than silently dropping the field; `helpdesk_queues_remove_member({ queue_id, user_id })` does NOT unassign that user's
existing tickets - they stay with the person after they leave the queue.
`helpdesk_queues_delete` orphans every ticket still pointing at the queue - reassign them first,
and prefer `is_active: false`. `helpdesk_queues_get({ id })` shows one queue's current active
member list; `helpdesk_queues_list` filters `is_active`.

## helpdesk_automations_get
Returns `auto_acknowledge`, `auto_assign`, `notify_team`, `first_response_sla` and
`resolve_sla` (TWO separate SLA configs, not one `sla` key), `sla_escalation`, `csat_survey`,
`csat_review_ask`, `auto_close`, `reply_channel` and `reply_routing`, plus the widget config.
There is no auto-tagging config in that payload.

Defaults are applied, so an account that has never opened its settings still reports what is
actually running - `auto_acknowledge`, both SLA configs, `sla_escalation` and `auto_close` all
default to ENABLED. Do not read a quiet config as "nothing is automated here".

`notify_team.slack_webhook_url` is never returned - it is a credential, and this is a read whose
output lands in your transcript. You get `slack_webhook_configured` and `slack_webhook_last4`
instead, which is enough to answer "will escalating this ping the team?". It is read-only via
Olympus - writes go through the dashboard because misconfiguring these has tenant-wide impact.

## CSAT mechanics
Ratings are `great | ok | not_great` and `csat_score = great / total`, so an "ok" counts
AGAINST the score. `helpdesk_csat_stats({ since })` returns totals (with `response_count`), a
per-assignee breakdown sorted by `csat_score` desc, and per-source counts.
`helpdesk_csat_list({ assigned_to_id, since })` returns individual responses with ticket_id,
rating, feedback, and source. No tool returns surveys-sent, so a response RATE has no
denominator - report the count.

## Memory mechanics
`memory_create` accepts only `type: memory | skill | rule | command | agent | identity`; there
is no `report` or `baseline` type and anything else is a 400. It returns 409 when the (domain,
project_id) pair already exists - that means the document exists: `memory_list({ domain:
'helpdesk' })` to read it, merge, then `memory_update({ memory_id, content })` with the whole
merged body, because `memory_update` REPLACES the whole document. If one gets clobbered,
recover with `memory_list_versions({ memory_id })` then `memory_restore_version({ version_id })`.
Durable policy belongs in the `helpdesk` document itself - that is the one hydration loads.

## CRM context and mirroring
`crm_contact_touch_history` - chronological merged timeline of activities plus sequence email
events for a contact, newest-first, capped at `limit` across both sources.
`crm_contact_engagement_summary` - single-call read-only snapshot: emails sent/received,
opens/clicks, meetings/calls/notes/tasks, last-inbound/outbound timestamps, active sequences.
`crm_email_thread_search` - searches CRM-stored email activities by subject or body substring
(distinct from the live external-CRM search tools). `crm_create_activity` - logs a note, call,
email, meeting, or task linked to a contact, company, or deal; this is how support history
becomes visible on the CRM timeline the sales side actually reads.

## Workflow rail (SLA alerting and observability)
The `workflow_` prefix is in the helpdesk key profile. `workflow_event_trigger_types_list`
enumerates every internal-event trigger node grouped by domain - the helpdesk group covers
ticket events (assigned, resolved, and the rest) with the exact node `type` strings and the
`trigger.output` shape for templating; use it BEFORE wiring a trigger. `workflow_create` takes a
complete ReactFlow-style graph and needs exactly one trigger-category node; its own description
steers you to build incrementally with node/edge add tools instead. `workflow_test` runs a SAFE
DRY-RUN (`test_mode`): no outbound email/SMS/Slack, no CRM writes, no helpdesk ticket creates or
replies fire, while transforms, templating, and flow control still run. `workflow_enable` /
`workflow_disable` flip `is_enabled`. For observability: `workflow_runs_recent` is the
account-wide recent-runs feed (filter status=failed to find which workflow tripped without
iterating), and `workflow_run_logs` returns the per-node lifecycle trace of one run (config /
starting / retry / timeout / completion, capped at 50 lines per node) - including whether a
test-mode short-circuit fired. `workflow_triggers_list` lists the triggers configured on one
workflow. Caveat: only automations that run on the workflow engine appear in the runs feed; the
built-in helpdesk automations config (`auto_acknowledge`, `sla`, ...) is a separate,
dashboard-managed system, so if a built-in behavior misfires and nothing shows in
`workflow_runs_recent`, diagnose it in the dashboard, not the runs feed.

## agent_identity_get
`agent_identity_get({ domain: 'helpdesk' })` returns the full hydration the live agent would
get: the support persona, brand guide, account memory, every skill and rule tagged helpdesk,
avatars, journeys, KB index, plus cross-domain memory. `format: 'markdown'` gives a
ready-assembled CLAUDE.md under `data.content` if you are spending the whole session in
support.

## Introspection
`audit_query` reads this account's MCP audit log: every MCP tool call writes a row with the
key preview, tool name, sanitized args summary, status (success/error/rate_limited), duration,
IP, and user agent. Filters compose with AND (`tool_name`, `tool_contains`, `args_contains`,
`status`, `since`). It is the answer to "what did my last call actually do", "which key deleted
that", and the verification backstop when a write's result is ambiguous.
