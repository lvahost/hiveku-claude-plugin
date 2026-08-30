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

## Which tools to approve once, and which to keep approving

Hiveku exposes about 1,650 tools. Roughly 590 of them only read, and the rest can change
something. Approving each read individually gets old fast, and approving everything means the
one call that publishes a campaign goes through as quietly as a list query.

The shape that works: **allow the server, then force a prompt on the short list that spends,
publishes, sends, or overwrites.** Claude Code evaluates rules in the order deny, then ask,
then allow, so an `ask` rule wins over the blanket `allow` underneath it.

Put this in `.claude/settings.json` (per project) or `~/.claude/settings.json` (everywhere):

```json
{
  "permissions": {
    "allow": ["mcp__plugin_hiveku_hk__*"],
    "ask": [
      "mcp__plugin_hiveku_hk__deploy_site",
      "mcp__plugin_hiveku_hk__deploy_run",
      "mcp__plugin_hiveku_hk__project_files_bulk_save",
      "mcp__plugin_hiveku_hk__project_vcs_commit",
      "mcp__plugin_hiveku_hk__project_vcs_merge",
      "mcp__plugin_hiveku_hk__site_delete",
      "mcp__plugin_hiveku_hk__content_publish_to_site",
      "mcp__plugin_hiveku_hk__content_schedule",
      "mcp__plugin_hiveku_hk__email_campaign_send_now",
      "mcp__plugin_hiveku_hk__email_campaign_schedule",
      "mcp__plugin_hiveku_hk__email_campaign_resend_non_openers",
      "mcp__plugin_hiveku_hk__crm_envelope_send",
      "mcp__plugin_hiveku_hk__crm_estimate_send",
      "mcp__plugin_hiveku_hk__helpdesk_ticket_send_reply",
      "mcp__plugin_hiveku_hk__marketing_report_send",
      "mcp__plugin_hiveku_hk__ppc_budget_update",
      "mcp__plugin_hiveku_hk__ppc_platform_budget_update",
      "mcp__plugin_hiveku_hk__ppc_bid_modifier_update",
      "mcp__plugin_hiveku_hk__ppc_keyword_bid_update",
      "mcp__plugin_hiveku_hk__ppc_platform_keyword_bid_update",
      "mcp__plugin_hiveku_hk__ppc_bidding_strategy_update",
      "mcp__plugin_hiveku_hk__ppc_platform_bidding_strategy_update",
      "mcp__plugin_hiveku_hk__ppc_campaign_create",
      "mcp__plugin_hiveku_hk__accounting_bill_record_payment",
      "mcp__plugin_hiveku_hk__accounting_invoice_record_payment",
      "mcp__plugin_hiveku_hk__crm_contact_email_send",
      "mcp__plugin_hiveku_hk__crm_enroll_sequence",
      "mcp__plugin_hiveku_hk__crm_sequence_enroll_bulk",
      "mcp__plugin_hiveku_hk__email_sequence_enroll",
      "mcp__plugin_hiveku_hk__email_sequence_activate",
      "mcp__plugin_hiveku_hk__voice_sms_send",
      "mcp__plugin_hiveku_hk__voice_sms_send_to_contact",
      "mcp__plugin_hiveku_hk__voice_sms_thread_reply",
      "mcp__plugin_hiveku_hk__crm_remove_dnc",
      "mcp__plugin_hiveku_hk__outbound_campaign_status_set",
      "mcp__plugin_hiveku_hk__outbound_campaign_sequences_save",
      "mcp__plugin_hiveku_hk__outbound_reply_draft_send",
      "mcp__plugin_hiveku_hk__voice_number_purchase",
      "mcp__plugin_hiveku_hk__voice_number_release",
      "mcp__plugin_hiveku_hk__voice_e911_address_create",
      "mcp__plugin_hiveku_hk__voice_extension_delete",
      "mcp__plugin_hiveku_hk__voice_ivr_create",
      "mcp__plugin_hiveku_hk__voice_ivr_update",
      "mcp__plugin_hiveku_hk__voice_ivr_delete",
      "mcp__plugin_hiveku_hk__voice_ring_group_delete",
      "mcp__plugin_hiveku_hk__voice_queue_delete",
      "mcp__plugin_hiveku_hk__voice_pool_delete",
      "mcp__plugin_hiveku_hk__voice_call_tracking_setup",
      "mcp__plugin_hiveku_hk__voice_call_originate",
      "mcp__plugin_hiveku_hk__voice_sms_bulk_send",
      "mcp__plugin_hiveku_hk__voice_sms_brand_submit",
      "mcp__plugin_hiveku_hk__voice_sms_campaign_submit",
      "mcp__plugin_hiveku_hk__voice_sms_campaign_resubmit",
      "mcp__plugin_hiveku_hk__voice_sms_campaign_delete",
      "mcp__plugin_hiveku_hk__voice_sms_number_assign_campaign",
      "mcp__plugin_hiveku_hk__voice_sms_toll_free_verification_submit",
      "mcp__plugin_hiveku_hk__voice_port_order_create",
      "mcp__plugin_hiveku_hk__voice_port_order_action",
      "mcp__plugin_hiveku_hk__voice_settings_update",
      "mcp__plugin_hiveku_hk__voice_number_update",
      "mcp__plugin_hiveku_hk__voice_blocked_numbers_remove",
      "mcp__plugin_hiveku_hk__voice_tenant_repair",
      "mcp__plugin_hiveku_hk__seo_gbp_review_reply",
      "mcp__plugin_hiveku_hk__seo_gbp_review_reply_delete",
      "mcp__plugin_hiveku_hk__seo_gbp_location_update",
      "mcp__plugin_hiveku_hk__seo_gbp_attributes_update",
      "mcp__plugin_hiveku_hk__seo_gsc_delete_sitemap",
      "mcp__plugin_hiveku_hk__seo_report_clear",
      "mcp__plugin_hiveku_hk__seo_deliverable_delete",
      "mcp__plugin_hiveku_hk__seo_task_implement",
      "mcp__plugin_hiveku_hk__seo_connection_delete",
      "mcp__plugin_hiveku_hk__seo_gbp_services_update",
      "mcp__plugin_hiveku_hk__seo_gbp_media_add",
      "mcp__plugin_hiveku_hk__seo_gbp_media_delete",
      "mcp__plugin_hiveku_hk__seo_gtm_publish",
      "mcp__plugin_hiveku_hk__seo_gtm_install",
      "mcp__plugin_hiveku_hk__seo_ga4_key_event_delete",
      "mcp__plugin_hiveku_hk__seo_ga4_event_create_rule_delete",
      "mcp__plugin_hiveku_hk__seo_tracking_project_delete",
      "mcp__plugin_hiveku_hk__seo_rankings_platforms_set",
      "mcp__plugin_hiveku_hk__seo_listings_scan",
      "mcp__plugin_hiveku_hk__seo_connection_test",
      "mcp__plugin_hiveku_hk__seo_competitor_delete",
      "mcp__plugin_hiveku_hk__seo_keyword_cluster_delete",
      "mcp__plugin_hiveku_hk__seo_topic_cluster_delete",
      "mcp__plugin_hiveku_hk__seo_backlink_tracker_delete",
      "mcp__plugin_hiveku_hk__seo_backlink_opportunity_delete",
      "mcp__plugin_hiveku_hk__seo_automated_report_delete",
      "mcp__plugin_hiveku_hk__seo_page_schema_delete"
    ]
  }
}
```

