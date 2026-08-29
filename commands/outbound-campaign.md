---
description: Stand up a cold-email campaign - one segment, mirrored campaign (the API creates it EMPTY upstream; steps are authored in the provider dashboard), chunked lead load, then the /hiveku:outbound-launch gate. Not an activation.
argument-hint: "[segment/campaign name - e.g. 'Austin HVAC v1']"
---
Stand up an outbound campaign: $ARGUMENTS. Context: `account_context_get({ domain: "outbound" })`,
and load `hiveku-outbound-agency/references/tool-traps.md` BEFORE the first call - every write below
has a documented failure mode.
1. Wiring: `outbound_list_integrations` → the `integration_id` (read it here, not off old campaign
   rows). Then `outbound_list_campaigns({ search })` for a duplicate-name check - the POST creates a
   REAL upstream campaign every time it runs. `outbound_list_email_accounts` for a quick mailbox
   sanity look (status, warmup, daily headroom); the full verdict is `/hiveku:outbound-health`.
2. Copy, winners-first: `outbound_list_sequence_learnings({ is_winner: "true" })` so a proven
   subject/step shape gets reused before a new one is invented; templates worth reusing are in
   `outbound_list_email_templates({ is_active: "true" })`. Draft via
   `talk_to_department({ domain: "outbound", message })`: 3-4 steps, plain text, under ~120 words,
   one CTA, every merge tag with a fallback.
3. **Confirm gate #1 - the campaign.** Show name, integration, and the step drafts. On a yes:
   `outbound_create_campaign({ name, integration_id, sequences })` - and say plainly what just
   happened: `sequences` are mirrored as LOCAL JSON only; the provider-side campaign is EMPTY, and
   the steps must be authored in the SmartLead dashboard before launch. Never report the campaign
   as "built" off the 201. Verify identity with `outbound_get_campaign({ campaign_id })` - its
   `sequences` are the same local mirror and prove nothing upstream.
4. **Confirm gate #2 - the list.** The list itself comes from `/hiveku:prospect` (already
   preflighted, suppressed, and approved there - if it wasn't, go do that first). Load it chunked:
   `outbound_leads_bulk_create({ campaign_id, leads })` in batches of ≤100 (the batch cap; 400
   above it), checkpointing after each batch. Returns COUNTS ONLY - `{ uploaded, not_uploaded }` -
   so report not_uploaded without naming leads (the next sync reconciles); `pending_sync` rows with
   `pending-*` external_ids are a HEALTHY fresh-load state, not a failure.
5. Hand to `/hiveku:outbound-launch` for the go/no-go gate (health blockers, suppression re-sweep,
   the upstream-steps check, copy check, named approval of list and copy). Activation is
   dashboard/provider-side - never describe the campaign as live.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
