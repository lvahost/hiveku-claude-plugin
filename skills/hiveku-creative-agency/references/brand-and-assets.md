---

# The Brand System and the Media Library

This is the manual for the two things every piece of creative work depends on before a pixel gets made: the account's brand system (the brand guide, the visual-system context, customer avatars, before/after grids) and the media library (folders, collections, items, and the usage graph that says whether an asset is safe to delete). Load it when you are standing up a new client, about to generate or source imagery, hunting for an asset that may already exist, staring at a template that came back off-brand, or asked to delete something. The design-canvas manual owns the layered editor; the video manual owns storyboards and the pipeline. This one owns what is upstream of both: what makes output on-brand, and where the pixels live.

Two facts shape the rest. `design_templates_list` returns its 52-template library **already brand-substituted with the account's active brand guide**, so the guide is a live input to every template you pull, not documentation - a thin guide does not throw, it hands you a generic template and you ship generic creative. And the media library is the only place an asset gets a stable id you can attach by reference later, while **not everything that produces a pixel puts it there**. Those two silent failures are why this manual exists.

---

## Part 1. The rules that prevent damage

**Do not:**

- **R1.** No `account_context_get({ domain: 'creative' })`. There is no `creative` domain; the visual-system domain is `branding`. An unlisted value is a server-side rejection, not a soft fallback.
- **R2.** Do not generate before checking the library, and do not attach a design export or stock-photo URL by id - neither is in the library until you put it there (R14, Part 8).
- **R3.** Do not call `media_delete` without running `media_usage_get` first. ★
- **R4.** Do not call `brand_guide_purge` without an explicit instruction naming what is being purged. `brand_guide_delete` removes one guide; a purge is the wide blast radius, and there is no undo tool here.
- **R5.** Do not use `stock_photos_download` to get an image into the Media Library. It cannot; it is the website-project lane only (Part 7).
- **R6.** Do not invent brand values. No accent color, no secondary typeface, no tone rule means ask the client or read it off their site. A guessed hex ships across every template afterwards.
- **R7.** Do not fabricate a logo. Not an SVG you drew, not a generated one, not a placeholder mark. A logo comes from the client.
- **R8.** Do not spend anything billable or take anything irreversible without confirming first: generation, MP4 renders, deletes, purges.

**Do:**

- **R9.** `account_context_get({ domain: 'branding' })` before any visual work, the way `social` context comes first for a caption. It returns persona, brand voice, avatars, domain memory, skills, and rules.
- **R10.** Read the existing guide with `brand_guide_get` before writing one. Inherit and refine; a rival second guide fragments the system and you will not know which one the templates substitute.
- **R11.** Name and file every asset as you create it. An unnamed file in the root is one nobody finds again, so it gets regenerated.
- **R12.** Send generative and strategic visual questions to `talk_to_department({ domain: 'branding' })`, then persist the chosen output with the matching direct tool.
- **R13.** Hand back the dashboard URL every time. The human's job is to see and edit; a report without a link is a dead end.
- **R14.** ★ Generated images and video clips auto-register. **Design exports and stock-photo URLs do NOT** - register those explicitly before attaching them anywhere.

---

## Part 2. Which domain, and where the visual context comes from

