# Voice handoff - transfer semantics, call evidence, and logging the outcome

Load this before `helpdesk_ticket_transfer_to_voice`, and whenever you need to verify whether a
call happened or log its outcome back onto the ticket and the CRM.

## What transfer_to_voice actually does

`helpdesk_ticket_transfer_to_voice({ id, target_user_id? })` is for when the problem is faster
or safer on a call (an upset customer, a complex multi-step fix, anything where tone matters
more than text). Know what it actually does: it only ANNOTATES the ticket. The dial is executed
by voice_server, asynchronously and outside this tool's control, and the call returns success
whether or not a call is ever placed - if voice_server is not running or not configured for the
account, nothing happens and nothing errors. Never tell a customer "we are calling you now" on
the strength of this call alone. There is a concrete check: run `voice_diagnose_setup` (no
arguments) and read `tenant_provisioned`. False means the account has no voice tenant, so the
annotation is a dead end and the ticket would carry a callback expectation nothing will honor -
do not transfer, reply in the ticket instead. Verification is NOT in helpdesk: the handler writes
a `source_meta` marker (`transfer_to_voice_requested_at`, `transfer_to_voice_target`) and bumps
`last_activity_at`, and adds no ticket message - so `helpdesk_ticket_messages` shows nothing about
the transfer whether or not a call happened, and `helpdesk_ticket_get({ id })` only proves the
marker was written. Call evidence lives in voice/CRM: `voice_recent_calls({ hours_back })` or
`voice_calls_list({ direction: 'outbound', hours_back })`, or `crm_calls_list({ contact_id })`
using the ticket's `crm_contact_id`. Nothing joins a call row to the ticket, so match it yourself
on number and timestamp. Never close the ticket on the marker alone.

## Reading the matched call (three traps in voice_call_get)

Once you have a candidate call row, `voice_call_get` fetches one call by id for a deep link.
Three of its fields answer 200 while telling you nothing true: `recording_url` is HARDCODED
null on every response (`has_recording` is the real signal); `recording_transcript` carries the
AI-written prose summary (`ai_summary`), NOT the transcript; and `status` is derived, so a call
still ringing can read `failed` while an ai_handled call reads `completed`. Do not quote any of
those three at face value.

## Transcript and recording - resolution evidence, handled as sensitive

The transcript is the actual resolution evidence to hold before closing a ticket on "we
resolved it by phone". `voice_call_transcript_get` returns the entire stored transcript inline
as one string (no truncation, no pagination; the id is `voice_calls.id`). It is a verbatim
record of a real conversation with NO redaction, consent, or retention check applied - names,
card numbers, health and financial detail appear as spoken. Read it to confirm what was agreed;
quote into the ticket only the minimum needed (the commitment made, the fix confirmed), never
the raw dump.

`voice_recording_url_get` is more dangerous than useful here: it issues an UNAUTHENTICATED,
shareable presigned URL to the audio, live for 5 minutes and NOT revocable once issued. Anyone
holding the link can stream or save the audio with no Hiveku login - so pasting it into a
ticket, a chat message, a log line, or an agent transcript republishes the recording to everyone
who can read that surface. Prefer the transcript; if audio is genuinely needed, hand the URL to
the one human who asked for it and nowhere else.

## Logging the outcome

Close the loop in both systems, or the handoff evaporates:
- On the ticket: `helpdesk_ticket_add_message` an internal note - who called, when (the matched
  call row's timestamps), what was agreed - then `helpdesk_ticket_set_status` to `resolved` or
  `pending` as the call outcome dictates. The marker alone is not a record.
- On the CRM: `crm_create_activity` (type call) linked to the contact, so the relationship
  timeline the sales side reads shows the support call. A ticket-only trail leaves the account
  team blind to an angry customer they are about to upsell.

## The other direction - a caller who needs a ticket

A missed call or voicemail that needs follow-up becomes a ticket via
`helpdesk_ticket_create({ contact_phone, channel: 'voice', ... })`. Resolution precedence is
`crm_contact_id` -> `contact_email` -> `contact_phone`; phones are normalized to E.164 before
lookup, and an unknown phone lazy-creates a contact with no email. Shared lines are real
(there is deliberately NO unique index on phone), so a multi-match resolves to the OLDEST
contact and the 201 body flags it with `contact_resolution { matched_by: 'phone', ambiguous:
true }` - heal that with `crm_contact_merge` rather than leaving the caller's support history
split across twin contacts. Pass `channel` explicitly: it defaults to `email` even on a
phone-resolved ticket. The usual create cautions apply unchanged (confirm first; the create
can auto-acknowledge on its own - see SKILL.md Play 1 step 0).
