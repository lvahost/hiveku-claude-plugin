# Forecasting, diagnostics, rep coaching, and the monthly report

Load this file before quoting any number to the owner. Two disciplines govern everything here:
every figure traces to a tool call in this session (a number with no tool behind it does not get
reported), and unavailable is never zero.

## Weekly forecast

- `crm_forecast_weighted({ pipeline_id })` - SUM(value x stage_probability/100), per-stage breakdown +
  grand total. Sanity-check it: strip deals with past-due close dates or no activity in 21+ days before
  quoting a number to the owner - call out what you excluded and why.
- Track week-over-week delta. The delta and its cause (deals advanced, slipped, died, created) IS the
  forecast story.
- **Sample transparency on every aggregate.** Disclose N, the window, how rows were selected, and
  what was excluded. The format: "Forecast $84k (12 open deals, next 90 days; excluded 3
  past-due-close deals worth $22k, listed below)." A number without its exclusions is a number the
  owner cannot audit.

## Diagnostics - where deals die

- `crm_report_pipeline_summary({ pipeline_id })` - open deal counts and weighted/total $ per stage.
  CURRENT STATE ONLY: it takes no date range and returns no created/won/lost breakdown (it largely
  duplicates `crm_pipeline_stage_summary`). Never present it as period activity.
- `crm_report_conversion_funnel({ pipeline_id })` - stage-to-stage conversion rates; compare against
  the benchmarks below to find the broken stage. No date range either - it is the funnel as
  it stands.
- `crm_report_stage_transitions({ pipeline_id, date_from, date_to })` - raw stage-movement events in
  a date range. All three arguments are optional; omit pipeline_id to span every pipeline. This is
  the ONLY period-scoped movement source, so it is what verifies a bottleneck hypothesis (lots of
  entries into Proposal, few exits) and what you cite for load-bearing claims.
- `crm_report_loss_reasons` - closed-lost deals over a window bucketed by `lost_reason_code`:
  `rows` of { code, count, total_value } sorted count-desc, an `uncoded` bucket with its own
  count and total_value, totals, and `lost_statuses_counted` (the account's is_lost-flagged
  statuses plus the literal 'lost' / 'closed_lost' slugs - the echo tells you exactly what was
  counted). This is where no-decision death becomes visible in AGGREGATE: one ghosted deal is
  an anecdote; "no_decision + ghosted is 40% of lost dollars this quarter" is a coaching
  agenda, and usually a bigger one than any competitor. Two honesty rules. First, the
  `uncoded` bucket is MIGRATION DEBT - deals closed before the code existed, or closed
  sloppily since - so report it as its own line ("N lost deals / $X carry no code"), never
  fold it into 'other' and never omit it; a shrinking uncoded bucket is itself a
  close-out-discipline metric worth tracking month over month. Second, the same dating caveat
  as the win leaderboard: deals have no closed_at column, so the window filters updated_at - a
  lost deal edited later re-enters newer windows; stage_history is the audit trail for exact
  dates.
- **Measurement artifacts before narratives.** Before any causal story (rep slump, market
  softening, ICP drift), rule out the instrument: unlogged activities make a worked pipeline read
  as a dead one (principle 3 discipline gap, not a market signal); `crm_rep_win_leaderboard` dates
  wins by updated_at, so a deal edited after closing moves between periods; `crm_contacts_top_scored`
  hides never-scored contacts; and a current-state funnel misread as period activity manufactures
  trends out of snapshots. The data being fine and the interpretation wrong is the default failure
  mode - check the instrument, then talk about the market.

## Rep coaching signals

- `crm_report_activity_summary({ date_from, date_to })` - activity volume by type over the range
  (defaults to the last 7 days).
- `crm_activity_leaderboard({ days })` - activity by rep, rolling window (default 30, max 365). Low
  activity + low pipeline = effort problem; high activity + low wins = quality/skill problem.
  Different coaching, so diagnose before advising.
- `crm_rep_win_leaderboard({ days })` - closed-won count and value by rep (default 90, max 365). It
  uses deal.updated_at as the close proxy (there is no closed_at column), so a deal touched after it
  closed counts on the date of that edit. Treat it as directional and confirm load-bearing claims
  against `crm_report_stage_transitions`. Pair with the activity leaderboard to separate hustle from
  conversion skill. Frame findings as coaching points, not blame.
- Before you call it a skill problem, read two or three call transcripts from the rep in question:
  `crm_calls_list({ contact_id, has_transcript: true })` (also filterable by deal_id or free-text
  `search`). Coach the specific questioning gap, not the aggregate.

