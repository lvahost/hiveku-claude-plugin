/**
 * The PreToolUse rules for the version tools (lib/vcs-tool-rules.mjs, versions
 * Wave 2, design Part 2 E1).
 *
 * project_vcs_commit with no files only saves what is already in the project
 * as a version, so it is pre-approved; with files it writes them, so it asks.
 * project_vcs_rollback is a dry run unless dry_run is literally false; an apply
 * always asks and is never auto-approved. These drive decideWithGuardrails,
 * the function `bin/hiveku hook pre-tool-use` calls. Deleting the
 * argGatedWriteDecision call from tool-safety.mjs turns every allow below into
 * null and every ask into null.
 *
 * Kept out of test/tool-safety.test.mjs on purpose (that file is another
 * lane's); the small helpers below are copies of that file's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideWithGuardrails, isAutoApprovable, isReadOnlyTool } from '../lib/tool-safety.mjs';
import { argGatedWriteDecision, ARG_GATED_WRITES } from '../lib/vcs-tool-rules.mjs';

function folderWith(guardrails) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-guard-'));
  if (guardrails !== undefined) {
    mkdirSync(join(dir, '.hiveku'), { recursive: true });
    writeFileSync(join(dir, '.hiveku', 'guardrails.json'),
      typeof guardrails === 'string' ? guardrails : JSON.stringify(guardrails));
  }
  return dir;
}
const decision = (r) => r?.hookSpecificOutput?.permissionDecision;
const batch = (calls, cwd) => ({
  tool_name: 'mcp__plugin_hiveku_hk__hiveku_batch',
  tool_input: { calls },
  cwd,
});

const PROJECT = '6d676101-0000-4000-8000-000000000001';
const vcs = (tool, input, cwd) => ({ tool_name: `mcp__plugin_hiveku_hk__${tool}`, tool_input: input, cwd });

test('a version save with no files (a promote) is pre-approved, on Your site and on a branch', () => {
  const cwd = folderWith(undefined);
  for (const input of [
    { project_id: PROJECT, message: 'Updated the pricing section on the Home page' },
    { project_id: PROJECT, message: 'x', files: [], deletedFiles: [] },
    { project_id: PROJECT, message: 'x', files: null },
    { project_id: PROJECT, branch: 'feature/pricing', message: 'x' },
  ]) {
    const r = decideWithGuardrails(vcs('project_vcs_commit', input, cwd));
    assert.equal(decision(r), 'allow', `promote ${JSON.stringify(input)} must be allowed`);
    assert.match(r.hookSpecificOutput.permissionDecisionReason, /as a version/);
  }
});

test('a version save that sends files or deletions ASKS', () => {
  const cwd = folderWith(undefined);
  for (const input of [
    { project_id: PROJECT, message: 'x', files: [{ path: 'src/app/page.tsx', content: 'x' }] },
    { project_id: PROJECT, message: 'x', deletedFiles: ['src/old.tsx'] },
    { project_id: PROJECT, message: 'x', deleted_files: ['src/old.tsx'] },
    { project_id: PROJECT, message: 'x', files: 'not-an-array' },
  ]) {
    const r = decideWithGuardrails(vcs('project_vcs_commit', input, cwd));
    assert.equal(decision(r), 'ask', `${JSON.stringify(input)} writes files and must ask`);
  }
  // A call whose input cannot be read asks rather than approving blind.
  assert.equal(decision(decideWithGuardrails(vcs('project_vcs_commit', 'garbage', cwd))), 'ask');
});

test('a rollback dry run is pre-approved; an apply always asks', () => {
  const cwd = folderWith(undefined);
  for (const input of [
    { project_id: PROJECT, commit_id: PROJECT },
    { project_id: PROJECT, commit_id: PROJECT, dry_run: true },
    // Only the literal boolean false applies; the route and the proxy agree.
    { project_id: PROJECT, commit_id: PROJECT, dry_run: 'false' },
    {},
  ]) {
    assert.equal(decision(decideWithGuardrails(vcs('project_vcs_rollback', input, cwd))), 'allow',
      `dry run ${JSON.stringify(input)} must be allowed`);
  }
  const apply = decideWithGuardrails(vcs('project_vcs_rollback',
    { project_id: PROJECT, commit_id: PROJECT, dry_run: false, expected_head_commit_id: PROJECT }, cwd));
  assert.equal(decision(apply), 'ask');
  assert.match(apply.hookSpecificOutput.permissionDecisionReason, /Your site/);
  assert.match(apply.hookSpecificOutput.permissionDecisionReason, /always asks/);
  const branchApply = decideWithGuardrails(vcs('project_vcs_rollback',
    { project_id: PROJECT, commit_id: PROJECT, branch: 'feature/x', dry_run: false }, cwd));
  assert.equal(decision(branchApply), 'ask');
  assert.match(branchApply.hookSpecificOutput.permissionDecisionReason, /the branch "feature\/x"/);
});

test('the version prompts speak plain language: "version", never commit/HEAD/revert', () => {
  const inputs = [
    ['project_vcs_commit', { project_id: PROJECT }],
    ['project_vcs_commit', { project_id: PROJECT, files: [{ path: 'a', content: 'b' }] }],
    ['project_vcs_commit', 'garbage'],
    ['project_vcs_rollback', { project_id: PROJECT }],
    ['project_vcs_rollback', { project_id: PROJECT, dry_run: false }],
  ];
  for (const [tool, input] of inputs) {
    const { reason } = argGatedWriteDecision(tool, input);
    assert.match(reason, /version/i, `${tool}: the reason must say "version"`);
    assert.doesNotMatch(reason, /\bcommit|HEAD|revert|\bmain\b/i, `${tool}: "${reason}"`);
  }
  assert.deepEqual([...ARG_GATED_WRITES.keys()].sort(), ['project_vcs_commit', 'project_vcs_rollback']);
  assert.equal(argGatedWriteDecision('project_file_save', {}), null, 'other tools get no version rule');
});

test('guardrails still come first: reads-only denies a promote, ask_tools prompts for it', () => {
  const readsOnly = folderWith({ version: 1, mode: 'reads-only' });
  assert.equal(decision(decideWithGuardrails(vcs('project_vcs_commit', { project_id: PROJECT }, readsOnly))), 'deny');
  const asks = folderWith({ version: 1, mode: 'full', ask_tools: ['project_vcs_commit'] });
  assert.equal(decision(decideWithGuardrails(vcs('project_vcs_commit', { project_id: PROJECT }, asks))), 'ask');
  const denies = folderWith({ version: 1, mode: 'full', deny_tools: ['project_vcs_rollback'] });
  assert.equal(decision(decideWithGuardrails(vcs('project_vcs_rollback', { project_id: PROJECT }, denies))), 'deny');
});

test('a batch of promotes and dry runs is allowed; a batch with a rollback apply asks', () => {
  const cwd = folderWith(undefined);
  const quiet = decideWithGuardrails(batch([
    { tool: 'project_vcs_commit', args: { project_id: PROJECT, message: 'x' } },
    { tool: 'project_vcs_rollback', args: { project_id: PROJECT, commit_id: PROJECT } },
    { tool: 'account_context_get', args: {} },
  ], cwd));
  assert.equal(decision(quiet), 'allow');
  const loud = decideWithGuardrails(batch([
    { tool: 'project_vcs_commit', args: { project_id: PROJECT, message: 'x' } },
    { tool: 'project_vcs_rollback', args: { project_id: PROJECT, commit_id: PROJECT, dry_run: false } },
  ], cwd));
  assert.equal(decision(loud), 'ask');
  assert.match(loud.hookSpecificOutput.permissionDecisionReason, /project_vcs_rollback/);
  const withFiles = decideWithGuardrails(batch([
    { tool: 'project_vcs_commit', args: { project_id: PROJECT, message: 'x', files: [{ path: 'a', content: 'b' }] } },
  ], cwd));
  assert.equal(decision(withFiles), 'ask');
});

test('NEGATIVE CONTROL: the version rules never make a version tool auto-approvable as a READ', () => {
  // isAutoApprovable gates the sweep, which calls tools with `{}` unattended.
  // A promote is allowed by the hook, but it must never be swept.
  assert.equal(isAutoApprovable('project_vcs_commit', {}), false);
  assert.equal(isAutoApprovable('project_vcs_rollback', {}), false);
  assert.equal(isReadOnlyTool('project_vcs_commit'), false);
});
