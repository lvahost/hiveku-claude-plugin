# SMS: Sending, Receiving, Compliance

The manual behind Play 5. Load it before you send a text, before you build any inbound-text
automation, before you answer a compliance question, and before you tell a user that anything
about SMS is impossible.

## What is reachable, and on which rung

Play 5 opens with the fact that there is no `sms_*` MCP tool. That is literally true and it is the
right warning, but read alone it has already caused the exact failure the ladder exists to prevent:
an audit of this surface searched for a send tool, found nothing, and reported that SMS had **zero
capability**. That conclusion was wrong and it was wrong in the expensive direction. A session that
believes SMS is unreachable refuses work it could have finished in four calls.

So this reference starts from the other end. Hiveku sends, receives, threads, throttles and
compliance-gates text messages every day. Here is every door, and which rung it is on.

| The job | Rung | How |
|---|---|---|
| Text one person a specific message | 2 | `manualTrigger` plus an `sms` node, run once. Part 1 |
| Text someone automatically when they text in | 2 | `smsReceivedTrigger` to `sms`. Parts 1 and 2 |
| Text on a missed call, a form, a closed deal, a schedule | 2 | Any trigger node to an `sms` node |
| Send a survey or review ask by text | **1** | `survey_send({ channel: 'sms' })`. Part 6 |
| Same, from inside a workflow | 2 | `surveySend`, `reviewRequest`, `reviewFunnelSend` |
| Read an inbound text conversation | **1** | `helpdesk_ticket_list({ channel: 'sms' })`. Part 5 |
| Read outbound texts on a contact's timeline | **1** | `crm_list_activities({ type: 'sms', contact_id })`. Part 5 |
| Check whether someone is opted out or DNC | **1** | `crm_get_dnc_status`. Part 4 |
| Set or reverse DNC across email and SMS | **1** | `crm_set_dnc` / `crm_remove_dnc`. Part 4 |
| Log a reply on an SMS ticket | **1** | `helpdesk_ticket_send_reply`. Part 5 |
| **Deliver** that reply as a text | not from that tool | It records and sends nothing. Part 5 |
| Run a would-be texting workflow without texting | 2 | `workflow_run({ test_mode: true })`. Part 1 |
| List the numbers you can send from | **1** | `voice_numbers_list` |
| Register 10DLC, bulk send, schedule, opt-out UI | 3 | Part 7 |

**Six of those rows are rung 1.** "No `sms_*` tool" is a fact about naming, not about capability.
Correcting the naming intuition is the whole job of this document: the tools that touch SMS are
named after the CRM contact, the helpdesk ticket, the survey and the phone number, never after the
channel.

Everything below was verified against source: MCP tools against
`hiveku-mcp-api-server/src/tools/*.ts`, node types against
`hiveku_builder/src/lib/workflow/palette-data.ts`. If a name you want is not in this document,
verify it before you call it. Do not invent one to fill a gap.

---

## Part 1: Sending

### The one rail

There is exactly one outbound-SMS code path: `dispatchAccountSms` in
`hiveku_builder/src/lib/voice/dispatch-sms.ts`. The `sms` node, the dashboard composer, the survey
sender, the review sender, the missed-call autoresponder, the invoice texter and the helpdesk
agent all funnel into it. One place enforces the compliance contract so no caller can diverge.

Knowing its gates in order is what turns "the SMS node failed" into a fix, because the node
surfaces the rail's own reason verbatim in `step_states`.

**The gates, in order. The first one that trips returns and nothing is sent.**

1. **Recipient normalizes to E.164.** 10 digits gets `+1`, 11 starting with 1 gets `+`, a leading
   `+` keeps its digits. Anything else returns `invalid_to`. A 7-digit local number is not valid.
2. **Body is non-empty after trim.** Returns `empty_body`. This is what an unresolved template
   produces; see the templating section below.
3. **Account is operational.** A suspended account returns `account_suspended`. The gate lives at
   the rail on purpose, so the roughly one hundred crons that never touch user auth cannot keep a
   suspended account texting on a schedule.
4. **The account can send SMS at all.** Returns `sms_not_enabled`. The rule is an OR, and both
   halves matter: a 10DLC brand in `VERIFIED` status with at least one `ACTIVE` campaign carrying a
   messaging profile, **or** at least one active toll-free DID that passed toll-free verification.
   An account whose only sendable numbers are verified toll-free is fully operational. Do not tell
   such an account it needs 10DLC.
