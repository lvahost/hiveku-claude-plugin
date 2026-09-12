/**
 * The content doctrine the plugin teaches must match what the server does.
 *
 * Four drifts shipped together in the 2026-09-11 content-engine audit
 * (findings channels-3, -4, -6, -11), each one a sentence that read fine and
 * sent an operator the wrong way:
 *
 *   - /hiveku:campaign and the README said `content_schedule` schedules a
 *     SEND. It schedules a publish date on a content item, and today the row
 *     lands in a table nothing executes - an operator confirmed a date and
 *     believed the pieces would go out. They never did.
 *   - The Play 3 quality gate checked a title length and a meta description
 *     and called the piece ready; the H1, the slug, the keyword placement,
 *     heading hierarchy, image alt, internal links and citations were never
 *     looked at, so "the gate passed" meant almost nothing.
 *   - The key-profile notes said `cms_*` is `dev`-only and that a marketing
 *     key cannot read its own project ids; the server's profiles.ts grants
 *     the `marketing` key the whole cms_ family plus sites_list, project_get
 *     and deploy_site. Operators were told to ask for ids they could read.
 *   - The tool-name honesty gate did not cover the content_ prefix, so a
 *     fabricated content_* name in prose was a report line, not a failure.
 *
 * Each block below pins one of those. The profile block also reads the
 * server's profiles.ts when the sibling checkout is present, so the prose
 * cannot drift from the grant again without this failing.
 *
 * Round A of the elite content program (2026-09-12) added the ELITE-A blocks
 * at the bottom: research before a draft (the knowledge base as the research
 * layer), proof (the proof pack, one proof element per H2, an unsourced
 * figure is an error at the decision stage, case studies from a won deal
 * with the consent rule), distribution as part of the asset (the plan on the
 * row at brief time, the publish event and its two templates,
 * utm_medium=content), and a scorecard that counts leads per piece - which
 * retired the "never read content_analytics_get" sentence this file's
 * siblings used to teach. The eight names ride on PENDING_TOOLS as ELITE-A
 * until the live index regenerates after the MCP deploy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const SKILL = 'skills/hiveku-content-agency/SKILL.md';
const SITE_PUBLISHING = 'skills/hiveku-content-agency/references/site-publishing.md';
const CAMPAIGN = 'commands/campaign.md';

const toolIndex = () =>
  new Set(JSON.parse(read('lib/tool-index.json')).tools.map((t) => t.name));

// ── channels-3: content_schedule is a publish date, never a send ────────────

test('campaign.md and the README describe content_schedule as recorded publish intent, not a send', () => {
  const campaign = read(CAMPAIGN);
  assert.doesNotMatch(campaign, /scheduled to SEND/i, 'the drifted phrase is back in commands/campaign.md');
  // Every sentence that names content_schedule must not present it as a send.
  // The one permitted pairing is the correction itself ("never a send").
  const sentences = campaign.replace(/never a send/g, '').split(/\.\s/);
  const offenders = sentences.filter((s) => s.includes('content_schedule') && /\bsend\b/i.test(s));
  assert.deepEqual(offenders, [], 'a sentence in campaign.md pairs content_schedule with a send');
  assert.match(
    campaign,
    /`content_schedule`[\s\S]{0,120}schedules a PUBLISH \(or unpublish\) date on a content item/,
    'campaign.md must say what content_schedule actually schedules',
  );
  assert.match(campaign, /recorded intent only/, 'campaign.md must say the row is recorded intent');
  assert.match(
    campaign,
    /confirmed `content_publish_to_site` \+ deploy/,
    'campaign.md must name the confirmed publish that actually ships the piece',
  );
  assert.match(campaign, /\/hiveku:ship-week/, 'campaign.md must point at the command that lists rows that will not ship themselves');

  const readmeLine = read('README.md').split('\n').find((l) => l.includes('`campaign` ('));
  assert.ok(readmeLine, 'README.md no longer lists the campaign command');
  assert.doesNotMatch(readmeLine, /\+ schedule\)/, 'README.md still sells campaign as "plan + draft + schedule"');
  assert.match(readmeLine, /calendar intent/, 'README.md must call the schedule step calendar intent');
});

// ── channels-4: the Play 3 pre-publish gate is the full on-page list ────────

test('the Play 3 quality gate covers the full pre-publish checklist and names only real tools', () => {
  const skill = read(SKILL);
  const start = skill.indexOf('5. **Quality gate');
  assert.ok(start > 0, 'Play 3 step 5 (the quality gate) is gone from the content skill');
  const end = skill.indexOf('6. **Persist:', start);
  assert.ok(end > start, 'Play 3 step 6 no longer follows the quality gate');
  const gate = skill.slice(start, end);

  const required = [
    ['a piece that fails does not ship', /does not ship/],
    ['exactly one H1 carrying the keyword', /Exactly one H1, and it carries the target keyword/],
    ['keyword in title, slug and first 100 words', /keyword appears in the title, in the slug, and in the first 100 words/],
    ['heading hierarchy', /Heading hierarchy is intact/],
    ['alt on hero and inline images', /Alt text on the hero \(`featured_image_alt`\) and on every inline image/],
    ['at least two internal links by real URL', /At least two internal links to EXISTING published pieces, each by its real URL/],
    // Round 2: the URLs come from content_site_links first; the older reads are
    // the fallbacks, and "never invented" still governs all of them.
    ['link URLs from content_site_links, never invented', /`content_site_links\(\{ project_id \}\)`[\s\S]*never\s+invented, never guessed from a title/],
    ['the fallback link reads survive', /`content_list`[\s\S]*`cms_list_entries`[\s\S]*`seo_internal_links`/],
    ['the mechanical check runs on the stored row', /`content_seo_check\(\{ content_id \}\)` on that row/],
    ['every error is fixed and the check re-run until ok', /fix it with `content_update`[\s\S]*re-run until `result\.ok` is true/],
    ['the publish route never blocks, so the gate is the session', /`content_publish_to_site` runs the same check[\s\S]*NEVER blocks[\s\S]*not called\s+while an error stands/],
    ['external claims link their source', /Every EXTERNAL claim[\s\S]*links its source inline/],
    ['banned phrases from the brand guide', /`ai_forbidden_phrases`[\s\S]*`brand_guide_get`/],
    ['title length', /Title under ~60 characters/],
    ['meta description', /meta description drafted, 150-160/],
    ['post-deploy verification on the live URL', /\/hiveku:seo-onpage/],
  ];
  const missing = required.filter(([, re]) => !re.test(gate)).map(([name]) => name);
  assert.deepEqual(missing, [], 'the quality gate lost these checks');

  // The tools the gate names must be ones the server serves or has contracted
  // - a gate that sends the writer to a tool that does not exist is the
  // phantom-gap class tool-names.test.mjs exists for, but content_list has
  // only two segments and evades that extractor, so it is pinned here by
  // name. The two round-2 names ride on PENDING_TOOLS until the index regen.
  const index = toolIndex();
  const unknown = ['content_list', 'cms_list_entries', 'seo_internal_links', 'brand_guide_get', 'content_seo_check', 'content_site_links']
    .filter((n) => !index.has(n) && !PENDING_TOOLS.has(n));
  assert.deepEqual(unknown, [], 'the quality gate names tools missing from lib/tool-index.json and test/pending-tools.mjs');
});

// ── round 2: the three contracts are documented once, and the timeout is resumable ──

test('site-publishing.md documents content_seo_check, content_site_links and department_turn_get, and the skill resumes a timed-out turn', () => {
  const skill = read(SKILL);
  const sitePublishing = read(SITE_PUBLISHING);
  const index = toolIndex();

  // The names exist somewhere real: the live index or the pending ledger with
  // its batch, so a rename before the MCP deploy is one edit here, not a hunt.
  for (const name of ['content_seo_check', 'content_site_links', 'department_turn_get']) {
    const pending = PENDING_TOOLS.get(name);
    assert.ok(index.has(name) || pending, `${name} is neither in lib/tool-index.json nor test/pending-tools.mjs`);
    if (pending) assert.equal(pending.batch, 'CONTENT-1', `${name} is pending under the wrong batch`);
  }

  // One reference file carries the contracts, headed by the call shape.
  assert.match(sitePublishing, /^## Link targets - `content_site_links\(\{ project_id, limit\? \}\)`$/m, 'site-publishing.md lost the content_site_links section');
  assert.match(sitePublishing, /^## The pre-publish check - `content_seo_check\(\{ content_id \}\)`$/m, 'site-publishing.md lost the content_seo_check section');
  assert.match(sitePublishing, /^## Resuming a department turn - `department_turn_get\(\{ turn_id \}\)`$/m, 'site-publishing.md lost the department_turn_get section');
  // The response keys a session reads, as the builder routes return them.
  for (const key of ['`result.ok`', '`result.checks[]`', '`result.stats`', 'posts.without_url', '`project_id_required`', '`project_not_found`', '`running | completed | errored | cancelled`', '`stale: true`', 'events_available']) {
    assert.ok(sitePublishing.includes(key), `site-publishing.md no longer names ${key}`);
  }
  assert.match(sitePublishing, /Every URL is DERIVED, never guessed/, 'the link-targets section must say URLs are derived, never guessed');
  assert.match(sitePublishing, /it never blocks - the gate is the session, not the route/, 'the check section must say the publish route never blocks');
  assert.match(sitePublishing, /`warnings\[\]`[\s\S]*`seo_check`[\s\S]*NEVER blocks/, 'the bridge step must describe the publish response warnings');

  // The skill itself teaches the resume, in the principle and in Play 3.
  const principle = skill.slice(skill.indexOf('2. **Generative work goes through'), skill.indexOf('3. **Direct tools are for CRUD only**'));
  assert.match(principle, /`department_turn_get\(\{ turn_id \}\)`/, 'principle 2 no longer names department_turn_get');
  assert.match(principle, /Never re-send the ask blind/, 'principle 2 must forbid the blind retry');
  const play3 = skill.slice(skill.indexOf('2. **Draft via the department.**'), skill.indexOf('3. **Optimize against the SERP reality:**'));
  assert.match(play3, /`department_turn_get\(\{ turn_id \}\)`[\s\S]*`status` is `completed`/, 'Play 3 step 2 must resume the timed-out turn until completed');
  assert.match(play3, /Do not\s+re-send the brief/, 'Play 3 step 2 must forbid re-sending the brief');
  // Link planning names the new read in the calendar play and the brief.
  assert.match(skill, /Plan link paths from `content_site_links\(\{ project_id \}\)`/, 'Play 2 step 4 no longer plans links from content_site_links');
  assert.match(skill, /anchors, each with its real URL from `content_site_links\(\{ project_id \}\)`/, 'the Play 3 brief no longer hands the department anchors from content_site_links');
  // Shipped copy: no exclamation marks outside the check's own description of one.
  const shouts = sitePublishing.split('\n').filter((line) => /!/.test(line) && !/exclamation/.test(line));
  assert.deepEqual(shouts, [], 'site-publishing.md carries an exclamation mark in shipped copy');
});

// ── channels-11: the key-profile notes match profiles.ts ────────────────────

test('the key-profile notes match the marketing profile the MCP server actually grants', (t) => {
  const skill = read(SKILL);
  const sitePublishing = read(SITE_PUBLISHING);

  assert.doesNotMatch(skill, /`cms_\*` is `dev`-only/, 'the skill again says cms_* is dev-only');
  assert.doesNotMatch(sitePublishing, /are NOT in the\s+`marketing` profile/, 'site-publishing.md again hides sites_list/project_get from the marketing key');
  assert.doesNotMatch(sitePublishing, /which only the `dev` profile can call/, 'site-publishing.md again says cms_write_entry is dev-only');
  for (const name of ['sites_list', 'project_get', 'deploy_site', 'cms_*']) {
    assert.ok(skill.includes(`\`${name}\``), `the profile note no longer names ${name} as carried by the marketing key`);
  }
  assert.match(
    skill,
    /`account_context_get`,[\s\S]{0,160}always available on\s+every profile/,
    'the profile note must say account_context_get is on every profile (profiles.ts ALWAYS_AVAILABLE)',
  );
  assert.match(skill, /`pages_\*` \(`marketing-seo` \/ `dev` only\)/, 'pages_* is still marketing-seo/dev only and the note must say so');

  const profiles = path.join(root, '..', 'hiveku-mcp-api-server', 'src', 'tools', 'profiles.ts');
  if (!fs.existsSync(profiles)) {
    t.diagnostic('source cross-check skipped: hiveku-mcp-api-server checkout not beside this repo');
    return;
  }
  const src = fs.readFileSync(profiles, 'utf8');
  const slice = (from, to) => {
    const a = src.indexOf(from);
    assert.ok(a >= 0, `profiles.ts no longer contains ${JSON.stringify(from)}`);
    const b = src.indexOf(to, a);
    assert.ok(b > a, `profiles.ts: ${JSON.stringify(to)} no longer follows ${JSON.stringify(from)}`);
    return src.slice(a, b);
  };
  const marketing = slice('\n  marketing: {', "\n  'marketing-seo': {");
  assert.ok(marketing.includes("'cms_'"), 'the marketing profile no longer grants cms_ whole - the skill paragraph must change');
  assert.ok(marketing.includes('SEO_SITE_SURFACE_NAMES'), 'the marketing profile no longer carries the site surface - the skill paragraph must change');
  assert.ok(!marketing.includes("'pages_'"), 'the marketing profile now grants pages_ - the skill says marketing-seo/dev only');
  const surface = slice('const SEO_SITE_SURFACE_NAMES = [', '];');
  for (const name of ['sites_list', 'project_get', 'project_file_save', 'deploy_site', 'cms_write_entry']) {
    assert.ok(surface.includes(`'${name}'`), `SEO_SITE_SURFACE_NAMES lost ${name} - the skill paragraph must change`);
  }
  const always = slice('const ALWAYS_AVAILABLE', ']);');
  for (const name of ['account_context_get', 'talk_to_department', 'web_search', 'fetch_url', 'audit_query']) {
    assert.ok(always.includes(`'${name}'`), `${name} left ALWAYS_AVAILABLE - the skill paragraph must change`);
  }
});

// ── channels-6: a fabricated content_* name fails the honesty gate ──────────

test('a fabricated content_ name in a command fails tool-names.test.mjs', () => {
  // The gate resolves its root from its own file location, so it is exercised
  // on a copy of the prose tree with one planted fabrication. Before content_
  // was gated this copy passed 7/7 with the planted name on a report line.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-content-gate-'));
  try {
    for (const rel of ['skills', 'commands', 'agents']) {
      fs.cpSync(path.join(root, rel), path.join(tmp, rel), { recursive: true });
    }
    for (const rel of ['lib/tool-index.json', 'data/permission-critical-tools.json', 'test/tool-names.test.mjs', 'test/pending-tools.mjs']) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.copyFileSync(path.join(root, rel), path.join(tmp, rel));
    }
    fs.writeFileSync(
      path.join(tmp, 'commands', 'zz-planted.md'),
      '---\ndescription: planted\n---\nPublish with `content_fabricated_publish` when the draft passes.\n',
    );
    // Spawned from inside `node --test`, a child inherits NODE_TEST_CONTEXT and
    // reports to the parent runner instead of exiting non-zero on its own;
    // strip it so the child is an ordinary run whose exit status means what it says.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--test', 'test/tool-names.test.mjs'], { cwd: tmp, encoding: 'utf8', env });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.notEqual(run.status, 0, 'tool-names.test.mjs passed with a fabricated content_ name planted in commands/');
    assert.match(output, /content_fabricated_publish \(commands\/zz-planted\.md:4\)/, 'the failure must name the fabricated token and where it was taught');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── round 3: the grounding is recorded on the row as typed columns ──────────

test('the content skill records who a piece is for on the row as the five typed columns, and reads the header back from them', () => {
  const skill = read(SKILL);
  const sitePublishing = read(SITE_PUBLISHING);
  const prompt = read('evals/fixtures/content-draft/prompt.md');
  const fixtureChecks = read('evals/fixtures/content-draft/checks.mjs');

  // The calendar draft and the production persist carry the five by name.
  assert.match(
    skill,
    /`content_create\(\{ status:\s+"draft", title, content_type, target_keyword, avatar_id, journey_id, journey_stage,\s+before_after_grid_id \}\)`/,
    'Play 2 step 6 no longer persists the calendar cell as the typed columns',
  );
  const play3 = skill.slice(skill.indexOf('2. **Draft via the department.**'), skill.indexOf('3. **Optimize against the SERP reality:**'));
  assert.match(play3, /`content_update\(\{ content_id, avatar_id, journey_id, journey_stage, before_after_grid_id,\s+target_keyword \}\)`/, 'Play 3 step 2 no longer records the grounding on the row');
  assert.match(play3, /`invalid_reference`/, 'Play 3 step 2 must say what a foreign id answers');
  assert.match(play3, /never strip the id to make the call\s+pass/, 'Play 3 step 2 must forbid dropping the id to get a 201');
  assert.match(play3, /an echo without them means the\s+write did not land/, 'Play 3 step 2 must read the echo');

  // The gate reads the header back from the row.
  const gate = skill.slice(skill.indexOf('5. **Quality gate'), skill.indexOf('6. **Persist:'));
  assert.match(gate, /The row carries its grounding/, 'the quality gate lost the grounding item');
  assert.match(gate, /READ BACK from those \(`customer_avatar\.name`,\s+`journey_stage`, `before_after_grid\.name`, `target_keyword`\)/, 'the gate must read the header back from the row');
  assert.match(skill, /6\. \*\*Persist:\*\* `content_create` \(or `content_update` for revisions\) carrying the five\s+grounding params/, 'Play 3 step 6 must persist the five');
  // The coverage matrix comes from the columns and the list filters.
  assert.match(skill, /`content_list` filters on `avatar_id`, `journey_id`, `before_after_grid_id` and\s+`journey_stage`/, 'Play 1 step 6 must build the matrix from the list filters');

  // One reference file carries the contract, headed by the call shape.
  assert.match(sitePublishing, /^## The grounding on the row - `content_create` \/ `content_update` \(\{ avatar_id, journey_id, journey_stage, before_after_grid_id, target_keyword \}\)$/m, 'site-publishing.md lost the grounding section');
  for (const key of ['`code: "invalid_reference"`', 'NOTHING on that call is\n  written', '`customer_avatar`, `customer_journey`\nand `before_after_grid` as `{ id, name }` or null', '`content_list({ avatar_id, journey_id, before_after_grid_id, journey_stage })`', 'before 2026-09-12 carries the keyword only in `settings`', 'the param wins']) {
    assert.ok(sitePublishing.includes(key), `site-publishing.md no longer says ${JSON.stringify(key)}`);
  }
  assert.match(sitePublishing, /The proxy forwards only DECLARED params/, 'site-publishing.md must say an undeclared param is dropped');

  // The legacy settings keys are gone from the doctrine and the eval prompt
  // except where they are named as NOT the contract.
  for (const [label, text] of [['SKILL.md', skill], ['site-publishing.md', sitePublishing], ['content-draft prompt', prompt]]) {
    // Prose wraps, so a mention is judged with the paragraph it sits in.
    const offenders = text
      .split(/\n\s*\n/)
      .filter((paragraph) => /linkedAvatars|targetJourneyStage|linkedBeforeAfterGrids/.test(paragraph))
      .filter((paragraph) => !/not the\s+contract|do not count|nothing reads them/i.test(paragraph));
    assert.deepEqual(offenders, [], `${label} still teaches the settings keys as the place to record the grounding`);
  }
  // The fixture asserts on the columns, not the settings keys.
  assert.match(fixtureChecks, /row\.avatar_id !== BOUNDS\.avatar_id/, 'checks.mjs no longer asserts avatar_id on the row');
  assert.match(fixtureChecks, /row\.journey_stage/, 'checks.mjs no longer asserts journey_stage on the row');
  assert.doesNotMatch(fixtureChecks, /settings\.linkedAvatars\)/, 'checks.mjs still reads settings.linkedAvatars as the contract');
});

// ── ELITE-A: round A of the elite content program (2026-09-12) ─────────────

const RESEARCH_AND_PROOF = 'skills/hiveku-content-agency/references/research-and-proof.md';
const DISTRIBUTION_AND_SCORECARD = 'skills/hiveku-content-agency/references/distribution-and-scorecard.md';
const SME_INTERVIEW = 'commands/sme-interview.md';
const RESEARCH = 'commands/research.md';
const REPURPOSE = 'commands/repurpose.md';

const ELITE_A_NAMES = [
  'content_research_run',
  'content_research_get',
  'content_research_topic',
  'kb_artifacts_list',
  'kb_artifact_get',
  'content_proof_pack',
  'content_case_study_draft',
  'marketing_campaign_roi',
];

/**
 * The "| Tool | Status | Route |" table a reference file carries. The same
 * shape tool-names.test.mjs parses for the Webflow reference; parsed here
 * for the two content references so an INCOMING row cannot outlive the
 * index regen and a LIVE row cannot name a tool the index lacks.
 */
