---
description: "\"Text the customer back\" / \"send this to everyone on the list\" / \"cancel that scheduled text\" - operate SMS: one-off sends, thread replies, bulk sends up to 200, scheduled sends, and templates - every send behind a shown draft and an explicit yes."
argument-hint: "[send <who> | reply <thread> | bulk <audience> | scheduled | templates]"
---
SMS operations: $ARGUMENTS. Follow the **hiveku-phone-agency** skill - load
`references/sms-operations.md` first; sender resolution, the delivery-status lies, and the
diagnosis ladder live there. The bulk and scheduled tools shipped with the 2026-08-29 voice
program: a name that does not resolve means the plugin predates it - `/hiveku:update`, then retry.

**The send contract, every lane:** draft shown to the human → explicit yes on that exact text and
recipient → ONE send call → read back the message row to confirm what actually went out. And
re-check opt-out/DNC status IMMEDIATELY before dispatch, not just while drafting - a STOP can land
between the draft and the yes.

**send <who>**: resolve the contact, draft in the account's voice, then [CONFIRM]
`voice_sms_send_to_contact` - the recipient is always the number on the contact's file. A raw
number with no contact behind it is [CONFIRM] `voice_sms_send`.

**reply <thread>**: `voice_sms_threads_list` to find it, `voice_sms_thread_messages_list` to read
it - pass `mark_read` ONLY when you are surfacing the thread to a human right now; a background
read that marks messages read destroys the team's unread queue - then [CONFIRM]
`voice_sms_thread_reply`.

**bulk <audience>**: build and SHOW the audience list and the per-recipient count first, then
[CONFIRM] `voice_sms_bulk_send` - up to 200 real texts in one call. If the governor refuses
partway, the remainder lands in `failed[]`: report it verbatim and NEVER re-run blind - the
successes already received their text and would get it twice.

**scheduled**: `voice_sms_scheduled_list` for what is queued; [CONFIRM]
`voice_sms_scheduled_cancel` per row - name the message and its send time before the yes.

**templates**: `voice_sms_templates_list`, `voice_sms_template_create`,
`voice_sms_template_update`, `voice_sms_template_delete` - each carries traps the reference names;
read its template section before the first template write.

**Report** in this order: what was sent (recipient, exact text, the read-back row) → what was
refused or failed (`failed[]` verbatim) → opt-outs encountered → what remains queued or scheduled.

**What NOT to do.** No blind retry on a 502 or timeout - the message row was usually written; read
the thread (`voice_sms_thread_messages_list`, `mark_read` omitted) before ANY retry. Never remove
or work around an opt-out - `voice_sms_opt_out_add` is the only direction this surface moves, by
design. Never pass `mark_read` on a read that is not putting the thread in front of a human. Never
split a governor-refused bulk send into smaller blind re-runs.

Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
