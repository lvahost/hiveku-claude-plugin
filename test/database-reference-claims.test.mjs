/**
 * The web agency's database reference says only what the database tools enforce.
 *
 * Until 2026-11-10 its "What is blocked" section said a DELETE or UPDATE with no WHERE was blocked, that
 * database_execute stopped a DELETE at 50 rows and database_query at 100, and that all of it was "enforced, not
 * advisory". None of that was enforced, so an assistant reading it could take an unbounded write for a safe one. When
 * the tools start refusing or capping something new, change the reference and this test together.
 *
 * The no-WHERE bullet must hold both before and after the builder release that makes database_execute refuse a
 * DELETE or UPDATE with no WHERE (2026-11-10): this plugin ships first, so the bullet tells the assistant
 * never to count on that refusal, names the refusal by its answer and when it applies, and no longer says flatly
 * that such a statement is not refused.
 *
 * The same holds for the builder release that holds a connection's SQL to the sign-in schema rule (2026-11-11:
 * protected_schema_refused for auth, vault and pgsodium, unless an account owner or admin created the connection)
 * and makes more sign-in and server-function tools owner- and admin-only: the reference names each one with when it
 * applies, so it is true before and after that release. The MCP tool texts (supabase-end-user-boundary-text.test.ts
 * there) state the same rules as the tools' behaviour.
 *
 * Round 4 (2026-11-11), the same builder release: the sign-in schema rule also refuses SQL that reads or changes a
 * setting that can hold a secret (an older project keeps the key that signs its sign-in tokens in one), and setting
 * a user's app_metadata with supabase_auth_user_create or _update is owner- and admin-only. Both are named in the
 * same two bullets, under the same "once the builder release ... is live".
 *
 * Run: node --test test/database-reference-claims.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ref = readFileSync(
  new URL('../skills/hiveku-web-agency/references/cms-and-database.md', import.meta.url),
  'utf8',
);
const start = ref.indexOf('### What is blocked, and why');
const end = ref.indexOf('### RLS is mandatory', start);
const section = start >= 0 && end > start ? ref.slice(start, end) : '';
const extrasStart = ref.indexOf('## Part 7: Supabase extras');
const extrasEnd = ref.indexOf('## Part 8', extrasStart);
const extras = extrasStart >= 0 && extrasEnd > extrasStart ? ref.slice(extrasStart, extrasEnd) : '';

test('the database section is where this test reads it', () => {
  assert.ok(section.length > 200, 'the "What is blocked, and why" section was not found');
});

test('it claims no row cap and no refusal the tools do not make', () => {
  assert.doesNotMatch(section, /capped at 50/i, 'database_execute has no 50-row cap');
  assert.doesNotMatch(section, /capped at 100/i, 'database_query has no 100-row cap');
  assert.doesNotMatch(section, /WHERE clause\.\*\* Blocked/, 'a DELETE or UPDATE with no WHERE is not refused everywhere yet');
  assert.doesNotMatch(section, /Enforced, not advisory/, 'the refusals guard against accidents only');
});

test('the no-WHERE bullet holds before and after the builder release that refuses it', () => {
  assert.match(section, /Do not count on a refusal: name the rows with a `WHERE` and count them first with `database_query`\./);
  assert.match(
    section,
    /`database_execute` refuses a DELETE or UPDATE with no WHERE \(`blocked_statement`\) once the builder release that adds this refusal is live; until then such a statement runs and changes every row of the table\./,
  );
  assert.doesNotMatch(section, /It is NOT refused/, 'true only until the builder release; the bullet must hold after it too');
});

test('it says plainly what is not refused', () => {
  assert.match(section, /There is no row cap/);
  assert.match(section, /`DROP POLICY` and dropping a constraint are not refused \(outside the sign-in schemas, below\)\./);
});

test('the sign-in schema bullet holds before and after the builder release that refuses that SQL', () => {
  const bullet = section.split('\n').find((line) => line.startsWith('- **Never touch the sign-in schemas**')) ?? '';
  assert.match(bullet, /^- \*\*Never touch the sign-in schemas\*\* \(`auth`, `vault`, `pgsodium`\) with `database_execute`, `database_query` or a policy tool/);
  assert.match(
    bullet,
    /Once the builder release that adds this refusal is live, such SQL answers `protected_schema_refused` and nothing in it runs, for Hiveku's assistants and for any connection an account owner or admin \(or Hiveku staff\) did not create; until then it runs as written\./,
  );
  assert.match(
    bullet,
    /`auth\.uid\(\)`, `auth\.jwt\(\)`, `auth\.role\(\)` and `auth\.email\(\)` in a policy, `current_setting\('request\.jwt\.claims', true\)`, and a foreign key to `auth\.users`, stay allowed\./,
  );
  assert.match(bullet, /the owner's step in the database page's SQL editor/);
  // Never the flat claim that holds on one side of the release only.
  assert.doesNotMatch(section, /sign-in schemas?[^.]*\b(are|is) (always )?refused\b/i);
});

test('the sign-in schema bullet names the settings that can hold a secret, under the same release', () => {
  const bullet = section.split('\n').find((line) => line.startsWith('- **Never touch the sign-in schemas**')) ?? '';
  assert.match(
    bullet,
    /The same refusal covers SQL that changes the role it runs as, hides SQL in a string, adds an extension outside a short list, or reads or changes a setting that can hold a secret \(`current_setting` of anything but a `request\.` setting, `set_config` of anything but `search_path` or a `request\.` setting, `pg_settings` and the other settings catalogs, `SHOW ALL`, any mention of `jwt_secret`\): an older project keeps the key that signs its sign-in tokens in such a setting\./,
  );
  // The refusal is named by the bullet's own "once the builder release ... is live", never as a flat claim.
  assert.doesNotMatch(section, /settings? (that can hold a secret )?(is|are) (always )?refused/i);
});

test('the owner- and admin-only sign-in and server-function tools are named with when that applies', () => {
  const bullet = extras.split('\n').find((line) => line.startsWith('- **Who can change sign-in and server-function settings.**')) ?? '';
  assert.match(bullet, /Once the builder release that adds this is live, only a connection created by an account owner or admin \(or Hiveku staff\) can run /);
  for (const tool of [
    'supabase_sync_redirect_urls', 'supabase_configure_smtp', 'supabase_configure_hiveku_smtp', 'supabase_configure_oauth',
    'supabase_edge_functions_deploy', 'supabase_edge_functions_set_secrets', 'supabase_migration_apply', 'supabase_auth_config_update',
  ]) {
    assert.ok(bullet.includes(`\`${tool}\``), `the owner-only bullet does not name ${tool}`);
  }
  assert.match(bullet, /Hiveku's assistants and every other connection get a 403 that names the reason, and nothing changes\./);
});

test("setting a user's app_metadata is named in the same owner- and admin-only bullet, with its own reason and way forward", () => {
  const bullet = extras.split('\n').find((line) => line.startsWith('- **Who can change sign-in and server-function settings.**')) ?? '';
  assert.match(
    bullet,
    /or set a user's `app_metadata` with `supabase_auth_user_create` or `supabase_auth_user_update` \(it rides in the user's sign-in, where the site reads it to decide what they may do; `user_metadata` stays open\)/,
  );
  assert.match(bullet, /Tell the person an account owner or admin can do it in the dashboard, or, for `app_metadata`, in the database page's SQL editor or with their own key\./);
});
