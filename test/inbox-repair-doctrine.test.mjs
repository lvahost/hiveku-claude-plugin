/**
 * The communications skill's repair ladder (SKILL.md Play 3, and Part 5 of
 * references/inbox.md) repairs a Gmail or Outlook inbox through
 * email_inbox_setup_guide and a connect link (2026-10-24).
 *
 * It taught email_connect_start: "hand the setup_url over, valid five
 * minutes", with a default of modify_with_calendar (Gmail plus Google Calendar
 * plus Meet). That route answers authorize_url, a new Gmail connection asks for
 * mail only (builder #1747; Calendar and Meet connect on Hiveku's own Google
 * app), and it always starts a NEW connection (intent email_create). A dead row
 * is re-authenticated in place by integration_connect_link_create with
 * target_connection_id (intent email_reconnect: same row, same consumers).
 *
 * And the guide's `for` defaults to the help desk and becomes the link's
 * consumers, so every guide call in the ladder passes `for`, and the ladder
 * says a sales or CRM inbox is 'crm'.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const SKILL = 'skills/hiveku-communications/SKILL.md';
const INBOX = 'skills/hiveku-communications/references/inbox.md';

/** The section of `text` from `heading` to the next heading of the same or higher level. */
function section(text, heading) {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `missing section "${heading}"`);
  const level = heading.match(/^#+/)[0].length;
  const next = text.slice(start + heading.length).search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next);
}

/** What the ladder used to teach, none of it true today. */
const OLD_CLAIMS = [
  // email_connect_start answers authorize_url; a connect link answers url.
  /setup_url/,
  // A new Gmail connection asks for modify (mail only).
  /modify_with_calendar` \(default/i,
  // email_connect_start starts a new connection; it never repairs a row.
  /Start the reconnect\*\* with `email_connect_start`/,
  /email_connect_start\(\{ platform, scope_label/,
];

const oldClaimsIn = (text) => OLD_CLAIMS.filter((re) => re.test(flat(text))).map(String);

test("the communications skill no longer teaches email_connect_start's old answer", () => {
  for (const rel of [SKILL, INBOX]) {
    assert.deepEqual(oldClaimsIn(read(rel)), [], rel);
  }
});

test('the old wording is recognized (positive controls)', () => {
  for (const old of [
    '3. **Hand the `setup_url` to the user. Do not open it yourself.**',
    '| `scope_label` | `modify_with_calendar` (default: Gmail plus Google Calendar plus Meet read-only) |',
    '2. **Start the reconnect** with `email_connect_start`:',
    '(2) `email_connect_start({ platform, scope_label,\nuser_email })` - on a multi-user account',
  ]) {
    assert.ok(oldClaimsIn(old).length > 0, old);
  }
  // The warning that replaced the default is not an old claim.
  assert.deepEqual(oldClaimsIn('so do not pass `modify_with_calendar` for a new Gmail connection'), []);
});

test('Play 3 and Part 5 repair through the guide with `for`, and reconnect a dead row in place', () => {
  const ladders = [
    ['Play 3', flat(section(read(SKILL), '## Play 3 - Repair a broken connection'))],
    ['Part 5', flat(section(read(INBOX), '## Part 5: Repairing a connection'))],
  ];
  for (const [name, text] of ladders) {
    assert.ok(text.includes('email_inbox_setup_guide({ platform, mailbox, for })'), `${name}: the guide call`);
    assert.ok(
      text.includes("`for: 'crm'` for a sales or CRM inbox") || text.includes("`'crm'` for a sales or CRM inbox"),
      `${name}: never says a sales or CRM inbox is for 'crm'`,
    );
    assert.match(text, /`integration_connect_link_create`\)? with `target_connection_id`/, `${name}: the reconnect link`);
    assert.match(text, /IN PLACE/, `${name}: never says the reconnect is in place`);
    assert.match(text, /`email_connect_start` only starts a new connection/, `${name}: email_connect_start still reads as a repair`);
    assert.ok(text.includes('integration_connect_link_status'), `${name}: never polls the link`);
    assert.match(text, /shown once/i, `${name}: never says the link is shown once`);
    // Every guide call passes `for`: without it the guide connects for the help desk.
    const calls = [...text.matchAll(/email_inbox_setup_guide\(\{([^}]*)\}\)/g)].map((m) => m[1]);
    assert.ok(calls.length >= 1, `${name}: no guide call found`);
    for (const args of calls) {
      assert.match(args, /\bfor\b/, `${name}: email_inbox_setup_guide({${args}}) without for`);
    }
  }
});
