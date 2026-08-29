# Outbound tool traps - per-tool behavior, refusal tables, and write discipline

Read this before loading a list, creating a campaign, updating a lead, or pushing to the CRM.
Every trap here was learned from the routes themselves, not from the tool names.

## Loading leads (`outbound_leads_bulk_create`, `outbound_create_lead`)

Required: `campaign_id`, `email` per lead. Know the real behavior before loading a list:

- **The one-call-per-lead loop is RETIRED.** `outbound_leads_bulk_create` enrolls up to 100
  leads per call (the SmartLead batch cap; 101+ is a 400 - chunk the list yourself). A 500-lead
  list is 5 calls, not 500. Keep `outbound_create_lead` for one-off adds (a warm visitor, a
  hand-vetted prospect), not lists. Emails are deduped case-insensitively WITHIN the batch.
  `settings` supports `ignore_global_block_list`, `ignore_unsubscribe_list`,
  `ignore_duplicate_leads_in_other_campaign` - every one of those widens who receives cold
  email, so none is ever set unless the user asks for it by name and hears what it skips.
- **Bulk results are COUNTS-ONLY - carry that honestly.** SmartLead returns
  `{ uploaded, not_uploaded }` with no per-lead outcomes: WHICH leads were rejected
  (duplicates, block list) is unknowable until the next stats sync reconciles the
  `pending_sync` placeholder rows. Report the two counts and say the per-lead breakdown
  arrives at the next sync - never present per-lead status as known, never guess which N were
  rejected.
- **Local rows are written only after SmartLead accepts; an upstream failure records
  nothing** - a batch that failed upstream left no partial state and is re-sent whole, once,
  per the retry discipline below.
- **409 `upstream_rejected` = SKIP, not retry** (single-lead path). "SmartLead rejected the
  lead (possibly a duplicate or on the global block list)" - the prospect is already enrolled
  or suppressed. Retrying will never succeed. Count it and move on. On the bulk path the same
  rejects surface only inside the `not_uploaded` count, namelessly, until the sync.
- **`status: 'pending_sync'` with a `pending-<timestamp>` external_id is the NORMAL result.**
  SmartLead's add-lead response has no lead id, so Hiveku inserts a placeholder that the next
  sync reconciles. A wall of `pending_sync` rows after a bulk load is a healthy load, not a
  broken one. Do not report it as a failure.
- A `pending-*` lead cannot be patched upstream: `outbound_update_lead` carrying `custom_fields`
  on one returns 200 with `warning: "Lead is still pending SmartLead sync - only local fields
  updated."` (`custom_fields` is the only argument the tool pushes upstream, so it is the only
  one that can raise this warning.)
- Other refusals: 404 (campaign not found), 412 `integration_inactive`, 412
  `unsupported_provider` (non-SmartLead campaign), 412 `integration_missing_key`, 502
  `upstream_failed`.

### Bulk-load procedure (chunk + checkpoint + restart)

A crashed loader that re-walks the list from row 0 relies on upstream dedupe to save it - do
not run one. Instead:

1. Chunk the approved, suppression-swept list into batches of 100 or fewer and load each with
   `outbound_leads_bulk_create` (a 500-lead list is 5 calls; say the plan up front).
2. Checkpoint locally per BATCH: append the batch's emails plus the returned
   `{ uploaded, not_uploaded }` counts to `automations/state/load-<campaign_id>.json` (or any
   local file) as you go.
3. On restart, skip every batch already in the checkpoint file, then resume. Local rows exist
   only for what SmartLead accepted, so a batch that failed upstream recorded nothing and is
   re-sent whole.
4. At the end report: attempted / uploaded / not_uploaded totals, and reconcile against
   `outbound_list_leads({ campaign_id })` - remembering the not_uploaded rows have no names
   until the next stats sync fills them in.

### Retry and ambiguous-write discipline (all outbound writes)

- Retry ONE transient failure (502 `upstream_failed`, network timeout). Never retry a 404/409/412
  or a validation error without changed input - the result will not change.
- After an ambiguous write (timeout, connection drop mid-call): READ state back before any second
  attempt - `outbound_list_leads` for a lead create, `outbound_list_campaigns` for a campaign
  create, `outbound_list_reply_drafts` for a draft. A blind re-send is how doubles happen.
- `audit_query` answers "what did my last call actually do" - every MCP call writes a row with
  tool name, sanitized args, and status. Use it when you are not sure a write landed, or to
  audit what another key did (`{ tool_contains: "outbound_", since: ... }`).

## Creating campaigns (`outbound_create_campaign`)

`{ name, integration_id, sequences? }` (required: `name`, `integration_id`; `integration_id`
must be a UUID). Read what it actually does before you promise a client a built campaign:

- It creates the SmartLead campaign with the **name ONLY**. `sequences` are mirrored **LOCALLY
  ONLY** as JSON on the Hiveku row. The upstream campaign comes back EMPTY - zero email steps.
