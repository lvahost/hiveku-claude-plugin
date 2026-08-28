# Scaffold reference

Full argument shapes, caps, and return payloads for the five one-call board builders.
Everything here is verified against the tool definitions in
`hiveku-mcp-api-server/src/tools/olympus-tools.ts` (sitemap 12325, funnel 12357,
flow 12391, grid 12429, sequence 12461).

Shared semantics, true of all five:

- **Additive.** No scaffold ever deletes existing board content. A second call stacks a
  second diagram on the first unless you pass a different `origin`. On a non-empty board,
  call `hiveboard_outline` first and place `origin` clear of the returned `extent`.
- `origin` is `{x, y}`, default `{x: 0, y: 0}`.
- Duplicate join keys (titles, stage names, node keys, step keys, column names) are a hard
  400 and NOTHING is created.
- Each returns a `*_to_element_id` map. Keep it in your reply or `memory_create`: it is the
  cheap way to patch one element later without re-reading the board.
- If a double-fire happens (retry after a timeout, a second run), the remedy is
  `hiveboard_elements_prune` with a `region` covering the duplicate, or the duplicate's ids —
  never deleting the board. Read the board (`hiveboard_outline`) or `audit_query` BEFORE
  retrying an ambiguous call: nothing here is idempotent by content.

## hiveboard_sitemap_scaffold

Any tree: sitemap, org chart, taxonomy, decision tree.

| Arg | Shape |
|---|---|
| `board_id` | required |
| `pages` | required, max 500. Flat: `{title, path?, parent?}` (`parent` matches another page's `title`). Nested: `{title, path?, children: [...]}`. The server detects which shape you sent; do not mix them in one call. |
| `layout` | `vertical` (default, root at top) or `horizontal` (root at left) |
| `spacing_x` | pixels between siblings at the same depth, default 240 |
| `spacing_y` | pixels between depths, default 160 |
| `pack_subtrees` | boolean. **Set `true` for anything unbalanced.** The default layout groups nodes by depth and orders each depth by sibling index, so subtrees under different parents interleave with crossing arrows. `pack_subtrees` runs a tidy layout instead: every subtree gets a contiguous band and a parent centres over its own children. Off by default only so existing boards do not change shape. |
| `origin` | `{x, y}` |

Each page becomes a `frame` labelled with the title (plus `path` as a caption).
Parent-to-child edges become curved arrows with real `startConnection`/`endConnection`
bindings.

Returns `{board_id, pages_created, arrows_created, orientation, title_to_element_id}`.

Failure semantics to check every time:
- Duplicate titles: hard 400, nothing created. Disambiguate ("Contact" / "Contact (Services)").
- A `parent` naming a title not in the list is SILENTLY treated as a root at depth 0 — no
  error. A cycle is silently broken at depth 0. So always check `arrows_created` against the
  number of pages that carried a resolvable `parent`; a short count means a typo.

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

You pass counts, it derives the rates: step conversion, step drop-off in both percent and
absolute contacts, overall top-to-bottom conversion, and the single biggest leak all come
back in the response — quote those numbers, not your own arithmetic.

**A missing count is not a zero**: the connector says 'no data' rather than drawing a
confident 0% that reads as a catastrophe. Leave `count` out when you do not have it; never
substitute 0.

Returns `stage_to_element_id` and the full conversion table.

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

Layout is derived: each node is ranked one layer after its latest predecessor, and within a
layer nodes are ordered by their predecessors' positions to stop the arrows crossing.
Cycles are fine: a rework loop ('failed review' back to 'draft') is drawn dashed and curved
and does not flatten the layout; the response lists `back_edges` so you can see which edges
it treated that way.

Node types map to the shapes readers parse: start/end become terminator circles, decision a
diamond, handoff a hexagon, step a card. Label a decision as a question and label both edges
leaving it. A frame is a visual grouping only: it contains nothing in any data sense.

Returns `node_to_element_id` and `node_ranks`.

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

Returns `cell_to_element_id` keyed `'<row> <column>'`.

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

You pass waits, it derives the calendar: per-step waits accumulate into an absolute day
offset stamped on every card, and the schedule comes back in the response. **The wait on a
step is the gap BEFORE it**, which is how every sequence tool on the platform models it, so
the input maps 1:1 onto `email_sequence_get`'s step list.

`on_reply` forks the path: a diamond goes on the main line, the outcome card sits on its own
row above it clear of everything, and the sequence resumes from the fork.

This is deliberately not `hiveboard_flow_scaffold` with different words: that one takes a
graph and has no time semantics — using it for a cadence means building the nodes, the edges
and the day arithmetic yourself.

Returns `step_to_element_id`, the derived `schedule`, and `total_span_days`.
