# PM project structure

The structural surface of the PM system: milestones, sections, dependencies, time logs,
attachments, subtasks, bulk reassignment, and the agent task queue in depth. The operating rules —
completion hygiene, the MC bridge, recurrences, confirm gates — live in SKILL.md and still apply to
everything here.

## Projects: single read and edit

- `pm_projects_get({ id })` fetches one PM project by UUID.
- `pm_projects_update({ id, ... })` changes only the fields you pass. Renaming a project or
  flipping its status is an update, never a delete-and-recreate — `pm_projects_delete` cascades to
  every task, milestone and section under it.

## Milestones

Milestones are the retainer reporting spine: "Phase 1 shipped" is a milestone closing, and
`milestone_id` is what groups tasks into a client-readable deliverable.

- `pm_milestones_list({ project_id, status, page, limit })` — across all projects when
  `project_id` is omitted. Status vocabulary: `planned | in_progress | completed | cancelled`.
- `pm_milestones_get({ id })` — one milestone.
- `pm_milestones_create({ project_id, name, description, due_date, status, sort_order,
  deliverables, completion_criteria })` — required `project_id` + `name`. `deliverables` is an
  array of deliverable spec objects; `completion_criteria` is the text you will later be held to,
  so write it as something checkable.
- `pm_milestones_update({ id, ... })` — auto-sets `completed_at` when status flips to `completed`.
- `pm_milestones_close({ id })` — convenience over update: sets `status='completed'`,
  `completed_at=now`.
- `pm_milestones_delete({ id })` does NOT delete the tasks attached to it — they stay, with
  `milestone_id` set to null. The tasks survive; the grouping and its history do not. Confirm with
  the operator first.

This is where you get the `milestone_id` that `pm_task_recurrence_create`, `pm_tasks_create` and
the `pm_tasks_list` filter accept.

## Sections

Sections are column-like groupings inside one project's board. This is where `section_id` comes
from.

- `pm_sections_list({ project_id })` — the sections of one project.
- `pm_sections_create({ project_id, name, sort_order })` — required `project_id` + `name`.
- `pm_sections_update({ project_id, section_id, name, sort_order, is_collapsed })` — rename,
  reorder or collapse. Tasks in the section are never touched.
- `pm_sections_delete({ project_id, section_id })` deletes ONE section. Tasks in it are UNASSIGNED
  (`section_id` set to null), never deleted, and the response returns `tasks_unassigned` so you can
  report the count. Clearing every section on a project is deliberately not a direct tool — the
  route's own guidance is to stage `pm.section_delete_bulk` for human approval instead. Do not
  simulate the bulk clear by looping `pm_sections_delete`; that loop is exactly what the missing
  tool refuses to be.

## Dependencies

Task sequencing — "don't start the ad campaign until the landing page ships" — is recorded as
dependencies, and they ADVISE rather than enforce.

- `pm_task_dependencies_list({ task_id })` returns both directions: `blocked_by` (must finish
  first) and `blocking` (waiting on this one), each row carrying `task_number`, `title`, `status`,
  `is_done` and the `dependency_id` you need to remove the link. It also returns
  `is_blocked_by_dependencies` and `open_blocker_count` for the task itself. A task can be blocked
  by dependencies WITHOUT having `status='blocked'` — the two are separate signals; this one is
  computed from the graph, not stored.
- `pm_task_dependency_create({ task_id, depends_on_task_id })` — `task_id` is the task that is
  BLOCKED; `depends_on_task_id` must finish first. Both tasks must be in the SAME project. Only
  `finish_to_start` is supported; `start_to_start`, `finish_to_finish` and `start_to_finish` are
  reserved and rejected, because PM has no gantt or scheduler to act on a date shift. Refuses
  self-links (400), duplicates (409) and any link that would close a cycle (409). Adding a
  dependency does NOT change either task's status and does not stop anyone moving the task.
- `pm_task_dependency_delete({ task_id, dependency_id })` removes one link; neither task is
  modified. Get `dependency_id` from `pm_task_dependencies_list`.
