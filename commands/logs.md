---
description: Triage logs for an environment of this project - live-site incidents (runtime errors + broken serving path), failed builds, and the preview.
argument-hint: "[preview|development|staging|production]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Triage THIS project's **$ARGUMENTS** environment (default development). This project's id is `<the project_id>`.

**Route by SYMPTOM first, then by environment - the build log is the wrong oracle for a live-site incident.** A site that is 500ing NOW needs the request logs, not yesterday's build output.

1. If `.hiveku/logs/$ARGUMENTS.log` exists (written by the VS Code "show logs" action), read it first -
   it's the exact log the user is looking at.

2. **Site serving WRONG (403/404 on the live URL, blank pages, "deploy said ready but the site is
   broken")** → `deploy_doctor({ project_id: <the project_id>, environment: "$ARGUMENTS" })` FIRST, not
   a log. Read-only; it checks the full serving path you cannot see from logs: CloudFront wiring
   (right origin kind - Lambda for framework apps, S3 for static), the attached CloudFront Function
   (a static-era function on a Lambda origin = the "every route 404s but /_next/* chunks work"
   signature), and a serving diff of the same routes through the CDN AND directly against the origin -
   origin-200/CDN-broken means fix CloudFront, both-broken means build/artifact problem. Relay its
   CRITICAL findings' `fix` text verbatim. Do not blindly retry the deploy.

3. **Runtime error on a DEPLOYED tier (a page on development/staging/production is throwing NOW)** →
   `project_logs_get({ project_id: <the project_id>, source: "runtime", level: "error" })` - the
   Lambda/ECS request logs from CloudWatch, the "Vercel-like Functions tab" for Hiveku-deployed sites.
   Narrow with `filter` (CloudWatch FilterPattern syntax) to a route or request id; widen with
   `level: "all"` to see the traffic around the failure. NEVER `preview_logs` for this - it reads the
   Fly preview container, not the deployed Lambda. `source: "deploy"` returns the deployment lifecycle
   events (status + error_message) when you need the timeline of what shipped when.

4. **Failed build** → `project_build_error_get({ project_id: <the project_id> })` for the extracted
   real error of the last failed DEPLOY build. Full tier build log: `deploy_status({ project_id:
   <the project_id>, environment: "$ARGUMENTS" })` → take `.most_recent.deployment_id` →
   `deploy_get({ project_id: <the project_id>, deployment_id })` → `build_logs` (`project_logs_get`
   with `source: "build"` also lists recent build sessions with full output). If the filtered query
   returns no rows, retry WITHOUT `environment` - legacy deployments store other tokens (e.g.
   "cloudfront") and the filter misses them. If what failed was a TEST build you started, its oracle
   is `project_test_build_log_get({ project_id, session_id })` - `project_build_error_get` returns the
   last failed real DEPLOY, which can be days old and from a different change set.

5. **Live Preview (Fly)** - runtime only, no build phase:
 - Server side: `preview_logs({ project_id: <the project_id> })` (dev-server stdout) or
     `preview_runtime_errors` (parsed `{ message, stack[] }` - run after a preview 500 or blank page).
 - Browser side: `preview_client_errors` for hydration mismatches, dead interactivity, and
     console.error - these occur in the browser and NEVER appear in the server logs. Check
     `capture_installed` on the response: `false` means capture isn't wired on this container
     (recreate with `preview_force_recompile({ refresh_image: true })`), and even `true` + empty can
     just mean nobody has loaded the page since the last restart - load it first, then re-check.

6. Summarize the failure, name which oracle you read, and propose a concrete fix.
