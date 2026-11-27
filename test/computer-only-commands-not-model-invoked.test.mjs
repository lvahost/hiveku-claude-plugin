/**
 * The eleven commands that change this computer, its keys or its bindings are started only by the person,
 * never by the agent on its own (phone chats Wave B, design section 9.5, the plugin follow-up):
 *
 *   - each has `disable-model-invocation: true` in its frontmatter, so the agent cannot start one by itself,
 *     whatever another command's body or a phone-run message says; at the computer it asks the person to type it;
 *   - no other command has it, so this list stays the one place that decides;
 *   - remember.md asks the person to run the knowledge pull rather than running it itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COMMANDS = path.join(ROOT, 'commands');

const PERSON_ONLY = ['bind', 'connect', 'doctor', 'env', 'fleet', 'knowledge', 'pull', 'reports', 'setup', 'unbind', 'update'];

const frontmatter = (text) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'a command starts with frontmatter');
  return match[1].split('\n');
};

test('the eleven computer-only commands are never started by the agent', async () => {
  for (const name of PERSON_ONLY) {
    const lines = frontmatter(await fs.readFile(path.join(COMMANDS, `${name}.md`), 'utf8'));
    assert.ok(lines.includes('disable-model-invocation: true'), `${name}.md: disable-model-invocation: true`);
  }
});

test('no other command carries the key, so the list above is the one place that decides', async () => {
  const files = (await fs.readdir(COMMANDS)).filter((file) => file.endsWith('.md'));
  const carrying = [];
  for (const file of files) {
    const lines = frontmatter(await fs.readFile(path.join(COMMANDS, file), 'utf8'));
    if (lines.some((line) => line.startsWith('disable-model-invocation'))) {
      carrying.push(file.replace(/\.md$/, ''));
    }
  }
  assert.deepEqual(carrying.sort(), [...PERSON_ONLY].sort());
});

test('remember asks the person to run the knowledge pull', async () => {
  const text = await fs.readFile(path.join(COMMANDS, 'remember.md'), 'utf8');
  assert.match(text, /ask the person to run `\/hiveku:knowledge pull`/);
  assert.doesNotMatch(text, /Then run `\/hiveku:knowledge pull`/);
});
