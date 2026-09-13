/**
 * The phone doctrine the plugin teaches must match what the server serves.
 *
 * The 2026-09-13 call-tracking audit found the engine complete and the
 * doctrine stale in four ways, each one a sentence that read fine and sent
 * an operator to the dashboard for something a tool already did:
 *
 *   - 50 Availability rows across nine phone references marked INCOMING for
 *     tools live since 2026-08-30 (all pool CRUD, membership, E911 apply,
 *     tracking config, the swap test, purchase, porting, 10DLC, bulk SMS).
 *     The INCOMING ratchet in tool-names.test.mjs is hardcoded to one webflow
 *     file, so nothing failed while the rows aged.
 *   - /hiveku:call-report named voice_call_transcript_get, which the PPC key
 *     cannot see; the marketing-ads profile reads transcripts through
 *     marketing_call_transcript_get.
 *   - /hiveku:call-tracking taught voice_phone_tracking_config_set
 *     mid-cutover without saying it is a FULL REPLACE (an omitted
 *     swap_source_numbers wipes the CallRail numbers being swapped), without
 *     the max-5 cap, and without the redeploy a consent change needs.
 *   - voice_swap_test and voice_call_tracking_live_probe each hold a real
 *     tracking DID for the sticky window, and neither was ask-gated: on a
 *     machine configured per INSTALL.md an unattended session could starve a
 *     small pool of real visitors with a diagnostic loop.
 *
 * A second pass the same day re-checked the prose against the builder
 * routes and found sentences that read fine and were wrong: the "exhaustion
 * fallback" named the printed number (poolFallback hands back the
 * purpose:'main' DID), every `enabled` flip was taught as deploy-time (only
 * ON is; embed/phone-swap answers 204 the moment it is false), voice_pool_get
 * was offered as the corroboration for a block it reports from the same
 * tolerant read, the list route's occupancy_measured_at was placed per pool,
 * the starvation inbox rows were counted as notices (they dedup on the open
 * statuses), Recipe 6 sent voice_phone_tracking_config_set bare, and
 * /hiveku:call-report dropped the transcript tool's own PII warning.
 *
 * Each block below pins one of those. The Availability parser reads every
 * phone reference (three table shapes), so a row cannot outlive the index
 * regen and a LIVE row cannot name a tool the index lacks; the coverage
 * block makes a new voice_* tool without a row a failure, not a report line.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const SKILL_DIR = 'skills/hiveku-phone-agency';
const REFERENCES_DIR = `${SKILL_DIR}/references`;
/**
 * The references whose Availability table the parser reads. voice-playbooks.md
 * is deliberately absent: its table lists recipes, not tools, and is pinned
 * separately below.
 */
const REFERENCES = [
  'call-tracking-dni.md',
  'caller-id-and-reputation.md',
  'calls-voicemail-transcripts.md',
  'conversion-send-back.md',
  'numbers-and-e911.md',
  'pbx-routing.md',
  'porting.md',
  'sms-operations.md',
  'tendlc-and-toll-free.md',
].map((f) => `${REFERENCES_DIR}/${f}`);
const PLAYBOOKS = `${REFERENCES_DIR}/voice-playbooks.md`;
const CALL_REPORT = 'commands/call-report.md';
const CALL_TRACKING = 'commands/call-tracking.md';
const SMS = 'commands/sms.md';
const VOICE_ANALYST = 'agents/hiveku-voice-analyst.md';
const GATES = 'data/permission-critical-tools.json';

/** The two VOICE-J reads: INCOMING until the index regen at release, then LIVE. */
const VOICE_J_NAMES = ['voice_pool_sessions_list', 'voice_sms_opt_outs_list'];
const VOICE_J_SINCE = '2026-09-13';

/**
 * Tier 1 of the 2026-09-13 gate round: the two DID-holders, the full-replace
 * config writes, and the pool writes whose destination rewrites every member
 * DID's routing. These must stay on the ask list.
 */
const TIER_1_GATES = [
  'voice_swap_test',
  'voice_call_tracking_live_probe',
  'voice_phone_tracking_config_set',
  'voice_phone_tracking_config_delete',
  'voice_pool_update',
  'voice_pool_create',
  'voice_pool_numbers_add',
  'voice_pool_numbers_remove',
  'voice_pool_e911_apply',
];

/**
 * Prose that tells an agent to wait for a ship or go to the dashboard while a
 * tool exists. Every one of these shipped in a phone reference between
 * 2026-08-30 and 2026-09-13 for a tool that was already live.
 */
const FALLBACK_PHRASES = [
  'until it ships',
  'until it resolves',
  'once live',
  'dashboard fallback',
  'has not shipped on this server yet',
  'INCOMING - ',
];

