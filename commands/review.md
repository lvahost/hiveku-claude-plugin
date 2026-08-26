---
description: Resolve a visual review - the LOCAL on-disk annotations (boxes/pins + comments on a screenshot), plus the client's annotations left in Hiveku on a PM task. Fix the code each points at, mark them resolved. Optionally capture a page first.
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Resolve a LOCAL visual review for THIS project. This project's id is `<the project_id>`. Everything lives on disk under `.hiveku/review/` - no app chat, no annotation server, and it is gitignored so it never leaves the machine.

STEP 0 - CAPTURE (only if the user asks to "capture <path>", or `.hiveku/review/` has no screenshots yet):
1. Get the live preview URL: `preview_overview({ project_id: <the project_id> })` → `preview_url`. If it is not ready, `preview_sync({ project_id: <the project_id> })` then re-poll.
2. `browser_navigate({ url: <preview_url + path> })`, then `browser_resize({ width: 1920, height: 1080 })`.
3. SLUG (use the SAME string for the folder name AND the index.json `slug`): trim leading/trailing "/", replace internal "/" with "__", strip anything not [a-z0-9_-], empty → "home". So "/" → home, "/about" → about, "/blog/post" → blog__post.
4. `browser_take_screenshot({ fullPage: true, type: "png", scale: "css", filename: "hiveku-review.png" })` - `scale` is REQUIRED; `scale:"css"` makes the PNG exactly 1920 wide to match the logical-CSS rects. This writes to the Playwright MCP output dir, NOT your project - so then `mkdir -p .hiveku/review/<slug>` and Bash `cp` the returned file to `.hiveku/review/<slug>/screenshot.png`. The PNG MUST physically exist at that exact path (the annotator only lists a page when screenshot.png + dom.json + capture.json are all present).
5. `browser_evaluate` a function that returns `{ pageMetrics, elements }` where each element is
   `{ selector, rect:{x,y,width,height} in LOGICAL/CSS PAGE coords (rect.left+scrollX, rect.top+scrollY - NOT device pixels), tag, id, classes, text (≤200 chars), hivekuId (from data-hiveku-id), hivekuSource (JSON.parse of data-hiveku-source, then normalize to {file, line, column: column ?? col} - the column key is "column" on webpack builds and "col" on babel builds; only file+line are guaranteed; else null), outerHTMLHead (outerHTML.slice(0,120)), ariaLabel }`. Also read `window.devicePixelRatio` and `document.documentElement.scrollHeight` here so they are accurate.
   Walk the DOM in DOCUMENT ORDER, skip zero-size / display:none / visibility:hidden elements (the annotator resolves a click to the SMALLEST covering rect, i.e. the deepest element). Write it to `.hiveku/review/<slug>/dom.json`.
6. Write `.hiveku/review/<slug>/capture.json`: `{ version:1, pageUrl, previewUrl, projectId:"<the project_id>", viewport:{width:1920,height:1080} (LOGICAL CSS px), devicePixelRatio (from window.devicePixelRatio), scrollY:0, fullPage:true, fullPageHeight: document.documentElement.scrollHeight (LOGICAL CSS px - a sanity value; the annotator derives page height from the PNG itself), capturedAt }`.
   Then UPSERT this page into `.hiveku/review/index.json`, shape `{ version:1, projectId:"<the project_id>", projectName, pages: [ { slug, pageUrl, capturedAt, annotationCount:0, openCount:0, resolvedCount:0 } ] }` (the extension adds `savedAt` on annotate) - `pages` is an ARRAY; replace the row with the same `slug` if present, else append. Read the FULL file first and preserve every other row; never rewrite `pages` as an object or you drop other pages.
7. Tell the user to pull it local with `/hiveku:code` in VS Code (the extension command) to mark it up, then re-run `/hiveku:review`.