- `pm_project_dependency_graph({ project_id, ready_only })` returns every link in the project plus
  the READY SET: tasks not done, not cancelled, with zero open blockers. **On a project where
  nobody has drawn a dependency yet this returns the whole open backlog — check `edge_count`
  before treating the ready set as a scheduling answer.** An empty graph means "nobody sequenced
  anything", not "everything is ready in priority order".

## Time logs

Retainer hours against tasks — the billing record.

- `pm_task_time_log_create({ task_id, hours_logged, log_date, user_id | agent_codename,
  description, is_billable, hourly_rate })` — required `task_id`, `hours_logged`, `log_date`
  (YYYY-MM-DD). Pass EXACTLY ONE of `user_id` (a member of this account — a human timesheet entry)
  or `agent_codename` (work an agent did) — never both. The row records one actor, and attributing
  agent hours to a person puts them on that person's billable timesheet. **MONEY IS IN DOLLARS,
  not cents: `hourly_rate: 75` means $75/hr.** `total_cost` is computed server-side.
  `hours_logged` is capped at 24. This RECOMPUTES the task's `actual_hours` as the sum of all its
  time logs, overwriting any value set directly on the task.
- `pm_task_time_logs_list({ task_id })` — hours, date, description, billable flag, hourly rate and
  total cost per entry, plus the rolled-up `task_actual_hours` and billable/total sums. Each entry
  says whether a person or an agent logged it. Dollars, not cents, here too.

## Attachments

- `pm_task_attachments_list({ task_id })` — id, `attachment_type`
  (`image|video|audio|document|file|link`), filename, `file_url`, size, mime type, link
  title/description. Works on subtasks (a subtask is a pm_task with `parent_task_id` set — same
  endpoint).
- `pm_task_attachment_create({ task_id, ... })` — two modes in one call. FILE: `file_name` +
  `content` (base64, max 50MB; data-URI prefix accepted; mime inferred from the extension unless
  you pass `mime_type`), stored in S3 under `pm-tasks/<task_id>/`. LINK: `file_url` (https) +
  optional `link_title` / `link_description` — no upload, just the URL (a Figma mockup, a Loom, a
  Google Doc).
- `pm_task_attachment_delete({ task_id, attachment_id })` — for file uploads also purges the S3
  object best-effort (the DB row delete proceeds even if S3 fails); for links it just deletes the
  row. The task itself is untouched.

## Subtasks

`pm_tasks_subtasks({ parent_task_id, limit })` lists a parent's children — shorthand for
`pm_tasks_list` with `parent_task_id`. This is the read that verifies a recurrence spawn actually
produced its subtasks, and the checklist view of any parent task.

## Bulk reassignment

`pm_tasks_reassign_bulk({ task_ids, assigned_to_id })` reassigns many tasks in one call (a single
updateMany) — a departed or vacationing team member's queue moves in one write instead of N
`pm_tasks_update` calls. Both arguments are required; build `task_ids` from a `pm_tasks_list`
sweep you have shown to the operator, never from a filter you did not read back first.

## The agent queue: claim, release, submit for review

Full mechanics of the multi-writer coordination summarized in SKILL.md.

- `pm_task_claim({ task_id, agent_codename })` — only tasks in status `todo` or `queued` can be
  claimed; anything else returns 409, as does a task another agent already holds. Atomically sets
  status to `in_progress`, stamps the agent codename, and mints branch
  `olympus/task-<task_number>`. A 409 means someone else is on it — pick different work; do not
  edit the task anyway.
- `pm_task_release({ task_id, agent_codename, reason })` — only `in_progress` or `blocked` tasks
  can be released. Resets status to `queued`, clears the agent codename and branch name, and
  zeroes progress. Release what you cannot finish; a held claim on abandoned work blocks every
  other writer.
- `pm_task_submit_for_review({ task_id, agent_codename, summary, pr_number, preview_url,
  linked_content_ids })` — the QA handoff. Only `in_progress` or `qa` tasks are accepted. Sets
  status to `qa`, NOT `done` — `pm_tasks_complete` is the human-final done state. **It stamps
  `completed_at` even though the task is not complete, so judge completion by status and never by
  `completed_at`.** After submitting, run `mc_task_mirror_from_pm` on the linked card — `pm.qa`
  maps to `mc.awaiting_human`, which is what puts the review in front of a person.
