---
description: Build, test, and ship a Hiveku workflow. Discover node types, wire it, validate, dry-run, then enable on approval.
argument-hint: "[what should happen, e.g. 'when a deal hits Won, notify the rep and create a PM task']"
---
Build an automation for THIS account$ARGUMENTS. You do the build; the human approves the enable.
Never hand-author a whole `{nodes, edges}` blob. Use the granular tools so every change is
version-snapshotted and server-validated.

1. Context: `account_context_get({ domain: "workflow" })`. Then `workflow_list`. If something close
   already exists, `workflow_clone({ workflow_id, new_name, overrides? })` (clone starts disabled)
   beats rebuilding. And before hand-building anything recurring, call `workflow_templates_list`: 19
   templates ship, and 16 of them are the standing SEO/PPC/reputation delivery plays (read the
   returned `count` rather than assuming - the catalog grows between releases); install one with
   `workflow_create_from_template({ slug, overrides })` (it defaults to `is_enabled: true`, so
   confirm first or pass `is_enabled: false`).
2. Discover, do not guess. `workflow_event_trigger_types_list` for a trigger that fires on an
   internal Hiveku event (CRM, helpdesk, billing, shopify, voice, pm, deploy, form, survey);
   `workflow_trigger_types_list` for webhook / scheduled_trigger / database_trigger config keys
   (unknown keys are SILENTLY IGNORED). `workflow_node_types_list` for the action node `type`
   strings and each type's required `data` fields. `workflow_templating_syntax` before you write
   any `{{...}}` value.
3. Build it: `workflow_create({ name, description })`, leaving `is_enabled` at its default false.
   Then `workflow_node_add({ workflow_id, type, data, position? })` per node (exactly ONE
   trigger-category node), then `workflow_edge_add({ workflow_id, source, target, sourceHandle? })`.
   Leave `sourceHandle` empty except on a `conditional` source (MUST be `'true'` or `'false'`) and a
   `switch` source (a `handleId` from its `switchConfig.cases`). Prefer parallel to series: the
   notification and the CRM write are SIBLINGS off the trigger, so neither can swallow the other.
4. Validate: `workflow_validate({ workflow_id })`. Fix every error and read every warning. "Multiple
   triggers" is a warning, and it means only the FIRST one fires.
5. Dry-run: `workflow_test({ workflow_id, input_data })` fires NO real emails, Slack posts, CRM
   writes, HTTP calls, tickets, PM writes, DB writes, or deploys, and burns no run quota. Then
   `workflow_run_get({ workflow_id, run_id })` and read each node's `would_have` payload to confirm
   the real recipient, body, and CRM fields before anything goes live. Never use `workflow_run` to
   test. That sends for real.
6. Schedule it, if it is recurring: `workflow_set_schedule({ workflow_id, cron_expression, timezone })`.
   5-field cron, and `timezone` DEFAULTS TO UTC, so pass the client's IANA zone explicitly or a
   9am report lands at 2am. Read it back with `workflow_get_schedule`.
7. Enable only after the operator says yes: `workflow_enable({ workflow_id })`. Hand off with
   `workflow_dashboard_url({ workflow_id })` so they can watch it in the editor.
8. Finish every session of work the same way: persist notable learnings to department memory. Read
   the current document FIRST with `memory_list({ domain: "workflow" })`, which returns the row's
   `id` and its WHOLE `content`. Append your note to that text and send the full merged body to
   `memory_update({ memory_id, content })`, which REPLACES the document: sending only the new note
   wipes everything the workflow department had accumulated. The prior content is snapshotted before
   the overwrite, so a bad write is recoverable with `memory_list_versions({ memory_id })` then
   `memory_restore_version({ version_id })`. Use `memory_create({ type: "memory", name: "workflow",
   content })` only when no entry exists yet.
   Then reflect the work in Hiveku PM: `pm_projects_list` to find or `pm_projects_create` the project,
   then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`),
   `pm_tasks_complete({ id, summary })` when the loop is closed.

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
