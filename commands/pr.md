---
description: Hiveku-native pull requests for this project - open, review every changed file, merge strict (any conflict means nothing merges), close, reopen. The only road from a branch to production.
argument-hint: "[open <source> [into <target>] | list | review <number> | merge <number> | close <number> | reopen <number>]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Pull-request operations for THIS project$ARGUMENTS. This project's id is `<the project_id>`.

These are Hiveku-native PRs between Hiveku-native branches (`project_vcs_pr_*`), not GitHub PRs -
`github_pr_*` is the separate GitHub surface and 400s without a connected repo (`/hiveku:github`).
A PR is reviewable merge INTENT; merging one into `main` is what changes the live project, and it
is the ONLY way branch work reaches production (`production` always ships `main`). A merge is not a
deploy: after merging, `/hiveku:deploy` ships `main` to the tier.

**open <source> [into <target>]**: check the branch first - `project_vcs_branches({ project_id:
<the project_id> })` for `uncommitted` (fine to open with edits pending: the merge promotes them
server-side, but tell the user the PR will include the working tree as it stands) and
`project_vcs_compare({ project_id, from: <target>, to: <source> })` so the title describes a real
change (an empty compare means nothing to review). Then `project_vcs_pr_create({ project_id,
source_branch, target_branch?, title, description? })` - `target_branch` defaults to `main`. Report
the PR `number`; offer a branch preview for sign-off (`/hiveku:preview`).

**list**: `project_vcs_pr_list({ project_id, status? })` (`open` | `merged` | `closed`). Read
`source_branch_recreated`: `true` means the branch name was deleted and reused after the PR, so the
PR's history does not describe the branch wearing that name now; `null` means not checked - never
read it as an assurance.

**review <number>**: `project_vcs_pr_get({ project_id, number })` returns `{ data: { pr, diff,
diff_error } }` - the path-level diff is live on every read, and a non-null `diff_error` means the
diff could not be computed (say so; do not report "no changes"). Then read EVERY changed path you
are asked to review with `project_vcs_diff_file({ project_id, from: <pr.target_branch>, to:
<pr.source_branch>, path })` - `base` is the file on the target, `head` the file on the source, a
side is null where the path does not exist, `status` is `added` / `removed` / `modified` / `same`,
and sides over 1 MB come back with `tooLarge` instead of content. Uncommitted working-tree edits on
either branch ARE in the diff. For a real review also build the source branch
(`project_test_build({ project_id, use_db_state: true, branch: <source> })`, polled to `succeeded`)
- a PR that does not build does not merge. Summarize per file what changed and anything risky
(routes moved, config, dependencies, deleted files).

**merge <number>**: explicit yes first, naming source, target and whether the target is `main` (the
live project). `project_vcs_pr_merge({ project_id: <the project_id>, number, message? })` is
STRICT and atomic: if ANY file conflicts, NOTHING is merged, the PR stays open, and the call answers
409 `merge_conflicts`. Read the conflicts at `details.conflicts` (also `details.conflict_details` /
`details.conflict_count`, and still under `details.data.conflicts` for older callers) - list every
conflicting path to the user, resolve them on the SOURCE branch (`/hiveku:code` with `branch`),
and retry the same PR; never report a conflict-free failure because you looked in one place. On
success the envelope is `{ data: { pr, merge, relabel_failed? } }`: `merge.commit` is the merge
commit on the target (a `main` merge carries a `checkpoint_hash`, so the whole branch's work can
be rolled back in one `project_checkpoint_restore`), and `relabel_failed` present means the PR row
merged but its status label could not be updated - the merge is real, mention it, do not retry.
`merged` is terminal. Then offer the follow-ups: `deploy_site({ environment: "production" })`
via `/hiveku:deploy` (a merge ships nothing by itself); `project_vcs_branch_delete` via
`/hiveku:branch delete` once the branch is finished (refused while a tier is still bound to it -
unbind first, and the branch is not deleted by the merge).

**close <number>**: `project_vcs_pr_close({ project_id, number })` - nothing merges, the source
branch is untouched; 409 if the PR is not open. **reopen <number>**: `project_vcs_pr_reopen({
project_id, number })` for a closed PR; a merged PR cannot reopen.

The partial alternative without a PR is `project_vcs_merge` (applies the clean files, returns the
rest in `conflicts`); prefer the PR lane for anything reviewed or anything bound for `main`.
