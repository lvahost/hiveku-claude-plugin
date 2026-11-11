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
  assert.match(section, /`DROP POLICY` and dropping a constraint are not refused/);
});
