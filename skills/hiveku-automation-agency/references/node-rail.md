# The Workflow Node Rail: Executing a Capability That Has No Tool

## What this covers / when to load this

The Hiveku MCP surface exposes roughly a thousand tools. The workflow palette exposes a
**second, separate execution surface**: 402 node types, each with a server-side handler that
runs inside the client's account with the client's credentials. Most sessions never touch it,
so a large slice of the platform reads as "not possible" when it is one four-call workflow away.

Load this file when:

- you know what you want to do, and no direct MCP tool does it (batched HTTP with concurrency,
  a persistent counter, a cache with a TTL, a transaction block, a subworkflow fan-out, a CSV
  built from an array, a Supabase edge-function invoke, a Hiveboard sitemap scaffold);
- you are about to tell a user "the platform cannot do that";
- you need to run something once, right now, and the only reachable executor is a node;
- you are debugging a workflow and need to know what `step_states` actually contains;
- you are about to build a workflow at all and want the discovery, config-shape, and dry-run
  mechanics in one place.

This file is self-contained. It duplicates a few facts from the `hiveku-automation-agency`
SKILL.md on purpose so that a session loading it from the SEO, sales, commerce, or web skill
does not have to load the automation skill first.

Every tool name and every node `type` string below was verified against source:
`hiveku-mcp-api-server/src/tools/*.ts` for tools, and
`hiveku_builder/src/lib/workflow/palette-data.ts` for nodes. Nothing here is inferred from a
name.

**A star marks a rule that fails silently.** Those are the ones that cost a session an hour or
cost a client an email they did not want sent.

---

## Part 1: The ladder

Three rungs, in order. Go down a rung only when the rung above genuinely does not reach.

### Rung 1: a direct MCP tool

If a tool does the thing, call the tool. It is one call, it returns structured data, it
persists nothing you have to clean up, and it leaves no row on the client's Automations board.

Do not drop to the node rail because a tool's arguments look awkward. Read
`hiveku_docs_search` / `hiveku_docs_get`, or read the tool description again. Building a
workflow to avoid reading a schema is the most common way this rail gets misused.

### Rung 2: the node rail (this file)

Take this rung when **the capability exists as a node and has no tool**. Verified examples of
node types with no direct MCP equivalent anywhere in `src/tools/*.ts`:

| Node type | What it does that no tool does |
|---|---|
| `batchHttpRequests` | N HTTP requests with a concurrency window, one result array |
| `rateLimitedHttp` | HTTP through a named shared rate-limit bucket |
| `httpCircuitBreaker` | HTTP with a circuit breaker |
| `incrementCounter` | a persistent counter |
| `setCache` / `getCache` / `deleteCache` | a keyed cache with a TTL |
| `setState` / `getState` | per-execution state |
| `transactionBlock` | database operations wrapped in a transaction with auto-rollback |
| `parallelExecute` | run branches simultaneously with a concurrency cap |
| `callWorkflow` / `parallelWorkflows` | invoke another workflow as a subroutine |
| `errorHandler` | try/catch wrapper with retry and a fallback path |
| `parseCSV` / `generateCSV` | CSV in and out of an array of objects |
| `aggregate` / `countRows` | SUM/AVG/MIN/MAX and counts against a table |
| `batchProcessor` | process an array in batches with a delay between batches |
| `validateSchema` / `sanitizeData` | JSON Schema validation, HTML stripping |
| `s3Upload` / `s3Download` | object storage read and write |

Also take this rung when the thing you want is a **composition**: read, branch, and act in one
server-side pass, where doing it tool-by-tool would mean pulling a large payload into the
conversation just to feed it back out.

### Rung 3: the dashboard, with the human

Some things are neither a tool nor a node. Some things are a node but should not be run by an
agent at all. Hand the operator a URL rather than improvising:
`workflow_dashboard_url({ workflow_id })` returns `{ workflow_id, workflow_name, is_enabled,
editor_url, runs_list_url, latest_run }`. Use it for approval, for a visual review of a graph
you built, and for anything the client should see before it fires.

### The rule that decides between rungs

> Would a human operator, told "do this once", reach for a saved automation? If no, and a tool
> exists, use the tool. If no tool exists, the node rail is the correct answer and building a
> throwaway workflow is not a hack.

---

## Part 2: Discovery

### 2.1 The catalog is the only source of truth for `type` strings

`workflow_node_types_list` takes no arguments and returns the whole catalog. Its own
description is blunt about why it is mandatory:

> The agent MUST call this before building a workflow, it's the only way to know which node
> `type` strings the engine accepts.

**Never quote a node count from memory, including the one in this file.** The palette moves
every deploy. As of this writing `palette-data.ts` holds 402 entries, 395 live and 7 marked
`isComingSoon`, and the tool description says "401 node types" - already one behind. Every
such number will be wrong eventually. The catalog will not.

The seven `isComingSoon` stubs, whose engine handlers return a "Coming Soon" error rather than
doing the work: `executeCode`, `executeExpression`, `waitForWebhook`, `waitForApproval`,
`manualCheckpoint`, `googleSheets`, `asana`. Do not design around them. In particular there is
**no working code-execution node**: if you need arbitrary logic, use `transformData`,
`templateString`, the array nodes, and `conditional`.

Everything else in the palette is runnable. The repo enforces that with a parity test
(`src/lib/workflow/__tests__/node-registry-parity.test.ts`) covering ten invariants: every live
palette type has an engine handler, a canvas component, and a config panel; every palette
trigger type can start a graph; every side-effecting type has a handler. Its allowlist file
(`registry-known-gaps.ts`) is empty and its ceiling is zero. So "it is in the live palette"
does mean "the engine can run it".

### 2.2 Two more discovery tools, and the split between them

- `workflow_event_trigger_types_list` returns trigger **nodes** that fire on something
  happening inside Hiveku (CRM contact created, deal stage changed, PM task moved, helpdesk
  ticket assigned, invoice paid, Shopify order, form submitted). Grouped by domain, each entry
  carries `node_type`, `node_type_camel`, `object_type`, `event_type`, and
  `output_shape_keys`. Those keys are what your templates can reference.
- `workflow_trigger_types_list` returns infrastructure triggers, which are `workflow_triggers`
  table **rows**: `webhook`, `scheduled_trigger`, `database_trigger`, and the config keys each
  reads. Call it before `workflow_trigger_create`, because trigger config is untyped and
  unknown keys are silently ignored. A typo'd key does not error, it just does nothing.

And one for expressions: `workflow_templating_syntax` returns the `{{...}}` reference. Read it
before you write any interpolated value.

### 2.3 Reading a node's config schema

`workflow_node_types_list` returns the compact catalog:
`{ version, generatedAt, categories[], nodes[] }`. There is **no `byType` map** on the wire
version; it is dropped deliberately to keep the payload small (roughly 40 to 50 KB). Index
`nodes[]` by `type` yourself.

Each entry in `nodes[]`:

| Key | What it means |
|---|---|
| `type` | the exact string to put in `node.type`. Canonical form is camelCase |
| `label`, `description` | display text, also the fastest way to confirm you picked the right node |
| `category` | one of triggers, ai, crm, helpdesk, pm, seo, ppc, social, marketing, analytics, builder, email, calendar, cms, knowledge, notifications, database, http, cache, files, data, flow, utilities |
| `isTrigger` | true when the engine will accept this node as the graph's entry point |
| `isComingSoon` | true means the handler returns a stub error. Do not use it |
| `hasCustomPanel` | true means there is no authored field schema, see below |
| `fields[]` | the `data` keys this node reads |
| `hint`, `warning` | free text the editor shows. Read both, they carry unguessable vocabularies |
| `outgoingHandles` | which `sourceHandle` values an outgoing edge may use |

