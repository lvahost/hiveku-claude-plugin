---
name: hiveku-automation-agency
description: Operator manual for building, testing, scheduling, debugging, and rolling back Hiveku workflows (automations). Use for ANY automation work - "automate this", "when X happens do Y", build or edit a workflow, wire a form to a notification or CRM write, an internal event trigger (deal stage changed, ticket assigned, invoice paid, Shopify order, PM task moved, call completed), a recurring cron job or weekly client report, a project scheduled function (EventBridge Lambda cron), "the automation stopped running", "my cron never fired", a failed or stranded workflow run, replaying submissions that piled up while a workflow was paused, working the approval inbox that installed automations stage into, and installing the shipped workflow templates instead of running a play by hand every week. ALSO load this file BEFORE acting on any risky automation request - "delete the old workflows", "clean up all the test automations", "just enable it, skip the dry run", "resume it and replay everything now", "turn on auto_apply so it stops asking", "test it with a real send" - the refusal rules and the safe alternatives live here.
---

# Hiveku Automation Agency

You are editing live automations in a CLIENT's account. A workflow that fires sends
real email, writes real CRM rows, and posts to the client's real Slack. Every rule
below exists because the alternative is a customer getting an email you did not
intend. Build incrementally, validate, enable deliberately, dry-run, then run. In
that order.

## Operating principles

- `account_context_get({ domain: 'workflow' })` FIRST, before you design anything.
  It returns persona, brand voice, domain memory, and rules - which forms are the
  money forms, who gets notified, which automations the client already asked you not
  to touch. `workflow` is a valid domain for this tool.
- Generative or strategic work (designing an automation from a business goal,
  drafting the notification copy) -> `talk_to_department({ domain: 'workflow', message })`,
  then PERSIST with the granular tools below. Pure CRUD and reads -> direct tools.
- **Never guess a node `type` string or a `{{...}}` expression.** The discovery
  tools in the next section exist precisely so you do not have to - skipping them is
  the single most common cause of a broken workflow.
- **Build incrementally, not in one blob.** `workflow_node_add` / `workflow_edge_add`
  are the intended path: server-assigned ids, per-change validation, one version
  snapshot per change with its own `change_summary`. `workflow_update({ definition })`
  REPLACES the entire graph in one coarse snapshot - pass a whole `definition` only
  when you already have a known-good graph (from `workflow_version_get` or
  `workflow_duplicate`).
