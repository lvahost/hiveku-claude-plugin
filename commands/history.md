---
description: Show this project's version history - named versions, the timeline, checkpoints, and one file's versions.
argument-hint: "[a file path, to show that file's version history; or 'on <branch>' for a branch's commits]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Show the history for THIS project (all read-only - nothing changes). This project's id is `<the project_id>`.

- If "$ARGUMENTS" is a FILE PATH: `project_file_versions({ project_id: <the project_id>, file_path: "$ARGUMENTS" })`
  for that file's version trail (version_number, is_current, commit_message, created_at), then
  `project_file_diff({ project_id: <the project_id>, file_path: "$ARGUMENTS" })` to see what changed in the latest.
  Both read `main`. For a file on a BRANCH, `project_vcs_diff_file({ project_id: <the project_id>, from: "main",
  to: <branch>, path: "$ARGUMENTS" })` shows both sides (working-tree edits included; a side is null where the
  path does not exist).
- Otherwise show the PROJECT timeline: `project_version_log({ project_id: <the project_id> })` - one combined
  chronological feed of file edits, checkpoints, restores, and deploys ("what happened to this project").
  For the named versions use `project_vcs_history({ project_id: <the project_id>, branch: "main" })` (Your
  site) or a branch name; omit `branch` for EVERY branch's versions (a mixed feed, each entry carries its
  branch). Show each version's NAME, when, and `source` in plain words: `ai_turn` = the in-app AI after a
  request, `editor_idle` = saved automatically after someone edited, `mcp` / `vscode` / `sync_cli` = an
  assistant or tool like this one, `deploy` = saved when publishing, `rollback` = a rollback (with
  `rolled_back_to`), `merge`, `github`, `manual` = a person in the dashboard. `live_on` says which tiers
  serve that version. Page older with `before: <meta.nextBefore>`; stop on an empty page or fewer than
  `limit` entries (`meta.truncated` stays true on the last page). `revertable` concerns checkpoint
  restores only; `restorable` is the one for rollback: a version with `restorable: true` on Your site
  or a branch can be rolled back with `/hiveku:rollback`, and one with `restorable: false` cannot (its
  files were never copied), so show its `restore_blocked_reason` as written instead of offering it.
  An older platform sends no `restorable`: offer the version, and the rollback's dry run will say.
  `project_vcs_branches({ project_id: <the project_id> })` shows every branch with `ahead` / `behind` and
  whether its working tree has edits not yet in a commit (`uncommitted`). For snapshots use `checkpoint_list`
  (full checkpoints, incl. DB) and `project_checkpoint_list` (commit-tied checkpoints). Summarize the recent
  entries with their names, ids/hashes + timestamps so the user can pick one to go back to or diff. Going
  back is a separate step - `/hiveku:rollback` for a version (Your site or a branch), `/hiveku:restore`
  for one file, a checkpoint with its database, or a point in time.
