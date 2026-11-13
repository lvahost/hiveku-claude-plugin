/**
 * Private mode's monthly charge (2026-11-12): turning one of a site's environments private adds a monthly charge to
 * the account's bill, and the server refuses a turn-on that does not carry the price its dry run quoted
 * (accept_monthly_cents). This file pins what the person and the agent are told about it, so a later edit cannot
 * drop the charge from the ask prompt or the guide with every other test still passing.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVE_CHANGE_WRITES } from '../lib/tool-safety.mjs';

const NAME = 'site_firewall_private_set';
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const permFile = JSON.parse(read('data/permission-critical-tools.json'));
const guide = read('skills/hiveku-web-agency/references/firewall.md');

function assertReasonNamesCharge(reason, where) {
  assert.match(reason, /turning it on adds a monthly charge to the account's bill/, `${where}: the charge`);
  assert.match(reason, /public opens the environment to anyone/, `${where}: the public risk`);
  assert.doesNotMatch(reason, /[–—]/, `${where}: no dashes in a reason the person reads`);
}

function assertGuideAsksForThePrice(text, where) {
  assert.match(text, /Name the price before you ask/, `${where}: price first`);
  assert.match(text, /`charge\.words`, in those words,\s+never a number of your own/, `${where}: the server's words`);
  assert.match(text, /Never send `accept_monthly_cents` without\s+that yes/, `${where}: never without a yes`);
  assert.match(text, /a\s+billing problem never turns private mode off/, `${where}: billing never turns it off`);
  assert.match(text, /offer to make it public to stop its charge/, `${where}: the way to stop the charge`);
}

test('the ask list names the charge for the private mode switch', () => {
  const entry = permFile.tools.find((t) => t.name === NAME);
  assert.ok(entry, `${NAME} must be on the ask list`);
  assertReasonNamesCharge(entry.why_gated, 'permission-critical-tools.json');
});

test('the hook prompt names the charge for the private mode switch', () => {
  const reason = LIVE_CHANGE_WRITES.get(NAME);
  assert.ok(reason, `${NAME} must be on LIVE_CHANGE_WRITES`);
  assertReasonNamesCharge(reason, 'LIVE_CHANGE_WRITES');
});

test('the firewall guide asks for the price before a turn-on and never accepts it alone', () => {
  assertGuideAsksForThePrice(guide, 'firewall.md');
});

test('the checks fail on the old wording (negative control)', () => {
  const oldReason =
    'turns private mode on or off for one environment of a site, or changes who it lets in: private '
    + "can lock the site's own people out, and public opens the environment to anyone with its address";
  assert.throws(() => assertReasonNamesCharge(oldReason, 'old reason'));
  const oldGuide = 'After a turn-on the server lock reads `locking` for about 15 minutes, then `on`. Confirm with the\n'
    + 'user first: making an environment private can lock their own people out, and making it public opens it to anyone.';
  assert.throws(() => assertGuideAsksForThePrice(oldGuide, 'old guide'));
});
