# The Layered Design Canvas

This is the manual behind the creative skill's one-line advice about designs. It covers the Fabric.js
object model a Hiveku design is made of, composing an artboard that reads at thumbnail size, the
read-then-write round-trip that keeps a human's edits alive, versioning before destructive work, starting
from the template library, artboard sizing per platform, exporting frames and MP4s, and the failure modes
that make a design silently wrong. Load it before you create, edit, restyle, animate, or export ANY
design, and before you promise a client a carousel, a Reel, or a branded graphic.

Why it needs a manual: this is the one place where Claude and the human write to the SAME object, the
`canvasData` column. A careless write does not error; it silently destroys an hour of someone's work.

## Part 1: The non-negotiables

- **D1. Editable beats flat.** If the user will ever want to tweak it, it belongs in a design project
  (`design_create`), not a one-off PNG from `generate_image`. Hand back the `dashboardUrl` every time.
- **D2. ★ This is the read half of the round-trip: always state_get -> reason -> update. Never author a
  full canvas blind over the top of a user's edits.**
- **D3. Snapshot before destructive edits** with `design_version_create`, so the user can roll back from
  the dashboard's Version History panel. Restyles, re-layouts, deletions, and artboard changes count.
- **D4. Start from `design_templates_list`, not a blank artboard.** Its 52 templates come back
  brand-substituted with the account's active brand guide. A blank artboard means you pick the colors and
  fonts, which means off-brand.
- **D5. ★ Generated images and video clips auto-register. Design exports and stock-photo URLs do NOT -
  register those explicitly before attaching them anywhere.**
- **D6. Confirm before anything billable or blocking.** `design_export_mp4` and `design_video_rerender`
  block 240s; `generate_image` and `generate_image_set` cost money.
- **D7. ★ THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.** A multi-scene video is
  `marketing_storyboard_create`, not this lane, and it stops at the human gate.
- **D8. One write path.** `design_update` with `canvasData` REPLACES the canvas wholesale. There is no
  per-layer patch tool in the grounded surface, so the merge happens in your context, not on the server.
- **D9. Never invent a Fabric property.** Anything outside the Part 2 vocabulary (gradients, shadows, clip
  paths, blend modes) is unverified: copy the shape a template emits, or use a Part 2 fallback.

## Part 2: The object model

A canvas is Fabric.js JSON: `{ version, objects: [...], background }`. `objects` is the layer stack.

