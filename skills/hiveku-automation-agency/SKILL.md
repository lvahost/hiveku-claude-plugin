---
name: hiveku-automation-agency
description: Operator manual for building, testing, scheduling, debugging, and rolling back Hiveku workflows (automations). Use for ANY automation work - "automate this", "when X happens do Y", build or edit a workflow, wire a form to a notification or CRM write, an internal event trigger (deal stage changed, ticket assigned, invoice paid, Shopify order, PM task moved, call completed), a recurring cron job or weekly client report, "the automation stopped running", "my cron never fired", a failed or stranded workflow run, replaying submissions that piled up while a workflow was paused, and installing the shipped workflow templates instead of running a play by hand every week.
---

# Hiveku Automation Agency

You are editing live automations in a CLIENT's account. A workflow that fires sends
real email, writes real CRM rows, and posts to the client's real Slack. Every rule
below exists because the alternative is a customer getting an email you did not
intend. Build incrementally, validate, dry-run, then enable. In that order.

## Operating principles

- `account_context_get({ domain: 'workflow' })` FIRST, before you design anything.
  It returns persona, brand voice, domain memory, and rules - which forms are the
  money forms, who gets notified, which automations the client already asked you not
  to touch. `workflow` is a valid domain for this tool.
- Generative or strategic work (designing an automation from a business goal,
  drafting the notification copy) -> `talk_to_department({ domain: 'workflow', message })`,
  then PERSIST with the granular tools below. Pure CRUD and reads -> direct tools.
- **Never guess a node `type` string or a `{{...}}` expression.** Three discovery
  tools exist precisely so you do not have to, and they are cheap. See the next
  section - skipping them is the single most common cause of a broken workflow.
- **Build incrementally, not in one blob.** `workflow_node_add` / `workflow_edge_add`
  are the intended path: the server assigns ids, validates the connection, and
  version-snapshots each change with its own `change_summary`.
  `workflow_update({ definition })` REPLACES the entire graph and produces one coarse
  snapshot. `workflow_create`'s own description says to pass a whole `definition`
  "only when you already have a complete known-good graph" (from `workflow_version_get`
  or `workflow_duplicate`).
- **Create disabled, enable last.** `workflow_create` defaults `is_enabled: false`.
  Leave it false through the whole build. Enable only after validate and dry-run pass
  and the operator says yes.
- Confirm every write that can reach a customer: `workflow_enable`, `workflow_run`
  (real mode), `workflow_stranded_replay`, `workflow_delete`, `workflow_delete_schedule`.
  Reading, listing, validating and `workflow_test` are free and safe.
- Durable decisions (which template a client is on, who the recipient is, why an
  automation is deliberately disabled) -> `memory_create`. Work items ->
  `pm_tasks_create`.
- If the operator hands you an 8-character id from the dashboard rather than a UUID,
  `workflow_resolve_short_id({ short_id })` converts it. It returns 404 on no match
  and 409 with `candidates[]` when the prefix is ambiguous - pass more characters.
- Handing off to a human? `workflow_dashboard_url({ workflow_id })` returns the
  editor, runs-list, and latest-run URLs so you do not have to know the URL layout.

## The three prerequisites (call these before you build)

| Tool | Why it is mandatory |
|---|---|
| `workflow_node_types_list` | The only way to know which node `type` strings the engine accepts. Returns 260+ types with category, label, description, per-type `data` fields (required ones marked `required: true`), and outgoing-handle shapes. The exact set moves per deploy, so read the catalog, never a number or a type string from memory. |
| `workflow_templating_syntax` | The `{{...}}` reference: what the executor resolves at run time, what `trigger.output.payload` / `headers` / `query` contain, how to reference an upstream node's output, and the `{mode, value}` field modes `sendEmail` uses. Read it BEFORE you write any interpolated value. The alternative is guessing from another workflow's JSON. |
| `workflow_validate({ workflow_id })` | Server-side structural check, run after every batch of edits. Returns `{ ok, issues[], summary: { nodes, edges, triggers, errors, warnings } }`. Errors: unknown node types, missing required fields, dangling edges, duplicate ids, no trigger. Warnings: orphan nodes unreachable from any trigger, multiple triggers (**only the first fires**), self-loops, invalid source handles. |

