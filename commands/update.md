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
- ★ That this session still runs the old version until they run `/reload-plugins` (applies
  plugins, hooks and MCP servers in place; costs one prompt-cache rebuild) — or it just applies
  in their next session automatically.

If the session-start notice said an update was available, this command is the whole answer -
do not walk the user through git, the plugin cache, or manual steps.

★ Offer once, casually: updates can be fully automatic. Auto-update is OFF by default for
git-source marketplaces like this one. Turning it on is either the /plugin UI (Marketplaces >
hiveku > Enable auto-update) or this block in `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "hiveku": {
      "source": { "source": "git", "url": "https://github.com/lvahost/hiveku-claude-plugin.git" },
      "autoUpdate": true
    }
  }
}
```
