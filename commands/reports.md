---
description: Every Agent Feedback report (problems and feature requests) across EVERY connected account, read-only - what was reported, where each one stands, and which answers are waiting to be passed on.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" reports:*)"]
---

Run the reports sweep and read it back to the user:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" reports --json
```

The CLI reads each connected account's reports with THAT account's own key (one
hiveku_feedback_status call each), no writes, keys never mixed. Then:

1. Lead with the answers waiting to be passed on (`needs_attention: true`): the account, the
   ref, its title and status. Say where to pass each one on: "open the folder for <account>
   and ask about <ref>". The session there tells the user once, walks through any steps and
   acknowledges it.
2. Then what is still open, per account: ref, problem or feature request, status, title.
3. An account whose read failed shows `reports: null`: report it as UNKNOWN with its error
   (a 401 means the key was revoked: /hiveku:connect), never as "no reports".

Do not acknowledge, follow up or file anything from here. This view is read-only by
construction; a follow-up belongs in the account's own folder, where the binding pins the
tenant.
