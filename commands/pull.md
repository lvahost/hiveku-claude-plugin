---
description: Pull this account's department data into hiveku-data/ as local files.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" pull:*)"]
---

Pull department data for the account this directory is bound to. One pull replaces dozens of MCP
round-trips for a broad look across a department, but the files are a copy of the last pull, and
Hiveku is the source of truth: read anything again from Hiveku before you act on it (the last
section below says how).

The user's request decides the arguments ($ARGUMENTS may already carry them):

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --list          # departments + local freshness (start here)
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull seo ppc         # named departments
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --default       # this folder's default set
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --stale 12      # only defaults older than N hours
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull --dataset ppc:campaigns   # ONE dataset (after a write)
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" pull account         # only the account memory copy
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

The account memory (About your business on the Memory page), the facts about the business that
every department agent reads, comes down with every pull except `--dataset`, as
`hiveku-data/account/ACCOUNT_MEMORY.md`:

- It may be out of date: before you act on it, read it again with `account_memory_get`
  (memory_list and memory_get leave it out).
- It is a READ-ONLY copy. Owners and admins edit the account memory on the Hiveku dashboard; the
  file's header gives the link (`https://app.hiveku.com/<account id>/dashboard/memory`). Never edit
  the file to change it: the next pull replaces the file and nothing uploads it. When the user wants
  it changed, give them that link.
- Under the owner's text it lists the lines agents suggested that an owner has not reviewed yet,
  with who suggested each one and when. They are not part of the account memory until an owner
  keeps them. To suggest a new line, use `account_memory_append` (it asks first).
- It is internal to the team: never quote it to customers.
- `STATUS.json` records it under `account_memory`; a failed read is in `failed` as department
  `account` and leaves the previous copy in place.

A failed refresh never clobbers a previous good snapshot. The files are a copy of the last pull
and may be out of date: Hiveku, not this folder, is the source of truth. Before you act on anything
in them, read it again from Hiveku with the live tools (the dataset's own `tool`, named in its file
and its README; `account_memory_get` for About your business), make changes through the live MCP
tools, then refresh the affected dataset with `--dataset <dept>:<id>`.

If the directory is not bound, the tool says so - run /hiveku:bind (or /hiveku:connect first).