- So a 201 plus a campaign row carrying your approved 4-step sequence does NOT mean the
  sequence exists in SmartLead. If someone activates that campaign it sends nothing, or the
  loaded list burns against a campaign with no steps.
- **The email steps must be authored in the SmartLead dashboard (or via SmartLead REST) before
  activation.** Say this out loud to the user rather than reporting the campaign as built.
- **Verify before any go-live sign-off:** re-read the campaign in SmartLead and confirm the
  steps exist upstream. A Hiveku-side read cannot prove it - the local JSON is the copy you
  passed in, not what the provider holds.
- **Duplicate guard:** this POST creates a REAL upstream campaign every time. Before calling,
  check `outbound_list_campaigns` for an existing campaign with the same name or serving the
  same segment - a re-run after an ambiguous failure, or a second operator, otherwise leaves
  two live SmartLead campaigns competing for the same list.
- Refusals: 404 (integration not found, inactive, or not owned by this account), 412
  `unsupported_provider` (non-SmartLead), 412 `integration_missing_key` (re-connect in Outbound
  settings), 502 `upstream_failed` (SmartLead refused the create).

## Updating leads (`outbound_update_lead`)

Three traps from the schema and the route itself:

- **Never use `status` to represent a real lifecycle change.** `status` updates the LOCAL mirror
  only; SmartLead's lead lifecycle is driven by replies and bounces and is not safe to overwrite
  from a write tool, so the next sync may contradict you. Agent-side state belongs in
  `internal_status` / `is_interested` / `internal_notes`, which are local by design and survive
  sync (the sync skips an upstream `is_interested: false`, so your flag is not clobbered).
- **The tool CANNOT edit name, email, company, phone, linkedin, or website.** Its inputSchema
  declares only `lead_id, status, internal_status, is_interested, internal_notes,
  custom_fields`, and the MCP proxy drops any argument the schema does not declare before the
  request leaves - a `first_name` you pass is silently discarded, never applied, and the call
  still returns a normal 200. Profile-field edits are dashboard or SmartLead-REST only; never
  promise one through this tool.
- **`custom_fields` is the ONE declared argument that is pushed upstream - READ the response
  `warning` field whenever you send it.** The push is best-effort and the call still returns
  **200** on failure, with `warning: "SmartLead update failed: ..."`, "Integration cannot accept
  upstream updates - only local fields updated.", or "Lead is still pending SmartLead sync -
  only local fields updated." A 200 does not mean the provider accepted the change; surface the
  warning or the edit is lost on the next reconcile.

## CRM handoff (`outbound_push_lead_to_crm`)

- ONE call: `outbound_push_lead_to_crm({ lead_id })`. It creates or updates the contact carrying
  profile, company, custom fields, tags, and the full SmartLead email history - none of which the
  hand-assembled `crm_contact_upsert_by_email` + `crm_create_activity` path can reach.
  Idempotent: re-pushes append only new emails.
- **Branch on the returned outcome, not on the absence of an exception.** The underlying
  `pushLeadToCrm` RESOLVES `{ outcome: 'failed' }` rather than throwing; the route surfaces that
  as 422 with `data.outcome`. A try/catch around it is dead code for the common failure, and
  ignoring the body means reporting a handoff that never happened.
- Use `crm_create_activity` only for what the push does not carry - chiefly your drafted response.

## The deal-duplication trap (interested replies)

Hiveku's outbound board can create the deal for you: the board's pipeline stages (a
dashboard-configured table, NOT an MCP tool) carry per-stage CRM rules (create contact / company /
deal), and the stage sweep fires them with two idempotency layers keyed on the lead and stage. A
manual `crm_create_deal` carries neither key, so on an account with a configured Interested
stage **every positive reply produces TWO deals** and the pipeline number you later report to
the client is inflated.

Default behavior: set `is_interested` / `internal_status` and let the stage rule create the
deal. Create a deal manually ONLY after the user confirms no rule exists on the matching stage
(dashboard: Marketing -> Outbound -> board -> Configure; there is no MCP tool for pipeline stages).
Latency to expect: the Olympus PATCH does not bump `pipeline_signals_at`, so a tool-driven
interest flip is picked up by the 24h full-rescan lane rather than the immediate event lane -
the board can lag a day behind your write. Do not "fix" that by creating the deal yourself.

## Sequence learnings (`outbound_record_sequence_learning`)

Full shape: `{ external_campaign_id, sequence_number, variant_label?, subject_line?,
body_content?, stats: { sends, opens, replies, positive_replies, meetings_booked, bounces,
unsubscribes }, learning_notes?, key_elements?, is_winner?, is_loser? }` - required are
`external_campaign_id` and `sequence_number`. It upserts per (campaign, step, variant), so
re-recording a step refreshes it rather than duplicating.

