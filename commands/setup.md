---
description: Create and bind one folder per connected account — the first-run workspace setup.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" setup:*)"]
---

Create the account workspace: one folder per connected account, each already bound, under
`~/Hiveku-Accounts` (or a root the user names with `--root <path>`).

Run:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" setup
```

Idempotent and conflict-safe: an existing folder bound to the same account is reported and left
alone; a folder bound to a DIFFERENT account is never touched and is reported as a conflict —
surface any conflict to the user rather than working around it.

Then tell the user, concretely: open any of these folders in Claude (the Code tab's folder
picker) and that client's account is live — the session banner names it. Suggest running
/hiveku:pull inside a folder to bring that account's department data down, and /hiveku:knowledge
for its memory and skills.

A brand-new account has no memory at all, so every department agent runs unhydrated until it does.
If /hiveku:knowledge comes back empty for a folder, point the user at /hiveku:seed, which drafts the
department memory set and writes it in one `memory_bulk_create` call.

Folder names match the Hiveku VS Code extension's (`<label-slug>-<id8>`), so a machine running
both tools shares one folder per client.
