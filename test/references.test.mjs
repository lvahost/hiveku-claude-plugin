/**
 * Progressive disclosure only works if the hub SKILL.md names the file.
 *
 * A reference file that no SKILL.md mentions by filename is never loaded by any
 * session. It ships, it costs repo weight, and it is invisible. Nothing warns
 * you: the plugin validates, the skill loads, and the depth simply is not there.
 *
 * This has happened three times. hiveku-ppc-agency named its references
 * directory ZERO times across 8 files and hiveku-seo-agency named 1 of 8, which
 * stranded roughly 450KB of operator manuals written specifically for depth.
 * Then node-rail.md was orphaned one release after it was added, and
 * integrations.md one release after that. It is not a lapse of attention, it is
 * a missing check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every references/*.md is named by its own SKILL.md', () => {
  const skillsDir = path.join(root, 'skills');
  const orphans = [];
  let checked = 0;

  for (const skill of fs.readdirSync(skillsDir)) {
    const refDir = path.join(skillsDir, skill, 'references');
    const skillMd = path.join(skillsDir, skill, 'SKILL.md');
    if (!fs.existsSync(refDir) || !fs.existsSync(skillMd)) continue;
    const hub = fs.readFileSync(skillMd, 'utf8');
    for (const f of fs.readdirSync(refDir)) {
      if (!f.endsWith('.md')) continue;
      checked++;
      // Match the BASENAME: naming the directory is not enough to load a file.
      if (!hub.includes(f)) orphans.push(`${skill}/references/${f}`);
    }
  }

  assert.ok(checked > 0, 'found no reference files at all, so this test proves nothing');
  assert.deepEqual(
    orphans,
    [],
    `these reference files are unreachable because no SKILL.md names them:\n  ${orphans.join('\n  ')}`,
  );
});

test('every referenced references/<file>.md actually exists', () => {
  // The mirror failure: a dispatch table promising a file that was renamed or
  // never written sends a session to load nothing.
  const skillsDir = path.join(root, 'skills');
  const missing = [];
  for (const skill of fs.readdirSync(skillsDir)) {
    const skillMd = path.join(skillsDir, skill, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    const hub = fs.readFileSync(skillMd, 'utf8');
    // Only SAME-SKILL links. A cross-skill pointer is written
    // `hiveku-web-agency/references/forms.md` and resolves against THAT skill, so
    // the leading `/` must exclude it or every cross-skill reference reads as
    // dangling. Both forms are checked, just against the right directory.
    for (const m of hub.matchAll(/(?<![/\w-])references\/([A-Za-z0-9._-]+\.md)/g)) {
      const p = path.join(skillsDir, skill, 'references', m[1]);
      if (!fs.existsSync(p)) missing.push(`${skill}/SKILL.md points at missing references/${m[1]}`);
    }
    for (const m of hub.matchAll(/([a-z0-9-]+)\/references\/([A-Za-z0-9._-]+\.md)/g)) {
      const p = path.join(skillsDir, m[1], 'references', m[2]);
      if (!fs.existsSync(p)) missing.push(`${skill}/SKILL.md points at missing ${m[1]}/references/${m[2]}`);
    }
  }
  assert.deepEqual(missing, [], `dangling reference links:\n  ${missing.join('\n  ')}`);
});

test('/hiveku:code turns a Webflow project away to /hiveku:webflow before step 1', () => {
  // sites_list returns the external rows too (external_platform,
  // external_website_url on every row, no project_type filter), and a Webflow
  // project has no files. cms.md and the web hub already route those rows to
  // /hiveku:webflow; code.md did not, so an agent asked to work on a Webflow
  // site went to step 2 and pulled an empty tree.
  const code = fs.readFileSync(path.join(root, 'commands', 'code.md'), 'utf8');
  const stepOne = code.indexOf('**1. Pick the project.**');
  assert.ok(stepOne > 0, 'commands/code.md no longer has a "**1. Pick the project.**" step to guard');
  const head = code.slice(0, stepOne);
  assert.ok(head.includes('/hiveku:webflow'), 'commands/code.md must send Webflow projects to /hiveku:webflow before step 1');
  assert.ok(head.includes('external_platform'), 'commands/code.md must name the sites_list column (external_platform) that marks a project as external');
});
