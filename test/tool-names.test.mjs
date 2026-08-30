/**
 * Every voice_ tool name the plugin's prose teaches must be REAL.
 *
 * The failure this guards against shipped three times in one audit: a skill or
 * command names a tool that does not exist (fabricated by a doc-writer,
 * renamed upstream, or a "coming soon" that never came), the session calls it,
 * the server returns unknown-tool, and the assistant concludes Hiveku cannot
 * do the thing — a phantom product gap that no grep catches because the prose
 * reads perfectly.
 *
 * The gate: every 3+-segment snake token starting `voice_` found in
 * skills/**, commands/*, agents/* must be one of
 *   - a tool in lib/tool-index.json (the live catalogue), or
 *   - a PENDING_TOOLS entry (contracted, shipping in a named batch), or
 *   - a KNOWN_NON_TOOLS entry (a table/column/error/trigger name that is
 *     legitimately not a tool, curated one at a time with a reason).
 *
 * And the bridge cannot rot: a PENDING entry that the regenerated index now
 * contains FAILS, forcing its deletion from test/pending-tools.mjs.
 *
 * Other prefixes get a console report, not a failure — the voice program owns
 * this gate; widening it is a separate, deliberate step.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Snake tokens that LOOK like tools but are not, each with the one-word reason
 * it exists in prose. Curated by hand — add an entry only after reading the
 * line that uses it; never to silence a failure you have not understood.
 */
const KNOWN_NON_TOOLS = new Map([
  ['voice_calls', 'table'],
  ['voice_numbers', 'table'],
  ['voice_sms_messages', 'table'],
  ['voice_sms_threads', 'table'],
  ['voice_sms_opt_outs', 'table'],
  ['voice_pool_sessions', 'table'],
  ['voice_pool_members', 'table'],
  ['voice_did_pools', 'table'],
  ['voice_number_orders', 'table'],
  ['voice_port_orders', 'table'],
  ['voice_tenant_config', 'table'],
  ['voice_conversion_uploads', 'table'],
  ['voice_e911_addresses', 'table'],
  ['voice_extensions', 'table'],
  ['voice_ring_groups', 'table'],
  ['voice_ring_group_members', 'table'],
  ['voice_ivrs', 'table'],
  ['voice_queues', 'table'],
  ['voice_queue_members', 'table'],
  ['voice_sms_templates', 'table'],
  ['voice_sms_brand', 'table'],
  ['voice_sms_campaign', 'table'],
  ['voice_toll_free_verifications', 'table'],
  ['voice_tts_renders', 'table'],
  ['voice_usage_periods', 'table'],
  ['voice_api_keys', 'table'],
  ['voice_webhooks', 'table'],
  ['voice_sites', 'table'],
  ['voice_not_enabled', 'error'],
  ['voice_server_error', 'error'],
  ['voice_server_update_pending', 'error'],
  ['voice_not_recognised', 'error'],
  ['voice_sms_message_id', 'column'],
  ['voice_sms_thread_id', 'column'],
  ['voice_number_id', 'column'],
  ['voice_call_completed_trigger', 'trigger'],
  ['voice_voicemail_trigger', 'trigger'],
  ['voice_missed_call_trigger', 'trigger'],
  // Named in prose ONLY as "does not exist" (the free 10DLC content re-review
  // PUT is Batch Z, unbuilt at every layer). Move to PENDING_TOOLS if it is
  // ever contracted; delete here when it ships.
  ['voice_sms_campaign_update', 'unbuilt'],
]);

/**
 * Full snake-token extraction: 3+ segments, not preceded by a word char, `/`,
 * `.` or `-` (so `references/voice_x.md` paths and `some-voice_x` compounds
 * don't count), not followed by a word char or `*` (so wildcard patterns like
 * `voice_sms_*` don't count as a bare name).
 */
const TOKEN = /(?<![\w/.\-])([a-z][a-z0-9]*(?:_[a-z0-9]+){2,})(?![\w*])/g;

