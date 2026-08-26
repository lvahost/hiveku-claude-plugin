---
description: Ship this project to a deployment tier — preflight, diff, confirm, deploy, then verify it actually serves.
argument-hint: "[tier — development (default), staging, or production]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Deploy THIS project$ARGUMENTS. This project's id is `<the project_id>`.

**This is the client-visible step and it needs an explicit yes.** State what is going live, to which
tier, and why, then wait for the confirmation before calling `deploy_site`.

**The tier is `environment` on `deploy_site`, and it is required:**
- `development` — the default and the SAFE first target. Lives at `*.development.hiveku-app.com`.
- `staging` — opt-in per project. Returns 412 with code `staging_not_enabled` otherwise. Do not offer
  it unless the user says it is enabled.
- `production` — the slow full CodeBuild path. Never pick it just to test the deploy flow.

**The tiers DO NOT share code and there is no auto-promote.** Every change you want in production —
`middleware.ts` and `next.config.js` included — needs its own `deploy_site({ environment:
"production" })` call. Saving files reaches the Fly preview instantly and touches no deployed tier.

1. GATE: the build is green (`/hiveku:commit` step 3) and the work is committed.

2. PREFLIGHT: `project_deploy_preflight({ project_id: <the project_id> })` → `{ ready, blockers[],
   hints[] }`. Surface `blockers[]` VERBATIM to the user — only they can fix those. Read `hints[]` for
   `reserved_cdn_prefix_page_collision`: a shipping page route sitting under a reserved CDN asset
   prefix (`videos/`, `media/`, `images/`, …) WILL 403 on the deployed URL. Rename the route before
   shipping; do not deploy and hope.

3. DIFF: `deploy_diff({ project_id: <the project_id>, environment })` for the file + route delta
   versus what is live. Read `data.has_changes` as a TRI-STATE, never as a boolean:
   - `false` — a confident all-clear (exact baseline, code and assets match). Safe to skip the deploy.
   - `true` — a concrete change (a never-deployed tier implies true).
   - `null` — we CANNOT prove no-change (approximate/timestamp basis, GitHub-source project, unknown
     asset baseline). Read `data.confidence`, `data.basis`, `data.warnings` and deploy anyway.
   Reporting an empty diff as "nothing will change" without checking which of the three you got is
   how a deploy the client is waiting on gets skipped. `deploy_changes({ project_id, tier })` is the
   coarser "what changed since the last deploy of this tier".

4. CONFIRM with the user: the tier, the pages/routes affected, and anything in `warnings`.

5. SHIP: `deploy_site({ project_id: <the project_id>, environment })`. It returns a deployment id.
   Watch it with `deploy_status({ project_id })` / `deploy_get({ project_id, deployment_id })`, or
   subscribe with `deploy_subscribe` (SSE, capped at 10 min — some MCP runtimes cannot hold a stream,
   so fall back to polling `deploy_get` every 5-10s when it fails). Read `data.warnings[]` on the
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
   re-deploying. Do not hot-patch production under pressure.

Afterwards, log what shipped and the deployment id with `memory_create` or on the `pm_tasks_complete`
note, so the monthly report writes itself.
