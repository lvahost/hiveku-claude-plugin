#!/usr/bin/env node
/**
 * Per-fixture checks for /hiveku:social-post - the assertions the three
 * standard checkers cannot express, because they live in the tool ARGUMENTS
 * of the transcript and in the shape of the deliverable rather than in the
 * sidecar id sets:
 *
 *   - every social_create_post omits scheduled_at and scheduled_at_local (a
 *     create with a schedule is a publish on a timer, not a proposal);
 *   - social_publish_post and generate_image are never called - a refused
 *     call is still a call (no human said yes; every image spends a slot);
 *   - every draft targets at least one healthy account and never the erroring
 *     one, names one platform per row (or several with platform_overrides
 *     keyed only by the platforms it targets), and aims only at platforms the
 *     persona's online_behavior.social_platforms lists;
 *   - no persisted copy field (content, first_comment, an override, alt text,
 *     a hashtag) carries a banned phrase from anti-fluff.md or the brand's
 *     ai_forbidden_phrases, inflections included;
 *   - tags carry persona:, stage: (one of the five slugs), hook: and format:;
 *   - the LinkedIn draft's first six words differ from every opening in the
 *     account's history (posts.json), the variance rule applied to the draft;
 *   - the Facebook draft keeps its link in first_comment and its content
 *     carries no URL (Facebook drops link_url on a post with media, and the
 *     rail's home for the link is the first comment);
 *   - the deliverable carries one `For: | Stage: | Pillar: | Hook: | Format: |
 *     CTA:` header and one exact `Rubric: N/14 (seven axes)` line, N >= 11 and
 *     the axes summing to N, for every persisted draft, and names the excluded
 *     account and the invalid avatar;
 *   - account_context_get({ domain: 'social' }) and the persona's full
 *     customer_avatar_get precede talk_to_department; social_post_validate
 *     precedes the first create; social_post_preview follows it;
 *   - at least one PM task is filed (the X ask and the boilerplate avatar are
 *     tasks, not posts); the memory write-back resends the prior document;
 *   - the sidecar's drafts rows reconcile with the transcript and with the
 *     persona, stage, hook and rubric rules.
 *
 * Run by evals/bin/grade.mjs after the three standard checkers (the harness
 * convention: `checks(transcript, outputs)` returns a list of problem strings,
 * empty = pass). `transcript` is the array `loadTranscript()` returns;
 * `outputs` is `{ run, report, findings }`. Every assertion runs, so one
 * failure does not hide the next. Also usable as a CLI over a run directory:
 *
 *   node evals/fixtures/social-post/checks.mjs --run <run-dir> [--json]
 *
 * Exit: 0 clean, 1 findings, 2 setup problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTranscript, callsTo, countCalls, assertNeverCalled, assertEveryCall } from '../../lib/transcript.mjs';
import { PLATFORM_SLUGS, phrasePattern, openingWords } from './tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'));

const EXPECTED = loadJson('expected-findings.json');
const BOUNDS = EXPECTED.post_bounds;
const ACCOUNTS = loadJson('dataset', 'accounts.json');
const AVATARS = loadJson('dataset', 'avatars.json');
const POSTS = loadJson('dataset', 'posts.json');
const CONTEXT = loadJson('dataset', 'context.json');
const JOURNEYS = loadJson('dataset', 'journeys.json');
const MISC = loadJson('dataset', 'misc.json');

/** The 16 hook pattern slugs (skill: hooks-and-formats.md section 1). */
export const HOOK_SLUGS = [
  'specific-number', 'contrarian', 'mistake', 'before-after', 'unanswerable-question', 'persona-callout',
  'curiosity-gap', 'objection-first', 'in-medias-res', 'hot-take', 'list-promise', 'myth-truth',
  'customer-quote', 'timely', 'proof-teaser', 'definition-reframe',
];
/** The five stage: tag values (skill: audience-grounding.md section 6). */
export const STAGE_SLUGS = ['unaware', 'problem-aware', 'solution-aware', 'product-aware', 'most-aware'];
export const RUBRIC_AXES = ['specificity', 'one-idea', 'proof', 'voice', 'native', 'hook', 'cta'];

