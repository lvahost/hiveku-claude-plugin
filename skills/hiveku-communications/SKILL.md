---
name: hiveku-communications
description: Operating manual for everything a Hiveku account sends and receives. Use for ANY communications work - reading the shared team inbox, finding and answering a customer email, replying inside an existing thread, a mailbox that stopped syncing or says "No active Gmail connection found", connecting Gmail or Outlook, sending or automating text messages, STOP replies and do-not-contact compliance, inbound texts that should become tickets, missed calls, voicemails, call recordings and transcripts, phone numbers and extensions, and the email infrastructure behind campaigns, transactional templates, drip sequences, audiences, sending domains and deliverability.
---

# Hiveku Communications Operating System

Communications is the widest department on the account and the least evenly tooled. Some of
it is one MCP call. Some of it is only reachable by building a small workflow. Some of it is
dashboard-only and your job is to hand the user a precise next step. Getting that judgement
right is most of the skill, so the ladder comes first.

## The reachability ladder (read before you say "there is no tool for that")

**A missing tool name does NOT mean a missing capability.** This mistake has already been made
about this department: an operator searched for `sms_send`, found nothing, and reported that
Hiveku could not send text messages. Hiveku sends text messages all day. There is simply no
direct MCP tool for it, because SMS lives on rung 2.

| Rung | Surface | How you reach it | How you confirm it exists |
|---|---|---|---|
| 1 | A direct MCP tool | Call it | The tool name resolves |
| 2 | A workflow NODE driven from MCP | Build a small workflow and run it | `workflow_node_types_list` lists the node `type` |
| 3 | Dashboard only | Hand the user a precise, single next step | Neither of the above has it |

Work the rungs in order and never stop at rung 1. The failure mode is always the same shape:
absence of a tool name gets reported as absence of a feature.

**Three worked examples, all verified:**

- **Send a text message.** There is no `sms_send`, no `sms_*` tool of any kind. There is an
  `sms` workflow node. Rung 2.
- **Send a one-off email to a CRM contact.** There is no direct send tool. The Olympus route
  exists and is documented (`POST /api/olympus/crm/contacts/[contactId]/emails`) but nothing in
  the MCP catalog maps to it. The `crmSendContactEmail` node does. Rung 2.
- **Read the shared inbox.** `crm_inbox_list` and `crm_inbox_recent`. Rung 1, no workflow needed.

The corollary matters just as much: do not invent a tool name to fill a gap. If a name does not
resolve, it does not exist. Check the node catalog before you conclude anything, and prefer
`hiveku_docs_search` / `hiveku_docs_get` over guessing at an argument shape.

## Working rung 2: build, dry run, read the steps

The build sequence, in order:

1. `workflow_node_types_list` to get the catalog. Read the chosen type's `fields[]` to learn the
   `data` keys. Do not trust the count in the tool's own description, which understates the
   catalog badly. For an event-driven trigger call `workflow_event_trigger_types_list` instead,
   which gives you `node_type`, `object_type`, `event_type` and `output_shape_keys` (what you can
   template off `trigger.output`).
2. `workflow_create({ name })`. It defaults `is_enabled: false`, which is what you want. Build
   incrementally rather than passing a whole `definition`.
3. `workflow_node_add({ workflow_id, type, data })` per node. The server assigns the id and
   returns it in the form `<type>_<8hex>`. Then `workflow_edge_add({ workflow_id, source,
   target })`. Leave `sourceHandle` empty except off a `conditional` (where it MUST be `'true'` or
   `'false'`) or a `switch` (a `handleId` from `switchConfig.cases`).
4. `workflow_validate`, then `workflow_run({ id, test_mode: true })`.
5. `workflow_run_get({ workflow_id, run_id })` and read `step_states`, a map of
   `{ nodeId: { status, input?, output?, error? } }`. This is the debug surface. Fix with
   `workflow_node_update` (its `data` is shallow-merged) and re-run.
