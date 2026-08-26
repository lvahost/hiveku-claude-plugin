---
description: Manage this project's URL redirects — list, add, edit, remove, then deploy them.
argument-hint: "[what to do — e.g. 'add /old -> /new' or 'list']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Manage URL redirects for THIS project$ARGUMENTS. This project's id is `<the project_id>`.

1. ALWAYS list first: `project_redirects_list({ project_id: <the project_id> })` — show from_path → to_path,
   status_code, match_type, is_active, and each redirect's `id`.
2. Change as asked:
   - Add: `project_redirect_create({ project_id: <the project_id>, from_path, to_path, status_code: 301, match_type: "exact"|"prefix"|"regex", is_active: true, notes? })`
     (301 = permanent, 302 = temporary; from_path is a site-relative path like `/old-page`).
   - Edit: `project_redirect_update({ project_id: <the project_id>, redirect_id, ...fields })` (id from step 1).
   - Remove: `project_redirect_delete({ project_id: <the project_id>, redirect_id })`.
3. DEPLOY to take effect (redirects are NOT live until deployed):
   `project_redirects_deploy({ project_id: <the project_id>, tier: "development"|"staging"|"production" })`.
Confirm each create/update/delete with the user, and avoid redirect loops (never point a path at itself
or create A→B→A chains). After deploying to production, spot-check one redirect in a browser.