## Monthly report (deliverable)

Structure, in markdown, saved to reports/ in the workspace AND persisted with `memory_create`
(domain sales) so next month's report can cite the trend:
1. Headline: pipeline created / advanced / won / lost this month (dollars and count), and lost
   dollars get their WHY: `crm_report_loss_reasons` by code, with the uncoded bucket as its own
   line (updated_at-dated, like the leaderboard - say so). **Say which
   call produced each number.** Advanced comes from `crm_report_stage_transitions({ date_from,
   date_to })` - the only period-scoped movement read. Created / won / lost have no period-filtered
   endpoint: pull `crm_list_deals({ status, pipeline_id, limit })` and bucket the rows by their own
   created_at / updated_at yourself (there is no date parameter on that tool), and note that "won
   this month" is dated by updated_at, the same proxy the win leaderboard uses. If a number cannot
   be derived that way, print "not available from the CRM tools" - never substitute an
   open-pipeline figure from `crm_report_pipeline_summary` for period activity.
2. Conversion funnel by stage vs last month, with the one broken stage named. The funnel tool is
   current-state, so the month-over-month comparison only exists if you saved last month's figures
   to memory - cite the stored snapshot or say the comparison is unavailable.
3. Activity health: touches by type and rep, leaderboards, logging-discipline note.
4. Forecast: weighted number, what was excluded and why, delta vs last month.
5. Focus list: top 5 deals to win next month, each with its concrete next step and owner.
6. Sequence program: enrollments and open/click rates per step from `crm_sequence_analytics`,
   reply and booking rates per sequence from `crm_sequences_compare` (analytics has neither); what
   gets rewritten or cloned.

### Report honesty rules (closed vocabulary)

- Every metric in the report is one of: **reported** (with its tool call named), **not available**
  (the tools cannot produce it), or **not applicable** (the account does not run that motion).
  not-available and not-applicable NEVER convert to zero, to a pass, or to a flat trend - "no
  funnel snapshot from last month" is "comparison unavailable", not "unchanged".
- A failed or disconnected source makes the report **partial, not smaller**: say in the headline
  which section is missing and why, exclude that source from any denominator, and never average a
  gap away. Do not hide partial status in the summary the owner actually reads.
- Surface contradictions instead of reconciling them silently: if the win leaderboard and the
  stage-transition read disagree, show both with their definitions (updated_at proxy vs movement
  events) and say which one you trust for this claim and why.

## Benchmarks + decision rules

Stage conversion norms (B2B services baseline - recalibrate from `crm_report_conversion_funnel` after
one quarter of clean data):
- New lead → Qualified: 25-40%. Below 20% = targeting/ICP problem, revisit lead sources.
- Qualified → Proposal: 40-60%. Below 35% = discovery quality problem (coach questioning).
- Proposal → Negotiation/Verbal: 30-50%. Below 25% = pricing/packaging or proposal quality problem.
- Negotiation → Won: 60-80%. Below 50% = closing-stage discipline problem (unqualified "negotiations").
- Overall lead → win of 5-15% is normal; the fix always targets the single worst stage, not "everything".

Comparison ladder: this account's own prior period beats every benchmark; the norms above are
broad-market and directional only. Never present "we are below the 25-40% band" as a measured
decline - a decline is two of the account's own periods, compared.

Follow-up cadence: 3-5 touches over 2 weeks on an active thread (mix email/call/value-add), then move
to nurture - do not keep hammering. Every touch adds something (insight, case study, specific question);
never send a bare "bumping this".

Response SLAs: hot inbound draft within 1 business hour; all inbound same business day; sequence
replies within 4 business hours during the work week.

(Sequence floors - reply/open-rate thresholds and the A/B racing rules - live in
`references/sequence-program.md`, next to the tools that measure them.)

## Reporting pitfalls (restated at the surface)

- **Velocity numbers are best-effort** (derived from stage_history). Treat `crm_pipeline_velocity` as
  directional; trust `crm_report_stage_transitions({ pipeline_id, date_from, date_to })` for
  load-bearing claims - its arguments are date_from/date_to, not from/to.
- **`crm_report_pipeline_summary` and `crm_report_conversion_funnel` have no date range.** They are
  current-state reads. Nothing in the CRM tool set returns created/won/lost totals for a period
  directly; derive them per the report recipe above and say so, never present a snapshot as period
  activity.
