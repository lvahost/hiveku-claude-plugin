---
description: "Save a named version of this project's changes in Hiveku's native VCS - status, build gate, then commit on a branch. A commit is NOT live; putting it live is /hiveku:deploy."
argument-hint: "[commit message, optional; add 'on <branch>' to commit a branch's working tree]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Commit THIS project's pending work$ARGUMENTS. This project's id is `<the project_id>`.

**Commit is versioning. It is NOT a deploy.** Nothing a commit does is visible to the client. Say so
in your reply so nobody reads "committed" as "shipped" - deploying is `/hiveku:deploy`.

**The working-branch model - read this once.** A branch has a WORKING TREE and a commit history,
exactly like `main`. `main`'s working tree IS the live project; a branch's working tree lives off to
the side and never enters the live project until it is merged. There is no "switch":
`project_vcs_checkout` is a READ that returns a branch's tree so you can materialize it locally, and
it changes nothing server-side - not the editor, not any tier, and no tool does. The working branch
is simply the `branch` you pass on every file tool: `project_files_bulk_get` / `project_file_get` to
read, `project_file_save` / `project_files_bulk_save` / `project_file_delete` to write,
`project_test_build({ use_db_state: true, branch })` to build, `preview_screenshot` /
`preview_http_get` with `branch` to look at its branch preview. Omit `branch` (or pass `"main"`)
and every one of those operates on the live project, byte-identical to before. A write with
`branch` updates that branch's working tree only - `uncommitted: true` on the response, never a
commit, never `main`.

1. SEE what is pending. On `main`: `project_files_status({ project_id: <the project_id> })` for the
   dirty tree, and `project_files_list` / `project_file_get` to read a file back. On a branch:
   `project_vcs_branches({ project_id })` - each branch carries `uncommitted` (its working tree is
   ahead of its last commit) and `working_tree_etag`; `project_vcs_compare({ project_id, from:
   "main", to: <branch> })` lists what the branch changed and `project_vcs_diff_file({ project_id,
   from: "main", to: <branch>, path })` shows both sides of one file. Show the user what is about to
   be versioned and get a yes. A dirty tree from a prior session gets reconciled before you add to
   it - do not bury someone else's half-finished work inside your commit.

2. BRANCH for anything non-trivial: `project_vcs_branch_create({ project_id, name, from? })`
   (`feature/`, `fix/`, `task-<id>/`; keep names short - preview machines cap them). From here on
   pass that `branch` on every file tool. Risky work does not go straight on the main line.
   `/hiveku:branch` lists, binds and deletes branches.

3. GATE on a green build: `project_test_build({ project_id: <the project_id>, use_db_state: true,
   branch? })`, then poll `project_test_build_log_get({ project_id, session_id })` every ~10s until
   `status` is `succeeded` or `failed`. The call returns only a `build_session_id` - that is not a
   verdict. With `branch` it builds the branch's working tree (uncommitted edits included);
   `files[]` + `branch` is refused with 400. On a red build read that same log (NOT
   `project_build_error_get`, which reports the last failed real DEPLOY and can be days stale), fix,
   re-save, re-build. Commit green states only.

4. If pages moved: `project_files_validate_orphan_routes({ project_id })` and read
   `route_collisions[]`, not the orphan count - `orphans: 0` does not mean routing is healthy. It
   reads the live project, so for branch work run it after the merge as well.

5. COMMIT - one tool, two shapes:
 - WITH files: `project_vcs_commit({ project_id: <the project_id>, message, files, deletedFiles?,
     branch })` saves the files AND records the commit in one call. **Pass the branch from step 2 -
     omitting `branch` commits straight to `main`, which changes the live project and defeats the
     branch you just made.**
 - PROMOTE (no files): after editing a branch through the file tools with `branch`, call
     `project_vcs_commit({ project_id: <the project_id>, branch, message })` with NO `files` and NO
     `deletedFiles`. That promotes the branch's working tree into a commit - no bytes are
     re-uploaded, the tree pointer becomes the commit - and the response's `data.promoted` is true.
     Read the 409s as answers, not failures: `nothing_to_commit` means the branch is clean (nothing
     to retry); `branch_changed` means the head moved under you (someone saved or committed
     mid-call) - re-read `project_vcs_branches`, re-check the tree, then retry; `branch_busy` means
     another writer holds the branch lock - retry shortly. Messages are permanent history: keep
     them meaningful and never pad them with timestamps to defeat a replay (the server does not
     replay commits; a duplicate promote simply answers `nothing_to_commit`).
   Imperative, present-tense message ("Add pricing section", not "Added"). The envelope is
   `{ data: <commit>, preview_effect }`; a `main` commit carries a `checkpoint_hash` for
   `project_checkpoint_restore`, a branch commit does not (its rollback is `project_vcs_revert`,
   see `/hiveku:branch`). `project_vcs_history({ project_id, branch? })` / `project_version_log`
   show the trail; `project_vcs_compare` diffs two points.

6. MERGE when the branch is reviewed. Reviewed work goes through `/hiveku:pr`: open a native PR
   (`project_vcs_pr_create({ project_id, source_branch, title, target_branch? })`), read every changed
   path with `project_vcs_diff_file`, then `project_vcs_pr_merge({ project_id, number })` - STRICT:
   any conflict refuses the whole merge, nothing half-applied. The partial alternative is
   `project_vcs_merge({ project_id, branch, into?, message? })`: it applies the non-conflicting
   changes, returns `{ merged_into, applied, deleted, conflicts, commit }`, and files changed on
   BOTH sides come back in `conflicts` and are NOT overwritten - resolve them and merge again. Either
   way the branch survives. Merging into `main` is what changes the live project, and it is the ONLY
   way branch work reaches production: production always ships `main`. A development or staging tier
   bound to the branch ships it directly (`/hiveku:deploy`). To let a client sign off before the
   merge, use the branch preview in `/hiveku:preview`.

GitHub-connected projects are a different path: if `project_deployment_mode_get` reports
`mode: "github_sync"`, the repo is the source of truth and a save without a `project_commit` gets
overwritten by the next sync - use `/hiveku:github`.

Before anything risky on `main` (bulk refactor, `delete_missing` tree replace, dependency bump), take a
snapshot first with `/hiveku:checkpoint`. On a branch there is no checkpoint: the branch's last commit
is the rollback, so promote before the risky edit.
