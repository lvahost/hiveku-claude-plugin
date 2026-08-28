# Telephony: Calls, Voicemail, Transcripts, Numbers

The manual behind Play 6. Load it before answering anything about calls, before pulling a
transcript, before diagnosing a phone system, and before ANY voice write.

Telephony is the best-tooled part of communications at rung 1. Reading call history,
dispositions, attribution, transcripts and inventory is direct MCP - and since the 2026-08-27
registry expansion, so are most WRITES: extensions, IVRs, ring groups, queues, tenant settings,
number updates and release, the call blocklist, and porting status. Older copies of this
document said writes were dashboard-only; that is obsolete. What changed is reachability, not
risk: every write here reconfigures a live phone system, so the confirmation discipline got
stricter, not looser.

## Part 1: The mental model

Everything is a `voice_calls` row. There is no separate voicemail object, no separate
missed-call object, no separate recording object. One row per call, carrying direction,
disposition, duration, the number that rang, attribution, and pointers to a recording and
transcript in the encrypted recordings bucket.

A voicemail is a `voice_calls` row whose disposition is `voicemail` - and there is now a
dedicated queue tool over exactly that filter, `voice_voicemails_list` (Part 2), whose own
registered description confirms the model: "A voicemail is not its own table: it is a
voice_calls row with disposition='voicemail'". The older workaround of filtering
`voice_calls_list({ disposition: 'voicemail' })` still works and returns the same calls.

Voice runs across two systems: the builder (Next.js on Render) holds the data and the API, and
`hiveku_voice_server` on an EC2 box runs FreeSWITCH and the call logic. That split matters for
one thing here: the post-processing pipeline that produces transcripts and AI summaries is
asynchronous and lives partly outside the builder, so a just-ended call legitimately has no
transcript yet.

## Part 2: Reading calls and voicemail

### The core listing tools

**`voice_calls_list({ direction?, disposition?, hours_back?, page?, limit? })`** is the general
call history. `disposition` filters the `voice_calls.disposition` column, and **this tool's own
description lists the wrong values for it.** Read the disposition section before using that
filter. `voice_calls_export_csv` exists for a CSV export of the same history.

**`voice_recent_calls({ limit?, hours_back? })`** is the diagnostic cut, built specifically for
"calls are not coming through" and "it goes to voicemail too fast". `limit` defaults to 10 and
caps at 50; `hours_back` defaults to 24 and caps at 168. Reach for this one when the question
is about call FLOW rather than call VOLUME.

**`voice_call_get({ id })`** fetches one call by `voice_calls.id`, for a deep link older than
the newest list page. Three traps from its registered description, each a 200 that tells you
nothing true: `recording_url` is **HARDCODED null on every response** (`has_recording` is the
real signal; playable audio only comes from `voice_recording_url_get`);
`recording_transcript` carries `voice_calls.ai_summary`, an AI-written prose summary, **NOT the
transcript** (use `voice_call_transcript_get` for the actual words); and `status` is derived,
so a call still ringing reads `'failed'` while an ai_handled call reads `'completed'`.

**`crm_calls_list({ contact_id?, company_id?, deal_id?, has_recording?, has_transcript?,
search?, page?, limit? })`** is the contact-centric view (full-profile key - `crm_`-prefixed).
**`crm_get_contact` does not include call history**, so this is the tool that answers "what
calls have we had with this person".

**`voice_number_lookup({ number })`** resolves a raw phone number to a CRM contact for an
in-call card: `{ contact: { id, name } | null, last_call_at }`. It is a
number-to-identity oracle - treat the result as PII. Matching is last-7-digits contains,
deliberately loose: two numbers sharing their final seven digits resolve to the same contact,
and soft-deleted contacts never resolve, so an archived customer reads as no match. Fewer than
7 digits after stripping answers 200 with null rather than erroring.

### The voicemail queue