5. **Not opted out.** Returns `opted_out`. Part 3.
6. **Automation volume caps.** Part 1's caps section.
7. **A sending number resolves.** Details below.
8. **Carrier send.** Failure returns `send_failed` carrying the carrier's message.

On success the rail upserts the thread keyed on (account, your DID, their number), writes the
message row, sends, reconciles delivery status, and, when the recipient matches a CRM contact by
last ten digits, mirrors the text into `crm_activities` as type `sms`. That mirror is what makes
the contact-timeline read in Part 5 work.

### The `sms` node

| Key | Notes |
|---|---|
| `to` | E.164 (`+15551234567`) or a template such as `{{trigger.data.phone}}` |
| `body` | The message text. Templates resolve here |
| `from` | Which of the account's numbers sends it. Optional; defaults to the main number |

On a form-submitted workflow, `{{trigger.form_fields}}` renders every non-empty form field as
`Label: value` lines and omits empty ones. That is almost always what you want in a new-lead
notification, and it beats templating each field by name because a field the visitor left blank
does not leave a dangling label.

On success the node spreads the incoming context through and adds an `sms` object with `to`,
`from`, `message_id`, `thread_id` and `telnyx_message_id`. Reference them downstream as
`{{<smsNodeId>.sms.message_id}}`. **Never report a text as sent without a `message_id`.**

### The palette comment that reads like a stub

In `palette-data.ts` the `sms` entry sits directly under a source comment reading `// Placeholders`,
beside genuinely unbuilt integrations. It is not a placeholder. The handler has been real since
2026-08-16. There was also a period when the catalog classifier mis-bucketed `sms` into the "Coming
Soon" group, so the UI told users a working node was unshipped; that was fixed by routing it into
the `voice` category. If you skim the palette source and conclude SMS is a stub, you have
reproduced the original audit's mistake. The real signals are the absence of an `isComingSoon` flag
and the absence of a warning in its schema.

### Picking the sending number

No MCP tool backs the node's `from` picker; the editor populates it from a builder-only endpoint.
From here use `voice_numbers_list` (optional `is_active` as the **string** `'true'` or `'false'`,
plus `page`, `limit`) and pass one number in E.164.

Omitting `from` is usually right. The rail auto-picks the oldest active DID whose `purpose` is
`main`, then the oldest active DID of any purpose, skipping unverified toll-free numbers in both
passes. With an explicit `from` the account must own it and it must be active, else
`no_sending_number`; an explicit unverified toll-free number is refused loudly as
`toll_free_unverified` rather than silently falling back, because sending from a different number
would get the message carrier-filtered and leave you debugging a delivery mystery.

### Rate caps are a design constraint, not an error

Automation sends are volume-capped to protect the number's carrier reputation:

- **100 per hour per account**
- **400 per day per account**
- **6 per hour to a single recipient**

"Automation" means any send with no user attached, which is every workflow node, every agent and
every cron. A human typing in the dashboard composer is never blocked by, and never consumes, this
budget.

A runaway loop stops at the cap rather than getting the account's 10DLC campaign filtered by the
carriers, which is a far more expensive failure and much slower to undo. Design within the caps. If
a campaign genuinely needs more volume, that is a conversation about the messaging programme, not a
limit to engineer around. Per-account overrides exist in `accounts.settings.sms_automation_caps` and
are not writable from this surface.

Two details that change how you read a failure: attempts are counted from the message rows the rail
writes, so **failed sends count too** (a loop of failing sends is still a loop), and the counting
query **fails open**, so a database blip does not silence legitimate automation.

The per-recipient cap of 6 per hour matters most for conversational flows. A workflow that texts on
several triggers can quietly hit it for one active customer while account-level numbers look fine.

### Templating, and the empty-string collapse

The engine stores every executed node's output under its node id, and additionally aliases the
start node's result under the literal key `trigger`. Downstream of an `smsReceivedTrigger` all of
these resolve:

- `{{trigger.from}}`, `{{trigger.body}}`, `{{trigger.to}}`, `{{trigger.threadId}}`,
  `{{trigger.contact.id}}`, `{{trigger.media}}`
- `{{trigger.output.from}}` and friends, because a missed path retries with `output` inserted or
  stripped
- `{{<triggerNodeId>.from}}`, the most robust form, because per-node-id entries are re-injected
  into every node's context however many hops away it is

**What does not resolve: `{{data.from}}`.** The `data` alias points at the trigger's `payload` key,
which webhook triggers have and the SMS trigger does not.

