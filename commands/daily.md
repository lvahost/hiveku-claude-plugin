---
description: Morning operating brief for the bound account - what changed, what needs attention, what to do today.
argument-hint: "[optional focus - e.g. 'seo' or 'pipeline']"
---

Produce a tight operating brief for the account this directory is bound to$ARGUMENTS. Lead with what the
operator should DO, not a data dump.

1. **Frame it.** `account_context_get({ domain })` for the persona, brand voice, and priorities - so the
   brief is in this account's terms.
2. **Sweep the staged alert queue before you scan anything yourself.** `agent_inbox_list` - the
   platform's agent-ops inbox, where the daily guardrail sweep files budget-pacing alerts (armed by
   `settings.guardrail.alert_at_pct` on a PPC connection, default 85%), alongside Shopify
   webhook-health / scope-drift / compliance alerts, voice/billing/deploy-health warnings, and
   briefing suggestions. One call, no arguments: the default status filter `new,seen` IS the open
   queue. Severity vocabulary is `info | suggestion | urgent` - nothing else exists, and if you
   filter on it, pass one value per call. `urgent` rows go right below any fresh client comments (step 3) - the platform already
   decided they can't wait; `suggestion` rows fold into the department bullet they belong to
   (a pacing suggestion goes in the PPC bullet); `info` is skimmable. Before acting on an item,
   `agent_inbox_get` it - the full item carries the markdown body and machine metadata (connection
   ids, thresholds) the list row does not. Close only what you actually fixed:
   `agent_inbox_resolve` with `resolution: 'resolved'` after the underlying problem is handled
   (`'dismissed'` only for a deliberate won't-fix - it is a tuning signal to the producer).
   Resolving never executes the item's action and never fixes the cause, and deduped producers
   re-file an alert closed unfixed. An empty queue is worth one line ("no staged alerts"), not
   silence.
3. **Sweep client feedback since the last brief - and LEAD with it.** `content_comments_recent({
   since })` - one call, every marketing content item on the account, newest first, each row
   carrying its joined `content_item` (id, title, content_type) so the brief names the draft, not
   a UUID: "the client left 3 comments on the March draft" is a lead bullet, not a footnote.
   `since` is a STRICT greater-than on `created_at` - passing the created_at of the last comment
   the previous brief processed will not return it again, so that timestamp is the resume cursor;
   an unparseable `since` is a 400, never silently ignored. `source: 'share-link'` is the
   client-feedback path (a public share-link reviewer); `'in-app'` is a team member OR an API-key
   agent - `user_name` is the only signal which. `user_email` is OMITTED from the object entirely
   when absent (not null) - read it defensively. The thread is CLIENT-VISIBLE - anyone holding a
   live share link sees every row - so a reply is client copy, never an internal note. A comment
   nobody answered since the last brief is an action item, and if new comments notify nobody
   (they don't, unless a workflow on the `content.comment_created` trigger exists), offer to wire
   one via `/hiveku:automate`.
4. **Check the signals are fresh.** Read `hiveku-data/STATUS.json` - its `fetched_at` tells you how old the
   local data is, and anything under `failed` was NOT retrieved (say so; don't read an empty file as
   "nothing there"). If it's stale or missing, tell the operator to run `/hiveku:pull --stale 12` first, or
   pull the specific department you need before briefing on it.
5. **Scan for what moved**, from the local `hiveku-data/<dept>/` files and, where a number must be current,
   the live tools:
 - CRM: new leads, deals advancing or stalling, follow-ups due today. (A rep who wants their
     OWN ranked queue - reminders, meetings, waiting replies, triage - runs `/hiveku:my-day`;
     this brief stays account-wide.)
 - SEO: ranking movements, new content gaps, anything decaying.
 - PPC: spend pace vs budget, anomalies, search terms worth a negative.
 - Helpdesk: open tickets, anything breaching.
 - Voice (accounts with a phone system): `voice_diagnose_setup` - no arguments, one cheap call. A
     non-empty `blocking_issues[]` outranks everything else in the brief; a dead phone system beats
     any ranking movement. Report the issues verbatim and point at `/hiveku:phone-check`. The whole
     `voice_*` family is read-only, so the action is always a dashboard fix or a PM task.
 - Social/content/email: what's scheduled, what needs drafting.
 - Automations: `workflow_runs_recent({ status: "failed", since: <last 24h> })` is account-wide across
     every workflow, so one call tells you whether a form notification, a CRM write, or a scheduled
     report silently stopped overnight. A failed automation is invisible everywhere else in this brief:
     the lead is captured and nobody was told. Status vocabulary is
     `pending | waiting | running | completed | failed | cancelled` plus `stopped_*`. There is no
     `queued` and no `succeeded`, and filtering on those returns an empty list that reads as healthy.
     A `stopped_paused` row means an internal EVENT trigger fired while the workflow was paused. The
     row itself is the replayable record, but only up to 200 rows per pause window - past that the
     event is not recorded for replay at all, so a busy workflow left paused DOES start losing
     events. The pause is not necessarily a
     fault: an operator pausing from the dashboard is recorded the same way as the circuit breaker.
     Report it as "paused, N events banked", not as an outage, and confirm the pause was intentional
     before escalating.
     Do NOT go looking for `stopped_circuit_breaker` rows - the status exists in the vocabulary but no
     code path writes one, so filtering on it always returns empty.
     The genuinely invisible case is the opposite one: a WEBHOOK arriving at a paused workflow writes
     no run row at all, so a form quietly banking submissions never appears in `workflow_runs_recent`.
     `workflow_stranded_list({ workflow_id })` is the only surface for that, and it takes ONE workflow
     id, so run it against a workflow you already have reason to suspect. There is no account-wide
     stranded sweep.
6. **Write the brief:** 3–7 bullets of "here's what matters and why," each with the ONE next action. Client
   comments from step 3 lead, then any `urgent` inbox alert from step 2 and anything
   time-sensitive (a deal, a breach, a pacing miss).
7. **Offer to act.** For each action, name the tool or the `/hiveku:*` command that does it. Do not take a
   write action without confirming.

Keep it short enough to read with coffee. This is a standup, not a report.