**`voice_voicemails_list`** is the paged voicemail inbox, newest first: each row carries the
caller, `contact_id`, `duration_seconds`, `summary`, `transcript_text`, `read` / `read_at`,
`has_audio` and `audio_url`. Read-only, with one serious handling rule: **`audio_url` is a
5-MINUTE PRESIGNED S3 LINK to the recording of a real person's voice**, minted per row - anyone
holding the URL can fetch the audio with no Hiveku login for those 5 minutes. Do not paste it
into a ticket, a log or a transcript; pass `audio_urls: 'false'` to skip the presign entirely.
`audio_url` comes back null while `has_audio` is true when the presign could not be minted -
report that as "audio exists, link unavailable", not "no audio".

**`voice_voicemail_mark_read({ id, read })`** stamps or clears `voice_calls.voicemail_read_at`.
The real-world effect lands on the humans: marking read CLEARS THE UNREAD BADGE someone is
triaging from and drops the message out of every unread-only sweep, so **do not use it to tidy
an inbox you are only reading**. `read` must be a real JSON boolean (the string `'true'` is a
422). It returns only `{ id, read }` echoed back - a 200 says a row was written, not what the
timestamp says. Reversible by sending the opposite value, with one loss: `read: false` NULLs
the column and the previous heard-at timestamp is gone for good.

### The disposition trap: `voice_calls_list`'s own description is stale

This produces confidently wrong answers, and the tool description is what causes it.

`voice_calls.disposition` is written by the voice server's CDR writer, and the column only ever
holds five values:

`answered`, `voicemail`, `missed`, `ai_handled`, `abandoned`

Nothing else lands in it. A `NO_ANSWER` or `USER_BUSY` hangup is collapsed to `missed`, a
caller who hung up while still ringing is `abandoned`, and the AI receptionist is `ai_handled`.

| Tool | Values its description advertises | Values that actually match |
|---|---|---|
| `voice_calls_list` | `answered`, `no_answer`, `voicemail`, `busy`, `failed` (STALE, three of these are never stored) | the five stored values, as a single string |
| `marketing_call_attribution_list` and `_breakdown` | `answered`, `ai_handled`, `voicemail`, `missed`, `abandoned` | the same five stored values, as an ARRAY |

Both tools filter the SAME column. The attribution pair documents it correctly and
`voice_calls_list` does not, so **use the attribution vocabulary for both.**

**A value from the stale list returns nothing rather than erroring.** Neither tool declares an
enum, and the route does a raw equality match, so an unrecognised value is just a filter that
matches no rows. `voice_calls_list({ disposition: 'missed' })` WORKS - this is how you count
missed calls. `voice_calls_list({ disposition: 'no_answer' })` returns zero on every account,
always; so do `busy` and `failed`. Ask "how many missed calls last week", trust the
description, filter on `no_answer`, and you will report zero for an account that had fifty.

`no_answer`, `busy`, `connected`, `left_voicemail`, `wrong_number` and the rest of that family
are a DIFFERENT vocabulary: the manual disposition a rep picks when logging a call by hand in
the CRM. It is stored on the activity, not on `voice_calls`. It rides along in a
`crm_calls_list` row's metadata, but no rung-1 tool filters on it. Related write:
**`voice_call_disposition_set`** saves an operator wrap-up (an outcome chip plus notes) against
a just-ended call - a CRM write only, it never dials or ends anything, but OVERWRITING a
previous `user_disposition` or `user_notes` is not reversible because neither is versioned.

Also note `marketing_call_attribution_*` takes `disposition` as an ARRAY, while
`voice_calls_list` takes it as a single string.

## Part 3: Attribution and call quality

Profile note: the `marketing_*` pair below is invisible to a communications-scoped key; the
`voice_*` transcript path in Part 4 is the in-profile alternative.

`marketing_call_attribution_list` and `marketing_call_attribution_breakdown` answer the
marketing question: which source, medium and campaign produced which calls.

**`marketing_call_attribution_breakdown`** groups calls by source, medium, campaign and day,
the way an ad platform aggregates. Its real value is **call QUALITY, which the ad platform
structurally cannot report**: Google Ads counts a call as a conversion once it passes a minimum
duration regardless of whether it was a lead. This tool returns the duration distribution
against the account's own threshold, the disposition mix, and how many calls reached voicemail,
were missed or were abandoned. Learning that 18 of 40 "conversions" were under 30 seconds is
the entire point.

