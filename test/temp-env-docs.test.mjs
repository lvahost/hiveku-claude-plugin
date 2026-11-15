/**
 * Temporary environments in the plugin's words (2026-11-13). They teach the project_vcs_temp_env* tools, so they ship
 * only once the tool server serves the family; the ask entries shipped first (test/temp-env-asks.test.mjs). Pins:
 *   1. the prompt line every Hiveku surface carries, word for word on a line of its own (its sha256 is the tool
 *      server's TEMP_ENV_PROMPT_LINE_SHA256), in /hiveku:preview, /hiveku:branch share, the web agency skill and its
 *      VCS reference;
 *   2. /hiveku:branch has share, extend and stop, each in its argument hint; the two that charge send a dry run first
 *      and accept_cents only after the person's yes; stop sends confirm: true;
 *   3. /hiveku:deploy offers the third way to show work, and neither it, /hiveku:preview, /hiveku:branch nor the web
 *      agency skill and its VCS reference names the Live Preview's hosting vendor;
 *   4. every project_vcs_temp_env* name in skills, commands and agents is one of the fifteen the tool server declares
 *      (tool-names.test.mjs does not gate project_ names), and the VCS reference names all fifteen;
 *   5. no dashes in the words people and agents read here.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const PROMPT_LINE =
  'To show a branch to someone, put it on a temporary environment (`project_vcs_temp_env_create`): its own link for 1, 3 or 7 days at 50 cents a day, which the person confirms. Nothing else changes. Give people the Hiveku link. Move Development or Staging only when they ask for that. Call it a temporary environment, never a preview.';
/** The tool server's TEMP_ENV_PROMPT_LINE_SHA256. */
const PROMPT_LINE_SHA256 = '230a6527d1ef406f005b57d4419500b3431d89d6ca1cfacaf5b48517e052e027';

const PREVIEW = 'commands/preview.md';
const BRANCH = 'commands/branch.md';
const DEPLOY = 'commands/deploy.md';
const WEB = 'skills/hiveku-web-agency/SKILL.md';
const REFERENCE = 'skills/hiveku-web-agency/references/vcs-checkpoints-branch-previews.md';

/** The fifteen tools the tool server declares (its TEMP_ENV_TOOL_ASKS). */
const FAMILY = [
  'project_vcs_temp_envs_list',
  'project_vcs_temp_env_get',
  'project_vcs_temp_envs_find',
  'project_vcs_temp_envs_requests_list',
  'project_vcs_temp_envs_usage_get',
  'project_vcs_temp_env_update',
  'project_vcs_temp_env_request_dismiss',
  'project_vcs_temp_env_open',
  'project_vcs_temp_env_create',
  'project_vcs_temp_env_extend',
  'project_vcs_temp_env_revive',
  'project_vcs_temp_env_try_again',
  'project_vcs_temp_env_password_set',
  'project_vcs_temp_env_settings_set',
  'project_vcs_temp_env_delete',
];

/** A file's lines with a list marker, a quote marker and the indent taken off. */
const lines = (rel) => read(rel).split('\n').map((l) => l.replace(/^\s*(?:[-*>]\s+)?/, '').trimEnd());

/** The text of one `**name**` section of a command, up to the next one. */
function section(text, heading) {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `found ${heading}`);
  const next = text.indexOf('\n**', start + heading.length);
  return flat(text.slice(start, next === -1 ? undefined : next));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}

test('the prompt line is word for word, on a line of its own, wherever the plugin teaches showing a branch', () => {
  assert.equal(sha256(PROMPT_LINE), PROMPT_LINE_SHA256, "this file's copy is the tool server's line");
  for (const rel of [PREVIEW, BRANCH, WEB, REFERENCE]) {
    assert.ok(lines(rel).some((l) => sha256(l) === PROMPT_LINE_SHA256), `${rel} carries the prompt line word for word`);
  }
});

