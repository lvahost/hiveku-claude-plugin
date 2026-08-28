# Shipped Templates and the Staged-Approval Queues

Load this file when installing a shipped workflow template
(`workflow_templates_list` / `workflow_create_from_template`), or when working the
queues those automations stage into: the agent-ops inbox (`agent_inbox_*`) and the
coder-agent approval rail (`agent_approval_*`).

## The catalog

`workflow_templates_list` returns 19 shipped, agent-instantiable templates: 3
form/newsletter migration defaults (`contact-form-canonical`, `quote-form-canonical`,
`newsletter-canonical`) plus 16 marketing delivery playbooks:

| slug | what it does |
|---|---|
| `weekly-search-terms-negatives` | Weekly Google Ads search terms to negative keywords |
| `weekly-bing-wasted-spend` | Weekly Bing wasted spend to negative keywords |
| `search-terms-ai-triage` | Google search terms, agent-classified, staged as ONE bulk review item |
| `bing-search-terms-ai-triage` | The Bing sibling of the above |
| `disapproval-triage` | Ad disapproval triage (event trigger) |
| `monthly-impression-share-review` | Monthly impression share review |
| `monthly-budget-reallocation-review` | Monthly cross-platform reallocation brief by email |
| `weekly-lost-backlink-alert` | Lost backlink alert (weekly) |
| `monthly-tech-audit-regression` | Monthly tech audit plus regression diff |
| `rank-drop-response` | Rank drop response (event trigger) |
| `monthly-decay-refresh` | Monthly content decay to refresh briefs |
| `monthly-aeo-visibility` | Monthly AEO visibility report |
| `weekly-cwv-watch` | Weekly Core Web Vitals watch |
| `gbp-review-sla-escalation` | GBP review SLA escalation (daily) |
| `weekly-gbp-post-draft` | Weekly GBP post draft |
| `new-review-response` | New review response (event trigger) |

**Every PPC write inside them stages to approval and never auto-applies** - the AI
triage plays stage with `auto_apply` OFF and the reallocation review only emails a
brief. That is the safety property that makes them appropriate on a client account.
Do not trust this table over the tool: call `workflow_templates_list` and read the
returned `count` and `variables[]` before instantiating, because templates are added
between plugin releases.

## Instantiating

```
workflow_templates_list()
  -> read the chosen template's variables[] (each has a key, a type, a required flag)
workflow_create_from_template({ slug, name?, overrides: { KEY: value, ... } })
```

The server substitutes every `{{var.NAME}}` token with `overrides[NAME]`, creates the
workflow, AND auto-provisions its webhook triggers in one call. It returns
`{ workflow_id, definition, webhook_url, webhook_triggers[] }`. A missing required
variable fails fast with a 400 - it does not silently create a half-configured
workflow. Note `is_enabled` defaults to **true** here, unlike `workflow_create`: the
workflow is live the moment the call returns, so confirm with the operator before
instantiating, or pass `is_enabled: false` and enable after review.

## Working the staged queues (finish what the template starts)

The templates automate collection and staging; a human still applies. Two separate
queues exist, and the workflows key profile can see both (`agent_approval_` and
`agent_inbox_` are granted to the workflows profile precisely so a session that can
park a staged item can also list, approve, or reject it).

### The agent-ops inbox: `agent_inbox_*`

`agent_inbox_list` lists agent-ops inbox items - the platform's staged
alert/suggestion queue: guardrail sweep findings, Shopify webhook-health /
scope-drift / compliance alerts, briefing suggestions, voice/billing/deploy-health
warnings, and the staged PPC/GBP items the templates produce. Filter by `category`
(free-form dotted vocabulary, e.g. `shopify.scope_drift`), `severity`
(`info | suggestion | urgent`), and lifecycle `status` (comma list; default
`new,seen` is the open queue; also `snoozed`, `actioned`, `dismissed`, `expired`).
Rows past expiry are hidden unless `expired` is requested. Read-only;
`agent_inbox_get` reads one.

`agent_inbox_resolve` closes an item. `resolution: 'resolved'` (default - you
handled the underlying problem; status becomes `actioned`) or `'dismissed'`
(deliberately not acting - a negative signal recorded for producer tuning, so never
dismiss just to make the queue read clean). **Resolving ONLY closes the queue row -
it never executes the item's action handler.** A staged negative keyword is applied
from the PPC dashboard/agent or the PPC tools, and only then resolved; resolving is
not applying, and deduped producers re-file an alert whose cause was never fixed.
Only open items (`new`/`seen`/`snoozed`) can be closed; already-closed or expired
items 409.

The PPC staging mechanics, from the engine: a write node with `auto_apply` off seeds
ONE inbox item per node per period (a weekly template's item is deduplicated per week
bucket); the node's own output reads `outcome: 'approval_required'` on a fresh seed
or `'already_staged_today'` when an unactioned item already exists - the run did NOT
re-stage, and nothing was sent to the ad platform either way.

### The coder-agent approval rail: `agent_approval_*`

A different queue with much sharper teeth. `agent_approval_list` lists staged
coder-agent actions awaiting approval (`coder_agent_pending_actions`) - the approval
rail behind the coder chat AND the SEO implement rail (a staged production deploy
appears here with `action='deploy_project'`). Each row: token, action, human-readable
summary, session_id, the staged request (kwargs include the target project_id),
created/expires timestamps. Default shows only approvable rows; `status='all'`
includes handled/expired history. `agent_approval_get` reads one.

`agent_approval_approve` **EXECUTES THE ACTION FOR REAL**: `deploy_project` deploys
code to the client's live production site; `github_commit` pushes to their
repository. It is a two-step confirm: the first call (without `confirm`) executes
nothing and returns `{ requires_confirm: true, preview }` - show that to the human,
then repeat the identical call with `confirm: true` (strict boolean) to execute. A
token is single-use: already-handled 409, expired 410. Execution resumes a full agent
turn, so billing gates apply, and can take minutes. Never approve an item to "clear
the queue" - that is a production deploy, not housekeeping.

`agent_approval_reject` discards without executing - marks the token consumed so it
can never be approved. No confirm gate (rejecting only discards); already-handled or
unknown tokens 404.
