---
description: Set up this site's environment secrets for local dev (pull from Hiveku), or add/change one.
disable-model-invocation: true
argument-hint: "[nothing to set up local dev | a KEY to add/update]"
---

Work on one of the account's Hiveku website projects. Resolve the `project_id` first with `sites_list` (every buildable website_project with its dev/staging/prod URLs, canonical GitHub state and container status) or `project_get({ project_id })` for one, or take it from what the user names. Do NOT use `list_projects` / `get_project` here: those return pm_projects rows, a different id space, and a website UUID 404s against them.
Manage THIS project's environment secrets. This project's id is `<the project_id>`. Secrets live in Hiveku (AWS Secrets Manager),
NOT in the code - real app keys (AWS, database URLs, Stripe, …) are here, injected into the deployed
Lambdas + Fly preview.

**See which secrets exist (names only - keeps values OUT of your context):**
`project_secrets_list({ project_id: <the project_id>, metadata_only: true })` → { keys, count, sensitive_keys, variables }.
Do this to learn what the app expects. `metadata_only: true` is required: without it the call returns no
values (they come only from `project_secrets_reveal`, which a person approves). One variable's tiers:
`project_secrets_get`; who changed what: `project_secrets_history`.

**Get the site RUNNING locally:** the app reads `.env.local`; you don't need to read the values, just
have the file. Two ways to write it, same contract (the development values, gitignored, mode 0600,
values never shown to you, withheld names listed as comments with the reason):
- Terminal (no extension needed): `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" env pull <project_id>`.
  - **A person approves every pull.** It prints an approval link: give the link to the user AT ONCE, in
    your reply, and say that anyone in the account who can see the site's variables can approve it. The
    command then waits up to 10 minutes for the approval and writes the file the moment it lands.
  - So run it in the background (or with a 10-minute timeout), read the link from its output, pass it on,
    and wait for it to finish. Without a background run, use `--no-wait`: it prints the link and the
    exact command to finish with (`--approval-token <token>`), which waits without asking again.
  - Development is the default. Pass `--tier staging` or `--tier production` ONLY when the user asked
    for that tier by name; those go to `.env.staging.local` / `.env.production.local`.
  - It prints key NAMES only. Sensitive (write-only) variables and platform credentials (database URLs
    at staging and production, the Supabase service role key, Expo credentials) never come back; their
    names land in the file as comments, so a missing one is visible, not a mystery. When nothing could
    be revealed it writes nothing and leaves an existing file as it was.
- VS Code extension: **"Hiveku: Pull Env to .env.local"** (Command Palette or Source Control menu), the
  same approval in the browser. Then `npm install` + `npm run dev` and the app has its config.
  `.env.local` is READ-DENIED to you on purpose - you can run the server without seeing the secret values.

Never call `project_secrets_reveal` yourself to fill a file: its values would land in your context. The
pull above writes them straight to disk.

**A key, token or password the site needs, which the person must type:** never ask for it in chat, and never have
them put it in a file, Finder or a terminal command. If `secure_value_request` is among your tools (the Hiveku
desktop app), call it with a short header and the variable names: the person types the values into a secure card
and you hear only which names were saved where. Never pass a value the person gave you to `project_secrets_set`.
Otherwise tell them the variable's name and ask them to add it in the Hiveku app under the site's Settings >
Environment variables.

**A key several sites use, or one Hiveku already stores:** a key several sites use belongs in the account's global
variables (an environment group), with a note on each name saying what it is for. Choose a stored key by its name
and note: values are never returned, to you or anyone. When the copy tools are among your tools, the server copies a
stored value without it reaching you: `env_group_copy_from_site` puts this site's value into a group, then
`env_group_link` or `env_group_pick` gives it to other sites; `project_secrets_copy_from_group` copies a group's value
into this site, and `project_secrets_copy_between_environments` copies between this site's environments. A
Production value stays in Production: Hiveku refuses to copy or move it into another environment, so the person adds
it for that environment on the card above, or in the site's Settings > Environment variables.

**Add or change a secret ("$ARGUMENTS"):** call `project_secrets_set({ project_id: <the project_id>, secrets: { KEY: value }, tier })`
(this CONFIRMS - it updates Hiveku + auto-syncs the deployed Lambdas) only with `generate` or with a value you
already have that the person did not type (a URL, a setting). A key, token or password the person types goes through
the paragraph above, never through this call. If the command's arguments hold one, it has already been through this
chat: don't save it from here. Ask for it on the card, or send the person to the site's Settings > Environment
variables, and tell them it went through the chat so they can replace it if it is a live key. Mind the tier: with no `tier`, a
plain `KEY` applies to EVERY tier, production included. A value for local dev or the preview takes
`tier: 'development'` (stored as `KEY_DEV`); `'staging'` and `'production'` scope the others. Setting
several keys? Put them all in ONE call's `secrets` map instead of one call per key. A value you already have
(never one the person types) can also go in `.env.local` for the person to push with **"Hiveku: Push Env"** in
VS Code, which saves it for development only.

**Setting a secret RESTARTS the client's live preview.** The write pushes the new env into the Fly
machine (stop → updateMachine → start, about 11 seconds of downtime) so the dev server sees the values
on the next request. Setting five secrets in a loop bounces the preview five times. **Batch them: one
call with every key, or `apply_to_preview: false` on every call but the last.** Then confirm
propagation by reading `preview_env_applied` and `preview_env_apply_reason` on the response
(`no_preview_machine`, `only_non_dev_keys_set`, or a Fly error such as `restart_failed`). Any
`NEXT_PUBLIC_` key additionally auto-triggers a `preview_sync`, because those are inlined at compile
time and a restart alone leaves the cached bundle with the old value - check `preview_synced` /
`preview_sync_reason`.

**A key you cannot read back is not a missing key.** SENSITIVE variables are listed by name in
`sensitive_keys` and never revealed. Those values are write-only: not by you, not by the account owner,
not by Hiveku staff, and not out of a build log, `.env`, or the preview container. A key in
`sensitive_keys` IS configured - treat it as set, and change it by setting a NEW value rather than
trying to read the old one.

NEVER paste a secret value into code, a commit, memory, or a chat reply; never commit `.env.local`.
