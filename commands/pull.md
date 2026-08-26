---
description: Pull this account's department data into hiveku-data/ as local files.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" pull:*)"]
---

Pull department data for the account this directory is bound to. Local files beat live tool
calls: one pull replaces dozens of MCP round-trips, and analysis can then run entirely on disk.

The user's request decides the arguments ($ARGUMENTS may already carry them):

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --list          # departments + local freshness (start here)
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull seo ppc         # named departments
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --default       # this folder's default set
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --stale 12      # only defaults older than N hours
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --dataset ppc:campaigns   # ONE dataset (after a write)
```

A department can take a minute or two (scoped datasets fan out per project/connection) - set the
Bash timeout generously (300000 for a few departments, 600000 for --all) and show the streamed
per-dataset lines to the user.

What lands on disk, per department, under `hiveku-data/<dept>/`:

- `<dataset>.json` - `{ dataset, label, tool, count, fetched_at, truncated?, error?, rows: [...] }`.
  Check `fetched_at` before trusting; `truncated` means the page cap was hit and `count` is a
  floor, not a total. An empty file after an `error` means NOT retrieved - never "no data".
- `README.md` - dataset inventory with freshness; `SETUP.md` where an integration needs connecting.
- `../STATUS.json` - machine-readable summary; its `failed` array is the first thing to read.

A failed refresh never clobbers a previous good snapshot. Data is a SNAPSHOT: work from these
files for reading and analysis, but make changes through the live MCP tools, then refresh the
affected dataset with `--dataset <dept>:<id>`.

If the directory is not bound, the tool says so - run /hiveku:bind (or /hiveku:connect first).
