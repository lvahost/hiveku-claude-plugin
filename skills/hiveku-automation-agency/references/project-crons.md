# Project Scheduled Functions: the OTHER cron rail

Load this file when a cron belongs to a WEBSITE PROJECT rather than a workflow:
scheduled functions synced to AWS EventBridge, executing as Lambdas. None of the
`workflow_*` tools see them - `workflow_runs_recent` shows none of their runs, and
`workflow_get_schedule` returning null proves nothing about this rail.

## The tools

- `project_crons_list` - lists the project's scheduled functions. Returns
  `{ functions, cronEnabled, cronEnvironments }`; filter with
  `?environment=production,staging,...`. **`cronEnabled: false` means the FEATURE is
  off for the project** - the first checkpoint in any "project cron never fired"
  diagnosis - and `project_cron_toggle` must run before anything fires.
- `project_cron_toggle` - enables/disables the cron feature for a project and chooses
  which environments execute schedules. Body: `{ enabled, environments?: ["production",...] }`.
  When disabled, ALL schedules pause regardless of each function's own `enabled` flag.
- `project_cron_create` - registers a scheduled function. `function_path` is the
  source file inside the project (e.g. `functions/cleanup.ts`);
  `schedule_expression` is **AWS EventBridge syntax** - either
  `rate(5 minutes)` / `rate(1 hour)` / `rate(7 days)` OR `cron(0 9 * * ? *)` (note
  the `?` field - this is NOT the 5-field cron `workflow_set_schedule` uses; the two
  syntaxes are incompatible). UTC by default, override with `timezone`. Defaults:
  timezone=UTC, environment=production, enabled=true. The unique key is
  (project_id, function_path, environment) - creating a second cron at the same
  path + env raises a conflict.
- `project_cron_update` - patches an allow-listed set: `enabled`,
  `schedule_expression`, `timezone`, `description`. Changes to `schedule_expression`
  or `enabled` automatically re-sync the EventBridge rule. This is the repair tool
  for a misconfigured project cron.
- `project_cron_run` - manually invokes the function NOW, off-schedule, and returns
  the synchronous Lambda response. The test rail for this surface, and the
  "trigger this once to backfill" tool - no need to touch the cron expression.
- `project_cron_logs` - recent execution rows: timestamp, status
  (`success | failure | timeout`), duration_ms, error message. Limit defaults to 50.
  This is the ONLY place these runs show.
- `project_cron_delete` - deletes the scheduled function row AND tears down its
  EventBridge rule. The hygiene counterpart of "never leave a scheduled thing
  enabled": a test cron you registered gets deleted, not abandoned.

## Scoped-key visibility

The `project_cron_*` tools are NOT visible from a workflows-profile key - that
profile grants only a short named list of project tools (`sites_list`,
`project_get`, `project_files_list`, `project_file_get`), and no `project_` prefix.
They are visible on a full-profile or dev-profile key. If the calls are absent from
your session, say so and route the work through a session that has them, rather than
concluding the rail does not exist.
