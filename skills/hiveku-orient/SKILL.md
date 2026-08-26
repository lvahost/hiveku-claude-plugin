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
  that sounds nothing like the client. The `domain` values are a fixed enum — see below.
- **Generative or strategic work goes through `talk_to_department({ domain, message })`**, which runs
  the department agent with full hydration; then persist the result with the matching direct tool
  (`content_create`, `crm_create_deal`, and so on). Pure CRUD — status flips, list queries,
  metadata — should use the direct tools. Not every discipline has a department agent; when it does
  not, use `agent_identity_get` and act as the department yourself rather than inventing a domain.
- **Keep all scratch work inside the project's own `.hiveku/tmp/`.** One machine may hold many
  account folders at once, so `/tmp` is shared ground: two accounts writing `/tmp/site.tar.gz`
  overwrite each other and leak between clients.
- **Never push local config into a project.** `.mcp.json`, `.env*` and `.hiveku/` carry local
  credentials; exclude them from every bulk save and archive. Real application secrets belong in
  `project_secrets_*` and are injected at deploy. Never read or print `.env.local`.
- **PM tasks are required.** Create the task with
  `pm_tasks_create({ project_id, title, assigned_to_id })`, where `project_id` comes from
  `pm_projects_list` (or `pm_projects_create`) and `assigned_to_id` is the `id` field from
  `crm_list_users` — NOT `clerk_user_id`, which is a different id space and errors the whole write.
  The field is `title`, not `name`. Comment as you go with `pm_tasks_comment`, read the thread back
  with `pm_task_comments_list`, and close with `pm_tasks_complete({ id, summary })` (sets
  status='done', completed_at=now, progress_percentage=100; the summary is recorded as an audit
  comment). `pm_tasks_complete` takes no attribution argument — attribution is set at create/update
  time. To reopen a task closed too early use `pm_tasks_uncomplete`, never `pm_tasks_update`: the
  update PATCH allow-list cannot clear `completed_at`, so the task keeps reading as done in every
  report while sitting in an open status.
- **Every completed task ends with an Owner update** — two to four calm, plain sentences a busy owner
  can skim. Lead with the benefit, no alarm vocabulary, no self-blaming narration, accurate.
- Video generation is paid and capped: call `marketing_generate_video` with `dry_run: true` first.

## Department domains — one table, two different enums

Both `account_context_get` and `talk_to_department` take a `domain`, and their accepted sets are NOT
the same. An unlisted value is a server rejection (HTTP 400 `invalid_domain`, or
`Unknown domain '<x>'`), not a soft fallback. This table is the only correct source; do not copy a
domain list out of a skill file.

| Domain | `account_context_get` | `talk_to_department` |
|---|---|---|
| content, marketing, seo, social, ppc, branding, outbound | yes | yes |
| customer_avatar, customer_journey, before_after_grid, website_design, knowledge_base, workflow | yes | yes |
| sales | yes | NO — there is no sales department agent |
| helpdesk | yes | NO — there is no helpdesk department agent |
| analytics | NO — use `marketing` | yes |

That is 15 values for `account_context_get` (default `content` when omitted) and 14 for
`talk_to_department`. There is no `web`, `commerce`, `email`, `pm`, `accounting`, `creative`,
`voice` or `knowledge` domain on either tool. Map them: web -> `website_design`, commerce ->
`sales` for context and `content` for customer-facing copy, email -> `marketing`, knowledge ->
`knowledge_base`.

For `sales` and `helpdesk`, load `agent_identity_get({ domain: 'sales' | 'helpdesk' })` and act as
that department yourself. Say that is what you are doing; do not silently route the ask to an
unrelated department.

## Acting as a department: `agent_identity_get`

`agent_identity_get({ domain, include_cross_domain?, format? })` returns the FULL hydration bundle
the live department agent runs with — identity persona, brand guide, account memory, every
skill/rule/command/sub-agent tagged for that domain, avatars, journeys, KB index, recent published
content, and cross-domain memory from related departments. It accepts the same 15 domains as
`account_context_get`.

Use it when you want to act AS the department with no upstream call and no streaming wait — which
is the only option for `sales` and `helpdesk`. `format: 'markdown'` returns a ready-assembled
CLAUDE.md under `data.content`; write that to the workspace's `CLAUDE.md` and the session picks up
the persona, voice, rules and skills automatically. Default `format: 'json'` returns the structured
payload with the same markdown under `data.claude_md`. Set `include_cross_domain: false` to slim it.

`agent_identity_domains_list` shows which `_identity:*` domains this account has actually
configured, so you stop guessing and getting 404s.

## Memory is ONE document per department — read before you write

Memory lives in `account_ai_memory`, one row per (domain, project_id). `memory_update({ memory_id,
content })` REPLACES that row's whole content. Sending only today's note deletes everything the
department had accumulated.

Always read-modify-write:

1. `memory_list({ domain: '<dept>' })` — the returned `content` is the WHOLE department memory.
2. Append your note to that text.
3. `memory_update({ memory_id, content })` with the FULL merged document.

If no entry exists, `memory_create({ type: 'memory', name: '<dept>', content })`; a 409 means one
already exists, so go back to step 1 rather than duplicating.

