---
description: Create images, branded designs, and AI video for ads, social posts, and pages - brand-aware, registered to the Media Library, ready to attach.
argument-hint: "[what to create, e.g. 'a 9:16 reel clip for the spring promo' or '4 ad images for the roofing campaign']"
---
Create the media$ARGUMENTS. Generated images and video clips auto-register in the account's Media
Library and attach to posts/ads via their asset id - never paste raw URLs into content when an asset
id exists. Design exports and stock-photo URLs do NOT auto-register: register those yourself with
`marketing_media_register_external_url` before attaching them anywhere.

REUSE FIRST. `marketing_media_list` / `stock_photos_search` before generating - the user's real photos
beat AI for authenticity (products, team, location shots), and generation costs money.

IMAGES - cheap, iterate freely:
- One image: `generate_image({ prompt, ... })` - brand-aware by default, auto-registers a media_asset
  and returns `media_asset_id`. Use that id; do NOT re-upload the result.
- A SET that must look consistent (ad variations, hero + before/after, carousel):
  `generate_image_set` (up to 10 prompts, one shared brand context). Every success is auto-registered
  too; per-prompt failures land in `errors[]` instead of failing the batch. Load
  `account_context_get({ domain: 'branding' })` first and write all prompts from the same visual
  language (there is no `creative` domain - `branding` is the visual-system one).
- Stock: `stock_photos_search({ query, count, orientation })` returns `{ url, thumbnail, photographer,
  source, attribution }` - it SAVES NOTHING. To land a stock photo in the Media Library, register the
  chosen url with `marketing_media_register_external_url({ file_url, source_type: 'pexels', title,
  alt_text })` - no bytes move. `stock_photos_download` is the WEBSITE-PROJECT lane only: it requires
  `{ url, project_id, save_path }` (save_path is a path inside the project, e.g.
  'public/images/hero.jpg') and writes to that project's S3 assets, NOT the Media Library.

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

3. MOTION GRAPHICS (text/layout/branded cards): the design lane below - `design_export_mp4`, no
   generation cost. Prefer it for text-heavy promos.

Shape by destination: 9:16 → Stories/Reels/TikTok/Shorts; 16:9 → YouTube/X/LinkedIn/site heroes.
Duration ceilings at post time: Shorts 60s, Reels 90s, X 140s.

DESIGN (Creative Studio) - zero marginal cost, the highest-volume creative lane (promo cards, quote
graphics, carousels, ad variations):
- `design_templates_list` - the 52-template library, already brand-substituted with the account's
  active brand guide, plus artboard presets grouped by category. Each template carries a ready-to-use
  `canvasData` payload.
- `design_create({ title, designType, artboard: { width, height, background }, initialCanvasData:
  <the template's canvasData> })` - only `title` is required. Returns `id` + `dashboardUrl`; hand the
  user that URL so they can keep editing in the browser.
- Read before you write: `design_state_get({ id })` returns a compact element-by-element summary
  (position/size/style/text/animation) instead of raw Fabric JSON. Then `design_update({ id,
  canvasData })`, which REPLACES the entire canvas (body capped at 10MB). Per-layer motion lives on
  each object as `animation: { preset, delay_ms, duration_ms }` - presets: fade-in, fade-up,
  fade-down, fade-left, fade-right, scale-in, pop, slide-up, slide-down, slide-left, slide-right,
  wipe-up, wipe-down, pulse, wiggle, rotate-slow, breathe. Canvas-level timing is
  `_animation: { duration_ms, fps, loop }` on the root.
- Snapshot with `design_version_create({ id, versionName, changeSummary, isMilestone })` BEFORE a
  large destructive edit - that is what the dashboard's Version History rolls back to
  (`design_versions_list` to see them). There is no design_delete tool; deletion stays in the
  dashboard by policy.
- Show the result: `design_export_image({ id, canvas_json, width, height })` returns an S3 PNG URL -
  put it in the reply so the user sees it inline. `design_export_mp4({ id, canvas_json, width,
  height, duration_seconds })` returns `mp4Url`; follow it with `design_update({ id, previewVideoUrl
  })` so the gallery gets an autoplay thumbnail (`previewVideoUrl` only takes effect when
  `canvasData` is NOT in the same call).
- Both exports are SYNCHRONOUS (image ~5-15s typical, 90s budget; mp4 up to 240s), both REQUIRE the
  full Fabric `canvas_json` plus width/height in the body - they do NOT render a stored design from
  its id alone - and both refuse early on an empty canvas.
- `design_list` / `design_get` (or `marketing_design_list` / `marketing_design_get`) find an existing
  design to restyle instead of rebuilding it.

KEEP THE LIBRARY USABLE:
- One folder or collection per campaign: `media_folder_create({ name, parent_id })` or
  `media_collection_create({ name, cover_asset_id })` + `media_collection_add_item({ collection_id,
  asset_id })`. File generated assets into it as you go, not later.
- `media_update({ asset_id, alt_text, tags, title })` on everything you generate - accessibility and
  every later search depend on it. It changes metadata only, never the underlying file.
- ALWAYS `media_usage_get({ asset_id })` before `media_delete`. It returns `{ usage_count, usage[] }`
 - every email, page section, and CMS entry that would break. `media_delete` is a HARD delete plus
  S3 purge; it refuses with 409 in_use, and `force: true` orphans live content. Never pass force
  without an explicit user yes.
- Bulk import: `media_library_register_external_url_batch({ assets: [...] })`, up to 100 per call,
  per-row `errors[]` so one bad URL does not fail the batch.
- `marketing_media_list` filters on folder_id ("root" for top level), media_type, tags, search,
  ai_generated, collection_id; limit maxes at 100 (default 20) - page it before concluding an asset
  does not exist.

USE THE RESULT:
- Social post: attach via `media_asset_ids` on the post-create call; check the platform's media rules
  first (TikTok posts land as inbox drafts; X posting is Premium-gated).
- Ads: image sets sized per placement; note ad platforms re-crop - keep the subject centered.
- Site: for website projects use `assets_upload` (the S3/CDN lane) - the marketing Media Library and
  website-project assets are SEPARATE stores; download + re-upload when moving between them.
- Close the loop in the PM task (what was created, asset ids, where it was used) + owner update.
