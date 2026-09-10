import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rowsOf,
  resolvableParam,
  resolveTool,
  harvestCandidates,
  assertSuppliersAreReadOnly,
  SUPPLIERS,
} from '../lib/sweep-resolvers.mjs';

/**
 * Every scenario below is one the live server actually produced while this was
 * being built, not a shape imagined for the test. The two that matter most:
 *
 *   - A real project_id from list_projects 404s on all eight project_* tools
 *     tried. Same department, real id, wrong namespace.
 *   - Seven of nine seo_* tools accept seo_list_projects' id; seo_project_get
 *     and seo_gtm_install_status want a WEBSITE project and 404 on it.
 *
 * So the resolver probes and keeps what answers. These tests pin the two
 * things that make probing safe: a rejected probe is never a failure, and a
 * parameter with no rows anywhere is `unavailable` rather than uncovered.
 */

const ok = (detail = '{"data":[]}') => ({ status: 'ok', detail });
const notFound = () => ({ status: 'error', detail: '{"error":"Project not found","status":404}' });

test('rowsOf reads the usual envelope and survives shape drift', () => {
  assert.deepEqual(rowsOf({ data: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b']);
  assert.deepEqual(rowsOf({ results: [{ id: 'c' }] }), ['c']);
  assert.deepEqual(rowsOf([{ id: 'd' }]), ['d']);
  // Rows without a usable id contribute nothing rather than injecting undefined
  // into a probe, which would call the tool with {project_id: undefined}.
  assert.deepEqual(rowsOf({ data: [{ name: 'no id' }, { id: 7 }, { id: '' }] }), []);
  assert.deepEqual(rowsOf(null), []);
  assert.deepEqual(rowsOf({ data: 'not an array' }), []);
});

test('only a single unmet required id is resolvable', () => {
  assert.equal(resolvableParam({ required: ['project_id'] }), 'project_id');
  assert.equal(resolvableParam({ required: ['connection_id'] }), 'connection_id');
  // Two ids would need the cross product, and a wrong pairing is
  // indistinguishable from a broken tool in the report.
  assert.equal(resolvableParam({ required: ['project_id', 'page_id'] }), null);
  // Nothing supplies these, so they stay honestly uncovered.
  assert.equal(resolvableParam({ required: ['keyword'] }), null);
  assert.equal(resolvableParam({ required: [] }), null);
  assert.equal(resolvableParam(undefined), null);
});

test('probing keeps the candidate that answers and ignores the ones that 404', async () => {
  // The seo_list_keywords case: the PM id is tried first and rejected, the SEO
  // id answers. Exactly the sequence observed live.
  const tried = [];
  const res = await resolveTool({
    tool: 'seo_list_keywords',
    schema: { required: ['project_id'] },
    candidates: new Map([['project_id', ['pm-id', 'seo-id']]]),
    call: async (_t, args) => {
      tried.push(args.project_id);
      return args.project_id === 'seo-id' ? ok('{"data":[{"id":"kw1"}]}') : notFound();
    },
  });
  assert.equal(res.status, 'ok');
  assert.equal(res.via, 'seo-id');
  assert.equal(res.probes, 2);
  assert.deepEqual(tried, ['pm-id', 'seo-id']);
});

test('a probe that every candidate rejects stays needs-params, never an error', async () => {
  // seo_project_get: a real id from every supplier we have, and it wants a
  // website project none of them lists. We did not establish the right id, so
  // we cannot tell a wrong namespace from a broken tool — and guessing "error"
  // is precisely the 358-fake-incident failure this module exists to avoid.
  const res = await resolveTool({
    tool: 'seo_project_get',
    schema: { required: ['project_id'] },
    candidates: new Map([['project_id', ['pm-id', 'seo-id']]]),
    call: async () => notFound(),
  });
  assert.equal(res.status, 'needs-params');
  assert.equal(res.probes, 2);
});

test('a parameter with no rows anywhere is unavailable, not uncovered', async () => {
  // The 44 project_* tools on an account with no website project. No argument
  // would help, so counting them as uncovered inflates a ceiling that cannot move.
  let called = false;
  const res = await resolveTool({
    tool: 'project_checkpoint_list',
    schema: { required: ['project_id'] },
    candidates: new Map([['project_id', []]]),
    call: async () => { called = true; return ok(); },
  });
  assert.equal(res.status, 'unavailable');
  assert.equal(res.probes, 0);
  assert.equal(called, false, 'must not spend a call probing a parameter with no candidates');
});

test('harvest dedupes suppliers that return the same row', async () => {
  // list_projects and pm_projects_list demonstrably return the SAME PM project
  // on a live account. Probing the identical id twice buys nothing and doubles
  // the cost of every unresolved tool.
  const calls = [];
  const candidates = await harvestCandidates({
    call: async (tool) => {
      calls.push(tool);
      if (tool === 'seo_list_projects') return { data: [{ id: 'seo-1' }] };
      if (tool === 'list_projects') return { data: [{ id: 'pm-1' }] };
      if (tool === 'pm_projects_list') return { data: [{ id: 'pm-1' }] };
      return { data: [] };
    },
  });
  assert.deepEqual(candidates.get('project_id'), ['seo-1', 'pm-1']);
  assert.ok(calls.includes('seo_list_projects'));
});

test('a supplier that throws is skipped, not fatal', async () => {
  const candidates = await harvestCandidates({
    call: async (tool) => {
      if (tool === 'seo_list_projects') throw new Error('no connection');
      if (tool === 'list_projects') return { data: [{ id: 'pm-1' }] };
      return { data: [] };
    },
  });
  assert.deepEqual(candidates.get('project_id'), ['pm-1']);
});

test('every declared supplier is read-only', () => {
  // Suppliers are called before the sweep's per-tool gate, so they are the one
  // path that could reach a mutating tool unguarded.
  const names = Object.values(SUPPLIERS).flat().map((s) => s.tool);
  assert.ok(names.length > 0);
  assert.doesNotThrow(() => assertSuppliersAreReadOnly(() => true));
  assert.throws(
    () => assertSuppliersAreReadOnly((t) => t !== names[0]),
    /not on the read-only list/,
  );
});