function readAvailabilityRows(rel) {
  const lines = read(rel).split('\n');
  const start = lines.findIndex((l) => /^\|\s*Tool\s*\|\s*Status\s*\|/.test(l));
  assert.ok(start >= 0, `${rel} has no Availability table (no "| Tool | Status | ..." header row)`);
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').map((c) => c.trim());
    const name = (cells[1] ?? '').replace(/`/g, '');
    if (!name) continue;
    rows.push({ name, status: cells[2] ?? '', file: rel, line: i + 1 });
  }
  assert.ok(rows.length > 0, `${rel}: no Availability rows parsed`);
  return rows;
}

test('the eight ELITE-A names are live or pending under ELITE-A, and the Availability tables agree with the index', () => {
  const index = toolIndex();
  for (const name of ELITE_A_NAMES) {
    const pending = PENDING_TOOLS.get(name);
    assert.ok(index.has(name) || pending, `${name} is neither in lib/tool-index.json nor test/pending-tools.mjs`);
    if (pending) {
      assert.equal(pending.batch, 'ELITE-A', `${name} is pending under the wrong batch`);
      assert.equal(pending.since, '2026-09-12', `${name} carries the wrong since date`);
    }
  }
  const rows = [...readAvailabilityRows(RESEARCH_AND_PROOF), ...readAvailabilityRows(DISTRIBUTION_AND_SCORECARD)];
  assert.ok(rows.length >= 12, `only ${rows.length} Availability rows parsed across the two references - the parser is broken, not the tables`);
  const where = (r) => `${r.name} (${r.file}:${r.line})`;
  assert.deepEqual(
    rows.filter((r) => /INCOMING/.test(r.status) && index.has(r.name)).map(where),
    [],
    'an INCOMING row names a tool lib/tool-index.json already carries - flip its Status to LIVE',
  );
  assert.deepEqual(
    rows.filter((r) => /INCOMING/.test(r.status) && !PENDING_TOOLS.has(r.name)).map(where),
    [],
    'an INCOMING row names a tool test/pending-tools.mjs does not carry',
  );
  assert.deepEqual(
    rows.filter((r) => /LIVE/.test(r.status) && !index.has(r.name)).map(where),
    [],
    'a LIVE row names a tool lib/tool-index.json does not carry',
  );
  // An incoming name is spelled in exactly one Availability row, so a rename
  // before the MCP deploy is one table edit plus the pending entry.
  for (const name of ELITE_A_NAMES) {
    if (!PENDING_TOOLS.has(name)) continue;
    assert.equal(rows.filter((r) => r.name === name).length, 1, `${name} must appear in exactly one Availability row`);
  }
});

test('research first: kb_search, then the stamp, then the run when it is missing or older than 30 days', () => {
  const skill = read(SKILL);
  const play1 = skill.slice(skill.indexOf('5. **What we already know'), skill.indexOf('**If any are missing, build them first**'));
  assert.ok(play1.length > 0, 'Play 1 step 5 is gone from the content skill');
  assert.match(play1, /`kb_search\(\{ query \}\)` first/, 'Play 1 step 5 must search the knowledge bases first');
  assert.match(play1, /`content_research_get\(\{ content_id \}\)`/, 'Play 1 step 5 must read the stored research');
  assert.match(
    play1,
    /`content_research_run\(\{\s+content_id \}\)` when the row has no `settings\.research` or its `ran_at` is older than 30 days/,
    'Play 1 step 5 must run the research when the stamp is missing or stale',
  );
  assert.match(play1, /cites `claims\[\]\.source_url` inline/, 'Play 1 step 5 must cite the claim source inline');
  assert.match(play1, /a `quote` is verbatim, never paraphrased/, 'Play 1 step 5 must forbid paraphrased quotes');
  const brief = skill.slice(skill.indexOf('1. **Brief.**'), skill.indexOf('2. **Draft via the department.**'));
  assert.match(brief, /\*\*Research first\.\*\*/, 'the Play 3 brief lost its research-first item');
  assert.match(brief, /a gap is a question for the expert\s+\(`\/hiveku:sme-interview`/, 'the brief must send a research gap to the expert interview');

  const ref = read(RESEARCH_AND_PROOF);
  assert.match(
    ref,
    /^## The research run - `content_research_run\(\{ content_id, queries\?, keyword\?, include_web\?, include_serp\?, max_sources\?, location_code\?, location_name\?, index_sources\? \}\)`$/m,
    'research-and-proof.md lost the research run section',
  );
  for (const key of [
    'What it spends, say so before calling',
    'A re-run refreshes the\nsame artifact',
    'never indexed twice',
    'stamps `settings.research` on the row LAST',
    'extraction: "llm" | "fallback"',
    '`serp: null`',
    '`content_research_get({ content_id })`',
    '`content_research_topic({ topic, keyword?, avatar_id?, project_id?,',
    '`kb_artifacts_list({ artifact_type?, kb_id?, content_id?,\nis_verified?, page?, limit? })`',
    '`kb_artifact_get({ artifact_id })`',
    '`context_type: "content_research"`',
    'never paraphrase it into a quotation',
    '**Index what you used.**',
    'the route does not\n  read them yet',
  ]) {
    assert.ok(ref.includes(key), `research-and-proof.md no longer says ${JSON.stringify(key)}`);
  }

  const research = read(RESEARCH);
  assert.match(research, /Index what you used/, '/hiveku:research lost its index-what-you-used step');
  assert.match(research, /`kb_documents_index_text\(\{ kb_id, title, content,\s+source_url \}\)`/, '/hiveku:research must index the page with its URL');
  assert.match(research, /Memory holds the conclusion, the KB holds the evidence/, '/hiveku:research must split conclusion and evidence');
  assert.match(research, /`content_research_run\(\{ content_id \}\)`/, '/hiveku:research must point content research at the run');
  assert.match(research, /`content_research_topic\(\{ topic \}\)`/, '/hiveku:research must name the topic run');
  assert.doesNotMatch(research, /Persist what you find to department memory \(`memory_create`\)/, '/hiveku:research again teaches a blind memory_create');
});