**The domain is not free-form.** Hydration filters on `account_ai_memory.department`, which is
derived from the domain against this canonical list: `marketing`, `content`, `seo`, `social`, `ppc`,
`outbound`, `branding`, `customer_avatar`, `customer_journey`, `website_design`, `knowledge_base`,
`workflow`, `before_after_grid`, `email`, `sales`, `helpdesk`, `production`, `accounting`, `comms`,
`coder`, `orchestrator`. Anything else — `dev`, `crm`, `pm`, `analytics`, `commerce`, `web` — lands
with department NULL and is hydrated into nothing, and the MCP `memory_create` tool exposes no
`department` parameter to fix it afterwards. `memory_create` also accepts only these types:
`memory`, `skill`, `rule`, `command`, `agent`, `identity` — anything else is a 400.

**Recovering memory.** Every PUT and DELETE snapshots the prior content first, and snapshots survive
deletion. `memory_list_versions({ memory_id, limit })` works even on a deleted entry;
`memory_restore_version({ version_id })` updates the entry if it still exists and re-inserts it with
its ORIGINAL UUID if it was deleted. Restore is forward-only — the version number increments — so it
is safe to run and leaves an audit chain.

## Knowledge bases vs memory

Two different substrates. Memory is short curated directives, read wholesale at hydration. A
knowledge base holds long source documents — brand guides, service menus, pricing sheets, call
transcripts — chunked and embedded server-side so department agents retrieve them semantically.
Memory documents are never chunked or embedded, so a 40-page brand guide does not belong there.

The loop: `kb_list` -> `kb_create({ name })` -> `kb_documents_index_text({ kb_id, title, content,
source_url?, tags? })` (the server chunks and embeds) -> `kb_search({ query, kb_id? })` ->
`kb_stats({ kb_id })` for document count, total chunks and last-indexed time. `kb_documents_list` /
`kb_documents_get` / `kb_documents_delete` manage the contents; `kb_update` / `kb_delete` manage the
KB itself, and `kb_delete` cascades to every document in it, so confirm before calling it.

Routing trap: `kb_list`, `kb_get` and `kb_create` hit `/api/olympus/knowledge-bases`, while
`kb_update`, `kb_delete`, `kb_stats` and every `kb_documents_*` tool hit
`/api/olympus/marketing/knowledge-bases/:kbId`. Verify a `kb_id` from `kb_list` resolves with
`kb_stats` before assuming the document tools can address it. `marketing_knowledge_bases_list` and
`marketing_knowledge_bases_search` are the marketing-side pair; `kb_search` and
`marketing_knowledge_bases_search` hit the same endpoint but only the latter accepts `top_k`.

Note the `helpdesk_kb_*` tools are a DIFFERENT family — public support articles, not AI retrieval.

## When `talk_to_department` refuses

Four distinct causes, and they need different responses:

- **Read-only key.** Those keys refuse every write, including `talk_to_department` — which reads
  like a chat tool but runs a department agent with its own full toolset. Structural: say so plainly
  and stop; do not look for another route to the same effect.
- **Domain not in the enum.** `Unknown domain '<x>'`. Fix the domain against the table above.
- **Entitlement.** "This account does not have access to the '<x>' department. Upgrade or enable it
  in the dashboard settings." Per-domain, gated on the account's `pageAccess` flags, so a valid
  domain on a full-write key can still be refused. `list_departments` is the only reliable
  pre-check — it returns exactly the domains this tenant can reach, with `identity_name` and
  `has_identity`. Call it before delegating.
- **Transient.** "Department '<x>' did not respond within Ns… may be cold-starting or overloaded."
  Wait 30s and retry once, or break the request into a smaller ask. A mid-stream stall returns a
  partial answer in `response` alongside the message — salvage the partial rather than re-running
  the whole ask.

## Finding the right tool

Do not guess tool names — there are over a thousand. Discover them with `hiveku_docs_search` and
`hiveku_docs_get`, and use `hiveku_playbooks_list` / `hiveku_playbook_get` for step-by-step flows
(deploying, file CRUD, rollback, debugging a failed deploy).

## Two different project id spaces

Most project tools need a `project_id`, and there are TWO tables behind that name. Passing one id to
the other side does not degrade gracefully; it 404s or returns nothing.

- **website_projects** — the buildable code: files, previews, builds, deploys, domains, env vars,
  CMS. Resolve with `sites_list` (the whole account, plus dev/staging/prod URLs, canonical GitHub
  state from `builder_project_settings`, and container status) or `project_get({ project_id })` for
  one. Everything under `/hiveku:code`, `/hiveku:preview`, `/hiveku:deploy`, `/hiveku:cms`,
  `/hiveku:env`, `/hiveku:domains` uses this id.
- **pm_projects** — the PM board: tasks, milestones, sections, recurrences. Resolve with
  `pm_projects_list` (or the equivalent `list_projects`) and `get_project({ project_id })`.
  `pm_tasks_create`, `pm_task_recurrence_create` and `mc_task_spawn_pm` all want THIS id.

`pm_projects_create` has a `website_project_id` field that links a PM project to its website. Also
note `list_projects` exposes `github_repo_full_name`, which is usually null even when GitHub IS
connected — `sites_list` reads the canonical GitHub state, so never report "GitHub disconnected"
off the pm_projects field.

## Related

- `/hiveku:connect` — connect or reconnect accounts.
- `/hiveku:bind` — bind this directory to one account.
- `/hiveku:status` — what is bound here, and whether a second connection is live.
- `/hiveku:brief` — load the account's persona and context before strategic work.
- `/hiveku:seed` — seed a brand-new account's department memory in one `memory_bulk_create` call.
- `/hiveku:remember` — persist a learning into the right department memory, read-merge-write.
- `/hiveku:knowledge` — mirror the account's memory, rules and skills locally (account-level only).
