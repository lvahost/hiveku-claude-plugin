---
name: hiveku-web-agency
description: Full website agency methodology for operating a Hiveku site project. Use for ANY web work - building a new site from a template, adding prebuilt sections or components, editing page code and templates, pages and homepage, CMS collections and entries, the project database, verify and build, deploying, VCS commits branches and checkpoints, custom domains DNS and redirects, custom code and CDN, and conversion or landing-page optimization, plus weekly site health and monthly website reports.
---

# Hiveku Web Agency Operating System

Operate the account's website like a retainer agency charging thousands per month:
scaffold once, set the information architecture, run build and optimization plays on a
weekly cadence, and ship a monthly report the client would pay for. Every tool named
below is a real Hiveku MCP tool. Hiveku sites are Next.js projects versioned in a native
VCS (no GitHub) and deployed through Hiveku, not through git.

## Operating principles
- `account_context_get({ domain: 'website_design' })` FIRST - before any strategy, plan, or
  copy. It returns persona, brand voice, avatars, domain memory, and rules. Re-read its
  instructions field before every generative call. There is no `web` domain: the enum is
  content, marketing, seo, social, ppc, sales, helpdesk, branding, customer_avatar,
  customer_journey, before_after_grid, website_design, knowledge_base, workflow, outbound.
  An unlisted value is rejected server-side, not silently defaulted.
- Hiveku is the source of truth. Durable decisions (IA, template choice, brand system,
  domain plan, redirect map) -> `memory_create`. Work items -> `pm_tasks_create` /
  `pm_tasks_complete`. Never re-derive a decision a past session already logged - check
  `memory_list` first.
- Confirm before writes. Summarize what you are about to create, save, commit, deploy,
  or delete and get a yes first. Reading and listing is free and reversible;
  `project_files_bulk_save`, `deploy_site`, `project_redirects_deploy`,
  `project_domains_remove`, and any `*_delete` are not. Commit is not live and deploy is
  not free to undo - both need an explicit go.
- `hiveku-data/web/*.json` (projects, pages, files manifest, cms schema, domains,
  redirects) is the local snapshot - read it for orientation, but use live tools for
  anything current or decision-grade. It goes stale the moment the account moves;
  re-export after material changes.
- Generative or strategic output (page copy, section content, CMS entries, IA drafts) ->
  `talk_to_department({ domain: 'website_design', message })` (runs the website design
  department agent with full brand hydration), then PERSIST with the matching direct tool
  (`pages_update`, `cms_write_entry`, `project_files_bulk_save`). Pure reads and CRUD ->
  direct tools. `talk_to_department`'s enum is a DIFFERENT set from `account_context_get`'s:
  seo, social, content, marketing, branding, outbound, ppc, analytics, customer_avatar,
  customer_journey, before_after_grid, website_design, knowledge_base, workflow. There is no
  `web` agent, and `sales` / `helpdesk` are valid contexts but NOT agents. `list_departments`
  tells you which ones this tenant actually has enabled.
- One save, not N. When editing code, load with `project_files_bulk_get` and write the
  whole change set with `project_files_bulk_save` in ONE call. A stream of
  `project_file_save` calls invites half-applied states and races.
- Verify before you ship. `project_test_build` must reach `succeeded` before `deploy_site` -
  and it is async, so a returned `build_session_id` is not a verdict; poll
  `project_test_build_log_get` (Play 5). On a red test build read that same log, not
  `project_build_error_get` (which reports the last failed real DEPLOY). Never deploy past a
  failing build hoping prod resolves it.
- When unsure of a tool's arg shape, `hiveku_docs_search` / `hiveku_docs_get` rather than
  guessing. Most tools here take a `project_id` (from `sites_list` / `project_get`) -
  resolve it once at the top of the session.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising anything)
1. Context: `account_context_get({ domain: 'website_design' })`, then `get_account_info` to confirm
   the account, then `sites_list` -> the projects and their `project_id`s. For the working
   project, `project_get({ project_id })` for status, deploy mode, and attached domains.
2. Inventory the site as it stands:
   - `pages_list({ project_id })` - every page, its slug, and which is homepage.
   - `project_files_list({ project_id })` and `project_files_status({ project_id })` - the
     code tree and any uncommitted/dirty state. A dirty tree from a prior session is the
     first thing to reconcile.
   - `cms_list_collections({ project_id })` - content models in play.
   - `database_tables({ project_id })` and `database_status({ project_id })` - is there a
     provisioned project DB, and what is in it.
   - `project_domains_list` and `project_redirects_list` - live hostnames and redirect map.
   - `deploy_history({ project_id })` and `deploy_status({ project_id })` - what is live
     and when it last shipped. `deploy_doctor({ project_id })` if anything looks off.
3. Record the baseline to `memory_create`: project_id, template lineage, deploy mode, live
   domains, homepage slug, CMS collections, DB state, known constraints. This is what every
   later session reads instead of re-inventorying.
4. Health pass: `project_test_build({ project_id, use_db_state: true })` once, then poll
   `project_test_build_log_get` to a real verdict (Play 5), to confirm main even builds.
   A site that does not build cleanly is finding number one - `pm_tasks_create` it before
   any feature work.

### Strategy (weeks 2-3)
Agree the information architecture (page list + hierarchy + primary conversion action per
page), the brand/design system (from `account_context_get`), the CMS model (which content
is code vs a collection), and the domain + redirect plan. Output a short site plan,
`memory_create` the decisions, `pm_tasks_create` the build backlog. Get sign-off before
scaffolding - re-scaffolding after content exists is expensive.

