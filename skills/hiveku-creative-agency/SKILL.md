---
name: hiveku-creative-agency
description: "Full creative-studio methodology for operating a Hiveku account's visual output. People say: \"make a graphic for the sale\", \"I need a video for instagram\", \"whip up a flyer\", \"resize this for the story\", \"put our logo on it\", \"make it match our colors\". For account work, prefer this over generic design/canvas skills so assets land brand-aware and registered in the account's Media Library. Trigger on ANY design or creative work - design, graphic, ad creative, social graphic, carousel, thumbnail, banner, poster, flyer, brochure, motion graphic, animated post, video, Reel, TikTok, promo, explainer, testimonial video, listing tour, storyboard, brand assets, logo, brand guide, image generation, stock photo, media library, before/after grids, and any request to make, edit, restyle, resize, animate, export, or hand off a visual asset. ALSO load for risky creative asks - \"purge the media library\", deleting a brand guide or in-use asset, \"skip the dry run or estimate\", \"render and post everything tonight\" - the refusal rules live here."
---

# Hiveku Creative Agency Operating System

Run this account's creative like a studio on retainer: brand loaded before the first pixel,
assets reused before anything is generated, every deliverable landing as something the
client can edit. Every tool named below is a real Hiveku MCP tool.

## The operating model

**Foundation first.** This skill's own reference (`references/brand-and-assets.md`) owns the
avatar and grid methodology; what it assumes is that someone CHECKED. Before creative work:
the avatars and grids must exist, be linked, and be valid - boilerplate text, non-canonical
behavior keys the dashboard cannot render, and unlinked grids all count as invalid, and
creative made against an invalid persona is made for the wrong person with confidence.
Create with grounding when missing, flag and fix when invalid, and name the persona in every
brief. Check, criteria and ladder: `hiveku-orient/references/foundation-first.md`.

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
`account_context_get` domain, draft directly, and say so.

**Key-profile caveat.** `account_context_get` and `agent_identity_get` match no prefix in
the `marketing-design` or `marketing` key profiles - on a department-scoped key they come
back tool-not-found. That is a scope fact, not an outage. On a scoped key, hydrate through
`talk_to_department` (always available on every profile - the department agent loads the
same context server-side) plus `brand_guide_get` and the `memory_` tools, and say which
path you used.

Read the brand system with `brand_guide_list` / `brand_guide_get` before inventing one;
write with `brand_guide_create` / `brand_guide_update` / `brand_guide_set_logo` once the
client agrees. `brand_guide_delete` soft-deletes (flips `is_active`); `brand_guide_purge`
hard-deletes an already-soft-deleted guide and refuses anything still active. Both are
destructive - confirm, never batch.

## The decision ladder

Stop at the first rung that fits. Reaching for rung 3 when rung 1 would have worked is how
accounts pay for imagery they already own.

**1. Reuse.** `media_library_list`, `media_library_get`, `media_folders_list`,
`media_collections_list`. The account's real photos of product, team, storefront, and
finished work beat AI every time, and generation costs money. Approved testimonials
(`marketing_testimonials_list`) are proof the account already owns - see the testimonial
play in `references/video.md`.

**2. One-off image.** A single visual with no copy, no layout, no future edits.
`generate_image` for one, `generate_image_set` for up to 10 prompts sharing one brand
context (per-prompt failures land in `errors[]` rather than failing the batch - read it).
Both are brand-aware and auto-register a media asset, returning `media_asset_id`. This rung
supplies ingredients: once copy, logo, or layout is involved, it is a rung 3 layer.
`media_ai_enhance_prompt` turns a rough post idea into one generation-ready prompt, but it
COSTS MONEY ON EVERY CALL (a full metered agent turn, seconds to tens of seconds) and
writes nothing itself - use it for a high-stakes generation or a batch, never reflexively.

