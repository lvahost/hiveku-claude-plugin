# Telephony: Calls, Voicemail, Transcripts, Numbers

The manual behind Play 6. Load it before answering anything about calls, before pulling a
transcript, and before diagnosing a phone system.

Telephony is the best-tooled part of communications at rung 1, but almost all of it is READ-only.
Reading call history, dispositions, attribution, transcripts and inventory is direct MCP.
Changing routing, provisioning numbers, editing IVRs and ring groups is dashboard work.

## Part 1: The mental model

Everything is a `voice_calls` row. There is no separate voicemail object, no separate missed-call
object, no separate recording object. One row per call, carrying direction, disposition,
duration, the number that rang, attribution, and pointers to a recording and transcript in the
encrypted recordings bucket.

**This is why there is no `voicemail_list` tool, and why looking for one leads people to report
that voicemails are unreachable.** A voicemail is a `voice_calls` row whose disposition is
`voicemail`. Filter for it.

Voice runs across two systems: the builder (Next.js on Render) holds the data and the API, and
`hiveku_voice_server` on an EC2 box runs FreeSWITCH and the call logic. That split matters for
one thing here: the post-processing pipeline that produces transcripts and AI summaries is
asynchronous and lives partly outside the builder, so a just-ended call legitimately has no
transcript yet.

## Part 2: Reading calls

### The core listing tools

**`voice_calls_list({ direction?, disposition?, hours_back?, page?, limit? })`** is the general
call history. `direction` is `inbound` or `outbound`. `hours_back` narrows the window.
`disposition` filters the `voice_calls.disposition` column, and **this tool's own description
lists the wrong values for it.** Read the next section before you use that filter.

**`voice_recent_calls({ limit?, hours_back? })`** is the diagnostic cut, built specifically for
"calls are not coming through" and "it goes to voicemail too fast". `limit` defaults to 10 and
caps at 50; `hours_back` defaults to 24 and caps at 168 (seven days). Reach for this one when
the question is about call FLOW rather than call VOLUME.

**`crm_calls_list({ contact_id?, company_id?, deal_id?, has_recording?, has_transcript?, search?,
page?, limit? })`** is the contact-centric view: call activities with recording and transcript
detail, filterable to one contact, company or deal. **`crm_get_contact` does not include call
history**, so this is the tool that answers "what calls have we had with this person".

### The disposition trap: `voice_calls_list`'s own description is stale

This produces confidently wrong answers, and the tool description is what causes it.

`voice_calls.disposition` is written by the voice server's CDR writer, and the column only ever
holds five values:

`answered`, `voicemail`, `missed`, `ai_handled`, `abandoned`

Nothing else lands in it. A `NO_ANSWER` or `USER_BUSY` hangup is collapsed to `missed`, a caller
who hung up while still ringing is `abandoned`, and the AI receptionist is `ai_handled`.

| Tool | Values its description advertises | Values that actually match |
|---|---|---|
| `voice_calls_list` | `answered`, `no_answer`, `voicemail`, `busy`, `failed` (STALE, three of these are never stored) | the five stored values, as a single string |
| `marketing_call_attribution_list` and `_breakdown` | `answered`, `ai_handled`, `voicemail`, `missed`, `abandoned` | the same five stored values, as an ARRAY |

Both tools filter the SAME column. The attribution pair documents it correctly and
`voice_calls_list` does not, so **use the attribution vocabulary for both.**

**A value from the stale list returns nothing rather than erroring.** Neither tool declares an
enum, and the route does a raw equality match on the column, so an unrecognised value is just a
filter that matches no rows. The failure is silent, and it runs the opposite way from what the
tool description implies:

- `voice_calls_list({ disposition: 'missed' })` WORKS. This is how you count missed calls.
- `voice_calls_list({ disposition: 'no_answer' })` returns zero on every account, always. So do
  `busy` and `failed`.

Ask "how many missed calls last week", trust the description, filter on `no_answer`, and you will
report zero for an account that had fifty.

`no_answer`, `busy`, `connected`, `left_voicemail`, `wrong_number` and the rest of that family are
a DIFFERENT vocabulary: the manual disposition a rep picks when logging a call by hand in the CRM.
It is stored on the activity, not on `voice_calls`. It rides along in a `crm_calls_list` row's
metadata, but no rung-1 tool filters on it, so counting by manual disposition means reading the
rows and counting them yourself.

Also note `marketing_call_attribution_*` takes `disposition` as an ARRAY, while
`voice_calls_list` takes it as a single string.

## Part 3: Attribution and call quality

`marketing_call_attribution_list` and `marketing_call_attribution_breakdown` answer the marketing
question: which source, medium and campaign produced which calls.

**`marketing_call_attribution_breakdown`** groups calls by source, medium, campaign and day, the
way an ad platform aggregates, so the two can be laid side by side. Its real value is **call
QUALITY, which the ad platform structurally cannot report**: Google Ads counts a call as a
conversion once it passes a minimum duration regardless of whether it was a lead, so a
twelve-second wrong number is a conversion. This tool returns the duration distribution against
the account's own configured threshold, the disposition mix, and how many calls reached
voicemail, were missed or were abandoned. Learning that 18 of 40 "conversions" were under 30
seconds is the entire point.

