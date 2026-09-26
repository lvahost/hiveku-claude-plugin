# The Workflow Node Rail: Executing a Capability That Has No Tool

## What this covers / when to load this

The Hiveku MCP surface exposes roughly a thousand tools. The workflow palette exposes a
**second, separate execution surface**: over 500 node types (the live count is in the catalog), each with a server-side handler that
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
every deploy, and the counts written into this file, the skill and the tool descriptions have
disagreed with each other and with the live catalog more than once. Every such number will be
wrong eventually. The catalog will not.

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
  reads. Call it before `workflow_trigger_create`. On a webhook row, a key that is not a
  setting is dropped and echoed back in the response as `ignored_keys` / `unknown_keys` /
  `warnings`, so read those; on the other row types trigger config is untyped and a typo'd key
  does not error, it just does nothing.

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
| `hasCustomPanel` | true means the editor renders a bespoke panel instead of a schema-driven one, see 2.4 |
| `fields[]` | the `data` keys this node reads |
| `requires` | custom-panel nodes: the handler's contract, `[{ anyOf, when? }]`, see 2.4 |
| `configLocation` | `'flat'` means the handler reads `data.*` only and ignores `data.config.*`; `'configOrData'` means it reads `data.config` whole whenever the node has one; `'databaseTriggerConfig'` (the DB triggers) means `data.databaseTriggerConfig`, else `data.config`, else `data`, see 2.5 |
| `hint`, `warning` | free text the editor shows. Read both, they carry unguessable vocabularies |
| `outgoingHandles` | which `sourceHandle` values an outgoing edge may use |

`outgoingHandles` is `['output']` for almost every node. Two exceptions, and they are the
usual cause of "my branch never ran":

- `conditional` emits `['true', 'false']`. An edge off a conditional **must** set
  `sourceHandle` to `'true'` or `'false'`.
- `switch` emits a dynamic set: one handle per `switchConfig.cases[].handleId`, plus
  `switchConfig.defaultHandleId`.

### 2.4 How to read `fields[]` without being misled

A `fields[]` entry can be `{ key, label, placeholder?, description?, required?,
requiredOneOf?, requiredWhen?, textarea?, checkbox?, inferred?, advanced?, type?, default?,
options? }`.

- `required: true` means the handler fails without it. Set it.
- `requiredOneOf: [...]` lists interchangeable keys (aliases such as `webhookUrl` /
  `webhook_url`, or genuine alternatives such as `tagName` / `tagId`). Any ONE of them
  satisfies the requirement; setting none of them fails the node. Schema-panel fields carry
  it too, built from their aliases: `connectionId` / `connection_id` on the PPC nodes,
  `projectId` / `project_id` on the builder, CMS and Supabase nodes, `ticket_id` /
  `ticketId` on helpdesk nodes.
- `requiredWhen: { key, truthy? | falsy? | equals? }` makes a key required only when a sibling
  key says so (`aiAgent` needs `customPrompt` when `identityDepartment` is set). It never sets
  `required: true` on its own.
- **`inferred: true` does NOT mean required, and does not mean user-facing.** Inferred fields
  come from static introspection of the handler source (grepping for `config.X` and
  `node.data.X`), not from an authored schema. Read them as "the handler reads this key". Some
  are aliases of each other: `crmCreateContact` lists both `firstName` and `first_name`, both
  `lastName` and `last_name`, both `leadSource` and `lead_source`. Setting one is enough.
  Setting both is harmless. Assuming all of them are mandatory produces an unusable node config.
