---
description: Hiveku-native branches for this project - list (with unsaved-changes markers), create, status, bind or unbind an environment, roll back to an earlier version, restore an archived branch, delete. No GitHub involved.
argument-hint: "[list | create <name> [from <branch>] | status <branch> | bind <development|staging> <branch> | unbind <tier> | rollback <branch> <version_id> | restore <branch> | delete <branch>]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Branch operations for THIS project$ARGUMENTS. This project's id is `<the project_id>`.

These are Hiveku-native branches (`project_vcs_*`), not GitHub branches - `github_*` and
`project_branch_switch` are the separate GitHub surface and 400 without a connected repo
(`/hiveku:github`). A branch has a WORKING TREE and a commit history, like `main`; `main`'s working
tree IS the live project, a branch's lives off to the side until merged. Nothing "switches": the
working branch is the `branch` you pass on each file tool (`/hiveku:commit` explains the model).

**list** (default): `project_vcs_branches({ project_id: <the project_id> })`. Show one line per
branch: name, `ahead` / `behind` versus the merge-base (both null on `main` and on a branch with no
base - null means "does not apply", never "in sync"), an UNCOMMITTED marker when `uncommitted` is
true (its working tree has edits not yet promoted into a commit), and the short
`working_tree_etag`. Then `project_vcs_env_bindings({ project_id })` and mark which branch
`development` / `staging` serve (`production` is always `main`). Also `project_vcs_pr_list({
project_id, status: "open" })` so a branch with an open PR is labelled. A branch whose pull request
(a review, in the dashboard) merged is ARCHIVED and left out of this list; `project_vcs_branches({
project_id, include_archived: true })` shows those too, each with `archived_at`,
`archived_pr_number` and `restorable_until`.

**create <name> [from <branch>]**: `project_vcs_branch_create({ project_id: <the project_id>, name,
from? })`. Names: letters, numbers, `. _ / -` only; use `feature/`, `fix/`, `task-<id>/`; keep them
short (preview machines cap the name). `from` defaults to `main`; branching off a branch with
uncommitted edits promotes them first, server-side. Creating changes nothing live. Tell the user the
next move: edit with `branch` on the file tools (`/hiveku:code`), save a version with `/hiveku:commit`.
On a site over 150 MB the create answers 413 `content_too_large`: say "Branches aren't available
for sites this large yet. You can still roll Your site back to any version." and keep the work on
Your site.

**status <branch>**: `project_vcs_branches` for that row (`uncommitted`, `working_tree_etag`,
`ahead` / `behind`), `project_vcs_history({ project_id, branch, limit: 10 })` for its versions (a
branch version has `checkpoint_hash` null and `revertable` false by design - `revertable` is about
checkpoint restores only; its rollback is `rollback` below), `project_vcs_compare({ project_id,
from: "main", to: <branch> })` for the changed paths, and `project_vcs_branch_preview_status({ project_id })` with no `session_id` to list its live
previews. Read one file's both sides with `project_vcs_diff_file({ project_id, from: "main", to:
<branch>, path })`.

**bind <development|staging> <branch>**: `project_vcs_env_bind({ project_id: <the project_id>,
environment, branch })`. From then on that tier's deploys ship the branch instead of `main`
(`/hiveku:deploy` step 0). `production` is refused with 400 `production_immutable` - `main` IS
production, permanently; the only road to production is a PR merge (`/hiveku:pr`). Binding does
NOT deploy; offer `deploy_site({ environment })` next. **RELAY THE `warning` IN THE RESPONSE
VERBATIM when it is present**: on a project with a CMS, every CMS write goes to `main` with no
branch awareness, so an entry edited in the CMS panel will NOT appear on a bound tier, and a
scheduled publish is held rather than going live. The warning's own wording predates the hold
(it still says a scheduled publish "will report success while never going live"): the current truth
is that the publish is HELD (the row stays scheduled and its error says why), not falsely completed -
say so after relaying it. Keep CMS work on an unbound tier, or merge the branch before relying on
CMS content there. The response is the full bindings object.

**unbind <tier>**: `project_vcs_env_bind({ project_id, environment, branch: "main" })` - `branch`
is required so a malformed call can never clear a binding by accident; `"main"` (or `""`) means
"track `main` again". The tier's NEXT deploy ships `main`; nothing redeploys by itself.

**rollback <branch> <version_id>**: the `/hiveku:rollback` flow with `branch` on every call. First
`project_vcs_history({ project_id, branch })` to pick a version in THIS branch's history, then the
dry run `project_vcs_rollback({ project_id: <the project_id>, branch, commit_id })` (a dry run is
the default) and show the person its counts and the version's name. On their yes, apply:
`project_vcs_rollback({ project_id, branch, commit_id, dry_run: false, expected_head_commit_id:
<the dry run's head_commit_id>, message? })`. It saves a NEW version whose files match the target -
nothing is deleted, the newer versions stay in the history - and it saves the branch's unsaved
edits first as their own version ("Saved before rollback"), so nothing is lost. 409
`branch_changed` means someone saved since the dry run: run it again and ask again. 400
`not_in_history` = that version is not in this branch's history. Your site is untouched; a tier
bound to the branch changes only on its next deploy, and a live branch preview reports what
happened in `preview_effect`. `project_vcs_revert` is the older branch-only form: use
`project_vcs_rollback`, which works on Your site too.

**restore <branch>**: an archived branch still reads (history, files, compare), but every write to it
answers 409 `branch_archived` ("Restore it first. Nothing was changed."): saves, versions, merges
into it, previews, binds, conflict resolves, rollbacks, a branch started from it, and a new or
reopened pull request. When the person wants to keep working on it,
`project_vcs_branch_restore({ project_id: <the project_id>, branch })` brings it back within 30 days
of the archive (`restorable_until`) and answers `{ data: { branch, restored, archived_at,
archived_pr_number } }`; restoring a branch that is not archived changes nothing. Refusals: 409
`restore_expired` (archived more than 30 days ago; Hiveku deletes it then), 409 `branch_name_taken`
(another branch has that name now), 409 `branch_busy` / `branch_changed` (retry), 404
`branch_missing`. Its merged work is already on its target, so new work usually belongs on a new
branch from `main`; restore when the person asks to continue this one.

**delete <branch>**: DESTRUCTIVE - once the ref is gone a later `project_vcs_prune` destroys its
tree bytes. Get an explicit yes naming the branch. Before deleting, the server promotes any
uncommitted edits into a final commit ("Snapshot before delete") so nothing becomes unreferenced.
`project_vcs_branch_delete({ project_id: <the project_id>, branch, confirm: true })` - `confirm`
travels as a query parameter and is required (400 `confirm_required`). The refusals, each with its
fix: `main` (400; never deletable); bound to an environment (409 - `unbind` that tier first); an open
pull request (409 - merge or close it in `/hiveku:pr` first); a stash branch `pending/*` or
`stash/*` (409 - it holds scooped customer work; merge it back first, and pass `force: true` ONLY
when the user explicitly says to discard it). Only delete a branch the user asked to clean up. A
branch whose pull request merged needs no delete: Hiveku archives it at the merge (unless an
environment is bound to it, another open pull request uses it, or the pull request was set to keep
it) and deletes it after 30 days. `project_vcs_prune` (storage GC of orphaned trees, `dry_run` default
true) is a different, heavier operation - do not run it as part of a delete.

Shared, not per-branch: the project database, secrets, media assets and CMS entries are one set for
the whole project. A branch versions FILES.