**Layer types.** Shapes: `rect`, `circle`, `triangle`, `polygon`, `path`, `line`. Text: `textbox` (wraps)
or `i-text` (one line), with `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `charSpacing`. Images:
`type: 'image'` with `src`. Groups, for elements that move and scale as one unit: a logo lockup, a badge.

**Position and transform.** `left`, `top`, `angle`, `scaleX`, `scaleY`, in artboard pixels, origin
top-left. Scale is a MULTIPLIER on intrinsic size, not a target size: an image 2400px wide sitting
full-bleed on a 1080px artboard needs `scaleX: 0.45, scaleY: 0.45`, not `1080`. Swap an image `src` and
the new file's intrinsic size is almost never the old one's, so recompute the scale or the swap looks
like a rendering bug rather than the authoring mistake it is.

**Styling.** `fill`, `stroke`, `strokeWidth`, `opacity`. That is the whole grounded set: no gradient,
shadow, blur, or mask. Fallbacks inside the vocabulary: a gradient scrim behind text on a photo is two or
three `rect` layers of one `fill` at descending `opacity` (0.55, 0.35, 0.15); a text drop shadow is a
duplicate of the text layer offset 3-5px, dark `fill` at `opacity` 0.35, placed BELOW the real text;
outline text is `stroke` plus `strokeWidth`. For anything else, copy the shape a real payload emits
(`design_templates_list` or `design_get`), or say the effect is a dashboard-editor job.

**Layer ordering is `objects[]` order.** `objects[0]` is the bottom, the last element is on top. There is
no `zIndex`; reordering means moving the element in the array. Canonical stack, bottom to top:

```
background fill/photo -> scrim -> supporting shapes -> imagery -> body text -> headline -> logo/CTA
```

**Per-layer motion.** Any layer may carry
`"animation": { "preset": "fade-up", "delay_ms": 300, "duration_ms": 600 }`. `duration_ms` is optional.
`preset` is exactly one of:

```
fade-in, fade-up, fade-down, fade-left, fade-right, scale-in, pop,
slide-up, slide-down, slide-left, slide-right, wipe-up, wipe-down,
pulse, wiggle, rotate-slow, breathe
```

Nothing outside that list; a misspelled preset is a silent no-motion. Three families: ENTRANCES fire once
then hold (`fade-*`, `slide-*`, `scale-in`, `pop`, `wipe-*`) and carry the reveal, so everything a viewer
must read gets one and nothing else; AMBIENTS run continuously (`pulse`, `breathe`, `rotate-slow`,
`wiggle`) and belong on a background, a badge, or one accent, and two on an artboard is already noise;
EMPHASIS is `pop` or `pulse` on the CTA, once, after everything else has landed.

**Canvas-level motion** sits on the root: `"_animation": { "duration_ms": 6000, "fps": 30, "loop": true }`.
This is what `design_export_mp4` renders and what `design_export_image({ frame })` indexes into, via
`frame = seconds * fps`: at `fps: 30`, frame 60 is 2.0s. **Every entrance must finish before
`duration_ms`.** The last-firing layer's `delay_ms + duration_ms` should land by roughly 60 percent of the
runtime so the held frame can be read. A headline still fading in when the loop restarts is never read.

## Part 3: Composing an artboard that works

Every design here is consumed at thumbnail size on a phone, in a feed, next to competing content.

**Hierarchy: three levels, no more.** Hook, support, action. The eye goes to the highest-CONTRAST element,
not the largest. If two compete for first read the design has no hierarchy, and the fix is to demote one,
not enlarge the other. Whitespace around the hook beats another 20px of `fontSize`.

**Margin and spacing unit.** Set a margin at 6 to 8 percent of the artboard's SHORT edge (64 to 88px on
1080 wide) and put nothing outside it except a deliberate full-bleed image. Every text layer's `left`
starts at the margin; right-aligned elements end at `artboardWidth - margin`. Pick ONE spacing unit (24px
on a 1080 artboard) and make every gap a multiple of it.

**Type scale.** Pick a ratio between 1.25 and 1.5 and derive everything from body size. On 1080 wide:

| Role | fontSize | lineHeight |
|---|---|---|
| Hook / headline | 72-120 | 1.05-1.15, `fontWeight` 700+ |
| Subhead | 40-56 | 1.2 |
| Body | 28-36 | 1.4-1.5 |
| Caption / legal | 20-24 | Floor. Below this nothing is read on a phone |

Tighten `lineHeight` as `fontSize` rises. Small positive `charSpacing` on all-caps labels, never on body.
Two type sizes reads as deliberate; five reads as a document. Take `fontFamily` from a template or the
brand guide: the grounding does not say which families the render worker has installed, so an arbitrary
family may silently fall back and the export will not match the editor. Check any new one with
`design_export_image({ id, frame: 0 })` before shipping.

**Contrast.** 4.5:1 for body text against what is directly behind it; 3:1 for large text (roughly 24px+
bold or 30px+ regular at these scales). Text over a photograph fails by default, because a photo is not
one color: use the stacked-rect scrim and check the darkest-to-lightest range of the region the text
covers, not the average. A palette swap silently breaks contrast, so re-check after one.

**Brand palette.** Pull real values, do not eyeball them: `brand_guide_get` (found via `brand_guide_list`)
for the tokens, `account_context_get({ domain: 'branding' })` for the visual system, persona, and rules.
That is the visual-system domain. **There is no `creative` domain.** For concepting,
`talk_to_department({ domain: 'branding' })` runs the visual department agent with full hydration; persist
the chosen output with `design_create` or `design_update`. Apply roughly 60 percent dominant, 30
secondary, 10 accent, and use the accent ONCE per artboard, on the thing you want clicked. Logos come from
the brand guide's asset, not a redraw. `brand_guide_set_logo` maintains the brand guide, NOT the canvas:
putting a logo on an artboard means setting an image layer's `src`, registered first with
`media_library_register_external_url` or `media_upload` if it is not already in the library.

## Part 4: The round-trip protocol

1. **`design_state_get({ id })`.** A human-readable plus structured summary: element-by-element position,
   size, style, text, and animation, a one-line summary, and `featuredImageUrl` when a preview thumbnail
   exists. Reason over this compact view, not raw Fabric JSON.
2. **Diff in your head.** Name every layer you will change, every layer you will keep, and every layer a
   HUMAN put there. Those are the ones you risk deleting.
3. **If the compact view cannot faithfully reconstruct a layer,** fall back to `design_get({ id })` for
   the raw `canvasData` and mutate the object in place: `path` layers, grouped lockups, anything carrying
   properties outside the Part 2 vocabulary. `design_get` is the escape hatch, not the default.
4. **`design_version_create({ id, versionName, changeSummary, isMilestone })`** before anything
   destructive. Use `isMilestone: true` for save points a client would return to ("Pre-rebrand",
   "Client-approved v2"). `design_versions_list` reads the index.
5. **`design_update({ id, canvasData })`.** The dashboard editor reads from the same column, so the user's
   later edits are preserved on the next save. The hazard is the corollary: your write is authoritative
   over everything in that column right now.
6. **Hand back the `dashboardUrl`.** The deliverable is the editable design, not the JSON or the PNG.

**Metadata updates are safe and separate.** `title`, `description`, `status`, `tags`, `featuredImageUrl`,
and `artboard` update independently of the canvas. A `design_update` omitting `canvasData` touches no
layers, so it is how you retitle, retag, or restatus a design a human is actively editing.

**Be honest about rollback.** `design_version_create` writes the snapshot and `design_versions_list` reads
the index, but no grounded tool RESTORES one: restoring is a human action in the dashboard's Version
History panel. Skip the snapshot and there is no rollback for anyone. Your fallback is keeping the
pre-edit `design_get` payload in context so a second `design_update` can re-apply it. Likewise **no design
DELETE tool appears in the grounded surface** - removing a design is a dashboard action.

## Part 5: Templates and artboard sizing

`design_templates_list` takes no arguments and returns the 52-template library brand-substituted with the
account's active brand guide, plus artboard size presets grouped by category (Social Media, Presentation,
Print, Ads, Email). Each template carries a ready-to-use `canvasData` payload: pipe it into
`design_create`'s `initialCanvasData`, then swap text and imagery. It is also the reference for how the
platform structures a group, a path, or a text layer. `design_list` reads existing designs; check there
for something to reuse first.

**Prefer the presets that tool returns over the table below,** which is guidance for when none matches:

| Use | Artboard | Notes |
|---|---|---|
| Instagram / Facebook feed square | 1080 x 1080 | Safe everywhere |
| Instagram feed portrait, carousel | 1080 x 1350 | Most feed real estate. Carousel default |
| Reels, TikTok, Stories | 1080 x 1920 | 9:16 |
| LinkedIn feed | 1200 x 627, or 1080 x 1350 | Portrait outperforms in-feed |
| X | 1600 x 900 | |
| Google Business Profile post | 1200 x 900 | Legible text, one clear subject |
| Presentation slide | 1920 x 1080 | |
| Email header | 1200 x 600 | Assume it renders at half width |

**Safe areas.** Platform chrome covers your artboard; these are approximations that shift with app
versions. On 9:16 (Reels, TikTok, Stories) budget the top 250px for status and header UI, the bottom 400
to 480px for caption, handle, and CTA furniture, and the right 180 to 200px for the action rail, leaving
roughly x 88-880, y 250-1440 on 1080 x 1920 as the trustworthy zone. On feed portrait the grid thumbnail
crops, so keep subject and hook centered. On a carousel, never bleed an image across a slide boundary.
The Part 3 margin is the floor; the safe area sits INSIDE it, never instead of it.

**One design is one artboard.** `design_create` takes a single `artboard` and nothing in the grounded
surface describes a multi-page design object, so a five-slide carousel is five designs unless a
`design_templates_list` carousel template's `canvasData` proves otherwise. Check before assuming.

## Part 6: Exporting

`design_export_image({ id, canvas_json, frame })` flattens a design to a PNG through the Remotion worker,
using the same CanvasComposition the MP4 path uses, so `frame: 0` matches what `canvas.toDataURL` produces
in the dashboard editor. For a motion design, `frame` captures a moment: at `fps: 30`, `frame: 60` is 2s
in. **That makes `frame` your cheap preview:** before an MP4, export two or three frames across the
timeline (0, 45, 120) and check that the stagger reads and nothing is occluded mid-flight.

`design_export_mp4` renders a motion design to MP4 or GIF. Pass the full `canvas_json` snapshot the user
has been editing, with per-layer `animation` metadata; the worker uses the same animation vocabulary as
the editor, so the output matches the in-browser preview exactly. It is SYNCHRONOUS, blocks up to 240s,
and refuses early if the canvas has no objects. The social lane's call shape is
`design_export_mp4({ id, canvas_json, width, height, duration_seconds })`. Confirm first and say it takes
up to four minutes. `design_video_rerender({ id, template_id, props })` re-renders one Remotion-template
clip inside a design and swaps the MP4 in place; it blocks 240s too.

**Then register the output.** ★ Generated images and video clips auto-register. Design exports and
stock-photo URLs do NOT - register those explicitly before attaching them anywhere. Use
`media_library_register_external_url` for one file or `media_library_register_external_url_batch` for a
carousel's worth in one call. An unregistered export has no media asset id, cannot be attached by id
downstream, and the URL in your hand is its only handle.

## Part 7: Failure modes

- **The 10MB body cap on `design_update`.** Base64 data URIs in image `src` blow it fast: three full-bleed
  photos will do it. Reference images by URL from the media library, and split heavy concepts.
- **`previewVideoUrl` ONLY fires when `canvasData` is omitted.** Setting the autoplay thumbnail is
  therefore always a SECOND `design_update` carrying `previewVideoUrl` and no canvas. Send both in one
  call and the preview silently does not take, with no error.
- **Exports do not auto-register** (Part 6). The most common way a finished asset becomes unattachable.
- **`design_*` versus `marketing_design_*`.** A parallel naming exists (`marketing_design_list`,
  `marketing_design_get`, `marketing_design_export_image`, `marketing_design_export_mp4`, and
  `marketing_media_list` / `_get` / `_folders` / `_register_external_url` / `_upload_base64`). Verify
  which the account exposes; prefer `design_*`. The parallel design set is read and export only.
- **`stock_photos_download` is the WEBSITE-PROJECT lane only** (`{ url, project_id, save_path }`, into that
  project's S3 assets, NOT the Media Library), so it cannot get a photo onto a canvas. `stock_photos_search`
  SAVES NOTHING. The canvas path is search, `media_library_register_external_url` on the returned `url`,
  reference that in an image layer, and carry the `attribution`.

## Part 8: Worked plays

### Play A: build a 5-slide carousel

1. `account_context_get({ domain: 'branding' })` and `brand_guide_get` for the brand.
2. `design_templates_list`. Take a Social Media template already substituted with this brand, and its
   artboard preset (1080 x 1350 unless the client's feed says otherwise).
3. **Confirm the outline before building anything.** Five slides is hook, three value beats, CTA. Draft
   the copy with `talk_to_department({ domain: 'social' })` or `{ domain: 'content' }`, present the
   outline, get a yes. Five designs off an unapproved outline is five you throw away.
4. Five `design_create` calls, one per slide, each with the template's `canvasData` as
   `initialCanvasData`, text and imagery swapped. Title them so order survives ("Carousel <topic> - slide
   1 of 5") and tag all five identically; `design_list` is your only grouping read.
5. Keep slide-invariant layers byte-identical across all five (same margin, `fontSize`, logo `left`/`top`,
   background): a carousel reads as a set only if the frame does not move. Slide 1 carries the hook alone
   and earns the swipe, slides 2 to 4 one idea each, slide 5 one CTA.
6. `design_export_image({ id, frame: 0 })` per slide, look at all five together at thumbnail size, then
   `media_library_register_external_url_batch` in slide order.
7. Hand back the five `dashboardUrl`s in slide order. Handoff to the social lane is `social_create_post`
   with `media_urls` in that order, under that lane's confirm rules.

### Play B: restyle a design to a new brand

1. `brand_guide_get` for the NEW brand, plus `account_context_get({ domain: 'branding' })`, then
   `design_state_get({ id })` to inventory every layer's `fill`, `stroke`, and `fontFamily`.
2. **Build the mapping table and get a yes on it:** old hex to new hex, old family to new family, old logo
   to new logo. It is far cheaper to correct a table than a canvas.
3. `design_version_create({ id, versionName: 'Pre-rebrand', changeSummary, isMilestone: true })`, then
   `design_get({ id })` for raw `canvasData` if any layer is a `path`, a group, or carries properties
   outside the Part 2 vocabulary.
4. Mutate ONLY color, stroke, and font. Do not re-lay-out in the same pass: that is two changes, and when
   it looks wrong you cannot tell which did it. Re-layout is a second, separately confirmed edit.
5. Swap the logo layer's `src` to the new brand's logo, registered with
   `media_library_register_external_url` or `media_upload` first if needed, and recompute `scaleX`/`scaleY`
   for its new intrinsic size.
6. **Re-check contrast.** The new palette will have broken at least one pairing. Fix it, then
   `design_update({ id, canvasData })`, `design_export_image({ id, frame: 0 })`, and hand back the
   `dashboardUrl` with the before and after.

### Play C: animate a static design for a Reel

1. **Fix the artboard first.** A 1080 x 1080 feed graphic is not a Reel. Create a NEW design at 1080 x
   1920 so the feed version survives (preferred), or change `artboard` with a metadata-only
   `design_update` and re-lay-out. Re-check the Part 5 safe area: a CTA that sat at the bottom of a square
   lands under the caption furniture in 9:16.
2. `design_state_get({ id })` for the layer inventory and z-order, then `design_version_create` if this is
   an existing design rather than a fresh one.
3. Add `animation` bottom-up, in `objects[]` order, so the reveal follows the eye:
   - background `{ preset: 'fade-in', delay_ms: 0, duration_ms: 400 }`, or `breathe` for a slow ambient
   - hero image `{ preset: 'scale-in', delay_ms: 200, duration_ms: 600 }`
   - headline lines `fade-up`, staggered 120 to 180ms apart starting around 500ms
   - body `fade-up` after the headline lands
   - CTA and logo last, `pop` or `fade-up`, then at most one `pulse`
4. Root: `_animation: { duration_ms: 6000, fps: 30, loop: true }`. Verify the last layer's
   `delay_ms + duration_ms` lands by about 3.5s so the finished frame holds before the loop restarts.
5. Preview cheaply with `design_export_image({ id, frame: 45 })` (1.5s at 30fps) and `frame: 120` (4s),
   then `design_update({ id, canvasData })`.
6. **Confirm, then render.** `design_export_mp4({ id, canvas_json, width: 1080, height: 1920,
   duration_seconds: 6 })`. Say it blocks up to 240s before you start.
7. `media_library_register_external_url` on the MP4. It did not auto-register. Optional autoplay
   thumbnail: a SECOND `design_update({ id, previewVideoUrl })` with NO `canvasData`. Hand back the
   `dashboardUrl`.
8. If the client described a multi-shot Reel with voiceover, b-roll, and scene transitions, this is the
   wrong lane: `marketing_storyboard_create` (exactly one of `template_id` plus `substitutions`, or a
   hand-authored `storyboard`), read back with `marketing_storyboard_get`, fixed with
   `marketing_storyboard_update` on `validation.errors`, restyled with `marketing_storyboard_set_look`,
   then `marketing_storyboard_submit_for_approval`.
   ★ THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.

---

## Notes for the assembling agent (not part of the reference file)

File on disk: `/private/tmp/claude-501/-Users-aberubarts-Documents-main-hiveku/30c385fb-6c1e-4ade-8eb0-b3167903d1e5/scratchpad/layered-design-canvas.md`

- **Size is 21.1KB, about 5 percent over the 12-20KB ceiling.** I cut it from an initial 27.6KB. Everything left is coverage the brief asked for by name. If you need it under 20KB, the two cheapest remaining cuts are the `design_*` vs `marketing_design_*` bullet in Part 7 (~600 bytes, a naming-verification note, not one of the three required failure modes) and the `stock_photos_download` bullet (~560 bytes, arguably belongs in a sibling images/media reference).
- **Deliberately deferred to a sibling reference, not forgotten:** the "reuse before generating" doctrine (grounding doctrine 6) and the media-library housekeeping tools (`media_library_list`, `media_library_get`, `media_folders_list`, `media_collections_list`, `media_usage_get`, `media_delete`, `media_update`). I cut them for budget since this reference is the canvas, not the asset library. Re-add a one-line pointer if no images reference will carry them.
- **Capabilities I flagged as having no tool, with the fallback named** (per your rule): no per-layer patch (full `canvasData` replacement only, merge in context); no version RESTORE tool (dashboard Version History; fallback is holding the pre-edit `design_get` payload); no design DELETE tool (dashboard action); no gradient/shadow/blur/mask in the Fabric styling set (stacked-rect scrim, duplicated offset text layer, `stroke` outline, or say it is a dashboard-editor job); no multi-page design object (one design per artboard, so a carousel is N designs).
- **Star rules preserved verbatim**, each appearing in Part 1 and repeated at its point of use: D2 (state_get round-trip), D5 (auto-register, repeated in Part 6), D7 (agent cannot approve, repeated in Play C step 8). Five `★` occurrences total.
- Cross-checked against `domains-truth.md`: only `branding`, `social`, and `content` are used with `talk_to_department`, all three valid there; `branding` is valid for `account_context_get`. The reference states outright that there is no `creative` domain.
- No frontmatter, no emojis, no em dashes. Opens with what it covers and when to load it, matching the house style of `hiveku-web-agency/references/forms.md`.
