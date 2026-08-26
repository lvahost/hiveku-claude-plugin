---
description: Monthly client-grade report (role: SEO Specialist) - what an agency sends its clients.
argument-hint: "[month, default last month]"
---
Produce this account's monthly report for $ARGUMENTS (default: last full month). Follow the
**hiveku-seo-agency** skill's report structure.
1. Context: `account_context_get({ domain: "seo" })` - write in the brand's voice, for the CLIENT (plain language, numbers that matter, no tool names).
2. build the report as a Hiveku deliverable: `seo_deliverable_save({ title, slug, deliverable_type: "monthly_report", target_domain })`, then `seo_report_add_section` per section (executive summary, rankings movement, traffic, work completed, next month plan).
3. Sections every agency report needs: executive summary (3 bullets), results vs last period, work completed, insights, next month's plan.
4. Persist the summary to memory and create next month's plan as PM tasks (on approval).
5. OFFER to email it to the client: render the report as clean simple HTML, then
   `email_send_test({ to, subject, html_body, dry_run: true })` to validate (from-domain must be
   verified; suppressions respected), show the would-send preview, and send for real ONLY after the
   user explicitly approves the recipient and content. Never email anything unapproved.
