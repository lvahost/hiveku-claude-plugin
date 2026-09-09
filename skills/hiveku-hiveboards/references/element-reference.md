# Element reference

What `element_data` actually is, per element type, and what a malformed one does.

The agent-facing input you send is relaxed: `{ type, position, element_data, z_index, rotation,
color, fill_color, stroke_width, font_size, locked, hidden }`. The server normalizes that into
the COMPLETE typed element the dashboard renderer expects, synthesizing the fields you did not
supply. That full normalization only runs on CREATE. `hiveboard_elements_patch` merges into
the stored object (safe for partial edits); `hiveboard_element_update` replaces
`element_data` wholesale, which is why a patch through IT has to send the whole typed object
and is refused with a 409 when it does not. Both edit tools now mirror top-level style fields
into `element_data`; neither synthesizes geometry.

Source of truth: `hiveku_builder/src/lib/hiveboards/element-builder.ts`.

## The two families

Every element type falls into one of two geometry families, and they are addressed differently.

**Shapes** (`rectangle`, `circle`, `diamond`, `triangle`, `hexagon`, `line`, `arrow`, `frame`)
are drawn from `start` and `end`. You supply `position` plus `width` / `height` in
`element_data`, and the server sets `start = position` and `end = { position.x + width,
position.y + height }`. The stored `position` column is a redundant copy of `start`.

**Positioned elements** (`text`, `sticky-note`, `image`, `pen`) are drawn from a `position`
inside `element_data`, with size carried separately where it applies. There is no `start` or
`end`.

That split is the reason patching `position` alone does not move a shape: the renderer never
reads the `position` column for a shape, only `element_data.start` and `.end`.

## Colours

The one contract on this surface that takes a whole board down. Two separate rules.

**Every element except a sticky note and an image.** (An `image` runs no colour
validation at all: it stores both columns null and reports `color` / `fill_color` back in
`ignored_keys`.) `color` and `fill_color` must be a hex value (`#RGB`,
`#RRGGBB`, `#RRGGBBAA`), a CSS colour name like `slategray`, or an `rgb()` / `rgba()` / `hsl()`
/ `hsla()` value — and the whole string must fit **20 characters**, because
`hiveboard_elements.color` and `.fill_color` are `VarChar(20)`. An over-long or unrecognised
value is REFUSED with a sentence naming the field, never truncated: `#1F2937AA` cut to fit is
still a colour, just not the one you asked for, and `rgba(255, 255, 255, 0.5)` (24 characters)
cut to fit is garbage. The refusal is the point — an over-long value that reached Postgres
would be a database error that aborts the ENTIRE bulk write of up to 5000 rows, and the
per-row `errors` array would never reach you. `lightgoldenrodyellow` is exactly 20 characters,
so every CSS name fits; `rgba(...)` with spaces usually does not.

**A sticky note.** `element_data.color` is a NAME from `yellow`, `blue`, `green`, `pink`,
`purple`, `orange` and nothing else. The renderer looks the name up in a table and
dereferences the result, so a miss is `undefined.bg` — it throws and takes the whole board's
render down, not just that note. On CREATE an unrecognised value is coerced to `yellow` and
the swap is reported in `coercions`. On the PATCH paths it is REFUSED rather than mirrored,
and the merge that already copied it into `element_data` is undone, because a 200 that leaves
a board unopenable is worse than a refusal. The top-level `color` / `fill_color` columns are
written null for a sticky either way.

**The ground it all sits on.** `background_type` alone decides the canvas colour: `dark` paints
`#1F2937`, and `honeycomb`, `dot` (the default), `line` and `blank` all paint `#FAFAFA`.
`background_color` is stored on the board and rendered by nothing. So the default board is
near-white — the black default stroke is visible there and invisible on a `dark` board, which
is the case `hiveboard_validate`'s `invisible_elements` check exists to catch.

## Shapes

Typed shape written on create:

```json
{
  "id": "<server uuid>",
  "type": "rectangle",
  "shapeType": "rectangle",
  "start": { "x": -130, "y": 355 },
  "end":   { "x": 130,  "y": 445 },
  "color": "#94A3B8",
  "strokeWidth": 2,
  "zIndex": 0
}
```

Inputs that shape it:

