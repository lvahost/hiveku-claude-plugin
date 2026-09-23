/**
 * The automation doctrine must describe what the workflow engine does.
 *
 * The 2026-09-22 Forney program (Locus Digital's report) found the prose and
 * the engine apart in ways that each read fine and each cost a session:
 *
 *   - three references taught `workflow_trigger_update({ config: ... })` as the
 *     fix for a 401 form webhook. The tool forwards `filter_config` only, so the
 *     documented repair sent nothing;
 *   - "an unresolved {{...}} is written through as the LITERAL string" was false
 *     for every well-formed reference: a miss is a blank ('' in text, null as a
 *     whole field), recorded in unresolved_templates;
 *   - the `||` bullet did not say what counts as a miss, and most action nodes
 *     and every dry run ignored the default until the engine fix;
 *   - the dry-run evidence was "data.output, make the node terminal", and two
 *     references told the agent to call workflow_run_get after a test, which
 *     has no run row to fetch. A test now returns data.step_states per node;
 *   - the canonical slackNotification example had no webhookUrl, the one field
 *     every run of that node fails without.
 *
 * The review-fix wave then changed contracts the prose had already stated:
 * workflow_trigger_update became ask-gated (a rename kills a URL, a
 * make-public drops a credential), a restored webhook node whose trigger was
 * deleted gets a NEW URL instead of its old path, no API call issues a bearer
 * token for an existing URL, and template-miss coverage became
 * true | 'partial' | false.
 *
 * The second fix wave (builder 635510ca0) replaced the "a definition write
 * applies an auth key only when it changed it (auth_changed)" rule: an editor
 * tab open before a make-public, or an agent's earlier workflow_get copy of a
 * bearer webhook, still looked like a deliberate change and reverted it. Now
 * workflow_update, editor saves, workflow_node_add and workflow_node_update
 * NEVER change a live webhook's auth or secrets; they warn auth_not_applied
 * and name the explicit writes (workflow_trigger_update filter_config,
 * workflow_webhook_auth_set, the editor's Apply authentication; for bearer,
 * Apply or workflow_trigger_delete + workflow_trigger_create on a NEW URL).
 *
 * Forney round 2 (2026-09-23) changed what the prose had stated again:
 *   - a run's failure now depends on where the run started. Webhook and
 *     website-visitor failures alert and count but NEVER auto-pause; schedule,
 *     database, internal-event and retry runs still pause at 5; a run a person
 *     or an agent started (workflow_run, workflow_test, a replay) never alerts,
 *     counts or pauses. "Five consecutive failures auto-pause a workflow" was
 *     no longer true of the lead forms it was written about;
 *   - notify_on_failure now covers webhook and visitor runs (they were stored
 *     as 'manual' and never alerted), survives dashboard saves and restores,
 *     and has an editor switch;
 *   - `||` stays literal, and the contract paragraph (with the
 *     fallback_default_is_literal lint) replaced the one-line rule;
 *   - trigger.output.timestamp is on every run, workflow_test builds a
 *     webhook's real envelope, and a node missing required config fails the
 *     test instead of being mocked;
 *   - a failed run can predate the last change (predates_current_definition),
 *     workflow_list carries a setup verdict, and a guessable live webhook URL
 *     is a rotation to PROPOSE, never to make.
 *
 * Each block below pins one of those on the surfaces that carry it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const SKILL = 'skills/hiveku-automation-agency/SKILL.md';
const NODE_RAIL = 'skills/hiveku-automation-agency/references/node-rail.md';
const AUTOMATE = 'commands/automate.md';
const FORMS = 'skills/hiveku-web-agency/references/forms.md';
const INBOX = 'skills/hiveku-communications/references/inbox.md';

function markdownFiles(rel) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) out.push(child);
    }
  };
  walk(rel);
  return out.sort();
}

const prose = () => [...markdownFiles('skills'), ...markdownFiles('commands'), ...markdownFiles('agents')];

/** Paragraphs (blank-line separated) with their starting line, whitespace collapsed. */
function paragraphsOf(text) {
  const out = [];
  let line = 1;
  for (const block of text.split(/\n\s*\n/)) {
    out.push({ text: flat(block), line });
    line += block.split('\n').length + 1;
  }
  return out;
}

