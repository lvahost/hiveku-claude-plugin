---
description: Run this project's AI redesign pipeline — import an existing site's pages and rebuild them.
argument-hint: "[a source URL to import, optional]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
Drive the redesign pipeline for THIS project$ARGUMENTS. This project's id is `<the project_id>`. Follow the ordered flow and check
`redesign_status({ project_id: <the project_id> })` between steps.

1. `redesign_start({ project_id: <the project_id> })` — begins the import (crawls the source site).
2. `redesign_select_pages({ project_id: <the project_id> })` — choose which discovered pages to rebuild.
3. `redesign_import({ project_id: <the project_id> })` — imports content/structure; it writes a brief to
   `.hiveku/redesign/<slug>.json` for you. READ that file, then rebuild those pages in the project's
   code (edit files, then /hiveku:commit).
4. `redesign_homepage_approve` once the homepage looks right, then `redesign_promote({ project_id: <the project_id> })` to make the redesign the live version.
`redesign_restart` starts over. Show the user progress after each step; this is multi-minute per stage.
