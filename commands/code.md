---
description: Work on one of the account's Hiveku website projects - pull the code local, edit, verify, commit, deploy.
argument-hint: "[project name or id, and what to change]"
---

Operate on a Hiveku website project for the bound account$ARGUMENTS. Hiveku projects are versioned in the
platform (not GitHub); you edit them through the MCP tools. The high-leverage move is to pull the files
LOCAL so you edit with your native file tools, then push once - not round-trip every file.

**1. Pick the project.** `sites_list` → capture the `project_id`. That is the one call that returns every
buildable website_project with its dev/staging/prod URLs, canonical GitHub connection state (read from
`builder_project_settings`, not pm_projects), and dev container status - if the container is `stopped`,
`preview_start` before `preview_sync`. `project_get({ project_id })` gives the same detail for a single
project you already have a UUID for. Do NOT use `list_projects` / `get_project`: those are PM-projects
tools and a website_projects UUID 404s against them. Everything below needs this id.

**2. Pull it local.** `project_files_bulk_get({ project_id })` and write the files under
`projects/<slug>/` in this folder so you can read and edit them natively. Get the current branch (`main`).
It is ONE call only if the project fits: the response caps at 1MB per file (oversized files come back
marked `truncated` - refetch those with `project_file_get`) and 20MB total, above which it returns
`partial: true` + `next_cursor` that you MUST pass back to resume. An unresumed partial looks exactly
like a complete tree and is how you end up editing 424 of 538 files. Binary assets are excluded by
default and listed in `excluded_asset_paths[]`.
Record the handoff manifest NOW: write `projects/<slug>/.hiveku-pull.json` holding the pull's ISO
timestamp and each file's `version` from the response (a `project_files_snapshot` tarball carries the
same map as `.hiveku-manifest.json` at its root). Step 5 is impossible without it.

**3. Change it.** Edit the local files. Understand the framework from the files before editing; match the
project's existing patterns.

**4. VERIFY before you ship - a commit is not a deploy, and a green build is not a typecheck:**
 - `verify_typecheck`, `verify_lint`, `verify_run_tests` as applicable.
 - `project_test_build({ project_id, use_db_state: true })`. It is ASYNC: it returns
     `{ build_session_id }` and nothing else, so poll `project_test_build_log_get({ project_id,
     session_id })` every ~10s until `status` is `succeeded` or `failed`. A session id is not a pass.
     (`use_db_state: true` builds from the canonical saved files, which removes any dependence on your
     bulk_get being complete. `wait: true` blocks up to 5 min server-side, longer than most client
     timeouts - a timeout there is not a failed build.)
 - On a failed TEST build, read `project_test_build_log_get({ session_id })` - that is the oracle.
     Do NOT read `project_build_error_get` here: it returns the last failed real DEPLOY, which can be
     days old and from a different change set. Preview-container runtime errors are `preview_logs` /
     `preview_runtime_errors`; browser-side (hydration, dead interactivity) is `preview_client_errors`.
     Do not deploy a red build.

**5. HANDOFF CHECK before any save - you are NOT the only writer.** The in-app coder agent, the
builder UI, another Claude session, or a restore may have written to this tree while you edited, and
the save path is last-writer-wins with no compare-and-swap: a stale save silently buries their work
under a new current version. Before saving, ALWAYS:
 - `project_version_log({ project_id, since: <pulled_at from .hiveku-pull.json> })` - the combined
     timeline of edits, checkpoints, restores, and deploys, newest-first. You have saved nothing yet,
     so ANY `edit` or `restore` event since your pull is someone else's work.
 - `project_files_status({ project_id, target: "current" })`, sending your local manifest -
     `[{path, sha256}]` for every file you hold, hashed from the bytes on disk. It returns `changed` /
     `only_local` / `only_remote` with no content transfer; read `data.basis.confidence` (`exact` is
     byte-accurate).
 - CLEAN (no foreign events; `changed` + `only_local` are exactly the edits you made) → proceed to
     step 6.
 - DRIFT → STOP AND RECONCILE - do not save over it. `project_chat_history_list({ project_id })`
     (sessions updated since your pull) tells you what the in-app agent was asked to do;
     `project_chat_history_get({ project_id, session_id })` gives the transcript. For each file both
     of you touched, fetch the current remote copy (`project_file_get`) or `project_file_diff` its
     recent versions, merge the foreign change into your local file, and re-run
     `project_files_status` until the diff is only yours. Tell the user whose work you merged and
     what conflicted before saving anything.
 - ★ ABOVE A HANDFUL OF FILES, PULL THEM IN ONE CALL. `project_file_get` and `project_file_diff` are
     per-file; at 76 drifting files that is 76 round trips, and a session that reached this point
     reasonably decided to hand-write its own diff script instead. Use
     `project_files_bulk_get({ project_id })` - the same call step 2 uses to pull - and diff the
     returned tree against your local copies in memory. Reach for the singular tools when you want
     ONE file's version history, not to reconcile a set.
 - Keep the check→save window SHORT - the race is still open between check and save. If reconciling
     took more than a couple of minutes, re-run `project_version_log` immediately before the save.
 - This gate matters MOST on the tarball lane with `delete_missing: true`: a file someone else added
     after your pull is absent from your archive, and tree-replace will soft-delete it.

**6. Save + version.** For a small batch you just authored, `project_files_bulk_save({ project_id,
files })` in ONE call (not N saves). For a WHOLE-PROJECT or large push, use the byte-exact lane
instead: `COPYFILE_DISABLE=1 tar czf site.tar.gz -C <dir> .` excluding `node_modules/`, `.git/`,
`.next/` → `project_import_presign({ project_id })` → PUT to `upload_url` replaying `required_headers`
→ `project_import_finalize` → verify the returned per-file sha256 manifest against your local hashes.
Nothing goes through the model on that path, so no escaping, newline, or truncation corruption, and
binaries are lane-routed automatically. Archive cap 200MB compressed. Then
`project_vcs_commit({ project_id, message })` to version on `main` (add `branch` to version work off to the side instead — see /hiveku:commit). Commit ≠ live.

