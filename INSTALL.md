# Installing Hiveku for Claude Code

Two steps: add the Hiveku marketplace, then install the plugin from it. Takes about a minute.
Pick the section that matches how you use Claude.

Everything below is the same on macOS, Windows, and Linux.

---

## If you use the Claude desktop app

1. Open **Settings** (the gear, or `Cmd+,` / `Ctrl+,`).
2. In the left sidebar under **Customize**, click **Plugins**.
3. Click **Add** at the top right, then choose **Add from a repository**.
4. Paste this and confirm:

   ```
   lvahost/hiveku-claude-plugin
   ```

5. The **hiveku** plugin now appears in the list. Click it, then click **Install**.
   If you are asked to choose a scope, pick the one that covers **all projects** (user scope)
   so Hiveku follows you into every folder.
6. **Turn on auto-update — do not skip this.** Still in **Plugins**, find the **hiveku**
   marketplace, open it, and choose **Enable auto-update**. See "Staying up to date" below for
   why this matters.

If the plugin list says something like `Run /reload-plugins to activate`, open a Claude Code
session and run `/reload-plugins`.

---

## If you use Claude Code in a terminal

Run these inside a Claude Code session:

```
/plugin marketplace add lvahost/hiveku-claude-plugin
/plugin install hiveku@hiveku
```

Then turn on auto-update:

```
/plugin
```

Go to the **Marketplaces** tab, select **hiveku**, and choose **Enable auto-update**.

If the install says `Run /reload-plugins to activate`, run `/reload-plugins`.

### Without an interactive session

```bash
claude plugin marketplace add lvahost/hiveku-claude-plugin
claude plugin install hiveku@hiveku
```

These install at user scope by default. Plugins load the next time Claude Code starts.

---

## Connect your Hiveku accounts

Once the plugin is installed, in any Claude session:

```
/hiveku:connect
```

Your browser opens the Hiveku consent page. Sign in, tick the accounts you want to work with,
and mark any of them read-only if you want a look-but-do-not-touch connection. Nothing is
pasted and no key is typed anywhere: the keys come back over a one-time local callback and are
stored encrypted on your machine.

Then create a folder for each account:

```
/hiveku:setup
```

That makes one folder per connected account under `~/Hiveku-Accounts`, each already bound.
Open one of those folders in Claude (the folder picker in the desktop app, or `cd` in a
terminal) and that client's account is live. The session banner tells you which one.

Prefer your own folder layout? Skip `setup`, open a folder you already use, and run
`/hiveku:bind` there instead.

---

## Staying up to date

**Read this part.** Claude Code enables auto-update by default for Anthropic's own
marketplaces, but **third-party marketplaces like this one start with auto-update OFF**. If you
leave it off, you keep the exact version you installed and never receive new skills, commands,
or fixes, with nothing telling you that you are behind.

So either:

- **Turn on auto-update once** (step 6 above, or the Marketplaces tab in `/plugin`). Claude Code
  then refreshes shortly after a session starts and picks up new versions on its own. This is
  what we recommend.
- **Or update by hand** whenever you want the latest:

  ```
  /plugin marketplace update hiveku
  /plugin update hiveku@hiveku
  ```

Either way, an update may ask you to run `/reload-plugins` to load the new version into the
session you already have open.

For a whole team, an admin can enable it for everyone by adding the marketplace to a project's
`.claude/settings.json` with auto-update on:

```json
{
  "extraKnownMarketplaces": {
    "hiveku": {
      "source": { "source": "github", "repo": "lvahost/hiveku-claude-plugin" },
      "autoUpdate": true
    }
  }
}
```

---

## Troubleshooting

**"I do not see the plugin after adding the repository."**
Adding a marketplace only registers the catalog; it does not install anything. Open the
**hiveku** entry and click **Install**.

**"Claude says `/plugin` is not available."**
You are on an older Claude Code, or in an environment without the interactive panel. Update
Claude Code, or use the `claude plugin ...` shell commands above.

**"The commands do not show up."**
Run `/reload-plugins`. If it warns about re-reading the conversation, run
`/reload-plugins --force`. If they still do not appear, clear the plugin cache, restart Claude
Code, and reinstall:

```bash
rm -rf ~/.claude/plugins/cache
```

**"`/hiveku:connect` opened a browser but nothing came back."**
Finish the approval in the browser; the terminal is waiting and gives you ten minutes. If the
browser never opened, the command prints a URL you can open yourself, on the same machine. On a
machine with no browser at all (an SSH session, for example), create a key at
app.hiveku.com under Settings > LLM Connectors and run:

```
hiveku accounts add <key>
```

**"Tools are missing in a folder."**
That folder is not bound to an account. Run `/hiveku:bind` there, or `/hiveku:status` to see
what Claude thinks is going on. A folder with no binding is meant to be inert, so the plugin
stays out of the way in projects that have nothing to do with Hiveku.

**"I get 401 errors from Hiveku tools."**
The key for that account was revoked or rotated. Run `/hiveku:connect` again to re-mint it.

**"I also run the Hiveku VS Code extension."**
That is fine, and both can be live at once. The session-start banner tells you which account
each connection serves so you never act on the wrong tenant.

---

## Removing it

```
/plugin uninstall hiveku@hiveku
```

To also revoke the account keys server-side (recommended if you are handing the machine on):

```
hiveku accounts remove <account-id>
```

That revokes the key with Hiveku first and only then forgets it locally, so a failed revoke
never leaves a live key you can no longer see.
