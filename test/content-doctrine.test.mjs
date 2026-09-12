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
