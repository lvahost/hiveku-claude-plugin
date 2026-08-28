# Manual layout

Hand-placed geometry for the rare board no scaffold fits: custom card sizes, a layout a
client specified exactly, annotation passes on an existing diagram. Before using anything
here, confirm none of the five scaffolds covers the request (`references/scaffold-reference.md`) —
funnels, sequences, flows, grids, and trees all have one-call builders now, and this file is
the expensive path.

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
| sitemap scaffold frame | 180 x 90 | 240 (`spacing_x` default) | 160 (`spacing_y` default) |

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

## A hand-placed funnel column

`hiveboard_funnel_scaffold` builds this in one call — use these maths only when the client
wants geometry the scaffold cannot express. Boxes 260 wide by 90 tall, one column centred on
x = 0, row pitch 200.

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

Drop-off annotations go to the RIGHT of the arrow so they never overlap a box. The box's
right edge is x = 130, so a text element at `position: { x: 150, y: k * 200 + 120 }` sits
in the gutter beside the connector. Use a warning colour and keep the line short: text
elements have no width and do not wrap.

## A hand-placed sequence with a branch

`hiveboard_sequence_scaffold` builds this in one call, including the diamond and the outcome
row. The manual geometry, for when you need it: steps 220 wide by 80 tall, centred on x = 0,
row pitch 170, with the delay carried on the connector rather than as its own box.

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

Put the channel in the box label (`Email 1: opener`, `SMS follow-up`, `Call task`) and the
timing on the arrow label. A sequence board is read for cadence first, content second. Use a
`diamond` for every decision point, and colour the terminal states differently from the
steps: a "Booked" end state and a "Sequence exhausted" end state should not look like step 6.

## Wiring connections

An arrow with only `start` and `end` is a line that happens to sit between two boxes. An arrow
with `startConnection` / `endConnection` is BOUND to those elements, which is what makes the
diagram survive a human dragging a box around in the UI.

**The default wiring path is `hiveboard_connect`**: shapes first via
`hiveboard_elements_bulk_create`, then one `hiveboard_connect` call with
`{from, to, label?, line_style?, stroke_style?, color?}` per relationship, ids from the bulk
response. Anchors and geometry are solved server-side (side-to-side when the boxes are mostly
apart horizontally, bottom-to-top otherwise, matching the editor's own connection mode). Up
to 500 connections per call; read the returned `skipped` list — each entry carries its
reason. Two caveats from the tool's own contract: a text element has no stored width or
height anywhere, so its box can only be estimated; and connecting TO an arrow or line is
refused.

Write the arrow `element_data` yourself only when you need exact endpoint coordinates or a
specific `controlPoint`. The hand-built shape:

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

The connection shape is `{ shapeId: '<element uuid>', point: 'center' | 'edge' }`. Use
`'edge'`, which is what both the scaffold and the UI's own connection mode write.

Set `start` and `end` to real coordinates even though the connections are present. The stored
coordinates are what gets drawn; the connections are what keeps the endpoints attached when
someone moves a box in the editor. Omit the coordinates and you get an arrow at the origin.

On the hand-built path, wiring is two passes because element ids are generated server-side:

1. Bulk-create the shapes. Read the returned id list, in the order of your valid input rows.
   Check `invalid: 0` first: rejected rows are skipped in that list, so a single bad row
   shifts every id after it and you silently wire the wrong boxes together.
2. Bulk-create the arrows, each with computed `start` / `end` coordinates AND the two
   connection objects. (`hiveboard_connect` exists precisely to remove this id-zipping
   hazard — prefer it whenever server-solved anchors are acceptable.)

If you lost the ids (a scaffold map you did not capture, or an import), do NOT pull the whole
board: `hiveboard_elements_find` queries by type, text, or region, and `hiveboard_outline`
returns every node with its id and label plus the edge list.

## The edit-tool decision rule

`hiveboard_elements_patch` is the default for every edit: it MERGES `element_data` instead of
replacing it, a `move: {dx, dy}` is a real move with the correct per-type semantics (shapes
carry position in `start`/`end`, stickies/text/images in `position`, a pen in every point),
and every arrow bound to something that moved has its endpoints translated by the same delta
across the WHOLE board. Use its `text` field rather than guessing: it writes `label` on a
shape and `content` on a text or sticky. Returns `updated`, `connectors_repaired`, `skipped`
(with reasons) and `not_found`.

`hiveboard_element_update` is a RAW allow-listed column write, kept for exactly two jobs:
replacing an element's ENTIRE `element_data` deliberately (a merge cannot remove keys), and
flipping the raw columns `element_type`, `locked`, or `hidden` (`hidden` is read by no
renderer at all, per the tool's own description). Its two traps, still live:

- `element_data` is replaced wholesale, not merged. The renderer expects the complete typed
  element (`id`, `type`, `shapeType`, `start`, `end`, `color`, `strokeWidth`, `zIndex`, and
  any label fields). Sending a partial object such as `{ label: 'New name' }` strips `start`
  and `end`, and the renderer then crashes on that element. Read the element first
  (`hiveboard_elements_find` with `include_data: true`), change the one field, send the whole
  object back.
- Patching `position` alone does not move a shape. Shapes are drawn from
  `element_data.start` / `.end`; the `position` column is a redundant convenience copy. And a
  move through `element_update` strands every bound arrow at its old coordinates — nothing
  recomputes them on that path. That is the whole reason `hiveboard_elements_patch` exists;
  use it for every move.
