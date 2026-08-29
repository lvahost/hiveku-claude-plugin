# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:tracking-check` pass above against
fixture account "Brightside Fixtures". Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- There is no human in the loop. Do not ask for confirmation and do not wait
  for one. The command diagnoses and never edits tags, site code, the ad
  account, or the upload lane; that holds here, and the fixture refuses those
  writes anyway. Platform syncs and reconnects are not available in this run
  (`ppc_sync` / `ppc_sync_async` refuse): the freshness the tools report is
  the freshness you have.
- Do create the PM tasks and the memory write-back the command calls for -
  those tools are part of the fixture. Skip the "confirm the task list with
  the user" step and create them.
- Relay every channel's scorecard `headline` verbatim, each inside a ```
  fenced block (it is a quoted exhibit). Any other verbatim exhibit (a coding
  brief, a tool's warning text) goes in a fence too. Prose outside fences must
  be your own synthesis, and every number in that prose must come from a tool
  result - when you derive a figure (a gap, an age in hours), show the inputs
  on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the per-channel verdict report the command describes: a
   verdict table with one row per channel the scorecard returned, the named
   broken link for each channel that is not tracking fully, and a
   could-not-verify section for any channel whose verdict you could not stand
   behind.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "tracking": ["<channel>", "..."],
  "partially_tracking": [],
  "not_tracking": [],
  "unknown": [],
  "could_not_verify": [],
  "broken_links": ["<channel>:<finding code>", "..."]
}
```

Rules for the sidecar:

- Use channel names exactly as `analytics_channel_scorecard` returns them in
  `channel`. Every channel it returned appears in exactly ONE of the four
  verdict arrays (`tracking`, `partially_tracking`, `not_tracking`, `unknown`
  - the scorecard's own closed enum).
- A channel goes in `unknown` when you could not verify its verdict - a
  freshness or readability problem on the source the verdict rests on - and
  the same channel is then also listed in `could_not_verify`. Do not adopt a
  verdict you cannot stand behind.
- `broken_links` carries one entry per channel in `not_tracking` or
  `partially_tracking`, as `<channel>:<code>`, where `<code>` is the finding
  `code` exactly as `analytics_diagnose_tracking` returns it for that channel.
  A channel with no named link is a guess, not a finding.
- One `pm_tasks_create` per channel in `not_tracking` or `partially_tracking`,
  the money URL in the title, the coding brief in the description. Channels
  you could not verify get no task; say what would verify them instead.
- A category with no entries is an empty array. A channel or link appears in
  the sidecar only if `report.md` says the same - the two files must agree.

Run the command's documented steps now.
