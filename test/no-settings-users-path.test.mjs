/**
 * No skill, command or agent sends a person to "Settings > Users" (2026-10-07).
 *
 * Hiveku has no such page. A role's permissions are edited under Settings >
 * Team Members > Manage Roles, and admins are made on Team Members; the
 * builder's own messages say so since builder #785. This reads every file the
 * plugin ships (skills, commands, agents, scripts and hooks, the generated tool
 * index included; whitespace collapsed, so a wrapped line still counts), so
 * the old path cannot come back. Google Search Console's own Settings > Users
 * is a real page and is left alone; another product's real page of that name
 * would need its own exception here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_PATH = /Settings[*_`]* ?(>|&gt;|,|→|\/|:|->|›|») ?[*_`]*Users\b/;
const SHIPPED = /\.(md|mjs|cjs|js|json|txt|sh|yaml|yml)$/;
const SCRIPT_DIRS = new Set(['bin', 'hooks']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test']);

function shippedFiles(dir = ROOT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : shippedFiles(full);
    // Scripts in bin/ and hooks/ often have no extension.
    const inScriptDir = SCRIPT_DIRS.has(path.basename(dir));
    return SHIPPED.test(entry.name) || inScriptDir ? [path.relative(ROOT, full)] : [];
  });
}

function oldPathMentions(text) {
  // Sentence by sentence, so one about Search Console can keep its real path.
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.;!?])\s/)
    .filter((sentence) => OLD_PATH.test(sentence) && !/search console/i.test(sentence));
}

test('no shipped file names "Settings > Users"', () => {
  const hits = shippedFiles().flatMap((rel) =>
    oldPathMentions(fs.readFileSync(path.join(ROOT, rel), 'utf8')).map((sentence) => `${rel}: ${sentence.slice(0, 160)}`),
  );
  assert.deepEqual(hits, []);
});

test('the check sees each form, a wrapped line included, and lets the real path through', () => {
  for (const text of [
    'under Settings > Users.',
    'under Settings >\n  Users.',
    'Settings, Users',
    'Settings → Users',
    'Settings -> Users',
    'Settings › Users',
    'under **Settings** > **Users**.',
  ]) {
    assert.equal(oldPathMentions(text).length, 1, text);
  }
  assert.equal(oldPathMentions('under Settings > Team Members > Manage Roles.').length, 0);
  assert.equal(oldPathMentions('In Google Search Console, open Settings > Users and permissions.').length, 0);
});
