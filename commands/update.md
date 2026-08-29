---
description: Update the Hiveku plugin to the latest version.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" update:*)"]
---

Update the Hiveku plugin on this machine.

Run:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" update
```

It refreshes the marketplace (`claude plugin marketplace update hiveku`) and applies the update
(`claude plugin update hiveku@hiveku`) — the same operations as the /plugin UI's Update button.
Where the `claude` CLI is not available, it fast-forwards the marketplace clone directly and
tells the user to press Update in /plugin.

Then tell the user, in one short line each:

- What version is installed now.
- ★ That this chat still runs the old version, and it takes effect in their NEXT new chat.
  (Terminal Claude Code users can also run `/reload-plugins`; the Desktop app does not have that
  command - never suggest it there.)

If the session-start notice said an update was available, this command is the whole answer -
do not walk the user through git, the plugin cache, or manual steps.

Auto-update is configured by the plugin itself (see /hiveku:doctor) - do NOT paste settings
JSON at the user or explain marketplace settings unless they ask.
