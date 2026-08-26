---
name: hiveku-pm-mission-control
description: How Hiveku's two work systems fit together — Mission Control (the HITL inbox and decision board) and PM (projects, tasks, milestones, recurrences) — and the bridge tools that link a card to a task. Use for ANY work involving triage, intake from Slack/email/webhooks, raising a decision to a human and waiting on the answer, kanban lanes, card templates, recurring retainer deliverables, reopening a task closed too early, or reading the client annotations attached to a PM task.
---

# Mission Control and PM

Two separate systems. Mixing them up is the single most common way agency work goes untracked.

- **Mission Control (`mc_*`)** is intake, decisions and hand-offs. Cards are the universal
  human-in-the-loop surface: an agent drops a decision, a discovery, or a hand-off here and a human
  sees it in one place. Status vocabulary is FIXED:
  `open | in_progress | awaiting_human | awaiting_agent | done | archived`. There is no "pending",
  no "todo", no "blocked". Lanes are the per-account kanban columns.
- **PM (`pm_*`)** is the client-visible work record: projects, tasks, subtasks, sections,
  milestones, comments, attachments, recurrences. This is what shows up in a status report.

A card is the WHY. A task is the WORK. Never let one exist without the other for real work.

## Ids

- `project_id` on every `pm_*` tool is a **pm_projects** UUID from `pm_projects_list` or
  `pm_projects_create`. Note the asymmetry: `pm_projects_create` takes a `project_type`
  (`app_dev | website | seo | marketing | ppc`), but `pm_projects_list` accepts only `status` in its
  schema even though its description mentions project_type filters, so that argument is dropped by
  the proxy and you filter the returned list yourself. `list_projects` and
  `get_project` are the same pm_projects space.
- `project_id` on every builder tool (files, preview, deploy, CMS, env, domains) is a
  **website_projects** UUID from `sites_list` / `project_get`. Passing one to the other 404s.
  `pm_projects_create` takes `website_project_id` to link a PM project to its site.
- `assigned_to_id`, `acting_as_user_id`, `project_manager_id` and friends are **public_users** UUIDs:
  the `id` field from `crm_list_users`, NOT `clerk_user_id`. Sending a Clerk id into a uuid column
  errors the whole write.

## The board

`mc_lanes_list` is the first call of any Mission Control session. It returns each lane with
per-status counts plus `uncategorized_counts`, and **the first read seeds the default lanes**
(Intake, Decisions, Discoveries, Doing, Done) for an account that has never used Mission Control.
Skip it on a newly onboarded client and the board stays empty.

- `mc_lane_create({ name, description, color, display_order })` — name must be unique per account;
  a conflict returns 409 `code='duplicate_name'`.
- `mc_lane_update({ id, archived: true })` is the right way to retire a column. The label survives in
  event history.
- `mc_lane_delete` hard-deletes and sets every card's `lane_id` to NULL. No card is lost (they show
  as Uncategorized) but the lane name disappears from history. Prefer archive. Confirm with the
  operator before deleting a lane.

Listing cards: `mc_tasks_list({ status, priority, assignee, lane_id, search, limit, offset })`.
Default limit 50, max 200. `lane_id: "null"` (the literal string) filters to uncategorized cards.
`assignee` is a free-form substring match, so there is no "unassigned" filter — use `lane_id: "null"`
or the Intake lane instead. `mc_task_get({ id })` before any mutation: it returns the body, the
comment timeline (with `parent_comment_id` threading), recent events, and the claim/decision audit
fields so you can see "a human is already on this".

## Intake

`mc_intake_external({ title, source, body, source_ref, source_channel_name, priority, assignee,
tags, meta, auto_route_above, candidate_assignees })` is the front door for Slack, email, webhooks
and forms. Required: `title` + `source`. It creates the card with a source chip and `source_ref` so
the original is traceable, and with `auto_route_above` set it classifies inline in the same call:
at or above the threshold the card lands in Doing with the suggested priority and assignee applied,
below it lands in Intake with the classification stamped in `meta`. Recommended threshold 0.8 for
auto-routing, 0.0 to always classify but keep it in the inbox.

