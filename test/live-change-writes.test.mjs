/**
 * The live-change writes always ask, on every install (release 0.26.30).
 *
 * Release 0.26.30 put these writes on data/permission-critical-tools.json and
 * the INSTALL.md ask block. That block is a copy in each user's settings file,
 * so it only reaches a machine whose settings are pasted from 0.26.30 or later.
 * Every earlier install keeps `allow: ["mcp__plugin_hiveku_hk__*"]` with an
 * older list, and a write the plugin hook says nothing about runs unprompted
 * there: an unattended session previews ppc_conversion_adjustments_run, sends
 * back the preview_hash it was just given, and the retraction reaches Google
 * with nobody asked. The hook's `ask` overrides a settings allow and ships with
 * the plugin, so these tests pin that it asks, through the same entry point
 * hooks/hooks.json runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALWAYS_ASK_WRITES,
  HIVEKU_TOOL_PREFIX,
  LIVE_CHANGE_WRITES,
  decideForPayload,
  decideWithGuardrails,
  isAutoApprovable,
  isReadOnlyTool,
} from '../lib/tool-safety.mjs';
import { probeIsStale, updateCheckPath } from '../lib/update-check.mjs';

/** Every name 0.26.30 added to the ask list, which is every name on the map. */
const LIVE_CHANGE_NAMES = [
  // Google and Microsoft settings on live campaigns.
  'ppc_google_auto_apply_set',
  'ppc_google_campaign_settings_set',
  'ppc_google_ad_schedule_set',
  'ppc_google_audience_exclusions_set',
  'ppc_google_call_settings_set',
  'ppc_google_campaign_ai_settings_set',
  'ppc_bing_campaign_ai_settings_set',
  'ppc_bing_url_tracking_set',
  // Live ad text, negatives and extensions.
  'ppc_google_ad_text_update',
  'ppc_google_ads_text_replace',
  'ppc_negatives_remove',
  'ppc_bing_ad_extension_update',
  'ppc_bing_ad_extension_remove',
  // Experiments.
  'ppc_bing_experiment_create',
  'ppc_bing_experiment_update',
  'ppc_experiment_schedule',
  'ppc_experiment_graduate',
  'ppc_experiment_promote',
  'ppc_experiment_treatment_set',
  // Conversions and audiences sent to the platforms.
  'ppc_conversion_adjustments_run',
  'ppc_conversion_adjustments_set',
  'ppc_offline_conversion_upload',
  'ppc_customer_match_upload',
  'ppc_meta_lead_quality_test',
  // The budget guardrail.
  'ppc_goals_set',
  'ppc_budget_target_set',
  'ppc_connection_update',
  // A live site, and GA4 conversion settings.
  'agent_approval_approve',
  'seo_ga4_key_event_update',
  'seo_ga4_event_create_rule_update',
];

function folderWith(guardrails) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-live-'));
  if (guardrails !== undefined) {
    mkdirSync(join(dir, '.hiveku'), { recursive: true });
    writeFileSync(join(dir, '.hiveku', 'guardrails.json'), JSON.stringify(guardrails));
  }
  return dir;
}
const payload = (tool, cwd, toolInput = {}) => ({
  tool_name: `${HIVEKU_TOOL_PREFIX}${tool}`,
  tool_input: toolInput,
  cwd,
});
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

