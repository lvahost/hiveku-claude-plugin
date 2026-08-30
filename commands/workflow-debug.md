---
description: "\"This automation stopped working\" / \"it says it ran but nothing happened\" / \"the form stopped emailing us\" - the triage ladder end to end: is it enabled, is it paused, did it run at all, did runs fail, did steps degrade, are submissions stranded, then the confirm-gated recovery. Reads first; the fix, the resume, and the replay are each their own yes."
argument-hint: "[which automation, and the symptom - e.g. 'the contact form notification, stopped last Tuesday']"
---
Triage a broken automation on the account this directory is bound to$ARGUMENTS. Run the ladder IN
ORDER. Do not skip to the interesting step: the boring steps are the ones that are usually true,
and each step you finish RULES SOMETHING OUT, which is what makes the next answer mean anything.
Follow the **hiveku-automation-agency** skill, and load `references/reliability.md` before you draw
a conclusion. That file carries the deep detail this command deliberately does not repeat (Part 1
the full ladder, Part 2 the six ways a run is green and not green, Part 3 the status vocabulary
trap, Part 4 reading a failed run, Part 5 retries and duplicate sends, Part 6 recovery). Before any
causal story ("the platform broke"), rule out the measurement artifacts that mimic every outage: a
status filter outside the real vocabulary, a disabled workflow, a paused workflow banking
submissions, the wrong cron rail, and a UTC schedule the client reads as local.

1. **Name the workflow.** `workflow_list({ search })`, or `workflow_resolve_short_id({ short_id })`
   for the 8-character id from the dashboard (it 404s on no match and 409s with `candidates[]` on
   an ambiguous prefix). If the client is describing a BEHAVIOUR rather than a workflow ("the
   auto-reply on tickets"), consider that no workflow owns it at all and jump to step 7.
2. **Is it enabled?** `workflow_get({ workflow_id })`. A disabled workflow fires on nothing: not
   its webhook, not its schedule, not an internal event. It writes no run rows and logs no
   failures, so it is identical in every run-history tool to a workflow nobody triggered.
   `is_enabled: false` explains everything downstream, so STOP the ladder there, find out who
   switched it off and when (`audit_query({ tool_contains: 'workflow_disable' })` names the key and
   the time), and do not re-enable something whose disabling may have been deliberate without the
   operator's yes. `is_enabled: true` rules out only this: an enabled workflow can still be
   auto-paused, which is next.
3. **Is it paused, and why?** The highest-yield step on the ladder and the one most often skipped,
   because a paused workflow produces the least evidence of anything being wrong.
   `workflow_stranded_list({ workflow_id })` is READ-ONLY and returns the pause window, the count,
   and one row per submission with its trigger_run_id, arrival time, form name and payload KEYS (field names only, never the values: a stranded payload can hold personal data, so you can say how many leads are waiting and which form they came from, but you cannot read the operator their names). Five consecutive failures trip the circuit breaker and pause the
   workflow; a paused workflow REJECTS triggers and the rejection writes NO run row, which is the
   exact signature of "it just stopped and there are no errors", while the webhook keeps accepting
   and storing deliveries so the client's form still returns a success page. The count is a LEAD
   count: those submissions are invisible, not lost. A run history that simply stops on a date with
   the last few runs failing and nothing after is the fingerprint. Do not resume yet. Do not go
   hunting for the pause in run rows instead: `stopped_paused` is recorded for internal event
   triggers ONLY and caps at 200 rows per pause window, and stranded webhook deliveries produce no
   such row at all.
4. **Did it run at all?** `workflow_runs_recent({ status: 'failed', since })` first when you are
   not certain which workflow is involved: it is account-wide, and every entry carries
   `workflow_name` and `error_message`, so the broken workflow names itself. Its default window is
   ONE HOUR, so widen `since` deliberately or yesterday's outage shows nothing and nothing looks
   like health. Then `workflow_runs_list({ workflow_id, status? })` for this workflow's own
   history. Three answers, three next steps: runs exist and some failed, go to 5; runs exist and
   all completed, go to 6 because the run is lying to you; no runs in the window, widen `since` and
   then go to 7. **Zero runs is UNKNOWN, never healthy.**
5. **Did runs fail, and how consistently?** `workflow_run_summary({ workflow_id, since })` returns
   counts by status, `success_rate`, latency percentiles, up to 5 recent failures with
   `error_message`, and `last_succeeded_at` / `last_failed_at` / `last_failed_run_id`. Read the
   SHAPE, not just the rate. Five consecutive failures then silence is a circuit-breaker pause, so
   go back to step 3. A steady 85 percent is a flaky dependency. A cliff on one date is a change:
   `workflow_versions_list({ workflow_id })` and `audit_query` name what changed and who changed
   it. The summary caps at 1000 runs per window, so narrow `since` on a busy workflow rather than
   quoting a truncated sample as the whole picture.
6. **Did the steps DEGRADE?** `workflow_run_get({ workflow_id, run_id })` for `step_states`, the
   per-node map of `{ status, input, output, error }` showing what each node received, produced, or
   failed on. This is the answer to the most common report of all, "it says it worked but nothing
   happened": a node with `on_error: 'continue'` that FAILS records as completed with a `degraded`
   flag plus `original_error` and `on_error_mode`, and the run finishes GREEN. A run whose every
   action step is degraded reports success and did nothing at all, and no status filter or summary
   will ever show it to you. While you are in `step_states`, read `unresolved_templates` on every
   step: each `{{...}}` that resolved to nothing with no `||` default is written through as a blank
   or as the literal string, which is how "Hi ," reaches a client's list from a run that looks
   perfect. Then `workflow_run_logs({ workflow_id, run_id })` for the per-node lifecycle timeline
   when you need to confirm a node was actually reached or to see the retries before a final
   failure: capped at 50 lines per node, filterable by `node_id` or `level`.
   (`workflow_run_status` is the same payload as `workflow_run_get` under an older name.)
7. **Is the trigger on the rail you think it is?** If there are no runs and no pause, the trigger
   never reached the engine. `workflow_triggers_list({ workflow_id })` for the webhook,
   scheduled-trigger, and database-trigger ROWS, and `workflow_trigger_get({ trigger_id })` for one
   config in full. An EMPTY list is expected and correct for an internal event trigger, which is a
   graph node and needs no trigger row. `workflow_get_schedule({ workflow_id })` returning null
   means there is no scheduled trigger node at all; it does not mean the cron is fine. The schedule
   also reports whether the workflow is enabled, because a disabled workflow's schedule never
   fires. A cron that belongs to a website project is a different rail with incompatible syntax and
   is invisible to every workflow tool: `project_crons_list({ project_id })` and
   `project_cron_logs` for `success | failure | timeout` per execution. One cause outside the
   workflow rail entirely: tickets auto-replying with no workflow to explain it is usually the
   account's helpdesk automation config, `helpdesk_automations_get` (`auto_acknowledge`,
   `auto_assign`, `sla`, `csat_survey`, `auto_close`, `team_notifications`), read-only via Olympus
   with writes through the dashboard. Flag it rather than hunting for a workflow that does not
   exist.