`mc_intake_classify({ title, source, body, source_channel_name, candidate_accounts,
candidate_assignees })` is standalone and **returns a suggestion only**
(`{ account_slug, type, priority, assignee, estimate_min, reasoning }` plus confidence). It mutates
nothing. Apply what you accept with `mc_task_update`. Both classify paths return 503
`code='llm_unavailable'` when the account has no OpenRouter key; fall back to manual triage rather
than reporting a failure as "nothing to triage".

## Moving a card

- Status push: `mc_task_transition({ id, to_status, comment })`. `done` also stamps `resolved_at`.
- Field edits: `mc_task_update({ id, ... })`. Its PATCH **cannot** write `decision_answer` or
  `decided_by_user_id` at all.
- Linking a pm_task: `mc_task_link_pm`, not `related_account_task_id` on the PATCH. The dedicated
  tool validates the pm_task is in the same account and emits audit events.
- **Never** `mc_task_transition({ to_status: 'done' })` on a card that has `decision_options`. It
  silently discards the structured-answer slot and every polling agent then reads `answer: null`.
  Those close through `mc_task_decide`.

## Decisions: raising, waiting, relaying

**Raise** with `mc_task_create({ title, body, status: 'awaiting_human', priority,
decision_options: [{ key, label, description }] })`. Max 20 options, six or fewer works best; the UI
auto-appends a reserved `OTHER` row, so never send `OTHER` as one of your own keys. The writeup goes
in `body` (`description` is a forgiving alias), tags go in `tags` (`labels` is the alias).

**See what is waiting** with `mc_decisions_pending` — every `awaiting_human` card bucketed
P0/P1/P2/P3, shaped to drop straight into a digest. Default limit 200, max 500.

**Wait** with `mc_decision_check({ id })`, a cheap payload carrying `resolved`, the answer, who
decided, and a `retry_after_seconds` derived from priority (P0 30s, P1 2m, P2 15m, P3 6h). Honor it.

**Relay** with `mc_task_decide({ id, chosen_key, text, acting_as_user_id, actor, comment,
also_resolve, force })`. This tool does not queue anything and it is not how you ask a question. It
SUBMITS a choice a human already made, validates `chosen_key` against that card's `decision_options`
(or `'OTHER'` plus `text`), and by default transitions the card to `done`.

- Pass `acting_as_user_id` (public_users `id` from `crm_list_users`). Omit it and the card resolves
  with `decided_by_user_id: null` while the event log records `agent_relay: true`, which reads in an
  audit as the agent having decided on the client's behalf.
- 409 `code='claim_held_by_other'` means a different human has claimed the card. `force: true`
  overrides and is audit-logged in `meta`. Ask the operator before forcing.
- `also_resolve: false` records the answer without closing, for a multi-step decision.

**Promote** the resolved decision: `mc_decision_to_memory({ id, memory_domain, summary,
include_card_link })`. It composes the entry from the card title, chosen label, answer text, decider
and date, returns `memory_entry_id`, appends to `meta.memory_links`, and emits a `memory_promoted`
event. 412 `code='not_resolved'` if `decision_answer` is not set. `memory_domain` is a memory
document name (`'seo'`, `'branding'`, or a `_skill:<name>` document) and follows the same
canonical-department rule as `memory_create` — see the `hiveku-orient` skill. Do this every time a
decision closes; it is what stops the next agent on the account re-litigating a settled call.

## The bridge: card to task and back

| Direction | Tool | What it does |
|---|---|---|
| Card needs work tracked | `mc_task_spawn_pm({ id, project_id })` | Creates the pm_task AND links it, in one call |
| Card and an existing task | `mc_task_link_pm({ id, pm_task_id })` | Links them; idempotent, 409 on a different task unless `force` |
| Agent picks up a pm_task | `pm_task_get_mc_link({ id })` | Reverse lookup: the card carrying the WHY and the human's answer |
| pm_task status changed | `mc_task_mirror_from_pm({ id })` | Pulls the card's status into line |
| Wrong link | `mc_task_unlink_pm({ id })` | Clears it; the pm_task is untouched |

