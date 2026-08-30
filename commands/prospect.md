---
description: Build a cold prospect list the honest way - ICP from the avatar, researched hooks, verification honesty, import preflight, suppression sweep, confirmed load. Campaign build is /hiveku:outbound-campaign.
argument-hint: "[segment - e.g. 'HVAC owners in Austin, 5-50 employees']"
---
Build a prospect list: $ARGUMENTS. Context: `account_context_get({ domain: "outbound" })`, and the
methodology lives in hiveku-outbound-agency SKILL §3 - load the skill before a first-ever list.
1. ICP first: `customer_avatar_list` → the avatar this segment maps to. No avatar → build one WITH
   the user before buying data (`customer_avatar_populate` refuses ungrounded input, correctly).
   One campaign = one segment; a mixed list gets generic copy that converts nowhere.
2. Warm before cold - the cheapest list is people who already know the account:
   `crm_contacts_gone_cold({ days })` and identified website visitors that match the ICP
   (`analytics_visitors`, full/marketing keys). Route those to `/hiveku:followups`, not cold copy.
3. Source the cold rows:
 - CSV from the user or a vendor → parse it yourself, then `crm_import_preflight` with the rows
     BEFORE any bulk create - it reports invalid rows with reasons, intra-batch dupes, cross-DB
     dupes, and unknown custom-field keys without writing anything.
 - Local/geographic → `seo_research({ action: "gbp-locations" })` (DataForSEO spend - confirm the
     credit spend first, and it is NOT visible on a sales-profile key; say so instead of improvising).
 - Hooks: `web_search` / `fetch_url` per prospect or segment - a hook is researched and quoted
     this session, or it is not used.
4. **Verification honesty.** There is no email-verification tool in the catalog. Say that plainly
   and either get an explicit go-ahead to load unverified rows, or route out role accounts
   (info@/sales@), obvious catch-alls, and anything the preflight flagged. Never load silently
   unverified - bounces spend the account's sender reputation, which is shared across campaigns.
5. Suppression sweep before the list is "final": `email_suppression_list` +
   `crm_list_email_suppressions` for the batch, `crm_get_dnc_status` on anyone already in the CRM,
   and `crm_search_contacts` for existing customers and live threads (`crm_email_thread_search`).
   A DNC'd address or a current client on a cold list is a STOP, and you name who you removed.
6. **Confirm gate on the final list:** N rows, the segment definition, and every exclusion bucket
   with its count. Then mirror to the CRM: `crm_contacts_bulk_create` (or one-by-one
   `crm_create_contact`) with a REAL `lead_source` - search-then-create, never upsert, because
   `crm_contact_upsert_by_email` stamps `lead_source='upsert'` and that attribution is
   irreversible.
7. This command enrolls and sends NOTHING. The campaign, the lead load into the sending provider,
   and the launch gate are `/hiveku:outbound-campaign` → `/hiveku:outbound-launch`.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