8. **Fix, then PROVE the fix.** `workflow_node_update` for a config error, `workflow_edge_add` and
   `workflow_edge_delete` for a wiring error. Or roll back: `workflow_versions_list` to find the
   good version by its `change_summary`, `workflow_version_get` to preview it, and
   `workflow_version_restore` to apply it (it snapshots the current definition first, so it is
   itself reversible, and `version` is the monotonic integer, not the row uuid). Then
   `workflow_validate({ workflow_id })`, fixing every error and reading every warning, then
   `workflow_test({ workflow_id, input_data })`. Read the evidence out of the CALL'S OWN RESPONSE: a
   test persists no run row, so `run_id` comes back null and `workflow_run_get` has nothing to
   fetch. Every mocked node contributes `__dry_run: true` plus `would_have` (the args it would have
   sent), and that is where you confirm the real recipient, body, and fields before anything goes
   live. Never use `workflow_run` to test. That sends for real.
9. **Recovery, in this order, each step gated.** Fix before resume, resume before replay. Resuming
   a workflow whose cause is unfixed just trips the breaker again, and the second outage costs more
   trust than the first.
   - `workflow_resume({ workflow_id })` clears the pause and resets the failure counter. It runs
     nothing by itself, and it must come FIRST: a replay against a still-paused workflow is
     refused.
   - Re-read `workflow_stranded_list({ workflow_id })` and **show the operator the LIST with dates,
     not a count.** This is the step that catches the replay that should not happen. Get an
     explicit yes.
   - `workflow_stranded_replay({ workflow_id, confirm: true })`. `confirm: true` is required (400
     without it), it is capped at 25 per call and SILENTLY clamped, so a 60-submission backlog is
     three calls, and `trigger_run_ids` replays a chosen subset. Re-run `workflow_stranded_list`
     afterwards to verify the drain; never report a backlog as drained after one call.
   - **A replay sends REAL notifications through the workflow's CURRENT definition, to people whose
     submissions may be days old.** Replaying a six-day outage emails a week of people about a form
     they filled in last Tuesday. Say that to the operator in those words before you send.
   - **Per-run send-once idempotency does NOT protect a replay.** The key is
     `(workflowId, nodeId, sendScope)` and it is scoped to ONE run, so a replay, being a NEW run,
     never sees the original send. A replay can therefore duplicate a message that already went out
     through some other path, and the only protection is the list review above. Default to a
     `trigger_run_ids` subset of the most recent, and never bulk-replay anything that moves money
     or writes a ledger row, time-bound messages whose moment has passed (appointment reminders,
     "your call is in 10 minutes", expiring offers), enrollments and campaign starts, SMS (where a
     duplicate is a compliance problem as well as an annoyance), or anything a human already
     handled by hand during the outage, which is most of a long outage's backlog.
   - "The forms have been down all week, just resume it and replay everything right now, skip the
     review" gets this order, not obedience. There is no skip-the-list path, and re-POSTing the
     stored payloads at the live webhook yourself to dodge the confirm gate is the same send
     without the bookkeeping.
10. **Close the loop.** Hand over with `workflow_dashboard_url({ workflow_id })` so the operator can
   watch it in the editor, say plainly what broke and what is now different, and for anything the
   client depends on turn on per-run failure alerting when you enable it, so the NEXT outage tells
   someone instead of waiting for a sweep. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
