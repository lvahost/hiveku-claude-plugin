/**
 * The numbers reference teaches the caller-ID refusal on release and deactivate.
 *
 * Builder 99b181f45 made voice_number_release and voice_number_update
 * (is_active: false) take the number off every extension presenting it as
 * caller ID FIRST, and answer 409 caller_id_clear_failed with nothing else run
 * when the phone system does not accept that. numbers-and-e911.md still taught
 * the opposite in two places: deactivate's clear was "best-effort, so a failed
 * clear is only logged", and release had "no dependency guard anywhere" with
 * the caller-ID clear listed as part of a teardown that went ahead regardless.
 * An agent reading that had been told the 409 could not happen, and the tempting
 * way past it (point the stuck extensions at another number while the PBX is
 * down) saves in Hiveku, warns, and lets the next release through while the PBX
 * still presents the released digits.
 *
 * Each test pins one sentence an agent acts on, section by section, so the
 * doctrine cannot drift back in one place while staying right in another.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = 'skills/hiveku-phone-agency/references/numbers-and-e911.md';
const reference = () => fs.readFileSync(path.join(root, REFERENCE), 'utf8');

/** The text from a heading line to the next heading of the same or a higher level. */
function section(headingPattern) {
  const lines = reference().split('\n');
  const start = lines.findIndex((l) => headingPattern.test(l));
  assert.ok(start >= 0, `${REFERENCE} has no heading matching ${headingPattern}`);
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.match(/^#+/)[0].length <= level);
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n');
}

const configuring = () => section(/^## 6\. Configuring: `voice_number_update`/);
const retiring = () => section(/^## 8\. Retiring: `voice_number_release`/);
const retirePlay = () => section(/^### Play: retire a number safely/);

test('deactivating is taught as fail-closed, not best-effort', () => {
  const text = configuring();
  assert.match(text, /409 caller_id_clear_failed/);
  assert.match(text, /NOTHING in the patch is written/);
  assert.doesNotMatch(text, /a failed clear\s+is only logged/);
});

test('release is taught as caller ID first, with the 409 as its only refusal', () => {
  const text = retiring();
  assert.match(text, /Caller ID first, fail-closed/);
  assert.match(text, /NOTHING else runs/);
  assert.match(text, /The only 409 is `caller_id_clear_failed`/);
  assert.doesNotMatch(text, /No dependency guard anywhere/);
});

test('the 409 comes with what the agent gets and what to do next', () => {
  const text = retiring();
  for (const field of ['`details`', '`message`', '`failed_extensions`', '`cleared_extensions`']) {
    assert.ok(text.includes(field), `section 8 does not name ${field}`);
  }
  assert.match(text, /Retry the same call once the phone system is reachable/);
  assert.match(text, /`voice_tenant_healthcheck`/);
});

test('the workaround that would release a number the PBX still presents is forbidden', () => {
  assert.match(
    retiring(),
    /Never work around it\*\* by pointing those extensions at another number with\s+`voice_extension_update` while the PBX is down/,
  );
});

test('the retire play handles the 409 at deactivate and checks the PBX side before releasing', () => {
  const play = retirePlay();
  const healthcheck = play.search(/run `voice_tenant_healthcheck`/i);
  const deactivate = play.indexOf('`voice_number_update` with `is_active: false`');
  const release = play.indexOf('`voice_number_release`');
  assert.ok(deactivate >= 0 && healthcheck >= 0 && release >= 0, 'the play lost a step it must have');
  assert.ok(healthcheck < release, 'the PBX-side check must come before the release');
  assert.match(play, /`409 caller_id_clear_failed` means nothing was deactivated/);
  assert.match(play, /extension_caller_id_matches_builder/);
});

// The voice server answers extension_caller_id_matches_builder with ok and a
// "skipped: tenant has no active DID" detail once no number on the account is
// active, and the nightly repair skips that account too. Run after deactivating
// the last active number, the check is green in exactly the case it is there
// for, so it has to run while this number is still active.
test('the caller-ID check runs while the number is still active, before the deactivate', () => {
  const play = retirePlay();
  const healthcheck = play.search(/run `voice_tenant_healthcheck`/i);
  const deactivate = play.indexOf('`voice_number_update` with `is_active: false`');
  assert.ok(healthcheck >= 0 && deactivate >= 0, 'the play lost a step it must have');
  assert.ok(healthcheck < deactivate, 'the healthcheck must come before the deactivate');
  assert.match(play, /While the number is still active, run `voice_tenant_healthcheck`/);
});

test('a skipped caller-ID check is taught as no pass, and the five-name cap is named', () => {
  const play = retirePlay();
  assert.match(play, /`skipped: tenant has no active DID` is NOT a pass/);
  assert.match(play, /names only the first five drifted extensions/);
  assert.match(play, /Keep going until the check is ok/);
  assert.match(play, /say so to the human before asking for the release/);
  assert.match(retiring(), /while the number is still active, before the deactivate/);
  assert.doesNotMatch(retiring(), /runs\s+`voice_tenant_healthcheck` before the release/);
});
