---
description: Create images, branded designs, and AI video for ads, social posts, and pages - brand-aware, registered to the Media Library, ready to attach.
argument-hint: "[what to create, e.g. 'a 9:16 reel clip for the spring promo' or '4 ad images for the roofing campaign']"
---
Create the media$ARGUMENTS. Generated images and video clips auto-register in the account's Media
Library and attach to posts/ads via their asset id - never paste raw URLs into content when an asset
id exists. Design exports and stock-photo URLs do NOT auto-register: register those yourself with
`media_library_register_external_url` before attaching them anywhere.

REUSE FIRST. `media_library_list` / `stock_photos_search` before generating - the user's real photos
beat AI for authenticity (products, team, location shots), and generation costs money. A real photo
at the wrong size is a free `media_transform`, never a regeneration; a client image still on their
site comes in as bytes with `media_import_url` (see MEDIA OPS below).

REPLACING UNDERPERFORMING AD CREATIVE starts at /hiveku:ad-refresh, not here - the performance read (fatigue, hook, hold, structure) decides the brief this command then produces.

IMAGES - cheap, iterate freely, but metered:
- Pre-flight before any set or upscale: `media_image_quota` (no args, always 200) returns `{ used,
  limit, unlimited, remaining, period }` from the same counter the generation reserve debits, so
  `remaining` is how many images the next batch can still make. `remaining: null` means UNKNOWN -
  the plan is unlimited (`unlimited: true`) or the read failed (`reason: 'read_failed'`) - never
  "nothing left" and never a green light; `period.lapsed: true` means the counter has not rolled yet
  and the post-reset posture is what the next call meets. Quote it to the user before spending.
- One image: `generate_image({ prompt, ... })` - brand-aware by default (`use_brand: false` opts
  out), auto-registers a media_asset and returns `media_asset_id`. Use that id; do NOT re-upload the
  result. Exact dimensions via `target_width` / `target_height`. `mode: 'modify'` with
  `reference_media_asset_ids` (1-4 library asset ids) edits or composites existing images instead of
  generating fresh. `model` also takes flux | flux-pro | recraft; `seed` and `negative_prompt` are
  fal-lane only (a 400 on the gemini lane, never silently dropped). Prompts name photographic
  subjects only: generated-image text is garbage, so every word and every logo is a canvas layer in
  the design lane, never generated pixels.
- Brand honesty on every response: `brand_applied: true` means the active guide reached the model;
  `brand_skipped_reason: 'no_active_brand_guide'` means the image generated UNBRANDED and the slot
  was still spent - say so, and fix it with /hiveku:brand, not with hex codes in the prompt. A failed
  guide READ is 503 `brand_unavailable` before any slot is reserved: retry, or pass `use_brand: false`
  on purpose.
- A SET that must look consistent (ad variations, hero + before/after, carousel):
  `generate_image_set` (up to 10 prompts, one shared brand context). Top-level `use_brand` is the
  batch default (a per-prompt `use_brand` beats it either way) and top-level `target_width` /
  `target_height` frame every prompt without its own - a per-prompt pair REPLACES the top-level pair
  entirely, never half-and-half. Every success is auto-registered too and carries its own
  `brand_applied`; per-prompt failures land in `errors[]` instead of failing the batch (the status is
  201 with any success, 502 only when all failed - read `summary` and `errors[]`, not the status).
  Load `account_context_get({ domain: 'branding' })` first and write all prompts from the same visual
  language (there is no `creative` domain - `branding` is the visual-system one).
- Stock: `stock_photos_search({ query, count, orientation })` returns `{ url, thumbnail, photographer,
  source, attribution }` - it SAVES NOTHING. To land a stock photo in the Media Library, register the
  chosen url with `media_library_register_external_url({ file_url, source_type: 'pexels', title,
  alt_text })` - no bytes move. `stock_photos_download` is the WEBSITE-PROJECT lane only: it requires
  `{ url, project_id, save_path }` (save_path is a path inside the project, e.g.
  'public/images/hero.jpg') and writes to that project's S3 assets, NOT the Media Library.

MEDIA OPS - every one makes a NEW library row and never touches the source (bytes are immutable:
`media_update` refuses `file_url`, `file_path`, `width`, `height`, `duration`, `ai_metadata` with a
400 `immutable_field`). Cost shapes differ, so name the lane before you call:
- `media_import_url({ url, folder_id?, title?, tags? })` copies the BYTES of an external image into
  the library (SSRF-guarded, 25MB, image-only, SVG refused) so the asset outlives its origin - the
  difference from `media_library_register_external_url`, which stores a pointer that dies with the
  origin. Not a generation: no quota slot. Nothing dedupes on the URL, so import once; a 500
  `register_failed` means the bytes ARE on S3 - check `media_library_list` before re-importing.
