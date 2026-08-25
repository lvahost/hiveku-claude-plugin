---
description: Bind this directory to one Hiveku account, so Hiveku tools operate on that account here.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" bind:*)", "Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" status:*)"]
---

Bind the current directory to a Hiveku account. One folder is one account: this is what keeps work
for one client from ever landing in another's.

First, list what is available:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" bind --list --json
```

If the list is empty, tell the user to run `/hiveku:connect` first and stop.

Otherwise show the accounts and ask which one this directory is for. Do not guess from the folder
name — a wrong bind sends work to the wrong client. Then:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" bind --account <account-id>
```

The binding is written to `.hiveku/account.json` and holds no credentials, only the account id.
`.hiveku/` and `hiveku-data/` are added to `.gitignore`.

Tools do not appear instantly: the Hiveku MCP server picks up the binding when it next starts.
Tell the user to reconnect `hk` from `/mcp`, or to start a new session in this directory.