**An unresolved `{{...}}` collapses to an empty string** and logs a warning. It used to leak the
literal template into real messages, which is worse. For the `sms` node the collapse is a good
outcome: an empty `to` fails the node with a readable missing-recipient error and an empty `body`
fails with an empty-body error. **So if your SMS node reports one of those two errors and the
config looks populated, the cause is a template that resolved to nothing, not a missing field.**
`workflow_run_get` shows the node's resolved `input`; `workflow_run_logs` shows the miss warnings.

Prefer the `trigger.` or node-id forms over bare flat access like `{{from}}`. Flat access works
only while every intervening handler spreads its input context forward, and not all of them do. The
`sms` node itself once had exactly that bug: it returned only the `sms` object and silently dropped
every upstream value.

### Retries can double-send

The node's execution defaults are a 30 second timeout, `maxAttempts: 2`, and in-process pacing of
20 calls per minute. The retry policy matches on message patterns that include `timeout` and
`ETIMEDOUT`.

The rail has no idempotency key across attempts: each call writes a fresh message row and makes a
fresh carrier call. **If the carrier actually delivered but the response timed out, the retry sends
a second text.** The engine's send-once guard does not cover this: it is checked once before the
handler runs and is scoped to the originating event, so it protects against a replayed or re-fired
run, not against the retry loop inside one node execution.

Decide deliberately rather than inheriting the default. If a duplicate is unacceptable, set
`data.executionConfig = { retryPolicy: { maxAttempts: 1 } }`. If a dropped text is worse than a
duplicate, leave it.

Related: `data.executionConfig.onError` defaults to `fail`. Set it to `continue` when the text is a
nice-to-have and the rest of the graph must still run. Do **not** set it to `continue` on a
workflow whose whole purpose is the text, or a permanently failing send reports green forever.

### Quiet hours do NOT apply to the `sms` node

This is the asymmetry that catches people. `dispatchAccountSms` has no time-of-day gate. Quiet
hours (09:00 to 20:00 local, defaulting to US Central when the account has no timezone configured)
live one layer up, in the survey, review-request and referral senders only.

**A plain `sms` node fired by a `scheduledTrigger` at 03:00 will text at 03:00.** If the message is
marketing-shaped rather than transactional, put the time discipline in the trigger yourself.

### Related send nodes

Several nodes send SMS as one of two channel options and apply their own throttles:

- `reviewFunnelSend`: rating, then a video or written testimonial, then the public review ask.
  Keys `contact_id`, `email` (fallback), `funnel_id` (blank uses the account default), `channel`.
- `reviewRequest`: a public review ask with a tokenized funnel link, ask-frequency throttle, and
  click and conversion tracking. Keys `contact_id`, `email`, `channel`.
- `surveySend`: an NPS, CSAT or custom survey. Keys `survey_id`, `contact_id`, `email`, `channel`.

`channel` is `auto | email | sms` on all three, defaulting to `auto`. All three honor SMS quiet
hours, and all three report a throttled contact as **skipped, not failed**. Read the step output
rather than assuming a non-error means delivered.

Prefer these over hand-rolling the equivalent with an `sms` node and a URL you built yourself. They
mint the tokens, apply suppression, and record attribution.

### There is no ad-hoc send tool, but there is an ad-hoc send

If a user asks you to "just text this person", the honest options are a one-node workflow with a
`manualTrigger` plus an `sms` node run once, or the dashboard. Both are legitimate; inventing a
tool is not. The workflow does not have to be enabled afterwards, and it does not have to be kept.

---

## Part 2: Receiving

### The pipeline, end to end

Understanding the order is what makes the STOP behaviour in Part 3 make sense.

1. The carrier (Telnyx) delivers an inbound webhook to `hiveku_voice_server`.
2. The voice server's SMS ingester persists it into `voice_sms_threads` and `voice_sms_messages`,
   matches a CRM contact by phone, and emits a change event so open dashboards refresh.
3. **Compliance keywords are detected and acted on HERE**, before the builder is involved.
4. If and only if the message is not a bare compliance keyword, the ingester calls the builder at
   `POST /api/internal/voice/sms-received`.
5. That builder route does three independent things: opens or threads a helpdesk ticket, fires
   inbound-SMS workflow triggers, and sends the in-app bell plus mobile push.

Step 4 is the gate. **Anything filtered at step 3 never reaches steps 4 or 5**, so it is invisible
to workflows, to helpdesk, and to notifications.

One consequence worth banking: the ingester's insert is idempotent on the carrier's message id and
it only notifies the builder when a row was genuinely inserted, so **a carrier re-delivery does not
re-fire the trigger.** You do not need to build your own dedupe for that case.