`branding` is the visual-system domain and it is valid for both `account_context_get` and `talk_to_department`. Three adjacent domains are valid for both as well, and visual work leans on them constantly: `customer_avatar` (who the creative speaks to), `before_after_grid` (the transformation it dramatizes), and `website_design` (the site's own visual language, when creative must match it).

`creative` is not valid for either. Neither is `web`, `email`, `pm`, `accounting`, `voice`, or `knowledge`. When you need something the branding agent does not cover, load a valid context domain, draft directly with that hydration, and say plainly that is what you are doing; `agent_identity_get` is the other option, returning a department's full identity bundle so you can act as it without an upstream call. `list_departments` tells you which departments THIS account has enabled - a domain being in the enum is not entitlement.

Re-read the `instructions` field `account_context_get` returns before every generative call. It is the account's standing orders, and it changes.

---

## Part 3. The brand guide, and what it actually drives

Tools: `brand_guide_list`, `brand_guide_get`, `brand_guide_create`, `brand_guide_update`, `brand_guide_delete`, `brand_guide_purge`, `brand_guide_set_logo`.

Treat the guide as a live configuration object with three consumers, not a PDF:

1. **Template substitution.** `design_templates_list` returns the 52-template library already substituted with the active guide, plus artboard presets by category (Social Media / Presentation / Print / Ads / Email). Each template carries a ready-to-use `canvasData` payload you pipe straight into `design_create`'s `initialCanvasData`, so the guide decides what colors and type land on the canvas before you touch it. A generic-looking template is a symptom: fix the guide, do not repaint layer by layer.
2. **Image generation.** `generate_image` is brand-aware by default and `generate_image_set` shares one brand context across up to ten prompts. That awareness comes from the account's brand system, not your prompt string: strengthening the guide improves every future generation, stuffing colors into one prompt improves one image.
3. **The branding agent.** `talk_to_department({ domain: 'branding' })` runs with the guide hydrated, so a palette rationale or type pairing comes back inside the client's system rather than generic.

**Read before writing.** `brand_guide_list`, then `brand_guide_get` on the one that matters. Do not assume the field shape from this manual - read the tool's own schema and an existing guide's payload. A field the schema does not declare is a silent no-op on mutating calls, not an error.

**The logo is its own call**, because it is an asset reference, not a text field. Get the file into the library first (`media_upload`, or `media_library_register_external_url` for one already at a URL), then `brand_guide_set_logo`. R7 stands: the logo comes from the client.

**Activation.** There is no `brand_guide_set_active` tool in the registry. With more than one guide, the empirical check for which is substituting is `design_templates_list`; the durable fix is dashboard-side, and tell the client that is where it lives. Do not guess, and do not create a third guide to route around it.

---

## Part 4. Play: standing up a new client's brand system from scratch

The first hour on a new account. Nothing downstream is worth doing until this is done, because every template, every generation, and every department answer reads from what you build here.

**1 - Establish what exists.** `get_account_info` for the tenant, `list_departments` for what is enabled, `brand_guide_list` (a guide already there makes this a refine job, R10), then `media_library_list` and `media_folders_list` - nine times out of ten the library holds more than the client remembers. Finish with `account_context_get({ domain: 'branding' })` for persona, voice, avatars, memory, and rules; even a barely-onboarded account usually has voice notes and an avatar, and those constrain palette and type more than they look like they will.

**2 - Collect the raw material from the client.** Logo files (all lockups, ideally with transparency), primary and secondary colors as hex, the typefaces, existing photography, and one sentence on how the brand should feel. Ask for it as a list; do not fill the gaps yourself (R6).

**3 - Get assets in and organized before the guide.** Folder skeleton first with `media_folder_create` so nothing lands loose: logos, photography, graphics, video, client-supplied. Then `media_upload` for files the client hands you and `media_library_register_external_url` (or `..._batch`) for anything already hosted - a Drive export, the existing site's images, a photographer's delivery link. Name every item as you go (R11).

**4 - Draft the direction with the department agent.** `talk_to_department({ domain: 'branding', message })` carrying the raw material: colors, type, the feel sentence, the avatars. Ask for a palette with roles (primary, secondary, accent, neutral, surface), a type pairing with weights for display versus body, and a few lines of tone-of-voice-for-visuals. Confirm before persisting - a palette is the most expensive thing to change later, since it is baked into every design already made.

**5 - Persist the guide.** `brand_guide_create` with the agreed values, then `brand_guide_set_logo` pointing at the library asset from step 3. Refine with `brand_guide_update`, never a second guide.

**6 - Prove it substituted.** `design_templates_list`. Client colors and type coming back means the guide is live and every later template pull and generation is on-brand. If not, stop and fix the guide (Part 3, activation) rather than hand-painting canvases forever.

**7 - Build one artifact as proof.** Pipe one substituted template's `canvasData` into `design_create` and hand back the `dashboardUrl`. It is immediately editable there, which is the point: the client sees the system applied and can push on it while it is cheap to change.

**8 - Capture the avatars and the proof grids** (Part 5), then **record the decisions**: palette, type, logo rules, and reasoning to `memory_create`; follow-up work (missing lockups, photo shoot, font licensing) as `pm_tasks_create` items, not a line in a chat message.

---

## Part 5. Avatars and before/after grids

**Customer avatars** are who the creative talks to. They arrive in the `account_context_get({ domain: 'branding' })` bundle and have their own domain (`customer_avatar`) for context and department chat. Use them concretely: the avatar decides whether a photo is a person in workwear or in a boardroom, whether the type reads warm or clinical, and which transformation is worth showing. Creative made without one loaded is made for nobody in particular, and it looks it.

**Before/after grids** are the transformation proof, and they are first-class objects: `before_after_grid_list`, `before_after_grid_get`, `before_after_grid_create`, `before_after_grid_update`, `before_after_grid_delete`, plus two that do the real work. `before_after_grid_populate` fills a grid instead of making you assemble it item by item. `before_after_grid_link_to_avatar` binds a grid to a customer avatar, so the transformation is attached to the persona it must convince instead of floating free. Read both schemas before the first call - this manual names them and what they are for, not their argument shapes. `talk_to_department({ domain: 'before_after_grid' })` is the agent for which transformations are worth building.

A before/after grid is the highest-converting visual a service business owns and the one an image generator cannot fabricate honestly: both halves are real photographs of real work. Build the grid from the media library, link it to the avatar, then let the design canvas dramatize it. Never generate a "before".

---

## Part 6. The media library model

Three levels, and they are not interchangeable.

**Items** are the assets: `media_library_list` to browse and search, `media_library_get` for one full record, `media_update` for metadata, `media_delete` to remove, `media_usage_get` to find where it is used before you do (Part 9).

**Folders** are storage: one asset lives in one place. `media_folders_list`, `media_folder_create`, `media_folder_update`, `media_folder_delete`. Folders are for filing - logos, photography, graphics, video.

**Collections** are curated sets: one asset can belong to many. `media_collections_list`, `media_collection_create`, `media_collection_get`, `media_collection_update`, `media_collection_delete`, `media_collection_add_item`, `media_collection_remove_item`. Collections are for use - the launch kit, the hero shortlist, the approved headshots.

One item, many collections. People reach for folders to do a collection's job, and then the same photo is uploaded four times to sit in four campaigns.

**A parallel naming exists.** `marketing_media_list`, `marketing_media_get`, `marketing_media_folders`, `marketing_media_register_external_url`, and `marketing_media_upload_base64` are a second surface over the same library, and the social skill's Play 4 uses those names. Both are real: verify which set this account exposes, then stay consistent in-session. `marketing_media_upload_base64` has no `media_*` equivalent - it takes content you hold as bytes.

**Moving an asset between folders** goes through `media_update` if the folder is a field on its schema; there is no `media_move`. If the field is not declared, the dashboard is the fallback - say so rather than deleting and re-uploading, which orphans every reference to the old id.

---

## Part 7. Getting pixels in: four lanes

**Lane 1 - Generate.** `generate_image` for a single visual: brand-aware by default, auto-registers a media asset, returns a `media_asset_id` you can attach immediately. `generate_image_set` runs up to ten prompts on one brand context, and per-prompt failures land in `errors[]` rather than failing the batch - read `errors[]` and report a partial set as partial. Billable: confirm first (R8).

**Lane 2 - Client-supplied files.** `media_upload` for a file you have, `marketing_media_upload_base64` for bytes. Both land in the library with an id.

**Lane 3 - Anything already at a URL.** `media_library_register_external_url` for one, `media_library_register_external_url_batch` for a set: the import path for photographer deliveries, agency footage, existing site imagery, and stock photos. Never describe a registered clip as generated.

**Lane 4 - Stock photos, which split in two.** This is the trap.

- `stock_photos_search` returns `{ url, thumbnail, photographer, source, attribution }` and **saves nothing**. It is a search, not an acquisition: a URL on someone else's host, no id, no library record, nothing to attach.
- `stock_photos_download` is the **website-project lane only**. It requires `{ url, project_id, save_path }` and writes into that project's S3 assets, putting **nothing** in the Media Library. Use it when the destination is a page on the client's site; get `project_id` from `list_projects` or `get_project`.
- To get a stock photo into the Media Library, take the `url` from `stock_photos_search` and register it with `media_library_register_external_url`. That is the only path.

Carry `photographer`, `source`, and `attribution` into the registered asset's metadata. Some licenses require attribution at point of use, and losing the fields means re-finding the photo to publish it legally.

**The register rule, because it is the one that silently breaks attachments:**

★ Generated images and video clips auto-register. **Design exports and stock-photo URLs do NOT** - register those explicitly before attaching them anywhere.

A `design_export_image` PNG and a `design_export_mp4` render are outputs, not library assets. If the export will be reused, register it first or the attachment has nothing to point at.

---

## Part 8. Reuse before generate

Generation is billed per image and video runs roughly a dollar a clip on a metered, capped plan; reuse costs nothing. Credibility settles it harder still: for products, team, premises, vehicles, completed work, anything a customer could verify, real photography beats a render every time. A generated "team photo" of people who do not work there is a trust problem, not a shortcut.

Order of preference:

1. **The library.** `media_library_list`, `media_collections_list`, `media_folders_list` first, every time. Keyword search, then browse the folder you would have filed it in. The most common cause of a duplicate generation is not looking.
2. **The client.** Real-world subject, no shot on file: ask. A photo from the client's phone outperforms a generated one and costs nothing.
3. **Stock**, via `stock_photos_search` plus registration, for generic context - backgrounds, textures, anything with no brand specificity.
4. **Generation**, for concepts, illustrations, and composites that cannot be photographed. That is where `generate_image` earns its cost.

One more lever: a still can be animated rather than re-shot. `marketing_generate_video` takes an existing asset as `reference_media_asset_id`, and the design canvas animates a still per layer at no generation cost at all.

---

## Part 9. Deleting safely

★ **`media_usage_get` before `media_delete`. Always.**

An asset here is referenced by id from places the library view does not show you: social posts, design canvases, brand guides, website projects, campaigns. `media_usage_get` tells you where. Run it, read the list back, and get an explicit yes before deleting anything with a non-empty usage list. A delete that breaks a live design does not fail at delete time; it fails later, in the client's dashboard, as a broken layer in a design they were about to send.

Same for `media_folder_delete` and `media_collection_delete` - a collection is a view, not a container, but confirm that on this account's surface before using either as cleanup. `brand_guide_delete` and especially `brand_guide_purge` top the ladder (R4). Nothing here has an undo tool: the design canvas has version history via `design_version_create` and `design_versions_list`, the media library does not.

---

## Part 10. What has no tool, and what to do instead

Say each of these plainly rather than routing around it silently.

- **Which brand guide is active.** No `brand_guide_set_active`. Verify through `design_templates_list`; set it in the dashboard.
- **Extracting a palette from a logo file.** No tool. Read the colors from `account_context_get({ domain: 'branding' })`, from the client's site, or ask.
- **Hosting or licensing a font.** No tool. Name the typeface in the guide, get the file into the library like any other asset, raise licensing as a `pm_tasks_create` task.
- **Moving an asset between folders.** No `media_move`. `media_update` if the field is on the schema, otherwise the dashboard. Never delete and re-upload.
- **Bulk delete.** `media_delete` is one asset per call. Given R3, that is a feature.
- **A brand-compliance check on finished creative.** Nothing scores a design against the guide. `design_state_get` returns an element-by-element read of position, size, style, text, and animation - compare fills and fonts yourself, report the diff.
- **Approving anything.** No creative approval tool exists in this lane. ★ "**THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.**" That is written about storyboards and it is the rule everywhere here: you build, the human approves, in the dashboard.

---

## Part 11. Pitfalls

Every trap here is silent.

- **`stock_photos_search` saved nothing** - no asset, no id, nothing to attach - and **`stock_photos_download` did not put it in the Media Library** either; it wrote into a website project's S3 at `save_path`. Register the URL, or the design export, or you accomplished nothing, and carry `photographer`, `source`, `attribution` across when you do.
- **Undeclared arguments are dropped on mutating calls** - 200, nothing changed. Read the schema; do not infer field names from this manual or a sibling tool.
- **Two naming surfaces exist for the same library.** `media_*` and `marketing_media_*` are both real. Verify which this account exposes, then stay consistent in-session.
- **A generic-looking template is a guide problem**, and guide presence is not guide activation.
- **Confirm before anything billable or irreversible**, say so before a long render starts, and finish by handing back the dashboard URL.

---

# Tool-name inventory (every name referenced, with provenance)

**Brand system** (grounding file, BRAND SYSTEM section): `brand_guide_list`, `brand_guide_get`, `brand_guide_create`, `brand_guide_update`, `brand_guide_delete`, `brand_guide_purge`, `brand_guide_set_logo`, `before_after_grid_list`, `before_after_grid_get`, `before_after_grid_create`, `before_after_grid_update`, `before_after_grid_delete`, `before_after_grid_populate`, `before_after_grid_link_to_avatar`.

**Context and departments** (grounding + `domains-truth.md`): `account_context_get`, `talk_to_department`, `agent_identity_get`, `list_departments`. Domains cited: `branding`, `customer_avatar`, `before_after_grid`, `website_design`, `social`; named as invalid: `creative`, `web`, `email`, `pm`, `accounting`, `voice`, `knowledge`.

**Media library** (grounding, MEDIA LIBRARY section): `media_library_list`, `media_library_get`, `media_upload`, `media_update`, `media_delete`, `media_usage_get`, `media_library_register_external_url`, `media_library_register_external_url_batch`, `media_folders_list`, `media_folder_create`, `media_folder_update`, `media_folder_delete`, `media_collections_list`, `media_collection_create`, `media_collection_get`, `media_collection_update`, `media_collection_delete`, `media_collection_add_item`, `media_collection_remove_item`, `marketing_media_list`, `marketing_media_get`, `marketing_media_folders`, `marketing_media_register_external_url`, `marketing_media_upload_base64`.

**Images and stock** (grounding, IMAGES section): `generate_image`, `generate_image_set`, `stock_photos_search`, `stock_photos_download`.

**Design canvas, referenced across the boundary** (grounding, DESIGN CANVAS section): `design_templates_list`, `design_create`, `design_state_get`, `design_version_create`, `design_versions_list`, `design_export_image`, `design_export_mp4`.

**Named as NOT existing, with the fallback stated:** `brand_guide_set_active` (verify via `design_templates_list`, activate in the dashboard), `media_move` (use `media_update`, else the dashboard), plus no bulk delete, no palette extraction, no font hosting, no brand-compliance scorer (use `design_state_get` and diff by hand), and no creative approval tool at all.

**Cited from adjacent verified sources rather than the grounding file** (flagged here so you can confirm before shipping): `get_account_info`, `memory_create`, `pm_tasks_create`, `marketing_generate_video` (all from `hiveku-social-agency/SKILL.md`, which states every tool it names is real); `list_projects`, `get_project` (from the workspace `CLAUDE.md`, cited only as the source of `project_id` for `stock_photos_download`).

**Star-marked rules preserved verbatim:** the auto-register rule ("Generated images and video clips auto-register. **Design exports and stock-photo URLs do NOT** - register those explicitly before attaching them anywhere.") appears twice, as R14 and again in Part 7; and "**THE AGENT CANNOT APPROVE: after creating, submit for approval and stop.**" appears in Part 10. `media_usage_get` before `media_delete` is star-marked in both R3 and Part 9.
