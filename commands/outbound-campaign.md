---
description: Stand up a cold-email campaign - one segment, mirrored campaign (the API creates it EMPTY upstream), steps written to the provider by tool on a confirmed save and read back, chunked lead load, then the /hiveku:outbound-launch gate. Not an activation - launch is the gate command that starts sending.
argument-hint: "[segment/campaign name - e.g. 'Austin HVAC v1']"
---
Stand up an outbound campaign: $ARGUMENTS. Context: `account_context_get({ domain: "outbound" })`,
and load `hiveku-outbound-agency/references/tool-traps.md` BEFORE the first call - every write below
has a documented failure mode.
1. Wiring: `outbound_list_integrations` → the `integration_id` (read it here, not off old campaign
   rows). Then `outbound_list_campaigns({ search })` for a duplicate-name check - the POST creates a
   REAL upstream campaign every time it runs. `outbound_list_email_accounts` for a quick mailbox
   sanity look (status, warmup, daily headroom); the full verdict is `/hiveku:outbound-health`.
   Mailbox settings, warmup, sending schedules and connecting a provider stay dashboard-only.
2. Copy, winners-first: `outbound_list_sequence_learnings({ is_winner: "true" })` so a proven
   subject/step shape gets reused before a new one is invented; templates worth reusing are in
   `outbound_list_email_templates({ is_active: "true" })`. Draft via
   `talk_to_department({ domain: "outbound", message })`: 3-4 steps, plain text, under ~120 words,
   one CTA, every merge tag with a fallback.
3. **Confirm gate #1 - the campaign.** Show name, integration, and the step drafts. On a yes:
   `outbound_create_campaign({ name, integration_id, sequences })` - and say plainly what just
   happened: the 201 created a REAL upstream campaign with the NAME; the `sequences` passed here
   are mirrored as LOCAL JSON only, and the provider-side campaign holds NO steps yet. Never report
   the campaign as "built" off the 201. Verify identity with `outbound_get_campaign({ campaign_id })`
   (name, status, integration) - its `sequences` are that same local mirror until step 4 refreshes
   it, and prove nothing upstream on their own.
4. **Confirm gate #2 - the steps, written to the provider.** Preview first:
   `outbound_campaign_sequences_save({ campaign_id, sequences })` WITHOUT `confirm`. `sequences` is
   `[{ seq_number?, delay_in_days?, subject, body, variants?: [{ label?, subject?, body }] }]` -
   bodies are PLAIN TEXT (newlines become HTML the way the dashboard converts them); a step needs a
   non-empty body or at least one variant with a body; `seq_number` defaults to the position,
   `delay_in_days` to 0; variants get MANUAL_EQUAL distribution and labels A/B/C when omitted. The
   preview returns `{ preview: true, confirm_required: true, campaign, replacing: {
   current_step_count, current_steps_with_content }, with: { step_count, sequences }, merge_tags_used[],
   warnings[] }` and changes nothing. Show `with.sequences` (the exact normalized provider payload),
   `replacing`, and every warning - this is a FULL REPLACE of the provider's steps, and on an ACTIVE
   campaign it replaces the live sending copy on save; every tag in `merge_tags_used` needs a value
   on every lead or a fallback. On an explicit yes to THAT preview, re-call with `confirm: true`.
   On confirm the tool saves, re-reads the provider, and refreshes the local mirror; if the response
   says saved-but-unverified, the read-back failed - do it yourself next, never report from the
   save alone. A 400 means the list was empty or content-less. Then read back regardless:
   `outbound_campaign_sequences_get({ campaign_id })` - the steps the PROVIDER actually holds
   (`source: "provider"`, `step_count`, `steps_with_content`, `steps[]` with `provider_step_id`,
   `seq_number`, `seq_type`, `delay_in_days`, `subject`, `body_html`, `variants[]`, and
   `mirrored_at`). This read refreshes the mirror, so `outbound_get_campaign`'s `sequences` is
   truthful after it. Report `steps_with_content`; 0 means the campaign has no copy upstream,
   whatever the mirror says, and the launch gate will refuse to start it.
5. **Confirm gate #3 - the list.** The list itself comes from `/hiveku:prospect` (already
   preflighted, suppressed, and approved there - if it wasn't, go do that first). Load it chunked:
   `outbound_leads_bulk_create({ campaign_id, leads })` in batches of ≤100 (the batch cap; 400
   above it), checkpointing after each batch. Returns COUNTS ONLY - `{ uploaded, not_uploaded }` -
   so report not_uploaded without naming leads (the next sync reconciles); `pending_sync` rows with
   `pending-*` external_ids are a HEALTHY fresh-load state, not a failure.
6. Hand to `/hiveku:outbound-launch` for the go/no-go gate (health blockers, suppression re-sweep,
   the upstream-steps read, copy check, named approval of list and copy, then the confirmed START).
   This command starts nothing: the campaign is not live until the launch gate's operator-approved
   `outbound_campaign_status_set({ campaign_id, status: "START", confirm: true })` - never describe
   it as live from here, and never call that tool from this command.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
