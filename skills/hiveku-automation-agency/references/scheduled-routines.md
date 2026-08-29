# Scheduled Claude Routines: running the plugin's plays unattended

Load this file when the recurring thing is a JUDGMENT play - a morning brief, a weekly health
pass - that no platform rail can run (the five platform cadence surfaces re-run stored logic;
none of them reads an account and exercises judgment). The recipe: an OS-scheduled headless
`claude -p` run per bound client folder, ceilinged to reads, delivering a dated brief file, and
pinging the operator only when something is flagged.

## What belongs on this rail

Read-shaped plays whose value is interpretation: `/hiveku:daily`, `/hiveku:standup`,
`/hiveku:store`, `/hiveku:outbound-health`, `/hiveku:phone-check`, `/hiveku:pipeline`. Plays that
normally end in confirm-gated writes (`/hiveku:weekly`, `/hiveku:ppc-optimize`) degrade
gracefully here: the guardrails ceiling refuses each write with a reason that tells the session to
report what it would have done, so the unattended run becomes a proposal generator and the human
applies interactively. What does NOT belong: anything whose point is the send or the write - that
is lane 1 (a workflow, a report cadence, a recurrence) or a human at a keyboard.

## The folder shape (set up once per client)

Binding and guardrails both walk UP from the session's cwd, which makes this layout work: a
`scheduled/` subfolder inherits the client's account binding from the parent while carrying its
own stricter ceiling - and interactive sessions at the folder root keep their full write surface.

```
<client>/
  .hiveku/account.json              # the binding - walk-up finds it from scheduled/
  hiveku-data/                      # pulled department data
  scheduled/
    .hiveku/guardrails.json         # {"version":1,"mode":"reads-only"}
    CLAUDE.md                       # the routine's output contract (below)
    hiveku-data -> ../hiveku-data   # symlink: ln -s ../hiveku-data hiveku-data
```

```bash
mkdir -p "<client>/scheduled/.hiveku" && cd "<client>/scheduled"
printf '{"version":1,"mode":"reads-only"}\n' > .hiveku/guardrails.json
ln -s ../hiveku-data hiveku-data 2>/dev/null || true
mkdir -p ../hiveku-data/briefs
```

Why the ceiling is not optional: the common install shape blanket-allows the Hiveku server in
settings with a short ask-list on top, so WITHOUT the guardrails file a headless session could
write - and an ask-listed tool would just stall an unanswerable prompt. With
`"mode": "reads-only"`, the plugin's own PreToolUse hook refuses every non-GET tool outright, with
a reason instructing the session to report instead of act; a malformed guardrails file fails
closed to the same refusal. Reads still flow without prompts because the hook auto-approves
server-declared-GET tools. Never remove the file to "fix" a refused write, and never schedule with
`--dangerously-skip-permissions` - move write work to an interactive session at the folder root.

`scheduled/CLAUDE.md`, the output contract the play runs under:

```markdown
# Scheduled routine - output contract
This folder runs unattended read-only routines against the bound account.
- No human is watching. Never ask a question; produce the brief with what you have.
- Reads only. When a write is refused by this folder's guardrails, record it as a
  proposed action instead - name the /hiveku:* command or tool a human would run.
- If local hiveku-data is stale or missing, say so in the brief and work from live
  read tools; do not attempt a pull.
- The LAST line of your output is exactly one of:
  ALL-CLEAR
  FLAG: <one line naming the single most urgent thing>
  FLAG only for something a human should see today.
```

## The wrapper (one script, one argument per client)

The print-mode output IS the brief - no Write tool, no extra permissions. Push-on-flag lives in
the wrapper, not the model: quiet by default, one notification only when the brief flags.

```bash
#!/bin/bash
# hiveku-routine.sh <client-folder> [play]     e.g. ~/clients/acme "/hiveku:daily"
set -uo pipefail
folder="$1"; play="${2:-/hiveku:daily}"
cd "$folder/scheduled" || exit 1
brief="hiveku-data/briefs/$(date +%F).md"
mkdir -p hiveku-data/briefs
# Optional pre-pull: resolve the installed plugin root once (echo $CLAUDE_PLUGIN_ROOT
# from any interactive session) and hardcode its bin/hiveku here:
# "/path/to/plugin/bin/hiveku" pull --stale 12 2>/dev/null || true
"$HOME/.local/bin/claude" -p "$play" > "$brief" 2>> hiveku-data/briefs/errors.log || true
if grep -q '^FLAG:' "$brief"; then
  line="$(grep -m1 '^FLAG:' "$brief" | cut -c1-120)"
  osascript -e "display notification \"$line\" with title \"Hiveku: $(basename "$folder")\"" 2>/dev/null || true
fi
```

Use the absolute path to `claude` (`which claude` in a terminal tells you; launchd and cron give
scripts a minimal PATH where the bare name is not found). On Linux, swap `osascript` for
`notify-send` or the operator's own channel. Briefs stay INSIDE the client folder - never redirect
them to `/tmp`, which is shared ground between accounts.

## Scheduling it

macOS launchd (`~/Library/LaunchAgents/com.hiveku.routine.<client>.plist`, then
`launchctl load` it) - `StartCalendarInterval` coalesces fires missed while the machine slept into
one run on wake, which is what you want for a morning brief:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.hiveku.routine.acme</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>/Users/you/bin/hiveku-routine.sh</string>
    <string>/Users/you/clients/acme</string>
    <string>/hiveku:daily</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>6</integer><key>Minute</key><integer>10</integer>
  </dict>
</dict></plist>
```

cron anywhere else (missed fires are skipped, not made up):

```
10 6 * * 1-5  /bin/bash "$HOME/bin/hiveku-routine.sh" "$HOME/clients/acme" "/hiveku:daily"
```

**Stagger the fleet.** Twenty clients at 6:00 sharp is twenty concurrent sessions on one machine;
offset each client a few minutes (6:10, 6:14, 6:18...). Each folder runs its own account key, so
server rate buckets are per client - the contention is your machine and your model quota.

## Troubleshooting an unattended run

- **Empty or missing brief.** Read `hiveku-data/briefs/errors.log`. Usual causes: bare `claude`
  not on the scheduler's PATH (use the absolute path), or the folder is not bound (the walk-up
  found no `.hiveku/account.json` at or above `scheduled/` - bind at the CLIENT root, not inside
  `scheduled/`).
- **The brief says the local data is stale.** Expected - the routine may not pull. Either add the
  wrapper's pre-pull line, or accept live-read briefs.
- **"denied by this folder's guardrails" lines in the brief.** The rail working as designed; those
  lines arrive as proposed actions. Run them interactively at the folder root if you agree.
- **No notification despite a real problem.** Check the brief's last line: the contract puts
  `FLAG:` at line start, and the wrapper greps `^FLAG:`. A model that buried the flag mid-sentence
  is a contract miss - tighten `scheduled/CLAUDE.md`, not the grep.
- **Two briefs never appeared this week.** cron skips fires while the machine is off or asleep;
  launchd catches up on wake. On a laptop, prefer launchd (macOS) or run the fleet from a machine
  that stays on.

The morning ritual this rail feeds: the operator opens the flagged folders first, reads the other
briefs with coffee, and runs the proposed `/hiveku:*` actions interactively - the scheduled
session proposes, the human disposes.
