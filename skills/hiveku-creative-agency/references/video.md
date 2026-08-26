Reference file written to `/private/tmp/claude-501/-Users-aberubarts-Documents-main-hiveku/30c385fb-6c1e-4ade-8eb0-b3167903d1e5/scratchpad/video.md` (20,467 bytes, no frontmatter, no em dashes, no emojis, all three star-marked rules verbatim). Intended destination: `/Users/aberubarts/Documents/main_hiveku/hiveku-claude-plugin/skills/hiveku-creative/references/video.md`.

---

# Video: the three lanes, the approval gate, and what actually bills

## What this covers / when to load this

Every way this plugin can put moving pictures into a Hiveku account, and how to pick between them before you
spend a cent or a client's patience. There are exactly three lanes: an animated design canvas rendered to
MP4 (lane 1), a multi-scene storyboard a human approves before anything is produced (lane 2), and a single
AI-generated clip (lane 3). They differ in cost, in whether a human gate stands in front of them, in how
they fail, and in how the result gets registered. Load this whenever the ask is "make me a video", "animate
this", "we need a Reel / TikTok / promo / explainer / testimonial / listing tour", a motion logo or brand
card, a product demo clip, or a video cover for a post - and BEFORE picking a tool, because the most
expensive mistake here is starting in the wrong lane.

Still-image creative, the canvas as a static editor, brand guides, and the media library live in SKILL.md
and its other references. House rules stay in force: `account_context_get` before anything generative,
confirm before anything billable or irreversible, hand back a dashboard URL, never claim something was
generated when it was imported, and register what does not auto-register.

---

## 1. The decision rule (read this before touching a tool)

Ask these in order. Stop at the first yes.

**Q1. Is it type, layout, logo, brand card, price list, quote, stat, or countdown - anything typographic or
geometric, where the value is that the client can edit it later?**
**LANE 1, motion design.** Build it on the design canvas, render with `design_export_mp4`. No generation
cost, and it stays layered and editable. This is the right lane far more often than people expect: most
"social video" a retainer ships is text on brand color with a logo sting, not footage.

**Q2. Does it need more than one shot - a sequence with a hook, a body, and a CTA?**
**LANE 2, storyboard.** `marketing_storyboard_create`, then `marketing_storyboard_submit_for_approval`, then
STOP. The lane for Reels, TikToks, promos, explainers, testimonials, listing tours, event promos. Free to
draft and it prices itself, so a fully costed plan reaches the client at zero risk.

**Q3. Is it exactly one short shot - roughly ten seconds - of something that cannot be drawn as vector or
type and does not already exist in the library?**
**LANE 3, one generated clip**, `marketing_generate_video`. PAID, Premium-plan only, metered. Confirm before
you spend.

**Q4. None of the above - real people, real premises, real product footage, client-supplied video?**
No lane generates that. Import instead: `media_library_register_external_url` for a hosted file,
`media_upload` for a local one, and say plainly that the footage is client-supplied.

**The gate in front of all four:** reuse before generating. Run `media_library_list` (or
`marketing_media_list`) and `media_folders_list` first - the account's real photos and prior clips beat AI
for products, team, premises, and location, are already on brand, and cost nothing.

| Lane | Tool that produces the file | Cost | Human approval | Editable after |
|---|---|---|---|---|
| 1. Motion design | `design_export_mp4` | none beyond render time | no (confirm the block) | yes, fully layered |
| 2. Storyboard | `marketing_video_pipeline_start` after approval | priced at create, billed on approval | YES, and the agent cannot give it | scene-level via the board |
| 3. One clip | `marketing_generate_video` | about $1 per clip, metered | no, but confirm the spend | no, it is a flat file |

---

## 2. Lane 1: motion design on the canvas

The output is not just an MP4; it is a design project the client can open, retime, recolor, and re-render.

### 2.1 Build the canvas

Start from the library. `design_templates_list` returns the 52-template library already brand-substituted
with the account's active brand guide, plus artboard presets by category (Social Media / Presentation /
Print / Ads / Email). Each template carries a ready-to-use canvasData payload - pipe it into
`design_create`'s `initialCanvasData`. It takes no arguments, so there is no reason to skip it.