### Execution -> cadence
Run the plays below as tasks. The weekly checklist keeps the site healthy and live; the
monthly report proves the value. Commit early and often (cheap, reversible); deploy
deliberately (client-visible).

## Play 1 - Build a new site from a template and prebuilt sections
Start from a template, never a blank canvas - templates carry the layout, nav, and design
tokens the brand system expects.
1. `templates_list()` - browse starting points; match to the client's industry and the
   agreed IA. Recommend from `preview_demo_url` (the live rendered demo), not from the
   name. `components_list()` - the prebuilt section library (heroes, feature grids,
   pricing, testimonials, CTA bands, FAQ). Its filters compose with AND (category, intent,
   style, search, template_id) and an unfiltered response paginates 100 at a time - use
   `facets.categories` from the response to narrow before iterating.
2. Scaffold:
   - New Hiveku-hosted site from a template:
     `site_create({ name, creation_mode: 'template', template_id })`. `creation_mode`
     defaults to `'blank'`, and a `template_id` passed WITHOUT `creation_mode: 'template'`
     is ignored - you get a bare scaffold and think the template failed. The other modes
     are `'blank'` (bare Next.js + Tailwind) and `'import'` (empty project for bringing an
     existing app, paired with `project_import_presign` / `project_import_finalize`).
     `project_type` defaults to `nextjs`.
   - Duplicate an existing project to iterate on: `site_clone({ project_id })`. The clone
     does NOT carry the database, custom domain, CloudFront/DNS/cert, or GitHub connection.
   - Register a site that lives elsewhere: `site_create_external`. Re-run analysis on an
     imported/external site, or after any framework conversion, with
     `site_reanalyze({ project_id })` (Play 11).
3. Lay in pages to match the IA: `pages_create({ project_id, name, slug, ... })` per page -
   required fields are `project_id`, `name`, `slug`; there is no `title` (use `meta_title`
   for the SEO title, and `page_type` from page | blog_post | landing_page | contact |
   about | privacy | terms | custom). `pages_set_homepage({ project_id, page_id })` for the
   front door. Adjust with `pages_update`; remove stragglers with `pages_delete` (confirm -
   a deleted page can orphan inbound links, see redirects).
4. Assemble each page from prebuilt sections. `components_add` does NOT drop a section onto
   a page - it injects the section's files plus their full dependency closure (helper
   components, client-island bundles, and missing npm deps in package.json) into the
   project, and you wire the section into the page yourself in code (Play 2). The shape is
   `components_add({ project_id, components: ['HeroEditorial', 'PricingToggle'], mode:
   'missing-only', dry_run })`; there is no `page_id` and no `component_id`. Always run
   `dry_run: true` first and read `files_to_write` + `skipped` before the real call. Caps
   are 16 components and 40 explicit `files` per call, and it returns 400
   `unsupported_project_type` on anything that is not a Next.js / internal project. Prefer a
   prebuilt section you customize over hand-writing a layout - it keeps the design
   consistent and the build green.
5. Fill copy through the brand voice: draft section and page copy with
   `talk_to_department({ domain: 'website_design', message })` (pass the page's job, the audience
   avatar, and the primary CTA), then persist it with `pages_update` or, for section-level
   fields, by editing the page file (Play 2). Never paste generic copy.
6. Verify and commit: `project_test_build` polled to `succeeded` (Play 5), then
   `project_vcs_commit` on a working branch.
   Deploy only after review (Play 7). There is no image-generation tool in this domain -
   attach existing media to CMS via `cms_attach_image`, or request assets from the
   marketing department; do not invent an image tool.

## Play 2 - Edit code safely (templates, components, JSON-LD, layout)
The project is real Next.js source. Treat edits like production commits.
1. Orient before touching: `project_files_search({ project_id, query })` to find the file
   (`grep -rn` for the codebase - takes `glob`, `file_type`, `is_regex`, capped at 500
   matches), `project_file_get` to read one, or `project_files_bulk_get({ project_id })` to
   load the whole tree. There is no `paths` parameter on bulk_get - the real knobs are
   `include_content`, `include_assets`, `max_file_bytes`, `max_total_bytes`, `cursor`. Read
   its completeness traps before you trust the payload: default scope is code + config only
   (binaries are excluded and listed in `excluded_asset_paths[]`), per-file cap is 1MB
   (oversized files come back marked `truncated` - refetch with `project_file_get`), and
   total payload is 20MB, above which the response carries `partial: true` + `next_cursor`
   that you MUST follow. A partial you did not resume is the "my bulk_get returned 424 of
   538 files" failure - it looks like a complete tree and is not. Read before you write.
2. Make the whole change set, then save it in ONE `project_files_bulk_save({ project_id,
   files })` call. Use `project_file_move` to rename/relocate and `project_file_delete` to
   remove (confirm deletes). `project_files_snapshot` before a risky refactor gives you a
   restore point on top of VCS.
3. Guard the routing: after adding or moving page files, run
   `project_files_validate_orphan_routes({ project_id })` - a file with no reachable route
   (or a route with no file) is an invisible 404 waiting for the next rebuild. Next.js
   catch-all/`[slug]` collisions detonate on an unrelated rebuild, not at edit time - this
   check is how you catch them early.
4. Verify: `project_test_build({ project_id, use_db_state: true })`, then poll
   `project_test_build_log_get` (Play 5 - it does NOT return a verdict inline by default).
   Red TEST build -> `project_test_build_log_get({ session_id })` is the oracle, not
   `project_build_error_get` (that one reads the last FAILED real DEPLOY and will hand you a
   days-old error). Fix, re-save, re-build. Green build -> `project_vcs_commit`.
