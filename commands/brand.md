---
description: "Stand up, audit, or refine the account's brand system: guide, logo slots, fonts, narrators, and prove it substitutes into the template library."
argument-hint: "[setup | audit | 'set the primary color to #...' | 'upload the logo at <path or url>']"
---
Brand system work: $ARGUMENTS. Follow the **hiveku-creative-agency** skill - load
`references/brand-and-assets.md` first; the guide's three consumers, the font traps, and the
full setup play live there. The guide is a live configuration object, not a PDF: templates,
image generation, and the branding agent all read from it, so every fix here improves everything
downstream.

1. **Read everything before proposing anything.**
   - `brand_guide_list` (the `is_active` filter is the string "true" / "false"), then
     `brand_guide_get` on the guide that matters (accepts `id` or `guide_id`).
   - `brand_guide_font_list({ guide_id })` - it silently filters `is_active=true`, so a 409 on a
     "missing" font means a soft-deleted tombstone still holds that (family, weight, style) slot;
     `brand_guide_font_get` is the only read that sees it.
   - `brand_guide_voiceovers_get` - the approved narrators with per-voice `usage_notes`. Read-only
     by design: approving a narrator is a human brand decision. Empty `approved_voices` means
     nobody is approved - omit voice_id downstream, never invent one.
   - `account_context_get({ domain: 'branding' })` for persona, avatars, memory, rules. There is
     NO `creative` domain; on a scoped key that answers tool-not-found, hydrate via
     `talk_to_department({ domain: 'branding' })` and say so.
2. **Gap report.** Colors (primary / secondary / accent / background / text), type (heading + body
   families, registered custom fonts and whether each carries `css_font_face`), the six logo slots
   (primary, secondary, wordmark, icon, dark, light), narration voices. Every value in the report
   traces to a read; NEVER invent a value to fill a gap - a missing hex, typeface, or lockup is a
   question for the client, not a guess.
3. **Writes, each on an explicit confirm:**
   - [CONFIRM] `brand_guide_create({ name, color_primary, ... })` ONLY when no guide exists (colors
     validated as #rgb / #rrggbb / #rrggbbaa; a bad format is a 400 naming the field). An existing
     guide is refined with `brand_guide_update` - NEVER a second rival guide.
   - Logo: the file goes into the library first - `media_upload({ file_name, content })` with
     base64 bytes for a local file, or `media_library_register_external_url({ file_url })` for one
     already hosted - then [CONFIRM] `brand_guide_set_logo` with the slot URLs. It updates only the
     fields you supply, and clearing a slot takes an explicit `null`. Nothing DRAWS a logo: it
     comes from the client's files, always.
   - Fonts: [CONFIRM] `brand_guide_font_create({ guide_id, font_family, display_name, ... })`.
     `css_font_face` is the ONLY field the generated brand CSS ever renders - a row with file URLs
     alone registers a font no page can load, and `upload_status` reads 'ready' regardless. Omit
     `weight` rather than pass a word ("bold" becomes NaN and 500s). `brand_guide_font_update`
     whitelists display_name, the file URLs, css_font_face, is_variable, variable_axes, and
     upload_status - NOT family / weight / style / is_active, so a rename is a 200 that changed
     nothing; identity changes take a fresh create. `brand_guide_font_delete` is a ONE-WAY soft
     delete whose tombstone keeps its unique slot forever - confirm with the human first, and
     remember a live page inlining that @font-face keeps serving until redeployed.
4. **Prove it substituted.** `design_templates_list` - the client's colors and type coming back in
   the 52-template library means the guide is live and every later template pull and generation is
   on-brand. If a generic palette comes back, fix the guide, do not repaint canvases. There is NO
   `brand_guide_set_active` tool: with multiple guides, activation is dashboard-side - tell the
   client where it lives, and never create another guide to route around it. Optional smoke check:
   one `generate_image` (brand-aware by default) and eyeball whether the system shows up.
5. **Persist.** Palette, type pairing, logo rules, and the reasoning go to the `branding` memory
   document per the skill's `references/memory-protocol.md` - `memory_list({ domain: "branding" })`,
   merge, `memory_update({ memory_id, content })` with the WHOLE body (`memory_create({ type:
   "memory", name: "branding", content })` only on first run; 409 = exists). Follow-up work that
   needs a human - font licensing, missing lockups, a photo shoot - lands as
   `pm_tasks_create({ project_id, title })` items, not a line in chat.

HARD STOPS:
- `brand_guide_delete` SOFT-deletes (flips `is_active`; restorable via `brand_guide_update` with
  `is_active: true`). `brand_guide_purge` HARD-deletes and only accepts an already-soft-deleted
  guide (409 `still_active` otherwise; 409 `fk_constraint` while fonts still reference it). Both:
  name the guide back to the user and get an explicit yes, one guide at a time, never batched.
- Never stand up a second guide to work around an activation, validation, or naming problem - the
  account's brand history and every substituted template hang off the one guide.

Local mirrors when they exist beat re-pulling live: `/hiveku:pull` lands
`hiveku-data/creative/brand-guides.json` (+ avatars, grids, designs) and `hiveku-data/media/*.json`;
`/hiveku:knowledge` mirrors the memory and rules by department. Check `fetched_at` before trusting,
and make changes through the live tools, never by editing the mirror.