**Always read the caveats in the response before reporting a discrepancy.** This is Hiveku's
record, not the platform's record, and the two legitimately differ: view-through conversions have
no click and can never appear here, cross-device joins are invisible, the platform dates by CLICK
while Hiveku dates by the event, and the platform also counts conversions of other types.
Reporting "the numbers do not match" without those caveats is a false alarm.

**`marketing_call_attribution_list`** returns the same breakdown PLUS a page of individual calls,
each carrying source, medium, campaign, the tracking number that rang, the pool session that
credited it (dynamic number insertion attributes through both), a duration bucket, whether it
meets the account's conversion policy, and `has_transcript` / `has_summary` flags. It returns NO
transcripts and never touches storage. `limit` caps at 200 and defaults to 50.
`include_summaries: true` inlines each AI summary; leave it off for a wide sweep.

Breakdown percentages cover up to 5,000 scanned calls. **`totals.truncated` says when the window
is larger, and `totals.calls_matching` is the uncapped count.** Report the uncapped count, not
the scanned count, or you understate a busy account.

Set `timezone` to the AD ACCOUNT's IANA zone. It defaults to UTC, and per-day totals disagree at
both boundaries when the zones differ. `to` is an EXCLUSIVE upper bound.

## Part 4: Transcripts

`marketing_call_transcript_get({ call_id })` reads ONE call's verbatim transcript and AI summary.
`call_id` is a `voice_calls` UUID, taken from the `id` field of a call listed by
`marketing_call_attribution_list`.

**It is deliberately a separate, costlier step.** The transcript is an object in the encrypted
recordings bucket, so this pays a storage round trip that a list sweep must never pay implicitly.
Call it for calls you have a specific question about. Never map it across a result set.

### Handle it as the most sensitive data on the account

**The text is verbatim and unredacted.** A transcript contains whatever was said aloud, including
card numbers, dates of birth and health details. Treat it as the most sensitive class of customer
data and do not paste it anywhere it would outlive the question being asked. Do not put it in a
report, a memory document, a ticket body or a commit. Quote the minimum needed to answer, and
prefer the AI summary when the summary answers the question.

### `transcript_state` has five values and none of them means empty

When there is no transcript, the response says WHICH situation it is:

| State | Meaning | What to tell the user |
|---|---|---|
| `never_recorded` | No recording ever existed | Nothing failed. Recording was off or not applicable for this call |
| `pending` | Still processing | Check back. The pipeline is asynchronous |
| `failed` | The retry window has closed | Nothing will retry it. This one is permanently unavailable |
| `purged` | It WAS transcribed and retention deleted it | **The `ai_summary` is the surviving record.** Read that |
| `unreadable` | The stored object is missing or will not read | A storage-side problem, not a transcription one |

Reporting all five as "no transcript available" throws away the answer. `purged` in particular
still has a usable summary, and `pending` just needs time.

## Part 5: Inventory and diagnostics

### Diagnostics first

**`voice_diagnose_setup()`** is the first-resort tool for "is my phone system set up?" and "why
are my numbers not working?". It returns a snapshot: `tenant_provisioned`, active DIDs, DIDs
missing E911, counts of extensions, ring groups, IVRs and verified E911 addresses, plus a
**`blocking_issues` array of human-readable problems**. The strings are written for a human and
name the actual blocker, so surface them close to verbatim. The one exception is the E911 string,
which over-reports on any account holding a toll-free number: see "E911 is a hard gate for LOCAL
numbers" below before you pass that one on.

**`voice_extension_status({ q })`** returns one extension's owner, endpoint type and registration
state. `q` accepts either the dial number (`'1003'`) or the extension UUID. It never returns SIP
credentials.

**`voice_toll_fraud_state()`** returns today's outbound billable seconds against the account's
toll-fraud cap. This is the answer to **"why are my outbound calls being rejected?"** A tenant
over the daily cap has outbound blocked by design; that is a guard working, not an outage. The
cap is enforced by a sweep in the voice server, so it can engage between calls.

### Listings

- `voice_numbers_list({ is_active?, page?, limit? })` for the account's DIDs. Note `is_active` is
  a STRING enum here, `'true'` or `'false'`, not a boolean.
- `voice_extensions_list`, `voice_ivrs_list`, `voice_ring_groups_list`,
  `voice_e911_addresses_list`, all paginated with `page` and `limit`.

### E911 is a hard gate for LOCAL numbers, and toll-free is exempt

A LOCAL DID cannot stay active without a verified E911 address. That is enforced server-side on
both number create and number update, not merely recommended.

**Toll-free numbers are carved out end to end, and this is where the diagnostic misleads you.**
Toll-free is not E911-capable at the carrier, so create REQUIRES `e911_address_id` only for local
numbers and 422s if you attach one to a toll-free order, and the activation gate on update is
skipped entirely for a toll-free DID. A toll-free number with no E911 address is fully compliant.

