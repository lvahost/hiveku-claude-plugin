---
description: "Go back to an earlier version of the site (or a branch) - pick the version, see exactly what would change, get a yes, then roll back. Undoable, and nothing goes live until a separate publish."
argument-hint: "[which version - a name, a date, or a version id; add 'on <branch>' for a branch]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Roll THIS project back to an earlier version$ARGUMENTS. This project's id is `<the project_id>`.

**What a rollback is, in the words to use with the person.** It puts the site's files back the way
they were in an earlier version, by saving a NEW version that matches it. Nothing is deleted: the
newer versions stay in the history, so a rollback can itself be undone by rolling back again.
Changes that were not a version yet are saved first as their own version ("Saved before
rollback"), so no work is lost. Say "Your site" for `main` and "version" for a saved point; never
"commit", "revert" or "HEAD".

**What it does NOT do.** It does not change the live website: the files change and the preview
follows, but visitors see the new state only after a separate publish (`/hiveku:deploy`), which
needs its own yes. It does not touch the database, CMS entries, secrets, or the shared images in
the media library; for the database use `/hiveku:restore` (a checkpoint with `restore_database`).

1. FIND the version. `project_vcs_history({ project_id: <the project_id>, branch: "main", limit: 20 })`
   (or the branch name). Show one line per version: its name, when, `source` in plain words (the AI
   assistant, a person in the editor, this assistant, a publish, a rollback, automatic save), and
   `live_on` (which tiers serve it). Older pages: pass `meta.nextBefore` as `before`, and stop on an
   empty page or when fewer than `limit` come back (`meta.truncated` stays true on the last page, so
   it is not the signal). Offer only versions with `restorable: true` (or no `restorable` field, on
   an older platform) as targets; for one with `restorable: false`, show its `restore_blocked_reason`
   as written (its files were never copied, so a dry run would answer 409 `content_unavailable`).
   Agree the target with the person by NAME and time, then use its `id`.

2. DRY RUN - always first, and it is the default: `project_vcs_rollback({ project_id: <the project_id>,
   commit_id: <the version id>, branch? })` with no `dry_run` changes nothing. From `data` read:
   - `target.name` / `target.created_at` - say these back, so the person confirms the right one;
   - `noop: true` - the site already matches that version; there is nothing to do, say so and stop;
   - `changes.files` (`changed`, `removed`, `added_back`) and `changes.pages` - the counts and pages
     in plain words ("3 pages change, 1 page comes back, 2 files are removed"); `changes.hidden`
     counts the assistant's own notes, which roll back too but are not worth listing;
   - `auto_version` - when set, the unsaved changes will be saved first as "Saved before rollback";
   - `versions_undone.count` / `newest` - the versions whose changes this takes out (they stay in the
     history);
   - `skipped.shared_assets` / `assets_affected` - images in the shared media library that are NOT
     rolled back; name them if the person expects them back;
   - `live_includes_undone_work` (Your site) - true means the live website still shows work this
     rollback takes out: the cue to offer a publish afterwards;
   - `ai_turn_running: true` - the in-app AI is working on this project right now; the apply will be
     refused until it finishes;
   - `head_commit_id` (and on Your site `live_fingerprint`) - KEEP both for step 4.
   Refusals here: 400 `not_in_history` (that version is not in this branch's history - pick one
   from step 1's list for this branch), 404 `commit_not_found` (unknown version id), 400
   `stash_branch_readonly` (a `pending/` or `stash/` branch holds scooped work; merge it instead).

3. CONFIRM with the person: the version's name and time, the counts, what is saved first, what is
   not included (database, CMS entries, shared images), that it can be undone, and that the live
   website does not change yet. Wait for an explicit yes. Never apply on a guess or a "probably".

4. APPLY: `project_vcs_rollback({ project_id: <the project_id>, commit_id, branch?, dry_run: false,
   expected_head_commit_id: <the dry run's head_commit_id>, expected_live_fingerprint: <the dry run's
   live_fingerprint, Your site only>, message? })`. `expected_head_commit_id` is REQUIRED on Your site
   (400 `expected_head_required` without it). `message` is optional: the default name is
   `Rolled back to "<version name>"`. If you write one, it is a plain-language name of what changed
   for visitors, e.g. "Updated the pricing section on the Home page" or "Put the old Home page
   back" - never file paths, file extensions, `fix:`-style prefixes, tool names or an "AI:" byline.
   Hiveku always asks the person before an apply; that prompt is expected.
   Answers:
   - 200: `data.version` is the new version (its `name`), `data.auto_version` the "Saved before
     rollback" version when one was needed, `data.concurrent_edits` any files someone else changed
     while it ran, and `preview_effect` says what happened to the preview. Tell the person: "Your
     site now matches <version name>. The newer versions are still in the history, so this can be
     undone. The live website has not changed."
   - 409 `branch_changed` (+ `head_commit_id`): someone saved in between. Nothing changed. Run the
     dry run again, show the new counts, and ask again.
   - 409 `ai_turn_running`: the in-app AI is mid-request on this project. Wait for it, then retry.
   - 409 `branch_busy` or 503 `branch_tree_unavailable`: retry shortly.
   - 409 `rollback_incomplete` (`applied`, `failed`, `head_commit_id`): the files WERE written but
     the rollback did not finish. Run the same apply again with `expected_head_commit_id` set to
     that `head_commit_id` to finish it.
   - 409 `content_unavailable` (`paths`, `checkpoint_hash`): that version's files cannot be rebuilt.
     When `checkpoint_hash` is set, offer `/hiveku:restore` with it instead (dry run first).
   - 413 `content_too_large`: nothing was changed; the files to restore are too large for one
     rollback. Say so and report it with `hiveku_report_issue`.

5. PUBLISH is a separate step. Rollback and deploy are two calls and two yeses, never one. If the
   person wants the live website to match (always ask when `live_includes_undone_work` was true),
   run `/hiveku:deploy` for the tier they name; production is `deploy_site({ project_id,
   environment: "production" })`, and it ships the version you just made.

**On a branch** the same four steps apply with `branch` on every call: the branch moves back,
Your site is untouched, and a tier bound to that branch changes only on its next deploy.
`project_vcs_revert` is the older branch-only form; use `project_vcs_rollback`.

**Undo a rollback:** it is just another version. Run this command again and pick the version the
rollback came from: the rollback's own history entry names it in `rolled_back_from`.
