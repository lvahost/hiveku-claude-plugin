# Hiveku for Claude Code

Operate your [Hiveku](https://app.hiveku.com) accounts from Claude Code.

An agency works across several Hiveku accounts. This plugin installs once and binds **each working
directory to exactly one account**, so every tool call in a folder goes to that client and no
other — and a directory that is not bound stays completely inert. Since 0.8.0 the advertised
tool list is deliberately small (a core set plus `hiveku_find_tools`); searching promotes what
it finds into your callable list, so ~1,650 tools cost a few thousand tokens instead of
hundreds of thousands.

## Install

Full walkthrough, including troubleshooting: **[INSTALL.md](INSTALL.md)**.

**Claude desktop app:** Settings → Plugins → **Add** → **Add from a repository** →
paste `lvahost/hiveku-claude-plugin`. When the **hiveku** plugin appears, install
it — choose the all-projects option if asked for a scope, so it follows you into
every folder.

**Terminal:**

```
/plugin marketplace add lvahost/hiveku-claude-plugin
/plugin install hiveku@hiveku
```

> **Then turn on auto-update — one click, easy to miss.** Claude Code enables auto-update for
> Anthropic's own marketplaces, but third-party ones like this start with it **off**. Leave it off
> and you keep the version you installed forever: no new skills, no fixes, and nothing tells you
> you are behind. Open `/plugin` (or Settings → Plugins), go to **Marketplaces**, select
> **hiveku**, and choose **Enable auto-update**. To update by hand instead:
> `/plugin marketplace update hiveku` then `/plugin update hiveku@hiveku`.

Then connect your accounts and create the workspace:

```
/hiveku:connect          # browser consent; pick accounts, pick read-only per account
/hiveku:setup            # creates + binds one folder per account under ~/Hiveku-Accounts
```

Open any of those folders in Claude (the Code tab's folder picker, or `cd`) and that client's
account is live — the session banner names it. Prefer your own folder layout? Skip `setup` and run
`/hiveku:bind` inside any folder instead.

## Commands

| Command | What it does |
|---|---|
| `/hiveku:connect` | Connect accounts through the browser. Nothing is pasted. |
| `/hiveku:setup` | Create + bind one folder per connected account (`~/Hiveku-Accounts`). |
| `/hiveku:bind` | Bind this directory to one connected account. |
| `/hiveku:unbind` | Remove this directory's binding. |
| `/hiveku:status` | What is bound here, and whether a second Hiveku connection is live. |
| `/hiveku:pull` | Pull department data (SEO, PPC, CRM, social, …) into `hiveku-data/` as local files — 25 departments, 100+ datasets. Local files beat live calls. |
| `/hiveku:knowledge` | Sync the account's memory, rules, and skills into local files by department; `status` reports drift without writing. Account-level entries only. |
| `/hiveku:seed` | Seed a brand-new account's department memory in one `memory_bulk_create` call. |
| `/hiveku:remember` | Persist a learning into the right department memory (read-merge-write, never a blind overwrite). |
| `/hiveku:brief` | Load the account's persona and context before strategic work. |
| `/hiveku:daily` | Morning operating brief — what changed, what needs attention, what to do today. |
| `/hiveku:research` | Deep web research for the account (competitors, gaps, prospects) via the escalating web_* ladder. |
| `/hiveku:code` | Work on the account's Hiveku website projects — pull code local, edit, verify, commit, deploy. |
| `/hiveku:talk` | Delegate generative work to a department agent (with full account hydration), then persist it. |

## Playbooks — the recurring agency motions

Beyond the core commands above, the plugin ships the plays an agency runs every week, one per
`/hiveku:<name>`. Claude runs them against the bound account, confirming every write:

- **SEO** — `seo-fix` (audit → fix → track), `seo-decay` (find decaying/cannibalizing content → refresh plan)
- **PPC** — `ppc-optimize` (search terms → negatives, pacing, disapprovals), `ppc-report` (period-over-period)
- **Content / social** — `campaign` (plan + draft + schedule), `social-plan`, `social-report`, `media` (brand-aware images + AI video)
- **Email** — `email` (build + launch through the send gates), `sequence` (nurture sequences, in the order that actually fires), `email-review`
- **Sales / outbound** — `pipeline`, `followups`, `replies`, `outbound-health`, `outbound-launch` (pre-launch go/no-go gate)
- **Helpdesk** — `tickets`, `kb-gaps`
- **Voice** — `phone-check` (phone system health: provisioning + blocking issues, toll-fraud cap on outbound, routing, DID inventory, E911 exposure — read-only, every fix is a dashboard action)
- **PM** — `standup`, `triage`
- **Accounting** — `books-close` (AP aging + draft/submitted/open sweeps + approve queue), `books-pay` (weekly pay run, one confirmed payment at a time), `books-chase` (overdue receivables), `books-payroll` (timesheet reconcile → run → dashboard hand-off), `books-month-end` (period P&L + aging + payroll, with the caveats stated)
- **Commerce** — `quotes` (stalled quotes, unsigned contracts, unpaid invoices), `store` (weekly Shopify connection, catalog drift, stockouts)
- **Cadence** — `weekly`, `report`
- **Build** — `new-site` (spin up a new site from 70+ templates + 220 prebuilt sections), `commit` (status → build gate → version on a branch), `deploy` (preflight → diff → confirmed ship to a tier → serving check), `preview`, `cms`, `domains`, `redirects`, `env`, `checkpoint`, `restore`, `redesign` (import an existing site page by page and rebuild it)
- **Automation** — `automate` (build a workflow: discover node types → wire → validate → safe dry-run → enable on approval; also the debug + stranded-replay recovery ladder)

Each is a guided workflow with the exact tool chain, not a prompt — the same plays the VS Code
extension scaffolds per role, shipped here in full so any account can run any of them.

## Agency doctrine, not just tools

The plugin ships one **agency methodology skill** per discipline — SEO, PPC, content, sales, outbound,
social, analytics, commerce, helpdesk, web, conversion tracking, accounting, PM, and automation — each a
full retainer-agency operating system (research → strategy → execution plays with exact tool chains →
weekly cadence → monthly reporting → benchmarks and pitfalls). Claude loads the relevant one automatically
when your work matches, so a request like "the rankings dropped, fix it" is answered with a real SEO
playbook, not a guess. They cost nothing until they load.

## Growing and shrinking the roster

- **Add accounts later:** run `/hiveku:connect` again — the consent page pre-selects what you
  already have; tick the new ones. Then `/hiveku:setup` again: existing folders are reported and
  left alone, only the new accounts get folders. Re-connecting also **rotates** any keys it
  replaces: the old key is revoked server-side automatically, so repeat connects never
  accumulate live orphan keys.
- **Already have a `Hiveku-Accounts` folder** (for example from the Hiveku VS Code extension,
  which uses the same folder names)? `setup` **adopts** matching unbound folders — it adds the
  binding and touches nothing else. A folder bound to a *different* account is reported as a
  conflict and never touched.
- **SaaS owner with hundreds of accounts:** connect only what you're focused on — the consent
  page starts platform admins at zero selected, and you can always come back for more. `setup`
  itself is pure filesystem work (no network), so even a full roster is instant; the console
  summarizes past 20 folders (`--json` has everything). If you script data pulls across many
  account folders, stagger them — each account's key has its own rate budget (100 req/min), but
  hundreds of simultaneous pulls is a lot of load for no benefit.

## Local data instead of live calls

One `/hiveku:pull` replaces dozens of MCP round-trips: datasets land in
`hiveku-data/<dept>/<dataset>.json` with a README per department, fetch timestamps, truncation
flags, and a `STATUS.json` whose `failed` array separates "not retrieved" from "no data". A failed
refresh never clobbers a previous good snapshot. The file shapes are byte-compatible with the
Hiveku VS Code extension's exports, so both tools can serve the same folder. Knowledge files carry
frontmatter (domain, department, version) and sync never deletes a local file — upstream deletions
are reported, not executed.

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

## Evals

`evals/` holds v1 of the behavioral eval harness: two planted-defect fixtures
(`/hiveku:ap-screen` books, `/hiveku:support-sweep` helpdesk) served by a mock
MCP server, plus checkers that verify a run surfaced exactly the seeded
defects, traced every report number to a tool result, and synthesized rather
than restated. Deterministic layer: `node --test 'evals/self-test/*.test.mjs'`
(no model, CI-safe). Model-in-the-loop: `bash evals/bin/run-eval.sh <case>` -
it works against any gateway the environment points at, so the same evals run
on non-Claude models. Honest scope: 2 of 84 commands, 0 of 9 agents - this
proves the pattern, it does not claim coverage. `claude plugin eval` is
early-access/org-gated and unavailable here, so the harness is plain
executable fixtures; see `evals/README.md` for the design and migration path.

## License

MIT — see [LICENSE](./LICENSE).
