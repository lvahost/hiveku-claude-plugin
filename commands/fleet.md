---
description: Portfolio sweep across EVERY connected account - reachability, scope, and urgent inbox items per client, read-only. The Monday-morning view before opening any single client's folder.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" fleet:*)"]
---

Run the fleet sweep and read it back to the user:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" fleet --json
```

The CLI iterates every connected account with THAT account's own key - two read calls each
(get_account_info, agent_inbox_list), no writes, keys never mixed. Then:

1. Lead with what needs a human: unreachable accounts (name the error - a 401 means the key
   was revoked, run /hiveku:connect) and every account carrying urgent inbox items, quoted.
2. Then the quiet majority in one line each: label, scope, open item count. An account whose
   inbox read failed shows `open_inbox_items: null` - report it as UNKNOWN, never as zero.
3. Close with the move: "open the folder for <account> and run /hiveku:daily there" for
   whichever account looks worst. Deep dives happen inside that account's folder, where the
   binding pins the tenant - this command is the map, not the territory.

Do not attempt any per-account fix from here. This surface is read-only by construction, and
a write belongs in the bound folder where the guardrails and the account context apply.
