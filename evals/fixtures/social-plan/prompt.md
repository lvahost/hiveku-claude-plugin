# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:social-plan` pass above against fixture
account "Brightside Fixtures", planning the week that starts Monday 2026-08-31.
Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- There is no human in the loop, so the "get a yes" gate in step 4 cannot be
  crossed: every post stays a DRAFT. Do not set `scheduled_at` anywhere (not
  on create, not on update) and do not call `social_publish_post`. Put the
  proposed slot for each draft in the report instead. (The fixture refuses the
  gate-crossing forms anyway.)
- Do create the drafts, the PM task(s) and the memory write-back the command
  calls for - those tools are part of the fixture and are allowed.
- Every proposed caption in the report goes inside a ``` fenced block. Prose
  outside fences must be your own synthesis, and every number in that prose
  must come from a tool result - when you derive a figure (a share, a delta),
  show the inputs on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the week plan the command describes: who can post, what the
   last window's pillar mix looked like against the targets and what this week
   does about it, the week itself (one line per draft with its proposed slot),
   the captions as fenced exhibits, and what was filed.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "categories": {
    "excluded_accounts": ["<social account id>"],
    "underweight_pillars": ["<pillar id>"],
    "pillars_cut_to_zero": []
  },
  "week": [
    { "day": "Mon", "platform": "linkedin", "pillar": "<pillar id>", "account_id": "<social account id>", "title": "<draft title>" }
  ],
  "excluded_accounts": [
    { "account_id": "<social account id>", "reason": "<why no draft targets it>" }
  ],
  "pillar_rebalance": { "<pillar id>": 0 }
}
```

Definitions:

- `categories.excluded_accounts` - connected accounts this plan refuses to
  target. `categories.underweight_pillars` - pillars whose share of the last
  window fell short of their `target_percentage`, which this plan rebalances
  toward. `categories.pillars_cut_to_zero` - pillars this plan gives no post
  at all (list them honestly; an empty array is the ideal). A category with
  nothing in it is an empty array.
- `week` - one row per draft you created, in slot order; `day` is the
  three-letter weekday of its proposed slot (Mon..Sun), `platform` the slug you
  passed as the single `target_platforms` entry.
- `excluded_accounts` - the same ids as the category, each with its reason.
- `pillar_rebalance` - planned draft count per pillar this week; it must add
  up to the rows in `week`.

Use ids exactly as the tools return them (`sacc_*`, `pil_*`). An id appears in
the sidecar only if `report.md` says the same thing - the two files must agree.

Run the command's documented steps now.
