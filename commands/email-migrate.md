---
description: "\"Move our email off Resend\" / \"our reset emails come from Mailgun\" / \"use Hiveku for the app's email\" - moving a website's sending to the Hiveku Email Service with no gap: inventory the old provider by variable names only, pick the lane (Resend-compatible API, SMTP or the Hiveku API), add the sending domain beside the old provider's records, bring its suppression list, connect the site, test in the live preview (simulated), cut over with a production deploy, watch bounces, then remove the old provider. Never reads an old key's value, never puts a key anywhere but email_project_connect."
argument-hint: "[the website, or the step: inventory | domain | connect | test | cutover | cleanup]"
---
Move a site's email to the Hiveku Email Service ($ARGUMENTS). Follow the **hiveku-communications**
skill and load `references/email-migration.md`; run its steps in order and stop where the person
needs to decide.

Preconditions:
- The WEBSITE project id (`sites_list`).
- A connection that carries the email and project tools. A tool outside the profile fails exactly like a
  missing feature, so say "not available on this connection".
- `account_context_get({ domain: "email" })` for the brand's sending names and anything the account noted
  about its email.

1. **Inventory, reads only:**
   - `email_service_status` (`setup_checklist`, `next_step`);
   - `email_project_connection_get({ project_id })`;
   - `project_secrets_list({ project_id, metadata_only: true })` for the variable NAMES;
   - `project_files_search({ project_id, query })` for the sending code and its From addresses.

   Report what the app uses, by name. Never read, print or ask for an old key's value. Inbound mail stays
   where it is: the Email Service does not receive mail.
2. **The lane:**
   - `resend`: the Resend SDK, variables only;
   - `smtp`: Mailgun after a small client swap, or an app already on SMTP;
   - `api`: plain HTTP.

   [CONFIRM the lane]
3. **The domain:** `email_domain_list`; `email_domain_add({ domain, purpose: 'transactional' })` when it is
   missing.
   - The new records sit beside the old provider's. Merge SPF into the one existing record. Keep the old DKIM
     until cleanup.
   - Someone else runs the DNS: `email_domain_send_instructions({ id, to })` [CONFIRM, it emails them].
   - Then `email_domain_check_dns({ id })` until valid, and `email_domain_verify({ id })`.
4. **The old suppression list, before any real send:**
   `email_suppression_import({ addresses, dry_run: true })`, then for real [CONFIRM; imported bounces and
   complaints can never be removed].
5. **Connect:** `email_project_connect({ project_id, lane, domain, from, dry_run: true })`, shown to the
   person, then for real [CONFIRM; it writes the site's variables].
   - The preview, development and staging get the test key; production gets the production key.
   - A Mailgun app on SMTP also gets its client swapped for nodemailer, on a branch with the site's checks.
6. **Test in the live preview:**
   - Make the app send its real emails.
   - `email_logs_list({ api_key_id })` shows them as simulated. `email_message_get({ id })` opens one (it
     asks).
7. **Cut over:** deploy production [CONFIRM]. Then one real email to an inbox the person owns, delivered in
   `email_logs_list`.
8. **Watch the first days:** bounces (`email_logs_list({ status: 'bounced' })`), `email_usage` rates and
   `email_service_status`. Replace the old provider's event webhooks with `email_webhook_create` and check
   `email_webhook_deliveries_list`.
9. **Cleanup, after a clean week:**
   - old variables (`project_secrets_delete`) and the old client;
   - the old DKIM, SPF include and bounce records at the DNS host [CONFIRM each].

   Until then, going back is the old variables and a redeploy.

Until Hiveku turns the setup tools on, four answer 403 `agent_changes_not_enabled`:
`email_project_connect`, `email_domain_send_instructions`, `email_suppression_import` and `email_send`. Then:
- **Keys:** the person creates them under Settings > Email Service > API keys and adds them to the site's
  environment variables (the test key under the plain name, the production key as `<NAME>_PROD`).
- **DNS records:** Send instructions on the domain's page emails them.
- **Suppressions:** a few go in one at a time with `email_suppression_add`.