5. Style and brand tokens live in the template's CSS/config files - edit those, do not
   sprinkle inline overrides. No emojis in shipped UI or copy. No em dashes in client-facing
   copy.

## Play 3 - CMS (structured content: blog, services, team, listings)
Use a collection whenever content repeats a shape or the client will edit it - blog posts,
services, team, case studies, locations. Code is for one-off layout; CMS is for content.
1. Model it: `cms_field_types()` to see field types, then `cms_create_collection({
   project_id, name, ... })` and `cms_add_field` / `cms_update_field` / `cms_remove_field`
   to shape the schema. `cms_scaffold` stands up a collection with a starter field set and
   sample layout fast - prefer it for common shapes.
2. Author entries: `cms_write_entry({ project_id, collection_id, slug, fields })` to
   upsert by slug (`data` is an accepted alias for `fields`; `collection_id` is the
   collection slug from the manifest, not a UUID), `cms_attach_image` for media fields.
   Generate prose through `talk_to_department({ domain: 'website_design', message })` for
   brand voice, or refine an existing entry in place with `cms_ai_rewrite` - then persist.
   Bulk migration -> `cms_bulk_import` (dedupe and validate the payload first).
3. Draft -> review -> publish, never publish blind. What makes something a draft is
   `draft: true`, nothing else:
   - `cms_write_entry({ project_id, collection_id, slug, fields, draft: true })` writes the
     entry's DRAFT SHADOW instead of the live entry. Draft writes skip field validation, so
     partial working copies are fine.
   - Review it. `cms_read_entry({ ..., draft: "1" })` reads the shadow back.
     `cms_preview_write` pushes a file into the Fly preview so the iframe shows the change,
     but it writes NOTHING to the database and creates no draft - it is a look-at-it tool
     only, and `cms_promote_draft` after it alone returns 404.
   - `cms_promote_draft({ project_id, collection_id, slug, locale?, force? })` copies the
     shadow over the live entry, deletes the draft, and fires save webhooks. Confirm before
     promoting. Read its failures rather than retrying blindly: 422 if the draft no longer
     validates against the CURRENT schema or has dangling references (drafts sit while
     schemas evolve), 409 if a concurrent live edit landed since the draft was saved
     (`force: true` overwrites it - that is a lost update, so confirm first), 404 if no
     draft exists. Localized collections need `locale` to promote a specific variant.
   - Top-level `status` and `publish_at` on `cms_write_entry` are NOT the draft mechanism:
     they are merged in as ordinary fields (`status`, `publishAt`) the site reads.
     `publish_at` alone only date-gates rendering; a real scheduled flip needs the schedule
     cron.
   - `cms_list_entry_versions` + `cms_restore_entry_version` recover a bad edit;
     `cms_activity` shows who changed what. Read entries with `cms_read_entry` /
     `cms_list_entries`; find one with `cms_search_entries`.
4. Deletes: `cms_delete_entry` / `cms_delete_collection` are destructive and can break pages
   that render the collection - confirm, and check the routes still resolve
   (`project_files_validate_orphan_routes`) after removing a collection a page depends on.

## Play 4 - Project database (app data behind the site)
For dynamic app data beyond content (form submissions, gated resources, custom app tables)
the project can carry its own database.
1. Provision only if needed: `database_status` to check, `database_provision` to stand one
   up. Do not provision a DB a static + CMS site does not need.
2. Inspect: `database_tables` for the list, `database_describe({ table })` for columns and
   types. Read the shape before you query.
3. Read with `database_query` (SELECT-style reads - run freely). Mutate with
   `database_execute` (INSERT/UPDATE/DDL) - confirm every mutation, and never run a
   destructive statement without a stated reason. Follow the workspace rule: every new table
   needs RLS enabled and a policy - if a table you create through `database_execute` has RLS
   off, that is a finding, not a shortcut.
4. This is app data, not analytics. Traffic, conversions, and channel numbers live in the
   analytics department (its own skill and dashboard) - do not compute them from the project
   DB.

## Play 5 - Verify and build (the gate before every deploy)
- `project_test_build` compiles the project exactly as the deploy pipeline will. It is the
  single gate: green means shippable, red means do not deploy. But it is ASYNCHRONOUS by
  default and a session id is not a verdict:
  1. `project_test_build({ project_id, use_db_state: true })` -> returns
     `{ build_session_id }` immediately. `use_db_state: true` is the recommended mode: the
     builder pulls the current canonical files itself, which removes the bulk_get
     completeness dependency entirely. The alternative is a caller-supplied `files[]`
     snapshot (must include package.json) for a change set not yet saved - pass exactly one
     of the two.
  2. Poll `project_test_build_log_get({ project_id, session_id })` every ~10s until
     `status` is `succeeded` or `failed`. Anything still `running` is not a result.
  3. Read the log. Timing is 90-180s cold, 30-60s warm. Use `force_fresh_build: true` when
     you changed dependencies, because the npm install cache can shadow them.
  `wait: true` blocks up to 5 minutes server-side, which is longer than most MCP client
  timeouts (httpx default 120s; many harnesses 60s) - a client timeout on `wait: true` is a
  TIMEOUT, not a failed build, and the server usually finished. Reserve it for small
  projects with a warm cache.