6. `workflow_enable` only once the dry run is clean and the user has approved.

**`test_mode: true` is the safe dry run and you should use it every time.** It skips the run-quota
burn, cascade detection and the run row, and it short-circuits every side-effecting node before it
fires: no real emails, no texts, no CRM writes, no HTTP calls, no tickets. Each skipped node
returns `__dry_run: true`, `action`, and `would_have: { ...the args it would have sent }`. Pure
handlers such as transforms and flow control still run, so structure is genuinely testable. Read
the `would_have` payload before you let anything fire for real: on this department a live run
reaches a customer's phone or inbox, and that is not undoable.

If a one-off action is all you need, a workflow whose trigger is `manualTrigger` plus one action
node, run once, is a perfectly good way to spend rung 2. You do not have to leave it enabled.
Before hand-building, check `workflow_templates_list` and `workflow_create_from_template`.

## Working rung 3: the handoff

A dashboard-only capability is not a dead end, it is a handoff. Give the user the destination,
the action, and what to tell you when they are done. "You will need to do this in the dashboard"
with no path is a non-answer. `workflow_dashboard_url` gets you a real link for workflow work.

## Operating principles

- **There is no `communications` department agent.** `talk_to_department`'s domain enum is
  `seo`, `social`, `content`, `marketing`, `branding`, `outbound`, `ppc`, `analytics`,
  `customer_avatar`, `customer_journey`, `before_after_grid`, `website_design`,
  `knowledge_base`, `workflow`. Fourteen values, none of them communications, voice, helpdesk or
  sales. An unlisted value is rejected server-side, not silently defaulted. See the Boundary
  section before you route generative work.
- **`account_context_get` has no communications domain either.** Its enum is `content`,
  `marketing`, `seo`, `social`, `ppc`, `sales`, `helpdesk`, `branding`, `customer_avatar`,
  `customer_journey`, `before_after_grid`, `website_design`, `knowledge_base`, `workflow`,
  `outbound`. For customer-facing reply copy load `helpdesk`; for prospect-facing copy load
  `sales`. Call it before drafting anything a human will read, and re-read its `instructions`
  field before each generative call.
- **Confirm before anything leaves the account.** Reading inboxes, listing calls and pulling
  metrics are free and reversible. Sending an email, sending a text, replying in a customer's
  thread, applying a Gmail label and publishing anything are not. Summarize the exact recipient
  and the exact body, get a yes, then send once.
- **Compliance is not optional and not a judgement call.** Check `crm_get_dnc_status` before any
  outbound to a contact. Honor a stop signal immediately with `crm_set_dnc`. Never build a
  workflow that re-contacts a suppressed number or address.
- **Transcripts and recordings are the most sensitive data in the account.** A call transcript is
  verbatim and unredacted and can contain card numbers, dates of birth and health details. Pull
  one only for a specific question, and do not paste it anywhere it will outlive that question.

## Play 1 - Read the shared inbox

Start by finding out which mailboxes exist: `crm_inbox_connections` returns id, email, platform
and `is_active` for every connected Gmail and Outlook inbox on the account.

Then read. **The two reader names are inverted from what you would guess, so read this twice:**

- `crm_inbox_list({ folder, limit, connection_id })` is the plain recent-N sweep, no search.
  `folder` is `'inbox' | 'sent' | 'all'`. `limit` defaults to 25 and caps at 50.
- `crm_inbox_recent({ query, ... })` is the SEARCH tool despite the name, and `query` is
  REQUIRED. It takes native Gmail and Outlook syntax:
  `'from:someone@example.com newer_than:14d'`, `'subject:"intro call"'`, `'to:me has:attachment'`.

Calling `crm_inbox_recent` expecting "the recent ones" is a 400, not a sweep. Use
`crm_inbox_list` for that.

Omit `connection_id` on either and you get the account default mailbox. On a multi-inbox account
that silently reads the wrong mailbox, which looks exactly like an empty inbox. Resolve the
connection id first whenever more than one row comes back from `crm_inbox_connections`.

