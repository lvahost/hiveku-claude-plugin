---
description: Connect your Hiveku accounts to this machine through the browser.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" connect:*)", "Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" accounts:*)"]
---

Connect Hiveku accounts so this machine can operate them.

Run:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" connect
```

This opens the Hiveku consent page in a browser, where the user picks which accounts to grant
access to and whether each should be read-only. Nothing is pasted; the keys come back over a
one-time local callback and are stored encrypted in the plugin's private data directory.

Give it up to two minutes — it is waiting on a human in a browser. If the tool prints a URL
because it could not open a browser (SSH, headless), show that URL to the user and keep waiting.

When it finishes, tell the user which accounts connected and what access each has. Never print a
full key. Then tell them the next step: `cd` into the folder they use for an account and run
`/hiveku:bind`.

If the user has no browser at all, the fallback is to create a key at app.hiveku.com under
Settings > LLM Connectors and run `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" accounts add <key>`.
