/**
 * Ranking safety: what the search offers FIRST.
 *
 * These exist because a blind A/B review of a scoring change caught the search
 * putting destructive tools at the top for ordinary questions —
 * `project_secrets_delete` at rank 1 for "secrets for a project" (it wipes every
 * secret when `key` is omitted) and `site_delete` at rank 3 for a question about
 * a URL. Both scored well honestly: their names match the words asked, and
 * nothing in the scoring knew one of them was irreversible.
 *
 * Ranking is not a permission boundary — tools/call is never filtered, and the
 * real rail is a scoped key plus the approval hook. But a list is read top-down,
 * and some sessions run with prompts off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTools, loadIndex } from '../lib/tool-index.mjs';

const names = (q, n = 5) => searchTools(q, { limit: n }).map((t) => t.name);

test('★ an informational query does not put a destructive tool first', () => {
  for (const q of [
    'secrets for a project',
    'what is the dev url for this site',
    'list contacts',
    'email campaign stats',
    'page speed',
  ]) {
    const top = names(q, 1)[0];
    if (!top) continue;
    assert.ok(
      !/(^|_)(delete|destroy|wipe|purge|revoke)(_|$)/.test(top),
      `"${q}" offered ${top} first`,
    );
  }
});

test('the read sibling outranks its own delete', () => {
  const r = names('secrets for a project');
  const list = r.indexOf('project_secrets_list');
  const del = r.indexOf('project_secrets_delete');
  assert.ok(list !== -1, `project_secrets_list missing: ${r.join(', ')}`);
  if (del !== -1) assert.ok(list < del, `delete (${del}) ranked above list (${list})`);
});

test('★ asking to delete still finds the delete tool', () => {
  // The penalty must be intent-aware, or it becomes a censor: someone who says
  // "delete" cannot be handed only readers.
  const r = names('delete a site', 5);
  assert.ok(r.includes('site_delete'), `site_delete missing from: ${r.join(', ')}`);
});

test('destructive tools remain FINDABLE, just not first', () => {
  // Demotion is not hiding. A tool the search will never show is a tool the
  // session will conclude does not exist.
  const r = searchTools('project secrets delete', { limit: 5 }).map((t) => t.name);
  assert.ok(r.includes('project_secrets_delete'), `not findable: ${r.join(', ')}`);
});

test('the ranking fixes from the A/B review hold', () => {
  assert.equal(names('development environment url', 1)[0], 'sites_list');
  assert.equal(names('page speed', 1)[0], 'seo_core_web_vitals');
  assert.ok(names('voicemail transcription', 5).includes('voice_call_transcript_get'));
  assert.equal(names('broken links', 1)[0], 'seo_internal_links');
});

test('every indexed tool still scores against its own name', () => {
  // A blanket penalty must never zero a tool out of the catalogue entirely.
  const sample = loadIndex().filter((t) => /_delete$/.test(t.name)).slice(0, 25);
  assert.ok(sample.length > 5);
  for (const t of sample) {
    const hit = searchTools(t.name.replace(/_/g, ' '), { limit: 10 }).map((x) => x.name);
    assert.ok(hit.includes(t.name), `${t.name} unfindable by its own name`);
  }
});
