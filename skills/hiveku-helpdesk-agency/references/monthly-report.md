# Monthly report - the artifact the retainer pays for

Load this when assembling the monthly client report. It is the full template plus the honesty
rules every figure must pass.

There is no support-specific deliverable store, so assemble the report as structured markdown,
persist it with `memory_create({ type: 'memory', name: 'helpdesk-monthly-<yyyy-mm>', content })`
(there is no `report` type - that call is a 400; this dated entry is archival and is retrieved with
`memory_list`, while the standing `helpdesk` document is what agents hydrate),
and deliver it to the client the way the account expects (dashboard share or the agreed channel).
Include, in this order:

1. Executive summary - 5 bullets: headline metric (CSAT, SLA attainment, or the overdue-count
   trend), biggest win,
   biggest risk, what we did, what is next. Written last, placed first. A median first-response
   time may lead only when it is `median_first_response_minutes` from `helpdesk_sla_history` -
   computed only from tickets carrying the real timestamps, never imputed - or computed yourself
   from timestamps on tickets you actually
   read. Never hide a partial or unknown status here: if the volume figure is
   a floor or CSAT is a config artifact, the summary says so in the same breath as the number.
2. Volume and SLA - tickets received / resolved / still open from `helpdesk_ticket_list`, overdue
   count trend from `helpdesk_tickets_overdue`, and SLA attainment against the agreed targets
   from `helpdesk_sla_history` over the report month (the window is over `created_at`, max 92
   days per call; `group_by: 'assignee'` for the per-agent split). Attainment is provable now,
   not a dashboard number: sla_history includes ALL ticket statuses, so a ticket that breached
   and was later resolved still counts as a breach, where overdue only shows live fires. Report
   first_response and resolve attainment separately - each ticket is classified twice, as
   met | breached | pending | no_sla - and carry the tool's honesty contract into the report as
   written: attainment_pct = met/(met+breached); no_sla tickets (no SLA policy applied) and
   pending tickets (deadline not yet expired) are EXCLUDED from that denominator, and both
   counts are reported alongside the percentage so the exclusion is visible, never silent.
   State the numerator and denominator; no bare percentages. sla_history counts are
   whole-window, never page-limited; the other two sources are limited and the
   limit is invisible: `helpdesk_ticket_list` is paged, so page with `page` / `limit` until a short
   page returns and report the count you actually enumerated - never a page size as a total. Call
   `helpdesk_tickets_overdue` with `limit: 500` (default 100, max 500) and split it by
   `kind: 'first_response'` vs `kind: 'resolve'` - missed reply windows and missed resolutions are
   two different failures with two different fixes. If a list comes back at exactly its limit,
   your figure is a floor, and you must say so rather than report it as the total.
3. Satisfaction - `helpdesk_csat_stats({ since })` month over month with the per-assignee split,
   the `response_count` it returns in `totals` as your sample size, and 2-3 representative
   verbatims from `helpdesk_csat_list` (one glowing, one critical, one typical) so the client
   hears real customers. State the CSAT definition you are using: `csat_score = great / total`
   over `great | ok | not_great`. Do not report a survey response rate: no helpdesk tool returns
   surveys-sent, so the denominator does not exist. Report the response count instead, and say
   plainly when a score rests on a handful of responses. Disclose how the verbatims were chosen
   and how many responses they were chosen from - three quotes selected from 40 responses is a
   different claim than three quotes that ARE the responses.
4. Top contact reasons - the demand map, with what you shipped to deflect each (KB articles and
   macros created this month).
5. Knowledge and automation - articles created/updated, macros created/updated, any queue or
   automation change. There is no handle-time metric in this tool family, so show effect with what
   you can measure: macro `usage_count` from `helpdesk_macros_list` (it sorts most-used first) and
   ticket volume on that contact reason before vs after, counted from `helpdesk_ticket_list`. KB
   article view counts are not exposed by any tool here - `helpdesk_kb_read_article` increments the
   counter but is not a reporting surface, so get views from the dashboard or leave them out. Do
   not assert a handle-time reduction you cannot source.
6. Work completed - from completed pm tasks; link the escalations resolved and the systemic
   fixes shipped.