- `hasCustomPanel: true` means the editor renders a bespoke React panel instead of a
  schema-driven one. Custom-panel nodes carry their contract as data now: node-level
  `requires: [{ anyOf, when?, label? }]` lists exactly what the handler rejects without (each
  group is satisfied by any one of its `anyOf` keys, and `when` gates it on a sibling key), and
  the member fields carry `required` / `requiredOneOf` / `requiredWhen` to match. The five
  `crmUpdate*` nodes (Contact, Deal, Company, Activity, Task) carry a second group labelled
  "At least one field to change": an update node with only its id is `missing_required_field`
  in validate and at the enable gate ("... is missing a required value: at least one field to
  change (any of ...)"), because the handler refuses it with "No fields to update". A `{{template}}`
  or `{{env.NAME}}` string counts as set. `slackNotification`, `apiCall`, `conditional`,
  `switch`, `aiAgent`, `respond`, `sendEmail`, `webhookTrigger`, `inboundWebhook` and
  `forEach` also carry authored `type` / `options` / `default` / `description` on their fields.
  `workflow_node_add`, `workflow_node_update` and `workflow_validate` check the same groups
  (3.2 step 5, 3.4). `hint` still carries what that shape cannot express: conjunctions,
  vocabularies, side effects, which node to prefer. Two hints are load-bearing:

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
  parses the response into fields downstream nodes can reference, but on its own it does not
  hold the model to any keys: a reply can add keys, drop keys or return the wrong types and
  the node still completes.

  `responseSchema` (optional, flat on `data`, implies `outputFormat: 'json'`) is what holds
  the reply to a shape. Shorthand: `{ key: 'string' | 'number' | 'integer' | 'boolean' |
  'object' | 'array' | 'string[]' | 'number[]' }`, a `?` on the TYPE for an optional key
  (`'string?'`; a key written `"name?"` is rejected with "put ? on the type"), or
  `["a", "b"]` for a string enum. Or a full JSON Schema with `type: 'object'`; without
  `additionalProperties: false` a full schema keeps extra keys, as the spec says, while the
  shorthand strips them. On a direct model call the schema is sent natively; on a department
  node (`identityDepartment`) it goes into the prompt. Either way the reply is validated after
  parsing: undeclared keys are stripped (and named in a step warning), required keys and types
  are enforced, and only safe coercions apply (`'42'` to 42, `'true'` to true, 7 to `'7'`,
  enum case). A mismatch gets ONE repair attempt (direct: a follow-up turn on the same model;
  department: a formatting-only call on the agent's reply, the agent never runs twice), then
  the node fails and honours `on_error`. Output adds `schema_valid`, `schema_errors`,
  `schema_stripped_keys`, `schema_repaired` and `structured_output`. A failed node does not
  spread its fields, so a downstream `{{ai.key}}` records a miss instead of reading bad data;
  for best-effort copy set `on_error: 'continue'` and branch on `{{ai.schema_valid}}`. An
  invalid schema fails the node before any model spend ("responseSchema is invalid: ...") and
  `workflow_validate` reports it as `invalid_response_schema`. With a legacy `agentId` the
  schema is not applied (step warning). `workflow_test` mocks AI nodes, so enforcement shows
  only on a real run.

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
    "config": {
      "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
      "channel": "#leads",
      "message": "New lead: {{trigger.output.payload.email}}"
    }
  }
}
```

`slackNotification` requires `webhookUrl` (or `webhook_url`) AND one of `message` / `text` /
`blocks`; without the webhook URL every run fails at this node. An `{{env.NAME}}` reference
counts as set. In a `workflow_test` it shows as `not_evaluated` in `template_values`, because
MCP test runs never load the environment, so that is not a miss (4.2).

Most handler sites read `node.data?.config || node.data || {}`, so either shape works for
them as a whole: `data.config` when the node has one, otherwise flat `data`, never a mix.
**The exceptions are marked in the catalog, and they have already cost a production
incident.**

- `configLocation: 'flat'` nodes read `data.*` ONLY; a value you put under `data.config` is
  invisible to them. Today that is `apiCall`, `conditional` (`data.conditionConfig`),
  `switch` (`data.switchConfig`), `forEach` (`data.forEachConfig`), `aiAgent`, `respond`,
  `transformData` and `respondToOutboundReply`. Read `configLocation` off the catalog rather
  than this list. When a required value sits in the wrong place, `workflow_node_add`,
  `workflow_node_update` and `workflow_validate` say so in a `note` on the missing field
  (for example "found at data.config.url, but this node reads data.url").
- `configLocation: 'configOrData'` marks the custom-panel nodes that read that whole-object
  way: every CRM node, `keywordResearch`, `rankTracker`, `domainAnalysis`, `serpAnalysis`
  and `slackNotification`. Once the node has a `data.config` object, a key left flat beside
  it is invisible, and the check reports it missing with the note "found at data.X, but
  this node reads data.config when data has a config object; move it to data.config.X".
- `configLocation: 'databaseTriggerConfig'` marks the DB triggers (`databaseTrigger`,
  `dbInsertTrigger`, `dbUpdateTrigger`, `dbDeleteTrigger`, `dbRowChange`). Every reader takes
  ONE object whole: `data.databaseTriggerConfig` when it exists, else `data.config`, else flat
  `data`. `tableName` counts only there; anywhere else it is reported missing with a note
  naming where to set it ("found at data.tableName, but the trigger readers read data.config
  when it exists; set data.config.tableName").
- `sendEmail` (and its `send_email` alias) reads **flat first**, falling back to `config`:
  `node.data[key] ?? node.data.config[key]`. The engine comment records why: the MCP write
  paths store under `data.config.*` while the editor panel both displays and writes the FLAT
  shape, so a config-first read would turn "open the node and type the right recipient" into a
  silent no-op while a stale `config.to` kept receiving the tenant's leads. Flat-first keeps a
  mis-set node failing loudly instead of misdelivering quietly.

Practical rule: write `data.config` for every node EXCEPT the `configLocation: 'flat'` ones,
which get everything flat on `data`; for `sendEmail` additionally write `to`, `subject`, `body`
flat on `data`. Then read `config_incomplete` on the node_add / node_update response, and
confirm with a dry run before you enable. On the unmarked nodes the check counts a key set
in `data.config` or in flat `data`, so a clean validate does not prove a config split
across both places works: keep each node's keys together.

### 2.6 The `{{...}}` contract, in brief

The full reference is `workflow_templating_syntax`. The parts you need to build anything:

- `{{trigger.output.*}}` works regardless of the trigger node's id. The engine registers a
  literal `trigger` alias pointing at the start node's result immediately after it runs.
- Webhook triggers put the parsed JSON body at `trigger.output.payload`, headers (lowercased
  keys) at `trigger.output.headers`, and query params at `trigger.output.query`. A `data` alias
  is also registered straight onto the webhook payload, so `{{data.email}}` reaches the same
  value. The shorthand prefixes `body`, `payload`, `headers`, `query`, `params`, `data`, and
  `request` all resolve against the trigger payload. Those are the only ways to the body:
  `{{trigger.email}}` and `{{trigger.output.email}}` are not the body and resolve to nothing
  on a real delivery. `workflow_test` and `workflow_run` on a webhook workflow build the same
  envelope, with `input_data` as the body (4.1), so a test misses where real traffic would.
- `{{trigger.output.timestamp}}` is on every run: the ISO 8601 instant Hiveku received or
  fired the event. That is a webhook's receipt time (kept when the delivery was queued), a
  schedule's fire time, when the database row changed, the event time for form and event
  triggers, and the start of a `workflow_run` / `workflow_test`; a replay keeps the original
  run's time. `{{trigger.output.triggeredAt}}` is the same instant unless the origin set its
  own. A schedule's trigger has no `date` field (`{{trigger.date}}` is a blank): for a
  dated file name or subject, use the timestamp.
- Upstream node outputs are `{{<nodeId>.output.<path>}}`, using the node's **id**, never its
  label. Labels are display-only and can collide.
- `{{env.NAME}}` reads the per-run environment.
- `{{ref || default}}` supplies a fallback, in every node type, in `workflow_test` and in real
  runs alike. The default is used when the reference is missing (unknown node, missing field,
  out-of-range index), null, or an empty or whitespace-only string; `0`, `false`, `[]` and
  `{}` are real values and are kept. Everything after the first `||` is plain text, never
  looked up. `{{trigger.output.payload.company || trigger.output.payload.name}}` falls back
  to the words `trigger.output.payload.name`, not to the name. There is no chaining. To fall
  back to a second field, check the first with a Conditional node (or return the first
  non-empty value from a Code node) and reference that node's output. If you mean text that
  looks like a path, quote it: `{{ref || 'trigger.name'}}`. workflow_validate warns
  `fallback_default_is_literal`, and a workflow_test template_values entry carries a `hint`,
  when a default looks like a reference. Quotes
  are stripped (`"n/a"` and `'n/a'` both give `n/a`), and JSON literals parse (`0`, `true`,
  `{}`, `[]`): a whole-field reference keeps the default's type where the field keeps types
  (an `apiCall` / `respond` JSON body, a database row value) and is text everywhere else. As
  text, a fired default is written exactly as typed (`9.90` stays `9.90`, `1e3` stays `1e3`),
  even when the whole field is that one token in a Slack message, an email node's fields
  (`sendEmail`, `gmail*`, `emailNotification`) or an AI prompt. A control field that is one
  whole token takes the parsed value instead, so `{{x || 9.90}}` gives `9.9` in a `delay`
  duration, a `conditional` compareValue, a `switch` value, `respond` statusCode, or an
  `apiCall` url, method or header. A
  default cannot contain `}` except as one flat JSON object. `{{ref || }}` or
  `{{ref || null}}` means blank is intended and is not recorded as unresolved.
  (Before the 2026-09 fix, most action nodes - SMS, CRM, PM, helpdesk, Discord / Teams /
  push, database and every Olympus-backed node - and every `workflow_test` preview blanked the
  whole `{{...}}` even when the reference had a value, and an empty string never triggered a
  default. Re-test anything that relied on a fallback.)
- **A single `|` and the word `or` are NOT fallbacks.** `{{ref | x}}` and `{{ref or x}}`
  resolve to nothing: blank in most nodes, and sent through as literal token text in
  engine-resolved fields (`apiCall`, `sendEmail`, `aiAgent` and similar). The step records
  either one in `unresolved_templates` with a `hint` saying to write `||`.
- **What a miss becomes.** A well-formed `{{node.path}}` that resolves to nothing, with no
  default, becomes `''` inside text or null as a whole field, and is recorded in the step's
  `unresolved_templates` (5.2). It is never sent as literal `{{...}}` text. The literal case is
  narrower: a token the engine grammar cannot parse (a bare `{{channel}}`, or an index in the
  middle of a path such as `{{node.output.items[0].name}}`) in an engine-resolved field goes
  out unchanged and is not recorded on a real run; a dry run shows it as `literal` in
  `template_values` (4.2).
- There is no arithmetic, no string concatenation, and no conditional inside an expression.
  `{{a + b}}` and `{{ if x }}` do not work. Compose with `transformData`, branch with
  `conditional`.
- On a `manualTrigger` workflow, whatever you pass as `input_data` to `workflow_run` /
  `workflow_test` lands flat, so reference it as `{{trigger.output.<key>}}` (the same keys are
  also under `trigger.output.payload`, unless `input_data.payload` is an object, which then
  becomes `payload`). A webhook workflow is the exception: its `input_data` is the body and
  lives only under `payload`.

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
workflow_test                            dry run while still disabled, read data.step_states
workflow_enable                          REQUIRED before a real run; refused while validate errors, see 3.3
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
    "config": {
      "requests": [
        { "url": "https://client.com/", "method": "GET" },
        { "url": "https://client.com/services", "method": "GET" }
      ],
      "concurrency": 5,
      "on_error": "continue"
    }
  }
})
```

The catalog marks `requests` `required: true` and lists `concurrency` with a placeholder of
5. Put the array in `config.requests`, one `{ url, method }` object per URL (all 40 of them).
The response carries `config_incomplete` and
`missing_required_fields` (advisory, never blocking); both should come back clean.

