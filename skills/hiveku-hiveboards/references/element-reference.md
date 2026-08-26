# Element reference

What `element_data` actually is, per element type, and what a malformed one does.

The agent-facing input you send is relaxed: `{ type, position, element_data, z_index, rotation,
color, fill_color, stroke_width, font_size, locked, hidden }`. The server normalizes that into
the COMPLETE typed element the dashboard renderer expects, synthesizing the fields you did not
supply. That normalization only runs on CREATE. It does not run on
`hiveboard_element_update`, which is why a patch has to send the whole typed object.

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
| `color` (top level) or `element_data.color` | Stroke. Defaults to `#000000`, which is invisible on the default `#1F2937` board. |
| `fill_color` (top level) or `element_data.fillColor` / `.fill_color` | Fill. Omitted entirely when unset, so the shape renders unfilled. |
| `stroke_width` or `element_data.strokeWidth` | Defaults to 2. |
| `z_index` | Copied to `element_data.zIndex` as well as the column. |

Default sizes when `width` / `height` are omitted: `rectangle` 160 x 100, `circle` 120 x 120,
`diamond` / `triangle` / `hexagon` 140 x 120, `frame` 400 x 300, `line` and `arrow` 200 x 0.
Note the 0 height on connectors: an arrow created from `position` alone with no `end` is a flat
horizontal 200 pixel line, which is almost never what you wanted. Always give a connector an
explicit `start` and `end`.

Optional pass-through fields, copied verbatim onto the shape only when present: `label`,
`labelSize`, `labelColor`, `labelPosition`, `lineStyle`, `controlPoint`, `controlPoint2`,
`angleDirection`, `startConnection`, `endConnection`, `strokeStyle`, `opacity`. Anything not on
that list is dropped silently, so a misspelled key produces an element that looks created and
renders without your styling.

`font_size` is ignored on shapes: the built element stores `font_size: null` regardless. Label
size goes in `element_data.labelSize`.

### Labels on shapes

Every shape type accepts `label`, including `arrow` and `line`, which is how a funnel gets
conversion rates on its connectors and a sequence gets its delays. Labels honour `\n` for a
second line, which is exactly how `hiveboard_sitemap_scaffold` renders a page title above its
path.

The scaffold's own label styling is `labelSize: 14`, `labelColor: '#374151'` on a `fillColor`
of `#0F172A`. That colour pairing is dark text on a dark fill. If scaffolded frame labels read
faint on a given board background, patch `labelColor` to something lighter rather than assuming
the label failed to write.

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
- There is no width or height. Text does not wrap. Budget roughly 8 pixels per character at
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

- Colour is a NAME (`'yellow'` by default), read from `element_data.color`. The top-level
  `color` field is NOT used for sticky notes: the built element stores `color: null`. A hex
  string in `element_data.color` is passed through unchanged and will not render as a note
  colour.
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

## Validation and failure modes

`buildElement` returns an error in exactly two cases: a missing `type`, and a `type` outside
the twelve-name vocabulary (`unsupported element type "<x>"`). Everything else is coerced or
defaulted.

That is a wide funnel, and it is why bad boards look successful:

- A missing `width` silently becomes the type default.
- A misspelled pass-through key is dropped without comment.
- A missing `color` becomes black on a dark board.
- A malformed pen point vanishes from the stroke.
- An empty `content` or `src` creates a real row that renders as nothing.

Route-level behaviour on top of that:

- Single create returns 400 with the builder's error message on an invalid element.
- Bulk create validates row by row. Valid rows are inserted, invalid ones are collected into
  `errors[]` as `{row, error}` with a 1-indexed row number. If EVERY row is invalid the call
  returns 422 with `validation_errors` and nothing is created. If some succeed you get 201 with
  `created`, `invalid`, `errors`, and the created ids.
- The returned id list covers valid rows only, in input order. One rejected row shifts every id
  after it, so check `invalid: 0` before zipping ids back to your input array to wire
  connections. This is the failure that silently connects the wrong boxes.
- Board ids and element ids must be UUIDs or the route returns 400 before touching anything.
- A board id that does not belong to the calling account returns 404, not 403.

## Patching safely

`hiveboard_element_update` writes the allow-listed columns raw. It does not run the builder and
it does not merge JSON.

The safe procedure for any patch:

1. `hiveboard_get({ board_id })` and find the element. Keep its ENTIRE `element_data`.
2. Change the one field you care about in that object, preserving `id`, `type`, `shapeType`,
   `start`, `end`, and every other key already present.
3. Send the whole object back as `element_data`. For a move, also compute new `start` / `end`
   that preserve the original width and height (`width = end.x - start.x`,
   `height = end.y - start.y`) and send the matching `position` so the redundant column stays
   consistent.
4. If the element is a shape with connectors attached, patch each connector's
   `element_data.start` / `.end` in the same pass. Connector endpoints are stored coordinates
   and nothing recomputes them server-side.

Sending a partial `element_data` such as `{ "label": "New name" }` replaces the whole object,
stripping `start` and `end`. A shape without those crashes the renderer on that element rather
than degrading gracefully, which takes down the board view for everyone, not just you.
