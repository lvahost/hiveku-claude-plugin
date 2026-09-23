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
  shown again - record it at once. That token is enforced: the sender must send it as
  `Authorization: Bearer <token>`. (Tokens minted by this tool or
  `workflow_trigger_create` before the 2026-09 fix were never accepted, and a
  provisioned "bearer" webhook could end up public. Treat those as broken: put header
  auth on them with `workflow_webhook_auth_set`, or provision a new webhook.)
  **No API call issues a bearer token for an EXISTING URL.** `workflow_trigger_update`
  refuses to switch a row that is not already bearer to `authentication: 'bearer'` (400
  `bearer_token_missing`, even when a token from an earlier bearer period is still stored:
  an old token is never re-activated), and leaving bearer (for any other mode, or through
  `workflow_webhook_auth_set`) revokes the stored token. A definition write never changes a
  live URL's auth at all: a node saying bearer gets `auth_not_applied`. For bearer on a
  webhook you already have, the owner clicks **Apply authentication** in the editor's
  webhook panel (the URL stays; the new token is shown once there), or through the API
  `workflow_trigger_delete` then `workflow_trigger_create({ authentication: 'bearer' })`,
  which returns the token once and gives a NEW URL, so every sender must be re-pointed. To
  keep the URL without the editor, use `workflow_webhook_auth_set` (header auth) instead.

**Every webhook URL is server-assigned.** The path is `<label>-<16 random characters>`,
where the label comes from the `webhookPath` / name you passed; always hand the sender the
`webhook_url` a response returned (or `workflow_triggers_list` shows), never a URL built
from a label. A browser form's URL is public in the site bundle anyway, so a form's spam
defence is the honeypot and rate limits, not the path. For a server-to-server sender (GHL,
Calendly, Zapier) add `workflow_webhook_auth_set` as well.

**Renaming a bound form's URL breaks the form until it is re-bound.** A rename
(`workflow_trigger_update({ webhook_path })`, or a changed `webhookPath` on
`workflow_node_update`) is one-way: the old URL answers 404 at once, and the site keeps
posting to it until `workflow_bind_form` re-runs and the site rebuilds with the new
`NEXT_PUBLIC_*_WEBHOOK_URL`. Renaming a bulk-provisioned `form-*` URL and then re-running
`workflow_bulk_provision_for_project` creates a duplicate workflow. So: list the senders,
get the operator's yes, rename, re-bind. Echoing a path you read (from `workflow_get`, or
from before a rename) is never a rename: the node is re-stamped with the live URL. The
same re-bind applies whenever a NEW URL appears: `workflow_clone` always gets its own, and
so does a webhook node that `workflow_version_restore` brings back after its trigger was
deleted (`webhook_trigger_warnings` names it).
- **Change who gets notified:** `workflow_set_recipient({ workflow_id, recipient, mode?, node_ids? })`
  rewrites `to` on every `sendEmail` node (or just `node_ids`). `mode` defaults to
  `'expression'`; pass `'literal'` for a hardcoded address. It snapshots before
  writing, so it is reversible via `workflow_version_restore`.

## Webhook auth

- **A public lead form's trigger must be `authentication: 'none'`.** A 401 on a form
  POST is config, not code: fix with `workflow_trigger_update({ workflow_id, trigger_id, filter_config: { authentication: 'none' } })`.
  The tool takes `filter_config`, never `config`: a `config` argument is dropped before
  it reaches the server, so that call changes nothing. Re-read the row to confirm.
  The trigger row's `filter_config.authentication` is what actually gates a form's
  webhook (`require_auth_token` mirrors it and is never sent), NOT the workflow-level
  `authRequired` flag, which is ignored for BOTH values (`authRequired: false` does not
  make a webhook public; it comes back in `ignored_keys` with a warning); inspect it via
  `workflow_triggers_list` or `workflow_trigger_get`. Values: `'none'` = public (correct for a website lead-capture
  form - the browser posts with no token); `'bearer' | 'basicAuth' | 'headerAuth' |
  'jwtAuth'` = protected (a credential is required).
