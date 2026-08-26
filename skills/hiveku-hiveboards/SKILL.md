---
name: hiveku-hiveboards
description: Build and edit visual boards on Hiveku's Miro-style canvas. Use whenever someone asks to map, diagram, chart, lay out, or visualize something: a sitemap or site structure, a marketing or conversion funnel with drop-off between stages, a sales sequence or cadence with delays and branches, a customer journey, an onboarding or process flow, an org chart, a workshop wall of sticky notes, or bringing an existing Miro board into Hiveku. Also use for extending, relabelling, or cleaning up a board that already exists, and for turning a mapped sequence into a workflow that actually runs.
---

# Hiveku Hiveboards

Hiveboards are Hiveku's infinite visual canvas: frames, shapes, sticky notes, text, images,
and connectors, all addressable through 12 MCP tools. The whole surface is agent-writable,
so a sitemap, funnel, or sequence that would take an hour of dragging in Miro is one or two
tool calls here. A board lives at `/dashboard/hiveboards/<board_id>` in the Hiveku dashboard.

Read this before drawing anything, because the canvas has no undo for an agent (there is no
bulk element delete), and geometry mistakes are far more expensive to fix than to avoid.

## Lead with the leverage: hiveboard_sitemap_scaffold

For anything tree-shaped, do NOT place elements yourself. `hiveboard_sitemap_scaffold` builds
the entire diagram in ONE call: it lays out every node, sizes and labels every frame, and
wires real curved parent-to-child connectors. Verified behaviour:

- `pages` accepts EITHER shape and the server detects which you sent. Flat with parent refs:
  `{title, path?, parent?}`, where `parent` is matched against another page's `title` string.
  Nested: `{title, path?, children: [...]}`. Do not mix them in one call.
- Every page becomes a `frame` element, 180 wide by 90 tall, labelled with the title, plus
  the `path` on a second line when you supply one.
- Every parent-to-child edge becomes an `arrow` with `lineStyle: 'curved'` and real
  `startConnection` / `endConnection` bindings to the two frame ids. These are true
  connections, not decorative lines.
- `layout` is `vertical` (default, root at top, depth grows downward) or `horizontal` (root
  at left). `spacing_x` defaults to 240 (pitch between siblings), `spacing_y` to 160 (pitch
  between depths). `origin` defaults to `{x: 0, y: 0}`.
- Cap is 500 pages per call. Additive: it never deletes existing board content.
- Returns `{board_id, pages_created, arrows_created, orientation, title_to_element_id}`.
  Keep `title_to_element_id`: it is the only cheap way to patch one frame later.

Because it is additive, you can scaffold a second tree onto the same board, but give it a
different `origin` or the two trees land on top of each other.

## The rule that breaks every board: position is TOP-LEFT

An element's `position` `{x, y}` is its TOP-LEFT corner, not its centre. The builder sets
`start = {x, y}` and `end = {x + width, y + height}`
(`hiveku_builder/src/lib/hiveboards/element-builder.ts`).

To centre a shape on a point, subtract half the width and half the height yourself:

```
centre (0, 400), box 260 x 90  ->  position { x: 0 - 130, y: 400 - 45 } = { x: -130, y: 355 }
```

This matters because the tool description used to say center-origin. Every element generated
against that wrong assumption landed half a box off (80 by 50 at the default rectangle size of
160 x 100), which is exactly enough to make connector arrows point at corners instead of edges
while still looking almost plausible. If you inherit a board where every arrow grazes a corner,
this is why: the shapes are off by half their size, not the arrows.

Work your layout in centres on paper because centres make the arrow maths trivial (bottom-mid
is `centre.y + height / 2`), then convert to top-left at the moment you build each element.
That is exactly what the sitemap scaffold does internally.

## Operating principles

- `account_context_get({ domain })` FIRST when the board carries strategy or copy: funnel stage
  names, sequence messaging, journey phases. A funnel labelled in generic marketing nouns
  instead of the account's own language is the number one reason a board gets ignored.
- Get the geometry right on the FIRST write. Repositioning after the fact is the single most
  expensive operation on this surface (see "Editing a board that already exists"), and there
  is no bulk element delete, so a 200-element mistake costs 200 delete calls to undo. Compute
  every coordinate before you call anything.
- One bulk call, not N singles. `hiveboard_elements_bulk_create` takes up to 5000 elements.
  A loop of `hiveboard_element_create` is slower, racier, and gives you no clean id list.
- Confirm before destructive calls. `hiveboard_delete` cascades to every element on the board
  and there is no restore. `hiveboard_element_delete` is one row at a time.
