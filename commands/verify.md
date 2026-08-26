---
description: Run Hiveku's checks (typecheck, lint, tests, build) for this project.
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
Run all checks for THIS project and report results. This project's id is `<the project_id>`.

`verify_typecheck({ project_id: <the project_id> })`, `verify_lint({ project_id: <the project_id> })`,
`verify_run_tests({ project_id: <the project_id> })`, then `project_test_build({ project_id: <the project_id>, use_db_state: true })`.
List every failure with the offending file/line so it can be fixed.
