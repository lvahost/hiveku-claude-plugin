# Board Recipes: Building Hiveboards Programmatically

Load this before you place a single element on a Hiveboard. The tools are simple, so the
work is not "which tool" but "what numbers". Every board this file covers is the same job:
turn a list of things and the relationships between them into rectangles at computed
coordinates plus arrows in the gutters between them. Get the arithmetic right once and
every board after it is a loop.

The surface is 28 tools; this file covers the manual-build subset. The five one-call
scaffolds (sitemap, funnel, flow, grid, sequence) and the structural read/edit tools
(`hiveboard_outline`, `hiveboard_elements_find`, `hiveboard_connect`,
`hiveboard_elements_patch`, `hiveboard_align`, `hiveboard_elements_prune`) are in
`references/scaffold-reference.md` and `references/manual-layout.md` — rule those out
before hand-computing anything below. `hiveboard_frames` (what is inside each frame) is
Part 6, and the five that check or undo your work (`hiveboard_render`, `hiveboard_validate`,
`hiveboard_versions_list`, `hiveboard_version_get`, `hiveboard_restore_version`) are Part 9.

| Tool | Use it for |
|---|---|
| `hiveboard_create` | Make the canvas. Returns the `board_id` every other call needs. |
| `hiveboard_list` | Find an existing board (`search` matches names server-side), or read `element_count` without pulling elements. |
| `hiveboard_get` | Read a board back: metadata plus EVERY element, z-index ascending. Expensive — prefer `hiveboard_outline` / `hiveboard_elements_find`. |
| `hiveboard_update` | Rename, change background, flip `is_public` (account-visible, not internet), attach/detach `project_id`. Metadata only, never elements. |
| `hiveboard_delete` | Delete the board. Requires `confirm: true`, and cascades to every element AND the whole version history — the only operation here with no way back. The refusal names `element_count` and `version_count` so you can tell the human what they are about to lose. |
| `hiveboard_duplicate` | Clone a board and all its elements. Use it as a "save point" before a risky pass. |
| `hiveboard_element_create` | One element. Use for a fix-up, never for a build. |
| `hiveboard_elements_bulk_create` | Up to 5000 elements in one call. This is the build path. |
| `hiveboard_element_update` | Raw patch of one element. Read the traps in Part 10 first; `hiveboard_elements_patch` is the safer default. |
| `hiveboard_element_delete` | Remove one element by id. For many, `hiveboard_elements_prune`. |
| `hiveboard_sitemap_scaffold` | Auto-place a page tree as frames plus arrows. Up to 500 pages. |
| `hiveboard_import_miro` | Ingest a raw Miro `GET /v2/boards/<id>/items` export. |

`hiveboard_import_miro` is listed for completeness and is out of scope here, with one fact
worth carrying: Miro's items endpoint does not include connectors, so an imported board has
content and no arrows. Re-wire with `hiveboard_outline` (to enumerate orphans) plus
`hiveboard_connect` (bound arrows by id, anchors solved server-side), or re-scaffold if it
was a sitemap.

---

## Part 1: The coordinate model

Eight facts. Every layout bug in this document traces back to one of them.

**1. `position` is the TOP-LEFT corner, and y grows DOWN.**
The server sets `start = {x, y}` and `end = {x + width, y + height}`. It is not a centre
origin. To centre a shape on a point, subtract half the width and half the height yourself.
The tool description used to claim centre-origin, and everything generated against it landed
off by half its size, which for a default rectangle is 80 across and 50 down, with every
connector arrow pointing at corners instead of edges.

**2. `element_data` is the only thing the canvas renders.**
The `position`, `color`, `fill_color`, `z_index`, `stroke_width`, and `font_size` DB columns
exist for query ergonomics. The renderer parses `element_data` and nothing else. On create,
and on both edit tools, the server mirrors your top-level STYLE fields into `element_data`
for you. What no update path synthesizes is GEOMETRY: only create derives `start`/`end` from
`position` + `width`/`height`. See Part 10.

**3. Default sizes, when you omit `width`/`height`.**

| Type | Default w x h |
|---|---|
| `rectangle` | 160 x 100 |
| `circle` | 120 x 120 |
| `diamond`, `triangle`, `hexagon` | 140 x 120 |
| `frame` | 400 x 300 |
| `line`, `arrow` | 200 x 0 |
| `sticky-note` | 200 x 200 |
| `image` | 200 x 200 |

Always pass explicit `width` and `height` inside `element_data` for shapes. A board built on
defaults is a board you cannot compute arrow endpoints for.

**4. An arrow's geometry is `start` and `end`. The connection fields are a separate thing.**
`startConnection` / `endConnection` are `{ shapeId, point: 'edge' | 'center' }`. They do not
place the arrow. They bind it, so that when a human later drags the bound card the arrow's
endpoint translates by the same delta. An arrow with perfect connections and wrong
`start`/`end` renders in the wrong place and stays there. You compute the endpoints.

**5. Only `text` and `sticky-note` handle multiple lines. Shape labels do not.**
A `text` element splits `content` on `\n` and renders one SVG line per entry at
`fontSize * 1.5` spacing. A shape's `label` is a single SVG `<text>` centred on the shape
with no wrapping and no clipping: too long and it simply spills out past the border on both
sides. A `sticky-note` is real HTML with `whitespace-pre-wrap`, so it is the only element
that wraps by itself.

**6. Text width is estimated as `charCount * fontSize * 0.6`.**
That formula is what the canvas itself uses for bounding boxes and alignment, so use the same
one. The chars that fit inside a shape of width `W` at label size `S`:

```
maxChars = floor(W / (S * 0.6))
```

At the recipe defaults below (W=240, labelSize=16) that is 25 characters. Budget for it or
the label overhangs the card.

