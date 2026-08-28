# Form Wiring: binding site forms, provisioning webhooks, auth, and payload shape

Load this file when wiring a website form (or a third-party vendor webhook) into a
workflow: `workflow_bind_form`, `workflow_bulk_provision_for_project`,
`workflow_provision_webhook`, `workflow_set_recipient`, `workflow_webhook_auth_set`,
`workflow_normalize_payload`, and webhook-auth troubleshooting.

## The wiring tools

- **One form:** `workflow_bind_form({ workflow_id, project_id, form_file_path, dry_run? })`.
  Reads the form file, parses the `NEXT_PUBLIC_*_WEBHOOK_URL` env var and the field
  `name` attributes, looks up the workflow's webhook URL, and sets the project secret
  (which auto-rebuilds via the `NEXT_PUBLIC_*` path). Regex-based, not AST-based - see
  `hiveku-web-agency/references/forms.md` for the exact convention it requires and the
  warnings it emits when a form deviates.
- **Every form on a project:**
  `workflow_bulk_provision_for_project({ project_id, template_slug?, overrides?, file_paths?, dry_run? })`.
  Scans for form components and, per form, instantiates the canonical template
  (`template_slug` defaults to `contact-form-canonical`), looks up the fresh webhook
  URL, and sets the project's `NEXT_PUBLIC_*_WEBHOOK_URL` secret. Returns per-form
  `{ workflow_id, webhook_url, env_var, warnings }` plus `skipped` (no env var found,
  not a form) and `errored` lists. This is ~15 MCP calls per site collapsed to 1.
  **Always `dry_run: true` first** and read `skipped` - a form that gets skipped is a
  form whose leads go nowhere.
  `overrides` apply to ALL forms in the batch, so a site that needs a different
  recipient per form needs `workflow_create_from_template` + `workflow_bind_form`
  per form instead.
- **A bare webhook in, action out:** `workflow_provision_webhook({ name, http_method?, authentication?, is_enabled? })`
  returns `{ workflow_id, webhook_url, trigger_id }` in one shot. Two traps: it
  defaults `is_enabled: true`, so the URL is LIVE immediately, and if you pass
  `authentication: 'bearer'` the one-time `bearer_token` in the response is never
  shown again - record it at once.
- **Change who gets notified:** `workflow_set_recipient({ workflow_id, recipient, mode?, node_ids? })`
  rewrites `to` on every `sendEmail` node (or just `node_ids`). `mode` defaults to
  `'expression'`; pass `'literal'` for a hardcoded address. It snapshots before
  writing, so it is reversible via `workflow_version_restore`.

## Webhook auth

- **A public lead form's trigger must be `authentication: 'none'`.** A 401 on a form
  POST is config, not code: fix with `workflow_trigger_update({ workflow_id, trigger_id, config: { authentication: 'none' } })`.
  The trigger's `config.authentication` is what actually gates a form's webhook, NOT
  the workflow-level `authRequired` flag; inspect it via `workflow_triggers_list`.
  Values: `'none'` = public (correct for a website lead-capture form - the browser
  posts with no token); `'bearer' | 'basicAuth' | 'headerAuth' | 'jwtAuth'` =
  protected (a credential is minted/required).
- **Securing a vendor webhook without handling the secret:**
  `workflow_webhook_auth_set` puts header authentication on a workflow's webhook
  WITHOUT the agent ever seeing the secret. The server generates a 128-bit value,
  stores it on the trigger, stamps it into the workflow definition for the owner's
  editor panel, and returns only `secret_last4`. You cannot read the value back:
  `workflow_get`, `workflow_version_get` and the trigger tools all redact it. Give
  the last4 to the human and have them copy the full value from the workflow editor.
  Use this instead of leaving a webhook public when you have no shared secret to
  configure. Requires an existing webhook trigger on the workflow; only mode
  `headerAuth` is supported here - bearer auth is set from the editor panel. Returns
  `{ ok, mode, header_name, secret_last4, webhook_path }`.

## Payload shape: mixed-case vendor fields

The webhook trigger ingest auto-applies case-insensitive aliasing: when a
Webflow/Squarespace/other source form posts mixed-case field names (Webflow's default
is lowercase `name` but Title-Case `Email`/`Subject`/`Message`), the engine adds
lowercase aliases recursively so `{{trigger.output.payload.email}}` works regardless
of source casing. Original keys are preserved alongside. Only lowercase aliases are
added (never uppercase), and only when the lowercase form is not already a key on the
same object.

`workflow_normalize_payload` runs the SAME algorithm on an arbitrary payload so you
can verify what `trigger.output.payload` will look like BEFORE wiring the workflow.
Returns `normalized_payload`, `added_aliases[]` (`{path, original_key, alias_key}` -
every alias added, so you know which template forms will work), and
`summary {aliases_added, depth}`. When wiring any third-party form, paste a real
sample submission through this tool first: it is the direct cure for the
unresolved-`{{...}}`-written-as-literal pitfall.
