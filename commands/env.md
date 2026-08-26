---
description: Set up this site's environment secrets for local dev (pull from Hiveku), or add/change one.
argument-hint: "[nothing to set up local dev | a KEY to add/update]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `list_projects` / `get_project` (or take it from what the user names).
Manage THIS project's environment secrets. This project's id is `<the project_id>`. Secrets live in Hiveku (AWS Secrets Manager),
NOT in the code — real app keys (AWS, database URLs, Stripe, …) are here, injected into the deployed
Lambdas + Fly preview.

**See which secrets exist (names only — keeps values OUT of your context):**
`project_secrets_list({ project_id: <the project_id>, metadata_only: true })` → { keys, count }. Do this to
learn what the app expects; do NOT fetch values you don't need.

**Get the site RUNNING locally:** the app reads `.env.local`; you don't need to read the values, just
have the file. Tell the user to run **"Hiveku: Pull Env to .env.local"** (Command Palette or the Source
Control menu) — it writes the dev-appropriate secrets to `.env.local` (gitignored, skips _PROD/_STAGING,
applies _DEV overrides). Then `npm install` + `npm run dev` and the app has its config. `.env.local` is
READ-DENIED to you on purpose — you can run the server without seeing the secret values.

**Add or change a secret ("$ARGUMENTS"):** either edit `.env.local` and have the user run **"Hiveku:
Push Env"**, or call `project_secrets_set({ project_id: <the project_id>, secrets: { KEY: value } })` (this
CONFIRMS — it updates Hiveku + auto-syncs the deployed Lambdas). Naming: a plain `KEY` applies
everywhere; `KEY_DEV` overrides for local, `KEY_PROD` / `KEY_STAGING` scope to those tiers.

NEVER paste a secret value into code, a commit, memory, or a chat reply; never commit `.env.local`.
