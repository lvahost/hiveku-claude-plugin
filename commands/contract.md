---
description: Put a contract out for signature - envelope from a template, signer-order discipline, confirmed send. Chasing unsigned envelopes is /hiveku:quotes.
argument-hint: "[deal/client + which contract - e.g. 'MSA for Acme, their CEO signs first']"
---
Contract out for signature: $ARGUMENTS. Context: `account_context_get({ domain: "sales" })`, and
load `hiveku-sales-agency/references/quote-to-cash.md` first - this is a legal document, not an email.
1. Resolve the counterparty the same way as an estimate: `crm_search_contacts` /
   `crm_list_companies`, link contact↔company first, carry `deal_id` so the envelope shows up on the
   deal's paper trail.
2. Template: `crm_contract_template_list` → `crm_contract_template_get`. **A template's body is
   immutable** - `crm_contract_template_update` edits only name/description/is_archived, and
   passing `layout_json` to it succeeds while changing NOTHING. New terms = `crm_contract_template_create`
   a new version (envelopes reference the template id for audit; archive the old one, never delete).
3. `crm_envelope_create({ title, signers, contact_id?, company_id?, deal_id?, layout_json |
   source_pdf_s3_key + fields })` - `signers` is 1-10 `{ name, email, role }`; on a SEQUENTIAL
   signing order put the EXTERNAL counterparty first and the internal countersigner last, because
   sequential sending emails ONLY the first pending signer. It's a draft: `crm_envelope_update` and
   `crm_envelope_add_signer` work now and 409 after send.
4. Sender preflight, stated honestly: `from_email` on the payment-integrations settings page is a
   **branding choice, not a blocker** - unset, invitations send from
   `agreements@notifications.hiveku.com` via Resend; set and domain-verified, they send from the
   client's own domain. No MCP tool reads or sets it; flag it to the owner if the client cares.
5. **Confirm gate.** Show the rendered terms (or the source PDF's identity), the exact signer roster
   with order, and where it lands in the CRM. Only on an explicit yes: `crm_envelope_send({
   envelope_id })`. **Send is one-way** - a sent envelope is corrected by `crm_envelope_void` (+ a
   fresh envelope), never edited; a completed one can't even be voided.
6. Track and log: `crm_envelope_get` (full state + last 100 events) / `crm_envelope_list_signers`
   (partially-signed is derived - some `signed_at` set, some null; there is no such status filter).
   `crm_create_activity` the send, PM task on the chase date; the weekly unsigned sweep is
   `/hiveku:quotes` step 2.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
