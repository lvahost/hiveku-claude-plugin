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
  assert.match(bullet, /never another reference, so there is no chaining/);
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
