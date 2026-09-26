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
run-history tool from a workflow nobody triggered. Its webhook URLs still take posts
(authentication is still checked first): each one gets 200 "Workflow disabled", the
submission is recorded in the Forms ledger (`workflow_status` `trigger_disabled`) and gets
the usual new-submission email, and the workflow does not run, so a sender gets no Respond
node body and no `data.output`. What else switching it off stops:

- `workflow_run_retry` on a run one of its triggers started (a webhook, a website visitor, a
  schedule, a database change, an internal event, or a retry of one of those) is refused
  with 409 `workflow_disabled` and runs nothing (if it races a switch-off, a retry row may be
  left `cancelled`). The hourly retry sweep skips a
  switched-off workflow. A retry of a run a person or an agent started still runs (as a
  replay).
- A run one of its triggers started that is waiting at a wait or approval step is cancelled
  when the wait resolves, instead of continuing.
- The dashboard's Resume on a paused, switched-off workflow replays none of the runs the pause
  blocked; they stay as they are.
- It does NOT stop a person or an agent: `workflow_test` still dry-runs it, and
  `workflow_run_replay`, `workflow_stranded_replay` and `workflow_dead_letter_resolve`
  (action `'replay'`) still run it for real, so a replay needs the same yes on a
  switched-off workflow as on a live one (a real `workflow_run` is refused with 400 until it
  is enabled). Switching it back on replays nothing that arrived while it was off.
- Those deliveries are leads, and they are only in the Forms ledger: the receiver answers
  before the trigger pipeline, so there is no `trigger_runs` row and `workflow_stranded_list`
  and `workflow_stranded_replay` do not see them. The exception is a delivery that raced the
  switch-off: it leaves a `trigger_runs` row closed as `completed` with
  `agent_response.skipped`, and when that row falls inside the stranded window (after the
  pause, or after the last failed run) `workflow_stranded_list` lists it and
  `workflow_stranded_replay` runs it. So a stranded count is not a count of what arrived while
  the workflow was off. `marketing_form_conversion_audit` (scoped with `project_id` or
  `form_key`) lists them as rows with `workflow_status` `trigger_disabled` (a raced one too):
  `bucket: "workflow_failed"` narrows to them, together with rows whose `workflow_status` is
  `error`, `degraded`, `trigger_missing` or `auth_failed`; `include_fields: true` adds field
  names and a masked contact preview, never the values; and the window is 30 days unless
  `days` (or `from` and `to`) covers the whole time it was off. `trigger_disabled` alone does
  not mean a switched-off workflow: a delivery to a switched-off trigger, and a form run
  queued while the workflow was paused, carry it too, so match `submitted_at` against when it
  was off. No tool replays them: to run one, the owner reads it in the Forms tab, and one real
  `workflow_run` with that body as `input_data`, on their yes, runs it once. Count them in
  the report before anyone switches the workflow back on.

