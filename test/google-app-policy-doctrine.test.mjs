/**
 * Hiveku's Google app policy (2026-09-27), as the plugin teaches it.
 *
 * The only Google Cloud project a customer may own is their internal Gmail
 * project. Every other Google product (Google Ads, Analytics and the Tag
 * Manager that rides on it, Search Console, Business Profile, Calendar) runs
 * on Hiveku's own Google app and, for Google Ads, Hiveku's developer token.
 * The builder refuses an own oauth_app_id for those products (400
 * google_own_app_not_allowed) and a Google Ads developer token (400
 * developer_token_not_allowed); a connection still on an own app is MOVED with
 * a reconnect link that names oauth_app_id 'platform'. Hiveku's Google Ads
 * client is unverified for the Data Manager scope, so Google shows an
 * 'unverified app' screen on the Google Ads consent only (the other products
 * use other Hiveku clients).
 *
 * The prose used to tell agents to collect a developer token and customer id
 * "for an account with its own Google app" (commands/connect-integration.md),
 * to create Google Ads and Search Console connections from the customer's own
 * client id, secret and refresh token (commands/integrations.md, the SEO and
 * orient references), and to extend an own Google app with google_analytics
 * for Tag Manager. Every one of those calls is now refused.
 *
 * These pins keep:
 *   - no prose (commands, skills, agents) offering an own Google app, own
 *     Google client credentials or a developer token for a Google product
 *     other than Gmail, unless the sentence says it is refused;
 *   - the connect and audit commands naming both refusals and the move;
 *   - every "unverified app" screen tied to Google Ads.
 * lib/dept-manifest.json (the SETUP.md texts) is mirrored from hiveku-vscode
 * and is fixed there, so it is not scanned here.
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

/** The old offers. Each is a way the prose sent an agent to an own Google app, own Google credentials, or a developer token. */
const OLD_OFFERS = [
  /google_ads (?:create )?with the account's OWN Google app/i,
  /google_ads needs developer_token/i,
  /developer_token \(BYOK/i,
  /\bG(?:SC|BP) (?:as|by) BYOK\b/i,
  /google_search_console: \{ platform, site_url, client_id/i,
  /google_business_profile: \{ platform, client_id/i,
  /Each Google source needs a per-account OAuth app/i,
  /call ppc_connection_update with \{\s*developer_token/i,
  /The call needs a developer_token and returns 412/i,
  /A 412 with a hint means no developer token/i,
  /For Google Ads, prefer integration_oauth_initiate over BYOK/i,
  /Nothing connected: ppc_connection_create builds a BYOK connection/i,
  /seo_connection_create \(BYOK/i,
  /seo_connection_create per the BYOK arguments/i,
  /\[CONFIRM, BYOK\]/,
  /BYOK credentials; GSC needs/i,
  /platform: 'google_search_console', site_url, client_id/i,
];

/** add_products: ['google_analytics'] (or google_ads / search console / business profile) not stated as refused. */
const EXTEND_GOOGLE_APP = /add_products: \[\s*'(?:google_analytics|google_ads|google_search_console|google_business_profile)'/g;

function offersIn(text) {
  const t = flat(text);
  const hits = OLD_OFFERS.filter((re) => re.test(t)).map(String);
  for (const m of t.matchAll(EXTEND_GOOGLE_APP)) {
    const before = t.slice(Math.max(0, m.index - 80), m.index);
    if (!/refuse|never/i.test(before)) hits.push(`extends an own Google app: ${m[0]}`);
  }
  return hits;
}

test('no command, skill or agent offers an own Google app, own Google credentials or a developer token (Gmail aside)', () => {
  assert.ok(PROSE.length > 50, `expected the plugin prose, found ${PROSE.length} files`);
  const hits = PROSE.flatMap((rel) => offersIn(read(rel)).map((h) => `${rel}: ${h}`));
  assert.deepEqual(hits, []);
});

test('flags each old wording (positive controls)', () => {
  for (const old of [
    "- `google_ads` create with the account's OWN Google app: `developer_token` and `customer_id` up\n  front (the server refuses without them).",
    '| Ads platform by BYOK credentials | `ppc_connection_create({ platform, ... })`. Per-platform requirements differ: google_ads needs developer_token + client_id + client_secret + refresh_token + customer_id |',
    '| GSC or GBP by BYOK refresh token | `seo_connection_create` with `client_id` + `client_secret` + `refresh_token`. |',
    "   login-customer-id on every call), `developer_token` (BYOK, from the MCC's API Center).",
    "- google_search_console: `{ platform, site_url, client_id, client_secret, refresh_token }`",
    "Fix with `oauth_app_update({ oauth_app_id, add_products:\n   ['google_analytics'] })` - use `add_products`, which merges.",
    'Each Google source needs a per-account OAuth app (BYOK) - same pattern as Google Ads.',
    '1. **Connections:** `ppc_connection_list`; `ppc_connection_test` on anything suspect. Nothing connected:\n   `ppc_connection_create` builds a BYOK connection from the client\'s own platform credentials',
    '`seo_connection_create` (BYOK; args in `references/outcomes-and-measurement.md`), then `seo_sync`.',
    'Missing sources: `seo_connection_create` per\n   `references/outcomes-and-measurement.md` [CONFIRM, BYOK], then `seo_sync`.',
    "for GSC that is `{ platform: 'google_search_console', site_url, client_id, client_secret, refresh_token }`",
  ]) {
    assert.ok(offersIn(old).length > 0, `not flagged: ${old}`);
  }
  // The new wording states the refusal, and is not flagged.
  assert.deepEqual(offersIn("`oauth_app_update` refuses\n   `add_products: ['google_analytics']` with 400 `google_own_app_not_allowed`"), []);
});

test('the connect and audit commands name both refusals and the move', () => {
  for (const rel of ['commands/connect-integration.md', 'commands/integrations.md']) {
    const t = flat(read(rel));
    for (const phrase of ['google_own_app_not_allowed', 'developer_token_not_allowed', "oauth_app_id: 'platform'", "Hiveku's own Google app"]) {
      assert.ok(t.includes(phrase), `${rel} does not say ${phrase}`);
    }
  }
  const connect = flat(read('commands/connect-integration.md'));
  assert.ok(connect.includes("google_ads: nothing up front. It runs on Hiveku's app and Hiveku's developer token"));
  assert.ok(connect.includes("Never ask for a developer token: the server refuses one (400 developer_token_not_allowed)"));
});

test("the orient reference states the policy where it explains OAuth clients", () => {
  const t = flat(read('skills/hiveku-orient/references/integrations.md'));
  assert.ok(t.includes("Hiveku's Google policy: the only Google app an account may own is its internal Gmail app."));
  assert.ok(t.includes('never collect a Google Ads developer token (400 developer_token_not_allowed; Hiveku\'s is used)'));
  assert.ok(t.includes("GSC and GBP are refused here** (400 google_own_app_not_allowed, before any lookup)"));
  assert.ok(t.includes('409 oauth_app_in_use'));
});

test('wherever hiveku_native false means an own app, Google Business Profile is named as the exception', () => {
  const missing = [];
  for (const rel of PROSE) {
    const t = flat(read(rel));
    for (const m of t.matchAll(/hiveku_native: false means|false means the customer must register their own app/g)) {
      if (!t.slice(Math.max(0, m.index - 200), m.index + 400).includes('Google Business Profile')) missing.push(`${rel} @${m.index}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("a GBP quota refusal points at Hiveku's own Google app, never a Cloud project review of the customer's own", () => {
  const t = flat(read('skills/hiveku-seo-agency/references/local-seo.md'));
  assert.ok(t.includes("the fix is reconnecting onto the approved app: Hiveku's own Google app"));
  assert.ok(t.includes('never ask anyone to get their own Cloud project reviewed'));
});

test("every 'unverified app' screen is tied to Google Ads", () => {
  const loose = [];
  for (const rel of PROSE) {
    const t = flat(read(rel));
    for (const m of t.matchAll(/unverified app'? screen/gi)) {
      if (!t.slice(Math.max(0, m.index - 80), m.index).includes('Google Ads')) loose.push(`${rel} @${m.index}`);
    }
  }
  assert.deepEqual(loose, []);
});
