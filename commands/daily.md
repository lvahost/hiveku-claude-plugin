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
   - Social/content/email: what's scheduled, what needs drafting.
4. **Write the brief:** 3–7 bullets of "here's what matters and why," each with the ONE next action. Put
   anything time-sensitive (a deal, a breach, a pacing miss) first.
5. **Offer to act.** For each action, name the tool or the `/hiveku:*` command that does it. Do not take a
   write action without confirming.

Keep it short enough to read with coffee. This is a standup, not a report.
