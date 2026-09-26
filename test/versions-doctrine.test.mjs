/**
 * The versions doctrine in the plugin's prose (design Part 2 E1, Wave 2).
 *
 * Saving is not a version; one plain-language version per change, made with
 * `project_vcs_commit` and NO files; rollback is a dry run first, an apply with
 * the dry run's head, and a publish as a separate step. These pin the words
 * that carry that, in the files a session actually loads, so a rewrite cannot
 * quietly bring back "project_commit is unnecessary" or a checkpoint-only undo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/** Every markdown file a session can load: commands, agents, skills and their references. */
function proseFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.md')) out.push(rel);
    }
  };
  for (const d of ['commands', 'agents', 'skills']) walk(d);
  return out;
}

const PLAIN_EXAMPLE = 'Updated the pricing section on the Home page';
/** Prose wraps at ~100 columns, so compare with whitespace collapsed. */
const flat = (text) => text.replace(/\s+/g, ' ');

test('code, commit, deploy and rollback teach the plain-language version name', () => {
  for (const f of ['commands/code.md', 'commands/commit.md', 'commands/deploy.md', 'commands/rollback.md']) {
    assert.ok(flat(read(f)).includes(PLAIN_EXAMPLE), `${f} must carry the plain-language example "${PLAIN_EXAMPLE}"`);
  }
});

test('no prose says a commit or a version is unnecessary', () => {
  const offenders = proseFiles().filter((f) => /(project_)?commit is unnecessary|no need to (commit|version)/i.test(read(f)));
  assert.deepEqual(offenders, []);
});

