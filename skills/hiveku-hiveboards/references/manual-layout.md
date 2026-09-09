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

Colour is not decoration here. The ground comes from `background_type` alone: `dark` paints
`#1F2937` and every other type paints `#FAFAFA` (`background_color` is stored and rendered by
nothing). The default element stroke is `#000000`, which reads on the default near-white ground
and is invisible on a `dark` board — that is the case `hiveboard_validate`'s
`invisible_elements` check catches. The scaffold palette works on either, because every card
carries its own fill: stroke `#94A3B8`, fill `#0F172A`, label `#E2E8F0`, connectors `#64748B`.
Always pass `color` explicitly, and keep every value inside 20 characters (see
`references/element-reference.md`, Colours).

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

1. Bulk-create the shapes. Map ids back through `results[]`, which carries one entry per INPUT
   row in input order — not through `ids[]`, which holds only what was created, compacted, so a
   single bad row shifts every id after it and you silently wire the wrong boxes together.
   `ids_alignable` in the response is true only when `invalid` is 0.
2. Bulk-create the arrows, each with computed `start` / `end` coordinates AND the two
   connection objects. (`hiveboard_connect` exists precisely to remove this id-zipping
   hazard — prefer it whenever server-solved anchors are acceptable.)

If you lost the ids (a scaffold map you did not capture, or an import), do NOT pull the whole
board: `hiveboard_elements_find` queries by type, text, or region, and `hiveboard_outline`
returns every node with its id and label plus the edge list.

## Re-spacing a row: hiveboard_align

Stop hand-computing deltas for this. `hiveboard_align` aligns and distributes in ONE call,
because both take the same inputs and produce the same deltas.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `element_ids` OR `region` | what to move. Exactly one of the two; both is a 400, neither is a 400. `region` is `{x, y, w, h}` and takes anything OVERLAPPING it. |
| `align` | `left`, `right`, `top`, `bottom`, `center_x`, `center_y` |
| `distribute` | `horizontal` or `vertical` — even GAPS between the current extremes |
| `spacing` | a fixed gap for `distribute` instead of even gaps |
| `dry_run` | return the deltas without writing |

Pass `align`, `distribute`, or both; neither is a 400 naming the valid values. Both together
applies align first and distributes the aligned result, which is the order every editor uses.
The selection needs at least two elements with usable geometry and caps at 500.

Connectors are excluded from the SELECTION — aligning a line independently detaches it from
what it joins — but every connector bound to something that moved is re-anchored, so the arrows
follow. The response is `{matched, moved, connectors_reanchored, applied, failed, deltas}`.

**`deltas` is the undo.** No snapshot is taken, unlike a prune, and that is deliberate: the
move is fully specified by your own selection, and replaying `deltas` negated puts the board
back. It lists only what ACTUALLY moved, so a row the database rejected (reported in `failed`,
which is why one bad row no longer abandons the batch) is not in it and cannot be un-moved into
a position it never held. Use `dry_run` to read the deltas before committing — every delta is
RELATIVE, so running the same alignment twice shifts the selection twice.

## The edit-tool decision rule

`hiveboard_elements_patch` is the default for every edit: it MERGES `element_data` instead of
replacing it, a `move: {dx, dy}` is a real move with the correct per-type semantics (shapes
carry position in `start`/`end`, stickies/text/images in `position`, a pen in every point),
and every arrow bound to something that moved has its endpoints translated by the same delta
across the WHOLE board. Use its `text` field rather than guessing: it writes `label` on a
shape and `content` on a text or sticky. Pass `include_children: true` to drag a frame's
contents with it — `hiveboard_frames` tells you what that is first, and its `straddler_ids`
tells you what will be left behind. Returns `updated`, `connectors_repaired`, `skipped` (this
route declined, with reasons), `failed` (the database rejected that row; the rest of the batch
still landed) and `not_found`.

`hiveboard_element_update` is a RAW allow-listed column write, kept for exactly two jobs:
replacing an element's ENTIRE `element_data` deliberately (a merge cannot remove keys), and
flipping the raw columns `element_type`, `locked`, or `hidden` (`hidden` is read by no
renderer at all, per the tool's own description). Its two traps, now both loud:

- `element_data` is replaced wholesale, not merged, and an INCOMPLETE replacement is a **409**
  rather than a stored row. `{ label: 'New name' }` on a rectangle would leave it with no
  `start` or `end`, so the refusal names the missing keys and points at
  `hiveboard_elements_patch`. It
  used to be accepted, which cost two elements rather than one: the row stored, the element
  vanished, and the renderer's de-duplication on `element_data.id` collapsed two id-stripped
  elements into one. Read the element first (`hiveboard_elements_find` with
  `include_data: true`), change the one field, send the whole object back.
- Patching `position` alone does not move a shape, and returns 200 while doing it. Shapes are
  drawn from `element_data.start` / `.end`, everything else from `element_data.position`; the
  `position` column is a redundant convenience copy that no renderer reads. A move through
  `element_update` also strands every bound arrow at its old coordinates. Use
  `hiveboard_elements_patch` with `move` for every move, and `hiveboard_align` when the move
  is "space these evenly".