**7. `color` and `fill_color` are `VarChar(20)`, `stroke_width` and `font_size` are `Int`.**
A 7-character hex is safe. `rgba(15, 23, 42, 0.85)` is 22 characters and is REFUSED at build
time with a sentence naming the field — it is not truncated and it never reaches Postgres,
because one over-long value in a 5000-row `createMany` aborts the whole batch as an unhandled
500 and the per-row errors never reach you. `rotation` is `Decimal(6,2)` and is clamped to
+/-360 at two decimals; `stroke_width` is clamped to 0-100 and `font_size` to 1-400. Every
clamp comes back in `coercions`. Full rules in `references/element-reference.md`, Colours.

**8. Layers are not one flat z-order.**
Shapes, text, and pen drawings share ONE pool sorted by `element_data.zIndex` ascending.
Images render in their own HTML layer above that pool. Sticky notes render in their own HTML
layer above the images. And any arrow or line carrying `startConnection` or `endConnection`
is lifted into a second SVG that paints above everything.

Consequences you will hit:
- A `text` label at `z_index: 0` behind a filled rectangle at `z_index: 5` is invisible.
  Labels always get a higher `z_index` than the shape they sit on, or use the shape's own
  `label` field instead of a separate text element.
- A sticky note cannot be tucked behind a shape, whatever `z_index` you give it.
- A bound connector always paints on top. That is usually what you want, and it is why
  `hiveboard_sitemap_scaffold` gives every arrow `z_index: 10000` for consistency.

---

## Part 2: The one grid every recipe uses

Pick a card size and a gutter, derive everything else. These are the numbers used throughout
this file. They are chosen so 25 characters fit on one line and connectors get 80px of clear
gutter, which is enough for a readable arrowhead plus a mid-arrow label pill.

```
CARD_W     = 240
CARD_H     = 120
GUTTER     = 80
COL_PITCH  = CARD_W + GUTTER = 320
ROW_PITCH  = CARD_H + GUTTER = 200
```

**Card top-left at column `c`, row `r`, from an origin:**

```
x = originX + c * COL_PITCH
y = originY + r * ROW_PITCH
```

**Derived anchors for a card at `(x, y)`:**

```
centre      = (x + 120, y + 60)
top-mid     = (x + 120, y)
bottom-mid  = (x + 120, y + 120)
left-mid    = (x,       y + 60)
right-mid   = (x + 240, y + 60)
```

**A vertical connector, row `r` to row `r+1`, same column:**

```
start = (x + CARD_W/2, y + CARD_H)     = (x + 120, y + 120)
end   = (x + CARD_W/2, y + ROW_PITCH)  = (x + 120, y + 200)
```

**A horizontal connector, column `c` to column `c+1`, same row:**

```
start = (x + CARD_W,   y + CARD_H/2)   = (x + 240, y + 60)
end   = (x + COL_PITCH, y + CARD_H/2)  = (x + 320, y + 60)
```

Both land exactly in the 80px gutter. Nothing overlaps a card, ever, because the arrow spans
`GUTTER` and the gutter is by definition empty.

**Centring a row of `n` cards on a vertical axis `AXIS_X`** (needed for trees and fan-outs):

```
rowWidth = n * CARD_W + (n - 1) * GUTTER = n * COL_PITCH - GUTTER
x0       = AXIS_X - rowWidth / 2
card i   = x0 + i * COL_PITCH
```

Worked: 3 cards on `AXIS_X = 0`. `rowWidth = 3*320 - 80 = 880`, `x0 = -440`, cards at
`-440`, `-120`, `200`.

**Sizing a frame to enclose a block.** Take the min and max of every enclosed card's
`(x, y)` and `(x + w, y + h)`, then pad by 40 on every side. Remember the frame's title tab
sits in the 24px band ABOVE its top edge, so leave 24 more above a frame or the tab collides
with whatever is up there.

---

## Part 3: Recipe A, sitemap

### The fast path

`hiveboard_sitemap_scaffold` does the whole tree in one call. Parameters:
`board_id`, `pages`, `layout` (`'vertical'` default, root at top, or `'horizontal'`),
`spacing_x` (default 240), `spacing_y` (default 160), `pack_subtrees` (see below),
`origin` (default `{x: 0, y: 0}`), `dry_run` (derive the layout and write nothing — see
`references/scaffold-reference.md`).

`pages` accepts EITHER shape and the server detects which you sent:

```json
{ "pages": [
  { "title": "Home", "path": "/" },
  { "title": "About", "path": "/about", "parent": "Home" },
  { "title": "Team", "path": "/about/team", "parent": "About" }
] }
```

or nested with `children: [...]` — one shape for the whole array, never both, because a
payload that mixes them is now a 400 naming both offending pages. Max 500 pages. It is
additive: it never deletes existing board content. It returns `title_to_element_id`, which is
the map you need to patch individual frames afterwards, so keep it.

What it produces, with numbers you should know before you look at the result:
- Each page becomes a `frame` **180 wide by 90 tall** (not your grid, its own constants),
  stroke `#94A3B8`, fill `#0F172A`, `labelSize: 14`.
- The label is the `title`. A `path` is a SEPARATE `text` element under the frame, 13px, wrapped
  to the frame width — so a page with a path costs two elements and `pages_created` counts only
  the frames.
- Parent to child arrows, `lineStyle: 'curved'`, colour `#64748B`, `z_index: 10000`, bound
  at both ends with `point: 'edge'`.

**Titles are the primary key.** The server keys parent-of by title, so a duplicate title
fails the whole call with `duplicate page title "<t>"`. A `parent` naming a page that is not
in the list is still treated as a root — but it is REPORTED, in `dangling_parents` as
`{title, parent}`. Read that array rather than reverse-engineering a low `arrows_created`:
it is the field that tells you a typo turned a child into a second top-level page.

**Worked scaffold, defaults, so you know what the output looks like.**
Pages: Home; About, Services, Contact (children of Home); Team (child of About).

Depth rows are centred on `origin.x`, which is 0:

```
depth 0: 1 page.  width = 0.     startX = 0.      Home     centre (0, 0)
depth 1: 3 pages. width = 480.   startX = -240.   About    centre (-240, 160)
                                                   Services centre (0, 160)
                                                   Contact  centre (240, 160)
depth 2: 1 page.  width = 0.     startX = 0.      Team     centre (0, 320)
```

Frames are placed top-left, so subtract 90 and 45:

```
Home     (-90, -45)
About    (-330, 115)   Services (-90, 115)   Contact (150, 115)
Team     (-90, 275)
```

### Two hazards in the fast path you must plan around

**The DEFAULT layout centres rows on the origin, not under their parent.** Team is a child
of About at x = -240, but depth 2 has one member so it centres on x = 0, landing directly
under Services. Its arrow then runs diagonally from About's bottom edge across the Services
frame. Any tree that is not a balanced pyramid comes out visually wrong THAT WAY. The fix is
now built in: pass `pack_subtrees: true` and every subtree gets a contiguous band with the
parent centred over its own children (off by default only so existing boards do not change
shape). Fall back to the manual path with Part 2's centring formula per PARENT subtree only
when you need custom card sizes on top.

**The curved arrows bulge up and to the right.** The scaffold sets `lineStyle: 'curved'` and
no `controlPoint`, and the renderer's fallback control point is
`{ x: midX + 50, y: midY - 50 }`. On the Home to About arrow, `start = (0, 45)` and
`end = (-240, 115)`, so the control point is `(-70, 30)`, ABOVE the parent's bottom edge.
Every connector arcs back over its parent. It reads as decoration on a small tree and as a
tangle on a wide one.

Fix either by patching each arrow's `element_data` with an explicit `controlPoint` (Part 10
tells you how to patch without destroying the element), or by skipping the scaffold and
building manually with `lineStyle: 'straight'`.

### The manual path

Use it whenever the tree is unbalanced, or the client wants your card size, colour, or extra
per-page annotation. Assign each node a subtree width bottom-up, then place top-down:

```
subtreeWidth(node) = max(CARD_W, sum(subtreeWidth(children)) + GUTTER * (children - 1))
```

Place the root centred on `AXIS_X`, then hand each child a slice of the parent's span in
order and centre it in its slice. Rows use `ROW_PITCH`, connectors use the vertical formula
from Part 2. Source the page list from `pages_list({ project_id })` so the board matches the
site that actually exists, not the one in someone's head.

---

## Part 4: Recipe B, marketing funnel

**Fast path first:** `hiveboard_funnel_scaffold` builds all of this in one call — cards,
rates on the connectors, drop-off callouts, biggest-leak highlight, proportional widths —
from stage counts alone (`references/scaffold-reference.md`). Use the manual recipe below
only for geometry it cannot express.

A manual funnel is one centred column, top to bottom, with metrics beside each stage and
callouts outside the column. Narrowing the cards to suggest a funnel shape is optional and
costs you the fixed-width arithmetic, so only do it if asked.

**Elements**
- One `rectangle` per stage, `label` = stage name, `labelSize: 16`.
- One `arrow` per transition, `label` = the conversion rate. Arrow labels render on a
  hardcoded white pill, so they stay readable over any board ground.
- One `text` per stage for the metric, placed right of the card. Multi-line via `\n` when you
  need a number and a unit.
- One `sticky-note` per insight or open question, outside the column.
- One `frame` around the column so the whole thing has a title and reads as a unit.

**Coordinates** (column at `x = 0`, stage `i`):

```
card i      : (0, i * 200), 240 x 120
arrow i     : start (120, i*200 + 120)  ->  end (120, (i+1) * 200)
metric text : (264, i*200 + 66)
```

`264` is `CARD_W + 24`. `+66` centres a 16px single line on the card's centre at
`i*200 + 60`: a text element's `y` is the BASELINE of its first line, with no
`dominant-baseline`, so vertical centring is `centreY + fontSize * 0.35`.

**Colours.** The board's ground comes from `background_type` alone: `dark` paints `#1F2937`
and every other type paints `#FAFAFA`. A shape with no `fill_color` renders `fill: none`,
fully transparent, so its label floats over whichever ground it sits on with only an outline
around it. That is a legitimate look, but decide it rather than discover it.

A palette that carries its own dark fill, so it reads on either ground, all within
`VarChar(20)`:

| Role | stroke (`color`) | fill (`fill_color`) | `labelColor` |
|---|---|---|---|
| Stage card | `#94A3B8` | `#0F172A` | `#E2E8F0` |
| Highlighted stage | `#F59E0B` | `#1C1917` | `#FDE68A` |
| Connector | `#64748B` | none | `#000000` (on the white pill) |
| Frame | `#94A3B8` | `#0F172A` | ignored, see Part 10 |

**Where the funnel data comes from.** `crm_pipeline_stage_summary` gives per-stage open-deal
counts and dollar totals for a pipeline (defaults to the oldest pipeline when `pipeline_id`
is omitted), and `crm_list_pipelines` gives every pipeline with its stages and deal counts.
`customer_journey_get` fetches a stored journey map. Pull the real numbers before you draw;
a funnel board with invented percentages is worse than no board.

---

## Part 5: Recipe C, sales sequence

**Fast path first:** `hiveboard_sequence_scaffold` builds the cadence in one call — a card
per touch stamped with its absolute day offset, waits on the connectors, `on_reply` fork
diamonds, a goal terminator (`references/scaffold-reference.md`). Use the manual recipe
below only for geometry it cannot express.

A manual sequence runs left to right, one column per touch, with a decision diamond wherever
the path forks on a reply.

**Elements**
- `rectangle` per touch: `label` = "Day 0 email", "Day 3 LinkedIn", "Day 7 call".
- `diamond` per branch point. Default 140 x 120, so pass explicit dimensions if you want it
  on the same visual rhythm as the cards. A 160 x 120 diamond centred in the column slot
  sits at `x + 40` where `x` is the column's card origin.
- `arrow` per edge, `label` = the branch condition ("replied", "no reply").
- `sticky-note` per copy block, below its touch, so the message body lives next to the step.