### The `smsReceivedTrigger` node

Two filters, both optional, both also accepted in camelCase (`keywordFilter`, `numberFilter`):

| Key | Notes |
|---|---|
| `keyword_filter` | Fire only when the body CONTAINS this. Case-insensitive SUBSTRING match |
| `number_filter` | Fire only for texts to this business number (DID), e.g. `+15551234567` |

**`keyword_filter` is a substring match, not a word match.** A filter of `stop` matches "nonstop"
and "stopwatch". A filter of `yes` matches "yesterday". Pick distinctive keywords, and prefer words
unlikely to appear inside another: `QUOTE`, `BOOK`, `RESCHEDULE`.

**`number_filter` is compared on the last ten digits**, so a human-formatted `(555) 123-4567`
matches an E.164 DID. It also **fails closed**: if the inbound DID cannot be resolved, the workflow
does not fire and a warning is logged. It used to require a known DID before it could exclude
anything, which meant a workflow scoped to one number fired on texts to *every* number on the
account. Over-firing an automation that can send SMS, send email and spend AI credit was judged the
worse failure, so silence is now the deliberate choice.

**Pass filters as strings.** `node.data.config` is raw JSON and nothing between the tool and the
database constrains it. A numeric value is coerced safely, but any other non-string type reads as
empty and the filter is silently treated as absent.

### The trigger payload

`trigger.output` carries `from` (the texter, E.164), `to` (the business DID, or null if
unresolved), `body`, `media` (MMS attachment URLs), `threadId`, `contact` as `{ id, name, phone }`
with nulls when no CRM contact matched, `timestamp`, plus `triggeredBy: 'sms_received'` and
`eventType: 'sms.received'`.

Two notes. An image-only text arrives as an empty `body` with a populated `media`, so branch on
`media` rather than assuming an empty body means an empty message. And `body` is the **full** text:
there was a period when the trigger received only the 240-character bell preview, truncating every
inbound message before automation saw it. If an old workflow's keyword logic looks over-engineered,
that is probably why.

`contact.id` is null when the voice server found no phone match, **even when the helpdesk
projection went on to create a contact**, because the two run from different inputs. Do not assume
a contact id is present.

### The node in the graph IS the subscription

`workflow_trigger_types_list` shows an `sms_received` entry because that discovery catalog
consolidates several sources, but the `workflow_triggers` table route only really handles
`webhook`, `scheduled_trigger` and `database_trigger`. Inbound SMS fires by scanning **enabled**
workflows' graph definitions for an `smsReceivedTrigger` node.

**Do not call `workflow_trigger_create` for SMS.** A trigger row adds nothing and its absence
breaks nothing. `workflow_event_trigger_types_list` is the right discovery tool for graph-node
triggers.

### The other ways it does not fire

Beyond the STOP suppression in Part 3, work down this list before concluding a workflow is broken:

- **`is_enabled` is false.** The executor filters on it. A workflow you built but never enabled
  matches nothing. A *paused* workflow does still match, deliberately: the exec worker records a
  replayable stopped run rather than dropping the event.
- **The graph has no edges.** A trigger node sitting alone is skipped entirely.
  `workflow_validate` catches this as an orphan warning.
- **The fan-out was throttled.** The builder route caps inbound triggers at 30 per account per
  minute and 6 per sender per minute, because each fire can start a tool-enabled agent that sends
  email and SMS, writes CRM and spends AI credit. The limiter **fails open**, so a Redis blip never
  suppresses a legitimate trigger. Only the agent fan-out is gated: the helpdesk ticket and the
  notification still happen. So **"no workflow ran but the ticket exists" is a throttle, not a
  broken workflow.**

---

## Part 3: Compliance, and the STOP trap

This is the most important section because the intuitive design is wrong and fails silently.

### The keyword sets

Matched on the **first word** of the message, case-insensitive:

- **Opt-out:** `stop`, `unsubscribe`, `cancel`, `end`, `quit`, `stopall`
- **Opt-in:** `start`, `unstop`, `yes`

A first-word match writes (opt-out) or deletes (opt-in) a row in `voice_sms_opt_outs` scoped to the
account and the peer number. **Every outbound send path consults that table before sending and
refuses for an opted-out peer.** The carrier sends the compliance confirmation. The message itself
is still persisted for the audit trail either way.

### The suppression rule

The builder is NOT notified when all three of these hold:

1. A compliance keyword was detected, AND
2. the keyword is not `yes`, AND
3. **the entire message body is exactly ONE word.**