test('the version step is the no-files promote, named for visitors, in code and commit', () => {
  const code = read('commands/code.md');
  assert.match(code, /project_vcs_commit\(\{ project_id, message \}\)` with NO `files`/);
  assert.match(code, /Saving is NOT a version/);
  assert.match(code, /never file paths, file extensions, `fix:`-style prefixes, tool names or an\s+"AI:" byline/);
  // Step 7 starts with the status gate.
  assert.match(code, /\*\*7\. Deploy when asked\.\*\* First `project_vcs_status\(\{ project_id \}\)`/);
  const commit = read('commands/commit.md');
  assert.match(commit, /PROMOTE \(no files\)/);
  assert.match(commit, /from ANY writer/);
  assert.match(commit, /\/hiveku:rollback/);
  assert.doesNotMatch(commit, /Imperative, present-tense message/, 'the old commit-message rule contradicts plain-language names');
  assert.doesNotMatch(commit, /its rollback is `project_vcs_revert`/);
});

test('deploy gates on project_vcs_status and says production versions leftovers itself', () => {
  const deploy = read('commands/deploy.md');
  assert.match(deploy, /1\. GATE:[\s\S]*project_vcs_status/);
  assert.match(deploy, /promoted_commit_id/);
  assert.match(deploy, /vcs_commit_id/);
  // The regression step rolls back to a version, then deploys separately.
  assert.match(deploy, /8\. REGRESSION: roll back to the last good version with `\/hiveku:rollback`/);
});

test('rollback: list, dry run, a yes, apply with the dry run head, publish separately', () => {
  const r = read('commands/rollback.md');
  const order = ['project_vcs_history', 'DRY RUN', 'CONFIRM', 'APPLY', 'PUBLISH is a separate step'];
  let at = -1;
  for (const step of order) {
    const i = r.indexOf(step);
    assert.ok(i > at, `"${step}" must come after the previous step`);
    at = i;
  }
  assert.match(r, /dry_run: false,\s+expected_head_commit_id: <the dry run's head_commit_id>/);
  assert.match(r, /does not change the live website|It does not change the live\s+website/);
  assert.match(r, /\/hiveku:restore/, 'the database lane points at restore');
  assert.match(r, /Say "Your site" for `main` and "version" for a saved point; never\s+"commit", "revert" or "HEAD"/);
});

test('restore points at rollback first; branch revert became rollback; history shows source', () => {
  assert.match(read('commands/restore.md'), /To go back to an earlier version of the whole site, use `\/hiveku:rollback`/);
  const branch = read('commands/branch.md');
  assert.match(branch, /\*\*rollback <branch> <version_id>\*\*/);
  assert.match(branch, /project_vcs_rollback\(\{ project_id: <the project_id>, branch, commit_id \}\)/);
  assert.doesNotMatch(branch, /main_not_allowed/);
  const history = read('commands/history.md');
  assert.match(history, /`source` in plain words/);
  assert.match(history, /\/hiveku:rollback/);
});

test('every file that teaches project_vcs_checkout also teaches its paging', () => {
  const offenders = proseFiles()
    .filter((f) => read(f).includes('project_vcs_checkout'))
    .filter((f) => !/\blimit\b/.test(read(f)) || !/cursor/.test(read(f)));
  assert.deepEqual(offenders, [], 'these name project_vcs_checkout without `limit` / `cursor` paging');
});

test('no SEO prose sends files to project_vcs_commit (the code lane saves, then promotes)', () => {
  const seo = proseFiles().filter((f) => f.includes('hiveku-seo-agency') || /commands\/seo-/.test(f));
  assert.ok(seo.length > 5, 'found the SEO prose');
  const offenders = seo.filter((f) => /project_vcs_commit\(\{[^)]*\bfiles\b/.test(read(f)));
  assert.deepEqual(offenders, []);
});

test('the orient skill carries the versioning rule and the rollback risky ask', () => {
  const orient = read('skills/hiveku-orient/SKILL.md');
  assert.match(orient, /Saving is not a version; version every finished change/);
  assert.match(orient, /roll the live project \(Your site\) back to an earlier version/);
  assert.match(orient, /Just roll the site back and put it live/);
});

test('the opt-out is a folder file, never an environment variable', () => {
  const install = read('INSTALL.md');
  assert.match(install, /"version_reminder": false/);
  assert.match(install, /There is no environment-variable switch/);
  for (const f of ['lib/stop-version.mjs', 'lib/vcs-ledger.mjs', 'lib/vcs-tool-rules.mjs', 'bin/hiveku', 'hooks/hooks.json']) {
    assert.doesNotMatch(read(f), /HIVEKU_VERSION_REMINDER/, `${f} must not read an env-var toggle`);
  }
  assert.doesNotMatch(read('lib/stop-version.mjs'), /process\.env/, 'the reminder reads no environment');
  assert.doesNotMatch(read('lib/vcs-ledger.mjs'), /process\.env/, 'the ledger reads no environment');
});

test('the person-facing text has no emoji: the prompts, the notice, the reason, the command', async () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const { argGatedWriteDecision } = await import('../lib/vcs-tool-rules.mjs');
  const { blockReason, unversionedNotice } = await import('../lib/stop-version.mjs');
  const id = '6d676101-0000-4000-8000-00000000000a';
  const texts = [
    argGatedWriteDecision('project_vcs_commit', { project_id: id }).reason,
    argGatedWriteDecision('project_vcs_commit', { project_id: id, files: [{}] }).reason,
    argGatedWriteDecision('project_vcs_rollback', { project_id: id }).reason,
    argGatedWriteDecision('project_vcs_rollback', { project_id: id, dry_run: false }).reason,
    blockReason([{ project_id: id, branch: 'main' }]),
    blockReason([{ project_id: id, branch: 'main' }, { project_id: id, branch: 'x' }]),
    unversionedNotice([{ project_id: id, branch: 'main' }]),
    read('commands/rollback.md'),
  ];
  for (const t of texts) assert.doesNotMatch(t, emoji, t.slice(0, 80));
});

test('no prose says a version or merge on Your site carries a checkpoint_hash to restore', () => {
  // Versions on Your site are manifests: checkpoint_hash is null on every main
  // version and merge (hiveku_builder src/lib/vcs/index.ts on
  // feature/versions-core), so an undo that points at it points at nothing.
  const claim = [
    /\b(?:main|merge|commit|version)\b[^.;]{0,20}\bcarr(?:y|ies)\s+a\s+`?checkpoint_hash/i,
    /\bcommit'?s\s+`?checkpoint_hash/i,
    /project_vcs_commit`?\s+and\s+its\s+checkpoint/i,
  ];
  // NEGATIVE CONTROL: the sentences this replaced are caught.
  for (const old of [
    'merge commit on the target (a `main` merge carries a `checkpoint_hash`, so the whole branch',
    'UNDO: project_checkpoint_restore with the commit\'s checkpoint_hash, then deploy again',
    'The diff is your `project_vcs_commit` and its checkpoint; `deploy_get` reads status',
  ]) {
    assert.ok(claim.some((re) => re.test(old)), `the check must catch: ${old}`);
  }
  const offenders = proseFiles().filter((f) => claim.some((re) => re.test(flat(read(f)))));
  assert.deepEqual(offenders, []);
  // What replaced them.
  assert.match(flat(read('commands/pr.md')), /a merge into Your site is a version, so the whole branch's work can be undone with one `\/hiveku:rollback`/);
  const seo = flat(read('skills/hiveku-seo-agency/references/seo-change-discipline.md'));
  assert.match(seo, /UNDO: project_vcs_rollback to the version before this change/);
  assert.match(seo, /the version id \(`data\.id` from `project_vcs_commit`\)/);
});

test('no prose promises a timed automatic version (the quiet-minutes save is not live)', () => {
  // The three-minute save is the cron worker's vcs-autosave, held until the
  // rollout baseline has run. What is live: a save before a publish, a merge
  // or a rollback. Nothing the plugin ships may promise the timed one.
  const timed = /(?:after|in|within) (?:a few (?:quiet )?)?minutes|\(`\/hiveku:commit`, and automatically\)/gi;
  // A match counts only when it is about versions (forms, DNS and scans have
  // their own honest "few minutes").
  const aboutVersions = (text) =>
    [...text.matchAll(timed)].some((m) => /version/i.test(text.slice(Math.max(0, m.index - 200), m.index + 200)));
  // NEGATIVE CONTROL: the sentences this replaced are caught.
  assert.ok(aboutVersions('Hiveku also saves a version automatically after a few quiet minutes, and before a publish'));
  assert.ok(aboutVersions('Versions are saved all the time now (`/hiveku:commit`, and automatically), and any version'));
  assert.ok(aboutVersions('`deferred` (Hiveku saves it as a version within minutes).'));
  const offenders = proseFiles().filter((f) => aboutVersions(flat(read(f))));
  assert.deepEqual(offenders, []);
  for (const f of ['lib/stop-version.mjs', 'lib/vcs-ledger.mjs']) {
    assert.doesNotMatch(read(f), /few (quiet )?minutes/, `${f} must not promise a timed save`);
  }
});

test('checkpoint guidance names what versions do not hold: the database AND the shared images', () => {
  for (const f of [
    'commands/checkpoint.md',
    'skills/hiveku-web-agency/SKILL.md',
    'skills/hiveku-web-agency/references/vcs-checkpoints-branch-previews.md',
  ]) {
    const text = flat(read(f));
    assert.match(text, /shared media-library images/, `${f}: a checkpoint before replacing or deleting shared images`);
    assert.match(text, /production deploy that ships database or shared-image changes/, `${f}: a checkpoint before such a deploy`);
  }
  assert.match(flat(read('skills/hiveku-web-agency/SKILL.md')),
    /When the database or shared media-library images changed too, `checkpoint_create` now/);
});

test('history and rollback offer only restorable versions, and say why the others cannot be', () => {
  for (const f of ['commands/history.md', 'commands/rollback.md']) {
    const text = flat(read(f));
    assert.match(text, /`restorable: true`/, f);
    assert.match(text, /`restore_blocked_reason`/, f);
  }
  assert.doesNotMatch(flat(read('commands/history.md')), /ANY version on Your site or a branch can be rolled back/);
});

test('the promote is not described as prompt-free: the ask list may still show a prompt', () => {
  for (const f of ['commands/code.md', 'commands/commit.md']) {
    const text = flat(read(f));
    assert.doesNotMatch(text, /needs no confirmation|needs no yes from the person/, f);
    assert.match(text, /their settings may show a permission prompt for it; that is expected/, f);
  }
  assert.match(flat(read('INSTALL.md')), /every DIRECT call to either tool prompts/);
  assert.match(flat(read('INSTALL.md')), /Inside `hiveku_batch` the settings rule only sees the batch/);
});

test('the version tools are advertised up front, and only when the server offers them', async () => {
  const { CORE_TOOLS, indexModeTools, FIND_TOOL_NAME } = await import('../lib/tool-index.mjs');
  for (const name of ['project_vcs_status', 'project_vcs_commit', 'project_vcs_rollback']) {
    assert.ok(CORE_TOOLS.includes(name), `${name} must be in CORE_TOOLS`);
  }
  const offered = indexModeTools([{ name: 'project_vcs_commit' }, { name: 'project_files_bulk_save' }]).map((t) => t.name);
  assert.deepEqual(offered, [FIND_TOOL_NAME, 'project_vcs_commit'], 'a core name the server does not offer is not advertised');
});

test('person-facing copy about a deploy or a rollback gate says "version", not head or live project', () => {
  assert.doesNotMatch(read('commands/deploy.md'), /at its current head/);
  const perm = JSON.parse(read('data/permission-critical-tools.json'));
  const rollback = perm.tools.find((t) => t.name === 'project_vcs_rollback');
  assert.match(rollback.why_gated, /^moves Your site or a branch back to an earlier version/);
  assert.match(rollback.why_gated, /no deployed tier changes/);
});
