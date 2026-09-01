---
description: "Create or revise an editable, layered brand design: templates first, the canvas round-trip, a look-at-it self-review loop, and a dashboard URL the client can keep editing."
argument-hint: "[what to design, e.g. 'a 1080x1350 promo card for the spring sale' or 'work the comments on design <id>']"
---
Design work: $ARGUMENTS. Follow the **hiveku-creative-agency** skill; the layer model and artboard
depth live in its `references/design-canvas.md`. The deliverable is an **editable, layered design
project** the client can keep editing in the dashboard - a flat PNG pasted into chat is a dead end.
A reply that ends without a `dashboardUrl` has not delivered anything.

1. **Brand first.** `account_context_get({ domain: 'branding' })` - there is NO `creative` domain -
   plus `brand_guide_get` on the active guide. On a department-scoped key `account_context_get` can
   answer tool-not-found; that is scope, not an outage - hydrate through
   `talk_to_department({ domain: 'branding' })` instead and say which path you used.
2. **Reuse before you build.** `design_list` - an existing design to restyle beats a rebuild.
   `design_templates_list` - the 52-template library already substituted with the account's brand
   guide, each template carrying a ready-to-use `canvasData`.
3. **Create.** `design_create({ title, designType, artboard: { width, height, background },
   initialCanvasData: <the template's canvasData> })`. One design per destination size - an artboard
   per channel, never one canvas stretched across formats. Returns `id` + `dashboardUrl`.
4. **Revise mode** (the "work the comments on design X" ask):
   - `design_comments_list({ id })` - resolved comments ARE included, so filter `isResolved`
     yourself or your count will disagree with the badge the human sees; `position` is the
     percentage pin on the canvas.
   - `design_state_get({ id, page_id })` for the compact element-by-element read; on a multi-page
     design the response's `pages` roster + `activePageId` say what exists.
   - `design_version_create({ id, versionName, changeSummary })` BEFORE any structural rewrite -
     that is what the dashboard's Version History rolls back to.
   - `design_update({ id, canvasData, expectedSectionsVersion })`. canvasData REPLACES the whole
     canvas; `{ pages: [{ id, name, canvasData }] }` is the multi-page shape. The CAS token comes
     from your read - `design_state_get` (and `design_get`) return `sectionsVersion` - and a later
     `design_update` response or a 409 (`serverVersion`) refreshes it. A 409 `sections_version_conflict` means
     someone else saved first and hands back `serverCanvasData`: re-apply your change on top of it
     and send the new token.
     Never overwrite blind. Removal verb: `status: 'archived'` - there is NO design_delete tool.
   - `design_comment_resolve({ id, commentId })` ONLY for comments you actually fixed, top-level
     ids only (a reply id reports success and changes nothing), and it is one-way - nothing
     un-resolves a comment.
5. **Self-judge loop.** `design_export_image({ id, canvas_json, width, height, frame })` - it
   requires the full canvas_json plus dimensions in the body; it does NOT render a stored design
   from its id. Download the PNG and VIEW it, judge hierarchy, contrast, margins, and brand tokens
   against the brief, fix, re-export. Hard cap two to three passes, then hand off naming what
   remains. The written checklist is the skill's `references/self-review.md`.
6. **Finish.** For the static deliverable: `design_publish_to_library({ id, set_as_featured: true })`
   ONCE - it reads the canvas straight from the DB, renders the settled frame, and creates a
   PERMANENT media asset with NO dedupe (a timeout may still land the render, so never retry
   blindly). `set_as_featured` is THE thumbnail path: agent-created designs have no gallery
   thumbnail without it. Need a specific frame instead: `design_export_image` +
   `media_library_register_external_url`.
7. **Hand back the `dashboardUrl`** (`design_create`, `design_get`, and `design_state_get` all
   return it) so the client keeps editing in the browser, plus the asset id of anything published.

MOTION addendum - the animation vocabulary the renderer actually reads:
- Per-layer, on each object: `animation: { enter, enter_delay_ms, enter_duration_ms,
  enter_distance_px, easing, exit, exit_at_ms, exit_duration_ms, loop }`.
- `enter` / `exit` presets: fade-in, fade-up, fade-down, fade-left, fade-right, scale-in, pop,
  slide-up, slide-down, slide-left, slide-right, wipe-up, wipe-down, blur-in, rotate-in.
- `easing`: cubic-out, quart-out, expo-out, back-out, ease-in-out, elastic. `loop` is a SEPARATE
  field (pulse, wiggle, rotate-slow, breathe, float, shimmer) - a loop value in `enter` produces no
  entry animation at all. Root: `_animation: { duration_ms, fps, loop }`.
- Unknown keys are ignored in silence: a wrong field name renders the design completely static
  while every tool reports success. The old `{ preset, delay_ms, duration_ms }` shape is dead - the
  renderer never read it; flag it where found, never copy it forward.
- [CONFIRM] `design_export_mp4({ id, canvas_json, width, height, duration_seconds })` - confirm
  before rendering: it runs a real render job and blocks up to 240s. Sanity-check motion first with
  `design_export_image` at frames 0, mid, and last. After the MP4, `design_update({ id,
  previewVideoUrl })` gives the gallery its autoplay thumbnail (`previewVideoUrl` only takes effect
  when `canvasData` is NOT in the same call).
- A dropped connection loses the response, not the job: `design_render_job_get({ job_id })`
  recovers it, and it ADVANCES the job (same poll-and-advance the cron runs, finishing and
  registering the output) - a write in read clothing, not a free peek. Lost the id:
  `design_render_jobs_list` filters by status / kind / design_project_id.

HARD RULES:
- Never overwrite a canvas blind: read (`design_state_get` / `design_get`) before every write,
  `design_version_create` before structural change, `expectedSectionsVersion` on every canvasData
  write once you hold a token, and a 409 means merge, not force.
- You cannot approve anything. No approve tool exists, by design - storyboard and video approval is
  a human dashboard gate. Never assemble a multi-scene ask clip by clip to route around it.
- Text and logos are canvas layers, never generated pixels. "Regenerate until the text is right" is
  a refusal: put the words in a textbox layer and the logo in an image layer.

Finish by persisting decisions (palette calls, template choices, residual issues) to the `branding`
memory document per the skill's `references/memory-protocol.md` - `memory_list({ domain:
"branding" })`, merge, `memory_update({ memory_id, content })` with the WHOLE body
(`memory_create({ type: "memory", name: "branding", content })` only on first run; 409 = exists) -
and reflect the deliverable in PM: `pm_tasks_create({ project_id, title })` (the field is `title`),
with asset ids and the dashboardUrl in the description.