When suppressed there is no bell, no push, no helpdesk ticket, and **no `smsReceivedTrigger`
fire.** This exists because two prior-owner STOPs on a freshly purchased number once pushed to a
whole team and read as an incident.

### What follows from that

**A `smsReceivedTrigger` with `keyword_filter: "STOP"` will never fire.** Do not build it. It is
not a partially-working automation; it is dead. The platform has already registered the opt-out,
already refuses every future send to that number, and the carrier has already sent the
confirmation. There is nothing left for your workflow to do, and shipping one creates a false
belief that STOP handling is custom and inspectable.

Three corollaries that bite:

- **`cancel`, `end` and `quit` are OPT-OUT keywords.** A customer replying a bare "CANCEL" to an
  appointment reminder is opted out of ALL future SMS from the account, and your cancellation
  workflow never sees it. If a flow needs a cancellation by text, instruct the customer to reply
  with a word that is not on the opt-out list, and say so in the outbound message.
- **`yes` is deliberately carved out** of the suppression, because it is the exact word the
  chat-to-SMS handoff tells customers to reply with, and the builder's link-confirmation branch is
  only reachable through the notify. A bare "YES" DOES notify and DOES fire triggers. It still
  registers as an opt-in.
- **Multi-word messages always notify.** "STOP texting me" is a human talking, so it reaches the
  trigger, the ticket and the bell. Only the bare single word is suppressed.

If a user asks for "an automation that runs when someone texts STOP", the honest answer is that
STOP is already fully handled and the event is intentionally not delivered. Offer the multi-word
variant if what they actually want is to catch angry unsubscribes phrased as sentences.

### Testing compliance behaviour

You cannot test this with `test_mode`, because the suppression happens upstream of the workflow
engine entirely. `test_mode` dry-runs the nodes; it does not simulate carrier ingestion. Testing a
STOP path means sending a real text from a real handset, which also creates a real opt-out row that
then blocks future sends to that handset. Do that deliberately or not at all, and know that `start`
reverses it.

---

## Part 4: DNC read and write (rung 1)

These ARE direct tools. They operate on the CRM contact, which is a different and broader layer
than the number-scoped `voice_sms_opt_outs` row a STOP keyword writes.

- **`crm_get_dnc_status({ contact_id })`** returns `is_dnc`, `email_suppressed`, `email_reason`,
  `sms_suppressed`, `sms_reason`, `lifecycle_stage` and `lead_status`. The SMS half reads the same
  table the send gate consults. **Check this before drafting any outbound.** Sending to a suppressed
  prospect is a compliance issue, not an inconvenience.
- **`crm_set_dnc({ contact_id, reason, channels? })`** is one atomic write that suppresses email
  globally, suppresses SMS when a phone is present, keeps the legacy sequence-suppression row in
  sync, flips lifecycle to unsubscribed, clears `lead_status`, AND exits every active sequence
  enrollment. Idempotent, so calling it twice is safe. `reason` is required: use the prospect's own
  words. `channels` restricts to `['email']` or `['sms']`; default is both.

  Call it the moment a prospect signals stop in any channel and any wording: "unsubscribe",
  "remove me", "stop emailing", a reply to a rep, a phone request. Do not wait for confirmation to
  suppress; suppression is cheap and reversible and the compliance risk is not. A free-text note on
  the contact is not a substitute, because nothing reads notes at send time.
- **`crm_remove_dnc({ contact_id, reason })`** soft-removes from suppression lists. **It does NOT
  reset `lifecycle_stage` or `lead_status`**, so a re-engaged contact needs those set explicitly
  with `crm_update_contact`. Use sparingly. Most requests to undo a DNC are mistakes, and undoing a
  customer's own STOP without their re-consent is a compliance problem in the other direction.

Read-only audit views:

- `crm_list_email_suppressions` lists active email suppressions, optionally narrowed with
  `?email=`. To ADD suppression use `crm_set_dnc`, which is atomic across tables; this one is for
  visibility.
- `email_suppression_list`, `email_suppression_add` and `email_suppression_remove` operate on the
  marketing-side suppression list.

### The two layers can disagree

A STOP text writes a number-scoped opt-out in the voice layer without touching the CRM contact's
DNC state, and `crm_set_dnc` writes CRM suppression which the voice send path honours through its
own check. When auditing whether someone can be contacted, check `crm_get_dnc_status` for the
contact AND remember that a bare STOP from a number the CRM never matched to a contact leaves no
CRM trace at all.

### The phone-format trap