/** The section of `text` from `heading` to the next heading of the same or higher level. */
function section(text, heading) {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `missing section "${heading}"`);
  const level = heading.match(/^#+/)[0].length;
  const next = text.slice(start + heading.length).search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next);
}

test('no workflow_trigger_update call is written with a `config:` key', () => {
  const offenders = [];
  for (const rel of prose()) {
    for (const m of read(rel).matchAll(/workflow_trigger_update\(\{([^)]*)\}\)/g)) {
      if (/(^|[\s,{])config\s*:/.test(m[1])) offenders.push(`${rel}: ${m[0].slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, [], 'the tool forwards filter_config only - a config: argument is dropped and the call changes nothing');
});

test('no surface claims an unresolved {{...}} is written through as the literal string', () => {
  const claim = /written through as the LITERAL string|written-as-literal|stores the text `\{\{body\.email\}\}`/i;
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) if (claim.test(p.text)) offenders.push(`${rel}:${p.line}`);
  }
  assert.deepEqual(offenders, [], 'a well-formed miss is a blank, recorded in unresolved_templates - only malformed or unparseable tokens go out as text');
});

test("node-rail's `||` bullet states what fires the default and where it works", () => {
  const rail = flat(read(NODE_RAIL));
  const at = rail.indexOf('`{{ref || default}}` supplies a fallback');
  assert.ok(at >= 0, 'node-rail lost its `||` bullet');
  const bullet = rail.slice(at, rail.indexOf('- There is no arithmetic', at));
  assert.match(bullet, /in every node type, in `workflow_test` and in real runs alike/);
  assert.match(bullet, /missing \(unknown node, missing field, out-of-range index\), null, or an empty or whitespace-only string/);
  assert.match(bullet, /`0`, `false`, `\[\]` and `\{\}` are real values and are kept/);
  // The round-2 contract paragraph replaced "never another reference, so there
  // is no chaining": same rule, plus the fix and the lint that flags it.
  assert.match(bullet, /Everything after the first `\|\|` is plain text, never looked up\./);
  assert.match(bullet, /There is no chaining\./);
  assert.match(bullet, /workflow_validate warns `fallback_default_is_literal`/);
  assert.match(bullet, /`\{\{ref \|\| \}\}` or `\{\{ref \|\| null\}\}` means blank is intended/);
  assert.match(rail, /A single `\|` and the word `or` are NOT fallbacks/, 'node-rail must say a single pipe is not a fallback');
});

test('the dry-run evidence is data.step_states, and nothing sends a test to workflow_run_get', () => {
  const rail = read(NODE_RAIL);
  const s51 = flat(section(rail, '### 5.1'));
  assert.match(s51, /`data\.step_states\[<nodeId>\]` is the evidence for every node/, 'node-rail 5.1 must name the per-node report');
  assert.match(s51, /`not_reached` lists nodes the run never got to/, 'node-rail 5.1 must name not_reached');
  assert.match(flat(read(AUTOMATE)), /`data\.step_states\[<nodeId>\]` reports every node/, '/hiveku:automate step 5 must name the per-node report');
  assert.match(flat(read(SKILL)), /`data\.step_states\[<nodeId>\]` for EVERY node that ran/, 'the skill must name the per-node report');

  const retired = /make (it|that node|the node) terminal temporarily|temporarily make it terminal|rides along on the terminal|fake `messageId`/i;
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) {
      // The correction itself ("There is no fake `messageId`") is allowed.
      const text = p.text.replace(/\bno fake `messageId`/g, '');
      if (retired.test(text)) offenders.push(`${rel}:${p.line}`);
    }
  }
  assert.deepEqual(offenders, [], 'the terminal-node workaround and the fake messageId are gone: a test reports every node and stubs only an id');

  // A paragraph that dry-runs and then says to call workflow_run_get: the
  // instruction the old forms.md / inbox.md carried. "nothing to fetch" and
  // "REAL runs" mentions are the corrected form and are allowed.
  for (const rel of [FORMS, INBOX]) {
    for (const p of paragraphsOf(read(rel))) {
      if (!/workflow_test|test_mode/.test(p.text)) continue;
      assert.doesNotMatch(p.text, /\bThen `workflow_run_get|`workflow_run_get\(\{ workflow_id, run_id \}\)` shows `step_states` per node with input/, `${rel}:${p.line} pairs a test with workflow_run_get`);
    }
  }
});

