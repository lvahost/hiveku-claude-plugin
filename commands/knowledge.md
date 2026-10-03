---
description: Sync this account's memory, rules, and skills into local files, filed by the agent that owns each one.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" knowledge:*)"]
---

Sync the bound account's knowledge into this folder, filed the way the Memory page files it: by the
agent that owns each entry.

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" knowledge pull      # write/refresh the local files
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" knowledge status    # drift report, writes nothing
```

**Where each entry lands.** `<kind>/<owner>/<name>.md`, where `<kind>` is `memory/`, `rules/`,
`skills/`, `commands/` (Shortcuts), `agents/` (Specialists) or `identity/` (Profiles), and `<owner>`
is the agent Hiveku says owns it (the `owner` memory_list returns, the same rule the Memory page
uses):

- `sales/`, `helpdesk/` (Support), `comms/` (Communications), `production/`, `accounting/`,
  `coder/` (the Website agent), `orchestrator/` (the chief of staff);
- `marketing/` for the Marketing lead, and each Marketing topic beside it under its own key
  (`seo/`, `email/`, `analytics/`, `customer_avatar/` for Ideal customers, and so on). That is the
  layout the Hiveku VS Code extension writes into the same folder, so the two never move each
  other's files;
- `shared/` for what no agent owns: "Shared with every agent" on the Memory page. Every agent follows
  those in chats.

The chief of staff's own entries (`_account:*`) are listed the way the page lists them: How it works
and Background under `identity/orchestrator/`, her rules, skills and notes under
`rules/orchestrator/`, `skills/orchestrator/` and `memory/orchestrator/` (the five business topics
the page marks "Moved to About your business" included), and Voice and pronunciation under
`memory/business/voice/`. Shapes the page leaves out are left out here too.

Each file's front matter carries `id`, `domain`, `owner` (an agent key, or `shared`), `memory_page`
(where the Memory page shows it, in its own words), `version` and `updated_at`. The domain is the
entry's identity. When Hiveku does not say who owns an entry yet, the pull files it the older way,
by the department in its name or its `<!-- department: x -->` line, else `general/`.

**Skills for Claude Code.** Every skill is also written to
`.claude/skills/hiveku-<agent>-<name>/SKILL.md` (for example `hiveku-seo-keyword-research-workflow`,
`hiveku-shared-<name>` for one every agent follows), with a name and a one-line description, so a
session in this folder finds the account's playbooks without being told to load them. They were
written for Hiveku's own agents: where one names a tool this session does not have, use the matching
Hiveku tool (`hiveku_find_tools`). A new session picks up skills that are new since it started.

- The skill's text is account data, so it is made inert first: Claude Code would otherwise run the
  shell commands its dynamic-context syntax marks (an exclamation mark before a command in
  backticks, or a code block whose fence is followed by an exclamation mark) on this machine, and
  attach the files that an `@` before a path names. Those become plain text (the exclamation mark and
  the `@` get a backslash, and such a code block becomes a plain one); the file under `skills/` keeps
  the text as Hiveku stores it.
- A copy is written only where there is no file yet, where the file is still exactly what the last
  pull wrote, or where it already holds this text. A copy the VS Code extension wrote at the same
  path, or one edited here, is left alone and reported: delete it to have the pull write it.

The pull keeps two records in `.hiveku/`: `knowledge-manifest.json`, which the VS Code extension
reads and writes too (the typed entries only, in the row shape both tools use), and
`knowledge-plugin.json`, this plugin's own (each entry's owner and stored department column, the
chief of staff's and Voice rows, and the files and skill copies this plugin wrote). The permission
prompts read the second to name who follows an entry.

Read the status output carefully before trusting local knowledge files:

- `changed_remote` - updated on Hiveku since the last pull; re-pull before relying on them.
- `deleted_remote` - gone upstream but STILL ON DISK here (sync never deletes an entry's local file);
  treat those files as unverified.
- `locally_modified` - edited here since the pull; a re-pull will overwrite them, so surface
  this to the user before pulling again.

Two things a pull tidies, and only for a file this plugin wrote that is exactly what it wrote: a file
whose entry now belongs to another agent moves to that agent's folder (an edited copy stays and is
reported), and the `.claude/skills/` copy of a skill that is gone is removed, because Claude Code
would keep following it (an edited copy stays and is reported). A file another tool wrote is never
moved or removed.

**Pull covers ACCOUNT-level memory only.** It calls `memory_list` with a type filter (and once with
none, for the chief of staff's rows) and nothing else, and that route defaults to
`project_id IS NULL`. Project-scoped entries - anything written by `memory_create` /
`memory_bulk_create` with a `project_id` - are never mirrored, never counted, and will show up in
the status report's `deleted_remote` bucket only if they were once account-level. A per-site rule
that is missing from disk may simply be project-scoped: check with `memory_list({ project_id })` or
`memory_list({ include_project_scoped: true })` before concluding it is gone, and do not re-create
it at account level, which silently changes its scope.

To change knowledge, use the live memory_* MCP tools, then `knowledge pull` to bring the change down:

- New skill or rule: `memory_create({ type: "skill" | "rule", name: "<kebab-slug>", content, reason })`.
  Say which agent it is for: pass `department` where the tool offers it, and start `content` with
  `<!-- department: seo -->` (the agent's key) either way, which is how Hiveku reads it today. One
  that names no agent is Shared with every agent: every agent follows it, and Hiveku asks before
  creating one.
- Existing entry: read it with `memory_list({ domain: "_skill:<slug>" })` or `memory_get`, then
  `memory_update({ memory_id, content, reason, expected_version })` with the full body.
  `memory_update` REPLACES the content. If you read that entry earlier in the session, check
  `memory_log_list({ memory_id, since })` first and merge any newer change; pass `reason`, one line
  on why.
- Wrong edit, or an entry deleted by mistake: `memory_list_versions({ memory_id })` (works on deleted
  entries too) then `memory_restore_version({ version_id, reason })`.

Editing the local mirror changes nothing upstream, and a re-pull overwrites it.

**About your business is not an agent's memory and is not in `memory/`.** `knowledge pull` also
writes it as the read-only `hiveku-data/account/ACCOUNT_MEMORY.md` (the same file `/hiveku:pull`
writes): the owner's text, then the agent suggestions not reviewed yet, each with who suggested it
and when. Owners and admins edit it on the Memory page at the link in the file's header; there is no
tool that sets it, and the memory_* tools refuse it. The only write is `account_memory_append`,
which suggests one line for an owner to review. Nothing uploads the local file.