Verify this before you report a contact as SMS-suppressed. The send-time check is an **exact string
equality** lookup on the number after E.164 normalization.

- A STOP-driven opt-out is written by the voice server from the carrier's own E.164 value, so it
  always matches.
- `crm_set_dnc` writes `contact.phone` **as stored, trimmed only, not normalized**.
- Contacts created through the CRM create path are normalized to E.164 on write. Contacts whose
  phone was set through the **update** path are not: that route passes `phone` straight through.

So when a contact's stored phone is not already E.164, `crm_set_dnc` can write an opt-out row keyed
on `(555) 123-4567` while the send path looks up `+15551234567` and finds nothing.
`crm_get_dnc_status` reads with the same unnormalized key, so **it will report `sms_suppressed:
true` for a row that does not actually block sends.**

Practical rule: before relying on `crm_set_dnc` for SMS suppression, read the contact and confirm
`phone` is in `+1XXXXXXXXXX` form. If it is not, fix it with `crm_update_contact` first, then set
DNC. If you cannot fix it, say so plainly rather than reporting the contact as suppressed. A live
mismatch is a compliance incident, not a curiosity.

### There is no DNC workflow node

The palette has no DNC or opt-out node, so a workflow cannot check or set DNC directly. The rail's
own `opted_out` refusal is the in-workflow gate: let the `sms` node fail and branch on it, or do
the `crm_get_dnc_status` read from the session before running the workflow at all.

---

## Part 5: The helpdesk projection

Inbound texts are also projected into helpdesk as tickets, which is the main rung-1 way to READ
inbound SMS.

### How it works

The builder route calls a dedicated SMS ingest that mirrors the email ingest: dedupe by message
external id, thread on the SMS thread id held in `source_meta`, resolve or create the contact by
phone, then fire helpdesk triggers and create-automations so downstream workflows react.

