---
description: Run this project's AI redesign pipeline - import an existing site's pages and rebuild them.
argument-hint: "[a source URL to import, optional]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Drive the redesign pipeline for THIS project$ARGUMENTS. This project's id is `<the project_id>`. Follow the ordered flow and check
`redesign_status({ project_id: <the project_id> })` between steps.

1. `redesign_homepage_approve({ project_id: <the project_id> })` - FIRST, and exactly once, after the
   user confirms the homepage looks right. This is a PRECONDITION, not the finish line: until it is
   set, `redesign_start` refuses with 409 "Homepage not approved". It publishes nothing.
2. `redesign_start({ project_id: <the project_id>, sourceUrl })` - runs Firecrawl /map on the source
   site and returns `{ session: { id, status, total_pages }, pages: [{ id, source_url, path, slug,
   title, screenshot_url }] }`. Keep the session id and the page ids.
3. `redesign_select_pages({ project_id: <the project_id>, sessionId, pageIds })` - the ids from step 2.
   It REPLACES the selection; an empty array clears it and the session drops back to
   `pages_discovered`.
4. `redesign_import({ project_id: <the project_id>, sessionId })` - returns 202 and scrapes in the
   background. POLL `redesign_status({ project_id: <the project_id>, sessionId })` until the pages move
   through `scraping` → `assets_imported`. Promote is not legal before that.
5. `redesign_promote({ project_id: <the project_id>, pageId, assetUrls? })` - PER PAGE, and it does NOT
   make anything live. It moves one staged page out of the scraper bucket into durable project
   storage, downloads the user-approved subset of discovered asset URLs (omit `assetUrls` to take all),
   and writes `.hiveku/redesign/<slug>.json` into the project workspace.
6. READ each `.hiveku/redesign/<slug>.json` brief and rebuild those pages in the project's code (edit
   files, then /hiveku:commit, then /hiveku:deploy on explicit request). Nothing in this pipeline
   ships a page.
The scraper bucket has a 7-DAY TTL - an import left un-promoted past that is gone and must be
re-scraped. `redesign_restart({ project_id, sessionId })` abandons the current session so the next
`redesign_start` opens a fresh one (completed sessions cannot be restarted). Show the user progress
after each step; this is multi-minute per stage.