`design_create({ title, designType, artboard, initialCanvasData, description, tags })` returns `id` and
`dashboardUrl`. Hand the `dashboardUrl` back every single time; that URL is the deliverable as much as the
MP4 is. The canvas supports shapes, text, images (`type: 'image'` with `src`), groups, layer ordering via
the `objects[]` order, positions, and styling.

Artboards for video: 1080x1920 vertical for Reels, TikTok, Stories; 1080x1080 or 1080x1350 for an Instagram
feed; 1920x1080 for YouTube or LinkedIn. Pick it before you animate - changing it later rescales every
layer's `left`, `top`, `scaleX`, `scaleY`.

### 2.2 Animate per layer

Per layer: `animation: { preset, delay_ms, duration_ms? }`, where preset is one of `fade-in`, `fade-up`,
`fade-down`, `fade-left`, `fade-right`, `scale-in`, `pop`, `slide-up`, `slide-down`, `slide-left`,
`slide-right`, `wipe-up`, `wipe-down`, `pulse`, `wiggle`, `rotate-slow`, `breathe`. At the root:
`_animation: { duration_ms, fps, loop }`. That preset list is the whole vocabulary - no keyframes, no easing
argument, no custom motion path. If the ask needs one, say so rather than faking it.

The trap that ruins first attempts: a layer whose `delay_ms + duration_ms` exceeds the root `duration_ms`
never finishes on screen, and the viewer sees a half-played entrance frozen at the cut. Stagger entrances
100 to 200 ms apart and leave 800 ms of hold at the end so the last frame reads.

The reason to stay in this lane is exactness: the worker uses the same animation vocabulary as the editor,
so the output matches the in-browser preview exactly. What the client sees at the `dashboardUrl` is what the
MP4 will be.

### 2.3 Editing an existing design: the round-trip rule (`design_state_get`)

★ This is the read half of the round-trip: always state_get -> reason -> update. Never author a full canvas
blind over the top of a user's edits.

`design_state_get` returns a human-readable plus structured summary - element by element position, size,
style, text, and animation, plus a one-line summary - so you reason over a compact view instead of raw
Fabric JSON. `design_get` returns the raw `canvasData`, for when you need it.

`design_update` is the primary write path. Passing `canvasData` overwrites the canvas wholesale, and the
dashboard editor reads from the same column, so a blind overwrite silently destroys whatever the human
changed since you last looked. Title, description, status, tags, featuredImageUrl, and artboard update
independently. The body is capped at 10MB, so reference images by URL from the media library rather than
inlining base64. `previewVideoUrl` sets the autoplay thumbnail and ONLY fires when `canvasData` is omitted,
which makes it a second, separate call after the render, never a field tacked onto the canvas save.

Before any large or destructive edit, snapshot with `design_version_create({ id, versionName, changeSummary,
isMilestone })`, using `isMilestone` for named save points such as "client-approved v1". The client can then
roll back from the dashboard's Version History panel; `design_versions_list` shows every snapshot. It costs
nothing.

### 2.4 Check frames before you render the movie

`design_export_image({ id, canvas_json, frame })` flattens one frame to PNG through the same
CanvasComposition the MP4 path uses, so `frame=0` matches what the dashboard editor would produce; set
`frame` to capture a moment (at fps 30, `frame: 60` is two seconds in). Three single-frame exports -
opening, midpoint, last frame - catch a mistimed entrance, a text overflow, or a layer stuck off-artboard in
seconds instead of after a four-minute block. It is the cheap dry run for lane 1.

### 2.5 The render, and what to say while it blocks

`design_export_mp4({ id, canvas_json, width, height, duration_seconds })` renders the design to MP4 (or GIF)
via the Remotion worker. Pass the full canvas snapshot the user has been editing - layered Fabric JSON with
the per-layer `animation` metadata. Two hard behaviors:

- **SYNCHRONOUS, blocks up to 240 seconds.** Nothing else happens in the session while it runs. No progress
  percentage, no status tool, no cancel tool (`marketing_video_pipeline_status` and
  `marketing_video_pipeline_cancel` are lane 2 only and do nothing here).
- **Refuses early if the canvas has no objects.** Usually a symptom, not the bug: you passed the wrong
  design id, or a `canvas_json` you built in memory and never saved. Run `design_state_get` and confirm the
  canvas holds the layers you think it does.

Because it blocks, tell the user before you start, not after. Four things, one short message:

1. What you are rendering and where it lands - design title, its `dashboardUrl`, destination platform and
   aspect ratio.
2. The exact spec: width, height, fps, duration in seconds.
3. That the render is synchronous and can block for up to four minutes, during which the session can do
   nothing else, with no progress readout to report partway.
4. What happens next: register the file, set it as the design's preview, hand back both URLs.

Then get a yes. It is not billable, but four minutes of a dead session earns a confirmation, and it is the
last cheap moment to catch "actually make it square, not vertical".

Keep the render inside the window. Frames are `fps x duration_seconds`; 30 seconds at 30 fps is 900 frames
and is where timeouts start. Past roughly 20 seconds or 1080p, shorten it, drop to 24 fps, or split it into
two designs. A timeout leaves no partial output and no resume - say so up front rather than discovering it
at 240 seconds.

### 2.6 Re-rendering a template clip inside a design

`design_video_rerender({ id, template_id, props })` re-renders a single Remotion-template video clip with
new prop values. It applies when a design contains a video element backed by a Remotion template: someone
edits a slot, this re-runs the render, and the resulting MP4 swaps in place. It blocks up to 240 seconds,
and the same pre-render message applies.

The trap: canvas position, scale, and rotation are preserved by the caller on update, not by the tool. Read
`left`, `top`, `scaleX`, `scaleY`, and `angle` with `design_state_get` before the rerender and write them
back in the `design_update` afterwards, or the clip returns at default position and size and the layout
reads as broken. Use it for a one-slot change - new headline, new price, swapped product name - rather than
rebuilding a working design.

---

## 3. Lane 2: the multi-scene storyboard

This lane's whole design is the approval gate, and the gate is a feature. Use it instead of one-off video
generation whenever the ask is "make me a video" rather than "make me one clip".

### 3.1 Draft it, because drafting is free

`marketing_storyboard_create` is FREE AND FAST. It validates, prices, and stores. Nothing is reserved,
billed, or enqueued until a human approves. So you can put a complete, costed, scene-by-scene plan in front
of the client at zero risk.

Pass EXACTLY ONE of:

- `template_id` - a server-rendered genre template: `social-short`, `product-promo`, `explainer`,
  `testimonial`, `listing-tour`, `event-promo`. Fill `substitutions` as `{ slot: value }`. Optionally add
  `style_id` (`clean-professional`, `bold-social`, `premium-minimal`, `warm-documentary`) and `profile_id`
  (`tiktok`, `instagram`, and the other platform profiles).
- `storyboard` - a full `hiveku.storyboard.v1` document you authored, for anything the templates do not fit.

Both, or neither, is a create-time failure. Decide which before you build the call.

A hand-authored storyboard may carry look fields inline: board-level `style_id`, `transition`
(`none` | `fade` | `slide-left` | `slide-up`), `transition_ms`, `brand`, `captions.style`, and per-scene
`camera`. A template-built board cannot - there is no `look` block on create. To restyle one, create it and
then call `marketing_storyboard_set_look`. Do not smuggle look fields into `substitutions`; slots are
content, not style.

Write the scenes with the brand loaded. `account_context_get({ domain: 'branding' })` is the visual-system
domain and `talk_to_department({ domain: 'branding' })` is the visual department agent. There is NO
`creative` domain on either tool - passing one is a server-side rejection, not a soft fallback. For script
and on-screen copy, `talk_to_department({ domain: 'content' })` or `{ domain: 'social' }` fits better.

### 3.2 Fix validation failures precisely

On validation failure the response carries `validation.errors` naming the exact bad field per scene. Fix
that field with `marketing_storyboard_update`. Do not delete and re-create - you lose the priced structure
and any look already set, and the same error usually comes straight back. `marketing_storyboard_get`
re-reads current state whenever you are unsure what is stored.

### 3.3 Submit, then stop

★ **THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.**

`marketing_storyboard_submit_for_approval({ storyboard_id })`, then report and halt. The report the human
needs is short and specific:

- Scene count and the one-line beat of each scene.
- Total runtime.
- The price the create call returned, stated as the amount that will be billed on approval.
- The dashboard URL where they approve.
- A plain sentence that approval is theirs alone and nothing has been charged yet.