Per-contact and archive reads:

- `crm_thread_for_contact({ contact_id, limit })` pulls the full live Gmail or Outlook thread for
  one CRM contact, across every email address on file for them. This is the tool for "what have
  we said to this person".
- `crm_email_thread_search({ q, contact_id?, limit? })` searches CRM-STORED email activities by
  subject or body substring. It reads synced history, not the live mailbox. The distinction
  matters: a message the CRM never synced is invisible here and present in `crm_inbox_recent`.
- `crm_lead_triage({ query, ... })` is the one-shot lead intake sweep: inbox sweep, prospect
  parse, CRM dedupe and last-outbound lookup in a single call. Provider-agnostic across
  Typeform, JotForm, Webflow, Instantly, Lemlist, Smartlead and Calendly.

## Play 2 - Reply inside an existing thread (rung 2)

There is no MCP tool that sends a reply. Replying is the `gmailReply` node, and despite the name
it works against any connected mailbox, Gmail or Outlook.

The reader gives you the thread id, the node consumes it. That is the whole pattern: read with
Play 1 or Play 4, carry the thread id into the node.

**This node has the worst authoring trap in the department, and it is verified.** The node catalog
advertises exactly two fields for `gmailReply`: `thread_id` and `body`. The handler reads neither
of those names for threading and requires three keys the catalog never mentions. The handler
actually reads:

| Key | Required | Notes |
|---|---|---|
| `connectionId` | yes | Not advertised by the catalog at all. Fails with "No email connection selected. Pick an account in the node config." |
| `to` | yes | Not advertised. Enforced on replies too, not just sends. Fails with `Email send: missing "to" address` |
| `subject` | yes | Not advertised. Enforced on replies too. Fails with `Email send: missing "subject"` |
| `body` | yes | Advertised correctly |
| `threadId` | for threading | camelCase. The catalog says `thread_id`, which the handler never reads |
| `cc`, `bcc`, `replyToMessageId` | no | Optional |

So a node built faithfully from the catalog fails immediately on the missing connection, then
fails on `to`, then on `subject`, and once you have fixed all three it still sends an unthreaded
new email because `thread_id` was never read. Set `connectionId` from `crm_inbox_connections`,
set `to` and `subject` explicitly, and spell it `threadId`.

`gmailSend` has the same missing `connectionId` problem. Its other fields (`to`, `subject`,
`body`, `cc`, `bcc`) are advertised correctly.

Successful output is `{ action, platform, messageId, threadId, to, subject, sentAt }`, so a
downstream node can chain off `threadId`.

Always dry run first. `workflow_run({ test_mode: true })` then `workflow_run_get` shows you the
`would_have` payload, which is where you catch a wrong recipient before a customer does.

Adjacent nodes: `emailNewMessageTrigger` fires on new mail in a connected Gmail or Outlook inbox
with sender, subject and label filters, and is the general-purpose choice.
`gmailNewEmailTrigger` and `outlookNewEmailTrigger` are per-platform variants of the same idea,
so pick one trigger, not two. `gmailSearch` searches a connected inbox from inside a workflow.

## Play 3 - Repair a broken connection

The symptom is any CRM email, inbox or calendar tool reporting **"No active Gmail connection
found."** That string is the signal to run this play.

1. **Diagnose.** Use `email_connections_list`. Its own description says it lists email-marketing
   platforms, which is misleading: the route reads the `email_connections` table and returns the
   account's Gmail and Outlook connections. It is the only one of the three connection readers
   that returns `connection_status`, `last_error`, `last_synced_at`, `scopes` and `is_default`, so
   it is the only one that can tell you WHY a mailbox is broken. `crm_inbox_connections` and
   `crm_list_email_connections` read the same table but return only identity and `is_active`, so
   a dead connection can still look fine there.
