# Workflow Reliability: keeping a shipped automation working

Load this file when an automation that used to work has stopped, when a client says "we
stopped getting the emails" or "it says it ran but nothing happened", or when you are
doing a proactive health pass. The rest of the skill teaches how to BUILD a workflow;
this one is about the six months after that, where trust is won or lost.

The failure you are looking for is almost never a loud one. A workflow that 500s gets
fixed the same day. The ones that cost a client money are quiet: a paused workflow
banking leads behind a form that still says "Thanks!", a run full of degraded steps
reporting success, a 9am report landing at 2am because nobody passed a timezone, a status
filter returning an empty list that reads exactly like a healthy account.

**The one rule that governs the whole file: absence of evidence is not evidence.** Zero
runs is unknown. An empty filter result is unknown. A green run with no logs is
unknown. Say "unknown" out loud rather than folding it into a summary the client will
read as "fine".

---

## Part 1: The triage ladder

Someone says the automation stopped working. Run these in order. Do not skip to the
interesting step: the boring steps are the ones usually true, and each step you complete
RULES SOMETHING OUT, which is what makes the next answer mean anything.

### T0. Name the workflow

```
workflow_list({ search })                  # or enabled: true/false
workflow_resolve_short_id({ short_id })    # the 8-char id from the dashboard
```

