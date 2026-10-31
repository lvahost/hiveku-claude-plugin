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
import { PENDING_TOOLS } from './pending-tools.mjs';

/** Every name 0.26.30 and 0.26.36 put on the hook, which is every name on the map. */
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
  'ppc_bing_rsa_text_update', // 0.27.8: Microsoft's twin of ppc_google_ad_text_update (HK-86)
  'ppc_meta_ad_text_update', // 0.27.10: Meta's twin of ppc_google_ad_text_update
  'ppc_negatives_remove',
  'ppc_bing_ad_extension_update',
  'ppc_bing_ad_extension_remove',
  'ppc_google_sitelink_update', // 0.27.12: Google's sitelink edit, the twin of ppc_bing_ad_extension_update
  // Experiments.
  'ppc_bing_experiment_create',
  'ppc_bing_experiment_update',
  'ppc_experiment_schedule',
  'ppc_experiment_graduate',
  'ppc_experiment_promote',
  'ppc_experiment_treatment_set',
  // Switching ads on or restarting them (0.26.36; test/spend-start-writes.test.mjs pins why).
  'ppc_enable_resource',
  'ppc_platform_enable_resource',
  'ppc_bulk_edit',
  'ppc_linkedin_creatives',
  'ppc_tiktok_split_tests',
  'ppc_recommendation_apply',
  'ppc_meta_campaign_update',
  'ppc_linkedin_campaign_update',
  'ppc_linkedin_campaign_group_update',
  // Switching a workflow on (0.26.36). Both were on the ask list before, not on the hook.
  'workflow_enable',
  'workflow_resume',
  // 0.27.73: a workflow's variables, which switched-on workflows read from their next run.
  'workflow_env_set',
  'workflow_env_delete',
  // 0.27.76: switching email marketing on, which switched-on workflows' email steps and held drips wait on.
  'marketing_activate',
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
  // The desktop app's Ads area, wave B (MCP #346): approving what the Ads AI staged, the three go-live
  // switches, the campaign, ad group and ad edits on the platform, and the conversion-upload writes.
  'marketing_approval_approve',
  'marketing_offline_conversions_go_live',
  'ppc_conversion_adjustments_go_live',
  'ppc_meta_lead_quality_enable',
  'ppc_campaign_update',
  'ppc_ad_group_status_set',
  'ppc_ad_status_set',
  'marketing_offline_conversions_set_enabled',
  'marketing_offline_conversions_run',
  'marketing_offline_conversions_requeue',
  'marketing_offline_conversions_designate',
  // A live site, and GA4 conversion settings.
  'agent_approval_approve',
  'seo_ga4_key_event_update',
  'seo_ga4_event_create_rule_update',
  // 0.27.14: a subscription that can charge a card, and a GA4 archive.
  'accounting_subscription_create',
  'seo_ga4_custom_definition_archive',
  // 0.27.15: moving a Microsoft campaign between budgets, a Microsoft shared budget's amount, and
  // which conversions a Google campaign bids toward (each confirmed on the server only).
  'ppc_bing_campaign_budget_move',
  'ppc_bing_shared_budget_update',
  'ppc_google_campaign_conversion_goals_set',
  // 0.27.19: joining the merge line is the approval to merge into Your site.
  'project_vcs_queue_add',
  // 0.27.58: the account's timezone, and what the website assistant may tell visitors.
  'account_timezone_set',
  'helpdesk_assistant_knowledge_sources_update',
  // 0.27.24: a site's secrets reach the running site (and production, without a tier).
  'project_secrets_set',
  'project_secrets_delete',
  'project_secrets_apply_to_preview',
  'project_secrets_mark_sensitive',
  'project_secrets_replace',
  // 0.27.58: an account's environment groups reach every linked site (builder #1517, MCP #236).
  'env_group_create',
  'env_group_update',
  'env_group_delete',
  'env_group_set',
  'env_group_link',
  'env_group_unlink',
  // 2026-10-22: a site's trusted networks skip the per-address limit on that site.
  'site_firewall_trust_range',
  // A site's server capacity and page caching (2026-10-24, MCP #288).
  'project_concurrency_set',
  'project_page_cache_set',
  // Visitor Intelligence on a site: it identifies visitors against the monthly allowance (HK-727).
  'analytics_visitor_intelligence_start',
  // Lead lists: starting or resuming a run spends money and can feed a sending campaign (MCP #307).
  'outbound_lead_list_run_start',
  'outbound_lead_list_run_control',
  // Contract alerts and templates: outside addresses get a client's signed contract (wave 73).
  'crm_envelope_alerts_set',
  'crm_contract_template_create',
  'crm_contract_template_update',
  // Contract starts, edits and signer changes: outside addresses get a client's signed contract,
  // or a new signer gets a signing link (wave 73, A2).
  'crm_envelope_create_from_template',
  'crm_envelope_signer_reassign',
  'crm_envelope_create',
  'crm_envelope_update',
  // A site's test lead email (a real email to its lead addresses) and a content entry's scheduled
  // publish (the whole site goes out at that time) (Website Builder wave B).
  'marketing_form_notifications_test',
  'cms_schedule_set',
  // A contact email waiting to send, cancelled for good (the desktop app's contact record).
  'crm_email_scheduled_cancel',
  // The desktop app's Automations editor and Pending AI actions: one step run for real, and an AI
  // step's staged action approved or rejected.
  'workflow_node_run',
  'workflow_pending_action_decide',
  // The desktop app's SEO page, wave B (MCP #353): a task's change published to the live site, the
  // Business Profile post writes, the rank tracker's check now, bulk add and AI platforms for every
  // keyword, and the website report writes that spend research or make, change or delete a public page.
  'seo_task_deploy',
  'seo_gbp_post_create',
  'seo_gbp_post_update',
  'seo_gbp_post_delete',
  'seo_rankings_refresh',
  'seo_rankings_bulk_add',
  'seo_rankings_ai_backfill',
  'seo_website_report_create',
  'seo_website_report_delete',
  'seo_website_report_sections_set',
  // The desktop app's site pages, wave S1 (MCP #364): stopping a site's builds, so a change someone
  // published does not go live.
  'deploy_build_cancel',
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