test('the canonical slackNotification example carries its webhookUrl, and config location follows the catalog', () => {
  const s25 = section(read(NODE_RAIL), '### 2.5');
  const example = s25.slice(s25.indexOf('```json'), s25.indexOf('```', s25.indexOf('```json') + 7));
  assert.match(example, /"type": "slackNotification"/);
  assert.match(example, /"webhookUrl": "\{\{env\.SLACK_WEBHOOK_URL\}\}"/, 'the example must include the field every run fails without');
  const text = flat(s25);
  assert.match(text, /`configLocation: 'flat'` nodes read `data\.\*` ONLY/);
  assert.match(text, /write `data\.config` for every node EXCEPT the `configLocation: 'flat'` ones/);
});

test('the enable gate and its override are taught, and the override needs the operator', () => {
  const skill = flat(read(SKILL));
  assert.match(skill, /\*\*Never pass `allow_incomplete: true` on your own judgment\.\*\*/, 'the refusal rule for the override');
  assert.match(skill, /422 `workflow_invalid`/);
  const rail = flat(read(NODE_RAIL));
  assert.match(rail, /\*\*The enable gate\.\*\* Turning a DISABLED workflow on runs `workflow_validate` first/);
  assert.match(rail, /Pass it ONLY on the operator's explicit yes/);
  // The worked example no longer depends on enabling past a validate error.
  assert.doesNotMatch(rail, /expected and correct to ignore/, 'node-rail still tells the agent to enable past a missing_required_field');
});

test('webhook URLs are server-assigned and never built from a label', () => {
  const rail = flat(read(NODE_RAIL));
  assert.match(rail, /A new path is `<label>-<16 random characters>`/);
  assert.match(rail, /never build a URL from your label/);
  assert.match(rail, /Never follow it with `workflow_trigger_create` for that node: it answers 409/);
  const forms = flat(read(FORMS));
  assert.match(forms, /the `\{path\}` is server-assigned/);
  assert.doesNotMatch(forms, /Webhook URL format is `https:\/\/app\.hiveku\.com\/api\/webhooks\/trigger\/\{path\}`\.\s*$/m);
});

test('workflow_trigger_update is ask-gated, and the skill confirms it where it confirms workflow_enable', () => {
  const gated = JSON.parse(read('data/permission-critical-tools.json')).tools.map((t) => t.name);
  assert.ok(gated.includes('workflow_trigger_update'), 'workflow_trigger_update belongs on the ask list');
  assert.ok(gated.includes('workflow_enable'));
  const skill = flat(read(SKILL));
  const confirm = skill.slice(skill.indexOf('Confirm every write that can reach a customer'), skill.indexOf('Reading, listing, validating'));
  assert.match(confirm, /`workflow_enable`/);
  assert.match(confirm, /`workflow_trigger_update`/, 'the skill confirm list must name workflow_trigger_update');
  const recipes = flat(read('skills/hiveku-automation-agency/references/recipes.md'));
  const rule = recipes.slice(recipes.indexOf('Anything reaching a customer needs an explicit human yes'), recipes.indexOf('`waitForApproval` does not work'));
  assert.match(rule, /`workflow_trigger_update`/, 'the recipes hard rule must name workflow_trigger_update');
});

test('restore never revives an old webhook path, and no API issues a bearer token for an existing URL', () => {
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) {
      if (/comes back at\s+its exact old path|comes back at the exact old path/i.test(p.text)) offenders.push(`${rel}:${p.line}`);
    }
  }
  assert.deepEqual(offenders, [], 'a restored node whose trigger was deleted gets a NEW URL, never the snapshot path');
  assert.match(flat(read(NODE_RAIL)), /gets a NEW URL \(`<label>-<random>`\), never the snapshot's old\s+path/);
  const wiring = flat(read('skills/hiveku-automation-agency/references/form-wiring.md'));
  assert.match(wiring, /No API call issues a bearer token for an EXISTING URL/);
  assert.match(wiring, /409 `ambiguous_webhook_trigger`/, 'workflow_webhook_auth_set names its ambiguity refusal');
});

