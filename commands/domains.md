---
description: Manage this project's custom domains — list, add (with DNS + SSL status), update, remove.
argument-hint: "[e.g. 'add www.example.com to production']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
Manage custom domains for THIS project$ARGUMENTS. This project's id is `<the project_id>`.

1. List first: `project_domains_list({ project_id: <the project_id>, tier? })` — shows each domain, tier, is_primary, and SSL/verification status.
2. Add: `project_domains_add({ project_id: <the project_id>, domain, tier: "development"|"staging"|"production", is_primary? })` — the response includes the DNS RECORDS the user must create at their registrar (A/CNAME) and the pending-SSL state. SURFACE those records verbatim so the user can set them; SSL provisions after DNS resolves.
3. `project_domains_update` (e.g. flip is_primary) / `project_domains_remove({ project_id: <the project_id>, domain? })`.
Confirm add/remove; a domain isn't live until its DNS records resolve + SSL provisions. Tell the user to add the returned records, then re-run list to watch status flip to verified.
