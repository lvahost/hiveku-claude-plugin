---
name: hiveku-communications
description: Operating manual for everything a Hiveku account sends and receives. Use for ANY communications work - reading the shared team inbox, finding and answering a customer email, replying inside an existing thread, a mailbox that stopped syncing or says "No active Gmail connection found", connecting Gmail or Outlook, sending or automating text messages, reading SMS threads and voicemail queues, STOP replies and do-not-contact compliance, inbound texts that should become tickets, missed calls, voicemails, call recordings and transcripts, phone numbers, extensions, IVRs and call routing, 10DLC and toll-free registration, blocking callers, and the email infrastructure behind campaigns, transactional templates, drip sequences, audiences, sending domains and deliverability. ALSO load this skill BEFORE acting on any risky communications request - "text every contact", "email the whole list", "reply to everyone", "just send it" or "skip the dry run", "skip the opt-out check", "clear the opt-out list" or "undo their STOP", "cancel that campaign before it sends", "delete the SMS templates", "block/unblock this caller", "release/delete this phone number", or "file our 10DLC registration" - the refusal and the safe alternative live here.
---

# Hiveku Communications Operating System

Communications is the widest department on the account and the least evenly tooled. Some of it
is one MCP call. Some is only reachable by building a small workflow. Some is dashboard-only
and your job is to hand the user a precise next step. Getting that judgement right is most of
the skill, so the ladder comes first.

## The reachability ladder (read before you say "there is no tool for that")

**A missing tool name does NOT mean a missing capability.** An operator once searched for
`sms_send`, found nothing, and reported that Hiveku could not send texts. Two durable lessons.
**Prefixes decide reachability**: the SMS tools are `voice_sms_*`, the survey sender is
`survey_send` - tools are named after the contact, ticket, survey or number, almost never after
the channel. And **negative-existence claims expire**: the registry grew by hundreds of tools
on 2026-08-27, and "there is no X tool" statements written before that date went stale that
day. Verify against the live catalog before repeating one, including the ones in this file.

| Rung | Surface | How you reach it | How you confirm it exists |
|---|---|---|---|
| 1 | A direct MCP tool | Call it | The name resolves in YOUR catalog |
| 2 | A workflow NODE driven from MCP | Build a small workflow, run it | `workflow_node_types_list` lists the `type` |
| 3 | Dashboard only | Hand the user a precise, single next step | Neither of the above has it |

Work the rungs in order and never stop at rung 1. **Worked examples, verified against the
current registry:** sending a text is rung 1 since 2026-08-27 (`voice_sms_send`,
`voice_sms_send_to_contact`). Sending from a connected Gmail/Outlook mailbox is still rung 2
(`gmailReply`, `crmSendContactEmail` nodes - no MCP tool does it). Reading the shared inbox is
rung 1 (`crm_inbox_list`) on a key whose profile can see it. Buying a phone number is rung 3 by
design: `voice_numbers_search` shortlists carrier inventory but reserves nothing, and no route
on this surface places the order.

The corollary: do not invent a tool name to fill a gap. If a name does not resolve, it does not
exist. Check the node catalog before concluding anything, and prefer `hiveku_docs_search` /
`hiveku_docs_get` over guessing at an argument shape.

## The fourth reason a name does not resolve: your key's profile

MCP keys are scoped by profile, and the profile filters which names your catalog contains at
all (`hiveku-mcp-api-server/src/tools/profiles.ts`). The **communications** profile grants the
prefixes `email_`, `gmail_`, `voice_`, `mc_`, `memory_`, `kb_`, `pm_`, `room_`, `discussion_`,
`workflow_`, plus seven named CRM contact tools (list/get/search/create/update/upsert_by_email/
bulk_create), the task and project name lists, and the always-available `list_departments`,
`talk_to_department`, `web_search`, `fetch_url`, `audit_query`.

Several tools this skill teaches are therefore **invisible to a communications-scoped key** and
resolve only under a broader profile such as `full`: the `crm_inbox_*` readers,
`crm_thread_for_contact`, `crm_email_thread_search`, `crm_lead_triage`,
`crm_list_email_connections`, the DNC tools (`crm_get_dnc_status`, `crm_set_dnc`,
`crm_remove_dnc`, `crm_list_email_suppressions`), everything `helpdesk_` and `marketing_`
(including `marketing_call_transcript_get`), `survey_send`, the CRM sequence/template tools,
and `account_context_get` itself.

