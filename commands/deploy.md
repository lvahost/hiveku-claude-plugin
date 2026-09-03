---
description: Ship this project to a deployment tier - preflight, diff, confirm, deploy, then verify it actually serves.
argument-hint: "[tier - development (default), staging, or production]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Deploy THIS project$ARGUMENTS. This project's id is `<the project_id>`.

**This is the client-visible step and it needs an explicit yes.** State what is going live, to which
tier, and why, then wait for the confirmation before calling `deploy_site`.

**The tier is `environment` on `deploy_site`, and it is required:**
- `development` - the default and the SAFE first target. Lives at `*.development.hiveku-app.com`.
- `staging` - opt-in per project. Returns 412 with code `staging_not_enabled` otherwise. Do not offer
  it unless the user says it is enabled.
- `production` - the slow full CodeBuild path. Never pick it just to test the deploy flow.

**The tiers DO NOT share code and there is no auto-promote.** Every change you want in production -
`middleware.ts` and `next.config.js` included - needs its own `deploy_site({ environment:
"production" })` call. Saving files reaches the Fly preview instantly and touches no deployed tier.

0. WHICH TREE SHIPS: `project_vcs_env_bindings({ project_id: <the project_id> })` before anything
   else. The environment BINDINGS decide, not the call. `production` ALWAYS ships `main` and can
   never be pointed at a branch. `development` and `staging` ship the branch they are bound to, or
   `main` when unbound. A bound tier ships that branch's tree, and the deploy first COMMITS the
   branch's unsaved (uncommitted working-tree) edits server-side before pinning it, so what ships is
   always a commit - the response's `note` says so when that happened (the field name
   `promotedCommitId` belongs to the builder's own deploy lanes, not to `deploy_site`). State the tree in
   the confirmation ("development will ship `feature/x` at its current head"). To put branch work
   into production, promote it through `/hiveku:pr` (merge into `main`) and then deploy
   `production`; to point a tier at a branch, `/hiveku:branch bind`. On `deploy_site`, `branch` is an
   ASSERTION, never a selector: pass the branch you believe the tier serves and the server refuses a
   mismatch instead of shipping the wrong tree - 409 `branch_not_bound` (the tier is bound elsewhere
   or unbound and tracking `main`; the hint names `project_vcs_env_bind`), 400
   `production_immutable` (any non-`main` branch on production), 409 `binding_source_conflict` (a
   bound tier refuses a GitHub-source deploy). Omit `branch` to ship whatever the binding says.
   GitHub-connected projects keep the legacy meaning of `branch` (a GitHub branch label).

1. GATE: the build is green (`/hiveku:commit` step 3 - with `branch` when a bound branch ships) and
   the work is committed. On a bound branch the deploy promotes uncommitted edits itself, but a
   deliberate `project_vcs_commit({ project_id, branch, message })` first gives the commit a
   message you chose.

2. PREFLIGHT: `project_deploy_preflight({ project_id: <the project_id> })` → `{ ready, blockers[],
   hints[] }`. Surface `blockers[]` VERBATIM to the user - only they can fix those. Read `hints[]` for
   `reserved_cdn_prefix_page_collision`: a shipping page route sitting under a reserved CDN asset
   prefix (`videos/`, `media/`, `images/`, …) WILL 403 on the deployed URL. Rename the route before
   shipping; do not deploy and hope.

3. DIFF: `deploy_diff({ project_id: <the project_id>, environment })` for the file + route delta
   versus what is live. Read `data.has_changes` as a TRI-STATE, never as a boolean:
 - `false` - a confident all-clear (exact baseline, code and assets match). Safe to skip the deploy.
 - `true` - a concrete change (a never-deployed tier implies true).
 - `null` - we CANNOT prove no-change (approximate/timestamp basis, GitHub-source project, unknown
     asset baseline). Read `data.confidence`, `data.basis`, `data.warnings` and deploy anyway.
   Reporting an empty diff as "nothing will change" without checking which of the three you got is
   how a deploy the client is waiting on gets skipped. `deploy_changes({ project_id, tier })` is the
   coarser "what changed since the last deploy of this tier".

4. CONFIRM with the user: the tier, the pages/routes affected, and anything in `warnings`.

5. SHIP: `deploy_site({ project_id: <the project_id>, environment, branch? })` - `branch` only as the
   step-0 assertion. It returns a deployment id; on a bound tier whose branch had unsaved edits the
   response `note` says they were committed first (tell the user).
   Watch it with `deploy_subscribe({ project_id: <the project_id>, deployment_id, wait_seconds: 20 })`.
   It is a JSON LONG POLL, not a stream: the server holds the request (max `wait_seconds` 25),
   checks every 1.5s, and answers the moment the deployment is terminal - so call it in a LOOP until
   `data.terminal` is true, then read `data.succeeded` as a SEPARATE question, because a FAILED
   deploy is terminal too. Never branch on the status string: the vocabulary includes ready,
   deployed, completed, success, succeeded and partial, and getting that list subtly wrong is how a
   finished deploy gets polled forever. `include_log_lines`, `max_seconds` and heartbeat intervals
   are NOT parameters of this tool - the SSE endpoint they belonged to still exists for browser
   clients and is not reachable from here, and an undeclared argument is silently dropped rather
   than erroring. Omit `deployment_id` to track the project's most recent deployment.
   `deploy_status({ project_id })` / `deploy_get({ project_id, deployment_id })` return the same
   per-deployment field set for a single point-in-time check. Read `data.warnings[]` on the
   response.

6. VERIFY. The pipeline itself requests the live URL (homepage + sample routes) through the CDN and
   FAILS the deploy on 403/404/5xx, so a success is a deploy that is actually serving. Two things it
   cannot tell you: page routes under reserved CDN prefixes are excluded from that smoke check by
   design, and a 401 from an intentional auth gate counts as a pass. Load the pages you changed
   yourself and spot-check.

7. IF IT FAILS: a red build → `project_build_error_get({ project_id })` (`error_summary` +
   `last_log_lines` + `full_logs`). "Deployed, but the live site FAILS verification" means the
   artifacts shipped and the SERVING PATH is broken → `deploy_doctor({ project_id, environment })`
   and relay its CRITICAL findings' `fix` text verbatim. Do NOT blindly retry: a retry re-ships the
   same artifacts down the same broken path and costs another propagation window. A deployed change
   that does not show visually → suspect the CDN cache and send `project_cdn_invalidate({ project_id,
   environment, action: "invalidate" })` with the default `/*` (ONE billable path; the account gets
   1,000 free paths a month across every project, so never enumerate). Skip invalidation entirely for
   `_next/static` hashed bundles.

8. REGRESSION: roll back by restoring the prior good checkpoint (`/hiveku:restore`, dry-run first) and
   re-deploying. On a tier bound to a branch there is no checkpoint: `project_vcs_revert({ project_id,
   branch, commit_id, expected_head_commit_id })` moves the branch back to an earlier commit of its
   own, then re-deploy the tier. Do not hot-patch production under pressure.

Afterwards, log what shipped and the deployment id with `memory_create` or on the `pm_tasks_complete`
note, so the monthly report writes itself.
