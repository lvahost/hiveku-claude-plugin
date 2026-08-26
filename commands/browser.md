---
description: Drive this project in a real browser with Playwright - local dev server or a deployed env.
argument-hint: "[path, default /]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Browser-test THIS project via the `playwright` MCP. This project's id is `<the project_id>`.

1. Make sure the dev server is running (e.g. `npm run dev`); note the localhost port.
2. Use the playwright tools to navigate `http://localhost:<port>$ARGUMENTS` (default "/"),
   `browser_snapshot`/`browser_take_screenshot`, click through the key flows, and report any
   console or runtime errors. Fix, then re-run.
3. To check a DEPLOYED environment instead, resolve its URL and navigate there:
   `project_get({ project_id: <the project_id> })` → `tiers.{development,staging,production}.url`, and
   `preview_overview({ project_id: <the project_id> })` for the Live Preview (Fly). The same four URLs
   are the "Hiveku Browser" links in the VS Code sidebar (open externally).