STEP 1 - LOAD: Read `.hiveku/review/index.json`. For every page with `openCount > 0`, read its `.hiveku/review/<slug>/annotations.json`, shape:
`{ version, page:{slug,pageUrl,screenshot,dom}, savedAt, annotations:[ {id, type:"rect"|"pin", region, comment, priority, annotationType, status:"open"|"resolved", resolvedAt, element:{matched, selector, tag, classes, text, hivekuId, hivekuSource:{file,line,column}, outerHTMLHead}} ] }`.
Iterate the top-level `annotations` ARRAY and process ONLY entries whose `status !== "resolved"`. SKIP any already `"resolved"` - do not re-edit or re-stamp them (this keeps re-runs idempotent).

STEP 2 - SEE each OPEN annotation (status !== "resolved"): Read `.hiveku/review/<slug>/screenshot.png` (you can view PNGs). Use `annotation.region` (percent coords) for WHERE and `annotation.comment` for WHAT.

STEP 3 - LOCATE the source, in priority order:
  a. `annotation.element.hivekuSource` set → open that `{file, line, column}` directly.
  b. else `annotation.element.hivekuId` set → grep the project for that id / the rendered text.
  c. else structural → grep `element.text`, narrow by `element.classes` + `element.tag` + a token from `element.outerHTMLHead`. Confirm the match renders the thing in the screenshot region BEFORE editing.
  Use `project_files_search` / Grep over the local working tree (this folder IS the project).

STEP 4 - FIX: make the minimal edit that addresses the comment. One annotation → one located edit. If `element.matched === false`, rely on the region + screenshot.

STEP 5 - VERIFY before shipping: `verify_typecheck` / `verify_lint` (or local tsc/eslint). Do not ship unverified.

STEP 6 - MARK RESOLVED: In that page's `annotations.json`, set each FIXED annotation's `status:"resolved"` + `resolvedAt:<ISO>` and rewrite the file preserving every other field. Then update `index.json`: read the FULL file, find the row with the matching `slug`, and set `annotationCount = annotations.length`, `openCount = count(status !== "resolved")`, `resolvedCount = count(status === "resolved")`, keeping that row's other fields (slug, pageUrl, capturedAt, savedAt) AND every OTHER page row untouched. `pages` stays an ARRAY - never rewrite it as an object or drop sibling rows. Report a summary: per annotation - comment → file changed → status.

STEP 7 - Commit only if asked (branch first, never `main` directly), then `/hiveku:deploy` on explicit request (commit ≠ live). Use `trash` not `rm`; no emojis in code/copy.

---

SERVER-SIDE BRANCH - annotations the CLIENT left in Hiveku, not on this disk.

Everything above is the LOCAL review loop. A client reviewing the live preview through Hiveku leaves their annotations on a PM TASK instead, and nothing under `.hiveku/review/` will ever show them. Run this branch too when the operator says "the client left feedback" or when the local folder is empty.

A. Find the PM project: `pm_projects_list` (it filters only by `status`, so scan the returned list for the `website` project_type yourself). Note this is a pm_projects id, NOT the website_projects id you used above; `pm_projects_create` links the two through `website_project_id`.
B. `pm_tasks_list({ project_id, status })` for the open review tasks.
C. `pm_tasks_get({ id })` on each. Its `data` carries an `annotations` array plus `annotation_count`. Per annotation: `{ id, annotation_type, priority, annotation_text, page_url, page_title, coordinates, screenshot_url, screenshot_key, screenshot_status, capture_method, viewport_size, created_by_name, created_by_email, created_at, resolved_at }`.
D. Process only annotations with `resolved_at` null. `screenshot_url` is a directly-fetchable public PNG - view it for the WHERE, read `annotation_text` for the WHAT, and use `page_url` + `coordinates` to locate the element. If `screenshot_status` is `capturing` and `screenshot_url` is null the async capture is still running: re-fetch `pm_tasks_get` shortly rather than working blind. `failed` or `none` means there is no image at all - work from `annotation_text` + `page_url` and say the screenshot was unavailable.
E. Locate and fix exactly as in STEP 3 / STEP 4 (`project_files_search` / Grep over the local tree), then verify per STEP 5.
F. Record the resolution with `pm_tasks_comment({ id, content })`, naming the annotation and the file changed. There is no MCP tool that flips an individual annotation's `resolved_at` - do not claim you marked one resolved. The comment plus `pm_tasks_complete({ id, summary })` when the whole task's feedback is addressed is the record.