`mc_task_spawn_pm` is the default, not a bare `pm_tasks_create`. Title and description carry over
from the card, priority maps P0 to `urgent` / P1 to `high` / P2 to `medium` / P3 to `low`,
`task_type` defaults to `marketing`, status starts at `queued`, and the new task carries an
`ai_metadata.spawned_from { kind: 'mission_control', mc_task_id }` back-reference. 409 if the card is
already linked; `force: true` replaces. Create the task any other way and the decision context is
stranded on a card nobody can find from the board.

`mc_task_mirror_from_pm` maps `pm.queued`→`mc.open`, `pm.in_progress`→`mc.in_progress`,
`pm.qa | pm.ready_for_review | pm.blocked`→`mc.awaiting_human`, `pm.done`→`mc.done`,
`pm.cancelled`→`mc.archived`. 412 if the card has no linked pm_task; `no_change: true` when it
already matches. Call it after every pm_task status change; there is no webhook doing it for you.

## PM tasks

`pm_tasks_create({ project_id, title, ... })` — required `project_id` + `title`. The field is
`title`, NOT `name` (`name` is `pm_projects_create`); the route accepts `name` as a forgiving alias
but do not rely on it. `pm_tasks_create_bulk` takes up to 500 and validates every `project_id`
before any insert, so one bad id blocks the whole batch.

`pm_tasks_comment({ id, content })` appends; `pm_task_comments_list({ id })` reads the thread back
(oldest first, with `parent_comment_id` threading and an `attachments` array).

`pm_tasks_complete({ id, summary })` sets `status='done'`, `completed_at=now`,
`progress_percentage=100`, and records the summary as an audit comment. It takes no attribution
argument; attribution is `assigned_to_id` at create or update time.

**Reopening: `pm_tasks_uncomplete({ id, status, progress_percentage, summary })`, never
`pm_tasks_update`.** The update PATCH allow-list does not include `completed_at`, so an "update"
reopen leaves `completed_at` set and progress at 100: the task reads as done in every client report
while sitting in an open status. Defaults are `status='in_progress'` and `progress_percentage=0`,
capped at 99.

`pm_tasks_get({ id })` returns more than the task. Its `data` carries an `annotations` array and
`annotation_count` — the browser annotations a reviewer or client dropped on the live preview. Each
one has `annotation_text`, `page_url`, `page_title`, `coordinates`, `priority`, `created_by_name`,
`resolved_at`, and a `screenshot_url` that is a directly-fetchable public PNG. `screenshot_status`
is `ready | capturing | failed | none`; `capturing` with a null url means the async capture is still
running, so re-fetch shortly instead of working blind. There is no MCP tool that flips one
annotation's `resolved_at` — record the fix with `pm_tasks_comment` and do not claim otherwise.
`/hiveku:review` runs this loop.

## Recurring work: the retainer engine

Retainer deliverables are cron-driven, not remembered by hand. Two engines, one per system.

### PM recurrences (spawn real tasks with subtasks)

`pm_task_recurrence_create({ project_id, title, cron, timezone, on_overlap, subtask_templates,
priority, assigned_to_id, section_id, milestone_id, is_active, ... })`. Required: `project_id`,
`title`, `cron`. On every cron match the materializer spawns a NEW parent pm_task at
`status='queued'` plus one child per `subtask_templates` entry (each needs at least a `title`; max
50). Cron is standard 5-field: `'0 9 * * 1'` Monday 9am, `'0 0 1 * *'` first of the month,
`'0 9 * * 1-5'` weekday mornings. `timezone` is IANA and defaults to UTC.

Chain: `pm_projects_list` → `pm_task_recurrence_create` → `pm_task_recurrence_run_now({ id })` to
verify the first spawn → `pm_task_recurrence_list({ active_only: 'true' })` as the audit view.

Four things that bite:

- **`on_overlap`.** Default `'skip'` refuses to spawn while a prior occurrence is still open, which
  is right for a weekly status report you do not want stacking. `'spawn'` fires regardless, which is
  right for monthly invoices where each occurrence is its own unit of work. Choose deliberately and
  say which you chose.