- `media_transform({ asset_id, resize?, crop?, format?, quality? })` - crop (source pixels,
  bounds-checked) then resize (`{ width, height, fit: 'cover' | 'contain' }`, max 4096 per side)
  then encode (`png | jpeg | webp`; `quality` needs `format`). FREE, no model, no slot: the exact-slot
  variant of a real photo is always this, never a regeneration.
- [CONFIRM] `media_upscale({ asset_id, scale? })` - fal clarity at 1-4x (default 2), refused 400
  before submit past 32 output megapixels. COSTS TWICE: one image-generation slot (402
  `quota_exceeded` when spent; the generate tools say 429 `budget_exceeded` on the same counter) PLUS
  $0.03 per output megapixel billed once the worker accepts the job, even if the output later fails
  to land. `media_image_quota` first, one confirmed asset at a time, only after `media_transform`
  cannot help. A timeout or a 503 `provider_unavailable` at stage poll/render/timeout is usually a
  paid job: check `media_library_list` (newest, title ending `(upscaled)`) BEFORE calling again.

VIDEO - three separate lanes. Pick the lane before you spend anything.

1. MULTI-SCENE (a Reel/TikTok/promo/explainer/testimonial/listing tour - anything that is not one
   single clip): `marketing_storyboard_create`. FREE AND FAST - it validates, prices, and stores;
   nothing is reserved, billed, or enqueued until a human approves. Pass EXACTLY ONE of `template_id`
   (social-short | product-promo | explainer | testimonial | listing-tour | event-promo, filled via
   `substitutions: { slot: value }`) OR a hand-authored `storyboard` hiveku.storyboard.v1 document -
   the two are mutually exclusive. The template path also takes `style_id` (clean-professional |
   bold-social | premium-minimal | warm-documentary), `profile_id` (tiktok | instagram_reels |
   youtube_shorts | youtube_landscape | linkedin_feed | linkedin_square | website_hero), `music`
   (generate | stock | none), `voice_id`, `model`, `title`. A validation failure comes back as
   `validation.errors` naming the exact bad field per scene.
 - **YOU CANNOT APPROVE. There is no approve tool.** Call
     `marketing_storyboard_submit_for_approval({ storyboard_id })`, report scenes / runtime /
     itemized cost, ask the user to approve the card in the dashboard, and END THE TURN. Do NOT then
     generate scenes one at a time to work around the gate.
 - Restyle with `marketing_storyboard_set_look({ storyboard_id, look })` - it edits by name, so a
     field you do not restate cannot be silently dropped. `marketing_storyboard_update` is a FULL
     REPLACE of the document: anything omitted is deleted. EITHER edit bumps the version, re-prices,
     and CLEARS every approval stamp - even a one-color change sends the card back for re-approval.
     That is the gate working. Both refuse with 409 pipeline_already_started once the run began.
 - Watch an approved run with `marketing_video_pipeline_status({ pipeline_id })` - the storyboard
     id and the pipeline id are the same id. Check in; do NOT tight-poll. `paused_until` is a quota
     pause that resumes itself, not a failure.
 - `marketing_video_pipeline_retry_scene({ pipeline_id, index })` re-generates exactly ONE FAILED
     clip (0-based index from status). Completed scenes are never regenerated - the route refuses
     rather than double-billing. 402 monthly_cap_reached = the retry clip will not fit the allowance.
 - To STOP a run use `marketing_video_pipeline_cancel`, not delete. `marketing_storyboard_delete`
     is IRREVERSIBLE and only deletes a board that never ran (409 pipeline_running if approved or
     mid-run; 409 pipeline_has_render_jobs if it generated anything - that board is permanent).
     Confirm with the user before either call.

