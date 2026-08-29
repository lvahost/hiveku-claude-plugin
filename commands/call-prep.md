---
description: Pre-meeting brief - who they are, where the deal stands, what they last said, the one goal for the call. Read-only.
argument-hint: "[--today | contact / company / deal name]"
---
Call prep. Context: `account_context_get({ domain: "sales" })`. This is a READ pass - the only write
it may ever propose is logging the prep note in step 5, and that is confirmed first.
1. Find the meeting(s). With `--today` or no argument: `crm_calendar_list` scoped to today (it reads
   the account's connected Google/Microsoft calendar), then `crm_calendar_get` per event for the
   attendees and conference link. Skip events with no external attendee. Given a name instead, skip
   the calendar and resolve it directly in step 2. Calendar not connected or empty → say so and ask
   for the contact/deal name; never brief from a guess.
2. Match each external attendee to the CRM: `crm_search_contacts` by attendee email (falls back to
   name; returns the same shape as `crm_list_contacts`). An unmatched attendee gets briefed from the
   calendar event + web only and is flagged not-in-CRM - this command creates no contacts.
3. Per matched contact, pull the story (all reads - run them in parallel):
   - `crm_get_contact` → their companies, deals, activities; then `crm_get_deal({ deal_id })` on the
     live deal (the argument is `deal_id`, never `id`) for stage, value, close date.
   - `crm_contact_engagement_summary` → last inbound/outbound timestamps, opens/clicks, active
     sequences (a prospect mid-sequence should not also get a manual chase).
   - `crm_thread_for_contact({ contact_id })` → what the last emails actually said. Quote the last
     substantive exchange, not the scheduling pleasantries.
   - `crm_calls_list({ contact_id, has_transcript: true })` → latest call with transcript detail
     (this history is NOT in `crm_get_contact`). For a transcript by call id,
     `voice_call_transcript_get` returns the WHOLE thing inline as one unredacted string - extract
     only commitments and objections into the brief, never paste the raw transcript; a 404
     `no_transcript` is the normal state for an unprocessed call, not an error. Video meetings
     (Meet/Zoom notetakers) have no transcript rail here at all - only Hiveku phone calls do.
   - Open paper: `crm_estimate_list({ contact_id })` + `crm_envelope_list({ contact_id })` → anything
     sent/viewed and unanswered goes in the brief (portal tokens die at 30 days - older means
     re-send, not nudge; see /hiveku:quotes).
   - `helpdesk_ticket_list_for_contact` → open or recent tickets. A support fire the rep walks in
     not knowing about loses the call in the first minute.
   - `crm_get_company` on their company, plus ONE `web_search` for fresh news (funding, launch,
     leadership change). Cap it at one search per company; skip when the company is unknown.
4. Emit one tight brief per meeting - under a screen, the rep reads it walking in: WHO (name, title,
   company, warmth), WHERE THE DEAL STANDS (stage, value, close date, open estimate/envelope), WHAT
   THEY LAST SAID (thread + transcript highlights: commitments made, objections raised, names
   dropped), WHAT CHANGED (news, tickets), and the ONE GOAL for this call.
5. Offer - and write only on explicit confirmation - the prep note as `crm_create_activity` (type
   note, linked to contact and deal) so the touch history shows the meeting was prepped. After the
   meeting, capture it: /hiveku:call-capture. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