const toolIndex = () =>
  new Map(JSON.parse(read('lib/tool-index.json')).tools.map((t) => [t.name, t.method]));

/** Every backticked tool-shaped token in one table cell, in order. */
const namesIn = (cell) => [...cell.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]);

/**
 * The Availability table a phone reference carries, as one row per NAME. Three
 * shapes exist: `| Tool | Status | ... |` and `| Tool | State |` (the Tool cell
 * may hold several names; Status may read "LIVE (...)" or "INCOMING - ..."),
 * and pbx-routing's `| Area | LIVE now | INCOMING | ... |` matrix, where the
 * second column's names are LIVE and the third's INCOMING. Names come ONLY
 * from the Tool cell (or the two matrix columns), never from a note, and only
 * the `## Availability` section is scanned, so a tool spelled in a play does
 * not read as a row.
 */
function readAvailabilityRows(rel) {
  const lines = read(rel).split('\n');
  const start = lines.findIndex((l) => /^## Availability\s*$/.test(l));
  assert.ok(start >= 0, `${rel} has no "## Availability" section`);
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const header = lines.findIndex((l, i) => i > start && i < end && /^\|\s*(Tool|Area)\s*\|/.test(l));
  assert.ok(header >= 0, `${rel}: no "| Tool | Status |" or "| Area | LIVE now | INCOMING |" header in its Availability section`);
  const matrix = /^\|\s*Area\s*\|/.test(lines[header]);
  if (matrix) {
    assert.match(lines[header], /^\|\s*Area\s*\|\s*LIVE now\s*\|\s*INCOMING\s*\|/, `${rel}: the Area matrix header changed shape`);
  }
  const rows = [];
  for (let i = header + 2; i < end && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').map((c) => c.trim());
    if (matrix) {
      for (const name of namesIn(cells[2] ?? '')) rows.push({ name, status: 'LIVE', file: rel, line: i + 1 });
      for (const name of namesIn(cells[3] ?? '')) rows.push({ name, status: 'INCOMING', file: rel, line: i + 1 });
      continue;
    }
    const status = cells[2] ?? '';
    for (const name of namesIn(cells[1] ?? '')) rows.push({ name, status, file: rel, line: i + 1 });
  }
  assert.ok(rows.length > 0, `${rel}: no Availability rows parsed`);
  return rows;
}

function markdownFiles(rel) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) out.push(child);
    }
  };
  walk(rel);
  return out.sort();
}

const where = (r) => `${r.name} (${r.file}:${r.line})`;

test('the phone Availability tables agree with the index and the pending bridge', () => {
  const index = toolIndex();
  const rows = REFERENCES.flatMap(readAvailabilityRows);
  assert.ok(rows.length > 120, `only ${rows.length} Availability rows parsed across the phone references - the parser is broken, not the tables`);

  const unlabelled = rows.filter((r) => !/LIVE|INCOMING/.test(r.status)).map((r) => `${where(r)} status "${r.status}"`);
  assert.deepEqual(unlabelled, [], 'a named Availability row carries a Status that is neither LIVE nor INCOMING');

  assert.deepEqual(
    rows.filter((r) => /INCOMING/.test(r.status) && index.has(r.name)).map(where),
    [],
    'an INCOMING row names a tool lib/tool-index.json already carries - flip its Status to LIVE',
  );
  assert.deepEqual(
    rows.filter((r) => /INCOMING/.test(r.status) && !PENDING_TOOLS.has(r.name)).map(where),
    [],
    'an INCOMING row names a tool test/pending-tools.mjs does not carry - a row for a name that is ' +
      'neither live nor pending sends the agent to the dashboard for nothing',
  );
  assert.deepEqual(
    rows.filter((r) => /LIVE/.test(r.status) && !index.has(r.name)).map(where),
    [],
    'a LIVE row names a tool lib/tool-index.json does not carry',
  );

  // An incoming name is spelled in exactly one Availability row, so a rename
  // before the MCP deploy is one table edit plus the pending entry.
  const incoming = [...new Set(rows.filter((r) => /INCOMING/.test(r.status)).map((r) => r.name))];
  for (const name of incoming) {
    const hits = rows.filter((r) => r.name === name);
    assert.equal(hits.length, 1, `${name} must appear in exactly one Availability row, found ${hits.map(where).join(', ')}`);
  }
});