**7. Deploy when asked.** `deploy_site({ project_id, environment })` - `environment` is required and is
the TIER: `development` (default, safe, ship here first), `staging` (412 `staging_not_enabled` unless
opted in per project), `production` (slow CodeBuild path). Confirm with `deploy_status` /
`deploy_get`. Confirm with the user before a production deploy. Note that the tiers DO NOT share code
and there is no auto-promote: every change you want in production needs its own
`deploy_site({ environment: "production" })` call. Saving files reaches the Fly preview instantly and
touches no deployed tier.

**Working on a BRANCH instead of `main`.** Everything above is the `main` loop and stays
byte-identical when `branch` is omitted. When the user names a branch, or the work must not touch
the live project until it is reviewed, run the same loop with `branch` on every file tool. There is
no switch: `project_vcs_checkout` is a read, nothing server-side changes, and the working branch is
whatever `branch` you pass (see `/hiveku:commit` for the model). Create it first if needed:
`project_vcs_branch_create({ project_id, name, from? })`.
 - 2b. PULL: `project_files_bulk_get({ project_id, branch })` - same 1MB/20MB caps and the same
     `next_cursor` rule; entries carry `version: null` (tree entries, not builder_code_versions rows);
     the response carries `branch` and `basis: { kind: "branch", working_tree_etag }`.
     Write `projects/<slug>/.hiveku-pull.json` with `branch`, the ISO `pulled_at`, that
     `working_tree_etag` (confirm it matches the branch's row in `project_vcs_branches`), and each
     file's sha256 hashed from the BYTES you wrote to disk (as the main loop's step 5 does - do not
     rely on a per-entry `hash` field). Step 5b is impossible without the etag.
 - 4b. VERIFY: `verify_typecheck` / `verify_lint` / `verify_run_tests` on your local copy, then
     `project_test_build({ project_id, use_db_state: true, branch })` polled to `succeeded`; `files[]`
     + `branch` is refused with 400. `preview_logs` / `preview_runtime_errors` / `preview_client_errors`
     read the MAIN container, which never sees branch edits - a branch has its own preview session
     (`/hiveku:preview`).
 - 5b. HANDOFF CHECK on the branch - you are still not the only writer. `project_vcs_branches` and
     compare the branch's `working_tree_etag` with the one you recorded: a changed etag means someone
     saved or committed on this branch since your pull. Then `project_files_status({ project_id,
     target: "branch:<name>", local })` with your `[{path, sha256}]` manifest - `basis` is `branch`,
     `confidence` `exact`. Same verdicts as step 5: CLEAN → save; DRIFT → re-pull with
     `project_files_bulk_get({ branch })`, merge the foreign change into your local copy, re-check.
     `project_version_log` and `project_chat_history_list` are `main` signals; on a branch the etag
     and the status diff are the truth.
 - 6b. SAVE + PROMOTE: `project_files_bulk_save({ project_id, files, branch })` in ONE call. It
     writes the branch's working tree only - response `uncommitted: true`, a new `working_tree_etag`
     (record it), `checkpoint_hash: null` with a `note`, and `preview_effect` (synced a live branch
     preview if one exists, else start one). `delete_missing` on a branch takes NO checkpoint - the
     branch's last commit is the rollback. One file: `project_file_save({ project_id, file_path,
     content, branch, expected_hash })` - `expected_hash` is the sha256 you read, and a 409
     `content_conflict` ({ path, expected, actual }) means someone wrote it since. Tools without a
     `branch` parameter (the tarball import lane, `project_file_move`, `project_file_restore`,
     `project_files_bulk_delete`, `project_folder_delete`) are `main`-only: passing `branch` to them
     is refused (`branch_unsupported_for_tool`) rather than silently writing `main`; express a move
     on a branch as a save plus a `project_file_delete({ branch })`. Then PROMOTE:
     `project_vcs_commit({ project_id, branch, message })` with no `files` - the working tree becomes
     a commit (`data.promoted: true`). 409 `nothing_to_commit` = clean, nothing to do; 409
     `branch_changed` = re-read `project_vcs_branches` and retry; 409 `branch_busy` = retry shortly.
 - 7b. DEPLOY: `project_vcs_env_bindings({ project_id })` FIRST - the bindings decide which tree a
     tier ships, not the call. `production` always ships `main`; `development` / `staging` ship the
     branch they are bound to, else `main`. Bound to your branch → `deploy_site({ project_id,
     environment, branch })` - `branch` is an assertion, and the server refuses a mismatch (409
     `branch_not_bound`, 400 `production_immutable`) instead of shipping the wrong tree. A bound
     branch with unsaved (uncommitted) edits is promoted server-side before its tree is pinned, and
     the deploy response says so in its `note`. Not bound → `/hiveku:branch bind <tier>
     <branch>` (relay its CMS warning) or open a PR with `/hiveku:pr`. Production from a branch is
     ALWAYS PR merge into `main`, then `deploy_site({ environment: "production" })`.
 - Shared, not per-branch: the project database, secrets, media assets and CMS entries are one set
     for the whole project. A branch versions FILES; CMS writes land on `main`.

Rules: never deploy an unverified or red build. Never skip the step-5 (or 5b) handoff check before a
save. Show the diff and confirm before committing or deploying.
Keep `projects/` out of anything you push elsewhere - it holds the account's code.