Two more discovery tools, and the split between them matters:

- `workflow_event_trigger_types_list` - trigger NODES that fire on something happening
  INSIDE Hiveku. This is the surface for "when a deal changes stage", "when a ticket
  is assigned", "when an invoice is paid".
- `workflow_trigger_types_list` - infrastructure triggers, which are `workflow_triggers`
  table ROWS: `webhook`, `scheduled_trigger`, `database_trigger`, and the config keys
  each reads. Call it before `workflow_trigger_create`, because **config is otherwise
  untyped and unknown keys are silently ignored** - a typo'd key does not error, it
  just does nothing.

## The build loop (canonical, in order)

1. **Context.** `account_context_get({ domain: 'workflow' })`. Then `workflow_list`
   to see whether something close already exists - `workflow_clone` /
   `workflow_duplicate` beats rebuilding.
2. **Pick the trigger.** Internal business event -> `workflow_event_trigger_types_list`.
   Inbound HTTP from a site form or a third-party vendor -> `webhookTrigger` plus a
   `workflow_triggers` row. Cron -> see the scheduling section. Read the chosen entry's
   `output_shape_keys`: those are the keys available to your templates.
3. **Pick the action nodes.** `workflow_node_types_list`, read each type's `fields[]`.
4. **Read the templating reference.** `workflow_templating_syntax`.
5. **Create the shell.** `workflow_create({ name, description })`. Do NOT pass
   `is_enabled` - the default false is what you want.
6. **Add nodes one at a time.** `workflow_node_add({ workflow_id, type, data, position? })`.
   Exactly ONE trigger-category node per workflow. The server returns the node with
   its assigned id, format `<type>_<8hex>`.
7. **Connect them.** `workflow_edge_add({ workflow_id, source, target, sourceHandle? })`.
   Leave `sourceHandle` empty for most nodes (defaults to `output`). It is REQUIRED and
   specific for two: a `conditional` source must use `'true'` or `'false'`, and a
   `switch` source must use a `handleId` from its `switchConfig.cases`. Edge ids come
   back as `edge_<8hex>`.
8. **Validate.** `workflow_validate({ workflow_id })`. Fix every error and read every
   warning before moving on. An orphan node warning usually means you forgot an edge.
9. **Dry-run.** `workflow_test({ workflow_id, input_data })`. See the next section.
10. **Enable, on approval.** `workflow_enable({ workflow_id })`.

Repairing an existing workflow uses the same loop from step 3, with
`workflow_node_update` instead of `workflow_node_add`. `data` is SHALLOW-merged into
the existing data, so you patch one key without resending the node; set a key to
`null` to clear it. Every call snapshots the prior version.

## `workflow_test` is not optional

`workflow_test({ workflow_id, input_data })` is the safe dry-run, and it is the only
honest way to check a client's automation before it can reach their customers. It is
`workflow_run` with `test_mode: true`, except the MCP layer pins the flag so you
cannot forget it.

**What it skips** (no real side effect fires): outbound email, SMS, Slack and Discord
notifications; every CRM write (contact / deal / activity / company create, update,
delete, and tag changes); external HTTP `apiCall` (a mocked response shape is
returned); helpdesk ticket creates and replies; PM task writes; `dbInsert` /
`dbUpdate` / `dbDelete`; deployments and GitHub pushes; project file saves.

**What still runs** for fidelity: `transformData`, `forEach`, `switch`, `conditional`,
array ops (sort / filter / map / reduce), template resolution and flow control, and
the trigger node itself against your `input_data`.

Read the result through `workflow_run_get`: every short-circuited node carries
`__dry_run: true` and `would_have: { ...the args it would have sent }` in its
`step_states` entry. **Read `would_have` before you enable anything** - it is where
you catch the wrong recipient, the unresolved `{{...}}`, and the CRM payload with a
blank email. Also note: run quota is NOT debited, no run row is persisted, and cascade
detection is bypassed, so a test run does not pollute the client's run history.

The caveat to state out loud when you report a passing test: downstream nodes that
reference `{{nodeId.output.X}}` see the `would_have` payload or a synthetic field
(for example a fake `messageId` from `sendEmail`). Structural correctness is testable.
Real delivery is not. "The dry run passed" is not "the email will arrive".

