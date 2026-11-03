/**
 * The two seo_local tools that compare periods (SEO wave F review, findings F-PLUGIN-1 and F5).
 *
 * seo_local_compare_periods and seo_local_rank_changes split the `days` they are given at ceil(days/2) days ago,
 * and the two sides are NOT the same length: the current one runs from that day through today (ceil(days/2) + 1
 * dates, the newest of them not reported by Search Console yet), the previous one is the floor(days/2) days before
 * (hiveku_builder src/lib/seo/local-freshness.ts compareWindow, src/app/api/olympus/seo/local/route.ts). Each side
 * of compare_periods carries data_points (the days with data), and a total compares fairly only when both sides
 * have the same data_points. rank_changes defaults to 30 days, not 7.
 *
 * The plugin said the opposite: "a true 90-vs-90", "two 14-day halves", "the last 15 days against the 15 before",
 * "Defaults are days: 7". With that, /hiveku:local read days 180 as 90 against 90 and reported a fall in clicks
 * that was only the current side's unreported days: the false decline the desktop cards were changed to avoid, and
 * the opposite of what the MCP tool text tells the same agent. These pin both halves: no prose repeats the old
 * claim, and every place that teaches the comparison says to compare totals only on equal data_points.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Prose wraps at ~100 columns, so compare with whitespace collapsed. */
const flat = (text) => text.replace(/\s+/g, ' ');

/** Every file a session or an eval reads about these tools: the SEO skill, the commands, the agents, the local eval. */
function prose() {
  const out = [];
  const walk = (dir, keep) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel, keep);
      else if (keep(e.name)) out.push(rel);
    }
  };
  walk('skills', (name) => name.endsWith('.md'));
  walk('commands', (name) => name.endsWith('.md'));
  walk('agents', (name) => name.endsWith('.md'));
  walk('evals/fixtures/local', (name) => /\.(md|mjs|json)$/.test(name) && name !== 'local_metrics.json');
  out.push('evals/README.md');
  return out;
}

/** Paragraphs (blank-line separated; a table row is its own paragraph), with the line each starts on. */
function paragraphsOf(text) {
  const out = [];
  let start = 0;
  let buf = [];
  const lines = text.split('\n');
  const flush = (end) => {
    if (buf.length) out.push({ line: start + 1, text: flat(buf.join(' ')) });
    buf = [];
    start = end + 1;
  };
  lines.forEach((line, i) => {
    if (!line.trim()) return flush(i);
    if (line.trim().startsWith('|')) {
      flush(i - 1);
      buf.push(line);
      return flush(i);
    }
    buf.push(line);
  });
  flush(lines.length);
  return out;
}

const NAMES_THE_SPLIT = /seo_local_compare_periods|seo_local_rank_changes|`seo_local_\*`|compare_periods/;

/**
 * The old claim, in the shapes it took. The `N-vs-N` and `N vs N` shapes are judged only in a paragraph that names
 * one of the two tools: seo_gsc_period_comparison takes two explicit periods, so its "7-vs-7" is true.
 */
const STALE_ANYWHERE = [
  /\ba true \d+-vs-\d+/i,
  /\btwo \d+-day halves\b/i,
  /\bthe last (\d+) days against the \1 before\b/i,
  /Defaults are `days: 7`/,
  /every `days` you pass is HALVED/i,
  /`seo_local_\*` tools halve/i,
  /\bthe last two HALVE\b/,
  /current is the latest ceil\(days\/2\) days, previous is the ceil\(days\/2\) days before/,
];
const STALE_NEAR_THE_TOOLS = [
  // "90-vs-90", "15 against 15"; "not 30 against 30" is the correction, not the claim.
  /(?<!\bnot )\b(\d+)\s*(?:-vs-|vs\.?|versus|against)\s*\1\b/i,
  /\bhalves the (?:window|days) you pass\b(?![^.|]*unequal|[^.|]*not the same length)/i,
];

test('no prose says compare_periods or rank_changes gives two equal halves, or that rank_changes defaults to 7 days', () => {
  const offenders = [];
  for (const rel of prose()) {
    for (const p of paragraphsOf(read(rel))) {
      const near = NAMES_THE_SPLIT.test(p.text);
      const hit = STALE_ANYWHERE.find((re) => re.test(p.text)) ?? (near ? STALE_NEAR_THE_TOOLS.find((re) => re.test(p.text)) : undefined);
      if (hit) offenders.push(`${rel}:${p.line} ${hit} :: ${p.text.slice(0, 160)}`);
    }
  }
  assert.deepEqual(offenders, [], 'the sides are not the same length: current runs through today (ceil(days/2) + 1 dates), previous is floor(days/2)');
});

