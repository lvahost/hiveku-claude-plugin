import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALWAYS_ASK_WRITES, LIVE_CHANGE_WRITES } from '../lib/tool-safety.mjs';
import { PENDING_TOOLS } from './pending-tools.mjs';

/**
 * HK-1922 (2026-11-28): crm_activity_recording_finalize saves an uploaded recording on its activity, where it stays in
 * the account's storage until the activity is deleted. Its MCP description does not say ASK THE PERSON FIRST, so the
 * MCP's own build cannot catch a missing entry: this plugin names it on every list before MCP #719 serves it. Step 1,
 * crm_activity_recording_presign, stays default.
 */
const NAME = 'crm_activity_recording_finalize';

test('the recording finalize asks: the hook always asks, with its reason', () => {
  assert.match(ALWAYS_ASK_WRITES.get(NAME), /uploaded recording file on a CRM activity for good/);
  assert.equal(LIVE_CHANGE_WRITES.has(NAME), false);
  assert.equal(ALWAYS_ASK_WRITES.has('crm_activity_recording_presign'), false, 'step 1 stays default');
});

test('the recording finalize is on the ask list and INSTALL.md, at the end of each', () => {
  const tools = JSON.parse(readFileSync(new URL('../data/permission-critical-tools.json', import.meta.url), 'utf8')).tools;
  const names = tools.map((t) => t.name);
  assert.equal(names.at(-1), NAME);
  assert.equal(names.filter((n) => n === NAME).length, 1, 'listed once');
  assert.equal(tools.find((t) => t.name === NAME).method, 'POST');
  const install = readFileSync(new URL('../INSTALL.md', import.meta.url), 'utf8');
  assert.match(install, /"mcp__plugin_hiveku_hk__dashboards_page_data_workflow_writer_stop",\n\s*"mcp__plugin_hiveku_hk__crm_activity_recording_finalize"\n\s*\]/);
});

test('the recording finalize waits in PENDING_TOOLS until the index is regenerated after MCP #719', () => {
  assert.deepEqual(PENDING_TOOLS.get(NAME), { since: '2026-11-28', batch: 'HK-1922' });
});