`workflow_resolve_short_id` 404s on no match and 409s with `candidates[]` on an
ambiguous prefix. If the client is describing behaviour rather than a workflow ("the
auto-reply on tickets"), consider that no workflow owns it at all, see T7.

### T1. Is it enabled?

```
workflow_get({ workflow_id })   # is_enabled on the workflow row
```

A disabled workflow fires on nothing: not its webhook, not its schedule, not an internal
event. It writes no run rows and logs no failures, so it is indistinguishable in every
run-history tool from a workflow nobody triggered.

- **`is_enabled: false` explains everything downstream.** Stop the ladder, ask WHO
  disabled it and why (`audit_query({ tool_contains: 'workflow_disable' })` names the key
  and the time), and never re-enable a possibly-deliberate disabling without a yes.
- **`is_enabled: true` rules out only this.** An enabled workflow can still be
  auto-paused, which is T2.

### T2. Is it paused, and why?

The highest-yield step on the ladder, and the one most often skipped, because a paused
workflow produces the least evidence of anything being wrong. A paused workflow REJECTS
triggers and the rejection writes **no run row**, which is the exact signature of "it
just stopped, there are no errors". Meanwhile the client's form still returns a success
page, because the webhook keeps accepting and storing the delivery. Mechanics and
recovery: Part 6.

```
workflow_stranded_list({ workflow_id })    # read-only: the pause window, the count, the stored submissions
```

- A pause window with a count is proof of a pause, and the count is a LEAD count. Those
  submissions are invisible, not lost.
- A run history that simply STOPS on a date, with the last few runs failing and nothing
  after, is the fingerprint. The failures caused the pause; the silence is the pause.
- Do not resume yet. Resuming with the cause unfixed trips the breaker again.

Do not go looking for the pause in run rows instead: `stopped_paused` is recorded for
INTERNAL EVENT triggers only and caps at 200 rows per pause window, and stranded WEBHOOK
deliveries produce no `stopped_paused` row at all, surfacing only through
`workflow_stranded_list` (node-rail.md 5.4).

### T3. Did it run at all?

```
workflow_runs_recent({ status: 'failed', since })   # account-wide, ALL workflows, default window ONE HOUR
workflow_runs_list({ workflow_id, status? })        # this workflow's history
```

Use `workflow_runs_recent` first when you are not certain which workflow is involved:
each entry carries `workflow_name`, `status`, `triggered_by`, `error_message`,
`started_at`, `completed_at`, `duration_ms`, so the broken workflow names itself. Widen
`since` deliberately: the default one-hour window shows nothing for an outage that
started yesterday, and nothing looks like health.

Runs exist and some failed rules out disabled and paused, go to T4. Runs exist and all
completed rules out the trigger entirely, go to T5, because the run is lying. No runs
rules out nothing yet: widen `since`, then T7.

**Zero runs is UNKNOWN, not healthy.** It is equally consistent with "nobody submitted
the form this week", "the workflow is paused", "the trigger is not wired", and "your
status filter is not in the vocabulary". Never report it as green.

### T4. Did runs fail, and how consistently?

```
workflow_run_summary({ workflow_id, since })
```

Returns counts by status, `success_rate` (0..1), latency percentiles (p50/p95/p99/mean),
up to 5 recent failures with `error_message`, and `last_succeeded_at` / `last_failed_at` /
`last_failed_run_id`. It caps at 1000 runs per window, so narrow `since` on a busy
workflow or you are quoting a truncated sample as the whole picture.

Read the SHAPE, not just the rate. Five consecutive failures then silence is a
circuit-breaker pause (back to T2). A steady 85% is a flaky dependency. A cliff on one
date is a change: `workflow_versions_list` and `audit_query` name what changed and who
changed it.

### T5. Did the steps degrade?

A run's top-level status can be `completed` while nothing the client cares about
happened. Open the run.

```
workflow_run_get({ workflow_id, run_id })   # step_states, the per-node truth
```

`degraded` is the single most common cause of "it says it worked but nothing happened".
A node with `on_error: 'continue'` that FAILS records as completed with a `degraded`
flag, plus `original_error` and `on_error_mode`, and the run finishes green. A run whose
every action step is degraded reports success and did nothing at all. Read `degraded` on
every step of a green run before telling anyone the workflow is fine, then decide
honestly whether `on_error: 'continue'` still belongs on that node: right for a
non-critical sibling leg, wrong the moment its failure is what the client pays for.

### T6. Did the templates resolve?

Still inside `step_states`, on every step:

```
step_states[nodeId].unresolved_templates
```

Every `{{...}}` that resolved to nothing with no `||` default is recorded there with its
template, source node id, path, and coercion (`empty_string` or `null`). An unresolved
expression is NOT an error: it is written through as the literal string or as a blank.
That is how `{{body.email}}` ends up stored as somebody's email address and how "Hi ,"
goes out to a client's list. A run can be `completed`, look perfect in every summary, and
still be why a customer replied "who is this?".

### T7. Is the trigger wired to the rail you think it is?

If there are no runs and no pause, the trigger never reached the engine.

```
workflow_triggers_list({ workflow_id })     # webhook / scheduled_trigger / database_trigger ROWS
workflow_trigger_get({ trigger_id })        # the exact config of one
workflow_get_schedule({ workflow_id })      # null == no scheduledTrigger NODE at all
project_crons_list({ project_id })          # the OTHER cron rail entirely
project_cron_logs({ ... })                  # status success|failure|timeout per execution
```

Four things this rules in or out:

- `workflow_get_schedule` returning `null` means there is no `scheduledTrigger` node. It
  does not mean the cron is fine.
- It also reports whether the WORKFLOW is enabled, because a disabled workflow's schedule
  does not fire no matter how good the cron.
- A cron belonging to a website project is invisible to every `workflow_*` tool and uses
  incompatible syntax. Diagnosing the wrong rail wastes the hour
  (`references/project-crons.md`).
- An internal event trigger is a graph NODE needing no `workflow_triggers` row, so an
  empty `workflow_triggers_list` is expected for those (`references/event-triggers.md`).

One cause outside the workflow rail entirely: "tickets are auto-replying and no workflow
explains it" is usually `helpdesk_automations_get` (auto_acknowledge, auto_assign, sla,
csat_survey, auto_close, team_notifications), read-only via Olympus. Flag it rather than
hunting for a workflow that does not exist.

### The ladder as a rule-out table

| Step | Answer | What it RULES OUT |
|---|---|---|
| T1 enabled | `is_enabled: true` | Nothing fires because it is switched off |
| T2 paused | no pause window | The silent-outage case, banked submissions |
| T3 ran | runs exist in window | Trigger delivery, wiring, wrong rail |
| T4 failed | failures present | "It is not even trying" |
| T5 degraded | no `degraded` steps | The green-run-that-did-nothing case |
| T6 templates | `unresolved_templates` empty | Blank merges and literal `{{...}}` sends |
| T7 trigger | trigger row / schedule correct | Wrong rail, missing node, UTC drift |

---

## Part 2: Green that is not green