Important: Do not leave `requests` unset to pass the array through `input_data` at run time.
The handler does fall back to `inputContext.requests`, and that used to be this file's
parameterise-per-run pattern, but it no longer works on this rail: an unset `requests` is a
`missing_required_field` error in `workflow_validate`, `workflow_enable` refuses any workflow
with a validate error (422 `workflow_invalid`, 3.3), and a real `workflow_run` needs the
workflow enabled. `allow_incomplete: true` gets past that gate only on the operator's explicit
yes, never to make a pattern work. To run the sweep again with a different list,
`workflow_node_update` the `requests` key (3.4); every call is version-snapshotted.

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
unknown node types, missing required fields on a node the trigger reaches (custom-panel nodes
included; a `missing_required_field` issue can carry `anyOf` and a `note`), dangling edges to
non-existent nodes, duplicate ids, no trigger, and `invalid_response_schema` on an `aiAgent`.
The trigger count follows the engine's own start-node list (`TRIGGER_START_NODE_TYPES`), so
CRM, billing, email and database triggers count. Warnings: orphan nodes (not reachable from
the trigger over any edge, including a node whose only incoming edges start at nodes that
never run), a missing field on such a node (`unreachable: true`, "It never runs ... connect
it or delete it"), multiple triggers, self-loops, invalid source handles. An orphan warning
almost always means a missing edge. With no trigger in the graph, missing fields stay
errors. Fix every error before you go further: `workflow_enable` refuses a workflow while
any error remains (3.3). This call is free and catches at authoring time what would
otherwise be a runtime "Unsupported node type" or a node that fails every run.

**Step 6. Dry run, while still disabled.** See 3.3 and Part 5.

```json
workflow_test({ "workflow_id": "<uuid>", "input_data": {} })
```

Read `data.step_states.sweep`: `dry_run: true`, and `output.would_have.requests` is the list
the real run would send.

**Step 7. Enable. A real run needs it.** See 3.3.

**Step 8. Real run, on approval.**

```json
workflow_run({ "workflow_id": "<uuid>" })
```

Sync is the default and it waits for completion. For anything that may exceed roughly 25
seconds, pass `fire_and_forget: true`: you get a 202 with the run's own `run_id` and
`persisted: true`, and poll `workflow_run_get`. A 202 with `run_id: null` means the row did
not appear within 2 s: find it in `workflow_runs_list` (newest first) by matching
`started_at`, never by assuming the newest row is yours while other runs are active. A run
a guard stops before it starts (paused workflow, run quota, rate limit) comes back at once
as a 500 carrying the stopped row's `run_id`, or null when no row was written. Note the
response shape difference in 5.1 before you decide.

**Step 9. Read the per-node detail.**

```json
workflow_run_get({ "workflow_id": "<uuid>", "run_id": "<run uuid>" })
```

`step_states.sweep.output` carries the handler's real return:
`batchResults: [{ index, url, success, status, data, error? }]` and
`batchSummary: { total, completed, success, errors }`.

**Step 10. Clean up.** Part 7.

### 3.3 The disabled-workflow trap

**A disabled workflow cannot be RUN for real, but it CAN be dry-run.** The Olympus run route
rejects a disabled workflow only when `test_mode` is absent:

```
400  Workflow is disabled. Enable it first via PATCH /workflows/:id { "is_enabled": true }
```

`workflow_test` is exempt. The correct order is validate, `workflow_test` while still
disabled, read `data.step_states` (5.1), and only then `workflow_enable`.

**This section used to say the opposite**, and the order it prescribed (validate, enable,
test) was the unsafe one: enabling arms the real webhook and any cron, so a graph that had
never been tested was live for the length of the test, and anything that fired in that window
ran for real. The route was changed specifically to remove that window. A dry run touches
nothing the enabled flag guards, so there is no reason to arm a graph before testing it. If
you find another note anywhere prescribing enable-then-test, it predates this and is wrong.

Nothing a trigger fires runs a disabled workflow: not a webhook, a website visitor, a
schedule, a database change or an internal event, and not a retry of a run one of those
started (409 `workflow_disabled`). Its webhook URLs still answer each post that passes their
authentication with 200 "Workflow disabled", and the submission is recorded in the Forms
ledger and gets the usual new-submission email. A replay still runs it (reliability.md T1).

Enabling remains comparatively safe on the ad-hoc rail because of what "enabled" does and
does not do, and that is still worth understanding before you enable anything:

- A `manualTrigger`-only graph has **no listener**. There is no `workflow_triggers` row and no
  `workflow_schedules` row, so the only thing that can start it is your own `workflow_run`.
- `workflow_enable` is a PATCH that sets `is_enabled: true`. It provisions no listener on its
  own.

**The enable gate.** Turning a DISABLED workflow on runs `workflow_validate` first. Any error
(a missing required field on any node a run can reach, no trigger, an unknown node type, a
dangling edge) returns 422 `{ error: 'workflow_invalid', message, issues, summary }` and
nothing changes: fix the named nodes with `workflow_node_update` and enable again. A leftover
node no trigger connects to is only a warning and never blocks it. `allow_incomplete: true`
overrides the gate. Pass it ONLY on the operator's explicit yes, after telling them which
nodes will fail at run time, and never on your own judgment to get past a refusal.
`workflow_update({ is_enabled: true })` goes through the same gate. Re-enabling an
already-enabled workflow, or editing one that is enabled, is never refused. With warnings only
(or with the override) the 200 carries `validation { ok, errors, warnings, issues }`; read it.
Separately, a project-bound node (a coding-agent or CMS node) with no project bound is refused
with 422 `unbound_project_nodes`. `workflow_validate` reports the same nodes as
`unbound_project_node` errors, listed first, so a validate that says `ok` is one the gate
accepts.

The gate runs only on the transition. A workflow that is already on and stops being runnable
(an edit, a rules change on deploy) stays on: nothing refuses or disables it. `workflow_get`
and every `workflow_list` row carry `setup: { state, errors, first_issue }` (`ok` |
`needs_setup` | `does_nothing` | `empty`), computed from the saved definition on each read.
`workflow_get`'s `setup` (like `workflow_validate`) also carries `live_and_invalid` and a
plain `live_warning` for a switched-on workflow that is not `ok`.
`workflow_list({ needs_setup: 'true' })` lists only the ones that are not `ok`.

The gate covers turning a workflow on, not creating one on. `workflow_create` or
`workflow_clone` with `is_enabled: true`, and `workflow_create_from_template` (enabled by
default), are never refused for validation: the 201 carries `validation`, plus a
`validation_warning` when there are errors ("created ENABLED ... will make its runs fail").
Fix the named nodes or `workflow_update({ is_enabled: false })` straight away.
`workflow_provision_webhook` reports neither.

Important: Note what does provision a listener, because it is more than the obvious calls. Webhook
trigger rows are created when a `definition` is sent to PATCH (that is, via `workflow_update`),
by `workflow_provision_webhook`, by `workflow_create_from_template` (which defaults the created
workflow to enabled so the URL goes live immediately), **and by `workflow_node_add` itself**:
adding a `webhookTrigger` (or `webhook_trigger`) node creates the live `workflow_triggers` row
in the same call and returns `webhook_url`, `webhook_path` and `trigger_id` (plus
`webhook_path_note` when the minted path differs from what you sent, `webhook_trigger_warnings`,
or `webhook_trigger_error` plus `webhook_trigger_error_code` when no row resulted). Code
`webhook_path_shared` means the node you added shows the live URL of ANOTHER webhook node in
the graph (a copied node, say), so no second URL was minted and it has none of its own: send a
new label in `data.webhookPath` with `workflow_node_update` to give it one, or delete the
duplicate. Treat a `webhook_url` in a `workflow_node_add`
response as the signal that a listener now exists. Never follow it with `workflow_trigger_create`
for that node: it answers 409 "Trigger already exists for this node" with `existing_trigger_id`.

**The webhook URL belongs to the trigger row, and the server picks it.**

- A new path is `<label>-<16 random characters>`. The `webhookPath` you send (or, without one,
  the node label or trigger name) is only a LABEL: slugged, at most 40 characters, with a
  random suffix appended. There is no workflow-id prefix. Always read `webhook_url` from the
  response or from `workflow_triggers_list`; never build a URL from your label.
- The live URL is the row's `webhook_path`, which is what the receiver routes on. The node's
  `data.webhookPath` and `data.triggerId` are a mirror the server re-stamps from the row on
  every server-side definition write. Existing live URLs never change on a deploy, and forms
  wired by `workflow_bulk_provision_for_project` keep their deterministic `form-*` paths.
- A URL moves only on an explicit, one-way rename (3.4). `workflow_update` with a whole
  definition, an editor save, `workflow_version_restore` and `workflow_clone` never move a live
  URL; `workflow_update` reports a differing path as `requested_webhook_path_ignored`, plus
  `orphaned_webhook_triggers` for rows the new graph no longer references.
- The row is authoritative for auth. A definition write (`workflow_update`, an editor save,
  `workflow_node_add`, `workflow_node_update`) NEVER changes a live webhook's authentication,
  header name, username or secrets, whatever the node says. A node whose auth differs from the
  row is left as sent, and a write that changed it warns `auth_not_applied`, naming what was not
  applied, the mode the URL still enforces (secrets by their last 4 characters only) and the
  explicit call that does it. So no copy of a node, however old, can revert a rotation or a
  make-public. Auth on a live URL changes only through `workflow_trigger_update`
  (`filter_config`), `workflow_webhook_auth_set` (header auth), or the owner's **Apply
  authentication** in the editor's webhook panel; for bearer, Apply authentication (it keeps
  the URL and shows the new token once), or `workflow_trigger_delete` then
  `workflow_trigger_create({ authentication: 'bearer' })`, which returns the token once on a
  NEW URL. The node's auth is a mirror of the row that only those explicit writes stamp. Only a trigger the write CREATES takes the node's auth. The
  method (`allowed_method`) and the `hiveku_*` form keys still follow a definition write, and
  only when that write changed them against the stored definition. `authRequired` (any
  spelling) does nothing for either value (it comes back in `ignored_keys` with a warning); only
  `workflow_trigger_update` with `authentication: 'none'` or `filter_config: null` (or Apply
  authentication with None) makes a protected webhook public.
