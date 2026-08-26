---
description: Open/refresh this project's live Fly preview and screenshot it.
argument-hint: "[path, default /]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
For THIS project, refresh + view the live preview. This project's id is `<the project_id>`.

If you just changed files, `preview_sync({ project_id: <the project_id> })` first. Then `preview_overview({ project_id: <the project_id> })`
for the URL and `preview_screenshot({ project_id: <the project_id>, path: "$ARGUMENTS" })` (default "/") so we can see it.
