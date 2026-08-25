# Hiveku for Claude Code

Operate your [Hiveku](https://app.hiveku.com) accounts from Claude Code.

An agency works across several Hiveku accounts. This plugin installs once and binds **each working
directory to exactly one account**, so the tools you see in a folder are always the tools for that
client — and a directory that is not bound stays completely inert.

## Install

```
/plugin marketplace add lvahost/hiveku-claude-plugin
/plugin install hiveku@hiveku
```

Then connect your accounts and bind a folder:

```
/hiveku:connect          # browser consent; pick accounts, pick read-only per account
cd ~/clients/acme-corp
/hiveku:bind             # bind this folder to one account
```

Reconnect `hk` from `/mcp`, or start a new session in that folder, and the account's tools are live.

## Commands

| Command | What it does |
|---|---|
| `/hiveku:connect` | Connect accounts through the browser. Nothing is pasted. |
| `/hiveku:bind` | Bind this directory to one connected account. |
| `/hiveku:unbind` | Remove this directory's binding. |
| `/hiveku:status` | What is bound here, and whether a second Hiveku connection is live. |
| `/hiveku:brief` | Load the account's persona and context before strategic work. |

## How the credentials work

- Account keys are stored in the plugin's private data directory
  (`~/.claude/plugins/data/hiveku-hiveku/`), **encrypted with AES-256-GCM** under a master key held in
  your OS keychain. The file is `0600` and is created with `O_EXCL` so it never briefly exists in a
  readable state.
- **A project never holds a key.** `.hiveku/account.json` contains an account id and a short key
  prefix — nothing that can authenticate. It is safe if it gets committed, though the plugin adds it
  to `.gitignore` anyway.
- The MCP endpoint is a constant in the plugin. A binding file cannot name a host, so a planted
  `account.json` cannot redirect your key anywhere.
- The plugin refuses to store keys under iCloud, Dropbox, OneDrive or Google Drive.
- Disconnecting revokes server-side **first** and requires confirmation before deleting locally, so a
  failed revoke never strands a live key you can no longer reach.

## One directory, one account

A Hiveku key is pinned server-side to a single account: presenting it for a different account is
refused by the server, not merely discouraged. That is why this plugin has no account switcher. The
binding is resolved once when the MCP server starts and is pinned for that session — moving to
another client's folder mid-session tells you to start a new session rather than silently switching
tenants underneath you.

## Using this alongside the VS Code extension

The Hiveku VS Code extension registers its own MCP server named `hiveku` for folders it scaffolds.
The plugin's server is named `hk`, so they do not overwrite each other — which also means **both can
be live in the same session**, potentially serving different accounts:

- `mcp__hiveku__*` — the VS Code extension's connection
- `mcp__plugin_hiveku_hk__*` — this plugin's connection

When that happens the session-start banner names which account each one serves, and warns explicitly
if they differ. Confirm with `get_account_info` before writing.

## Requirements

Node 20 or newer. The plugin has **no dependencies** — nothing is installed when you add it.

## License

MIT — see [LICENSE](./LICENSE).
