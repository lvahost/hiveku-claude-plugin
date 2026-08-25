---
description: Remove this directory's Hiveku account binding.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" unbind:*)"]
---

Unbind the current directory.

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" unbind
```

This deletes `.hiveku/account.json` only. It does not revoke anything and does not delete any data
already pulled into this folder — say so, because `hiveku-data/` and any synced knowledge here
still contain that account's information.

To revoke the key itself and forget the account entirely, that is
`"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" accounts remove <account-id>`, which revokes server-side first
and only then deletes locally.
