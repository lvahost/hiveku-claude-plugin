---
description: Snapshot this project NOW (files + assets + DB) before a risky edit - one call to roll back to.
argument-hint: "[why - e.g. 'before refactor']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Take a full-project checkpoint of THIS project BEFORE risky work that versions do not cover. This
project's id is `<the project_id>`.

Versions are saved for every finished change (`/hiveku:commit`, and automatically before a publish, a
merge or a rollback), and any version can be rolled back with `/hiveku:rollback`, so a checkpoint is no
longer the everyday undo for files. Take one when the work touches what a version does not hold: the
DATABASE (a migration, a data import), a `delete_missing` tree replace, or the shared media-library
images (replacing or deleting them with `assets_upload` / `assets_delete` / `assets_migrate_to_public`,
or anything under `public/<folder>/`); before a production deploy that ships database or shared-image
changes; and before a risky edit on a project whose database you may need back.

Call `checkpoint_create({ project_id: <the project_id>, description: "$ARGUMENTS" })` - it captures every
current file, every asset, and (when configured) a database backup, and returns a `checkpoint_hash`.
Record that hash in your reply. To roll back later: `/hiveku:restore` (it is DESTRUCTIVE - see there).
This is the cheap insurance to take before anything you might need to undo wholesale.