| You send | Effect |
|---|---|
| `position` | Becomes `start`, and the top-left corner of the element. |
| `element_data.width` / `.height` | Drives `end`. Falls back to the type default. |
| `element_data.start` / `.end` | Explicit override. If you pass `start` with a numeric `x`, it wins over `position`. Pass both `start` and `end` to place a connector exactly. |
| `color` (top level) or `element_data.color` | Stroke. Defaults to `#000000`. Safe on the default near-white ground, invisible on a `background_type: 'dark'` board. See Colours above. |
| `fill_color` (top level) or `element_data.fillColor` / `.fill_color` | Fill. Omitted entirely when unset, so the shape renders unfilled. |
| `stroke_width` or `element_data.strokeWidth` | Defaults to 2. |
| `z_index` | Copied to `element_data.zIndex` as well as the column. |

Default sizes when `width` / `height` are omitted: `rectangle` 160 x 100, `circle` 120 x 120,
`diamond` / `triangle` / `hexagon` 140 x 120, `frame` 400 x 300, `line` and `arrow` 200 x 0.
Note the 0 height on connectors: an arrow created from `position` alone with no `end` is a flat
horizontal 200 pixel line, which is almost never what you wanted. Always give a connector an
explicit `start` and `end`.

Optional pass-through fields, copied verbatim onto the shape only when present: `label`,
`text` (an accepted alias for `label`; `label` wins when both are sent), `labelSize`,
`labelColor`, `labelPosition`, `lineStyle`, `controlPoint`, `controlPoint2`, `angleDirection`,
`startConnection`, `endConnection`, `strokeStyle`, `opacity`, `linkTargetBoardId`,
`linkTargetUrl`. Anything not on that list is dropped — but no longer in silence: it comes back
in `ignored_keys` (see below), which is how you learn that `{content: 'Checkout'}` on a
rectangle produced a blank card.

`font_size` is ignored on shapes: the built element stores `font_size: null` regardless, and
sending it puts `font_size` in `ignored_keys`. Label size goes in `element_data.labelSize`.

### Labels on shapes

Every shape type accepts `label`, including `arrow` and `line`, which is how a funnel gets
conversion rates on its connectors and a sequence gets its delays.

**A shape label does NOT honour `\n`.** It is a single SVG `<text>` node and SVG collapses the
newline to a space, so `"Home\n/"` reads as "Home /" on one line, sized for a character that
never appears. `hiveboard_sitemap_scaffold` used to build its frame labels that way; it now
writes the `path` as its own `text` element under the frame, which is the only primitive that
honours `\n`. Do the same for a second line of your own.

The scaffolds label through the diagram engine, which sets `labelSize: 16` and
`labelColor: '#E2E8F0'` on a `fillColor` of `#0F172A` — light text on a dark card, readable on
either board ground. A `frame` is the exception: its tab text is hardcoded `#FFFFFF` in the
renderer and `labelColor` on a frame is computed and then never used, so the tab's readability
comes from the frame's `color`, which paints the tab behind it.

### Connections

`startConnection` and `endConnection` take `{ shapeId: '<element uuid>', point: 'center' |
'edge' }`. Use `'edge'`, which is what the scaffold and the editor's own connection mode write.

A bound connector still needs real `start` and `end` coordinates. The stored coordinates are
what gets drawn. The connection binding is what makes the editor translate that endpoint when a
human drags the attached shape. Nothing recomputes the endpoint server-side, so a connector
whose host box was moved through the API stays where it was until someone drags it in the UI.

Bound connectors also render in a dedicated overlay that paints after the sticky note and image
layers, so their ends never disappear underneath a note. Unbound arrows stay in the main shape
layer and can be occluded. That is a second reason to bind connectors rather than leave them
free-floating.

## Text

```json
{
  "id": "<uuid>",
  "type": "text",
  "position": { "x": 150, "y": 520 },
  "content": "38% drop-off",
  "fontSize": 16,
  "color": "#F87171",
  "zIndex": 0
}
```

- Content comes from `element_data.content`, or `element_data.text` as an accepted alias.
  Neither present means an empty string, and an empty text element is invisible but still
  counts against `element_count`.
- `fontSize` comes from top-level `font_size` or `element_data.fontSize`, defaulting to 16.
- Optional pass-throughs: `fontFamily`, `fontWeight`, `fontStyle`, `textAlign`,
  `textDecoration`.
- There is no width or height, and text does not wrap BY DEFAULT — but it wraps to `maxWidth` when you send one, and the scaffolds set it. Budget roughly 8 pixels per character at
  the default size when deciding whether a label fits in a gutter, and split long annotations
  into several text elements stacked about 24 pixels apart.