What the flag tells you:

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
workflow_stranded_list({ workflow_id })    # read-only: pause window, count, payload KEYS only (no values)
```

- A pause window with a count is proof of a pause, and the count is a LEAD count. Those
  submissions are invisible, not lost.
- On a scheduled, database or internal-event workflow, a run history that simply STOPS on
  a date, with the last few runs failing and nothing after, is the fingerprint. The
  failures caused the pause; the silence is the pause.
- A failed webhook or website-visitor delivery never pauses its workflow (Part 6). If
  one is paused, read `paused_reason` and `paused_at` on `workflow_get`: `manual` is a
  person, `cascade_loop` the loop guard, `ai_budget` the daily AI budget, and
  `circuit_breaker` five failures in a row ending in a run of a pausing origin (a
  schedule, an internal event, or a retry of one of those), or a pause from before webhook
  failures stopped pausing workflows. Find out who and why before you resume.
- Do not resume yet. Resuming with the cause unfixed fails again, and on a scheduled or
  event workflow trips the breaker again.

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

Read the SHAPE, not just the rate. Five consecutive failures then silence, on a scheduled,
database or event workflow, is a circuit-breaker pause (back to T2); a webhook workflow
never goes silent that way, it keeps failing. A steady 85% is a flaky dependency. A cliff
on one date is a change: `workflow_versions_list` and `audit_query` name what changed and
who changed it.

**Is the failure still current?** Each recent failure carries `predates_current_definition`,
and the summary carries `last_failed_run_predates_current_definition`, `definition_changed_at`
and `current_setup`. `true` means the run started before the workflow last changed
(`definition_changed_at` is the newest version that changed the graph, an edit or a restore;
turning failure alerts on or off does not count): someone may already have fixed it.
`current_setup` is `{ state, errors, first_issue }` for the definition as it is NOW, the same
verdict `workflow_validate` gives.
A stale failure beside a `current_setup.state` of `ok` is a question for a dry run
(`workflow_test`), not a diagnosis to report; a stale failure beside `needs_setup` names
what is broken today in `first_issue`.

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

An `aiAgent` with a `responseSchema` is the case to know. A reply that still misses the
schema after its one repair attempt FAILS the node ("did not match responseSchema"); with
`on_error: 'continue'` it records as degraded with `schema_valid: false` and
`schema_errors` in its output, and its fields are not spread, so downstream `{{ai.key}}`
references show up as misses. A graph that uses the AI output should branch on
`{{ai.schema_valid}}` rather than run on regardless. On a passing node, read the step's
`warnings` for keys the schema stripped or values it coerced.

### T6. Did the templates resolve?

Still inside the run:

```
workflow_run_get -> unresolved_template_count, unresolved_template_nodes
step_states[nodeId].unresolved_templates
workflow_run_summary -> template_misses        # across the latest 200 runs
```

Every `{{...}}` that resolved to nothing with no `||` default is recorded there with its
template, source node id, path, coercion (`empty_string`, `null` or `literal`) and, for
`{{ref | x}}` / `{{ref or x}}`, a `hint` (neither is a fallback; write `||`). An unresolved
expression is NOT an error: a well-formed reference is written through as a blank (`''` in
text, null as a whole field), and only a malformed fallback or a token the engine grammar
cannot parse goes out as literal text. That is how "Hi ," goes out to a client's list and a
contact is created with no email. A run can be `completed`, look perfect in every summary,
and still be why a customer replied "who is this?".

How to read it without walking every step:

- Read `unresolved_templates_recorded` first. `true`: every step was checked and carries
  the key, and `[]` means checked, nothing missed. `'partial'`: the run started after
  2026-08-08T17:36:39Z, but an older engine wrote some steps (`parallelExecute` /
  `transactionBlock` inner steps, simulated, waiting or throwing ones) without checking
  them; those steps have no key, and `unresolved_template_count` is a lower bound (null when
  it is 0). `false`: the run predates recording, absence proves nothing, and the count is
  null. So a 0 always means checked, none.
- `workflow_runs_list` gives `unresolved_templates_recorded` and `unresolved_template_count`
  per run, and `workflow_run_summary`'s `template_misses` gives `runs_with_misses`,
  `total_misses`, `last_run_id_with_misses` and the top nodes for the window, with
  `runs_checked` (every step checked) and `runs_partially_checked` (the rest) beside them.
- A reference that EXISTS but is blank is not a miss and is never listed. Guard it with a
  `||` default; a dry run shows it as `empty` in `template_values`. The default is plain
  text, never another field (`{{a || trigger.output.payload.name}}` sends those words):
  `workflow_validate` warns `fallback_default_is_literal` on one that reads like a reference.
- Test runs record misses too, in the `workflow_test` response. A miss flagged
  `source_simulated` came from a simulated upstream node and is expected there.

### T7. Is the trigger wired to the rail you think it is?

If there are no runs and no pause, the trigger never reached the engine.

```
workflow_triggers_list({ workflow_id })     # webhook / scheduled_trigger / database_trigger ROWS
workflow_trigger_get({ trigger_id })        # one row: canonical filter_config (secrets redacted), http_method, authentication, webhook_url
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

Two webhook-row causes of "no runs" on an enabled workflow. A row with `is_enabled: false`
answers the sender 200 "Trigger disabled" and records the submission, but runs nothing;
deleting a webhook trigger node disarms its row that way, so a graph that lost its webhook
node goes quiet without an error. And a sender posting to an old URL after a rename gets
404: compare the URL the sender uses with the row's `webhook_url`, never with a URL built
from the node's label.

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
| T6 templates | `unresolved_template_count` 0 on a recorded run | Missing references and malformed fallbacks. Not a field that exists but is blank, and not a token the grammar cannot parse: a dry run's `template_values` catches those |
| T7 trigger | trigger row / schedule correct | Wrong rail, missing node, UTC drift |