- `workflow_clone` always gets its OWN new URL. Re-point every sender at the clone's
  `webhook_url`; nothing copies the source's URL across.

Important: And the hazard that follows: **if your graph contains a `webhookTrigger` or a
`scheduledTrigger`, enabling it makes it live.** The cron lives on the node itself, which is why
`workflow_set_schedule` is described as patching the `scheduledTrigger` node in place, so a
scheduled node that already carries a cron expression starts firing the moment the workflow is
enabled. For either of those triggers, enable only when the operator has approved the automation
itself, not merely to satisfy the run gate.

### 3.4 Repairing instead of rebuilding

Same loop from step 3, with `workflow_node_update` instead of `workflow_node_add`. `data` is
**shallow-merged** into the existing data, so you can patch one key without resending the node;
set a key to `null` to clear it. Every call snapshots the prior version. Like `workflow_node_add`,
it returns `config_incomplete`, `missing_required_fields` (items can carry `anyOf` and a `note`)
and `config_hint`: advisory, never blocking, but `workflow_enable` will refuse on the same gaps
when the node is one a run can reach.

**Renaming a webhook URL is explicit and one-way.** Two calls move a live URL:
`workflow_node_update` with a CHANGED `data.webhookPath` (different from the stored node value
and from the live path or its label), or
`workflow_trigger_update({ workflow_id, trigger_id, webhook_path })`. The value is a label; the
server appends a fresh suffix and returns `webhook_url`, `previous_webhook_url`,
`webhook_path_changed` and a `warning`. The old URL answers 404 immediately, so before you
rename, list every sender and get the operator's yes: a bound form's env var (re-run
`workflow_bind_form`), GHL, Zapier, a vendor console. The rename pins the form's Forms-ledger
identity, so a bound form's submission history does not split. Renaming a
`workflow_bulk_provision_for_project` `form-*` URL and then re-running bulk provisioning creates
a duplicate workflow (the warning says so). A rename that errors may have landed too (the
proxy never re-sends `workflow_trigger_update` after a 5xx, a timeout or a dropped
connection): read `workflow_triggers_list` before you send it again. Only a 429, refused
before any work, is re-sent for you, and one that still comes back renamed nothing. What is
NOT a rename: echoing any path the node or
the row already knows never moves the URL. That covers the live path, its label or its URL
(a legacy multi-segment URL or one carrying a `/suffix` included), any stored spelling of the
node's path (`data.webhookPath`, `data.config.webhookPath`, `data.webhookUrl`), a
server-assigned path that is no longer live, and any path the row was renamed away from (the
row records the last 10). Those
re-stamp the node to the live path with warning `webhook_path_was_not_live`, whose message
names what matched; to move the URL to one of them on purpose, use
`workflow_trigger_update({ webhook_path })`. Null or `''` never removes a URL (warning
`webhook_path_cannot_be_cleared`). 409 `webhook_path_taken`, and 409 `webhook_path_conflict`
when a concurrent rename won, changed nothing and carry `current_webhook_url` (the path that
won); 400 `invalid_webhook_path` / `not_a_webhook_trigger` likewise.

**Rotating a URL in place.** Echoing the current label is a no-op, so re-minting a leaked or
guessable URL under the label it already has is its own flag:
`workflow_trigger_update({ workflow_id, trigger_id, rotate_webhook_path: true })`. A minted
`<label>-<16 random>` path keeps its label and gets a new suffix; any older shape takes the
trigger's name as its label. It is exactly as one-way as a rename (the old URL answers 404 at
once, nothing routes the previous path) and returns the same fields, with a `warning` that
says a rotation is one-way; so it needs the same sender list and the same explicit yes.
Send a rotation once. Every rotation mints a new URL and kills the last one, and the proxy
never re-sends `workflow_trigger_update` on its own after a 5xx, a timeout or a dropped
connection, so after one of those the rotation may have landed: read `workflow_triggers_list`
(the row's `webhook_url`) before anything else, and rotate again only if that URL itself must
be replaced. A 429 is refused before any work, so the proxy re-sends that one for you (3
attempts in all), and a 429 that still comes back rotated nothing.
Never send it with `webhook_path` (400 `rotate_and_path_conflict`); it must be a boolean
(400 `invalid_rotate_webhook_path`); a scheduled or database row answers 400
`not_a_webhook_trigger`; and 409 `webhook_path_conflict` means another rename moved the URL
after this call read it (`current_webhook_url` is the live one; nothing changed). Rotating a
`form-*` URL has the same bulk-provision duplicate caveat as a rename.
`workflow_trigger_get`, `workflow_triggers_list` and a webhook `workflow_trigger_update`
response carry `webhook_path_strength`, read from the path's shape: `minted` (80-bit random
suffix), `form` (a bulk-provisioned form path, which ships in the public site bundle anyway),
`legacy_random` (an older random token), `guessable` (`<workflow-prefix>-<node id>`, a word
taken verbatim, or any shape it cannot vouch for), and null on a non-webhook row. Nothing
rotates on its own: `guessable` on a live, public URL is a reason to PROPOSE a rotation,
with its senders, and rotate only on the operator's yes.