test('the two VOICE-J reads are live or pending under VOICE-J, and the INCOMING prose leaves with them', () => {
  const index = toolIndex();
  for (const name of VOICE_J_NAMES) {
    const pending = PENDING_TOOLS.get(name);
    assert.ok(index.has(name) || pending, `${name} is neither in lib/tool-index.json nor test/pending-tools.mjs`);
    if (pending) {
      assert.equal(pending.batch, 'VOICE-J', `${name} is pending under the wrong batch`);
      assert.equal(pending.since, VOICE_J_SINCE, `${name} carries the wrong since date`);
    }
  }
  // The Availability rows are the only INCOMING the parser sees, but the
  // skill also SAYS "except the two rows marked INCOMING" in prose (the
  // SKILL.md availability rule, the Availability intros of
  // call-tracking-dni.md and sms-operations.md). Once VOICE-J leaves
  // pending-tools.mjs the row flip must take that prose with it, or the
  // skill outlives the flip green. pbx-routing.md keeps the token as a
  // matrix column name and its legend, so it is exempt.
  const voiceJPending = [...PENDING_TOOLS.values()].some((p) => p.batch === 'VOICE-J');
  if (!voiceJPending) {
    const stale = [];
    for (const rel of markdownFiles(SKILL_DIR)) {
      if (rel.endsWith('/pbx-routing.md')) continue;
      read(rel).split('\n').forEach((line, i) => {
        if (line.includes('INCOMING')) stale.push(`${rel}:${i + 1}`);
      });
    }
    assert.deepEqual(
      stale,
      [],
      'VOICE-J has landed but the phone skill still says INCOMING outside pbx-routing.md:\n  ' + stale.join('\n  '),
    );
  }
});

test('every voice_ tool in the index has an Availability row in the phone skill', () => {
  const index = toolIndex();
  const seen = new Set(REFERENCES.flatMap(readAvailabilityRows).map((r) => r.name));
  const missing = [...index.keys()].filter((n) => n.startsWith('voice_') && !seen.has(n)).sort();
  assert.deepEqual(
    missing,
    [],
    'voice_ tools the index carries that no phone reference lists in its Availability table - an ' +
      'agent reading the skill cannot know these exist. Add a row to the reference that owns the ' +
      'area: ' + missing.join(', '),
  );
});

test('voice-playbooks.md carries no INCOMING token: every recipe is live end to end', () => {
  const text = read(PLAYBOOKS);
  assert.ok(!text.includes('[INCOMING'), 'voice-playbooks.md still carries an [INCOMING ...] step token');
  const lines = text.split('\n');
  const header = lines.findIndex((l) => /^\|\s*Recipe\s*\|/.test(l));
  assert.ok(header >= 0, 'voice-playbooks.md has no "| Recipe | ..." Availability table');
  const stale = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    if (/INCOMING/.test(lines[i])) stale.push(`${PLAYBOOKS}:${i + 1}`);
  }
  assert.deepEqual(stale, [], 'a recipe row still reads INCOMING');
});

test('no phone reference or the skill keeps a wait-for-the-ship or dashboard-fallback clause', () => {
  const hits = [];
  for (const rel of markdownFiles(SKILL_DIR)) {
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      for (const phrase of FALLBACK_PHRASES) {
        if (line.toLowerCase().includes(phrase.toLowerCase())) hits.push(`${rel}:${i + 1} "${phrase}"`);
      }
    });
  }
  assert.deepEqual(
    hits,
    [],
    'fallback prose for a tool that resolves today. State what the tool does; a name that does not ' +
      'resolve is a profile question, not a ship date:\n  ' + hits.join('\n  '),
  );
});

test('/hiveku:call-report reads transcripts through the tool the PPC key can see', () => {
  const text = read(CALL_REPORT);
  assert.ok(text.includes('marketing_call_transcript_get'), 'call-report.md must name marketing_call_transcript_get');
  assert.ok(
    !text.includes('voice_call_transcript_get'),
    'call-report.md names voice_call_transcript_get, which is invisible on the marketing-ads (PPC) key',
  );
  // The tool's own declaration leads with the warning; a command that names
  // the tool for a client-facing report carries it too.
  assert.match(text, /unredacted/, 'call-report.md must say the transcript is verbatim and unredacted before telling the agent to quote it');
});