- Draft on a scratch board when the layout is uncertain, then `hiveboard_duplicate` the good
  one. Duplicating a finished funnel per client is far cheaper than rebuilding it.
- A board is a PICTURE. It does not send anything, score anything, or run on a schedule. When
  the user wants the sequence to actually fire, the board is the map and a workflow is the
  engine (see "Boards versus workflows").
- Pull real numbers before you draw them. Funnel stages come from `crm_list_pipelines` and
  `crm_pipeline_stage_summary`, not from your idea of a funnel. Sitemap pages come from
  `pages_list({ project_id })`. Inventing stage names or page lists produces a board the
  client immediately distrusts.
- When unsure of an argument shape, `hiveku_docs_search` / `hiveku_docs_get` rather than
  guessing.

## The 12 hiveboard tools

| Tool | What it does and what to watch |
|---|---|
| `hiveboard_list` | Boards in the account, newest-edited first. `project_id` scopes to one project; `limit` defaults 50, caps at 200. Returns summary cards with `element_count`. |
| `hiveboard_create` | New board. Requires `name`. Optional `description`, `project_id`, `background_type` (`dot` default, `grid`, `none`), `background_color` (default `#1F2937`, a dark slate). That dark default is why you must set element colours. |
| `hiveboard_get` | Board metadata plus EVERY element, ordered by `z_index` ascending. This is how you recover element ids and read an element's full `element_data` before patching it. |
| `hiveboard_update` | Metadata only, allow-listed: `name`, `description`, `background_type`, `background_color`, `is_public`. Never touches elements. |
| `hiveboard_delete` | Deletes the board and cascades to every element. Irreversible. Confirm first. |
| `hiveboard_duplicate` | Clones the board and all elements into a new board. `name` defaults to "<original> (copy)". Use it to template a funnel or journey per client. |
| `hiveboard_element_create` | One element. Requires `board_id`, `type`, `position`. Types: `rectangle`, `circle`, `diamond`, `triangle`, `hexagon`, `text`, `sticky-note`, `frame`, `arrow`, `line`, `pen`, `image`. Additive. `position` is TOP-LEFT. |
| `hiveboard_elements_bulk_create` | Up to 5000 elements, same per-element shape. Additive. Returns `{created, invalid, errors[]}` plus the created ids. The id list covers VALID rows only, so check `invalid: 0` before zipping ids back to your input array. |
| `hiveboard_element_update` | Patches one element. Allow-listed: `element_type`, `element_data`, `position`, `z_index`, `rotation`, `color`, `fill_color`, `stroke_width`, `font_size`, `locked`, `hidden`. It is a RAW column write: `element_data` is REPLACED wholesale and `position` alone does not move a shape. See the editing section. |
| `hiveboard_element_delete` | One element by id. No bulk variant exists. |
| `hiveboard_import_miro` | Ingests the raw `{board, items: [...]}` JSON from Miro's `GET /v2/boards/<id>/items`. Maps shape, sticky_note, text, frame, image, paint; skips mindmap_node, card, kanban with warnings. Miro's items endpoint omits connectors, so an imported board has content but NO arrows. Omit `board_id` to create a new board, pass it to append. |
| `hiveboard_sitemap_scaffold` | The one-call tree builder. See the top of this file. |

## Play 1 - A sitemap from a site's real page list

1. `sites_list` for the `project_id`, then `pages_list({ project_id })` for the real pages and
   slugs. Build the sitemap from what exists, not from what you assume exists.
2. `hiveboard_create({ name: '<Client> Sitemap', project_id })` so the board is attached to
   the project and findable from `hiveboard_list({ project_id })`.
3. Derive the hierarchy from the slugs: `/services/roofing` is a child of `/services`. Ask
   before inventing a parent for an orphan top-level page.
4. One call:

```json
{
  "board_id": "<uuid>",
  "pages": [
    { "title": "Home",     "path": "/" },
    { "title": "Services", "path": "/services",         "parent": "Home" },
    { "title": "Roofing",  "path": "/services/roofing", "parent": "Services" },
    { "title": "Siding",   "path": "/services/siding",  "parent": "Services" },
    { "title": "About",    "path": "/about",            "parent": "Home" },
    { "title": "Contact",  "path": "/contact",          "parent": "Home" }
  ],
  "layout": "vertical"
}
```

5. Verify the return, do not assume it. `pages_created` must equal your page count and
   `arrows_created` must equal the number of pages that carried a `parent`. A short arrow
   count means a `parent` string did not match any title, and a dangling parent is treated
   silently as a root at depth 0 rather than raising an error.
