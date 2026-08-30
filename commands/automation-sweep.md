---
description: "\"Are our automations still running?\" / \"is anything broken that nobody told us about?\" - the weekly automation sweep: account-wide failed runs, per-workflow health, schedule sanity, paused workflows and the leads stranded behind them, and the staged inbox queue. Read-only until the last step, and every fix is a separate confirmed action."
argument-hint: "[optional scope - e.g. 'last 14 days' or 'just the lead-notification workflows']"
---
Weekly automation sweep for the account this directory is bound to$ARGUMENTS. Automations rot
silently: a paused workflow banks invisible submissions, a staged queue fills, a schedule drifts,
and none of it announces itself. You are looking for the rot, not building anything. Read-only
until the last step. Follow the **hiveku-automation-agency** skill; the depth behind every check
below is `references/reliability.md` (Part 8 is this pass, Part 1 is the ladder you drop into the
moment a check fails). When one automation is already known to be broken, run
`/hiveku:workflow-debug` on it instead of widening this sweep around it.

1. **Scope it before you read anything.** `account_context_get({ domain: "workflow" })` for the
   rules: which automations the client depends on, which are deliberately off, who is supposed to
   be notified. Then `workflow_list` for the full inventory with `is_enabled`. Fix the window now
   (default the last 7 days) and write it down, because every number in the report carries it. A
   workflow the context says is deliberately disabled is not a finding; one nobody can account for
   is.
2. **Account-wide failures first.** `workflow_runs_recent({ status: 'failed', since })` covers ALL
   workflows in one call and names the broken one for you: each entry carries `workflow_name`,
   `error_message`, `triggered_by`, and timings. Its default window is ONE HOUR, so pass `since`
   explicitly or a week-old outage reads as silence. The status vocabulary is
   `pending | waiting | running | completed | failed | cancelled` plus `stopped_*`. There is no
   `queued` and no `succeeded`; filtering on either returns an empty list that looks exactly like a
   healthy account.
3. **Per-workflow health.** `workflow_run_summary({ workflow_id, since })` on every enabled
   workflow the client depends on: `success_rate`, latency percentiles, `last_succeeded_at`,
   `last_failed_at`, and `last_failed_run_id` to drill into. Compare each workflow against its OWN
   prior window, never against a different workflow with different triggers and volumes. The
   summary caps at 1000 runs in the window, so if you hit the cap, narrow `since` before quoting a
   `success_rate` and mark that workflow PARTIAL.
4. **Spot-check a GREEN run, not only the failures.** `workflow_run_get({ workflow_id, run_id })`
   on `last_failed_run_id` AND on one recent completed run per workflow. In `step_states`, read
   `degraded` on every step: a node with `on_error: 'continue'` that FAILS records as completed
   with `degraded`, `original_error`, and `on_error_mode`, and the run finishes green, so a run
   whose every action step is degraded reports success and did nothing at all. Read
   `unresolved_templates` in the same place: every `{{...}}` that resolved to nothing with no `||`
   default is written through as a blank, which is how "Hi ," reaches a client's list from a run
   that looks perfect in every summary. This is the step everyone skips and it is where the silent
   breakage lives. `workflow_run_logs({ workflow_id, run_id })` gives the per-node timeline when
   you need to see retries, capped at 50 lines per node.
5. **Schedule sanity.** `workflow_get_schedule({ workflow_id })` on every automation the client
   believes is scheduled, and check three things: it is non-null, the WORKFLOW itself is enabled (a
   disabled workflow's schedule never fires no matter how good the cron), and `next_run_at` is
   right in the CLIENT's timezone, since `timezone` defaults to UTC and that is why a 9am Monday
   report lands at 2am in Denver. **A null schedule on a workflow the client believes is scheduled
   is a FINDING, not a skip**: it means there is no scheduled trigger node at all and nobody has
   noticed. If the recurring job actually lives on a website project, that is the other cron rail
   entirely and is invisible to every workflow tool: `project_crons_list({ project_id })` and
   `project_cron_logs` for `failure` or `timeout` rows piling up.
6. **Paused workflows and the leads behind them.** `workflow_stranded_list({ workflow_id })` on
   anything paused or recently failing. It is READ-ONLY and returns the pause window, the count,
   and the stored submissions. Five consecutive failures trip the circuit breaker and pause a
   workflow; a paused workflow rejects triggers and writes NO run row, while its webhook keeps
   accepting and storing deliveries, so the client's form still says "Thanks!" and their leads are
   invisible rather than lost. Nothing un-pauses itself, even after the bug is fixed. A non-zero
   count is a LEAD count and goes to the top of the report. Do not resume and do not replay from
   this pass: that is `/hiveku:workflow-debug`, in its strict order, with its own approval.
7. **The staged inbox queue.** `agent_inbox_list` for the open items (it defaults to `new,seen`),
   and `agent_inbox_get` on anything worth reading in full. A staged item nobody has worked is a
   decision the client is still waiting on. Reading is free. Applying an item happens through its
   own surface, and `agent_inbox_resolve` is a WRITE that never executes the item, so both are
   confirmed one at a time, and you dismiss only what is deliberately rejected.
8. **Report honestly, then propose.** Open with the window and the coverage list: which workflows
   you checked, and which you did not.
   - **ZERO runs in the window is UNKNOWN, not passing.** Write "no runs in window" and leave it
     there. It is equally consistent with "nobody submitted the form this week", "the workflow is
     paused", "the trigger was never wired", and "the status filter was outside the vocabulary".
     Never fold it into a green line, and never report a client's automations as healthy on the
     strength of a window in which nothing ran.
   - **A summary that hit its 1000-run cap is PARTIAL.** Say so beside the number, or narrow
     `since` and read it again.
   - Anything you could not check gets named with its reason (a failed read, a key whose profile
     hides the family, an unbound directory). A failed read is never a zero, and an unknown never
     quietly becomes a pass.
   Then a ranked list of PROPOSALS, each with its evidence (run ids, counts, the tool that produced
   it) and the ONE next action, naming the play that does it: `/hiveku:workflow-debug` for a broken
   automation, `/hiveku:automate` for a rebuild or a schedule change. Nothing is fixed, enabled,
   resumed, replayed, or deleted from this pass. Each fix is a separate action with its own
   confirmation.
9. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