2. **Start the reconnect.** `email_connect_start({ platform, scope_label, user_email })`.
   `platform` is `'gmail'` or `'outlook'`. `scope_label` defaults to `modify_with_calendar`
   (Gmail read/send/modify plus Google Calendar plus Meet read-only); the alternatives are
   `readonly`, `send` and `modify`. On a multi-user account you MUST say which Hiveku user owns
   the connection via `user_email` or `user_id`; solo accounts can omit it.
3. **Hand the URL over, do not open it.** The tool returns a `setup_url` that you give to the
   user. They have to be in their own browser session to grant consent. **It is valid for five
   minutes**, so send it when they are ready to click, not at the top of a long message.
4. **The `no_oauth_app` branch.** If the call comes back with `code: 'no_oauth_app'`, the account
   has no Google OAuth Client registered with `product='crm_email_calendar'`, and no amount of
   retrying will change that. This is a rung 3 handoff: the account OWNER has to register one at
   `/dashboard/settings/oauth-apps` first. Say that, name the page, and stop. Retrying the
   connect call is the wrong move.
5. **Verify.** Poll `email_connections_list` and look for `connection_status: 'connected'`. Once
   it lands, the inbox and calendar tools return real data again.

Sending health is a different question from mailbox health. `email_service_status` answers whether
the account can send at all: read `sending_enabled` FIRST, because when it is false a
`suspension` block explains why and ALL sending is blocked regardless of the healthy-looking
reputation numbers underneath it. Suspensions are lifted by Hiveku staff, not by any tool.
`email_deliverability_check` runs the whole ladder end to end with a real send to the AWS mailbox
simulator. Never invent your own test address for this; test sends to example.com caused a real
account suspension.

## Play 4 - The `gmail_*` family

Eight tools, all rung 1, all direct against the connected Gmail mailbox. Every one takes an
optional `email` argument to pick a mailbox, falling back to the account default.

| Tool | What it does |
|---|---|
| `gmail_search_messages({ q, max_results?, page_token? })` | Gmail query syntax search. Returns ID stubs only, so pair it with the next one |
| `gmail_get_message({ message_id })` | One message parsed: from, to, cc, subject, body, bodyHtml, date, labels, snippet |
| `gmail_get_thread({ thread_id })` | A complete thread with every message parsed |
| `gmail_conversation_history({ contact_email, days?, max? })` | Recent history with one address, each touchpoint tagged inbound or outbound. Built as a duplicate-guard before sending |
| `gmail_inbox_lead_replies({ newer_than?, unseen?, exclude?, auto_label? })` | Inbound prospect replies, pre-filtered |
| `gmail_parse_forward({ message_id })` | Splits a forwarded email into alias info, prospect info, the reply text, and the original cold email |
| `gmail_list_labels()` | Every label, system and user |
| `gmail_modify_labels({ message_id, add?, remove?, create_missing? })` | Add or remove labels. Accepts label IDs or human names |

`gmail_search_messages` returns stubs, not content. Fanning `gmail_get_message` across a wide
result set is slow and usually unnecessary; narrow the query instead.

**Two real cautions on `gmail_inbox_lead_replies`:**

- **It writes to the customer's mailbox by default.** `auto_label` defaults to TRUE, so a call
  that reads as a query also applies the `ares/pending-review` label to every message it returns,
  creating the label if it does not exist. That is a mutation on a real mailbox performed by a
  tool that sounds read-only. Pass `auto_label: false` unless labelling is what you actually want.
- **Its internal-team filter is per-account, and it degrades quietly.** The exclusion list
  combines fixed noise entries (`noreply`, `no-reply`, `mailer-daemon`, `calendly.com`,
  `dmarc-noreply`, `postmaster`) with the account's own team, resolved live from
  `account_memberships`. An older version of this route hard-coded three Hiveku staff addresses,
  which was wrong in both directions on every non-Hiveku account; that is fixed, and the team
  filter is now genuinely tenant-scoped, so **do not repeat the claim that it excludes Hiveku
  staff**. What remains true is that the resolver is best-effort by design: if the membership
  lookup throws it logs a warning and falls back to noise-only filtering, so the account's own
  internal chatter starts appearing in the lead list. A team address containing a `+` also fails
  the token validation and is silently dropped from the exclusions. Both look like "the filter
  stopped working" and neither raises an error.

