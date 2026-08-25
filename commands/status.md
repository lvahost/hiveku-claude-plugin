---
description: Show which Hiveku account this directory is bound to, and whether anything else is connected.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" status:*)"]
---

Report this directory's Hiveku state.

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" status --json
```

Read the JSON and tell the user, in plain language:

- which account this directory is bound to, and whether the access is full or read-only
- if `bound` is false: that Hiveku tools are inactive here, and to run `/hiveku:bind`
- if `key_stored` is false: that the binding names an account with no key on this machine, and to
  run `/hiveku:connect`
- if `collision_warning` is non-null: relay it prominently. It means two Hiveku connections are
  live in the same session and a write through the wrong tool prefix would land in the wrong
  account.

If the user is about to do real work, suggest confirming identity with `get_account_info` first.
