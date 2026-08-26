---
description: Version this project's changes in Hiveku's native VCS - status, build gate, then commit on a branch.
argument-hint: "[commit message, optional]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Commit THIS project's pending work$ARGUMENTS. This project's id is `<the project_id>`.

**Commit is versioning. It is NOT a deploy.** Nothing a commit does is visible to the client. Say so
in your reply so nobody reads "committed" as "shipped" - deploying is `/hiveku:deploy`.

1. SEE what is pending: `project_files_status({ project_id: <the project_id> })` for the dirty tree,
   and `project_files_list` / `project_file_get` if you need to read a specific file back. Show the
   user what is about to be versioned and get a yes. A dirty tree from a prior session gets reconciled
   before you add to it - do not bury someone else's half-finished work inside your commit.

2. BRANCH for anything non-trivial: `project_vcs_branches({ project_id })` to see where you are,
   `project_vcs_branch_create({ project_id, name })` (`feature/`, `fix/`, `task-<id>/`), then
   `project_vcs_checkout`. Risky work does not go straight on the main line.

3. GATE on a green build: `project_test_build({ project_id: <the project_id>, use_db_state: true })`,
   then poll `project_test_build_log_get({ project_id, session_id })` every ~10s until `status` is
   `succeeded` or `failed`. The call returns only a `build_session_id` - that is not a verdict.
   On a red build read that same log (NOT `project_build_error_get`, which reports the last failed
   real DEPLOY and can be days stale), fix, re-save, re-build. Commit green states only.

4. If pages moved: `project_files_validate_orphan_routes({ project_id })` and read
   `route_collisions[]`, not the orphan count - `orphans: 0` does not mean routing is healthy.

5. COMMIT: `project_vcs_commit({ project_id: <the project_id>, message })`. Imperative,
   present-tense message ("Add pricing section", not "Added"). `project_vcs_history` /
   `project_version_log` show the trail; `project_vcs_compare` diffs two points.

6. MERGE when the branch is reviewed: `project_vcs_merge({ project_id, branch, message? })`. It
   applies the non-conflicting changes and returns `{ applied, deleted, conflicts, commit }`. Files
   changed on BOTH the branch and main come back in `conflicts` and are NOT overwritten - resolve
   them yourself and merge again. The branch survives, so a partial merge is recoverable. To let a
   client sign off before the merge, use the branch preview in `/hiveku:preview`.

GitHub-connected projects are a different path: if `project_deployment_mode_get` reports
`mode: "github_sync"`, the repo is the source of truth and a save without a `project_commit` gets
overwritten by the next sync - use `/hiveku:github`.

Before anything risky (bulk refactor, `delete_missing` tree replace, dependency bump), take a
snapshot first with `/hiveku:checkpoint`.