Six specific ways a workflow reports success and is not working. Check each before you
tell a client their automation is healthy.

**1. The all-degraded run.** Every action step failed, every one had
`on_error: 'continue'`, the run is `completed`. Detection: `degraded` on the step, plus
`original_error`. See T5. This is the number one cause of "it says it worked".

**2. Unresolved templates written as literals.** No error, no failed step, a customer
receives a blank or the string `{{...}}`. Detection: `unresolved_templates` on a
persisted run, or `would_have` on a dry run. On a dry run, `workflow_run`'s own
description notes that `would_have` shows the RESOLVED values, with the raw templates
under `would_have._template` where they differ, so an empty resolved field next to a
`{{ref}}` is the bug made visible before it ships.

**3. An empty status filter.** **There is no `queued`, no `succeeded`, and no `error`**
in the run vocabulary (Part 3). Filtering on one of those returns an empty list that is
indistinguishable from a healthy quiet account. Two specific traps:
- `workflow_run_summary`'s aggregate response keys one of its counts `succeeded`. That
  is a RESPONSE FIELD, not a filter value. Do not echo it back as `status: 'succeeded'`.
- `stopped_circuit_breaker` is in the vocabulary but the engine never persists one.
  Filtering on it always returns empty, which is not evidence of health (node-rail.md
  5.3). A breaker pause looks like the failures that preceded it, plus silence.

**4. A zero-run window.** The easiest thing in the world to fold into a green weekly
summary. "No runs in window" is a finding, not a pass.

**5. A workflow disabled so it never fires.** Silent by construction: the client's mental
model is "the automation exists", and existence is not enablement. A workflow they
believe is scheduled, with `workflow_get_schedule` returning `null`, is the same class of
finding.

**6. A truncated sample presented as the whole.** A `success_rate` computed off a window
that hit the 1000-run cap is partial, and must be reported as partial (caps: Part 4).

And the one that survives every check above: **a dry run passing is not delivery.**
Downstream nodes in a dry run see `would_have` payloads and synthetic fields (a fake
`messageId` from a send). Structural correctness is testable; real delivery is not.

For delivery truth on email, `email_logs_list` returns per-message rows (to, subject,
status of queued/sent/delivered/bounced/complained, open and click counts, timestamps,
capped at 500). **Verify that this account's workflow sends actually appear there before
relying on it as a workflow's delivery check** - the registered description covers the
account's email send log and does not state which senders write into it.

---

## Part 3: Status vocabulary, and the trap under it

Two vocabularies, normalized in the builder's run-status module. Read them off the
surface the tools return; never hand-roll a comparison against a raw value.

**RunStatus:** `completed`, `failed`, `running`, `pending`, `waiting`, `cancelled`,
`stopped_loop_detected`, `stopped_rate_limit`, `stopped_circuit_breaker`,
`stopped_paused`, `unknown`.

**StepStatus:** `completed`, `degraded`, `failed`, `running`, `waiting`, `pending`,
`skipped`.

**The trap: the engine persists a failed STEP as `status: 'error'`, while the UI and
other consumers compare against `'failed'`.** A raw comparison against `'failed'` misses
real failures; a raw comparison against `'error'` misses whatever the normalized layer
already translated. Never string-compare a raw step status, and when counting failures
for a client report, count what `workflow_run_summary` returns rather than tallying step
strings yourself.

`degraded` is not a failure state in any count: the step failed, `on_error` was
`'continue'`, so the status is `completed` and the `degraded` flag carries the truth
alongside `original_error` and `on_error_mode`. Any health metric built on status alone
scores a fully degraded run as a success.

---

## Part 4: Reading a failed run properly

Three surfaces, in this order, each answering a different question.

**1. The run.** `workflow_run_get({ workflow_id, run_id })` (`workflow_run_status` is the
same payload under an older name) gives `status`, `input_data`, `output_data`,
`error_message`, `triggered_by`, `started_at`, `completed_at`, and `step_states`. Start
here, but do not stop at the run-level `error_message`: it often names a node downstream
of the real cause.

**2. The steps.** `step_states` is a per-node map. The keys that matter for reliability
(full table in node-rail.md 5.2):

