/**
 * The site database's writes, and the writes and deletes of its app's sign-in, file storage, row security and server
 * functions, ask the person on every call, even under INSTALL.md's blanket allow.
 *
 * Until 2026-11-10 none of them was on the ask list or the hook. The hook said nothing, and under the blanket allow
 * nothing is a yes, so an assistant ran them with nobody asked: SQL that changes any number of rows, a deleted user,
 * bucket or function, a wider row security rule, a server function run for real, a sign-in link for a user of the
 * site's app. Those are permanent deletes and access changes, which always wait for a person.
 *
 * Every database_* and supabase_* tool the index carries must be sorted into WRITES or READS below, so a write
 * added later cannot run unasked the way these did: the index regenerated for a release fails this test until the
 * new name is sorted. WRITES ask; READS stay as they were, each named here (the supabase reads are POSTs, so none
 * is pre-approved).
 *
 * The 2026-11-10 review added three: database_provision and database_repair write the connections the live site
 * runs on (repair gives the database a new password at once), and supabase_storage_object_signed_url changes
 * nothing but answers with a link that opens a private file for anyone, for up to 7 days, which the builder treats
 * as minting a credential (its route leaves it out of the read set).
 *
 * Run: node --test test/database-and-supabase-writes-ask.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  decideForPayload,
  isAutoApprovable,
  LIVE_CHANGE_WRITES,
  ALWAYS_ASK_WRITES,
  HIVEKU_TOOL_PREFIX,
  HIVEKU_TOOL_PREFIXES,
} from '../lib/tool-safety.mjs';

const WRITES = [
  'database_execute',
  'database_provision',
  'database_repair',
  'supabase_migration_apply',
  'supabase_table_row_insert',
  'supabase_table_row_update',
  'supabase_table_row_delete',
  'supabase_policy_create',
  'supabase_policy_update',
  'supabase_policy_delete',
  'supabase_auth_user_create',
  'supabase_auth_user_update',
  'supabase_auth_user_delete',
  'supabase_auth_user_generate_link',
  'supabase_auth_config_update',
  'supabase_sync_redirect_urls',
  'supabase_configure_oauth',
  'supabase_configure_smtp',
  'supabase_configure_hiveku_smtp',
  'supabase_storage_create',
  'supabase_storage_delete',
  'supabase_storage_empty',
  'supabase_storage_object_upload',
  'supabase_storage_object_move',
  'supabase_storage_object_copy',
  'supabase_storage_object_delete',
  'supabase_storage_object_signed_url',
  'supabase_edge_functions_deploy',
  'supabase_edge_functions_delete',
  'supabase_edge_functions_invoke',
  'supabase_edge_functions_set_secrets',
];

const READS = [
  'database_describe',
  'database_query',
  'database_status',
  'database_tables',
  'supabase_auth_config_get',
  'supabase_auth_user_get',
  'supabase_auth_users_list',
  'supabase_edge_functions_get_source',
  'supabase_edge_functions_list',
  'supabase_gen_types',
  'supabase_migrations_list',
  'supabase_policies_list',
  'supabase_storage_list',
  'supabase_storage_object_download',
  'supabase_storage_objects_list',
  'supabase_table_rows_list',
];

const index = JSON.parse(readFileSync(new URL('../lib/tool-index.json', import.meta.url), 'utf8')).tools;
const critical = JSON.parse(readFileSync(new URL('../data/permission-critical-tools.json', import.meta.url), 'utf8'));
const gated = new Set(critical.tools.map((t) => t.name));
const decision = (r) => r?.hookSpecificOutput?.permissionDecision ?? null;

test('every database_* and supabase_* tool in the index is sorted into WRITES or READS', () => {
  const inIndex = index.map((t) => t.name).filter((n) => n.startsWith('database_') || n.startsWith('supabase_'));
  const unsorted = inIndex.filter((n) => !WRITES.includes(n) && !READS.includes(n));
  assert.deepEqual(
    unsorted,
    [],
    'new database or storage tools: put each in WRITES (it changes something; add it to the ask list and '
      + 'LIVE_CHANGE_WRITES too) or in READS (it changes nothing): ' + unsorted.join(', '),
  );
  for (const n of [...WRITES, ...READS]) assert.ok(inIndex.includes(n), `${n} is not in the tool index; a typo gates nothing`);
  assert.deepEqual(WRITES.filter((n) => READS.includes(n)), [], 'a tool is in both lists');
});

test('each write is on the ask list and on the hook with a reason, never pre-approved', () => {
  for (const name of WRITES) {
    assert.ok(gated.has(name), `${name} is not on data/permission-critical-tools.json, so INSTALL.md and Codex miss it`);
    assert.ok(LIVE_CHANGE_WRITES.has(name), `${name} is not on LIVE_CHANGE_WRITES, so installs with older settings run it unasked`);
    assert.equal(ALWAYS_ASK_WRITES.has(name), false, `${name} belongs on one always-ask map`);
    assert.equal(isAutoApprovable(name, {}), false, `${name} must never be pre-approved`);
  }
});

test('each write asks on a direct call and inside a batch, under the blanket allow, under both prefixes', () => {
  // mcp__plugin_hiveku_hk__ is this plugin's server; mcp__hiveku__ is the same server named by a hiveku-sync or VS
  // Code folder's own .mcp.json (lib/tool-safety.mjs FOLDER_SERVER_TOOL_PREFIX). The hook judges both alike.
  assert.deepEqual([...HIVEKU_TOOL_PREFIXES], ['mcp__plugin_hiveku_hk__', 'mcp__hiveku__']);
  for (const prefix of HIVEKU_TOOL_PREFIXES) {
    for (const name of WRITES) {
      const direct = decideForPayload({ tool_name: `${prefix}${name}`, tool_input: { project_id: 'p' } });
      assert.equal(decision(direct), 'ask', `${prefix}${name} must ask; silence is the blanket allow`);
      assert.match(direct.hookSpecificOutput.permissionDecisionReason, new RegExp(`^${name} `));
      assert.ok(direct.hookSpecificOutput.permissionDecisionReason.includes(LIVE_CHANGE_WRITES.get(name)), `${name}: its own reason`);
      const batch = decideForPayload({
        tool_name: `${prefix}hiveku_batch`,
        tool_input: { calls: [{ tool: name, args: { project_id: 'p' } }] },
      });
      assert.equal(decision(batch), 'ask', `${name} inside ${prefix}hiveku_batch must ask`);
    }
  }
});

test('the prompts say what is at stake', () => {
  const why = (name) => decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${name}`, tool_input: {} })
    .hookSpecificOutput.permissionDecisionReason;
  assert.match(why('database_execute'), /nothing limits how many rows/);
  assert.match(why('supabase_table_row_delete'), /for good/);
  assert.match(why('supabase_policy_create'), /read or change rows that were private/);
  assert.match(why('supabase_auth_user_generate_link'), /opens or changes that person's account/);
  assert.match(why('supabase_edge_functions_invoke'), /for real/);
  assert.match(why('database_provision'), /the next deploy of each runs on that database/);
  assert.match(why('database_repair'), /the old password stops working/);
  assert.match(why('supabase_storage_object_signed_url'), /for anyone who holds it, for up to 7 days/);
});

test('NEGATIVE CONTROL: the reads stay off the ask list and the hook', () => {
  for (const name of READS) {
    assert.equal(gated.has(name), false, `${name} is a read`);
    assert.equal(LIVE_CHANGE_WRITES.has(name), false, `${name} is a read`);
  }
});
