/**
 * Every tool name the plugin's prose teaches must be REAL.
 *
 * The failure this guards against shipped three times in one audit: a skill or
 * command names a tool that does not exist (fabricated by a doc-writer,
 * renamed upstream, or a "coming soon" that never came), the session calls it,
 * the server returns unknown-tool, and the assistant concludes Hiveku cannot
 * do the thing - a phantom product gap that no grep catches because the prose
 * reads perfectly.
 *
 * The gate: every 3+-segment snake token starting with a GATED prefix, found in
 * skills/**, commands/*, agents/*, must be one of
 *   - a tool in lib/tool-index.json (the live catalogue), or
 *   - a PENDING_TOOLS entry (contracted, shipping in a named batch), or
 *   - a KNOWN_NON_TOOLS entry (a table/column/error/trigger name that is
 *     legitimately not a tool, curated one at a time with a reason).
 *
 * Gated prefixes:
 *   - `voice_` (the 2026-08-29 phone program, which built this gate);
 *   - `seo_` plus the DataForSEO vendor prefixes `backlinks_`,
 *     `dataforseo_labs_`, `serp_`, `on_page_`, `keywords_data_`,
 *     `content_analysis_`, `domain_analytics_`, `business_data_`,
 *     `ai_optimization_` (the 2026-08-30 SEO program). The SEO surface is
 *     spread across those prefixes, so gating `seo_` alone would still let a
 *     fabricated `backlinks_new_lost_summary` through.
 *
 * And the bridge cannot rot: a PENDING entry that the regenerated index now
 * contains FAILS, forcing its deletion from test/pending-tools.mjs.
 *
 * Other prefixes get a console report, not a failure. Widening the gate to a
 * new prefix is a deliberate step: it comes with a KNOWN_NON_TOOLS pass over
 * every hit and a vacuous-pass guard sized to that prefix's real footprint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Prefixes whose tokens must be real. Order does not matter; the longest match is not needed since none is a prefix of another. */
const GATED_PREFIXES = [
  'voice_',
  'seo_',
  'backlinks_',
  'dataforseo_labs_',
  'serp_',
  'on_page_',
  'keywords_data_',
  'content_analysis_',
  'domain_analytics_',
  'business_data_',
  'ai_optimization_',
  // 2026-08-30. The automation department writes workflow_ tool names in prose
  // constantly (the hub alone names 51), and until now a fabricated one was a
  // console note rather than a failure - the exact way a skill starts teaching a
  // tool that does not exist.
  'workflow_',
  // 2026-09-01. The creative program: the design/media/brand surface plus the
  // storyboard and video-pipeline lanes. The widening pass over existing prose
  // found one fabricated name already being taught around (brand_guide_set_active,
  // see KNOWN_NON_TOOLS) - exactly the class this gate exists for.
  'design_',
  'media_',
  'brand_guide_',
  'marketing_storyboard_',
  'marketing_video_pipeline_',
  'stock_photos_',
];

/**
 * Vacuous-pass floors per prefix: if the extraction regex or the file walk
 * breaks, this test would "pass" while checking nothing. The repo carries far
 * more than 150 voice_ mentions and far more than 400 seo_ mentions; the vendor
 * prefixes are too sparse in prose to pin a floor on, and ride on these two.
 */
const MIN_CHECKED = {
  voice_: 150,
  seo_: 400,
  workflow_: 120,
  // Creative footprint measured 2026-09-01: design_ 125, media_ 126,
  // brand_guide_ 71 tokens in prose. Floors sit near half so a rewrite does
  // not false-fail; the sparser creative prefixes (marketing_storyboard_ 36,
  // marketing_video_pipeline_ 15, stock_photos_ 24) ride on these three.
  design_: 60,
  media_: 60,
  brand_guide_: 30,
};

/**
 * Snake tokens that LOOK like tools but are not, each with the one-word reason
 * it exists in prose. Curated by hand - add an entry only after reading the
 * line that uses it; never to silence a failure you have not understood.
 */
const KNOWN_NON_TOOLS = new Map([
  // Workflow engine tables the automation references name by their real
  // database identity. Each is a table, not a tool.
  ['workflow_pending_waits', 'table'],
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

  // SEO program (gate widened 2026-08-30).
  // technical-seo-blind-spots.md: "no writer for the `seo_site_audits` table" - the
  // dashboard audit table the Olympus audit rail reads and nothing writes.
  ['seo_site_audits', 'table'],
  // seo_connection_test is NOT here on purpose: orient's integrations.md names
  // it as "does not exist" (true today) but it is contracted in SEO batch S3,
  // so it lives in PENDING_TOOLS, and that prose flips when S3 lands.

  // Creative program (gate widened 2026-09-01). Request/response fields the
  // prose names by their real identity; none is callable.
  ['media_asset_id', 'field'],
  ['media_asset_ids', 'field'],
  ['brand_guide_id', 'field'],
  ['design_project_id', 'field'],
  // Named in prose ONLY as "does not exist": brand-and-assets.md teaches the
  // design_templates_list check and the dashboard fallback precisely because
  // there is no activation tool. Move to PENDING_TOOLS if it is ever
  // contracted; delete here when it ships.
  ['brand_guide_set_active', 'unbuilt'],
]);

