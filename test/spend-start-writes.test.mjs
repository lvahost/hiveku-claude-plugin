/**
 * Every write that can switch ads on, or restart them, asks first
 * (release 0.26.36).
 *
 * Budgets, bids, bidding strategy and campaign create already asked, but the
 * call that turns ads on did not. ppc_enable_resource and
 * ppc_platform_enable_resource have no confirm step and no budget check, and
 * every "created PAUSED" create in the paid-ads surface points at them, so on a
 * machine with the INSTALL.md blanket allow an unattended session could enable
 * a campaign someone paused on purpose and nobody was asked.
 * spend-change-discipline.md 4.4 and 4.5 told owners to add an ask rule by
 * hand for the two enable tools; the plugin now asks on its own.
 *
 * Enumerated 2026-09-26 against the live server (MCP c4adbac, then d4a73ba)
 * and the builder and marketing-agent code behind each route:
 *   gated here, switching on by status  ppc_enable_resource (Google),
 *               ppc_platform_enable_resource (Google, Microsoft, Meta,
 *               LinkedIn, TikTok, Amazon, Vibe, ChatGPT Ads), ppc_bulk_edit
 *               (ENABLED status ops), ppc_linkedin_creatives (set-status
 *               enabled; its server confirm is filled in by the model),
 *               ppc_tiktok_split_tests (create starts a spending test, update
 *               extends one; no confirm).
 *   gated here, restarting or widening  ppc_recommendation_apply (a Google
 *               recommendation can change the bidding strategy or switch on
 *               broad match or search partners, around the gated bidding
 *               writes), ppc_meta_campaign_update (a later stop_time),
 *               ppc_linkedin_campaign_update and
 *               ppc_linkedin_campaign_group_update (a later end_date; the group
 *               tool also sets group budgets, set nowhere else). None of the
 *               four has a confirm on that path.
 *   already gated  ppc_campaign_create, the experiment money steps
 *               (ppc_experiment_schedule, _graduate, _promote,
 *               _treatment_set, ppc_bing_experiment_create, _update),
 *               ppc_connection_update (is_active).
 *   judged and left off  the creates that land PAUSED or DRAFT and have no
 *               status argument (ppc_platform_ad_group_create, both RSA
 *               creates, ppc_bing_push_campaign, ppc_meta_campaign_push,
 *               ppc_meta_ad_set_create, ppc_meta_ad_create,
 *               ppc_meta_advantage_create, ppc_linkedin_campaign_group_create,
 *               ppc_linkedin_creative_create, ppc_linkedin_boost_post,
 *               ppc_google_pmax), ppc_keyword_add and ppc_platform_keyword_add
 *               (ordinary build work; spend-change-discipline.md 4.4 says
 *               they do not ask), the pauses, and the three written
 *               exemptions in SPEND_START_NOT_GATED below.
 *
 * Six gated tools are MIXED (they also pause, read or rename). They are gated
 * by name, whole tool: the INSTALL.md ask rule and the Codex prompt entry can
 * only name a tool, so an argument-aware hook rule would leave the three
 * lists disagreeing. The tests below pin that honestly: a pause-only
 * ppc_bulk_edit asks, a rename asks, and a single pause does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  HIVEKU_TOOL_PREFIX,
  LIVE_CHANGE_WRITES,
  decideWithGuardrails,
  isAutoApprovable,
} from '../lib/tool-safety.mjs';
import { probeIsStale, updateCheckPath } from '../lib/update-check.mjs';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const permFile = readJson('../data/permission-critical-tools.json');
const indexTools = readJson('../lib/tool-index.json').tools;

/**
 * The writes that can switch delivery on, each with a call that turns
 * something on and (for the mixed tools) a call that does not.
 */
const SPEND_START_WRITES = {
  ppc_enable_resource: {
    on: { connection_id: 'c', resource_type: 'campaign', resource_id: '123' },
  },
  ppc_platform_enable_resource: {
    on: { connection_id: 'c', resource_type: 'ad_group', resource_id: '456', campaign_id: '123' },
  },
  ppc_bulk_edit: {
    on: { connection_id: 'c', operations: [{ mutate_op: 'campaign_status', campaign_id: '1', status: 'ENABLED' }] },
    notOn: { connection_id: 'c', operations: [{ mutate_op: 'campaign_status', campaign_id: '1', status: 'PAUSED' }] },
  },
  ppc_linkedin_creatives: {
    on: { connection_id: 'c', operation: 'set-status', creative_id: '9', status: 'enabled', confirm: true },
    notOn: { connection_id: 'c', operation: 'list' },
  },
  ppc_tiktok_split_tests: {
    on: { connection_id: 'c', operation: 'create', params: { start_time: 's', end_time: 'e', split_test_level: 'ADGROUP', object_ids: ['1'] } },
    notOn: { connection_id: 'c', operation: 'result', params: { split_test_group_id: '7' } },
  },
};
const SPEND_START_NAMES = Object.keys(SPEND_START_WRITES);

