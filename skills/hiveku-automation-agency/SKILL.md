---
name: hiveku-automation-agency
description: "Operator manual for building, testing, scheduling, pausing, debugging, and rolling back Hiveku workflows (automations). People say it plainly: \"can this just happen automatically?\", \"every time someone fills out the form, email Sarah\", \"stop the automatic emails - somebody complained\", \"why did the customer get this twice?\", \"it was supposed to happen on its own and nothing went out\", \"leads came in over the weekend and nobody was told\". Use for ANY automation work - build or edit a workflow, wire a form to a notification or CRM write, an internal event trigger (deal stage changed, ticket assigned, invoice paid, Shopify order, PM task moved, call completed), a recurring cron job or weekly client report, a run that failed, never fired, fired twice, or stranded, replaying submissions that piled up while a workflow was paused, and installing the shipped workflow templates instead of running a play by hand every week. If \"automatic emails\" might be a drip SEQUENCE rather than a workflow, identify the sender before touching either (sequences live in hiveku-communications). ALSO load before risky automation asks - \"delete the old workflows\", \"skip the dry run\", \"replay everything now\", \"test it with a real send\" - the refusal rules live here."
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
- **Create disabled, dry-run disabled, enable LAST.** `workflow_create` defaults
  `is_enabled: false` - leave it false through the entire build AND through the dry
  run. **`workflow_test` runs on a DISABLED workflow**: the run route only rejects a
  disabled workflow when `test_mode` is absent. Order: validate, `workflow_test`,
  read `data.step_states`, THEN `workflow_enable` on the operator's yes.
  (This changed. The route used to demand enable-first, which forced the unsafe
  "enable -> dry-run -> disable" dance and left a half-tested automation LIVE in the
  gap - if a webhook fired or a cron ticked in those seconds, it ran for real. Any
  older instruction telling you to enable before testing is stale: a dry run touches
  nothing the enabled flag guards, so there is never a reason to arm a graph you have
  not yet tested.)
  Enabling a `manualTrigger`-only graph is inert (no listener exists); enabling a
  graph with a `webhookTrigger` or `scheduledTrigger` makes it LIVE, so for those get
  the operator's approval of the automation itself first - never enable merely to
  satisfy a run gate that no longer exists.
- Confirm every write that can reach a customer: `workflow_enable` (on a webhook or
  scheduled graph), `workflow_trigger_update` (it can move a live webhook URL, make a
  protected webhook public, or re-arm a disarmed one), `workflow_run` (real mode),
  `workflow_stranded_replay`, `workflow_delete`, `workflow_delete_schedule`,
  `workflow_set_recipient` (it rewrites where EVERY notification in the graph goes),
  `agent_approval_approve`. Reading, listing, validating and `workflow_test` are free and
  safe.
  Several of these also prompt at the permission layer, on the install shape
  documented in INSTALL.md. That prompt is a backstop for an accident, not the
  approval itself: the operator's yes has to be informed - say what will fire, to
  whom, and how many - and a prompt you clicked through is not a yes anyone gave.
- **Never pass `allow_incomplete: true` on your own judgment.** `workflow_enable` (and
  `workflow_update` with `is_enabled: true`) refuses a disabled workflow that fails
  validation with 422 `workflow_invalid` and the `issues` list. The answer is to fix those
  nodes. The override exists for an operator who has been told exactly which nodes will
  fail at run time and says to enable anyway; "just turn it on" is not that yes. The same
  holds for renaming a live webhook URL (`workflow_trigger_update({ webhook_path })` or a
  changed `webhookPath` on `workflow_node_update`): the old URL dies at once, so it needs
  the list of senders to re-point and an explicit yes. And for making a protected webhook
  public (`filter_config: { authentication: 'none' }` or `filter_config: null`): say which
  URL loses its credential before you send it.
- Durable decisions (which template a client is on, who the recipient is, why an
  automation is deliberately disabled) -> `memory_create`. Work items ->
  `pm_tasks_create`.
- An 8-character dashboard id -> `workflow_resolve_short_id` (404 no match, 409 +
  `candidates[]` when ambiguous - pass more characters). Human handoff ->
  `workflow_dashboard_url` (editor, runs-list, latest-run URLs).

## The three prerequisites (call these before you build)