- **Create disabled; enable after validate, BEFORE the dry-run.** `workflow_create`
  defaults `is_enabled: false` - leave it false through the build. The run route
  checks `is_enabled` before it reads `test_mode` (400 "Workflow is disabled. Enable
  it first"), so a disabled workflow cannot be dry-run either: validate,
  `workflow_enable`, `workflow_test`, in that order. Enabling a `manualTrigger`-only
  graph is inert (no listener exists); enabling a graph with a `webhookTrigger` or
  `scheduledTrigger` makes it LIVE, so for those get the operator's approval of the
  automation itself first - never enable merely to satisfy the run gate.
- Confirm every write that can reach a customer: `workflow_enable` (on a webhook or
  scheduled graph), `workflow_run` (real mode), `workflow_stranded_replay`,
  `workflow_delete`, `workflow_delete_schedule`, `agent_approval_approve`. Reading,
  listing, validating and `workflow_test` are free and safe.
- Durable decisions (which template a client is on, who the recipient is, why an
  automation is deliberately disabled) -> `memory_create`. Work items ->
  `pm_tasks_create`.
- An 8-character dashboard id -> `workflow_resolve_short_id` (404 no match, 409 +
  `candidates[]` when ambiguous - pass more characters). Human handoff ->
  `workflow_dashboard_url` (editor, runs-list, latest-run URLs).

## The three prerequisites (call these before you build)

| Tool | Why it is mandatory |
|---|---|
| `workflow_node_types_list` | The only way to know which node `type` strings the engine accepts. Returns the full catalog (400+ types) with per-type `data` fields (required ones marked) and outgoing-handle shapes. The set moves per deploy - read the catalog, never a type string or a count from memory. |
| `workflow_templating_syntax` | The `{{...}}` reference: what the executor resolves at run time, what `trigger.output.payload` / `headers` / `query` contain, upstream-node references, and the `{mode, value}` field modes `sendEmail` uses. Read it BEFORE you write any interpolated value. |
| `workflow_validate({ workflow_id })` | Server-side structural check after every batch of edits. Errors: unknown node types, missing required fields, dangling edges, duplicate ids, no trigger. Warnings: orphan nodes, multiple triggers (**only the first fires**), self-loops, invalid source handles. |

Two more discovery tools, and the split between them matters:
`workflow_event_trigger_types_list` returns trigger NODES that fire on something
happening INSIDE Hiveku ("when a deal changes stage") - an event trigger needs no
`workflow_triggers` row, it is a graph node and nothing else; always call the tool
rather than trusting a list in a file, and read the chosen entry's
`output_shape_keys` before writing any template (domain map and trigger-row
mechanics: `references/event-triggers.md`). `workflow_trigger_types_list` returns
infrastructure triggers - `workflow_triggers` table ROWS (`webhook`,
`scheduled_trigger`, `database_trigger`) and the config keys each reads; call it
before `workflow_trigger_create`, because **config is otherwise untyped and unknown
keys are silently ignored**.

## The build loop (canonical, in order)

1. **Context.** `account_context_get({ domain: 'workflow' })`. Then `workflow_list` -
   `workflow_clone` / `workflow_duplicate` beats rebuilding something close.
2. **Pick the trigger.** Internal event -> `workflow_event_trigger_types_list`.
   Inbound HTTP -> `webhookTrigger` plus a `workflow_triggers` row. Cron -> the
   scheduling section. Read the entry's `output_shape_keys`.
3. **Pick the action nodes.** `workflow_node_types_list`, read each type's `fields[]`.
4. **Read the templating reference.** `workflow_templating_syntax`.
5. **Create the shell.** `workflow_create({ name, description })`. Do NOT pass
   `is_enabled` - the default false is what you want.
6. **Add nodes one at a time.** `workflow_node_add({ workflow_id, type, data, position? })`.
   Exactly ONE trigger-category node per workflow. Ids come back as `<type>_<8hex>`.
7. **Connect them.** `workflow_edge_add({ workflow_id, source, target, sourceHandle? })`.
   Leave `sourceHandle` empty for most nodes (defaults to `output`); it is REQUIRED
   for two: `conditional` sources use `'true'` / `'false'`, `switch` sources use a
   `handleId` from `switchConfig.cases`.
8. **Validate.** `workflow_validate({ workflow_id })`. Fix every error and read every
   warning. An orphan node warning usually means you forgot an edge.
9. **Enable.** `workflow_enable({ workflow_id })` - required before the dry-run, per
   the operating principle above (webhook/scheduled graphs go LIVE here: operator's
   yes first).
10. **Dry-run.** `workflow_test({ workflow_id, input_data })`. See the next section.
11. **Real run / leave live, on approval.** `workflow_run` for a one-shot; for an
    always-on automation, confirm with the operator that it stays enabled.

Repairing an existing workflow is the same loop from step 3, with
`workflow_node_update`: `data` is SHALLOW-merged, so you patch one key without
resending the node (`null` clears a key), and every call snapshots the prior version.

**Runs spend real allowances.** A real run debits the run quota (100/month included,
then $0.01/run billed in arrears - or refused - per the overage switch), and the
plan's active-automation cap counts ENABLED workflows, enforced only on the client's
dashboard route: a workflow you leave switched on blocks the CLIENT's next create.
Dry runs are free. Detail: `references/node-rail.md` Part 7.

## `workflow_test` is not optional

`workflow_test({ workflow_id, input_data })` is `workflow_run` with
`test_mode: true`, pinned server-side so you cannot forget it - and the only honest
way to check a client's automation before it can reach their customers.

**What it skips** (no real side effect fires): outbound email/SMS/Slack/Discord,
every CRM write, external HTTP `apiCall` (mocked), helpdesk creates and replies, PM
task writes, database writes, deploys and GitHub pushes, project file saves. **What
still runs** for fidelity: data transforms, array ops, flow control, template
resolution, and the trigger node itself against your `input_data`. Some read-shaped
nodes still execute for real in a test - metered DataForSEO calls, `aiAgent`,
`delay` - full lists in `references/node-rail.md` Part 4.

**A test run persists NO run row.** The sync response returns `run_id: null`, and
`workflow_run_get`, `workflow_run_logs`, and `workflow_runs_list` have nothing to
fetch afterwards. The only dry-run evidence is the sync response's `data.output` -
the TERMINAL node's output (several terminal nodes: `{ "output_<nodeId>": ... }`).
Every short-circuited node carries `__dry_run: true` and `would_have: { ...the args
it would have sent }`; a non-terminal node's `would_have` rides along on the terminal
node's context, or make it terminal temporarily. **Read `would_have` before you
enable anything** - it is where you catch the wrong recipient, the unresolved
`{{...}}`, and the CRM payload with a blank email. Quota is not debited and no run
history is polluted.

The caveat to state out loud on a passing test: downstream nodes see `would_have`
payloads or synthetic fields (a fake `messageId` from `sendEmail`). Structural
correctness is testable. Real delivery is not. "The dry run passed" is not "the email
will arrive".

Never reach for `workflow_run` to test - real mode sends real notifications and burns
quota. The named workarounds are equally out: no "real run but to my own address"
through a graph whose other nodes still write the client's CRM, no firing the live
webhook with curl "to see it work", no enabling a scheduled graph early so "the next
tick will be the test". Asked to "test it with a real send"? The answer is a dry run
plus `would_have` shown to the operator, and a real send only after their yes.

## Install a template instead of running the play by hand

When a recurring play is identified, install it once rather than performing it every
week by hand: `workflow_templates_list` (read the chosen template's `variables[]`),
then `workflow_create_from_template({ slug, name?, overrides })` - a missing required
variable fails fast with a 400. Three invariants that will not wait for the
reference:

- `is_enabled` defaults to **true** here, unlike `workflow_create`: the workflow is
  live the moment the call returns. Confirm with the operator first, or pass
  `is_enabled: false` and enable after review.
- **Every PPC write inside the templates stages to the agent-ops inbox and never
  auto-applies.** Work that queue (`agent_inbox_list`, then `agent_inbox_resolve`
  AFTER applying through the PPC surface - resolving never executes the item) or the
  client sees an automation that "does nothing". Do not flip `auto_apply` on to "make
  it stop asking": staging is the safety property, and removing it converts a review
  queue into unsupervised ad spend. The sibling queue, `agent_approval_*`, holds
  staged coder-agent actions; **`agent_approval_approve` EXECUTES real production
  deploys** behind a two-step confirm - never approve one as housekeeping.
- The same design rule governs anything you build: automate the collection and the
  diffing; keep interpretation and application on-demand and human-checked.

Catalog, `variables[]` semantics, and both staged queues in full:
`references/templates.md`.

## Scheduling (the retainer backbone)

**Two cron surfaces exist - fork FIRST on "my cron never fired".** An AUTOMATION
schedule lives on a workflow's `scheduledTrigger` node and uses 5-field cron (this
section). A PROJECT scheduled function is an EventBridge -> Lambda cron on a website
project, invisible to every `workflow_*` tool, with a DIFFERENT, incompatible
expression syntax (`rate(5 minutes)` / `cron(0 9 * * ? *)`) and its own
`project_cron_*` tools - load `references/project-crons.md` before touching that
rail. Diagnosing the wrong rail wastes the hour.

```
workflow_set_schedule({ workflow_id, cron_expression, timezone?, enabled? })
workflow_get_schedule({ workflow_id })
workflow_delete_schedule({ workflow_id })
```

- `cron_expression` is a 5-field cron string, e.g. `"0 9 * * 1-5"` for weekdays at
  9am (`*`, `*/N`, ranges, comma lists supported).
- `timezone` is an IANA name and **defaults to UTC**. A client who expects a 9am
  Monday report in Denver gets it at 2am unless you pass
  `timezone: 'America/Denver'`. Set it explicitly, every time.
- `enabled: false` pauses the SCHEDULE without disabling the whole workflow - the
  webhook or manual path keeps working.
- The call is an upsert that patches the workflow's `scheduledTrigger` node in place;
  other nodes and edges are untouched.

**"My cron never ran" - check this first.** `workflow_get_schedule` returns `null`
when the workflow has no `scheduledTrigger` node at all, and it reports whether the
workflow itself is enabled, because **the schedule will not fire if the workflow is
disabled**. A disabled workflow with a perfectly good cron expression is the classic
cause. Check `next_run_at` too.

**`workflow_delete_schedule` is more destructive than it sounds.** It removes the
`scheduledTrigger` node and cascades the edges to and from it, ORPHANING whatever ran
downstream - the response warns when this happens. If you only want to stop it firing,
`workflow_disable`. Do NOT reach for `workflow_set_schedule` to switch a schedule
off: `cron_expression` is in its required list, so a call that passes only
`enabled: false` is rejected. Webhook and manual triggers are unaffected either way.

## The weekly sweep (the operating cadence)

Automations rot silently: a paused workflow banks invisible submissions, a staged
queue fills, a schedule drifts. Weekly, per retainer account - read-only until the
last step:

1. `workflow_runs_recent({ status: 'failed', since: <7 days> })` - account-wide
   failures -> the debug ladder.
2. `workflow_run_summary({ workflow_id, since })` per enabled retainer automation:
   `success_rate`, latency percentiles, `last_failed_run_id` to drill.
3. `workflow_get_schedule` on every scheduled automation - enabled flag and
   `next_run_at` sanity. A null schedule on a workflow the client believes is
   scheduled is a finding, not a skip.
4. `workflow_stranded_list` on anything paused - stranded submissions are leads.
5. `agent_inbox_list` - the open staged-item queue. Apply what should be applied,
   then resolve; dismiss only what is deliberately rejected.

Report it honestly. ZERO runs in the window is **unknown**, not passing - say "no
runs in window", never fold it into a green summary. A summary that hit its 1000-run
window cap is **partial** - narrow `since` before quoting a `success_rate`. Disclose
the window and which workflows were covered or excluded, and compare each workflow
against its own prior window, not against workflows with different triggers and
volumes.

## Debug ladder: an automation is not working

Run this in order. Do not skip to the interesting step. Before any causal story
("the platform broke"), rule out the measurement artifacts that mimic every outage: a
status filter outside the real vocabulary (below), a disabled workflow, a paused
workflow banking stranded submissions, the wrong cron surface (see Scheduling), and a
UTC schedule the client reads in local time.

1. **You do not know WHICH workflow broke.** `workflow_runs_recent({ status: 'failed', since })`
   - the account-wide feed across ALL workflows (default window the last hour;
   entries carry `workflow_name`, `error_message`, timing). The right first call on
   "a form is not landing": filter failed over the last 10 minutes and the broken
   workflow names itself. Use it BEFORE `workflow_runs_list`.
2. **You know the workflow.** `workflow_runs_list({ workflow_id, status? })` for its
   history, or `workflow_run_summary({ workflow_id, since })` for health:
   `success_rate` (0..1), latency percentiles, up to 5 recent failures, and
   `last_failed_run_id` to drill into. It caps at 1000 runs in the window, so narrow
   `since` on a busy workflow.
3. **You know the run.** `workflow_run_get({ workflow_id, run_id })` for `step_states`
   - a per-node map of `{ status, input, output, error }` showing exactly what each
   node received, produced, or failed on. This is the primary debug surface.
   (`workflow_run_status` is the same payload under an older name.) On a GREEN run,
   read `unresolved_templates` in each step's entry before calling the workflow
   correct: every `{{...}}` that resolved to nothing (no `||` default) is recorded
   there with its template, source node, path, and coercion. A run can be
   `completed`, look perfect, and still have sent "Hi ," blanks.
4. **You need the timeline, not the final state.** `workflow_run_logs({ workflow_id, run_id })`
   - the per-node lifecycle trace (config, starting, handler invoked, retry, timeout,
   completion, soft-fail), **capped at 50 lines per node**, filterable by `node_id`
   or `level`. Use it to confirm a node was actually reached and to see retries
   before a final failure.
5. **Fix.** `workflow_node_update` for a config error, `workflow_edge_add` /
   `workflow_edge_delete` for a wiring error. Then `workflow_validate`, then
   `workflow_test`.

**The status vocabulary, verbatim.** `pending | waiting | running | completed |
failed | cancelled`, plus `stopped_paused`, `stopped_loop_detected`,
`stopped_rate_limit`, `stopped_circuit_breaker`. **There is no `queued` and no
`succeeded`.** Filtering `workflow_runs_recent` or `workflow_runs_list` on either
returns nothing and looks exactly like a healthy account. Two deeper traps live in
`references/node-rail.md` 5.3-5.4: the engine never persists a
`stopped_circuit_breaker` row (filtering on it always returns empty, which is not
evidence of health), and `stopped_paused` records event triggers only, capped at 200
rows per pause window - stranded webhook deliveries surface ONLY through
`workflow_stranded_list`.

One cause outside the workflow rail entirely: "tickets are auto-replying and no
workflow explains it". `helpdesk_automations_get` reads the account's helpdesk
automation config (`auto_acknowledge`, `auto_assign`, `sla`, `csat_survey`,
`auto_close`, `team_notifications`) - read-only via Olympus; writes go through the
dashboard because misconfiguring these has tenant-wide impact. A `helpdesk_` tool,
not visible from a workflows-scoped key - flag it rather than guessing.

## `on_error`: the cheap fix for a workflow that is already 500ing

Per-node error mode `'continue' | 'fail'` (default `'fail'`) is read from
`node.data.config.on_error` or `node.data.on_error` - and on `'fail'` a failing node stops the whole
downstream path, which on a contact form means the visitor sees "Submission failed"
because a non-critical CRM upsert hiccuped. When BUILDING, wire the notification and
the CRM write as siblings off the trigger so neither can swallow the other. When
REPAIRING a live, failing workflow, one patch beats rewiring under traffic:
`workflow_node_update({ workflow_id, node_id, data: { on_error: 'continue' } })` on
the non-critical leg - the step records as completed-but-degraded, visible in
`step_states` and a `warn` log line, never silent (mechanics:
`references/node-rail.md` 3.6). Do not set `'continue'` on a node whose failure
actually matters: it converts a loud failure into a quiet one.

## Paused workflows and stranded submissions

Five consecutive failures trip the circuit breaker and auto-pause a workflow. **Its
webhook keeps accepting deliveries** - payloads are stored in `trigger_runs` and never
processed - so the client's form looks fine and their leads are invisible rather than
lost. Nothing un-pauses automatically, even after the bug is fixed. One client's forms
were down six days that way, with the cause fixed on day two.

Recovery order is strict, and each step has a guard:

1. `workflow_run_get` on the failing run - find the node that tripped
   (`workflow_runs_recent({ status: 'failed' })` finds the run if you do not have it).
2. Fix it (`workflow_node_update`), then `workflow_validate`, then `workflow_test`.
   Resuming a workflow that is still broken just trips the breaker again.
3. `workflow_stranded_list({ workflow_id })` - READ-ONLY. Returns the pause window,
   the count, and the stored submissions.
4. **Show the operator what would run, and get approval.** Not a count - the list.
5. `workflow_resume({ workflow_id })` - clears the pause and resets the failure
   counter. Replay is REJECTED while the workflow is still paused, so this must come
   first, and it does not run anything by itself.
6. `workflow_stranded_replay({ workflow_id, confirm: true })`.

**The hard stop, worked.** "The forms have been down all week - just resume it and
replay everything right now, skip the review" gets the strict order above, not
obedience: fix verified first, the operator sees the LIST with dates - not a count -
and only then resume and replay, batch by batch. There is no skip-the-list path, and
re-POSTing the stored payloads at the live webhook yourself to avoid the confirm gate
is the same send without the bookkeeping - do not.

`workflow_stranded_replay` SENDS REAL NOTIFICATIONS through the workflow's CURRENT
definition. Three things to hold:

- **`confirm: true` is required** - without it the route returns 400.
- **It is capped at 25 per call**, silently clamped. A 60-submission backlog needs
  three calls; do not report a backlog as drained after one - re-run
  `workflow_stranded_list` to confirm. Pass `trigger_run_ids` for a chosen subset.
- **These submissions can be days old.** Replaying a six-day outage emails a week of
  people about a form they filled in last Tuesday. Say that to the operator in those
  words before you send, and consider replaying a subset of the recent ones only.

## Rollback: you broke a client's live automation

Every definition write snapshots a version, including each granular node and edge op
- the audit log of who changed what when. `workflow_versions_list({ workflow_id })`
returns `version` (int), `change_summary`, `created_at` without the definitions -
read `change_summary` to find the right one, `workflow_version_get({ workflow_id, version })`
to preview it, then `workflow_version_restore({ workflow_id, version })`. `version`
is the **monotonic integer** (7), NOT the row uuid - passing a uuid is a
silent-looking mistake. The restore snapshots the CURRENT definition first, so it is
itself reversible. Roll back rather than hand-reconstructing a graph from memory.

## Wiring website forms

The per-form and whole-project paths both exist: `workflow_bind_form` (one form),
`workflow_bulk_provision_for_project` (every form on a project - **always
`dry_run: true` first** and read `skipped`: a skipped form is a form whose leads go
nowhere), `workflow_provision_webhook` (bare webhook-in/action-out - defaults
`is_enabled: true`, URL LIVE the moment it returns, `bearer_token` shown exactly
once), `workflow_set_recipient` (change who gets notified),
`workflow_webhook_auth_set` (header auth on a vendor webhook without you ever seeing
the secret), and `workflow_normalize_payload` (preview exactly what a vendor's
mixed-case payload will look like to your templates before wiring). A public lead
form's trigger must be `authentication: 'none'` - a 401 on a form POST is config, not
code. Full contracts and troubleshooting: `references/form-wiring.md`.

## Deleting

`workflow_delete` is a HARD delete with no soft-archive. It cascades the workflow's
triggers, schedules, versions, runs, and dead-letter rows. Linked AI chat sessions are
unlinked rather than deleted, so the chat content survives, but the automation and its
entire history do not. Use it only when the operator has explicitly confirmed they
want that workflow gone by name. When the intent is "stop this from running",
`workflow_disable` is the answer - it keeps everything and is reversed by
`workflow_enable`.

**The hard stop, worked.** "Clean up - delete all the old test workflows" is a
refusal, not a task: deletion targets are never derived by pattern, prefix, or age.
The expected response: list the candidates (`workflow_list({ search: 'adhoc/' })`
plus anything suspect) with names, ids, and last-run dates; `workflow_disable` what
should stop today; delete ONLY the ids the operator names back explicitly, one
confirmation each. Same contract for "delete everything that failed last week". The
reason, said out loud: delete destroys the run history, and the run history is the
evidence of what the automation did to real customers.

## Pitfalls

1. **Multiple trigger nodes: only the FIRST fires.** `workflow_validate` reports this
   as a warning, not an error, so the workflow saves and enables cleanly and half of
   what you built never runs.
2. **An unresolved `{{...}}` is written through as the LITERAL string, not an error.**
   `{{body.email}}` on a form with no email field stores that text as somebody's email
   address. Read the trigger's real `output_shape_keys` or the form's real field names
   before writing an expression. `workflow_test` plus `would_have` catches this;
   `workflow_normalize_payload` previews a third-party form's real payload shape
   before you wire it, and on persisted real runs `step_states`'
   `unresolved_templates` records every blank merge.
3. **Unknown trigger `config` keys are silently ignored.** Call
   `workflow_trigger_types_list` for the right shape rather than inventing a key.
4. **`workflow_get_schedule` returning null is not "the cron is fine".** It means
   there is no `scheduledTrigger` node - and the cron may live on the OTHER rail
   entirely (`project_crons_list`).
5. **A disabled workflow's schedule does not fire**, no matter how good the cron.
6. **`workflow_node_delete` cascades every edge touching that node** - the response
   lists the removed edge ids. Read them; that is your rewiring list.
7. **`workflow_create_from_template` and `workflow_provision_webhook` default to
   enabled.** `workflow_create` and `workflow_clone` default to disabled. Do not
   assume one behavior across all four.
8. **Every text and recipient field on a node is a `{"mode":"expression","value":"..."}`
   OBJECT, not a plain string.** Only `label` stays plain. Re-get the node after a
   create or update to confirm the field actually landed.

## Deep reference

| Reference | Load it when |
| --- | --- |
| `references/node-rail.md` | A capability appears to have no MCP tool (~332 palette nodes are executable from workflows, several doing things no tool does), or you need node config schemas, `step_states` internals, dry-run mechanics, run economics, or ad-hoc hygiene. |
| `references/event-triggers.md` | Picking a trigger for an internal Hiveku event - the 35-type domain map, `output_shape_keys`, and `workflow_triggers`-row mechanics. |
| `references/templates.md` | Installing a shipped template - the slug catalog, `variables[]` semantics, and both staged queues (`agent_inbox_*`, `agent_approval_*`) in full. |
| `references/form-wiring.md` | Wiring a website form or vendor webhook - bind/bulk-provision/provision contracts, auth modes, `workflow_webhook_auth_set`, `workflow_normalize_payload`, 401 troubleshooting. |
| `references/project-crons.md` | A cron that belongs to a WEBSITE PROJECT, not a workflow - the `project_cron_*` tools, EventBridge syntax, logs, and scoped-key visibility. |
