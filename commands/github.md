---
description: GitHub sync for this project - status, branches, PRs, and per-tier auto-deploy branches.
argument-hint: "[e.g. 'open a PR from feature/x' or 'status']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
GitHub operations for THIS project$ARGUMENTS. This project's id is `<the project_id>`.

FIRST check this project is GitHub-connected: `project_deployment_mode_get({ project_id: <the project_id> })` (mode must be github_sync) and `github_status({ project_id: <the project_id> })`. If it's on Hiveku-native VCS instead, use /hiveku:commit - github_* won't apply.

- Branches: `github_branches_list` / `github_branches_create({ branch_name, from_branch })`; switch the working branch with `project_branch_switch({ project_id: <the project_id>, branch, commit_pending? })`.
- Inspect: `github_commits`, `github_compare`.
- PRs: `github_pr_list` / `github_pr_get` / `github_pr_create({ title, head, base, body_text })` / `github_pr_merge` (confirm merges).
- Auto-deploy wiring: `project_deployment_mode_set` / `project_github_configure({ github_dev_branch, github_staging_branch, github_production_branch, github_auto_deploy_* })` - which branch auto-deploys to which tier.
CONFIRM merges + config changes with the user.