test('every place that teaches the comparison says to compare totals only on equal data_points', () => {
  const teachers = {
    'commands/local.md': 'seo_local_compare_periods({ days: 180',
    'skills/hiveku-seo-agency/references/local-seo.md': 'The half-window trap',
    'skills/hiveku-seo-agency/references/forecasting-and-seasonality.md': '| `seo_local_compare_periods` | LIVE |',
    'skills/hiveku-seo-agency/references/seo-playbooks.md': "seo_local_compare_periods({ days: 56, source: 'all' })",
    'skills/hiveku-seo-agency/SKILL.md': 'split the window you pass into unequal sides',
    'agents/hiveku-seo-analyst.md': 'split the window you pass into two sides that are not the same length',
  };
  for (const [rel, anchor] of Object.entries(teachers)) {
    const p = paragraphsOf(read(rel)).find((para) => para.text.includes(flat(anchor)));
    assert.ok(p, `${rel}: the paragraph teaching the comparison moved (anchor "${anchor}")`);
    assert.match(p.text, /\bdata_points\b/, `${rel}:${p.line} must say a total compares only when both sides have the same data_points`);
  }
  // The play itself says what each side is, where the dates are named, and what to do when the data_points differ.
  const local = flat(read('commands/local.md'));
  assert.match(local, /current is the 91 dates through today \(Search Console has not reported the newest few yet\) and previous is the 90 before; `data\.window` names both/);
  assert.match(local, /give a change only when `current\.data_points` equals `previous\.data_points`; otherwise report both totals with their day counts, never a percent change/);
  assert.match(local, /Read `freshness` first/);
  // The diagnosis line gives the real counts for days 30 and 7.
  const ref = flat(read('skills/hiveku-seo-agency/references/local-seo.md'));
  assert.match(ref, /`seo_local_compare_periods\(\{ days: 30 \}\)` compares the 16 dates through today against the 15 before/);
  assert.match(ref, /`seo_local_rank_changes\(\{ days: 7 \}\)` compares 4 dates against 3/);
  assert.match(ref, /Defaults are `days: 30` \/ `min_drop: 3`/);
});

test('the local eval fixture splits the window as the route does, for every days a play passes', async () => {
  const { createTools } = await import(pathToFileURL(path.join(root, 'evals/fixtures/local/tools.mjs')).href);
  const tools = await createTools();
  for (const days of [2, 7, 28, 30, 56, 90, 180, 365]) {
    const data = tools.seo_local_compare_periods({ days, source: 'all' }).data;
    const half = Math.ceil(days / 2);
    assert.deepEqual([days, data.window.current.days, data.window.previous.days], [days, half + 1, days - half]);
    for (const side of ['current', 'previous']) assert.equal(typeof data[side].data_points, 'number', `${days}: ${side}.data_points`);
    assert.equal(typeof data.freshness?.data_through, 'string', `${days}: freshness`);
  }
});

test('source cross-check: the builder splits and defaults as this prose says', (t) => {
  const builder = path.join(root, '..', 'hiveku_builder', 'src');
  const files = {
    windows: path.join(builder, 'lib', 'seo', 'local-freshness.ts'),
    route: path.join(builder, 'app', 'api', 'olympus', 'seo', 'local', 'route.ts'),
  };
  if (!Object.values(files).every((f) => fs.existsSync(f)) || !fs.readFileSync(files.windows, 'utf8').includes('export function compareWindow(')) {
    t.diagnostic('source cross-check skipped: no hiveku_builder checkout with the SEO wave F windows beside this repo');
    return;
  }
  const windows = fs.readFileSync(files.windows, 'utf8');
  assert.match(windows, /const half = Math\.ceil\(days \/ 2\)/, 'the split moved off ceil(days/2): the prose and the fixture must change');
  assert.match(windows, /const current: PeriodWindow = \{ days: half \+ 1,/, 'the current side is no longer half + 1 dates: the prose and the fixture must change');
  assert.match(windows, /const previousDays = days - half/, 'the previous side is no longer floor(days/2): the prose and the fixture must change');
  const route = fs.readFileSync(files.route, 'utf8');
  assert.match(route, /parseInt\(sp\.get\('days'\) \?\? '30', 10\)/, "the route's days default is no longer 30: the rank_changes default in the prose must change");
  assert.match(route, /const midpoint = daysAgo\(Math\.ceil\(days \/ 2\)\);/);
  assert.match(route, /data_points: cur\.data_points,/);
  assert.match(route, /data_points: prev\.data_points,/);
});
