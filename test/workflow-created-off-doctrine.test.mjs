/**
 * Every workflow is created switched off, and only workflow_enable turns one on
 * (release 0.26.34, with MCP #47).
 *
 * The MCP server now creates every workflow off: workflow_create,
 * workflow_clone, workflow_duplicate, workflow_create_from_template,
 * workflow_provision_webhook and workflow_bulk_provision_for_project. The
 * create tools refuse is_enabled: true, and workflow_update refuses it too
 * (workflow_enable_required). Before that, the template and webhook tools
 * created the workflow switched ON by default, and the skills taught it: "URL
 * LIVE the moment it returns", "defaults is_enabled: true".
 *
 * Prose that still says so is worse than stale. An agent that believes a new
 * webhook is live pastes its URL into SmartLead and walks away; while the
 * workflow is off the URL answers 200 and runs nothing, so every reply sent to
 * it is dropped and the provider never sends it again. These pins keep:
 *   - no prose (skills, commands, agents, the department manifest) saying a
 *     template, webhook or provisioned workflow is on or live when created;
 *   - no prose presenting workflow_update({ is_enabled: true }) as a way on;
 *   - every file that teaches one of the creating tools also naming
 *     workflow_enable;
 *   - the sites a verifier named (new-site step 4, the SmartLead first run,
 *     web forms, the automation hub) saying the workflow starts off and that
 *     workflow_enable follows the user's yes, and the webhook sites saying to
 *     switch it on before a sender posts to it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace and drop backticks and bold marks so a pinned phrase may wrap and carry markup. */