## Play 5 - SMS

**Every SMS capability is rung 2 or rung 3. There is no `sms_*` MCP tool at all.** Confirmed by
extracting every tool name from the MCP source: zero matches.

**Sending: the `sms` node.** Config keys are `to` (E.164 or a template like
`{{trigger.data.phone}}`), `body`, and an optional `from` naming which of the account's numbers
sends it. On a form-triggered workflow, `{{trigger.form_fields}}` renders every non-empty form
field as `Label: value` lines and omits empty ones.

Automation sends are volume-capped to protect the number's carrier reputation: **100 per hour and
400 per day per account, and 6 per hour to a single recipient.** A runaway loop hits the cap
instead of getting the account's 10DLC campaign filtered. Treat the cap as a design constraint,
not an error to route around.

**Receiving: the `smsReceivedTrigger` node.** It takes `keyword_filter` and `number_filter`.

**The STOP trap, which is the single most important thing in this play.** Compliance keywords are
handled upstream in the voice server before the builder ever hears about the message, and a bare
compliance keyword suppresses the notification entirely. Concretely:

- Opt-out keywords are `stop`, `unsubscribe`, `cancel`, `end`, `quit`, `stopall`. Opt-in keywords
  are `start`, `unstop`, `yes`. Matching is on the FIRST WORD of the message.
- A match writes or clears a `voice_sms_opt_outs` row scoped to the account and number, and every
  outbound send path consults it and refuses for an opted-out peer.
- If the entire message is that ONE word, the builder is never notified. No bell, no push, no
  helpdesk ticket, and **no `smsReceivedTrigger` fire.** This suppression was added after two
  prior-owner STOPs on a freshly purchased number paged a whole team and read as an incident.

So a `smsReceivedTrigger` with `keyword_filter: "STOP"` **will never fire.** Do not build it. The
platform already registered the opt-out, already refuses future sends, and the carrier already
sent the confirmation. Building a second STOP handler adds nothing and reads as working.

Two consequences that bite in the other direction:

- `cancel`, `end` and `quit` are opt-out keywords. A customer replying a bare "CANCEL" to an
  appointment reminder is opted out of ALL future SMS and your workflow never sees it. If you need
  cancellations by text, ask for a word that is not on that list.
- `yes` is deliberately carved out of the suppression, so a bare "YES" DOES notify and DOES fire
  triggers. Multi-word messages always notify: "STOP texting me" is treated as a human talking.

`keyword_filter` is a case-insensitive SUBSTRING match on the body, not a word match. A filter of
`stop` matches "nonstop" and "stopwatch". Choose distinctive keywords.

**DNC read and write, both rung 1:**

- `crm_get_dnc_status({ contact_id })` returns email suppression, SMS opt-out, lifecycle state and
  reasons. Check it before drafting outbound.
- `crm_set_dnc({ contact_id, reason, channels? })` is one atomic write that suppresses email
  globally, suppresses SMS when a phone is present, flips lifecycle to unsubscribed, and exits
  active sequence enrollments. Idempotent. `channels` narrows it to `['email']` or `['sms']`;
  default is both. Call it the moment a prospect signals stop, and use their own words as the
  `reason`.
- `crm_remove_dnc({ contact_id, reason })` reverses suppression but does NOT reset
  `lifecycle_stage` or `lead_status`. Use sparingly; most requests to undo a DNC are mistakes.
- `crm_list_email_suppressions` is the read-only audit view. To ADD email suppression use
  `crm_set_dnc`, which is atomic across tables. `email_suppression_add`, `_list` and `_remove`
  operate on the marketing-side suppression list.

