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