| Tool | Why it is mandatory |
|---|---|
| `workflow_node_types_list` | The only way to know which node `type` strings the engine accepts. Returns the full catalog with per-type `data` fields and outgoing-handle shapes. `required` / `requiredOneOf` / `requiredWhen` on a field and node-level `requires` are what the handler fails without, custom-panel nodes included; `inferred: true` only means the handler reads the key, never that it is required; `configLocation: 'flat'` means `data.config` is ignored, and `'configOrData'` (CRM, the four SEO research nodes, Slack) means the handler reads `data.config` whole whenever the node has one, so a flat key beside it is missed, and `'databaseTriggerConfig'` (the DB triggers) reads one object whole, `data.databaseTriggerConfig`, else `data.config`, else `data` (`references/node-rail.md` 2.4-2.5). The set moves per deploy - read the catalog, never a type string or a count from memory. |
| `workflow_templating_syntax` | The `{{...}}` reference: what the executor resolves at run time, what `trigger.output.payload` / `headers` / `query` contain, upstream-node references, `{{ref \|\| default}}` fallbacks, what `unresolved_templates` records, and the `{mode, value}` field modes `sendEmail` uses. Read it BEFORE you write any interpolated value. |
| `workflow_validate({ workflow_id })` | Server-side check after every batch of edits. Errors: unknown node types, missing required fields on any node a trigger reaches (custom-panel nodes included; an issue can carry `anyOf` and a `note` such as "found at data.config.url, but this node reads data.url"), dangling edges, duplicate ids, no trigger (counted by the engine's own start-node list, so CRM, billing, email and database triggers count), an invalid `aiAgent` `responseSchema`. Warnings: orphan nodes (not reachable from the trigger), a missing field on such a node (`unreachable: true`: connect it or delete it), multiple triggers (**only the first fires**), self-loops, invalid source handles. Any error makes `workflow_enable` refuse with 422 `workflow_invalid`. |

Two more discovery tools, and the split between them matters:
`workflow_event_trigger_types_list` returns trigger NODES that fire on something
happening INSIDE Hiveku ("when a deal changes stage") - an event trigger needs no
`workflow_triggers` row, it is a graph node and nothing else; always call the tool
rather than trusting a list in a file, and read the chosen entry's
`output_shape_keys` before writing any template (domain map and trigger-row
mechanics: `references/event-triggers.md`). `workflow_trigger_types_list` returns
infrastructure triggers - `workflow_triggers` table ROWS (`webhook`,
`scheduled_trigger`, `database_trigger`) and the config keys each reads; call it
before `workflow_trigger_create`. A webhook row echoes keys that are not settings back
as `ignored_keys` / `unknown_keys` / `warnings`; on the other row types **config is
untyped and unknown keys are silently ignored**.

## The build loop (canonical, in order)

1. **Context.** `account_context_get({ domain: 'workflow' })`. Then `workflow_list` -
   `workflow_clone` / `workflow_duplicate` beats rebuilding something close.
2. **Pick the trigger.** Internal event -> `workflow_event_trigger_types_list`.
   Inbound HTTP -> `workflow_node_add` of a `webhookTrigger`, which creates the
   `workflow_triggers` row in the same call and returns `webhook_url` (never follow it
   with `workflow_trigger_create`: 409). The row is the live URL; `webhookPath` is only a
   label the server suffixes with 16 random characters, so read `webhook_url` from the
   response and never build a URL yourself. A live URL moves only on an explicit, one-way
   rename (`workflow_trigger_update({ webhook_path })`, or a changed `webhookPath` on
   `workflow_node_update`). Cron -> the scheduling section. Read the entry's
   `output_shape_keys`.
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
   warning. An orphan node warning usually means you forgot an edge. `workflow_node_add`
   and `workflow_node_update` already flag gaps as they happen (`config_incomplete`,
   `missing_required_fields`); validate is the whole-graph check.
9. **Dry-run while still disabled.** `workflow_test({ workflow_id, input_data })`, then
   READ `data.step_states` on the response. See the next section. Nothing is armed yet,
   which is the point.
10. **Enable, last, on the operator's yes.** `workflow_enable({ workflow_id })`. Enabling
    a disabled workflow re-runs validation, and any error returns 422
    `workflow_invalid` with the `issues`; nothing changes until you fix them.
    `allow_incomplete: true` is only for the operator's explicit, informed yes. Read the
    `validation` block on a 200 for warnings. Webhook/scheduled graphs go LIVE at this
    call, and only after a dry run they have seen. If a failure here should reach a human,
    turn on failure alerts in the same breath (see "When it breaks at 3am").
11. **Real run / leave live, on approval.** `workflow_run` for a one-shot; for an
    always-on automation, confirm with the operator that it stays enabled.

Repairing an existing workflow is the same loop from step 3, with
`workflow_node_update`: `data` is SHALLOW-merged, so you patch one key without
resending the node (`null` clears a key), and every call snapshots the prior version.
Sending back what `workflow_get` returned is safe: an echoed path never moves a URL, a
`'[redacted]'` value keeps the stored secret (it is never written), and an auth key in node
`data` never reaches the live URL (`auth_not_applied`; Pitfall 9 names the calls that
change it). Deleting a webhook trigger node disarms its URL rather than deleting it
(`disarmed_webhook_trigger` in the response; submissions are still recorded, nothing runs),
unless the row belongs to another webhook node still in the graph, or a remaining webhook
node links to it or shows its URL. Rename, disarm and restore rules:
`references/node-rail.md` 3.3-3.5.

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
task writes, database writes, deploys and GitHub pushes, project file saves, and - as
of 2026-08-30 - **`aiAgent` and the sub-agent role nodes** (`blogWriter`,
`seoSpecialist`, `socialMedia`, `dataAnalyst`, `contentCurator`, `videoCreator`).
**What still runs** for fidelity: data transforms, array ops, flow control, template
resolution, reads, and the trigger node itself against your `input_data`. Code a node runs
(a `transformData` custom transform, a `validateData` custom rule, a `waitUntil`
expression) still runs, but its `fetch` is never sent: it gets a synthetic 200 `{}` and
the step a "test run: fetch ... was not sent" warning. The metered DataForSEO research
nodes return placeholder data in a test (no spend), `delay` does not sleep, and a wait
node never parks the test - full lists in `references/node-rail.md` Part 4.

**Two dry-run holes were closed on 2026-08-30; both are worth knowing because older
notes describe the broken behaviour.** (1) A side-effecting node inside a
`parallelExecute` branch or a `transactionBlock` used to reach the REAL handler: the
gate was written into the main dispatch loop only, and those two run their own inline
chains, so a graph defeated the dry run purely by having a fan-out shape. The gate now
holds at all three dispatch sites. (2) `aiAgent` was ungated, so a "dry run" spent
real tokens and, because an agent turn can call its own tools, could WRITE. Both mean
the same thing for you: a dry run is now trustworthy on graph shapes where it
previously was not, and the mocked AI node returns a `would_have` instead of generated
copy. Judging the copy is what a real run, on approval, is for.

**A test run persists NO run row, and its evidence is in its own response.** It runs
the whole graph (simulated side effects, real pure nodes) and returns `run_id: null`;
`workflow_run_get`, `workflow_run_logs`, and `workflow_runs_list` have nothing to fetch
afterwards. Read the response instead (shape: `references/node-rail.md` 5.1):

- `data.step_states[<nodeId>]` for EVERY node that ran: `status`, `dry_run` (trust this
  flag, not an output's `__dry_run`, which pure nodes inherit), `output` (for a simulated
  node, the mock with `would_have` and a synthetic `id`), `template_values` (every
  `{{token}}` and what it resolved to, with a `status`), `unresolved_templates` (always an
  array, `[]` = clean), `warnings`, `error`. Credential-keyed values (an `Authorization`
  header, an `apiKey`, a password) read `'[redacted]'` throughout the report, and env
  secret values read `•••`.
- `data.not_reached` for nodes the run never got to: an untaken branch, or everything
  downstream of a failure. A node you expected that shows up here is wiring.
- `data.execution_order` and `data.terminal_node_ids`; `data.output` is still the
  terminal node's output, one view among several, so never make a node terminal to see it.
- `data.unresolved_template_count` and the flat `data.unresolved_templates`.

**Read `template_values` and `would_have` before you enable anything** - they are where
you catch the wrong recipient, the `{{...}}` that resolved to an empty string (status
`empty`: the reference exists but is blank, which is not a miss, so add a `||` default),
the literal token text going out (status `literal`), and the CRM payload with a blank
email. A miss with `source_simulated` came from a simulated upstream node and is expected
in a dry run. `fire_and_forget` is ignored on a test (it always runs synchronously).
Quota is not debited and no run history is polluted.

**Re-run old tests.** Before the 2026-09 fix a test run stopped at the first simulated
node, so an older "completed" test proved nothing past it. Re-run any dry run from
before then before you rely on it.

The caveat to state out loud on a passing test: downstream nodes see `would_have`
payloads or the synthetic `id`, never what a real send returns. Structural correctness
is testable. Real delivery is not. "The dry run passed" is not "the email will arrive".
`aiAgent` in particular is mocked, so a `responseSchema` is only enforced on a real run.

Never reach for `workflow_run` to test - real mode sends real notifications and burns
quota. The named workarounds are equally out: no "real run but to my own address"
through a graph whose other nodes still write the client's CRM, no firing the live
webhook with curl "to see it work", no enabling a scheduled graph early so "the next
tick will be the test". Asked to "test it with a real send"? The answer is a dry run
plus its `would_have` and `template_values` shown to the operator, and a real send
only after their yes.

## Install a template instead of running the play by hand

When a recurring play is identified, install it once rather than performing it every
week by hand: `workflow_templates_list` (read the chosen template's `variables[]`),
then `workflow_create_from_template({ slug, name?, overrides })` - a missing required
variable fails fast with a 400. Three invariants that will not wait for the
reference:

- `is_enabled` defaults to **true** here, unlike `workflow_create`: the workflow is
  live the moment the call returns. Confirm with the operator first, or pass
  `is_enabled: false` and enable after review. An enabled create is never refused for
  validation: when the graph has problems the 201 carries `validation`, and on errors a
  `validation_warning` naming them. Read it, then fix the nodes or
  `workflow_update({ is_enabled: false })` at once.
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

**A THIRD schedule rail exists for JUDGMENT plays.** A workflow re-runs stored logic; it
cannot read an account and exercise judgment. For "run the morning brief in every client
folder unattended", "weekly health pass without me", the recipe is an OS-scheduled headless
Claude run per bound folder, ceilinged to reads, push-on-flag only - load
`references/scheduled-routines.md` before setting one up.

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

## Running the plays on a schedule

The design rule from the templates section, applied to cadence: automate the collection and the
diffing; keep interpretation human-checked. Every recurring play sorts into one of two lanes, and
picking the wrong lane is its own failure mode - a judgment play wired to a dumb rail re-emails
stale conclusions forever, and a collection job left to a human quietly stops happening.

**Lane 1 - the platform rails (deterministic recurrence).** Five cadence surfaces; pick by what
recurs:

| What recurs | Rail |
|---|---|
| A graph of actions on a cron | `workflow_set_schedule` on a `scheduledTrigger` workflow (previous section) |
| Code inside a website project | `project_cron_*` - EventBridge/Lambda, incompatible cron syntax (`references/project-crons.md`) |
| A branded client report that regenerates and emails itself | `marketing_report_create` with a cadence - it stamps `next_scheduled_at` so the scheduler cron delivers; change cadence via `marketing_report_update` (re-stamps it); a manual `marketing_report_send` never advances the schedule. Marketing and social report types only - there is no branded rail for books, ppc, or helpdesk numbers. |
| A recurring PM deliverable | `pm_task_recurrence_create` - 5-field cron; `on_overlap: 'skip'` (the default) refuses to stack a new occurrence on an unfinished one, `'spawn'` fires regardless |
| A recurring Mission Control card | `mc_schedule_create` (cron + a `template_name` from `mc_templates_list`); preview the plan with `mc_schedule_fire` in dry-run before letting the cron drive; `mc_schedule_get` shows `last_fired_at` |

All five re-run stored logic on a clock. None of them can run a skill: nothing platform-side reads
an account and exercises judgment on a schedule. A recurring judgment play - the morning brief, the
weekly optimization pass - is lane 2 or it is a human.

**Lane 2 - scheduled Claude routines (the judgment plays).** The recipe for running the plugin's
plays unattended, one bound client folder at a time, from the operator's own machine: an
OS-scheduled (launchd on macOS, cron elsewhere) headless `claude -p` run per client folder,
ceilinged to reads, writing a dated brief file, notifying the operator only on a flag. Two
scheduler mechanics that bite: use the absolute path to `claude` in the unit (launchd and cron
give scripts a minimal PATH where the bare name is not found), and keep briefs INSIDE the client
folder - never `/tmp`, which is shared ground between accounts. The invariants:

- **The unit of scheduling is the bound folder.** Binding is directory-scoped, so a routine is one
  OS-scheduler entry per client folder:
  `cd <folder> && claude -p "/hiveku:daily" > hiveku-data/briefs/$(date +%F).md`. The print-mode
  output IS the brief - no write tool needed to deliver it.
- **Reads only, declared, fail-closed.** Before scheduling a folder, ceiling it:
  `.hiveku/guardrails.json` with `"mode": "reads-only"` makes the plugin's own PreToolUse hook
  REFUSE every non-GET tool with a reason (a malformed file fails closed the same way). Do not rely
  on the permission prompt alone - a settings file that blanket-allows the Hiveku server (the
  common install shape) would let an unattended session write - and never, under any framing,
  schedule with `--dangerously-skip-permissions`: an unattended session that can send is the exact
  customer-reaching accident this file exists to prevent. Binding and guardrails both walk UP
  from the session's cwd, so a `scheduled/` subfolder carrying its own
  `.hiveku/guardrails.json` inherits the parent folder's account binding while staying ceilinged
  - and interactive sessions at the folder root keep their full write surface.
- **Push on flag only.** The routine's output contract: the brief ends with `ALL-CLEAR` or
  `FLAG: <one line>`, and the wrapper notifies the operator only on FLAG. Twenty accounts on the
  morning schedule is twenty dated files and zero-to-three pings, not twenty pings.
- **The scheduled session proposes; the morning session disposes.** Anything the run wants done - a
  send, a write, an escalation - lands in the brief as a proposed action naming the `/hiveku:*`
  command that does it, and a human runs that interactively. A scheduled routine never has
  standing approval for anything.

## The weekly sweep (the operating cadence)

Automations rot silently: a paused workflow banks invisible submissions, a staged
queue fills, a schedule drifts. Weekly, per retainer account - read-only until the
last step:

1. `workflow_runs_recent({ status: 'failed', since: <7 days> })` - account-wide
   failures -> the debug ladder.
2. `workflow_run_summary({ workflow_id, since })` per enabled retainer automation:
   `success_rate`, latency percentiles, `last_failed_run_id` to drill, and
   `template_misses` (`runs_with_misses`, `total_misses`, `last_run_id_with_misses`, the
   top nodes) for runs that completed but merged blanks. `runs_checked` counts runs whose
   every step was checked; `runs_partially_checked` counts runs an older engine wrote in
   part, whose misses are a lower bound.
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

## When it breaks at 3am: make the workflow tell someone

The weekly sweep above is how YOU find a broken automation. It is not how the CLIENT
finds out, and a week is a long time for a lead form to be dead. The reliability
surface is loud about terminal states and silent about the ordinary one:

- The circuit breaker pauses a workflow after **five consecutive** failures and emails
  the account admins. Four failed nights in a row say nothing.
- An **intermittent** failure - the one that fails a third of the time - never trips
  the breaker at all, so it can run broken indefinitely.
- A paused workflow rejects triggers **without writing a run row**, which is why the
  classic report is "it just stopped, and there are no errors".

So for anything a client depends on, turn on per-run failure alerting when you enable
it:

```
workflow_update({ workflow_id, settings: { notify_on_failure: true } })
```

Send `settings` on its own - you do NOT resend the graph, and the server merges it, so
a later `workflow_update({ definition })` cannot silently drop the flag. Read it back
with `workflow_get` under `definition.settings`. The opt-in lives in the workflow's own
definition, which means it survives a clone, a template instantiation and a version
restore. On a failed triggered run it raises one inbox item and emails the account
admins **once per incident, not once per failed run** - a workflow failing every five
minutes produces 288 failures a day and one email; resolving the inbox item re-arms it.

Rules for it:

- **Alerting is not a substitute for the dry run.** It tells you the automation broke
  after it broke. `workflow_test` tells you it was wrong before it ever ran.
- **Turn it on for anything customer-facing** - lead capture, notification, billing,
  anything whose silence costs the client money. Leave it off for noisy internal
  sweeps where a single failure is genuinely uninteresting, or you teach the owner to
  ignore the channel.
- **Human-origin failures do not alert.** Your own editor iteration is not an
  incident.
- Say plainly which workflows have it on when you hand over. An owner who believes
  they will be told, and will not be, is worse off than one who knows to check.

Deep detail, the triage ladder, and the ways a run can look green while doing nothing:
`references/reliability.md`.

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
   read `unresolved_template_count` and `unresolved_template_nodes` before calling the
   workflow correct, then the step's `unresolved_templates`: every `{{...}}` that
   resolved to nothing (no `||` default) is recorded there with its template, source
   node, path, and coercion (`empty_string`, `null`, or `literal` with a `hint` for a
   malformed `|` / `or` fallback). `[]` means checked and clean;
   `unresolved_templates_recorded: false` means the run predates recording and proves
   nothing; `'partial'` means an older engine wrote some steps, which carry no
   `unresolved_templates` key, so the count is a lower bound (null when it is 0). A run can
   be `completed`, look perfect, and still have sent "Hi ," blanks.
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
   the count, and one row per submission carrying trigger_run_id, received_at, form_name and payload KEYS - the field NAMES only. The values are deliberately withheld because a stranded payload can hold personal data, so you can tell the operator how many leads are waiting and when they arrived, and you cannot read them the contents. Capped at 200 rows.
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
itself reversible, and it restores the graph, not the live webhook URL: a live trigger
row keeps its URL, so senders keep working. A webhook node whose row has since been
deleted gets a NEW URL, never the snapshot's old path; `webhook_trigger_warnings` names
it, and every sender must be pointed at it. Roll back rather than hand-reconstructing a
graph from memory.

## Wiring website forms

The per-form and whole-project paths both exist: `workflow_bind_form` (one form),
`workflow_bulk_provision_for_project` (every form on a project - **always
`dry_run: true` first** and read `skipped`: a skipped form is a form whose leads go
nowhere), `workflow_provision_webhook` (bare webhook-in/action-out - defaults
`is_enabled: true`, URL LIVE the moment it returns, `bearer_token` shown exactly
once; no API call issues a bearer token for an EXISTING URL, only the owner's Apply
authentication in the editor does), `workflow_set_recipient`
(change who gets notified), `workflow_webhook_auth_set` (header auth on a vendor webhook
without you ever seeing the secret; it returns the last 4 characters only, and when it
cannot tell which URL to protect it changes nothing and answers 409
`ambiguous_webhook_trigger` with the candidates: call again with `trigger_id` or
`node_id`), and `workflow_normalize_payload` (preview exactly what a vendor's
mixed-case payload will look like to your templates before wiring). A public lead
form's trigger must be `authentication: 'none'` - a 401 on a form POST is config, not
code, and the fix is `workflow_trigger_update({ workflow_id, trigger_id, filter_config:
{ authentication: 'none' } })` (the tool takes `filter_config`, never `config`, and
merges it into the webhook row; it is ask-gated, so tell the operator which URL goes
public). Every webhook URL is server-assigned: read `webhook_url`
from the response. Full contracts and troubleshooting: `references/form-wiring.md`.

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
2. **An unresolved `{{...}}` is a blank merge, not an error.** A well-formed
   `{{body.email}}` on a form with no email field becomes `''` in text (null as a whole
   field) and the step still completes: a contact with no email, a "Hi ," greeting. It is
   recorded in `unresolved_templates`, but nothing fails. Two things still go out as
   literal token text: a malformed fallback (`{{ref | x}}`, `{{ref or x}}`) in an
   engine-resolved field such as `sendEmail` or `apiCall` (recorded, with a `hint`), and a
   token the engine grammar cannot parse at all (`{{channel}}`, a mid-path index). Read the
   trigger's real `output_shape_keys` or the form's real field names before writing an
   expression, and add `|| default` where a blank would embarrass the client.
   `workflow_test` plus `template_values` / `would_have` catches this before it ships;
   `workflow_normalize_payload` previews a third-party form's real payload shape before
   you wire it; on real runs `unresolved_template_count` and each step's
   `unresolved_templates` record each missing reference and malformed fallback (a field
   that exists but is blank is not a miss; only a dry run's `template_values` shows it,
   as `empty`).
3. **Unknown trigger config keys.** On a webhook row a key that is not a setting is
   dropped and echoed back (`ignored_keys` / `unknown_keys` / `warnings`); on scheduled
   and database rows it is silently ignored. Call `workflow_trigger_types_list` for the
   right shape rather than inventing a key, and read the echo.
4. **`workflow_get_schedule` returning null is not "the cron is fine".** It means
   there is no `scheduledTrigger` node - and the cron may live on the OTHER rail
   entirely (`project_crons_list`).
5. **A disabled workflow's schedule does not fire**, no matter how good the cron.
6. **`workflow_node_delete` cascades every edge touching that node** - the response
   lists the removed edge ids. Read them; that is your rewiring list.
7. **`workflow_create_from_template` and `workflow_provision_webhook` default to
   enabled.** `workflow_create` and `workflow_clone` default to disabled. Do not
   assume one behavior across all four. A create, template install or clone that lands
   enabled skips the enable gate: read its `validation` / `validation_warning` instead
   (`workflow_provision_webhook` reports neither).
8. **Plain strings and `{mode, value}` objects both resolve.** A plain string config
   value is template-resolved at run time. `sendEmail`'s `to` / `cc` / `bcc` also accept
   the `{"mode":"expression","value":"..."}` wrapper the editor writes (`static` or
   `literal` mode sends the value unchanged); `workflow_templating_syntax` lists the
   fields that use modes. Either way, re-get the node after a create or update to confirm
   the field actually landed where the handler reads it (`configLocation`, node-rail 2.5).
9. **A `webhookTrigger` config is not the whole webhook.** The URL, method and auth live
   on the `workflow_triggers` row (`webhook_path`, `allowed_method`, `filter_config`).
   `workflow_trigger_update` takes `filter_config`, never `config` (a `config` argument
   is dropped by the tool and changes nothing), and on a webhook row merges it: omitted
   keys are kept, null deletes a key. A definition write (`workflow_update`, an editor
   save, `workflow_node_add`, `workflow_node_update`) NEVER changes a live webhook's auth
   or secrets: a node whose auth differs is left as sent, and the write warns
   `auth_not_applied`. So a node saying `'none'` cannot make a protected webhook public,
   and no stale copy of a node can revert a rotation. Auth changes only through
   `workflow_trigger_update` (`filter_config`), `workflow_webhook_auth_set`, or the owner's
   Apply authentication in the editor; for bearer, Apply authentication, or
   `workflow_trigger_delete` + `workflow_trigger_create` (a NEW URL, token returned once).
   `authRequired` does nothing for either value.

## Deep reference

| Reference | Load it when |
| --- | --- |
| `references/recipes.md` | Someone describes a tedious problem in their own words and you want a proven end-to-end build for it rather than a design invented on the spot. Start here before hand-building anything. |
| `references/reliability.md` | An automation "stopped working", or you are doing a health pass. The triage ladder, the ways a run looks green while doing nothing, how to read a failed run, and the confirm-gated path back to healthy. |
| `references/scheduled-routines.md` | Running a play UNATTENDED on a cron (the daily brief, a fleet sweep). The per-folder guardrail ceiling, the output contract, launchd/cron wiring, and why an unattended session must never hold write permission. |
| `references/node-rail.md` | A capability appears to have no MCP tool (hundreds of palette nodes are executable from workflows, several doing things no tool does), or you need node config schemas and requirement metadata, the enable gate, webhook URL rules, `step_states` internals, the dry-run report, run economics, or ad-hoc hygiene. |
| `references/event-triggers.md` | Picking a trigger for an internal Hiveku event - the 35-type domain map, `output_shape_keys`, and `workflow_triggers`-row mechanics. |
| `references/templates.md` | Installing a shipped template - the slug catalog, `variables[]` semantics, and both staged queues (`agent_inbox_*`, `agent_approval_*`) in full. |
| `references/form-wiring.md` | Wiring a website form or vendor webhook - bind/bulk-provision/provision contracts, auth modes, `workflow_webhook_auth_set`, `workflow_normalize_payload`, 401 troubleshooting. |
| `references/project-crons.md` | A cron that belongs to a WEBSITE PROJECT, not a workflow - the `project_cron_*` tools, EventBridge syntax, logs, and scoped-key visibility. |
