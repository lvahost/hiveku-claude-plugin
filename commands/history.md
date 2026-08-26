---
description: Show this project's version history — timeline, commits, checkpoints, and one file's versions.
argument-hint: "[a file path, to show that file's version history]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
Show the history for THIS project (all read-only — nothing changes). This project's id is `<the project_id>`.

- If "$ARGUMENTS" is a FILE PATH: `project_file_versions({ project_id: <the project_id>, file_path: "$ARGUMENTS" })`
  for that file's version trail (version_number, is_current, commit_message, created_at), then
  `project_file_diff({ project_id: <the project_id>, file_path: "$ARGUMENTS" })` to see what changed in the latest.
- Otherwise show the PROJECT timeline: `project_version_log({ project_id: <the project_id> })` — one combined
  chronological feed of file edits, checkpoints, restores, and deploys ("what happened to this project").
  For just commits use `project_vcs_history({ project_id: <the project_id> })` (each has a `checkpoint_hash`);
  for snapshots use `checkpoint_list` (full checkpoints, incl. DB) and `project_checkpoint_list`
  (commit-tied checkpoints). Summarize the recent entries with their ids/hashes + timestamps so the
  user can pick one to restore or diff. Restoring is a separate step — `/hiveku:restore`.