Then stop. Do not fan out single `marketing_generate_video` clips to assemble the same video and route
around the gate - it costs more, looks worse, and defeats a control the platform put there deliberately. If
the client is impatient, the honest answer is that the board waits on their click.

`marketing_storyboard_delete` destroys the board and is irreversible. Confirm explicitly, and never use it
as tidy-up after a failed validation when `marketing_storyboard_update` fixes the field.

### 3.4 After a human approves

- `marketing_video_pipeline_start` enqueues the run. This is the billable moment; the price was quoted at
  create.
- `marketing_video_pipeline_status({ pipeline_id })` polls it - the pipeline id is the same id as the
  storyboard. Unlike lane 1 this is asynchronous, so report progress instead of blocking.
- `marketing_video_pipeline_retry_scene` re-runs one failed scene. Reach for it before restarting anything;
  a whole-pipeline restart re-does work that already succeeded.
- `marketing_video_pipeline_cancel` stops a running pipeline. Confirm first - scenes already produced are
  still scenes the account paid for.

If a scene keeps failing after a retry, the fix is in the board: `marketing_storyboard_update` that scene,
or `marketing_storyboard_set_look` if the failure is style-driven.

---

## 4. Lane 3: one generated clip

`marketing_generate_video({ prompt, aspect_ratio })` produces roughly ten seconds at 720p. PAID at about one
dollar per clip, Premium-plan only, capped at 20 clips per account per month.

1. **ALWAYS call with `dry_run: true` first** and tell the user the remaining quota before spending. A client
   with three clips left this month deserves to know before you use one.
2. Confirm the spend explicitly: prompt, aspect ratio, cost, remaining quota, then a yes.
3. To animate an existing still - a product photo, a headshot, the premises - pass it as
   `reference_media_asset_id`. That is nearly always a better use of a paid clip than an invented scene: it
   is the client's real subject in motion. `aspect_ratio` follows the destination.

Lane 3 is wrong whenever the content is type or layout, whenever it needs more than one shot, and whenever
the library already has usable footage. There is no trim, crop, concatenate, or transition tool for
arbitrary MP4s anywhere in the registry, so three generated clips cannot be joined. That absence is exactly
why lane 2 exists.

---

## 5. Registering and attaching the finished asset

★ Generated images and video clips auto-register. **Design exports and stock-photo URLs do NOT** - register
those explicitly before attaching them anywhere.

**Lane 3** output auto-registers and returns a `media_asset_id`; nothing more is needed to make it
attachable. `generate_image` and `generate_image_set` behave the same for stills.

**Lane 1** output does NOT auto-register. An unregistered `design_export_mp4` file cannot be attached by id,
so it cannot go on a post, into a collection, or into a report. Register it with
`media_library_register_external_url` (or `marketing_media_register_external_url`), then `media_update` for
a real name and tags, `media_folders_list` / `media_folder_create` to file it, and `media_collections_list`
/ `media_collection_create` / `media_collection_add_item` to group a campaign's assets.
`media_library_register_external_url_batch` covers several variants from one session.

Then close the loop on the design: call `design_update` a second time with `previewVideoUrl` set and
`canvasData` omitted, so the design autoplays in the gallery instead of showing a still. A
`design_export_image` PNG makes a good `featuredImageUrl` and post cover, and needs registering too.

**Lane 2** output comes out of the pipeline as video clips, which the rule above says auto-register - but
verify rather than assume: run `media_library_list` (or `marketing_media_list`) after the pipeline completes
and confirm the asset is there before telling anyone it is. If it is not, register it the same way as
lane 1.

**Imported footage** comes in through `media_library_register_external_url`, `media_upload`, or
`marketing_media_upload_base64`. Import is never a production credit.

Attaching, once registered: social posts via `social_create_post` / `social_update_post` with `media_urls`,
targeting connected accounts from `social_list_accounts` (the social lane's rules still apply - setting
`scheduled_at` is publishing on a timer, and no tool can approve a post); cross-channel via `content_create`.
Decisions worth keeping (aspect ratio, the animation style signed off, the storyboard template that worked)
go to `memory_create`, production work items to `pm_tasks_create`. `media_usage_get` says where an asset is
used; `media_delete` on one a live post depends on breaks that post silently, so confirm it.

