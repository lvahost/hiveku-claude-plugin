---
description: Spin up a NEW website project for this account — from a template, then inject sections.
argument-hint: "[what kind of site — e.g. 'a plumber landing page']"
---
Create a new site project for THIS account$ARGUMENTS. You do the build; the human approves.

1. Pick a starting point: `templates_list({ category?, search? })` (70+ site templates) — read `template_get({ slug })` for the one that fits, or start blank.
2. Create it: `site_create({ name, project_type: "website", creation_mode, template_id?, domain? })` → returns the new project_id. (Clone an existing one instead with `site_clone({ project_id, new_name })`; register an already-hosted site with `site_create_external({ name, external_website_url })`.)
3. Add sections: `components_list({ category?, intent?, style?, search? })` (~220 prebuilt sections) → `components_add({ project_id: <new id>, components: [...], dry_run: true })` first to preview, then for real — it injects each section's files + resolves npm deps.
4. Download it locally to keep building: pull it local and continue with `/hiveku:code` (which verifies and deploys).
5. Point a domain at it with /hiveku:code (in the site's folder) and configure the CMS with /hiveku:code.
Confirm before `site_create`/`site_delete` (delete is irreversible + drops any Supabase billing). Reflect the new project as a PM task if this is client work.