**If a documented tool is missing from your catalog, check the profile before declaring rung 2
or 3** - say "not visible to this key", not "does not exist". In-profile fallbacks under a
communications key: `voice_sms_opt_out_add` for SMS opt-outs, `email_suppression_add/_list/
_remove` for email, `voice_call_transcript_get` for transcripts, and `talk_to_department` for
hydration where a domain fits.

## Working rung 2: build, dry run, read the steps

1. `workflow_node_types_list` for the catalog; read the chosen type's `fields[]` for the `data`
   keys. For an event-driven trigger, `workflow_event_trigger_types_list`.
2. `workflow_create({ name })` - defaults `is_enabled: false`, which is what you want.
3. `workflow_node_add` per node, then `workflow_edge_add`. Leave `sourceHandle` empty except
   off a `conditional` (`'true'`/`'false'`) or a `switch` (a `handleId` from
   `switchConfig.cases`).
4. `workflow_validate`, then `workflow_run({ id, test_mode: true })`.
5. `workflow_run_get`, read `step_states`. Fix with `workflow_node_update` (shallow-merged),
   re-run.
6. `workflow_enable` only once the dry run is clean and the user has approved.

**`test_mode: true` is the safe dry run - use it every time.** It short-circuits every
side-effecting node: each returns `__dry_run: true` and `would_have: { ...the args it would
have sent }`. Read `would_have` before anything fires for real: a live run reaches a customer's
phone or inbox, and that is not undoable.

A `manualTrigger` plus one action node, run once, is a fine way to spend rung 2. **Run-once
hygiene:** name it legibly (`oneoff-sms-2026-08-28-reschedule-jones`), leave it disabled, and
`workflow_delete` it when its config hard-codes a customer's number. A second run is a second
text, never a verification. Before hand-building, check `workflow_templates_list`.

## Working rung 3: the handoff

A dashboard-only capability is a handoff, not a dead end. Give the user the destination, the
action, and what to tell you when done. `workflow_dashboard_url` gets a real link for workflow
work. When a handoff or escalation (a sending suspension, an OAuth-app registration, a number
purchase) must not evaporate, record it as a Mission Control card or PM task - the profile
carries `mc_` and `pm_` precisely for that.

## Operating principles

- **There is no `communications` department agent.** See the Boundary section for the exact
  enums before routing generative work.
- **Hydrate before drafting.** `account_context_get({ domain: 'helpdesk' })` for
  customer-facing copy, `'sales'` for prospect-facing - when your key can see it. Re-read its
  `instructions` field before each generative call.
- **The send contract. No draft shown, no send. No dry run read, no live run.** Summarize the
  exact recipient and exact body, get a yes, send once. An approval is bound to the exact
  draft it covered - change the body or recipient and it is void - and it goes stale: if time
  has passed, re-read opt-out / DNC / suppression state immediately before dispatch.
- **Compliance is not optional and not a judgement call.** Check suppression before outbound
  (`crm_get_dnc_status` on a full key; `email_suppression_list` plus the send tools' own
  `opted_out` refusal under a communications key). Honor a stop signal immediately -
  `crm_set_dnc` for a contact, `voice_sms_opt_out_add` for a bare number. Never build a
  workflow that re-contacts a suppressed peer, never delete an opt-out row to force a send
  (re-enabling someone who texted STOP happens only by their own START), and never route
  around a refusal by switching tools.
- **Report outcomes in the honest vocabulary.** `sent` means the carrier accepted, not
  delivered; a null `delivery_status` means never reconciled, not failed; a quiet-hours survey
  send is `scheduled`, not sent; a throttled review ask is `skipped`, not failed. Never upgrade
  any of these to a pass, and never report a text as sent without a message id.
- **Transcripts and recordings are the most sensitive data in the account.** Verbatim and
  unredacted. Pull one only for a specific question; do not paste it anywhere that outlives
  the question. A presigned `audio_url` is an unauthenticated five-minute download link -
  never paste one anywhere.

## Hard stops - response contracts, not suggestions

- **"Text every contact in the CRM about the promo."** Refuse the loop - no suppression
  preview, no audience, no single approval covers it. Offer the real path: an audience, a
  preview with counts, approval of the exact body and count, and the campaign or survey rail
  that applies quiet hours and throttles.