**One trap worth knowing.** Partial wildcards work in `allow` rules only. A rule like
`"ask": ["mcp__plugin_hiveku_hk__email_*"]` is skipped rather than applied, so it looks like
protection and is not. Every entry in `ask` has to be a complete tool name, which is why the
list above is spelled out. If you add to it, add whole names.

### What is safe to leave on allow

Reads cannot change anything, so the blanket allow covers them:

- `*_list` and `*_get` (about 250 tools), the bulk of everyday work
- `*_status`, `*_overview`, `*_logs`, `*_summary`, `*_history`, `*_stats`
- `preview_overview`, `preview_logs`, `deploy_status`, `connections_status`,
  `account_context_get`, `list_projects`, `project_files_bulk_get`

Do not go by HTTP verb alone. `verify_typecheck`, `verify_lint` and `project_test_build` are
POSTs because they run something, but they only report; there is no reason to gate them.
Equally, plenty of PATCH tools edit a draft nobody sees. The question is not the verb, it is
whether anyone outside the session notices.

### If you also run the VS Code extension

The extension serves its tools under a different prefix, and rules written for one prefix do
nothing for the other. Cover both:

```json
{
  "permissions": {
    "allow": ["mcp__plugin_hiveku_hk__*", "mcp__hiveku__*"],
    "ask": ["mcp__hiveku__deploy_site", "mcp__plugin_hiveku_hk__deploy_site"]
  }
}
```

Worth checking the prefix once on your own machine rather than trusting this file: run
`/permissions`, or let a Hiveku tool prompt you and read the name it shows.

### For an org admin

The same JSON works as managed settings, which no user setting can override:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux and WSL: `/etc/claude-code/managed-settings.json`
- Windows: `C:\Program Files\ClaudeCode\managed-settings.json`

Deny beats everything from any source, so `deny` is the tool for something nobody should reach.
Adding `"allowManagedPermissionRulesOnly": true` makes Claude Code ignore user and project
rules entirely and honor only yours.

**This is guidance, not a boundary.** Permission rules live on the machine and a determined
user can edit their own. The real control is the key: mark a connection read-only during
`/hiveku:connect` and the server refuses writes no matter what the client asks for. Use
read-only for accounts somebody should look at but never touch.

---

## Claude Desktop: the plugin configures its own sandbox settings

