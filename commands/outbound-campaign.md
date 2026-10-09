---
description: Stand up a cold-email campaign - one segment of a cold list, the campaign created with its approved steps pushed to the provider and read back (a confirmed save when they need writing), chunked lead load, then the /hiveku:outbound-launch gate. Not an activation - launch is the gate command that starts sending.
argument-hint: "[segment/campaign name - e.g. 'Austin HVAC v1']"
---
Stand up an outbound campaign: $ARGUMENTS. Context: `account_context_get({ domain: "outbound" })`,
and load `hiveku-outbound-agency/references/tool-traps.md` BEFORE the first call - every write below
has a documented failure mode.
0. **The list and the business, first.** Read `platform_rules` from the context call (Hiveku's
   email rules; they outrank account memory where the two disagree). This play is for a cold list
   only - people who never asked to hear from the business, including association, chamber, club,
   directory lists, event lists without a "yes, contact me", bought, rented or scraped rows and
   data-provider contacts; a
   permission list (signed up, customers, asked to be contacted, in a conversation) belongs in
   `/hiveku:email` or `/hiveku:sales-sequence`. If you do not know how the list was built, ask.
   Outbound is for businesses that already know cold email: if this one has never run it, say so
   and point them to the platform's own setup guide instead of building; never offer Hiveku's team
   to set it up. The business pays for SmartLead itself (the platform Hiveku's Outbound page
   connects; Instantly works on its own, not through Hiveku) and buys its own inboxes on separate
   sending domains - never its main domain. Full guide: `hiveku-outbound-agency` SKILL 1a.
1. Wiring: `outbound_list_integrations` → the `integration_id` (read it here, not off old campaign
   rows). Then `outbound_list_campaigns({ search })` for a duplicate-name check - the POST creates a
   REAL upstream campaign every time it runs. `outbound_list_email_accounts` for a quick mailbox
   sanity look (status, warmup, daily headroom); the full verdict is `/hiveku:outbound-health`.
   Mailbox settings, warmup, sending schedules and connecting a provider stay dashboard-only.
2. Copy, winners-first: `outbound_list_sequence_learnings({ is_winner: "true" })` so a proven
   subject/step shape gets reused before a new one is invented; templates worth reusing are in
   `outbound_list_email_templates({ is_active: "true" })`. Draft via
   `talk_to_department({ domain: "outbound", message })`: 3-4 steps, plain text, under ~120 words,
   one CTA, every merge tag with a fallback. Every step signs off with the sender's real name and
   business, the business's postal address and a plain opt-out line (CAN-SPAM; opt-outs are
   honored within 10 business days).
3. **Confirm gate #1 - the campaign and its steps.** Show name, integration, and the exact step
   drafts. On a yes: `outbound_create_campaign({ name, integration_id, sequences })`. The steps are
   validated before anything is created (400 `sequences_invalid` creates nothing), then pushed to
   SmartLead after the create and read back into the mirror; the campaign is always created
   DRAFTED, so nothing sends. This call has NO preview: the yes on the drafts you showed is the
   approval for these steps, so never pass steps the user has not seen. Say plainly what the 201
   reports: `sequences_saved`, `steps_with_content`, `merge_tags_used[]` (every tag needs a value
   on every lead or a fallback) and `warnings[]`. `sequences_saved: false` means the campaign EXISTS
   with NO steps - write them in step 4 on the returned id, never re-create (that makes a second
   upstream campaign); a read-back warning means saved-but-unverified, and step 4's read settles
   it. Never report the campaign as "built" off the 201. Verify identity with
   `outbound_get_campaign({ campaign_id })` (name, status, integration).
4. **The steps the provider holds - read back, and confirm gate #2 when they need writing.** Read
   first: `outbound_campaign_sequences_get({ campaign_id })` (fields below); `steps_with_content`
   must equal the steps approved at gate #1. When the steps need writing - `sequences_saved: false`
   on the create, a step that came back wrong, or any later change - preview first:
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
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })` and note its `version` and when you read it, append your note to the `content` it returns, then check `memory_log_list({ memory_id, since: "<when you read it>" })` and merge any newer change into your text (a department agent or a person may have edited it since), and send the WHOLE merged document to `memory_update({ memory_id, content, reason, expected_version })`, which REPLACES it (sending only the new note destroys everything that department had accumulated; `reason` is one plain line on why, and `expected_version` is the version you merged into, so a 409 `version_conflict` means it changed again: merge into the `content` that answer carries and save with its `version`, never resend blind); use `memory_create({ type: "memory", name: "<dept>", content, reason })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id, reason })` restores one (it works for deleted entries too). Hiveku records the session's Doing in the memory log at its first change, and its Done, counting the changes, when the session goes quiet. When `memory_log_add` is listed, end with a Done line that says what you did, if you want the log to say more than that: `memory_log_add({ phase: "done", department: "<dept>", line, outcome })`, `outcome` ok, failed or stopped, which closes the session's run with your line; leave `thread` out, and a Doing line sent once the session's is recorded answers `already_open`, which is not an error. Each `line` is one plain sentence of at most 160 characters in your own words, never a customer's words, a secret or personal details. Hiveku, not this folder, is the source of truth.
