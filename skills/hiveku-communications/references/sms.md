# SMS: Sending, Receiving, Compliance

The manual behind Play 5. Load it before you send a text, before you build any inbound-text
automation, before you answer a compliance question, and before you tell a user that anything
about SMS is impossible.

## What is reachable, and on which rung

An early audit of this surface searched for a send tool, found nothing, and reported that SMS had
**zero capability**. That conclusion was wrong then (the workflow rail existed), and the naming
intuition it came from has since been corrected twice: on 2026-08-27 the registry gained the
`voice_sms_*` family, 19 direct tools, so most of this surface is now rung 1. If a copy of this
document tells you "there is no `sms_*` tool at all", it predates that day. Here is every door,
and which rung it is on now.

| The job | Rung | How |
|---|---|---|
| Text one person a specific message | **1** | `voice_sms_send_to_contact` (CRM contact) or `voice_sms_send` (raw E.164). Part 1 |
| Reply inside an existing SMS conversation | **1** | `voice_sms_thread_reply`. Part 1 |
| Read the SMS inbox / a conversation | **1** | `voice_sms_threads_list`, `voice_sms_thread_messages_list`. Part 2 |
| Per-message delivery status | **1** | `voice_sms_thread_messages_list` (`delivery_status` per row). Part 2 |
| Text someone automatically when they text in | 2 | `smsReceivedTrigger` to `sms`. Parts 1-2 |
| Text on a missed call, a form, a closed deal, a schedule | 2 | Any trigger node to an `sms` node |
| Send a survey or review ask by text | **1** | `survey_send({ channel: 'sms' })`. Part 1 |
| Same, from inside a workflow | 2 | `surveySend`, `reviewRequest`, `reviewFunnelSend` |
| Read inbound texts as tickets | **1** | `helpdesk_ticket_list({ channel: 'sms' })`. Part 5 |
| Read outbound texts on a contact's timeline | **1** | `crm_list_activities({ type: 'sms', contact_id })`. Part 5 |
| Check whether someone is opted out or DNC | **1** | `crm_get_dnc_status`. Part 4 |
| Set or reverse DNC across email and SMS | **1** | `crm_set_dnc` / `crm_remove_dnc`. Part 4 |
| Opt out a bare number (no contact) | **1** | `voice_sms_opt_out_add`. Part 3 |
| SMS templates (snippets) | **1** | `voice_sms_templates_list` + CRUD. Part 6 |
| Schedule a text for later | **1** | `voice_sms_send_to_contact({ scheduled_for })`, with caveats. Part 6 |
| 10DLC / toll-free registration and its status | **1** | `voice_sms_registration_get` and the filing lane. Part 7 |
| Run a would-be texting workflow without texting | 2 | `workflow_run({ test_mode: true })` |
| List the numbers you can send from | **1** | `voice_numbers_list` |
| Bulk blast, opt-out list/remove by number, cap overrides | 3 | Part 8 |

Profile note: the `voice_sms_*`, `voice_*` and `workflow_*` rows are visible to a
communications-scoped key; the `crm_*` (beyond the seven contact tools), `helpdesk_*` and
`survey_*` rows resolve only under a broader profile such as `full`.

Everything below was verified against source (`hiveku-mcp-api-server/src/tools/*.ts`, node types
against `hiveku_builder/src/lib/workflow/palette-data.ts`) and against each tool's registered
description. If a name you want is not in this document, verify it before you call it. Do not
invent one to fill a gap.

---

## Part 1: Sending

### There are now TWO send rails, and they enforce different things

Older copies of this document said there was exactly one outbound-SMS code path. That is no
longer true, and the difference decides what protects you:

- **The automation rail**: `dispatchAccountSms` in
  `hiveku_builder/src/lib/voice/dispatch-sms.ts`. The `sms` node, the dashboard composer, the
  survey sender, the review sender, the missed-call autoresponder, the invoice texter and the
  helpdesk agent all funnel into it. It enforces the gate list below, including the
  `sms_not_enabled` capability check and the automation volume caps.
- **The direct-tool rail**: the Olympus `voice_sms_*` routes call `sendSms` in the builder's
  voice-server client directly (verified in
  `hiveku_builder/src/app/api/olympus/voice/sms/threads/route.ts`). This rail enforces plan
  gating (402 `voice_not_enabled`), DID ownership, the opt-out table, and a shared **reputation
  governor** inside `sendSms` (an `sms_sending_paused` kill switch, a carrier-prohibited content
  screen, a per-plan UTC daily cap - 100 on free and trial, 500 hosting, 5000 premium, 10000
  business, 50000 enterprise, 2000 on any unrecognized plan unless `daily_sms_cap_override`
  raises it - and a per-minute velocity cap). A governor refusal surfaces as a 502
  `send_failed` carrying a human-readable reason; it is a POLICY refusal, and retrying
  immediately will not help.

**What the direct rail does NOT enforce, never assume otherwise** (from the tools' registered
descriptions): there is **no 10DLC brand or campaign registration check** anywhere in these
routes or inside `sendSms` - unregistered US A2P traffic from a local DID is accepted and then
filtered or blocked by the carriers, T-Mobile most aggressively, while your stored row still
reads `sent`. There is **no quiet-hours rule** in `src/lib/voice` at all. And the automation
caps documented below are a property of the automation rail; the direct tools' descriptions do
not mention them, so do not lean on those caps as protection when calling the tools.

### The direct send tools (rung 1)

All three are REAL sends to a real handset within seconds, billed per segment, with no draft
state, no queue to inspect first, no recall, and **no idempotency key anywhere: two identical
calls are two texts**. Send only wording a human has approved.