test("a definition write never changes a live webhook's auth, and every surface names the explicit writes", () => {
  // The retired rule, in each wording the surfaces used for it.
  const retired = /auth_changed|applies a node's auth or method key|applies only an auth key|a definition write leaves such a row unchanged \(warning `bearer_without_token`\)|merges onto the row only the keys it SENT/;
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) if (retired.test(p.text)) offenders.push(`${rel}:${p.line}`);
  }
  assert.deepEqual(offenders, [], 'a definition write never applies node auth to a live webhook: auth_changed is gone, the warning is auth_not_applied');

  const rail = flat(read(NODE_RAIL));
  const at = rail.indexOf('The row is authoritative for auth.');
  assert.ok(at >= 0, 'node-rail lost its row-is-authoritative bullet');
  const bullet = rail.slice(at, rail.indexOf('`workflow_clone` always gets its OWN new URL', at));
  assert.match(bullet, /`workflow_update`, an editor save, `workflow_node_add`, `workflow_node_update`\) NEVER changes a live webhook's authentication, header name, username or secrets/);
  assert.match(bullet, /warns `auth_not_applied`/);
  for (const explicitWrite of ['`workflow_trigger_update`', '`workflow_webhook_auth_set`', 'Apply authentication', '`workflow_trigger_delete` then `workflow_trigger_create({ authentication: \'bearer\' })`']) {
    assert.ok(bullet.includes(explicitWrite), `node-rail's auth bullet must name ${explicitWrite}`);
  }
  assert.match(bullet, /Only a trigger the write CREATES takes the node's auth/);
  assert.match(rail, /`workflow_node_update` never changes a live webhook's authentication or secrets/, 'node-rail 3.4 must say node_update never changes auth');

  const wiring = flat(read('skills/hiveku-automation-agency/references/form-wiring.md'));
  assert.match(wiring, /NEVER changes a live webhook's authentication, header name, username or secrets/);
  assert.match(wiring, /Apply authentication/);
  assert.match(wiring, /400 `bearer_token_missing`, even when a token from an earlier bearer period is still stored/);

  for (const rel of [SKILL, FORMS, 'commands/workflow-debug.md', 'commands/automate.md', 'skills/hiveku-automation-agency/references/event-triggers.md']) {
    assert.match(flat(read(rel)), /`auth_not_applied`/, `${rel} must say a node edit warns auth_not_applied instead of changing the URL's auth`);
  }
});

test("template-miss coverage is three-valued: 'partial' is a lower bound, never a clean bill", () => {
  const rail = flat(section(read(NODE_RAIL), '### 5.2'));
  assert.match(rail, /`'partial'`: the run started after 2026-08-08T17:36:39Z/);
  assert.match(rail, /a lower bound on a `'partial'` run \(null when that bound is 0\)/);
  for (const rel of ['commands/workflow-debug.md', 'commands/automation-sweep.md', 'agents/hiveku-automation-analyst.md', 'skills/hiveku-automation-agency/references/reliability.md']) {
    assert.match(flat(read(rel)), /`'partial'`/, `${rel} must say what a partial recording means`);
  }
});

// ── Forney round 2 (2026-09-23) ──────────────────────────────────────────────

const RELIABILITY = 'skills/hiveku-automation-agency/references/reliability.md';
const SWEEP = 'commands/automation-sweep.md';
const DEBUG = 'commands/workflow-debug.md';
const ANALYST = 'agents/hiveku-automation-analyst.md';

/** The contract's `||` paragraph, whitespace collapsed (CONTRACTS-R2, "use verbatim"). */
const LITERAL_DEFAULT_PARAGRAPH = flat(
  "Everything after the first `||` is plain text, never looked up. `{{trigger.output.payload.company || trigger.output.payload.name}}` " +
    'falls back to the words `trigger.output.payload.name`, not to the name. There is no chaining. To fall back to a second ' +
    "field, check the first with a Conditional node (or return the first non-empty value from a Code node) and reference " +
    "that node's output. If you mean text that looks like a path, quote it: `{{ref || 'trigger.name'}}`. workflow_validate " +
    'warns `fallback_default_is_literal`, and a workflow_test template_values entry carries a `hint`, when a default looks ' +
    'like a reference.',
);

test('the `||` contract paragraph is carried verbatim where a default is taught in full', () => {
  for (const rel of [SKILL, NODE_RAIL, FORMS]) {
    assert.ok(flat(read(rel)).includes(LITERAL_DEFAULT_PARAGRAPH), `${rel} must carry the contract's || paragraph verbatim`);
  }
  // The short form, where space is tight: the literal rule and the lint by name.
  for (const rel of [AUTOMATE, 'skills/hiveku-automation-agency/references/event-triggers.md', RELIABILITY]) {
    const text = flat(read(rel));
    assert.match(text, /plain text/, `${rel} must say a default is plain text`);
    assert.match(text, /never (looked up|another (key|field))/, `${rel} must say a default is never another field`);
  }
  // The retired one-liner ("yields the text c.d") taught the rule without the fix.
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) if (/yields the text `c\.d`/.test(p.text)) offenders.push(`${rel}:${p.line}`);
  }
  assert.deepEqual(offenders, [], 'the old one-line || rule is replaced by the contract paragraph');
});

