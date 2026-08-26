---
name: hiveku-creative-agency
description: Full creative-studio methodology for operating a Hiveku account's visual output. Trigger on ANY design or creative work - design, graphic, creative, ad creative, social graphic, carousel, thumbnail, banner, poster, motion graphic, animated post, video, Reel, TikTok, promo, explainer, testimonial video, listing tour, storyboard, brand assets, logo, brand guide, image generation, stock photo, media library, before/after grids, and any request to make, edit, restyle, resize, animate, export, or hand off a visual asset.
---

# Hiveku Creative Agency Operating System

Run this account's creative like a studio on retainer: brand loaded before the first pixel,
assets reused before anything is generated, every deliverable landing as something the
client can edit. Every tool named below is a real Hiveku MCP tool.

## The operating model

**Claude is the worker. The Hiveku dashboard is where the human sees and edits.**

A flat PNG pasted into chat is a dead end - the client cannot move the headline, swap the
photo, or fix the color. A design project is alive: it opens in the dashboard editor and
every layer is selectable. So creative lands as an **editable, layered design project**, and
you **hand back the `dashboardUrl`** that `design_create` returns. A response that ends
without a dashboard URL has not delivered anything.

The canvas is Fabric.js JSON, and its layer model is your vocabulary: shapes, text as real
textbox / i-text layers, images, groups, stacking via `objects[]` order, per-layer motion as
`animation: { preset, delay_ms, duration_ms? }`, canvas motion as `_animation: {
duration_ms, fps, loop }` on the root (every field and all 17 presets in
`references/design-canvas.md`). Copy baked into an image is a dead asset.

## Context first, and there is no creative domain

`account_context_get({ domain: 'branding' })` before any concept, layout, or prompt - it
returns persona, brand voice, avatars, memory, skills, and rules. **There is NO `creative`
domain** on either domain-taking tool; `branding` is the visual-system domain, and an
unlisted value is a server-side rejection, not a soft fallback. Concept and art direction go
to `talk_to_department({ domain: 'branding', message })` (`before_after_grid` and
`customer_avatar` are also valid there). If this tenant has no branding department
(`list_departments` says what it has), do not substitute an unrelated one: load a valid
`account_context_get` domain, use `agent_identity_get` for the identity bundle, draft
directly, and say so. Read the brand system with `brand_guide_list` / `brand_guide_get`
before inventing one; write with `brand_guide_create` / `brand_guide_update` /
`brand_guide_set_logo` once the client agrees. `brand_guide_delete` / `brand_guide_purge`
are destructive.

## The decision ladder

Stop at the first rung that fits. Reaching for rung 3 when rung 1 would have worked is how
accounts pay for imagery they already own.

**1. Reuse.** `media_library_list`, `media_library_get`, `media_folders_list`,
`media_collections_list`. The account's real photos of product, team, storefront, and
finished work beat AI every time, and generation costs money.

**2. One-off image.** A single visual with no copy, no layout, no future edits.
`generate_image` for one, `generate_image_set` for up to 10 prompts sharing one brand
context (per-prompt failures land in `errors[]` rather than failing the batch - read it).
Both are brand-aware and auto-register a media asset, returning `media_asset_id`. This rung
supplies ingredients: once copy, logo, or layout is involved, it is a rung 3 layer.

