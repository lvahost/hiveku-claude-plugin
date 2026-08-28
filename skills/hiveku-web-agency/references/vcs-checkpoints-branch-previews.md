# VCS, Checkpoints, Branch Previews, and Restore

The full mechanism behind Play 6, plus the GitHub source-of-truth axis from Play 7.
Load this before branch previews, merges, checkpoint work, ANY restore (checkpoint,
point-in-time, or single-file), or touching the GitHub connection.

## Branching, committing, merging

- Branch for real work: `project_vcs_branch_create({ project_id, name })` (use `feature/`,
  `fix/`, `task-<id>/`), `project_vcs_checkout` to switch, `project_vcs_branches` to list.
  Do not do risky work straight on the main line.
- Commit green states: `project_vcs_commit({ project_id, message, ... })` after a passing
  build. Imperative present-tense messages. `project_commit` and `project_version_log` /
  `project_vcs_history` show and record history; `project_vcs_compare` diffs two points.
- Merge back with `project_vcs_merge({ project_id, branch, message? })` once the branch
  builds and is reviewed. It applies the non-conflicting branch changes and returns
  `{ applied, deleted, conflicts, commit }`. Files changed on BOTH the branch and main are
  returned in `conflicts` and are NOT overwritten - resolve them yourself and merge again.
  The branch is not deleted, so a partial merge is recoverable. `project_vcs_compare` shows
  what a branch changed before you merge it.

## Branch previews (show the client before it merges)

