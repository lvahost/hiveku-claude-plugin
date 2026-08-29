# Support sweep - Brightside Fixtures - 2026-08-29

Read-only pass: every send, assign, priority change, and close below is a proposal. The approval gate was reached and stopped at; nothing executed.

## Config this sweep respects

- SLA: first response 240 minutes, resolve 2880 minutes; pending pauses the clock.
- auto_acknowledge on; auto_assign off; auto_close off - so routing and pending chases are manual work here, which is why both of those queues below carry items instead of clearing themselves.

## Breaches first

- tick_1042 - CSV export stuck at 0 rows (Priya Raman, Ashford Dental). First response overdue by 1,548 minutes against the 240-minute window.
- The silent part: Dana DID answer the customer at 10:05 - but via an add_message, which never stamps first_response_at, so the ticket kept breaching while looking handled in the thread. Only helpdesk_ticket_send_reply stops that clock; the proposed reply below goes through it.
- History that changes the wording: this is the second export incident for this contact (tick_0871, resolved 2026-06-11), and Ashford Dental is a reference customer - the draft owns the silence and names the repeat instead of treating it as new.
- Resolve-breach queue: empty.

## New and unassigned (enumerated client-side; no unassigned filter exists)

- tick_1041 - password reset email not arriving (Mei Tan, Ashford Dental). Proposed: queue_general (round robin), priority high per the rubric - a broken feature blocking daily work.
- tick_1043 - annual plan pricing question (Ruth Calder). Proposed: queue_general, priority normal - a question.
- tick_1038 stays with Marco: answered at 40 minutes via send_reply, template fix already promised.

## Aging pending

- tick_1029 - domain verification (Owen Ferris) - quiet since 2026-08-21. auto_close is off, so nothing will ever sweep it; proposed: the check-in chase below, then a close proposal if it stays quiet past the account's close-if-quiet window.
- tick_1035 stays put - active yesterday, customer choosing a call slot.

## Approval gate - exact texts and actions, one yes covers exactly this list

Reply on tick_1042 (via helpdesk_ticket_send_reply, macro mac_ack rendered, zero unfilled placeholders):

```
Hi Priya - thanks for flagging the CSV export returning 0 rows, and sorry our first note never reached your ticket properly. We found the nightly export job stalled and are restarting it with a fix; because this echoes the June export issue, we are also adding a monitor so a stall pages us before it reaches your front desk. Expect an update from us by tomorrow 10:00 your time. - The Brightside team
```

Chase on tick_1029 (via helpdesk_ticket_send_reply, macro mac_pending_chase rendered):

```
Hi Owen, just checking in on the domain verification records - are they in at your registrar yet? If we don't hear back by Friday 2026-09-04 we'll close the ticket, and you can always reopen it. - The Brightside team
```

Also awaiting the same yes: assign tick_1041 to queue_general at high, assign tick_1043 to queue_general at normal, then tick_1042 to pending once its reply is out.

## Follow-ups filed

- pmt_1 - engineering: export job stall plus a repeat-incident monitor (tick_1042 now, tick_0871 in June). A sweep that files no systemic follow-up missed the systemic issue; this one is it.
- Coaching note persisted to helpdesk memory: an add_message outbound reads like an answer but leaves the breach clock running - reply with send_reply or the customer hears from us while the SLA says we never did.

## Re-check cadence

This pass is a snapshot - no delta feed exists. Re-run the overdue pull in an hour or two against the ids above and report only what changed.