**Always read the caveats in the response before reporting a discrepancy.** This is Hiveku's
record, not the platform's record, and the two legitimately differ: view-through conversions
have no click and can never appear here, cross-device joins are invisible, the platform dates
by CLICK while Hiveku dates by the event, and the platform also counts conversions of other
types. Rule out these measurement artifacts BEFORE any causal story ("the campaign got worse",
"tracking broke"); reporting "the numbers do not match" without the caveats is a false alarm.

**`marketing_call_attribution_list`** returns the same breakdown PLUS a page of individual
calls, each carrying source, medium, campaign, the tracking number, the pool session, a
duration bucket, whether it meets the conversion policy, and `has_transcript` /
`has_summary` flags. It returns NO transcripts and never touches storage. `limit` caps at 200,
defaults 50. `include_summaries: true` inlines AI summaries; leave it off for a wide sweep.

Breakdown percentages cover up to 5,000 scanned calls. **`totals.truncated` says when the
window is larger, and `totals.calls_matching` is the uncapped count.** Report the uncapped
count, and disclose the scan cap when it bit - a truncated sample silently excludes exactly the
calls that could change the story. Set `timezone` to the AD ACCOUNT's IANA zone (defaults to
UTC; per-day totals disagree at both boundaries when zones differ). `to` is an EXCLUSIVE upper
bound.

## Part 4: Transcripts and recordings

Two paths to the same stored objects:

- **`voice_call_transcript_get({ id })`** (in the communications profile) returns the full
  transcript inline as one string, read server-side out of the KMS recordings bucket - no
  speaker array, no timestamps, no pagination, so a long call is a large single payload. The
  handler applies **NO redaction, NO consent check, NO retention check**; the only thing it
  verifies is that the call belongs to the key's account. 404 `no_transcript` when the
  transcript key is null, which is the NORMAL state until the post-process worker lands.
- **`marketing_call_transcript_get({ call_id })`** (full-profile key) returns the transcript
  plus AI summary and the `transcript_state` verdict below. `call_id` is a `voice_calls` UUID
  from `marketing_call_attribution_list`. It is deliberately a separate, costlier step - the
  transcript pays a storage round trip that a list sweep must never pay implicitly. Call it
  for calls you have a specific question about. Never map it across a result set.

**`voice_recording_url_get({ id })`** issues a presigned S3 GET for the recorded audio:
`{ url, expires_in_seconds: 300 }`. **The returned URL is an unauthenticated, shareable
download of a real conversation** - anyone who receives the link can stream or save the audio
with no Hiveku login for the next 5 minutes, it is NOT revocable once issued, and pasting it
into a ticket, chat, log line or agent transcript republishes the recording to everyone who can
read that surface. The route enforces no consent, retention or redaction check, so two-party-
consent obligations rest entirely with the caller. Prefer the transcript.

### Handle transcripts as the most sensitive data on the account

**The text is verbatim and unredacted.** A transcript contains whatever was said aloud,
including card numbers, dates of birth and health details. Do not put it in a report, a memory
document, a ticket body or a commit. Quote the minimum needed to answer, and prefer the AI
summary when the summary answers the question.

### `transcript_state` has five values and none of them means empty

When the marketing pair reports no transcript, the response says WHICH situation it is:

| State | Meaning | What to tell the user |
|---|---|---|
| `never_recorded` | No recording ever existed | Nothing failed. Recording was off or not applicable |
| `pending` | Still processing | Check back. The pipeline is asynchronous |
| `failed` | The retry window has closed | Nothing will retry it. Permanently unavailable |
| `purged` | It WAS transcribed and retention deleted it | **The `ai_summary` is the surviving record.** Read that |
| `unreadable` | The stored object is missing or will not read | A storage-side problem, not a transcription one |

Reporting all five as "no transcript available" throws away the answer. These are honest
verdicts: never collapse `pending` or `unreadable` into "none", and never let `purged` read as
a failure - the summary survives.

## Part 5: Inventory and diagnostics (reads)

### Diagnostics first

