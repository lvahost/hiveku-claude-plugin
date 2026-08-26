---
description: Triage Mission Control intake - classify, route, raise decisions, spawn the PM work.
---
Triage pass over the account's Mission Control board. MC is the intake and decision surface; PM is where
the work is tracked. They are separate systems joined by a bridge (see the `hiveku-pm-mission-control` skill).

1. **Read the board.** `mc_lanes_list` first. It returns each lane with per-status counts plus
   `uncategorized_counts`, and the first read of an account that has never used Mission Control SEEDS the
   default lanes (Intake, Decisions, Discoveries, Doing, Done), so a new client's board is empty until you
   call it. Then pull the untriaged cards: `mc_tasks_list({ lane_id: "null" })` for uncategorized intake
   (the literal string "null" is the documented filter for no-lane) and `mc_tasks_list({ lane_id: <Intake uuid> })`.
   Status is a FIXED vocabulary: `open | in_progress | awaiting_human | awaiting_agent | done | archived`.
   There is no "pending" and no unassigned filter (`assignee` is a free-form substring match). Default
   limit 50, max 200.

2. **Bring in anything that arrived outside the board.** A new request from Slack, email, a webhook, or a
   form goes through `mc_intake_external({ title, source, body, source_ref, source_channel_name,
   auto_route_above: 0.8, candidate_assignees })` (required: `title` + `source`). That single call creates
   the card with a source chip for traceback AND classifies it; at or above the threshold it lands in Doing
   with the suggested priority and assignee applied, below it lands in Intake with the classification
   stamped in `meta` for the human. For a card already on the board, `mc_intake_classify({ title, body, source })`
   returns a SUGGESTION only. It writes nothing. Apply what you accept with `mc_task_update`. Both classify
   paths return 503 `code='llm_unavailable'` when the account has no OpenRouter key configured; fall back
   to manual triage and say so.

3. **Route it.** Propose assignee + lane + priority (P0-P3), and on approval apply it. Field edits go
   through `mc_task_update` (`lane_id` is a lane UUID from step 1). A plain status push goes through
   `mc_task_transition({ id, to_status, comment })`, which also stamps `resolved_at` on `done`. Confirm each.
   NEVER transition a card that carries `decision_options` to `done`: that silently discards the
   structured-answer slot and every polling agent then reads `answer: null`. Those close via `mc_task_decide`.

4. **Anything needing a human decision gets RAISED, not answered.** Create the ask:
   `mc_task_create({ title, body, status: "awaiting_human", priority, decision_options: [{ key, label, description }] })`.
   Max 20 options, six or fewer is the working limit, and the UI auto-appends a reserved `OTHER` row, so
   never send `OTHER` as one of your own keys. List everything already waiting with `mc_decisions_pending`
   (status `awaiting_human`, bucketed P0/P1/P2/P3, ready to drop into the summary). Poll with
   `mc_decision_check` and honor the `retry_after_seconds` it returns (P0 30s, P1 2m, P2 15m, P3 6h).

   `mc_task_decide` is NOT a queue. It SUBMITS an answer a human already gave, validates `chosen_key`
   against that card's `decision_options`, and by default closes the card. Call it only as the courier for
   a real human choice, and pass `acting_as_user_id` (the `id` field from `crm_list_users`, a public_users
   UUID, NOT `clerk_user_id`). Omit it and the card resolves with `decided_by_user_id: null` and the event
   log records `agent_relay: true`, which reads in an audit as the agent deciding unilaterally. If another
   user has claimed the card you get 409 `code='claim_held_by_other'`; do not pass `force: true` without
   asking the operator first. Use `also_resolve: false` when the answer unblocks you but the work is not done.

   When a decision resolves, promote it: `mc_decision_to_memory({ id, memory_domain: "<dept>" })`. It
   composes the entry from the card title, chosen label, answer text, decider and date, and returns
   `memory_entry_id`. Returns 412 `code='not_resolved'` if `decision_answer` is not set. `memory_domain`
   follows the same canonical-department rule as `memory_create` (see hiveku-orient) - a non-canonical
   value like `pm` or `crm` files the entry with department NULL and no agent ever hydrates it. This is
   what stops the next agent on this account from re-litigating a settled call.

5. **Spawn the work, linked.** A triaged card that means real work becomes a PM task with
   `mc_task_spawn_pm({ id, project_id })`, not a bare `pm_tasks_create`. It creates the pm_task, links it
   both ways, maps P0 to urgent / P1 to high / P2 to medium / P3 to low, defaults `status: 'queued'` and
   `task_type: 'marketing'`, and writes an `ai_metadata.spawned_from` back-reference so a later agent can
   pull the decision context with `pm_task_get_mc_link`. `project_id` is a pm_projects UUID from
   `pm_projects_list`. Returns 409 if the card is already linked (pass `force: true` to replace). After any
   pm_task status change, run `mc_task_mirror_from_pm({ id })` to keep the card in step (412 if unlinked,
   `no_change: true` if it already matches).

6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