`outgoingHandles` is `['output']` for almost every node. Two exceptions, and they are the
usual cause of "my branch never ran":

- `conditional` emits `['true', 'false']`. An edge off a conditional **must** set
  `sourceHandle` to `'true'` or `'false'`.
- `switch` emits a dynamic set: one handle per `switchConfig.cases[].handleId`, plus
  `switchConfig.defaultHandleId`.

### 2.4 How to read `fields[]` without being misled

A `fields[]` entry can be `{ key, label, placeholder?, description?, required?, textarea?,
checkbox?, inferred?, advanced?, type?, default? }`.

- `required: true` means the handler fails without it. Set it.
- **`inferred: true` does NOT mean required, and does not mean user-facing.** Inferred fields
  come from static introspection of the handler source (grepping for `config.X` and
  `node.data.X`), not from an authored schema. Read them as "the handler reads this key". Some
  are aliases of each other: `crmCreateContact` lists both `firstName` and `first_name`, both
  `lastName` and `last_name`, both `leadSource` and `lead_source`. Setting one is enough.
  Setting both is harmless. Assuming all of them are mandatory produces an unusable node config.
- `hasCustomPanel: true` means the editor renders a bespoke React panel instead of a
  schema-driven one, so `fields[]` may be the introspected list rather than a curated schema.
  When that happens, `hint` is where the real contract lives. Two hints are load-bearing:

  **`conditional`**: config lives at `data.conditionConfig: { inputPath, operator,
  compareValue }`. Operators are strict: `'==='`, `'!=='`, `'>'`, `'<'`, `'>='`, `'<='`,
  `'contains'`, `'doesNotContain'`, `'startsWith'`, `'endsWith'`, `'exists'`,
  `'doesNotExist'`. `'=='` and `'!='` are **rejected at runtime**, not at authoring time.
  And expression `inputPath`s resolve to STRINGS, so compare a boolean field against the
  string `'true'`, not the boolean `true`.

  **`aiAgent`**: reads flat off `data.*`. `identityDepartment` routes to a department agent
  server with full brand and memory hydration; omit it for a direct model call. `delegates:
  [{ department, instructions, model? }]` (max 3) runs department sub-agents first and feeds
  their output into the main prompt, surfacing as `delegate_results`. `outputFormat: 'json'`
  parses the response into fields downstream nodes can reference.

- Every non-trigger node carries a synthetic `on_error` field appended by the catalog builder.
  It is real, and it is the cheapest resilience lever on the platform. See 3.6.

### 2.5 Where the config actually goes: `data.config` versus flat `data`

The canonical shape a node is stored in is:

```json
{
  "id": "notify",
  "type": "slackNotification",
  "position": { "x": 400, "y": 100 },
  "data": {
    "label": "Post to #leads",
    "config": { "channel": "#leads", "message": "New lead: {{trigger.output.payload.email}}" }
  }
}
```

Roughly thirty handler sites read `node.data?.config || node.data || {}`, so either shape
works for them. **Two nodes invert that, deliberately, and it has already cost a production
incident.**

- `sendEmail` (and its `send_email` alias) reads **flat first**, falling back to `config`:
  `node.data[key] ?? node.data.config[key]`. The engine comment records why: the MCP write
  paths store under `data.config.*` while the editor panel both displays and writes the FLAT
  shape, so a config-first read would turn "open the node and type the right recipient" into a
  silent no-op while a stale `config.to` kept receiving the tenant's leads. Flat-first keeps a
  mis-set node failing loudly instead of misdelivering quietly.
- `aiAgent` reads flat off `data.*` only.

Practical rule: write `data.config` for everything, and additionally write `to`, `subject`,
`body` flat on `data` for `sendEmail`, and everything flat for `aiAgent`. Then confirm with a
dry run before you enable.

### 2.6 The `{{...}}` contract, in brief

The full reference is `workflow_templating_syntax`. The parts you need to build anything:

- `{{trigger.output.*}}` works regardless of the trigger node's id. The engine registers a
  literal `trigger` alias pointing at the start node's result immediately after it runs.
- Webhook triggers put the parsed JSON body at `trigger.output.payload`, headers (lowercased
  keys) at `trigger.output.headers`, and query params at `trigger.output.query`. A `data` alias
  is also registered straight onto the webhook payload, so `{{data.email}}` reaches the same
  value. The shorthand prefixes `body`, `payload`, `headers`, `query`, `params`, `data`, and
  `request` all resolve against the trigger payload.
- Upstream node outputs are `{{<nodeId>.output.<path>}}`, using the node's **id**, never its
  label. Labels are display-only and can collide.
- `{{env.NAME}}` reads the per-run environment.
- `{{ref || default}}` supplies a fallback when the reference misses.
- There is no arithmetic, no string concatenation, and no conditional inside an expression.
  `{{a + b}}` and `{{ if x }}` do not work. Compose with `transformData`, branch with
  `conditional`.
- A `manualTrigger` emits no `payload` key. Whatever you pass as `input_data` lands flat, so
  reference it as `{{trigger.output.<key>}}`.

**Fan-in changes the context shape.** When a node has exactly one incoming edge, its input
context is the parent's output object spread flat. When it has **two or more**, the context is
re-keyed as `{ "<sourceNodeId>_<handle>": <output> }` and the flat fields are gone. A node that
worked with one parent and silently reads blanks after you added a second parent is this, not a
template bug. Reference upstream values by `{{<nodeId>.output.<path>}}`, which is stable under
both shapes.

---

## Part 3: The build-and-run pattern

### 3.1 The call sequence

```
workflow_node_types_list                 read the catalog, pick types, read fields
workflow_templating_syntax               read this before writing any {{...}}
workflow_create                          create the shell, disabled
workflow_node_add   (trigger)            manualTrigger, explicit id 'trigger'
workflow_node_add   (action)             the capability you came for
workflow_edge_add                        connect trigger -> action
workflow_validate                        fix every error, read every warning
workflow_enable                          REQUIRED before any run, see 3.3
workflow_test                            dry run, read `would_have`
workflow_run                             the real thing, on approval
workflow_run_get                         per-node step_states
workflow_disable / workflow_delete       clean up, see Part 7
```

### 3.2 Worked example, end to end

The job: sweep 40 of a client's URLs, record status codes, and get the results back. There is
no `batch_http` MCP tool. `batchHttpRequests` is a live palette node. This is exactly rung 2.

**Step 1. Create the shell, disabled.**

```json
workflow_create({
  "name": "adhoc/2026-08-26 URL status sweep",
  "description": "One-shot: status codes across the client's 40 canonical URLs. Delete after."
})
```

`workflow_create` defaults `is_enabled: false`. Do not pass `is_enabled`. Keep the returned
`workflow_id`.

Its own description also tells you not to hand it a whole graph: use `workflow_create` with a
full `definition` "only when you already have a complete known-good graph", for example one
you got from `workflow_version_get` or `workflow_duplicate`. Building incrementally is the
intended path because the server assigns ids, validates each connection, and snapshots every
change to `workflow_versions` with its own `change_summary`.

**Step 2. Add the trigger, with an explicit id.**

```json
workflow_node_add({
  "workflow_id": "<uuid>",
  "type": "manualTrigger",
  "id": "trigger",
  "position": { "x": 100, "y": 100 },
  "data": { "label": "Manual start" }
})
```