const flat = (s) => s.replace(/`|\*\*/g, '').replace(/\s+/g, ' ');

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}

/** Every string in the department manifest, joined, so its setup and crud text is prose too. */
function manifestProse() {
  const strings = [];
  const visit = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(JSON.parse(read('lib/dept-manifest.json')));
  return strings.join('\n');
}

const PROSE = [...walk('skills'), ...walk('commands'), ...walk('agents')];
const sources = () => [...PROSE.map((rel) => [rel, read(rel)]), ['lib/dept-manifest.json', manifestProse()]];

const CREATING_TOOLS = /workflow_create_from_template|workflow_provision_webhook|workflow_bulk_provision_for_project/g;

/** Said within reach of a creating tool, these claim the new workflow is on. */
const LIVE_ON_CREATE = [
  /live (?:immediately|the moment|at once)/i,
  /goes live on its own/i,
  /defaults? (?:to )?(?:is_enabled:? )?(?:to )?(?:true|enabled)\b/i,
  /is_enabled:? ?(?:true )?(?:is the default|defaults to true)/i,
  /enabled by default/i,
];

/** Said anywhere, these teach workflow_update as a way to switch a workflow on. */
const UPDATE_SWITCHES_ON = [
  /workflow_update\(\{[^}]*is_enabled: ?true/,
  /\(and workflow_update with is_enabled: ?true\)/,
  /workflow_update with is_enabled: ?true\) refuses/,
];

function liveOnCreateClaims(text) {
  const f = flat(text);
  const found = [];
  for (const m of f.matchAll(CREATING_TOOLS)) {
    const window = f.slice(m.index, m.index + 320);
    for (const re of LIVE_ON_CREATE) {
      const hit = window.match(re);
      if (hit) found.push(`${m[0]} ... ${hit[0]}`);
    }
  }
  return found;
}

function updateSwitchesOnClaims(text) {
  const f = flat(text);
  return UPDATE_SWITCHES_ON.filter((re) => re.test(f)).map(String);
}

test('no prose says a template, webhook or provisioned workflow is on or live when created', () => {
  assert.ok(PROSE.length > 50, 'the prose walk found too few files');
  const offenders = [];
  for (const [rel, text] of sources()) {
    for (const claim of liveOnCreateClaims(text)) offenders.push(`${rel}: ${claim}`);
  }
  assert.deepEqual(offenders, [], `prose still says a new workflow is on:\n  ${offenders.join('\n  ')}`);
});

test('no prose presents workflow_update({ is_enabled: true }) as a way to switch a workflow on', () => {
  const offenders = [];
  for (const [rel, text] of sources()) {
    for (const claim of updateSwitchesOnClaims(text)) offenders.push(`${rel}: ${claim}`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every file that teaches a creating tool also names workflow_enable', () => {
  const missing = [];
  let teaching = 0;
  for (const [rel, text] of sources()) {
    if (!CREATING_TOOLS.test(text)) continue;
    CREATING_TOOLS.lastIndex = 0;
    teaching += 1;
    if (!text.includes('workflow_enable')) missing.push(rel);
  }
  assert.ok(teaching >= 15, `found ${teaching} files teaching a creating tool, so this test proves little`);
  assert.deepEqual(missing, [], `these teach a creating tool and never say how the workflow is switched on:\n  ${missing.join('\n  ')}`);
});

/** file -> phrases (flattened) it must carry. */
const PINNED = {
  'commands/new-site.md': [
    'Every workflow it creates starts switched off',
    'switch each on with workflow_enable once they say yes',
  ],
  'commands/automate.md': [
    'workflow_create_from_template({ slug, overrides, is_enabled: false })',
    'It is created switched off, like every workflow',
  ],
  'skills/hiveku-outbound-agency/references/smartlead-provider.md': [
    'The workflow is created switched off',
    'switch it on with workflow_enable once the user says yes, and only then paste webhook_url',
  ],
  'skills/hiveku-outbound-agency/SKILL.md': [
    'The provisioned workflow is created switched off: switch it on with workflow_enable after the user says yes, BEFORE the URL goes into SmartLead',
  ],
  'skills/hiveku-web-agency/references/forms.md': [
    'Every workflow it creates starts switched off',
    'The workflow is created switched off, so the URL answers 200 but runs nothing until workflow_enable',
  ],
  'skills/hiveku-automation-agency/SKILL.md': [
    'Every create path starts the workflow switched off.',
    'workflow_update cannot switch a workflow on at all',
    'It is created switched off. Pass is_enabled: false',
  ],
  'skills/hiveku-automation-agency/references/node-rail.md': [
    'No tool creates a workflow switched on',
    'workflow_update cannot switch a workflow on',
  ],
  'skills/hiveku-automation-agency/references/form-wiring.md': [
    'Every workflow the real run creates starts switched off',
    'the workflow is created switched off (pass is_enabled: false, the only value it accepts)',
  ],
  'skills/hiveku-automation-agency/references/templates.md': ['It is created switched off'],
  'skills/hiveku-ppc-agency/references/workflow-templates.md': [
    'An install starts switched off, and only workflow_enable turns it on.',
  ],
};

test('the sites that teach creating a workflow say it starts off and workflow_enable follows the yes', () => {
  const missing = [];
  for (const [rel, phrases] of Object.entries(PINNED)) {
    const f = flat(read(rel));
    for (const phrase of phrases) if (!f.includes(phrase)) missing.push(`${rel}: ${phrase}`);
  }
  const manifest = flat(manifestProse());
  for (const phrase of [
    'The workflow is created switched off, and while it is off its URL answers SmartLead with a 200 but runs nothing',
    'switch it on with workflow_enable once the user says yes, and only then paste webhook_url into SmartLead',
    'workflow_create_from_template({ slug, overrides, is_enabled: false }) (created switched off',
    'Every create path makes the workflow switched off',
  ]) if (!manifest.includes(phrase)) missing.push(`lib/dept-manifest.json: ${phrase}`);
  assert.deepEqual(missing, [], `missing:\n  ${missing.join('\n  ')}`);
});

test('the checks fail on the old wording (negative control)', () => {
  const old = {
    automationHub:
      '`workflow_provision_webhook` (bare webhook-in/action-out - defaults\n`is_enabled: true`, URL LIVE the moment it returns, `bearer_token` shown exactly once',
    forms:
      'is `workflow_provision_webhook({ name })`, which returns `{ workflow_id, webhook_url, trigger_id }` in one shot. It defaults `is_enabled: true`, so the URL is live the moment it returns',
    templates:
      'workflow_create_from_template({ slug, overrides }) - Note `is_enabled` defaults to **true** here, unlike `workflow_create`',
    ppc: '`workflow_create_from_template({ slug, overrides })` installs one per client. Note the tool\ndefaults `is_enabled: true`, so confirm',
    content:
      '`workflow_create_from_template({ slug, overrides, is_enabled: false })` stages one, then `workflow_test`, then `workflow_enable` on the operator\'s yes - the create goes live on its own otherwise.',
    nodeRail: 'by `workflow_create_from_template` (enabled by\ndefault), are never refused for validation',
  };
  for (const [label, text] of Object.entries(old)) {
    assert.notDeepEqual(liveOnCreateClaims(text), [], `${label}: the old wording should be caught`);
  }
  assert.notDeepEqual(updateSwitchesOnClaims('`workflow_update({ is_enabled: true })` goes through the same gate.'), []);
  assert.notDeepEqual(
    updateSwitchesOnClaims('`workflow_enable` (and\n  `workflow_update` with `is_enabled: true`) refuses a disabled workflow'),
    [],
  );
  // The new wording passes, including the history note that names the old default.
  assert.deepEqual(
    liveOnCreateClaims('`workflow_provision_webhook` (bare webhook-in/action-out - created switched off, so its URL answers but runs nothing until `workflow_enable`. Until late September 2026 this tool created the workflow switched ON by default)'),
    [],
  );
  assert.deepEqual(updateSwitchesOnClaims('`workflow_update({ is_enabled: false })` switches it off while you fix it.'), []);
});