- **On a webhook row `filter_config` is MERGED, not replaced** (scheduled and database
  rows still replace it). Omitted keys are kept, `null` deletes a key,
  the `'[redacted]'` a read returns keeps the stored secret, and switching
  `authentication` clears the old mode's secrets. `filter_config: null` makes the webhook
  public (with a warning). A config that could only produce a dead webhook is refused with
  400 `invalid_authentication`, `auth_secret_missing` or `bearer_token_missing`. The
  canonical keys are `authentication`, `headerAuthName`, `headerAuthValue`,
  `basicAuthUsername`, `basicAuthPassword`, `jwtSecret`, plus the `hiveku_project_id` /
  `hiveku_form_key` / `hiveku_form_label` form stamps. The method is not in it: it lives in
  `allowed_method` (uppercased; only POST runs the workflow, another verb answers 405),
  and the path lives in `webhook_path`. Anything else (`response_mode`, `authRequired`,
  `webhookPath`, UI keys) is dropped and echoed back as `ignored_keys` / `unknown_keys` /
  `warnings`. Secrets are redacted on every read. A stored secret that is itself the
  literal `'[redacted]'` counts as unset: the receiver answers 403, and a `filter_config`
  that would keep it is refused with `auth_secret_missing`, so put a real one on with
  `workflow_webhook_auth_set`. A
  `filter_config` change re-stamps the webhook node's auth (the response adds `node_id` /
  `node_updated`), and a rename plus other fields in one call land together or not at all.
  This tool is ask-gated at the permission layer: it can move a live URL or make a
  protected one public, so name the URL and what changes before you send it.
- **The row wins over the node.** A definition write (`workflow_update`, an editor save,
  `workflow_node_add`, `workflow_node_update`) NEVER changes a live webhook's
  authentication, header name, username or secrets: a node saying `'none'` cannot make a
  protected webhook public, and a node saying bearer or carrying another secret cannot
  change or rotate it. The node is left as sent and the write warns `auth_not_applied`,
  naming the mode the URL still enforces (secrets by last 4 only) and the call that does
  the change. So an old copy of a node (an editor tab left open, an earlier `workflow_get`)
  never reverts a rotation or a make-public. The explicit paths are
  `workflow_trigger_update` (`filter_config`), `workflow_webhook_auth_set` (a new header
  secret), and the owner's **Apply authentication** in the editor's webhook panel; for
  bearer, Apply authentication, or `workflow_trigger_delete` + `workflow_trigger_create`
  (a NEW URL, token returned once). The node's auth is a mirror of the row that only those
  explicit writes stamp. Only a trigger the write creates takes the node's auth. The method
  follows a definition write only when that write changed it.
- **Securing a vendor webhook without handling the secret:**
  `workflow_webhook_auth_set` puts header authentication on a workflow's webhook
  WITHOUT the agent ever seeing the secret. The server generates a 128-bit value,
  stores it on the trigger, stamps the trigger's auth into that trigger's webhook node
  (a new version) for the owner's editor panel, and returns only `secret_last4`, the
  last 4 characters. You cannot read the value back: `workflow_get`,
  `workflow_version_get` and the trigger tools all redact it. Give the last4 to the human
  and have them reveal and copy the full value in the workflow editor. Use this instead
  of leaving a webhook public when you have no shared secret to configure. Requires an
  existing webhook trigger on the workflow; only mode `headerAuth` is supported here
  (bearer on an existing URL is the owner's Apply authentication in the editor, or a new
  URL as above). On a bearer URL it replaces bearer and revokes the old token, so every
  sender still sending that token starts getting refused: name them first.
  **Which URL it protects:** `trigger_id`, else `node_id`, else the ONE trigger linked to
  a webhook node (a disabled one is protected anyway, with a warning), else, when the
  definition has no webhook node, the one enabled webhook trigger. It never guesses: with
  several webhook triggers, or none linked to a node, it answers 409
  `ambiguous_webhook_trigger` with `candidates: [{ node_id, trigger_id, webhook_url,
  is_enabled }]` and changes nothing; call again with the `trigger_id` of the URL the
  senders actually use. 404 `trigger_not_found` / `node_not_found` /
  `no_trigger_for_node` and 400 `node_trigger_mismatch` also change nothing. Returns
  `{ ok, mode, header_name, secret_last4, trigger_id, webhook_path, webhook_url,
  is_enabled, node_id, node_updated, warnings?, message }`; the message names the
  protected URL, and a warning says so when no node shows the trigger (the owner cannot
  reveal the secret until one does).

## Payload shape: mixed-case vendor fields

A Webflow site that is CONNECTED to Hiveku never posts to a `webhookTrigger`: its
forms arrive through Hiveku's Webflow receiver and the Forms ledger and fire
`formSubmittedTrigger` / `webflowFormSubmissionTrigger` (filters `site_id`,
`form_name`), already normalised; a `webhookTrigger` wired for such a site never
fires. The `webhookTrigger` + `workflow_normalize_payload` path below is only for
sites that are NOT connected to Hiveku.

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
sample submission through this tool first: it is the direct cure for the blank-merge
pitfall, where a `{{...}}` naming a field the vendor never sends resolves to nothing and
the contact is created without it. The dry run's `template_values` then confirms each
token `resolved`.