- **"Just send it, skip the dry run."** Refuse. The dry run is the only place a wrong
  recipient is caught before a customer sees it. Time pressure is an argument FOR it.
- **"They texted STOP by mistake - remove the opt-out and resend."** Refuse. Only the
  customer's own START or YES re-subscribes them. Offer another consented channel.
- **"Release the old number."** Irreversible - the DID returns to carrier inventory, cannot be
  re-bought, and can be sold to a stranger while still printed on signage and listings. Only
  after a human confirms this exact number, by digits.
- **"Unblock this caller" / "clear the blocklist."** A block silenced a harasser or a number
  staff must not dial; the row usually has no author and no reason, and removal re-opens the
  path instantly with no record. Confirm with the account owner per number; never sweep.

## Play 1 - Read the shared inbox

`crm_inbox_connections` lists the connected mailboxes. Then read - **the two reader names are
inverted**: `crm_inbox_list({ folder, limit, connection_id })` is the plain recent-N sweep;
`crm_inbox_recent({ query, ... })` is the SEARCH tool with `query` REQUIRED (native
Gmail/Outlook syntax) - called bare it is a 400, not a sweep. Omit `connection_id` on a
multi-inbox account and you silently read the default mailbox, which looks exactly like an
empty inbox.

Per-contact and archive: `crm_thread_for_contact` (the full LIVE thread for one contact),
`crm_email_thread_search` (CRM-SYNCED copies - a never-synced message is invisible here and
present in the live read), `crm_lead_triage` (one-shot lead intake sweep). All `crm_`-prefixed,
so full-profile key. Load `references/inbox.md` for the mailbox-selector table and
default-mailbox resolution.

## Play 2 - Reply inside an existing thread (rung 2)

No MCP tool sends a reply from a connected mailbox. Replying is the `gmailReply` node (despite
the name, any connected mailbox, Gmail or Outlook). Read with Play 1 or 4, carry the thread id
into the node.

**This node has the worst authoring trap in the department.** The catalog advertises two
fields; the handler requires `connectionId`, `to` and `subject` (none advertised) and reads
`threadId` in camelCase where the catalog says `thread_id`. Built faithfully from the catalog
it fails three times and then sends an unthreaded new email. `gmailSend` has the same missing
`connectionId`. The full key table and the reader-to-node pattern are in `references/inbox.md`
Part 4 - load it before building, then dry run and read the `would_have` recipient.

Do not reach for `email_send_test` as a reply substitute: it is a REAL send on the marketing
lane (`dry_run` defaults FALSE), does not thread, and does not come from the person the
customer wrote to.

## Play 3 - Repair a broken connection

The symptom is any CRM email, inbox or calendar tool reporting **"No active Gmail connection
found."** The ladder: (1) diagnose with `email_connections_list` - the ONLY reader carrying
`connection_status` and `last_error`; (2) `email_connect_start({ platform, scope_label,
user_email })` - on a multi-user account you MUST say which user owns it; (3) hand the
`setup_url` over, do not open it - **valid five minutes**; (4) `code: 'no_oauth_app'` is not
transient: the account OWNER must register an OAuth Client at `/dashboard/settings/oauth-apps`
first - say that and stop; (5) verify `connection_status: 'connected'`, then a cheap read.

Mailbox health is not sending health: `email_service_status` (read `sending_enabled` FIRST -
false means a `suspension` block explains why, ALL sending is blocked, and suspensions are
lifted by Hiveku staff, not by any tool) and `email_deliverability_check` (a real send to the
AWS mailbox simulator - NEVER invent your own test address; test sends to example.com caused a
real account suspension). `references/inbox.md` Part 5.

## Play 4 - The `gmail_*` family

Eight rung-1 tools against the connected Gmail mailbox, each with optional `email` to pick a
mailbox: `gmail_search_messages` (ID stubs only - narrow the query rather than fanning
`gmail_get_message`), `gmail_get_message`, `gmail_get_thread`, `gmail_conversation_history`
(the duplicate-guard before outreach), `gmail_inbox_lead_replies`, `gmail_parse_forward`,
`gmail_list_labels`, `gmail_modify_labels`.

Two cautions on `gmail_inbox_lead_replies`: **it writes to the mailbox by default**
(`auto_label` defaults TRUE - pass `auto_label: false` unless labelling is the point), and its
tenant-scoped team filter degrades quietly to noise-only when the membership lookup fails.
Signatures and trap detail: `references/inbox.md` Part 3.

