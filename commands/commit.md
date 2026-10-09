---
description: "Save a named version of this project's changes in Hiveku's native VCS - status, build gate, then one version of Your site or a branch. A version is NOT live; putting it live is /hiveku:deploy."
argument-hint: "[version name, optional; add 'on <branch>' to version a branch's working tree]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Commit THIS project's pending work$ARGUMENTS. This project's id is `<the project_id>`.

**Saving a version is NOT a deploy.** Nothing a version does is visible to the site's visitors. Say
so in your reply ("that's saved as a version, but not live yet") so nobody reads it as "shipped" -
deploying is `/hiveku:deploy`. Use the word "version" with the person, never "commit".

**The working-branch model - read this once.** A branch has a WORKING TREE and a commit history,
exactly like `main`. `main`'s working tree IS the live project; a branch's working tree lives off to
the side and never enters the live project until it is merged. There is no "switch":
`project_vcs_checkout` is a READ that returns a branch's tree so you can materialize it locally, and
it changes nothing server-side - not the editor, not any tier, and no tool does. It pages: send
`limit` (up to 2000 files), then `cursor: <next_cursor>` until `next_cursor` is null; unpaged, a
read of Your site over 150 MB answers 413 `content_too_large` (nothing changed). The working branch
is simply the `branch` you pass on every file tool: `project_files_bulk_get` / `project_file_get` to
read, `project_file_save` / `project_files_bulk_save` / `project_file_delete` to write,
`project_test_build({ use_db_state: true, branch })` to build, `preview_screenshot` /
`preview_http_get` with `branch` to look at its branch preview. Omit `branch` (or pass `"main"`)
and every one of those operates on the live project, byte-identical to before. A write with
`branch` updates that branch's working tree only - `uncommitted: true` on the response, never a
commit, never `main`.

1. SEE what is pending. On `main` (Your site): `project_vcs_status({ project_id: <the project_id>,
   detail: "files" })` - `uncommitted` (changes no version holds yet), `latest_changes` (`state`
   `editing` = someone saved in the last few minutes, `pending` = quiet but unversioned, and a plain
   `summary`), `changed_files` (null = unknown, never "none") and `last_version`.
   `uncommitted: false` with `uncommitted_reason: "unknown"` means it could not tell, not clean.
   `project_file_get` reads a file back. On a branch:
   `project_vcs_branches({ project_id })` - each branch carries `uncommitted` (its working tree is
   ahead of its last commit) and `working_tree_etag`; `project_vcs_compare({ project_id, from:
   "main", to: <branch> })` lists what the branch changed and `project_vcs_diff_file({ project_id,
   from: "main", to: <branch>, path })` shows both sides of one file. Show the user what is about to
   be versioned and get a yes. A dirty tree from a prior session gets reconciled before you add to
   it - do not bury someone else's half-finished work inside your commit.