A new ticket carries `channel: 'sms'`, `status: 'open'`, `priority: 'normal'`, a subject of the
form "SMS from &lt;name or number&gt;", and a `source_meta` holding `via: 'inbound_sms'`,
`sms_thread_id`, `sms_did` (the business number) and `peer_e164` (the customer's number). Those
last two are how you get a reply address. A lazily created contact gets
`lead_source: 'inbound_sms'`.

Conditions and caveats:

- **Gated on the account actually using helpdesk.** It checks `helpdesk_agent_enabled` and returns
  without doing anything when false, so tenants who do not run a support desk are not flooded with
  tickets for ordinary texts. **If `helpdesk_ticket_list({ channel: 'sms' })` is empty on an
  account you know receives texts, suspect this flag before suspecting your query.**
- **Best-effort.** The route wraps it in a try/catch and logs a failure rather than raising, so a
  missing ticket is not an error anyone will see.
- **It threads rather than always opening.** New inbound messages thread into an existing ticket
  whose status is `open` or `pending`. A resolved or closed ticket does not absorb a new message;
  that opens a fresh one.
- **Auto-acknowledge is deliberately skipped** for SMS, because that reply path is email-shaped and
  not SMS-safe.

### Reading it

- `helpdesk_ticket_list({ channel: 'sms' })`. The `channel` filter accepts
  `email | chat | voice | sms`. Also `status`, `priority`, `contact_id`, `company_id`,
  `assigned_to_id`, `queue_id`, `page`, `limit`, `sort` (`last_activity` or `created`).
- `helpdesk_ticket_get({ id })` for one ticket, `helpdesk_ticket_messages({ id })` for its message
  log. Inbound rows carry `metadata.via: 'sms'` plus `voice_sms_message_id` and
  `voice_sms_thread_id`, so you can correlate a ticket message to the underlying thread.
- `helpdesk_ticket_list_for_contact({ contact_id })` for one person's tickets.
- Triage as normal with `helpdesk_ticket_set_status`, `helpdesk_ticket_set_priority`,
  `helpdesk_ticket_assign`, `helpdesk_ticket_escalate_to_human`, `helpdesk_ticket_merge`.
- For reply text, `helpdesk_macros_list` then `helpdesk_macros_render({ id, variables })` so you
  never ship raw `{{placeholder}}` text. `helpdesk_kb_search` for the answer itself.

### The second read path, which needs no helpdesk

Every outbound text whose recipient matched a CRM contact is mirrored into `crm_activities` with
`type: 'sms'`. So `crm_list_activities({ type: 'sms', contact_id })` lists that contact's texts, and
`crm_contact_touch_history({ contact_id, days?, limit? })` gives a merged newest-first timeline
including them.

The read-side `type` filter passes through without a whitelist, so `sms` works even though the
tool's own description only enumerates note, call, email, meeting and task. Note the asymmetry:
`crm_create_activity` **rejects** `type: 'sms'` with a 400, because the write side does enforce the
whitelist. You can read SMS activities; you cannot fabricate one.

**This is the only SMS read that works on an account with helpdesk disabled.**

### Do NOT reply with `helpdesk_ticket_send_reply`

This is a verified silent failure and it is the worst one in this reference.

`helpdesk_ticket_send_reply({ id, body })` writes a `helpdesk_messages` row with
`direction: 'outbound'`, stamps `first_response_at`, and returns the created message. Delivery over
the wire happens in exactly two branches, both requiring `channel === 'chat'`: a social DM sent via
Graph (which fails loudly with a 502 and deletes the row rather than pretending), and the
chat-to-SMS mirror for the handoff flow.

**There is no delivery branch for `channel === 'sms'`.** Replying to an SMS ticket records the
reply, marks the ticket as responded, returns success, and **sends nothing to the customer**. The
ticket looks handled. The customer is still waiting. Nothing errors.

The same trap exists in the palette: the **`helpdeskSendReply` node also only writes a message
row** and delivers on no channel at all. Its one extra behaviour is firing
`helpdeskNewMessageTrigger`.

The SMS-delivering reply helper does exist in the codebase, with a full SMS and MMS branch, but it
is wired only into the dashboard composer and the helpdesk agent's internal RPC. Neither is an MCP
tool, so do not go looking for one.

**To actually text a customer back, use the `sms` node.** You have the number in
`source_meta.peer_e164` on the ticket, or `{{trigger.from}}` from the inbound trigger. The idiomatic
reply automation is both halves:

```
smsReceivedTrigger  ->  sms                        (delivers the text)
                    ->  helpdesk_ticket_send_reply (records it on the ticket)
```

Send with the node, then log it so the operator's inbox shows what the customer received. If you do
only the second half, you have written a note to yourself.

### The one case where the reply tool does text

A **chat** ticket linked to an SMS thread and **confirmed**. The chat-to-SMS handoff links a widget
chat ticket to a thread, and the link starts unconfirmed. When the phone's owner replies YES,
`source_meta.sms_link_confirmed` flips to true, and from then on an outbound reply on that chat
ticket is mirrored out as a text, to the thread's `peer_e164` (the number that actually consented)
and never to `contact.phone`, which could be a different number already on file.

Both gates are hard. That is what stops someone entering a stranger's number in the widget and
relaying through the business DID. The mirror is fire-and-forget, so an SMS failure never fails the
chat reply, and it runs with no user attached, so it consumes the automation volume budget.

One more note on `helpdesk_ticket_create`: it accepts `channel: 'sms'`, but understand what you are
creating. A ticket labelled SMS with no underlying thread, no `sms_thread_id` and no correlation to
a real conversation. Only do it deliberately.

---

## Part 6: The rung-1 sender people miss

**`survey_send`** genuinely sends a text. Parameters: `survey_id` (required), `contact_ids` (CRM
contact UUIDs), `emails` (raw addresses), `channel` (`auto | email | sms`, default `auto`, which
picks SMS when a mobile is on file).

It is not a preview. Confirm with the user before calling it. Guards match a dashboard send: the
survey must be active, the per-contact throttle is enforced, duplicates are deduped, one call is
capped at 200 recipients, and **SMS respects quiet hours**.

That last one has a visible consequence. Called outside 09:00 to 20:00 in the account's timezone,
the delivery is not sent: it is rescheduled to the next window and picked up by the survey cron,
and the check runs again at dispatch so a backlogged queue or a daylight-saving shift cannot leak a
3am text. **If you call `survey_send` at 22:00 and report "sent", you are wrong. Report
"scheduled".**

Pair with `survey_list` and `survey_get` to find the survey, `survey_results` to read outcomes.

This tool is the clearest counter-example to "SMS has no capability here": it is rung 1, it is one
call, and it puts a text on a customer's phone. It is just named after the survey.

---

## Part 7: Dashboard-only SMS (rung 3)

A large SMS surface exists behind the dashboard with no MCP tools. When a request lands in this
territory, hand over a precise destination rather than improvising:

- Threaded SMS conversation view and the composer.
- Opt-out management UI. There is no tool that lists, adds to, or removes from `voice_sms_opt_outs`
  by number; contact-scoped access only, via Part 4.
- SMS templates.
- Bulk send. The `sms` node sends one message per execution, so a list means a `forEach` feeding an
  `sms` node, which runs straight into the 100/hour and 400/day caps. A 500-person blast will half
  succeed and then start failing, which is worse than not starting. Say no and point at the caps.
- Delivery status and carrier diagnostics. Nothing here reports whether a specific message was
  delivered, failed or was carrier-filtered.
- 10DLC brand and campaign registration, toll-free verification, and campaign assignment to
  numbers. This is regulated carrier onboarding: it has real forms, real review times and real
  rejection reasons, and it is not something to guess at from here.
- Scheduled SMS. The mechanism exists in the database and is swept by a cron, but nothing writes a
  scheduled row from this surface. The reachable substitute is a `delay` node or a
  `scheduledTrigger`, and that is the honest answer.
- Per-account cap overrides.

Two adjacent boundaries worth naming because they look reachable and are not:

- **Raw SMS threads are not readable.** No tool reads `voice_sms_threads` or `voice_sms_messages`.
  Inbound is readable only through helpdesk (needs `helpdesk_agent_enabled`), outbound only through
  the `crm_activities` mirror (needs a matched contact). A text to an unmatched number on an
  account without helpdesk is invisible from here. Nearest reachable thing: if a workflow sent it,
  `workflow_run_get` still has the message and thread ids.
- **The helpdesk department agent cannot be reached to send SMS.** It has a real SMS tool, and
  `talk_to_department` is a real tool, but `helpdesk` is **not** in `talk_to_department`'s domain
  enum. (`helpdesk` IS valid for `account_context_get`, which is a different enum, and that is the
  source of the confusion.) Call `list_departments` to see what the tenant actually has.

For anything touching 10DLC or toll-free verification, the correct answer is always a handoff plus
a warning that unregistered traffic gets filtered by carriers.

---

## Part 8: Diagnosis quick reference

| Symptom | Likely cause |
|---|---|
| Workflow never fires on "STOP" | Bare compliance keywords never reach the builder. Working as designed |
| Customer texted "CANCEL", nothing happened, and now they get no texts | `cancel` is an opt-out keyword. They are suppressed |
| Bare "YES" fires but bare "START" does not | `yes` is carved out of suppression; `start` is not |
| Keyword filter matches too much | It is a substring match. `stop` matches "nonstop" |
| Workflow scoped to one number never fires | `number_filter` fails closed when the inbound DID cannot be resolved |
| Trigger ignores a filter entirely | The filter was saved as a non-string type and read as absent |
| Nothing fires and there is no run at all | `is_enabled` is false, or the graph has no edges |
| Ticket exists but no workflow ran | The inbound trigger fan-out was throttled. Ticket and bell are ungated |
| No ticket for an inbound text | Account does not have helpdesk enabled, or the ingest failed best-effort |
| New ticket instead of threading | The prior ticket was resolved or closed, not open or pending |
| Reply recorded but customer got nothing | `helpdesk_ticket_send_reply` does not deliver for `channel: 'sms'` |
| Node errors "no recipient" and the config looks fine | A template resolved to empty. Read `input` in `step_states` |
| Sends stop partway through a batch | Account cap of 100/hour or 400/day, or 6/hour to one recipient |
| One customer stops receiving, others fine | Per-recipient cap, or a `voice_sms_opt_outs` row for that number |
| Every send returns `sms_not_enabled` | 10DLC not complete AND no verified toll-free DID. Rung 3 handoff |
| Explicit `from` rejected as unverified toll-free | That DID has not passed toll-free verification. Use a local number |
| Customer got the same text twice | A timeout retry re-sent. Set `retryPolicy.maxAttempts: 1` |
| Text arrived at 3am | The plain `sms` node has no quiet hours. Only survey and review nodes do |
| Review or survey reports skipped | Throttle or quiet hours. Skipped is not failed |
| `sms_suppressed: true` but texts still land | Opt-out row keyed on a non-E.164 phone. Compliance incident |

### The order to work a "text never sent" report

1. `workflow_runs_recent({ status: 'failed', since: <10 min ago> })`. Account-wide, so you do not
   need to know which workflow tripped.
2. `workflow_run_get` and read the `sms` node's `error` in `step_states`. It carries the rail's
   reason verbatim: map it against Part 1's gate list and you have the cause.
3. `workflow_run_logs` for template misses and retry attempts.
4. A node skipped as `already_sent` means the send-once guard fired: this run was a replay.
5. A node absent from `step_states` was never reached. `workflow_validate`.