| Key | Read it for |
|---|---|
| `status` | which node tripped (see the `error` versus `failed` trap above) |
| `input` | the exact context the node received. TRUNCATED for storage on large payloads |
| `output` | what it produced, plus `__dry_run` / `would_have` on a simulated node |
| `error`, `error_stack` | the message, and up to 4000 characters of stack |
| `retry_count`, `max_retries` | how many attempts were actually spent |
| `degraded`, `original_error`, `on_error_mode` | present when `on_error: 'continue'` soft-failed the node |
| `unresolved_templates` | every blank merge, with template, source node, path, coercion |
| `waiting_for` | present when the run parked on a wait node |
| `duration_ms` | timing; a simulated node reports 0 |
| `node_type`, `node_label` | a snapshot, so a later edit does not rewrite history |

**3. The logs.** `workflow_run_logs({ workflow_id, run_id, node_id?, level? })` is the
per-node lifecycle timeline (config, starting, handler invoked, retry, timeout,
completion, soft-fail), sorted by timestamp, with a `summary` of counts by level and by
node. Use it to answer "was this node even REACHED", to see retry attempts before a
final failure, and to confirm a soft-fail fired where you expected. Filter by `node_id`
when one node is the suspect and by `level: 'error'` on a long run.

**The caps, and what they mean for your conclusions.** Logs cap at 50 lines per node with
each message truncated to 500 characters, so a long log is not the whole story and a
short one is not proof of a short execution. `step_states.input` truncates on large
payloads, `error_stack` stops at 4000 characters, `workflow_run_summary` caps at 1000
runs, and a dry run persists NO run row at all, so `workflow_run_get`,
`workflow_run_logs`, and `workflow_runs_list` have nothing to fetch after a
`workflow_test` (node-rail.md 5.1). In every one of those cases the honest sentence is
"the evidence is capped here", not "nothing else happened". Handing off to a human:
`workflow_dashboard_url({ workflow_id })` returns the editor, runs-list, and latest-run
URLs.

---

## Part 5: Retries, timeouts, and duplicate sends

**Retries are exponential backoff with jitter.** Read `retry_count` and `max_retries` on
the step rather than assuming a policy: a node that failed on attempt 1 of 3 and a node
that exhausted 3 of 3 are different problems, and only the second one is a real outage.

**Retryable errors are matched by SUBSTRING against a pattern list, not by a real error
taxonomy.** So a genuinely transient error whose message does not happen to contain one
of those substrings is never retried, and a permanent error whose text happens to contain
one is retried to exhaustion for nothing. A failure that should retry and does not is a
pattern-list gap, not a mystery: escalate it as a finding rather than papering over it
with an `on_error: 'continue'` that hides it.

**Side-effecting nodes do NOT retry after a timeout, deliberately.** A timeout is a race,
not a cancellation: the send may well have landed on the far side, and retrying would
double-send. A timed-out send is genuinely ambiguous, and the resolution is at the
DESTINATION (the inbox, the CRM row, the Slack channel, `email_logs_list`), never a blind
re-run.

**Send-once idempotency is keyed on `(workflowId, nodeId, sendScope)` and is per-RUN.**
Within one run, that key prevents the same node sending twice to the same scope. **A
replay is a NEW run, so the idempotency key does not protect it.** Say that plainly to
anyone about to replay: replaying stranded submissions CAN duplicate a send that already
went out through some other path, and the only protection is the list review in Part 6.

---

## Part 6: Recovery, in order

The circuit breaker trips at **5 consecutive failures** and pauses the workflow. Paused
workflows reject triggers with **no run row written**, submissions received while paused
are recoverable, and nothing un-pauses automatically even after the bug is fixed. One
client's forms were down six days that way, with the cause fixed on day two, because
nobody resumed.

The path back, and every step has a guard:

1. **Diagnose.** `workflow_run_get` on the failing run to find the node that tripped
   (`workflow_runs_recent({ status: 'failed' })` finds the run if you do not have it).
2. **Fix.** `workflow_node_update` for a config error, `workflow_edge_add` /
   `workflow_edge_delete` for wiring. Or roll back: `workflow_versions_list` to find the
   good version by `change_summary`, `workflow_version_get` to preview it,
   `workflow_version_restore` to apply it (it snapshots the current definition first, so
   it is itself reversible; `version` is the monotonic integer, not the row uuid).