- Show the client the branch BEFORE it merges, without touching the shared main preview:
  `project_vcs_branch_preview({ project_id, branch })` spins the branch up at its own URL in
  its own isolated app (the project's main preview is untouched and the branch tree never
  enters the project's files). It returns `{ previewUrl, status, previewSessionId }`. On
  `status: 'starting'` do NOT call it again - that spawns a second app; poll
  `project_vcs_branch_preview_status({ project_id, session_id })` instead, usually another
  30-90s. Send `previewUrl` for sign-off, then merge, then
  `project_vcs_branch_preview_teardown({ project_id, session_id })` (irreversible - start a
  fresh preview to look again; they are also reaped automatically).

## Checkpoints

- Snapshot BEFORE risky work: `checkpoint_create({ project_id, description })` captures
  every current file, every asset, and (when configured) a DB backup, and returns a
  `checkpoint_hash` - record it in your reply. Take one before any bulk refactor,
  `delete_missing` tree replace, dependency bump, or DB migration - and immediately before
  any `production` deploy, so the rollback plan points at a checkpoint minutes old.
  `project_files_bulk_save({ delete_missing: true })` already takes one automatically and
  aborts with `code: 'checkpoint_failed'` before touching anything if it cannot. Clean up
  with `checkpoint_delete`.
- Note the two prefixes: the create/delete half is `checkpoint_create` / `checkpoint_delete`
  (bare prefix). There is no `project_checkpoint_create` - do not guess it. The bare
  `checkpoint_*` half is invisible to a `dev`-scoped MCP key (only the `project_checkpoint_*`
  half matches its prefixes); plugin sessions run the full profile and see both.
- Checkpoints are the safety net for restores: `project_checkpoint_list` (or
  `checkpoint_list`, which also carries trigger/size metadata) to find a known good point,
  `project_checkpoint_get` to inspect it, and `project_checkpoint_restore_dry_run` BEFORE
  `project_checkpoint_restore` - always dry-run a restore first so you see exactly what it
  will change. Restore is ADDITIVE: it overwrites current files from the snapshot but never
  removes a file that exists now and was not in the checkpoint. Never re-run a restore as
  verification; verify by reading files and building.

## Point-in-time restore (a regression with no nearby checkpoint)

The `history_*` / `project_state_at` rail restores to an ARBITRARY timestamp, not just to a
snapshot somebody remembered to take. (`history_*` is invisible to a `dev`-scoped key;
`project_state_at` is visible everywhere `project_` is.)

- `project_state_at` reconstructs the project's state at a timestamp WITHOUT touching
  anything - a read-only dry run of the point-in-time machinery. It returns the file list
  (paths, sizes, version ids), the asset list with resolved S3 versions, and the set of
  paths that were tombstoned by that time. Use it to preview what "restore to time X" would
  produce, to extract a single file as of time X (`include_content: true`, pick the path),
  or to inspect drift between now and then. Cheaper than `project_checkpoint_list` when you
  already know the timestamp you care about.
- `history_restore_to_time` restores the project to its state at that timestamp. Unlike
  `project_checkpoint_restore` it works even when no snapshot exists at the target time -
  it reconstructs from per-row created_at trails and the matching S3 object versions. Same
  ADDITIVE semantics as the checkpoint restore: files that exist now but did not exist at
  the target time are NOT removed. For a strict point-in-time recreation, follow with
  `project_files_bulk_save` + `delete_missing: true` using the snapshot from
  `project_state_at` - and that delete_missing pass takes its own checkpoint, keep it.
- Dry-run doctrine applies here exactly as it does to checkpoints: `project_state_at` (or a
  preview session, below) BEFORE `history_restore_to_time`, never straight to the write.

## Preview a restore before committing it

- `history_preview_restore` spawns an ISOLATED ephemeral preview app for a checkpoint or a
  point-in-time snapshot - the canonical project container is never touched, so a broken
  snapshot cannot break the working dev environment. Returns
  `{ preview_session_id, preview_url }` to hand the user. Spawn takes 30-90s (snapshot
  upload + app create + machine boot + health poll); on a health-check failure the route
  auto-destroys the half-spawned app and returns 504 with `code: 'preview_unhealthy'`.
- Committing the previewed state is a SEPARATE call - `history_restore_to_time` or
  `project_checkpoint_restore` - and does not require tearing the preview down first.
- `history_cancel_preview_restore({ preview_session_id })` destroys the isolated app.
  Idempotent - an already-torn-down session returns `ok: true` + `already_torn_down: true`.
  Cleanup is best-effort: per-step failures are reported in the response's `errors` field
  and an orphan-sweeper cron retries partial teardowns after 1h.
- `history_list_preview_sessions` lists sessions (active by default;
  `include_finished: 'true'` for history) - use it to find a `preview_session_id` before
  teardown, audit abandoned sessions, or hand a still-running `preview_url` back mid-conversation.

## Single-file history and rollback

One bad file does not need a whole-tree restore:
- `project_file_versions` lists a single file's version history - version_number,
  is_current, size, commit message, branch, created_at - newest first, no content. Read it
  first so you know which version_number to roll back to.
- `project_file_diff` diffs two versions (defaults: previous vs current; pass `from` / `to`
  as version_number ints). `format: 'unified'` returns a unified-diff string,
  `format: 'json'` returns hunks; binary files are flagged `binary: true` and not diffed.
- `project_file_restore` restores one file to an earlier version by writing the prior
  content as a NEW version - history stays linear, no destructive rewrites. Pass
  `commit: true` to also push the restored content to GitHub (recommended on a
  GitHub-connected project so the rollback shows in commit history with a clear message).

## Source of truth: the GitHub axis (from Play 7)

Source of truth (GitHub or not) is a separate axis from the deploy tier.
`project_deployment_mode_get` returns `{ mode: 'github_sync' | 'local_codebase' }`.
`local_codebase` means saves go straight to `builder_code_versions` with no GitHub
roundtrip - the normal Hiveku-native case. `github_sync` means the repo is the source of
truth and commits replicate in, so a `project_file_save` without a `project_commit` gets
overwritten by the next sync. `project_deployment_mode_set` FLIPS that plumbing and needs
an explicit confirm; enabling `github_sync` requires an already-connected repo or it
returns 412 `github_not_connected`. Never call it to "pick a tier".

Inspecting and configuring the connection the mode depends on:
- `github_status` - is the app installed, which repo, the default branch, the last synced
  SHA. Run it before diagnosing any sync surprise or offering `github_sync`.
- `project_github_configure` - updates per-tier auto-deploy toggles and the branch mapped
  to each tier (only the fields you pass change). It CANNOT install the Hiveku GitHub App,
  connect a different repo, or disconnect GitHub - those are human dashboard actions
  (`/settings/github`). Pair with `project_deploy_preflight` to verify the new
  configuration before relying on it.
- `github_commits` - recent commits on a branch (default: the project's default branch),
  for confirming what actually replicated in.
