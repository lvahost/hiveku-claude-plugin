# Recipes: proven shapes for the tedious problems people actually bring

Load this when someone describes a chore rather than a workflow: "every time someone
fills out the form...", "I keep forgetting to follow up", "nobody told me the lead came
in", "I rebuild this report every Monday", "we found out three weeks later". Match the
complaint to a recipe and execute it instead of inventing a design.

Every recipe uses the same seven headings. Where a node `type` or trigger must be looked
up rather than remembered, the step says "discover" and names the discovery tool.

## How to choose

1. **A shipped template covers it.** `workflow_templates_list`, read the chosen
   template's `variables[]`, then `workflow_create_from_template`. Already tested,
   already staged behind the approval queues (`references/templates.md`). Recipes 1, 9,
   13 and 14 are template-first.
2. **A recipe below covers it.** These shapes are here because the tool surface
   genuinely supports them.
3. **Neither.** Hand-build with the SKILL.md build loop, using the closest recipe as the
   skeleton (trigger, fan-out, gate, notify). Never invent a node type to fit a design.

First, always: check `workflow_list`. `workflow_clone` / `workflow_duplicate` beats
building, and the client may already have the automation they are asking for.

## Hard rules (these do not bend for any recipe)

- **Never enable without a passing dry run, and dry-run BEFORE you enable.**
  `workflow_validate`, `workflow_test`, read `would_have`, then `workflow_enable`.
  A dry run works on a DISABLED workflow, so there is never a reason to arm a graph
  you have not tested. Each recipe's "Prove it works" names the field to read. "It
  validated" is not proof.
- **Never guess a node `type`, a trigger type, or a `{{...}}` path.**
  `workflow_node_types_list` for actions, `workflow_event_trigger_types_list` for
  internal events (read `output_shape_keys`), `workflow_trigger_types_list` before
  `workflow_trigger_create`, `workflow_templating_syntax` before any expression. The
  palette moves every deploy; a type string you remember is one you are guessing.
- **Always pass an explicit IANA `timezone` on every schedule.** It defaults to UTC. A
  Denver client's 9am Monday report lands at 2am Monday without it.
- **Enabling a `webhookTrigger` or `scheduledTrigger` graph makes it LIVE.** Get the
  operator's yes to the automation itself, not merely to the run gate.
- **Anything reaching a customer needs an explicit human yes**: enable on a live
  trigger, `workflow_run` in real mode, `workflow_stranded_replay`, `workflow_delete`,
  `workflow_delete_schedule`, `agent_approval_approve`.
- **`waitForApproval` does not work.** It is one of seven `isComingSoon` stubs (with
  `executeCode`, `executeExpression`, `waitForWebhook`, `manualCheckpoint`,
  `googleSheets`, `asana`). Recipe 11 is the approval pattern that does work.

## The shared spine (assumed by every recipe, never repeated)

```
account_context_get({ domain: 'workflow' })   persona, voice, rules, which forms are the money forms
workflow_list                                 already built? clone beats build
<discovery: node types / event triggers / templating syntax>
workflow_create({ name, description })        disabled by default, leave it
workflow_node_add  x N                        explicit short id per node ('trigger', 'notify', 'upsert')
workflow_edge_add  x N                        sourceHandle only for conditional ('true'/'false') and switch
workflow_validate                             fix every error, read every warning
workflow_test({ input_data })                 STILL DISABLED. read would_have off the response
workflow_enable                               LAST, and only on the operator's yes
workflow_dashboard_url                        hand the human the editor link
```

Name it so a confused operator six weeks later knows what it is; one-shot diagnostics take
the `adhoc/<yyyy-mm-dd> <what it did>` prefix and get deleted. Two shapes four recipes
depend on. **Fan out from the trigger, do not chain**: wire the notification and the CRM
write as siblings, because chained, a hiccup in the CRM write kills the notification
(default `on_error: 'fail'` stops the whole downstream path) and the visitor sees
"Submission failed". And **collect automatically, decide manually**: the workflow gathers,
diffs and stages, a human interprets and applies. Every recipe touching money, ad spend,
or a customer's inbox is built that way on purpose.