**`voice_sms_send({ tenant_e164, peer_e164, body, media_urls? })`** starts or reuses the thread
between your DID and the peer, writes the outbound row, and dispatches. It **returns
`{ thread }` ONLY - no message id, no telnyx id** - so you cannot confirm the outcome from the
response; read it back with `voice_sms_thread_messages_list` on the returned thread id.
Refusals it does enforce: 402 `voice_not_enabled`; 403 `not_your_number` when `tenant_e164` is
not an active DID on the account; 409 `opted_out` when the peer texted STOP (only their own
START or YES re-subscribes them - deleting the opt-out row to force a send is a TCPA decision
for a human, never an agent's); 422 `invalid_body`. A 200 means TELNYX ACCEPTED the message,
not that it arrived: the row is stamped `sent` and only the later carrier receipt flips it to
delivered or failed. A 502 `send_failed` is NOT a no-op - the thread and a `failed` message row
are already committed, so blind retries leave a trail of failed rows and can double-send if the
first attempt actually reached the carrier. Because an Olympus key has no builder profile, the
send appears in the inbox with no sender and leaves NO entry on the voice audit page.

**`voice_sms_send_to_contact({ contact_id, ... })`** sends to a CRM contact - the recipient
comes from `crm_contacts.phone` ONLY, never from your input. Its extra refusals: 404
`contact_not_found`, 409 `no_contact_phone`, and **403 `opted_out` - a 403 HERE where the
thread routes return 409 for the same condition, so key on the error string, not the status.**
Consent is checked ONLY against the opt-out table, never `lifecycle_stage` or any CRM DNC
column (the CRM DNC route writes into `voice_sms_opt_outs`, which is why the one check
suffices). An explicit `from_e164` is checked for ownership but NOT toll-free verification
(an unverified toll-free sender dies inside `sendSms` as a 502); omitting it is safer - the
auto-pick takes purpose `main` then the oldest active DID, admits local plus VERIFIED toll-free
only, and fails closed. Template trap: merge vars render ONLY when your body exactly equals the
stored template body; any edited body still holding `{contact_first_name}` arrives as literal
braces, and `{sender_first_name}` renders EMPTY for an API key. On the success path the
`crm_activities` row and the webhook payload store your RAW input body, not the rendered text,
so a merge-var send shows the un-rendered template on the CRM timeline while the customer got
the rendered version. Like the other tools it leaves no attributed sender and no audit row.

**`voice_sms_thread_reply({ thread_id, body, media_urls? })`** appends to an existing
conversation. Both the recipient and the sending DID are read off the STORED thread, not your
input - and unlike `voice_sms_send` it does NOT re-verify the DID is still yours or active, so
a reply on a released number fails at the carrier instead of being refused here. It returns
`{ message }` with an OPTIMISTIC `delivery_status` of `'sent'` (Telnyx accepted, never
delivered). `opted_out` (409) is re-checked on EVERY reply, even deep inside an open
conversation, because a STOP still applies in the thread it was sent in. `last_message_at` is
bumped BEFORE dispatch, so even a failed send jumps the thread to the top of the inbox. Same
502-is-not-a-no-op rule as above.

**Operator double-runs are the direct rail's version of the retry double-send.** With no
idempotency key and no draft state, "run it again to make sure" is a second text on the
customer's phone. After ANY ambiguous outcome (timeout, 502, dropped connection), read the
thread with `voice_sms_thread_messages_list` BEFORE any second call.

### The automation rail's gates, in order

Knowing the gates is what turns "the SMS node failed" into a fix, because the node surfaces the
rail's own reason verbatim in `step_states`. The first gate that trips returns and nothing is
sent.

1. **Recipient normalizes to E.164.** 10 digits gets `+1`, 11 starting with 1 gets `+`, a
   leading `+` keeps its digits. Anything else returns `invalid_to`.
2. **Body is non-empty after trim.** Returns `empty_body`. This is what an unresolved template
   produces; see the templating section.
3. **Account is operational.** A suspended account returns `account_suspended`.
4. **The account can send SMS at all.** Returns `sms_not_enabled`. The rule is an OR: a 10DLC
   brand in `VERIFIED` status with at least one `ACTIVE` campaign carrying a messaging profile,
   **or** at least one active toll-free DID that passed toll-free verification. An account whose
   only sendable numbers are verified toll-free is fully operational - do not tell it it needs
   10DLC. When this gate trips, `voice_sms_registration_get` (Part 7) is the verdict tool.
5. **Not opted out.** Returns `opted_out`. Part 3.
6. **Automation volume caps.** Below.
7. **A sending number resolves.** Below.
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
notification.

On success the node spreads the incoming context through and adds an `sms` object with `to`,
`from`, `message_id`, `thread_id` and `telnyx_message_id`. Reference them downstream as
`{{<smsNodeId>.sms.message_id}}`. **Never report a text as sent without a `message_id`.**

### The palette comment that reads like a stub

In `palette-data.ts` the `sms` entry sits directly under a source comment reading
`// Placeholders`, beside genuinely unbuilt integrations. It is not a placeholder. The handler
has been real since 2026-08-16. If you skim the palette source and conclude SMS is a stub, you
have reproduced the original audit's mistake. The real signals are the absence of an
`isComingSoon` flag and the absence of a warning in its schema.

### Picking the sending number

No MCP tool backs the node's `from` picker; the editor populates it from a builder-only
endpoint. From here use `voice_numbers_list` (optional `is_active` as the **string** `'true'`
or `'false'`) and pass one number in E.164.

Omitting `from` is usually right. The rail auto-picks the oldest active DID whose `purpose` is
`main`, then the oldest active DID of any purpose, skipping unverified toll-free numbers in both
passes. With an explicit `from` the account must own it and it must be active, else
`no_sending_number`; an explicit unverified toll-free number is refused loudly as
`toll_free_unverified` rather than silently falling back.

### Rate caps are a design constraint, not an error

Automation sends are volume-capped to protect the number's carrier reputation:

- **100 per hour per account**
- **400 per day per account**
- **6 per hour to a single recipient**

"Automation" means any send with no user attached, which is every workflow node, every agent and
every cron. A human typing in the dashboard composer is never blocked by, and never consumes,
this budget.

A runaway loop stops at the cap rather than getting the account's 10DLC campaign filtered by the
carriers, which is a far more expensive failure and much slower to undo. Design within the caps,
and **do not split a blast across hours, workflows or the direct tools to dodge them** - the cap
is protecting the number's reputation, and carrier filtering does not care which rail the volume
rode in on. If a campaign genuinely needs more volume, that is a conversation about the
messaging programme. Per-account overrides exist in `accounts.settings.sms_automation_caps` and
are not writable from this surface.

Two details that change how you read a failure: attempts are counted from the message rows the
rail writes, so **failed sends count too**, and the counting query **fails open**, so a database
blip does not silence legitimate automation. The per-recipient cap of 6 per hour matters most
for conversational flows.

### Templating, and the empty-string collapse

The engine stores every executed node's output under its node id, and additionally aliases the
start node's result under the literal key `trigger`. Downstream of an `smsReceivedTrigger` all
of these resolve:

- `{{trigger.from}}`, `{{trigger.body}}`, `{{trigger.to}}`, `{{trigger.threadId}}`,
  `{{trigger.contact.id}}`, `{{trigger.media}}`
- `{{trigger.output.from}}` and friends
- `{{<triggerNodeId>.from}}`, the most robust form

**What does not resolve: `{{data.from}}`.** The `data` alias points at the trigger's `payload`
key, which webhook triggers have and the SMS trigger does not.

**An unresolved `{{...}}` collapses to an empty string** and logs a warning. For the `sms` node
the collapse is a good outcome: an empty `to` fails with a readable missing-recipient error and
an empty `body` fails with an empty-body error. **So if your SMS node reports one of those two
errors and the config looks populated, the cause is a template that resolved to nothing.**
`workflow_run_get` shows the node's resolved `input`; `workflow_run_logs` shows the miss
warnings.

Prefer the `trigger.` or node-id forms over bare flat access like `{{from}}`. Flat access works
only while every intervening handler spreads its input context forward, and not all of them do.

### Retries can double-send

The node's execution defaults are a 30 second timeout, `maxAttempts: 2`, and in-process pacing
of 20 calls per minute. The retry policy matches on message patterns that include `timeout` and
`ETIMEDOUT`.

The rail has no idempotency key across attempts: each call writes a fresh message row and makes
a fresh carrier call. **If the carrier actually delivered but the response timed out, the retry
sends a second text.** The engine's send-once guard does not cover this: it protects against a
replayed or re-fired run, not against the retry loop inside one node execution.

Decide deliberately rather than inheriting the default. If a duplicate is unacceptable, set
`data.executionConfig = { retryPolicy: { maxAttempts: 1 } }`. If a dropped text is worse than a
duplicate, leave it.

Related: `data.executionConfig.onError` defaults to `fail`. Set it to `continue` when the text
is a nice-to-have and the rest of the graph must still run. Do **not** set it to `continue` on
a workflow whose whole purpose is the text, or a permanently failing send reports green forever.

### Quiet hours do NOT apply to the `sms` node or the direct tools

This is the asymmetry that catches people. Neither `dispatchAccountSms` nor the `voice_sms_*`
routes have a time-of-day gate. Quiet hours (09:00 to 20:00 local, defaulting to US Central
when the account has no timezone configured) live one layer up, in the survey, review-request
and referral senders only.

**A plain `sms` node fired by a `scheduledTrigger` at 03:00 will text at 03:00**, and
`voice_sms_send_to_contact`'s `scheduled_for` is an absolute UTC instant that can land at 3am
local (the contact's timezone is never read). If the message is marketing-shaped rather than
transactional, put the time discipline in the trigger yourself. The concrete patterns:

- **Schedule inside the window**: a `scheduledTrigger` cron pinned to a business-hours hour in
  the ACCOUNT's timezone (e.g. `0 10 * * *` for 10:00) feeding the `sms` node. Say which
  timezone the cron runs in when you present the plan.
- **Gate an event-driven text**: trigger -> `conditional` node testing the current hour against
  the window -> `sms` on the `'true'` edge; on `'false'`, a `delay` node until the window opens
  (or drop, if a late text is worse than no text - say which you chose).
- **Or use the rails that already have the discipline**: `surveySend`, `reviewRequest` and
  `reviewFunnelSend` honor quiet hours and reschedule instead of sending.

### Related send nodes

Several nodes send SMS as one of two channel options and apply their own throttles:

- `reviewFunnelSend`: rating, then a video or written testimonial, then the public review ask.
  Keys `contact_id`, `email` (fallback), `funnel_id` (blank uses the account default),
  `channel`.
- `reviewRequest`: a public review ask with a tokenized funnel link, ask-frequency throttle,
  and click and conversion tracking. Keys `contact_id`, `email`, `channel`.
- `surveySend`: an NPS, CSAT or custom survey. Keys `survey_id`, `contact_id`, `email`,
  `channel`.

`channel` is `auto | email | sms` on all three, defaulting to `auto`. All three honor SMS quiet
hours, and all three report a throttled contact as **skipped, not failed**. Read the step
output rather than assuming a non-error means delivered.

Prefer these over hand-rolling the equivalent with an `sms` node and a URL you built yourself.
They mint the tokens, apply suppression, and record attribution.

### The rung-1 sender people miss: `survey_send`

**`survey_send`** genuinely sends a text (full-profile key required). Parameters: `survey_id`
(required), `contact_ids`, `emails`, `channel` (`auto | email | sms`, default `auto`, which
picks SMS when a mobile is on file). It is not a preview - confirm with the user before calling
it. Guards match a dashboard send: active survey, per-contact throttle, dedupe, 200 recipients
per call, and **SMS respects quiet hours**: called outside 09:00-20:00 in the account's
timezone, the delivery is rescheduled to the next window and re-checked at dispatch. **If you
call `survey_send` at 22:00 and report "sent", you are wrong. Report "scheduled".** Pair with
`survey_list` / `survey_get` / `survey_results`.

---

## Part 2: Receiving and reading

### Reading conversations is rung 1 now

**`voice_sms_threads_list`** is the paged SMS inbox for the account, newest first by
`last_message_at`. Each thread carries `tenant_e164` (your DID), `peer_e164` (the customer),
`unread_count`, `archived`, `contact_id`, `assigned_user_id`, and a `preview` with body,
direction and `delivery_status`. It is the one tool in the SMS group that changes nothing.
Traps: a 402 `voice_not_enabled` is a plan refusal, NOT an empty inbox; `limit` clamps to
1-100 (default 50) and a non-numeric limit is not coerced; every row is customer PII.

**`voice_sms_thread_messages_list`** is one thread's transcript, newest first, each message
carrying `direction`, `body`, `media_urls`, `delivery_status`, `error_message`, `sent_at` and
`telnyx_message_id`. **This answers "was that specific message delivered"** - with the honesty
rule attached: `delivery_status` is nullable, so **null means never reconciled, not failed**,
and `'sent'` only means Telnyx accepted it. **NOT read-only despite being a GET**: opening a
thread resets its `unread_count` to 0, silently clearing the badge a human was triaging from.
Pass `mark_read: 'false'` for a background sync - only that exact string disables the reset;
any other value, including omitting it, clears the badge. Its cursor must be a message id from
inside THIS thread (hard 400 otherwise), unlike the threads list, which ignores a bad cursor
and replays page one.

These two work on any account with the Voice add-on - no helpdesk flag, no matched CRM contact.
The older claim that raw SMS threads were unreadable from this surface is obsolete.

### The inbound pipeline, end to end

Understanding the order is what makes the STOP behaviour in Part 3 make sense.

1. The carrier (Telnyx) delivers an inbound webhook to `hiveku_voice_server`.
2. The voice server's SMS ingester persists it into `voice_sms_threads` and
   `voice_sms_messages`, matches a CRM contact by phone, and emits a change event.
3. **Compliance keywords are detected and acted on HERE**, before the builder is involved.
4. If and only if the message is not a bare compliance keyword, the ingester calls the builder
   at `POST /api/internal/voice/sms-received`.
5. That builder route does three independent things: opens or threads a helpdesk ticket, fires
   inbound-SMS workflow triggers, and sends the in-app bell plus mobile push.

Step 4 is the gate. **Anything filtered at step 3 never reaches steps 4 or 5** - invisible to
workflows, helpdesk and notifications, though the message row itself is still persisted and
therefore now visible in `voice_sms_thread_messages_list`.

One consequence worth banking: the ingester's insert is idempotent on the carrier's message id
and it only notifies the builder when a row was genuinely inserted, so **a carrier re-delivery
does not re-fire the trigger.**

### The `smsReceivedTrigger` node

Two filters, both optional, both also accepted in camelCase (`keywordFilter`, `numberFilter`):

| Key | Notes |
|---|---|
| `keyword_filter` | Fire only when the body CONTAINS this. Case-insensitive SUBSTRING match |
| `number_filter` | Fire only for texts to this business number (DID), e.g. `+15551234567` |

**`keyword_filter` is a substring match, not a word match.** A filter of `stop` matches
"nonstop" and "stopwatch". A filter of `yes` matches "yesterday". Pick distinctive keywords:
`QUOTE`, `BOOK`, `RESCHEDULE`.

**`number_filter` is compared on the last ten digits**, so a human-formatted `(555) 123-4567`
matches an E.164 DID. It also **fails closed**: if the inbound DID cannot be resolved, the
workflow does not fire and a warning is logged. Over-firing an automation that can send SMS,
send email and spend AI credit was judged the worse failure, so silence is the deliberate
choice.

**Pass filters as strings.** `node.data.config` is raw JSON and nothing between the tool and
the database constrains it. A numeric value is coerced safely, but any other non-string type
reads as empty and the filter is silently treated as absent.

### The trigger payload

`trigger.output` carries `from` (the texter, E.164), `to` (the business DID, or null if
unresolved), `body`, `media` (MMS attachment URLs), `threadId`, `contact` as
`{ id, name, phone }` with nulls when no CRM contact matched, `timestamp`, plus
`triggeredBy: 'sms_received'` and `eventType: 'sms.received'`.

An image-only text arrives as an empty `body` with a populated `media`, so branch on `media`
rather than assuming an empty body means an empty message. `body` is the **full** text (an old
build truncated it to the 240-character bell preview; that is fixed). `contact.id` is null when
the voice server found no phone match, **even when the helpdesk projection went on to create a
contact**, because the two run from different inputs.

### The node in the graph IS the subscription

`workflow_trigger_types_list` shows an `sms_received` entry because that discovery catalog
consolidates several sources, but the `workflow_triggers` table route only really handles
`webhook`, `scheduled_trigger` and `database_trigger`. Inbound SMS fires by scanning
**enabled** workflows' graph definitions for an `smsReceivedTrigger` node.

**Do not call `workflow_trigger_create` for SMS.** A trigger row adds nothing and its absence
breaks nothing. `workflow_event_trigger_types_list` is the right discovery tool for graph-node
triggers.

### The other ways it does not fire

Beyond the STOP suppression in Part 3, work down this list before concluding a workflow is
broken:

- **`is_enabled` is false.** The executor filters on it. A *paused* workflow does still match,
  deliberately: the exec worker records a replayable stopped run rather than dropping the
  event.
- **The graph has no edges.** A trigger node sitting alone is skipped entirely.
  `workflow_validate` catches this as an orphan warning.
- **The fan-out was throttled.** The builder route caps inbound triggers at 30 per account per
  minute and 6 per sender per minute. The limiter **fails open**, so a Redis blip never
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

A first-word match writes (opt-out) or deletes (opt-in) a row in `voice_sms_opt_outs` scoped to
the account and the peer number. **Every outbound send path consults that table before sending
and refuses for an opted-out peer** - the automation rail as `opted_out`, `voice_sms_send` and
`voice_sms_thread_reply` as 409 `opted_out`, `voice_sms_send_to_contact` as 403 `opted_out`.
The carrier sends the compliance confirmation. The message itself is still persisted for the
audit trail either way.

### The suppression rule

The builder is NOT notified when all three of these hold:

1. A compliance keyword was detected, AND
2. the keyword is not `yes`, AND
3. **the entire message body is exactly ONE word.**

When suppressed there is no bell, no push, no helpdesk ticket, and **no `smsReceivedTrigger`
fire.** This exists because two prior-owner STOPs on a freshly purchased number once pushed to
a whole team and read as an incident.

### What follows from that

**A `smsReceivedTrigger` with `keyword_filter: "STOP"` will never fire.** Do not build it. It
is not a partially-working automation; it is dead. The platform has already registered the
opt-out, already refuses every future send to that number, and the carrier has already sent the
confirmation.

Three corollaries that bite:

- **`cancel`, `end` and `quit` are OPT-OUT keywords.** A customer replying a bare "CANCEL" to
  an appointment reminder is opted out of ALL future SMS from the account, and your
  cancellation workflow never sees it. If a flow needs a cancellation by text, instruct the
  customer to reply with a word that is not on the opt-out list, and say so in the outbound
  message.
- **`yes` is deliberately carved out** of the suppression, because it is the exact word the
  chat-to-SMS handoff tells customers to reply with. A bare "YES" DOES notify and DOES fire
  triggers. It still registers as an opt-in.
- **Multi-word messages always notify.** "STOP texting me" is a human talking, so it reaches
  the trigger, the ticket and the bell. Only the bare single word is suppressed.

If a user asks for "an automation that runs when someone texts STOP", the honest answer is that
STOP is already fully handled and the event is intentionally not delivered. Offer the
multi-word variant if what they actually want is to catch angry unsubscribes phrased as
sentences.

### Writing an opt-out for a bare number: `voice_sms_opt_out_add`

Rung 1 since 2026-08-27, and the tool for honouring a stop request made by phone, email or in
person from a number that may not be a CRM contact. It adds one E.164 number to
`voice_sms_opt_outs` with source `'manual'`, after which every outbound path refuses it.
Returns `{ ok, e164, already_present }`.

Traps from its registered description: **SILENT NO-OP** - if a row already exists the route
writes NOTHING and still answers 200 with `already_present: true`, so your reason is discarded
and the stored source and date are untouched; this tool can never correct or re-note an
existing opt-out. A texted STOP is already written automatically with source `'auto'`, and the
route deliberately never downgrades such a row to `'manual'`. **There is still no tool that
LISTS or REMOVES `voice_sms_opt_outs` rows by number** - removal (re-subscription) happens by
the customer's own START/YES, or in the dashboard. That absence is a compliance feature; do
not work around it.

### Testing compliance behaviour

You cannot test this with `test_mode`, because the suppression happens upstream of the workflow
engine entirely. Testing a STOP path means sending a real text from a real handset, which also
creates a real opt-out row that then blocks future sends to that handset. Do that deliberately
or not at all, and know that `start` reverses it.

---

## Part 4: DNC read and write (rung 1, full-profile key)

These operate on the CRM contact, a broader layer than the number-scoped `voice_sms_opt_outs`
row a STOP keyword writes. All four are `crm_`-prefixed, so under a communications-scoped key
they do not resolve - use `voice_sms_opt_out_add` (Part 3) and `email_suppression_*` there, or
escalate to a full-scope key.

- **`crm_get_dnc_status({ contact_id })`** returns `is_dnc`, `email_suppressed`,
  `email_reason`, `sms_suppressed`, `sms_reason`, `lifecycle_stage` and `lead_status`. The SMS
  half reads the same table the send gates consult. **Check this before drafting any
  outbound.**
- **`crm_set_dnc({ contact_id, reason, channels? })`** is one atomic write that suppresses
  email globally, suppresses SMS when a phone is present, keeps the legacy
  sequence-suppression row in sync, flips lifecycle to unsubscribed, clears `lead_status`, AND
  exits every active sequence enrollment. Idempotent. `reason` is required: use the prospect's
  own words. `channels` restricts to `['email']` or `['sms']`; default is both. Call it the
  moment a prospect signals stop in any channel and any wording. Do not wait for confirmation
  to suppress; suppression is cheap and reversible and the compliance risk is not. A free-text
  note on the contact is not a substitute, because nothing reads notes at send time.
- **`crm_remove_dnc({ contact_id, reason })`** soft-removes from suppression lists. **It does
  NOT reset `lifecycle_stage` or `lead_status`.** Use sparingly. Most requests to undo a DNC
  are mistakes, and undoing a customer's own STOP without their re-consent is a compliance
  problem in the other direction.

Read-only audit views: `crm_list_email_suppressions` (optionally `?email=`), and
`email_suppression_list` / `email_suppression_add` / `email_suppression_remove` on the
marketing-side list (these three ARE in the communications profile).

### The two layers can disagree

A STOP text writes a number-scoped opt-out in the voice layer without touching the CRM
contact's DNC state, and `crm_set_dnc` writes CRM suppression which the voice send path honours
through its own check. When auditing whether someone can be contacted, check
`crm_get_dnc_status` for the contact AND remember that a bare STOP from a number the CRM never
matched leaves no CRM trace at all.

### The phone-format trap

Verify this before you report a contact as SMS-suppressed. The send-time check is an **exact
string equality** lookup on the number after E.164 normalization.

- A STOP-driven opt-out is written by the voice server from the carrier's own E.164 value, so
  it always matches.
- `crm_set_dnc` writes `contact.phone` **as stored, trimmed only, not normalized**.
- Contacts created through the CRM create path are normalized to E.164 on write. Contacts
  whose phone was set through the **update** path are not: that route passes `phone` straight
  through.

So when a contact's stored phone is not already E.164, `crm_set_dnc` can write an opt-out row
keyed on `(555) 123-4567` while the send path looks up `+15551234567` and finds nothing.
`crm_get_dnc_status` reads with the same unnormalized key, so **it will report
`sms_suppressed: true` for a row that does not actually block sends.**

Practical rule: before relying on `crm_set_dnc` for SMS suppression, read the contact and
confirm `phone` is in `+1XXXXXXXXXX` form. If it is not, fix it with `crm_update_contact`
first, then set DNC. If you cannot fix it, say so plainly rather than reporting the contact as
suppressed. A live mismatch is a compliance incident, not a curiosity.

### There is no DNC workflow node

The palette has no DNC or opt-out node, so a workflow cannot check or set DNC directly. The
rail's own `opted_out` refusal is the in-workflow gate: let the `sms` node fail and branch on
it, or do the `crm_get_dnc_status` read from the session before running the workflow at all.

---

## Part 5: The helpdesk projection

Inbound texts are also projected into helpdesk as tickets. This remains a useful rung-1 read on
helpdesk-enabled accounts (full-profile key); for the raw conversation itself,
`voice_sms_threads_list` / `voice_sms_thread_messages_list` (Part 2) now work regardless.

### How it works

The builder route calls a dedicated SMS ingest that mirrors the email ingest: dedupe by message
external id, thread on the SMS thread id held in `source_meta`, resolve or create the contact
by phone, then fire helpdesk triggers and create-automations.

A new ticket carries `channel: 'sms'`, `status: 'open'`, `priority: 'normal'`, a subject of the
form "SMS from &lt;name or number&gt;", and a `source_meta` holding `via: 'inbound_sms'`,
`sms_thread_id`, `sms_did` (the business number) and `peer_e164` (the customer's number). Those
last two are how you get a reply address. A lazily created contact gets
`lead_source: 'inbound_sms'`.

Conditions and caveats:

- **Gated on the account actually using helpdesk.** It checks `helpdesk_agent_enabled` and
  returns without doing anything when false. **If `helpdesk_ticket_list({ channel: 'sms' })`
  is empty on an account you know receives texts, suspect this flag before suspecting your
  query** - and read the thread directly with the Part 2 tools.
- **Best-effort.** The route wraps it in a try/catch and logs a failure rather than raising.
- **It threads rather than always opening.** New inbound messages thread into an existing
  ticket whose status is `open` or `pending`. A resolved or closed ticket does not absorb a
  new message; that opens a fresh one.
- **Auto-acknowledge is deliberately skipped** for SMS, because that reply path is
  email-shaped and not SMS-safe.

### Reading it

- `helpdesk_ticket_list({ channel: 'sms' })`, then `helpdesk_ticket_get` and
  `helpdesk_ticket_messages`. Inbound rows carry `metadata.via: 'sms'` plus
  `voice_sms_message_id` and `voice_sms_thread_id`, so you can correlate a ticket message to
  the underlying thread.
- `helpdesk_ticket_list_for_contact({ contact_id })` for one person's tickets. Triage as
  normal; `helpdesk_macros_list` then `helpdesk_macros_render` for reply text so you never
  ship raw `{{placeholder}}` text.

### The contact-timeline read

Every outbound text through the automation rail whose recipient matched a CRM contact is
mirrored into `crm_activities` with `type: 'sms'`. So
`crm_list_activities({ type: 'sms', contact_id })` lists that contact's texts, and
`crm_contact_touch_history` gives a merged timeline. The read-side `type` filter passes
through without a whitelist, so `sms` works even though the tool's description only enumerates
note, call, email, meeting and task; `crm_create_activity` **rejects** `type: 'sms'` with a
400, because the write side does enforce the whitelist. Note the direct-tool asymmetries: a
`voice_sms_send_to_contact` immediate send writes the activity row (with your RAW body, Part
1); its scheduled branch and `voice_sms_thread_reply` write NO activity row at all, so a thread
reply is invisible on the contact timeline.

### Do NOT reply with `helpdesk_ticket_send_reply`

This is a verified silent failure and it is the worst one in this reference.

`helpdesk_ticket_send_reply({ id, body })` writes a `helpdesk_messages` row with
`direction: 'outbound'`, stamps `first_response_at`, and returns the created message. Delivery
over the wire happens in exactly two branches, both requiring `channel === 'chat'`: a social DM
sent via Graph, and the chat-to-SMS mirror for the handoff flow.

**There is no delivery branch for `channel === 'sms'`.** Replying to an SMS ticket records the
reply, marks the ticket as responded, returns success, and **sends nothing to the customer**.
The ticket looks handled. The customer is still waiting. Nothing errors.

The same trap exists in the palette: the **`helpdeskSendReply` node also only writes a message
row** and delivers on no channel at all.

**To actually text the customer back**: ad-hoc, `voice_sms_thread_reply` on the
`source_meta.sms_thread_id` (remember it writes no ticket row and no activity row - log it on
the ticket separately); in an automation, the `sms` node with `{{trigger.from}}`. The idiomatic
reply automation is both halves:

```
smsReceivedTrigger  ->  sms                        (delivers the text)
                    ->  helpdesk_ticket_send_reply (records it on the ticket)
```

Send with the node, then log it so the operator's inbox shows what the customer received. If
you do only the second half, you have written a note to yourself.

### The one case where the reply tool does text

A **chat** ticket linked to an SMS thread and **confirmed**. The chat-to-SMS handoff links a
widget chat ticket to a thread, and the link starts unconfirmed. When the phone's owner replies
YES, `source_meta.sms_link_confirmed` flips to true, and from then on an outbound reply on that
chat ticket is mirrored out as a text, to the thread's `peer_e164` (the number that actually
consented) and never to `contact.phone`. Both gates are hard. The mirror is fire-and-forget,
and it runs with no user attached, so it consumes the automation volume budget.

One more note on `helpdesk_ticket_create`: it accepts `channel: 'sms'`, but what you create is
a ticket labelled SMS with no underlying thread and no correlation to a real conversation. Only
do it deliberately.

---

## Part 6: Templates and scheduled sends (rung 1)

### SMS templates

Four tools, all live since 2026-08-27, all operating on reusable snippets that reach nobody
until a send route renders them:

- **`voice_sms_templates_list`** returns every snippet (id, name, body, category, shortcut,
  usage_count, last_used_at). ORDERING TRAP: the sort is `last_used_at DESC` and Postgres puts
  NULLS FIRST on DESC, so every NEVER-USED template leads the list ahead of the one sent an
  hour ago - do not read position 0 as "most used". COUNTER TRAP: `usage_count` moves only when
  an IMMEDIATE send carried `template_id` and cleared the carrier, and the bump is
  fire-and-forget.
- **`voice_sms_template_create`** writes one row; limits are 422s with Zod issues. SHORTCUT
  TRAP: the shortcut regex ends in `*` so an EMPTY STRING passes validation and is stored as a
  real value; the unique index is (account_id, shortcut), so the SECOND template created with
  shortcut `''` is a 409 `shortcut_taken`. Omit the field rather than passing `''`.
- **`voice_sms_template_update`** patches in place. SILENT NO-OP: an empty object answers 200
  having changed nothing but `updated_at`, and unknown keys are stripped without error.
  Confirm an edit by reading the returned row, never by the status code. It returns the FULL
  row where list/create return an eight-field projection. Pass `category`/`shortcut` as null
  to CLEAR them.
- **`voice_sms_template_delete`** is IRREVERSIBLE: no soft-delete, no version history, no undo,
  and NO DEPENDENCY GUARD - nothing checks references before deleting, `voice_sms_messages.
  template_id` has no FK, so historical rows are left pointing at an id that no longer
  resolves and usage reports joining on it go blank. Read the body with the list tool FIRST.
  It does not unsend anything: sent messages keep their rendered body and a scheduled message
  stored its text at scheduling time, so it still goes out.

### Scheduled sends

`voice_sms_send_to_contact({ scheduled_for })` defers a send - but only when `scheduled_for` is
more than 30 SECONDS ahead; anything nearer or in the past SENDS NOW. When it defers it writes
a `delivery_status: 'scheduled'` row and returns without calling the carrier;
`/api/cron/sms-scheduled-tick` dispatches later (opt-out re-checked at dispatch). Know the
gaps, all from the registered description: the scheduled path writes NO `crm_activities` row,
fires NO webhook and never bumps template usage, so a scheduled send is invisible on the
contact timeline - and **there is no tool or route here to list or cancel one**. Scheduling a
text you cannot cancel is a decision the user must make knowingly; say so before scheduling.
`scheduled_for` is an absolute UTC instant with no quiet-hours or timezone awareness (Part 1).

The workflow-side substitutes remain valid: a `delay` node or a `scheduledTrigger`, which you
CAN inspect and disable.

---

## Part 7: 10DLC and toll-free registration (rung 1)

Regulated carrier onboarding is tooled now. It has real fees, real review times and real
rejection reasons, so the order matters and two of the calls are irreversible filings.

**Diagnose first: `voice_sms_registration_get`.** The account's 10DLC brand plus every campaign
on it, and the single "can this account send SMS at all?" verdict. **Key on `can_send` and
`blocking_reason` instead of re-deriving the rule** (`can_send` is true on a VERIFIED brand
with an ACTIVE, provisioned campaign, OR on verified toll-free alone with no brand at all).
`blocking_reason` is one of `no_brand`, `brand_unverified`, `campaign_pending`,
`no_active_campaign`, `no_messaging_profile`. For the toll-free path,
`voice_sms_toll_free_verification_get` returns per-number verification status and the newest
requests - carriers hard-block unverified toll-free senders, and the auto-picker never selects
one.

**The filing lane, in order:**

1. **`voice_sms_campaign_draft`** drafts a carrier-compliant campaign from the account's own
   business context - **text only: no row is created, nothing reaches Telnyx or the registry**.
   It requires the brand to be VERIFIED first.
2. **`voice_sms_cta_preflight` - run this first, always, before any filing.** It fetches each
   opt-in URL the message flow names with NO JavaScript, exactly as the reviewer's crawler
   does, and reports which required CTA elements are present. It files nothing and costs
   nothing, so a missing disclosure costs a re-check here instead of a rejection fee and
   roughly a week of review. **A CTA rendered only by client-side JavaScript passes in a
   browser and FAILS here** - the single most common rejection reason.
3. **`voice_sms_brand_submit`** creates or updates the single 10DLC brand and **FILES IT WITH
   THE CARRIERS. Not a draft. Irreversible and fee-bearing**: the legal identity (legal name,
   EIN, address) goes to Telnyx, The Campaign Registry and the carriers for paid vetting, and a
   later correction is a RE-VET with another fee, never a deletion. A wrong EIN typically
   returns as a FAILED brand. **This is a filing about a real company and wants a human
   decision, not an agent's inference.** On a FAILED brand, `voice_sms_brand_feedback_get`
   returns the stored carrier feedback naming the exact refused fields (`feedback: null` means
   no failure snapshot, NOT that the brand is healthy).
4. **`voice_sms_campaign_resubmit`** re-files a campaign row that never reached Telnyx
   (fee-bearing at the registry). The body is optional; send nothing to re-file as stored, or
   the COMPLETE payload - it is a replace, not a patch, so omitting a field you previously set
   CLEARS it. Run the preflight on the flow before retrying; resubmitting a rejected flow
   unchanged buys another rejection.
5. **`voice_sms_campaign_carriers_get`** is the live per-carrier (MNO) verdict for one
   campaign, straight from Telnyx: per-carrier status, throughput (tpm) and daily cap. This
   answers "T-Mobile is filtering us but AT&T is fine". ID TRAP: it takes the HIVEKU campaign
   UUID (`brand.campaigns[].id` from `voice_sms_registration_get`), NOT the Telnyx id -
   passing the Telnyx id returns 404.
6. **`voice_sms_number_assign_campaign`** registers one DID to a specific approved campaign -
   CARRIER PAPERWORK, not a local preference; moving it later is another filing. ID TRAP,
   inverted from the previous tool: this one takes `telnyx_campaign_id`, the REGISTRY id, read
   from `voice_sms_registration_get`. With a single campaign the assignment is automatic and
   this is unnecessary.

Remember from Part 1: the direct send tools do NOT check any of this. Registration decides
whether carriers deliver your traffic, not whether the tools accept it.

---

## Part 8: What remains dashboard-only (rung 3)

The list is much shorter than it used to be. Still a handoff:

- **Bulk send.** The `sms` node sends one message per execution, so a list means a `forEach`
  feeding an `sms` node, which runs straight into the 100/hour and 400/day caps; the direct
  tools have no batch form and dodging the caps with them burns the number's carrier
  reputation instead. A 500-person blast will half succeed and then start failing, which is
  worse than not starting. Say no and point at the caps and the campaign rails.
- **Opt-out LIST and REMOVE by number.** Only `voice_sms_opt_out_add` exists (Part 3).
  Re-subscription is the customer's own START/YES or a dashboard action - by design.
- **Cancelling a scheduled direct send.** The row exists, the cron will send it, and nothing
  on this surface lists or cancels it (Part 6).
- **Per-account automation cap overrides** (`accounts.settings.sms_automation_caps`).
- **The threaded conversation UI and composer** (a human send that bypasses the automation
  caps).

One adjacent boundary worth naming because it looks reachable and is not: **the helpdesk
department agent cannot be reached to send SMS.** It has a real SMS tool, and
`talk_to_department` is a real tool, but `helpdesk` is **not** in `talk_to_department`'s domain
enum. (`helpdesk` IS valid for `account_context_get`, which is a different enum, and that is
the source of the confusion.) Call `list_departments` to see what the tenant actually has.

---

## Part 9: Diagnosis quick reference

| Symptom | Likely cause |
|---|---|
| Workflow never fires on "STOP" | Bare compliance keywords never reach the builder. Working as designed |
| Customer texted "CANCEL", nothing happened, now they get no texts | `cancel` is an opt-out keyword. They are suppressed |
| Bare "YES" fires but bare "START" does not | `yes` is carved out of suppression; `start` is not |
| Keyword filter matches too much | Substring match. `stop` matches "nonstop" |
| Workflow scoped to one number never fires | `number_filter` fails closed when the inbound DID cannot be resolved |
| Trigger ignores a filter entirely | The filter was saved as a non-string type and read as absent |
| Nothing fires and there is no run at all | `is_enabled` is false, or the graph has no edges |
| Ticket exists but no workflow ran | The inbound trigger fan-out was throttled. Ticket and bell are ungated |
| No ticket for an inbound text | Helpdesk not enabled, or the ingest failed best-effort. Read the thread directly (Part 2) |
| New ticket instead of threading | The prior ticket was resolved or closed, not open or pending |
| Reply recorded but customer got nothing | `helpdesk_ticket_send_reply` does not deliver for `channel: 'sms'` |
| Node errors "no recipient" and the config looks fine | A template resolved to empty. Read `input` in `step_states` |
| Sends stop partway through a batch | Automation caps (100/hr, 400/day, 6/hr per recipient), or the direct rail's per-plan daily cap |
| One customer stops receiving, others fine | Per-recipient cap, or a `voice_sms_opt_outs` row for that number |
| Every automation send returns `sms_not_enabled` | `voice_sms_registration_get`: read `blocking_reason` (Part 7) |
| Direct send 502 `send_failed` with a policy-sounding reason | The reputation governor: kill switch, content screen, daily cap or velocity. Retrying will not help |
| Direct send 200 but the customer got nothing | `sent` = Telnyx accepted. Read `delivery_status` on the message row; carriers filter unregistered A2P silently |
| `delivery_status` is null | Never reconciled - unknown, NOT failed |
| Explicit `from` rejected as unverified toll-free | That DID has not passed toll-free verification. Use a local number |
| Customer got the same text twice | A timeout retry re-sent (`retryPolicy.maxAttempts: 1` to prevent), or an operator re-ran the send. Read the thread before any retry |
| Text arrived at 3am | No quiet hours on the `sms` node or the direct tools; `scheduled_for` is absolute UTC. Part 1 |
| Review or survey reports skipped | Throttle or quiet hours. Skipped is not failed |
| `sms_suppressed: true` but texts still land | Opt-out row keyed on a non-E.164 phone. Compliance incident |
| Unread badge keeps clearing on its own | A poller reading threads without `mark_read: 'false'` |
| A scheduled send never showed on the timeline | The scheduled branch writes no activity row. Part 6 |

### The order to work a "text never sent" report

1. If it was a direct-tool send: `voice_sms_thread_messages_list` on the thread - the row's
   `delivery_status` and `error_message` carry the answer.
2. If it was a workflow: `workflow_runs_recent({ status: 'failed', since: <10 min ago> })` -
   account-wide, so you do not need to know which workflow tripped.
3. `workflow_run_get` and read the `sms` node's `error` in `step_states`. It carries the rail's
   reason verbatim: map it against Part 1's gate list.
4. `workflow_run_logs` for template misses and retry attempts.
5. A node skipped as `already_sent` means the send-once guard fired: this run was a replay.
6. A node absent from `step_states` was never reached. `workflow_validate`.