test('no surface says every workflow auto-pauses after five failures: the rule is by origin', () => {
  const retired =
    /Five consecutive failures (trip the circuit breaker and )?(auto-)?pause (a|the) workflow|The circuit breaker trips at \*\*5 consecutive failures\*\* and pauses|Circuit breaker: 5 consecutive failures paused it|The circuit breaker pauses a workflow after \*\*five consecutive\*\* failures and emails/;
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) if (retired.test(p.text)) offenders.push(`${rel}:${p.line}`);
  }
  assert.deepEqual(offenders, [], 'webhook and website-visitor failures never pause a workflow; say which runs do');

  const skill = flat(read(SKILL));
  assert.match(skill, /A \*\*webhook or website-visitor\*\* run never pauses the workflow, however often it fails/);
  // A retry takes the origin of the run it retries (workflowRetryService, every
  // entry point): a retried webhook/visitor run keeps its label and never
  // pauses, a retried human-origin run is a 'replay', and only a retry of a
  // schedule/database/event run is labelled 'retry' and can pause.
  assert.match(skill, /A retry takes the origin of the run it retries, whoever asks for it \(`workflow_run_retry`, or the hourly retry sweep\)/);
  assert.match(skill, /retrying a failed webhook or website-visitor run gives another webhook \(or visitor\) run, which counts and alerts but never pauses/);
  // The hourly sweep (batchRetryFailedRuns) selects only failed runs whose
  // trigger_data is JSON null or carries retry_count < 3. The engine stores
  // every run's input in trigger_data, so the sweep never picks up a run
  // nobody retried by hand: no production run has ever been labelled 'retry'
  // (checked 2026-09-23). A surface that calls it an automatic retry of the
  // last day's failures promises a safety net that does not exist.
  assert.match(skill, /Never tell an operator a failed run will be retried on its own/);
  const reliability = flat(read(RELIABILITY));
  assert.match(reliability, /The sweep is not a safety net: it only picks up a failed run from the last 24 hours whose trigger data already carries a `retry_count`/);
  const safetyNet = /hourly automatic retry of the last|failed runs? (is|are) retried (automatically|every hour|hourly)/i;
  const safetyNetOffenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) if (safetyNet.test(p.text)) safetyNetOffenders.push(`${rel}:${p.line}`);
  }
  assert.deepEqual(safetyNetOffenders, [], 'the hourly retry sweep retries only runs somebody already retried: never present it as an automatic retry of every failure');
  assert.match(reliability, /\| A webhook delivery, a website visitor \(or a trigger row of unknown type\), or a retry of one of those \| `webhook`, `new_site_visitor`, `trigger_event` \| yes \| \*\*never\*\* \| yes \|/);
  assert.match(reliability, /\| A schedule, a database change, an internal event, or a retry of one of those \| [^|]*`retry`[^|]*\| yes \| yes \| yes \|/);
  assert.match(reliability, /\| A person or an agent, or a retry of their run \| `manual`, `test`, `manual_test`, `webhook_test`, `replay`, `olympus_agent`, `olympus_agent_async` \| no \| no \| no \|/);
  // The pre-fix rule ("a retry counts toward the pause whoever asked for it, so a
  // failed retry on a webhook workflow pauses it") is gone everywhere.
  const retiredRetry = /(A retry counts that way|a retry counts toward the pause) whoever asked for it|failed retry on a webhook workflow (that has )?already (failed )?four|`circuit_breaker` a failed retry/i;
  const retryOffenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) if (retiredRetry.test(p.text)) retryOffenders.push(`${rel}:${p.line}`);
  }
  assert.deepEqual(retryOffenders, [], 'a retry of a webhook run never pauses: say that a retry takes the origin of the run it retries');
  for (const rel of [SWEEP, DEBUG, FORMS]) {
    assert.match(flat(read(rel)), /webhook[^.]*never paus/i, `${rel} must say a webhook failure never pauses its workflow`);
  }
});

