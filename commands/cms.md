---
description: CRUD this project's CMS - collections, fields, and entries - then publish.
argument-hint: "[what to do - e.g. 'add a blog post' or 'list collections']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Work on THIS project's CMS$ARGUMENTS. This project's id is `<the project_id>`. `collection_id` is the collection SLUG from the
manifest (e.g. `blog`), NOT a UUID.

1. ORIENT first: `cms_read_manifest({ project_id: <the project_id> })` (collections + their field schemas) or
   `cms_list_collections({ project_id: <the project_id> })`. To see entries:
   `cms_list_entries({ project_id: <the project_id>, collection_id, status? })`; read one with
   `cms_read_entry({ project_id: <the project_id>, collection_id, slug })`; find by text with `cms_search_entries`.
2. COLLECTIONS (schema): `cms_create_collection({ project_id: <the project_id>, id, name, path, format, fields })`
   / `cms_delete_collection`. Fields: `cms_add_field` / `cms_update_field` / `cms_remove_field`
   (valid types from `cms_field_types`). Changing schema affects every entry - confirm first.
3. ENTRIES (content): `cms_write_entry({ project_id: <the project_id>, collection_id, slug, fields })`
   (upsert by slug; `data` is an accepted alias for `fields`). The optional top-level `status`
   ("draft"|"published"|"scheduled") and `publish_at` are merged in as ORDINARY FIELDS named `status`
   and `publishAt` - `status: "draft"` does NOT create a draft, and `publish_at` alone only date-gates
   rendering (a real scheduled flip needs the schedule cron). Bulk-create in ONE call with
   `cms_bulk_import({ project_id: <the project_id>, collection_id, items: [{ slug?, fields }] })` - prefer this
   over many single writes. Delete: `cms_delete_entry({ project_id: <the project_id>, collection_id, slug })`.
4. PUBLISH - the flow is write-draft → review → promote, and `draft: true` is the only thing that
   makes a draft:
 - `cms_write_entry({ ..., fields, draft: true })` writes the entry's draft shadow instead of the
     live entry (validation is skipped, so partial payloads are fine).
 - Review it: `cms_read_entry({ ..., draft: "1" })` reads the shadow back. `cms_preview_write` can
     paint the Fly preview iframe, but it writes NOTHING to the database and creates no draft -
     promoting after it alone returns 404.
 - `cms_promote_draft({ project_id: <the project_id>, collection_id, slug, locale?, force? })` copies
     the shadow over the live entry, deletes it, and fires save webhooks. Confirm first. Failures to
     read rather than retry: 422 (the draft no longer validates against the current schema, or has
     dangling references), 409 (a concurrent live edit landed - `force: true` overwrites it, which is
     a lost update), 404 (no draft exists). `locale` for localized collections.
 - Versioned - recover with `cms_list_entry_versions` → `cms_restore_entry_version`.
Write brand-aligned copy (read `account_context_get` / the account memory first), confirm destructive
changes, and after edits check the page in the browser or the live preview.
