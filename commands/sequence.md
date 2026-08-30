---
description: "Set up an automatic email series that drips out over days to the contacts you enroll (a nurture sequence) - build, activation order, enrollment, monitoring."
argument-hint: "[what the sequence should do]"
---
Build an email nurture sequence: $ARGUMENTS.

This is the MARKETING drip rail (`email_sequence_*`). A rep's 1:1 sales follow-up sequence (the
`crm_*_sequence` rail, sent from the connected inbox) is `/hiveku:sales-sequence` - the two rails
share nothing, not even template stores.

**The order below is mandatory, and getting it wrong fails silently.** `email_sequence_enroll`
refuses only on ARCHIVED sequences, not inactive ones - so enrolling into a sequence you never
activated SUCCEEDS, writes enrollment rows, and then the tick EXITS every one of them with
`exit_reason: sequence_inactive`. Activating afterwards does not bring them back, and neither does
re-enrolling: the enrollment table is unique on (sequence_id, contact_id) and the enroll insert skips
duplicates, so a second `email_sequence_enroll` for an exited contact is a NO-OP counted as
`alreadyEnrolled`. No tool deletes an enrollment row. The only recovery is a NEW sequence. Nothing
reports an error at any point.

1. **Gates first, same as any marketing send.** `marketing_setup_status` (do not build until
   `ready_to_send: true`). It checks account-level suspension itself now, with the same predicate the
   dispatcher uses. `email_service_status.sending_enabled` answers a different question: the
   TRANSACTIONAL lane rather than the marketing campaign lane, so the two can legitimately disagree
   about everything except suspension, which is the one gate they share. Only Hiveku staff lift a
   suspension. Sequence sends go through the
   same CAN-SPAM validation and the same monthly plan cap as campaigns.
2. **Create:** `email_sequence_create({ name, trigger_kind, trigger_config })`. trigger_kind is
   `manual` (you enroll via the API), `tag_added`, `form_submit`, or `workflow`. It is created
   INACTIVE.
3. **Add the steps, one call each, in running order:** `email_sequence_add_step({ id, kind, ... })`.
 - `kind`: `send_email` | `wait` | `branch_on_engagement` | `tag_action`. The route does not
     validate `kind` against that list, so a typo persists a step that will never fire - read it back
     (step 4) rather than trusting the 201.
 - `delay_seconds` is the wait BEFORE this step fires (0 = immediate).
 - `step_order` is auto-assigned to max+1 - do not pass it on add; use `email_sequence_update_step`
     to reorder.
 - `send_email` steps take `subject` plus `inline_html` / `inline_text`, or a `template_id`
     (`marketing_template_list` for the account's marketing templates - NOT `email_template_*`, that
     is the transactional store). Draft the copy the same way as any other send:
     `account_context_get({ domain: "marketing" })` first, then
     `talk_to_department({ domain: "content", message })` - there is no `email` department agent.
 - `branch_on_engagement` takes `branch_condition_json: { check: 'opened' | 'clicked', within_hours }`.
 - **Every `send_email` body needs `{{unsubscribe_link}}` and the account's physical mailing
     address**, in the HTML body and in the plain-text body separately. A step that fails this is not
     rejected when you add it: the tick DEFERS the enrollment 6 hours and retries forever, with no
     error surfaced by any tool. A sequence that "runs" and sends nothing is usually this.
4. **Read it back before activating:** `email_sequence_get({ id, include: "steps" })`. Confirm the
   step list, the order, the delays, and that every send_email step has a body and a subject. Show it
   to the user.
5. **Activate, then enroll - never the other way round.** `email_sequence_activate({ id })`, confirm
   `is_active: true`, and only then `email_sequence_enroll({ id, contact_ids })` (CRM contact ids from
   `crm_search_contacts`). Enrollment sends real mail on a schedule to real people: get explicit
   confirmation of who is being enrolled and what they will receive before you call it.
6. **Monitor:** `email_sequence_enrollments({ id, status })` - status is `active` | `paused` |
   `completed` | `exited`. A pile of `exited` rows carries the reason: `sequence_inactive` (see the
   warning above), `contact_unsubscribed`, or suppression. Removing people mid-run:
   `email_sequence_exit({ id, contact_ids, reason })`.
7. **Pausing is not a soft pause and it is effectively one-way - get explicit confirmation before you
   call it.** `email_sequence_pause({ id })` sets `is_active: false`, and from then on the tick EXITS
   each active enrollment as it comes due, with `sequence_inactive` and `next_fire_at` cleared. The
   rows stay but the people are out, and per the warning at the top of this file they cannot be put
   back into this sequence by any tool. Older builds of the tool description say "existing
   enrollments stay" - that is wrong; trust this. To hold a live sequence without losing its
   enrollments, stop enrolling new contacts instead. Say all of this to the user before pausing
   anything with people in it. `email_sequence_archive` is the harder version (is_active false +
   is_archived true) and additionally blocks all future enrollment.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
