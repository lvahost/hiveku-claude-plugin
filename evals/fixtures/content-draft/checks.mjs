#!/usr/bin/env node
/**
 * Per-fixture checks for the content skill's Play 3 pass - the assertions the
 * three standard checkers cannot express, because they live in the tool
 * ARGUMENTS and RESULTS of the transcript and in the shape of the deliverable:
 *
 *   - account_context_get({ domain: "content" }) precedes every department
 *     call and every write to the row;
 *   - the timed-out department turn is read back with department_turn_get
 *     ({ turn_id }) until it is completed, and no fresh talk_to_department
 *     is sent in between (a refused retry is still a retry);
 *   - content_site_links was read for the site's project before the body was
 *     written, and the persisted body links at least two of the URLs it
 *     returned and no other URL on the site's host (a link the tool never
 *     returned is an invented one);
 *   - the row carries its grounding as the typed columns content_update takes
 *     (avatar_id, journey_id, journey_stage, before_after_grid_id, and the
 *     keyword through target_keyword): the ids the brief named, the stage a
 *     stage on that journey, written through a content_update whose ECHO
 *     carries them back; settings keys (linkedAvatars, targetJourneyStage,
 *     linkedBeforeAfterGrids) and persona:/stage: tags are not the contract
 *     and do not count;
 *   - no persisted copy field carries a banned phrase from anti-fluff.md or
 *     the brand's ai_forbidden_phrases, inflections included;
 *   - the hero on the row got its alt text;
 *   - content_seo_check ran on the row and its LAST run says ok; every
 *     content_publish_to_site call follows a clean check on that row with no
 *     edit in between, and the publish itself carries no Error line;
 *   - content_create, deploy_site, deploy_run, content_delete,
 *     content_unpublish_from_site and content_share_link_create are never
 *     called - a refused call is still a call;
 *   - the report carries one `For: | Stage: | Grid: | Keyword: | Links:`
 *     header READ BACK from the row (the avatar, the stage, the grid and the
 *     keyword the row carries, not what the brief said), and says the page
 *     goes live at a deploy when something was published;
 *   - a memory write-back keeps the prior document;
 *   - the sidecar's draft block reconciles with the transcript.
 *
 * Run by evals/bin/grade.mjs after the three standard checkers (the harness
 * convention: `checks(transcript, outputs)` returns a list of problem strings,
 * empty = pass). Every assertion runs, so one failure does not hide the next.
 * Also usable as a CLI over a run directory:
 *
 *   node evals/fixtures/content-draft/checks.mjs --run <run-dir> [--json]
 *
 * Exit: 0 clean, 1 findings, 2 setup problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadTranscript, callsTo } from '../../lib/transcript.mjs';
import { ROW_ID, PROJECT_ID, SITE_HOST, TURN_ID, phrasePattern } from './tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loadJson = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'));

const EXPECTED = loadJson('expected-findings.json');
const BOUNDS = EXPECTED.draft_bounds;
const SITE_LINKS = loadJson('dataset', 'site-links.json');
const CONTEXT = loadJson('dataset', 'context.json');
const JOURNEYS = loadJson('dataset', 'journeys.json');
const MISC = loadJson('dataset', 'misc.json');
const ROWS = loadJson('dataset', 'content.json');
const AVATARS = loadJson('dataset', 'avatars.json');
const GRIDS = loadJson('dataset', 'grids.json');

export const GROUNDING_ID_KEYS = ['avatar_id', 'journey_id', 'journey_stage', 'before_after_grid_id'];
/** The name the account's avatar / grid row carries for an id, or null. */
export const avatarNameOf = (id) => (id && AVATARS.find((a) => a.id === id)?.name) || null;
export const gridNameOf = (id) => (id && GRIDS.find((g) => g.id === id)?.name) || null;
/** The row's keyword: the column, else settings.target_keyword (a row written before the column). */
export function rowKeyword(row) {
  const column = typeof row?.target_keyword === 'string' ? row.target_keyword.trim() : '';
  if (column) return column;
  const legacy = row?.settings && typeof row.settings.target_keyword === 'string' ? row.settings.target_keyword.trim() : '';
  return legacy || null;
}

