---
description: Post-meeting capture - raw notes or a transcript into ONE confirmed set of CRM writes. Nothing writes without approval.
argument-hint: "[contact or deal name - then paste your notes or the transcript]"
---
Call capture. Context: `account_context_get({ domain: "sales" })`. An unlogged touch did not happen -
this command exists so the write-up stops being six manual tool decisions reps skip half of.
1. Get the raw material. Pasted notes or a notetaker transcript is the rail for video meetings -
   there is no Meet/Zoom ingest tool, so ask for the paste if none came with the command. For a
   Hiveku phone call, pull the record instead: `crm_calls_list({ contact_id })` newest-first, and
   `voice_call_transcript_get` by call id for the full text (404 `no_transcript` means
   post-processing hasn't finished yet - say so and work from notes, don't retry-loop).
2. Resolve the anchor: `crm_search_contacts` by name/email, then the live deal off `crm_get_contact`'s
   deals and `crm_get_deal({ deal_id })` (the argument is `deal_id`, never `id`). Two plausible deals
   → ask which one; never guess where a stage move lands.
3. Extract from the raw text, quoting the source line for each claim: outcome, decisions made,
   stakeholders named (new ones especially), objections and how they were answered, evidence for a
   stage exit, committed next steps WITH dates, and any pushed close date or changed value. Say what
   you could NOT find - "no next step was agreed" is the true outcome of many calls and belongs in
   the log verbatim.
4. Show ONE proposed write set - every write in a single list, before any is made:
   - Meeting log: `crm_create_activity` (type meeting, linked to contact + deal, the structured
     summary as the body). First check `crm_list_activities` for the contact/deal around the call
     time - a Hiveku PBX call may already have an auto-logged call activity (the operator wrap-up
     flow merges into that row); if one exists, propose `crm_update_activity` on it instead of a
     duplicate.
   - Deal correction: `crm_update_deal({ deal_id, stage_id, close_date, value, status })`. `stage_id`
     is a stage UUID from `crm_list_pipelines`, never a stage name. Move a stage ONLY on the exit
     evidence quoted in step 3 - no evidence, no move, whatever the mood of the call was. A close
     date the prospect pushed is a correction to make, not to skip: an uncorrected close date is a
     forecast lie that survives every future /hiveku:pipeline run.
   - Follow-ups: one PM task per committed next step with its promised date, plus
     `crm_reminder_schedule({ fire_at, prompt })` for the date-critical one - `fire_at` is the ISO
     fire time, `prompt` runs as a user message then, so write it self-contained ("Check whether
     <name> returned the security questionnaire for deal <deal>"). `crm_reminder_list` first so you
     don't stack a duplicate.
   - Objections: `outbound_log_objection({ objection_type, objection_text, response_text?,
     response_outcome })` (types: price | timing | authority | competitor | no-need | trust).
     Duplicate text within a type increments its seen-count, so log repeats too - the count IS the
     signal.
   - Lost? Close it CODED: `crm_update_deal({ deal_id, status, lost_reason_code, lost_reason })` -
     the code vocabulary is no_decision | price | competitor | timing | no_budget | bad_fit |
     ghosted | other (unknown codes 400 listing it), `lost_reason` is the free-text why (max 500
     chars), and the activity body still carries the narrative. The code is what
     `crm_report_loss_reasons` and `/hiveku:win-loss` can aggregate; a close without one is
     tomorrow's uncoded bucket.
5. Apply on a single approval of the set - not six sequential prompts. Anything the user strikes,
   drop without argument. Report each write's result; a failed write is reported and re-proposed,
   never retried silently. If the follow-up needs a drafted email, draft it and show it - nothing
   sends from this command.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