---

## R1. Website form to CRM plus a notification

**They say.** "Someone filled out the contact form Tuesday and nobody saw it until
Friday." / "Every time someone fills out the form, email Sarah."

**What this actually is.** Webhook trigger fanning out to a contact upsert and a
notification, both hanging directly off the trigger.

**Preconditions.** The form is on a Hiveku-managed project (`list_projects`), posts to a
`NEXT_PUBLIC_*_WEBHOOK_URL` env var, and uses `name` attributes on its fields
(`workflow_bind_form` is regex-based, not AST-based). You know the real recipient from
`account_context_get` or the operator, not from a guess.

**Build.**
1. Template first: `workflow_create_from_template({ slug: 'contact-form-canonical',
   overrides, is_enabled: false })`, or `quote-form-canonical` / `newsletter-canonical`.
   It auto-provisions the webhook trigger and returns `webhook_url`. For every form on a
   site: `workflow_bulk_provision_for_project({ project_id, dry_run: true })` FIRST and
   read `skipped`, because a skipped form is a form whose leads go nowhere. `overrides`
   apply to the whole batch, so per-form recipients need one
   `workflow_create_from_template` plus `workflow_bind_form` each instead.
2. Hand-building: discover with `workflow_node_types_list`. The shape is `webhookTrigger`
   fanning out to `crmUpsertContact` (idempotent on email, revives soft-deleted matches,
   the palette's own guidance for any repeat-submitter flow) and to `sendEmail` or
   `slackNotification`, as siblings.
3. Paste a real sample submission through `workflow_normalize_payload` before writing a
   single `{{...}}`. Its `added_aliases[]` tells you what
   `{{trigger.output.payload.email}}` actually reaches on a mixed-case vendor form. Then
   `workflow_bind_form({ ..., dry_run: true })`, read the warnings, real call.

**Prove it works.** `workflow_test({ input_data: { payload: {<a real submission>} } })`.
In `would_have`: the `crmUpsertContact` payload's `email` is the submitter's address,
not the literal string `{{trigger.output.payload.email}}`; the notify node's `to` is the
real recipient, not a stale template default. An unresolved `{{...}}` is written through
as literal text rather than erroring, so this read is the whole test.

**Ship.** Confirm the recipient, enable, submit the live form once yourself, read
`workflow_runs_recent`. Record the recipient decision with `memory_create`.

**How this fails in the wild.** A 401 on the form POST. The trigger's
`config.authentication` gates the webhook, not the workflow-level `authRequired` flag,
and a public lead form must be `authentication: 'none'`. Symptom: 401 in the browser
console and an empty `workflow_runs_list`, which reads exactly like "the automation is
broken". Fix with `workflow_trigger_update({ config: { authentication: 'none' } })`.
Detail: `references/form-wiring.md`.

---

## R2. Speed to lead on a missed call

**They say.** "We miss calls all day and those people just call the next guy."

**What this actually is.** Missed-call event trigger fanning out to an SMS back and a
CRM task for the rep.

**Preconditions.** `voice_numbers_list` (the number is owned here) and
`voice_sms_registration_get` (10DLC or toll-free verification APPROVED, or the texts are
filtered and you will debug the workflow instead of the registration). DNC discipline
via `crm_get_dnc_status`. Load **hiveku-phone-agency** before wiring an `sms` node; caps,
quiet hours, STOP suppression and opt-outs live there.

**Build.**
1. `workflow_event_trigger_types_list`, pick `voiceMissedCallTrigger`, read its
   `output_shape_keys`. Do not assume the caller-number key name.
2. `workflow_node_types_list` for the actions. The trigger fans out to `sms` and to
   `crmCreateTask` (or `crmLogActivity`), siblings, not chained.
3. Draft the SMS body through `talk_to_department({ domain: 'workflow' })` so it carries
   the account's voice, then persist it into the node config.

**Prove it works.** In the `sms` node's `would_have`: `to` is an E.164 number and not
blank, and the body has the caller's name resolved rather than "Hi ,". Confirm the
presented FROM is the client's tracked number.

**Ship.** The operator approves the exact SMS text verbatim before you enable. This one
texts strangers within seconds of a missed call, so there is no soft launch.

**How this fails in the wild.** The text never arrives and the run is green. That is
registration, not the workflow: an unapproved 10DLC campaign gets messages accepted and
silently dropped by the carrier. Early symptom: run `completed`, zero delivery,
`voice_sms_registration_get` showing anything but approved.

---

## R3. Routing a new lead to the right owner

**They say.** "Leads all land in one inbox and the wrong person picks them up." /
"Roofing enquiries go to Mike, everything else to the front desk."

**What this actually is.** Lead trigger, a `switch` on one field, a different notify and
owner assignment per branch, plus a default branch so nothing falls through.

**Preconditions.** The routing field exists and is populated (`crm_list_custom_fields`,
or the form's real field names via `workflow_normalize_payload`); the owners exist
(`crm_list_users`). Routing on a field that is blank half the time sends half the leads
to default. That is a data problem, not an automation problem. Say so before building.

**Build.**
1. Discover the trigger: `crmContactTrigger` or `crmContactLeadStatusChangedTrigger` via
   `workflow_event_trigger_types_list`, or reuse R1's `webhookTrigger` when the form is
   the source. Read `output_shape_keys`.
2. `workflow_node_types_list` for `switch`. Its `outgoingHandles` are dynamic: one per
   `switchConfig.cases[].handleId` plus `switchConfig.defaultHandleId`, and every
   outgoing `workflow_edge_add` MUST set `sourceHandle` to one of them. Two branches
   only? Use `conditional`, whose handles are `'true'` and `'false'`.
3. Per branch: `crmUpdateContact` to set the owner, plus `slackNotification` or
   `sendEmail`. Always wire the default handle; an unwired default is a dropped lead.

**Prove it works.** Dry-run once per branch INCLUDING the default, with `input_data` that
should land there, and confirm the notification that fired is the one you expected. A
branch that never fires is usually a missing or misspelled `sourceHandle`, which
`workflow_validate` reports only as a warning.

**Ship.** Enable, then watch day one with `workflow_run_summary({ workflow_id, since })`
and check the branch distribution matches the business.

**How this fails in the wild.** Everything lands in default. Early symptom: one branch's
channel is silent while volume looks normal. The cause is almost always the routing field
being named differently on the trigger payload than in the CRM. There is no verified
round-robin node; if the client wants "whoever is next up", say so and route on a field.

---

## R4. The Monday morning digest

**They say.** "I rebuild the same pipeline summary every Monday and it takes an hour."

**What this actually is.** `scheduledTrigger`, one or two report-shaped read nodes, a
formatter, one email.

**Preconditions.** The data exists (`crm_list_pipelines`, `crm_pipeline_stage_summary`),
and you have the recipient list plus the client's timezone in IANA form, from the
operator.

**Build.**
1. `workflow_node_types_list`. Verified report-as-node types: `crmPipelineSummary`,
   `crmActivitySummary`, `crmConversionFunnel`, `crmStageTransitions`. Read each
   `fields[]` for the window arguments.
2. `scheduledTrigger` to the report node(s), into `templateString` or `transformData` to
   compose the body, into `sendEmail`. There is no arithmetic and no concatenation inside
   a `{{...}}`; compose in `transformData`.
3. `sendEmail` reads FLAT off `data` first, falling back to `data.config`. Write `to`,
   `subject` and `body` both flat AND under `data.config`, then re-get the node to
   confirm the field landed. Then `workflow_set_schedule({ workflow_id, cron_expression:
   '0 9 * * 1', timezone: 'America/Denver' })`, five-field cron only.

**Prove it works.** Read the `sendEmail` node's `would_have`: `to` is the real
distribution list, `subject` has the date resolved, and the body carries actual numbers
rather than an empty section where a report node returned nothing. An empty section in a
dry run is a real finding, not a test artifact.

**Ship.** `workflow_get_schedule` and check `next_run_at` reads as the local time the
client expects. Enable, and tell the operator the first delivery date and time in their
timezone.

**How this fails in the wild.** It arrives at 2am, from the UTC default. Or it never
arrives with a perfect cron: **a disabled workflow's schedule does not fire**. A `null`
from `workflow_get_schedule` means there is no `scheduledTrigger` node at all, and the
cron may live on the other rail entirely (`project_crons_list`, incompatible syntax,
`references/project-crons.md`). For a **branded client report** that regenerates and
emails itself, do not hand-build: `marketing_report_create` with a cadence stamps
`next_scheduled_at` and the scheduler delivers it (marketing and social report types
only; no branded rail exists for books, PPC or helpdesk numbers).

---

## R5. Chasing a record that has gone stale

**They say.** "Deals just sit there and nobody notices." / "We forget to follow up and
the lead goes cold."

**What this actually is.** A scheduled sweep that finds the stale records and stages a
task per record. It does NOT send the follow-up. Automate the finding; keep the outreach
human.

**Preconditions.** Staleness is a number of days per stage that the OPERATOR defines,
written down, not inferred. Size the problem first with the direct tools:
`crm_deals_stuck`, `crm_deals_at_risk`, `crm_contacts_stale`, `crm_contacts_gone_cold`.
If those return nothing at the operator's threshold, there is nothing to automate and you
should say so.

**Build.**
1. `workflow_node_types_list`, read the `fields[]` on `crmListDeals` (or
   `crmListContacts`) for the real filter keys. Do not assume an age filter exists; if
   the node cannot filter by age, filter downstream with `filterArray` on a date field.
2. `scheduledTrigger` to `crmListDeals`, to `filterArray`, to `forEach`, to
   `crmCreateTask` (or `mcTaskCreate`, which is replay-safe: a retried run reuses the
   first card). Or one `sendEmail` digest at the end instead of N tasks.
3. Weekly with an explicit timezone. A daily stale sweep trains people to ignore it.

**Prove it works.** Read the terminal output for the record COUNT the sweep would act on.
400 means your threshold is wrong and you are about to create 400 tasks; 0 means your
filter is wrong. Then read one `would_have` from the task node and confirm the title
names the specific deal rather than a blank merge.

**Ship.** Show the operator the count and three sample task titles before enabling.

**How this fails in the wild.** The first run creates hundreds of tasks because the sweep
has no floor and every historically-dormant record qualifies on day one. Early symptom:
the dry-run count is far larger than the operator's mental model. Cap the first run with
`batchArray` or a tighter date floor, or run it once manually and let the backlog be
worked before the schedule takes over. Note `mcTaskComment` has no replay protection, so
a resumed run posts a second comment; `mcTaskCreate` does not.

---

## R6. Escalating when something crosses a threshold

**They say.** "We blew through the ad budget and found out on the invoice." / "A ticket
sat unanswered for two days."

**What this actually is.** A threshold trigger (or a scheduled check node), a
`conditional` on severity, and an alert with an owner. Not an automatic corrective action.

**Preconditions.** Ad spend: `ppc_connection_list` shows a live connection. Support:
`helpdesk_automations_get` FIRST, because the account's config may already do
`auto_acknowledge` and SLA escalation, and a second one means the customer gets two. That
config is read-only via Olympus; writes go through the dashboard.

**Build.**
1. Discover with `workflow_event_trigger_types_list` and `workflow_node_types_list`.
   Verified threshold-shaped entry points: `ppcBudgetThresholdTrigger`,
   `disapprovalTrigger` (fires on the crossing only, gated on the deduped ops-inbox row,
   Google Ads only on the daily sweep today). For support SLA the check-node route is
   `scheduledTrigger` to `mcSlaBreached` into a `conditional`.
2. Alert leg: `slackNotification` or `sendEmail`, plus `mcTaskCreate` so the escalation
   has an owner and a paper trail.
3. Do NOT wire a corrective write on the true branch. `ppcPauseResource` and
   `ppcBudgetUpdate` exist, and every PPC write defaults `auto_apply` OFF, staging an
   approval item instead of spending. Leave it off. Turning it on converts a review queue
   into unsupervised changes to a live ad account.

**Prove it works.** Dry-run the true AND the false branch. On true, `would_have` on the
alert node names the specific campaign or ticket and the actual number that breached; on
false, nothing fires. An alert that cannot say WHICH thing breached gets muted in a week.

**Ship.** Enable, and agree with the operator what the alert means they will do. An
escalation nobody owns is noise.

**How this fails in the wild.** Alert fatigue from too tight a threshold, then the channel
is muted and the real breach is missed. Or the alert fires correctly, a staged PPC item
lands in `agent_inbox_list`, nobody works the queue, and the client sees an automation
that "does nothing". Working that queue means applying through the PPC surface and THEN
`agent_inbox_resolve`; resolving never executes the item.

---

## R7. Reacting when a deal is won

**They say.** "When we close a deal, six things have to happen and one always gets missed."

**What this actually is.** A deal-stage-changed trigger, a `conditional` gating on the won
stage, and a fan-out of the six things.

**Preconditions.** `crm_list_pipelines` for the real stage names and UUIDs on THIS
account; stage names are per-account. And the trigger needs a live backend emitter:
several CRM triggers are authorable but silent without one, which looks exactly like a
broken workflow. `workflow_event_trigger_types_list` says so per entry. Confirm first.

**Build.**
1. Pick `crmDealStageChangedTrigger` (snake_case canonical
   `crm_deal_stage_changed_trigger`) and read `output_shape_keys` for the exact key
   carrying the new stage.
2. `conditional` on the won stage, edges with `sourceHandle: 'true'` / `'false'`.
   `workflow_validate` reports an invalid source handle only as a WARNING, so a wrong
   handle saves and enables cleanly and the branch never runs.
3. Fan out off the true handle as siblings: `crmLogActivity`, `createTask` or
   `mcTaskCreate` for onboarding, `sendEmail` announcement, `slackNotification`. Set
   `on_error: 'continue'` on the non-critical legs so a Slack outage cannot kill the
   onboarding task.

**Prove it works.** Dry-run a won deal and a stage change that is NOT won. On the won run
read every leg's `would_have` and confirm the deal name and amount resolved; on the
other, confirm the true branch produced nothing.

**Ship.** Enable, then close one real low-stakes deal and read `workflow_run_get`'s
`step_states`. On that green run read `unresolved_templates` in each step before calling
it correct: a run can be `completed`, look perfect, and still have sent blanks.

**How this fails in the wild.** It fires on every stage change, because the conditional
compares a stage NAME against a trigger emitting a stage UUID (or the reverse). Early
symptom: the internal announcement goes out when a deal moves to Proposal.

---

## R8. Acknowledging and triaging a new ticket

**They say.** "People email support and hear nothing for a day."

**What this actually is.** Ticket-created trigger, a priority conditional, an internal
note plus an assignment, and an alert on the urgent branch.

**Preconditions.** `helpdesk_automations_get` FIRST. If `auto_acknowledge` is already on,
build the triage half only. `helpdesk_workload` and `helpdesk_queues_list` for who and
where. Load **hiveku-helpdesk-agency** for reply and SLA methodology; this is the wiring.

**Build.**
1. `helpdeskTicketCreatedTrigger` via `workflow_event_trigger_types_list`, read
   `output_shape_keys`.
2. `conditional` on priority, or on a keyword match computed upstream in `transformData`
   (there is no conditional logic inside a `{{...}}` expression).
3. Urgent branch: `helpdeskSetPriority`, `helpdeskAssignTicket`, `slackNotification`.
   Normal branch: `helpdeskAddInternalNote` (never customer-visible) plus assignment.
   `helpdeskSendReply` IS customer-visible: use it only for an acknowledgement the
   operator approved verbatim, and only if `auto_acknowledge` is off.

**Prove it works.** Dry-run both branches. Read `would_have` on `helpdeskAssignTicket` and
confirm the assignee id is a real agent, not an empty string. If you wired
`helpdeskSendReply`, read its `would_have` body word for word and show it to the operator:
that text goes to a customer who is already annoyed.

**Ship.** Operator approves the reply text and the assignment map, then enable.

**How this fails in the wild.** The customer gets two acknowledgements, one from helpdesk
config and one from your workflow, and it reads as a broken system on their very first
contact. Early symptom: `helpdesk_automations_get` shows `auto_acknowledge` true and you
did not read it before building.

---

## R9. Answering a new review inside the SLA

**They say.** "A one-star review sat there for a week."

**What this actually is.** Template territory. `new-review-response` (event trigger) and
`gbp-review-sla-escalation` (daily) both ship.

**Preconditions.** GBP is connected (`seo_connections_health`) and `seo_gbp_reviews`
returns actual rows. Load **hiveku-seo-agency** for the reply methodology.

**Build.**
1. `workflow_templates_list`, read `variables[]` for both slugs, then
   `workflow_create_from_template({ slug, overrides, is_enabled: false })`.
2. Hand-building instead: `newReviewTrigger` (6h GBP sync, filterable by rating below)
   into a `conditional` on rating, into `slackNotification` plus `mcTaskCreate` on the
   negative branch.
3. `gbpReviewReply` DRAFTS an ops-inbox item for human approval; it never posts to
   Google. That is the safety property, not a limitation to route around.

**Prove it works.** Dry-run a 1-star and a 5-star payload. Confirm the negative branch
alerts and the positive one does not (or routes to a review-request play instead). Read
`would_have` on any drafted reply and check it against the brand voice from
`account_context_get`.

**Ship.** `workflow_create_from_template` defaults `is_enabled` to **true**, so it is live
the moment the call returns. Pass `is_enabled: false`, review, then enable.

**How this fails in the wild.** The client believes replies post automatically. They do
not: `gbpReviewReply` stages, and somebody has to work `agent_inbox_list`. Say that at
handover, or the SLA is worse than before because everyone assumes it is handled.

---

## R10. The periodic data hygiene sweep

**They say.** "The CRM is a mess." / "We have the same person in there four times."

**What this actually is.** A scheduled sweep that REPORTS. It never merges, deletes, or
bulk-edits.

**Preconditions.** Size the problem by hand first: `crm_contacts_duplicates`,
`crm_contacts_missing_field`. If the duplicate count is five, this is a ten-minute manual
job and an automation is the wrong answer.

**Build.**
1. `scheduledTrigger` into read nodes discovered from `workflow_node_types_list`
   (`crmSearchContacts`, `crmListContacts`, `crmListDeals`), into `transformData` or
   `generateCSV`, into one `sendEmail` digest.
2. Do NOT wire a merge or a delete. Merging destroys history and no undo restores the
   merged-away timeline. The direct tool is `crm_contact_merge` and it belongs in a
   human's hands.
3. Monthly with an explicit timezone. Weekly hygiene mail gets filtered.

**Prove it works.** Read the digest body in `would_have`. It contains the actual duplicate
pairs or missing-field counts, not a header over an empty table. An empty table in a dry
run means your read node's filters are wrong.

**Ship.** Enable. Agree who owns acting on the digest.

**How this fails in the wild.** It becomes wallpaper: nobody acts by month three and by
month six it is a filter rule. Mitigate with a small specific digest (the ten worst)
rather than a full export.

---

## R11. An approval-gated action

**They say.** "I want it automatic, but I want to see it before it goes out."

**What this actually is.** The workflow prepares and STAGES; a human applies through a
separate surface. There is no in-graph pause-for-approval node: `waitForApproval` is an
`isComingSoon` stub whose handler returns an error.

**Preconditions.** You know which staging surface the client actually watches. There are
five and they are not interchangeable.

**Build.** Pick the surface by what is being approved, then wire the trigger, the read and
compose nodes, and the staging node as the TERMINAL step with nothing downstream of it.

| What is staged | How it stages | Where a human applies it |
|---|---|---|
| A PPC change (negative keyword, budget, bid, pause) | any `ppc*` write node with `auto_apply` OFF (the default) seeds one inbox item per node per period | the PPC surface, THEN `agent_inbox_resolve` |
| A GBP review reply | `gbpReviewReply` drafts an ops-inbox item, never posts | `agent_inbox_list` |
| A social post | `socialCreatePost` is draft state by default | `socialApprovePost` / `socialRejectPost`, then `socialPublishPost` |
| A judgment call with no other home | `mcTaskCreate` opens a Mission Control card | the board, `mc_task_decide` |
| A production deploy or repo push | staged by the coder-agent rail | `agent_approval_approve`, two-step confirm, EXECUTES FOR REAL |

**Prove it works.** Read the staging node's `would_have`: the staged item's summary must
be readable by a human who was not in this session and must name the specific object being
changed. A staged item reading "apply 14 changes" with no list gets approved blind, which
defeats the whole design.

**Ship.** Enable, then tell the operator explicitly: this stages, it does not apply, and
name the queue they have to work. Write that into `memory_create`.

**How this fails in the wild.** Two ways, both bad. Nobody works the queue, so the client
sees an automation that "does nothing". Or someone flips `auto_apply` on to "make it stop
asking", converting a review queue into unsupervised ad spend. Never approve an
`agent_approval_*` item as housekeeping: `agent_approval_approve` deploys code to a live
production site.

---

## R12. Cross-system: a failed subscription payment

**They say.** "We only find out a customer's card failed when they cancel."

**What this actually is.** A commerce or billing event trigger, a CRM write so the signal
lands where humans already look, and an alert with an owner.

**Preconditions.** `shopify_status` (or `connections_status` / `integration_list`) is live
and returning the account you expect. On a multi-shop account, most Shopify trigger nodes
accept a `connectionId`.

**Build.**
1. `workflow_event_trigger_types_list`. Verified: `shopifySubscriptionBillingFailedTrigger`
   (the palette calls failed billing the number one churn signal),
   `shopifySubscriptionCancelledTrigger`, `shopifyOrderCreatedTrigger`, and on the Hiveku
   billing side `billingPaymentTrigger` (received / refunded / failed) and
   `billingInvoiceTrigger` (sent, viewed, paid, partially paid, voided, overdue, payment
   failed, refunded). Read `output_shape_keys` for the one you pick.
2. Fan out: `crmUpsertContact` or `crmAddTag` so the CRM shows the at-risk flag,
   `crmCreateTask` for the save call, `slackNotification` for the channel that acts today.
3. Do NOT wire an automatic customer email on a payment failure without the operator
   reading the copy. Dunning mail firing on a transient card decline reads as dunning mail.

**Prove it works.** `would_have` on the CRM leg carries the customer's real email; a blank
there means the trigger key you referenced does not exist, and a real run would write a
contact whose address is the literal template string.

**Ship.** Enable, and confirm the Slack channel is one somebody reads.

**How this fails in the wild.** Duplicate contacts, because the commerce email does not
match the CRM email casing or the customer used a different address. `crmUpsertContact` is
idempotent on email and is the right node here. `crmCreateContact` also converges on an
existing contact rather than throwing, but deliberately skips the write-once
`original_lead_source` / `original_utm_*` fields so first-touch attribution survives. Pick
deliberately.

---

## R13. A recurring content or social cadence

**They say.** "We keep meaning to post and then a month goes by."

**What this actually is.** A scheduled draft-generation run whose output lands in draft
state for a human to approve. Never a scheduled auto-publish.

**Preconditions.** `social_list_accounts` and `social_provider_list` show a connected
account that can receive a post; `social_schedule_slot_list` for the slots the client
already uses; `account_context_get` for brand voice; `marketing_frequency_cap_get` so you
do not exceed the account's own cadence rules. Load **hiveku-social-agency** for the
editorial methodology.

**Build.**
1. Template first for the local play: `weekly-gbp-post-draft` ships, as does
   `monthly-decay-refresh` for content refresh briefs.
2. Hand-building: `scheduledTrigger` into `marketingListBrandGuides` /
   `marketingListCustomerAvatars` (read-only, they exist to be fed into a prompt), into
   `aiAgent`, into `socialCreatePost` (draft state by default) or `marketingCreateContent`.
3. `aiAgent` reads its config FLAT off `data` only, never `data.config`. Write it flat.
   The terminal step is the draft: do not wire `socialPublishPost` on the end, since that
   fires an already-approved post and nothing is approved yet.

**Prove it works.** This is the dry run that lies least and costs most: `aiAgent` is NOT in
the dry-run net. It runs the model for real inside `workflow_test`, burning tokens and any
delegate sub-agents. So the draft in the terminal output is a real draft: judge it on
quality in the account's voice, and fix the prompt before shipping if it is generic. The
`socialCreatePost` leg IS mocked; read its `would_have` for the account id and the
scheduled time.

**Ship.** Schedule with an explicit timezone. Tell the operator this produces DRAFTS and
name the approval step (`socialApprovePost`, then `socialPublishPost`).

**How this fails in the wild.** Drafts pile up unapproved, so the cadence is worse than
manual: now there is a backlog AND no posts. Early symptom: week three, `socialListPosts`
shows a stack of drafts and zero published. The other failure is cost, since a weekly
`aiAgent` run is a weekly model call and every dry run you did while building was another.

---

## R14. The recurring PPC waste sweep

**They say.** "We're burning money on searches that will never convert."

**What this actually is.** Pure template territory. Do not hand-build it.

**Preconditions.** `ppc_connection_list` shows a live Google or Bing connection. Load
**hiveku-ppc-agency** for the judgment about which terms are actually waste.

**Build.**
1. `workflow_templates_list`, read `variables[]`. Shipped slugs:
   `weekly-search-terms-negatives`, `weekly-bing-wasted-spend`, `search-terms-ai-triage`
   (agent-classified, staged as ONE bulk review item), `bing-search-terms-ai-triage`,
   `disapproval-triage`, `monthly-impression-share-review`,
   `monthly-budget-reallocation-review`.
2. `workflow_create_from_template({ slug, name, overrides, is_enabled: false })`.
3. Review the created graph with `workflow_get`, then enable on the operator's yes.

**Prove it works.** `workflow_test` once, then check `agent_inbox_list` after the first
real run: the sweep's value IS the staged item and its absence is the failure. A write node
with `auto_apply` off reads `outcome: 'approval_required'` on a fresh seed, or
`'already_staged_today'` when an unactioned item exists (meaning the run did NOT re-stage
and nothing reached the ad platform either way).

**Ship.** The schedule is baked into the template. Confirm the timezone anyway with
`workflow_get_schedule`.

**How this fails in the wild.** The staged queue is never worked, the negatives are never
applied, spend does not change, and someone concludes the automation is broken and flips
`auto_apply` on. Apply through the PPC surface first, `agent_inbox_resolve` second.
Resolving is not applying.

---

## Not a recipe here, and not verified

On a different rail: a **drip sequence** ("emails on day 1, 3 and 7") is usually
`email_sequence_*` or the CRM sequence rail, so identify the sender before touching either
(**hiveku-communications**); a **cron inside a website project** is EventBridge to Lambda
with incompatible syntax, invisible to every `workflow_*` tool
(`references/project-crons.md`); a **recurring judgment play** ("the morning brief in every
client folder") cannot be a workflow, because a workflow re-runs stored logic and cannot
exercise judgment (`references/scheduled-routines.md`); **arbitrary code** hits the
`executeCode` / `executeExpression` stubs, so compose with `transformData`,
`templateString`, the array nodes and `conditional` or say it is not reachable here.

Not verified on the tool surface. Discover before you promise; if discovery comes up
empty, say so rather than designing around hope.

- **Round-robin or load-balanced lead assignment.** No such node verified. Route on a
  field (R3) or assign to a fixed owner.
- **A "record has been stale for N days" trigger.** No age-based event trigger verified.
  The working shape is the scheduled sweep in R5.
- **In-graph human approval.** `waitForApproval` is a stub. Use R11.
- **A branded recurring report for books, PPC or helpdesk numbers.**
  `marketing_report_create` covers marketing and social report types only.
