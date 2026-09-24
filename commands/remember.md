---
description: Persist what you learned/did into the right Hiveku department memory (source of truth), or suggest a business-wide fact for the account memory.
argument-hint: "[department] [what you learned]"
---
Record a learning to Hiveku so every department stays in sync.

## A fact about the whole business goes to the account memory

Some facts belong to every department, not one: opening hours, locations, who the key people are,
standing policies ("Closed on Mondays from November to March"). Those go to the **account memory**,
the one document every department agent reads at the start of each conversation. You cannot edit
it: the account's owners and admins write it on the Hiveku dashboard (Account memory), and there is
no tool that sets, replaces or deletes it. What you can do is suggest one line:

1. Read it first: `account_memory_get()`. If the fact is already in the text or already waiting as
   a suggestion, stop.
2. `account_memory_append({ text })` with ONE plain sentence of at most 400 characters. Never
   secrets, customer personal data, or something only one department needs (that goes in the
   department memory below).
3. Tell the person plainly: "I suggested this for the account memory. An owner or admin keeps or
   removes it on the dashboard under Account memory." (On an account with no owner or admin, the
   Hiveku team reviews it.) Until then the agents read it marked as not
   reviewed, and the owner's text wins where they disagree. `duplicate: true` means it was already
   there; a 409 `account_memory_full` means an owner has to review the waiting suggestions first.

If the person wants to change what the account memory already says, that is an edit on the
dashboard, not something you can do here. Do not work around it by copying the fact into every
department's memory, and do not try `memory_create` / `memory_update` on it (they refuse).

Everything else - what one department learned - goes to that department's memory:

1. Pick the department this memory belongs to. The domain is NOT free-form - it decides which agents
   ever see the entry. Hydration filters on `account_ai_memory.department`, which is derived from the
   domain against this canonical list: `marketing`, `content`, `seo`, `social`, `ppc`, `outbound`,
   `branding`, `customer_avatar`, `customer_journey`, `website_design`, `knowledge_base`, `workflow`,
   `before_after_grid`, `email`, `sales`, `helpdesk`, `production`, `accounting`, `comms`, `coder`,
   `orchestrator`. `dev`, `crm`, `pm`, `analytics`, `commerce` and `web` are NOT canonical: a memory
   filed under those gets department NULL and is hydrated into nothing, and the MCP `memory_create`
   tool exposes no `department` parameter to correct it afterwards. Use `coder` for dev notes,
   `marketing` for analytics, `sales` for commerce, `website_design` for web.
   Do NOT use `list_departments` for this - it returns the CHAT-agent domains, a different and smaller
   vocabulary (it has `analytics`, it has no `sales` or `helpdesk`).
2. Read the existing entry BEFORE writing: `memory_list({ domain: "<department>" })`. There is one row
   per (domain, project_id), and the `content` it returns is the department's ENTIRE accumulated
   memory. `memory_list` with only `{ type }` returns account-level rows; pass `project_id` or
   `include_project_scoped: true` to see project-scoped entries.
3. Write it:
 - Entry exists → append your note to the content you just read and pass the WHOLE merged document
     to `memory_update({ memory_id, content })`. `memory_update` REPLACES the document. Sending only
     the new note silently destroys every prior entry for that department.
 - No entry → `memory_create({ type: "memory", name: "<department>", content })`. A 409 means one
     already exists: go back to step 2 rather than duplicating.
   `content` is concise markdown: what you did, what you learned, why it matters, how to apply next
   time.

## Recovering memory

Nothing here is unrecoverable. Every update and delete snapshots the prior content first, and
snapshots survive the entry's deletion.

`memory_list_versions({ memory_id, limit })` - works even if the entry was deleted - then
`memory_restore_version({ version_id })`. If the entry still exists its content is updated; if it was
deleted it is re-inserted with its ORIGINAL UUID. Restore is forward-only (the version number
increments), so it is safe to run and leaves a clean audit chain. `memory_delete` is recoverable the
same way (its snapshot carries `changed_by="olympus_agent_delete"`).

## Teaching the account a skill or a rule

Memory documents are one kind of entry. The same tool writes the rest: `memory_create({ type, name,
content })` where `type` is `memory`, `skill`, `rule`, `command`, `agent` or `identity` - anything
else is a 400 - and `name` is a kebab-case slug, 2 to 60 chars, for every type except `memory`.
A skill is a repeatable procedure, a rule is a standing constraint, an identity is a department
persona (`_identity:sales` is where the sales persona lives).

Scoping is the non-obvious half. `account_context_get` filters skills and rules to the requested
domain by reading a department tag out of the CONTENT, not from a database column - the column is
always NULL for these types. Start the content with:

```
<!-- department: sales -->
```

Omit the tag only when the entry should apply to EVERY department; an untagged skill is global.

`memory_create({ type: "skill", name: "discovery-call-prep", content })` creates it; on a 409 use
`memory_update` with the full merged body. Then run `/hiveku:knowledge pull` to mirror it locally.

The local `memory/<dept>/` files are only a mirror - Hiveku is the source of truth, and persisting here is
what brings the other departments + dashboard agents up to speed.