## Sticky note

```json
{
  "id": "<uuid>",
  "type": "sticky-note",
  "position": { "x": 0, "y": 0 },
  "content": "Pricing page confuses first-time buyers",
  "color": "yellow",
  "size": { "width": 200, "height": 200 },
  "rotation": 0,
  "zIndex": 0
}
```

- Colour is a NAME (`'yellow'` by default), read from `element_data.color` — or from the
  top-level `color` when `element_data.color` is absent, though the column itself is stored
  null. Anything outside the six names is coerced to yellow on create and refused on the patch
  paths. Full rules under Colours above; it is the failure that takes the board down.
- Size comes from `element_data.size.width` / `.height`, falling back to
  `element_data.width` / `.height`, then to 200 x 200.
- Content accepts `content` or `text`.
- `rotation` is honoured, which is the one place a small rotation genuinely helps: a workshop
  wall of perfectly axis-aligned notes reads as a spreadsheet.

## Image

```json
{
  "id": "<uuid>",
  "type": "image",
  "position": { "x": 0, "y": 0 },
  "src": "https://...",
  "size": { "width": 200, "height": 200 },
  "zIndex": 0
}
```

`src` comes from `element_data.src` and defaults to an empty string, which renders as a broken
box rather than failing the write. Size resolution matches sticky notes. There is no upload
tool in this family, so `src` must already be a reachable URL.

## Pen

```json
{
  "id": "<uuid>",
  "type": "pen",
  "points": [{ "x": 0, "y": 0 }, { "x": 40, "y": 12 }],
  "color": "#94A3B8",
  "strokeWidth": 2,
  "zIndex": 0
}
```

`points` accepts either `{x, y}` objects or `[x, y]` pairs, and the two forms can be mixed in
one array. Anything that is neither is DROPPED SILENTLY, so a malformed point list produces a
shorter stroke with no error. The element's `position` is derived from the first surviving
point, not from the `position` you sent. Pen is for freehand annotation; do not use it to fake
connectors, because a pen stroke cannot carry a connection binding.

## What the builder reports back: ignored_keys and coercions

Every branch of the builder copies from a FIXED list of keys — `element_data` is a typed
renderer contract, not a free bag — and a key the branch does not read used to disappear under
a 201 with no trace. `{type: 'rectangle', element_data: {content: 'Checkout'}}` was a
successful request that produced a blank card. Two fields close that:

- **`ignored_keys`** — every `element_data` key this type does not read (reported under the
  name you used) plus every top-level style field this type writes as null anyway. The read
  lists are: shapes as above; `text` reads `content`/`text`, `fontSize`, `color`, `fontFamily`,
  `fontWeight`, `fontStyle`, `textAlign`, `textDecoration`, `maxWidth`; `sticky-note` reads
  `content`/`text`, `size`, `width`, `height`, `color`; `pen` reads `points`, `color`,
  `strokeWidth`; `image` reads `src`, `size`, `width`, `height`.
- **`coercions`** — every value accepted but CHANGED on the way in, each
  `{field, from, to, reason}`. The common one is a sticky colour that was not one of the six
  names and became yellow. The rest are column clamps: `rotation` to +/-360 at two decimals
  (`Decimal(6,2)`), `stroke_width` to 0-100, `font_size` to 1-400, `z_index` to int4.
  Where the clamped value lands differs by field, and it matters because `element_data` is
  what draws: `stroke_width` and `font_size` are clamped on the COLUMN only and `element_data`
  keeps what you sent, while `rotation` and `z_index` are clamped BEFORE the element is built,
  so the clamped value is what reaches `element_data` too.

Neither ever fails the build. Where they appear: beside `data` on a single create, and inside
each `results[]` row on a bulk create.

## Validation and failure modes

`buildElement` returns an error in three cases: a missing `type`, a `type` outside the
twelve-name vocabulary (`unsupported element type "<x>"`), and a `color` or `fill_color` that
is not a valid colour under 20 characters. Everything else is coerced or defaulted.

That is still a wide funnel, and it is why bad boards look successful:

- A missing `width` silently becomes the type default.
- A missing `color` becomes black — invisible only on a `dark` board.
- A malformed pen point vanishes from the stroke.
- An empty `content` or `src` creates a real row that renders as nothing.

A misspelled pass-through key is the one that no longer hides: it comes back in
`ignored_keys`. Read that array; nobody has ever read it and then shipped a blank card.

