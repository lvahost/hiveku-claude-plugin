---
description: Restore this project — one file, a whole checkpoint, or a point in time. Preview first, always.
argument-hint: "[what to restore — a file path, a checkpoint hash, or a time]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Restore THIS project — pick the SMALLEST scope that fixes the problem, and PREVIEW before applying.
This project's id is `<the project_id>`. Confirm the exact target with the user before any restore that overwrites files.

**One file (safest — NON-destructive):** `project_file_versions({ project_id: <the project_id>, file_path })`
to find the version, then `project_file_restore({ project_id: <the project_id>, file_path, version_number })`.
It writes the old content as a NEW version (history stays linear — nothing is lost). Add `commit: true`
to also push the restore. Prefer this whenever only a file or two regressed.

**Whole project to a checkpoint:** first DRY-RUN —
`project_checkpoint_restore_dry_run({ project_id: <the project_id>, checkpoint_hash })` (from `/hiveku:history`)
shows exactly which files would add/update/stay. Then `project_checkpoint_restore({ project_id: <the project_id>,
checkpoint_hash })` — same endpoint as `checkpoint_restore`. It is ADDITIVE about deletions (files
created SINCE the checkpoint are kept), but it OVERWRITES the content of every file in the checkpoint and
restores the database when the checkpoint captured one — so uncommitted edits to those files are lost.
Take `/hiveku:checkpoint` FIRST, then confirm the hash with the user.

**A point in time (no snapshot needed):** `project_state_at({ project_id: <the project_id>, as_of: "<ISO time>" })`
reconstructs the file list read-only (dry run). To actually roll back to that moment use
`history_restore_to_time({ project_id: <the project_id>, as_of })`.

**Inspect a restore without touching your working project:** `history_preview_restore(...)` spins up an
ISOLATED ephemeral preview app (canonical container untouched) and returns a `preview_url` to open;
`history_list_preview_sessions` lists them, `history_cancel_preview_restore` tears one down. Use this to
eyeball a checkpoint/PIT before committing to the real restore. After any restore, re-`/hiveku:pull` so
local files match, then `/hiveku:verify`.