**3. Editable design project.** The default for anything the client will ever tweak: social
graphics, carousels, thumbnails, banners, posters, ad creative, one-pagers.
`design_templates_list` first - 52 templates already brand-substituted with the account's
brand guide, plus artboard presets, each carrying a ready-to-use `canvasData` payload you
pipe into `design_create`'s `initialCanvasData`. Then `design_create({ title, designType,
artboard, initialCanvasData, description, tags })` and hand back the `dashboardUrl`. A
carousel is N artboards or N sibling designs; there is no carousel object.

**4. Motion design.** Branded cards, type, and layout that move - animated posts, logo
stings, kinetic quotes. Same design project plus per-layer `animation` and root `_animation`,
rendered with `design_export_mp4` (MP4 or GIF). No generation cost, and the worker shares the
editor's animation vocabulary so output matches the in-browser preview. SYNCHRONOUS, blocks
up to 240s, refuses early on an empty canvas - say what you are doing before starting one.
`design_export_image({ id, canvas_json, frame })` checks one moment; `design_video_rerender`
re-cuts a Remotion-backed clip in place.

**5. Multi-scene video.** Reel, TikTok, promo, explainer, testimonial, listing tour -
anything more than one shot. `marketing_storyboard_create` is the entry point and it is FREE
AND FAST: it validates, prices, and stores, and NOTHING is reserved, billed, or enqueued
until a human approves. Pass EXACTLY ONE of `storyboard` (hiveku.storyboard.v1) OR
`template_id` with `substitutions`; there is no `look` block on create, so restyle with
`marketing_storyboard_set_look` after. Then `marketing_storyboard_submit_for_approval` and
STOP. See `references/video.md`.

**6. Stock.** Only when the account owns nothing usable and generation is wrong for the
subject. `stock_photos_search` returns `{ url, thumbnail, photographer, source, attribution }`
and **SAVES NOTHING**. `stock_photos_download` is the WEBSITE-PROJECT lane only - it needs
`{ url, project_id, save_path }` and writes into that project's S3 assets, NOT the Media
Library. The fallback is `media_library_register_external_url` (or `_batch`) on that `url`.

No tool covers these, so do not promise them: nothing **draws** a logo -
`brand_guide_set_logo` only stores one, so a logo is designed on rung 3 or 2 and then set.
Nothing approves a storyboard. Nothing attaches a design to a post by itself.

## Round-trip discipline

The human edits the same canvas you write to. `design_update` overwrites `canvasData`
wholesale and the dashboard editor reads that same column, so a blind full-canvas author
over someone's afternoon of edits destroys it silently. The loop is always
`design_state_get` -> reason -> `design_update`: `design_state_get` returns a compact
element-by-element summary (position, size, style, text, animation, plus `featuredImageUrl`
when a preview exists), so use `design_get` only when you need the raw Fabric JSON.

★ This is the read half of the round-trip: always state_get -> reason -> update. Never
author a full canvas blind over the top of a user's edits.

Snapshot before any large or destructive edit: `design_version_create({ id, versionName,
changeSummary, isMilestone })` writes into design_versions so the user can roll back from the
Version History panel, and `design_versions_list` reads them back. A parallel
`marketing_design_*` naming exists - verify which this account exposes; prefer `design_*`.

## Doctrine (the seven rules this discipline runs on)

1. **Editable beats flat.** If the user will ever want to tweak it, it belongs in a design
   project (`design_create`) - not a one-off generated PNG. Hand back the `dashboardUrl`
   every time.
2. **Round-trip, never clobber.** `design_state_get` -> reason -> `design_update`. The
   human edits the same canvas; a blind full-canvas overwrite destroys their work.
3. **Snapshot before destructive edits** with `design_version_create` so the user can roll
   back from the dashboard's Version History panel.
4. **The agent cannot approve a storyboard.** Create, submit, stop. Nothing bills until a
   human says yes, and that gate is a feature.
5. **Register what does not auto-register**, or the asset cannot be attached by id later.
6. **Reuse before generating** - the account's real photos beat AI for products, team, and
   location, and generation costs money.
7. Confirm before anything irreversible or billable; MP4 renders block up to 240s, so say
   what you are doing before you start one.

★ Generated images and video clips auto-register. **Design exports and stock-photo URLs do
NOT** - register those explicitly before attaching them anywhere.

★ "**THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.**"

## Campaign cadence

1. **Brief and brand load** - channel, artboard size, message, CTA, and who signs off, then
   `account_context_get({ domain: 'branding' })` plus `brand_guide_get`.
2. **Inventory and concept** - `media_library_list` and `media_collections_list` for what
   exists, then `talk_to_department({ domain: 'branding', message })` for one direction
   across the whole set.
3. **Build** - `design_templates_list` for the closest brand-substituted start, then
   `design_create` per artboard. Resize variants are siblings sharing the system.
4. **Hand off** - the `dashboardUrl` for every design, one line each on what it is and what
   is easy to change. This is the deliverable.
5. **Revise** - `design_state_get` -> reason -> `design_update`, snapshotting with
   `design_version_create` ahead of anything structural.
6. **Export and register** - `design_export_image` or `design_export_mp4`, then
   `media_library_register_external_url` for an id, then `media_folder_create` /
   `media_collection_add_item` / `media_update` to file and tag it.
7. **Ship** - hand the registered asset to the consuming lane (the social lane attaches it
   on `social_create_post`); check `media_usage_get` before any `media_delete`.

Weekly, sweep `design_list` for designs left mid-revision and storyboards still unapproved -
an unapproved board is a deliverable that is not shipping. Monthly, audit the Media Library
for unregistered exports and refresh proof via `before_after_grid_list` / `_populate`.

## Reference map

- `references/design-canvas.md` - layer model and presets in full, artboard and safe-area
  sizes per channel, template selection, composition, carousels, export and versioning.
- `references/video.md` - storyboard shape, genre templates and slots, styles and profiles,
  the validation loop through `marketing_storyboard_update`, the approval gate, the
  `marketing_video_pipeline_start` / `_status` / `_cancel` / `_retry_scene` pipeline, and
  the paid single-clip lane and its dry-run discipline.
- `references/brand-and-assets.md` - brand guide and logo rules, the Media Library model
  (folders, collections, tagging, external-URL registration, usage checks before deletion),
  brand-aware prompting, stock attribution, and before/after grids.