Never reach for `workflow_run` to test. Real mode sends real notifications and burns
run quota.

## Event triggers: automating on what happens inside Hiveku

`workflow_event_trigger_types_list` is the authority at run time - always call it
rather than trusting a list in a file. As of this writing it returns 35 trigger node
types across 9 domains. Each entry carries `node_type` (snake_case canonical),
`node_type_camel` (the alias the engine also accepts), `object_type`, `event_type`,
a one-line description, and `output_shape_keys` - the keys that land in
`trigger.output` for your templates.

| Domain | Trigger node types |
|---|---|
| `crm` | `crm_contact_trigger`, `crm_deal_trigger`, `crm_deal_stage_changed_trigger`, `crm_contact_stage_changed_trigger`, `crm_contact_lead_status_changed_trigger`, `crm_activity_trigger`, `crm_task_due_trigger`, `crm_email_received_trigger`, `crm_call_logged_trigger`, `crm_sequence_enrolled_trigger`, `crm_tag_added_trigger` |
| `helpdesk` | `helpdesk_ticket_created_trigger`, `helpdesk_ticket_updated_trigger`, `helpdesk_ticket_assigned_trigger`, `helpdesk_ticket_resolved_trigger`, `helpdesk_new_message_trigger` |
| `billing` | `billing_invoice_trigger`, `billing_payment_trigger`, `billing_estimate_trigger`, `billing_subscription_trigger`, `billing_signature_trigger` |
| `shopify` | `shopify_order_trigger`, `shopify_order_created_trigger`, `shopify_order_updated_trigger`, `shopify_review_trigger`, `shopify_subscription_trigger` |
| `voice` | `voice_call_completed_trigger`, `voice_voicemail_trigger`, `voice_missed_call_trigger` |
| `pm` | `pm_task_created_trigger`, `pm_task_updated_trigger`, `pm_project_trigger` |
| `deploy` | `deploy_trigger` |
| `form` | `form_submitted_trigger` |
| `survey` | `survey_response_received_trigger` |

An event trigger needs no `workflow_triggers` row. It is a graph node and nothing
else. Only webhook, scheduled and database triggers need the row, created with
`workflow_trigger_create({ workflow_id, name, node_id, trigger_type, config })` -
`name` and `node_id` are both required, and `node_id` is the id of the trigger node
you already added with `workflow_node_add`.

## Install a template instead of running the play by hand

`workflow_templates_list` returns 16 shipped, agent-instantiable templates: 3
form/newsletter migration defaults plus 13 marketing delivery playbooks - weekly
search-terms-to-negatives for Google AND Bing, ad disapproval triage, impression-share
review, lost-backlink alert, tech-audit regression, rank-drop response, content-decay
refresh, monthly AEO visibility, GBP review SLA, weekly GBP post draft, and a Core Web
Vitals watch. **Every PPC write inside them stages to approval and never auto-applies**,
which is the safety property that makes them appropriate on a client account.

When a recurring play is identified, install it once rather than performing it every
week by hand:

```
workflow_templates_list()
  -> read the chosen template's variables[] (each has a key, a type, a required flag)
workflow_create_from_template({ slug, name?, overrides: { KEY: value, ... } })
```

The server substitutes every `{{var.NAME}}` token with `overrides[NAME]`, creates the
workflow, AND auto-provisions its webhook triggers in one call. It returns
`{ workflow_id, definition, webhook_url, webhook_triggers[] }`. A missing required
variable fails fast with a 400 - it does not silently create a half-configured
workflow. Note `is_enabled` defaults to **true** here, unlike `workflow_create`: the
workflow is live the moment the call returns, so confirm with the operator before
instantiating, or pass `is_enabled: false` and enable after review.

## Scheduling (the retainer backbone)

```
workflow_set_schedule({ workflow_id, cron_expression, timezone?, enabled? })
workflow_get_schedule({ workflow_id })
workflow_delete_schedule({ workflow_id })
```

- `cron_expression` is a 5-field cron string, e.g. `"0 9 * * 1-5"` for weekdays at 9am.
  `*`, `*/N`, ranges (`1-5`) and comma lists (`1,3,5`) are supported.