**Coordinates.** Main line at `y = 0`, replied branch at `y = -200`, no-reply continues on
`y = 0`. Touch `i` at column `i`:

```
card i     : (i * 320, 0), 240 x 120
forward    : start (i*320 + 240, 60)  ->  end ((i+1) * 320, 60)
```

Fan out of the diamond at column `d` (top-left `(d*320 + 40, 0)`, 160 x 120, so its
right-mid is `(d*320 + 200, 60)` and its top-mid is `(d*320 + 120, 0)`). Both branches target
column `d+1`. The replied card's top-left is `((d+1)*320, -200)`, so it spans `y = -200` to
`-80`, with bottom-mid `((d+1)*320 + 120, -80)` and left-mid `((d+1)*320, -140)`. The no-reply
card's top-left is `((d+1)*320, 0)`, with left-mid `((d+1)*320, 60)`.

Fan out with one `straight` arrow per branch, each landing on an EDGE anchor of its target,
never on the target's centre:

```
replied   : start (d*320 + 120, 0)   ->  end ((d+1)*320 + 120, -80)   target bottom-mid
no reply  : start (d*320 + 200, 60)  ->  end ((d+1)*320, 60)          target left-mid
```

The `no reply` run is horizontal across a clear 120px gutter, from the diamond's right edge to
the next card's left edge. The `replied` run is a diagonal that clears the top of the
column-`d+1` main-row card: at `x = (d+1)*320` it is at `y = -50`, above that card's `y = 0`
top edge.

If you want the replied branch orthogonal instead, route it as TWO arrows that meet on the
branch row's centre line at `y = -140`, not at the row's bottom edge:

```
up        : start (d*320 + 120, 0)     ->  end (d*320 + 120, -140)
across    : start (d*320 + 120, -140)  ->  end ((d+1)*320, -140)      target left-mid
```

Both ends of `across` sit at `y = -140`, so it really is horizontal, and it stops on the
target's left edge rather than inside the card. That route only works while column `d` of the
branch row is empty, which it is whenever the branch starts one column after the diamond.
Either way, two `straight` arrows beat one clever `angled` one, for the reason in Part 7.

**Copy stickies.** Place them at `(i * 320 + 20, 180)` at 200 x 200. That is 60px below the
card bottom, inside the column, and leaves the horizontal connector gutter clear. Budget
about 180 characters for a 200 x 200 sticky: `p-4` padding plus a 2px border leaves 164px
each way, which at the rendered 14px handwriting face is roughly 8 lines of 23 characters.
Past that the note scrolls internally and the overflow is invisible until someone clicks it.

**Where the sequence data comes from.** `email_sequence_list` for the sequences on the
account, then `email_sequence_get` with `include=steps` to inline the step list. Draw the
sequence that is live, not a redesign of it, unless the redesign is the deliverable.

---

## Part 6: Recipe D, org and process map

**Fast paths first:** an org chart is `hiveboard_sitemap_scaffold` with `pack_subtrees: true`;
a process, user-flow, or swimlane map is `hiveboard_flow_scaffold` (nodes + edges + optional
`lanes`, cycles drawn dashed, multi-parent nodes supported —
`references/scaffold-reference.md`). Use the manual recipes below only for geometry those
cannot express.

Two layouts share one set of primitives.

**Org chart** is Recipe A's manual path with different labels: `subtreeWidth` bottom-up, place
top-down, vertical connectors. Use `label` for the role and a second `text` element beneath
the card for the person's name if you need both, since a shape label will not wrap onto a
second line. Give that text a HIGHER `z_index` than the card or the fill swallows it.

**Process map with swimlanes** is where frames earn their place:

```
LANE_H     = 240
LANE_PAD   = 60
lane j top-left  : (originX, originY + j * LANE_H)
lane j frame     : width = totalColumns * COL_PITCH - GUTTER + 2 * LANE_PAD
                   height = LANE_H - 40
card in lane j, column c : (originX + LANE_PAD + c * COL_PITCH,
                            originY + j * LANE_H + LANE_PAD)
```

`LANE_H = 240` against `CARD_H = 120` leaves 120px of vertical breathing room, which absorbs
the 24px title tab of the NEXT lane's frame plus a cross-lane connector.

**Primitives to use:**

| Element | For |
|---|---|
| `frame` | A swimlane, or a phase boundary. Its title tab is its label. |
| `rectangle` | A step or a role. |
| `diamond` | A decision. Label it as a question, and label both outgoing arrows. |
| `hexagon` | A handoff to another team or system. |
| `circle` | Start and end terminators. |
| `arrow` | Flow. |
| `sticky-note` | An owner, an SLA, an open question. |

**A frame has no parent column, but it does have members.** There is no parent field on the
row: deleting a frame leaves what is inside it, and duplicating the board copies everything
independently. But membership is knowable and always was — the editor has always dragged a
frame's contents with it, by a majority-of-area rule, and `hiveboard_frames` now answers that
same question from the API: per frame, its `box`, `child_ids` (at least half the element's area
inside), and `straddler_ids` (overlapping but mostly outside, so they will NOT come along —
almost always an accident, and invisible until someone drags the frame). Pair it with
`include_children: true` on `hiveboard_elements_patch` to move a lane and its steps together.
A frame inside a frame is a layout device, not a child, and is never listed as one.

**Cross-lane connectors** run vertically between lanes and land in the inter-lane space by
construction, since a card occupies `LANE_PAD` to `LANE_PAD + CARD_H` inside a `LANE_H` band.
From lane `j` column `c` down to lane `j+1` column `c`:

```
start = (x + 120, y + 120)
end   = (x + 120, y + LANE_H)
```

which spans 120px of clear space.

---

## Part 7: The full worked example, real numbers

A 10-element funnel board. Copy the numbers, change the strings.

### Step 1: create the board

```
hiveboard_create({
  name: "Q3 Lead Funnel",
  description: "Awareness to closed-won, Q3 actuals",
  project_id: "<optional website project uuid>",
  background_type: "dot"
})
```