**`voice_diagnose_setup()`** is the first-resort tool for "is my phone system set up?". It
returns `tenant_provisioned`, active DIDs, DIDs missing E911, counts of extensions, ring
groups, IVRs and verified E911 addresses, plus a **`blocking_issues` array of human-readable
problems** - surface them close to verbatim, except the E911 string (below).

**`voice_extension_status({ q })`** returns one extension's owner, endpoint type and
registration state. `q` accepts the dial number (`'1003'`) or the extension UUID. It never
returns SIP credentials. `voice_extension_get` fetches one extension row by id.

**`voice_toll_fraud_state()`** returns today's outbound billable seconds against the account's
toll-fraud cap. This is the answer to **"why are my outbound calls being rejected?"** A tenant
over the daily cap has outbound blocked by design; that is a guard working, not an outage.

**`voice_settings_get()`** reads the account's single `voice_tenant_config` row - the phone
system's guardrails and post-call policy (`concurrent_call_cap`, `daily_outbound_cap_cents`,
`recording_enabled`, `recording_retention_days`, `hipaa_mode`, the missed-call autoresponder,
conversion-upload policy, keyword spotting). **SILENT FAILURE: `settings` is NULL on a 200
when the account pays for Voice but the PBX tenant was never provisioned** - null is not an
error and not defaults; it means no row at all, and updates against it fail. This is the
mandatory read before `voice_settings_update`.

### Listings

- `voice_numbers_list({ is_active?, page?, limit? })` for the account's DIDs. `is_active` is a
  STRING enum, `'true'` or `'false'`. `voice_number_get` for one DID.
- `voice_extensions_list`, `voice_ivrs_list`, `voice_ring_groups_list` (and
  `voice_ring_group_get`), `voice_queues_list`, `voice_e911_addresses_list`, paginated.
- **`voice_ivr_walk({ id })`** reads one IVR phone tree with every menu target pre-resolved a
  single level deep, so you can narrate what a caller actually hears without a round-trip per
  option: each digit's target resolves to the extension, the ring group with its full member
  roster in ring order, a sub-IVR stub (it does NOT recurse further), or the AI agent flag.
  `after_hours` runs through the same resolver. A deleted target does not error - it becomes
  `{ type: 'unknown', reason }`, which is exactly the dangling option to report.
- **`voice_blocked_numbers_list`** returns the whole CALL blocklist in one response (no
  pagination). `e164` is the SERVER-NORMALIZED value, not what was typed; `blocked_by` is NULL
  for every row added over the API, so `reason` is the only audit trail that exists.
- **`voice_port_orders_list`** lists number-port orders (status, support key, FOC dates,
  exceptions), with `voice_port_order_get` for one and `voice_port_order_requirements` for
  what a port needs. **The response is customer PII and legal porting paperwork**: exactly two
  fields are masked, and the losing account number is returned with its REAL LAST FOUR digits
  on purpose - do not paste rows into anything client-visible. Porting remains a multi-day
  regulated process with an LOA and a firm order commitment date; these tools give you
  STATUS visibility, not the ability to file a port. Never imply porting is a setting.

### E911 is a hard gate for LOCAL numbers, and toll-free is exempt

A LOCAL DID cannot stay active without a verified E911 address, enforced server-side on both
number create and number update. **Toll-free numbers are carved out end to end, and this is
where the diagnostic misleads you.** Toll-free is not E911-capable at the carrier, so the
activation gate is skipped entirely for a toll-free DID; a toll-free number with no E911
address is fully compliant.

`voice_diagnose_setup` does not know that. Its `dids_without_e911` count has **no toll-free
filter**, so each compliant toll-free number inflates the count and pushes a
`blocking_issues` string that reads like a live compliance problem. Before you report DIDs
missing E911 as a blocker, **cross-check with `voice_numbers_list` and subtract the toll-free
ones** (the NANP set `+1800`, `+1833`, `+1844`, `+1855`, `+1866`, `+1877`, `+1888`). If every
number in the count is toll-free, there is no blocker - say so, and say the count is a known
gap in the diagnostic. Report it as a blocker only for the LOCAL numbers that remain.

## Part 6: Voice writes (rung 1 since 2026-08-27) - live system, strict discipline