**The helpdesk projection.** An inbound text is also ingested as a helpdesk ticket with
`channel: 'sms'`, which makes it readable over rung 1: `helpdesk_ticket_list({ channel: 'sms' })`,
then `helpdesk_ticket_get` and `helpdesk_ticket_messages`. Three caveats: it only happens for
accounts with helpdesk enabled, it is best-effort and failures are logged rather than raised, and
it threads into an existing open or pending ticket rather than always opening a new one.

**Do not reply to an SMS ticket with `helpdesk_ticket_send_reply`.** The Olympus reply route
records a `helpdesk_messages` row with `direction: 'outbound'` and delivers over the wire only for
chat-channel tickets (social DM via Graph, or the chat-to-SMS mirror). There is no delivery branch
for `channel: 'sms'`. The call returns success, the ticket shows a reply, the customer never
receives a text. To actually text a customer back, use the `sms` node.

## Play 6 - Telephony

Mostly rung 1 and mostly read-only.

- `voice_calls_list({ direction?, disposition?, hours_back?, page?, limit? })` is the call history.
- `voice_recent_calls({ limit?, hours_back? })` is the diagnostic view, built for "calls are not
  coming through" and "it goes to voicemail too fast". Defaults to 10 calls over 24 hours, caps at
  50 and 168 hours.
