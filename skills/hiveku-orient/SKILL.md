---
name: hiveku-orient
description: "How to operate a Hiveku account safely from Claude Code — read this FIRST before any Hiveku work. Covers which account you are on, the you-are-not-the-only-writer rule, scratch and secrets hygiene, department agents, PM tasks, and the Owner update."
---

Read and follow this before using any Hiveku tool.

## What Hiveku is

Hiveku is a marketing, website-builder and CRM platform. The plugin exposes ~1,366 tools (content,
CRM, website projects, deploys, analytics, email, social, voice).

**Which account you reach is decided by the DIRECTORY you are working in**, not by an environment
variable. Each directory is bound to exactly one account via `.hiveku/account.json`, and the key for
that account is resolved locally. A key is pinned server-side to its account, so there is no way to
reach another tenant from here even by accident.

If tools are missing entirely, this directory is not bound: run `/hiveku:bind`. If tools return 401,
the key was revoked or rotated: run `/hiveku:connect`.

## Non-negotiables — these prevent real incidents

- **Verify identity before ANY write.** Call `get_account_info` and confirm it is the account you
  intend. This matters most when the VS Code extension is also installed: it registers its own
  Hiveku server, so a session can have two accounts live at once under different tool prefixes
  (`mcp__hiveku__*` versus `mcp__plugin_hiveku_hk__*`). The session-start banner tells you when that
  is happening. Do not trust the folder name — trust `get_account_info`.
- **You are NOT the only writer.** Other agents and people push to these same projects while you
  work. Check what is current BEFORE you start (`project_version_log`) and AGAIN before you push
  (`project_files_status` — `changed` means they edited it, `only_remote` means they added files you
  do not have). Before any tree-replace (`delete_missing: true`), run `dry_run` first and READ the
  would-delete list: a file you did not send may be somebody's new work rather than a leftover.
  Never blind-overwrite.
- **Start strategic work with `account_context_get({ domain })`.** It returns the persona, brand
  voice, avatars, memory, skills and rules. Skipping it is the single most common cause of output
  that sounds nothing like the client.
- **Generative or strategic work goes through `talk_to_department({ domain, message })`**, which runs
  the department agent with full hydration; then persist the result with the matching direct tool
  (`content_create`, `crm_create_deal`, and so on). Pure CRUD — status flips, list queries,
  metadata — should use the direct tools.
- **Keep all scratch work inside the project's own `.hiveku/tmp/`.** One machine may hold many
  account folders at once, so `/tmp` is shared ground: two accounts writing `/tmp/site.tar.gz`
  overwrite each other and leak between clients.
- **Never push local config into a project.** `.mcp.json`, `.env*` and `.hiveku/` carry local
  credentials; exclude them from every bulk save and archive. Real application secrets belong in
  `project_secrets_*` and are injected at deploy. Never read or print `.env.local`.
- **PM tasks are required.** Create one when you start work, comment as you go, and complete it when
  done, attributed to the authenticated user (resolve via `crm_list_users`).
- **Every completed task ends with an Owner update** — two to four calm, plain sentences a busy owner
  can skim. Lead with the benefit, no alarm vocabulary, no self-blaming narration, accurate.
- Video generation is paid and capped: call `marketing_generate_video` with `dry_run: true` first.

## A read-only account

An account can be connected read-only. Those keys refuse every write, including
`talk_to_department` — which reads like a chat tool but runs a department agent with its own full
toolset. If a write is refused for that reason, say so plainly and stop; do not look for another
route to the same effect.

## Finding the right tool

Do not guess tool names — there are over a thousand. Discover them with `hiveku_docs_search` and
`hiveku_docs_get`, and use `hiveku_playbooks_list` / `hiveku_playbook_get` for step-by-step flows
(deploying, file CRUD, rollback, debugging a failed deploy). Most project tools need a `project_id`,
which comes from `list_projects` or `get_project`.

## Related

- `/hiveku:connect` — connect or reconnect accounts.
- `/hiveku:bind` — bind this directory to one account.
- `/hiveku:status` — what is bound here, and whether a second connection is live.
- `/hiveku:brief` — load the account's persona and context before strategic work.
