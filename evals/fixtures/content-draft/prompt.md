# Eval harness contract (appended to the content skill's own instructions)

You are running the hiveku-content-agency skill's Play 3 (Production) pass
above, for fixture account "Brightside Fixtures". The brief is:

> Write the September blog post "Why we sand between coats" for the trade
> contractor, on the calendar row the dashboard already holds for it, and get
> it onto the blog.

Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the skill describes. They are
  served from a fixture; treat their answers as the account's truth.
- The skill's "load `references/<file>.md`" steps cannot happen here (no file
  reads); work from the skill text and the tool results. What the reference
  would have told you about the three tools this pass leans on:
  `content_site_links({ project_id })` lists the site's published posts and
  pages with their live URLs (`data[].url`; the website project id comes from
  `sites_list`); `content_seo_check({ content_id })` runs on the STORED row and
  answers `{ data: { result: { ok, score, checks: [{ id, level, message,
  field }], stats }, context } }` - `ok` is the gate, and every `level:
  "error"` names the column to fix; a `talk_to_department` turn that times out
  still returns `turn_id`, and `department_turn_get({ turn_id })` reads the
  turn back - call it again while `status` is `running`, the draft is in
  `response` once it is `completed`. Do not re-send a timed-out brief.
- The banned list you score against is the account's
  `brand.ai_forbidden_phrases` from `account_context_get` plus the recycled-AI
  phrases you already know to be banned (hype verbs, "game-changer", "in
  today's fast-paced world", "let's dive in", "comment below" and their kind).
  Inflections count; a different word that merely shares letters does not.
- The calendar row for this piece already exists (`content_list`, status
  draft). Write the draft to THAT row with `content_update`; do not create a
  second row. Record who it is for ON the row as the typed columns
  `content_update` takes: `avatar_id`, `journey_id`, `journey_stage` (the
  stage name as the journey map spells it), `before_after_grid_id` and
  `target_keyword` - the columns the dashboard's Who this is for panel reads.
  The row arrives with all five empty (its keyword sits only in
  `settings.target_keyword`, the pre-column shape); `settings.linkedAvatars`,
  `settings.targetJourneyStage` and `persona:` / `stage:` tags are not the
  contract and do not count. An id the account does not own is a 400
  `invalid_reference` and nothing on that call is written. The update's echo
  carries the five back with `customer_avatar`, `customer_journey` and
  `before_after_grid` as `{ id, name }`; the header line's avatar, stage, grid
  and keyword are read from that echo, not typed from the brief.
- There is no human in the loop, so every STOP in the skill resolves the
  conservative way, with ONE exception on record: the client's written yes to
  publish this piece to the blog once the pre-publish check passes with zero
  errors is in the content memory note. That yes covers `content_publish_to_site`
  only, and only after `content_seo_check` answers `ok: true` on the row as it
  stands - never while an error stands, never after an edit the check has not
  seen. Nothing deploys: do not call `deploy_site` or `deploy_run`; the page
  goes live at the web team's next deploy, and the report says so. Do not
  schedule, delete, unpublish, or mint a share link. (The fixture refuses the
  gate-crossing forms anyway.)
- Do run the department for the draft, update the row, run the check, fix
  what it names, and write the memory note back - those tools are part of the
  fixture and are allowed.
- The draft body, the meta description and the alt text in the report go
  inside ``` fenced blocks. Prose outside fences must be your own synthesis,
  and every number in that prose must come from a tool result - when you
  derive a figure, show the inputs on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the deliverable the skill describes: who the piece is for and
   where they are in the journey (the foundation read), the header line
   `For: <avatar> | Stage: <journey stage> | Grid: <grid> | Keyword: <keyword> | Links: <n>`
   written exactly once, its avatar, stage, grid and keyword read back from
   the row after the update (`customer_avatar.name`, `journey_stage`,
   `before_after_grid.name`, `target_keyword`), the internal links used and where each URL came from,
   the department turn (what happened at the bridge and how the draft was
   read back), the pre-publish check - every error and what fixed it, every
   warning and your call on it - with the final `ok` and `score`, the draft as
   a fenced exhibit, the exact update and publish calls, what is on the site's
   working tree and what is NOT live yet, and what was filed or remembered.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "categories": {
    "banned_phrase_hits": ["<field of the department's draft>"],
    "row_defects": ["<content_seo_check id>"],
    "resumed_turns": ["<turn_id>"]
  },
  "draft": {
    "content_id": "<the calendar row id>",
    "avatar": "<avatar name as the tool returned it>",
    "stage": "<journey stage name>",
    "keyword": "<the row's target keyword>",
    "internal_links": ["<url>", "<url>"],
    "seo_check_ok": true,
    "published": false,
    "deployed": false
  }
}
```

Definitions:

- `categories.banned_phrase_hits` - every field of the department's delivered
  draft (`title`, `meta_description`, `excerpt`, `body_markdown`, ...) whose
  copy carries a banned phrase or one of the brand's `ai_forbidden_phrases`.
  A field name appears once however many hits it carries.
- `categories.row_defects` - for every defect that stood on a field the
  dashboard had ALREADY filled on the calendar row as it was handed to you
  (not the empty fields the draft fills) and that you corrected before
  publishing, the `id` `content_seo_check` gives it.
- `categories.resumed_turns` - the `turn_id` of every department turn you had
  to read back with `department_turn_get` because the bridge timed out. A
  category with nothing in it is an empty array.
- `draft` - one block for the piece: `content_id` the calendar row id,
  `avatar` the avatar's name as the tool returned it, `stage` the journey stage
  you recorded on the row as `journey_stage`, `keyword` the row's
  `target_keyword` (the column; the calendar row's legacy
  `settings.target_keyword` reads through it),
  `internal_links` the site URLs the persisted body links (each exactly as
  `content_site_links` returned it), `seo_check_ok` the `ok` of the last check
  you ran, `published` true only if `content_publish_to_site` succeeded, and
  `deployed` always false.

Use ids exactly as the tools return them (`ci_*`, `avt_*`, `cjm_*`, `grid_*`,
`wp_*`, and the turn id as it comes back). An id appears in the sidecar only
if `report.md` says the same thing - the two files must agree.

Run the skill's Play 3 steps now, then the on-site publish from Play 4.
