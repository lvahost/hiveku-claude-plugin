/**
 * The edge firewall's refusal contract, as the plugin teaches it (2026-09-25,
 * plan there-is-a-growing-happy-dawn, Phase 5 consumers).
 *
 * The firewall refuses in three shapes that every Hiveku repo must describe the
 * same way: an automated client it cannot identify gets a 202 challenge (empty
 * body, x-amzn-waf-action: challenge) or a 403 with x-hiveku-firewall: blocked;
 * a request from a known bulk-scraper network gets a 403 with
 * x-hiveku-firewall: blocked-network; a 403 without that header comes from the
 * site itself. The prose used to say "A 403 is the scraper-network block",
 * which reads a site's own 403 (an auth route, an expired signed URL) as the
 * firewall, and taught the challenge as the only shape of the browser check.
 * The text has to be true both before and after the edge starts answering 403,
 * so it names both shapes and never says the 403 is already live.
 *
 * These pins keep:
 *   - every file that teaches the challenge header also teaching the
 *     x-hiveku-firewall 403, so no page reads a firewall 403 as the site's;
 *   - the full contract sentence where the refusal is explained;
 *   - no "a 403 is the scraper-network block", and no claim that the 403 is
 *     already switched on;
 *   - the firewall reference teaching q/outcome/limit/offset, the crawler
 *     reading (AS396982 impostors, bingbot on AS8075), logsState, and what an
 *     allowance never lifts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace and drop backticks so a pinned phrase may wrap and carry code marks. */
const flat = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ');

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}
const PROSE = [...walk('skills'), ...walk('commands'), ...walk('agents')];

const FIREWALL = 'skills/hiveku-web-agency/references/firewall.md';
/** Files that explain the refusal itself, so each carries the whole contract sentence. */
const CONTRACT_FILES = [
  FIREWALL,
  'skills/hiveku-orient/SKILL.md',
  'skills/hiveku-web-agency/references/build-and-deploy.md',
  'skills/hiveku-seo-agency/references/technical-seo-blind-spots.md',
];
const CONTRACT =
  'an automated client the firewall cannot identify gets a 202 challenge (empty body, ' +
  'x-amzn-waf-action: challenge) or a 403 with x-hiveku-firewall: blocked; a request from a known ' +
  'bulk-scraper network gets a 403 with x-hiveku-firewall: blocked-network; a 403 without that ' +
  'header comes from the site itself';

/** A text that teaches the challenge header must also teach the firewall's 403 marker. */
function assertNamesBothShapes(text, label) {
  if (!text.includes('x-amzn-waf-action')) return;
  assert.ok(
    text.includes('x-hiveku-firewall'),
    `${label} teaches x-amzn-waf-action but never x-hiveku-firewall, so a firewall 403 reads as the site's`,
  );
}

const FORBIDDEN = [
  /a 403 is (always )?the scraper-network block/i,
  /a 403 is always/i,
  /(now|no longer) (answers|returns|gets) (a )?(202|403)/i,
  /since the (edge )?switch/i,
  /is now a 403/i,
];
function assertNoFalseClaims(text, label) {
  const f = flat(text);
  for (const re of FORBIDDEN) assert.doesNotMatch(f, re, `${label} says ${re}`);
}

function assertContract(text, label) {
  assert.ok(flat(text).toLowerCase().includes(CONTRACT), `${label} lacks the refusal contract sentence`);
}

function assertFirewallReference(text) {
  const f = flat(text);
  for (const token of [
    "q: 'Googlebot'",
    "q: 'bingbot'",
    "outcome keeps one kind of refusal: 'challenged', 'blocked' or 'rate_limited'",
    'limit (1 to 200, default 20) and offset (default 0)',
    'totalClients',
    'blocked counts the site\'s own 403s as well as the firewall\'s',
    'A Googlebot row on Google Cloud (asn 396982) is usually an impostor',
    'Real bingbot comes from 8075 (Microsoft / Azure)',
    'the network number alone cannot prove a bingbot real or fake',
    'Read logsState before the numbers',
    "'loading' (the read is still running) and 'busy'",
    'ask again after about a minute',
    "'failed'",
    "'no_hostname'",
    'null means "not read", never zero',
    'It never lifts the per-address rate limit (429), the fingerprint volume challenge, or the scraper-network block (403 with x-hiveku-firewall: blocked-network)',
    'Decide on the status and the x-hiveku-firewall header, never on the body text',
  ]) {
    assert.ok(f.includes(token), `${FIREWALL} does not teach: ${token}`);
  }
}

test('every file that teaches the challenge header also teaches the x-hiveku-firewall 403', () => {
  assert.ok(PROSE.length > 50, 'the prose walk found too few files');
  for (const rel of PROSE) assertNamesBothShapes(read(rel), rel);
});

test('no file says a 403 is the scraper-network block or that the 403 is already switched on', () => {
  for (const rel of PROSE) assertNoFalseClaims(read(rel), rel);
  assertNoFalseClaims(read('data/permission-critical-tools.json'), 'data/permission-critical-tools.json');
});

test('the files that explain a refusal carry the whole contract sentence', () => {
  for (const rel of CONTRACT_FILES) assertContract(read(rel), rel);
});

test('the firewall reference teaches search, paging, the crawler reading, logsState and the allowance limits', () => {
  assertFirewallReference(read(FIREWALL));
});

test('the removal gate describes both shapes of the browser check', () => {
  const perm = JSON.parse(read('data/permission-critical-tools.json'));
  const remove = perm.tools.find((t) => t.name === 'site_firewall_remove');
  assert.ok(remove, 'site_firewall_remove is not on the ask list');
  assert.match(remove.why_gated, /a 202, or a 403 with x-hiveku-firewall: blocked/);
});

test('the checks fail on the old wording (negative control)', () => {
  const old =
    '**The challenge, as a client that cannot run JavaScript sees it: HTTP 202, an empty body, and\n' +
    'the header `x-amzn-waf-action: challenge`.** A real page is never a 202. From your own terminal,\n' +
    "`curl -A 'Hiveku-Session/1.0'` passes. A 403 is the\nscraper-network block and a 429 is the rate limit.";
  assert.throws(() => assertNamesBothShapes(old, 'old'));
  assert.throws(() => assertNoFalseClaims(old, 'old'));
  assert.throws(() => assertContract(old, 'old'));
  assert.throws(() => assertFirewallReference(old));
  assert.throws(() => assertNoFalseClaims('The edge now answers 403 to every script.', 'claim'));
});