- On failure, pick the oracle that matches what failed. A red TEST build ->
  `project_test_build_log_get({ project_id, session_id })` only: it returns the auto-fixes
  Hiveku applied, npm install output, next build output, and the TypeScript/route-validator
  errors, with `truncated: true` at the 10,000-line cap. Do NOT reach for
  `project_build_error_get` here - it returns the most recent FAILED real DEPLOY, so on a
  test build it can hand you a days-old error from a different change set, which is the
  stale-oracle trap the build reference spends a section on. A failed real DEPLOY ->
  `project_build_error_get` (error_summary + last_log_lines + full_logs), then
  `deploy_doctor` if artifacts shipped but the site does not serve. A runtime error on a
  DEPLOYED tier -> `project_logs_get` (source runtime | build | deploy, with a `level`
  filter) - it reads Lambda/ECS/build logs, never the preview. Preview-container runtime ->
  `preview_logs` / `preview_runtime_errors`; browser-side -> `preview_client_errors`.
- A build that passes can still fail on route conflicts - pair the build with
  `project_files_validate_orphan_routes` whenever pages moved.
- Never treat a slow or silent build as a pass. If the build tool reports nothing, that is
  not success - re-run and read the log; a truncated or empty log is a red flag, not a green
  light.

## Play 6 - VCS and checkpoints (version everything, restore fearlessly)
Hiveku sites version on a native VCS. Commit is versioning; it is NOT deploying.
- Branch for real work: `project_vcs_branch_create({ project_id, name })` (use `feature/`,
  `fix/`, `task-<id>/`), `project_vcs_checkout` to switch, `project_vcs_branches` to list.
  Do not do risky work straight on the main line.
- Commit green states: `project_vcs_commit({ project_id, message, ... })` after a passing
  build. Imperative present-tense messages. `project_commit` and `project_version_log` /
  `project_vcs_history` show and record history; `project_vcs_compare` diffs two points.
