---
description: Something about Hiveku not working on this machine? Check the plugin, the sandbox settings and the data folder, and repair what it can.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" doctor:*)"]
---

Run:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" doctor --fix
```

It reports the plugin version, whether this machine can save credentials, and whether Claude's
settings carry what Hiveku needs - and repairs the settings itself (additive, backed up).

Tell the user the result in one or two plain sentences. If it repaired something, say: "I fixed a
setting Claude needs for Hiveku - start a new chat and it will take effect." If it could not
write (this session is sandboxed and the setting was missing), say the one-time terminal command
`hiveku doctor --fix`, or that an admin can push the setting to every machine. Never paste JSON
at a non-technical user.