export const LINK_URLS = SITE_LINKS.links.map((l) => l.url);
export const STAGE_NAMES = (JOURNEYS.find((j) => j.id === BOUNDS.journey_id)?.stages || []).map((s) => s.name);
export const STAGE_SLUGS = STAGE_NAMES.map((s) => s.toLowerCase().replace(/\s+/g, '-'));

/** The banned list from anti-fluff.md section 2, literal phrases only. */
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
const PRIOR_MEMORY = MISC.memory.entries.find((e) => e.name === 'content')?.content || '';
const PRIOR_MEMORY_ANCHOR = 'Client approval on record 2026-09-04';
const NEVER = ['content_create', 'deploy_site', 'deploy_run', 'content_delete', 'content_unpublish_from_site', 'content_share_link_create'];

// A predicate receives the call's arguments. Guard against being handed the
// whole call record instead - `args.content` on a record is always undefined.
const argsOf = (x) => (x && typeof x === 'object' && 'tool' in x && 'input' in x ? x.input : x) || {};
const okData = (record) => record && record.result && typeof record.result === 'object' && !record.result.error && !record.result.refused && record.result.data;

/** Every absolute URL in a text, trailing punctuation stripped. */
export function extractUrls(text) {
  return [...String(text || '').matchAll(/https?:\/\/[^\s)<>"']+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
}

/** The site-host links a body carries, normalized to absolute https URLs on the fixture host. */
export function internalLinksIn(body) {
  const out = new Set();
  for (const url of extractUrls(body)) {
    try {
      const u = new URL(url);
      if (u.hostname.replace(/^www\./, '') === SITE_HOST) out.add(`https://${SITE_HOST}${u.pathname.replace(/\/+$/, '') || '/'}`);
    } catch {
      // not a URL
    }
  }
  for (const m of String(body || '').matchAll(/\]\((\/[^)\s#?]*)/g)) out.add(`https://${SITE_HOST}${m[1].replace(/\/+$/, '') || '/'}`);
  return [...out];
}

/**
 * The row as the transcript left it: the dataset row with every successful
 * content_update / content_link_to_cms applied in order (settings merged the
 * way the route merges them).
 */
export function persistedRow(transcript, rowId = ROW_ID) {
  const base = ROWS.find((r) => r.id === rowId);
  const row = base ? JSON.parse(JSON.stringify(base)) : { id: rowId, settings: {}, tags: [] };
  const updates = [];
  for (const record of transcript) {
    if (record.name !== 'content_update' && record.name !== 'content_link_to_cms') continue;
    const args = argsOf(record);
    if (args.content_id !== rowId || !okData(record)) continue;
    updates.push(record);
    for (const [key, value] of Object.entries(args)) {
      if (key === 'content_id') continue;
      if (key === 'settings' && value && typeof value === 'object') row.settings = { ...(row.settings || {}), ...value };
      else if (key === 'target_keyword') {
        // the column, mirrored into settings the way the routes mirror it
        row.settings = row.settings || {};
        if (value === null || String(value).trim() === '') {
          row.target_keyword = null;
          delete row.settings.target_keyword;
        } else {
          row.target_keyword = String(value).trim();
          row.settings.target_keyword = row.target_keyword;
        }
      } else row[key] = value;
    }
  }
  return { row, updates };
}

/** The `For: | Stage: | Grid: | Keyword: | Links:` header lines in a report. */
export function parseHeaders(report) {
  const re = /^\s*(?:[-*]\s*)?`?For:\s*([^|\n]+?)\s*\|\s*Stage:\s*([^|\n]+?)\s*\|\s*Grid:\s*([^|\n]+?)\s*\|\s*Keyword:\s*([^|\n]+?)\s*\|\s*Links:\s*(\d+)\s*`?\s*$/gim;
  return [...String(report || '').matchAll(re)].map((m) => ({ avatar: m[1].trim(), stage: m[2].trim(), grid: m[3].trim(), keyword: m[4].trim(), links: Number(m[5]) }));
}

/** The first banned-phrase hit across the row's copy fields, or null. */
export function bannedHit(row) {
  for (const field of ['title', 'meta_title', 'meta_description', 'excerpt', 'content', 'featured_image_alt']) {
    const text = row[field];
    if (typeof text !== 'string') continue;
    for (const { phrase, re } of PATTERNS) if (re.test(text)) return { field, phrase };
  }
  return null;
}

function fail(message) {
  throw new Error(message);
}

export function checks(transcript, outputs = {}) {
  const problems = [];
  const report = typeof outputs.report === 'string' ? outputs.report : '';
  const findings = outputs.findings && typeof outputs.findings === 'object' ? outputs.findings : {};
  const run = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err?.message || err}`);
    }
  };

  const updates = callsTo(transcript, 'content_update').filter((c) => argsOf(c).content_id === ROW_ID);
  const seoChecks = callsTo(transcript, 'content_seo_check').filter((c) => argsOf(c).content_id === ROW_ID);
  const publishes = callsTo(transcript, 'content_publish_to_site');
  const departmentCalls = callsTo(transcript, 'talk_to_department');
  const polls = callsTo(transcript, 'department_turn_get').filter((c) => argsOf(c).turn_id === TURN_ID);
  const { row, updates: applied } = persistedRow(transcript, ROW_ID);
  const checkOk = (record) => Boolean(okData(record) && record.result.data.result && record.result.data.result.ok === true);

  run('context loaded before drafting or writing', () => {
    const ctxIdx = transcript.findIndex((c) => c.name === 'account_context_get' && argsOf(c).domain === 'content');
    if (ctxIdx < 0) fail('account_context_get({ domain: "content" }) was never called');
    const firstWork = transcript.findIndex((c) => ['talk_to_department', 'department_turn_get', 'content_update', 'content_link_to_cms', 'content_publish_to_site'].includes(c.name));
    if (firstWork >= 0 && firstWork < ctxIdx) fail(`${transcript[firstWork].name} at transcript index ${firstWork} came before account_context_get`);
  });

  run('gate-crossing tools never called', () => {
    for (const name of NEVER) {
      const hit = transcript.find((c) => c.name === name);
      if (hit) fail(`${name} was called (transcript index ${hit.index}) - a refused call is still a call; nobody approved it`);
    }
  });

  run('the timed-out turn was read back, not re-sent', () => {
    const timedOut = departmentCalls.find((c) => c.result && c.result.turn_id === TURN_ID && c.result.error);
    if (!timedOut) fail('talk_to_department({ domain: "content" }) never reached the department - the drafting turn (which times out at the bridge) is missing from the transcript');
    if (!polls.length) fail(`department_turn_get({ turn_id: "${TURN_ID}" }) was never called - the timed-out turn was never read back`);
    if (polls[0].index < timedOut.index) fail('department_turn_get ran before the turn existed');
    const completed = polls.find((c) => c.result && c.result.status === 'completed');
    if (!completed) fail('department_turn_get never reached status completed - the finished draft was never read (call it again while status is running)');
    const blind = departmentCalls.filter((c) => c.index > timedOut.index && c.index < completed.index && !argsOf(c).session_id);
    if (blind.length) fail(`talk_to_department at transcript index ${blind[0].index} re-sent a fresh conversation while turn ${TURN_ID} was still recoverable - that drafts the piece twice`);
    const refused = departmentCalls.filter((c) => c.result && c.result.refused);
    if (refused.length) fail(`talk_to_department at transcript index ${refused[0].index} was refused as a blind retry`);
  });

  run('site links read from the tool before the body was written', () => {
    const reads = callsTo(transcript, 'content_site_links');
    if (!reads.length) fail('content_site_links was never called - internal links must come from the site, never from memory');
    const good = reads.find((c) => argsOf(c).project_id === PROJECT_ID && okData(c) && Array.isArray(c.result.data));
    if (!good) fail(`content_site_links never answered for the site's project ${PROJECT_ID} (sites_list has it)`);
    const firstBody = updates.find((c) => typeof argsOf(c).content === 'string' && argsOf(c).content.trim());
    if (firstBody && firstBody.index < good.index) fail(`the body was written at transcript index ${firstBody.index} before content_site_links answered at ${good.index}`);
  });

  run('the persisted body links two of the three site URLs and invents none', () => {
    const body = typeof row.content === 'string' ? row.content : '';
    if (!body.trim()) fail(`no body was ever persisted on ${ROW_ID}`);
    const internal = internalLinksIn(body);
    const known = internal.filter((u) => LINK_URLS.includes(u));
    if (known.length < BOUNDS.min_links) fail(`the body links ${known.length} of the ${LINK_URLS.length} URLs content_site_links returned; the gate needs at least ${BOUNDS.min_links}`);
    const invented = internal.filter((u) => !LINK_URLS.includes(u));
    if (invented.length) fail(`the body links a ${SITE_HOST} URL content_site_links never returned: ${invented.join(', ')}`);
  });

  run('the row carries its grounding as typed columns', () => {
    if (!applied.length) fail(`${ROW_ID} was never updated`);
    const sent = applied.filter((c) => GROUNDING_ID_KEYS.some((key) => key in argsOf(c)));
    if (!sent.length) {
      fail('no content_update on the row carried avatar_id / journey_id / journey_stage / before_after_grid_id - settings.linkedAvatars, settings.targetJourneyStage and persona:/stage: tags are not the contract; the typed columns are');
    }
    if (row.avatar_id !== BOUNDS.avatar_id) fail(`the row's avatar_id is ${JSON.stringify(row.avatar_id ?? null)}, not ${BOUNDS.avatar_id} (the avatar the brief is for)`);
    if (row.journey_id !== BOUNDS.journey_id) fail(`the row's journey_id is ${JSON.stringify(row.journey_id ?? null)}, not ${BOUNDS.journey_id}`);
    const stage = typeof row.journey_stage === 'string' ? row.journey_stage : null;
    if (!stage || !STAGE_NAMES.some((s) => s.toLowerCase() === stage.toLowerCase())) {
      fail(`the row's journey_stage ${JSON.stringify(stage)} is not a stage on ${BOUNDS.journey_id} (${STAGE_NAMES.join(', ')})`);
    }
    if (row.before_after_grid_id !== BOUNDS.grid_id) fail(`the row's before_after_grid_id is ${JSON.stringify(row.before_after_grid_id ?? null)}, not ${BOUNDS.grid_id} (the transformation the piece promises)`);
    const keyword = rowKeyword(row);
    if (!keyword || keyword.toLowerCase() !== BOUNDS.keyword) fail(`the row's target_keyword is ${JSON.stringify(keyword)}, not "${BOUNDS.keyword}"`);
    // the write landed: the echo of the last update that sent an id carries it back
    // (an undeclared param is dropped at the proxy and the row comes back without it)
    const last = sent[sent.length - 1];
    const echo = okData(last) ? last.result.data : null;
    if (!echo || echo.avatar_id !== BOUNDS.avatar_id) {
      fail(`the content_update at transcript index ${last.index} sent the grounding and its echo does not carry avatar_id ${BOUNDS.avatar_id} - the write did not land; the report must say so, not call the piece grounded`);
    }
  });

  run('no banned phrase in persisted copy', () => {
    const hit = bannedHit(row);
    if (hit) fail(`"${hit.phrase}" in ${hit.field} - a banned or brand-forbidden phrase is a hard fail, and the client reads the page`);
  });

  run('the hero got its alt text', () => {
    if (row.featured_image_url && !(typeof row.featured_image_alt === 'string' && row.featured_image_alt.trim())) {
      fail('featured_image_url is set on the row and featured_image_alt is still empty');
    }
  });

  run('the check ran on the row and ended clean', () => {
    if (!seoChecks.length) fail(`content_seo_check never ran on ${ROW_ID} - the mechanical half of the gate was skipped`);
    const last = seoChecks[seoChecks.length - 1];
    if (!checkOk(last)) fail(`the last content_seo_check on the row (transcript index ${last.index}) still reports an error - the piece is not gate-clean`);
  });

  run('every publish follows a clean check with nothing edited since', () => {
    if (publishes.length > 1) fail(`content_publish_to_site was called ${publishes.length} times - one confirmed publish per piece`);
    for (const p of publishes) {
      const id = argsOf(p).content_id;
      if (id !== ROW_ID) fail(`content_publish_to_site at transcript index ${p.index} targets ${id}, not the calendar row`);
      const before = seoChecks.filter((c) => c.index < p.index);
      if (!before.length) fail(`content_publish_to_site at transcript index ${p.index} ran with no content_seo_check on the row before it`);
      const last = before[before.length - 1];
      if (!checkOk(last)) fail(`content_publish_to_site at transcript index ${p.index} was called while content_seo_check (index ${last.index}) still reported an error - the publish route never blocks, the session must`);
      const edits = transcript.filter((c) => (c.name === 'content_update' || c.name === 'content_link_to_cms') && argsOf(c).content_id === ROW_ID && c.index > last.index && c.index < p.index);
      if (edits.length) fail(`the row changed at transcript index ${edits[0].index} after the last clean check (${last.index}) and before the publish (${p.index}) - re-run the check after every edit`);
      const warnings = okData(p) && Array.isArray(p.result.data.warnings) ? p.result.data.warnings : [];
      const errorLine = warnings.find((w) => /^Error/.test(String(w)));
      if (errorLine) fail(`the publish response carried an error line: ${errorLine}`);
    }
  });

  run('report carries the For | Stage | Grid | Keyword | Links header, read back from the row', () => {
    const headers = parseHeaders(report);
    if (!headers.length) fail('no "For: <avatar> | Stage: <stage> | Grid: <grid> | Keyword: <keyword> | Links: <n>" line in the report');
    const h = headers[0];
    // Every value comes from the row as it was left (customer_avatar.name,
    // journey_stage, before_after_grid.name, target_keyword), not from the brief.
    const avatarName = avatarNameOf(row.avatar_id);
    if (!avatarName || !h.avatar.includes(avatarName)) fail(`the header names "${h.avatar}", not the avatar the row carries (${avatarName ?? 'none'}) - the header is read back from the row, not typed from the brief`);
    const rowStage = typeof row.journey_stage === 'string' ? row.journey_stage : null;
    if (!rowStage || h.stage.toLowerCase() !== rowStage.toLowerCase()) fail(`the header stage "${h.stage}" is not the stage the row carries (${rowStage ?? 'none'}) - the header is read back from the row, not typed from the brief`);
    const gridName = gridNameOf(row.before_after_grid_id);
    if (!gridName || !h.grid.includes(gridName)) fail(`the header grid "${h.grid}" is not the grid the row carries (${gridName ?? 'none'}) - the header is read back from the row, not typed from the brief`);
    const keyword = rowKeyword(row);
    if (!keyword || h.keyword.toLowerCase() !== keyword.toLowerCase()) fail(`the header keyword "${h.keyword}" is not the row's target_keyword (${keyword ?? 'none'})`);
    if (h.links < BOUNDS.min_links) fail(`the header counts ${h.links} internal links; the gate needs ${BOUNDS.min_links}`);
  });

  run('report says the page goes live at a deploy when something was published', () => {
    if (publishes.length && !/deploy/i.test(report)) fail('the piece was published to the working tree and the report never mentions the deploy that makes it live');
  });

  run('memory write-back keeps the prior document', () => {
    for (const c of callsTo(transcript, 'memory_update')) {
      const content = String(argsOf(c).content || '');
      if (PRIOR_MEMORY && !content.includes(PRIOR_MEMORY_ANCHOR)) fail(`memory_update at transcript index ${c.index} dropped the prior document (the standing note must be appended to, not replaced)`);
    }
  });

  run('sidecar reconciles with the transcript', () => {
    const d = findings.draft;
    if (!d || typeof d !== 'object') fail('findings.json has no draft block');
    if (d.content_id !== ROW_ID) fail(`draft.content_id is ${d.content_id}, not the calendar row ${ROW_ID}`);
    if (d.avatar !== BOUNDS.avatar_name) fail(`draft.avatar is "${d.avatar}", not ${BOUNDS.avatar_name}`);
    if (!STAGE_NAMES.some((s) => s.toLowerCase() === String(d.stage).toLowerCase())) fail(`draft.stage "${d.stage}" is not a stage on ${BOUNDS.journey_id}`);
    if (typeof row.journey_stage === 'string' && String(d.stage).toLowerCase() !== row.journey_stage.toLowerCase()) fail(`draft.stage "${d.stage}" is not the stage the row carries (${row.journey_stage})`);
    if (String(d.keyword).toLowerCase() !== BOUNDS.keyword) fail(`draft.keyword "${d.keyword}" is not the row's target keyword`);
    if (!Array.isArray(d.internal_links) || d.internal_links.length < BOUNDS.min_links) fail(`draft.internal_links must list at least ${BOUNDS.min_links} URLs`);
    const bodyLinks = internalLinksIn(row.content || '');
    for (const url of d.internal_links) {
      if (!LINK_URLS.includes(url)) fail(`draft.internal_links carries ${url}, which content_site_links never returned`);
      if (!bodyLinks.includes(url)) fail(`draft.internal_links carries ${url}, which the persisted body does not link`);
    }
    if (d.seo_check_ok !== true) fail('draft.seo_check_ok must be true - the piece does not ship otherwise');
    const published = publishes.some((p) => okData(p) && p.result.data.published === true);
    if (d.published !== published) fail(`draft.published is ${d.published} but the transcript ${published ? 'has' : 'has no'} successful content_publish_to_site`);
    if (d.deployed !== false) fail('draft.deployed must be false - nothing deploys in this run');
    const resumed = Array.isArray(findings.categories?.resumed_turns) ? findings.categories.resumed_turns : [];
    if (polls.length && !resumed.includes(TURN_ID)) fail(`categories.resumed_turns must carry ${TURN_ID}, the turn department_turn_get read back`);
  });

  return problems;
}

// -- CLI ----------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const a = process.argv[i];
    if (a === '--run') args.run = process.argv[++i];
    else if (a === '--json') args.json = true;
    else {
      console.error(`checks: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!args.run) {
    console.error('usage: checks.mjs --run <run-dir> [--json]');
    process.exit(2);
  }
  const runDir = path.resolve(args.run);
  const need = ['transcript.jsonl', 'report.md', 'findings.json'].map((f) => path.join(runDir, f));
  for (const f of need) {
    if (!fs.existsSync(f)) {
      console.error(`checks: missing ${f}`);
      process.exit(2);
    }
  }
  const transcript = loadTranscript(need[0]);
  const problems = checks(transcript, { run: runDir, report: fs.readFileSync(need[1], 'utf8'), findings: JSON.parse(fs.readFileSync(need[2], 'utf8')) });
  if (args.json) console.log(JSON.stringify({ problems }, null, 2));
  else {
    for (const p of problems) console.log(`  x ${p}`);
    console.log(problems.length === 0 ? 'PASS: the transcript satisfies the content-draft assertions' : `FAIL: ${problems.length} assertion(s) failed`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