`workflow_node_add` accepts an optional explicit `id`. Use it. If you omit it the server
generates `<type>_<8hex>`, so your downstream templates read
`{{manualTrigger_a1b2c3d4.output.requests}}`, which is unreadable and breaks the moment anyone
deletes and re-adds the node. Every shipped Hiveku template gives its trigger the literal id
`trigger` and its action nodes short names like `create_contact`. Do the same.

`manualTrigger` is a valid graph entry point (it is in the engine's start-node allowlist).
Exactly one trigger-category node per workflow: the engine picks the first start node it finds
and logs a warning for the rest, and `workflow_validate` reports "multiple triggers, only the
first fires" as a warning.

**Step 3. Add the action node.**

```json
workflow_node_add({
  "workflow_id": "<uuid>",
  "type": "batchHttpRequests",
  "id": "sweep",
  "position": { "x": 400, "y": 100 },
  "data": {
    "label": "Sweep URLs",
    "config": { "concurrency": 5, "on_error": "continue" }
  }
})
```

The catalog lists `requests` as required and `concurrency` with a placeholder of 5. Here
`requests` is deliberately left unset: the handler reads `config.requests` and falls back to
`inputContext.requests`, so the array arrives at run time from `input_data` instead of being
baked into the graph. That is the pattern that makes an ad-hoc workflow reusable within a
session: parameterise through `input_data`, not through node config.

Important: Expect step 5 to fail because of this, and expect to override it. `requests` is marked
`required: true` in the node schema with no `default` and no `inferred` flag, which is exactly
the case `getNodeConfigStatus` reports as missing, so `workflow_validate` returns `ok: false`
with a `severity: 'error'`, `code: 'missing_required_field'` issue naming `requests`. The
validator only reads the graph, it cannot see that `input_data` will supply the array at run
time. So this one error is expected and correct to ignore. Every other error is not. If you
would rather have a clean validate, put a placeholder array in `config.requests`; the handler
prefers config over input, so a non-empty placeholder would then win over `input_data` and
defeat the point. Leaving it unset and accepting the known issue is the better trade.

**Step 4. Connect them.**

```json
workflow_edge_add({ "workflow_id": "<uuid>", "source": "trigger", "target": "sweep" })
```

Leave `sourceHandle` unset. It defaults to `output`, and the engine treats `null`, `undefined`,
and `'output'` as the same handle. Set it only for `conditional` (`'true'` / `'false'`) and
`switch` (a `handleId` from `switchConfig.cases`). Edge ids come back as `edge_<8hex>`.

**Step 5. Validate.**

```json
workflow_validate({ "workflow_id": "<uuid>" })
```

Returns `{ ok, issues[], summary: { nodes, edges, triggers, errors, warnings } }`. Errors:
unknown node types, missing required fields, dangling edges to non-existent nodes, duplicate
ids, no trigger. Warnings: orphan nodes unreachable from any trigger, multiple triggers,
self-loops, invalid source handles. An orphan warning almost always means a missing edge. Fix
errors before you go further, with the one documented exception from step 3: the
`missing_required_field` error on the `requests` field of the `sweep` node is the deliberate
consequence of parameterising through `input_data`, so `ok: false` here is expected and every
other error still has to be fixed. This call is free and catches at authoring time what would
otherwise be a runtime "Unsupported node type".

**Step 6. Enable. This is not optional.** See 3.3.

**Step 7. Dry run.**

```json
workflow_test({
  "workflow_id": "<uuid>",
  "input_data": { "requests": [{ "url": "https://client.com/", "method": "GET" }] }
})
```

**Step 8. Real run, on approval.**

```json
workflow_run({
  "workflow_id": "<uuid>",
  "input_data": { "requests": [ ...40 entries... ] }
})
```

Sync is the default and it waits for completion. For anything that may exceed roughly 25
seconds, pass `fire_and_forget: true`: you get a 202 with a `run_id` and poll
`workflow_run_get`. Note the response shape difference in 5.1 before you decide.

**Step 9. Read the per-node detail.**

```json
workflow_run_get({ "workflow_id": "<uuid>", "run_id": "<run uuid>" })
```

`step_states.sweep.output` carries the handler's real return:
`batchResults: [{ index, url, success, status, data, error? }]` and
`batchSummary: { total, completed, success, errors }`.

**Step 10. Clean up.** Part 7.

### 3.3 The disabled-workflow trap

**A disabled workflow cannot be run, and cannot be dry-run either.** The Olympus run route
checks `is_enabled` before it looks at anything else, including `test_mode`, and returns:

```
400  Workflow is disabled. Enable it first via PATCH /workflows/:id { "is_enabled": true }
```

So `workflow_create` gives you a disabled workflow and `workflow_test` refuses to touch it.
The correct order is validate, then `workflow_enable`, then `workflow_test`, then
`workflow_run`.

This is safe for the ad-hoc rail specifically because of what "enabled" does and does not do:

- A `manualTrigger`-only graph has **no listener**. There is no `workflow_triggers` row and no
  `workflow_schedules` row, so the only thing that can start it is your own `workflow_run`.
- `workflow_enable` is a PATCH that sends only `is_enabled: true`. It provisions nothing on its
  own.

Important: Note what does provision a listener, because it is more than the obvious calls. Webhook
trigger rows are created when a `definition` is sent to PATCH (that is, via `workflow_update`),
by `workflow_provision_webhook`, by `workflow_create_from_template` (which defaults the created
workflow to enabled so the URL goes live immediately), **and by `workflow_node_add` itself**:
the nodes route calls `syncWebhookTriggers(workflow_id, account_id, definition)` whenever the
added node's `type` is `webhookTrigger` or `webhook_trigger`, and returns `webhook_url` and
`trigger_id` in the response. So adding a webhook trigger node creates the live
`workflow_triggers` row in the same call. Treat a `webhook_url` in a `workflow_node_add`
response as the signal that a listener now exists.

Important: And the hazard that follows: **if your graph contains a `webhookTrigger` or a
`scheduledTrigger`, enabling it makes it live.** The cron lives on the node itself, which is why
`workflow_set_schedule` is described as patching the `scheduledTrigger` node in place, so a
scheduled node that already carries a cron expression starts firing the moment the workflow is
enabled. For either of those triggers, enable only when the operator has approved the automation
itself, not merely to satisfy the run gate.

### 3.4 Repairing instead of rebuilding

Same loop from step 3, with `workflow_node_update` instead of `workflow_node_add`. `data` is
**shallow-merged** into the existing data, so you can patch one key without resending the node;
set a key to `null` to clear it. Every call snapshots the prior version.

`workflow_node_delete` cascades: every edge whose source or target is that node is removed too,
and the response lists the removed edge ids. `workflow_edge_delete` removes one edge and leaves
nodes alone.

### 3.5 Versions are your undo

Every definition write, including each granular node and edge operation, snapshots to
`workflow_versions`. `workflow_versions_list({ workflow_id })` gives `version` (a monotonic
int), `change_summary`, and `created_at`, without the definition. `workflow_version_get({
workflow_id, version })` fetches one in full. `workflow_version_restore({ workflow_id, version
})` rolls back, snapshotting the current state first so the restore is itself reversible.

`version` is the integer, not a row uuid. Passing a uuid fails.

### 3.6 `on_error: 'continue'` is the fan-out insurance

Default is `'fail'`, which stops that path of the workflow. Set `data.config.on_error:
'continue'` on a best-effort node and the engine records it as `completed` with
`output.__error` and `output.__degraded: true`, and downstream nodes still run. Downstream you
can branch on `{{node_id.output.__degraded}}` and read `{{node_id.output.__error}}`.

The incident behind it, recorded in the catalog builder source: a client's forms went down for
six days because a CRM write with the default `on_error: 'fail'` killed the notification path
hanging off it. Any leg whose failure must not cost the whole run gets `'continue'`.

For a workflow that is live and failing right now, one patch beats rewiring a graph under
traffic: `workflow_node_update({ workflow_id, node_id, data: { on_error: 'continue' } })` on
the non-critical leg. The run then completes with degraded steps instead of blasting a 5xx
back at the form. The soft-failed step is recorded in `step_states` with
`status: 'completed'` plus `degraded: true`, `original_error`, and
`on_error_mode: 'continue'`, and `workflow_run_logs` carries a `warn` line saying it
soft-failed - visible, not silent. Do not set `'continue'` on a node whose failure actually
matters: it converts a loud failure into a quiet one.

---

## Part 4: `test_mode: true` as the safe dry run

### 4.1 What it is

Two doors to the same behaviour. `workflow_run({ test_mode: true })` and `workflow_test({...})`
hit the same route; `workflow_test` pins the flag server-side so an agent cannot forget it. The
`workflow_run` description states it plainly:

> **`test_mode: true` is the safe dry-run flag.**

and lists what the engine does:

> skips the run-quota burn + cascade detection + run-row creation (transient, doesn't pollute
> history)

> short-circuits every SIDE-EFFECTING node before it fires (no real emails, Slack posts, CRM
> writes, HTTP requests, helpdesk tickets, DB writes, deploys, etc.)

> Each skipped node returns a mock NodeExecutionResult with `__dry_run: true`, `action:
> '<nodeType>'`, and `would_have: { ...the args it would have sent }`.

> Pure handlers (data transforms, array ops, flow control) STILL run for fidelity.

> so the workflow's structural correctness is testable even though no real side effect fires.

`workflow_test`'s own list of what it skips: outbound email, SMS, Slack and Discord
notifications; CRM writes (contact, deal, activity, company create, update, delete, and tag
changes); HTTP `apiCall` to external URLs (a mocked response shape is returned); helpdesk
ticket creates and replies; PM task writes; database writes (the tool's description writes these
as `dbInsert` / `dbUpdate` / `dbDelete`; the palette type strings are `dbCreateRow`,
`dbUpdateRow`, `dbDeleteRow`); deployments
and GitHub pushes; project file saves. What still runs, for fidelity: `transformData`,
`forEach`, `switch`, `conditional`, array ops (sort, filter, map, reduce), template resolution
and flow control, and trigger nodes against your `input_data`. And:

> Run-quota is NOT debited, no run row is persisted, cascade detection is bypassed.

### 4.2 The mock shape

Every short-circuited node returns:

```json
{
  "__dry_run": true,
  "action": "<nodeType>",
  "would_have": { "...": "the args it would have sent" },
  "id": "dry-run-<nodeId>-<timestamp>",
  "mock_note": "test_mode=true ... no real side effect was fired ..."
}
```

Some handlers carry their own richer dry-run branch and return a shape that matches their real
output (for example `emailNotification` returns a `sentAt` / `to` / `subject` / `messageId`
shape). Those short-circuit before the engine's generic net is consulted. The generic fallback
caps the config snapshot at 2000 bytes and replaces it with `{ _truncated: true, _bytes,
_preview }` when it is larger, and stubs a synthetic `id` so a downstream
`{{node.output.id}}` still resolves to something traceable.

**Read `would_have` before you enable anything.** It is where you catch the wrong recipient,
the `{{...}}` that resolved to an empty string, and the CRM payload with a blank email.

### 4.3 What a dry run does NOT protect you from

The dry-run net is a set of node types, `SIDE_EFFECTING_NODE_TYPES`. Read-shaped nodes are
excluded on purpose, with the reasoning stated in source: dry-running a read makes the test
less useful and costs nothing to run for real. That reasoning does not hold for every read,
and these are the ones that bite. Verified as **not** in the set and with no dry-run branch of
their own, so they execute for real inside a `workflow_test`:

| Node type | What a "dry run" actually does |
|---|---|
| `keywordResearch` | real DataForSEO keyword-ideas call, metered spend |
| `rankTracker` | real DataForSEO SERP call, metered spend |
| `domainAnalysis` | real DataForSEO domain call, metered spend |
| `serpAnalysis` | real live SERP fetch, metered spend |
| `aiAgent` | runs the model for real, burns tokens and any delegate sub-agents |
| `kbSearch` | real vector search |
| `delay` | actually waits |

For contrast, these ARE mocked: `seoStartAudit`, `kbIndexText`, `generateImage`,
`generateImageSet`, `generateVideo`, `designExportImage`, `designExportMp4`, `webSearch`,
`webScrape`, `webCrawl`, `webExtract`, `webMap`, every `ppc*` write, every social write, every
`accounting*` write, every Supabase write, `checkpointCreate`, `integrationTest`, and every
Mission Control write including `mcIntakeClassify`. `mcIntakeClassify` is worth calling out
because it reads like a read: it is in `SIDE_EFFECTING_NODE_TYPES` alongside `mcTaskCreate`,
`mcTaskUpdate`, `mcTaskTransition` and `mcTaskComment`, so the dispatcher short-circuits it
before the handler and returns `genericDryRunOutputForNode`. A dry run does not run the LLM
router and does not cost a completion. A real run does.

`waitUntil` is a separate case. The suspend path that parks a run in
`workflow_pending_waits` is gated on the run being persisted, and a dry run persists no run.
So in a dry run a `waitUntil` does not park and does not resume. Do not put one in a graph you
intend to prove out with `workflow_test`.

Important: And the caveat to state out loud whenever you report a passing dry run: downstream nodes
that reference `{{nodeId.output.X}}` see the `would_have` payload or a synthetic field (a fake
`messageId` from `sendEmail`, for instance). **Structural correctness is testable. Real
delivery is not.** "The dry run passed" is not "the email will arrive".

---

## Part 5: Reading results

### 5.1 A dry run leaves nothing to read

This is the single most surprising thing on this rail, and the tool descriptions do not warn
about it.

`test_mode` sets `persistRun = false`. The engine logs "Test mode, skipping database record
creation", mints an in-memory UUID, and creates **no** `automation_workflow_runs` row. The
route then looks up the run row it expects to exist and finds nothing, so the sync response
comes back with `run_id: null`.

Consequences:

- **`workflow_run_get` after `workflow_test` has nothing to fetch.** There is no run id, and
  no row behind it. Neither `workflow_run_logs` nor `workflow_runs_list` will show the test
  either.
- The only dry-run evidence you get is the sync response's `data.output`, and that is the
  **terminal node's** output. When the graph has several terminal nodes it is
  `{ "output_<nodeId>": <output>, ... }`; with exactly one it is that node's output directly.
- To inspect one specific node's `would_have` when it is not terminal, either read it off the
  terminal node's context (many handlers spread `...inputContext` into their output, so
  upstream fields ride along), or temporarily make it terminal by removing the edges below it,
  or accept the terminal view.