/** The main permissions block of INSTALL.md (the one with the long ask list). */
function installPermissions() {
  const install = readFileSync(new URL('../INSTALL.md', import.meta.url), 'utf8');
  const blocks = [...install.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter((b) => Array.isArray(b?.permissions?.ask) && b.permissions.ask.length >= 10);
  assert.equal(blocks.length, 1, 'could not find the main permissions block in INSTALL.md');
  return blocks[0].permissions;
}

/** A Claude Code permission rule: an exact name, or a prefix ending in `*`. */
const ruleMatches = (rule, toolName) =>
  rule.endsWith('*') ? toolName.startsWith(rule.slice(0, -1)) : rule === toolName;

/**
 * Runs the real hook as hooks/hooks.json does (`bin/hiveku hook pre-tool-use`,
 * the payload on stdin). A fresh update-check stamp keeps the hook's update
 * probe from spawning, so the run touches no network.
 */
function runPreToolUseHook(toolName, toolInput, cwd) {
  const dataDir = mkdtempSync(join(tmpdir(), 'hk-live-data-'));
  writeFileSync(updateCheckPath(dataDir), JSON.stringify({ checked_at: new Date().toISOString() }));
  assert.equal(probeIsStale(dataDir), false, 'the update probe would spawn; the fixture is wrong');
  const env = { ...process.env, HIVEKU_PLUGIN_DATA: dataDir };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_DATA;
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../bin/hiveku', import.meta.url)), 'hook', 'pre-tool-use'],
    {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, cwd }),
      encoding: 'utf8',
      env,
      timeout: 20_000,
    },
  );
}

test('the live-change set is exactly the writes 0.26.30 added to the ask list', () => {
  assert.deepEqual([...LIVE_CHANGE_WRITES.keys()].sort(), [...LIVE_CHANGE_NAMES].sort());
});

test('every live-change name is a real, non-GET tool with a reason worth reading', () => {
  const index = new Map(
    JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8'))
      .tools.map((t) => [t.name, t.method]),
  );
  for (const [name, why] of LIVE_CHANGE_WRITES) {
    assert.ok(index.has(name), `${name} is not in the tool index; a typo gates nothing`);
    assert.ok(index.get(name) && index.get(name) !== 'GET', `${name} is a ${index.get(name)}; gate a read elsewhere`);
    assert.ok(why.length > 40, `${name} must say why it asks`);
    assert.ok(!/[.]$/.test(why), `${name}: the prompt adds its own full stop`);
  }
});

test('the premise: INSTALL.md blanket-allows every live-change write, and the hook runs on it', () => {
  // Without the hook's answer, each of these runs unprompted on a machine whose
  // settings carry the blanket allow and an ask list copied before 0.26.30.
  const { allow } = installPermissions();
  const hooks = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
  const matchers = hooks.hooks.PreToolUse.map((h) => h.matcher);
  for (const name of LIVE_CHANGE_NAMES) {
    const full = `${HIVEKU_TOOL_PREFIX}${name}`;
    assert.ok(allow.some((rule) => ruleMatches(rule, full)), `no INSTALL.md allow rule matches ${full}`);
    assert.ok(matchers.some((m) => new RegExp(`^(?:${m})$`).test(full)), `no PreToolUse matcher reaches ${full}`);
  }
});

test('every live-change write ASKS on a direct call, preview or confirm, with no guardrails file', () => {
  const cwd = folderWith(undefined);
  const inputs = [
    {},
    { connection_id: 'c', params: {} },
    { connection_id: 'c', confirm: true, preview_hash: 'h' },
    { connection_id: 'c', confirm: true },
  ];
  for (const name of LIVE_CHANGE_NAMES) {
    for (const input of inputs) {
      const r = decideWithGuardrails(payload(name, cwd, input));
      assert.equal(decision(r), 'ask', `${name} ${JSON.stringify(input)} must ask; silence is the blanket allow`);
      const why = reason(r);
      assert.match(why, new RegExp(`^${name} `), `${name}: the prompt must name the tool`);
      assert.ok(why.includes(LIVE_CHANGE_WRITES.get(name)), `${name}: the prompt must carry its own reason`);
      assert.match(why, /even when your settings allow all Hiveku tools/);
      assert.ok(!/BILLS THIS ACCOUNT|RESPONSE is the hazard/.test(why), `${name}: shown a read's reason`);
    }
  }
});

