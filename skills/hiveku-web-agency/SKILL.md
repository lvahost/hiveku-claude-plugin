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
- `account_context_get({ domain: 'web' })` FIRST - before any strategy, plan, or copy.
  It returns persona, brand voice, avatars, domain memory, and rules. Re-read its
  instructions field before every generative call.
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
  `talk_to_department({ domain: 'web', message })` (runs the web department agent with
  full brand hydration), then PERSIST with the matching direct tool (`pages_update`,
  `cms_write_entry`, `project_files_bulk_save`). Pure reads and CRUD -> direct tools.
- One save, not N. When editing code, load with `project_files_bulk_get` and write the
  whole change set with `project_files_bulk_save` in ONE call. A stream of
  `project_file_save` calls invites half-applied states and races.
- Verify before you ship. `project_test_build` must pass before `deploy_site`. On a red
  build read `project_build_error_get` then `project_test_build_log_get` - never deploy
  past a failing build hoping prod resolves it.
- When unsure of a tool's arg shape, `hiveku_docs_search` / `hiveku_docs_get` rather than
  guessing. Most tools here take a `project_id` (from `sites_list` / `project_get`) -
  resolve it once at the top of the session.

## Engagement lifecycle (the agency arc)

### Month 1 - onboarding baseline (do ALL of this before promising anything)
1. Context: `account_context_get({ domain: 'web' })`, then `get_account_info` to confirm
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
4. Health pass: run `project_test_build({ project_id })` once to confirm main even builds.
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
   agreed IA. `components_list()` - the prebuilt section library (heroes, feature grids,
   pricing, testimonials, CTA bands, FAQ).
2. Scaffold:
   - New Hiveku-hosted site from a template: `site_create({ template_id, name, ... })`.
   - Duplicate an existing project to iterate on: `site_clone({ project_id })`.
   - Register a site that lives elsewhere: `site_create_external`. Re-run analysis on an
     imported/external site with `site_reanalyze({ project_id })`.
3. Lay in pages to match the IA: `pages_create({ project_id, slug, title, ... })` per page,
   `pages_set_homepage({ project_id, page_id })` for the front door. Adjust with
   `pages_update`; remove stragglers with `pages_delete` (confirm - a deleted page can
   orphan inbound links, see redirects).
4. Assemble each page from prebuilt sections: `components_add({ project_id, page_id,
   component_id, ... })` to drop a section onto a page, then tailor its copy. Prefer a
   prebuilt section you customize over hand-writing a layout - it keeps the design
   consistent and the build green.
5. Fill copy through the brand voice: draft section and page copy with
   `talk_to_department({ domain: 'web', message })` (pass the page's job, the audience
   avatar, and the primary CTA), then persist it with `pages_update` or, for section-level
   fields, by editing the page file (Play 2). Never paste generic copy.
6. Verify and commit: `project_test_build`, then `project_vcs_commit` on a working branch.
   Deploy only after review (Play 7). There is no image-generation tool in this domain -
   attach existing media to CMS via `cms_attach_image`, or request assets from the
   marketing department; do not invent an image tool.

## Play 2 - Edit code safely (templates, components, JSON-LD, layout)
The project is real Next.js source. Treat edits like production commits.
1. Orient before touching: `project_files_search({ project_id, query })` to find the file,
   `project_file_get` to read one, or `project_files_bulk_get({ project_id, paths })` to
   load the full set you intend to change. Read before you write.
2. Make the whole change set, then save it in ONE `project_files_bulk_save({ project_id,
   files })` call. Use `project_file_move` to rename/relocate and `project_file_delete` to
   remove (confirm deletes). `project_files_snapshot` before a risky refactor gives you a
   restore point on top of VCS.
3. Guard the routing: after adding or moving page files, run
   `project_files_validate_orphan_routes({ project_id })` - a file with no reachable route
   (or a route with no file) is an invisible 404 waiting for the next rebuild. Next.js
   catch-all/`[slug]` collisions detonate on an unrelated rebuild, not at edit time - this
   check is how you catch them early.
4. Verify: `project_test_build`. Red build -> `project_build_error_get` for the parsed
   error, `project_test_build_log_get` for the full log, `project_logs_get` for runtime.
   Fix, re-save, re-build. Green build -> `project_vcs_commit`.
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
2. Author entries: `cms_write_entry({ project_id, collection, data })` to create/update,
   `cms_attach_image` for media fields. Generate prose through `talk_to_department({ domain:
   'web', message })` for brand voice, or refine an existing entry in place with
   `cms_ai_rewrite` - then persist. Bulk migration -> `cms_bulk_import` (dedupe and validate
   the payload first).
3. Draft -> preview -> publish, never publish blind:
   - `cms_preview_write` stages a draft change for preview without touching live.
   - Review it, then `cms_promote_draft` to publish. Confirm before promoting.
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
- `project_test_build({ project_id })` compiles the project exactly as the deploy pipeline
  will. It is the single gate: green means shippable, red means do not deploy.
- On failure, read in order: `project_build_error_get` (the parsed failing error),
  `project_test_build_log_get` (full log for context), `project_logs_get` (runtime logs if
  the failure is a render/runtime error, not a compile error).
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
- Merge back with `project_vcs_merge` once the branch builds and is reviewed.
- Checkpoints are the safety net for restores: `project_checkpoint_list` to find a known
  good point, `project_checkpoint_get` to inspect it, and
  `project_checkpoint_restore_dry_run` BEFORE `project_checkpoint_restore` - always dry-run
  a restore first so you see exactly what it will change. Never re-run a restore as
  verification; verify by reading files and building.

