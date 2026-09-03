# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:social-report` pass above against
fixture account "Brightside Fixtures". The report covers the account's first
quarter on Hiveku: 2026-06-01 through 2026-08-31. Today is 2026-09-01.
Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- There is no human in the loop, so the "STOP and confirm the name, cadence
  and sections" gate in step 5 cannot be crossed by a person. Use these
  answers as the operator's: report name "Brightside Fixtures - Social, June
  to August 2026", `schedule: "none"`, the four social sections, `is_public:
  true`. Create the page, regenerate it, read its share link. Do NOT call
  `marketing_report_send` in any form - not even the preview call - and do not
  publish, edit or create any post. (The fixture refuses those anyway.)
- Do run the syncs, the per-account reads, the PM task(s) and the memory
  write-back the command calls for - those tools are part of the fixture and
  are allowed.
- Every number in the report names the call it came from and its window.
  Prose must be your own synthesis; when you derive a figure (a share, a
  delta, a rate), show the inputs on the same line. Verbatim exhibits (a
  caption you quote) go inside a ``` fenced block.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the report the command describes: the measurement-artifact
   triage first, then by platform, pillar, hook, format and persona with N,
   the top posts with their persona, the delivery against cadence, the
   approval queue, three next bets, the client page's URL, and the freshness
   lines the command lists, filled in.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "categories": {
    "measured": ["<social account id>"],
    "not_synced": ["<social account id>"],
    "partial": ["<social account id>"],
    "not_connected": ["<social account id>"],
    "stopped_posts": ["<post id>"],
    "failed_versions": ["<post id>"],
    "pending_approval": ["<post id>"]
  },
  "platforms": {
    "<social account id>": "measured | not_synced | partial | not_connected"
  },
  "report_id": "<the id marketing_report_create returned>"
}
```

Definitions:

- The four account states are the command's honesty states, one per row
  `social_list_accounts` returns: `measured` (synced data for the window),
  `not_synced` (the account is connected but its analytics rows are empty and
  its posts carry no snapshot - unknown, never zero), `partial` (the
  connection broke or a version failed inside the window - report what was
  captured and the gap), `not_connected` (a row that is not a publishing
  platform: inactive, or awaiting a human's activation choice). Every account
  id appears in exactly one of the four arrays AND in `platforms` with the
  same state; the two must agree.
- `stopped_posts` - posts in the window whose analytics sync has stopped
  (the per-post analytics reader flags them), so their numbers are frozen
  at their last sync.
- `failed_versions` - posts in the window with at least one platform version
  at status `failed`.
- `pending_approval` - posts still at status `pending_approval` today, each
  named in the report with how long it has waited.
- A category with nothing in it is an empty array.

Use ids exactly as the tools return them (`sacc_*`, `post_*`, `pil_*`,
`rep_*`). An id appears in the sidecar only if `report.md` says the same thing
- the two files must agree.

Run the command's documented steps now.