test('the pool-read, inbox and cutover doctrine matches the routes', () => {
  // pools/[id]/route.ts rides the same tolerant second read as pools/route.ts
  // (P2022 swallowed to NEW_POOL_FIELD_DEFAULTS), so voice_pool_get cannot
  // corroborate the list's call-handling block.
  const skill = read(`${SKILL_DIR}/SKILL.md`);
  assert.ok(
    !/corroborate with `voice_pool_get`/.test(skill),
    'SKILL.md sends the agent to voice_pool_get to corroborate a whisper block it reports from the same read',
  );
  const dni = read(`${REFERENCES_DIR}/call-tracking-dni.md`);
  // pools/route.ts returns occupancy_measured_at once, beside pools[], not per row.
  assert.match(dni, /top-level\s+`occupancy_measured_at`/, 'call-tracking-dni.md must place the list route occupancy_measured_at at the response level');
  // seed-inbox.ts dedups voice.pool_starvation on the open statuses, so rows
  // are episodes, not notices.
  assert.ok(!dni.includes('one item per pool per notice'), 'call-tracking-dni.md still counts starvation inbox rows as notices');
  assert.match(dni, /one OPEN item per pool/, 'call-tracking-dni.md must teach the open-item dedup on voice.pool_starvation');
  // Recipe 6 (the CallRail cutover) writes the tracking config twice; each
  // write is a FULL REPLACE and needs the GET in the same step.
  const playbooks = read(PLAYBOOKS);
  const start = playbooks.indexOf('## Recipe 6');
  assert.ok(start >= 0, 'voice-playbooks.md has no Recipe 6');
  const next = playbooks.indexOf('\n## ', start + 1);
  const recipe6 = playbooks.slice(start, next < 0 ? undefined : next);
  const gets = (recipe6.match(/voice_phone_tracking_config_get/g) ?? []).length;
  const sets = (recipe6.match(/voice_phone_tracking_config_set/g) ?? []).length;
  assert.ok(sets >= 1, 'Recipe 6 must name voice_phone_tracking_config_set for the bridge');
  assert.ok(gets >= sets, `Recipe 6 names voice_phone_tracking_config_set ${sets} time(s) but voice_phone_tracking_config_get ${gets}: every set is a FULL REPLACE and needs the GET first`);
  assert.match(recipe6, /FULL REPLACE/, 'Recipe 6 must say the config set is a FULL REPLACE');
});

test('/hiveku:call-tracking teaches the config trap, the cap, the redeploy, and the two occupancy reads', () => {
  const text = read(CALL_TRACKING);
  assert.match(text, /FULL REPLACE/, 'voice_phone_tracking_config_set must be taught as a FULL REPLACE');
  assert.match(text, /(max|up to) 5/, 'the swap_source_numbers cap of 5 must be stated');
  assert.match(text, /REDEPLOY/i, 'a consent_mode change, or turning tracking on, takes effect only on a redeploy');
  // Disabling is read on every mint: embed/phone-swap/[projectId] answers 204
  // the moment enabled is false, so only the tag waits for the deploy.
  assert.match(text, /next page load/, 'turning tracking OFF must be taught as live on the next page load, not on a redeploy');
  // The exhaustion fallback is the account's purpose:'main' DID
  // (pool-assignment.ts poolFallback), never the number printed on the page.
  assert.ok(!text.includes('is the exhaustion fallback'), 'the printed number is not the exhaustion fallback - the main DID is');
  assert.match(text, /purpose: 'main'/, "setup must check for an active purpose:'main' DID");
  assert.ok(text.includes('voice_pool_get'), 'the occupancy read voice_pool_get must be named');
  assert.ok(text.includes('voice_pool_sessions_list'), 'the non-minting read voice_pool_sessions_list must be named');
});

test('/hiveku:sms names the opt-out list read', () => {
  assert.ok(read(SMS).includes('voice_sms_opt_outs_list'), 'sms.md must name voice_sms_opt_outs_list');
});

test('the DID-holding probes and the routing-rewriting pool writes are ask-gated', () => {
  const gated = new Set(JSON.parse(read(GATES)).tools.map((t) => t.name));
  const missing = TIER_1_GATES.filter((n) => !gated.has(n));
  assert.deepEqual(
    missing,
    [],
    'Tier 1 voice tools missing from data/permission-critical-tools.json (and so from the INSTALL.md ' +
      'ask block): on a machine configured per INSTALL.md these run unprompted: ' + missing.join(', '),
  );
});

test('the voice analyst reads occupancy and sessions, and still refuses the two DID-holding probes', () => {
  const text = read(VOICE_ANALYST);
  assert.ok(text.includes('voice_pool_get'), 'the analyst must read the occupancy block through voice_pool_get');
  assert.ok(text.includes('voice_pool_sessions_list'), 'the analyst must reach for the non-minting voice_pool_sessions_list');
  // "never" and the name may sit on different lines of the same sentence.
  assert.match(text, /never\s+`voice_call_tracking_live_probe`/, 'the analyst must still refuse voice_call_tracking_live_probe');
  assert.match(text, /never\s+`voice_swap_test`/, 'the analyst must still refuse voice_swap_test');
});