Every tool here changes a phone system real customers are calling. The send contract applies
in full: read current state first, show the exact before/after, get an explicit yes on THAT
plan, make the smallest change, then read the state back. Never batch voice writes.

**Routing objects:** `voice_extension_create` / `_update` / `_delete`, `voice_ivr_create` /
`_update` / `_delete`, `voice_ring_group_create` / `_update` / `_delete`, `voice_queue_update`
/ `_delete`. The one with a documented failure mode worth pre-empting:
**`voice_extension_create` provisions a REAL SIP endpoint on the PBX and THEN writes the row**
- the number is dialable immediately, the SIP password is returned by the phone system exactly
once and appears NOWHERE in the response (device setup is dashboard-only), and **the order can
orphan**: a failed insert leaves a live SIP endpoint with no builder row and an unrecoverable
password. Verify with `voice_extensions_list` after any create, and hand device provisioning
to the dashboard.

**Tenant settings: `voice_settings_update`** writes only the keys you send onto the config row.
No carrier API is called here, but **every value is read by a service that spends money,
deletes recordings or texts a customer**: `daily_outbound_cap_cents` is the toll-fraud ceiling
(the guard polls every 30 minutes), `recording_retention_days` drives deletion,
`recording_enabled` and `hipaa_mode` change what is captured. RESPONSE GAP from its registered
description: the PATCH's select omits `ga4_upload_enabled` even though it IS written, so a
successful change of that key is absent from the reply - confirm with `voice_settings_get`,
never read the omission as a dropped write.

**Numbers:** `voice_number_update` and `voice_number_cnam_set` edit a DID's config and
caller-ID name. **`voice_number_release` PERMANENTLY gives the number back to the carrier** -
no undo, no grace period; the DID returns to Telnyx inventory, cannot be re-bought, can be sold
to a stranger, and every place it is printed stops working (vehicle wraps, signage, the Google
Business listing, ad call extensions). Only ever call it after a human has confirmed this
exact number, by digits. SILENT FAILURE: `released` is echoed straight from the voice server
and the local row is deleted regardless of its value - read the response fields, and treat
`released: false` as a carrier-side follow-up, not a success. **`voice_numbers_search`**
searches Telnyx inventory for buyable numbers - SEARCH ONLY: it reserves nothing and spends no
money, a listed number can be taken by another buyer, a result without `sms` in `features`
cannot text, and the cost fields are real recurring money. **DEAD END BY DESIGN: no route on
this surface buys a number.** Present the shortlist and let a person order it in the
dashboard.

**The call blocklist:** `voice_blocked_numbers_add({ e164, reason?, direction? })` closes a
path against a real person. NORMALIZATION TRAP from its registered description: **the number
that gets blocked may not be the one you sent** - any input with exactly 10 digits is stored
as `+1` plus those digits EVEN IF you sent a leading `+`, so a 10-digit non-US number is filed
as a US number and you block a stranger's US line while the caller you meant still rings
through. Pass full E.164 with country code and read back the stored `e164`. Always write a
`reason` - it is the only audit trail (`blocked_by` is NULL over the API).
**`voice_blocked_numbers_remove` is a hard delete with no undo and re-opens the path
instantly** - a human decision for the account owner, per the hard stop in SKILL.md.

What is deliberately NOT written from here: buying numbers (above), filing ports, registering
E911 addresses (read-only listing only), and the AI receptionist's configuration.

## Part 7: Voice in workflows (rung 2)

Triggers:

- **`voiceCallCompletedTrigger`** fires after a call ends, whether a person answered or the AI
  receptionist handled it. Filters: direction, disposition, tracking number, minimum length.
- **`voiceVoicemailTrigger`** fires when a caller leaves a voicemail. It carries the caller,
  the number they dialled and the message length, **never the transcript.** If a workflow
  needs transcript content, it has to fetch it separately, and the transcript may still be
  `pending` when the trigger fires.
- **`voiceMissedCallTrigger`** fires on a missed or abandoned call with no voicemail. **This
  is the speed-to-lead hook**, and it is the highest-value voice automation on the platform: a
  missed call from a prospect answered by an immediate text or callback is the single biggest
  recoverable-revenue item in local services. Filters: direction, disposition, tracking
  number, ring time.
