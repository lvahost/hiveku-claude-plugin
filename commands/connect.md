---
description: Connect your Hiveku accounts to this machine through the browser.
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" connect:*)", "Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" accounts:*)"]
---

Connect Hiveku accounts so this machine can operate them.

Run, with the Bash tool's `timeout` set to 600000 (the command waits on a human completing
sign-in and consent in a browser - the default 2-minute tool timeout would kill the local
callback listener mid-consent and the browser would land on a dead port):

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" connect
```

This opens the Hiveku consent page in a browser, where the user picks which accounts to grant
access to and whether each should be read-only. Nothing is pasted; the keys come back over a
one-time local callback and are stored encrypted in the plugin's private data directory.

It waits up to ten minutes. If the tool prints a URL because it could not open a browser (SSH,
headless), show that URL to the user and keep waiting - they can open it from any browser on the
same machine.

When it finishes, tell the user which accounts connected and what access each has. Never print a
full key. Then provision — same ending on EVERY path, sandbox or not: offer to run
`/hiveku:setup` (one ready, bound folder per account under `~/Hiveku-Accounts`) as the default.
`/hiveku:bind` is the alternative for a folder they already use. Never tell the user to `cd`.

Two facts worth stating when they fit, one line each:

- Connect grants access to accounts that already EXIST. A brand-new client is created at
  app.hiveku.com first, then connected here. "Set up our new client" usually means both steps.
- A wrong access level is fixed by connecting again: re-run the consent and approve that account
  with the level you meant — the new key replaces the old one automatically. Nobody needs to
  revoke anything by hand.

## If the sandbox blocks the callback port (Claude Desktop)

`connect` handles this itself: when it cannot open the local callback port it prints the SAME
consent page URL plus instructions, instead of failing. Your job is to relay, wait, finish:

1. Give the user the printed link and say: "Open this, tick the accounts you want to connect
   (choose read-only where someone only needs reporting), and approve. The page will then show
   a one-time code - paste it here."
2. When the code arrives, run `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" connect --code <code>`.
3. Confirm what connected in plain words ("Connected **Acme Dental**, full access - and 2
   more"). The code is one-time, PKCE-bound to this machine and expires in 10 minutes, so it
   passing through the chat is fine; there is nothing secret to avoid echoing. If the exchange
   says the code was invalid, the attempt is NOT lost - ask them to re-copy and paste again.
4. Then provision: run `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" setup` to create and bind a folder
   per account, or `/hiveku:bind` in a folder they already use.

Do not send a non-technical user to a terminal for any of this - the whole flow runs in the
conversation.

If the user has no browser at all, the same `accounts add <key>` path is the fallback.
