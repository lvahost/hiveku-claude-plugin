---
description: Snapshot this project NOW (files + assets + DB) before a risky edit - one call to roll back to.
argument-hint: "[why - e.g. 'before refactor']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Take a full-project checkpoint of THIS project BEFORE risky work (bulk edits, refactors, template
extraction, dependency bumps). This project's id is `<the project_id>`.

Call `checkpoint_create({ project_id: <the project_id>, description: "$ARGUMENTS" })` - it captures every
current file, every asset, and (when configured) a database backup, and returns a `checkpoint_hash`.
Record that hash in your reply. To roll back later: `/hiveku:restore` (it is DESTRUCTIVE - see there).
This is the cheap insurance to take before anything you might need to undo wholesale.