The Desktop app runs shell commands in a sandbox that blocks writes outside your working
folder and network access to unlisted hosts. Hiveku needs three settings to work inside it
(write access to `~/.claude/plugins` for your keys and updates, egress to `app.hiveku.com` and
`core.hiveku.com`, and marketplace auto-update). **You do not set these by hand.** From 0.10.8
the plugin adds them to your Claude settings itself at session start - additively, with a
backup - and tells you to start one new session. `hiveku doctor` shows the state;
`hiveku doctor --fix` repairs it on demand.

For a team, an admin can push the same three settings once through managed settings so no
machine ever needs the first-session repair:

```json
{
  "sandbox": {
    "filesystem": { "allowWrite": ["~/.claude/plugins"] },
    "network": { "allowedDomains": ["app.hiveku.com", "core.hiveku.com"] }
  },
  "extraKnownMarketplaces": {
    "hiveku": { "source": { "source": "git", "url": "https://github.com/lvahost/hiveku-claude-plugin.git" }, "autoUpdate": true }
  }
}
```

## Staying up to date

**Read this part.** Claude Code enables auto-update by default for Anthropic's own
marketplaces, but **third-party marketplaces like this one start with auto-update OFF**. If you
leave it off, you keep the exact version you installed and never receive new skills, commands,
or fixes, with nothing telling you that you are behind.

From 0.10.5 the plugin also tells you itself: when a newer version has already arrived on your
machine but is not applied, every new session starts with a one-line notice naming it, and
`/hiveku:update` applies it — it takes effect in your next new chat (terminal Claude Code can also run `/reload-plugins`; the Desktop app has no such command).

So either:

- **Turn on auto-update once** (step 6 above, or the Marketplaces tab in `/plugin`). Claude Code
  then refreshes shortly after a session starts and picks up new versions on its own. This is
  what we recommend. Scriptable/pushable form — the same thing as a settings block, useful for
  provisioning a whole team's machines at once:

  ```json
  {
    "extraKnownMarketplaces": {
      "hiveku": {
        "source": { "source": "git", "url": "https://github.com/lvahost/hiveku-claude-plugin.git" },
        "autoUpdate": true
      }
    }
  }
  ```

  in `~/.claude/settings.json` (per user) or managed settings (org-wide, users cannot turn it off).
- **Or update by hand** whenever you want the latest. The usual path: click the terminal icon
  in the Claude app (it opens a shell in whatever folder you have open — which folder does not
  matter, the plugin is installed for your whole user account) and run:

  ```bash
  claude plugin marketplace update hiveku
  claude plugin update hiveku@hiveku
  ```

  Two commands because they do different jobs: the first refreshes the catalog so your machine
  knows a newer version exists; the second actually installs it. The update applies to NEW
  sessions — a Claude session that is already open keeps the version it started with, so
  start a new chat to pick the new one up (terminal Claude Code can also run `/reload-plugins`).

  Already inside a Claude session instead? The same two steps work as slash commands:
  `/plugin marketplace update hiveku` then `/plugin update hiveku@hiveku`.

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
First: a SHORT tool list is normal since 0.8.0. A bound folder deliberately advertises only a
core set plus `hiveku_find_tools` - everything else is found by searching, and a found tool is
added to the callable list on the spot. So "the tool I want is not listed" means search for
it, not that anything is broken. If even the core tools and `hiveku_find_tools` are absent,
THEN the folder is not bound: run `/hiveku:bind` there, or `/hiveku:status` to see what Claude
thinks is going on. A folder with no binding is meant to be inert, so the plugin
stays out of the way in projects that have nothing to do with Hiveku.

**"I get 401 errors from Hiveku tools."**
The key for that account was revoked or rotated. Run `/hiveku:connect` again to re-mint it.

**"A connected integration inside Hiveku has gone stale (Google Ads, Search Console, Business
Profile, Analytics)."**
This is a different problem from the one above: your Hiveku key is fine, but the integration's
own OAuth grant with Google has expired or been revoked. Claude can drive most of the repair.
Just ask it to reconnect the integration, and it will:

1. Read `connections_status` and `integration_list` to see which ones are actually broken,
   rather than guessing from a symptom.
2. Call `integration_oauth_initiate`, which returns a `setup_url` for you to open plus a
   `setup_token` for polling.
3. Poll `integration_oauth_check` while you approve in the browser.
4. Finish with `integration_test`, which performs a real token refresh. That matters: it proves
   the new grant works instead of assuming it did because a page said "connected".

You still click through Google's consent screen yourself, which is the point; nothing can
approve access on your behalf. Everything either side of that, Claude handles.

Email and Shopify have their own starters (`email_connect_start`, `shopify_connect_start`), and
ad platforms can be added with `ppc_connection_create`. Social connections (Meta, TikTok,
LinkedIn) are still done in the Hiveku web app, because their consent flows hand back a picker
of every page the login administers and someone has to choose which ones belong to that
workspace.

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