- `timezone` is an IANA name and **defaults to UTC**. A client who expects a 9am
  Monday report in Denver gets it at 2am unless you pass
  `timezone: 'America/Denver'`. Set it explicitly, every time.
- `enabled: false` pauses the SCHEDULE without disabling the whole workflow. Use it
  when you want the webhook or manual path to keep working.
- The call is an upsert that patches the workflow's `scheduledTrigger` node in place.
  It does not touch other nodes or edges.

**"My cron never ran" - check this first.** `workflow_get_schedule` returns `null`
when the workflow has no `scheduledTrigger` node at all, and it reports whether the
workflow itself is enabled, because **the schedule will not fire if the workflow is
disabled**. A disabled workflow with a perfectly good cron expression is the classic
cause. Check `next_run_at` too.

**`workflow_delete_schedule` is more destructive than it sounds.** It removes the
`scheduledTrigger` node and cascades the edges to and from it, ORPHANING whatever ran
downstream - the response warns when this happens. If you only want to stop it firing,
`workflow_disable`. Do NOT reach for `workflow_set_schedule` to switch a schedule off: `cron_expression` is in its required list, so a call that passes only `enabled: false` is rejected. Webhook and manual
triggers are unaffected either way.

## Debug ladder: an automation is not working

Run this in order. Do not skip to the interesting step.

1. **You do not know WHICH workflow broke.** `workflow_runs_recent({ status: 'failed', since })`
   is the account-wide feed across ALL workflows - default window is the last hour.
   Each entry carries `workflow_name`, `status`, `triggered_by`, `error_message`,
   `started_at`, `completed_at`, `duration_ms`. This is the right first call when a
   client says "a form is not landing": filter failed over the last 10 minutes and the
   broken workflow names itself, with no iterating over every `workflow_id`. Use it
   BEFORE `workflow_runs_list`.
2. **You know the workflow.** `workflow_runs_list({ workflow_id, status? })` for its
   own history, or `workflow_run_summary({ workflow_id, since })` for health:
   counts by status, `success_rate` (0..1), `latency_ms` percentiles
   (p50 / p95 / p99 / mean), up to 5 most-recent failures with `error_message`, and
   `last_succeeded_at` / `last_failed_at` / `last_failed_run_id`. Drill into that last
   id. It caps at 1000 runs in the window, so narrow `since` on a busy workflow.
3. **You know the run.** `workflow_run_get({ workflow_id, run_id })` for `step_states`
   - a per-node map of `{ status, input, output, error }` showing exactly what each
   node received, produced, or failed on. This is the primary debug surface.
   (`workflow_run_status` is the same payload under an older name.)
4. **You need the timeline, not the final state.** `workflow_run_logs({ workflow_id, run_id })`
   returns the engine's structured per-node lifecycle trace - config, starting,
   handler invoked, retry, timeout, completion, soft-fail - as
   `{ logs: [{node_id, node_status, ts, level, msg}], summary }`, sorted by timestamp
   and **capped at 50 lines per node** (a long handler truncates its tail). Filter with
   `node_id` or `level` (`info` | `warn` | `error`). Use it to confirm a node was
   actually reached, to see retry attempts before a final failure, to confirm a
   soft-fail fired as expected, and to audit dry-run short-circuits.
5. **Fix.** `workflow_node_update` for a config error, `workflow_edge_add` /
   `workflow_edge_delete` for a wiring error. Then `workflow_validate`, then
   `workflow_test`.

**The status vocabulary, verbatim.** `pending | waiting | running | completed |
failed | cancelled`, plus `stopped_paused`, `stopped_loop_detected`,
`stopped_rate_limit`, `stopped_circuit_breaker`. **There is no `queued` and no
`succeeded`.** Filtering `workflow_runs_recent` or `workflow_runs_list` on either
returns nothing and looks exactly like a healthy account. (`workflow_run_summary`'s
aggregate response does key one of its counts `succeeded` - that is a response field,
not a filter value. Do not send it as a `status` filter.)

## `on_error`: the cheap fix for a workflow that is already 500ing