2. BRANCH for anything non-trivial: `project_vcs_branch_create({ project_id, name, from? })`
   (`feature/`, `fix/`, `task-<id>/`; keep names short - preview machines cap them). From here on
   pass that `branch` on every file tool. Risky work does not go straight on the main line.
   `/hiveku:branch` lists, binds and deletes branches. On a site over 150 MB the create answers 413
   `content_too_large` ("Branches aren't available for sites this large yet. You can still roll
   Your site back to any version."): work on Your site, versioning each change, instead.

3. GATE on a green build: `project_test_build({ project_id: <the project_id>, use_db_state: true,
   branch? })`, then poll `project_test_build_log_get({ project_id, session_id })` every ~10s until
   `status` is `succeeded` or `failed`. The call returns only a `build_session_id` - that is not a
   verdict. With `branch` it builds the branch's working tree (uncommitted edits included);
   `files[]` + `branch` is refused with 400. On a red build read that same log (NOT
   `project_build_error_get`, which reports the last failed real DEPLOY and can be days stale), fix,
   re-save, re-build. Version green states only.

4. If pages moved: `project_files_validate_orphan_routes({ project_id })` and read
   `route_collisions[]`, not the orphan count - `orphans: 0` does not mean routing is healthy. It
   reads the live project, so for branch work run it after the merge as well.

5. SAVE THE VERSION - one tool, two shapes. The PROMOTE is the normal one:
 - PROMOTE (no files) - after saving through the file tools, call `project_vcs_commit({ project_id:
     <the project_id>, message })` with NO `files` and NO `deletedFiles` (add `branch` for a
     branch). On Your site it saves everything that is not a version yet, from ANY writer (people
     in the editor, the in-app AI, other sessions), as ONE version - so read step 1 first and say
     whose changes it includes. On a branch it turns the branch's working tree into a version (no
     bytes re-uploaded). `data.promoted` is true. It changes no file, so you need not ask the
     person first, but their settings may show a permission prompt for it; that is expected. Once
     per change the owner would recognize - never per file or per batch.
 - WITH files: `project_vcs_commit({ project_id: <the project_id>, message, files, deletedFiles?,
     branch })` writes the files AND saves the version in one call; Hiveku asks before it runs.
     **On a branch, pass the branch from step 2 - omitting `branch` writes straight to Your site,
     the live project's source, and defeats the branch you just made.**
   The NAME (`message`) is a plain-language description of what changed for visitors, written for
   a non-technical site owner who reads it in the dashboard's history: "Updated the pricing section
   on the Home page", "Added a contact form to the About page". Never file paths, file extensions,
   `fix:`/`feat:` prefixes, tool names or an "AI:" byline; never pad it with timestamps. Omit it
   and the server names the version from the pages that changed.
   Read the 409s as answers, not failures: `nothing_to_commit` means everything is already in a
   version (its `latest_version` names the newest; nothing to retry); `branch_changed` means
   someone saved or versioned mid-call - re-check step 1, then retry; `branch_busy` means another
   writer holds the lock - retry shortly.
   The envelope is `{ data: <version>, preview_effect }`; on Your site `data.saved_before` names a
   version the server saved first for other people's pending changes. To go back to any version,
   of Your site or a branch, use `/hiveku:rollback`. `project_vcs_history({ project_id, branch? })`
   shows the trail; `project_vcs_compare` diffs two points.

6. MERGE when the branch is reviewed. Reviewed work goes through `/hiveku:pr`: open a native PR
   (`project_vcs_pr_create({ project_id, source_branch, title, target_branch? })`), read every changed
   path with `project_vcs_diff_file`, then `project_vcs_pr_merge({ project_id, number })` - STRICT:
   any conflict refuses the whole merge, nothing half-applied. The partial alternative is
   `project_vcs_merge({ project_id, branch, into?, message? })`: it applies the non-conflicting
   changes, returns `{ merged_into, applied, deleted, conflicts, commit }`, and files changed on
   BOTH sides come back in `conflicts` and are NOT overwritten. Either way, conflicts are settled with
   `project_vcs_conflicts` and `project_vcs_resolve` on the branch the answer's `resolve` names,
   deciding each file with the person (`/hiveku:pr resolve`), then merge again: editing the file on
   the branch and saving a version never clears a conflict. With the site's "Require an approval"
   rule on (`project_vcs_settings`), a PR into Your site merges only once a person approves its
   current changes in the Hiveku dashboard (agents never approve), and a direct `project_vcs_merge`
   into Your site answers 409 `pull_request_required`. A merge that lands everything archives the
   source branch: hidden from the list, refusing changes (409 `branch_archived`), restorable for 30
   days with `/hiveku:branch restore`. Merging into `main` is what changes the live project, and it
   is the ONLY way branch work reaches production: production always ships `main`. A development or
   staging tier bound to the branch ships it directly (`/hiveku:deploy`). To let a client sign off
   before the merge, use the branch preview in `/hiveku:preview`.

GitHub-connected projects are a different path: if `project_deployment_mode_get` reports
`mode: "github_sync"`, the repo is the source of truth and a save without a GitHub push
(`project_commit`, which pushes to GitHub and is NOT a Hiveku version) gets overwritten by the next
sync - use `/hiveku:github`.

Before a risky edit, save a version first (a promote with no files): that version is the rollback
point, on Your site and on a branch alike (`/hiveku:rollback`). Versions cover files only, so before
anything that also touches the database, or a `delete_missing` tree replace, take
`/hiveku:checkpoint` as well.