- **The first occurrence fires on the NEXT cron match**, which may be tomorrow morning. A fresh
  recurrence looks broken until then. `pm_task_recurrence_run_now({ id, force })` spawns one
  immediately (`force` bypasses `on_overlap='skip'`).
- **`subtask_templates` fully REPLACES the array on update.** Pass the complete intended set to
  `pm_task_recurrence_update`, never just the new entries, or you silently delete the rest.
- **Pause is the reversible stop.** `pm_task_recurrence_pause` / `_resume` flip `is_active` and are
  idempotent; resume does NOT backfill occurrences missed while paused (call `_run_now` for a
  one-off catch-up). `pm_task_recurrence_delete` stops future fires and leaves already-spawned tasks
  behind with their `recurrence_id` nulled. Deleting is not undoable — confirm with the operator and
  prefer pause.

### MC schedules and templates (spawn cards)

Templates are reusable markdown card bodies with `{{var}}` markers.
`mc_templates_list({ domain, include_builtins })` returns tenant templates and platform built-ins
together; when both define a name, the tenant version wins (`is_tenant_override: true`).
**Built-ins cannot be edited** — `mc_template_update` refuses them, so shadow one with
`mc_template_create({ name, body, domain, description, variables })` first (name is lowercase a-z
0-9 with `.` `_` `-`; `variables` is auto-extracted from the body markers if omitted).
`mc_templates_render({ name, variables, strict })` renders server-side and you pipe the result
straight into `mc_task_create`'s `body`. It is **lenient by default**: missing variables stay as
literal `{{markers}}` in the output and are listed in `missing`. Check `missing` before shipping the
text to a client, or pass `strict: true` to error instead.

`mc_schedule_create({ name, cron, template_name, timezone, defaults, template_vars,
target_account_filter, enabled })` pairs a cron with a template; the worker fires it and spawns one
card per matching account. Required: `name`, `cron`, `template_name`. Example: `cron: '0 9 1 * *'`,
`timezone: 'America/New_York'`, `template_name: 'ppc.monthly_review'`,
`defaults: { priority: 'P2', assignee: 'pi-ppc' }`.

Verify before you let cron drive it: `mc_schedule_fire({ id, dry_run: true })` previews the plan
without spawning anything. Fire it for real only after the preview looks right, or you spam a
client's board. `mc_schedule_update({ id, enabled: false })` pauses; `mc_schedule_delete` removes the
schedule and leaves already-spawned cards alone.

## Digest reads

- `mc_decisions_pending` — blocked on a human, bucketed by priority. The bucket the operator acts on.
- `mc_tasks_next({ assignee, limit })` — ready-to-work only (`open`, `awaiting_agent`,
  `in_progress`). It **excludes `awaiting_human` by construction**, so it is never the full queue on
  its own. Default limit is 5 and max is 50; without `limit` you report five cards. Without
  `assignee` you get the whole account.
- `mc_sla_breached` — past the priority SLA (defaults P0 1h, P1 4h, P2 24h, P3 168h; override per
  call with `sla_P0_hours` and friends). Rows carry `age_hours`, `sla_hours`, `over_by_hours`.
- `mc_tasks_aged({ status, over_hours })` — measured against `updated_at`, so any comment or nudge
  resets it. Default `awaiting_human` over 24h.
- `mc_tasks_stalled({ over_hours, status })` — measured against the EVENT log, so a card whose only
  update was an agent claim still counts. Default 48h. Returns `hours_since_last_event`.
- `account_audit_health({ account_id })` — one call for memory / MC / PM / sites / keys / CRM counts
  and last activity, plus `drift_flags[]` and a `drift_score`. Per-tenant: `account_id` must be this
  key's own account, from `get_account_info`.

## Confirm gates

Ask before: `mc_task_decide` with `force: true` (overriding another human's claim), `mc_lane_delete`,
`pm_task_recurrence_delete`, `pm_projects_delete` (cascades to tasks, milestones and sections),
`pm_tasks_delete`, and any `mc_schedule_fire` that is not a dry run. Everything on that list is
either irreversible or lands on a client's board.
