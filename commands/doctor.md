---
description: Something about Hiveku not working on this machine? Check the plugin, the sandbox settings and the data folder, and repair what it can.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" doctor:*)"]
---

Run:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" doctor --fix
```

It reports the plugin version, whether this machine can save credentials, whether Claude's
settings carry what Hiveku needs - and repairs the settings itself (additive, backed up). It also
reports whether plugin auto-update actually runs in this session (the auto-update line), and
which Claude command-line tool /hiveku:update would use to install updates (the claude CLI line).

Tell the user the result in one or two plain sentences. If it repaired something, say: "I fixed a
setting Claude needs for Hiveku - start a new chat and it will take effect." If it could not
write (this session is sandboxed and the setting was missing), say the one-time terminal command
`hiveku doctor --fix`, or that an admin can push the setting to every machine. Never paste JSON
at a non-technical user.

"claude settings complete" does not mean updates arrive by themselves. If the auto-update line
says off, tell the user that new Hiveku versions install only when they run /hiveku:update (the
desktop app switches Claude's background updater off for its chats). If it says on in terminal
Claude Code but off in desktop app chats (doctor was run from a terminal, not a chat), the same
applies to anyone who uses the desktop app. If the claude CLI line says
not found, /hiveku:update cannot install updates here: point them to Settings > Plugins in the
desktop app (or /plugin in terminal Claude Code) to update hiveku.