- `data.status` on the sync response is `completed` or `error`. The persisted run **row**
  uses `failed`, not `error`. Do not filter runs by `error`; see 5.3.

Full per-node `step_states` requires a persisted run, which means a real `workflow_run`.
Sequence the two deliberately: dry run to prove the shape, then a real run once the operator
has said yes, then read `step_states`.

### 5.2 `workflow_run_get` is the debug surface

`workflow_run_get({ workflow_id, run_id })` (and its identical twin `workflow_run_status`)
returns `status`, `input_data`, `output_data`, `error_message`, `triggered_by`, `started_at`,
`completed_at`, and `step_states`, described by the tool as

> showing exactly what each node received, produced, or failed on. This is the agent's primary
> debug tool

Each `step_states[nodeId]` entry, verified against the engine's writer, can carry:

| Key | Read it for |
|---|---|
| `status` | which node tripped |
| `input` | the exact context the node received. Truncated for storage on large payloads |
| `output` | what it produced, including `__dry_run` / `would_have` on a simulated node |
| `error`, `error_stack` | the message and up to 4000 characters of stack |
| `logs` | this node's lifecycle lines, capped at 50 per node |
| `started_at`, `completed_at`, `duration_ms` | timing. A simulated node reports `duration_ms: 0` |
| `node_type`, `node_label` | a snapshot, so a later edit does not rewrite history |
| `retry_count`, `max_retries` | how many attempts were spent |
| `unresolved_templates` | see below |
| `degraded`, `original_error`, `on_error_mode` | present when `on_error: 'continue'` soft-failed the node |
| `waiting_for` | present when the run parked on a wait node |
| `uiData` | editor feedback payload |

