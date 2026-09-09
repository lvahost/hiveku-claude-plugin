# Scaffold reference

Full argument shapes, caps, and return payloads for the five one-call board builders.
Everything here is verified against the tool definitions in
`hiveku-mcp-api-server/src/tools/olympus-tools.ts` (sitemap 15021, funnel 15057,
flow 15095, grid 15137, sequence 15173) and the routes behind them,
`hiveku_builder/src/app/api/olympus/hiveboards/[boardId]/*-scaffold/route.ts`.

Shared semantics, true of all five:

- **Additive, and none is idempotent.** No scaffold ever deletes existing board content. A
  second call stacks a second diagram on the first unless you pass a different `origin`. On a
  non-empty board, read `hiveboard_outline` first and use the `next_origin` it hands back —
  that is the arithmetic (`extent.y + extent.h + 160`) you previously had to do yourself.
- **`dry_run: true` on every one of them.** It derives the whole layout and writes nothing, so
  the geometry is inspectable BEFORE it exists. Use it on any board that already has content,
  and on any pass big enough that undoing it is a chore. Payload below.
- `origin` is `{x, y}`, default `{x: 0, y: 0}`. A non-finite `spacing_x`, `spacing_y`, or
  `origin` component falls back to its default instead of making every derived coordinate NaN
  and stacking the whole diagram on one point.
- Duplicate join keys (titles, stage names, node keys, step keys, column names) are a hard
  400 and NOTHING is created.
- Each returns a `*_to_element_id` map. Keep it in your reply or `memory_create`: it is the
  cheap way to patch one element later without re-reading the board.
- **`labels_truncated` comes back on all five**, on the dry run and on the write. A shape
  label is one unwrapped line, so anything wider than its card is ellipsised — a proportional
  funnel floors cards near 120px, about ten characters, and "Marketing Qualified Leads"
  reaches the board as "Marketing…" while the id map hands you back the full string. Each
  entry is `{key, full, shown}`: `key` is the name you sent, `shown` is what the board
  actually reads. Widen the card, shorten the label, or accept the rename — but never report
  the full string as drawn. (`hiveboard_sitemap_scaffold` always returns an empty array; it
  builds frames through the element builder rather than the shape helper, so nothing there is
  cut. A long title overruns its tab instead, which is a different problem.)
- If a double-fire happens (retry after a timeout, a second run), the remedy is
  `hiveboard_elements_prune` with a `region` covering the duplicate or the duplicate's ids,
  and — when the board had a saved version before the pass — `hiveboard_restore_version` to
  put the whole canvas back. Never `hiveboard_delete`: it cascades the version history, so it
  destroys the restore path along with the board. Read the board (`hiveboard_outline`) or
  `audit_query` BEFORE retrying an ambiguous call.

## What a dry run returns

Every scaffold answers with the same envelope — `planScaffold` in
`hiveku_builder/src/lib/hiveboards/scaffold-plan.ts` — plus its own derivations:

| Field | What it tells you |
|---|---|
| `dry_run: true` | Nothing was written. |
| `elements_planned`, `by_type` | Exactly what the write would insert, counted per element type. |
| `extent` | `{x, y, w, h}` the diagram would occupy. Feed it to the next call's `origin`. |
| `would_collide_with` | Ids of elements ALREADY on the board that the new diagram would land on top of. Empty is the answer you want; a non-empty list means pick another origin, because nothing here moves existing content out of the way. Connectors are excluded on both sides — a line's bounding box overlaps everything it passes and would drown the signal. |
| `element_ids_assigned_on_write: true` | Ids are minted at insert time, so a plan cannot honestly show them. Do not try to pre-wire arrows off a dry run. |

The per-scaffold derivations, listed under each tool below, are the arithmetic you would
otherwise be trusting unseen. That matters because the counts alone cannot catch a wrong
layout: a flow scaffold once returned 26 nodes, 33 arrows and zero unbound connectors while
drawing an INVERTED diagram, because two nodes formed a cycle and the ranker broke it the
wrong way. Every number in that response was correct.

## hiveboard_sitemap_scaffold