2. ONE CLIP: `marketing_generate_video({ prompt, aspect_ratio })` - ~10s, 720p. **ALWAYS call with
   `dry_run: true` first**: it returns `{ allowed, used, limit, required_plan }` (Premium plan only,
   20 clips/account/month, ~$1 each). Tell the user the remaining quota before spending. The real
   call BLOCKS 30-90s. One good prompt beats three retries; NEVER re-generate a clip that succeeded
   (the asset is already in the library). Errors: 402 plan_upgrade_required / monthly_cap_reached,
   429 `video_quota_exhausted` (platform capacity, resets overnight - schedule and move on, don't
   spin), 501 video_generation_not_configured, 504 timeout.
 - "Animate this": generate or pick a still, then pass it as `reference_media_asset_id` for
     image-to-video (it wins over `reference_image_url`). Keep the motion prompt gentle (subtle
     camera drift, ambient motion).
 - Levers: `duration_seconds` (2-10; the price scales with the length, and it is a HINT the lane
     snaps - the default Kling lane renders only 5s or 10s, the fal Veo lanes 4/6/8s - so quote the
     snapped length and read back `duration_requested`, `duration_effective` (the measured length;
     null when unmeasured, NEVER 0) and `duration_note`), `reference_mode: 'compose' | 'animate'` for
     how a reference image is used ('compose' renders a branded reference still first - that spends
     one image credit and the call fails if the still fails; a later video failure then carries
     `composed_still_asset_id`, already paid for, so retry by animating THAT), `design_project_id` to
     link the clip to a design project, and `previous_interaction_id` to continue a prior clip - pass
     ONLY an `interaction_id` a previous call returned to THIS account; anything else is a 400
     `invalid_request`, and so is a garbage `seed` (null / '' mean absent, never seed 0).
 - A 504 or dropped connection loses the response, NOT the paid job: recover with
     `design_render_job_get({ job_id })` using the returned `render_job_id`. That call ADVANCES the
     job (it runs the same poll-and-advance the reconcile cron uses, finishing the clip and
     registering it in the library) - a write in read clothing, not a free peek. Lost the id too:
     `design_render_jobs_list` filters by status / kind / design_project_id.

3. MOTION GRAPHICS (text/layout/branded cards): the design lane below - `design_export_mp4`, no
   generation cost. Prefer it for text-heavy promos.

Shape by destination: 9:16 → Stories/Reels/TikTok/Shorts; 16:9 → YouTube/X/LinkedIn/site heroes.
Duration ceilings at post time: Shorts 60s, Reels 90s, X 140s.

DESIGN (Creative Studio) - zero marginal cost, the highest-volume creative lane (promo cards, quote
graphics, carousels, ad variations):
- `design_templates_list` - the 58-template library (14 sizes; the wide formats are templates now:
  two 1200x600 email headers, OG 1200x630, YouTube 1280x720, LinkedIn banner 1584x396, X header
  1500x500), already brand-substituted with the account's active brand guide, plus artboard presets
  grouped by category. Each template carries a ready-to-use `canvasData` payload.
- `design_create({ title, designType, artboard: { width, height, background }, initialCanvasData:
  <the template's canvasData> })` - only `title` is required. Returns `id` + `dashboardUrl`; hand the
  user that URL so they can keep editing in the browser.
