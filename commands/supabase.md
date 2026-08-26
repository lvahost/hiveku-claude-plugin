---
description: Manage this project's Supabase backend - auth users, storage, edge functions, migrations, RLS, table rows.
argument-hint: "[what to do - e.g. 'list storage buckets' or 'add an auth user']"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Manage THIS project's Supabase backend$ARGUMENTS. This project's id is `<the project_id>`. Every call takes `project_id: <the project_id>`.
(Only for projects with a provisioned Supabase DB - `database_status({ project_id })` confirms.)

- AUTH: `supabase_auth_users_list` / `supabase_auth_user_get` / `supabase_auth_user_create({ email, password, email_confirm })` / `supabase_auth_user_update` / `supabase_auth_user_delete`; provider config via `supabase_auth_config_get` / `supabase_configure_oauth` / `supabase_configure_smtp`.
- STORAGE: `supabase_storage_list` (buckets) → `supabase_storage_objects_list({ bucket, prefix })`; upload `supabase_storage_object_upload({ bucket, path, content, mime_type })`; share `supabase_storage_object_signed_url`.
- EDGE FUNCTIONS: `supabase_edge_functions_list` → `supabase_edge_functions_get_source`; deploy `supabase_edge_functions_deploy({ items: [{ slug, source }] })`; secrets `supabase_edge_functions_set_secrets`; test `supabase_edge_functions_invoke`.
- SCHEMA/DATA: migrations `supabase_migrations_list` → `supabase_migration_apply({ name, query })` (DDL - the versioned way to change schema, NOT ad-hoc SQL). RLS `supabase_policies_list({ schema, table })` → `supabase_policy_create({ table, name, command, using, check })`. Rows `supabase_table_rows_list` / `supabase_table_row_insert` / `_update` / `_delete`. Regenerate app types after schema changes: `supabase_gen_types`.
CONFIRM every write; migrations + policy + auth changes affect real data - snapshot with /hiveku:checkpoint before anything risky.