The row stays authoritative for auth on this call too: `workflow_node_update` never changes a
live webhook's authentication or secrets. Sending `authentication`, a header name or a secret in
`data` updates only the node, and the response's `webhook_trigger_warnings` carries
`auth_not_applied` with the explicit call to make instead (`workflow_trigger_update` with
`filter_config`, `workflow_webhook_auth_set`, or Apply authentication in the editor). Of the
other row keys it merges only the ones it SENT that differ from the stored node (the method, a
`hiveku_*` key), so a label-only or position-only update never touches the row. Its response
(and `workflow_node_add`'s) is redacted like `workflow_get`: secrets read `'[redacted]'`. Sending that marker back is safe.
In `workflow_node_update`, `workflow_update` and an editor save, an incoming `'[redacted]'`
takes the value stored at the same node and key path; when nothing usable is stored there the
key is dropped with a warning (`warnings[]`), and `workflow_node_add` always drops it with a
warning. The marker is never written into a definition. A trigger ROW whose stored secret is
the literal `'[redacted]'` counts as having no secret: the receiver answers 403, a
`workflow_trigger_update` that would keep it gets 400 `auth_secret_missing`, and reads no
longer show the key at all. Put a real secret on with `workflow_webhook_auth_set`.

**Credential URLs are hidden the same way.** An outbound webhook URL whose path or query IS the
secret has no secret key name to hide it by: a Slack, Discord, Teams or Power Automate, Zapier,
Google Chat, Make, IFTTT, Pipedream or Pabbly webhook URL, and any URL carrying a
`user:password@`. Every definition read (`workflow_get`, `workflow_version_get`, a trigger's
`filter_config`, and the responses of the create, clone, update and node calls) and a test's
report show the WHOLE string holding one as `'[redacted]'`, even when the URL sits inside
longer text (an `executeCode` body), and a Slack, Discord or Teams notify node's literal
`webhookUrl` is hidden whatever its host. The one exception in a test's report is its
`error`, where just the URL is replaced and the rest of the message stays readable. Run reads
(`workflow_run_get`, `workflow_runs_list`, `workflow_runs_recent`, `workflow_run_summary`,
`workflow_run_logs`, `workflow_dead_letters_list`, `workflow_stranded_list` and
`workflow_resume`), a trigger's `last_test_data`, the workflow's `name` and `description`
(wherever a read returns them, `workflow_resolve_short_id` and `workflow_dashboard_url`
included), a notice's `title` and `body` in `agent_inbox_list`, and `audit_query` replace just
the URL, where it sits.
Hiveku's own inbound webhook URL (`webhook_url`) is never hidden, and the owner's editor still
shows every value.

- Send `'[redacted]'` back unchanged to keep the stored value (the restore above). Never try to
  copy a credential out of a read, into another workflow or anywhere else: there is nothing to
  copy, and a new workflow or node that carries the marker is saved without that key, with a
  warning.
- To reuse a hook, `workflow_clone` the workflow: a clone copies every hidden value exactly as
  stored, and `overrides` never change one (`warnings[]` says so, once). Set a new one with
  `workflow_node_update` on the copy. Or the owner puts the URL in an environment variable
  (Environment Variables in the editor's gear menu) and the node references `{{env.NAME}}`.
- Changing a node's `type` in the same write leaves out an echoed `'[redacted]'` whose stored
  value the new type would show, and `warnings[]` names the key: send the value itself to keep
  it. With `workflow_node_update` the stored value is left out even when the call sends no
  `data`: only a value you send yourself in the same call survives the retype. A
  `workflow_validate` draft that changes a type leaves it out too, but neither counts it in
  `redaction.restored` nor lists it in `redaction.dropped`; only the real write's `warnings[]`
  names it.
- A stored `'[redacted]'` in a required field counts as missing: on a node a run can reach,
  `setup` reads `needs_setup`, validate names the field, and the enable gate refuses. Anywhere
  else in a node it is a `redacted_placeholder` warning.
- A `name` or `description` sent back exactly as read keeps its stored text. An edited one that
  still holds `'[redacted]'` is saved as sent, with a warning.

`workflow_node_delete` cascades: every edge whose source or target is that node is removed too,
and the response lists the removed edge ids. `workflow_edge_delete` removes one edge and leaves
nodes alone. Deleting a webhook trigger node (or changing its type away from webhook) DISARMS
its trigger row rather than deleting it: the response carries `disarmed_webhook_trigger`, and
the URL keeps answering 200 "Trigger disabled" and recording submissions but runs nothing.
Re-arm it with `workflow_trigger_update({ workflow_id, trigger_id, is_enabled: true })` or
remove it with `workflow_trigger_delete`. A row that belongs to a DIFFERENT webhook node still
in the graph is never disarmed, and neither is a row whose context does not name the removed
node when a remaining webhook node links to it or shows its URL (two nodes sharing one legacy
URL): `webhook_trigger_warnings` says it "was NOT disabled: it belongs to webhook node X", and
that URL keeps running.

### 3.5 Versions are your undo

Every definition write, including each granular node and edge operation, snapshots to
`workflow_versions`. `workflow_versions_list({ workflow_id })` gives `version` (a monotonic
int), `change_summary`, and `created_at`, without the definition. `workflow_version_get({
workflow_id, version })` fetches one in full. `workflow_version_restore({ workflow_id, version
})` rolls back, snapshotting the current state first so the restore is itself reversible.

`version` is the integer, not a row uuid. Passing a uuid fails.

A restore brings back the graph, not the workflow's flags: `definition.settings` (today
`notify_on_failure`) is the snapshot's merged under the CURRENT one, so the current flags
win, a flag only the snapshot has comes back, and a restore can never switch failure alerts
off. The dashboard's rollback works the same way. The owner's failure-alerts switch in the
editor's gear menu records a version of its own ("Failure alerts on" / "Failure alerts off"),
which changes no graph and so never moves `definition_changed_at`;
`workflow_update({ settings })` without a `definition` records none.

A restore rolls back the graph, not the live URL: live trigger rows are kept, a snapshot node
whose `triggerId` is missing or stale (not one of this workflow's rows) takes the row the same
node has in the current definition, whether that node is bound by `triggerId` or by its path
alone, and the webhook node is re-stamped with the current path. Linked rows' auth is not
re-synced from the old node, so restoring a snapshot from before an auth change never changes
the webhook's auth. A node left with no trigger (its row was deleted since, or its live URL
belongs to another node in the restored graph) gets a NEW URL (`<label>-<random>`), never the
snapshot's old path: `webhook_trigger_warnings` carries a "NEW URL" note per created row, which
says "no longer existed" only when the current node really had no live trigger (re-point every
sender at the new URL), and otherwise that the earlier URL is still live and unchanged
(re-point senders only if this node should receive them). A restored node whose row is
disabled stays disabled (`disabled_webhook_triggers`); re-arm it with `workflow_trigger_update({ is_enabled: true })`.

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

**A test run covers the whole graph.** It does not stop at the first simulated node:
side-effecting nodes are simulated, pure nodes run for real on what the mocks hand them, and
the response reports every node (5.1). A dry run never parks at a wait node, never emails
approvers and never resumes for real; a `delay` validates its duration and does not sleep; and
a test run never moves the circuit breaker's failure counter or writes a CRM "Entered via
automation" touch. Code the graph runs (a `transformData` custom transform, a `validateData`
custom rule, a `waitUntil` expression) still executes, but it never reaches the network. Its
`fetch` gets a synthetic 200 `{}` with header `x-hiveku-dry-run: 1`, and the step carries a
warning "test run: fetch METHOD URL was not sent ...". Every other way out throws "... is
blocked: network access is disabled in test runs" (`error.code` `HIVEKU_DRY_RUN_NETWORK`):
loading `http`, `https`, `net`, `tls`, `dns`, `child_process`, `worker_threads` and the other
network modules (by `require`, `import()` or `process.getBuiltinModule`), `new WebSocket`,
`new EventSource`, a raw socket. The step warns "test run: <what> was blocked (network access
is disabled in test runs; the code got an error)", and an attempt the code does not catch fails
the step. Real runs are unchanged. Before the 2026-09 fix a test run
stopped at the first simulated node, so an older "passing" test proved nothing past that node.
Re-run it.

**The trigger a test sees is the one real traffic sends.** On a webhook-trigger workflow
(`webhookTrigger` and its aliases) `input_data` is the request BODY: the test builds the
envelope a real delivery gets, `{ payload, headers, query, method, timestamp }`, with
`input_data` (or `input_data.payload`, when that is an object) as `payload`, lowercase key
aliases added, `input_data.headers` / `query` / `method` optional, and nothing copied to the
top level. `trigger_data` lands under `trigger.output.triggerData` only. So
`{{trigger.output.email}}` misses in a test exactly as it misses on a real delivery. Every
other start type keeps the flat shape (2.6). `trigger.output.timestamp` is the test's start
time.

