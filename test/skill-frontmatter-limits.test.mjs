/**
 * Skill front matter inside the limits Anthropic's plugin sync enforces (2026-10-14).
 *
 * The Claude desktop app adds a marketplace through Anthropic's servers, and they
 * validate every plugin before syncing it. A skill whose `description` is over
 * 1,024 characters fails (plugin_upload_skill_md_description_too_long), the whole
 * marketplace sync fails with it, and the app shows only "Marketplace sync failed.
 * Check the repository URL and try again." A client hit exactly that: 15 of our 19
 * skills were over. Terminal Claude Code installs the plugin without this check, and
 * `claude plugin validate --strict` passes, so nothing else catches it.
 *
 * The same validator rejects `<` or `>` in a skill description (anthropics/claude-code
 * #63081) and a URL in the plugin's own description (#56517). These pins keep:
 *   - every skill's name matching its folder and the Agent Skills name rules;
 *   - every skill's description on one line, non-empty, at most 1,024 characters,
 *     with no angle brackets;
 *   - no URL in the plugin.json or marketplace entry description.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_DESCRIPTION_MAX } from '../lib/knowledge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /https?:\/\/|www\./i;

/** One-line `key: value` front matter; a quoted value is unquoted as YAML would. */
function frontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"')) value = JSON.parse(value);
    else if (value.startsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    fields[kv[1]] = value;
  }
  return fields;
}

/** Why the platform would refuse this skill's front matter, or [] when it would not. */
function skillProblems(folder, fields) {
  const problems = [];
  if (!fields) return ['no front matter'];
  const { name = '', description = '' } = fields;
  if (name !== folder) problems.push(`name "${name}" is not the folder name "${folder}"`);
  if (name.length > 64 || !NAME_RE.test(name)) problems.push(`name "${name}" breaks the name rules`);
  if (!description) problems.push('description is empty or not on one line');
  if (['|', '>', '|-', '>-'].includes(description)) problems.push('description must be on one line');
  if (description.length > SKILL_DESCRIPTION_MAX) {
    problems.push(`description is ${description.length} characters (max ${SKILL_DESCRIPTION_MAX})`);
  }
  if (/[<>]/.test(description)) problems.push('description contains < or >');
  return problems;
}

const SKILLS = fs
  .readdirSync(path.join(root, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

test('the plugin ships skills to check', () => {
  assert.ok(SKILLS.length >= 19, `found ${SKILLS.length} skill folders`);
});

test('every skill front matter is inside the platform limits', () => {
  const failures = [];
  for (const folder of SKILLS) {
    const fields = frontMatter(read(`skills/${folder}/SKILL.md`));
    for (const problem of skillProblems(folder, fields)) failures.push(`skills/${folder}: ${problem}`);
  }
  assert.deepEqual(failures, []);
});

test('the checks refuse what the platform refuses (control)', () => {
  const long = { name: 'x', description: 'a'.repeat(SKILL_DESCRIPTION_MAX + 1) };
  assert.match(skillProblems('x', long).join(), /1025 characters/);
  assert.match(skillProblems('x', { name: 'x', description: 'Pass <name> to it.' }).join(), /< or >/);
  assert.match(skillProblems('y', { name: 'x', description: 'ok' }).join(), /not the folder name/);
  assert.match(skillProblems('x', { name: 'x', description: '>' }).join(), /one line/);
  assert.deepEqual(skillProblems('x', { name: 'x', description: 'a'.repeat(SKILL_DESCRIPTION_MAX) }), []);
  assert.equal(SKILL_DESCRIPTION_MAX, 1024);
});

test('the plugin descriptions carry no URL', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.doesNotMatch(plugin.description, URL_RE, 'plugin.json description');
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  for (const entry of marketplace.plugins) {
    assert.doesNotMatch(entry.description, URL_RE, `marketplace entry ${entry.name}`);
  }
});