- `crmCallLoggedTrigger` fires when a new call activity is created.

Actions, all read-only:

- `voiceListCalls` with direction, disposition and hours-back filters. Unlike the MCP tool,
  this node validates `disposition` against the five stored values and FAILS the step on
  anything else, so a bad value surfaces as a run error instead of a silent zero.
- `voiceGetCallDetail` looks up one call by channel uuid and returns its recording key,
  transcript key, AI summary and sentiment.
- `voiceListNumbers` returns the DIDs with routing, tracking source and E911 state.
- `voiceExtensionStatus` returns one extension's owner, endpoint type, presence and forward
  target. Never returns SIP credentials.
- `phoneCall` initiates an outbound call.
- `crmLogCall` logs a call activity with duration, recording URL and transcript;
  `crmGetCalls` reads them back.

A missed-call-to-text workflow is `voiceMissedCallTrigger` into `sms`. Build it with
`test_mode` first and read the `would_have` payload, because the live version texts a real
person seconds after they hang up, and getting the number or the wording wrong is very
visible.

## Part 8: Crossing into helpdesk

`helpdesk_ticket_transfer_to_voice({ id, target_user_id? })` **annotates the ticket for a
voice transfer. The actual outbound dial is picked up by the voice server.** So the tool call
succeeding means the annotation was written, not that a phone rang. Do not report a completed
transfer on the strength of the tool's response; the dial happens out of band.

Tickets carry `channel: 'voice'`, so `helpdesk_ticket_list({ channel: 'voice' })` finds
call-originated tickets. (Full-profile key - `helpdesk_` is outside the communications
profile.)

## Part 9: What is still dashboard-only (rung 3)

The list shrank on 2026-08-27; what remains:

- **Buying a number.** Search is tooled; the order is not, by design.
- **Filing a port order** (status is readable via Part 5; the LOA and submission are not
  yours to do from here).
- **Registering or verifying E911 addresses** (listing only).
- **Softphone/device provisioning** (the SIP password exists exactly once, dashboard-side).
- **The AI receptionist's configuration.**

## Part 10: Diagnosis quick reference

| Symptom | First move |
|---|---|
| "Is my phone system set up?" | `voice_diagnose_setup`, then read `blocking_issues` verbatim |
| "Calls are not coming through" | `voice_recent_calls`, then `voice_diagnose_setup` |
| "Goes to voicemail too fast" | `voice_recent_calls` for the disposition and ring pattern |
| "Why are outbound calls rejected?" | `voice_toll_fraud_state` for the daily cap |
| A disposition filter returns zero | Only `answered`, `voicemail`, `missed`, `ai_handled`, `abandoned` are stored. `no_answer`, `busy`, `failed` never match |
| "Where are my voicemails?" | `voice_voicemails_list` (or filter `voice_calls_list` on disposition) |
| Voicemail has `has_audio` true but `audio_url` null | The presign could not be minted. Audio exists, link unavailable |
| No transcript | Read `transcript_state`. `purged` still has an `ai_summary` |
| Transcript still missing on a fresh call | `pending`. The pipeline is asynchronous |
| `voice_call_get` shows no recording / a "transcript" that reads like prose | `recording_url` is hardcoded null; `recording_transcript` is the AI summary. Use the dedicated tools |
| Numbers inactive | `voice_diagnose_setup` for DIDs missing E911, then `voice_numbers_list` to subtract the toll-free ones. Hard gate on LOCAL numbers only |
| Call counts disagree with Google Ads | Read the caveats block. Different dating and different scope - rule out the measurement artifacts first |
| Attribution totals look low | `totals.truncated`; report `totals.calls_matching` and disclose the scan cap |
| An extension will not register | `voice_extension_status({ q })` for endpoint type and state |
| A blocked caller still rings through | `voice_blocked_numbers_list` and compare the SERVER-NORMALIZED `e164` to the number you meant. The add-route rewrites 10-digit inputs |
| `voice_settings_get` returns null settings | The PBX tenant was never provisioned. Not an error, not defaults - a handoff |
