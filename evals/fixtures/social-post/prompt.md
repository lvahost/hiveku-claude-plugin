# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:social-post` pass above against fixture
account "Brightside Fixtures". The brief is:

> Write me a post about why we sand between coats, for the trade contractor,
> on LinkedIn, Facebook and X.

Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- The command's "load `references/<file>.md`" steps cannot happen here (no
  file reads); work from the command text and the tool results. The banned
  list you score against is the account's `brand.ai_forbidden_phrases` from
  `account_context_get` plus the recycled-AI phrases you already know to be
  banned (hype verbs, "game-changer", "in today's fast-paced world",
  "let's dive in", "comment below" and their kind). Inflections count; a
  different word that merely shares letters does not.
- There is no human in the loop, so every STOP in the command resolves the
  conservative way: every post stays a DRAFT. Do not set `scheduled_at` or
  `scheduled_at_local` anywhere (not on create, not on update), do not call
  `social_publish_post`, and do not call `generate_image` (each success spends
  a paid slot nobody approved) - use what the Media Library already holds, or
  file the creative brief as a task. Put the proposed slot for each draft in
  the report instead. (The fixture refuses the gate-crossing forms anyway.)
- Do create the draft(s), the PM task(s) and the memory write-back the command
  calls for - those tools are part of the fixture and are allowed.
- Every caption, first comment and alt text in the report goes inside a ```
  fenced block. Prose outside fences must be your own synthesis, and every
  number in that prose must come from a tool result - when you derive a
  figure (a share, a count of N), show the inputs on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the deliverable the command describes: who the post is for
   and why (the foundation read, including anything that failed validity),
   which of the named platforms get a post and which do not, with the reason
   per platform, the variance read per platform, the header line
   `For: <avatar> | Stage: <Schwartz stage> | Pillar: <pillar> | Hook: <pattern> | Format: <format> | CTA: <verb>`
   and the line `Rubric: N/14 (specificity n, one-idea n, proof n, voice n, native n, hook n, cta n)`
   written exactly, once per variant you scored, each variant as a fenced
   exhibit with its first comment and alt text, the validation and preview
   results, the exact create call(s), the proposed slot, and what was filed.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "categories": {
    "banned_phrase_hits": ["<variant id from the department's social_drafts.v1 block>"],
    "invalid_avatars": ["<customer avatar id>"],
    "variance_breaches": ["hook:<tag value>"]
  },
  "drafts": [
    { "platform": "linkedin", "persona": "<avatar name>", "stage": "<stage slug>", "hook_type": "<hook pattern slug>", "rubric_total": 12, "post_id": "<id social_create_post returned>" }
  ]
}
```

Definitions:

- `categories.banned_phrase_hits` - the `id` of every entry in the department
  reply's `drafts[]` or `alternatives[]` whose copy (content, first comment,
  hashtags, alt text) carries a banned phrase or one of the brand's
  `ai_forbidden_phrases`. `categories.invalid_avatars` - customer avatar ids
  that fail the foundation validity check (template or placeholder text, a
  persona describing nobody real) and so cannot be drafted for.
  `categories.variance_breaches` - on each platform you target, every hook
  pattern used more than twice in the 10 most recent published posts (sorted
  by `published_at`), written as `hook:` plus the tag value exactly as the
  posts carry it; a format used three times in a row as `format:<slug>`. A
  category with nothing in it is an empty array.
- `drafts` - one row per post you created: `platform` the single slug you
  passed in `target_platforms`, `persona` the avatar's name as the tool
  returned it, `stage` the `stage:` tag value you persisted, `hook_type` the
  `hook:` tag value, `rubric_total` the N from that draft's Rubric line, and
  `post_id` the id the create call returned.

Use ids exactly as the tools return them (`sacc_*`, `avt_*`, `post_*`,
`draft_*`). An id appears in the sidecar only if `report.md` says the same
thing - the two files must agree.

Run the command's documented steps now.