The engine reads a per-node error mode from `node.data.config.on_error` or
`node.data.on_error`, values `'continue' | 'fail'`, defaulting to `'fail'`. On
`'fail'` a failing node stops the whole downstream path - which on a contact form
means the visitor sees "Submission failed" because a non-critical CRM upsert hiccuped.

For a workflow you are BUILDING: wire the notification and the CRM write as siblings
off the trigger, so neither can swallow the other.

For a workflow you are REPAIRING that is live and failing right now, rewiring a graph
under traffic is the risky move. One patch is safer:

```
workflow_node_update({ workflow_id, node_id, data: { on_error: 'continue' } })
```

on the non-critical leg. The run then completes with degraded steps instead of
blasting a 5xx back at the form. The soft-failed step is recorded in `step_states`
with `status: 'completed'` plus `degraded: true`, `original_error`, and
`on_error_mode: 'continue'`, and `workflow_run_logs` carries a `warn` line saying it
soft-failed - so it is visible, not silent. Downstream nodes see that node's output as
`{ __error, __degraded: true }` rather than crashing.

Do not set `on_error: 'continue'` on a node whose failure actually matters. It
converts a loud failure into a quiet one.

## Paused workflows and stranded submissions

Five consecutive failures trip the circuit breaker and auto-pause a workflow. **Its
webhook keeps accepting deliveries** - payloads are stored in `trigger_runs` and never
processed - so the client's form looks fine and their leads are invisible rather than
lost. Nothing un-pauses automatically, even after the bug is fixed. One client's forms
were down six days that way, with the cause fixed on day two.

Recovery order is strict, and each step has a guard:

1. `workflow_run_get({ workflow_id, run_id })` on the failing run - find the node that
   tripped. `workflow_runs_recent({ status: 'failed' })` finds the run if you do not
   have it.
2. Fix it (`workflow_node_update`), then `workflow_validate({ workflow_id })`, then
   `workflow_test`. Resuming a workflow that is still broken just trips the breaker again.
3. `workflow_stranded_list({ workflow_id })` - READ-ONLY. Returns the pause window,
   the count, and the stored submissions.
4. **Show the operator what would run, and get approval.** Not a count - the list.
5. `workflow_resume({ workflow_id })` - clears the pause and resets the failure
   counter. Replay is REJECTED while the workflow is still paused, so this must come
   first, and it does not run anything by itself.
6. `workflow_stranded_replay({ workflow_id, confirm: true })`.

`workflow_stranded_replay` SENDS REAL NOTIFICATIONS through the workflow's CURRENT
definition. Three things to hold:

- **`confirm: true` is required.** Without it the route returns 400. It is in the
  tool's `required[]` alongside `workflow_id`.
- **It is capped at 25 per call**, silently clamped. A 60-submission backlog needs
  three calls. Do not report a backlog as drained after one call - re-run
  `workflow_stranded_list` to confirm. Pass `trigger_run_ids` to replay a chosen
  subset instead.
- **These submissions can be days old.** Replaying a six-day outage emails a week of
  people about a form they filled in last Tuesday. Say that to the operator in those
  words before you send, and consider replaying a subset of the recent ones only.

## Rollback: you broke a client's live automation

Every definition write snapshots a version, including each granular node and edge op,
which makes this the audit log of who changed what when.

```
workflow_versions_list({ workflow_id, limit? })   // version (int), change_summary, created_at
workflow_version_get({ workflow_id, version })    // full definition for that snapshot
workflow_version_restore({ workflow_id, version })
```

- `version` is the **monotonic integer** (7), NOT the row uuid. Passing a uuid is a
  silent-looking mistake.
- `workflow_versions_list` omits the definitions to keep the payload small - read
  `change_summary` (e.g. `add node webhookTrigger_abc12345`) to find the right one,
  then `workflow_version_get` to preview what the restore will do.
- The restore snapshots the CURRENT definition first, so it is itself reversible. It
  returns `{ restored_from_version, new_snapshot_version }`.
- This is another reason to prefer granular edits: one snapshot per change gives you a
  precise rollback point, while `workflow_update({ definition })` gives you one coarse
  snapshot covering everything you did.

Roll back rather than hand-reconstructing a graph from memory.

## Wiring website forms

The per-form and whole-project paths both exist. Use the right one.