test('the live-change set is exactly the writes 0.26.30 and 0.26.36 put on the hook', () => {
  assert.deepEqual([...LIVE_CHANGE_WRITES.keys()].sort(), [...LIVE_CHANGE_NAMES].sort());
});

test('every live-change name is a real, non-GET tool with a reason worth reading', () => {
  const index = new Map(
    JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8'))
      .tools.map((t) => [t.name, t.method]),
  );
  for (const [name, why] of LIVE_CHANGE_WRITES) {
    // A contracted tool (test/pending-tools.mjs) asks before the server ships it, so no install runs it
    // unasked in between; once it lands in the index, tool-names.test.mjs forces its PENDING entry out
    // and the method is checked here.
    const pending = PENDING_TOOLS.has(name) && !index.has(name);
    assert.ok(index.has(name) || pending, `${name} is not in the tool index; a typo gates nothing`);
    if (!pending) assert.ok(index.get(name) && index.get(name) !== 'GET', `${name} is a ${index.get(name)}; gate a read elsewhere`);
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

test('switching a workflow on asks through the real hook, whatever the settings allow', () => {
  // workflow_enable is the one tool that switches a workflow on (every create
  // makes it off, MCP #47), and workflow_resume clears an automatic pause. Both
  // were on the ask list only, so an install with an older copy of that list and
  // the blanket allow ran them unasked.
  const cwd = folderWith(undefined);
  for (const [name, pattern] of [
    ['workflow_enable', /^workflow_enable switches a workflow on\. From this call its webhook, schedule or event trigger runs it/],
    ['workflow_resume', /^workflow_resume clears an automatic pause, so the workflow's triggers run it for real again/],
  ]) {
    const run = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}${name}`, { workflow_id: 'w' }, cwd);
    assert.equal(run.status, 0, run.stderr);
    assert.notEqual(run.stdout, '', `the hook printed nothing, so the blanket allow would run ${name} unattended`);
    const out = JSON.parse(run.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'ask', name);
    assert.match(out.permissionDecisionReason, pattern);
  }
  // A batch that carries one asks too, and the switch-off direction stays silent.
  const batch = decideWithGuardrails({
    tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
    tool_input: { calls: [{ tool: 'workflow_list', args: {} }, { tool: 'workflow_enable', args: { workflow_id: 'w' } }] },
    cwd,
  });
  assert.equal(decision(batch), 'ask');
  assert.match(reason(batch), /workflow_enable/);
  assert.equal(decideWithGuardrails(payload('workflow_disable', cwd, { workflow_id: 'w' })), null, 'switching off is the safe direction');
  for (const read of ['workflow_list', 'workflow_get', 'workflow_stranded_list']) {
    assert.equal(decision(decideWithGuardrails(payload(read, cwd, { workflow_id: 'w' }))), 'allow', `${read} must stay pre-approved`);
  }
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
    'workflow_env_list',
    'marketing_setup_status',
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