---

## Part 2: Green that is not green

Seven specific ways a workflow reports success and is not working. Check each before you
tell a client their automation is healthy.

**1. The all-degraded run.** Every action step failed, every one had
`on_error: 'continue'`, the run is `completed`. Detection: `degraded` on the step, plus
`original_error`. See T5. This is the number one cause of "it says it worked".

**2. Blank merges.** No error, no failed step, a customer receives a blank (or, from a
malformed `|` / `or` fallback, the token text). Detection: `unresolved_template_count` and
`unresolved_templates` on a persisted run, `template_misses` on the summary, and on a dry run
`data.step_states[<nodeId>].template_values`, which lists every `{{token}}` with what it
resolved to. Read its `status`: `missed` and `literal` are the bug; `empty` is the reference
that exists but is blank, the "Hi ," case, which no miss list shows and a `||` default
fixes. `would_have` beside it shows the RESOLVED config, with the raw templates under
`would_have._template` where they differ, so an empty resolved field next to a `{{ref}}` is
the bug made visible before it ships.

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

**7. A switched-on workflow with nothing connected.** Its runs complete at 100% and do
nothing: every step sits unreachable from the trigger, or there is no step after it.
Detection: `setup.state` on `workflow_list` / `workflow_get` (or `setup_state` from
`workflow_validate`) reads `does_nothing` or `empty`, and `live_warning` says so in a
sentence. One workflow logged 305 "completed" runs this way.

And the one that survives every check above: **a dry run passing is not delivery.**
Downstream nodes in a dry run see `would_have` payloads and a synthetic `id`, never what a
real send returns. Structural correctness is testable; real delivery is not. And a dry run
from before the 2026-09 fix stopped at the first simulated node, so it proved nothing past
it: re-run it.

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
of the real cause. It also gives `predates_current_definition`, `definition_changed_at`
and `current_setup` (T4): a run from before the last change describes a graph that may no
longer exist.

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
| `unresolved_templates` | each missing reference or malformed fallback, with template, source node, path, coercion, `hint?`; `[]` = checked, none. An unchecked step of a `'partial'` run has no key |
| `warnings` | non-fatal notes, e.g. keys an `aiAgent` `responseSchema` stripped or values it coerced |
| `waiting_for` | present when the run parked on a wait node. A real `workflow_run` that parks answers 202 `status: 'waiting'` with its `run_id`: poll or resolve it, never re-run it |
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
runs (its `template_misses` at the latest 200), and a dry run persists NO run row at all,
so `workflow_run_get`, `workflow_run_logs`, and `workflow_runs_list` have nothing to fetch
after a `workflow_test`: its evidence is the response's `data.step_states`, `not_reached`
and `unresolved_templates`, and that report has its own 64 KB budget (`report_truncated`
names what was compacted; node-rail.md 5.1). In every one of those cases the honest sentence is
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

**A real send that errors may still have run, and the proxy re-sends only a 429.** The
Hiveku proxy sends `workflow_trigger_update`, a real `workflow_run`, `workflow_run_retry`,
`workflow_run_replay`, `workflow_stranded_replay` and `workflow_dead_letter_resolve` once
and never re-sends them on its own after a failure that can follow work: a 502, 503 or 504,
a timeout or a dropped connection comes back as it is, and the request may have landed
before it failed. Check what landed before you call again: `workflow_runs_list` (newest
first) for the run, retry or replay it may have started, `workflow_stranded_list` for the
batch it may have drained, `workflow_triggers_list` for the trigger,
`workflow_dead_letters_list` (status `'all'`) for the dead letter. A 429 is different: it is
a rate-limit refusal answered before any work, so the proxy waits (the response's
`Retry-After`, capped at 10 seconds, or a short backoff without one) and re-sends it, 3
attempts in all. A 429 that still comes back means nothing ran and nothing changed (its hint
says so): wait, then send the same call again. A rotation (`rotate_webhook_path: true`) is
the sharpest case of the first kind: a second call mints another URL and kills the one the
first call made live.

---

## Part 6: Recovery, in order