7. Next month plan - the SLA and deflection priorities for the coming month, with expected
   impact.

Every figure must trace to a named tool call. No vibes, no rounded-up guesses.

## Metric honesty (closed vocabulary)

Every figure in the report carries exactly one status, and the status travels with the number:
- `measured` - traced to a named tool call over a complete list (paged to the end, under limit).
- `partial` - the source truncated (a list at exactly its limit is a floor), a period is
  incomplete, or one channel's data failed to load. A failed or truncated source is PARTIAL,
  never zero: excluding it from the denominator and labeling the figure partial is honest;
  silently counting it as zero is fabrication in the other direction.
- `unknown` - the tool family cannot produce it (handle time, KB views, survey response rate -
  median first-response/resolution times came OFF this list when `helpdesk_sla_history`
  shipped; they are `measured` when sourced from it) or config makes the number meaningless (a
  disabled `csat_survey`
  makes CSAT unknown, not low and not zero).
- `not_applicable` - the dimension does not exist on this account (voice-channel stats with no
  voice tenant, chat stats with no widget deployed).
Unknown and not_applicable are valid outputs and are never converted into passes, zeros, or
silent omissions that imply health. When two sources disagree (CSAT up, verbatims furious;
volume down, overdue up), surface the contradiction and name a hypothesis - do not average it
away.

## Comparability gate

Before computing any month-over-month trend, confirm the two periods measured the same thing:
the same `csat_survey` configuration (enabled, same trigger, same channels), the same SLA ladder
(the weekly reconciliation in SKILL.md records ladder changes with dates), and the same status
set in the denominator. `helpdesk_sla_history` classifies each ticket against the due
timestamps it was actually stamped with, so a window spanning a ladder change mixes two
different promises inside one attainment_pct - split the window at the recorded change date
instead. If configuration changed mid-period, report the periods side by side
with their definitions and the change date - do not compute a single trend number across the
break. The same gate applies across instruments: helpdesk CSAT (`great/ok/not_great`,
`csat_score = great/total`) and any `survey_*` NPS/CSAT program the account runs are different
instruments on different scales - report them side by side with definitions, never blended into
one "satisfaction" figure. (Note: the `survey_*` tools are granted via marketing-shared
prefixes, NOT the helpdesk key profile - a helpdesk-scoped key cannot see them, so if the
account runs proactive surveys, that data arrives via a communications/marketing/full key or
the dashboard; flag the boundary rather than fishing.)

## Measurement artifacts before narratives

Before explaining any metric move (satisfaction fell, backlog spiked, SLA slipped), rule out
measurement artifacts first, in this order, and only then reach for a causal story:
- Truncation: was last month's figure paged to the end and this month's capped at a limit?
- Config change: did `csat_survey`, `auto_close`, or either SLA ladder (`first_response_sla` /
  `resolve_sla`) change mid-period?
  `auto_close` sweeping aged pending tickets can masquerade as a resolution improvement.
- Priority mix: `helpdesk_ticket_escalate_to_human` forces `priority=urgent`, so a month with
  heavy escalation re-clocks tickets onto the tightest SLA rung and can manufacture breaches -
  footnote escalated tickets in attainment.
- A first-response figure measures a real human or AI reply that was actually DELIVERED.
  Auto-acknowledgements, internal notes and failed sends do not stop the clock. Any comparison
  against a period before 2026-09 is comparing two different definitions: attainment was
  previously satisfied by the autoresponder seconds after a ticket opened, so historical
  first-response numbers were flattered and a drop here is a change of measure, not of service.
- Recording misuse: an outbound `helpdesk_ticket_add_message` answers the customer without
  stamping `first_response_at`, permanently skewing first-response attainment downward - it
  shows up as breached rows in `helpdesk_sla_history` too; check
  for that pattern before reporting a response-time regression as a staffing problem.
- Denominator drift: a swing in `helpdesk_sla_history`'s excluded no_sla count means tickets
  arrived with no SLA policy applied - the attainment_pct then measures a shrinking slice of
  the queue, which is exactly why those excluded counts are quoted beside every percentage.
The data being fine and the interpretation being wrong is the default failure mode of reporting;
an artifact story told as a customer story costs the client real money.