3. **Prove the fix.** `workflow_validate({ workflow_id })`, then
   `workflow_test({ workflow_id, input_data })`, then read `would_have` on every
   short-circuited node. **As of 2026-08-30 the dry-run gate holds at every dispatch
   site**, including side-effecting nodes inside a `parallelExecute` branch or a
   `transactionBlock` (previously those ran FOR REAL during a test), and AI/agent nodes
   are now mocked instead of spending real tokens and writing through their own tools.
   A dry run is therefore trustworthy for fan-out graphs too, which it was not before.
   node-rail.md 4.3 still lists `aiAgent` among the nodes that execute for real; that row
   is superseded. The metered DataForSEO reads and `delay` in that same table were NOT
   part of the change, so treat them as still live in a dry run unless verified.
4. **Resume.** `workflow_resume({ workflow_id })` clears the pause and resets the failure
   counter. It runs nothing by itself. It must come BEFORE replay: a replay against a
   still-paused workflow is refused with a 409 (and, if it were not, would simply strand
   the submissions again).
5. **Review what is banked.** `workflow_stranded_list({ workflow_id })`, read-only. GET
   shows exactly what POST would run.
6. **Show the operator the LIST, not the count, and get an explicit yes.** Names and
   dates. This is the step that catches the replay that should not happen.
7. **Replay in bounded batches.** `workflow_stranded_replay({ workflow_id, confirm: true })`.
   `confirm: true` is required (400 without it). It is **capped at 25 per call and
   silently clamped**, so a 60-submission backlog is three calls. Each row is stamped as
   it goes, so a mid-batch death is resumable rather than a re-send of the whole batch.
   Pass `trigger_run_ids` to replay a chosen subset.
8. **Verify the drain.** Re-run `workflow_stranded_list`. Never report a backlog as
   drained after one call.

**Replay sends real notifications through the workflow's CURRENT definition**, and these
submissions can be days old. Replaying a six-day outage emails a week of people about a
form they filled in last Tuesday. Say that to the operator in those words before you
send.

**What is NOT safe to bulk-replay.** Default to a `trigger_run_ids` subset of the most
recent, and never bulk-replay:
- anything that MOVES MONEY or writes a ledger row (payments, invoices, refunds); the
  per-run idempotency key does not span a replay.
- time-bound messages whose moment has passed: appointment reminders, day-of notices,
  expiring offers.
- anything a human already handled out of band during the outage. That is most of a long
  outage's backlog, and the client's inbox is the evidence, not the run history.
- enrollments and campaign starts, which re-enter people into a cadence they may have
  already finished or opted out of.
- SMS, where a duplicate is a compliance problem as well as an annoyance.

"Just resume it and replay everything right now, skip the review" gets the strict order
above, not obedience. There is no skip-the-list path, and re-POSTing the stored payloads
at the live webhook yourself to dodge the confirm gate is the same send without the
bookkeeping.

---

## Part 7: Scheduled automations, the checks specific to cron

Schedules are **cron only**, 5-field. There are no interval schedules. Four reliability
facts:

- **Timezone is an IANA name and defaults to UTC.** The classic bug is a 9am Monday
  report landing at 2am in Denver. Pass `timezone` explicitly every time, and check it on
  every existing schedule in a health pass. This is the most common "the automation is
  broken" report that is really a configuration default.
- **The cron shape is validated, the MEANING is not.** A valid-shaped nonsense expression
  is accepted and fires on a schedule nobody intended. Read `next_run_at` back from
  `workflow_get_schedule` and sanity-check it against what the client expects, in their
  timezone. That readback is the only semantic check you get.
- **A backlog collapses to a single fire.** Catch-up semantics mean a paused-then-resumed
  schedule does not stampede the missed occurrences, and also that a week of downtime
  produces one run, not seven. Do not promise the missed reports will arrive.
- **A disabled workflow's schedule does not fire**, and `workflow_get_schedule` reports
  the enabled state alongside `next_run_at` so you catch that in one call.

To stop a schedule firing, use `workflow_disable` (or `workflow_set_schedule` with a
`cron_expression` and `enabled: false`, since `cron_expression` is required and a call
passing only `enabled: false` is rejected). `workflow_delete_schedule` REMOVES the
`scheduledTrigger` node and cascades its edges, orphaning whatever ran downstream.

