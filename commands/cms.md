---
description: CRUD this project's CMS — collections, fields, and entries — then publish.
argument-hint: "[what to do — e.g. 'add a blog post' or 'list collections']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
Work on THIS project's CMS$ARGUMENTS. This project's id is `<the project_id>`. `collection_id` is the collection SLUG from the
manifest (e.g. `blog`), NOT a UUID.

1. ORIENT first: `cms_read_manifest({ project_id: <the project_id> })` (collections + their field schemas) or
   `cms_list_collections({ project_id: <the project_id> })`. To see entries:
   `cms_list_entries({ project_id: <the project_id>, collection_id, status? })`; read one with
   `cms_read_entry({ project_id: <the project_id>, collection_id, slug })`; find by text with `cms_search_entries`.
2. COLLECTIONS (schema): `cms_create_collection({ project_id: <the project_id>, id, name, path, format, fields })`
   / `cms_delete_collection`. Fields: `cms_add_field` / `cms_update_field` / `cms_remove_field`
   (valid types from `cms_field_types`). Changing schema affects every entry — confirm first.
3. ENTRIES (content): `cms_write_entry({ project_id: <the project_id>, collection_id, slug, fields, status:
   "draft"|"published"|"scheduled", publish_at? })` (upsert by slug). Bulk-create in ONE call with
   `cms_bulk_import({ project_id: <the project_id>, collection_id, items: [{ slug?, fields }] })` — prefer this
   over many single writes. Delete: `cms_delete_entry({ project_id: <the project_id>, collection_id, slug })`.
4. PUBLISH: a saved draft goes live via `cms_promote_draft({ project_id: <the project_id>, collection_id, slug,
   force? })` (force overrides the 409 lost-update guard). Versioned — recover with
   `cms_list_entry_versions` → `cms_restore_entry_version`.
Write brand-aligned copy (read `account_context_get` / the account memory first), confirm destructive
changes, and after edits check the page in the browser or the live preview.