- Read before you write: `design_state_get({ id })` returns a compact element-by-element summary
  (position/size/style/text/animation) instead of raw Fabric JSON; pass `page_id` on a multi-page
  design (the response's `pages` roster + `activePageId` say what exists). Then `design_update({
  id, canvasData, expectedSectionsVersion })` - canvasData REPLACES the entire canvas (body capped
  at 10MB; `{ pages: [{ id, name, canvasData }] }` is the multi-page shape). `expectedSectionsVersion`
  is the CAS token: a 409 `sections_version_conflict` means someone else saved first and the body
  hands back `serverCanvasData` - re-apply your change on top of it, never overwrite blind. The
  token comes from the read itself - `design_state_get` and `design_get` return `sectionsVersion` -
  and a later `design_update` response or a 409 (`serverVersion`) refreshes it.
- Per-layer motion lives on each object as `animation: { enter, enter_delay_ms, enter_duration_ms,
  enter_distance_px, easing, exit, exit_at_ms, exit_duration_ms, loop }`. `enter` / `exit` presets:
  fade-in, fade-up, fade-down, fade-left, fade-right, scale-in, pop, slide-up, slide-down,
  slide-left, slide-right, wipe-up, wipe-down, blur-in, rotate-in. `easing`: cubic-out, quart-out,
  expo-out, back-out, ease-in-out, elastic. `loop` is a SEPARATE field (pulse, wiggle, rotate-slow,
  breathe, float, shimmer) - putting a loop value in `enter` produces no entry animation at all.
  Canvas-level timing is `_animation: { duration_ms, fps, loop }` on the root. The renderer reads
  these keys literally and an unknown key is ignored in silence, so a wrong name renders the design
  completely static while every tool reports success. The old `{ preset, delay_ms, duration_ms }`
  shape is exactly that kind of wrong - dead, never read by the renderer; flag it wherever you find
  it saved, and never copy it forward.
- Snapshot with `design_version_create({ id, versionName, changeSummary, isMilestone })` BEFORE a
  large destructive edit - that is what the dashboard's Version History rolls back to
  (`design_versions_list` to see them). There is no design_delete tool, deliberately:
  `design_update({ id, status: 'archived' })` is the removal verb, and hard deletion stays in the
  dashboard.
- Show the result: `design_export_image({ id, canvas_json, width, height })` returns an S3 PNG URL -
  put it in the reply so the user sees it inline. `design_export_mp4({ id, canvas_json, width,
  height, duration_seconds })` returns `mp4Url`; follow it with `design_update({ id, previewVideoUrl
  })` so the gallery gets an autoplay thumbnail (`previewVideoUrl` only takes effect when
  `canvasData` is NOT in the same call).
- Both exports are SYNCHRONOUS (image ~5-15s typical, the tool waits 100s; mp4 up to 280s), both
  REQUIRE the full Fabric `canvas_json` plus width/height in the body - they do NOT render a stored
  design from its id alone - and both refuse early on an empty canvas. Both render the account's
  custom brand fonts (rows with a `css_font_face`) and both return `warnings?`: a font that could not
  load degraded to the fallback stack, so a 200 with a font warning is a brand-wrong render - fix the
  font row via /hiveku:brand, then re-export.
- Look at it before you hand it off: download the exported PNG and view it, judge hierarchy,
  contrast, margins, and brand tokens against the brief, fix and re-export - hard cap two to three
  passes, then name what remains (the hiveku-creative-agency skill's `references/self-review.md`
  has the loop).
- The finished static deliverable: `design_publish_to_library({ id, set_as_featured: true })` reads
  the canvas straight from the DB, renders the settled frame, and creates a PERMANENT media asset.
  `set_as_featured` is THE thumbnail path - agent-created designs have no gallery thumbnail without
  it. Nothing dedupes and a timeout may still land the render, so call it ONCE and never retry
  blindly; `design_export_image` + `media_library_register_external_url` is the lane when you need a
  specific frame instead.
- `design_list` / `design_get` find an existing design to restyle instead of rebuilding it. The
  deeper canvas round-trip (comments, versions, self-review) is /hiveku:design.
- The `marketing_media_*` / `marketing_design_*` twins are the same routes surfaced for a different
  key profile: prefer `media_*` / `design_*`, and reach for a twin only when a scoped key answers
  tool-not-found.

KEEP THE LIBRARY USABLE:
- One folder or collection per campaign: `media_folder_create({ name, parent_id })` or
  `media_collection_create({ name, cover_asset_id })` + `media_collection_add_item({ collection_id,
  asset_id })`. File generated assets into it as you go, not later.
- `media_update({ asset_id, alt_text, tags, title })` on everything you generate - accessibility and
  every later search depend on it. It changes metadata only, never the underlying file: the physical
  columns are refused with a 400 `immutable_field`, and a different-sized or re-encoded file is a
  `media_transform` row, not an edit.
- ALWAYS `media_usage_get({ asset_id })` before `media_delete`. It returns `{ usage_count, usage[] }`
 - every email, page section, and CMS entry that would break. `media_delete` is a HARD delete plus
  S3 purge; it refuses with 409 in_use, and `force: true` orphans live content. Never pass force
  without an explicit user yes.
- Bulk import: `media_library_register_external_url_batch({ assets: [...] })`, up to 100 per call,
  per-row `errors[]` so one bad URL does not fail the batch.
- `media_library_list` filters on folder_id ("root" for top level), media_type, tags, search,
  ai_generated, collection_id; limit maxes at 100 (default 20) - page it before concluding an asset
  does not exist.

USE THE RESULT:
- Social post: `social_create_post` with `media_urls` (the asset's `file_url` / `mp4_url`, or a
  design export URL) plus an index-aligned `media_types` (`image/png`, `image/jpeg`, `video/mp4` -
  the publishers trust the declared type over the extension); onto a post that already exists or is
  scheduled, `social_update_post({ post_id, media_urls, media_types })`, which REPLACES the whole
  media list (send every URL; omitting `media_types` keeps the old types) and 400s on a published
  post. Check the platform's media rules first (TikTok posts land as inbox drafts; X posting is
  Premium-gated).
- Ads: image sets sized per placement; note ad platforms re-crop - keep the subject centered.
- Site: for website projects use `assets_upload` (the S3/CDN lane) - the marketing Media Library and
  website-project assets are SEPARATE stores; download + re-upload when moving between them.
- Close the loop in the PM task (what was created, asset ids, where it was used) + owner update.
