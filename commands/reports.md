---
description: Every Agent Feedback report (problems and feature requests) across EVERY connected account, read-only - what was reported, who filed it, where each one stands, when and how it closed, and which answers are waiting to be passed on.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" reports:*)"]
---

Run the reports sweep and read it back to the user:

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" reports --json
```

When the user asks about one account, one filer, or what closed since a day, narrow it:
`--account <id or part of its name>`, `--filer <person|assistant|department_agent|part of a name>`,
`--closed-since <YYYY-MM-DD>` (any of them, together). A filtered account says `filtered: true`;
with nothing left it has `reports: []`, which means nothing matched, not that it has no reports.
Each account's newest 50 tickets are read (answers waiting first), so on a busier account an
older ticket can be missing from a filtered list: say so when it matters.

The CLI reads each connected account's reports with THAT account's own key (one
hiveku_feedback_status call each), no writes, keys never mixed. Each report carries its ref,
kind, status and title, and, where the server sends them: `filed_by` (the account, `filer_type`
person, assistant or department_agent, and `filer_name`: the key's, the agent's or the client's
name), `closed_at`, `resolution_label` (Fixed, Works as intended or already possible, Not
planned, Merged into another ticket) and `answer_text` (the published answer). They are null
while a ticket is open or when the server leaves them out. Then:

1. Lead with the answers waiting to be passed on (`needs_attention: true`): the account, who
   filed it, the ref, its title, and how it closed. Say where to pass each one on: "open the
   folder for <account> and ask about <ref>". The session there tells the user once, walks
   through any steps and acknowledges it.
2. Then what is still open, per account: ref, problem or feature request, status, title, who
   filed it.
3. When the user asks what closed: the closed date, how it closed, and the answer in a
   sentence.
4. An account whose read failed shows `reports: null`: report it as UNKNOWN with its error
   (a 401 means the key was revoked: /hiveku:connect), never as "no reports". Under a filter,
   an account whose server cannot say who filed or when a ticket closed is UNKNOWN too.

`ticket_url` opens the ticket on the Hiveku team's own board, which only Hiveku staff can
open: give it only to someone on the Hiveku team. It is null on a rebranded account.

Do not acknowledge, follow up or file anything from here. This view is read-only by
construction; a follow-up belongs in the account's own folder, where the binding pins the
tenant.