## Play 7 - Deploy (client-visible - the deliberate step)
Deploy tiers matter: preview builds run on a container tier; dev/staging/prod run
serverless. Know which tier you are shipping to via `project_deployment_mode_get`, and
change it deliberately with `project_deployment_mode_set` (confirm - it changes how the site
is served).
1. Pre-flight: build is green (Play 5), changes are committed (Play 6), and you have
   explicit approval. Preview the delta first: `deploy_diff` and `deploy_changes` show what
   this deploy would change versus what is live - review it before shipping.
2. Ship: `deploy_site({ project_id, ... })` (or `deploy_run` for the run-based flow). Watch
   it land with `deploy_status`; `deploy_get({ deploy_id })` for one deploy's detail.
3. Confirm live: after status is complete, load the live URL and spot-check the pages you
   changed. `deploy_history` records the trail; `deploy_doctor` diagnoses a deploy that
   failed or a site serving stale/wrong content.
4. If a deploy ships a regression, roll back by restoring the prior good checkpoint (Play 6,
   dry-run first) and re-deploying - do not hot-patch prod under pressure.
5. Nothing ships silently. State what is going live, to which tier, and why, and get the
   yes. Then log the deploy (what shipped, deploy_id) with `memory_create` or on the
   `pm_tasks_complete` note so the monthly report writes itself.

## Play 8 - Domains, DNS, and redirects
Connecting a custom domain and preserving link equity is core agency work.
1. Attach: `project_domains_add({ project_id, domain })`, then get the records the client
   must set with `project_domain_dns_records`. Walk them through it or hand off the exact
   records - do not guess DNS.
2. Verify propagation before promising it works: `project_domain_check_dns` (is the record
   live at the registrar) then `project_domain_verify` (does Hiveku see it and issue the
   cert). `project_domains_list` shows current attachments; `project_domains_remove`
   detaches (confirm - detaching a live domain takes the site offline on that host).
3. Apex handling: `project_domain_apex_redirect_set` to point the bare domain at the www
   host (or vice versa) so both resolve. Decide canonical host once and be consistent.
4. Redirects preserve SEO and fix broken paths. Map old URLs to new BEFORE you delete or
   rename pages:
   - `project_redirects_list` to see the current map.
   - `project_redirect_create` (301 for permanent moves, 302 only for temporary),
     `project_redirect_update`, `project_redirect_delete`.
   - Redirects are staged until published: `project_redirects_deploy` makes them live -
     confirm, then verify a couple of the mappings actually 301 in a browser.
   - Every renamed slug or deleted page in Play 1/2/3 needs a matching 301 here. An orphaned
     old URL is lost traffic and a lost ranking.

## Play 9 - Conversion optimization (make the pages earn)
Design and content in service of the primary action per page - not decoration.
1. Fix one primary conversion action per page during strategy (call, form, book, buy) and
   make it the visually dominant, above-the-fold element; secondary actions stay subordinate.
2. Draft high-intent copy and offer framing through `talk_to_department({ domain: 'web',
   message })` with the avatar's pain, the objection to overcome, and the proof available -
   then ship it via `pages_update` or a page file edit (Play 2). Testimonials and trust
   signals go in as prebuilt sections (`components_add`) or CMS entries.
3. Forms and speed are levers: keep forms to the fields the business truly needs, and treat
   a slow template as a conversion tax - fix load in the code, verify with a clean
   `project_test_build`, and invalidate stale assets after deploy (`project_cdn_config_get`,
   `project_cdn_invalidate`).
4. Measurement lives in the analytics department, not here. Set the page up to be measurable
   (clean CTAs, distinct thank-you URLs so goals can fire), then read outcomes through the
   analytics skill or dashboard. Do not fabricate conversion numbers here.
5. Iterate as tickets: each hypothesis is a `pm_tasks_create` with the page, the change, and
   the expected effect, so the monthly report shows what was tried and what moved.

## Play 10 - Custom code, CDN, crons, and secrets
- Injected scripts (tags, chat widgets, verification meta): read with
  `project_custom_code_get`, set per-page injection with `project_custom_code_page_set`.
  Prefer a prebuilt integration over raw third-party script when one exists.
- CDN: `project_cdn_config_get` to inspect caching; `project_cdn_invalidate` after a deploy
  that changed a cached asset behind an unchanged URL. If a deploy "did not take" visually,
  suspect the CDN cache before the build.
- Scheduled jobs the site needs (nightly rebuilds, data refresh): `project_crons_list` to
  see them, `project_cron_create` to add one (confirm schedule and target).
- Secrets: `project_secrets_list` (names only - never echo values) and `project_secrets_set`
  for keys the site's server code needs. Config only; never hardcode a feature flag as an
  env var, and never put a secret value in a commit, log, or report.

## Weekly cadence (every week, keep the site healthy and live)
1. Build health: `project_test_build({ project_id })` on main - the site must always be in a
   shippable state. A red main is a same-day fix.
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
- Deploying past a red or empty build. `project_test_build` is the gate - a tool that prints
  nothing is not a pass; re-run and read `project_test_build_log_get`.
- Next.js route collisions (static page + sibling `[slug]`, or a mis-ordered catch-all) are
  invisible until an unrelated rebuild detonates them.
  `project_files_validate_orphan_routes` after every page move is the cheap insurance.
- Stale CDN after deploy: if a change deployed but does not show, suspect the CDN cache
  (`project_cdn_invalidate`) before re-debugging the build.
- N single-file saves instead of one `project_files_bulk_save` - invites half-applied
  states. Load with `project_files_bulk_get`, save the whole set once.
- Publishing CMS blind: use `cms_preview_write` -> review -> `cms_promote_draft`, and keep
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
