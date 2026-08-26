---
description: Build, test and launch an email campaign end-to-end - setup gates, audience, template, dry run, test send, schedule/send.
argument-hint: "[what the campaign is about]"
---
Build and launch an email campaign: $ARGUMENTS.

Sends are GATED. Skipping a step doesn't fail loudly at that step - it means the campaign silently
cannot send later. After every write, read it back (get/list) before proceeding. Report failures
verbatim; never claim something sent without checking.

1. **Setup gates first:** `marketing_setup_status`. It lists every condition that BLOCKS a send with
   the fix for each. Do not build until `ready_to_send: true`. The two that bite:
   - a VERIFIED sending domain (`email_domain_add` -> `email_domain_verify`); the campaign's
     from_email must be on it.
   - the CAN-SPAM mailing address (`marketing_mailing_address_set`) - footer validation FAILS without
     a physical address, so NOTHING can send.
2. **Audience:** `email_audience_list` - pick or create (`email_audience_create` +
   `email_audience_members_add`). Members are CRM CONTACTS: get ids via `crm_search_contacts` /
   `crm_contact_upsert_by_email`. Then `email_audience_preview` - report the DELIVERABLE count (not
   the raw count) and why any are skipped. Zero deliverable = the send will be refused.
3. **Content:** `account_context_get({ domain: "marketing" })` FIRST, then draft via
   `talk_to_department({ domain: "content", message })` - subject (<50 chars) + preview text + HTML +
   plain text. Save it with `marketing_template_create` (layout_json block tree, or raw HTML).
   NOT `email_template_create` - that's the transactional store; a campaign cannot use it.
4. **Draft:** `email_campaign_create({ name, subject, from_email, audience_id, ... })`, then read back
   with `email_campaign_get`.
5. **DRY RUN - never skip:** `email_campaign_send_now({ id, dry_run: true })`. It materializes the
   recipient list and reports totalQueued / skippedBreakdown WITHOUT sending. Show the user the number
   that would actually receive it.
6. **TEST SEND - never skip:** `email_campaign_test_send({ id, to: [the user's email] })`. Real mail.
   Ask the user to confirm the render before ANY real send.
7. **Launch only on explicit approval:** `email_campaign_schedule({ id, scheduled_for })` or
   `email_campaign_send_now({ id })`. Confirm which. Dispatch runs on a ~60s cron tick, so it is not
   instant - do not report "sent" until `email_campaign_get` shows status sent and total_sent > 0.
   A "sent" campaign with total_sent: 0 reached NOBODY.
8. **After:** `email_campaign_metrics({ id })` next day - delivered/opens/clicks/bounces. Under-
   delivered? Check `marketing_frequency_cap_get` (over-cap recipients are silently skipped).
   `email_campaign_resend_non_openers` builds a fresh non-opener audience and clones the campaign.
9. Finish every session of work the same way: persist notable learnings to department memory (`memory_list` → `memory_create({ type: "memory", name: "<dept>", content })` or `memory_update`), and reflect the work in Hiveku PM — `pm_tasks_create`/`pm_tasks_update`/`pm_tasks_complete`. Hiveku, not this folder, is the source of truth.