- **One form:** `workflow_bind_form({ workflow_id, project_id, form_file_path, dry_run? })`.
  Reads the form file, parses the `NEXT_PUBLIC_*_WEBHOOK_URL` env var and the field
  `name` attributes, looks up the workflow's webhook URL, and sets the project secret
  (which auto-rebuilds via the `NEXT_PUBLIC_*` path). Regex-based, not AST-based - see
  `hiveku-web-agency/references/forms.md` for the exact convention it requires and the
  warnings it emits when a form deviates.
- **Every form on a project:**
  `workflow_bulk_provision_for_project({ project_id, template_slug?, overrides?, file_paths?, dry_run? })`.
  Scans for form components and, per form, instantiates the canonical template
  (`template_slug` defaults to `contact-form-canonical`), looks up the fresh webhook
  URL, and sets the project's `NEXT_PUBLIC_*_WEBHOOK_URL` secret. Returns per-form
  `{ workflow_id, webhook_url, env_var, warnings }` plus `skipped` (no env var found,
  not a form) and `errored` lists. This is ~15 MCP calls per site collapsed to 1.
  **Always `dry_run: true` first** and read `skipped` - a form that gets skipped is a
  form whose leads go nowhere.
  `overrides` apply to ALL forms in the batch, so a site that needs a different
  recipient per form needs `workflow_create_from_template` + `workflow_bind_form`
  per form instead.
- **A bare webhook in, action out:** `workflow_provision_webhook({ name, http_method?, authentication?, is_enabled? })`
  returns `{ workflow_id, webhook_url, trigger_id }` in one shot. Two traps: it
  defaults `is_enabled: true`, so the URL is LIVE immediately, and if you pass
  `authentication: 'bearer'` the one-time `bearer_token` in the response is never
  shown again - record it at once.
- **Change who gets notified:** `workflow_set_recipient({ workflow_id, recipient, mode?, node_ids? })`
  rewrites `to` on every `sendEmail` node (or just `node_ids`). `mode` defaults to
  `'expression'`; pass `'literal'` for a hardcoded address. It snapshots before
  writing, so it is reversible via `workflow_version_restore`.
- **A public lead form's trigger must be `authentication: 'none'`.** A 401 on a form
  POST is config, not code: fix with `workflow_trigger_update({ workflow_id, trigger_id, config: { authentication: 'none' } })`.

## Deleting

`workflow_delete` is a HARD delete with no soft-archive. It cascades the workflow's
triggers, schedules, versions, runs, and dead-letter rows. Linked AI chat sessions are
unlinked rather than deleted, so the chat content survives, but the automation and its
entire history do not. Use it only when the operator has explicitly confirmed they
want that workflow gone by name. When the intent is "stop this from running",
`workflow_disable` is the answer - it keeps everything and is reversed by
`workflow_enable`.

## Pitfalls

1. **Multiple trigger nodes: only the FIRST fires.** `workflow_validate` reports this
   as a warning, not an error, so the workflow saves and enables cleanly and half of
   what you built never runs.
2. **An unresolved `{{...}}` is written through as the LITERAL string, not an error.**
   `{{body.email}}` on a form with no email field stores that text as somebody's email
   address. Read the trigger's real `output_shape_keys` or the form's real field names
   before writing an expression. `workflow_test` plus `would_have` catches this.
3. **Unknown trigger `config` keys are silently ignored.** Call
   `workflow_trigger_types_list` for the right shape rather than inventing a key.
4. **`workflow_get_schedule` returning null is not "the cron is fine".** It means
   there is no `scheduledTrigger` node.
5. **A disabled workflow's schedule does not fire**, no matter how good the cron.
6. **`workflow_node_delete` cascades every edge touching that node** - the response
   lists the removed edge ids. Read them; that is your rewiring list.
7. **`workflow_create_from_template` and `workflow_provision_webhook` default to
   enabled.** `workflow_create` and `workflow_clone` default to disabled. Do not
   assume one behavior across all four.
8. **Every text and recipient field on a node is a `{"mode":"expression","value":"..."}`
   OBJECT, not a plain string.** Only `label` stays plain. Re-get the node after a
   create or update to confirm the field actually landed.