Returns `data.id`. That is `board_id` for everything below. `project_id` is optional; pass it
when the board belongs to a site so `hiveboard_list({ project_id })` finds it later.

`background_type` is one of `honeycomb`, `dot` (default), `line`, `blank`, `dark`. The old
`grid` and `none` are legacy aliases, still accepted and mapped to `line` and `blank`. Do not
pass `background_color`: it is stored on the row and rendered by nothing, and the response
says so in `background_color_note`. For a dark canvas, `background_type: "dark"`.

### Step 2: the cards, frame, labels, and callout, in ONE bulk call

Layout: frame from `(-40, -40)` spanning 480 x 600. Three cards in a column at `x = 0`,
`y = 0 / 200 / 400`. Metric texts at `x = 264`. Sticky beside the frame at `x = 480`.

```
hiveboard_elements_bulk_create({
  board_id: "<board_id>",
  elements: [
    { type: "frame", position: { x: -40, y: -40 }, z_index: 0,
      color: "#94A3B8", fill_color: "#0F172A", stroke_width: 2,
      element_data: { width: 480, height: 600, label: "Q3 Lead Funnel", labelSize: 16 } },

    { type: "rectangle", position: { x: 0, y: 0 }, z_index: 10,
      color: "#94A3B8", fill_color: "#0F172A", stroke_width: 2,
      element_data: { width: 240, height: 120, label: "Awareness",
                      labelSize: 16, labelColor: "#E2E8F0" } },

    { type: "rectangle", position: { x: 0, y: 200 }, z_index: 10,
      color: "#F59E0B", fill_color: "#1C1917", stroke_width: 2,
      element_data: { width: 240, height: 120, label: "Consideration",
                      labelSize: 16, labelColor: "#FDE68A" } },

    { type: "rectangle", position: { x: 0, y: 400 }, z_index: 10,
      color: "#94A3B8", fill_color: "#0F172A", stroke_width: 2,
      element_data: { width: 240, height: 120, label: "Decision",
                      labelSize: 16, labelColor: "#E2E8F0" } },

    { type: "text", position: { x: 264, y: 66 },  z_index: 20,
      color: "#E2E8F0", font_size: 16, element_data: { content: "12,400 sessions" } },
    { type: "text", position: { x: 264, y: 266 }, z_index: 20,
      color: "#E2E8F0", font_size: 16, element_data: { content: "1,180 leads" } },
    { type: "text", position: { x: 264, y: 466 }, z_index: 20,
      color: "#E2E8F0", font_size: 16, element_data: { content: "94 closed won" } },

    { type: "sticky-note", position: { x: 480, y: 180 }, z_index: 30,
      element_data: { width: 200, height: 200, color: "yellow",
                      content: "Consideration is the leak.\n9.5% through vs 24% for the\nrest of the portfolio." } }
  ]
})
```

Check the arithmetic once:
- Metric baseline `66` = card centre `60` plus `16 * 0.35`.
- Longest label is "Consideration", 13 characters, which at `labelSize 16` estimates
  `13 * 16 * 0.6 = 125px` against a 240px card. Comfortable.
- Longest metric is "12,400 sessions", 15 characters at 16px, estimating 144px, so it runs
  from x=264 to x=408, inside the frame's right edge at x=440.
- The sticky at x=480 sits 40px clear of the frame.

The response is `{ created, invalid, errors[], ids[], ids_alignable, results[] }`.
**Map ids through `results`, not `ids`.** `results` has one entry per INPUT row in input order
— `{row, ok, id?, error?, ignored_keys?, coercions?}` — so an id maps back to the thing you
sent. `ids` holds only the rows that were written, compacted, so one bad row shifts every id
after it and any id you pull out is the wrong element; `ids_alignable` is true only when
`invalid` is 0. When it is not zero, read `errors[]` (each `{row, error}`, 1-based), fix, and
because the call is ADDITIVE, delete the elements it did create before retrying, or you get
duplicates on top of each other.

Read `ignored_keys` and `coercions` on the rows that DID succeed, too: they name a key this
element type never read (a `content` on a rectangle, which is a blank card) and a value that
was rewritten (a sticky colour that was not one of the six names and became yellow).

If EVERY row is invalid you get 422 with `validation_errors` and nothing is written.

### Step 3: the arrows, in a SECOND bulk call

Arrows need the card ids, and you cannot reference an id created in the same call. So cards
first, then arrows. Taking the ids from `results[]` rows 2, 3 and 4 — Awareness, Consideration,
Decision — which is safe whether or not a row failed:

```
hiveboard_elements_bulk_create({
  board_id: "<board_id>",
  elements: [
    { type: "arrow", position: { x: 120, y: 120 }, z_index: 10000,
      color: "#64748B", stroke_width: 2,
      element_data: {
        start: { x: 120, y: 120 }, end: { x: 120, y: 200 },
        lineStyle: "straight", label: "9.5%", labelSize: 14,
        startConnection: { shapeId: "<awareness id>", point: "edge" },
        endConnection:   { shapeId: "<consideration id>", point: "edge" }
      } },
    { type: "arrow", position: { x: 120, y: 320 }, z_index: 10000,
      color: "#64748B", stroke_width: 2,
      element_data: {
        start: { x: 120, y: 320 }, end: { x: 120, y: 400 },
        lineStyle: "straight", label: "8.0%", labelSize: 14,
        startConnection: { shapeId: "<consideration id>", point: "edge" },
        endConnection:   { shapeId: "<decision id>", point: "edge" }
      } }
  ]
})
```

Set `position` to the same value as `element_data.start`. The server would synthesize
`start` from `position` if you omitted it, but stating both keeps the row's `position`
column consistent with what renders, which is what you filter and eyeball on read-back.

**Use `lineStyle: 'straight'` for axis-aligned connectors.** The other two styles both
misbehave here:
- `'curved'` with no `controlPoint` gets the `{ midX + 50, midY - 50 }` fallback, so a
  vertical arrow bulges up and to the right instead of running straight down.