6. Store `title_to_element_id` in your reply or in `memory_create` alongside the `board_id`.
   Without it, patching one frame later means re-reading the whole board.

Wide sitemaps: at the default `spacing_x` of 240 a row of 8 pages spans 1680 pixels centred on
`origin.x`, so frames sit at negative x. That is fine on an infinite canvas. If a deep row gets
unreadably wide, either raise `spacing_x` and let it breathe, or switch to
`layout: 'horizontal'` so depth grows rightward and the wide dimension becomes vertical.

## Play 2 - A marketing funnel, stages top to bottom

Funnels are not trees, so the scaffold does not apply. Place them yourself with explicit
maths. Boxes 260 wide by 90 tall, one column centred on x = 0, row pitch 200.

```
box width 260, height 90, centre x = 0  ->  top-left x = 0 - 130 = -130
stage k top y = k * 200          (pitch 200 = 90 box + 110 gutter)

stage 0  y   0 ..  90     arrow 0 ->1   (0,  90) -> (0, 200)
stage 1  y 200 .. 290     arrow 1 ->2   (0, 290) -> (0, 400)
stage 2  y 400 .. 490     arrow 2 ->3   (0, 490) -> (0, 600)
stage 3  y 600 .. 690     arrow 3 ->4   (0, 690) -> (0, 800)
stage 4  y 800 .. 890
```

Every arrow runs from the parent's bottom-mid (`x = centre.x`, `y = box top + 90`) to the
child's top-mid. Both are exact because the column is a single centre line.

1. Get the real stages: `crm_list_pipelines`, then `crm_pipeline_stage_summary` for the counts
   at each stage. Draw the account's pipeline, not a textbook funnel.
2. Bulk-create the five stage rectangles in one call, top to bottom, with explicit
   `element_data: { width: 260, height: 90, label: 'Leads (1,240)', labelSize: 14 }` and a
   visible `color`.
3. Read the returned ids in order, then bulk-create the four arrows in a SECOND call, each
   carrying `startConnection` / `endConnection` (see "Real connections" below) and a
   conversion label: `element_data: { start, end, label: '38% continue', labelSize: 12 }`.
   Arrows are shapes, so they accept `label`, `labelSize`, and `labelColor` like any other.
4. Drop-off annotations go to the RIGHT of the arrow so they never overlap a box. The box's
   right edge is x = 130, so a text element at `position: { x: 150, y: k * 200 + 120 }` sits
   in the gutter beside the connector. Use a warning colour and keep the line short: text
   elements have no width and do not wrap.
5. Label the stage counts from the summary tool, and say in your reply which tool call each
   number came from. A funnel with unattributed numbers is a liability.

## Play 3 - A sales sequence with delays and branches

Same single column, smaller steps, with the delay carried on the connector rather than as its
own box. Steps 220 wide by 80 tall, centred on x = 0, row pitch 170.

```
step k top-left  x = -110,  y = k * 170        (pitch 170 = 80 box + 90 gutter)
arrow k -> k+1   (0, k*170 + 80) -> (0, k*170 + 170),  label "Wait 2 days"

branch point: diamond 140 x 120, centred x = 0, top y = 510
  -> top-left { x: -70, y: 510 },  spans y 510 .. 630, bottom-mid (0, 630)

two outcomes, centred at x = -200 and x = +200, top y = 700
  left  box top-left { x: -310, y: 700 }   spans x -310 .. -90
  right box top-left { x:   90, y: 700 }   spans x   90 ..  310   (180 gutter between)

branch arrows: (0, 630) -> (-200, 700)  label "Replied"
               (0, 630) -> ( 200, 700)  label "No reply"
```

1. Draft the actual step copy through `talk_to_department({ domain: 'outbound', message })` so
   the touches carry the account's voice, then put the resulting subject lines on the boxes.
   Note the enum trap: `account_context_get` accepts `sales`, but `talk_to_department` does
   NOT. Its domains are seo, social, content, marketing, branding, outbound, ppc, analytics,
   customer_avatar, customer_journey, before_after_grid, website_design, knowledge_base,
   workflow. Sequence and cadence work belongs to `outbound`, and an unlisted value is
   rejected server-side rather than silently defaulted.
2. Put the channel in the box label (`Email 1: opener`, `SMS follow-up`, `Call task`) and the
   timing on the arrow label. A sequence board is read for cadence first, content second.
3. Use a `diamond` for every decision point. It is the only shape readers universally parse as
   a branch, and it keeps the two outcome columns visually subordinate.