/**
 * Full snake-token extraction: 3+ segments, not preceded by a word char, `/`,
 * `.` or `-` (so `references/voice_x.md` paths and `some-voice_x` compounds
 * don't count), not followed by a word char or `*` (so wildcard patterns like
 * `voice_sms_*` don't count as a bare name).
 */
const TOKEN = /(?<![\w/.\-])([a-z][a-z0-9]*(?:_[a-z0-9]+){2,})(?![\w*])/g;

/**
 * The shorthand ban. `voice_pool_create / _update / _delete`,
 * `seo_gbp_media_add/_delete` and `seo_bing_query_stats` / `_pages` read fine
 * to a human and EVADE every grep-based verifier (including this file's own
 * token extraction), so nobody ever checks whether the elided name exists.
 * Prose must spell every name in full; the extra bytes buy verifiability.
 * Same prefixes as the gate.
 */
const SHORTHAND_PREFIX = '(?:voice|seo|backlinks|dataforseo_labs|serp|on_page|keywords_data|content_analysis|domain_analytics|business_data|ai_optimization)';
const SHORTHAND = new RegExp(`${SHORTHAND_PREFIX}_[a-z0-9]+(?:_[a-z0-9]+)+\`?\\s*\\/\\s*\`?_[a-z_]+`);

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

const gatedPrefixOf = (token) => GATED_PREFIXES.find((p) => token.startsWith(p)) ?? null;

test('every gated-prefix token in skills/commands/agents is a real, pending, or curated non-tool name', () => {
  const index = loadIndex();
  const files = walkMarkdown();

  const misses = new Map(); // token -> [`file:line`, ...] (capped, so the failure is readable)
  const otherPrefixMisses = new Map(); // prefix -> Set of tokens
  const checked = new Map(GATED_PREFIXES.map((p) => [p, 0]));
  const MAX_LOCS = 6;

  for (const file of files) {
    const rel = path.relative(root, file);
    // Bold markers are stripped first: `**voice_fake_tool**` must not hide from the gate
    // behind the `(?![\w*])` guard that exists to skip wildcard forms like `voice_ivr_*`.
    const lines = fs.readFileSync(file, 'utf8').replace(/\*\*/g, '').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(TOKEN)) {
        const token = m[1];
        const gated = gatedPrefixOf(token);
        if (gated) {
          checked.set(gated, checked.get(gated) + 1);
          if (index.has(token) || PENDING_TOOLS.has(token) || KNOWN_NON_TOOLS.has(token)) continue;
          if (!misses.has(token)) misses.set(token, []);
          const locs = misses.get(token);
          if (locs.length < MAX_LOCS) locs.push(`${rel}:${i + 1}`);
        } else if (token.includes('_') && !index.has(token)) {
          const prefix = token.slice(0, token.indexOf('_'));
          if (!otherPrefixMisses.has(prefix)) otherPrefixMisses.set(prefix, new Set());
          otherPrefixMisses.get(prefix).add(token);
        }
      }
    });
  }

  // Report-only for other prefixes: most of these are field names and prose
  // snakes, and no program owns that cleanup yet.
  const report = [...otherPrefixMisses.entries()]
    .map(([p, s]) => [p, s.size])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([p, n]) => `${p}:${n}`)
    .join(' ');
  console.log(`  [tool-names] non-index snake tokens by other prefix (report only): ${report || 'none'}`);
  console.log(`  [tool-names] gated tokens checked: ${[...checked.entries()].map(([p, n]) => `${p}${n}`).join(' ')}`);

  for (const [prefix, floor] of Object.entries(MIN_CHECKED)) {
    assert.ok(
      checked.get(prefix) > floor,
      `only ${checked.get(prefix)} ${prefix} tokens found (floor ${floor}) - extraction is broken, not the prose`,
    );
  }

  assert.deepEqual(
    [...misses.entries()].map(([t, locs]) => `${t} (${locs.join(', ')})`),
    [],
    'gated-prefix names that are neither in lib/tool-index.json, PENDING_TOOLS, nor KNOWN_NON_TOOLS. ' +
      'A real incoming tool belongs in test/pending-tools.mjs with its batch; a table/error/column ' +
      'belongs in KNOWN_NON_TOOLS with a reason; anything else is a fabricated name - fix the prose.',
  );
});

test('no PENDING_TOOLS entry still exists once the index contains it', () => {
  const index = loadIndex();
  const stale = [...PENDING_TOOLS.keys()].filter((name) => index.has(name));
  assert.deepEqual(
    stale,
    [],
    'these tools have LANDED in lib/tool-index.json - delete their entries from test/pending-tools.mjs ' +
      'so the pending bridge cannot mask a future rename: ' + stale.join(', '),
  );
});

test('no shorthand suffix chains after a gated-prefix tool name', () => {
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
    'shorthand like `voice_pool_create/_update`, `seo_gbp_media_add/_delete` or `seo_bing_query_stats / _pages` ' +
      'evades name verification - spell every tool name in full:\n  ' + hits.join('\n  '),
  );
});