test('/hiveku:branch shares, extends and stops a temporary environment, price first and confirm on the turn-off', () => {
  const text = read(BRANCH);
  const hint = text.match(/^argument-hint: "(.*)"$/m)?.[1] ?? '';
  for (const words of ['share <branch> [for 1|3|7 days]', 'extend <branch> [by 1|3|7 days]', 'stop <branch>']) {
    assert.ok(hint.includes(words), `the argument hint offers ${words}`);
  }
  const share = section(text, '**share <branch> [for 1|3|7 days]**');
  assert.match(share, /project_vcs_temp_env_create\(\{ project_id: <the project_id>, branch, days, dry_run: true \}\)/);
  assert.match(share, /on their yes send the same call without `dry_run` and with `accept_cents: <charge\.total_cents>`/);
  assert.match(share, /give people `share_url`/);
  const extend = section(text, '**extend <branch> [by 1|3|7 days]**');
  assert.match(extend, /project_vcs_temp_env_extend\(\{ project_id: <the project_id>, temp_env_id, branch, days, dry_run: true \}\)/);
  assert.match(extend, /with `accept_cents: <charge\.total_cents>`/);
  assert.match(extend, /409 `max_lifetime`/);
  const stop = section(text, '**stop <branch>**');
  assert.match(stop, /project_vcs_temp_env_delete\(\{ project_id: <the project_id>, temp_env_id, branch, confirm: true \}\)/);
  assert.match(stop, /cannot be brought back/);
  assert.match(section(text, '**delete <branch>**'), /also turns off its temporary environments/);
});

test('/hiveku:preview leads with the temporary environment and keeps the Live Preview for your own look', () => {
  const text = flat(read(PREVIEW));
  assert.match(text, /^--- description: Show a branch to someone on a temporary environment/);
  assert.match(text, /project_vcs_temp_env_create\(\{ project_id: <the project_id>, branch, days, dry_run: true \}\)/);
  assert.match(text, /Give people the Hiveku link, `share_url`, never the `address` and never a link from `project_vcs_temp_env_open`/);
  assert.match(text, /The branch preview \(`project_vcs_branch_preview`\) is being retired: never send its address to anyone/);
  assert.match(text, /\*\*Looking at Your site's Live Preview\*\* \(your own check of `main`, not something to share\)/);
  assert.doesNotMatch(text, /Send `previewUrl` for sign-off/);
});

test('/hiveku:deploy offers the third way to show work, and no page here names the Live Preview vendor', () => {
  assert.match(flat(read(DEPLOY)), /and to show a branch to someone without moving any tier, `\/hiveku:branch share` \(a temporary environment/);
  assert.match(flat(read(DEPLOY)), /Saving files reaches the Live Preview at once and touches no deployed tier\./);
  for (const rel of [PREVIEW, BRANCH, DEPLOY, WEB, REFERENCE]) {
    assert.doesNotMatch(read(rel), /\bfly\b|fly\.io/i, `${rel} names the Live Preview's hosting vendor`);
  }
});

test('every temporary environment tool named in the prose is one the tool server declares', () => {
  const family = new Set(FAMILY);
  const unknown = [];
  for (const rel of [...walk('skills'), ...walk('commands'), ...walk('agents')]) {
    for (const m of read(rel).matchAll(/\bproject_vcs_temp_envs?_[a-z_]+/g)) {
      if (!family.has(m[0])) unknown.push(`${rel}: ${m[0]}`);
    }
  }
  assert.deepEqual(unknown, [], 'names the tool server does not declare (a session would call a tool that is not there)');
  const reference = read(REFERENCE);
  const missing = FAMILY.filter((name) => !reference.includes(name));
  assert.deepEqual(missing, [], 'the VCS reference names every tool of the family');
  for (const name of ['project_vcs_temp_env_create', 'project_vcs_temp_env_extend', 'project_vcs_temp_env_revive', 'project_vcs_temp_env_try_again']) {
    assert.ok(flat(reference).includes(`\`${name}\``), `the reference names ${name} among the four that charge`);
  }
  assert.match(flat(reference), /50 cents for every day that starts, on the account's monthly bill/);
});

test('no dashes in the words people and agents read here', () => {
  for (const rel of [PREVIEW, BRANCH, DEPLOY, WEB, REFERENCE]) {
    const offenders = read(rel).split('\n').filter((l) => /temporary environment|project_vcs_temp_env/.test(l) && /[\u2013\u2014]/.test(l));
    assert.deepEqual(offenders, [], `${rel}: a dash in a temporary environment line`);
  }
});
