---
description: Phone system health for the bound account - provisioning, blocking issues, outbound cap, routing, DID inventory, E911.
argument-hint: "[optional symptom - e.g. 'phones not ringing' or 'extension 1003' or 'outbound rejected']"
---
Diagnose the phone system for the account this directory is bound to$ARGUMENTS. This is TELEPHONY,
not attribution: if the report is "our call conversions look wrong", that is the conversion-tracking
skill, not this command.

**Every tool below is READ-ONLY.** There is no MCP write tool in the `voice_*` family: no number
provisioning, no ring-group or IVR edit, no E911 registration, no toll-fraud cap change. Do not
promise a fix. Your deliverable is the named cause plus a PM task for the dashboard work.

**Do not try to answer this from `hiveku-data/voice/`.** `/hiveku:pull voice` snapshots the six list
datasets (numbers, extensions, ring_groups, ivrs, e911, calls) and NOT the diagnostic, so the
provisioning state and `blocking_issues[]` are not in local data at all. Step 1 is always a live
call, and it is a cheap one.

1. **`voice_diagnose_setup`** - takes NO arguments. Returns `tenant_provisioned`, active DIDs, DIDs
   missing E911, counts of extensions / ring groups / IVRs / verified E911 addresses, and
   `blocking_issues[]`, an array of human-readable problems.
   - `tenant_provisioned: false` is the whole answer. The account has no voice tenant; stop here.
   - Non-empty `blocking_issues[]` outranks everything below. Report those verbatim, then stop and
     hand them back. Do not keep digging past a blocking issue to find something more interesting.
2. **Outbound complaints only** ("outbound calls rejected", "can't dial out", "calls fail the moment
   we dial") - **`voice_toll_fraud_state`**, no arguments. Current daily-outbound billable seconds
   against the toll-fraud cap. A cap hit is **not a bug and not a Hiveku fault**; it is a spend guard
   working. Report the seconds used, the cap, and what burned them
   (`voice_calls_list({ direction: 'outbound', hours_back: 24 })`). Raising it is an account action
   in the dashboard.
3. **Do the calls exist at all?** `voice_recent_calls({ limit, hours_back })` - `limit` default 10
   max 50, `hours_back` default 24 max 168. Or `voice_calls_list` for a wider window. Zero inbound
   rows in a window where the client says they were called points at the carrier or DID routing, not
   at routing config.
4. **Routing** - `voice_ring_groups_list` and `voice_ivrs_list` for where a call is supposed to land,
   `voice_extension_status({ q })` for whether a seat is actually registered. `q` is the dial number
   (`'1003'`) or the extension UUID. An unregistered endpoint is the usual "my phone never rings":
   the ring group is right and the device is not connected. `voice_extensions_list` filters on
   `endpoint_type` (`desk_phone` | `softphone_mobile` | `softphone_desktop` | `external_number`).
5. **DID inventory** - `voice_numbers_list({ is_active: 'true' })`. `is_active` is the STRING
   `'true'` / `'false'`, not a boolean. A number the client publishes that is not in this list is not
   ours to ring.
6. **E911** (always, even when the complaint was something else) - if `voice_diagnose_setup` reports
   DIDs missing E911, run `voice_e911_addresses_list` and cross-reference against the active DIDs
   from step 5 to name WHICH numbers have no verified address. Pending verification is NOT
   registered; count those separately. This is Kari's Law / RAY BAUM'S Act exposure for the client,
   so it goes in the report as a risk item with the actual numbers, not a count.

**Report** in this order: blocking issues → the answer to the symptom the operator asked about →
E911 risk → anything you could not check. Then file the dashboard work with `pm_tasks_create` and
persist anything durable with `memory_create` / `memory_update` (`memory_update` REPLACES the whole
document - read with `memory_list` first).

**What NOT to do.** Do not narrate DNI swap health - there is no MCP tool for it and its issue codes
(`site_unreachable`, `snippet_missing`, `pool_empty`, `pool_exhausted`) are a dashboard view. Do not
filter `voice_calls_list` with `missed` or `abandoned`; its `disposition` vocabulary is
`answered | no_answer | voicemail | busy | failed` and an empty result there reads as "no missed
calls" when it means "wrong enum". Do not compare a `voice_calls_list` total against a
`marketing_call_attribution_list` total - the first excludes internal calls, the second includes
them.
