---
description: Connect your Hiveku accounts to this machine through the browser.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" connect:*)", "Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" accounts:*)"]
---

Connect Hiveku accounts so this machine can operate them.

Run, with the Bash tool's `timeout` set to 600000 (the command waits on a human completing
sign-in and consent in a browser - the default 2-minute tool timeout would kill the local
callback listener mid-consent and the browser would land on a dead port):

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" connect
```

This opens the Hiveku consent page in a browser, where the user picks which accounts to grant
access to and whether each should be read-only. Nothing is pasted; the keys come back over a
one-time local callback and are stored encrypted in the plugin's private data directory.

It waits up to ten minutes. If the tool prints a URL because it could not open a browser (SSH,
headless), show that URL to the user and keep waiting - they can open it from any browser on the
same machine.

When it finishes, tell the user which accounts connected and what access each has. Never print a
full key. Then tell them the next step: `cd` into the folder they use for an account and run
`/hiveku:bind`.

## If connect fails because the sandbox blocks the callback port

The error names itself ("sandboxed and is not allowed to open a local callback port"). Do NOT
tell a non-technical user to open a terminal as your first answer — that is where they stop.
Walk them through the in-chat path instead, which needs no terminal and works in the sandbox:

1. Say: "Open **app.hiveku.com**, go to **Settings > LLM Connectors**, click to create a key for
   the account you want to connect, and paste the key here." One account at a time. If they only
   need reporting on this account, tell them to pick **read-only** when creating it.
2. When the key arrives, run `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" accounts add <key>`. It
   validates against the live server and reports which account it belongs to and its access
   level — confirm that back to the user in plain words ("Connected **Acme Dental**, full
   access"). **Never repeat the key itself in your reply.**
3. Ask "any more accounts?" and repeat. Then continue to the normal next step below (a folder
   per account + `/hiveku:bind`).
4. Mention once, casually, that a pasted key passes through the conversation, so if they ever
   want to re-issue it the consent page (`/hiveku:connect` from a terminal session) rotates keys
   cleanly.

A user who says they are comfortable in a terminal can instead run the printed `connect` command
outside Claude — one run grants every account they tick — then come back here.

If the user has no browser at all, the same `accounts add <key>` path is the fallback.
