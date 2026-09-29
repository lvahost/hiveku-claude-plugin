---
description: Delegate generative or strategic work to a Hiveku department agent, then persist the result.
argument-hint: "[department and the ask - e.g. 'seo: a refresh plan for the decaying posts']"
---

For generative or strategic work on the bound account$ARGUMENTS, run the department agent - it executes
with the account's full hydration (persona, brand voice, memory, skills), which a raw tool call does not.

0. **Confirm the account can reach the department:** `list_departments`. It returns exactly the domains
   this tenant is entitled to, each with `label`, `identity_name` and `has_identity`. Being in the enum
   is not entitlement, and this is the only reliable pre-check.
1. **Frame** with `account_context_get({ domain })` if you don't already have the account's positioning.
   Its enum is 16 values and is NOT the same list as step 2: `content` (the default), `marketing`,
   `seo`, `social`, `ppc`, `sales`, `helpdesk`, `branding`, `customer_avatar`, `customer_journey`,
   `before_after_grid`, `website_design`, `knowledge_base`, `workflow`, `outbound`, `email`.
2. **Delegate:** `talk_to_department({ domain, message })`. Exactly 16 domains are accepted: `seo`,
   `social`, `content`, `marketing`, `branding`, `outbound`, `ppc`, `analytics`, `customer_avatar`,
   `customer_journey`, `before_after_grid`, `website_design`, `knowledge_base`, `workflow`, `sales`,
   `email` (the Email Marketing department).
   Anything else is refused server-side with `Unknown domain '<x>'` - there is no soft fallback to
   a default department. Give it the real objective and the constraints, not a thin prompt.

   `sales` routes to the sales department agent (Morgan, the account's `_identity:sales`),
   hydrated with sales memory, skills, rules, brand and avatars; `list_departments` returns it.
   Three account gates ride along: the sales agent kill switch (403 `sales_agent_disabled` when
   the account has it switched off; an account owner or admin switches it on from the Memory page:
   Sales, then Switch on, at `/dashboard/memory?agent=sales`, which CRM's Agent menu also opens),
   the per-chat spend limit (402 `session_cost_cap_reached`; an owner or admin raises it as "Most
   you spend per chat" under CRM > Settings > Sales agent, `/dashboard/crm/settings/sales-agent`),
   and the account's sales model tier. Staged-approval caveat: through
   this rail nobody can click an approval card, so the sales agent's own gated writes
   (`crm_email_send`, `crm_sequence_enroll`, `crm_deal_close`) come back "staged, awaiting
   approval" and do NOT execute - use it for generative and strategic work (drafts, plans,
   analysis), then persist with the direct `crm_*` tools yourself, exactly as with every other
   department.

   The two enums still differ in both directions: `helpdesk` is a valid context but is NOT a
   department agent, and `analytics` is a department agent but is NOT a valid context domain (use
   `marketing` there). No department agent here is behind accounting, PM, voice or creative, and
   these tools do not reach Communications, Production, the chief of staff or the Website agent
   yet. For those, load context with the nearest valid domain, then draft directly yourself and say
   that is what you did. `agent_identity_get` is no reliable way around that: its `domain` enum is
   the same 16 values as `account_context_get`, so `accounting`, `pm`, `voice` and `creative` are
   not valid arguments and the call can be refused by schema validation before it is ever sent.
   Do not plan around it. (The Olympus route behind it happens to allow `accounting` as a 17th
   domain, so that one call may go through where a client forwards it; `pm`, `voice` and `creative`
   are not in the route's list either and come back 400 `invalid_domain`. Treat an
   accounting bundle as a bonus if you get it, never as the step the play depends on.) Use it for a
   valid neighbouring domain. Drive the work with the
   direct tools (`accounting_*`, `pm_*`, `voice_*`) plus the matching skill. Being in the enum is
   not entitlement either - `list_departments` returns what this account actually has.
3. **Persist** the output with the matching direct tool so it becomes account state, not just chat -
   `content_create` for content, `crm_create_deal` / `crm_*` for pipeline, and memory for a decision or
   a reusable play. For memory, read first: `memory_list({ domain })` returns the department's WHOLE
   document, so append your note to that text and send the full merged body to
   `memory_update({ memory_id, content, reason })`, which REPLACES the document; `reason` is one line
   on why. The department agent may have changed that document during the conversation, so check
   `memory_log_list({ memory_id, since })` (since you read it) and merge any newer change first. Only
   use `memory_create({ type: "memory", name: "<dept>", content })` when no entry exists yet.
   Generative work that is never persisted is lost.

`talk_to_department` is a WRITE-capable primitive (it runs an agent with its own full toolset), so a
read-only key cannot use it - that is by design. Two other refusals read differently and need
different handling: an entitlement refusal ("This account does not have access to the '<x>'
department. Upgrade or enable it in the dashboard settings") is fixed in the dashboard, not by
picking a different department; a timeout ("did not respond within Ns… may be cold-starting or
overloaded") is transient, so wait 30s and retry once or split the ask, and if a partial answer came
back in `response` alongside a stall message, salvage that rather than re-running the whole thing.
Show drafts and confirm before anything leaves the account (email/social/outbound sends).