- `'angled'` renders as horizontal, then vertical, then horizontal, pivoting on
  `controlPoint.x` alone. When `start.x === end.x === controlPoint.x` the path collapses to
  a straight vertical line, which looks right, but the arrowhead angle is computed as
  `end.x > controlPoint.x ? 0 : PI`, which is false, so the head points LEFT on a downward
  arrow. Note also that `angleDirection` is stored but is not used by the arrow renderer.

Use `'curved'` only for a deliberate arc, and then always pass an explicit `controlPoint`.

---

## Part 8: Scaling it

**Caps.** `hiveboard_elements_bulk_create` takes 5000 elements per call and the route allows
up to 120 seconds. `hiveboard_sitemap_scaffold` takes 500 pages. The workflow node versions
are stricter: `hiveboardElementsBulkCreate` caps at 200 elements and 500KB of serialized
payload, and `hiveboardSitemapScaffold` at 200 pages, deliberately, because node output is
persisted into the run record.

**Chunking.** Bulk is additive and NOT atomic across calls. Chunk at 500 to 1000 elements so
a failure loses one chunk rather than the batch, and so you can inspect between chunks. Keep
the order: every layer of cards before the arrows that reference them.

**A safe order for a large board:**
1. Frames and background bands, `z_index` 0 to 9.
2. Cards and shapes, `z_index` 10 to 99, chunked. Collect `ids` per chunk, asserting
   `invalid === 0` each time.
3. Text labels that sit on top of shapes, `z_index` 100 to 999.
4. Arrows, `z_index` 10000, in their own chunks, referencing the ids from step 2.
5. Sticky notes last. They paint above everything anyway, so their `z_index` is only about
   ordering them against each other.

**Plan the pass before you write it, then take a save point.** Every scaffold takes
`dry_run: true`, which returns the geometry, the extent, and `would_collide_with` for the
elements already on the board — one call that tells you whether a 2000-element pass will land
on top of the last one. For a hand-built pass there is no dry run, so
`hiveboard_duplicate({ board_id, name })` clones the board and every element and turns the
worst case into a rename.

If it comes out wrong anyway, the recovery is `hiveboard_elements_prune` on the bad pass's
region or ids (`confirm: true`; it snapshots to version history first and returns
`snapshot_version_id` — NULL means NOT recoverable, say so), or `hiveboard_restore_version` if
the board had a saved version before the pass. Never `hiveboard_delete`: it takes the version
history with it.

**Growing the grid.** Every number in Part 2 derives from `CARD_W`, `CARD_H`, and `GUTTER`.
To fit more on screen, shrink `CARD_W` and re-derive `maxChars = floor(CARD_W / (labelSize *
0.6))`, then shorten the labels to match. Do not shrink `GUTTER` below about 60: the arrow
label pill is `labelSize + 8` tall and `chars * labelSize * 0.6 + 8` wide, and it will start
overlapping cards.

**Multiple boards beat one enormous board.** `hiveboard_get` returns EVERY element with no
pagination, so a 3000-element board is a very large payload every time you verify it — and
`hiveboard_outline` caps at 2000 nodes. Split by phase or department and cross-reference by
name.

---

## Part 9: Verifying, and getting the board back

Never declare a board done without checking it. Almost every defect this surface produces
returns 200 and looks successful, so counting elements proves nothing. There are three checks
and they answer different questions; run the first two on anything you built.

**1. What is WRONG with it: `hiveboard_validate({ board_id })`.** A lint pass, read-only and
free. Seven checks: `malformed_elements` (no derivable box — act on this first; the renderer
dereferences `shape.start.x` and the WHOLE board fails to render), `invisible_elements` (an
element the colour of the ground it sits on, including the default near-black on a `dark`
board), `text_overflow` (with `visibility`: `visible_bleed` a reader will notice,
`hidden_scroll` a sticky scrolling internally that nobody will), `dangling_connectors` (bound
to an id no longer on the board), `unbound_connectors`, `collisions`, `backwards_edges`.
`ok` is true when nothing structural is broken; warnings can be fine, and `backwards_edges` is
INFO — author intent is recorded nowhere, so a deliberate feedback loop and a mistake look
identical. It works on a board far too large to photograph legibly.

**2. What it LOOKS like: `hiveboard_render({ board_id })`.** Returns a PNG of the real canvas
— the same renderer a human opens — and inlines it, so you look at what you built instead of
verifying it by coordinate arithmetic. Overlapping labels, text bleeding out of a card and a
funnel that does not read as a funnel are invisible to any amount of checking x/y/w/h. Frame
part of a big board with `region` or `element_ids` (not both) rather than fitting everything
until the text is unreadable. `overflow[]` comes back measured in the real browser from the
same paint. A FAILED render never returns an image: you get a non-2xx with a `reason` and a
`hint`, because a blank picture beside a 200 is indistinguishable from an empty board;
`blank: true` on a SUCCESS means the board genuinely has no elements. It costs a headless
capture and 5-15s, so it is a deliberate call, not a free read.

**3. What it MEANS: `hiveboard_outline({ board_id })`.** The node list, the edge list,
`unbound_connectors`, `orphan_count`, the board `extent` and `next_origin`, at a fraction of
the token cost of a full pull. It answers "is everything connected to what I meant", which is
the one question a picture cannot answer precisely. For one element, `hiveboard_elements_find`
by type, text, or region.

**The cheap pre-check.** `hiveboard_list({ project_id })` returns summary cards including
`element_count`. Treat it as a hint, not truth: bulk create increments it by the created count,
single delete decrements by one, and the dashboard's own save path overwrites it wholesale.

**Full pull, last resort.** `hiveboard_get({ board_id })` returns metadata plus every
element ordered by `z_index` ascending, each as `{ id, element_type, element_data, position,
z_index, rotation, color, fill_color, stroke_width, font_size, locked, hidden }`. It also
carries `workshop_state`, which holds the dot-vote ledger and the session timer — a frozen
tally is what a facilitated workshop leaves behind, so that is how you report what the room
chose.

