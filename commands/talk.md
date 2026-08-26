---
description: Delegate generative or strategic work to a Hiveku department agent, then persist the result.
argument-hint: "[department and the ask — e.g. 'seo: a refresh plan for the decaying posts']"
---

For generative or strategic work on the bound account$ARGUMENTS, run the department agent — it executes
with the account's full hydration (persona, brand voice, memory, skills), which a raw tool call does not.

1. **Frame** with `account_context_get({ domain })` if you don't already have the account's positioning.
2. **Delegate:** `talk_to_department({ domain, message })`. Valid domains: `sales`, `marketing`, `seo`,
   `ppc`, `social`, `content`, `email`, `outbound`, `helpdesk`, `pm`, `accounting`, `creative`, `voice`,
   `knowledge`. Give it the real objective and the constraints, not a thin prompt.
3. **Persist** the output with the matching direct tool so it becomes account state, not just chat —
   `content_create` for content, `crm_create_deal` / `crm_*` for pipeline, `memory_create` for a decision
   or a reusable play, and so on. Generative work that is never persisted is lost.

`talk_to_department` is a WRITE-capable primitive (it runs an agent with its own full toolset), so a
read-only key cannot use it — that is by design. Show drafts and confirm before anything leaves the
account (email/social/outbound sends).