---

## Part 8: The proactive health pass

Weekly, per retainer account, read-only until the last step. This is the work that turns
"nobody noticed for six days" into "we caught it Tuesday".

| # | Call | Healthy answer |
|---|---|---|
| 1 | `workflow_list({ enabled: true })` | The enabled set matches what the client believes is running. Anything they think is on and is not is a finding today. |
| 2 | `workflow_runs_recent({ status: 'failed', since: <7d> })` | Empty, or failures you can each name a cause for. Not "empty because the filter was wrong". |
| 3 | `workflow_run_summary({ workflow_id, since })` per enabled retainer automation | `success_rate` at or near its own prior-window baseline, p95 latency stable, `last_succeeded_at` recent. Narrow `since` if the window hits the 1000-run cap. |
| 4 | `workflow_run_get` on each `last_failed_run_id`, and on one recent GREEN run per workflow | No `degraded` steps, `unresolved_templates` empty. The green-run spot check is the part everyone skips and it is where the blank merges live. |
| 5 | `workflow_get_schedule` on every scheduled automation | Non-null, workflow enabled, `next_run_at` correct in the CLIENT's timezone. A null schedule on a workflow the client believes is scheduled is a finding, not a skip. |
| 6 | `workflow_stranded_list` on anything paused or recently failing | Zero. A non-zero count is a lead count and goes to the top of the report. |
| 7 | `agent_inbox_list` | The open queue (default `new,seen`) worked, not just read. Apply what should be applied through its own surface, THEN `agent_inbox_resolve`; resolving never executes the item. |
| 8 | `project_crons_list` / `project_cron_logs` where the client has project crons | No `failure` or `timeout` rows accumulating on the other rail. |

Then write it down: durable decisions (why an automation is deliberately disabled, who
the correct recipient is, which template a client is on) to `memory_create`, work items
to `pm_tasks_create`. A finding that lives only in a chat transcript gets re-derived from
scratch next month.

**Reporting rules for the pass.** Disclose the window and which workflows were covered or
excluded. A zero-run workflow is "no runs in window", never a green line. A summary that
hit the 1000-run cap is partial. Compare each workflow against ITS OWN prior window,
never against a different workflow with different triggers and volumes. If you could not
check something, name it.

---

## Part 9: The rules

**Always**

- Rule out the measurement artifact before the causal story. A wrong status filter, a
  disabled workflow, a paused workflow, the wrong cron rail, and a UTC schedule read as
  local all mimic an outage perfectly.
- Read `degraded` and `unresolved_templates` on a GREEN run before calling it correct.
- Widen `since` deliberately. `workflow_runs_recent` defaults to one hour.
- Fix before resume, resume before replay, and show the operator the stranded LIST with
  dates (never a count) before any replay.
- Replay in batches of 25 or fewer, then re-list to confirm the drain.
- State the caps when you quote evidence: 50 log lines per node, 500 characters per
  message, 1000 runs per summary window, 200 `stopped_paused` rows per pause window.
- Say "unknown" when the evidence is absent. Zero runs, empty filters, and capped windows
  are unknown.

**Never**

- Never string-compare a raw step status. The engine persists a failed step as `error`
  while consumers compare against `failed`; read the normalized surface.
- Never filter on `queued`, `succeeded`, or `error`, and never read an empty
  `stopped_circuit_breaker` filter as evidence of no breaker trips (the engine never
  persists that status). All of these return an empty list that looks like health.
- Never re-run a side-effecting node after a TIMEOUT to "see if it works". The send may
  have landed; verify at the destination.
- Never assume idempotency protects a replay. The send-once key is per-run, and a replay
  is a new run.
- Never bulk-replay money writes, time-bound messages, enrollments, SMS, or anything a
  human already handled during the outage.
- Never set `on_error: 'continue'` on a node whose failure is the point of the workflow.
  It converts a loud failure into a quiet one, the exact failure mode this file exists to
  catch.
- Never resume a workflow whose cause is unfixed. The breaker trips again, and the second
  outage costs more trust than the first.
- Never report a client's automations as healthy on the strength of a window in which
  nothing ran.
