---
description: Update the Hiveku plugin to the latest version.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" update:*)"]
---

Update the Hiveku plugin on this machine.

Run:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" update
```

It refreshes the plugin catalog (`claude plugin marketplace update hiveku`) and installs the
update (`claude plugin update hiveku@hiveku`) through Claude's own command-line tool: the one
running this chat, one on PATH, or the copy built into the Claude desktop app (the app never puts
`claude` on PATH, which is why updates used to stall there). What it prints is what that tool
reported. A non-zero exit means nothing was installed.

Then tell the user, in one short line each:

- What happened, from the first line of the output: updated from one version to another, already
  on the newest version, or NOT installed and why. Never say the update worked unless the output
  starts with "Updated Hiveku".
- If it updated: ★ this chat still runs the old version. The reliable ritual on every surface:
  completely quit and reopen Claude. (Terminal Claude Code users can run `/reload-plugins`
  instead - it hot-reloads without a restart; the Desktop app does not have that command - never
  suggest it there.)
- If it did NOT install: the one next step the output names - /hiveku:doctor when the sandbox
  blocked it, otherwise updating from the plugin screen (Settings > Plugins in the desktop app,
  /plugin in terminal Claude Code).

If the session-start notice said an update was available, this command is the whole answer -
do not walk the user through git, the plugin cache, or terminal commands.

In the Claude desktop app, plugins do not update by themselves: the app switches Claude Code's
background updater off for its chats, whatever the marketplace setting says (`/hiveku:doctor`
shows this on its auto-update line). So this command is how updates arrive there. Never tell a
desktop-app user that auto-update will take care of it, and do not paste settings JSON at the
user or explain marketplace settings unless they ask.
