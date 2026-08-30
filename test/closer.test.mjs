/**
 * The session closer - the "persist to memory, reflect in PM" paragraph that
 * ends most commands - must be BYTE-IDENTICAL everywhere it appears.
 *
 * It drifts one word at a time: a command gets a bespoke rewrite of the same
 * advice, then a fix lands in the canonical copy (a renamed tool, a corrected
 * field name) and the drifted copy keeps teaching the old behavior. At the
 * 2026-08-29 sweep, 40 commands carried one byte-exact variant and automate.md
 * carried a lone rewrite - that rewrite was folded into the canonical text.
 * This test pins the canonical bytes so the next drift fails CI instead of
 * shipping.
 *
 * Updating the closer deliberately means: change CANONICAL here, then update
 * every carrier in the same commit. That friction is the point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The distinctive opening phrase that marks a file as a closer carrier.
const OPENER = 'Finish every session of work the same way:';

// The canonical paragraph, byte-exact (one line in every carrier).
const CANONICAL =
  "Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: \"<dept>\" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: \"memory\", name: \"<dept>\", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.";

// Commands whose contract REQUIRES the closer - they may not drop it either.
const MUST_CARRY = ['ppc-report.md', 'ppc-optimize.md', 'ppc-onboard.md', 'ppc-shift.md'];

test('the pinned canonical closer is self-consistent', () => {
  assert.ok(CANONICAL.startsWith(OPENER), 'CANONICAL must start with OPENER');
  assert.ok(
    CANONICAL.endsWith('Hiveku, not this folder, is the source of truth.'),
    'CANONICAL lost its terminator sentence',
  );
  assert.ok(!CANONICAL.includes('\n'), 'the closer is a single line in every carrier');
});

test('every command carrying the closer opener carries the canonical paragraph byte-identical', () => {
  const dir = path.join(root, 'commands');
  const drifted = [];
  let carriers = 0;

  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!text.includes(OPENER)) continue;
    carriers++;
    if (!text.includes(CANONICAL)) drifted.push(`commands/${f}`);
  }

  // If the opener itself is reworded everywhere, this test silently matches
  // nothing - refuse the vacuous pass.
  assert.ok(
    carriers >= 40,
    `only ${carriers} commands carry the closer opener (expected 40+); ` +
      'either commands were deleted or the opener text itself drifted',
  );
  assert.deepEqual(
    drifted,
    [],
    `these commands carry a drifted closer - restore the canonical bytes:\n  ${drifted.join('\n  ')}`,
  );
});

test('the PPC lane commands carry the closer at all', () => {
  // The general test skips a file that dropped the whole paragraph; these four
  // are contractually required to end with it.
  const missing = MUST_CARRY.filter(
    (f) => !fs.readFileSync(path.join(root, 'commands', f), 'utf8').includes(CANONICAL),
  );
  assert.deepEqual(
    missing,
    [],
    `these commands must end with the canonical closer:\n  ${missing.join('\n  ')}`,
  );
});