Two traps: `external_campaign_id` is the **PROVIDER** campaign id - the `external_id` field
on the row from `outbound_list_campaigns`, NOT the Hiveku UUID. And pass RAW COUNTS only in
`stats`; every rate is computed server-side, so a rate you pass in is either ignored or wrong.
`outbound_list_sequence_learnings({ campaign_id })` also takes the external campaign id.

## Assets, objections, drafts - full signatures

- **`outbound_list_sales_assets` returns RETIRED assets by default** - always pass
  `is_active: 'true'` before putting a link in front of a prospect. A dead pricing sheet or an
  expired calendar link in front of a prospect is a real incident.
- `outbound_log_objection({ objection_type: price | timing | authority | competitor | no-need |
  trust, objection_text, response_text?, response_outcome: overcome | lost | pending, industry?,
  persona?, source_thread_id?, source_campaign_id? })` - required are `objection_type` and
  `objection_text`; duplicate text within the same type increments the seen-count instead of
  creating a row. For a pattern that already exists: `outbound_update_objection({ objection_id,
  response_outcome, increment_overcome: true })` so the win rates stay real. Only
  `is_approved: 'true'` responses may be reused verbatim; approval is a human act via
  `outbound_update_objection({ objection_id, is_approved: true })`.
- `outbound_add_sales_asset({ asset_type, name, url?, content?, use_cases?, persona_tags? })`
  with `asset_type` one of pricing | calendar | case_study | one_pager | demo | other. After
  referencing an asset in a draft: `outbound_update_sales_asset({ asset_id,
  times_used_increment: true })`.
- `outbound_save_reply_draft({ thread_id, body_text, subject? })` - required `thread_id` and
  `body_text` (plain text, 3-5 sentences). Saves a PENDING draft, never sends. Idempotent - one
  pending draft per thread; a re-call returns the existing one with `action: 'existing_pending'`.
  Read the queue back with `outbound_list_reply_drafts({ status })` (pending | approved |
  discarded | sent; pending is the default).

## Suppression reversal (the dangerous direction)

`email_suppression_remove` removes (un-suppresses) an email address and REFUSES on sticky
suppressions - bounces and complaints stay suppressed. `crm_remove_dnc` reverses a DNC as a
soft-remove from suppression lists; it does NOT reset lifecycle_stage or lead_status - set
those explicitly if re-engaging. The tool's own guidance: use sparingly; most "remove from
DNC" requests are mistakes.

Operating rule: reversal is for typo'd addresses and documented re-opt-ins ONLY. Require the
contact's own re-consent quoted as evidence and explicit user confirmation, one address per
confirmation. NEVER bulk-un-suppress, never as part of a list load, and never as a way to
"clean up" a suppression list before a send.

## The Hiveku CRM sequences rail (first-party follow-up)

When follow-up runs through Hiveku's own CRM sequences instead of SmartLead (`crm_` prefix:
sales/full keys only), the operating order is:

- Discover: `crm_list_sequences` (id, name, is_active, step count) -> `crm_get_sequence` (steps +
  enrollment count) or `crm_sequence_status` (cheap snapshot with enrollment counts by status and
  the 10 most-recent enrollments).
- Screen the steps with `crm_sequence_spam_check` BEFORE `crm_update_sequence_step` /
  `crm_update_sequence` saves a cadence that will tank in spam filters. Two modes: inline
  (subject + body, skip step_order) or saved-step (step_order alone loads the stored step).
  Returns score (0-100, lower=better), band (clean / review / likely_filtered), warnings.
- Enroll: `crm_enroll_sequence` - the sequence must be `is_active=true` (400 "Sequence is not
  active" otherwise - check via `crm_get_sequence` first), and 409 `duplicate=true` means already
  enrolled: that is the idempotency working, not an error to retry. Enrollment into an active
  sequence IS a send - the approval gate applies.
- On reply / stop / stage-exit: `crm_unenroll_sequence` (sets status=exited). `crm_set_dnc`
  already exits active enrollments on its own. `crm_pause_sequence_enrollment` skips future
  ticks but in-flight queue rows still dispatch on their normal tick - a pause is not an instant
  stop; `crm_resume_sequence_enrollment` restarts. `crm_list_sequence_enrollments` shows who is
  currently in vs exited/completed.
- Read results: `crm_sequence_analytics` (per-step sent / opens / clicks / unsubs / bounces,
  deduped per enrollment, plus totals and exit reasons) and `crm_sequences_compare` (side-by-side
  across non-archived sequences, sorted by reply_rate desc). The same A/B honesty rules apply:
  disclose N, call nothing under volume.

## Tools that look adjacent but are not outbound

- **`email_stats` is NOT outbound sending.** It reports Hiveku's own transactional/marketing email
  (the Resend surface). Cold-email volume lives on the campaign counters and in
  `outbound_health_status`. Never label one as the other, never sum them.
- **`email_webhook_create` is for Hiveku's own send events**, not provider replies. Provider
  replies come via `workflow_provision_webhook` + the provider's webhook settings, or polling.