Any tree: sitemap, org chart, taxonomy, decision tree.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `pages` | required, max 500. Flat: `{title, path?, parent?}` (`parent` matches another page's `title`). Nested: `{title, path?, children: [...]}`. The server detects which shape you sent; mixing them in one array is a 400. |
| `layout` | `vertical` (default, root at top) or `horizontal` (root at left) |
| `spacing_x` | pixels between siblings at the same depth, default 240 |
| `spacing_y` | pixels between depths, default 160 |
| `pack_subtrees` | boolean. **Set `true` for anything unbalanced.** The default layout groups nodes by depth and orders each depth by sibling index, so subtrees under different parents interleave with crossing arrows. `pack_subtrees` runs a tidy layout instead: every subtree gets a contiguous band and a parent centres over its own children. Off by default only so existing boards do not change shape. |
| `origin` | `{x, y}` |
| `dry_run` | Derive and return the layout, write nothing. |

Each page becomes a `frame` labelled with the title. A `path` becomes its OWN text element
under the frame, not a second line of the label: a frame's label is one SVG `<text>` node and
SVG collapses the newline, so `"Home\n/"` used to read as "Home /" on one line. That means a
page with a path costs two elements, and `pages_created` counts the frames only.
Parent-to-child edges become curved arrows with real `startConnection`/`endConnection`
bindings.

Returns `{board_id, pages_created, arrows_created, orientation, labels_truncated,
dangling_parents, title_to_element_id}`. A dry run returns the shared envelope plus
`pages_planned`, `orientation`, `labels_truncated`, `dangling_parents`, and `node_depths`
(every title mapped to the depth it was assigned — the fastest way to see a tree came out
flat).

Failure semantics to check every time:
- Duplicate titles: hard 400, nothing created. Disambiguate ("Contact" / "Contact (Services)").
- **Mixing the two shapes is a 400 naming both offending pages.** One page carrying
  `children` used to route the WHOLE array through the nested walker, which reads title, path
  and children and nothing else — so every `parent` in that array was discarded, no arrow was
  drawn between the pages that named one, and `dangling_parents` came back empty because only
  the flat branch appends to it. The response looked clean beside a row of unconnected boxes.
  Send one shape for the whole array.
- A `parent` naming a title not in the list is still treated as a root at depth 0 — refusing a
  40-page call over one typo is worse — but it is REPORTED now, in `dangling_parents` as
  `{title, parent}`. That array is what accounts for an `arrows_created` that came back low.
- In the nested shape, a `children` loop back onto an ancestor is a 400 naming the loop path,
  and nesting deeper than 64 is a 400 naming the page. In the flat shape a cycle is still
  broken silently at depth 0.

## hiveboard_funnel_scaffold

A conversion funnel: a card per stage, its metric beside it, a connector carrying the
conversion rate, a drop-off callout beside every leak. The stage that loses the most is
highlighted automatically.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `stages` | required, 2–25, TOP OF FUNNEL FIRST. Each: `{name, count?, value?, note?}`. Duplicate names are a 400. |
| `title` | draws a titled frame around the whole funnel |
| `layout` | `vertical` (default, top to bottom) or `horizontal` |
| `width_mode` | `uniform` (default) or `proportional` — tapers each card by its share of the top stage, which is what makes a funnel look like a funnel. Widths are floored so a 2% stage stays readable. |
| `value_label` | unit shown under each count, e.g. `'pipeline'` |
| `insights` | sticky notes placed beside the column. Each: a string, or `{text}`. |
| `origin` | `{x, y}` |
| `dry_run` | Derive and return the layout plus the whole conversion table, write nothing. |

You pass counts, it derives the rates: step conversion, step drop-off in both percent and
absolute contacts, overall top-to-bottom conversion, and the single biggest leak all come
back in the response — quote those numbers, not your own arithmetic.

**A missing count is not a zero**: the connector says 'no data' rather than drawing a
confident 0% that reads as a catastrophe. Leave `count` out when you do not have it; never
substitute 0.

Returns `stage_to_element_id`, the full `conversions` table, `overall_conversion_pct`,
`biggest_drop_off`, `truncated` (insight notes whose text does not fit — a sticky scrolls
internally, so that overflow is invisible until someone clicks the note) and
`labels_truncated`. A dry run returns the shared envelope plus `stages_planned` and every one
of those derived numbers, which is how you check the rates before the client sees them.

## hiveboard_flow_scaffold

Any directed flow: process map, user flow, onboarding flow, swimlane handoff map. This is
the tool for graphs — a node with TWO parents works here, which is the thing
`hiveboard_sitemap_scaffold` structurally cannot express.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `nodes` | required, max 200. Each: `{key, label?, type?, lane?, note?}`. `type` is `start\|step\|decision\|handoff\|end`, default `step`. `key` is how edges name it. Duplicate keys are a 400. |
| `edges` | max 400. Each: `{from, to, label?}` — node keys. An edge naming an unknown node is a 400, not a silently missing branch. |
| `lanes` | swimlane bands top to bottom, max 12. When passed, the lane decides the cross axis instead of the crossing-minimised order, because a swimlane diagram exists to say WHO does each step. |
| `title` | titled frame around the whole flow |
| `flow` | `down` (default) or `right` — the direction ranks grow in |
| `origin` | `{x, y}` |
| `dry_run` | Derive and return the ranks, the back edges, and the demotion warnings, write nothing. |

Layout is derived: each node is ranked one layer after its latest predecessor, and within a
layer nodes are ordered by their predecessors' positions to stop the arrows crossing.
Cycles are fine: a rework loop ('failed review' back to 'draft') is drawn dashed and curved
and does not flatten the layout; the response lists `back_edges` so you can see which edges
it treated that way, and `warnings` names every demoted edge. A rework loop is legitimate; an
edge you believed was a forward step being demoted is a modelling mistake, and the counts look
identical in both cases — which is exactly what a dry run is for here.

Node types map to the shapes readers parse: start/end become terminator circles, decision a
diamond, handoff a hexagon, step a card. Label a decision as a question and label both edges
leaving it. A lane frame is a visual grouping in the SCHEMA, but not in the product: the
editor has always dragged a frame's contents with it, and `hiveboard_frames` now answers
membership by that same majority-of-area rule.

Returns `node_to_element_id`, `node_ranks`, `depth`, `back_edges`, `warnings` and
`labels_truncated`. A dry run returns the shared envelope plus `nodes_planned`,
`arrows_planned`, and each of those.

## hiveboard_grid_scaffold

Anything binned on two axes: customer journey map (stages across, facets down), retro,
kanban snapshot, SWOT, RACI, affinity wall.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `columns` | required, 2–12, left to right. Each: `{name, subtitle?}` or a plain string. Duplicate names are a 400. |
| `rows` | required, max 8, top to bottom. Each: `{name, type?, color?, cells}`. `type` is `notes` (default, cells are strings) or `scores` (cells are numbers, drawn as a curve). |
| `title` | titled frame around the whole grid |
| `origin` | `{x, y}` |
| `dry_run` | Derive and return the layout plus the overflow report, write nothing. |

Row cell rules — both enforced, both worth planning for:
- Every row's `cells` array must be EXACTLY as long as `columns`, in column order, with
  `null` for an empty cell. A length mismatch is a 400 naming both counts, because padding
  it would slide every later cell one column left and look plausible.
- It sizes itself to the content: each row is sized from its longest cell, and any cell
  still too long comes back in `truncated` rather than being silently swallowed. A sticky's
  overflow scrolls INTERNALLY and is invisible until someone clicks the note — so shorten or
  split everything in `truncated`; do not assume it rendered.

A row typed `scores` is drawn as a curve with a dot and a reading per column, auto-scaled to
its own range — how an emotion line gets onto a journey map without you picking a scale. It
is a line, never a filled area: the canvas has no fill primitive outside its six shapes, so
there are no pie or area charts here at all.

Sticky colour is a NAME (`yellow`, `blue`, `green`, `pink`, `purple`, `orange`), never a hex.

Returns `cell_to_element_id` keyed `'<row> <column>'`, plus `columns`, `rows`, `cells_created`,
`truncated` (each entry `'<row> / <column>'`) and `labels_truncated` (the row names and board
title that were ellipsised on their frame tabs). A dry run returns the shared envelope plus
`columns_planned`, `rows_planned`, `truncated` and `labels_truncated` — `truncated` matters
more here than anywhere, because this is the scaffold made almost entirely of stickies.

## hiveboard_sequence_scaffold

An outreach sequence or cadence: a card per touch, the wait carried on the connector, a
decision diamond wherever the path forks on a reply, and a goal terminator at the end.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `steps` | required, max 40, in order. Each: `{key?, label, channel?, wait_days?, wait_hours?, note?, on_reply?: {label?, outcome}}`. `channel` is `email\|sms\|call\|linkedin\|task\|ad\|direct_mail`. `note` becomes a sticky under the card. Duplicate keys are a 400. |
| `goal` | terminator closing the main line, e.g. `'Meeting booked'` |
| `title` | titled frame around the whole sequence |
| `origin` | `{x, y}` |
| `dry_run` | Derive and return the calendar, write nothing. |

You pass waits, it derives the calendar: per-step waits accumulate into an absolute day
offset stamped on every card, and the schedule comes back in the response. **The wait on a
step is the gap BEFORE it**, which is how every sequence tool on the platform models it, so
the input maps 1:1 onto `email_sequence_get`'s step list.

`on_reply` forks the path: a diamond goes on the main line, the outcome card sits on its own
row above it clear of everything, and the sequence resumes from the fork.

This is deliberately not `hiveboard_flow_scaffold` with different words: that one takes a
graph and has no time semantics — using it for a cadence means building the nodes, the edges
and the day arithmetic yourself.

Returns `step_to_element_id`, the derived `schedule` (per step: `key`, `label`, `channel`,
`day_offset`, `hour_offset`), `total_span_days`, `branches_created`, `truncated` (step notes
that do not fit their sticky) and `labels_truncated`. A dry run returns the shared envelope
plus `steps_planned`, `total_span_days`, `truncated`, `labels_truncated`, and a `schedule`
carrying `key`, `label`, `channel` and `day_offset` only — `hour_offset` is added on the write
path, not the dry run:
check the cumulative day offsets there rather than on the board, because a wait entered on the
wrong step shifts every touch after it and the drawing looks correct either way.
