---
description: Show build/deploy logs for an environment of this project (to debug a failed build).
argument-hint: "[preview|development|staging|production]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Get build/deploy logs for THIS project's **$ARGUMENTS** environment (default development). This project's id is `<the project_id>`.

1. If `.hiveku/logs/$ARGUMENTS.log` exists (written by the VS Code "show logs" action), read it first -
   it's the exact log the user is looking at.
2. Otherwise fetch fresh:
 - Failed build → `project_build_error_get({ project_id: <the project_id> })` for the extracted real error.
 - Full tier build log → `deploy_status({ project_id: <the project_id>, environment: "$ARGUMENTS" })` →
     take `.most_recent.deployment_id` → `deploy_get({ project_id: <the project_id>, deployment_id })` → `build_logs`.
     If the filtered query returns no rows, retry WITHOUT `environment` - legacy deployments store
     other tokens (e.g. "cloudfront") and the filter misses them.
 - Live Preview (Fly) → `preview_logs({ project_id: <the project_id> })` (runtime; no build phase).
3. Summarize the failure and propose a concrete fix.
