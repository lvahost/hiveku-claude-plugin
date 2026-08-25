---
description: Sync this account's memory, rules, and skills into local files by department.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" knowledge:*)"]
---

Sync the bound account's knowledge into this folder, organized by department
(`memory/<dept>/`, `rules/<dept>/`, `skills/<dept>/`, plus commands/agents/identity).

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" knowledge pull      # write/refresh the local files
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" knowledge status    # drift report, writes nothing
```

Read the status output carefully before trusting local knowledge files:

- `changed_remote` — updated on Hiveku since the last pull; re-pull before relying on them.
- `deleted_remote` — gone upstream but STILL ON DISK here (sync never deletes local files);
  treat those files as unverified.
- `locally_modified` — edited here since the pull; a re-pull will overwrite them, so surface
  this to the user before pulling again.

Each file carries frontmatter (id, domain, department, version, updated_at). The domain is the
entry's identity. To change knowledge, use the live memory_* MCP tools, then `knowledge pull` to
bring the change down.