**What a failure does depends on what started the run** (the run's `triggered_by`):

| Started by | `triggered_by` | Counts (`consecutive_failures`) | Pauses at 5 in a row | Failure alert (`notify_on_failure`) |
|---|---|---|---|---|
| A webhook delivery, a website visitor (or a trigger row of unknown type), or a retry of one of those | `webhook`, `new_site_visitor`, `trigger_event` | yes | **never** | yes |
| A schedule, a database change, an internal event, or a retry of one of those | `scheduled`, `database_trigger`, `form_submitted`, `crm_event` and the other `*_event` labels, `retry`, ... | yes | yes | yes |
| A person or an agent, or a retry of their run | `manual`, `test`, `manual_test`, `webhook_test`, `replay`, `olympus_agent`, `olympus_agent_async` | no | no | no |

`olympus_agent` / `olympus_agent_async` are `workflow_run` (sync and `fire_and_forget`); a
`workflow_test` writes no run at all. A completed real run of any origin resets the counter
(a dry run never touches it). A retry takes the origin of the run it retries, whoever asked
for it (`workflow_run_retry`, or the hourly retry sweep): a retried webhook or visitor run
keeps its label and never pauses, a retried run a person or an agent started is recorded as
`replay`, and only a retry of a schedule, database or event run is recorded as `retry` and
can pause. The sweep is not a safety net: it only picks up a failed run from the last 24
hours whose trigger data already carries a `retry_count`, and the engine stores every run's
input there instead, so in practice it only retries a run somebody already retried by hand.
Never promise an operator that a failed run will be retried on its own. On a switched-off
workflow a retry of a run its triggers started is refused with 409 `workflow_disabled` (T1),
and the sweep skips the workflow. The failure alert is opt-in:
`workflow_update({ workflow_id, settings: { notify_on_failure: true } })`, or the owner's
failure-alerts switch in the workflow editor's gear menu ("Email admins when a triggered run
fails"). It emails the account admins and raises one
inbox item per incident, not per failed run, and it survives dashboard saves and version
restores. For a webhook lead form it is the only alert the client gets: the workflow keeps
running (and failing) on every submission, and nothing pauses to make the outage visible.

The circuit breaker trips at **5 consecutive failures** on the rows marked above and
pauses the workflow. A workflow can also be paused by hand in the dashboard, by the loop
guard, or by its daily AI budget. Paused workflows reject triggers with **no run row
written**, submissions received while paused are recoverable, and nothing un-pauses
automatically even after the bug is fixed. One client's forms were down six days that way,
with the cause fixed on day two, because nobody resumed (that was before webhook failures
stopped pausing a workflow; any pause strands deliveries the same way).

The path back, and every step has a guard:

1. **Diagnose.** `workflow_run_get` on the failing run to find the node that tripped
   (`workflow_runs_recent({ status: 'failed' })` finds the run if you do not have it).
2. **Fix.** `workflow_node_update` for a config error, `workflow_edge_add` /
   `workflow_edge_delete` for wiring. Or roll back: `workflow_versions_list` to find the
   good version by `change_summary`, `workflow_version_get` to preview it,
   `workflow_version_restore` to apply it (it snapshots the current definition first, so
   it is itself reversible; `version` is the monotonic integer, not the row uuid). A
   restore keeps every live webhook URL, but a webhook node whose trigger was deleted
   since comes back on a NEW URL: read `webhook_trigger_warnings` and re-point its
   senders.
3. **Prove the fix.** `workflow_validate({ workflow_id })`, then
   `workflow_test({ workflow_id, input_data })`, then read the response's
   `data.step_states`: `template_values` and `output.would_have` on every simulated node,
   `error` on any node that failed, and `data.not_reached` for a branch or leg that never
   ran. A test runs the whole graph, so the node you fixed is covered even when it sits
   after a simulated send. **The dry-run gate holds at every dispatch site**, including
   side-effecting nodes inside a `parallelExecute` branch or a `transactionBlock`, and
   AI/agent nodes are mocked instead of spending real tokens and writing through their
   own tools; the metered DataForSEO reads return placeholder data, `delay` does not
   sleep, and a code node's `fetch` is never sent (node-rail.md 4.1, 4.3). If the fix was
   a missing field (a `slackNotification` with no `webhookUrl`, say), `workflow_validate`
   and `workflow_enable` now name it too: enabling a disabled workflow with a validate
   error on a node a run can reach is refused with 422 `workflow_invalid`. And the test
   itself fails on it: a side-effecting node whose required config is missing, or resolves
   to nothing in this test, errors with the real run's message (`Slack webhook URL is
   required`) instead of returning a mock. A value the test cannot know (read from a
   simulated upstream node, or an `{{env.*}}` value, which `workflow_test` does not load)
   still gets the mock, so a green test proves every required value the test could see
   was there, not the ones it could not. On a webhook workflow, pass the request BODY as
   `input_data`: the test wraps it the way a real delivery arrives
   (`trigger.output.payload`), so a `{{trigger.output.email}}` that misses on real traffic
   misses in the test too.
4. **Resume.** `workflow_resume({ workflow_id })` clears the pause and resets the failure
   counter. It runs nothing by itself (the dashboard's Resume replays the runs the guards
   stopped, the `stopped_*` rows, unless the workflow is switched off (T1), but never
   stranded webhook deliveries: those come back only through steps 5 to 7). It must come
   BEFORE replay: a replay against a still-paused workflow is refused with a 409 (and, if it
   were not, would simply strand the submissions again).
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
| 1 | `workflow_list({ enabled: 'true' })` | The enabled set matches what the client believes is running. Anything they think is on and is not is a finding today. Every row's `setup.state` is `ok`: a switched-on `needs_setup` fails on its next trigger, `does_nothing` / `empty` completes and does nothing, and nothing switches either off (`needs_setup: 'true'` lists only those; `setup: null` is unknown). |
| 2 | `workflow_runs_recent({ status: 'failed', since: <7d> })` | Empty, or failures you can each name a cause for. Not "empty because the filter was wrong". |
| 3 | `workflow_run_summary({ workflow_id, since })` per enabled retainer automation | `success_rate` at or near its own prior-window baseline, p95 latency stable, `last_succeeded_at` recent, `template_misses.runs_with_misses` 0 (null means the stats query failed: unknown, not clean). Narrow `since` if the window hits the 1000-run cap. |
| 4 | `workflow_run_get` on each `last_failed_run_id`, on `template_misses.last_run_id_with_misses`, and on one recent GREEN run per workflow | No `degraded` steps, `unresolved_template_count` 0 with `unresolved_templates_recorded: true` (`'partial'` gives only a lower bound, so a clean one is not proof). The green-run spot check is the part everyone skips and it is where the silent failures live. |
| 5 | `workflow_get_schedule` on every scheduled automation | Non-null, workflow enabled, `next_run_at` correct in the CLIENT's timezone. A null schedule on a workflow the client believes is scheduled is a finding, not a skip. |
| 6 | `workflow_stranded_list` on anything paused or recently failing | Zero. A non-zero count is a lead count and goes to the top of the report. |
| 7 | `agent_inbox_list` | The open queue (default `new,seen`) worked, not just read. Apply what should be applied through its own surface, THEN `agent_inbox_resolve`; resolving never executes the item. The setup sweep's own notices (`metadata.dedup_key` `workflow-setup:<workflow id>` or `webhook-auth-public:<trigger id>`) close themselves within the hour once the cause is fixed: fix the cause and leave them (`/hiveku:automation-sweep` step 8). |
| 8 | `project_crons_list` / `project_cron_logs` where the client has project crons | No `failure` or `timeout` rows accumulating on the other rail. |
| 9 | `workflow_get` on every customer-facing automation | `definition.settings.notify_on_failure` is `true`, above all on webhook lead forms, which never pause and so never announce an outage any other way. Off is a proposal (`workflow_update({ workflow_id, settings: { notify_on_failure: true } })` on the operator's yes), not a fix you make from the pass. |
| 10 | `workflow_triggers_list` on every workflow with a public webhook | No live, public (`authentication: 'none'`) row reads `webhook_path_strength: 'guessable'`. One that does is a proposal to rotate (`/hiveku:automation-sweep` step 7), never a rotation made from the pass. |

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
- Read `degraded` and the blank-merge count (`unresolved_template_count` on the run,
  `template_misses` on the summary) on a GREEN run before calling it correct. `[]` on a
  recorded step is clean; `unresolved_templates_recorded: false` is unknown, and
  `'partial'` is a lower bound.
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
- Never resume a workflow whose cause is unfixed. It fails again (a scheduled or event
  workflow trips the breaker again), and the second outage costs more trust than the first.
- Never chase a failure without reading `predates_current_definition` first. A run from
  before the last change may describe a graph that no longer exists.
- Never report a client's automations as healthy on the strength of a window in which
  nothing ran.
