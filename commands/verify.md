---
description: Run Hiveku's checks (typecheck, lint, tests, build) for this project.
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Run all checks for THIS project and report results. This project's id is `<the project_id>`.

`verify_typecheck({ project_id: <the project_id> })`, `verify_lint({ project_id: <the project_id> })`,
`verify_run_tests({ project_id: <the project_id> })`, then `project_test_build({ project_id: <the project_id>, use_db_state: true })`.
List every failure with the offending file/line so it can be fixed.
