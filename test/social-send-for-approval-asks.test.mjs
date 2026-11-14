/**
 * HK-1607 (2026-11-13): a person's Send for approval asks first on every install.
 *
 * social_post_send_for_approval (POST) holds a draft or a scheduled post for someone's approval: a scheduled post then
 * does not go out at its time until it is approved, and approving one with no time, or one whose time has passed,
 * publishes it at once. Hiveku takes it from the Hiveku app's own key alone, so the index (read with an agent key)
 * never carries it, and it stays in test/pending-tools.mjs for good, as the six Social app writes before it do. It asks
 * anyway: it is on the ask list (INSTALL.md mirrors it, and so does the Codex plugin) and on LIVE_CHANGE_WRITES.
 * test/live-change-writes.test.mjs pins the ask on a direct call, in a batch and under a reads-only folder; this file
 * pins what the person is told, and that the read beside it (who can approve a post) is never asked.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALWAYS_ASK_WRITES,
  HIVEKU_TOOL_PREFIX,
  LIVE_CHANGE_WRITES,
  decideForPayload,
} from '../lib/tool-safety.mjs';
import { PENDING_TOOLS } from './pending-tools.mjs';

const NAME = 'social_post_send_for_approval';
const permFile = JSON.parse(readFileSync(new URL('../data/permission-critical-tools.json', import.meta.url), 'utf8'));
const decide = (name, toolInput = {}) => decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${name}`, tool_input: toolInput });

test('Send for approval is on the ask list as a POST, contracted for good beside the other Social app writes', () => {
  const entry = permFile.tools.find((t) => t.name === NAME);
  assert.ok(entry, `${NAME} must be on the ask list`);
  assert.equal(entry.method, 'POST', 'the tool server maps it to POST /api/olympus/social/posts/:postId/send-for-approval');
  assert.deepEqual(PENDING_TOOLS.get(NAME), { since: '2026-11-13', batch: 'HK-1607' });
  assert.match(entry.why_gated, /a scheduled post does not go out at its time until someone approves it/);
  assert.match(entry.why_gated, /approving one with no time, or one whose time has passed, publishes it at once/);
  assert.match(entry.why_gated, /Hiveku takes it from the Hiveku app's own key only$/);
  assert.doesNotMatch(entry.why_gated, /[–—]/, 'no dashes in a reason the person reads');
});

test('every call asks, and the prompt says what the ask list says', () => {
  for (const input of [
    { post_id: 'p' },
    { post_id: 'p', approver_id: 'u', scheduled_at: '2026-11-20T15:00:00Z' },
    { post_id: 'p', scheduled_at: null },
  ]) {
    const r = decide(NAME, input);
    assert.equal(r?.hookSpecificOutput?.permissionDecision, 'ask', `${JSON.stringify(input)} must ask`);
    assert.ok(
      r.hookSpecificOutput.permissionDecisionReason.startsWith(`${NAME} ${LIVE_CHANGE_WRITES.get(NAME)}`),
      'the prompt carries its own reason',
    );
  }
  assert.equal(
    LIVE_CHANGE_WRITES.get(NAME),
    permFile.tools.find((t) => t.name === NAME).why_gated,
    'the hook and the ask list give the person the same reason',
  );
  assert.equal(ALWAYS_ASK_WRITES.has(NAME), false, 'it belongs on one always-ask map, LIVE_CHANGE_WRITES');
});

test('who can approve a post is a read: never asked, never on the ask list', () => {
  const r = decide('social_post_approvers_list', { post_id: 'p' });
  assert.notEqual(r?.hookSpecificOutput?.permissionDecision, 'ask');
  assert.equal(permFile.tools.some((t) => t.name === 'social_post_approvers_list'), false);
});
