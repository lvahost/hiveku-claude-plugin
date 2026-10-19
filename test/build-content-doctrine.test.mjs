/**
 * Content can break a build (N12, part 3): the plugin's build and CMS guidance.
 *
 * A site converted from Webflow stopped building because one CMS item had no
 * web address saved (Next.js generateStaticParams, error E617). The plugin's
 * build guidance read every red build as code, so a session patched the route
 * to skip the bad item, or told the client to "add a slug", a field the
 * editor never shows them. The coder agents (hiveku_agent_server
 * app/routes/agent.py, "For build errors"), the builder's build-error hint and
 * the MCP tool texts (hiveku-mcp-api-server project_build_error_get,
 * cms_write_entry, project_test_build) carry the rule; this pins the plugin's
 * copy of it:
 *   - a missing page parameter usually means an item lacks the value: check
 *     the items first, in every list;
 *   - the route is wrong only on "received number", or when every item
 *     already has the value as a string;
 *   - repair through the CMS tools: cms_write_entry replaces the whole item,
 *     so read it and write it back with all its fields plus the missing value;
 *   - never patch a route to skip a bad item, never hand-edit a generated
 *     reader, and a <slug>.draft.json file is not an item;
 *   - test-build before saying it is fixed;
 *   - the client hears the editor's words: never "add a slug", and never
 *     slug, wfOrder, file names, E617 or generateStaticParams.
 *
 * Run against the prose before it changed (2026-10-19): 4 failed, 1 passed,
 * the "add a slug" sweep, a guard with nothing to catch yet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Prose wraps at ~100 columns, so compare with whitespace collapsed. */
const flat = (text) => text.replace(/\s+/g, ' ');

const REFERENCE = 'skills/hiveku-web-agency/references/build-and-deploy.md';
const CMS = 'commands/cms.md';
const DEPLOY = 'commands/deploy.md';

/** Every markdown file a session can load: commands, agents, skills and their references. */
function proseFiles() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(path.join(root, dir))) return;
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.md')) out.push(rel);
    }
  };
  for (const d of ['commands', 'agents', 'skills']) walk(d);
  return out;
}

function assertIncludes(text, tokens, label) {
  const t = flat(text);
  for (const token of tokens) assert.ok(t.includes(token), `${label} lacks: ${token}`);
}

test('build-and-deploy.md: Rule 29a carries the whole rule', () => {
  const t = flat(read(REFERENCE));
  const at = t.indexOf('**Rule 29a.');
  assert.ok(at > 0, `${REFERENCE} has no Rule 29a`);
  const rule = t.slice(at, t.indexOf('## 6.', at));
  assertIncludes(rule, [
    'A missing page parameter is usually CONTENT, not code: check the items first.',
    '`generateStaticParams`',
    'E617',
    'If the error says "received number", or every item already has the value as a string',
    'Check EVERY collection (list) that feeds a page with a parameter, not only the one in the error',
    'is not an item',
    '`cms_write_entry` REPLACES the whole item',
    'all its fields plus the missing value',
    'Never patch one route to skip a bad item',
    'hand-edit a generated reader',
    '`project_test_build({ project_id, use_db_state: true })`',
    "Tell the client in the editor's words",
    'Never "add a slug"',
    'do not name slug, wfOrder, file names, E617 or generateStaticParams to them',
  ], `${REFERENCE} Rule 29a`);
  assert.ok(
    rule.includes('`<slug>.draft.json` (or `.draft.mdx`) file holds unpublished edits of the item beside it; it is not an item'),
    'a draft file is unpublished edits, not an item',
  );
});

test('build-and-deploy.md: the short list, the oracle table, Class 3 and the quick reference point at Rule 29a', () => {
  const t = flat(read(REFERENCE));
  const shortList = t.slice(t.indexOf('## The short list'), t.indexOf('## 1.'));
  assertIncludes(shortList, ['Do NOT patch a route around a CMS item, or ask the client to "add a slug".', '(Rule 29a)'], 'the short list');
  assertIncludes(t, ['omit `session_id` for the most recent failed build that is not a test build'], 'the oracle table');
  const classThree = t.slice(t.indexOf('**Class 3'), t.indexOf('**Class 4'));
  assertIncludes(classThree, ['except a missing page parameter', '(Rule 29a)'], 'Rule 48 Class 3');
  const quick = t.slice(t.indexOf('## Diagnosis quick reference'));
  assertIncludes(quick, ['**Missing page parameter** (`generateStaticParams`, E617)', '(Rule 29a)'], 'the diagnosis quick reference');
});

test('/hiveku:cms: the write replaces the whole item, a draft file is not an item, and a content build failure is repaired here', () => {
  assertIncludes(read(CMS), [
    'the write REPLACES the whole item',
    '`cms_read_entry` it and write it back with all its fields plus that value',
    'unpublished edits, not a separate item',
    '5. A BUILD THAT FAILS ON CONTENT',
    'usually means an item lacks the value',
    'EVERY collection that feeds a page with a parameter',
    '"received number"',
    'never patch a route to skip an item or hand-edit a generated reader',
    'Test-build before calling it fixed',
    "editor's words",
    'never ask them to "add a slug"',
    'never name slug, wfOrder, file names, E617 or generateStaticParams to them',
  ], CMS);
});

test('/hiveku:deploy: a red build on a missing page parameter goes to the items, not the code', () => {
  const t = flat(read(DEPLOY));
  const step = t.slice(t.indexOf('7. IF IT FAILS'), t.indexOf('8. REGRESSION'));
  assertIncludes(step, [
    'A missing page parameter (`generateStaticParams`, E617) usually means a CMS item lacks the value, not that the code is wrong',
    'Rule 29a',
  ], `${DEPLOY} step 7`);
});

test('no prose file asks the client to add a slug', () => {
  // The phrase may appear only as a prohibition ("never ... add a slug").
  const offenders = [];
  for (const rel of proseFiles()) {
    for (const sentence of flat(read(rel)).split(/(?<=[.!?])\s+/)) {
      if (/\badd (?:a|the) slug\b/i.test(sentence) && !/\b(?:never|not)\b/i.test(sentence)) {
        offenders.push(`${rel}: ${sentence.slice(0, 160)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `prose that tells the client to add a slug:\n  ${offenders.join('\n  ')}`);
});
