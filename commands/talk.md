---
description: Delegate generative or strategic work to a Hiveku department agent, then persist the result.
argument-hint: "[department and the ask — e.g. 'seo: a refresh plan for the decaying posts']"
---

For generative or strategic work on the bound account$ARGUMENTS, run the department agent — it executes
with the account's full hydration (persona, brand voice, memory, skills), which a raw tool call does not.

0. **Confirm the account can reach the department:** `list_departments`. It returns exactly the domains
   this tenant is entitled to, each with `label`, `identity_name` and `has_identity`. Being in the enum
   is not entitlement, and this is the only reliable pre-check.
1. **Frame** with `account_context_get({ domain })` if you don't already have the account's positioning.
   Its enum is 15 values and is NOT the same list as step 2: `content` (the default), `marketing`,
   `seo`, `social`, `ppc`, `sales`, `helpdesk`, `branding`, `customer_avatar`, `customer_journey`,
   `before_after_grid`, `website_design`, `knowledge_base`, `workflow`, `outbound`.
2. **Delegate:** `talk_to_department({ domain, message })`. Exactly 14 domains are accepted: `seo`,
   `social`, `content`, `marketing`, `branding`, `outbound`, `ppc`, `analytics`, `customer_avatar`,
   `customer_journey`, `before_after_grid`, `website_design`, `knowledge_base`, `workflow`. Anything
   else is refused server-side with `Unknown domain '<x>'` — there is no soft fallback to a default
   department. Give it the real objective and the constraints, not a thin prompt.

   The two enums differ in both directions: `sales` and `helpdesk` are valid contexts but are NOT
   department agents, and `analytics` is a department agent but is NOT a valid context domain (use
   `marketing` there). There is no agent at all behind accounting, PM, voice, creative or email —
   for those, load context with the nearest valid domain, then draft directly yourself and say that
   is what you did, or call `agent_identity_get` for the department's identity bundle. Drive the
   work with the direct tools (`accounting_*`, `pm_*`, `voice_*`) plus the matching skill. Being in
   the enum is not entitlement either — `list_departments` returns what this account actually has.
3. **Persist** the output with the matching direct tool so it becomes account state, not just chat —
   `content_create` for content, `crm_create_deal` / `crm_*` for pipeline, and memory for a decision or
   a reusable play. For memory, read first: `memory_list({ domain })` returns the department's WHOLE
   document, so append your note to that text and send the full merged body to
   `memory_update({ memory_id, content })`, which REPLACES the document. Only use
   `memory_create({ type: "memory", name: "<dept>", content })` when no entry exists yet. Generative
   work that is never persisted is lost.

`talk_to_department` is a WRITE-capable primitive (it runs an agent with its own full toolset), so a
read-only key cannot use it — that is by design. Two other refusals read differently and need
different handling: an entitlement refusal ("This account does not have access to the '<x>'
department. Upgrade or enable it in the dashboard settings") is fixed in the dashboard, not by
picking a different department; a timeout ("did not respond within Ns… may be cold-starting or
overloaded") is transient, so wait 30s and retry once or split the ask, and if a partial answer came
back in `response` alongside a stall message, salvage that rather than re-running the whole thing.
Show drafts and confirm before anything leaves the account (email/social/outbound sends).