**`unresolved_templates` is the blank-merge detector.** Every `{{...}}` that resolved to
nothing during that node's config resolution, with no `||` default, is recorded there with its
template, source node id, path, and what it was coerced to (`empty_string` or `null`). This is
the difference between an email that went out with "Hi ," and an hour of guessing. Read it on
every green run before you call the workflow correct: a run can be `completed`, look perfect,
and still have sent blanks.

### 5.3 The rest of the run tools

| Tool | Use it for |
|---|---|
| `workflow_run_logs({ workflow_id, run_id, node_id?, level? })` | the per-node lifecycle timeline: config, starting, handler invoked, retry, timeout, completion, soft-fail. Complements `step_states` by showing WHAT happened, not just the final state. `level` filters info / warn / error. Capped at 50 lines per node |
| `workflow_runs_list({ workflow_id, status?, page?, limit? })` | this workflow's recent runs |
| `workflow_runs_recent({ status?, since?, workflow_ids?, limit? })` | account-wide feed across ALL workflows, default window one hour. Use it BEFORE `workflow_runs_list` when you do not yet know which workflow broke |
| `workflow_run_summary({ workflow_id, since? })` | counts by status, `success_rate`, latency p50/p95/p99/mean, up to 5 recent failures, `last_failed_run_id` to drill into. Caps at 1000 runs in the window |
| `workflow_dashboard_url({ workflow_id })` | editor, runs-list, and latest-run URLs for a human |

**The status vocabulary is not what you would guess.** Real values are `pending`, `waiting`,
`running`, `completed`, `failed`, `cancelled`, plus `stopped_paused`, `stopped_loop_detected`,
`stopped_rate_limit`, `stopped_circuit_breaker`. **There is no `queued` and no `succeeded`.**
Filtering on either returns nothing and looks exactly like "no runs happened".
(`workflow_run_summary`'s aggregate response does key one of its counts `succeeded` - that is a
response field, not a filter value. Do not send it as a `status` filter.)

`stopped_circuit_breaker` is in the vocabulary but the engine never persists one: the
only statuses actually written are `stopped_loop_detected` (cascade guard),
`stopped_rate_limit` (per-account per-minute cap), and `stopped_paused` (an internal
event arriving at a paused workflow). Filtering on `stopped_circuit_breaker` always
returns empty, which is not evidence of health. A circuit-breaker auto-pause shows up
as the failures that preceded it plus `stopped_paused` rows afterwards.

### 5.4 When the run never happened at all

If `workflow_runs_list` is empty for a period where the automation should have fired, the
workflow was probably auto-paused. Hiveku pauses a workflow when its circuit breaker trips or
it detects a cascade loop, and **while paused a webhook KEEPS ACCEPTING deliveries**: the
payloads are stored in `trigger_runs` and never processed, so leads are invisible rather than
lost. `workflow_stranded_list({ workflow_id })` is the read-only view of what piled up. Fix the
cause, `workflow_resume({ workflow_id })`, then `workflow_stranded_replay({ workflow_id,
confirm: true })`, which sends real notifications, is capped at 25 per call, and can be scoped
with `trigger_run_ids`. Show the operator the list first: those submissions can be days old.

Two limits on `stopped_paused` worth knowing before you promise an operator a full
replay. It records EVENT triggers only - a webhook hitting a paused workflow is
deliberately not logged (the pause is already recorded on the workflow itself), so
stranded webhook deliveries live in `trigger_runs` and surface only through
`workflow_stranded_list`. And the recording is capped at 200 rows per pause window; a
busy workflow left paused past that stops banking replayable rows entirely.

---

## Part 6: The catalogue

Verified `type` strings from `palette-data.ts`. This is a high-value selection, not the whole
palette. **Always confirm against `workflow_node_types_list` before you build**, both because
the palette moves and because the catalog carries the `fields[]` you need.

Node types are camelCase by convention. Many also accept a snake_case alias in the engine
(`sendEmail` / `send_email`); prefer the camelCase canonical form from the palette.

### 6.1 The spine: triggers, flow, data, HTTP

Every workflow needs exactly one of the first group.