test('failure alerts: what they cover, how to switch them on, and that they survive saves and restores', () => {
  const skill = flat(read(SKILL));
  assert.match(skill, /workflow_update\(\{ workflow_id, settings: \{ notify_on_failure: true \} \}\)/);
  assert.match(skill, /webhook deliveries and website-visitor events included/);
  assert.match(skill, /That is `workflow_run`, `workflow_test`, a replay \(stranded or dead-letter\), and the editor's Test Run and its test webhook URL/);
  assert.match(skill, /survives the owner's dashboard saves and every version restore/);
  assert.match(skill, /a `definition` you send that carries its own `settings` IS honoured/);
  // The switch is the gear-menu item WorkflowEditorClient.tsx mounts
  // (WorkflowAlertsToggle, label ALERTS_TOGGLE_LABEL): name where it is.
  assert.match(skill, /in the workflow editor's gear menu \("Email admins when a triggered run fails"\)/);
  const unplaced = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) {
      if (/failure-alerts switch|same switch in the workflow editor|Email admins when a triggered run fails/.test(p.text) && !/gear menu/.test(p.text)) {
        unplaced.push(`${rel}:${p.line}`);
      }
    }
  }
  assert.deepEqual(unplaced, [], "every mention of the owner's alerts switch says where it is: the workflow editor's gear menu");
  const reliability = flat(read(RELIABILITY));
  assert.match(reliability, /For a webhook lead form it is the only alert the client gets/);
  assert.match(flat(read(NODE_RAIL)), /a restore can never switch failure alerts off/);
  assert.match(flat(read(SWEEP)), /`definition\.settings\.notify_on_failure`/);
});

test('trigger.output.timestamp is on every run, and a webhook body lives only under payload', () => {
  const s26 = flat(section(read(NODE_RAIL), '### 2.6'));
  assert.match(s26, /`\{\{trigger\.output\.timestamp\}\}` is on every run/);
  assert.match(s26, /A replay keeps the original run's time|a replay keeps the original run's time/);
  assert.match(s26, /`\{\{trigger\.email\}\}` and `\{\{trigger\.output\.email\}\}` are not the body/);
  assert.doesNotMatch(s26, /A `manualTrigger` emits no `payload` key/, 'a workflow_run input also lands under payload');
  assert.match(flat(read(SKILL)), /On a webhook-trigger workflow, `input_data` is the request BODY/);
  for (const rel of [AUTOMATE, DEBUG, RELIABILITY]) {
    assert.match(flat(read(rel)), /`input_data` is the request\s+BODY|pass the request BODY as `input_data`/, `${rel} must say a webhook test's input_data is the body`);
  }
});

test('a node missing required config fails the dry run; it is not mocked', () => {
  const s41 = flat(section(read(NODE_RAIL), '### 4.1'));
  assert.match(s41, /\*\*A node that cannot run fails the test\.\*\*/);
  assert.match(s41, /`Slack webhook URL is required`/);
  assert.match(s41, /A value the test cannot know keeps the mock/);
  for (const rel of [SKILL, AUTOMATE, DEBUG, RELIABILITY]) {
    assert.match(flat(read(rel)), /FAILS the test|fails the test|test itself fails on it/, `${rel} must say a missing required field fails the test`);
  }
});

test('a failed run can predate the last change, and every reader of a failed run is told to check', () => {
  for (const rel of [SKILL, RELIABILITY, DEBUG, SWEEP, ANALYST, NODE_RAIL]) {
    assert.match(flat(read(rel)), /`predates_current_definition`/, `${rel} must name predates_current_definition`);
  }
  assert.match(flat(read(SKILL)), /`last_failed_run\.predates_last_change`/);
  assert.match(flat(read(RELIABILITY)), /Never chase a failure without reading `predates_current_definition` first/);
});

test('definition_changed_at is the newest GRAPH change: a failure-alerts toggle never moves it', () => {
  // setup-health.ts latestDefinitionChange skips the settings-only rows the
  // alerts toggle writes ('Failure alerts on' / 'Failure alerts off'), and the
  // MCP descriptions say so. A surface that calls the toggle a possible
  // "last change" tells an agent to discount a failure that is still current.
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) {
      if (/`definition_changed_at`[^)]*failure-alerts switch/.test(p.text)) offenders.push(`${rel}:${p.line}`);
    }
  }
  assert.deepEqual(offenders, [], 'definition_changed_at is never an alerts toggle; say that a toggle does not count');
  for (const rel of [SKILL, RELIABILITY, DEBUG, NODE_RAIL]) {
    assert.match(
      flat(read(rel)),
      /`definition_changed_at`[^)]*turning failure alerts on or off does not count/,
      `${rel} must say an alerts toggle does not move definition_changed_at`,
    );
  }
});

