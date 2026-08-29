---
description: Pre-launch go/no-go gate for an outbound campaign - health blockers, suppression sweep, upstream sequence check, list verify.
---
Outbound launch gate. This is a GO/NO-GO check, not an activation - activation itself is
dashboard/provider-side. Context: `account_context_get({ domain: "outbound" })`.

1. `outbound_health_status` (no arguments). **REFUSE to green-light the launch if `blockers[]` is
   non-empty** - state each blocker and stop. Report `readinessScore`, `healthStatus`,
   `replyCoverage`, and `inboxHealth[]` (per mailbox: status, warmupScore, dailySent, dailyLimit).
   Blocker conditions to expect: no connected inboxes, bounce rate > 10%, more than 5 unhandled
   positive replies. Warnings worth pausing over: fewer than 3 connected inboxes, no inbox
   warming, bounce > 5%, unsub > 2%, mailboxes at > 90% of daily limit.
2. Suppression sweep against the loaded list: `email_suppression_list`, `crm_get_dnc_status` per
   flagged address, and `crm_search_contacts` for existing customers. A DNC'd address or a current
   client in the list is a STOP, not a warning - remove them before anything sends.
3. Identify the campaign with `outbound_get_campaign({ campaign_id })` (name, status, integration,
   lead/thread/draft counts) - then confirm it has REAL sequence steps upstream.
   `outbound_create_campaign` creates the campaign with the NAME ONLY; `sequences` are mirrored as
   local JSON and the SmartLead campaign comes back EMPTY - the detail read's `sequences` are that
   same local mirror, so NO Hiveku-side read can prove the steps exist. Check SmartLead (dashboard
   or REST). An active campaign with no steps sends nothing and burns the list slot.
4. `outbound_list_leads({ campaign_id })` - verify the list actually loaded, and count rows with
   `status: "pending_sync"` and a `pending-*` external_id. That state is NORMAL after a fresh load
   (SmartLead's add-lead response has no lead id; the next sync reconciles). Do not report it as a
   failed load. Reconcile the load's own numbers honestly: a bulk load
   (`outbound_leads_bulk_create`, up to 100 leads/call) returns COUNTS ONLY - { uploaded,
   not_uploaded }, no per-lead outcomes - so report the not_uploaded count without naming which
   leads it covers (the next stats sync reconciles that; never guess). A single-lead load
   (`outbound_create_lead`) counts its 409 `upstream_rejected` skips: duplicates or blocklisted
   prospects, correct to skip.
5. Copy check: plain text, under ~120 words, one CTA, every merge tag has a fallback, no link
   shorteners, no ALL CAPS or "free/guarantee/act now" clusters. Confirm the sending domain is a
   secondary lookalike domain with SPF + DKIM + DMARC, not the client's primary.
6. `outbound_list_sequence_learnings({ is_winner: "true" })` - if a past winner contradicts this
   sequence, raise it before launch, not after.
7. **Explicit human approval of the LIST and the COPY, named separately.** Then hand the user the
   verdict and the activation step to take in the dashboard. Do not describe the campaign as live.

Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
