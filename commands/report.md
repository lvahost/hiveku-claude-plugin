---
description: "\"The client's monthly report is due\" / \"what did we actually get this month?\" - the monthly client-grade SEO deliverable plus the branded report page the client actually opens: regenerates fresh numbers first, then share link or PDF, confirm-gated send."
argument-hint: "[month, default last month]"
---
Produce this account's monthly report for $ARGUMENTS (default: last full month). Follow the
**hiveku-seo-agency** skill's report structure; before touching any `marketing_report_*` tool, load
the **hiveku-analytics-agency** skill's references/monthly-report.md.
1. Context: `account_context_get({ domain: "seo" })` - write in the brand's voice, for the CLIENT (plain language, numbers that matter, no tool names).
2. build the report as a Hiveku deliverable: `seo_deliverable_save({ title, slug, deliverable_type: "monthly_report", target_domain })`, then `seo_report_add_section` per section (executive summary, rankings movement, traffic, work completed, next month plan).
3. Sections every agency report needs: executive summary (3 bullets), results vs last period, work completed, insights, next month's plan.
4. Persist the summary to memory and create next month's plan as PM tasks (on approval).
5. **Deliver through the client-report rail** - the platform's scheduled, branded, public-share
   report page is the artifact the client opens; use it instead of hand-assembling an email:
   a. `seo_automated_reports` FIRST - if a client report already exists and delivers on cadence,
      reuse that row; a second one double-emails the client.
   b. If none: `marketing_report_create({ report_name, report_type: "marketing" })`
      (`"marketing"` = the cross-channel report - omit `include_sections` for all sections;
      `"social"` = social-only). CONFIRM cadence and recipients with the user before creating:
      `schedule` is weekly | monthly | none (default weekly, and the cron really delivers on that
      cadence - a scheduled report is a standing commitment; this monthly play wants `monthly`,
      or `none` for on-demand only). `delivery_config.recipients` is who `marketing_report_send`
      emails. Marketing reports are PUBLIC BY DEFAULT (`is_public` defaults true); pass
      `is_public: false` at create if the client has not approved a public link.
   c. `marketing_report_regenerate({ report_id, days: 30 })` - ALWAYS before share or send. The
      public page and the emailed summary render the stored blob VERBATIM, so regenerate is the
      only way numbers change and skipping it shows the client stale numbers. It can take a while
      (the marketing assembly includes live Google Ads pulls) and it emails nobody.
   d. `marketing_report_share_link({ report_id })` for the URL the client opens (no login).
      `url: null` means not public - `marketing_report_update({ report_id, is_public: true })`
      mints the link. GOTCHA: `is_public: false` on a marketing report REVOKES the link outright
      (the same URL does not come back) - only revoke on an explicit ask naming the report, never
      as a sweep. If the client wants a file: `marketing_report_pdf({ report_id })` (base64 in
      `data_base64`; 409 = never generated, regenerate first; social reports return 400 - share
      their link instead).
   e. Send: call `marketing_report_send({ report_id })` WITHOUT `confirm` - it returns a preview
      (title, the exact recipient list, the public URL that will be mailed). Show that preview to
      the user and get an explicit yes, THEN re-call with `confirm: true` (strict boolean). The
      preview-then-confirm pair is a human gate, not two halves of one autonomous step. Sending
      requires an existing public link; `recipients` (max 20) replaces the stored list.
   The deliverable narrative (step 2) and the rail's rendered page are two artifacts of the same
   numbers - they must agree.
6. Only if the client needs something the rail's sections don't render, fall back to a hand-built
   email: render clean simple HTML, `email_send_test({ to, subject, html_body, dry_run: true })` to
   validate (from-domain must be verified; suppressions respected), show the would-send preview,
   and send for real ONLY after the user explicitly approves the recipient and content. Never email
   anything unapproved.