**Entry points**: `manualTrigger` (start with test data, the ad-hoc rail's default),
`webhookTrigger` (inbound HTTP with method, auth, response, CORS, rate limiting),
`scheduledTrigger` (cron), `inboundWebhook` (alias handler).

**Flow control**: `conditional` (branch, handles `true` / `false`), `switch` (multi-branch),
`forEach` (iterate an array), `parallelExecute` (branches with a concurrency cap),
`errorHandler` (try/catch with retry and fallback), `transactionBlock` (DB ops with
auto-rollback), `callWorkflow` and `parallelWorkflows` (subworkflows), `delay` (in-process
pause), `waitUntil` (parks the run in the database and is resumed by cron, so it survives
deploys and restarts; use this, not `delay`, for anything long), `respond` (send a response
back to a webhook caller), `log`.

**Data shaping**: `transformData`, `templateString`, `jsonOperation`, `formatDate`,
`mathOperation`, `stringOperation`, `validateData`, `validateSchema`, `sanitizeData`.

**Arrays**: `mapArray`, `filterArray`, `sortArray`, `uniqueArray`, `findInArray`,
`arrayLength`, `batchArray`, `mergeArrays`, `batchProcessor`.

**Files**: `parseCSV`, `generateCSV`, `parseJSON`, `readFileFromURL`, `s3Upload`, `s3Download`.

**Cache and state**: `setCache`, `getCache`, `deleteCache`, `setState`, `getState`,
`incrementCounter`.

**HTTP**: `apiCall`, `httpRetry` (exponential backoff), `httpCircuitBreaker`,
`rateLimitedHttp` (named shared bucket; its catalog `warning` notes the limiter state is
per-process and breaks under horizontal scaling), `batchHttpRequests` (concurrency window).

**Intelligence and research**: `aiAgent`, `webSearch`, `webScrape`, `webCrawl` (hard-capped at
50 pages per node), `webExtract` (LLM extraction over up to 10 pages), `webMap` (sitemap URL
discovery, fast, no scraping), `kbSearch` (returns `results[]`, `top_score`, a branchable
`has_results`, and `context_text` ready for a prompt), `kbIndexText` (costs money per call,
clamped at 100k characters, mocked in a test run), `kbCreate`, `kbList`, `kbDocumentsList`,
`kbStats`, `memoryList`, `memoryCreate`.

**Creative**: `generateImage` (one image credit per run), `generateImageSet` (up to 10, bills
per image), `generateVideo` (roughly $1 per 10s, monthly cap, one clip per run),
`stockPhotoSearch` (free and read-only), `mediaRegisterUrl`, `mediaList`, `designExportImage`,
`designExportMp4`.

**Platform health**: `integrationTest` (outputs `ok`/`status` so a Condition can route dead
connections to an alert), `integrationList`, `accountAuditHealth` (drift snapshot with
`drift_flags` and a `drift_score` to branch on), `deployDoctor`, `analyticsDiagnoseTracking`,
`checkpointCreate`.

### 6.2 Communications

**Email out**: `sendEmail` (Hiveku's own sender; remember the flat-versus-config rule in 2.5),
`emailNotification` (Resend, with templates), `gmailSend` (from a connected Gmail or Outlook
account), `gmailReply` (reply within an existing thread), `gmailSearch` (Gmail query syntax or
Outlook `$filter`), `crmSendContactEmail` (via the user's mailbox, auto-logs a timeline
activity).

**Email in**: `emailNewMessageTrigger` (connected Gmail or Outlook, with sender / subject /
label filters), `gmailNewEmailTrigger`, `outlookNewEmailTrigger`.

**Email marketing**: `emailMarketingSendCampaign` (fires a draft or scheduled campaign;
triggers audience materialization and dispatch via the marketing cron),
`emailMarketingAddToSequence` (idempotent, re-enrollment is a no-op),
`emailMarketingRemoveFromSequence`, `audienceAddMember` (idempotent). Triggers:
`emailMarketingContactSubscribedTrigger`, `emailMarketingLinkClickedTrigger` (filter by
campaign or URL fragment), `emailMarketingCampaignFinishedTrigger` (the anchor for post-send
reporting).

**SMS and voice**: `sms`, `smsReceivedTrigger` (optional keyword filter), `phoneCall`,
`voiceCallCompletedTrigger` (filter by direction, disposition, tracking number, minimum
length), `voiceVoicemailTrigger` (carries caller, number dialled, and message length, never
the transcript), `voiceMissedCallTrigger` (the speed-to-lead hook), `voiceListCalls`,
`voiceGetCallDetail`, `voiceListNumbers`, `voiceExtensionStatus`.

**Team notifications**: `slackNotification`, `discordNotification`, `teamsNotification`,
`pushNotification`.

**Helpdesk**: `helpdeskCreateTicket` (lazy-creates the contact from an email alone),
`helpdeskSendReply` (customer-visible), `helpdeskAddInternalNote` (never sent to the
customer), `helpdeskAssignTicket`, `helpdeskSetStatus`, `helpdeskSetPriority`. Triggers:
`helpdeskTicketCreatedTrigger`, `helpdeskTicketUpdatedTrigger`,
`helpdeskTicketAssignedTrigger`, `helpdeskTicketResolvedTrigger`, `helpdeskNewMessageTrigger`
(filterable by direction: inbound / outbound / internal).

**Feedback and reputation**: `surveySend` (NPS / CSAT / custom, honors per-contact throttle and
SMS quiet hours), `surveyResponseReceivedTrigger` (filter by survey, score bucket, or score
range, so detractor rescue is one condition), `reviewRequest` (tokenized funnel link,
ask-frequency throttle, click and conversion tracking), `reviewFunnelSend` (rating, then a
video or written testimonial, then the public review ask), `testimonialReceivedTrigger`,
`testimonialApprovedTrigger`.

### 6.3 Sales

**Contacts**: `crmFindContact`, `crmUpsertContact` ( idempotent on email, revives
soft-deleted matches; **use this for any form or repeat-submitter flow**, which is the
palette's own guidance on both nodes), `crmCreateContact` ( does **not** throw on a duplicate
email, whatever its name suggests: the handler converges on any existing contact for that
email, live **or** soft-deleted, and updates it rather than letting the account+email unique
constraint fire, so a repeat submitter no longer dead-ends the branch hanging off it. What it
does differently from the upsert node is narrower: on an existing row it deliberately skips
the write-once `original_lead_source` / `original_utm_*` fields so first-touch attribution
survives, and its `created` flag stays true only for a genuine insert),
`crmQuickCreateContact`, `crmUpdateContact`, `crmSearchContacts`,
`crmListContacts`, `crmBulkImportContacts` (up to 5,000 rows, de-duplicates by email).

**Deals**: `crmCreateDeal`, `crmUpdateDeal`, `crmFindDeal`, `crmMoveDealToStage` (resolves the
stage UUID from a name), `crmMarkDealWon`, `crmMarkDealLost`, `crmListDeals`,
`crmListPipelines`.

**Companies and links**: `crmFindCompany`, `crmCreateCompany`, `crmUpdateCompany`,
`crmLinkContactToCompany`, `crmLinkContactToDeal`, `crmLinkCompanyToDeal`.

**Activity, tasks, sequences**: `crmLogActivity`, `crmLogCall`, `crmGetCalls`,
`crmListActivities`, `crmGetContactEmails`, `crmSyncContactEmails`, `crmCreateTask`,
`crmUpdateTask`, `crmCompleteTask`, `crmListTasks`, `crmEnrollInSequence`,
`crmUnenrollFromSequence`, `crmListSequences`.

**Fields and tags**: `crmSetCustomFieldValue`, `crmGetCustomFieldValues`, `crmAddTag`,
`crmRemoveTag`, `crmListTags`.

**Reports as nodes** (useful as the data source for a scheduled digest):
`crmActivitySummary`, `crmConversionFunnel`, `crmPipelineSummary`, `crmStageTransitions`.

**Triggers**: `crmContactTrigger`, `crmDealTrigger`, `crmActivityTrigger`,
`crmContactStageChangedTrigger` (filter by the stage moved into, the "became a customer"
hook), `crmContactLeadStatusChangedTrigger`, `crmDealStageChangedTrigger`, `crmTaskDueTrigger`,
`crmTagAddedTrigger`, `crmSequenceEnrolledTrigger`, `crmEmailReceivedTrigger`,
`crmCallLoggedTrigger`. Several of these need a backend emitter on the underlying write; the
palette says so per entry. A trigger with no live emitter is authorable and silent, which
looks exactly like a broken workflow. Confirm with `workflow_event_trigger_types_list`.

**Outbound**: `outboundListCampaigns`, `outboundGetCampaign`, `outboundListLeads`,
`outboundGetInbox`, `outboundListSequenceLearnings`, `outboundEmailReplyTrigger`,
`respondToOutboundReply` (save a draft or send).

**Work management**: `createTask`, `createSubtask`, `updateTask`, `completeTask`, `getTasks`,
`pmProjectTrigger`, `pmTaskCreatedTrigger`, `pmTaskUpdatedTrigger`. Mission Control (the
human-in-the-loop board): `mcTaskCreate` (replay-safe, a retried run reuses the first card),
`mcTaskUpdate`, `mcTaskTransition` (outputs a branchable `changed` flag),
`mcTaskComment` ( no replay protection, so a resumed run posts a second comment),
`mcTasksList`, `mcTasksNext`, `mcTasksStalled`, `mcSlaBreached`, `mcLanesList`,
`mcIntakeClassify`.

### 6.4 Commerce

**Billing lifecycle triggers**, all filterable by event type: `billingEstimateTrigger` (sent,
viewed, accepted, declined, expired, converted), `billingInvoiceTrigger` (sent, viewed, paid,
partially paid, voided, overdue, payment failed, refunded), `billingPaymentTrigger` (received,
refunded, failed), `billingSubscriptionTrigger` (created, renewed, cancelled, past due),
`billingSignatureTrigger` (sent, completed, declined, expired).

**Shopify**: `shopifyOrderTrigger` (any order event), `shopifyOrderCreatedTrigger`,
`shopifyOrderUpdatedTrigger`, `shopifyReviewTrigger`, `shopifyReviewSubmittedTrigger` (use
`maxRating` to alert ops on negatives), `shopifyReviewApprovedTrigger` (use `minRating: 5`),
`shopifySubscriptionTrigger`, `shopifySubscriptionStartedTrigger`,
`shopifySubscriptionPausedTrigger`, `shopifySubscriptionCancelledTrigger`,
`shopifySubscriptionBillingFailedTrigger` (the palette calls failed billing the number one
churn signal), `shopifySubscriptionBillingSucceededTrigger`. Most accept `connectionId` for
multi-shop accounts plus feature-specific filters (rating, amount, product handles).

**Bookings**: `bookingCreatedTrigger`, `bookingCancelledTrigger`, `bookingRescheduledTrigger`,
plus `calendarListEvents`, `calendarUpdateEvent`, `calendarFindFreeSlots`.

**Accounting**: `accountingCreateVendor` (outputs `vendor_id` for a downstream bill),
`accountingCreateBill` (draft; currency required, money in whole cents),
`accountingApproveBill` ( an ambiguous decision value is never read as approval),
`accountingRecordBillPayment` (whole-cent, validated and capped, with max-amount rails),
`accountingRecordInvoicePayment` ( set an idempotency key so a replayed run cannot book it
twice), `accountingCreateTimeEntry` (one entry covers at most one day), `accountingArAging`,
`accountingApAging`, `accountingPnlSummary` (cash basis).

Money paths deserve the same discipline as email: dry run, read `would_have`, get an explicit
yes, then run once. Never loop a payment node.

### 6.5 Sites, content, and growth

**Site triggers**: `formSubmittedTrigger` (a form on a managed website),
`websiteVisitorTrigger` and `visitor_event_trigger` (page view, form view, session start),
`deployTrigger` (fires when a deployment completes, per environment), `databaseTrigger` (any
change in a watched table of a connected project database), `dbInsertTrigger`,
`dbUpdateTrigger`, `dbDeleteTrigger`, `dbRowChange`.

**Builder and deploy**: `builderListProjects`, `builderGetProject`, `builderListBranches`,
`builderListChanges` (files modified but not committed), `builderListCommits`,
`builderListCheckpoints`, `builderRestoreCheckpoint`, `builderDeploy`,
`builderDeployProduction`, `builderGetDeploymentLogs`, `builderPreviewSync`,
`builderPreviewHealth`, `deployAction`, `githubCommit`, `githubPull`, `createPreviewPR`,
`syncProjects`, `marketplaceInstallTemplate`. `checkpointCreate` snapshots every project
file and asset and returns a `checkpoint_hash`; the palette's own advice is to put it first in
any workflow that edits a site.

**Project database**: `dbCreateRow`, `dbUpdateRow`, `dbDeleteRow`, `dbLookupRow`, `bulkInsert`,
`bulkUpdate`, `bulkDelete`, `upsert`, `runSql`, `countRows`, `aggregate`.

**CMS**: `cmsWriteEntry` (draft by default; slug derives from the title; `fields` is a JSON
object that supports templating), `cmsPromoteDraft`, `cmsAttachImage` (by asset path or URL,
typically `{{image-node.imageUrls[0]}}` from a generation step), `cmsReadEntry` (can continue
with `found: false` when missing, which is branchable), `cmsListEntries`, `cmsSearchEntries`,
`cmsListCollections` (discover collection ids at run time), `cmsBulkImport` (up to 200 entries,
conflict behaviour must be chosen explicitly), `cmsDeleteEntry` (soft delete; tick Draft to
discard only the draft shadow).

**Analytics**: `analyticsOverview`, `analyticsListEvents`, `analyticsListPages`,
`analyticsListSessions`, `analyticsListTrafficSources`, `analyticsListVisitors`,
`analyticsGetVisitor`.

**SEO**: `seoListKeywords`, `seoGetRankings`, `seoDetectContentDecay`, `seoFindContentGaps`,
`seoDetectCannibalization`, `seoAnalyzeCompetitors`, `seoCompetitorChanges`,
`seoFindFeaturedSnippets`, `seoListKeywordClusters`, `seoListTopicClusters`, `seoListBacklinks`,
`seoTrackBacklinks`, `seoFindBacklinkOpportunities`, `seoListAudits`, `seoGetAudit`,
`seoStartAudit` (async DataForSEO crawl, 10s to 5min, spends metered budget, read results later
with the list/get nodes), `seoSyncConnections`, `seoCoreWebVitals` (CrUX p75 LCP/INP/CLS plus a
PageSpeed lab audit), `aeoVisibilityCheck` (read-only, never probes SERPs), `gbpReviewsList`,
`gbpReviewReply` ( drafts an ops-inbox item for human approval, it never posts to Google).
Metered raw-research nodes: `keywordResearch`, `rankTracker`, `domainAnalysis`, `serpAnalysis`.
Triggers: `rankDropTrigger` ( fires only on a manual re-check from the SEO dashboard, because
the scheduled daily sync runs in an external service that emits nothing back),
`newReviewTrigger` (6h GBP sync, filter by rating below), `seoRankingChangedTrigger`,
`seoCompetitorMovedTrigger`.

**PPC**: reads `ppcListConnections`, `ppcTestConnection`, `ppcSyncConnections`,
`ppcListCampaigns`, `ppcGetMetrics`, `ppcPacingSummary`, `ppcAnomalyCheck`,
`ppcSearchTermsReport`, `ppcBingSearchTermsReport`, `ppcImpressionShareReport`,
`ppcDisapprovalsList`. Writes `ppcNegativeKeywordAdd`, `ppcNegativeKeywordsBulkStage`,
`ppcBudgetUpdate`, `ppcKeywordBidUpdate`, `ppcPauseResource`, `ppcEnableResource`. Every one
of the writes defaults `auto_apply` OFF, which stages an approval item instead of spending;
turning it on mutates the live account. `ppcEnableResource` is a write even though it sounds
like a read, because enabling resumes spending. Triggers: `ppcBudgetThresholdTrigger`,
`disapprovalTrigger` (fires on the crossing only, gated on the deduped ops-inbox row, and the
daily sweep counts Google Ads only today).

Important: `ppcCampaignStatus` is in the palette and its description promises campaign metrics, but the
engine dispatches it to the list-campaigns handler. Use `ppcGetMetrics` when you want metrics.

**Social**: `socialListPosts`, `socialCreatePost` (draft state by default),
`socialApprovePost`, `socialRejectPost`, `socialPublishPost` (fires an already-approved post),
`socialGetPostAnalytics`, `socialGetCalendar`, `socialListComments`, `socialListHashtags`,
`socialListPillars`. Triggers: `socialPostApprovedTrigger`, `socialPostPublishedTrigger`,
`socialCommentReceivedTrigger`.

**Marketing content**: `marketingListContent`, `marketingGetContent`, `marketingCreateContent`,
`marketingGetContentAnalytics`, `marketingSearchKnowledgeBase`, `marketingScrapeIntoKB`,
`marketingListBrandGuides`, `marketingListCustomerAvatars`, `marketingListCustomerJourneys`.
The last three are read-only and exist to be fed into an `aiAgent` prompt.

**Collaboration and infrastructure**: `hiveboardCreate`, `hiveboardGet`, `hiveboardList`,
`hiveboardElementCreate`, `hiveboardElementsBulkCreate` (up to 200 elements per call),
`hiveboardSitemapScaffold` (a page tree as labelled frames joined by arrows),
`hiveboardDuplicate`, `discussionsList`, `discussionsGetThread`, `discussionsCreate`,
`discussionsAddMessage`, `discussionCreatedTrigger`, `supabaseAuthUserCreate`,
`supabaseAuthUserUpdate`, `supabaseAuthUsersList`, `supabaseAuthUserGenerateLink`,
`supabaseEdgeFunctionInvoke`, `supabaseStorageObjectUpload`, `supabaseStorageObjectSignedUrl`
( the URL is a bearer credential and is withheld from the run output unless you opt in).

---

## Part 7: When NOT to use this rail, and how to leave the board clean

### 7.1 Do not take this rung when

- **A direct tool exists.** One call beats four plus a persisted artifact.
- **The operator has not approved a side-effecting run.** Building the graph is free.
  `workflow_run` in real mode is not, and it reaches the client's customers.
- **The answer needs a human decision.** Open a Mission Control card (`mcTaskCreate`) or hand
  over `workflow_dashboard_url`. Do not build a workflow to route around approval.
- **The need is recurring.** Then it is an automation, not an ad-hoc run. Check
  `workflow_templates_list` first: templates ship for lost-backlink alerts, tech-audit
  regression, rank-drop response, content-decay refresh, monthly AEO visibility, GBP review
  SLA, weekly GBP post drafts, Core Web Vitals watch, search-terms-to-negatives for Google and
  Bing, disapproval triage, and impression-share review. `workflow_create_from_template({
  slug, overrides })` installs one per client. Read the template's `variables[]` first; a
  missing required variable fails with a 400. It defaults `is_enabled: true`, so pass
  `is_enabled: false` if you want to review before it goes live.
- **The graph is getting big.** More than about six nodes for a one-shot answer means you are
  building a real automation. Stop, name it properly, and follow the automation skill's build
  loop with the operator in the room.
- **You would need `executeCode`.** It is a Coming Soon stub. Compose with `transformData` and
  the array nodes instead, or accept that this one is not reachable.

### 7.2 What an ad-hoc run leaves behind

Building on this rail is not free. It creates:

- a row in `automation_workflows`, visible on the client's Automations board;
- a `workflow_versions` snapshot per node and per edge operation;
- an `automation_workflow_runs` row per real run, with `step_states`.

And it spends:

- **Run quota.** A real run checks the account's workflow-run limit and increments the counter.
  The default included allowance is 100 runs per month. Over that, if the account's overage
  switch is on (it defaults to on), extra runs keep working and bill in arrears at $0.01 each.
  If it is off, the run is refused at the limit. Dry runs are free: the quota is not debited.
- **The client's active-automation allowance.** The plan cap counts ENABLED workflows. It is
  enforced on the dashboard's own create and enable route, not on the Olympus route, so your
  MCP calls will never be refused by it. The failure lands on the **client**: the next
  automation they try to create or enable in the UI is the one that gets blocked, by an
  ad-hoc workflow you left switched on.

### 7.3 The hygiene rules

**H1. Name it so it is obviously disposable, and so it is findable.** Use a stable prefix:

```
adhoc/<yyyy-mm-dd> <what it did>
adhoc/2026-08-26 URL status sweep
```

`workflow_list({ search: 'adhoc/' })` then finds every one of them, in this session and in
every future one. A workflow called "Test" or "New Workflow" is indistinguishable from
something the client built, and nobody will ever dare delete it.

**H2. Put the disposability in the description too.** One line: what it was for, who asked,
and that it is safe to delete. The description is what a confused operator reads six weeks
later.

**H3. `workflow_disable` the moment the run is read.** This is the non-negotiable one. It is
instant, reversible, and it takes the workflow out of the active-automation count. Do it even
if you plan to delete, because deletion may need a confirmation you do not have yet.

**H4. Delete only after you have captured the output.** `workflow_delete` is a **hard
delete**. There is no soft archive. It cascades the workflow's triggers, schedules, versions,
runs, and dead-letter rows. Linked AI chat sessions are unlinked rather than deleted, so chat
content survives, but **the run history goes, and the run history is your evidence**. If the
result is going into a report, a `memory_create` note, or a `pm_tasks_complete` note, write it
down first, then delete.

**H5. Delete when it was genuinely one-shot; disable and keep when it might recur.** A sweep
you will run again next month is worth keeping disabled under its `adhoc/` name. A one-time
diagnostic is worth deleting. Ask the operator when it is ambiguous; both answers are cheap
and neither is reversible in the same way.

**H6. Never leave a `webhookTrigger` or `scheduledTrigger` workflow enabled after an ad-hoc
run.** A manual-trigger graph is inert while enabled. Those two are not: one is a live public
URL, the other is a cron that will fire at 3am on a Sunday and email the client's customers
about something you were testing in August.

**H7. Log the decision.** If the ad-hoc run produced a finding worth keeping, `memory_create`
it. If it produced work, `pm_tasks_create` it. A rail run that leaves no trace but a deleted
workflow means the next session re-derives it from scratch.

---

## Appendix: the tools named in this file

Every one verified present in `hiveku-mcp-api-server/src/tools/*.ts`.

**Discovery**: `workflow_node_types_list`, `workflow_trigger_types_list`,
`workflow_event_trigger_types_list`, `workflow_templating_syntax`, `workflow_templates_list`.

**Build**: `workflow_create`, `workflow_update`, `workflow_node_add`, `workflow_node_update`,
`workflow_node_delete`, `workflow_edge_add`, `workflow_edge_delete`, `workflow_validate`,
`workflow_clone`, `workflow_duplicate`, `workflow_create_from_template`,
`workflow_provision_webhook`, `workflow_bind_form`, `workflow_set_recipient`.

**Lifecycle**: `workflow_enable`, `workflow_disable`, `workflow_delete`, `workflow_list`,
`workflow_get`, `workflow_resolve_short_id`, `workflow_dashboard_url`.

**Schedules and triggers**: `workflow_set_schedule` (5-field cron, optional IANA `timezone`,
`enabled` pauses the schedule without disabling the workflow), `workflow_get_schedule`,
`workflow_delete_schedule` ( removes the `scheduledTrigger` node and its edges, which can
orphan the nodes below it; the response warns when it does), `workflow_triggers_list`,
`workflow_trigger_get`, `workflow_trigger_create`, `workflow_trigger_update`,
`workflow_trigger_delete`.

**Run and read**: `workflow_run`, `workflow_test`, `workflow_run_get`, `workflow_run_status`,
`workflow_run_logs`, `workflow_runs_list`, `workflow_runs_recent`, `workflow_run_summary`.

**Recovery**: `workflow_versions_list`, `workflow_version_get`, `workflow_version_restore`,
`workflow_resume`, `workflow_stranded_list`, `workflow_stranded_replay`.

**Context and persistence around the rail**: `account_context_get({ domain: 'workflow' })`,
`talk_to_department({ domain: 'workflow', message })`, `memory_list`, `memory_create`,
`pm_tasks_create`, `pm_tasks_complete`, `hiveku_docs_search`, `hiveku_docs_get`.
