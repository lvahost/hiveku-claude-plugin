---
description: Quote-to-cash sweep - stalled quotes, unsigned contracts, unpaid invoices, one next step each.
---
Quote-to-cash sweep. Context: `account_context_get({ domain: "sales" })` (there is no `commerce` domain).
1. Quotes: `crm_estimate_list({ status: "sent", order: "created_asc" })` and `{ status: "viewed" }` →
   oldest-first stalled quotes and the ones the client opened but never answered. `limit` defaults to
   50 (max 200) with `offset` - if a page comes back full, walk the next one or the sweep silently
   misses the tail. Portal tokens die at 30 days regardless of `expires_at`, so anything sent over 30
   days ago needs a re-send, not a nudge.
2. Contracts: `crm_envelope_list({ status: "sent" })`, then `crm_envelope_list_signers({ envelope_id })`
   on each → partially signed is derived (some `signed_at` set, some null); there is no such status to
   filter. Also pull `{ status: "declined" }` - a decline is an outcome to work, not a stalled item.
3. Receivables: `accounting_ar_aging` + `accounting_invoice_list({ status: "sent" })` → the unpaid tail
   by bucket. Deeper chase with drafted reminders: `/hiveku:books-chase`.
4. Per item: the ONE next step. Draft the follow-up yourself off the loaded context, or use
   `talk_to_department({ domain: "content", message })` for client-facing copy. Show drafts - send
   NOTHING without approval. `crm_estimate_send` requires `channel` ('email'|'sms'|'both') and should
   always carry an `idempotency_key`. `crm_envelope_send` does NOT need `from_email` on
   `crm_payment_integrations` despite what its registry line says - unset, the route sends from
   `agreements@notifications.hiveku.com` via Resend; set (and domain-verified), it sends from the
   client's own commerce domain. It is a branding choice, not a blocker, and no MCP tool reads it.
5. Log each chase as `crm_create_activity` and open a PM task per promised date.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
