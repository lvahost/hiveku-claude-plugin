---
description: Connect your Hiveku accounts to this machine through the browser.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" connect:*)", "Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" accounts:*)"]
---

Connect Hiveku accounts so this machine can operate them.

Run, with the Bash tool's `timeout` set to 600000 (the command waits on a human completing
sign-in and consent in a browser — the default 2-minute tool timeout would kill the local
callback listener mid-consent and the browser would land on a dead port):

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" connect
```

This opens the Hiveku consent page in a browser, where the user picks which accounts to grant
access to and whether each should be read-only. Nothing is pasted; the keys come back over a
one-time local callback and are stored encrypted in the plugin's private data directory.

It waits up to ten minutes. If the tool prints a URL because it could not open a browser (SSH,
headless), show that URL to the user and keep waiting — they can open it from any browser on the
same machine.

When it finishes, tell the user which accounts connected and what access each has. Never print a
full key. Then tell them the next step: `cd` into the folder they use for an account and run
`/hiveku:bind`.

If the user has no browser at all, the fallback is to create a key at app.hiveku.com under
Settings > LLM Connectors and run `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" accounts add <key>`.