/**
 * The writes that restart or widen delivery without a status change, each
 * with a call that does and (for the update tools) a rename that does not.
 */
const RESTART_WRITES = {
  ppc_recommendation_apply: {
    on: { connection_id: 'c', resource_name: 'customers/1/recommendations/2' },
  },
  ppc_meta_campaign_update: {
    on: { connection_id: 'c', campaign_id: '1', stop_time: '2026-12-31T00:00:00Z' },
    notOn: { connection_id: 'c', campaign_id: '1', name: 'Renamed' },
  },
  ppc_linkedin_campaign_update: {
    on: { connection_id: 'c', operation: 'update', campaign_id: '1', end_date: '2026-12-31' },
    notOn: { connection_id: 'c', operation: 'update', campaign_id: '1', name: 'Renamed' },
  },
  ppc_linkedin_campaign_group_update: {
    on: { connection_id: 'c', operation: 'update', group_id: '1', end_date: '2026-12-31', daily_budget: 200 },
    notOn: { connection_id: 'c', operation: 'update', group_id: '1', name: 'Renamed' },
  },
};
const RESTART_NAMES = Object.keys(RESTART_WRITES);
/** The restart writes the end-date signal below finds; the fourth is pinned by name only. */
const END_DATE_EDITS = ['ppc_meta_campaign_update', 'ppc_linkedin_campaign_update', 'ppc_linkedin_campaign_group_update'];
const ALL_GATED = { ...SPEND_START_WRITES, ...RESTART_WRITES };

/** One pause per lane: the safe direction, and it must stay silent. */
const PAUSES = ['ppc_pause_resource', 'ppc_platform_pause_resource'];

/**
 * How a tool in the index says it can switch delivery on. The index carries
 * no input schema, so these read the name and the description:
 *   - an enable-shaped name token;
 *   - a description that offers an on-status value ('ENABLED', 'active',
 *     status enabled) or a set-status operation;
 *   - a split test, which spends by construction;
 *   - an update tool that edits stop_time or end_date.
 * ppc_recommendation_apply carries none of these (its description names no
 * status), so it is pinned by name in RESTART_WRITES.
 */
const SPEND_START_SIGNALS = [
  ['name', (t) => /(^|_)(enable|activate|launch|unpause|resume)(_|$)/.test(t.name)],
  ['on-status value', (t) => /'(?:ENABLED|enabled|ACTIVE|active)'|\bstatus (?:enabled|ENABLED|ACTIVE)\b|set-status/.test(t.description || '')],
  ['split test', (t) => /split test/i.test(t.description || '')],
  // An update tool that edits a run's end date: a later one can put a campaign
  // that has ended back into delivery (release 0.26.36).
  ['end-date edit', (t) => /_update$/.test(t.name) && /\b(?:stop_time|end_date)\b/.test(t.description || '')],
];
const spendStartSignals = (t) => SPEND_START_SIGNALS.filter(([, match]) => match(t)).map(([label]) => label);
const spendStartClass = () => indexTools
  .filter((t) => /^ppc_/.test(t.name) && t.method && t.method !== 'GET')
  .filter((t) => spendStartSignals(t).length > 0);

/**
 * Paid-ads writes that carry a signal above and are deliberately NOT gated,
 * each with the reason it cannot start spend on its own. Same rules as the
 * exemption maps in test/permission-critical.test.mjs: added one at a time,
 * never to quiet a failure; if you cannot write the reason, gate the tool.
 */
const SPEND_START_NOT_GATED = new Map([
  ['ppc_ad_group_create',
    'can create a Google ad group already enabled, but a new ad group has no ads, and every Google ad '
    + 'this surface creates (ppc_responsive_search_ad_create, ppc_google_pmax groups) is PAUSED, so '
    + 'the step that starts spend is always the gated ppc_enable_resource on the ad'],
  ['ppc_google_conversion_actions',
    'its ENABLED status is a conversion action being counted, not an ad serving; nothing is shown '
    + 'or spent, and the conversion writes that move bidding are gated on their own'],
  ['ppc_linkedin_campaign_push',
    'names set-status only to say it refuses DRAFT to ACTIVE: the campaign is pushed as a DRAFT, '
    + 'drafts never spend, and only a person in LinkedIn Campaign Manager can launch one'],
]);

const gatedNames = new Set(permFile.tools.map((t) => t.name));

