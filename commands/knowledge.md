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

- `changed_remote` - updated on Hiveku since the last pull; re-pull before relying on them.
- `deleted_remote` - gone upstream but STILL ON DISK here (sync never deletes local files);
  treat those files as unverified.
- `locally_modified` - edited here since the pull; a re-pull will overwrite them, so surface
  this to the user before pulling again.

Each file carries frontmatter (id, domain, department, version, updated_at). The domain is the
entry's identity.

**Pull covers ACCOUNT-level memory only.** It calls `memory_list` with a type filter and nothing
else, and that route defaults to `project_id IS NULL`. Project-scoped entries - anything written by
`memory_create` / `memory_bulk_create` with a `project_id` - are never mirrored, never counted, and
will show up in the status report's `deleted_remote` bucket only if they were once account-level. A
per-site rule that is missing from disk may simply be project-scoped: check with
`memory_list({ project_id })` or `memory_list({ include_project_scoped: true })` before concluding it
is gone, and do not re-create it at account level, which silently changes its scope.

To change knowledge, use the live memory_* MCP tools, then `knowledge pull` to bring the change down:

- New skill or rule: `memory_create({ type: "skill" | "rule", name: "<kebab-slug>", content })`. Start
  `content` with `<!-- department: seo -->` to scope it to one department - `account_context_get`
  reads that tag out of the content, and an untagged skill or rule is global to every department.
- Existing entry: read it with `memory_list({ domain: "_skill:<slug>" })` or `memory_get`, then
  `memory_update({ memory_id, content })` with the full body. `memory_update` REPLACES the content.
- Wrong edit, or an entry deleted by mistake: `memory_list_versions({ memory_id })` (works on deleted
  entries too) then `memory_restore_version({ version_id })`.

Editing the local mirror changes nothing upstream, and a re-pull overwrites it.