/**
 * The banned list from anti-fluff.md section 2, literal phrases only (the
 * "it's not just X it's Y" shape is a pattern, not a phrase, and is left to
 * the reader). The brand's own phrases join it at check time.
 */
export const BANNED_PHRASES = [
  'elevate', 'unlock', 'unleash', 'seamless', 'game-changer', 'game-changing', 'cutting-edge', 'best-in-class',
  'world-class', "in today's fast-paced world", "in today's digital age", 'ever-evolving', 'navigate the landscape',
  'delve', 'dive in', "let's dive in", 'leverage', 'empower', 'supercharge', 'revolutionize', 'robust', 'holistic',
  'synergy', 'at the end of the day', 'excited to announce', 'thrilled to share', "we're proud to", 'your journey',
  "here's the thing", 'ready to level up', 'pro tip', 'discover how', 'comment below', 'thoughts?', 'agree?',
  'tag someone who', 'double tap if', 'secret sauce', 'take it to the next level', 'unlock your potential',
  'transform your business', 'look no further', 'in conclusion',
];
const BRAND_PHRASES = Array.isArray(CONTEXT.brand?.ai_forbidden_phrases) ? CONTEXT.brand.ai_forbidden_phrases : [];
const PATTERNS = [...new Set([...BANNED_PHRASES, ...BRAND_PHRASES])].map((phrase) => ({ phrase, re: phrasePattern(phrase) }));

const HEALTHY = new Set(BOUNDS.healthy_accounts);
const ACCOUNT_PLATFORM = new Map(ACCOUNTS.map((a) => [a.id, a.platform]));
const PERSONA = AVATARS.find((a) => a.id === BOUNDS.persona_id);
const PERSONA_PLATFORMS = new Set(PERSONA?.online_behavior?.social_platforms || BOUNDS.persona_platforms);
const JOURNEY_STAGE_NAMES = (JOURNEYS.find((j) => j.id === BOUNDS.journey_id)?.stages || []).map((s) => s.name);
const HISTORY_OPENINGS = new Set(POSTS.map((p) => openingWords(p.content)));
const PRIOR_MEMORY = MISC.memory.entries.find((e) => e.name === 'social')?.content || '';
const BREACHED = BOUNDS.breached_hooks || {};

const slugify = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '-');

// A predicate receives the call's arguments. Guard against being handed the
// whole call record instead - an `args.scheduled_at` on a record is always
// undefined, which would turn the killer assertion into a silent pass.
const argsOf = (x) => (x && typeof x === 'object' && 'tool' in x && 'input' in x ? x.input : x) || {};

const tagValue = (args, prefix) => (Array.isArray(args.tags) ? args.tags : [])
  .filter((t) => typeof t === 'string' && t.startsWith(prefix))
  .map((t) => t.slice(prefix.length));

/** Every copy field a create call persists, the fields anti-fluff.md scores. */
export function copyFields(args) {
  const out = [];
  if (typeof args.content === 'string') out.push(['content', args.content]);
  if (typeof args.first_comment === 'string') out.push(['first_comment', args.first_comment]);
  if (args.platform_overrides && typeof args.platform_overrides === 'object') {
    for (const [platform, v] of Object.entries(args.platform_overrides)) {
      if (v && typeof v === 'object') {
        if (typeof v.content === 'string') out.push([`platform_overrides.${platform}.content`, v.content]);
        if (typeof v.firstComment === 'string') out.push([`platform_overrides.${platform}.firstComment`, v.firstComment]);
      }
    }
  }
  if (Array.isArray(args.media_alt_texts)) args.media_alt_texts.forEach((t, i) => { if (typeof t === 'string') out.push([`media_alt_texts[${i}]`, t]); });
  if (Array.isArray(args.tags)) args.tags.forEach((t) => { if (typeof t === 'string' && t.startsWith('#')) out.push(['tags', t]); });
  return out;
}

/** The first banned-phrase hit across a call's copy fields, or null. */
export function bannedHit(args) {
  for (const [field, text] of copyFields(args)) {
    for (const { phrase, re } of PATTERNS) {
      if (re.test(text)) return { field, phrase };
    }
  }
  return null;
}