## Play 5 - SMS

**Direct SMS tools exist since 2026-08-27** - the `voice_sms_*` family, 19 tools, rung 1. The
workflow `sms` node remains the rail for automation. Which rail is the first decision:

- **"Text this person once"**: `voice_sms_send_to_contact` (recipient from `crm_contacts.phone`
  ONLY, never your input) or `voice_sms_send` (raw E.164). Real sends within seconds, **no
  draft, no recall, no idempotency key - two identical calls are two texts**. `voice_sms_send`
  returns `{ thread }` with NO message id: confirm with `voice_sms_thread_messages_list`, never
  from the 200. A 502 `send_failed` is NOT a no-op (the failed row is committed), so a blind
  retry can double-send.
- **Reply in an ongoing conversation**: `voice_sms_thread_reply` - recipient and DID come off
  the stored thread; `opted_out` is re-checked on every reply.
- **Automation** (trigger, schedule, sequence): the `sms` node, dry-run first.

**Reading is rung 1 now.** `voice_sms_threads_list` is the paged SMS inbox (402
`voice_not_enabled` is a plan refusal, not an empty inbox). `voice_sms_thread_messages_list`
reads one transcript - **NOT read-only despite the GET**: it resets the thread's unread badge;
pass `mark_read: 'false'` (that exact string) for any background read.

**The STOP trap still stands - it is upstream of everything.** Opt-out keywords (`stop`,
`unsubscribe`, `cancel`, `end`, `quit`, `stopall`) are handled in the voice server before the
builder hears about the message, and a bare compliance keyword suppresses the notification
entirely: no bell, no ticket, **no `smsReceivedTrigger` fire**. A workflow keyed on "STOP"
will never fire - do not build it. A bare "CANCEL" opts the customer out of ALL SMS. `yes` is
carved out and does fire; multi-word messages always notify. `references/sms.md` Part 3.

**Compliance writes:** `crm_set_dnc` / `crm_get_dnc_status` / `crm_remove_dnc` on a full key
(atomic across email, SMS, lifecycle and sequence exits - beware the phone-format trap,
`references/sms.md` Part 4). In-profile, number-scoped: `voice_sms_opt_out_add` honors a stop
request made by phone, email or in person (silent no-op when a row exists: 200 with
`already_present: true`).

