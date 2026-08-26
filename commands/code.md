---
description: Work on one of the account's Hiveku website projects — pull the code local, edit, verify, commit, deploy.
argument-hint: "[project name or id, and what to change]"
---

Operate on a Hiveku website project for the bound account$ARGUMENTS. Hiveku projects are versioned in the
platform (not GitHub); you edit them through the MCP tools. The high-leverage move is to pull the files
LOCAL so you edit with your native file tools, then push once — not round-trip every file.

**1. Pick the project.** `list_projects` (or `get_project`) → capture the `project_id`. Everything below
needs it.

**2. Pull it local.** `project_files_bulk_get({ project_id })` in ONE call, and write the files under
`projects/<slug>/` in this folder so you can read and edit them natively. Get the current branch (`main`).

**3. Change it.** Edit the local files. Understand the framework from the files before editing; match the
project's existing patterns.

**4. VERIFY before you ship — a commit is not a deploy, and a green build is not a typecheck:**
   - `verify_typecheck`, `verify_lint`, `verify_run_tests` as applicable.
   - `project_test_build({ project_id })`. On failure, read `project_build_error_get` + `preview_logs` and
     fix — do not deploy a red build.

**5. Save + version.** `project_files_bulk_save({ project_id, files })` in ONE call (not N saves), then
`project_vcs_commit({ project_id, message })` to version on `main`. Commit ≠ live.

**6. Deploy when asked.** `deploy_site({ project_id, ... })`, then confirm with `deploy_status` / `deploy_get`.
Preview deploys are safe to ship freely; confirm before a production deploy.

Rules: never deploy an unverified or red build. Show the diff and confirm before committing or deploying.
Keep `projects/` out of anything you push elsewhere — it holds the account's code.
