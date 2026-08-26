---
description: Standup — account health, what's blocked on a human, what's next, breached, stalled, milestones.
---
Standup.

1. **Ground it.** `account_audit_health({ account_id })` (the account UUID from `get_account_info`; the key
   is pinned to one account, so it must be that one). One call returns counts and last-activity timestamps
   for memory, Mission Control, PM tasks, sites, MCP keys and CRM contacts, plus a derived `drift_flags[]`
   (`no_memory_entries`, `mcp_inactive_14d`, `mission_control_stale_3d_with_pending_decisions`, and so on)
   and a `drift_score`. Lead the standup with any flag it raises.

2. **Pull the four queues.**
   - `mc_decisions_pending` — everything sitting at `awaiting_human`, bucketed P0/P1/P2/P3. This is the
     blocked list and it is the part the operator actually has to act on.
   - `mc_tasks_next({ assignee, limit: 25 })` — ready-to-work cards only (`open`, `awaiting_agent`,
     `in_progress`). It STRUCTURALLY EXCLUDES `awaiting_human`, so it is never the whole picture on its own.
     Default limit is 5 and max is 50; pass `limit` or you report five cards. Filter by `assignee` or you
     get the entire account.
   - `mc_sla_breached` — past the priority-derived SLA (P0 1h, P1 4h, P2 24h, P3 168h by default). Each row
     carries `age_hours`, `sla_hours`, `over_by_hours`; quote those, do not estimate.
   - `mc_tasks_stalled` — no event at all (status change, comment, claim) in N hours, default 48. Stricter
     than `mc_tasks_aged`, which only measures `updated_at` and is reset by any nudge. Returns
     `hours_since_last_event`, so sort most-stale first.

   Then `pm_milestones_list` for delivery dates.

3. Report per project: on-track / at-risk / blocked, with the ONE next action each. Every card blocked on a
   human names who it is waiting on and how long it has been waiting. Do not present the `mc_tasks_next`
   list as "the queue" without the pending-decisions bucket beside it.

4. **Close the loop on every card resolved this session.** `mc_decision_to_memory({ id, memory_domain })`
   promotes the card's decision into durable account memory, so the answer is inherited by future agents
   instead of disappearing into card history. It composes the entry from the card title, the chosen
   option, the answer, the decider and the date (`summary` overrides that) and appends the card link, and
   it returns the `memory_entry_id`. The card must already be resolved with `decision_answer` set or it
   returns 412 `code='not_resolved'`. `memory_domain` follows the same canonical-department rule as
   `memory_create` — see hiveku-orient.

5. Save the standup note to memory (name "workflow"). Finish every session of work the same way: persist notable learnings to department memory — read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