**3. Editable design project.** The default for anything the client will ever tweak: social
graphics, carousels, thumbnails, banners, posters, ad creative, one-pagers.
`design_templates_list` first - 52 templates already brand-substituted with the account's
brand guide, plus artboard presets, each carrying a ready-to-use `canvasData` payload you
pipe into `design_create`'s `initialCanvasData`. Then `design_create({ title, designType,
artboard, initialCanvasData, description, tags })` and hand back the `dashboardUrl`. A
carousel is N artboards or N sibling designs; there is no carousel object.
`design_from_testimonial` opens a Studio draft directly on an approved testimonial's
published recording - free, idempotent, nothing billed.

**4. Motion design.** Branded cards, type, and layout that move - animated posts, logo
stings, kinetic quotes. Same design project plus per-layer `animation` and root `_animation`,
rendered with `design_export_mp4` (MP4 or GIF). No generation cost, and the worker shares the
editor's animation vocabulary so output matches the in-browser preview. SYNCHRONOUS, blocks
up to 240s, refuses early on an empty canvas - say what you are doing before starting one.
It returns `mp4Url` plus a `jobId`: if the call times out or the connection drops, the JOB
survives - poll `design_render_job_get` before ever re-rendering (`references/video.md`).
`design_export_image({ id, canvas_json, frame })` checks one moment; `design_video_rerender`
re-cuts a Remotion-backed clip in place. Narration is toolable: `design_voiceover_estimate`
prices a script free, `design_voiceover_create` SPENDS MONEY rendering it - estimate first,
always (`references/video.md`).

**5. Multi-scene video.** Reel, TikTok, promo, explainer, testimonial, listing tour -
anything more than one shot. `marketing_storyboard_create` is the entry point and it is FREE
AND FAST: it validates, prices, and stores, and NOTHING is reserved, billed, or enqueued
until a human approves. Pass EXACTLY ONE of `storyboard` (hiveku.storyboard.v1) OR
`template_id` with `substitutions`. A narrated board takes `voice_id` - read
`brand_guide_voiceovers_get` (the client's APPROVED narrators) before picking one. Then
`marketing_storyboard_submit_for_approval` and STOP. See `references/video.md`.

**6. Stock.** Only when the account owns nothing usable and generation is wrong for the
subject. Three searches, none of which saves anything: `stock_photos_search` (Unsplash +
Pexels), `stock_photos_pixabay_search` (the ONLY Pixabay source, and the only one carrying
illustrations and vectors), and `media_stock_video_search` (the ONLY stock FOOTAGE search -
Pexels + Pixabay video, and the picker behind a storyboard's `stock` scene). All three fail
silently as partial catalogs: read `providerErrors` / the HTTP status, and report a failed
provider as PARTIAL results, never as "nothing matched". `stock_photos_download` is the
WEBSITE-PROJECT lane only - it needs `{ url, project_id, save_path }` and writes into that
project's S3 assets, NOT the Media Library. The library path is
`media_library_register_external_url` (or `_batch`) on the returned `url`.

No tool covers these, so do not promise them: nothing **draws** a logo -
`brand_guide_set_logo` only stores one, so a logo is designed on rung 3 or 2 and then set.
Nothing approves a storyboard. Nothing attaches a design to a post by itself. Nothing
sources MUSIC or a licensed track - voiceover is toolable now, but a track is still
produce-outside-and-import. Nothing trims, crops, or concatenates an arbitrary MP4.

**Replacement ad creative has a rung zero: the performance read.** When the ask is new ads
because the old ones stopped working - "our ads are tired", "CPMs are up and clicks are down" -
do not start on this ladder. Start at /hiveku:ad-refresh: it reads the creative scoreboard per
platform (Meta frequency against CTR and CPM, TikTok hook and hold rates, Google RSA build
against the standard), classifies each loser as weak_hook, weak_hold, fatigue, offer_or_lp, or
structure, and hands this skill one rebrief per loser naming the angle to retire and the number
that condemned it. That classification decides the brief - a weak hook is a first-two-seconds
problem and a fatigued ad needs a new angle, not a prettier version of the old one - and an
offer_or_lp verdict never reaches production at all. Production without a performance read is
guessing with the client's money.

## Round-trip discipline

The human edits the same canvas you write to. `design_update` overwrites `canvasData`
wholesale and the dashboard editor reads that same column, so a blind full-canvas author
over someone's afternoon of edits destroys it silently.

This is the read half of the round-trip: always state_get -> reason -> update. Never
author a full canvas blind over the top of a user's edits. `design_state_get` returns a
compact element-by-element summary (position, size, style, text, animation, plus
`featuredImageUrl` when a preview exists), so use `design_get` only when you need the raw
Fabric JSON.

Snapshot before any large or destructive edit: `design_version_create({ id, versionName,
changeSummary, isMilestone })` writes into design_versions so the user can roll back from the
Version History panel; `design_versions_list` reads the index and `design_version_get`
returns one snapshot's frozen canvas. When you suspect another writer touched a design
between your read and your write - or need to prove your own write landed - `audit_query`
is the account's MCP audit log: every tool call, which key made it, when, with what args.

A parallel `marketing_design_*` naming (list, get, export_image, export_mp4) exists and is
read-and-export only. Which names a session sees is a KEY-PROFILE question, not an account
setting: the `marketing-design` profile grants both `design_` and `marketing_` prefixes.
Prefer `design_*`; if a name is missing, the key's profile is the first suspect.

## Doctrine (the seven rules this discipline runs on)

1. **Editable beats flat.** If the user will ever want to tweak it, it belongs in a design
   project (`design_create`) - not a one-off generated PNG. Hand back the `dashboardUrl`
   every time.
2. **Round-trip, never clobber.** `design_state_get` -> reason -> `design_update`. The
   human edits the same canvas; a blind full-canvas overwrite destroys their work.
3. **Snapshot before destructive edits** with `design_version_create` so the user can roll
   back from the dashboard's Version History panel.
4. **THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.** Nothing
   bills until a human says yes, and that gate is a feature. Do NOT route around it by
   generating scenes one at a time with `marketing_generate_video` - it costs more, looks
   worse, and defeats a control the platform put there deliberately.
5. **Register what does not auto-register**, or the asset cannot be attached by id later.
6. **Reuse before generating** - the account's real photos beat AI for products, team, and
   location, and generation costs money. No estimate, no voiceover; no dry run, no clip.
7. Confirm before anything irreversible or billable; MP4 renders block up to 240s, so say
   what you are doing before you start one.

Generated images and video clips auto-register. **Design exports and stock-photo URLs do
NOT** - register those explicitly before attaching them anywhere
(`design_publish_to_library` is the one-call PNG publish; treat it as CREATE, never sync -
`references/design-canvas.md`).

### Hard stops (response contracts, not suggestions)

- "The client's offline tonight - just approve the storyboard and start the render so it's
  done by morning." -> Refuse: "I can't approve a storyboard - only a signed-in human
  clicking Approve can, and that's deliberate: approval is the billing moment. It's
  submitted and priced; here's the approval card link. I can raise a `pm_tasks_create`
  reminder for the morning." Do not assemble the same video from single
  `marketing_generate_video` clips instead; that is the same bypass with a worse result.
- "Clean out the media library - delete anything we haven't used this quarter." -> Refuse
  pattern-derived deletion: deletion targets are never derived by filter, date, or glob -
  only from explicit ids the client named. Offer the reversible alternative: a review list
  from `media_library_list` with `media_usage_get` per candidate, and `media_bulk_move`
  into an "archive" folder instead of deletion. When `media_delete` refuses with 409
  `in_use`, that refusal is the system working - never pass `force=true` to get past it on
  your own judgment.
- "Skip the dry run, we know we want all 20 clips." -> No. `marketing_generate_video` is
  ~$1 per clip on a 20-clip monthly cap; `dry_run: true` and
  `design_video_capabilities_get` cost nothing and are the only way to quote remaining
  quota honestly. The confirm covers prompt, aspect ratio, cost, and remaining quota - per
  spend, not per session.

## Campaign cadence

1. **Brief and brand load** - channel, artboard size, message, CTA, and who signs off, then
   `account_context_get({ domain: 'branding' })` plus `brand_guide_get` (scoped key: the
   caveat above).
2. **Inventory and concept** - `media_library_list` and `media_collections_list` for what
   exists, then `talk_to_department({ domain: 'branding', message })` for one direction
   across the whole set.
3. **Build** - `design_templates_list` for the closest brand-substituted start, then
   `design_create` per artboard. Resize variants are siblings sharing the system.
4. **Hand off** - the `dashboardUrl` for every design, one line each on what it is and what
   is easy to change. This is the deliverable.
5. **Revise** - `design_comments_list` FIRST: the dashboard's pinned comment threads are
   where clients actually leave revision requests (filter `isResolved` yourself - resolved
   ones come back too). Then `design_state_get` -> reason -> `design_update`, snapshotting
   with `design_version_create` ahead of anything structural, and `design_comment_resolve`
   on each thread you actually addressed - it is ONE WAY, so resolve only what is fixed.
6. **Export and register** - `design_export_image` or `design_export_mp4`, then
   `media_library_register_external_url` for an id (or `design_publish_to_library` for a
   one-call PNG publish), then `media_folder_create` / `media_collection_add_item` /
   `media_update` to file and tag it.
7. **Ship** - hand the registered asset to the consuming lane (the social lane attaches it
   on `social_create_post`); check `media_usage_get` before any `media_delete`.

**Weekly sweep.** `design_list` for designs left mid-revision, `design_comments_list` on
each active design for unresolved client feedback, and the storyboard ids awaiting
approval. There is NO storyboard list tool (`marketing_storyboard_get` is by-id only), so
record every storyboard id at submit time - `memory_create` under the branding domain, or a
`pm_tasks_create` item - or the sweep has nothing to iterate. An unapproved board is a
deliverable that is not shipping. State the sweep's N: how many designs checked, which were
skipped and why - a design whose reads failed is UNKNOWN, not clean.

**Monthly audit.** Unregistered exports, proof refresh via `before_after_grid_list` /
`_populate`, and the spend ledger: write clips consumed, voiceover seconds used, and
generation spend to `memory_create` so the 20-clip cap and the voiceover allowance are
managed from a ledger, not from whoever last remembered.

## Reference map

- `references/design-canvas.md` - layer model and presets in full, artboard and safe-area
  sizes per channel, template selection, composition, carousels, the comment/revision
  loop, export, publish-to-library, and versioning. Load before creating, editing,
  restyling, animating, or exporting ANY design.
- `references/video.md` - the three video lanes and their costs, storyboard shape and
  approval gate, voiceover (estimate/create, voices, approved narrators), render-job
  recovery via `design_render_job_get`, the pipeline after approval, the paid single-clip
  lane and its dry-run discipline, and the testimonial polish play. Load for ANY moving
  picture.
- `references/brand-and-assets.md` - brand guide and logo rules, custom fonts, the Media
  Library model (folders, collections, bulk moves, external-URL registration, usage checks
  before deletion), avatars and their versioning, brand-aware prompting, stock sourcing
  and attribution, and before/after grids. Load when standing up a client, sourcing or
  filing pixels, or asked to delete anything.