- `voice_diagnose_setup` for configuration problems, `voice_toll_fraud_state` when outbound calls
  are being rejected (it returns today's billable seconds against the cap).
- Inventory: `voice_numbers_list`, `voice_extensions_list`, `voice_extension_status`,
  `voice_ivrs_list`, `voice_ring_groups_list`, `voice_e911_addresses_list`.

**A voicemail is not a separate object. It is a `voice_calls` row with a voicemail disposition.**
There is no `voicemail_list` tool and looking for one is how people conclude voicemails are
unreachable. Filter `voice_calls_list({ disposition: 'voicemail' })`.

**The two disposition vocabularies differ and this is a real trap.** `voice_calls_list` documents
`answered | no_answer | voicemail | busy | failed`. `marketing_call_attribution_list` documents
`answered | ai_handled | voicemail | missed | abandoned`. Same underlying calls, different filter
words. A filter value from the wrong list quietly returns nothing rather than erroring, which
reads as "there were no missed calls".

**Transcripts.** `marketing_call_attribution_list` gives you a page of calls with source, medium,
campaign, the tracking number, the attribution session, and `has_transcript` / `has_summary`
flags, and it never touches storage. Take the `id` of the call you care about and pass it to
`marketing_call_transcript_get({ call_id })` for the verbatim transcript and AI summary. That
second call is deliberately separate and costlier because it pays a storage round trip, so call
it for specific calls and never across a result set. `include_summaries: true` on the list inlines
AI summaries and should be left off for wide sweeps.

When there is no transcript, `transcript_state` tells you which of five situations it is and
**none of them means "empty"**: `never_recorded` (nothing ever existed, nothing failed),
`pending` (still processing), `failed` (the retry window closed, nothing will retry),
`purged` (it WAS transcribed and retention deleted it, so the `ai_summary` is the surviving
record), `unreadable` (the object is missing or will not read). Report the state, not "no
transcript".

`crm_calls_list` is the contact-centric view with `has_recording` and `has_transcript` filters.
`crm_get_contact` does not include call history, so this is how you get it.

Voice automation nodes (rung 2): `voiceCallCompletedTrigger`, `voiceVoicemailTrigger` (which
carries the caller, the number dialled and the message length but NEVER the transcript),
`voiceMissedCallTrigger` (the speed-to-lead hook), plus `voiceListCalls`, `voiceGetCallDetail`,
`voiceListNumbers`, `voiceExtensionStatus` and `phoneCall`.

## Play 7 - Email infrastructure

**Templates split three ways and they are not interchangeable.** This is the most common wasted
hour in the department.

| Family | Table | Used by |
|---|---|---|
| `email_template_*` | `email_templates` | The `/api/v1` transactional send API |
| `marketing_template_*` | marketing templates | Marketing campaigns. `email_campaign_create`'s `template_id` references THIS one |
| `crm_*_email_template` | CRM templates | Sales sequences and one-to-one CRM sending |

A marketing campaign CANNOT use an `email_template_*` template. The tool descriptions carry a
warning about this because people kept trying. Build campaign templates with
`marketing_template_create`. The CRM family (`crm_create_email_template`, `crm_list_email_templates`,
`crm_get_email_template`, `crm_update_email_template`, `crm_delete_email_template`) supports merge
tags with fallback syntax (`{{first_name|there}}`) and spintax (`{Hi|Hey|Hello}`), and templates
created over MCP default to `is_shared: true` because a service-key caller has no human user.

**Campaigns.** `email_campaign_create({ name, subject, from_email, audience_id, ... })` creates a
draft, or a scheduled campaign if `scheduled_for` is set. Optional `template_id` (a marketing
template), `inline_html` / `inline_text`, `domain_id` (a verified sending domain), A/B subject
testing via `ab_test_enabled` plus `ab_subject_b`, and `send_in_recipient_tz`. Then
`email_campaign_test_send`, `email_campaign_schedule` or `email_campaign_send_now`,
`email_campaign_metrics` to measure, and `email_campaign_pause` / `email_campaign_cancel` /
`email_campaign_resend_non_openers`. Always test-send before scheduling.

**Sequences also split two ways.** `email_sequence_*` is the marketing drip engine:
`email_sequence_create({ name, trigger_kind })` where `trigger_kind` is `manual`, `tag_added`,
`form_submit` or `workflow`, then `email_sequence_add_step`, `email_sequence_activate` (nothing
fires until this), `email_sequence_enroll`, and `email_sequence_enrollments` / `_exit` / `_pause`
to manage people in flight. Separately, `crm_list_sequences` / `crm_enroll_sequence` and friends
are the SALES sequence engine, which is a different system with different enrollment. Run
`crm_sequence_spam_check` before activating a sales sequence.

**Audiences and domains.** `email_audience_create`, `email_audience_members_add`,
`email_audience_preview` (check who is actually in it before a send), `email_audience_list`.
Sending domains: `email_domain_add`, then `email_domain_check_dns`, then `email_domain_verify`.
A campaign from an unverified domain is a deliverability problem you create for yourself.

**Diagnosis.** `email_logs_list({ status? })` where status is `queued | sent | delivered |
bounced | complained`, and `email_stats`. Note that `queued` is not `delivered`; when someone says
mail is not arriving, check for a delivery event, not a send.

Marketing automation nodes (rung 2): `emailMarketingSendCampaign`, `emailMarketingAddToSequence`,
`emailMarketingRemoveFromSequence`, `audienceAddMember`, and the
`emailMarketingLinkClickedTrigger` / `emailMarketingCampaignFinishedTrigger` triggers.

## Boundary: there is no communications department agent

`talk_to_department` has no `communications` domain. It also has no `voice`, `sms`, `helpdesk` or
`sales` domain. Do not call it with one and do not tell the user a communications agent exists.
`list_departments` reports which domains this specific tenant has enabled, which is a subset of
the fourteen.

Route generative communications work like this:

- Customer-facing reply copy, ticket answers, macros: `account_context_get({ domain: 'helpdesk' })`
  for brand hydration, then draft yourself, then persist with the matching direct tool.
- Prospect-facing copy, sequences, outreach: `account_context_get({ domain: 'sales' })`, and see
  the `hiveku-outbound-agency` and `hiveku-sales-agency` skills.
- Campaign strategy and positioning: `talk_to_department({ domain: 'marketing' })` is real and
  valid, then persist with the `email_campaign_*` tools.
- Workflow design help: `talk_to_department({ domain: 'workflow' })` is real and valid.

Neighbouring skills own adjacent ground: `hiveku-helpdesk-agency` for ticket operations and the
support queue, `hiveku-sales-agency` for the CRM inbox as a sales surface (it covers
`crm_inbox_*` from the sales angle), `hiveku-outbound-agency` for cold email, and
`hiveku-automation-agency` for workflows in general. This skill owns the plumbing underneath all
of them.

## Pitfalls

- **Reporting a missing tool name as a missing capability.** Work all three rungs. SMS has no
  tool and works fine.
- **Inventing a tool name to fill a gap.** If it does not resolve, it does not exist. Check the
  node catalog, then `hiveku_docs_search`, then say it is dashboard-only.
- **Calling `crm_inbox_recent` for recent mail.** It is the search tool and `query` is required.
  `crm_inbox_list` is the recent-N sweep.
- **Omitting `connection_id` on a multi-inbox account.** You read the default mailbox, which
  looks identical to an empty result.
- **Building `gmailReply` from the node catalog alone.** It omits `connectionId`, `to` and
  `subject`, all required, and advertises `thread_id` where the handler reads `threadId`. Dry run
  and read `step_states`.
- **Building a STOP keyword workflow.** A bare compliance keyword never reaches the trigger. The
  opt-out is already registered and already enforced.
- **Assuming a bare "CANCEL" reaches your workflow.** It is an opt-out keyword. The customer is
  now suppressed and you saw nothing.
- **Replying to an SMS ticket with `helpdesk_ticket_send_reply`.** It records the message and
  delivers nothing. Use the `sms` node.
- **Looking for a voicemail tool.** A voicemail is a `voice_calls` row; filter on disposition.
- **Mixing the two disposition vocabularies.** A wrong value returns nothing rather than erroring.
- **Reading "no transcript" as empty.** Five distinct `transcript_state` values, and `purged`
  means it existed and the summary survives.
- **Pointing a campaign at an `email_template_*` template.** Wrong table. Campaigns need
  `marketing_template_*`.
- **Trusting `email_connections_list`'s description over its behaviour.** It says marketing
  platforms; it returns Gmail and Outlook connections, and it is the ONLY reader carrying
  `connection_status` and `last_error`.
- **Retrying `email_connect_start` after `no_oauth_app`.** That is a dashboard handoff to the
  account owner, not a transient failure.
- **Letting the five-minute `setup_url` expire** by burying it in a long message.
- **Calling `gmail_inbox_lead_replies` as a read.** `auto_label` defaults true and it writes
  labels to a real mailbox.
- **Running a live workflow to see if it works.** `test_mode: true` first, every time. A live run
  reaches a real phone or inbox and cannot be recalled.
- **Sending anything client-visible without explicit confirmation.** Name the recipient, show the
  body, get a yes, send once.

## Deep references - load the one that matches the work

This file is the map. The manuals below carry the mechanisms, the exact field shapes, and the
incidents behind each rule. Load the relevant one BEFORE building, not after a symptom.

| Reference | Load it when |
|---|---|
| `references/inbox.md` | Reading or searching any mailbox; replying in a thread; the `gmail_*` family; connecting, repairing or diagnosing a Gmail/Outlook connection; the `no_oauth_app` branch; "no active Gmail connection found". |
| `references/sms.md` | Anything involving text messages: sending, inbound triggers, keyword filters, STOP and opt-out compliance, DNC read/write, rate caps, quiet hours, and the helpdesk ticket projection of inbound SMS. |
| `references/telephony.md` | Calls, missed calls, voicemails, recordings, transcripts and `transcript_state`; call attribution and tracking numbers; phone numbers, extensions, IVRs, ring groups, E911; toll-fraud rejections. |
| `references/email-infrastructure.md` | Campaigns, audiences, the three template families, drip and sales sequences, sending domains and DNS, suppression lists, deliverability, bounces, and send-log diagnosis. |