test('the sweep finds switched-on workflows that will fail, and only PROPOSES a webhook rotation', () => {
  const sweep = flat(read(SWEEP));
  assert.match(sweep, /Read every row's `setup` too/);
  assert.match(sweep, /`workflow_list\(\{ enabled: 'true', needs_setup: 'true' \}\)`/);
  assert.match(sweep, /`setup: null` means the verdict could not be computed for that row: unknown, never ok/);
  assert.match(sweep, /`webhook_path_strength`/);
  assert.match(sweep, /Recommend `workflow_trigger_update\(\{ workflow_id, trigger_id, rotate_webhook_path: true \}\)`/);
  assert.match(sweep, /It runs only on the operator's explicit yes for that trigger/);
  assert.match(sweep, /Never rotate from this pass, never rotate on your own judgment/);
  assert.match(sweep, /Nothing is fixed, enabled, resumed, replayed, rotated, or deleted from this pass/);
  // The skill's confirm rule covers a rotation like a rename.
  assert.match(flat(read(SKILL)), /re-minting it in place \(`workflow_trigger_update\(\{ rotate_webhook_path: true \}\)`\): the old URL dies at once/);
  assert.match(flat(read(NODE_RAIL)), /\*\*Rotating a URL in place\.\*\*/);
});

test('a real send goes out once: the proxy re-sends only a 429 refused before any work, so read before calling again', () => {
  // The MCP proxy maps the six workflow send tools singleAttempt:
  // workflow_trigger_update and workflow_stranded_replay (marketing-tools.ts),
  // a real workflow_run, workflow_run_retry, workflow_run_replay and
  // workflow_dead_letter_resolve (olympus-tools.ts). A 502/503/504, a timeout
  // or a dropped connection comes back after that one send and is never
  // re-sent, because the request may have landed. A 429 is the exception:
  // each of them sets replaySafeStatuses: [429] (review r2 final idx 6),
  // because none of their routes answers 429 itself; a 429 is the admission
  // gate (requireOlympusAuth) or an edge rate limit, refused before any work,
  // so the proxy re-sends it with the normal retry (Retry-After honoured,
  // capped at 10 s, otherwise the short backoff; 3 attempts in all), and a
  // 429 that still comes back changed nothing (olympus-proxy.service.ts
  // isReplaySafeStatus, singleAttemptHint). A rotate_webhook_path repeat mints
  // another URL and kills the one the first call made live (review r2 idx 9,
  // 27). So the prose must say to read the result back before calling again
  // after a 5xx, a timeout or a dropped connection, never that a repeat is
  // safe, and must not say a 429 goes out once. The plugin ships against the
  // LIVE MCP, so release it after that MCP deploys.
  const skill = flat(read(SKILL));
  assert.match(
    skill,
    /\*\*A real send goes out once\.\*\* The Hiveku proxy never re-sends `workflow_trigger_update`, a real `workflow_run`, `workflow_run_retry`, `workflow_run_replay`, `workflow_stranded_replay` or `workflow_dead_letter_resolve` on its own after a 502, 503 or 504, a timeout or a dropped connection/,
  );
  assert.match(
    skill,
    /`workflow_runs_list` for a run, retry or replay, `workflow_stranded_list` for a stranded replay, `workflow_triggers_list` for a trigger update, `workflow_dead_letters_list` \(status `'all'`\) for a dead-letter resolve/,
  );
  assert.match(
    skill,
    /A 429 is the one exception: it is a rate-limit refusal answered before any work, so the proxy waits \(the response's `Retry-After`, capped at 10 seconds, or a short backoff without one\) and sends it again, 3 attempts in all; a 429 that still comes back means nothing ran and nothing changed/,
  );
  const reliability = flat(read(RELIABILITY));
  assert.match(reliability, /\*\*A real send that errors may still have run, and the proxy re-sends only a 429\.\*\*/);
  assert.match(
    reliability,
    /A 429 is different: it is a rate-limit refusal answered before any work, so the proxy waits \(the response's `Retry-After`, capped at 10 seconds, or a short backoff without one\) and re-sends it, 3 attempts in all\. A 429 that still comes back means nothing ran and nothing changed/,
  );
  const rotation = flat(read(NODE_RAIL));
  assert.match(
    rotation,
    /Send a rotation once\. Every rotation mints a new URL and kills the last one, and the proxy never re-sends `workflow_trigger_update` on its own after a 5xx, a timeout or a dropped connection/,
  );
  assert.match(rotation, /A 429 is refused before any work, so the proxy re-sends that one for you \(3 attempts in all\), and a 429 that still comes back rotated nothing/);
  assert.match(
    rotation,
    /A rename that errors may have landed too \(the proxy never re-sends `workflow_trigger_update` after a 5xx, a timeout or a dropped connection\)/,
  );
  const debug = flat(read(DEBUG));
  assert.match(
    debug,
    /It goes out once \(the proxy never re-sends it after a 5xx, a timeout or a dropped connection; only a 429, refused before any work, is re-sent for you\), so if it errors, read `workflow_triggers_list` before you send it again/,
  );
  assert.match(
    debug,
    /If a replay call errors, re-read `workflow_stranded_list` before calling it again: the proxy never re-sends it after a 5xx, a timeout or a dropped connection/,
  );
  // Nothing on any surface says the transport retries these, that repeating a
  // rotation is safe, or that a 429 goes out once.
  const retired =
    /(repeat(ing)?|re-?send(ing)?) (a|the) (rotation|rotate_webhook_path[^.]*?) (request )?is safe|proxy (retries|re-sends) (`?workflow_trigger_update|a real `?workflow_run|`?workflow_run_retry|`?workflow_run_replay|`?workflow_stranded_replay|`?workflow_dead_letter_resolve)|(workflow_run|workflow_run_retry|workflow_run_replay|workflow_stranded_replay|workflow_trigger_update|workflow_dead_letter_resolve)`? (is|are) retried automatically|429[^.]*?(is never re-sent|comes back after (that )?one attempt|goes out once|is sent once)/i;
  const offenders = [];
  // And every paragraph that says the proxy never re-sends something names the
  // 429 exception, so no surface states the rule without it.
  const unqualified = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) {
      if (retired.test(p.text)) offenders.push(`${rel}:${p.line}`);
      if (/proxy\b[^.]*\bnever re-sends/i.test(p.text) && !/\b429\b/.test(p.text)) unqualified.push(`${rel}:${p.line}`);
    }
  }
  assert.deepEqual(offenders, [], 'these tools are sent once after a 5xx or a lost connection: say to read the result back before calling again');
  assert.deepEqual(unqualified, [], 'a paragraph that says the proxy never re-sends a call must say a 429 (refused before any work) is re-sent');
});
