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