4. Colour the terminal states differently from the steps: a "Booked" end state and a
   "Sequence exhausted" end state should not look like step 6.

## Layout arithmetic

Default sizes when you omit `width` / `height`, straight from the element builder:

| Type | Default W x H | Min column pitch | Min row pitch |
|---|---|---|---|
| `rectangle` | 160 x 100 | 220 | 160 |
| `circle` | 120 x 120 | 180 | 180 |
| `diamond`, `triangle`, `hexagon` | 140 x 120 | 200 | 180 |
| `sticky-note` | 200 x 200 | 260 | 260 |
| `frame` | 400 x 300 | 460 | 360 |
| `image` | 200 x 200 | 260 | 260 |
| `line`, `arrow` | 200 x 0 | n/a | n/a |
| scaffold frame | 180 x 90 | 240 (`spacing_x` default) | 160 (`spacing_y` default) |

The rule behind the table: pitch equals the widest element in that row or column plus a 60
pixel gutter minimum. Below 60 the board reads as a solid block and connector labels collide
with the boxes they describe. Text elements have no measurable width, so budget roughly 8
pixels per character at the default `fontSize` of 16 when you are deciding whether a label
fits in a gutter.

`z_index` decides paint order and `hiveboard_get` returns elements ordered by it ascending.
Follow the scaffold's convention: shapes at 0 and up, connectors at 10000 so they always paint
over the boxes they join, annotations above that.

Colour is not decoration here. The default board background is `#1F2937` and the default
element stroke is `#000000`, so an element created without a `color` is black on dark slate
and effectively invisible. The scaffold's palette is a safe starting point: stroke `#94A3B8`,
fill `#0F172A`, connectors `#64748B`. Always pass `color` explicitly.

## Real connections, not free-floating arrows

An arrow with only `start` and `end` is a line that happens to sit between two boxes. An arrow
with `startConnection` / `endConnection` is BOUND to those elements, which is what makes the
diagram survive a human dragging a box around in the UI.

The shape is `{ shapeId: '<element uuid>', point: 'center' | 'edge' }`. Use `'edge'`, which is
what both the scaffold and the UI's own connection mode write.

Because element ids are generated server-side, wiring connections is always TWO passes:

1. Bulk-create the shapes. Read the returned id list, in the order of your valid input rows.
   Check `invalid: 0` first: rejected rows are skipped in that list, so a single bad row
   shifts every id after it and you silently wire the wrong boxes together.
2. Bulk-create the arrows, each with computed `start` / `end` coordinates AND the two
   connection objects:

```json
{
  "type": "arrow",
  "position": { "x": 0, "y": 90 },
  "element_data": {
    "start": { "x": 0, "y": 90 },
    "end":   { "x": 0, "y": 200 },
    "lineStyle": "curved",
    "startConnection": { "shapeId": "<stage-0-id>", "point": "edge" },
    "endConnection":   { "shapeId": "<stage-1-id>", "point": "edge" },
    "label": "38% continue"
  },
  "z_index": 10000,
  "color": "#64748B"
}
```

Set `start` and `end` to real coordinates even though the connections are present. The stored
coordinates are what gets drawn; the connections are what keeps the endpoints attached when
someone moves a box in the editor. Omit the coordinates and you get an arrow at the origin.

If you lost the ids (a scaffold you did not capture, or an import), `hiveboard_get` returns
every element with its id and `element_data`, and for scaffolded frames the label text is your
join key back to the page title.

## Editing a board that already exists

This is where boards get wrecked, so read it before patching anything.

`hiveboard_element_update` is a raw allow-listed column write. It does NOT rebuild the element
from your inputs, which has two consequences:

- **`element_data` is replaced wholesale, not merged.** The renderer expects the complete typed
  element (`id`, `type`, `shapeType`, `start`, `end`, `color`, `strokeWidth`, `zIndex`, and any
  label fields). Sending a partial object such as `{ label: 'New name' }` strips `start` and
  `end`, and the renderer then crashes on that element. Always `hiveboard_get` first, take the
  element's existing `element_data`, change the one field, and send the whole object back.
- **Patching `position` alone does not move a shape.** Shapes are drawn from
  `element_data.start` / `.end`. The `position` column is a redundant convenience copy. To
  actually move a box you must patch both `position` and a full `element_data` with new
  `start` and `end` that preserve the original width and height
  (`width = end.x - start.x`, `height = end.y - start.y`).

Connectors compound it: an arrow's endpoints are stored coordinates that the editor translates
when a human drags the attached shape. Nothing recomputes them server-side. So moving a box
through the API leaves every attached arrow behind, pointing at empty canvas, until someone
drags it in the UI. If you move a box, patch its arrows in the same pass.