- Show the client the branch BEFORE it merges, without touching the shared main preview:
  `project_vcs_branch_preview({ project_id, branch })` spins the branch up at its own URL in
  its own isolated app (the project's main preview is untouched and the branch tree never
  enters the project's files). It returns `{ previewUrl, status, previewSessionId }`. On
  `status: 'starting'` do NOT call it again - that spawns a second app; poll
  `project_vcs_branch_preview_status({ project_id, session_id })` instead, usually another
  30-90s. Send `previewUrl` for sign-off, then merge, then
  `project_vcs_branch_preview_teardown({ project_id, session_id })` (irreversible - start a
  fresh preview to look again; they are also reaped automatically).
- Merge back with `project_vcs_merge({ project_id, branch, message? })` once the branch
  builds and is reviewed. It applies the non-conflicting branch changes and returns
  `{ applied, deleted, conflicts, commit }`. Files changed on BOTH the branch and main are
  returned in `conflicts` and are NOT overwritten - resolve them yourself and merge again.
  The branch is not deleted, so a partial merge is recoverable. `project_vcs_compare` shows
  what a branch changed before you merge it.
- Snapshot BEFORE risky work: `checkpoint_create({ project_id, description })` captures
  every current file, every asset, and (when configured) a DB backup, and returns a
  `checkpoint_hash` - record it in your reply. Take one before any bulk refactor,
  `delete_missing` tree replace, dependency bump, or DB migration.
  `project_files_bulk_save({ delete_missing: true })` already takes one automatically and
  aborts with `code: 'checkpoint_failed'` before touching anything if it cannot. Clean up
  with `checkpoint_delete`.
- Note the two prefixes: the create/delete half is `checkpoint_create` / `checkpoint_delete`
  (bare prefix). There is no `project_checkpoint_create` - do not guess it.
- Checkpoints are the safety net for restores: `project_checkpoint_list` (or
  `checkpoint_list`, which also carries trigger/size metadata) to find a known good point,
  `project_checkpoint_get` to inspect it, and `project_checkpoint_restore_dry_run` BEFORE
  `project_checkpoint_restore` - always dry-run a restore first so you see exactly what it
  will change. Restore is ADDITIVE: it overwrites current files from the snapshot but never
  removes a file that exists now and was not in the checkpoint. Never re-run a restore as
  verification; verify by reading files and building.

## Play 7 - Deploy (client-visible - the deliberate step)
The tier is the `environment` argument on `deploy_site`, and it is required:
`development` | `staging` | `production`. `development` is the default and the SAFE first
target. `staging` is opt-in per project and returns 412 `staging_not_enabled` otherwise -
do not offer it unless the user says it is enabled. `production` is the slow full CodeBuild
path; never pick it just to test the deploy flow.

The trap the tool states in caps: **production and development DO NOT share code.** Every
file change you want in production - `middleware.ts` and `next.config.js` included - needs
its own `deploy_site({ environment: 'production' })` call. There is no auto-promote from
development or staging. And `project_file_save` / `project_files_bulk_save` /
`preview_sync` reach the Fly PREVIEW instantly and touch NO Lambda environment; only
`deploy_site` does.

(`project_deployment_mode_get` / `project_deployment_mode_set` are not tier controls - they
switch the project between `github_sync` and `local_codebase` source-of-truth. See the
GitHub note at the end of this play.)

1. Pre-flight: build is green (Play 5), changes are committed (Play 6), and you have
   explicit approval. Then, in order:
   - `project_deploy_preflight({ project_id })` FIRST - it returns `ready`, `blockers[]`,
     and `hints[]`. Surface `blockers[]` verbatim to the user; only they can fix those.
     Read `hints[]` for `reserved_cdn_prefix_page_collision`, which means a shipping page
     route sits under a reserved CDN asset prefix (videos/, media/, images/, ...) and WILL
     403 on the deployed URL - rename the route before shipping.
   - `deploy_diff({ project_id, environment })` to see the file + route delta versus what is
     live. Read `data.has_changes` as a TRI-STATE, not a boolean: `false` is a confident
     all-clear (exact baseline, code and assets match - safe to skip the deploy); `true` is
     a concrete change (never_deployed implies true); `null` means we CANNOT prove no-change
     (approximate/timestamp basis, GitHub-source project, unknown asset baseline) - read
     `data.confidence`, `data.basis`, `data.warnings` and deploy anyway. Never report an
     empty diff as "nothing will change" without checking which of the three you got.
     `deploy_diff` can also preview an unsaved push via `local: [{ path, sha256 }]`.
     `deploy_changes` is the coarser "files changed since the last deploy of this tier".
2. Ship: `deploy_site({ project_id, environment })` (or `deploy_run` for the run-based
   flow). Watch it land with `deploy_status`; `deploy_get({ project_id, deployment_id })` for one deploy's (project_id is required, and deployment_id accepts either the UUID deploy_id or the string deployment_id form)
   detail. Read `data.warnings[]` on the response.
3. Confirm live: after status is complete, load the live URL and spot-check the pages you
   changed. `deploy_history` records the trail; `deploy_doctor` diagnoses a deploy that
   failed or a site serving stale/wrong content.
4. If a deploy ships a regression, roll back by restoring the prior good checkpoint (Play 6,
   dry-run first) and re-deploying - do not hot-patch prod under pressure.
5. Nothing ships silently. State what is going live, to which tier, and why, and get the
   yes. Then log the deploy (what shipped, deploy_id) with `memory_create` or on the
   `pm_tasks_complete` note so the monthly report writes itself.
6. Source of truth (GitHub or not) is a separate axis from the tier.
   `project_deployment_mode_get` returns `{ mode: 'github_sync' | 'local_codebase' }`.
   `local_codebase` means saves go straight to `builder_code_versions` with no GitHub
   roundtrip - the normal Hiveku-native case. `github_sync` means the repo is the source of
   truth and commits replicate in, so a `project_file_save` without a `project_commit` gets
   overwritten by the next sync. `project_deployment_mode_set` FLIPS that plumbing and needs
   an explicit confirm; enabling `github_sync` requires an already-connected repo or it
   returns 412 `github_not_connected`. Never call it to "pick a tier".

## Play 8 - Domains, DNS, and redirects
Connecting a custom domain and preserving link equity is core agency work.
1. Attach: `project_domains_add({ project_id, domain, tier, is_primary? })` - the tier enum
   here is `production` | `staging` | `dev` (not the deploy_site spelling), default
   production. Then get the records the client must set with `project_domain_dns_records`.
   Surface them verbatim - the user cannot guess them. If you have registrar access
   (Cloudflare, Route53) create them yourself and re-read with `check_dns: true` instead of
   handing over a list. Do not guess DNS.
2. For any APEX domain (example.com, no subdomain), call `project_domain_apex_options`
   FIRST and lead with the answer it exists to give: an apex cannot use a CNAME. That single
   fact is the most common reason a custom-domain setup stalls. The tool returns the static
   IPs plus provider-specific routes, including Cloudflare CNAME flattening, which is the
   cleanest path when you already have Cloudflare access.
3. Verify propagation before promising it works: `project_domain_check_dns` (re-check the
   tier now instead of waiting for the sweep - a negative result minutes after a change
   usually means "not yet", not "wrong") then `project_domain_verify({ project_id,
   domain_id })`. That last one is the call that answers "can I tell the client it is up":
   it checks DNS AND the SSL certificate, and a domain is only servable once BOTH are good.
   On a failed or stuck cert, `project_domain_retry_certificate` - but a CAA record that
   forbids the issuing CA is the usual cause, and the retry fails identically until the CAA
   is fixed. `project_domains_list` shows current attachments with dns_status/ssl_status;
   `project_domains_remove` soft-detaches (confirm - it takes the site offline on that host;
   the user's DNS records are left alone).
4. Apex-to-www: `project_domain_apex_redirect_set` points the bare domain at the www host
   (or vice versa) so both resolve. Decide the canonical host once and be consistent.
5. Migrating an OLD domain to a new one (olddomain.com -> newdomain.com) does NOT use the
   apex tool. Attach the old domain with `project_domains_add` WITHOUT `is_primary`, make
   sure the right one is primary (`project_domains_update({ is_primary: true })`), then run
   `project_redirects_deploy`. Every non-primary domain on a project 301s to the primary via
   the CloudFront function. Two caveats that turn this into a silent no-op: domain redirects
   are PRODUCTION TIER ONLY, and nothing at all takes effect until the deploy runs.
6. Redirects preserve SEO and fix broken paths. Map old URLs to new BEFORE you delete or
   rename pages:
   - `project_redirects_list` to see the current map (each row carries the `id` you need to
     edit or delete it).
   - `project_redirect_create({ project_id, from_path, to_path, status_code, match_type })` -
     301 for permanent moves, 302 only for temporary; match_type is exact | prefix | regex.
     The route validates duplicate sources, self-loops, and circular chains up to depth 10.
     `project_redirect_update`, `project_redirect_delete` for the rest.
   - Redirects are staged until published: `project_redirects_deploy({ project_id, tier })`
     makes them live, tier is `development` | `staging` | `production` (default production).
     Deploying to development and then checking production is its own silent no-op. Confirm,
     then verify a couple of the mappings actually 301 against the deployed host.
   - Every renamed slug or deleted page in Play 1/2/3 needs a matching 301 here. An orphaned
     old URL is lost traffic and a lost ranking.

## Play 9 - Conversion optimization (make the pages earn)
Design and content in service of the primary action per page - not decoration.
1. Fix one primary conversion action per page during strategy (call, form, book, buy) and
   make it the visually dominant, above-the-fold element; secondary actions stay subordinate.
2. Draft high-intent copy and offer framing through `talk_to_department({ domain: 'website_design',
   message })` with the avatar's pain, the objection to overcome, and the proof available -
   then ship it via `pages_update` or a page file edit (Play 2). Testimonials and trust
   signals go in as prebuilt sections (`components_add`) or CMS entries.
3. Forms and speed are levers: keep forms to the fields the business truly needs, and treat
   a slow template as a conversion tax - fix load in the code, verify with a clean
   `project_test_build`, and invalidate stale assets after deploy - `project_cdn_invalidate`
   with the default `/*`, under the cost rules in Play 10, and only for files replaced in
   place at the same path.
4. Measurement lives in the analytics department, not here. Set the page up to be measurable
   (clean CTAs, distinct thank-you URLs so goals can fire), then read outcomes through the
   analytics skill or dashboard. Do not fabricate conversion numbers here.
5. Iterate as tickets: each hypothesis is a `pm_tasks_create` with the page, the change, and
   the expected effect, so the monthly report shows what was tried and what moved.

## Play 10 - Custom code, CDN, crons, and secrets
- Injected scripts (tags, chat widgets, verification meta). READ FIRST with
  `project_custom_code_get` - it returns `run_in_preview` plus every tier's entries, where
  the row with `page_path: ""` is that tier's site-wide code and every other row is a
  per-page override that APPENDS after it.
  - `project_custom_code_set_tier({ project_id, tier, head_code, body_code, pages })` is the
    full writer, and it REPLACES that tier in full: **any per-page override missing from
    `pages` is DELETED**. Always read-then-merge, never write `pages` from memory. It
    validates server-side and fails with details on an unclosed script/style/comment.
    Snippets cap at 20,000 chars each. Tier enum is preview | development | staging |
    production.
  - `project_custom_code_page_set` upserts ONE page override without touching the rest of
    the tier - prefer it for a single-page change. `project_custom_code_delete({ entry_id })`
    removes one row.
  - **Saved is not live.** Custom code is saved instantly but takes effect on the NEXT
    DEPLOY of that tier. That is the whole of the "I added the GTM tag and it is not on my
    site" ticket - tell the client the deploy is required. The preview tier additionally
    runs nothing until `project_custom_code_preview_toggle({ run_in_preview: true })`, which
    is off by default so tracking snippets do not fire while editing.
  - Prefer a prebuilt integration over raw third-party script when one exists.
- CDN: `project_cdn_config_get` to inspect the deployed distribution's actual configuration
  for a tier (origins, attached viewer functions, policies) when a site serves wrong and you
  need facts rather than a verdict. `project_cdn_invalidate` after a deploy that changed a
  cached asset behind an unchanged URL. If a deploy "did not take" visually, suspect the CDN
  cache before the build. Invalidation rules, because it bills the ACCOUNT:
  - Send `/*`. It counts as ONE path and covers the whole site; enumerating paths is how an
    agency running many client projects bills itself.
  - The free quota is 1,000 invalidation paths per month per ACCOUNT, shared across every
    client project on it. Paths cap at 25 per call and each must start with `/`.
  - Never call it in a retry loop - propagation is usually under a minute.
  - Skip it entirely for `_next/static` hashed bundles. They get a new URL every build.
    Invalidation is only for files replaced in place at the same path: images, fonts,
    documents.
- Scheduled jobs the site needs (nightly rebuilds, data refresh): `project_crons_list` to
  see them, `project_cron_create` to add one (confirm schedule and target).
- Secrets: `project_secrets_list({ metadata_only: true })` for names only (never echo
  values; keys marked sensitive are write-only and cannot be read by anyone, so a key in
  `sensitive_keys` IS set, not missing) and `project_secrets_set` for keys the site's server
  code needs. Config only; never hardcode a feature flag as an env var, and never put a
  secret value in a commit, log, or report.
  - **A secrets write BOUNCES the live preview machine** (stop -> updateMachine -> start,
    about 11s of downtime) so the dev server sees the new values. Setting five secrets in a
    loop restarts the client's preview five times. Batch them: pass
    `apply_to_preview: false` on every call but the last. Confirm propagation by reading
    `preview_env_applied` + `preview_env_apply_reason` (`no_preview_machine`,
    `only_non_dev_keys_set`, or a Fly error) on the response.
  - Key resolution for the preview: `_DEV`-suffixed keys are stripped to the base name;
    `_PROD` / `_PRODUCTION` / `_STAGING` keys are SKIPPED for the preview and go only to the
    deployed Lambdas. Any `NEXT_PUBLIC_` key auto-triggers a `preview_sync` afterwards
    because it is inlined at compile time - check `preview_synced` in the response.

## Play 11 - Framework conversion and CDN repair
Converting a project between frameworks (Vite -> Next.js is the common one) is the single
most dangerous routine operation on the platform, because the OLD static output directories
have already earned CloudFront behaviors and those behaviors outlive the framework that
justified them. That is the acquiremarketplace incident: `/learn/*`, `/services/*` and
`/blog/*` went dark after the conversion with nothing wrong in the new Next.js pages.
Run it in this order, and do not reorder it:
1. Convert the code and push it (Play 2).
2. `site_reanalyze({ project_id })` - re-detects the framework from the current files and
   heals `project_type` + `detected_project_type`. Deploy tiers auto-detect per build so a
   stale label does not break a deploy, but `detected_project_type` never self-heals and it
   drives SPA-vs-MPA rewrites on static-origin tiers. Read `leftovers[]` and clean every one
   (a lingering `vite.config.ts`, or "vite"/"next" still in package.json deps of the other
   framework). `dry_run: true` reports without writing.
3. `project_cdn_behaviors_list({ project_id, environment })` - every behavior comes marked
   `protected` or `stale`, and each non-stale one names `backed_by`: `asset_rows` (clear
   with `assets_delete`), `asset_bucket_objects` (`project_assets_orphan_sweep`), or
   `site_bucket_objects` (NOT sweepable by any tool - that bucket also holds the deployed
   build output). A stale behavior routes its prefix to an asset origin with nothing behind
   it, so a page route under that prefix gets 403 from the CDN while the origin serves it
   fine. That is the signature "the app works but the live site 403s on some routes".
4. Clear the backing, THEN DEPLOY, THEN
   `project_cdn_behaviors_prune({ project_id, environment, patterns?, dry_run })`. Order is
   load-bearing: **pruning before deploying is undone by it**, because a deploy rebuilds
   behaviors from whatever backing remains. Prune is dry-run by default - read the list
   first. Application behaviors (`_next/static/*`, `_next/image*`, anything on the Lambda or
   image-optimizer origin) are never removable and naming one is refused. CloudFront takes a
   few minutes to propagate.
5. Separate signature, separate tool: **every page route 404s while `/_next/*` chunks load
   fine** means a static-era viewer-request function is rewriting paths against a Lambda
   origin. Confirm it with `project_cdn_config_get` first, then
   `project_cdn_repair({ project_id, environment, action: 'clear_viewer_function' })`, then
   redeploy so the tier re-attaches the correct function. `action: 'enable_distribution'`
   re-enables a disabled distribution (total outage - every request fails). Both support
   `dry_run`.
6. Before the conversion, enumerate the project's offloaded `public/` subdirectories and
   treat each one as a reserved prefix for the new route tree (see
   `references/routes-and-collisions.md`).

## Play 12 - Redesign import (rebuild a client's existing site)
The redesign pipeline scrapes a client's current site into a per-page brief you then rebuild
in code. It is strictly ordered and step 1 is a precondition, not a finish line.
1. `redesign_homepage_approve({ project_id })` - call exactly ONCE, after the user confirms
   the homepage looks right. Until this is set, `redesign_start` refuses with 409 "Homepage
   not approved". It unlocks the rest of the workflow; it does not publish anything.
2. `redesign_start({ project_id, sourceUrl })` - runs Firecrawl `/map` on the source site
   and returns `{ session: { id, status, total_pages }, pages: [{ id, source_url, path,
   slug, title, screenshot_url }] }`. Keep the session id and the page ids.
3. `redesign_select_pages({ project_id, sessionId, pageIds })` - REPLACES the selection with
   the ids the user picked. An empty array clears it and the session falls back to
   `pages_discovered`.
4. `redesign_import({ project_id, sessionId })` - returns 202 immediately and scrapes in the
   background. POLL `redesign_status({ project_id, sessionId })` until pages move through
   `scraping` -> `assets_imported`. Do not call promote before that; it is not legal yet.
5. `redesign_promote({ project_id, pageId, assetUrls? })` - PER PAGE, and this is not a
   go-live. It moves one staged page out of the scraper bucket into durable project storage,
   downloads the approved subset of discovered asset URLs as project assets, and writes
   `.hiveku/redesign/<slug>.json` into the project workspace. Pass the user-approved
   `assetUrls` subset; omit to take all of them.
6. READ each `.hiveku/redesign/<slug>.json` brief and rebuild those pages in the project's
   code (Play 2), then verify, commit, and deploy. Nothing in this pipeline ships a page.
- The scraper bucket has a 7-DAY TTL. An import left un-promoted past that window is gone
  and has to be re-scraped.
- `redesign_restart({ project_id, sessionId })` abandons the current session so the next
  `redesign_start` opens a fresh one. Completed sessions cannot be restarted.

## Weekly cadence (every week, keep the site healthy and live)
1. Build health: `project_test_build({ project_id, use_db_state: true })` on main, then poll
   `project_test_build_log_get` to an actual `succeeded`/`failed` - the site must always be
   in a shippable state. A red main is a same-day fix.
2. Uncommitted drift: `project_files_status` - anything dirty from a prior session gets
   committed on a branch or reverted, never left to rot.
3. Deploy freshness: `deploy_status` + `deploy_history` - is live current with main, and did
   the last deploy succeed. `deploy_doctor` on anything ambiguous.
4. Domains and certs: `project_domains_list` + `project_domain_verify` on any recently
   attached domain - catch a cert or DNS issue before the client does.
5. Redirects and routes: `project_files_validate_orphan_routes` after any page changes;
   spot-check that recent redirects still resolve.
6. Content: `cms_activity` for what changed, `cms_list_entry_versions` if an edit looks
   wrong. Any scheduled content that should have published but did not is a same-day
   investigation.
7. Pipeline: `pm_tasks_update` - what shipped, what refreshed, what is blocked. Stalled work
   escalates; do not let a week pass with nothing shipped.

## Monthly report (the artifact the retainer pays for)
There is no dedicated web-report tool in this domain - assemble the report as a client
deliverable through the account's reporting surface (the dashboard reports hub) and back it
with named tool calls. Structure:
1. Executive summary - 5 bullets: what shipped, the biggest improvement, the biggest risk,
   next month's focus. Written last, placed first.
2. What shipped - from completed `pm_tasks_complete` records and `deploy_history`: every
   deploy this month, the pages/sections built or refreshed, CMS content added, redirects
   and domains handled. Link every live URL.
3. Site health - build status, route integrity (`project_files_validate_orphan_routes`),
   domain/cert status, and any incidents with how they were resolved (pull specifics from
   `deploy_doctor` / `project_logs_get`).
4. Conversion and content - pages optimized and the hypotheses tested (Play 9); pull the
   outcome metrics from the analytics department and attribute them to the ship dates so
   cause and effect are legible.
5. Next month plan - the backlog slice with expected impact per item, from `pm_milestones_list`
   and open `pm_tasks_create` items.
6. Every figure must be reproducible from a named tool call or the analytics report. No
   vibes. Log the report's key decisions with `memory_create`.

## Benchmarks and decision rules
- Template vs custom: start from `templates_list` and customize; only hand-code a layout
  when no template + prebuilt-section combination fits. A customized template ships faster,
  stays on-brand, and keeps the build green.
- Code vs CMS vs DB: one-off layout and structure -> code (Play 2). Repeating,
  client-editable content -> a CMS collection (Play 3). Dynamic app data and submissions ->
  the project database (Play 4). Blog posts in code, or layout in the DB, is a smell.
- Commit != deploy. Commit freely on branches (cheap, reversible); deploy deliberately with
  approval (client-visible). Never conflate the two in a status update.
- Redirect before you rename. Any slug change or page deletion without a matching 301 is
  lost traffic - map it in Play 8 in the same change set.
- Restore safely: always `project_checkpoint_restore_dry_run` before a real restore, and
  verify by building, never by re-running the restore.
- Expectation setting: a new page or section can ship in days; a full template build is a
  multi-week project; DNS/cert propagation is up to 24-48 hours after the records are
  correct. Put those windows in the plan so the report never has to apologize.

## Pitfalls (build, deploy, and routing traps)
- Reporting a build session id as a pass. `project_test_build` returns
  `{ build_session_id }` and nothing else by default - you have to poll
  `project_test_build_log_get` to `succeeded` or `failed`. A tool that prints nothing is not
  a pass, and neither is a session id.
- Reading `project_build_error_get` after a failed TEST build. It answers about the last
  failed real DEPLOY and will hand you a stale error from another change set. Test build ->
  `project_test_build_log_get({ session_id })`.
- Next.js route collisions (static page + sibling `[slug]`, or a mis-ordered catch-all) are
  invisible until an unrelated rebuild detonates them.
  `project_files_validate_orphan_routes` after every page move is the cheap insurance.
- Stale CDN after deploy: if a change deployed but does not show, suspect the CDN cache
  (`project_cdn_invalidate({ project_id, action: 'invalidate', environment, paths: ['/*'] })` - `action` is required and is always 'invalidate'; send `/*` rather than an enumerated path list, since it counts as ONE path against the monthly free tier - see Play 10) before
  re-debugging the build.
- N single-file saves instead of one `project_files_bulk_save` - invites half-applied
  states. Load with `project_files_bulk_get`, save the whole set once, and follow
  `next_cursor` if the read came back `partial`.
- Publishing CMS blind, or expecting `cms_preview_write` to have created something. The
  publish path is `cms_write_entry({ draft: true })` -> review -> `cms_promote_draft`.
  `cms_preview_write` only paints the preview iframe; it writes no row, so promoting after
  it alone returns 404. `status: "draft"` is a plain field, not a draft either. Keep
  `cms_restore_entry_version` in reach. Deleting a collection a page renders breaks that
  page - check routes after.
- Detaching a live domain (`project_domains_remove`) or deleting a homepage takes the site
  offline on that host - confirm, and have the redirect/replacement ready first.
- `database_execute` without RLS on a new table violates the workspace security rule; never
  bypass RLS to make a query work - grant the right policy.
- Local `hiveku-data/web/*.json` snapshots go stale the instant the account changes - orient
  with them, decide with live tools, re-export after material changes.
- Nothing client-visible (deploys, domain changes, redirect publishes, CMS promotes, DB
  mutations) without explicit confirmation. Log every material decision with `memory_create`
  and reflect the work in `pm_tasks_*` so the next session does not re-litigate it.
## Deep references - load the one that matches the work

This skill is the map. The manuals below carry the mechanisms, the thresholds, and the real
incidents behind every rule. Read the relevant one BEFORE writing code, not after a symptom.

| Reference | Load it when |
|---|---|
| `references/forms.md` | Building, editing, moving, or debugging ANY form; a lead that never arrived; duplicate or junk form records; the workflow behind a form. |
| `references/routes-and-collisions.md` | Adding, moving, or renaming a route; a page that 404s or serves the wrong content; reserved paths; redirects; anything with a dynamic segment. |
| `references/build-and-deploy.md` | A failing build, a deploy that verifies red, size or serverless limits, binary assets, secrets, and reading the verification oracles correctly. |
| `references/cms-and-database.md` | Any CMS collection or entry, publish scheduling, or the project database, RLS, and where a lead must NOT be stored. |
| `references/conventions.md` | Writing a page or section: the stack, the server/client boundary, images, metadata and SEO, accessibility, design tokens, and client-facing voice. |

Conversion tracking has its own skill (`hiveku-conversion-tracking`) with a matching reference
library. Anything about tags, attribution, or "the numbers do not match" belongs there.