Assertions still worth running by hand over that array — the ones `hiveboard_validate` does
not make for you:

| Check | Why |
|---|---|
| Count and per-`element_type` counts match your plan | Catches a dropped chunk or a silent `invalid` row. |
| No shape has `start.x === end.x && start.y === end.y` | A zero-size shape means `width`/`height` never arrived. It is drawable, so validate does not call it malformed. |
| Every card's `element_data.start` equals its `position` | They diverge only if something patched one and not the other. |
| Every arrow's `start` and `end` land in a gutter, not inside a card box | The single most common layout bug, and geometry validate does not judge. |

Overlapping cards, connectors bound to ids that are gone, and labels wider than their box are
all `hiveboard_validate` findings (`collisions`, `dangling_connectors`, `text_overflow`) — ask
it rather than recomputing them. A sticky colour outside the six names can no longer reach the
database at all: create coerces it, the patch paths refuse it.

Compute the board's bounding box from every element while you are there and report it — or
just read `extent` from `hiveboard_outline`. It is what tells you whether the board fits a
screen or needs splitting, and a wildly wrong min or max is a fast way to spot one element
left at `(0, 0)` by a missing `position`.

**One more thing to check before you write, not after.** If a teammate has the board open in
the dashboard, its autosave can PATCH the whole element array, which the dashboard route
implements as a delete-then-recreate of every element on the board. A stale open tab can
therefore wipe elements you just added over MCP. Ask the user to close or reload the board
tab before a large build, and re-read afterwards to confirm your elements survived.

**When the check comes back bad, the board is not necessarily a rebuild.**
`hiveboard_versions_list` is the undo this surface used to lack. Versions are written by the
dashboard autosave and by the pre-prune snapshot, so an agent-built board nobody has opened may
legitimately have none — check before you promise a rollback. The page size is 50 and is not
configurable; `truncated` says when you are seeing only the newest.

`hiveboard_version_get` tells you what a restore would COST before you take it. Read
`would_degrade`: a snapshot can hold rows whose type no renderer draws, which restore as
database rows that never appear, plus rows that would stack at the origin for want of a
position and rows that would fall back to black. `snapshot_format` is `columns | wire | mixed`;
both formats are real and restore takes either, and `mixed` means the same board was written
through both paths. The snapshot payload itself is off by default because it is unbounded.

`hiveboard_restore_version` needs `confirm: true` and deletes every element before recreating
from the snapshot — and **it is itself reversible**: the current canvas is snapshotted first,
in the same transaction, and comes back as `pre_restore_version_id`. It refuses with a 409
`restore_would_be_lossy` when more than a fifth of the snapshot will not draw; `accept_lossy:
true` takes the partial restore anyway, which is often the right call but should be a decision.
Check `restored` (what was actually inserted) and `degraded` afterwards: a 200 does not mean
the board looks like it did.

---

## Part 10: Pitfalls, ranked by how much they cost

**1. A partial `element_data` through `hiveboard_element_update` is a 409 now, not a 200.**
That tool REPLACES `element_data` wholesale; it does not merge and it does not synthesize
`start`/`end`. Sending `element_data: { label: "New name" }` to a rectangle is a replacement
with no geometry, and it is refused with an error naming the missing keys and pointing at
`hiveboard_elements_patch`. It used to be stored, and it cost two elements rather than one:
the row survived with the element gone from the canvas, and because the renderer de-duplicates
on `element_data.id`, two id-stripped elements collapsed into one and a second element
disappeared. `id`, `type` and `shapeType` are re-injected from the stored row.

The default fix is still to not use it: `hiveboard_elements_patch` MERGES, so a label change
cannot strip geometry. When you must replace wholesale, the procedure is read-modify-write:
`hiveboard_elements_find` with `include_data: true` (or `hiveboard_get`), copy the ENTIRE
`element_data`, change the one key, send the whole object back.

**2. Patching `position` alone does not move anything on screen.**
The renderer reads `element_data.start` and `element_data.end` for shapes and
`element_data.position` for everything else; the `position` column is a mirror no renderer
reads. The write returns 200 against an unchanged canvas. A real move is
`hiveboard_elements_patch` with `move: {dx, dy}` — it shifts each element by its correct
per-type fields AND translates every bound connector by the same delta, board-wide. Add
`include_children: true` to bring a frame's contents. To space a row evenly, `hiveboard_align`,
whose returned `deltas` are their own undo.

**3. Sticky note colour is a NAME, not a hex.**
`element_data.color` for a `sticky-note` must be one of `yellow`, `blue`, `green`, `pink`,
`purple`, `orange`. The renderer looks the value up in a six-key table and dereferences the
miss, which takes the whole board's render down — so create COERCES anything else to yellow
and reports it in `coercions`, and the patch paths REFUSE it outright rather than mirror it.
The top-level `color` / `fill_color` columns are stored null for a sticky either way.

**4. `font_size` is ignored on shapes.** For a shape, label size comes from
`element_data.labelSize` (default 16) and label colour from `element_data.labelColor`
(the renderer falls back to `#000000`, which disappears into a dark fill). The top-level
`font_size` is discarded for shapes, and comes back in `ignored_keys` when you send it. It applies to `text` only, where it is interchangeable with
`element_data.fontSize`.

**5. A frame's `labelColor` does nothing.** The frame title renders hardcoded white on a tab
whose background is the frame's `color`. So a frame with `color: "#FFFFFF"` gets a white
title on a white tab. The renderer computes a title colour from `labelColor` and then never
uses it. Pick a mid-tone `color` for any frame whose title must be readable.

**6. `\n` in a shape or frame label does not break the line.** SVG `<text>` does not honour
newlines: it collapses one to a space, so `"Home\n/"` reads as "Home /". That is why
`hiveboard_sitemap_scaffold` stopped putting a page's path in the frame label and gives it its
own `text` element underneath. Do the same: a separate `text` element below the label, with a
higher `z_index` than the card.