test('proof: the pack before a consideration or decision piece, one proof element per H2, an unsourced figure is an error at decision', () => {
  const skill = read(SKILL);
  const brief = skill.slice(skill.indexOf('1. **Brief.**'), skill.indexOf('2. **Draft via the department.**'));
  assert.match(
    brief,
    /\*\*Proof before a consideration or decision piece\.\*\* `content_proof_pack\(\{ avatar_id,\s+journey_stage, keyword \}\)`/,
    'the brief must read the proof pack before a consideration or decision draft',
  );
  assert.match(brief, /one proof element per H2/, 'the brief must plan one proof element per H2');
  assert.match(brief, /`consent: true` is quoted with attribution,\s+`consent: false` is paraphrased with no name/, 'the brief must state the consent rule');

  const gate = skill.slice(skill.indexOf('5. **Quality gate'), skill.indexOf('6. **Persist:'));
  assert.match(gate, /`claims_without_source` is a warn, and an ERROR at the decision stage/, 'the gate must say the source rule is an error at decision');
  assert.match(gate, /`proof_per_section`, a warn; `result\.stats\.sections_without_proof`/, 'the gate must name the per-section proof finding and its stat');
  assert.match(gate, /\[source: <label>:<id>\]/, 'the gate must accept the proof-pack citation');

  const ref = read(RESEARCH_AND_PROOF);
  assert.match(ref, /^## The proof pack - `content_proof_pack\(\{ avatar_id\?, journey_stage\?, keyword\?, since\?, limit\? \}\)`$/m, 'research-and-proof.md lost the proof pack section');
  assert.match(ref, /\*\*The consent flag is a rule, not a hint\.\*\*/, 'the consent rule is gone');
  assert.match(ref, /No workaround exists/, 'the consent rule must close the trimmed-name workaround');
  assert.match(ref, /`claims_without_source` \(level `warn`, and `error` at the decision stage/, 'the proof rules section must state the decision-stage error');
  assert.match(ref, /`proof_per_section` \(level `warn`, field `content`\)/, 'the proof rules section must state the per-section warn');
  for (const label of ['[source: testimonial:<id>]', '[source: review:<id>]', '[source: before_after_grid:<id>]']) {
    assert.ok(ref.includes(label), `research-and-proof.md no longer names the citation ${label}`);
  }
  assert.match(skill, /no\s+quoting a proof-pack entry with `consent: false`/, 'the hard stops must close the consent workaround');
  assert.match(skill, /no unsourced figure on a decision piece published over the\s+`claims_without_source` error/, 'the hard stops must close the publish-over-error workaround');
});

test('case studies come from a won deal through content_case_study_draft, and consent is not routed around', () => {
  const skill = read(SKILL);
  const ref = read(RESEARCH_AND_PROOF);
  assert.match(skill, /`content_case_study_draft\(\{ deal_id \}\)`/, 'Play 5 no longer drafts case studies from a won deal');
  assert.match(skill, /409 `deal_not_won`/, 'the skill must name deal_not_won');
  assert.match(skill, /409 `no_consent`/, 'the skill must name no_consent');
  assert.match(skill, /collect consent, never route around it/, 'the skill must say consent is collected, not bypassed');
  assert.match(skill, /no case study drafted by hand\s+around a 409 `no_consent`/, 'the hard stops must close the by-hand case study');
  assert.match(
    ref,
    /^## Case studies from a won deal - `content_case_study_draft\(\{ deal_id, testimonial_id\?, grid_item_id\?, avatar_id\? \}\)`$/m,
    'research-and-proof.md lost the case study section',
  );
  assert.match(
    ref,
    /a won deal is one whose status the account marks `is_won` in its CRM\s+statuses, or the literal `won` \/ `closed_won`/,
    'the won rule must be the account CRM statuses, not a literal pair',
  );
  assert.doesNotMatch(ref, /status won or closed_won/, 'the pre-review wording of the won rule is back');
  assert.match(ref, /public with consent granted and not revoked/, 'the consent rule lost its definition');
  assert.match(ref, /Numbers never come from the model/, 'the case study section must say where the numbers come from');
  assert.match(ref, /240 s or\s+longer client timeout/, 'the case study section must set the client timeout');
  assert.match(ref, /a retry replays the first answer/, 'the case study section must say the call is idempotent');
});

test('distribution is planned on the row at brief time, owned email first, and the publish event repurposes', () => {
  const skill = read(SKILL);
  const ref = read(DISTRIBUTION_AND_SCORECARD);
  const play2 = skill.slice(skill.indexOf('6. **Persist the calendar:**'), skill.indexOf('**Stage-to-format defaults'));
  assert.match(play2, /`settings: \{ distribution_plan \}`/, 'Play 2 step 6 no longer writes the plan with the calendar row');
  assert.match(play2, /`email_digest` row first and `paid` winner-only/, 'Play 2 step 6 must say owned email first and paid winner-only');
  assert.match(play2, /a malformed plan reads as no plan/, 'Play 2 step 6 must say the plan fails closed');
  const brief = skill.slice(skill.indexOf('1. **Brief.**'), skill.indexOf('2. **Draft via the department.**'));
  assert.match(brief, /\*\*Distribution at brief time\.\*\*/, 'the brief lost its distribution item');

  const play4 = skill.slice(skill.indexOf('## Play 4'), skill.indexOf('## Play 5'));
  assert.match(play4, /1\. \*\*The plan on the row comes first\.\*\*/, 'Play 4 no longer starts from the plan on the row');
  assert.match(play4, /no distribution plan: the piece will get one\s+post and\s+stop/, 'Play 4 lost the no-plan warning');
  assert.match(play4, /it never blocks/, 'the no-plan warning must never block');
  assert.match(play4, /`content-published-repurpose`/, 'Play 4 no longer names the repurpose template');
  assert.match(play4, /`content-digest-weekly`/, 'Play 4 no longer names the digest template');
  assert.match(play4, /`workflow_create_from_template\(\{ slug, overrides, is_enabled: false \}\)`/, 'Play 4 must stage a template rather than let it go live on create');
  assert.match(play4, /`utm_medium=content&utm_content=<slug>`/, 'Play 4 must name the link shape that credits the piece');
  assert.match(play4, /`campaign:<id>`/, 'Play 4 must mark the digest campaign on the plan row');
  assert.match(skill, /distribution is planned at brief time as `settings\.distribution_plan`/, 'the benchmarks no longer name the plan key');
  assert.match(skill, /no distribution plan written with every row `skipped`/, 'the hard stops must close the all-skipped plan');

  for (const key of [
    '## The plan on the row - `settings.distribution_plan`',
    '`email_digest`, `social`, `community`, `partner`, `outreach`, `paid`',
    '`planned`, `drafted`, `scheduled`, `done`, `skipped`',
    'at most 12 rows',
    'it fails closed',
    '**Owned email first.**',
    'winner-only',
    'ONCE per native publish',
    'contentPublishedTrigger',
    '`PLATFORMS`, `RECIPIENT_EMAIL`, `PROJECT_ID`',
    '`AUDIENCE_ID`, `FROM_EMAIL`, `APPROVER_EMAIL`, `DIGEST_NAME`,\n  `TIMEZONE`',
    'utm_source=newsletter&utm_medium=content&utm_campaign=content-digest&utm_content=<slug>',
    'credits nothing',
    'never\ncompose `utm_content` from a page URL',
  ]) {
    assert.ok(ref.includes(key), `distribution-and-scorecard.md no longer says ${JSON.stringify(key)}`);
  }

  // The old link shape is gone from the content skill and from /hiveku:repurpose
  // (the social skill's own references are the social lane's).
  const repurpose = read(REPURPOSE);
  // The old shape may be named only to say it credits nothing.
  const oldShape = skill
    .split(/\n\s*\n/)
    .filter((paragraph) => /utm_medium=social/.test(paragraph))
    .filter((paragraph) => !/credits nothing/.test(paragraph));
  assert.deepEqual(oldShape, [], 'the content skill again teaches utm_medium=social as the link shape');
  assert.doesNotMatch(repurpose, /`utm_medium=social`, the value the analytics/, '/hiveku:repurpose again says the repurpose links carry utm_medium=social');
  assert.match(repurpose, /utm_source=<platform>&utm_medium=content&utm_campaign=<slug>&utm_content=<slug>/, '/hiveku:repurpose must name the link shape social_repurpose_source returns');

  const campaign = read(CAMPAIGN);
  assert.match(campaign, /`settings: \{ distribution_plan \}`/, '/hiveku:campaign no longer writes the plan with each asset');
  assert.match(campaign, /`content_research_topic\(\{ topic, keyword \}\)`/, '/hiveku:campaign no longer researches a topic before copy');
  assert.match(campaign, /`content_proof_pack\(\{ avatar_id, journey_stage \}\)`/, '/hiveku:campaign no longer reads the proof pack before a decision asset');
});

test('the scorecard counts leads per piece, content_analytics_get is no longer refused, and the next brief comes from leads', () => {
  const skill = read(SKILL);
  const ref = read(DISTRIBUTION_AND_SCORECARD);
  assert.doesNotMatch(skill, /Do\s+NOT use `content_analytics_get`/, 'the content skill again refuses content_analytics_get');
  assert.doesNotMatch(skill, /nothing writes its table/, 'the content skill again says nothing writes content_analytics');
  const play5 = skill.slice(skill.indexOf('## Play 5'), skill.indexOf('## Weekly cadence'));
  assert.match(
    play5,
    /2\. \*\*Per-piece leads, then traffic - the scorecard\.\*\* `content_analytics_get\(\{ content_id \}\)`/,
    'Play 5 step 2 no longer reads the scorecard',
  );
  assert.match(play5, /`leads` and `contacts`/, 'Play 5 step 2 must name leads and contacts');
  assert.match(play5, /`marketing_campaign_roi\(\{ asset_types: "content_item" \}\)`/, 'Play 5 step 2 must read revenue from the ROI report');
  assert.match(play5, /`last_stored: null` means the first run has not happened/, 'Play 5 step 2 must read last_stored');
  assert.match(play5, /`scorecard\.degraded\.clickhouse: true`/, 'Play 5 step 2 must read the scorecard degraded flag');
  assert.match(play5, /\*\*The next brief comes from leads per piece, not views\.\*\*/, 'Play 5 lost the leads-not-views rule');
  assert.match(skill, /the next briefs from the pieces that brought leads/, 'the monthly report no longer plans from leads');
  assert.match(skill, /early signal from `content_page_views_get` \(`leads` and `views`; check `degraded`\)/, 'the weekly cadence no longer reads leads');
  assert.match(skill, /leads, contacts and deals from the scorecard/, 'the monthly report no longer reports leads per piece');

  for (const key of [
    '## The scorecard - leads per piece',
    '`content_analytics_get({ content_id })`',
    'form_submits',
    'attributed_contacts',
    'lead_rate',
    '`last_stored`',
    'is not any more',
    '`content_page_views_get({ items: [{ projectId, path }] })`',
    'leads, leads30d, contacts',
    '`marketing_campaign_roi({ from?, to?, attribution?, confidence?, asset_types? })`',
    'mixed_currency',
    '**The rule: the next brief comes from leads per piece, not views.**',
  ]) {
    assert.ok(ref.includes(key), `distribution-and-scorecard.md no longer says ${JSON.stringify(key)}`);
  }
});

test('/hiveku:sme-interview turns a brief and a proof pack into questions, and a transcript or a call into stored sources', () => {
  const cmd = read(SME_INTERVIEW);
  assert.match(cmd, /^description: /m, 'sme-interview.md has no description');
  assert.match(cmd, /^argument-hint: /m, 'sme-interview.md has no argument hint');
  assert.match(cmd, /`content_proof_pack\(\{ avatar_id, journey_stage, keyword:/, 'the interview must read the proof pack');
  assert.match(cmd, /`settings\.research`/, 'the interview must read the research stamp');
  assert.match(cmd, /`talk_to_department\(\{ domain: "content", message \}\)`[\s\S]*8 to 12 questions/, 'the questions must come from the department, from the brief');
  assert.match(cmd, /`voice_call_get\(\{ id \}\)`/, 'the interview must accept a voice call id');
  assert.match(cmd, /`voice_call_transcript_get\(\{ id \}\)`/, 'the interview must read the transcript');
  assert.match(cmd, /verbatim and unredacted/, 'the interview must warn what the transcript contains');
  assert.match(cmd, /404 `no_transcript`/, 'the interview must say what a missing transcript answers');
  assert.match(cmd, /the `quote` verbatim/, 'the lines must be verbatim');
  assert.match(cmd, /the attribution as it will appear/, 'every line carries its attribution');
  assert.match(cmd, /off the record\s+is not extracted at all/, 'off-record lines are dropped');
  assert.match(cmd, /`content_get` first \(the settings PATCH merges top-level keys but\s+REPLACES `sources` whole\)/, 'the store step must read before writing the array');
  assert.match(cmd, /`content_update\(\{ content_id, settings: \{ sources \} \}\)`/, 'the store step must write through content_update');
  assert.match(cmd, /\[source: interview:<id>\]/, 'the citation the draft uses is gone');
  assert.match(cmd, /\*\*How the department uses them\.\*\*/, 'the command must say how the department uses the sources');
  assert.match(cmd, /`proof_per_section`/, 'the command must say a quoted section counts as proof');
  assert.ok((cmd.match(/\*\*STOP/g) ?? []).length >= 2, 'the interview needs a STOP before the questions go out and one before the lines are stored');

  const ref = read(RESEARCH_AND_PROOF);
  assert.match(ref, /^## Expert sources on the row - `settings\.sources\[\]` \(the `\/hiveku:sme-interview` contract\)$/m, 'research-and-proof.md lost the sources contract');
  assert.match(ref, /REPLACES `sources` whole/, 'the sources contract must say the array is replaced whole');
  assert.match(ref, /"id": "interview-1", "kind": "interview"/, 'the sources contract lost its shape');
  assert.match(read(SKILL), /`\/hiveku:sme-interview` stores the answers on the row as `settings\.sources\[\]`/, 'the skill no longer sends a gap to the interview');
  assert.match(read('README.md'), /`sme-interview` \(/, 'README.md does not list the sme-interview command');
});

test('the new content references and the interview command carry no exclamation marks and are named by the skill', () => {
  for (const rel of [RESEARCH_AND_PROOF, DISTRIBUTION_AND_SCORECARD, SME_INTERVIEW]) {
    const shouts = read(rel).split('\n').filter((line) => /!/.test(line) && !/exclamation/.test(line));
    assert.deepEqual(shouts, [], `${rel} carries an exclamation mark in shipped copy`);
  }
  const skill = read(SKILL);
  assert.match(skill, /`references\/research-and-proof\.md` - before the brief of any piece/, 'the reference list no longer names research-and-proof.md');
  assert.match(skill, /`references\/distribution-and-scorecard\.md` - before the brief/, 'the reference list no longer names distribution-and-scorecard.md');
});

// ── ELITE-A leftovers (2026-09-12): the social skill, orient and two commands catch up ──
//
// The channel round corrected commands/repurpose.md and the content skill and
// left the social skill teaching the old link shape (utm_medium=social, no
// utm_content - a link the scorecard credits to nothing), orient silent on the
// Content research knowledge base and its artifacts, and two commands still
// refusing content_analytics_get a day after its nightly writer shipped. The
// pins below walk skills/ and commands/, so a stale paragraph cannot come back
// under a new file name.

const SOCIAL_SKILL = 'skills/hiveku-social-agency/SKILL.md';
const SOCIAL_REPURPOSE = 'skills/hiveku-social-agency/references/repurpose.md';
const SOCIAL_RECIPES = 'skills/hiveku-social-agency/references/recipes.md';
const SOCIAL_HOOKS = 'skills/hiveku-social-agency/references/hooks-and-formats.md';
const ORIENT = 'skills/hiveku-orient/SKILL.md';
const POST_MORTEM = 'commands/post-mortem.md';
const REPURPOSE_LINK_SHAPE = 'utm_source=<platform>&utm_medium=content&utm_campaign=<slug>&utm_content=<slug>';
const ARTIFACT_TYPES = ['content_research', 'serp_brief', 'positioning', 'proof_pack', 'case_study', 'data_study'];

/** Every .md under a repo-relative directory, as sorted repo-relative POSIX paths. */
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

/** Blank-line separated paragraphs with the line each starts on, so an offender is named file:line. */
function paragraphsOf(text) {
  const out = [];
  let line = 1;
  for (const block of text.split(/\n[ \t]*\n/)) {
    out.push({ line, text: block });
    line += block.split('\n').length + 1;
  }
  return out;
}

test('no skill teaches utm_medium=social as a link shape: every mention sits beside the shape that credits the piece', () => {
  const offenders = [];
  let mentions = 0;
  for (const rel of markdownFiles('skills')) {
    for (const p of paragraphsOf(read(rel))) {
      if (!p.text.includes('utm_medium=social')) continue;
      mentions++;
      // The old shape may be named only to say what it does not do: beside the
      // shape social_repurpose_source returns, or as the note that it credits nothing.
      if (/utm_medium=content/.test(p.text) || /credits nothing/.test(p.text)) continue;
      offenders.push(`${rel}:${p.line}`);
    }
  }
  assert.ok(mentions >= 4, `only ${mentions} paragraph(s) under skills/ mention utm_medium=social - the walker is broken, not the prose`);
  assert.deepEqual(offenders, [], 'a skill paragraph teaches utm_medium=social without the shape that credits the piece');
  // Nothing under skills/ or commands/ composes the pre-2026-09-12 campaign value.
  const stale = [...markdownFiles('skills'), ...markdownFiles('commands')].filter((rel) => /utm_campaign=repurpose-/.test(read(rel)));
  assert.deepEqual(stale, [], 'utm_campaign=repurpose-<slug> is back; social_repurpose_source sends utm_campaign=<slug>');
});

test('the social skill teaches the repurpose links social_repurpose_source returns, and says utm_source labels the channel', (t) => {
  const skill = read(SOCIAL_SKILL);
  const play10 = skill.slice(skill.indexOf('**Play 10 - Repurpose'), skill.indexOf('**Play 11 - Creative handoff'));
  assert.ok(play10.length > 0, 'Play 10 is gone from the social skill');
  assert.ok(play10.includes(REPURPOSE_LINK_SHAPE), 'Play 10 must name the link shape social_repurpose_source returns');
  assert.match(play10, /every link one of the `utm_links` the source read returns, unchanged/, 'Play 10 must use the returned links unchanged');
  assert.match(play10, /`content_analytics_get` on the\s+shortlist \(`leads` outranks `views`\)/, 'Play 10 must rank the shortlist by leads');

  const ref = read(SOCIAL_REPURPOSE);
  assert.match(
    ref,
    /^3\. \*\*UTM: the `utm_links` the source read returns, unchanged -\n\s+`utm_source=<platform>&utm_medium=content&utm_campaign=<slug>&utm_content=<slug>`\.\*\*$/m,
    'repurpose.md section 3 no longer opens with the returned links',
  );
  assert.doesNotMatch(ref, /maps a medium of exactly `social`/, 'repurpose.md again says the classifier reads the medium');
  assert.match(ref, /comes from\s+`utm_source`, not the medium/, 'repurpose.md must say utm_source labels the channel');
  assert.match(ref, /never `utm_content`\s+from a page URL/, 'repurpose.md must forbid composing utm_content from a page URL');
  for (const key of ['a medium of `content`, `blog` or `organic`', '`slug-2` after a collision', 'a known label limit, not a UTM error']) {
    assert.ok(ref.includes(key), `repurpose.md no longer says ${JSON.stringify(key)}`);
  }

  const recipes = read(SOCIAL_RECIPES);
  assert.ok(recipes.includes(`Links: the production URL with ${REPURPOSE_LINK_SHAPE}`), 'the repurpose recipe no longer composes the link shape that credits the piece');
  assert.match(recipes, /not cms_entry_slug, which can be slug-2 after a collision/, 'the recipe must say which slug utm_content carries');

  const hooks = read(SOCIAL_HOOKS);
  assert.doesNotMatch(hooks, /Every link out of a social post carries `utm_medium=social`/, 'hooks-and-formats.md again teaches utm_medium=social for every link');
  assert.ok(hooks.includes(REPURPOSE_LINK_SHAPE), 'hooks-and-formats.md must name the shape that credits the piece');
  assert.match(hooks, /which is what the sources view labels the channel from/, 'hooks-and-formats.md must say utm_source labels the channel');

  // Source cross-check when the builder checkout is beside this repo: the
  // platform slugs the reference names are the ones the route emits, the
  // medium is content, and the classifier reads the known source before the
  // medium (which is why utm_source, not the medium, labels the channel).
  const builder = path.join(root, '..', 'hiveku_builder');
  const route = path.join(builder, 'src', 'app', 'api', 'olympus', 'social', 'repurpose', 'source', 'route.ts');
  const classifier = path.join(builder, 'src', 'lib', 'analytics', 'classify-source.ts');
  if (!fs.existsSync(route) || !fs.existsSync(classifier)) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  const routeSrc = fs.readFileSync(route, 'utf8');
  assert.match(routeSrc, /REPURPOSE_UTM_MEDIUM = 'content'/, 'the route no longer sends utm_medium=content - the social references must change');
  const platforms = routeSrc.match(/UTM_PLATFORMS = \[([^\]]+)\]/);
  assert.ok(platforms, 'the route no longer declares UTM_PLATFORMS');
  const slugs = [...platforms[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(slugs.length >= 5, 'UTM_PLATFORMS parsed to fewer than five slugs - the parser is broken, not the route');
  const listed = ref.slice(ref.indexOf('3. **UTM:'), ref.indexOf('4. **One link per post'));
  const unnamed = slugs.filter((slug) => !listed.includes(`\`${slug}\``));
  assert.deepEqual(unnamed, [], 'repurpose.md section 3 does not name every platform slug the route emits as utm_source');
  const classifierSrc = fs.readFileSync(classifier, 'utf8');
  const hint = classifierSrc.indexOf('else if (channelHint) channel = channelHint;');
  const medium = classifierSrc.indexOf("else if (med === 'social') channel = 'Organic Social';");
  assert.ok(hint > 0 && medium > hint, 'classify-source.ts no longer reads the known source before the medium - repurpose.md section 3 must change');
  for (const slug of ['linkedin', 'facebook', 'instagram', 'twitter', 'tiktok']) {
    assert.match(classifierSrc, new RegExp(`re: /[^\\n]*${slug}[^\\n]*channel: 'Organic Social'`), `classify-source.ts no longer labels ${slug} Organic Social`);
  }
  assert.match(classifierSrc, /google[^\n]*channel: 'Organic Search'/, 'classify-source.ts no longer routes a google source to Organic Search - the GBP note must change');
});

test('content_analytics_get is refused nowhere in skills/ or commands/ now that the nightly writer exists', () => {
  const refusal = /Never `content_analytics_get`|do NOT read `content_analytics_get`|Nothing in the product writes `content_analytics`|nothing in the product writes the table/;
  const offenders = [];
  for (const rel of [...markdownFiles('skills'), ...markdownFiles('commands')]) {
    for (const p of paragraphsOf(read(rel))) {
      if (!refusal.test(p.text)) continue;
      // The retired sentence may be quoted only as history.
      if (/is not any more|was true (before|until)/.test(p.text)) continue;
      offenders.push(`${rel}:${p.line}`);
    }
  }
  assert.deepEqual(offenders, [], 'a skill or command still refuses content_analytics_get');

  const ref = read(SOCIAL_REPURPOSE);
  assert.match(ref, /`content_analytics_get\(\{ content_id \}\)` is the per-piece scorecard/, 'the social repurpose reference no longer reads the scorecard');
  assert.match(ref, /`last_stored: null` means the\s+first nightly run has not happened/, 'the social repurpose reference must read last_stored');

  const postMortem = read(POST_MORTEM);
  assert.match(
    postMortem,
    /`content_analytics_get\(\{ content_id, window \}\)` \(`7d` \| `30d` \|\s+`90d` \| `all`\)/,
    '/hiveku:post-mortem must read the scorecard with its window',
  );
  for (const key of ['`last_stored: null`', '`degraded.clickhouse: true`', '`marketing_campaign_roi({ asset_types: "content_item" })`', 'neither is zero']) {
    assert.ok(postMortem.includes(key), `/hiveku:post-mortem no longer says ${JSON.stringify(key)}`);
  }
  const repurpose = read(REPURPOSE);
  assert.match(repurpose, /`content_analytics_get\(\{ content_id \}\)` on the shortlist is the per-piece scorecard/, '/hiveku:repurpose no longer reads the scorecard on the shortlist');
  assert.match(repurpose, /`last_stored: null` is "not yet computed", never zero/, '/hiveku:repurpose must read last_stored');
});

test('orient names the Content research knowledge base, the artifact types and the two artifact reads', (t) => {
  const orient = read(ORIENT);
  const start = orient.indexOf('## Knowledge bases vs memory');
  assert.ok(start > 0, 'orient lost its Knowledge bases vs memory section');
  const end = orient.indexOf('\n## ', start + 1);
  assert.ok(end > start, 'no section follows Knowledge bases vs memory');
  const section = orient.slice(start, end);
  assert.match(section, /`content_research_run\(\{ content_id \}\)`/, 'orient must name the run that creates the research KB');
  assert.match(
    section,
    /`kb_list\(\{ context_type:\s+"content_research" \}\)` finds it; never create a second one and never look it up by name/,
    'orient must say how the research KB is found and that it is one per account',
  );
  assert.match(section, /`kb_artifacts_list\(\{ artifact_type\?, kb_id\?, content_id\?,\s+is_verified\?, page\?, limit\? \}\)`/, 'orient must name kb_artifacts_list with its params');
  assert.match(section, /`kb_artifact_get\(\{ artifact_id \}\)`/, 'orient must name kb_artifact_get');
  for (const type of ARTIFACT_TYPES) {
    assert.ok(section.includes(`\`${type}\``), `orient no longer names the artifact type ${type}`);
  }
  // Round B (2026-09-12): the SERP brief, positioning and bottom-funnel plan
  // gained writers; orient names the four and their exact reads.
  assert.match(section, /Four types have\s+writers today: `content_research` \(the research run\), `serp_brief` \(`content_brief_build`/, 'orient must say which types have a writer today');
  assert.match(section, /`positioning` \(the owner-approved positioning `brand_positioning_set` mirrors/, 'orient must name the positioning writer');
  assert.match(section, /`bofu_plan` \(the bottom-funnel plan `content_bofu_plan` stores/, 'orient must name the bottom-funnel plan writer');
  assert.match(section, /hiveku-content-agency\/references\/structure-and-conversion\.md and\s+hiveku-content-agency\/references\/site-architecture-and-decay\.md/, 'orient must point at the two round-B references with the cross-skill path');
  assert.match(section, /research-and-proof\.md/, 'orient must point at the content reference for the contracts');
  // The names orient teaches are live or contracted, so a rename is one edit here.
  const index = toolIndex();
  for (const name of ['content_research_run', 'content_research_topic', 'kb_artifacts_list', 'kb_artifact_get', 'kb_list', 'kb_search', 'content_brief_build', 'brand_positioning_set', 'content_bofu_plan', 'content_bofu_plan_get']) {
    assert.ok(index.has(name) || PENDING_TOOLS.has(name), `${name} is neither in lib/tool-index.json nor test/pending-tools.mjs`);
  }
  // Source cross-check: the builder writes content_research today and the MCP
  // declaration enumerates the same six types.
  const research = path.join(root, '..', 'hiveku_builder', 'src', 'lib', 'marketing', 'content-research.ts');
  const tools = path.join(root, '..', 'hiveku-mcp-api-server', 'src', 'tools', 'olympus-tools.ts');
  if (!fs.existsSync(research) || !fs.existsSync(tools)) {
    t.diagnostic('source cross-check skipped: sibling checkouts not beside this repo');
    return;
  }
  assert.match(fs.readFileSync(research, 'utf8'), /RESEARCH_ARTIFACT_TYPE = 'content_research'/, 'the research run no longer writes content_research - orient must change');
  assert.ok(fs.readFileSync(tools, 'utf8').includes(ARTIFACT_TYPES.join(' | ')), 'kb_artifacts_list no longer enumerates the six artifact types in this order - orient must change');
});

test('the corrected paragraphs carry no exclamation marks', () => {
  for (const rel of [SOCIAL_SKILL, SOCIAL_REPURPOSE, SOCIAL_RECIPES, SOCIAL_HOOKS, ORIENT, POST_MORTEM, REPURPOSE]) {
    const shouts = paragraphsOf(read(rel))
      .filter((p) => /utm_medium=content|content_analytics_get|kb_artifacts_list/.test(p.text))
      .filter((p) => /!/.test(p.text) && !/exclamation/.test(p.text))
      .map((p) => `${rel}:${p.line}`);
    assert.deepEqual(shouts, [], 'a corrected paragraph carries an exclamation mark');
  }
});

// ── ELITE-B: round B of the elite content program (2026-09-12) ─────────────
//
// Seven builds' back-ends shipped in the builder (a named author and
// answer-engine markup on every post, the SERP brief before the draft,
// positioning and claim-shaped titles with a weekly test, page roles and
// clusters with the keyword map, bottom-funnel comparison pages, conversion
// inside the piece, the decision loop) plus eleven on-page rules in
// content_seo_check. The plugin teaches them through the content skill, two
// new references, /hiveku:seo-brief (now built on the row), /hiveku:bofu and
// /hiveku:refresh. Each pin below reads the exact sentence a session acts on,
// and cross-checks the builder's own constants when its checkout is beside
// this repo, so a renamed field or a moved level fails here before it ships
// as prose.

const STRUCTURE_AND_CONVERSION = 'skills/hiveku-content-agency/references/structure-and-conversion.md';
const SITE_ARCHITECTURE_AND_DECAY = 'skills/hiveku-content-agency/references/site-architecture-and-decay.md';
const BOFU = 'commands/bofu.md';
const REFRESH_COMMAND = 'commands/refresh.md';
const SEO_BRIEF = 'commands/seo-brief.md';
const BUILDER = path.join(root, '..', 'hiveku_builder');

const ELITE_B_NAMES = [
  'content_authors_list',
  'content_authors_create',
  'content_authors_get',
  'content_authors_update',
  'content_authors_delete',
  'content_brief_build',
  'content_brief_get',
  'content_brief_topic',
  'brand_positioning_get',
  'brand_positioning_set',
  'content_titles_generate',
  'content_titles_get',
  'content_titles_pick',
  'content_prune_candidates',
  'content_refresh_brief_get',
  'site_page_roles_get',
  'site_page_roles_set',
  'content_keyword_map',
  'content_bofu_plan',
  'content_bofu_plan_get',
  'brand_offers_get',
  'brand_offers_set',
  'content_conversion_plan',
  'content_conversion_plan_get',
];

/** The eleven elite rules with the level content-seo-check.ts assigns. */
const ELITE_RULES = [
  ['author_missing', 'error'],
  ['answer_block_missing', 'warn'],
  ['faq_schema_mismatch', 'warn'],
  ['title_generic', 'warn'],
  ['money_link_missing', 'error'],
  ['pillar_link_missing', 'error'],
  ['keyword_already_targeted', 'warn'],
  ['comparison_table_missing', 'error'],
  ['competitor_claim_unsourced', 'error'],
  ['cta_missing', 'warn'],
  ['cta_stage_mismatch', 'warn'],
];

const REVIEW_DISPOSITIONS = ['double_down', 'refresh', 'rewrite', 'consolidate', 'prune'];

/** The builder file, or null when the checkout is not beside this repo. */
function builderSource(rel) {
  const p = path.join(BUILDER, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/** The section of the content skill between two step or heading markers. */
function skillSlice(from, to) {
  const skill = read(SKILL);
  const start = skill.indexOf(from);
  assert.ok(start >= 0, `the content skill no longer contains ${JSON.stringify(from)}`);
  const end = skill.indexOf(to, start + from.length);
  assert.ok(end > start, `${JSON.stringify(to)} no longer follows ${JSON.stringify(from)} in the content skill`);
  return skill.slice(start, end);
}

test('the ELITE-B names are live or pending under ELITE-B, the two round-B Availability tables agree with the index, and the routes they name exist', (t) => {
  const index = toolIndex();
  for (const name of ELITE_B_NAMES) {
    const pending = PENDING_TOOLS.get(name);
    assert.ok(index.has(name) || pending, `${name} is neither in lib/tool-index.json nor test/pending-tools.mjs`);
    if (pending) {
      assert.equal(pending.batch, 'ELITE-B', `${name} is pending under the wrong batch`);
      assert.equal(pending.since, '2026-09-12', `${name} carries the wrong since date`);
    }
  }
  const rows = [...readAvailabilityRows(STRUCTURE_AND_CONVERSION), ...readAvailabilityRows(SITE_ARCHITECTURE_AND_DECAY)];
  assert.ok(rows.length >= 28, `only ${rows.length} Availability rows parsed across the two references - the parser is broken, not the tables`);
  const where = (r) => `${r.name} (${r.file}:${r.line})`;
  assert.deepEqual(
    rows.filter((r) => /INCOMING/.test(r.status) && index.has(r.name)).map(where),
    [],
    'an INCOMING row names a tool lib/tool-index.json already carries - flip its Status to LIVE',
  );
  assert.deepEqual(
    rows.filter((r) => /INCOMING/.test(r.status) && !PENDING_TOOLS.has(r.name)).map(where),
    [],
    'an INCOMING row names a tool test/pending-tools.mjs does not carry',
  );
  assert.deepEqual(
    rows.filter((r) => /LIVE/.test(r.status) && !index.has(r.name)).map(where),
    [],
    'a LIVE row names a tool lib/tool-index.json does not carry',
  );
  for (const name of ELITE_B_NAMES) {
    if (!PENDING_TOOLS.has(name)) continue;
    assert.equal(rows.filter((r) => r.name === name).length, 1, `${name} must appear in exactly one Availability row`);
  }
  // The read-only twin of the conversion plan is declared (MCP 01584b0, GET
  // .../conversion, readOnlyHint) and wrapped by the department, so the prose
  // teaches it beside the write and it rides the ELITE-B batch until the live
  // index carries it.
  assert.match(read(STRUCTURE_AND_CONVERSION), /`content_conversion_plan_get\(\{ content_id \}\)` reads the plan/, 'the conversion reference must teach the read-only twin beside the write');

  // Source cross-check: every Olympus route the two tables name has a route
  // file in the builder (path params become Next.js dynamic segments).
  if (!fs.existsSync(path.join(BUILDER, 'src', 'app', 'api', 'olympus'))) {
    t.diagnostic('route cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  const missing = [];
  for (const rel of [STRUCTURE_AND_CONVERSION, SITE_ARCHITECTURE_AND_DECAY]) {
    for (const line of read(rel).split('\n')) {
      const m = line.match(/^\|\s*`([a-z_]+)`\s*\|[^|]*\|\s*`(?:GET|POST|PUT|PATCH|DELETE)\s+(\/api\/olympus\/[^?`\s]+)/);
      if (!m) continue;
      const segments = m[2].split('/').filter(Boolean).map((s) => (s.startsWith(':') ? `[${s.slice(1)}]` : s));
      const file = path.join(BUILDER, 'src', 'app', ...segments, 'route.ts');
      if (!fs.existsSync(file)) missing.push(`${m[1]} -> ${m[2]}`);
    }
  }
  assert.deepEqual(missing, [], 'an Availability row names a route the builder does not have');
});

test('author first: every piece publishes under a named practitioner, and an account with no authors is a stop, not a byline', (t) => {
  const skill = read(SKILL);
  assert.match(skill, /7\. \*\*Who signs it:\*\* `content_authors_list`/, 'Play 1 lost the authors step');
  assert.match(skill, /never an invented byline and never the\s+brand name standing in for a person/, 'Play 1 must refuse an invented byline');
  const brief = skillSlice('1. **Brief.**', '2. **Draft via the department.**');
  assert.match(brief, /\*\*Author first\.\*\* The `By: <name>, <role>` line comes from the row's `author`/, 'the Play 3 brief lost the By: line');
  assert.match(brief, /no authors is a brief that stops here and\s+offers `content_authors_create`/, 'the Play 3 brief must stop on an account with no authors');
  const gate = skillSlice('5. **Quality gate', '6. **Persist:');
  assert.match(gate, /`author_missing`/, 'the gate does not name author_missing');
  assert.match(gate, /`By:` from the row's `author\.name`\s+\(else the account default\)/, 'the gate must read the byline back from the row');
  assert.match(skill, /no invented byline \(an account with no authors gets\s+`content_authors_create` for a real person/, 'the hard stops lost the byline closure');

  const ref = read(STRUCTURE_AND_CONVERSION);
  assert.match(ref, /^## Author first - `content_authors_list`, the byline every piece publishes under$/m, 'structure-and-conversion.md lost the authors section');
  for (const key of ['409 `duplicate_name`', '409 `default_required`', '409 `default_in_use`', '`items_unlinked`', 'never a brand name standing in for a person', '422 `author_entry_failed`', '`author { id, name, entry_slug, entry_created } | null`']) {
    assert.ok(ref.includes(key), `structure-and-conversion.md no longer says ${JSON.stringify(key)}`);
  }
  const authors = builderSource('src/lib/marketing/content-authors.ts');
  if (!authors) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  for (const code of ['duplicate_name', 'default_required', 'default_in_use']) {
    assert.ok(authors.includes(`code: '${code}'`), `content-authors.ts no longer answers ${code} - the authors section must change`);
  }
});

test('the SERP brief is built on the row before the draft, the stored brief is the specification, and /hiveku:seo-brief runs it', () => {
  const brief = skillSlice('1. **Brief.**', '2. **Draft via the department.**');
  assert.match(brief, /\*\*The SERP brief before the draft\.\*\* `content_brief_build\(\{ content_id \}\)` when the row\s+has no stored brief/, 'the Play 3 brief no longer builds the SERP brief');
  assert.match(brief, /a spent cap is a 402 with nothing written/, 'the brief must say what a spent cap answers');
  assert.match(brief, /`Intent:` and\s+`Type:` are header lines read back from the row's `search_intent` and `page_type`/, 'the Intent: and Type: header lines are gone');
  assert.match(brief, /`what_the_top_3_all_say\[\]` the\s+consensus the thesis argues against/, 'the brief must name the consensus line the thesis argues against');
  assert.match(brief, /No SERP brief, no draft\./, 'the brief lost the no-brief-no-draft rule');
  assert.match(read(SKILL), /3\. \*\*Optimize against the SERP reality:\*\* the stored brief is the specification -\s+`content_brief_get\(\{ content_id \}\)`/, 'Play 3 step 3 no longer reads the stored brief as the specification');
  assert.match(read(SKILL), /`search_intent` \/ `page_type` once the brief has been built \(Play 3 step 1 stamps them\s+otherwise\)/, 'Play 2 step 6 must say the brief stamps intent and type');

  const ref = read(STRUCTURE_AND_CONVERSION);
  assert.match(ref, /^## The brief before the draft - `content_brief_build\(\{ content_id, keyword\?, avatar_id\?, project_id\?, location_code\? \| location_name\?, parse_top\? \}\)`$/m, 'structure-and-conversion.md lost the brief section');
  for (const key of ['A spent cap is a 402 with NOTHING written', '502 `serp_read_failed`', '`content_brief_get({ content_id })`', '`content_brief_topic({ topic, keyword?, avatar_id?, project_id?, location_code? })`', '`word_count_band` is a BAND, never a target', 'intent_decided_by: rules | model | default', 'reuses `settings.serp_brief` for 30 days']) {
    assert.ok(ref.includes(key), `structure-and-conversion.md no longer says ${JSON.stringify(key)}`);
  }

  const cmd = read(SEO_BRIEF);
  assert.match(cmd, /^description: .*content_brief_build/m, 'seo-brief.md\'s description no longer names the build');
  assert.match(cmd, /`content_keyword_map\(\{ project_id \}\)`/, 'seo-brief.md must read the keyword map before a brief');
  assert.match(cmd, /`content_brief_build\(\{ content_id,\s+keyword: <target keyword>, project_id, location_code\? \}\)`/, 'seo-brief.md must build the brief on the row');
  assert.match(cmd, /`content_brief_get\(\{ content_id \}\)`/, 'seo-brief.md must read the stored brief back');
  assert.match(cmd, /`content_site_links\(\{ project_id, content_id \}\)` - money pages first/, 'seo-brief.md must take the money page and the pillar from site-links');
  assert.match(cmd, /`content_authors_list` for the byline/, 'seo-brief.md must name the author');
  assert.match(cmd, /`content_update\(\{ content_id, author_id, answer_block, faq \}\)`/, 'seo-brief.md must write the human half of the brief onto the row');
  assert.doesNotMatch(cmd, /`on_page_content_parsing\(\{ url \}\)` on the top 3 \[SPENDS/, 'seo-brief.md again parses the top three by hand instead of through the build');
});

test('thesis and hook: every draft argues a positioning sentence, titles are five candidates and one pick, and the test rides off-site', (t) => {
  const skill = read(SKILL);
  assert.match(skill, /8\. \*\*What we stand for:\*\* `brand_positioning_get`/, 'Play 1 lost the positioning step');
  assert.match(skill, /`brand_positioning_set` only on the owner's yes \(it\s+replaces the whole object\)/, 'Play 1 must gate the positioning write on the owner');
  const brief = skillSlice('1. **Brief.**', '2. **Draft via the department.**');
  assert.match(brief, /\*\*Thesis and hook\.\*\* `Thesis:` is a REQUIRED header line/, 'the Play 3 brief lost the Thesis: line');
  assert.match(brief, /`Hook:` names the opener's pattern, one of the sixteen slugs\s+hiveku-social-agency\/references\/hooks-and-formats\.md carries/, 'the Hook: line must point at the shared slug list');
  assert.match(brief, /a competitor would not publish this sentence/, 'the rubric axis is gone from the brief');
  const step3 = skillSlice('3. **Optimize against the SERP reality:**', '4. **Illustrate');
  assert.match(step3, /`content_titles_generate\(\{ content_id,\s+count: 5 \}\)`/, 'Play 3 no longer generates five titles');
  assert.match(step3, /`content_titles_pick\(\{ content_id, index \}\)` - `index` is 0-based/, 'Play 3 no longer picks by 0-based index');
  assert.match(step3, /Never write\s+`settings\.title_candidates` by hand/, 'Play 3 must forbid hand-written candidates');
  assert.match(step3, /A pick on a published piece reaches the live page on\s+the next `content_publish_to_site`/, 'Play 3 must say a pick needs a republish');
  assert.match(skill, /tagged `title:<n>` \(or\s+`utm_term=title-<n>` on the link; n is the 0-based index\)/, 'Play 4 lost the off-site title test convention');
  assert.match(skill, /`settings\.title_results\.winner` and `notes\[\]`/, 'Play 5 no longer reads the title results');
  assert.match(skill, /record `Winning titles:\s+<pattern> x<n>` in the content memory/, 'Play 5 no longer records the winning titles');
  assert.match(skill, /no hand-written `settings\.title_candidates`/, 'the hard stops lost the candidates closure');

  const ref = read(STRUCTURE_AND_CONVERSION);
  assert.match(ref, /^## Thesis and hook - `brand_positioning_get\(\{ project_id\?, guide_id\? \}\)` \/ `brand_positioning_set\(\{ thesis, beliefs, we_are_against, category_name, proof_points, project_id\?, guide_id\? \}\)`$/m, 'structure-and-conversion.md lost the positioning section');
  assert.match(ref, /`brand_positioning_set` REPLACES the whole object -\s+send every key each time/, 'the positioning section must say the PUT replaces');
  assert.match(ref, /^## Five titles, one pick - `content_titles_generate\(\{ content_id, count\? \}\)`, `content_titles_get\(\{ content_id \}\)`, `content_titles_pick\(\{ content_id, index, apply_to\?, change_summary\? \}\)`$/m, 'structure-and-conversion.md lost the titles section');
  for (const key of ['`index` is the 0-BASED position', 'meta title changed; republish to apply', '`winner.sources`', 'at least 500\n  impressions and 10 clicks by 20 percent relative and 0.5 points absolute', '"No Search Console archive for this account"']) {
    assert.ok(ref.includes(key), `structure-and-conversion.md no longer says ${JSON.stringify(key)}`);
  }
  // The sixteen slugs are one list in three places: the social reference (the
  // numbered definitions), the content reference (the Hook: line) and the
  // builder's HOOK_PATTERNS.
  const slugs = [...read(SOCIAL_HOOKS).matchAll(/^\d+\. `([a-z-]+)` - /gm)].map((m) => m[1]);
  assert.equal(slugs.length, 16, `hooks-and-formats.md defines ${slugs.length} hook patterns, not 16`);
  const unnamed = slugs.filter((slug) => !ref.includes(`\`${slug}\``));
  assert.deepEqual(unnamed, [], 'structure-and-conversion.md does not name every hook slug the social reference defines');
  const titles = builderSource('src/lib/marketing/content-titles.ts');
  if (!titles) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  const builderSlugs = [...titles.matchAll(/^\s+slug: '([a-z-]+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(builderSlugs.sort(), [...slugs].sort(), 'the builder\'s HOOK_PATTERNS and hooks-and-formats.md disagree - a rename must land in both');
  const grounding = builderSource('src/lib/marketing/content-grounding.ts');
  assert.match(grounding, /READ_ONLY_FIELD_CODE = 'read_only_field'/, 'the builder renamed read_only_field - the references must change');
});

test('the answer block and the FAQ live on the row, and the publish emits the markup and its new keys', () => {
  const brief = skillSlice('1. **Brief.**', '2. **Draft via the department.**');
  assert.match(brief, /\*\*The answer block and the FAQ\.\*\* 40-60 words directly under the H1/, 'the Play 3 brief lost the answer block');
  assert.match(brief, /the row's `answer_block` AND the lead paragraph, the same words/, 'the answer block must be written in both places');
  assert.match(brief, /into the row's `faq`\s+AND an FAQ section in the body, never padded/, 'the FAQ must be written in both places');
  const play4 = skillSlice('5. **On-site publishing (Hiveku-hosted sites).**', '6. **On-site publishing (Webflow-hosted sites).**');
  for (const key of ['`author { id, name, entry_slug, entry_created } | null`', '`author_entry_failed`', '`publish_warnings[]`', '`refreshed: true`', '`llms_txt_regenerated`', 'FAQPage when `faq` has\n   real pairs', 'names the money\n   page and the pillar the piece links']) {
    assert.ok(play4.includes(key), `Play 4 step 5 no longer says ${JSON.stringify(key)}`);
  }
  const step2 = skillSlice('2. **Draft via the department.**', '3. **Optimize against the SERP reality:**');
  assert.match(step2, /`author_id`, `answer_block`, `faq`, `topic_cluster_id`, `cluster_role`, `page_role`,\s+`lead_magnet`, `offer_id` and `settings: \{ hook_pattern \}`/, 'Play 3 step 2 no longer writes the round-B fields with the grounding');
  assert.match(step2, /a\s+changed value is 400 `read_only_field` \(an unchanged echo is ignored/, 'Play 3 step 2 must teach the read-only echo rule');

  const ref = read(STRUCTURE_AND_CONVERSION);
  assert.match(ref, /^## The answer block and the FAQ - `answer_block`, `faq\[\]`, and the markup a publish emits$/m, 'structure-and-conversion.md lost the answer block section');
  for (const key of ['FAQPage only when\n  `faq` holds at least one real pair', '`json_ld_target: "field"`', 'never for Webflow', '"Refreshed on the same URL"', '`publish_warnings[]` names']) {
    assert.ok(ref.includes(key), `structure-and-conversion.md no longer says ${JSON.stringify(key)}`);
  }
  // The field table carries every round-B column, and the six read-only ones.
  for (const field of ['author_id', 'faq', 'answer_block', 'search_intent', 'page_type', 'review_disposition', 'topic_cluster_id', 'cluster_role', 'page_role', 'lead_magnet', 'offer_id']) {
    assert.match(ref, new RegExp(`^\\| \`${field}\` \\| `, 'm'), `the field table lost ${field}`);
  }
  assert.match(ref, /\*\*Six columns are read-only here\*\* and answer 400 `read_only_field` naming their writer/, 'the read-only rule is gone');
  assert.match(ref, /\*\*The keyword collision warning never blocks\.\*\*/, 'the collision warning rule is gone');
});

test('site architecture: the keyword map is read before a keyword, roles are stored and seeded on a yes, and the money page and the pillar are linked first', (t) => {
  const skill = read(SKILL);
  assert.match(skill, /1\. \*\*The keyword map first, then topic sourcing\.\*\* `content_keyword_map\(\{ project_id \}\)`/, 'Play 2 no longer reads the keyword map first');
  assert.match(skill, /are REFUSED for a new piece unless\s+the owner says consolidate/, 'Play 2 must refuse a collision keyword');
  assert.match(skill, /9\. \*\*What we ask for, and where the site converts:\*\*[\s\S]*`site_page_roles_get\(\{ project_id \}\)`/, 'Play 1 lost the page roles step');
  assert.match(skill, /`site_page_roles_set\(\{ project_id, seed: true \}\)`[\s\S]*a role a person set is never overwritten/, 'Play 1 must seed roles on the yes and say the seed never overwrites');
  assert.match(skill, /`topic_cluster_id` \(a `seo_topic_clusters` id in the account\) and\s+`cluster_role` \(`pillar` \| `spoke`\) go on the calendar draft/, 'Play 2 step 4 no longer records the cluster on the row');
  assert.match(skill, /keyword_already_targeted: \.\.\./, 'Play 2 step 6 no longer relays the collision warning');
  const brief = skillSlice('1. **Brief.**', '2. **Draft via the department.**');
  assert.match(brief, /`content_site_links\(\{ project_id,\s+content_id \}\)` orders the targets money pages first, then the piece's own pillar/, 'the Play 3 brief no longer takes the money page and the pillar from site-links');
  const gate = skillSlice('5. **Quality gate', '6. **Persist:');
  assert.match(gate, /`money_link_missing`\), or a spoke that does not\s+link its pillar \(`pillar_link_missing`\), is an error/, 'the gate no longer errors on the missing money-page or pillar link');

  const ref = read(SITE_ARCHITECTURE_AND_DECAY);
  assert.match(ref, /^## Page roles - `site_page_roles_get\(\{ project_id \}\)` \/ `site_page_roles_set\(\{ pages \} \| \{ project_id, seed, apply\? \}\)`$/m, 'site-architecture-and-decay.md lost the page roles section');
  assert.match(ref, /Roles are STORED, never inferred at read time/, 'the page roles section must say roles are stored');
  assert.match(ref, /^## Link targets by role - `content_site_links\(\{ project_id, content_id\?, limit\? \}\)`$/m, 'site-architecture-and-decay.md lost the site-links section');
  assert.match(ref, /^## The keyword map - `content_keyword_map\(\{ project_id\? \}\)`$/m, 'site-architecture-and-decay.md lost the keyword map section');
  for (const key of ['`suggested_anchor`', '`is_pillar_for_item`', 'A pillar item gets `pillar: null`', '`duplicate_target`', '`without_keyword[]` is the list of pieces written for no query', '`coverage_score`', '`missing_subtopics[]`', '`internal_link_score`', 'is kept and named in the run\'s notes', 'a role a person set is never overwritten, by\n  the route, not by your care']) {
    assert.ok(ref.includes(key), `site-architecture-and-decay.md no longer says ${JSON.stringify(key)}`);
  }
  const roles = builderSource('src/lib/marketing/page-roles.ts');
  if (!roles) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  assert.match(roles, /PAGE_ROLES = \['money', 'pillar', 'support', 'utility'\]/, 'the builder\'s page roles changed - the references and the skill must change');
});

test('/hiveku:bofu plans bottom-funnel pages read-only, seeds on a yes, and sources and dates every rival claim', (t) => {
  const cmd = read(BOFU);
  assert.match(cmd, /^description: /m, 'bofu.md has no description');
  assert.match(cmd, /^argument-hint: /m, 'bofu.md has no argument hint');
  assert.match(cmd, /`content_bofu_plan\(\{ project_id, seed_drafts: false, rivals\? \}\)`/, 'the plan must run read-only first');
  assert.ok((cmd.match(/\*\*STOP/g) ?? []).length >= 2, 'bofu.md needs a STOP before the spend and one before the seed');
  assert.match(cmd, /Up to two DataForSEO research calls/, 'bofu.md must say what the plan spends');
  assert.match(cmd, /`content_bofu_plan\(\{ project_id, seed_drafts: true, max_candidates:\s+<the approved count>, rivals\? \}\)`/, 'the seed must carry the approved count');
  assert.match(cmd, /`content_bofu_plan_get\(\{ project_id \}\)`/, 'bofu.md must name the stored-plan read');
  assert.match(cmd, /`web_scrape` on each URL in `settings\.bofu\.sources`, the pricing page first/, 'rival facts must come from pages read this session');
  assert.match(cmd, /with that URL as `source`\s+and today as `checked_at`/, 'every rival cell must carry its source and date');
  assert.match(cmd, /`content_proof_pack\(\{ avatar_id, journey_stage: "Decision" \}\)`/, 'own proof must come from the proof pack');
  assert.match(cmd, /honest-concession section/, 'the concession section is gone');
  assert.match(cmd, /`brand_offers_get` for the offer/, 'the decision must point at a brand offer');
  assert.match(cmd, /"learn more" is not a decision/, 'bofu.md lost the decision rule');
  assert.match(cmd, /`comparison_table_missing`\s+and `competitor_claim_unsourced`[^.]*are errors/, 'the gate must name the two table rules as errors');
  assert.match(cmd, /`keyword_collision` names an item already on\s+the keyword - that one is a refresh \(`\/hiveku:refresh`\), never a twin/, 'a collision drop must route to a refresh');

  const ref = read(SITE_ARCHITECTURE_AND_DECAY);
  assert.match(ref, /^## Bottom-funnel pages - `content_bofu_plan\(\{ project_id, max_candidates\?, seed_drafts\?, min_volume\?, max_difficulty\?, rivals\?, include_ideas\? \}\)` \/ `content_bofu_plan_get\(\{ project_id \}\)`$/m, 'site-architecture-and-decay.md lost the bottom-funnel section');
  for (const key of ['**It spends up to two DataForSEO research calls**', '`brand-vs-rival`, `rival-alternatives`, `best-category-for-segment`', 'Never write a rival price or feature from memory', '`settings.comparison_table`', '`settings.decision_cta { decision, label,\nurl, offer_id }`', 'Idempotency-Key honoured, so a retried POST does not seed twice']) {
    assert.ok(ref.includes(key), `site-architecture-and-decay.md no longer says ${JSON.stringify(key)}`);
  }
  const skill = read(SKILL);
  assert.match(skill, /commercial -> a `comparison` or `alternatives` page whose\s+rival claims carry a source and a date - `\/hiveku:bofu`/, 'Play 2 no longer maps commercial intent to the sourced comparison page');
  assert.match(skill, /`comparison`, `alternatives` and `research` are content types\s+on every content route/, 'Play 2 step 5 no longer names the three types');
  assert.match(skill, /no rival price\s+or feature written from memory on a comparison page/, 'the hard stops lost the rival-claim closure');
  assert.match(read('README.md'), /`bofu` \(/, 'README.md does not list the bofu command');
  assert.match(read(SOCIAL_REPURPOSE), /the bottom-funnel types `comparison`,\s+`alternatives` and `research`/, 'the social repurpose reference does not list the three types');
  assert.match(read(SITE_PUBLISHING), /landing_page, comparison, alternatives, research, custom/, 'site-publishing.md\'s template enum does not carry the three types');

  const configs = builderSource('src/lib/content-type-configs.ts');
  const templates = builderSource('src/lib/marketing/content-templates-bofu.ts');
  if (!configs || !templates) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  assert.match(configs, /BOTTOM_FUNNEL_CONTENT_TYPES = \['comparison', 'alternatives'\]/, 'the builder\'s bottom-funnel types changed');
  assert.match(templates, /BOFU_TEMPLATE_SLUGS = \['brand-vs-rival', 'rival-alternatives', 'best-category-for-segment'\]/, 'the builder\'s template slugs changed - the reference must change');
});

test('conversion inside the piece: offers on the guide, the five-stage table, the shortcodes the site renders, and the three buckets are retired', (t) => {
  const brief = skillSlice('1. **Brief.**', '2. **Draft via the department.**');
  assert.match(brief, /\*\*Conversion, from the plan\.\*\* `content_conversion_plan\(\{ content_id \}\)`/, 'the Play 3 brief no longer reads the conversion plan');
  assert.match(brief, /The three buckets \(awareness subscribes,\s+consideration downloads, decision buys\) are retired/, 'the three-bucket rule is back');
  assert.match(brief, /`lead_magnet_missing` on a long-form piece means proposing one/, 'a missing lead magnet must become a brief item');
  assert.match(brief, /`offer_missing` on a decision piece means an offer from the owner through\s+`brand_offers_set`/, 'a missing offer must go to the owner');
  const step2 = skillSlice('2. **Draft via the department.**', '3. **Optimize against the SERP reality:**');
  assert.match(step2, /one `::cta\{variant=inline\}` after the second section, one `::cta\{variant=end\}`\s+after the last, then `::upgrade` when the piece has a lead magnet - two colons, each on a\s+line of its own/, 'Play 3 step 2 no longer teaches the renderer\'s grammar');
  assert.match(step2, /carries the placements, never\s+the CTA copy/, 'the department must write placements, not copy');
  assert.match(read(SKILL), /9\. \*\*What we ask for, and where the site converts:\*\* `brand_offers_get`/, 'Play 1 lost the offers step');
  assert.match(read(SKILL), /no "learn more" as the decision a comparison page ends\s+on/, 'the hard stops lost the decision closure');

  const ref = read(STRUCTURE_AND_CONVERSION);
  assert.match(ref, /^## Conversion inside the piece - `brand_offers_get\(\{ project_id\? \}\)`, `brand_offers_set\(\{ offers, project_id\?, expected_lock_version\? \}\)`, `content_conversion_plan\(\{ content_id, ensure_checkpoint\? \}\)`$/m, 'structure-and-conversion.md lost the conversion section');
  for (const key of ['`brand_offers_set` is a\nFULL REPLACEMENT', '`expected_lock_version`', '409\n`offers_conflict`', '`settings.cta_stage_table`', 'two colons, on a line of its own', '<!-- hiveku:cta variant=end -->', '`lead_magnet { kind, title, asset_id?, content_item_id?,\nform_id?, delivery_sequence_id? }`', '"Learn\nmore" is not a decision']) {
    assert.ok(ref.includes(key), `structure-and-conversion.md no longer says ${JSON.stringify(key)}`);
  }
  const shortcodes = builderSource('src/lib/marketing/content-shortcodes.ts');
  const conversion = builderSource('src/lib/marketing/content-conversion.ts');
  if (!shortcodes || !conversion) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  assert.match(shortcodes, /MARKDOWN_SHORTCODE_RE = \/\^\[ \\t\]\*::\(cta\|upgrade\)/, 'the renderer\'s grammar changed (no longer two colons on a line of its own) - the skill and the reference must change');
  assert.ok(shortcodes.includes('<!-- hiveku:upgrade -->'), 'the html twin of the upgrade shortcode changed');
  assert.match(conversion, /SCHWARTZ_STAGES = \['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'\]/, 'the builder\'s five rungs changed - the reference must change');
});

test('/hiveku:refresh runs the decision loop: the queue, the brief, one disposition per piece on the row, a refresh that keeps the URL, a take-down that keeps its redirect', (t) => {
  const cmd = read(REFRESH_COMMAND);
  assert.match(cmd, /^description: /m, 'refresh.md has no description');
  assert.match(cmd, /^argument-hint: /m, 'refresh.md has no argument hint');
  assert.match(cmd, /report "not yet analysed", never "no decay"/, 'the queue must not call an unanalysed library healthy');
  assert.match(cmd, /`content_prune_candidates\(\{ project_id\?, min_age_days: 365 \}\)`/, 'refresh.md must read the prune list');
  assert.match(cmd, /`unmeasured\[\]` on its own line\s+with the reason/, 'the unmeasured pieces are never candidates');
  assert.match(cmd, /`content_refresh_brief_get\(\{\s+content_id \}\)` - spends nothing/, 'refresh.md must read the refresh brief');
  assert.match(cmd, /\*\*STOP: one disposition per piece\.\*\* `double_down`[\s\S]*`refresh`[\s\S]*`rewrite`[\s\S]*`consolidate`[\s\S]*`prune`/, 'the five dispositions are gone from the STOP');
  assert.match(cmd, /`content_update\(\{\s+content_id, review_disposition \}\)` - the one decay-side column a session writes/, 'the decision must be recorded on the row');
  assert.match(cmd, /are read-only \(400\s+`read_only_field`\) and never worked around/, 'refresh.md must refuse to work around the read-only columns');
  assert.match(cmd, /`content_version_create\(\{ content_id \}\)`\s+FIRST - the only undo/, 'the snapshot must come first');
  assert.match(cmd, /on the SAME slug \(never a new URL\)/, 'a refresh must keep the URL');
  assert.match(cmd, /`refreshed: true` and the row's `refreshed_at` are the proof/, 'refresh.md must cite the refresh proof');
  const consolidate = cmd.slice(cmd.indexOf('6. **Consolidate.**'), cmd.indexOf('7. **Prune.**'));
  assert.ok(consolidate.indexOf('`project_redirect_create`') < consolidate.indexOf('`content_unpublish_from_site`'), 'the redirect must come before the take-down');
  assert.match(consolidate, /Never a take-down without its redirect/, 'the consolidate step lost its rule');
  assert.match(cmd, /NOTHING leaves the internet until the project\s+deploys/, 'the prune step must say the unpublish is live until the deploy');
  assert.match(cmd, /`content_delete` is not this step/, 'the prune step must refuse content_delete');

  const skill = read(SKILL);
  assert.match(skill, /6\. \*\*The decision loop - refresh, on the same URL\.\*\* `\/hiveku:refresh` is the play/, 'Play 5 step 6 is no longer the decision loop');
  assert.match(skill, /`content_list` and keep the rows whose `decay_status` is set and not `recovered`, ordered by\s+`refresh_priority` descending/, 'Play 5 must build the queue from the decay columns');
  assert.match(skill, /`content_update\(\{ content_id,\s+review_disposition: "refresh" \}\)`/, 'Play 5 must record the refresh disposition');
  assert.match(skill, /7\. \*\*Kill or consolidate underperformers - five dispositions, recorded\.\*\*/, 'Play 5 step 7 no longer records the dispositions');
  assert.match(skill, /`content_prune_candidates\(\{ min_age_days: 365 \}\)`/, 'Play 5 no longer reads the prune list');
  assert.match(skill, /never a\s+take-down without its redirect/, 'Play 5 lost the redirect rule');
  assert.match(skill, /\*\*Refresh vs new decision matrix \(the five dispositions, recorded as `review_disposition`\):\*\*/, 'the decision matrix no longer names the dispositions');
  assert.match(skill, /Before any net-new topic the decision loop reads first/, 'Play 2 no longer reads the queue before net-new topics');
  assert.match(read('README.md'), /`refresh` \(/, 'README.md does not list the refresh command');

  const ref = read(SITE_ARCHITECTURE_AND_DECAY);
  assert.match(ref, /^## The decision loop - `content_prune_candidates\(\{ min_age_days\?, limit\?, project_id\? \}\)`, `content_refresh_brief_get\(\{ content_id \}\)`, and `review_disposition`$/m, 'site-architecture-and-decay.md lost the decision loop section');
  for (const key of ['a zero the collector could not produce is\nnot a zero', '`suggested_disposition` follows the rule every channel\nshares', '`settings.decay_episode` is that claim -\nnever clear it', '**The refresh play - the URL stays.**', 'is not re-notified', 'only when they cover\nthe window', 'Money pages are\nexcluded and counted']) {
    assert.ok(ref.includes(key), `site-architecture-and-decay.md no longer says ${JSON.stringify(key)}`);
  }
  for (const disposition of REVIEW_DISPOSITIONS) {
    assert.ok(ref.includes(`\`${disposition}\``), `site-architecture-and-decay.md no longer names ${disposition}`);
  }
  const decay = builderSource('src/lib/marketing/content-decay.ts');
  if (!decay) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  assert.match(decay, /REVIEW_DISPOSITIONS = \['double_down', 'refresh', 'rewrite', 'consolidate', 'prune'\]/, 'the builder\'s dispositions changed - the prose must change');
  assert.match(decay, /DECAY_RECOVERED_STATUS = 'recovered'/, 'the builder\'s recovered status changed');
  assert.match(decay, /CONTENT_UNPUBLISH_TOOL = 'content_unpublish_from_site'/, 'the prune default action names a different tool now');
});

test('the eleven elite rules are taught with the level the check assigns, and the two hand-fixed ones are named', (t) => {
  const gate = skillSlice('5. **Quality gate', '6. **Persist:');
  for (const [id] of ELITE_RULES) {
    assert.ok(gate.includes(`\`${id}\``), `the quality gate does not name ${id}`);
  }
  assert.match(gate, /`title_generic` and `cta_stage_mismatch` are the two a writer fixes\s+by hand/, 'the gate must name the two rules fixed by hand');
  const ref = read(STRUCTURE_AND_CONVERSION);
  assert.match(ref, /^## The eleven elite rules in `content_seo_check`$/m, 'structure-and-conversion.md lost the rules section');
  for (const [id, level] of ELITE_RULES) {
    assert.match(ref, new RegExp(`^\\| \`${id}\` \\| ${level} \\| `, 'm'), `the rules table does not list ${id} as ${level}`);
  }
  const publishing = read(SITE_PUBLISHING);
  for (const [id] of ELITE_RULES) {
    assert.ok(publishing.includes(`\`${id}\``), `site-publishing.md's check section does not name ${id}`);
  }
  const check = builderSource('src/lib/marketing/content-seo-check.ts');
  if (!check) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  // The rule header in content-seo-check.ts states each id with its level.
  for (const [id, level] of ELITE_RULES) {
    const m = check.match(new RegExp(`\\*\\s+${id} \\((error|warn)\\)`));
    assert.ok(m, `content-seo-check.ts no longer documents ${id} in its rule header`);
    assert.equal(m[1], level, `content-seo-check.ts assigns ${id} level ${m[1]}; the prose says ${level}`);
  }
});

test('the round-B prose carries no exclamation marks and is named by the skill', () => {
  // The html twins of the shortcodes (`<!-- hiveku:cta -->`) are grammar the
  // renderer reads, not copy; a line quoting one is not a shout.
  for (const rel of [STRUCTURE_AND_CONVERSION, SITE_ARCHITECTURE_AND_DECAY, BOFU, REFRESH_COMMAND, SEO_BRIEF]) {
    const shouts = read(rel).split('\n').filter((line) => /!/.test(line) && !/exclamation/.test(line) && !/<!--/.test(line));
    assert.deepEqual(shouts, [], `${rel} carries an exclamation mark in shipped copy`);
  }
  const skill = read(SKILL);
  assert.match(skill, /`references\/structure-and-conversion\.md` - before the brief of any piece/, 'the reference list no longer names structure-and-conversion.md');
  assert.match(skill, /`references\/site-architecture-and-decay\.md` - before placing a piece on the site/, 'the reference list no longer names site-architecture-and-decay.md');
  assert.match(skill, /`\/hiveku:bofu`/, 'the skill no longer sends bottom-funnel work to /hiveku:bofu');
  assert.match(skill, /`\/hiveku:refresh`/, 'the skill no longer sends the decision loop to /hiveku:refresh');
  const shouts = skill.split('\n').filter((line) => /!/.test(line) && !/exclamation/.test(line));
  assert.deepEqual(shouts, [], 'the content skill carries an exclamation mark in shipped copy');
});

// ── ELITE-C: the polish round (2026-09-12) - /hiveku:seo-decay on the round-B reads, and the extension vendoring the two plays ──

const SEO_DECAY = 'commands/seo-decay.md';
const VSCODE = path.join(root, '..', 'hiveku-vscode');
const MCP_SERVER = path.join(root, '..', 'hiveku-mcp-api-server');

/** A sibling checkout's file, or null when that checkout is not beside this repo. */
function siblingSource(checkout, rel) {
  const p = path.join(checkout, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

test('/hiveku:seo-decay runs the decision loop on the round-B reads: money pages from the stored roles, the prune lane, the refresh brief before a draft, the disposition on the row', (t) => {
  const cmd = read(SEO_DECAY);
  assert.match(cmd, /^description: /m, 'seo-decay.md has no description');
  assert.match(cmd, /^argument-hint: /m, 'seo-decay.md has no argument hint');
  // Money pages come from the stored roles, read before the rows; an account
  // with none marked is seeded on a yes, never guessed at from prose.
  const roles = cmd.indexOf('`site_page_roles_get({ project_id })`');
  assert.ok(roles >= 0, 'seo-decay.md must read the money pages from site_page_roles_get');
  assert.ok(roles < cmd.indexOf('`seo_content_decay({ project_id })`'), 'the page roles are read before the decay rows');
  assert.match(cmd, /`counts\.money` of 0 means nothing is marked yet,\s+not that there are none: `site_page_roles_set\(\{ project_id, seed: true \}\)`/, 'an account with no money page marked is seeded on a yes, never guessed');
  assert.match(cmd, /Keep writing the `Money pages: \/a, \/b` line to the SEO memory as well - the seed reads it/, 'the memory line the seed reads must still be written');
  // The item side of the findings and the prune lane.
  assert.match(cmd, /`content_list\(\{ status: "published",\s+limit: 200 \}\)` and keep the rows whose `decay_status` is set and not `recovered`/, 'the item-side queue must come from the decay columns');
  assert.match(cmd, /`content_prune_candidates\(\{ project_id\?, min_age_days: 365 \}\)`/, 'seo-decay.md must read the prune list');
  assert.match(cmd, /`unmeasured\[\]` on its own line\s+with the reason \(`no_page`, `clickhouse_unavailable`\) and never as a candidate/, 'the unmeasured pieces are never candidates');
  assert.match(cmd, /A money page, a protected page and a page the owner named are never on the prune list you present/, 'the prune list must exclude money and protected pages');
  // The refresh brief is read before any department draft.
  const brief = cmd.indexOf('`content_refresh_brief_get({ content_id })` - spends nothing');
  assert.ok(brief >= 0, 'seo-decay.md must read the refresh brief');
  assert.ok(brief < cmd.indexOf('`talk_to_department({ domain: "seo",'), 'the refresh brief is read before the department draft');
  // The decision lands on the row in the closed vocabulary, mapped from the
  // SEO skill's five-way table; the read-only columns are never worked around.
  assert.match(cmd, /`content_update\(\{ content_id, review_disposition \}\)` - the\s+one decay-side column a session writes/, 'the decision must be recorded on the row');
  for (const disposition of REVIEW_DISPOSITIONS) {
    assert.ok(cmd.includes(`\`${disposition}\``), `seo-decay.md does not map the five-way table onto ${disposition}`);
  }
  assert.match(cmd, /new is a brief on a new row, never a disposition on the old one/, 'a "new" verdict must not be written to the old row');
  assert.match(cmd, /are read-only \(400\s+`read_only_field`\) and never worked around/, 'seo-decay.md must refuse to work around the read-only columns');
  // A refresh keeps the URL, a take-down keeps its redirect, a prune deletes nothing.
  assert.match(cmd, /`content_version_create\(\{\s+content_id \}\)` FIRST - the only undo/, 'the snapshot must come first');
  assert.match(cmd, /never a new slug/, 'a refresh must keep the URL');
  assert.match(cmd, /`refreshed: true` and the row's `refreshed_at` are the proof/, 'seo-decay.md must cite the refresh proof');
  const consolidation = cmd.slice(cmd.indexOf('9. Consolidation:'), cmd.indexOf('10. Prune:'));
  assert.ok(consolidation.length > 0, 'seo-decay.md lost its consolidation step');
  assert.ok(consolidation.indexOf('`project_redirect_create(') < consolidation.indexOf('`content_unpublish_from_site({ content_id })`'), 'the redirect must come before the take-down');
  assert.match(consolidation, /never a take-down without its redirect/, 'the consolidation step lost its rule');
  assert.match(cmd, /NOTHING leaves the internet until the project deploys/, 'the prune step must say the unpublish is live until the deploy');
  assert.match(cmd, /`content_delete` is not this step/, 'the prune step must refuse content_delete');
  const shouts = cmd.split('\n').filter((line) => /!/.test(line) && !/exclamation/.test(line));
  assert.deepEqual(shouts, [], 'seo-decay.md carries an exclamation mark in shipped copy');
  // The server sends its readers here and owns the vocabulary the mapping uses.
  const tools = siblingSource(MCP_SERVER, 'src/tools/olympus-tools.ts');
  if (!tools) {
    t.diagnostic('server cross-check skipped: hiveku-mcp-api-server checkout not beside this repo');
    return;
  }
  assert.match(tools, /Read it before the internal-linking step of any draft and at the start of \/hiveku:seo-decay/, 'site_page_roles_get no longer names this command as its first reader');
  assert.match(tools, /enum: \['double_down', 'refresh', 'rewrite', 'consolidate', 'prune', null\]/, "content_update's review_disposition vocabulary changed - the mapping in seo-decay.md must change with it");
});

test('the extension vendors research.md and seo-decay.md through its generator instead of carrying inline literals', (t) => {
  const set = siblingSource(VSCODE, 'scripts/agency-skills-set.mjs');
  const role = siblingSource(VSCODE, 'src/roleCommands.ts');
  if (!set || !role) {
    t.diagnostic('extension cross-check skipped: hiveku-vscode checkout not beside this repo');
    return;
  }
  const start = set.indexOf('export const VENDORED_COMMANDS = [');
  assert.ok(start >= 0, 'agency-skills-set.mjs no longer exports VENDORED_COMMANDS');
  const vendored = set.slice(start, set.indexOf('];', start));
  for (const name of ['seo-decay', 'research']) {
    assert.ok(vendored.includes(`'${name}',`), `agency-skills-set.mjs does not vendor ${name}.md`);
    assert.ok(fs.existsSync(path.join(VSCODE, 'assets', 'commands', `${name}.md`)), `hiveku-vscode/assets/commands/${name}.md is missing - run npm run gen:skills there`);
  }
  assert.match(role, /const SEO_COMMANDS = \['seo-decay'\] as const;/, 'roleCommands.ts no longer vendors the SEO decay sweep');
  assert.match(role, /const UNIVERSAL_COMMANDS = \['research'\] as const;/, 'roleCommands.ts no longer vendors /hiveku-research');
  assert.doesNotMatch(role, /const RESEARCH_COMMAND = `/, 'the inline RESEARCH_COMMAND literal is back in roleCommands.ts');
  assert.doesNotMatch(role, /'hiveku-seo-decay': `---/, 'the inline hiveku-seo-decay literal is back in roleCommands.ts');
  assert.match(role, /for \(const name of SEO_COMMANDS\) \{\s+const body = vendoredCommand\(name\);/, 'the SEO role does not read its vendored command');
  assert.match(role, /for \(const name of UNIVERSAL_COMMANDS\) \{\s+const body = vendoredCommand\(name\);/, 'the universal commands are not read from the assets');
});
