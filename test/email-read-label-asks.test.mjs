/**
 * HK-1636 (2026-11-12): limiting what Hiveku reads of a connected Gmail inbox asks the person first.
 *
 * email_connection_read_label (PUT) limits what Hiveku reads of a connected Gmail inbox to one label, changes the
 * label, or removes the limit. A label narrows what Hiveku reads, so a reply without it no longer stops a sequence or
 * opens a ticket; removing the limit lets Hiveku read the whole mailbox again. It is on the ask list (INSTALL.md
 * mirrors it, and so does the Codex plugin) and on LIVE_CHANGE_WRITES, so the hook asks on every install, whatever its
 * settings allow, from this release on and before the tool server serves it (it waits in test/pending-tools.mjs until
 * the regenerated index carries it). test/live-change-writes.test.mjs pins the ask on a direct call, in a batch and
 * under a reads-only folder; this file pins what the person is told, and that the inbox reads beside it stay unasked.
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

const NAME = 'email_connection_read_label';
const permFile = JSON.parse(readFileSync(new URL('../data/permission-critical-tools.json', import.meta.url), 'utf8'));
const indexMethods = new Map(
  JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8')).tools.map((t) => [t.name, t.method]),
);
const decide = (name, toolInput = {}) => decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${name}`, tool_input: toolInput });

test('the read label is on the ask list as a PUT, contracted until the index carries it', () => {
  const entry = permFile.tools.find((t) => t.name === NAME);
  assert.ok(entry, `${NAME} must be on the ask list`);
  assert.equal(entry.method, 'PUT', 'the tool server maps it to PUT /api/olympus/email/connections/:connection_id/read-label');
  assert.ok(PENDING_TOOLS.has(NAME) || indexMethods.get(NAME) === 'PUT', `${NAME} is neither contracted nor indexed as a PUT`);
  assert.match(entry.why_gated, /removing the limit lets Hiveku read the whole mailbox again/);
  assert.match(entry.why_gated, /only the inbox's own person may change it/);
  assert.doesNotMatch(entry.why_gated, /[–—]/, 'no dashes in a reason the person reads');
});

test('the prompt tells the person both directions: what a label stops, and that clearing it reads the whole mailbox', () => {
  for (const input of [
    { connection_id: 'c', label_name: 'Hiveku', create: true },
    { connection_id: 'c', label_id: 'Label_12' },
    { connection_id: 'c', clear: true },
  ]) {
    const r = decide(NAME, input);
    assert.equal(r?.hookSpecificOutput?.permissionDecision, 'ask', `${JSON.stringify(input)} must ask`);
    const why = r.hookSpecificOutput.permissionDecisionReason;
    assert.match(why, /^email_connection_read_label limits what Hiveku reads of a connected Gmail inbox to one label/);
    assert.match(why, /a reply without the label stops no sequence and opens no ticket/);
    assert.match(why, /removing the limit lets Hiveku read the whole mailbox again/);
  }
  assert.equal(ALWAYS_ASK_WRITES.has(NAME), false, 'it belongs on one always-ask map, LIVE_CHANGE_WRITES');
  assert.doesNotMatch(LIVE_CHANGE_WRITES.get(NAME), /[–—]/, 'no dashes in a reason the person reads');
});

test("the orient passage names everyone Hiveku lets change the label, as Hiveku decides it", () => {
  // Hiveku takes the label from the inbox's own person, from an owner or admin for an inbox no one owns, and keeps a
  // label someone chose theirs while they are on the account. A passage that named the inbox's person alone sent an
  // admin away from limiting a shared inbox no one owns.
  const md = readFileSync(new URL('../skills/hiveku-orient/references/integrations.md', import.meta.url), 'utf8');
  const start = md.indexOf('**Reading one label only.**');
  assert.ok(start >= 0, 'the read label passage is in the orient integrations reference');
  const passage = md.slice(start, md.indexOf('\n\n', start)).replace(/\s+/g, ' ');
  for (const words of [
    "Only the inbox's own person may set, change or remove it, whatever their role",
    'an inbox no one owns: an owner or admin',
    'a label someone else chose stays theirs while they are on the account',
    '`read_label_not_yours`',
    '`read_label_owner_or_admin_required`',
    '`read_label_chosen_by_someone_else`',
    'the plugin asks before it runs',
  ]) {
    assert.ok(passage.includes(words), `the passage says: ${words}`);
  }
  assert.doesNotMatch(passage, /[–—]/, 'no dashes in the passage');
});

test('NEGATIVE CONTROL: the inbox reads beside it stay pre-approved', () => {
  // An ask on a read stalls every sweep that touches it.
  for (const read of ['email_connections_list', 'gmail_list_labels', 'email_inbox_setup_guide']) {
    assert.equal(LIVE_CHANGE_WRITES.has(read), false, `${read} is a read`);
    assert.equal(decide(read, { connection_id: 'c' })?.hookSpecificOutput?.permissionDecision, 'allow', `${read} must stay pre-approved`);
  }
});
