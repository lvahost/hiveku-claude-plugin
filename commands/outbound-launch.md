---
description: Pre-launch go/no-go gate for an outbound campaign - health blockers, suppression sweep, upstream sequence read, list verify - ending in the named approval and the confirmed START that puts it live.
---
Outbound launch gate. This is a GO/NO-GO check that ENDS in the activation: nothing starts sending
until step 7's named approval and the confirmed status call, and the campaign IS live after that
call. Context: `account_context_get({ domain: "outbound" })`.

1. `outbound_health_status` (no arguments). **REFUSE to green-light the launch if `blockers[]` is
   non-empty** - state each blocker and stop. Report `readinessScore`, `healthStatus`,
   `replyCoverage`, and `inboxHealth[]` (per mailbox: status, warmupScore, dailySent, dailyLimit).
   Blocker conditions to expect: no connected inboxes, bounce rate > 10%, more than 5 unhandled
   positive replies. Warnings worth pausing over: fewer than 3 connected inboxes, no inbox
   warming, bounce > 5%, unsub > 2%, mailboxes at > 90% of daily limit. Mailbox settings, warmup
   and sending schedules are fixed in the dashboard, not by tool.
2. Suppression sweep against the loaded list: `email_suppression_list`, `crm_get_dnc_status` per
   flagged address, and `crm_search_contacts` for existing customers. A DNC'd address or a current
   client in the list is a STOP, not a warning - remove them before anything sends.
3. Identify the campaign with `outbound_get_campaign({ campaign_id })` (name, status, integration,
   lead/thread/draft counts) - then confirm it has REAL sequence steps upstream:
   `outbound_campaign_sequences_get({ campaign_id })`. It reads the steps the PROVIDER actually
   holds (`source: "provider"`) and returns `campaign_status`, `step_count`, `steps_with_content`,
   `steps[]` (provider_step_id, seq_number, seq_type, delay_in_days, subject, body_html,
   variants[]) and `mirrored_at`; it also refreshes the local `sequences` mirror on the campaign,
   so `outbound_get_campaign`'s `sequences` is truthful only AFTER this read - before it, that
   field is a local mirror that proves nothing upstream. **`steps_with_content` must be > 0 or
   STOP**: an active campaign with no steps sends nothing and burns the list slot, and the START
   call refuses 409 `no_sequence_steps` in that state anyway. Missing or wrong steps go back
   through `/hiveku:outbound-campaign` step 4 (the confirmed `outbound_campaign_sequences_save`,
   a full replace), then re-read here.
4. `outbound_list_leads({ campaign_id })` - verify the list actually loaded, and count rows with
   `status: "pending_sync"` and a `pending-*` external_id. That state is NORMAL after a fresh load
   (SmartLead's add-lead response has no lead id; the next sync reconciles). Do not report it as a
   failed load. Reconcile the load's own numbers honestly: a bulk load
   (`outbound_leads_bulk_create`, up to 100 leads/call) returns COUNTS ONLY - { uploaded,
   not_uploaded }, no per-lead outcomes - so report the not_uploaded count without naming which
   leads it covers (the next stats sync reconciles that; never guess). A single-lead load
   (`outbound_create_lead`) counts its 409 `upstream_rejected` skips: duplicates or blocklisted
   prospects, correct to skip.
5. Copy check on the steps read back in step 3 (the provider's copy, not the draft): plain text,
   under ~120 words, one CTA, every merge tag has a fallback, no link shorteners, no ALL CAPS or
   "free/guarantee/act now" clusters. Confirm the sending domain is a secondary lookalike domain
   with SPF + DKIM + DMARC, not the client's primary.
6. `outbound_list_sequence_learnings({ is_winner: "true" })` - if a past winner contradicts this
   sequence, raise it before launch, not after.
7. **Explicit human approval of the LIST and the COPY, named separately.** Then the activation,
   in two calls. First the preview: `outbound_campaign_status_set({ campaign_id, status: "START" })`
   WITHOUT `confirm` - it returns `{ preview: true, confirm_required: true, note, campaign: { id,
   name, current_status, total_leads }, transition: { provider_verb, local_status_after },
   upstream_steps_with_content, warnings[] }` and changes nothing. Show the transition and every
   warning (0 leads loaded; already ACTIVE). Then, on an explicit yes to THAT preview:
   `outbound_campaign_status_set({ campaign_id, status: "START", confirm: true })`. Report the
   status transition the response confirms (previous_status → status). **After that call the
   campaign IS live and sending - say so plainly.** `START` is the provider's resume/activate verb
   (there is no `ACTIVE` verb); the local mirror goes to ACTIVE and the next stats sync re-reads the
   provider's value, which wins. Refusals to report, not retry: 409 `no_sequence_steps` (preview
   and confirm alike - back to step 3); 404 campaign; 412 `unsupported_provider` (non-SmartLead) or
   `integration_missing_key`; 422 `campaign_not_synced` (no numeric provider id); 502
   `upstream_failed` / 404 `upstream_not_found` from the provider. Any blocker from step 1 still
   means NO START, whatever the answer at this step. Emergency brake after a bad start:
   `outbound_campaign_status_set({ campaign_id, status: "PAUSED" })` executes IMMEDIATELY with no
   preview; `status: "STOPPED"` is preview-then-confirm like START and is TERMINAL for the run
   (resume is a new START; mid-sequence leads do not resume), so pause unless the run is over.
   The local automations worker never calls `outbound_campaign_status_set` or
   `outbound_campaign_sequences_save` - the START is an operator action in this session.

Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