function folderWith(guardrails) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-spend-'));
  if (guardrails !== undefined) {
    mkdirSync(join(dir, '.hiveku'), { recursive: true });
    writeFileSync(join(dir, '.hiveku', 'guardrails.json'), JSON.stringify(guardrails));
  }
  return dir;
}
const payload = (tool, cwd, toolInput = {}) => ({ tool_name: `${HIVEKU_TOOL_PREFIX}${tool}`, tool_input: toolInput, cwd });
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

/** Runs the real hook as hooks/hooks.json does, with the update probe held off. */
function runPreToolUseHook(toolName, toolInput, cwd) {
  const dataDir = mkdtempSync(join(tmpdir(), 'hk-spend-data-'));
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

test('every spend-start and restart write is a real POST on the ask list, and on the hook with a reason', () => {
  const index = new Map(indexTools.map((t) => [t.name, t.method]));
  for (const name of [...SPEND_START_NAMES, ...RESTART_NAMES]) {
    assert.equal(index.get(name), 'POST', `${name} is not a POST in the tool index; a typo gates nothing`);
    const entry = permFile.tools.find((t) => t.name === name);
    assert.ok(entry, `${name} is not on data/permission-critical-tools.json, so INSTALL.md and Codex do not ask`);
    assert.equal(entry.method, 'POST');
    assert.ok(LIVE_CHANGE_WRITES.has(name), `${name} is not on LIVE_CHANGE_WRITES, so installs with an older ask list run it unprompted`);
    assert.match(LIVE_CHANGE_WRITES.get(name), /spend|deliverable/, `${name}: the prompt must say it starts or widens spend`);
  }
});

test('each spend-start and restart write asks on a direct call, whether or not its arguments turn anything on', () => {
  const cwd = folderWith(undefined);
  for (const [name, calls] of Object.entries(ALL_GATED)) {
    for (const input of [calls.on, calls.notOn].filter(Boolean)) {
      const r = decideWithGuardrails(payload(name, cwd, input));
      assert.equal(decision(r), 'ask', `${name} ${JSON.stringify(input)} must ask; silence is the blanket allow`);
      assert.match(reason(r), new RegExp(`^${name} `));
      assert.match(reason(r), /even when your settings allow all Hiveku tools/);
    }
    assert.equal(isAutoApprovable(name, calls.on), false, `${name} must never be pre-approved`);
  }
});

test('the mixed tools say in the prompt that they ask on every call', () => {
  const cwd = folderWith(undefined);
  const why = (name) => reason(decideWithGuardrails(payload(name, cwd, SPEND_START_WRITES[name].notOn)));
  assert.match(why('ppc_bulk_edit'), /pause-only ones too; a single pause through ppc_pause_resource/);
  assert.match(why('ppc_linkedin_creatives'), /List and detail calls ask too/);
  assert.match(why('ppc_tiktok_split_tests'), /Its reads ask too/);
  assert.match(why('ppc_tiktok_split_tests'), /copies the campaigns or ad groups under test/);
  const renameWhy = (name) => reason(decideWithGuardrails(payload(name, cwd, RESTART_WRITES[name].notOn)));
  for (const name of END_DATE_EDITS) {
    assert.match(renameWhy(name), /A rename asks too, because the gate is on the tool name/, name);
    assert.match(renameWhy(name), /back into delivery/, `${name}: the prompt must say an end date can restart it`);
  }
});

test('the real hook process asks before a restart write under the blanket allow', () => {
  const cwd = folderWith(undefined);
  for (const name of RESTART_NAMES) {
    const run = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}${name}`, RESTART_WRITES[name].on, cwd);
    assert.equal(run.status, 0, run.stderr);
    assert.notEqual(run.stdout, '', `the hook printed nothing, so the blanket allow would run ${name} unattended`);
    const out = JSON.parse(run.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'ask', name);
    assert.match(out.permissionDecisionReason, new RegExp(`^${name} `));
  }
});

test('keyword adds stay ungated: the lead left them to the agent\'s own yes', () => {
  const cwd = folderWith(undefined);
  for (const name of ['ppc_keyword_add', 'ppc_platform_keyword_add']) {
    assert.equal(gatedNames.has(name), false, `${name} is ordinary build work; it must not be on the ask list`);
    assert.equal(LIVE_CHANGE_WRITES.has(name), false, name);
    assert.equal(decideWithGuardrails(payload(name, cwd, { connection_id: 'c' })), null, name);
  }
});

test('the real hook process asks before an enable under the blanket allow', () => {
  const cwd = folderWith(undefined);
  for (const name of ['ppc_enable_resource', 'ppc_platform_enable_resource']) {
    const run = runPreToolUseHook(`${HIVEKU_TOOL_PREFIX}${name}`, SPEND_START_WRITES[name].on, cwd);
    assert.equal(run.status, 0, run.stderr);
    assert.notEqual(run.stdout, '', `the hook printed nothing, so the blanket allow would run ${name} unattended`);
    const out = JSON.parse(run.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'ask');
    assert.match(out.permissionDecisionReason, new RegExp(`^${name} turns a paused .* back on`));
  }
  // Contrast in the same folder: a pause gets no answer at all.
  const pause = runPreToolUseHook(
    `${HIVEKU_TOOL_PREFIX}ppc_platform_pause_resource`,
    { connection_id: 'c', resource_type: 'campaign', resource_id: '123' },
    cwd,
  );
  assert.equal(pause.status, 0, pause.stderr);
  assert.equal(pause.stdout, '', 'a pause is the safe direction and must stay silent');
});

test('a batch carrying an enable asks, and a reads-only folder denies it', () => {
  const cwd = folderWith(undefined);
  const r = decideWithGuardrails({
    tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
    tool_input: { calls: [
      { tool: 'ppc_campaign_list', args: {} },
      { tool: 'ppc_platform_enable_resource', args: SPEND_START_WRITES.ppc_platform_enable_resource.on },
    ] },
    cwd,
  });
  assert.equal(decision(r), 'ask');
  assert.match(reason(r), /ppc_platform_enable_resource/);
  const readsOnly = folderWith({ version: 1, mode: 'reads-only' });
  for (const [name, calls] of Object.entries(ALL_GATED)) {
    assert.equal(decision(decideWithGuardrails(payload(name, readsOnly, calls.on))), 'deny', name);
  }
});

test('every paid-ads write that can switch delivery on is gated or has a written reason', () => {
  const missing = spendStartClass()
    .filter((t) => !(gatedNames.has(t.name) && LIVE_CHANGE_WRITES.has(t.name)) && !SPEND_START_NOT_GATED.has(t.name))
    .map((t) => `${t.name} (${t.method}, matched by ${spendStartSignals(t).join(' + ')})`);
  assert.deepEqual(
    missing,
    [],
    'paid-ads writes that look able to switch ads on are not gated. Add each to '
      + 'data/permission-critical-tools.json, the INSTALL.md ask block, the Codex .mcp.json AND '
      + 'LIVE_CHANGE_WRITES in lib/tool-safety.mjs, or add it to SPEND_START_NOT_GATED with the '
      + 'reason it cannot start spend on its own:\n  ' + missing.join('\n  '),
  );
  // The pinned nine must be caught by the detector or pinned here, never neither.
  for (const name of [...SPEND_START_NAMES, ...RESTART_NAMES]) assert.ok(gatedNames.has(name), name);
});

test('every spend-start exemption is still live and still an exemption', () => {
  const byName = new Map(indexTools.map((t) => [t.name, t]));
  const stale = [];
  for (const [name, why] of SPEND_START_NOT_GATED) {
    const tool = byName.get(name);
    if (!tool) { stale.push(`${name}: no longer in the tool index; judge the new name`); continue; }
    if (spendStartSignals(tool).length === 0) stale.push(`${name}: no longer carries a signal; delete the entry`);
    if (gatedNames.has(name) || LIVE_CHANGE_WRITES.has(name)) stale.push(`${name}: exempted here but gated; delete the entry`);
    if (!why || why.length < 40) stale.push(`${name}: the reason is too thin to review`);
  }
  assert.deepEqual(stale, [], `stale spend-start exemptions:\n  ${stale.join('\n  ')}`);
});

test('NEGATIVE CONTROL: pausing stays ungated, and the paused creates stay silent', () => {
  const cwd = folderWith(undefined);
  for (const name of PAUSES) {
    assert.equal(gatedNames.has(name), false, `${name} pauses; it must not be on the ask list`);
    assert.equal(LIVE_CHANGE_WRITES.has(name), false, `${name} pauses; the hook must not ask`);
    assert.equal(decideWithGuardrails(payload(name, cwd, { connection_id: 'c', resource_type: 'campaign', resource_id: '1' })), null);
  }
  for (const name of [
    'ppc_ad_group_create',
    'ppc_platform_ad_group_create',
    'ppc_responsive_search_ad_create',
    'ppc_meta_ad_create',
    'ppc_linkedin_campaign_push',
    'ppc_google_conversion_actions',
  ]) {
    assert.equal(decideWithGuardrails(payload(name, cwd)), null, `${name} should get no answer from the hook`);
  }
  // The detector is not vacuous: take the exemptions away and what is left is
  // exactly the five status tools, the three end-date edits and the Microsoft
  // experiment update (gated since 0.26.30), so removing any of them from the
  // gate fails the class test above.
  const caught = spendStartClass().filter((t) => !SPEND_START_NOT_GATED.has(t.name)).map((t) => t.name).sort();
  assert.deepEqual(caught, [...SPEND_START_NAMES, ...END_DATE_EDITS, 'ppc_bing_experiment_update'].sort());
});