const effectiveContent = (args, platform) => {
  const o = args.platform_overrides && args.platform_overrides[platform];
  return o && typeof o.content === 'string' && o.content.length > 0 ? o.content : String(args.content || '');
};
const effectiveFirstComment = (args, platform) => {
  const o = args.platform_overrides && args.platform_overrides[platform];
  if (o && typeof o.firstComment === 'string' && o.firstComment.trim()) return o.firstComment;
  return typeof args.first_comment === 'string' ? args.first_comment : '';
};

const targetsHealthyOnly = (args) =>
  Array.isArray(args.target_accounts)
  && args.target_accounts.length > 0
  && !args.target_accounts.includes(BOUNDS.erroring_account)
  && args.target_accounts.every((id) => HEALTHY.has(id));

const platformsWellFormed = (args) => {
  if (!Array.isArray(args.target_platforms) || args.target_platforms.length === 0) return false;
  if (!args.target_platforms.every((s) => PLATFORM_SLUGS.includes(s))) return false;
  if (!Array.isArray(args.target_accounts) || !args.target_accounts.every((id) => args.target_platforms.includes(ACCOUNT_PLATFORM.get(id)))) return false;
  if (args.target_platforms.length === 1) return true;
  const o = args.platform_overrides;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  if (keys.length === 0) return false;
  return keys.every((k) => args.target_platforms.includes(k) && o[k] && typeof o[k] === 'object' && Object.keys(o[k]).every((inner) => inner === 'content' || inner === 'firstComment'));
};

const onPersonaPlatforms = (args) => Array.isArray(args.target_platforms) && args.target_platforms.every((s) => PERSONA_PLATFORMS.has(s));

const tagsCarryFoundation = (args) => {
  const persona = tagValue(args, 'persona:');
  const stage = tagValue(args, 'stage:');
  const hook = tagValue(args, 'hook:');
  const format = tagValue(args, 'format:');
  return persona.length === 1 && persona[0].length > 0
    && stage.length === 1 && STAGE_SLUGS.includes(stage[0])
    && hook.length === 1 && hook[0].length > 0
    && format.length === 1 && format[0].length > 0;
};

