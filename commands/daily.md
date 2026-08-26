---
description: Morning operating brief for the bound account — what changed, what needs attention, what to do today.
argument-hint: "[optional focus — e.g. 'seo' or 'pipeline']"
---

Produce a tight operating brief for the account this directory is bound to$ARGUMENTS. Lead with what the
operator should DO, not a data dump.

1. **Frame it.** `account_context_get({ domain })` for the persona, brand voice, and priorities — so the
   brief is in this account's terms.
2. **Check the signals are fresh.** Read `hiveku-data/STATUS.json` — its `fetched_at` tells you how old the
   local data is, and anything under `failed` was NOT retrieved (say so; don't read an empty file as
   "nothing there"). If it's stale or missing, tell the operator to run `/hiveku:pull --stale 12` first, or
   pull the specific department you need before briefing on it.
3. **Scan for what moved**, from the local `hiveku-data/<dept>/` files and, where a number must be current,
   the live tools:
   - CRM: new leads, deals advancing or stalling, follow-ups due today.
   - SEO: ranking movements, new content gaps, anything decaying.
   - PPC: spend pace vs budget, anomalies, search terms worth a negative.
   - Helpdesk: open tickets, anything breaching.
   - Voice (accounts with a phone system): `voice_diagnose_setup` — no arguments, one cheap call. A
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
     A `stopped_circuit_breaker` or `stopped_paused` row means the workflow is auto-paused and its
     webhook is still storing deliveries nobody is running: escalate that to the top of the brief.
4. **Write the brief:** 3–7 bullets of "here's what matters and why," each with the ONE next action. Put
   anything time-sensitive (a deal, a breach, a pacing miss) first.
5. **Offer to act.** For each action, name the tool or the `/hiveku:*` command that does it. Do not take a
   write action without confirming.

Keep it short enough to read with coffee. This is a standup, not a report.
