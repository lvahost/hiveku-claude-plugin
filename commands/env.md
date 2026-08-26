---
description: Set up this site's environment secrets for local dev (pull from Hiveku), or add/change one.
argument-hint: "[nothing to set up local dev | a KEY to add/update]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Manage THIS project's environment secrets. This project's id is `<the project_id>`. Secrets live in Hiveku (AWS Secrets Manager),
NOT in the code - real app keys (AWS, database URLs, Stripe, …) are here, injected into the deployed
Lambdas + Fly preview.

**See which secrets exist (names only - keeps values OUT of your context):**
`project_secrets_list({ project_id: <the project_id>, metadata_only: true })` → { keys, count }. Do this to
learn what the app expects; do NOT fetch values you don't need.

**Get the site RUNNING locally:** the app reads `.env.local`; you don't need to read the values, just
have the file. Tell the user to run **"Hiveku: Pull Env to .env.local"** (Command Palette or the Source
Control menu) - it writes the dev-appropriate secrets to `.env.local` (gitignored, skips _PROD/_STAGING,
applies _DEV overrides). Then `npm install` + `npm run dev` and the app has its config. `.env.local` is
READ-DENIED to you on purpose - you can run the server without seeing the secret values.

**Add or change a secret ("$ARGUMENTS"):** either edit `.env.local` and have the user run **"Hiveku:
Push Env"**, or call `project_secrets_set({ project_id: <the project_id>, secrets: { KEY: value } })` (this
CONFIRMS - it updates Hiveku + auto-syncs the deployed Lambdas). Naming: a plain `KEY` applies
everywhere; `KEY_DEV` is stripped to the base name for the preview, `KEY_PROD` / `KEY_PRODUCTION` /
`KEY_STAGING` are SKIPPED for the preview and go only to the deployed Lambdas.

**Setting a secret RESTARTS the client's live preview.** The write pushes the new env into the Fly
machine (stop → updateMachine → start, about 11 seconds of downtime) so the dev server sees the values
on the next request. Setting five secrets in a loop bounces the preview five times. **Batch them: pass
`apply_to_preview: false` on every call but the last.** Then confirm propagation by reading
`preview_env_applied` and `preview_env_apply_reason` on the response (`no_preview_machine`,
`only_non_dev_keys_set`, or a Fly error such as `restart_failed`). Any `NEXT_PUBLIC_` key additionally
auto-triggers a `preview_sync`, because those are inlined at compile time and a restart alone leaves
the cached bundle with the old value - check `preview_synced` / `preview_sync_reason`.

**A key you cannot read back is not a missing key.** `project_secrets_list` omits SENSITIVE variables
from `secrets` entirely and names them in `sensitive_keys`. Those values are write-only: not by you,
not by the account owner, not by Hiveku staff, and not out of a build log, `.env`, or the preview
container. A key in `sensitive_keys` IS configured - treat it as set, and change it by setting a NEW
value rather than trying to read the old one.

NEVER paste a secret value into code, a commit, memory, or a chat reply; never commit `.env.local`.