Naming caution: `marketing_design_*` runs parallel to `design_*` (list, get, export_image, export_mp4) and
`marketing_media_*` parallel to `media_library_*`. Prefer `design_*` and `media_library_*`, verify which set
this account exposes, and use `list_departments` when a call might fail for entitlement reasons.

---

## 6. Capability gaps - name the gap and the fallback, never improvise

- **No agent approval of a storyboard.** By design. Fallback: `marketing_storyboard_submit_for_approval`
  and stop, with the scene, runtime, and cost summary.
- **No voiceover, music, or audio tool** in the registry. A custom VO or licensed track is a
  produce-outside-and-import job via `media_library_register_external_url` or `media_upload`. Do not tell a
  client the system will narrate their video.
- **No trim, crop, concatenate, or transition tool for arbitrary MP4s.** Sequencing and transitions exist
  only inside a lane 2 storyboard (`transition`, `transition_ms`, per-scene `camera`). A clip that needs
  recutting is rebuilt as a storyboard or a design, or handed back as a dashboard job.
- **No keyframes or custom easing on the canvas.** The 17 presets plus `delay_ms` and `duration_ms` are all
  there is.
- **No progress readout and no cancel** for `design_export_mp4` or `design_video_rerender`. Only lane 2 has
  `marketing_video_pipeline_status` and `marketing_video_pipeline_cancel`.
- **No burned-in captions outside a storyboard.** `captions.style` is a storyboard field; animating your own
  text layers in a lane 1 design is not the same thing.
- **No `creative` domain.** `branding` is the visual lane on both `account_context_get` and
  `talk_to_department`; `customer_avatar`, `before_after_grid`, and `website_design` are the other valid
  visual-adjacent domains.
- **`stock_photos_search` saves nothing**, and `stock_photos_download` is the website-project lane only
  (`{ url, project_id, save_path }`, writing to that project's S3 assets, NOT the media library). A stock
  still bound for a video must be registered into the library explicitly.

---

## Tool names referenced (all grounded in `creative-grounding.md`, `domains-truth.md`, or the verified `hiveku-social-agency/SKILL.md`)

**Design canvas / lane 1:** `design_create`, `design_update`, `design_state_get`, `design_get`,
`design_templates_list`, `design_version_create`, `design_versions_list`, `design_export_image`,
`design_export_mp4`, `design_video_rerender`; parallel naming noted as `marketing_design_*` (list, get,
export_image, export_mp4).

**Storyboard and pipeline / lane 2:** `marketing_storyboard_create`, `marketing_storyboard_get`,
`marketing_storyboard_update`, `marketing_storyboard_set_look`, `marketing_storyboard_submit_for_approval`,
`marketing_storyboard_delete`, `marketing_video_pipeline_start`, `marketing_video_pipeline_status`,
`marketing_video_pipeline_retry_scene`, `marketing_video_pipeline_cancel`.

**Generation / lane 3 and images:** `marketing_generate_video`, `generate_image`, `generate_image_set`,
`stock_photos_search`, `stock_photos_download`.

**Media library:** `media_library_list`, `media_library_register_external_url`,
`media_library_register_external_url_batch`, `media_upload`, `media_update`, `media_delete`,
`media_usage_get`, `media_folders_list`, `media_folder_create`, `media_collections_list`,
`media_collection_create`, `media_collection_add_item`; parallel `marketing_media_list`,
`marketing_media_register_external_url`, `marketing_media_upload_base64`.

**Context and departments:** `account_context_get`, `talk_to_department`, `list_departments`.

**Downstream attach and persistence:** `social_create_post`, `social_update_post`, `social_list_accounts`,
`content_create`, `memory_create`, `pm_tasks_create`.

## Notes on constraints

- The three star-marked rules are carried verbatim: the `design_state_get` round-trip rule (2.3), THE AGENT
  CANNOT APPROVE (3.3), and the auto-register rule (5). The first is worded in the grounding file as "This
  is the read half...", so the section heading names `design_state_get` and the star line is left untouched.
- Capabilities with no tool are named as gaps with fallbacks (section 6): storyboard approval, audio/VO,
  MP4 editing, keyframes, render progress/cancel, captions outside a storyboard, and the `creative` domain.
- `marketing_generate_video` and its quota/dry_run behavior come from the verified social SKILL.md Play 4,
  not from the grounding file, which does not cover lane 3; everything else traces to the grounding file.