The practical conclusion: do not plan to reposition. Compute the layout up front, verify it
once by eye, and if the geometry is wrong on a small board it is usually cheaper to delete the
board and rebuild it than to patch twenty elements and their connectors.

## Boards versus workflows

A Hiveboard sequence does not send anything. When the user says "and then make it run", the
board is the map and a workflow is the engine, and they are separate surfaces with their own
node vocabulary.

`workflow_node_types_list` is the source of truth for node type strings. Do not guess them:
verified examples include `sendEmail`, `sms` (not `sendSms`), `delay`, `waitUntil`,
`conditional` (the If branch), and `switch` (multi-branch). Build order is
`workflow_create` -> `workflow_node_add` for each step -> `workflow_edge_add` for each
connection -> `workflow_run`.

Two facts that map directly onto a sequence board:

- The delay you drew on an arrow label maps to `delay` only for short pauses. For anything
  over 15 minutes use `waitUntil`, which parks the run in the database and resumes it from a
  cron so it survives deploys and restarts. A multi-day sequence built on `delay` is a
  sequence that silently dies on the next deploy.
- Never fire a first draft at real contacts. `workflow_run({ test_mode: true })` (or the
  equivalent named tool `workflow_test`) short-circuits every side-effecting node and returns
  a mock result carrying `__dry_run: true` and `would_have: {...}` with the arguments each node
  would have sent, while pure transforms and flow control still execute. Then
  `workflow_run_get({ workflow_id, run_id })` returns `step_states`, a per-node map of
  `{status, input, output, error}`, which is where you see which branch actually took.

Draw the board, get the shape approved, then build the workflow from the approved board.

## Pitfalls

- Treating `position` as a centre. It is the top-left corner. Half a box off is the signature,
  and connector arrows pointing at corners rather than edges is how it shows up.
- Patching `element_data` with a partial object. It replaces, never merges, and a shape
  without `start` / `end` breaks the renderer. Read the element first, every time.
- Patching `position` and expecting the shape to move. Shapes draw from
  `element_data.start` / `.end`; move both, and move the attached arrows too.
- Duplicate titles in `hiveboard_sitemap_scaffold`. Titles are the join key, so duplicates are
  a hard 400 and NOTHING is created. Two pages both called "Contact" need disambiguating, for
  example "Contact" and "Contact (Services)".
- A typo in a `parent` value. A dangling parent is silently treated as a root at depth 0, and a
  cycle is silently broken at depth 0. Neither errors. Always check `arrows_created` against
  the number of pages that had a parent.
- Assuming siblings stay grouped under their parent. The scaffold lays each depth out ordered
  by sibling INDEX, so at depth 2 with several parents the first children of every parent come
  first, then the second children, and subtrees interleave with crossing arrows. For a wide
  three-level tree, scaffold one subtree per call with its own `origin.x` instead.
- Re-running the scaffold to "fix" a board. Every call is ADDITIVE, so the second run stacks a
  duplicate tree on top of the first. Delete the board or use a fresh `origin`.
- Zipping bulk-create ids to your input array without checking `invalid`. Invalid rows are
  skipped in the returned id list, so one bad row shifts every id after it and the connections
  attach to the wrong elements.
- Omitting `color`. Default stroke is `#000000` on a default background of `#1F2937`. The
  elements exist, the board looks empty, and you go hunting for a write that actually worked.
- Sticky note colour is a NAME, not a hex, and it is read from `element_data.color`
  (`'yellow'` by default), not from the top-level `color` field. A hex there does not render.
- Expecting arrows from a Miro import. Miro's items endpoint does not return connectors, so
  imports arrive with content and no relationships. Re-wire them yourself, or re-scaffold if
  the board was a sitemap.
- Planning to bulk-clear a board. There is no bulk element delete. Cleanup is one call per
  element, which is why the layout has to be right before the first write.
- Deleting a board to tidy up. `hiveboard_delete` cascades to every element with no restore
  path. Confirm, and `hiveboard_duplicate` first if there is any doubt.

## Deep references - load the one that matches the work

| Reference | Load it when |
|---|---|
| `references/board-recipes.md` | Building any board beyond the three plays above: customer journey maps, org charts, process and swimlane flows, brainstorm and workshop walls, a Miro import you have to re-wire, or a multi-region layout. Carries the full coordinate maths per recipe. |
| `references/element-reference.md` | Writing or patching `element_data` by hand: the exact typed shape per element type, every pass-through field, colour and label handling, and what a malformed payload does to the renderer. |