**7. The 20-character colour column.** `color` and `fill_color` are `VarChar(20)`. Hex, CSS
names and short `rgb()`/`hsl()` forms are accepted; anything longer or unrecognised is REFUSED
at build time with a sentence naming the field, because a value that reached the column would
abort the entire `createMany` — up to 5000 rows — as an unhandled 500 with no per-row errors.
It is never truncated: a truncated colour is still a colour, just the wrong one, forever.

**8. `results[]`, `ids[]` and `invalid` in the bulk response.** Covered in Part 7 and repeated
because it is the failure that silently produces a board where every arrow points at the wrong
card: `ids` holds only the rows that were written, compacted, so a nonzero `invalid` breaks
index alignment with your input. `results` has one entry per input row and is the array to zip
against; `ids_alignable` tells you which situation you are in.

**9. Nothing here is idempotent by content.** Re-running a bulk create makes a second copy of
every element, stacked exactly on the first, which is nearly invisible on screen and doubles
`element_count`. Every scaffold takes `dry_run: true`, which returns the geometry and
`would_collide_with` before anything is written — that is the remedy for "a second call stacks
a duplicate". If a call times out and you do not know whether it landed, READ THE BOARD
(`hiveboard_outline`, or `audit_query` for what your calls actually wrote) before you retry.

**10. `hiveboard_get` has no pagination.** Every element, every time. Use `hiveboard_outline`
and `hiveboard_elements_find` for routine reads, and prefer several themed boards over one
giant one.

**11. Bulk cleanup goes through `hiveboard_elements_prune`, not board deletion.** It removes
by ids, type, region, or `all: true`, requires `confirm: true`, refuses an empty filter as
"everything", and snapshots to version history first (`snapshot_version_id` NULL = not
recoverable — report it). A bad large pass is one prune of that pass's region, or a
`hiveboard_restore_version` back to what was there before. `hiveboard_delete` is the opposite
of a recovery: it cascades the version history along with the elements, so it destroys the
restore path too, and it now requires `confirm: true` for exactly that reason.

---

## Part 11: Building boards from a workflow

The same seven operations exist as workflow node types, verified against the palette:

| Node type | Does |
|---|---|
| `hiveboardCreate` | Creates a board and outputs its `board_id` for every downstream node. Retry-safe. |
| `hiveboardGet` | Reads a board with a per-type element count. Elements embed only on request, capped. |
| `hiveboardList` | Lists boards, most recently edited first, optionally scoped to one project. |
| `hiveboardElementCreate` | Adds one element. Content supports templating, interpolated exactly once. |
| `hiveboardElementsBulkCreate` | Up to 200 elements per node. Every entry is validated before dispatch, so one bad entry fails the node and writes nothing. |
| `hiveboardSitemapScaffold` | Lays a page tree onto a board. Flat or nested. Additive. |
| `hiveboardDuplicate` | Clones a board and its elements. NOT idempotent. |

The build order is `workflow_node_types_list` to read the node catalog and confirm the exact
type strings plus each node's required `data` fields (it returns the same static catalog for
every account, so treat it as documentation, not a per-tenant capability check),
then `workflow_create`, then `workflow_node_add` and `workflow_edge_add` per node and edge,
then `workflow_run`. `workflow_run` accepts `test_mode: true` for a dry run that returns
`would_have` payloads instead of writing — but a dry run persists NO run row, so its sync
response (status, output, error, `run_id: null`) is the whole record. `workflow_run_get`
returns per-node `step_states` with input, output, and error for REAL runs only — pass it
the `run_id` a wet `workflow_run` returned. Dry-run any board-building workflow first: a
wet run that misplaces 200 elements is 200 delete calls.

Two behaviours differ from the MCP path and will surprise you:
- The bulk node validates the WHOLE array before dispatch and writes nothing on any bad
  entry, where the MCP tool writes the valid rows and reports the rest in `errors[]`.
- Board content legitimately contains `{{ }}`, so the handlers resolve author templates in
  exactly one pass and then pass the payload through verbatim. A sticky note reading
  "Save {{50}}% in Q3" survives. Do not double-wrap or pre-resolve.

---

## Part 12: Before you build anything

- `account_context_get({ domain: 'marketing' })` or the domain that fits the board, FIRST.
  Stage names, funnel language, and the client's own vocabulary come from there, not from a
  generic template. A funnel board labelled with words the client does not use is a rewrite.
- Source the real structure: `pages_list({ project_id })` for a sitemap,
  `crm_list_pipelines` and `crm_pipeline_stage_summary` for a funnel, `email_sequence_list`
  plus `email_sequence_get({ id, include: 'steps' })` for a sequence (`id` is required and
  comes from the list call), `customer_journey_get` for a journey map. Draw what exists.
- **Key-scope flag:** every sourcing tool in the two bullets above, plus `hiveku_docs_*`, is
  INVISIBLE to a hiveboards-scoped department key (profiles.ts grants only `hiveboard_`,
  `workflow_`, `memory_`, `kb_`, `pm_`, `room_`, `discussion_`, the task/project names, and
  the always-on set). On such a key, get the data via `talk_to_department` (always
  available) or from the human, and state the provenance in your reply. Never invent the
  numbers to keep moving.
- Strategic content, meaning the stage narrative, the insight stickies, the recommendations,
  goes through `talk_to_department({ domain, message })` and then gets placed. Coordinates
  are your job; the words are the department agent's.
- Confirm before you write. Creating a board is cheap and reversible. A 2000-element pass on
  a board someone else is using is neither.
- Record the board id and its grid constants with `memory_create` or `memory_update` so the
  next session extends the board instead of rebuilding it on a different pitch.
- When a tool's argument shape is not in this file, `hiveku_docs_search` and `hiveku_docs_get`
  (full key only) rather than guessing.