**A node that cannot run fails the test.** The mock is only for a side-effecting node that
would have reached its side effect. One whose required config is missing (the completeness
check `workflow_validate` uses), or whose required field is a `{{...}}` that resolved to
nothing in this test, fails with the error the real handler gives (`Slack webhook URL is
required`, `Missing required 'to' email address. ...`, otherwise `<label>: <key> is
required`): step `status: 'error'` with that `error`, and the run fails with it. With
`on_error: 'continue'` it is the real soft-fail instead (`completed`, `degraded`,
`original_error`). A value the test cannot know keeps the mock: a field fed by a simulated
upstream node, or an `{{env.*}}` value (an MCP test never loads the environment). A test
that went green before this on a node with a missing field proved nothing about that node.

### 4.2 The mock shape, and `template_values`

Every short-circuited node returns:

```json
{
  "__dry_run": true,
  "action": "<nodeType>",
  "would_have": {
    "...": "the resolved config it would have sent",
    "_template": { "...": "only the raw leaves whose resolved value differs" }
  },
  "id": "dry-run-<nodeId>-<timestamp>",
  "mock_note": "test_mode=true ... no real side effect was fired ..."
}
```

The engine gate runs before the handler for every type in the side-effecting set, at every
dispatch site, so every simulated node gets this generic mock; a handler's own richer dry-run
branch never runs for those types. The only synthetic field is `id`, so a downstream
`{{node.output.id}}` resolves to something traceable. There is no fake `messageId` or
`contact_id`.

`would_have` is the resolved config (`data.config` when that is an object, otherwise all of
`data`), resolved by the SAME resolver the real run uses, `||` defaults included. It keeps its
structure: a string leaf over 4000 characters keeps its first 3000 and last 800 around a
`…[N chars elided]…` marker, an array over 50 items keeps its first 45 and last 5, and the
snapshot has a 12,000-character budget (a tighter 800-character-per-leaf pass runs when the
first is over). `_template` is sparse. The old whole-object marker
`{ _truncated, _bytes, _preview, _keys }` appears only for a pathological config.

Credentials never come back through a test. `would_have`, `_template` and each
`template_values[].value` show credential-keyed values (an `Authorization` or `x-api-key`
header, `apiKey`, `password`, `secret`, the same key list `workflow_get` hides) and every
credential URL (3.4: a Slack or Zapier webhook URL, say, even one a `{{token}}` resolved to)
as `'[redacted]'`, env secret values are replaced with `•••` before any cap, and the same
redaction runs over `step_states` (each step on its own, so a node whose id looks like a
credential key, `authorization` say, keeps its `status`, `dry_run` and `node_type`) and
`output`, so a pure node's output reads `'[redacted]'` there too. A Date shows as its ISO
string and a Decimal as its text.

Trust the STEP's `dry_run` flag in the report, not `__dry_run` in an output: a pure node
downstream of a mock returns its input context, so it inherits `__dry_run` and `would_have`
without having been simulated. The step's `dry_run` is true exactly when its output is a
simulation mock.

**`template_values` is the check to read first.** Each simulated node's step lists every
`{{token}}` in its config (up to 50; `template_values_omitted` counts the rest) as
`{ field, template, source_node_id, path, resolver, status, has_default?, value,
value_chars?, hint? }`. `hint` appears when the token's `||` default reads like another
reference (`{{a || trigger.output.payload.name}}`): it says the default is sent as that text,
not looked up (2.6). It is advice only; `status` and `value` are unchanged.

| `status` | Meaning |
|---|---|
| `resolved` | had a value; `value` shows it (long values keep head and tail) |
| `empty` | the reference exists but is blank or null, and no `||` default was set. This is the "Hi ," case, and it is NOT a miss, so `unresolved_templates` does not list it. A `||` default covers it |
| `default` | a `||` default supplied the value |
| `missed` | resolved to nothing with no default; also in `unresolved_templates` |
| `literal` | the token text goes out unchanged (a malformed single-pipe or `or` fallback, or a token the engine grammar cannot parse) |
| `upstream_simulated` | the source node was simulated in this test, so its real value is unknown. Expected in a dry run |
| `not_evaluated` | the dry run cannot evaluate it: templating the handler does itself, or an `{{env.NAME}}` in an MCP test run, which never loads the environment |

`{{env.*}}` values read `[redacted]` when they are evaluated.

**Read `template_values` and `would_have` before you enable anything.** They are where you
catch the wrong recipient, the `{{...}}` that resolved to an empty string, and the CRM payload
with a blank email.

### 4.3 What a dry run does NOT protect you from

The dry-run net is a set of node types, `SIDE_EFFECTING_NODE_TYPES`. Read-shaped nodes are
excluded on purpose, with the reasoning stated in source: dry-running a read makes the test
less useful and costs nothing to run for real. Every read outside the set runs for real inside
a `workflow_test` (a `webflowCmsItemGet`, a CRM lookup), and because a test now runs the whole
graph it reaches reads it never used to. The ones worth knowing:

