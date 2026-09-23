---
description: Build, test, and ship a Hiveku workflow. Discover node types, wire it, validate, dry-run, then enable on approval.
argument-hint: "[what should happen, e.g. 'when a deal hits Won, notify the rep and create a PM task']"
---
Build an automation for THIS account$ARGUMENTS. You do the build; the human approves the enable.
Never hand-author a whole `{nodes, edges}` blob. Use the granular tools so every change is
version-snapshotted and server-validated.

1. Context: `account_context_get({ domain: "workflow" })`. Then `workflow_list`. If something close
   already exists, `workflow_clone({ workflow_id, new_name, overrides? })` (clone starts disabled)
   beats rebuilding. And before hand-building anything recurring, call `workflow_templates_list`: the
   catalog is the form/newsletter migration defaults plus the standing SEO/PPC/reputation delivery plays
   (read the returned `count` rather than assuming a number - the catalog grows between releases); install one with
   `workflow_create_from_template({ slug, overrides })` (it defaults to `is_enabled: true`, so
   confirm first or pass `is_enabled: false`; an enabled create is never refused for validation,
   so read its `validation_warning` and fix or disable at once).
2. Discover, do not guess. `workflow_event_trigger_types_list` for a trigger that fires on an
   internal Hiveku event (CRM, helpdesk, billing, shopify, voice, pm, deploy, form, survey);
   `workflow_trigger_types_list` for webhook / scheduled_trigger / database_trigger config keys
   (a webhook row echoes unknown keys back; on the others they are SILENTLY IGNORED).
   `workflow_node_types_list` for the action node `type` strings and each type's required `data`
   fields (`required` / `requiredOneOf` / `requiredWhen`, node-level `requires`; `inferred: true`
   is never a requirement; `configLocation: 'flat'` nodes ignore `data.config`, and
   `'configOrData'` nodes read `data.config` whole once it exists, so keep every key there; the
   DB triggers' `'databaseTriggerConfig'` reads `data.databaseTriggerConfig`, else `data.config`,
   else `data`).
   `workflow_templating_syntax` before you write any `{{...}}` value: `{{ref || default}}` is the
   fallback (used when the ref is missing, null or blank, in every node and in dry runs); a single
   `|` or `or` is not one.
3. Build it: `workflow_create({ name, description })`, leaving `is_enabled` at its default false.
   Then `workflow_node_add({ workflow_id, type, data, position? })` per node (exactly ONE
   trigger-category node), then `workflow_edge_add({ workflow_id, source, target, sourceHandle? })`.
   Leave `sourceHandle` empty except on a `conditional` source (MUST be `'true'` or `'false'`) and a
   `switch` source (a `handleId` from its `switchConfig.cases`). Prefer parallel to series: the
   notification and the CRM write are SIBLINGS off the trigger, so neither can swallow the other.
   Read `config_incomplete` / `missing_required_fields` on every node_add and node_update response.
   A `webhookTrigger` node_add creates the trigger row and returns `webhook_url`: the path is
   server-assigned (your `webhookPath` is only a label), so hand senders that URL and never call
   `workflow_trigger_create` for the same node. The node's auth counts only when that call
   creates the trigger; afterwards a node edit never changes the live URL's auth (it warns
   `auth_not_applied`): use `workflow_trigger_update` (`filter_config`) or
   `workflow_webhook_auth_set`, each on the operator's yes.
4. Validate: `workflow_validate({ workflow_id })`. Fix every error and read every warning. "Multiple
   triggers" is a warning, and it means only the FIRST one fires. A node no trigger reaches is an
   orphan warning, and its missing fields are warnings too (`unreachable: true`): connect it or
   delete it.
5. Dry-run, while it is still DISABLED: `workflow_test({ workflow_id, input_data })` fires NO real
   emails, Slack posts, CRM writes, HTTP calls, tickets, PM writes, DB writes, deploys or AI agent
   turns (a code node gets no network either: its `fetch` answers a synthetic 200, and any
   other network module or socket throws), and burns no run quota. It runs the WHOLE
   graph, and credentials in its report read `'[redacted]'`. Read the evidence out of the CALL'S OWN
   RESPONSE: a test persists no run row, so `run_id` comes back null and `workflow_run_get` has
   nothing to fetch. `data.step_states[<nodeId>]` reports every node: `dry_run: true` marks a
   simulated one, whose `output.would_have` is the config it would have sent and whose
   `template_values` lists every `{{token}}` with its status (`resolved`, `empty`, `default`,
   `missed`, `literal`, `upstream_simulated`, `not_evaluated`). `data.not_reached` lists nodes the
   run never got to (an untaken branch, or everything after a failure), and `data.output` is the
   terminal node's output. Confirm the real recipient, body and CRM fields there before anything
   goes live: `missed`, `empty` and `literal` are the broken merges a customer would see. Dry-run
   each branch. A test from before the 2026-09 fix stopped at the first simulated node, so re-run
   it. Never use `workflow_run` to test. That sends for real.
6. Schedule it, if it is recurring: `workflow_set_schedule({ workflow_id, cron_expression, timezone })`.
   5-field cron, and `timezone` DEFAULTS TO UTC, so pass the client's IANA zone explicitly or a
   9am report lands at 2am. Read it back with `workflow_get_schedule`.
7. Enable only after the operator says yes: `workflow_enable({ workflow_id })`. It re-runs
   validation and refuses with 422 `workflow_invalid` (listing the `issues`) while any node a run
   can reach is incomplete: fix those nodes. Pass `allow_incomplete: true` only when the operator, told which
   nodes will fail, explicitly says to enable anyway. Hand off with
   `workflow_dashboard_url({ workflow_id })` so they can watch it in the editor.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.

If you are DEBUGGING rather than building: `workflow_runs_recent({ status: "failed", since })` is
account-wide and tells you WHICH workflow tripped, then `workflow_run_get` for per-node `step_states`,
then `workflow_run_logs` for the timeline, then `workflow_node_update` to fix. Status vocabulary is
`pending | waiting | running | completed | failed | cancelled` plus `stopped_*`; there is no `queued`
and no `succeeded`. If the workflow is auto-paused, the order is strict and every step matters:
fix, `workflow_validate`, `workflow_stranded_list` (read-only), show the operator the stored
submissions and get approval, `workflow_resume`, then `workflow_stranded_replay({ workflow_id, confirm: true })`.
`confirm: true` is required (400 without it), it is capped at 25 per call, and it sends REAL emails to
people about forms they may have filled in days ago. To bail out of a bad edit,
`workflow_versions_list`, then `workflow_version_restore({ workflow_id, version })` (`version` is the
monotonic integer, not a uuid).

Load the `hiveku-automation-agency` skill for the full manual.