`voice_diagnose_setup` does not know that. Its `dids_without_e911` count is every active DID with
no `e911_address_id`, with **no toll-free filter**, so each compliant toll-free number inflates
the count and pushes a `blocking_issues` string that reads like a live compliance problem.

So before you report DIDs missing E911 as a blocker, **cross-check with `voice_numbers_list` and
subtract the toll-free ones.** That listing returns each number's `e164` and `e911_address_id`;
toll-free is the NANP set `+1800`, `+1833`, `+1844`, `+1855`, `+1866`, `+1877` and `+1888`. If
every number in the count is toll-free, there is no blocker. Say so, and say the count is a known
gap in the diagnostic rather than a compliance failure. Report it at the top of your answer only
for the LOCAL numbers that remain.

## Part 6: Voice in workflows (rung 2)

Triggers:

- **`voiceCallCompletedTrigger`** fires after a call ends, whether a person answered or the AI
  receptionist handled it. Filters: direction, disposition, tracking number, minimum length.
- **`voiceVoicemailTrigger`** fires when a caller leaves a voicemail. It carries the caller, the
  number they dialled and the message length, **never the transcript.** If a workflow needs
  transcript content, it has to fetch it separately, and the transcript may still be `pending`
  when the trigger fires.
- **`voiceMissedCallTrigger`** fires on a missed or abandoned call with no voicemail. **This is
  the speed-to-lead hook**, and it is the highest-value voice automation on the platform: a
  missed call from a prospect answered by an immediate text or callback is the single biggest
  recoverable-revenue item in local services. Filters: direction, disposition, tracking number,
  ring time.
- `crmCallLoggedTrigger` fires when a new call activity is created.

Actions, all read-only:

- `voiceListCalls` with direction, disposition and hours-back filters. Unlike the MCP tool, this
  node validates `disposition` against the five stored values and FAILS the step on anything else,
  so a bad value surfaces as a run error instead of a silent zero.
- `voiceGetCallDetail` looks up one call by channel uuid and returns its recording key, transcript
  key, AI summary and sentiment.
- `voiceListNumbers` returns the DIDs with routing, tracking source and E911 state.
- `voiceExtensionStatus` returns one extension's owner, endpoint type, presence and forward
  target. Never returns SIP credentials.
- `phoneCall` initiates an outbound call.
- `crmLogCall` logs a call activity with duration, recording URL and transcript;
  `crmGetCalls` reads them back.

A missed-call-to-text workflow is `voiceMissedCallTrigger` into `sms`. Build it with `test_mode`
first and read the `would_have` payload, because the live version texts a real person seconds
after they hang up, and getting the number or the wording wrong is very visible.

## Part 7: Crossing into helpdesk

`helpdesk_ticket_transfer_to_voice({ id, target_user_id? })` **annotates the ticket for a voice
transfer. The actual outbound dial is picked up by the voice server.** So the tool call succeeding
means the annotation was written, not that a phone rang. Do not report a completed transfer on
the strength of the tool's response; the dial happens out of band.

Tickets carry `channel: 'voice'`, so `helpdesk_ticket_list({ channel: 'voice' })` finds
call-originated tickets.

## Part 8: What is dashboard-only (rung 3)

Reads are well covered; writes are mostly not. Expect a handoff for:

- Buying, releasing or porting numbers.
- Changing call routing, editing IVR menus, editing ring groups and queues.
- Creating or reassigning extensions, and softphone provisioning.
- Registering and verifying E911 addresses.
- Recording settings and retention.
- Anything about the AI receptionist's configuration.

Number porting in particular is a multi-day regulated process with an LOA and a firm order
commitment date. Never imply it is a setting.

## Part 9: Diagnosis quick reference

| Symptom | First move |
|---|---|
| "Is my phone system set up?" | `voice_diagnose_setup`, then read `blocking_issues` verbatim |
| "Calls are not coming through" | `voice_recent_calls`, then `voice_diagnose_setup` |
| "Goes to voicemail too fast" | `voice_recent_calls` for the disposition and ring pattern |
| "Why are outbound calls rejected?" | `voice_toll_fraud_state` for the daily cap |
| A disposition filter returns zero | Only `answered`, `voicemail`, `missed`, `ai_handled`, `abandoned` are stored. `no_answer`, `busy`, `failed` never match |
| "Where are my voicemails?" | `voice_calls_list({ disposition: 'voicemail' })`. There is no voicemail tool |
| No transcript | Read `transcript_state`. `purged` still has an `ai_summary` |
| Transcript still missing on a fresh call | `pending`. The pipeline is asynchronous |
| Numbers inactive | `voice_diagnose_setup` for DIDs missing E911, then `voice_numbers_list` to subtract the toll-free ones. Hard gate on LOCAL numbers only |
| Call counts disagree with Google Ads | Read the caveats block. Different dating and different scope |
| Attribution totals look low | `totals.truncated`; report `totals.calls_matching` |
| An extension will not register | `voice_extension_status({ q })` for endpoint type and state |