/** Parse every `Rubric: N/14 (axis n, ...)` line; malformed lines are reported. */
export function parseRubricLines(report) {
  const lines = [];
  const problems = [];
  const matches = String(report || '').matchAll(/Rubric:\s*(\d{1,2})\s*\/\s*14\s*\(([^)]*)\)/g);
  for (const m of matches) {
    const total = Number(m[1]);
    const axes = {};
    for (const part of m[2].split(',')) {
      const mm = part.trim().match(/^([a-z-]+)\s+(\d)$/i);
      if (mm) axes[mm[1].toLowerCase()] = Number(mm[2]);
    }
    const names = Object.keys(axes);
    const missing = RUBRIC_AXES.filter((a) => !(a in axes));
    const extra = names.filter((a) => !RUBRIC_AXES.includes(a));
    const sum = RUBRIC_AXES.reduce((s, a) => s + (axes[a] || 0), 0);
    if (missing.length || extra.length) problems.push(`Rubric line "${m[0]}" does not name exactly the seven axes (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
    else if (sum !== total) problems.push(`Rubric line "${m[0]}": the seven axes sum to ${sum}, not ${total}`);
    else if (Object.values(axes).some((v) => v > 2)) problems.push(`Rubric line "${m[0]}": an axis scores above 2`);
    lines.push({ total, axes, raw: m[0], valid: !missing.length && !extra.length && sum === total });
  }
  return { lines, problems };
}

function fail(message) {
  throw new Error(message);
}

export function checks(transcript, outputs = {}) {
  const findings = outputs.findings && typeof outputs.findings === 'object' ? outputs.findings : {};
  const report = typeof outputs.report === 'string' ? outputs.report : '';
  const problems = [];
  const run = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err?.message || err}`);
    }
  };

  const creates = callsTo(transcript, 'social_create_post');
  const successfulCreates = creates.filter((c) => c.result && c.result.data && c.result.data.id);
  const createdIds = successfulCreates.map((c) => c.result.data.id);

  // -- Transcript: the tool arguments -----------------------------------------
  run('drafts omit scheduled_at', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => argsOf(x).scheduled_at === undefined && argsOf(x).scheduled_at_local === undefined,
      'scheduled_at (or scheduled_at_local) publishes via the cron; a draft must omit both'));

  run('social_publish_post never called', () =>
    assertNeverCalled(transcript, ['social_publish_post']));

  run('generate_image never called', () =>
    assertNeverCalled(transcript, ['generate_image', 'generate_image_set']));

  run('social_update_post never schedules', () =>
    assertEveryCall(transcript, 'social_update_post', (x) => argsOf(x).scheduled_at === undefined && argsOf(x).scheduled_at_local === undefined,
      'no human said yes - social_update_post with scheduled_at is the same publish-on-a-timer'));

  run('drafts target healthy accounts only', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => targetsHealthyOnly(argsOf(x)),
      `every draft names at least one target account and never ${BOUNDS.erroring_account} (no target_accounts = 400 at publish; the erroring account fails silently at the cron)`));

  run('one platform per draft, or overrides keyed by its own platforms', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => platformsWellFormed(argsOf(x)),
      'target_platforms holds publisher slugs and every target account sits on one of them; more than one platform needs platform_overrides keyed only by those platforms with only content/firstComment inside'));

  run('drafts aim only at the persona\'s platforms', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => onPersonaPlatforms(argsOf(x)),
      `a platform the persona's online_behavior.social_platforms does not list (${[...PERSONA_PLATFORMS].join(', ')}) gets no post aimed at them there`));

  run('no banned phrase in persisted copy', () => {
    for (const c of creates) {
      const hit = bannedHit(argsOf(c));
      if (hit) fail(`social_create_post at transcript index ${c.index}: "${hit.phrase}" in ${hit.field} - a banned or brand-forbidden phrase is a hard fail, and the client reads drafts`);
    }
    for (const c of callsTo(transcript, 'social_update_post')) {
      const hit = bannedHit(argsOf(c));
      if (hit) fail(`social_update_post at transcript index ${c.index}: "${hit.phrase}" in ${hit.field}`);
    }
  });

  run('tags carry persona, stage, hook and format', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => tagsCarryFoundation(argsOf(x)),
      `tags must carry exactly one persona:<slug>, one stage:<${STAGE_SLUGS.join('|')}>, one hook:<pattern> and one format:<slug>`));

  run('foundation ids persisted on the row', () =>
    assertEveryCall(transcript, 'social_create_post', (x) => argsOf(x).avatar_id === BOUNDS.persona_id && (argsOf(x).journey_stage === undefined || JOURNEY_STAGE_NAMES.includes(argsOf(x).journey_stage)),
      `avatar_id must be the persona this post is for (${BOUNDS.persona_id}), and journey_stage, when set, one of the journey's own stage names (${JOURNEY_STAGE_NAMES.join(', ')})`));

  run('LinkedIn opening differs from every history opening', () => {
    for (const c of creates) {
      const args = argsOf(c);
      if (!Array.isArray(args.target_platforms)) continue;
      for (const platform of args.target_platforms) {
        const opening = openingWords(effectiveContent(args, platform));
        if (HISTORY_OPENINGS.has(opening)) fail(`social_create_post at transcript index ${c.index} (${platform}) opens "${opening}" - the same six words as a published post; the variance rule says never`);
      }
    }
  });

  run('hook not a breached pattern on that platform', () => {
    for (const c of creates) {
      const args = argsOf(c);
      const hooks = tagValue(args, 'hook:');
      for (const platform of Array.isArray(args.target_platforms) ? args.target_platforms : []) {
        const breached = BREACHED[platform] || [];
        for (const h of hooks) if (breached.includes(h)) fail(`social_create_post at transcript index ${c.index}: hook:${h} on ${platform} is already over 2 of the last 10 - a third use is a variance breach`);
      }
    }
  });

  run('facebook link lives in first_comment, not in content', () => {
    let facebookDrafts = 0;
    for (const c of creates) {
      const args = argsOf(c);
      if (!Array.isArray(args.target_platforms) || !args.target_platforms.includes('facebook')) continue;
      facebookDrafts += 1;
      const content = effectiveContent(args, 'facebook');
      const fc = effectiveFirstComment(args, 'facebook');
      if (/https?:\/\//i.test(content)) fail(`social_create_post at transcript index ${c.index}: the Facebook content carries a URL - the link goes in first_comment`);
      if (!/https?:\/\//i.test(fc)) fail(`social_create_post at transcript index ${c.index}: the Facebook first_comment carries no link`);
    }
    if (facebookDrafts === 0) fail('no Facebook draft was created - the brief named it and the persona reads it');
  });

  run('every required platform gets a draft', () => {
    const seen = new Set(successfulCreates.flatMap((c) => argsOf(c).target_platforms || []));
    const dark = (BOUNDS.required_platforms || []).filter((p) => !seen.has(p));
    if (dark.length) fail(`no draft for ${dark.join(', ')} - the brief named the platform and the persona reads it`);
  });

  run('context loaded before drafting', () => {
    const ctxIdx = transcript.findIndex((c) => c.tool === 'account_context_get' && argsOf(c).domain === 'social');
    if (ctxIdx < 0) fail('account_context_get({ domain: "social" }) was never called');
    const firstGen = transcript.findIndex((c) => c.tool === 'talk_to_department' || c.tool === 'social_create_post');
    if (firstGen >= 0 && firstGen < ctxIdx) fail('a draft or department call came before account_context_get');
  });

  run('persona full row read before drafting', () => {
    const idx = transcript.findIndex((c) => c.tool === 'customer_avatar_get' && (argsOf(c).id === BOUNDS.persona_id || argsOf(c).avatar_id === BOUNDS.persona_id));
    if (idx < 0) fail(`customer_avatar_get for ${BOUNDS.persona_id} was never called - the summary omits buying_behavior and online_behavior`);
    const firstGen = transcript.findIndex((c) => c.tool === 'talk_to_department' || c.tool === 'social_create_post');
    if (firstGen >= 0 && firstGen < idx) fail('talk_to_department or social_create_post ran before the persona\'s full row was read');
  });

  run('variance history read per target platform before drafting', () => {
    const firstGen = transcript.findIndex((c) => c.tool === 'talk_to_department' || c.tool === 'social_create_post');
    for (const platform of BOUNDS.required_platforms || []) {
      const idx = transcript.findIndex((c) => c.tool === 'social_list_posts' && argsOf(c).platform === platform);
      if (idx < 0) fail(`social_list_posts({ platform: "${platform}" }) was never called - the variance rule reads the last 20 on that platform`);
      if (firstGen >= 0 && firstGen < idx) fail(`the ${platform} history was read after drafting began`);
    }
  });

  run('validate before create, preview after', () => {
    const firstCreate = transcript.findIndex((c) => c.tool === 'social_create_post');
    if (firstCreate < 0) fail('no social_create_post call - the command leaves one draft per platform in the account');
    const validateIdx = transcript.findIndex((c) => c.tool === 'social_post_validate');
    if (validateIdx < 0) fail('social_post_validate was never called - the dry run is the work list before the write');
    if (validateIdx > firstCreate) fail('social_post_validate ran only after the first create');
    const previewIdx = transcript.findIndex((c) => c.tool === 'social_post_preview');
    if (previewIdx < 0) fail('social_post_preview was never called - the fold per platform is read after the write');
    if (previewIdx < firstCreate) fail('social_post_preview ran before any post existed');
  });

  run('a task is filed', () => {
    const n = countCalls(transcript, 'pm_tasks_create');
    if (n < (BOUNDS.min_tasks || 1)) fail(`pm_tasks_create called ${n} time(s); a platform the brief named with no healthy row and a boilerplate avatar are tasks, not posts`);
  });

  run('memory write-back keeps the prior document', () => {
    const updates = callsTo(transcript, 'memory_update');
    const creates2 = callsTo(transcript, 'memory_create');
    if (updates.length + creates2.length === 0) fail('no memory_update or memory_create - the session did not persist its learnings');
    for (const c of updates) {
      const content = String(argsOf(c).content || '');
      if (!content.includes(PRIOR_MEMORY)) fail('memory_update content does not contain the prior document - it REPLACES, so the department\'s accumulated notes were destroyed');
      if (content.trim() === PRIOR_MEMORY.trim()) fail('memory_update resent the prior document with nothing appended');
    }
  });

  // -- Deliverable: the header and the rubric line per draft ------------------
  run('header line per persisted draft', () => {
    const headers = report.match(/^\s*(?:[-*]\s*)?(?:`)?For:\s*[^|\n]+\|\s*Stage:\s*[^|\n]+\|\s*Pillar:\s*[^|\n]+\|\s*Hook:\s*[^|\n]+\|\s*Format:\s*[^|\n]+\|\s*CTA:\s*[^\n]+$/gmi) || [];
    if (headers.length < successfulCreates.length) fail(`${headers.length} header line(s) "For: | Stage: | Pillar: | Hook: | Format: | CTA:" for ${successfulCreates.length} persisted draft(s)`);
    for (const h of headers) {
      if (/general audience/i.test(h)) fail('"general audience" is a header you have not filled');
      if (!h.includes(BOUNDS.persona_name)) fail(`header "${h.trim()}" does not name the persona ${BOUNDS.persona_name}`);
    }
  });

  run('rubric line >= 11 per persisted draft', () => {
    const { lines, problems: rubricProblems } = parseRubricLines(report);
    for (const p of rubricProblems) fail(p);
    const passing = lines.filter((l) => l.valid && l.total >= BOUNDS.min_rubric).length;
    if (lines.length === 0) fail('no "Rubric: N/14 (specificity n, one-idea n, proof n, voice n, native n, hook n, cta n)" line in the report');
    if (passing < successfulCreates.length) fail(`${passing} rubric line(s) at or above ${BOUNDS.min_rubric}/14 for ${successfulCreates.length} persisted draft(s) - a draft under the gate is an alternative, not a row`);
  });

  run('report names the excluded account and the invalid avatar', () => {
    if (!report.includes(BOUNDS.erroring_account)) fail(`report.md never names ${BOUNDS.erroring_account} - the platform the brief asked for and did not get needs its reason`);
    if (!report.includes(BOUNDS.invalid_avatar)) fail(`report.md never names ${BOUNDS.invalid_avatar} - an invalid foundation is a finding, never a footnote`);
  });

  // -- Sidecar: internally consistent, and consistent with the transcript -----
  const drafts = Array.isArray(findings.drafts) ? findings.drafts : [];
  const categories = findings.categories && typeof findings.categories === 'object' ? findings.categories : {};

  run('drafts rows equal the posts actually created', () => {
    const fromSidecar = drafts.map((d) => d && d.post_id).sort();
    const fromTranscript = [...createdIds].sort();
    if (JSON.stringify(fromSidecar) !== JSON.stringify(fromTranscript)) fail(`findings.drafts post ids ${JSON.stringify(fromSidecar)} differ from the drafts created ${JSON.stringify(fromTranscript)}`);
  });

  // The two sidecar blocks below collect every issue before failing, so a
  // grader sees the whole row's problems in one line instead of the first.
  run('drafts rows are well-formed and agree with their create calls', () => {
    const issues = [];
    if (drafts.length === 0) issues.push('findings.drafts is empty');
    const createById = new Map(successfulCreates.map((c) => [c.result.data.id, argsOf(c)]));
    drafts.forEach((row, i) => {
      if (!row || typeof row !== 'object') { issues.push(`drafts[${i}] is not an object`); return; }
      if (!PLATFORM_SLUGS.includes(row.platform)) issues.push(`drafts[${i}].platform "${row.platform}" is not a publisher slug`);
      if (!PERSONA_PLATFORMS.has(row.platform)) issues.push(`drafts[${i}].platform "${row.platform}" is not one the persona reads`);
      const persona = String(row.persona || '');
      if (![BOUNDS.persona_name.toLowerCase(), BOUNDS.persona_slug, BOUNDS.persona_id].includes(persona.toLowerCase())) issues.push(`drafts[${i}].persona "${row.persona}" is not ${BOUNDS.persona_name}`);
      const stage = slugify(row.stage);
      if (!STAGE_SLUGS.includes(stage)) issues.push(`drafts[${i}].stage "${row.stage}" is not one of ${STAGE_SLUGS.join(', ')}`);
      const hook = slugify(row.hook_type);
      if (!HOOK_SLUGS.includes(hook)) issues.push(`drafts[${i}].hook_type "${row.hook_type}" is not one of the 16 hook patterns`);
      if ((BREACHED[row.platform] || []).includes(hook)) issues.push(`drafts[${i}].hook_type "${hook}" is over the 2-of-10 cap on ${row.platform}`);
      if (!Number.isInteger(row.rubric_total) || row.rubric_total < BOUNDS.min_rubric || row.rubric_total > 14) issues.push(`drafts[${i}].rubric_total ${row.rubric_total} is not an integer in ${BOUNDS.min_rubric}..14`);
      const args = createById.get(row.post_id);
      if (args) {
        if (!(args.target_platforms || []).includes(row.platform)) issues.push(`drafts[${i}] says ${row.platform} but ${row.post_id} targets ${JSON.stringify(args.target_platforms)}`);
        const hookTags = tagValue(args, 'hook:');
        if (hookTags.length && !hookTags.includes(hook)) issues.push(`drafts[${i}].hook_type "${hook}" but ${row.post_id} is tagged hook:${hookTags.join(',')}`);
        const stageTags = tagValue(args, 'stage:');
        if (stageTags.length && !stageTags.includes(stage)) issues.push(`drafts[${i}].stage "${stage}" but ${row.post_id} is tagged stage:${stageTags.join(',')}`);
      }
    });
    if (issues.length) fail(issues.join('; '));
  });

  run('categories are id arrays of the right kind', () => {
    const issues = [];
    const hits = Array.isArray(categories.banned_phrase_hits) ? categories.banned_phrase_hits : [];
    const block = MISC.department.drafts_block;
    const variantIds = new Set([...(block.drafts || []), ...(block.alternatives || [])].map((d) => d.id));
    for (const id of hits) if (!variantIds.has(id)) issues.push(`banned_phrase_hits names "${id}", which is not a variant id from the social_drafts.v1 block`);
    const invalid = Array.isArray(categories.invalid_avatars) ? categories.invalid_avatars : [];
    const avatarIds = new Set(AVATARS.map((a) => a.id));
    for (const id of invalid) if (!avatarIds.has(id)) issues.push(`invalid_avatars names "${id}", which is not a customer avatar id`);
    const breaches = Array.isArray(categories.variance_breaches) ? categories.variance_breaches : [];
    for (const id of breaches) if (!/^(hook|format|opening):[a-z0-9-]+$/.test(String(id))) issues.push(`variance_breaches entry "${id}" is not hook:<tag>, format:<slug> or opening:<slug>`);
    // the persona this post is for cannot also be an invalid avatar
    if (invalid.includes(BOUNDS.persona_id)) issues.push(`invalid_avatars lists ${BOUNDS.persona_id} - the persona the drafts are for`);
    if (issues.length) fail(issues.join('; '));
  });

  return problems;
}

// -- CLI ------------------------------------------------------------------------
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--json') args.json = true;
    else {
      console.error(`social-post checks: unknown argument ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.run) {
    console.error('usage: checks.mjs --run <run-dir> [--json]');
    process.exit(2);
  }
  const runDir = path.resolve(args.run);
  let transcript;
  let findings;
  let report;
  try {
    transcript = loadTranscript(path.join(runDir, 'transcript.jsonl'));
    findings = JSON.parse(fs.readFileSync(path.join(runDir, 'findings.json'), 'utf8'));
    report = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8');
  } catch (err) {
    console.error(`social-post checks: ${err.message}`);
    process.exit(2);
  }
  const problems = checks(transcript, { run: runDir, findings, report });
  if (args.json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  } else {
    for (const p of problems) console.log(`  x ${p}`);
    console.log(problems.length === 0 ? 'PASS: drafts only, healthy targets, clean copy, persona and stage named' : `FAIL: ${problems.length} social-post check(s)`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
