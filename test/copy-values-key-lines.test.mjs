/**
 * The texts that teach keys say what the server-side copies do, and nothing untrue about values (2026-11-28).
 *
 * The orient skill, /hiveku:env and the web agency's secrets reference each teach the key lines the MCP tool texts
 * carry: never ask for a key in the chat; a key several sites use goes in the account's global variables with a note;
 * choose a key by its name and note; to share a site's key, copy it into a group and then link the group or pick the
 * name; a copy from a group into a site becomes that site's own value, which later group changes never reach, so a
 * site that should follow the group is linked or picks the name instead; a Production value stays in Production.
 *
 * The own-value line is pinned because it was missing once: without it, an agent shares a global key by copying it,
 * and the site keeps the old value after the group's key is rotated. "Values are never returned, to you or anyone" is
 * pinned out: a person can approve project_secrets_reveal for a site's value that is not hidden.
 *
 * Run: node --test 'test/*.test.mjs'
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
/** A phrase as a pattern whose spaces match any run of spaces and line breaks (each text wraps at its own width). */
const phrase = (words) => new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
const TEXTS = {
  orient: read('skills/hiveku-orient/SKILL.md'),
  env: read('commands/env.md'),
  secrets: read('skills/hiveku-web-agency/references/custom-code-cdn-secrets.md'),
};

test('each text teaches the copy into a group, then a link or a pick', () => {
  for (const [name, text] of Object.entries(TEXTS)) {
    assert.match(text, phrase('copy it into a group with `env_group_copy_from_site`, then link the group (`env_group_link`) or pick the name (`env_group_pick`)'), `${name}: copy into a group, then link or pick`);
  }
});

test('each text says a copy from a group becomes the site\'s own value, which later group changes never reach', () => {
  for (const [name, text] of Object.entries(TEXTS)) {
    const site = name === 'env' ? 'this' : 'that';
    assert.match(text, phrase(`(\`project_secrets_copy_from_group\`) makes it ${site} site's own value, which later group changes never reach, so to follow the group, link or pick instead`), `${name}: the own-value line`);
  }
});

test('each text says to choose a key by its name and note, and keeps a Production value in Production', () => {
  for (const [name, text] of Object.entries(TEXTS)) {
    assert.match(text, phrase('Choose a key by its name and note'), `${name}: choose by name and note`);
    assert.match(text, /global\s+variables/, `${name}: global variables`);
    assert.match(text, phrase('with a note on each name saying what it is for'), `${name}: a note on each name`);
    assert.match(text, /Production value (stays in Production|is never copied into another environment)/, `${name}: Production stays`);
    assert.match(text, /never through the chat|never ask for it in chat/, `${name}: never in the chat`);
  }
});

test('no text says values are never returned to anyone: a person can approve a reveal', () => {
  for (const [name, text] of Object.entries(TEXTS)) {
    assert.doesNotMatch(text, /to you\s+or anyone/, `${name}: "to you or anyone" is not true`);
  }
  assert.match(TEXTS.orient, phrase("these reads never return a value. A site's value that is not hidden reaches you only through `project_secrets_reveal`, after a person approves it; a hidden value, and a group's, never does"));
  assert.match(TEXTS.env, phrase('the listing above and the group reads (`env_group_get`) never return a value'));
});