| Node type | What a "dry run" actually does |
|---|---|
| `keywordResearch` | returns placeholder data: one idea per seed keyword (the seed itself, `search_volume` / `keyword_difficulty` / `cpc` null, `competition: 'UNKNOWN'`, `placeholder: true`), `totalFound` = the seed count up to `limit`. DataForSEO is not called and nothing is spent |
| `rankTracker` | returns placeholder data; no DataForSEO call, no spend |
| `domainAnalysis` | returns placeholder data; no DataForSEO call, no spend |
| `serpAnalysis` | returns placeholder data; no DataForSEO call, no spend |
| `seoGetAudit` | reads the stored audit row (the route's `{ data: {...} }` shape plus `refreshed: false` and `test_mode_note`); no refresh, no write. A simulated `seoStartAudit` is the engine's generic mock, which has no `task_id`: `{{start.task_id}}` reads empty and gets a placeholder with `data.status: 'queued'`, `data.task_id: null` and `audit_unresolved: true`; a misspelled `{{start.task_idd}}` fails "auditId is required"; `{{start.id}}` (the mock's own id) and an unknown literal id fail "Audit not found" (404) |
| `kbSearch` | real vector search |
| `delay` | validates the duration, does not wait |

The research placeholders carry the node's documented output keys and a note saying they are
not real research, so downstream templates resolve but the numbers mean nothing (metrics are
null, never 0). The four research nodes relax one check in a test only: a required input that
is empty ONLY because its template reads a simulated node (or a pure node downstream of one)
gets the placeholder flagged `<input>_unresolved: true` (`keyword_unresolved`,
`domain_unresolved`, `keywords_unresolved`) instead of "Keyword and domain are required". The
note says only that the test could not check that input; a real run fails if it is empty there
too. The excuse holds only for a path the source can really output: when the source is
`keywordResearch`, `rankTracker`, `domainAnalysis`, `serpAnalysis` or `seoStartAudit`, the path
is checked against that node's real output (`keywordResults.ideas[].keyword`,
`rankingResult.rank`, `serpResults.organicResults[].title`, `task_id` and so on), so a
misspelled key (`keywordResult`, `idea`, `organicResults[0].titel`), an index on a field that
is not a list, or a single-pipe / `or` fallback fails the test with the real run's error. An
index past the end of a placeholder list (`ideas[5]`) and a documented field the placeholder
leaves null are still excused. A source of unknown shape (the generic mock of another
simulated type, or a pure node downstream of one) is still excused for any path. A literally
empty field or a miss on trigger data still fails the test, as it would fail the real run.

**`aiAgent` left this table on 2026-08-30.** It used to run the model for real during a dry
run, burning tokens and firing any delegate sub-agents, and because an agent turn can call
its own tools it could also WRITE from a run whose whole purpose was to prove nothing would
be written. It and the six sub-agent role nodes (`blogWriter`, `seoSpecialist`, `socialMedia`,
`dataAnalyst`, `contentCurator`, `videoCreator`) are now in `SIDE_EFFECTING_NODE_TYPES`, so a
dry run returns a `would_have` instead of generated copy. The trade is deliberate: judging the
copy needs a real run, on approval.

The same day closed the other hole in this section: a side-effecting node inside a
`parallelExecute` branch or a `transactionBlock` used to reach its real handler, because the
gate lived in the main dispatch loop only and those two run their own inline chains. A graph
defeated the dry run purely by having a fan-out shape. The gate now runs at all three dispatch
sites, so the mocking described here holds regardless of graph shape.

For contrast, these ARE mocked: `seoStartAudit`, `kbIndexText`, `generateImage`,
`generateImageSet`, `generateVideo`, `designExportImage`, `designExportMp4`, `webSearch`,
`webScrape`, `webCrawl`, `webExtract`, `webMap`, every `ppc*` write, every social write, every
`accounting*` write, every Supabase write, `checkpointCreate`, `integrationTest`, and every
Mission Control write including `mcIntakeClassify`. `mcIntakeClassify` is worth calling out
because it reads like a read: it is in `SIDE_EFFECTING_NODE_TYPES` alongside `mcTaskCreate`,
`mcTaskUpdate`, `mcTaskTransition` and `mcTaskComment`, so the dispatcher short-circuits it
before the handler and returns `genericDryRunOutputForNode`. A dry run does not run the LLM
router and does not cost a completion. A real run does.

`waitUntil` (and every other wait node) is a separate case. The suspend path that parks a run
in `workflow_pending_waits` never runs for a dry-run node: the step records `waiting` and the
test continues downstream, so a wait never
parks a test, never emails an approver, and never resumes into a real run. What happens after
a real wait is therefore visible in a test, but the wait itself is not exercised.

Important: And the caveat to state out loud whenever you report a passing dry run: downstream nodes
that reference `{{nodeId.output.X}}` see the `would_have` payload or the synthetic `id`, not
what a real send returns. **Structural correctness is testable. Real delivery is not.** "The
dry run passed" is not "the email will arrive".

---

## Part 5: Reading results

### 5.1 A dry run's evidence is in its own response

`test_mode` writes **no** `automation_workflow_runs` row, so the response comes back with
`run_id: null` and `persisted: false`, and **`workflow_run_get`, `workflow_run_logs` and
`workflow_runs_list` have nothing to fetch afterwards.** The per-node evidence comes back in the
`workflow_test` (or `workflow_run({ test_mode: true })`) response instead. A test run is always
synchronous: `fire_and_forget` is ignored for it and the response carries a `note` saying so. A
failing test is still HTTP 500, with the same body.

```
data = {
  run_id: null, persisted: false, test_mode: true, mode: 'sync',
  status, started_at, completed_at, error,
  output,                 // the terminal node's output (several: { output_<nodeId>: ... })
  terminal_node_ids, execution_order,
  step_states: { <nodeId>: { node_type, node_label, status, dry_run,
                             output?, output_omitted?, unresolved_templates,
                             template_values?, template_values_omitted?, warnings?,
                             error?, degraded?, original_error?, duration_ms?,
                             branch_taken?, in_parallel_branch?, in_transaction?,
                             skipped_reason? } },
  not_reached: [{ node_id, node_type, label }],
  unresolved_template_count, unresolved_template_simulated_count,
  unresolved_templates,   // flat across nodes, capped at 100
  report_truncated?,      // { budget_bytes, compacted_node_ids }
  note?
}
```

How to read it:

- **`data.step_states[<nodeId>]` is the evidence for every node.** For a simulated node
  (`dry_run: true`) read `output.would_have` and `template_values` (4.2); for a pure node,
  `output` is what it really produced, capped at 4 KB. `unresolved_templates` is always an
  array, `[]` meaning checked and clean. There is no `input` key. A simulated node with
  `status: 'error'` did not get the mock: a required value was missing or resolved to
  nothing, and `error` is the real handler's message (4.1). Fix that field before you read
  anything downstream of it.
- **`not_reached` lists nodes the run never got to**: an untaken branch, or everything
  downstream of a failure. A node you expected to run that appears here is a wiring problem.
  Dry-run each branch with input that should take it, and check the untaken one is listed.
- **`execution_order` is authoritative** for order; JSON reorders integer-like keys in
  `step_states`.
- **`output` is the terminal output**: the output of each completed node none of whose
  successors ran (several become `{ "output_<nodeId>": <output>, ... }`). It is no longer the
  only view, so never make a node terminal just to see it.
- `report_truncated` means the report hit its 64 KB budget: `would_have` on the latest nodes was
  compacted first, then `template_values` (counted in `template_values_omitted`), then outputs
  (`output_omitted`). `status`, `dry_run`, `error` and `unresolved_templates` are never dropped.
- `data.status` on the response is `completed` or `error`. The persisted run **row** uses
  `failed`, not `error`. Do not filter runs by `error`; see 5.3.

A REAL sync `workflow_run` returns its own `run_id` (the run the engine wrote),
`persisted: true`, `output`, and the run's `unresolved_template_count` and flat
`unresolved_templates`. Full `step_states` with `input` then come from `workflow_run_get`.
Sequence the two deliberately: dry run to prove the shape, then a real run once the operator
has said yes, then read `step_states`.

Three real-run answers are not "done". A run that parks on a wait or approval node answers
HTTP 202 with `status: 'waiting'`, its `run_id`, `persisted: true`, `completed_at: null`,
`waiting_on_node_id` and a note: it is saved and NOT finished. Poll it with
`workflow_run_get` or resolve the wait; never re-run it, which would repeat every step before
the wait (a wait that could not be saved is a 500 that still carries `run_id`). A rate-limit
or cascade stop returns the stopped row's `run_id` with `status: 'error'`. A paused workflow or
an exhausted run quota writes no row: `run_id: null`, `persisted: false`.

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
| `warnings` | non-fatal notes from the node, e.g. keys an `aiAgent` `responseSchema` stripped |
| `degraded`, `original_error`, `on_error_mode` | present when `on_error: 'continue'` soft-failed the node |
| `waiting_for` | present when the run parked on a wait node |
| `uiData` | editor feedback payload |

**`unresolved_templates` is the blank-merge detector.** Every `{{...}}` that resolved to
nothing during that node's config resolution, with no `||` default, is recorded there as
`{ template, source_node_id, path, coerced_to, hint?, source_simulated? }`. `coerced_to` is
what went out: `empty_string` (blanked inside text), `null` (a whole-field reference), or
`literal` (the token text sent unchanged, which is what a malformed `{{ref | x}}` /
`{{ref or x}}` does in an engine-resolved field; `hint` says to write `||`). Coverage includes
nodes that threw or timed out, waiting nodes, nodes inside `transactionBlock` /
`parallelExecute`, JSON-body misses (`apiCall` / `respond`), and every simulated node in a test
run. Entries are deduped, at most 20 per node. `source_simulated: true` means the source node
was simulated in a test run, so that miss is expected there. A reference that EXISTS but is
blank is not a miss and is not listed; a dry run's `template_values` shows it as `empty`.

`workflow_run_get` returns `unresolved_templates_recorded`, which says how far to trust that:

- `true`: every step was checked and carries the key, `[]` meaning checked, nothing missed.
- `'partial'`: the run started after 2026-08-08T17:36:39Z, but some step was written by the
  older engine, which did not check `parallelExecute` / `transactionBlock` inner steps,
  simulated or waiting steps, or handlers that threw or timed out. Only checked steps carry the
  key; an unchecked step has none.
- `false`: the run started before 2026-08-08T17:36:39Z. Absence proves nothing.

It also returns `unresolved_template_count`, `unresolved_template_simulated_count` and
`unresolved_template_nodes`, so read the count before walking every step. The count is exact
on a `true` run, a lower bound on a `'partial'` run (null when that bound is 0), and null on a
`false` one, so a 0 always means checked, none. Every step the current engine writes carries a
boolean `dry_run`; that is how coverage is read per step. This is the difference between an email that went out with
"Hi ," and an hour of guessing. Read it on every green run before you call the workflow
correct: a run can be `completed`, look perfect, and still have sent blanks.

It also answers "is this run still about the workflow as it is now?":
`predates_current_definition` is `true` when the run started before the latest
`workflow_versions` row that changed the graph (`definition_changed_at`; an edit or a restore;
turning failure alerts on or off does not count), and `current_setup` is `{ state, errors,
first_issue }` for the definition as it is NOW. A failed run that predates the last change may already be fixed:
read `current_setup`, then `workflow_test`, before you report its error as today's.

### 5.3 The rest of the run tools

| Tool | Use it for |
|---|---|
| `workflow_run_logs({ workflow_id, run_id, node_id?, level? })` | the per-node lifecycle timeline: config, starting, handler invoked, retry, timeout, completion, soft-fail, and a `warn` line "N merge variable(s) resolved to nothing: ..." on a node that missed. Complements `step_states` by showing WHAT happened, not just the final state. `level` filters info / warn / error. Capped at 50 lines per node |
| `workflow_runs_list({ workflow_id, status?, page?, limit? })` | this workflow's recent runs, each with `unresolved_templates_recorded` (`true` / `'partial'` / `false`) and `unresolved_template_count` under the same rules as 5.2 (also null when the count query failed) |
| `workflow_runs_recent({ status?, since?, workflow_ids?, limit? })` | account-wide feed across ALL workflows, default window one hour. Use it BEFORE `workflow_runs_list` when you do not yet know which workflow broke |
| `workflow_run_summary({ workflow_id, since? })` | counts by status, `success_rate`, latency p50/p95/p99/mean, up to 5 recent failures, `last_failed_run_id` to drill into. Caps at 1000 runs in the window. Also `template_misses`: `{ runs_checked, runs_partially_checked, runs_with_misses, total_misses, last_run_id_with_misses, last_run_with_misses_at, nodes (top 5), since, limit }` over the latest 200 recorded runs, excluding expected dry-run misses. `runs_checked` counts runs whose every step was checked, `runs_partially_checked` the rest; the miss counts include both. Null only when that stats query failed, which is unknown, not clean. Each recent failure carries `predates_current_definition` (plus `last_failed_run_predates_current_definition`, `definition_changed_at` and `current_setup`, as in 5.2) |
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
workflow was probably paused. Hiveku pauses a workflow when its circuit breaker trips (five
failed runs in a row, counting only runs a schedule, a database change, an internal event
or a retry of one of those started: webhook and website-visitor failures never pause it,
retried or not), when it detects a
cascade loop, or when the daily AI budget runs out, and an owner can pause one by hand.
**While paused a webhook KEEPS ACCEPTING deliveries**: the
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
`webhookTrigger` (inbound HTTP; it enforces the method and the auth mode only: only POST runs
the workflow, another configured verb answers 405, and there is no response-mode, CORS or
rate-limit setting; see 3.3 for the URL rules),
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
`voiceGetCallDetail`, `voiceListNumbers`, `voiceExtensionStatus`. The direct-tool rail for
everything phone/SMS (sends, caps, opt-outs, 10DLC readiness, the STOP-suppression trigger
trap) is the **hiveku-phone-agency** skill - load it before wiring an `sms` or voice node.

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
`pmProjectTrigger`, `pmTaskCreatedTrigger`, `pmTaskUpdatedTrigger`. The task steps keep to the
workflow's own account and its team. `assignToId` is resolved like any other field (a
`{{template}}` included) and then checked the way the PM tools check an assignee: someone who is
not a team member (team members are the ids `crm_list_users` returns; on a shared project,
members of an account it is shared with count too) fails `createTask`, `createSubtask` or
`updateTask` (there, only when it moves the task to someone new) with "Could not assign the
task: That person is not a team member of this account...", and nothing is written. A value
that resolves to something that is not a UUID (a name, an email, an agent label) fails those
steps with "Could not assign the task: assigned_to_id must be a UUID
(public_users.id)", and nothing is written. A
`projectId` or `taskId` from another account fails with "... not found in this account", and
`getTasks` lists only the workflow's own account (it fails on a run with no account). A dry run
never catches the assignee refusal: `workflow_test` simulates `createTask`, `createSubtask`,
`updateTask` and `completeTask`, so only a real run fails. Before enabling, check every literal
`assignToId` against `crm_list_users`, and trace a templated one to where its value comes from;
when the person is not listed, leave `assignToId` empty. Mission Control (the
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

**Site triggers**: `formSubmittedTrigger` (a form on a managed website, and a form on a
connected Webflow site: filter `source: webflow`), `websiteVisitorTrigger` and
`visitor_event_trigger` (page view, form view, session start), `deployTrigger` (fires when
a deployment completes, per environment), `databaseTrigger` (any change in a watched table
of a connected project database), `dbInsertTrigger`, `dbUpdateTrigger`, `dbDeleteTrigger`,
`dbRowChange` (each requires `tableName` in the one object the trigger readers pick, see 2.5;
a `table` key is read by nothing); and the `webflow*Trigger` family for a site connected to Hiveku:
`webflowSitePublishedTrigger`, `webflowCmsItemTrigger` (umbrella) with the per-event
`webflowCmsItem{Created,Changed,Deleted,Published,Unpublished}Trigger`,
`webflowPage{Created,Deleted,MetadataUpdated}Trigger`, `webflowCommentCreatedTrigger`,
`webflowFormSubmissionTrigger` (the form trigger narrowed to Webflow, filters `site_id`
and `form_name`) and `webflowEventTrigger` (catch-all with a `trigger_types` filter).
Hiveku registers the receiver on connect, so none of these needs a webhook of yours, and a
write the workflow makes to the same item, page or site does not re-fire it (3-minute
self-write window).

**Webflow actions** (category `webflow`; `workflow_node_types_list` filtered to that category
is the live list): 16 featured nodes with pickers (CMS item create / update / query / get /
publish / unpublish / delete, page list, page metadata update, page schema set, asset
upload, the analytics snippet install, llms.txt set, site publish, form submission get,
collection list) plus 94 generated ones, one per Webflow ops action across 22 families
(assets, CMS items, schema, pages, page SEO, page content, components, custom code,
Google Tag, forms, webhooks, comments, ecommerce, redirects, robots, well-known, llms.txt,
site, token, activity). A generated node's snake_case id equals the `webflow_<action>`
tool name and takes the same args, so the tool's schema is the node's schema. Rules the
handlers enforce: config lives in `data.config`; `project_id` / `site_id` resolve config,
then the adjacent trigger's output, then the account's bound site; every write lands
STAGED on Webflow (`publish_required: true` in the output) and reaches the live site
only through `webflowSitePublish`, which is explicit-only, needs `confirm: true` (a
`requiredTrue` checkbox on it and on the 18 other confirm-gated nodes - deletes, order
moves, robots replace, webhook update and delete), and is allowed one publish per minute
per site (`wait_for_cooldown` waits out a `publish_cooldown` once). `webflowCmsItemPublish`
makes items live by id without a site publish, so never chain it into
`webflowSitePublish`. Past ~50 item writes a minute use the `*_bulk` nodes; a `forEach`
over the single-item node shares the connection's 60-a-minute budget with every agent.

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
`workflow_trigger_get`, `workflow_trigger_create`, `workflow_trigger_update` (takes
`filter_config`, merged on a webhook row; `webhook_path` renames a live URL, see 3.4; it
prompts at the permission layer, like `workflow_enable`), `workflow_trigger_delete`.

**Run and read**: `workflow_run`, `workflow_test`, `workflow_run_get`, `workflow_run_status`,
`workflow_run_logs`, `workflow_runs_list`, `workflow_runs_recent`, `workflow_run_summary`.

**Recovery**: `workflow_versions_list`, `workflow_version_get`, `workflow_version_restore`,
`workflow_resume`, `workflow_stranded_list`, `workflow_stranded_replay`.

**Context and persistence around the rail**: `account_context_get({ domain: 'workflow' })`,
`talk_to_department({ domain: 'workflow', message })`, `memory_list`, `memory_create`,
`pm_tasks_create`, `pm_tasks_complete`, `hiveku_docs_search`, `hiveku_docs_get`.
