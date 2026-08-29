---
description: "Where to begin on this account. Reads what is actually connected, then offers a few concrete things worth asking for - grounded in this account's real data, not a tour of the product."
allowed-tools: ["Bash(\"${CLAUDE_PLUGIN_ROOT}/bin/hiveku\" status:*)"]
---

The person does not know what to ask for. Roughly 1,600 tools are available and that is the
problem, not the selling point — being shown everything a platform can do is how someone ends up
doing nothing.

Your job is to come back with **a short list of specific things worth doing on THIS account this
week**, each phrased as a sentence they can say back to you.

## Do this

**1. Confirm where you are.**

```
"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" status --json
```

If `bound` is false, stop — nothing below works unbound. But do NOT reflexively say "run
/hiveku:bind": when bound client folders already exist under `~/Hiveku-Accounts` (they do right
after /hiveku:setup — `"${CLAUDE_PLUGIN_ROOT}/bin/hiveku" accounts` lists what is connected),
the right answer is a handoff in plain words: "open the <client> folder from the Code tab's
folder picker and ask me this again there — that whole workspace is wired to their account."
Suggest `/hiveku:bind` only when this folder is genuinely the one they want wired and no
per-client folders exist.

**2. Find out what this account actually has.** Three calls, no more:

- `get_account_info` — who this is, and confirmation you are on the right tenant
- `connections_status` — which integrations are actually live (Google Ads, GSC, GA4, email, voice,
  social). This is the whole basis of a useful answer: a suggestion that depends on a connection
  they have not made is noise.
- `account_entitlements` — which sections their plan actually includes, so you never propose work
  behind a lock

If a scoped key hides `connections_status` or `account_entitlements`, fall back to `list_departments`
and say your read is coarser because the key is scoped.

★ **Stop there.** Do NOT go on to list campaigns, contacts, tickets and posts "to get a picture".
That is the survey habit the orient skill forbids: it costs a fortune, fills the context, and tells
you nothing you cannot get by asking the person what they care about.

**3. Offer five to eight situations, not a tool list.**

Each one is: a plain-language situation, what it would tell them, and the sentence to say. Order by
what their connections suggest is most alive. Drop anything their connections or entitlements do not
support — a silent omission is better than a suggestion that 404s.

Draw from these shapes, and adapt the wording to the account:

| Situation | What it answers | Chain behind it |
|---|---|---|
| Morning check | "what state is my account in?" | `get_account_info` → `account_entitlements` → `account_audit_health` → `connections_status` |
| Paid ads review | "are the ads healthy, any wasted spend?" | `ppc_connection_list` → `ppc_digest` → `campaign_list` → `conversion_tracking_status` → `search_terms` |
| Are leads recording? | "is conversion tracking actually working?" | `seo_ga4_key_events_list` → `seo_gtm_status` → `analytics_channel_scorecard` → `voice_call_tracking_diagnose` |
| SEO movement | "are rankings moving, is GSC flowing?" | `seo_connections_list` → `rankings_list` → `gsc_search_analytics` → `local_search_performance` |
| Pipeline review | "what is actually in play?" | `crm_account_summary` → `list_contacts` → `list_deals` → `pipeline_stage_summary` |
| Website ops | "are the sites up and deployable?" | `sites_list` → `project_get` → `preview_overview` → `deploy_status` |
| Can we send email? | "is the email system able to send?" | `email_service_status` → `marketing_setup_status` → `email_domain_list` → `email_stats` |
| Phones and SMS | "are calls coming in, is SMS registered?" | `voice_numbers_list` → `voice_calls_list` → `voice_sms_registration_get` |
| Content and social | "what is going out?" | `social_list_accounts` → `social_list_posts` → `content_list` |
| Helpdesk | "what is the support load?" | `helpdesk_ticket_list` → `kb_list` → `csat_stats` |

Present them like this — situation first, tool names last or not at all:

> **Is conversion tracking actually working?** The most expensive thing to have quietly broken —
> ads can look fine while no leads are recording. Say: *"check whether conversions are really
> being tracked"*.

**4. End with one recommendation, not ten.**

Say which one you would start with and why, based on what you saw in `connections_status`. If Google
Ads is connected and spending, that is almost always the answer. Someone who is stuck needs a first
step, not a menu.

## Rules

- **Never call the tools in the table.** This command decides what is worth doing; the person picks;
  THEN you do it. Running the chains here is the bulk-calling mistake wearing a different hat.
- Never present more than eight options. Five is usually better.
- Never mention a tool the account cannot reach.
- If they came in with a real question already, answer that instead and skip all of this.
