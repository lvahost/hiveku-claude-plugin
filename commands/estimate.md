---
description: Create and send a quote (estimate) - template or hand-built line items, cents-money discipline, confirmed send. Chasing quotes already out is /hiveku:quotes.
argument-hint: "[who + what's being quoted - e.g. 'Acme - 3-month SEO retainer, $4,500/mo']"
---
Create a quote: $ARGUMENTS. Context: `account_context_get({ domain: "sales" })`, and load
`hiveku-sales-agency/references/quote-to-cash.md` before the first write.
1. Resolve who it's for: `crm_search_contacts` / `crm_list_companies` → `crm_get_contact` /
   `crm_get_company`. `crm_estimate_create` needs contact_id OR company_id; for a B2B quote link the
   contact to the company FIRST (`crm_link_contact_company`) so the paper hangs off the right object.
   Find the live deal off the contact and pass `deal_id`; no deal for a real opportunity → offer to
   create one with the `/hiveku:deal` discipline before quoting into thin air.
2. Body: `crm_estimate_template_list` → `crm_estimate_template_get` before hand-authoring - the
   account default (`is_default: true`) carries the client's PDF design. Hand-built:
   `line_items: [{ description, quantity, unit_cents, discount_cents?, tax_bps?, sort_order? }]` -
   **ALL MONEY IN CENTS** ($4,500 = 450000). Line-item and scope language is generative: draft it
   yourself from the loaded sales context, in the account's voice.
3. `crm_estimate_create({ contact_id | company_id, deal_id?, line_items, expires_at?, notes?, terms? })`
   - a DRAFT; estimate_number is auto-assigned and nothing has reached the customer yet.
4. **Confirm gate.** Show recipient (name + the exact email/phone on file), channel, every line item
   in a DOLLARS table next to the cents you sent, the total, and expiry. Fix with
   `crm_estimate_update` (editable in draft/sent/viewed/expired/declined; 409 on
   accepted/converted - duplicate instead; passing `line_items` REPLACES the whole set).
5. Send only on an explicit yes: `crm_estimate_send({ estimate_id, channel, idempotency_key,
   attach_pdf? })` - `channel` is required ('email' | 'sms' | 'both'; SMS needs the voice add-on),
   `attach_pdf: true` renders and attaches the PDF, and one portal token (TTL 30 days) is shared
   across channels. On an ambiguous timeout, `crm_estimate_get({ estimate_id })` BEFORE any retry,
   then retry with the SAME idempotency_key.
6. After-care: say out loud that the portal link dies in 30 days regardless of `expires_at`
   (a stale quote needs a RE-SEND, not a nudge - `/hiveku:quotes` runs that sweep). Log the send as
   `crm_create_activity` and open a PM task on the follow-up date. If "proposal sent" is a real
   stage exit on the deal, advance it (`crm_deal_move_stage`). When it's accepted later:
   `crm_estimate_mark_accepted` for an offline yes, `crm_estimate_convert_to_invoice` is ONE-SHOT
   (409 on a re-run), and the invoice send lives in `/hiveku:quotes` step 3.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