test('the prompts name the hazard a person would weigh', () => {
  const why = (name) => reason(decideForPayload(payload(name, undefined)));
  assert.match(why('ppc_goals_set'), /clearing it switches the auto-pause off and raising it moves the pause point up/);
  assert.match(why('ppc_budget_target_set'), /clearing it switches the auto-pause off/);
  assert.match(why('ppc_connection_update'), /switches off an auto-pause the owner set/);
  assert.match(why('ppc_conversion_adjustments_run'), /a retraction cannot be undone/);
  assert.match(why('ppc_experiment_schedule'), /serves and spends/);
  assert.match(why('ppc_experiment_graduate'), /account spend goes up by that budget every day/);
  assert.match(why('agent_approval_approve'), /deploys code to the client's live production site/);
  assert.match(why('seo_ga4_key_event_update'), /flows into every Google Ads conversion imported from it/);
});

test('the real hook process prints ask for a live-change write under the blanket allow', () => {
  const cwd = folderWith(undefined);
  const run = runPreToolUseHook(
    `${HIVEKU_TOOL_PREFIX}ppc_conversion_adjustments_run`,
    { connection_id: 'c', confirm: true, preview_hash: 'h' },
    cwd,
  );
  assert.equal(run.status, 0, run.stderr);
  assert.notEqual(run.stdout, '', 'the hook printed nothing, so the blanket allow would run the retraction unattended');
  const out = JSON.parse(run.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^ppc_conversion_adjustments_run retracts or restates conversions/);
  // Contrast in the same folder: an ordinary write gets no answer at all.
  const ordinary = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}crm_deal_create`, { name: 'x' }, cwd);
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(ordinary.stdout, '', 'an ordinary write should get no answer from the hook');
});

test('a batch carrying a live-change write asks, a reads-only folder denies it, no read list approves it', () => {
  const cwd = folderWith(undefined);
  const mixed = decideWithGuardrails({
    tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
    tool_input: { calls: [
      { tool: 'ppc_goals_get', args: {} },
      { tool: 'ppc_goals_set', args: { connections: [{ connection_id: 'c', monthly_budget_target_cents: null }] } },
    ] },
    cwd,
  });
  assert.equal(decision(mixed), 'ask');
  assert.match(reason(mixed), /ppc_goals_set/);
  const readsOnly = folderWith({ version: 1, mode: 'reads-only' });
  for (const name of LIVE_CHANGE_NAMES) {
    assert.equal(decision(decideWithGuardrails(payload(name, readsOnly))), 'deny', `${name} under reads-only`);
    assert.equal(isAutoApprovable(name, {}), false, `${name} must never be pre-approved`);
    assert.equal(isReadOnlyTool(name), false, `${name} must not be on the generated read list`);
  }
});

test('the set is case-insensitive and does not reach another server\'s tool of the same name', () => {
  assert.equal(decision(decideForPayload(payload('PPC_Goals_Set', undefined))), 'ask');
  assert.equal(decideForPayload({ tool_name: 'mcp__other__ppc_goals_set', tool_input: {} }), null);
});

test('NEGATIVE CONTROL: the matching reads stay pre-approved and the exempt writes stay silent', () => {
  const cwd = folderWith(undefined);
  // The reads beside these writes. An ask on a read stalls every sweep.
  for (const read of [
    'ppc_goals_get',
    'ppc_google_campaign_settings_get',
    'ppc_bing_campaign_ai_settings_get',
    'ppc_bing_url_tracking_get',
    'ppc_conversion_adjustments_get',
    'ppc_experiment_readout',
    'ppc_google_ads_text_get',
  ]) {
    assert.equal(LIVE_CHANGE_WRITES.has(read), false, `${read} is a read`);
    assert.equal(decision(decideWithGuardrails(payload(read, cwd))), 'allow', `${read} must stay pre-approved`);
  }
  // Writes judged and left off on purpose (test/permission-critical.test.mjs),
  // and the direction that narrows: the hook has no opinion on them.
  for (const write of [
    'ppc_claims_set',
    'ppc_google_account_negatives_add',
    'ppc_experiment_discard',
    'ppc_experiment_end',
    'seo_gtm_tag_delete',
    'crm_deal_create',
  ]) {
    assert.equal(decideWithGuardrails(payload(write, cwd)), null, `${write} should get no answer from the hook`);
  }
  // The memory and form-capture set is untouched by this one.
  for (const name of LIVE_CHANGE_NAMES) {
    assert.equal(ALWAYS_ASK_WRITES.has(name), false, `${name} belongs on one always-ask map, not both`);
  }
});