**Enablement and 10DLC are rung 1 now.** On `sms_not_enabled`, `voice_sms_registration_get` is
the verdict: key on `can_send` and `blocking_reason` instead of re-deriving the rule. The fix
path is tooled - `voice_sms_brand_submit` (a fee-bearing, IRREVERSIBLE carrier filing of a
real company's legal identity: human decision, EIN right first time), `voice_sms_campaign_draft`
(drafts text only), **`voice_sms_cta_preflight` before any filing**, the create/resubmit lane,
`voice_sms_campaign_carriers_get`, `voice_sms_toll_free_verification_get`. Load
`references/sms.md` Parts 6-7 first.

An inbound text is also projected into helpdesk (`helpdesk_ticket_list({ channel: 'sms' })` -
full key, helpdesk-enabled accounts only). **Do not reply to an SMS ticket with
`helpdesk_ticket_send_reply`** - it records the reply and delivers NOTHING for
`channel: 'sms'`. Text back with `voice_sms_thread_reply` or the `sms` node, then log it.

Send gates, caps and the reputation governor, templating, retries, quiet hours, SMS templates,
scheduled sends, diagnosis: `references/sms.md`. Load it before building anything.

## Play 6 - Telephony

Reads: `voice_calls_list`, `voice_recent_calls` (the diagnostic view for "calls are not coming
through"), `voice_call_get` (one call - its `recording_url` is hardcoded null and its
`recording_transcript` carries the AI summary, not the transcript), `voice_diagnose_setup`
(read `blocking_issues` verbatim, minus the E911 toll-free caveat in the reference),
`voice_toll_fraud_state` (outbound rejected = the daily-cap guard working), and the inventory
listings plus `voice_ivr_walk` to narrate a phone tree.

**Voicemail is a first-class queue now.** `voice_voicemails_list` is the paged voicemail inbox
(still `voice_calls` rows with `disposition: 'voicemail'` underneath). Its `audio_url` is a
5-minute presigned link: never paste it; pass `audio_urls: 'false'` when you do not need
playback. `voice_voicemail_mark_read` clears the badge a human triages from - never use it to
tidy an inbox you are only reading.

**Dispositions:** the column only ever holds `answered`, `voicemail`, `missed`, `ai_handled`,
`abandoned`. `voice_calls_list`'s own description still advertises `no_answer`, `busy`,
`failed` - those NEVER match and return silent zeros.

**Transcripts, two paths.** Communications-scoped key: `voice_call_transcript_get` (verbatim,
inline, no redaction) and `voice_recording_url_get` (presigned, unauthenticated, non-revocable
5-minute audio URL - prefer the transcript). Full key: `marketing_call_attribution_list` +
`marketing_call_transcript_get` add attribution and the `transcript_state` verdict - five
states, **none meaning "empty"** (`purged` still has a surviving `ai_summary`; report the
state). `references/telephony.md` Parts 3-4.

**Routing writes exist now** - create/update/delete for extensions, IVRs and ring groups,
update/delete for queues, get/update for tenant settings; number lifecycle is partly tooled
(`voice_numbers_search`,
`voice_number_update`/`_cnam_set`/`_release`, `voice_port_orders_list` for porting status,
`voice_blocked_numbers_add`/`_list`/`_remove`). These are live phone-system changes with real
blast radius, and release/unblock are hard stops. Load `references/telephony.md` Parts 5-6
before ANY voice write. Buying a number remains rung 3.

Voice automation nodes (rung 2): `voiceCallCompletedTrigger`, `voiceVoicemailTrigger` (caller
and message length, NEVER the transcript), `voiceMissedCallTrigger` (the speed-to-lead hook),
plus read-only action nodes and `phoneCall`.

## Play 7 - Email infrastructure

**Templates split three ways and are not interchangeable** - the most common wasted hour here:
`email_template_*` feeds the `/api/v1` transactional send API, `marketing_template_*` feeds
campaigns (`email_campaign_create`'s `template_id` references THIS one), `crm_*_email_template`
feeds sales sequences and one-to-one CRM sending. A campaign CANNOT use an `email_template_*`
template.

**Campaigns:** find them with `email_campaign_list` (filter by status and `audience_id`) and
`email_campaign_get` (includes inline bodies) - never guess an id. Create as a draft,
`email_audience_preview` before EVERY send, `email_campaign_test_send`, then schedule or
`email_campaign_send_now` - with `dry_run: true` first, sent for real only after reading the
queued/skipped numbers. `email_campaign_metrics` returns send-row counts ONLY - never report
an open or click rate from it.

**Stopping a scheduled send is the highest-leverage recovery here.** A scheduled campaign:
`email_campaign_cancel` (`_pause` once sending). A queued CRM batch: `crm_email_send_queue_list`
then `crm_email_batch_cancel` (still-queued rows only; report what had already left) or
`crm_email_batch_reschedule` - the `crm_` pair needs a full key. Cancel first, report after.

**Sequences split two ways**: `email_sequence_*` is the marketing drip engine (nothing fires
until `email_sequence_activate`; `email_sequence_pause` is DESTRUCTIVE - it exits enrollments
permanently, not a hold), and `crm_*_sequence` is the separate sales engine
(`crm_sequence_spam_check` before activating). Audiences, domains, suppression, deliverability
and the diagnosis ladder: `references/email-infrastructure.md` - load it before creating a
template, scheduling a campaign, or answering "why is our email not arriving".

## Boundary: there is no communications department agent

`talk_to_department`'s domain enum is `seo`, `social`, `content`, `marketing`, `branding`,
`outbound`, `ppc`, `analytics`, `customer_avatar`, `customer_journey`, `before_after_grid`,
`website_design`, `knowledge_base`, `workflow`. Fourteen values, none of them communications,
voice, sms, helpdesk or sales. An unlisted value is rejected server-side, not silently
defaulted. `list_departments` reports which domains this tenant has enabled.

`account_context_get` has no communications domain either. Its enum is `content`, `marketing`,
`seo`, `social`, `ppc`, `sales`, `helpdesk`, `branding`, `customer_avatar`, `customer_journey`,
`before_after_grid`, `website_design`, `knowledge_base`, `workflow`, `outbound`. (`helpdesk` is
valid HERE and not in `talk_to_department` - that asymmetry is the source of the confusion.)

Route generative work: customer-facing reply copy via `account_context_get({ domain:
'helpdesk' })` then draft yourself and persist with the direct tool; prospect-facing copy via
`{ domain: 'sales' }`; campaign strategy via `talk_to_department({ domain: 'marketing' })`;
workflow design via `{ domain: 'workflow' }`. Neighbouring skills own adjacent ground
(`hiveku-helpdesk-agency`, `hiveku-sales-agency`, `hiveku-outbound-agency`,
`hiveku-automation-agency`); this skill owns the plumbing underneath all of them.

## Pitfalls

- **Reporting a missing tool name as a missing capability.** Work all three rungs, then check
  the key's profile - say "not visible to this key", never "does not exist". Never invent a
  name to fill a gap.
- **Repeating a stale negative-existence claim.** The registry grew ~230 tools on 2026-08-27.
  Verify "there is no X" against the live catalog first.
- **Calling `crm_inbox_recent` for recent mail.** It is the search tool; `query` is required.
- **Omitting `connection_id` on a multi-inbox account.** You silently read the default mailbox.
- **Building `gmailReply` from the node catalog alone.** `connectionId`, `to`, `subject` are
  required and unadvertised; the handler reads `threadId`, not `thread_id`.
- **Building a STOP keyword workflow.** A bare compliance keyword never reaches the trigger -
  and a bare "CANCEL" is an opt-out, so your cancellation flow never sees it.
- **Replying to an SMS ticket with `helpdesk_ticket_send_reply`.** Records the message,
  delivers nothing. Use `voice_sms_thread_reply` or the `sms` node.
- **Reading an SMS thread without `mark_read: 'false'`**, clearing a human's unread badge.
- **Reporting `sent` as delivered, or blind-retrying a 502.** `sent` = carrier accepted; null
  `delivery_status` = never reconciled; the failed row is committed, so a retry can
  double-send.
- **Deleting an opt-out row to force a send.** Re-subscribing is the customer's own act.
- **Filtering dispositions with `no_answer`, `busy` or `failed`.** Never stored; silent zero.
- **Pasting a presigned `audio_url` or recording URL anywhere.**
- **Reading "no transcript" as empty.** Five `transcript_state` values; `purged` means the
  summary survives.
- **Pointing a campaign at an `email_template_*` template.** Campaigns need
  `marketing_template_*`.
- **Trusting `email_connections_list`'s description.** It returns Gmail/Outlook connections
  and is the ONLY reader carrying `connection_status`/`last_error`.
- **Retrying `email_connect_start` after `no_oauth_app`**, or letting the five-minute
  `setup_url` expire buried in a long message.
- **Calling `gmail_inbox_lead_replies` as a read.** `auto_label` defaults true; it writes
  labels to a real mailbox.
- **Running a live workflow to see if it works.** `test_mode: true` first, every time.
- **Leaving a run-once send workflow enabled or undeleted** with a customer's number
  hard-coded.
- **Sending anything client-visible without explicit confirmation** - and without re-checking
  suppression if time has passed since the yes.

## Deep references - load the one that matches the work

This file is the map. The manuals below carry the mechanisms, exact field shapes, and the
incidents behind each rule. Load the relevant one BEFORE building, not after a symptom.

| Reference | Load it when |
|---|---|
| `references/inbox.md` | Reading or searching any mailbox; replying in a thread; `gmail_*` signatures and traps; connecting or repairing a Gmail/Outlook connection; `no_oauth_app`; "no active Gmail connection found". |
| `references/sms.md` | Any text-message work: the `voice_sms_*` send/read/reply tools, the `sms` node, inbound triggers, STOP and opt-out compliance, DNC, caps and the reputation governor, quiet hours, SMS templates, 10DLC and toll-free registration, scheduled sends, the helpdesk projection. |
| `references/telephony.md` | Calls, the voicemail queue, recordings, transcripts and `transcript_state`; attribution; numbers, porting, blocked callers, extensions, IVRs, ring groups, queues, settings, E911; toll-fraud rejections; any voice WRITE. |
| `references/email-infrastructure.md` | Campaigns (finding, creating, cancelling a scheduled send), audiences, the three template families, both sequence engines, the CRM send queue, sending domains, suppression, deliverability, send-log diagnosis. |