Route-level behaviour on top of that:

- Single create returns 400 with the builder's error message on an invalid element.
- Bulk create validates row by row. Valid rows are inserted, invalid ones collected into
  `errors[]` as `{row, error}`, 1-indexed. If EVERY row is invalid the call returns 422 with
  `validation_errors` and nothing is created. Otherwise 201 with `created`, `invalid`,
  `errors`, `ids`, `ids_alignable`, and `results`.
- **Read `results[]`, not `ids[]`.** `results` carries one entry per INPUT row, in input order,
  each `{row, ok, id?, error?, ignored_keys?, coercions?}`, so an id maps back to the thing you
  sent. `ids` holds only what was created, compacted, so one rejected row shifts every id after
  it and hand-wiring from that array attaches your arrows to the wrong boxes. `ids_alignable`
  is the response saying so itself: it is true only when `invalid` is 0, and a call with
  failures also carries a `hint` pointing you at `results`.
- Board ids and element ids must be UUIDs or the route returns 400 before touching anything.
- A board id that does not belong to the calling account returns 404, not 403.

## Patching safely

**Default to `hiveboard_elements_patch`.** It MERGES into the stored `element_data` (a
partial payload cannot strip geometry), `move: {dx, dy}` moves each type by its real
position fields, its `text` field writes `label` on a shape and `content` on a text or
sticky, and every bound connector attached to a moved element is translated by the same
delta board-wide. Pass `include_children: true` on a frame's update and everything inside it
moves too, by the majority-of-area rule; call `hiveboard_frames` first to see what would come
along. Read the current data first with `hiveboard_elements_find` and `include_data: true`,
then patch, then read the four headings in the return, which mean four different things:
`updated` landed, `skipped` this route declined and says why, `failed` the database rejected
(that row is unchanged, the batch continued), `not_found` is not on this board. It returns
`failed[]` rather than throwing mid-batch, so a rejected row can no longer abandon a write you
cannot account for. Cap is 1000 updates per call.

`hiveboard_element_update` writes the allow-listed columns raw. It does not merge JSON. Use it
only to replace an element's ENTIRE `element_data` deliberately (a merge cannot remove keys) or
to flip the raw `element_type` / `locked` / `hidden` columns (`hidden` is read by no renderer).
The safe procedure on that path:

1. `hiveboard_elements_find({ include_data: true })` (or `hiveboard_get`) and find the
   element. Keep its ENTIRE `element_data`.
2. Change the one field you care about in that object, preserving `id`, `type`, `shapeType`,
   `start`, `end`, and every other key already present.
3. Send the whole object back as `element_data`. For a move, do not use this tool at all — see
   the `position` note below.
4. If the element is a shape with connectors attached, patch each connector's
   `element_data.start` / `.end` in the same pass. On THIS path connector endpoints are
   stored coordinates and nothing recomputes them server-side — only
   `hiveboard_elements_patch` repairs them for you.

Two hard behaviours on this route, both changed from what the tool used to do:

- **An incomplete `element_data` is a 409, not a 200.** Sending `{ "label": "New name" }` to a
  rectangle is a replacement with no `start`/`end`, and it is now refused with an error naming
  the missing keys and pointing at `hiveboard_elements_patch`. It used to be stored: the row
  survived, the element vanished from the canvas, and because the renderer de-duplicates on
  `element_data.id`, two elements stripped of their id collapsed into one and a SECOND element
  disappeared with it. The required keys per type are `start` and `end` for a shape,
  `position` for `text` / `sticky-note` / `image`, and a non-empty `points` for a pen. `id`,
  `type` and `shapeType` are re-injected from the stored row, so you do not have to resend
  identity to rename a box.
- **`position` is accepted, stored, and moves nothing.** A shape draws from
  `element_data.start`/`.end` and everything else from `element_data.position`, so a
  position-only write returns 200 against an unchanged canvas. A real move is
  `hiveboard_elements_patch` with `move: {dx, dy}`, which is also what keeps the bound arrows
  attached.

Style fields (`color`, `z_index`, `locked` and friends) ARE mirrored into `element_data` here
now, in both directions, so they take effect instead of writing a column no renderer reads.
`hidden` is the deliberate exception — nothing reads it under any name. A refused colour is a
400 on this route, because it writes one element and there is nothing else in the call to
succeed; on `hiveboard_elements_patch` the same refusal is a `skipped` entry and the rest of
the batch lands.