/**
 * The shorthand ban. `voice_pool_create / _update / _delete` and
 * `voice_pool_create/_update` read fine to a human and EVADE every grep-based
 * verifier (including this file's own token extraction), so nobody ever
 * checks whether `voice_pool_update` exists. Prose must spell every name in
 * full; the extra bytes buy verifiability.
 */
const SHORTHAND = /voice_[a-z0-9]+(?:_[a-z0-9]+)+`?\s*\/\s*`?_[a-z_]+/;

function walkMarkdown() {
  const files = [];
  const push = (p) => { if (p.endsWith('.md')) files.push(p); };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else push(p);
    }
  };
  walk(path.join(root, 'skills'));
  for (const dir of ['commands', 'agents']) {
    for (const e of fs.readdirSync(path.join(root, dir))) push(path.join(root, dir, e));
  }
  return files;
}

function loadIndex() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'tool-index.json'), 'utf8'));
  return new Set(raw.tools.map((t) => t.name));
}

test('every voice_ token in skills/commands/agents is a real, pending, or curated non-tool name', () => {
  const index = loadIndex();
  const files = walkMarkdown();

  const misses = new Map(); // token -> first `file:line`
  const otherPrefixMisses = new Map(); // prefix -> Set of tokens
  let voiceChecked = 0;

  for (const file of files) {
    const rel = path.relative(root, file);
    // Bold markers are stripped first: `**voice_fake_tool**` must not hide from the gate
    // behind the `(?![\w*])` guard that exists to skip wildcard forms like `voice_ivr_*`.
    const lines = fs.readFileSync(file, 'utf8').replace(/\*\*/g, '').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(TOKEN)) {
        const token = m[1];
        if (token.startsWith('voice_')) {
          voiceChecked++;
          if (index.has(token) || PENDING_TOOLS.has(token) || KNOWN_NON_TOOLS.has(token)) continue;
          if (!misses.has(token)) misses.set(token, `${rel}:${i + 1}`);
        } else if (token.includes('_') && !index.has(token)) {
          const prefix = token.slice(0, token.indexOf('_'));
          if (!otherPrefixMisses.has(prefix)) otherPrefixMisses.set(prefix, new Set());
          otherPrefixMisses.get(prefix).add(token);
        }
      }
    });
  }

  // Report-only for other prefixes: most of these are field names and prose
  // snakes, and the voice program does not own that cleanup.
  const report = [...otherPrefixMisses.entries()]
    .map(([p, s]) => [p, s.size])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([p, n]) => `${p}:${n}`)
    .join(' ');
  console.log(`  [tool-names] non-index snake tokens by other prefix (report only): ${report || 'none'}`);

  // Vacuous-pass protection: if the extraction regex or the file walk breaks,
  // this test would "pass" while checking nothing. The repo carries far more
  // than 150 voice_ mentions.
  assert.ok(voiceChecked > 150, `only ${voiceChecked} voice_ tokens found — extraction is broken, not the prose`);

  assert.deepEqual(
    [...misses.entries()].map(([t, loc]) => `${t} (first at ${loc})`),
    [],
    'voice_ names that are neither in lib/tool-index.json, PENDING_TOOLS, nor KNOWN_NON_TOOLS. ' +
      'A real incoming tool belongs in test/pending-tools.mjs with its batch; a table/error/column ' +
      'belongs in KNOWN_NON_TOOLS with a reason; anything else is a fabricated name — fix the prose.',
  );
});

test('no PENDING_TOOLS entry still exists once the index contains it', () => {
  const index = loadIndex();
  const stale = [...PENDING_TOOLS.keys()].filter((name) => index.has(name));
  assert.deepEqual(
    stale,
    [],
    'these tools have LANDED in lib/tool-index.json — delete their entries from test/pending-tools.mjs ' +
      'so the pending bridge cannot mask a future rename: ' + stale.join(', '),
  );
});

test('no shorthand suffix chains after a voice_ tool name', () => {
  const files = walkMarkdown();
  const hits = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (SHORTHAND.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(
    hits,
    [],
    'shorthand like `voice_pool_create/_update` or `voice_pool_create / _delete` evades name ' +
      'verification — spell every tool name in full:\n  ' + hits.join('\n  '),
  );
});
