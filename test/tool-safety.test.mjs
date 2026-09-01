/**
 * The rule that decides which Hiveku tools run unattended.
 *
 * The weight here is deliberately on what must NOT be auto-approved. A false
 * negative costs a permission prompt; a false positive lets an unattended
 * destructive call through on every machine that installs the plugin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HIVEKU_TOOL_PREFIX,
  decideForPayload,
  hivekuToolName,
  isReadOnlyTool,
  readOnlyCount,
} from '../lib/tool-safety.mjs';

test('recognises this plugin\'s tools and no others', () => {
  assert.equal(hivekuToolName(`${HIVEKU_TOOL_PREFIX}crm_deal_list`), 'crm_deal_list');
  // Another server's tools are none of this hook's business, even if the name
  // reads as safe -- expressing an opinion about them would be overreach.
  for (const other of [
    'mcp__plugin_serena_serena__read_file',
    'mcp__sentry__search_issues',
    'Bash',
    'Read',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(hivekuToolName(other), null, `should ignore ${String(other)}`);
  }
  // The prefix alone, with no tool after it, is not a tool.
  assert.equal(hivekuToolName(HIVEKU_TOOL_PREFIX), null);
});

test('auto-approves plain reads', () => {
  // ★ REAL tool names only. An earlier version of this test used invented ones
  // (crm_deal_list, seo_rankings_report, project_files_status) which passed
  // happily against the old naming heuristic and do not exist. That is exactly
  // the failure the generated list is meant to prevent, so the fixtures must
  // come from the real world too.
  for (const t of [
    'account_context_get', 'account_entitlements', 'account_audit_health',
    'list_projects', 'list_tasks', 'connections_status', 'sites_list',
    'crm_account_summary', 'crm_calls_list', 'crm_calendar_list',
    'accounting_pnl_summary', 'memory_list',
  ]) {
    assert.equal(isReadOnlyTool(t), true, `${t} should be auto-approved`);
  }
});

test('every entry in the generated list is accepted by both gates', () => {
  // If the second gate rejects something the server declared GET, the two
  // gates disagree and someone should look at why -- silently dropping tools
  // is how a sweep starts stalling again.
  const raw = JSON.parse(
    readFileSync(new URL('../lib/readonly-tools.json', import.meta.url), 'utf8'),
  );
  const rejected = raw.tools.filter((t) => !isReadOnlyTool(t));
  assert.deepEqual(rejected, [], `write-verb gate rejected server-declared reads: ${rejected.join(', ')}`);
});

test('NEVER auto-approves a write, however it is spelled', () => {
  for (const t of [
    'crm_create_deal', 'crm_deal_update', 'crm_contact_delete', 'project_files_bulk_save',
    'project_vcs_commit', 'deploy_site', 'email_campaign_send', 'social_post_publish',
    'accounting_bill_pay', 'accounting_invoice_refund', 'mcp_key_rotate',
    'workflow_run', 'project_build_execute', 'contact_import', 'media_upload',
  ]) {
    assert.equal(isReadOnlyTool(t), false, `${t} must NOT be auto-approved`);
  }
});

test('the backstop catches destruction even if the list were mis-generated', () => {
  // Defence in depth against a bad generation. These fail the membership gate
  // too; the point is that a name containing `delete`/`purge` would ALSO fail
  // the second gate, so a corrupt list cannot auto-approve destruction.
  for (const t of ['crm_contact_get_and_delete', 'project_list_and_purge', 'account_wipe_get', 'key_revoke_list']) {
    assert.equal(isReadOnlyTool(t), false, `${t} must not be auto-approved`);
  }
});

test('★ the real leak the naming heuristic admitted stays out', () => {
  // voice_voicemail_mark_read ends in "read", carries no write verb, and
  // mutates. The naming rule auto-approved it; the server says POST, and the
  // `mark` verb catches it a second time. This is why the gate is the server's
  // method and not the tool's name.
  assert.equal(isReadOnlyTool('voice_voicemail_mark_read'), false);
});

test('unmapped tools are asked about unless explicitly vetted', () => {
  // talk_to_department has no HTTP mapping AND runs a department agent, which
  // has side effects. list_departments is the one vetted exception.
  assert.equal(isReadOnlyTool('talk_to_department'), false);
  assert.equal(isReadOnlyTool('list_departments'), true);
});

test('the generated list is present and plausible', () => {
  // A missing or corrupt list makes isReadOnlyTool() return false for
  // everything -- degraded but safe. This catches that silently shipping.
  assert.ok(readOnlyCount() > 400, `only ${readOnlyCount()} read-only tools loaded`);
  assert.ok(readOnlyCount() < 900, `${readOnlyCount()} is too many to be GET-only`);
});

test('outward-facing actions are never auto-approved', () => {
  // An email or a post cannot be recalled. Same reason the house rules say to
  // ask before anything public-facing.
  for (const t of ['email_campaign_send', 'social_post_publish', 'voice_sms_send', 'crm_contact_invite']) {
    assert.equal(isReadOnlyTool(t), false, `${t} is outward-facing and must be asked about`);
  }
});

test('says nothing at all about tools it has no opinion on', () => {
  // Silence leaves the normal permission flow untouched. The hook may only ever
  // ADD an approval, so a bug can make Claude ask more often, never less.
  assert.equal(decideForPayload({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }), null);
  assert.equal(decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}crm_contact_delete` }), null);
  assert.equal(decideForPayload({}), null);
  assert.equal(decideForPayload(null), null);
  assert.equal(decideForPayload({ tool_name: 'mcp__other__get_thing' }), null);
});

test('emits exactly the envelope the client parses', () => {
  const out = decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}account_context_get` });
  assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
  const h = out.hookSpecificOutput;
  // Verified live against Claude Code 2.1.114: the hook ran, returned this
  // shape, and the tool executed without a prompt.
  assert.equal(h.hookEventName, 'PreToolUse');
  assert.equal(h.permissionDecision, 'allow');
  assert.equal(typeof h.permissionDecisionReason, 'string');
  assert.ok(h.permissionDecisionReason.length > 0);
  // Must survive JSON.stringify unchanged -- the hook writes it to stdout.
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
});

test('is case-insensitive and survives junk input', () => {
  assert.equal(isReadOnlyTool('ACCOUNT_CONTEXT_GET'), true);
  assert.equal(isReadOnlyTool('CRM_CONTACT_DELETE'), false);
  for (const junk of ['', null, undefined, 42, {}, []]) {
    assert.equal(isReadOnlyTool(junk), false);
  }
});

test('a name that merely looks like a read is not enough', () => {
  // Membership in the generated list is required. An invented name that reads
  // perfectly is still refused, because the server never declared it.
  assert.equal(isReadOnlyTool('totally_plausible_list'), false);
  assert.equal(isReadOnlyTool('blocklist_add'), false);
});

// ── Guardrail ceilings (0.10.0) ────────────────────────────────────────────
import { decideWithGuardrails } from '../lib/tool-safety.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function folderWith(guardrails) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-guard-'));
  if (guardrails !== undefined) {
    mkdirSync(join(dir, '.hiveku'), { recursive: true });
    writeFileSync(join(dir, '.hiveku', 'guardrails.json'),
      typeof guardrails === 'string' ? guardrails : JSON.stringify(guardrails));
  }
  return dir;
}
const payload = (tool, cwd) => ({ tool_name: `mcp__plugin_hiveku_hk__${tool}`, cwd });
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;

test('reads-only folder refuses a write and says who set the ceiling', () => {
  const cwd = folderWith({ version: 1, mode: 'reads-only' });
  assert.equal(decision(decideWithGuardrails(payload('ppc_budget_update', cwd))), 'deny');
  // reads still auto-approve straight through the ceiling
  assert.equal(decision(decideWithGuardrails(payload('crm_list_contacts', cwd))), 'allow');
});

test('deny_tools beats everything, ask_tools forces the prompt', () => {
  const cwd = folderWith({ version: 1, mode: 'full',
    deny_tools: ['site_delete'], ask_tools: ['email_campaign_send_now'] });
  assert.equal(decision(decideWithGuardrails(payload('site_delete', cwd))), 'deny');
  assert.equal(decision(decideWithGuardrails(payload('email_campaign_send_now', cwd))), 'ask');
});

test('a MALFORMED guardrails file fails CLOSED for writes, open for reads', () => {
  // A broken ceiling that silently vanishes is how a cap stops existing
  // without anyone deciding that.
  const cwd = folderWith('{not json');
  assert.equal(decision(decideWithGuardrails(payload('ppc_budget_update', cwd))), 'deny');
  assert.equal(decision(decideWithGuardrails(payload('crm_list_contacts', cwd))), 'allow');
});

test('no guardrails file changes nothing', () => {
  const cwd = folderWith(undefined);
  assert.equal(decision(decideWithGuardrails(payload('crm_list_contacts', cwd))), 'allow');
  assert.equal(decideWithGuardrails(payload('ppc_budget_update', cwd)), null);
});

// ── Per-call gates: NEVER_AUTO_APPROVE + ARG_GATED_READS (voice program) ───
//
// `isReadOnlyTool` answers about the TOOL; `isAutoApprovable` answers about
// the CALL. These cases pin the two override rails added for the 2026-08-29
// voice audit: a GET whose response is itself the hazard (an unauthenticated
// recording URL) and a read whose safety depends on its arguments.
import { ARG_GATED_READS, NEVER_AUTO_APPROVE, isAutoApprovable } from '../lib/tool-safety.mjs';
import { PENDING_TOOLS } from './pending-tools.mjs';

test('vetoed reads never auto-approve, even while the server lists them as reads', () => {
  // voice_recording_url_get IS a server-declared GET today; the veto must win.
  // voice_tts_preview is a pending POST kept here as defence in depth against
  // a mis-generated list — either way, neither may run unattended.
  for (const t of ['voice_recording_url_get', 'voice_tts_preview']) {
    assert.equal(isAutoApprovable(t, {}), false, `${t} must never be auto-approvable`);
    assert.equal(isAutoApprovable(t, undefined), false, `${t} must never be auto-approvable (no input)`);
    assert.equal(
      decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${t}`, tool_input: {} }),
      null,
      `${t} must fall through to the normal permission prompt`,
    );
  }
});

test('voice_voicemails_list auto-approves ONLY the explicit metadata form', () => {
  // The route returns a presigned recording URL per voicemail unless
  // audio_urls === 'false'. Fail closed: no input, empty input, or the wrong
  // type must all fall back to the prompt.
  assert.equal(isAutoApprovable('voice_voicemails_list', { audio_urls: 'false' }), true);
  for (const input of [{}, undefined, null, { audio_urls: 'true' }, { audio_urls: false }, { audio_urls: 'FALSE' }]) {
    assert.equal(
      isAutoApprovable('voice_voicemails_list', input),
      false,
      `voice_voicemails_list with ${JSON.stringify(input)} must not auto-approve`,
    );
  }
  const allowed = decideForPayload({
    tool_name: `${HIVEKU_TOOL_PREFIX}voice_voicemails_list`,
    tool_input: { audio_urls: 'false' },
  });
  assert.equal(allowed?.hookSpecificOutput?.permissionDecision, 'allow');
  assert.equal(
    decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}voice_voicemails_list`, tool_input: {} }),
    null,
  );
});

test('every override name is real and consistent with the generated lists', () => {
  // A veto on a name that exists nowhere is a typo that protects nothing; a
  // veto on a name the readonly list carries but the index says is not a GET
  // means one of the generated files is stale. Both must fail loudly.
  const readonly = new Set(
    JSON.parse(readFileSync(new URL('../lib/readonly-tools.json', import.meta.url), 'utf8')).tools,
  );
  const index = new Map(
    JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8'))
      .tools.map((t) => [t.name, t.method]),
  );
  const overrides = [...NEVER_AUTO_APPROVE, ...Object.keys(ARG_GATED_READS)];
  for (const name of overrides) {
    assert.ok(
      index.has(name) || PENDING_TOOLS.has(name),
      `${name} is in an override but exists neither in the tool index nor PENDING_TOOLS — a typo gates nothing`,
    );
    if (readonly.has(name)) {
      // The override is LIVE: the list says read, so the index must agree it
      // is a GET, and the override must actually bite on a bare call.
      assert.equal(
        index.get(name),
        'GET',
        `${name} sits in readonly-tools.json but the index says ${index.get(name)} — stale generated list`,
      );
      assert.equal(
        isAutoApprovable(name, {}),
        false,
        `${name} is in the readonly list yet its override does not bite — stale override`,
      );
    } else if (index.has(name)) {
      // Not in the readonly list: fine for a write, but a GET missing from
      // the readonly list means the generated list has drifted.
      assert.notEqual(
        index.get(name),
        'GET',
        `${name} is a GET in the index but absent from readonly-tools.json — regenerate the list`,
      );
    }
  }
});

// ── Wrapper tools carry other calls (0.19.2) ───────────────────────────────
//
// hiveku_batch put the real calls in tool_input.calls[].tool while every gate in
// tool-safety.mjs read the one name on the payload. A batch of denied tools
// therefore matched no rule, returned null ("no opinion"), and fell through to
// the user's own `allow: mcp__plugin_hiveku_hk__*` settings entry — so calls that
// prompt or are refused individually ran with no prompt at all.
//
// These drive the real decision functions. Deleting batchMemberNames from
// tool-safety.mjs fails every assertion below.
const batch = (calls, cwd) => ({
  tool_name: 'mcp__plugin_hiveku_hk__hiveku_batch',
  tool_input: { calls },
  cwd,
});

test('a batch cannot launder a guardrail-DENIED tool', () => {
  const cwd = folderWith({ version: 1, mode: 'full', deny_tools: ['site_delete'] });
  // The direct call is refused...
  assert.equal(decision(decideWithGuardrails(payload('site_delete', cwd))), 'deny');
  // ...so the batched one must be too, and must name the member, not the wrapper.
  const r = decideWithGuardrails(batch([
    { tool: 'list_projects', args: {} },
    { tool: 'site_delete', args: { site_id: 'x' } },
  ], cwd));
  assert.equal(decision(r), 'deny');
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /site_delete/);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /inside hiveku_batch/);
});

test('a batch cannot launder a guardrail ASK tool', () => {
  const cwd = folderWith({ version: 1, mode: 'full', ask_tools: ['email_campaign_send_now'] });
  const r = decideWithGuardrails(batch([{ tool: 'email_campaign_send_now', args: {} }], cwd));
  assert.equal(decision(r), 'ask');
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /email_campaign_send_now/);
});

test('a reads-only ceiling holds against a batched write', () => {
  const cwd = folderWith({ version: 1, mode: 'reads-only' });
  const r = decideWithGuardrails(batch([
    { tool: 'list_projects', args: {} },
    { tool: 'ppc_budget_update', args: {} },
  ], cwd));
  assert.equal(decision(r), 'deny');
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /ppc_budget_update/);
});

test('a batch of writes ASKS even with no guardrails file', () => {
  // The bypass did not need a guardrails file: null meant the wildcard allow in
  // the user's settings decided it. An explicit ask is the whole fix on the
  // default install.
  const cwd = folderWith(undefined);
  const r = decideWithGuardrails(batch([
    { tool: 'site_delete', args: {} },
    { tool: 'deploy_site', args: {} },
  ], cwd));
  assert.equal(decision(r), 'ask');
});

test('a batch of pure reads is still auto-approved', () => {
  // The gate must not make batching useless: an all-read batch is exactly the
  // case the tool exists for and still costs no prompt.
  const cwd = folderWith(undefined);
  assert.equal(decision(decideWithGuardrails(batch([
    { tool: 'list_projects', args: {} },
    { tool: 'get_project', args: {} },
  ], cwd))), 'allow');
});

test('per-member ARGUMENT gates apply inside a batch', () => {
  // voice_voicemails_list is a read only when it is not minting audio links.
  // The gate has to see THAT member's args, not the batch's.
  const cwd = folderWith(undefined);
  assert.equal(decision(decideWithGuardrails(batch(
    [{ tool: 'voice_voicemails_list', args: {} }], cwd))), 'ask');
  assert.equal(decision(decideWithGuardrails(batch(
    [{ tool: 'voice_voicemails_list', args: { audio_urls: 'false' } }], cwd))), 'allow');
});

test('NEVER_AUTO_APPROVE survives being batched', () => {
  const cwd = folderWith(undefined);
  assert.equal(decision(decideWithGuardrails(batch([
    { tool: 'list_projects', args: {} },
    { tool: 'voice_recording_url_get', args: {} },
  ], cwd))), 'ask');
});

test('an unreadable batch fails CLOSED, and harder when a ceiling exists', () => {
  // "Not a batch" and "a batch I cannot inspect" must not take the same branch.
  const bare = folderWith(undefined);
  assert.equal(decision(decideWithGuardrails(batch([{ tool: '', args: {} }], bare))), 'ask');
  const ceilinged = folderWith({ version: 1, mode: 'full', deny_tools: ['site_delete'] });
  assert.equal(decision(decideWithGuardrails(batch([{ args: {} }], ceilinged))), 'deny');
  // An empty calls list is unreadable too - it must not read as "nothing to check".
  assert.equal(decision(decideWithGuardrails(batch([], ceilinged))), 'deny');
});

test('a prefixed member name is matched the same as a bare one', () => {
  // The model may spell a member either way; requiring one spelling is how a
  // gate quietly stops matching.
  const cwd = folderWith({ version: 1, mode: 'full', deny_tools: ['site_delete'] });
  assert.equal(decision(decideWithGuardrails(batch(
    [{ tool: 'mcp__plugin_hiveku_hk__site_delete', args: {} }], cwd))), 'deny');
});

test('non-batch tools are unaffected by member expansion', () => {
  // A regular tool that happens to carry a `calls` argument must still be judged
  // on its own name.
  const cwd = folderWith(undefined);
  assert.equal(decision(decideForPayload({
    tool_name: 'mcp__plugin_hiveku_hk__list_projects',
    tool_input: { calls: [{ tool: 'site_delete', args: {} }] },
    cwd,
  })), 'allow');
});
