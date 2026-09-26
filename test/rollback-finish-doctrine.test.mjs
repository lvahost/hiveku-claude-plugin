/**
 * How the plugin's prose finishes a rollback that did not finish, and how it
 * names the head an apply sends (versions program, Wave 3).
 *
 * The MCP tool (hiveku-mcp-api-server src/tools/versions-tools.ts,
 * project_vcs_rollback) has three cases for 409 rollback_incomplete:
 *   - files WERE written, so never "nothing changed";
 *   - the answer's head_commit_id is the dry run's head or saved_before.id:
 *     apply again with expected_head_commit_id = THAT id and without
 *     expected_live_fingerprint;
 *   - any other head: someone else saved, so a new dry run and a new yes.
 * The plugin said "run it again with the error's head_commit_id" with no
 * condition, which re-applies over someone else's save without showing it.
 * It also said "the dry run's expected_head_commit_id", a field the dry run
 * does not return (it returns head_commit_id).
 *
 * Wave 3c: a re-send after a timeout can answer 409 branch_changed although
 * files were written (the first run finished, or stopped after its "Saved
 * before rollback" version), so that answer never reads as "nothing changed"
 * and the prose says how to finish; and rollback_incomplete is told by page or
 * count, never by relaying its error text (which lists file paths).
 *
 * Wave 3c review: "Saved before rollback" is the name every rollback's
 * save-first version gets (a teammate's dashboard rollback, an AI-turn Undo),
 * and the timeout path has no saved_before.id to anchor on. So a re-send's
 * branch_changed finishes on the same yes only when that version is the ONLY
 * one newer than the dry run's head; anything else is a new dry run and a new
 * yes, and branch_changed's "never re-apply unseen" names that one exception.
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

const ROLLBACK = 'commands/rollback.md';
const REFERENCE = 'skills/hiveku-web-agency/references/vcs-checkpoints-branch-previews.md';

/** The three cases, in the words each of the two full descriptions must carry. */
function assertThreeCases(text, label) {
  const t = flat(text);
  for (const token of [
    '409 `rollback_incomplete` (Your site only',
    'files WERE written',
    'never',
    "when the answer's `head_commit_id` is the dry run's `head_commit_id` or `saved_before.id` (the rollback's own \"Saved before rollback\" version)",
    "apply again with `expected_head_commit_id` set to THIS answer's `head_commit_id` and without `expected_live_fingerprint`",
    // Tied to the head: the timeout bullet's "Anything else means someone
    // else saved as well" must not stand in for this case.
    'other `head_commit_id` means someone else saved as well',
  ]) {
    assert.ok(t.includes(token), `${label} lacks: ${token}`);
  }
  assert.match(t, /empty(?: `failed`)? means every file was put back but the new version was not recorded/, `${label}: an empty failed[] is explained`);
  assert.match(t, /other `head_commit_id` means someone else saved as well[,:] (?:so )?run (?:a new|the) dry run(?: again)?/, `${label}: another head means a new dry run`);
}

/** Phrasings that re-apply with the error's head unconditionally. */
const OLD_FINISH = [
  /run it again with the error's `head_commit_id`/,
  /Run the same apply again with `expected_head_commit_id` set to that `head_commit_id`/,
];

/**
 * The rollback_incomplete error text lists up to five raw file paths
 * (hiveku_builder src/lib/vcs/rollback.ts, RollbackIncompleteError via
 * describePathList), so "relay the error text" puts paths in front of the
 * person. The prose says what happened by page or count instead.
 */
function assertNoRelayedErrorText(text, label) {
  const t = flat(text);
  assert.doesNotMatch(t, /relay (?:the|its) error text/, `${label} relays error text that can list file paths`);
}

/**
 * A timed-out apply that is re-sent: the builder replays only a cached 200,
 * and only while nothing was saved since (versionStillCurrent); a
 * rollback_incomplete or a 5xx is never cached, so the re-send runs again and
 * can answer 409 branch_changed although files WERE written (the first run
 * finished, or stopped after its "Saved before rollback" version). The prose
 * must not promise "that run's own answer" unqualified, must never let that
 * branch_changed read as "nothing changed", and must say how to finish.
 * `head` is how the text names the dry run's head ("the dry run's" or "the
 * preview's").
 */
function assertTimeoutReSend(text, label, head = "the dry run's") {
  const t = flat(text);
  for (const token of [
    'only when it succeeded and nothing was saved since',
    `a version newer than ${head} \`head_commit_id\` whose \`rolled_back_to\` is the target means it finished`,
    'If the re-send answers 409 `branch_changed`, the first run may have finished or stopped part way, so never say nothing changed: read `project_vcs_history`.',
    `A "Saved before rollback" version at the top (the \`branch_changed\` answer's \`head_commit_id\`) that is the ONLY version newer than ${head} \`head_commit_id\` means it stopped part way: finish it as for \`rollback_incomplete\` (apply with that \`head_commit_id\` as \`expected_head_commit_id\`, without \`expected_live_fingerprint\`, on the same yes).`,
    `Anything else, including a "Saved before rollback" version with other versions between it and ${head} \`head_commit_id\`, means someone else saved as well: run a new dry run and ask again.`,
  ]) {
    assert.ok(t.toLowerCase().includes(token.toLowerCase()), `${label} lacks: ${token}`);
  }
  // Any "Saved before rollback" at the top, whoever made it, finished on the same yes.
  assert.doesNotMatch(t, /version at the top \(the `branch_changed` answer's `head_commit_id`\) means it stopped part way/, `${label}: finish not tied to the dry run's head`);
  // The unqualified replay promise, and a History check any earlier rollback to
  // the same target would also satisfy.
  assert.doesNotMatch(t, /then call again\) and that run's own answer once it is done/, `${label}: unqualified replay`);
  assert.doesNotMatch(t, /then its own answer\)/, `${label}: unqualified replay`);
  assert.doesNotMatch(t, /a (?:new )?version whose `rolled_back_to` is the target/i, `${label}: History check not tied to the dry run's head`);
}

/**
 * branch_changed never re-applies with the new head unseen, and names the one
 * exception the timeout bullet makes (finishing this same rollback), so the two
 * bullets do not contradict each other.
 */
function assertNoUnseenReapply(text) {
  assert.ok(
    flat(text).includes('Never re-apply with the new head without showing the person, except to finish this same rollback after a timeout, as described below.'),
    'branch_changed never re-applies unseen, and names the one exception the timeout bullet makes',
  );
}

test('rollback: rollback_incomplete carries the MCP tool\'s three cases', () => {
  assertThreeCases(read(ROLLBACK), ROLLBACK);
  const t = flat(read(ROLLBACK));
  assert.ok(t.includes('Re-sending the first apply unchanged is refused as `branch_changed` once `saved_before` is set.'));
  assert.ok(t.includes('show it to the person, and apply with its `head_commit_id` only on a new yes'));
  assertNoUnseenReapply(read(ROLLBACK));
  // Say what happened in plain words; the error text can list file paths.
  assertNoRelayedErrorText(read(ROLLBACK), ROLLBACK);
  assert.ok(
    t.includes('say what happened in plain words (by page or count), not by repeating the error text, which can list file paths'),
    'rollback_incomplete is told by page or count, not by the error text',
  );
});

test('rollback: branch_changed says "nothing changed" only outside a re-send after a timeout', () => {
  const t = flat(read(ROLLBACK));
  assert.ok(t.includes('someone saved in between. Nothing changed (unless it answers a re-send after a timeout: see below).'));
  assert.doesNotMatch(t, /someone saved in between\. Nothing changed\. /);
});

test('the VCS reference carries the same three cases', () => {
  assertThreeCases(read(REFERENCE), REFERENCE);
  assert.match(
    flat(read(REFERENCE)),
    /409 `branch_changed` \(someone saved since: re-run the dry run and ask again; when it answers a re-send after a timeout, see below\)/,
  );
  assertNoRelayedErrorText(read(REFERENCE), REFERENCE);
});

test('a 524 or a timeout on an apply is re-sent or checked in History, never re-dry-run first', () => {
  const r = flat(read(ROLLBACK));
  assert.ok(r.includes('A 524 or a timeout on the apply does NOT mean it failed'));
  assert.ok(r.includes('Call again with exactly the same arguments'));
  assert.ok(r.includes('409 `idempotency_pending`'));
  assert.ok(r.includes('Do not start a new dry run until you know.'));
  assertTimeoutReSend(read(ROLLBACK), ROLLBACK);
  const ref = flat(read(REFERENCE));
  assert.ok(ref.includes('A 524 or a timeout on an apply does not mean it failed: re-send the identical call'));
  assert.doesNotMatch(ref, /timeout on an apply is not a failure/, 'the reference does not read as "it succeeded"');
  assert.ok(ref.includes('before any new dry run'));
  assertTimeoutReSend(read(REFERENCE), REFERENCE);
});

test('no prose finishes rollback_incomplete with the error\'s head unconditionally', () => {
  const offenders = proseFiles().filter((f) => OLD_FINISH.some((re) => re.test(flat(read(f)))));
  assert.deepEqual(offenders, []);
  // Every other file that names rollback_incomplete says files were written and
  // defers to the full description instead of restating a shorter rule.
  for (const f of proseFiles()) {
    const t = flat(read(f));
    if (!t.includes('rollback_incomplete') || f === ROLLBACK || f === REFERENCE) continue;
    assert.match(t, /rollback_incomplete` means files WERE written: finish it as `\/hiveku:rollback` says/, f);
  }
});

test('the apply names the dry run field it sends: head_commit_id as expected_head_commit_id, plus the fingerprint on Your site', () => {
  // The dry run returns head_commit_id and live_fingerprint; "the dry run's
  // expected_head_commit_id" names a field that does not exist.
  const offenders = proseFiles().filter((f) => /(dry run|preview)'s `expected_head_commit_id`/.test(flat(read(f))));
  assert.deepEqual(offenders, []);
  for (const f of ['skills/hiveku-orient/SKILL.md', 'skills/hiveku-web-agency/SKILL.md']) {
    const t = flat(read(f));
    assert.ok(
      t.includes("the dry run's `head_commit_id` as `expected_head_commit_id` (on Your site also its `live_fingerprint` as `expected_live_fingerprint`)"),
      `${f} names both fields the apply sends`,
    );
  }
});

test('negative control: the old wording fails the checks above', () => {
  const oldRollback =
    '   - 409 `rollback_incomplete` (`applied`, `failed`, `head_commit_id`): the files WERE written but\n' +
    '     the rollback did not finish. Run the same apply again with `expected_head_commit_id` set to\n' +
    '     that `head_commit_id` to finish it.\n';
  assert.throws(() => assertThreeCases(oldRollback, 'old rollback.md'));
  assert.ok(OLD_FINISH.some((re) => re.test(flat(oldRollback))));
  const oldReference =
    '409 `rollback_incomplete` (files written;\n  run it again with the error\'s `head_commit_id`), 409 `content_unavailable`';
  assert.throws(() => assertThreeCases(oldReference, 'old reference'));
  assert.ok(OLD_FINISH.some((re) => re.test(flat(oldReference))));
  // Dropping the "someone else saved" case alone is caught too.
  assert.throws(() =>
    assertThreeCases(read(ROLLBACK).replace(/Any other\s+`head_commit_id` means someone else saved as well/, 'Otherwise'), 'no third case'),
  );
  const oldOrient = "apply only on an explicit yes, with the dry run's `expected_head_commit_id`. Then";
  assert.match(flat(oldOrient), /(dry run|preview)'s `expected_head_commit_id`/);
  // The Wave 2 wording this round replaced fails the new checks.
  assert.throws(() =>
    assertNoRelayedErrorText('the files WERE written, so never tell the person nothing changed; relay the\n     error text.', 'old relay'),
  );
  const oldTimeout =
    '   - A 524 or a timeout on the apply does NOT mean it failed: a big rollback can outlast the edge\'s\n' +
    '     limit of about 100 seconds and keep running. Call again with exactly the same arguments: an\n' +
    '     identical call answers 409 `idempotency_pending` while the first run is still going (wait,\n' +
    '     then call again) and that run\'s own answer once it is done, so it never rolls back twice. When\n' +
    '     unsure, read `project_vcs_history` first: a new version whose `rolled_back_to` is the target\n' +
    '     means it finished. Do not start a new dry run until you know.\n';
  assert.throws(() => assertTimeoutReSend(oldTimeout, 'old rollback timeout'));
  const oldRefTimeout =
    'A 524 or a timeout on an apply is not a failure: re-send the\n' +
    '  identical call (409 `idempotency_pending` while the first still runs, then its own answer) or\n' +
    '  read `project_vcs_history` (a version whose `rolled_back_to` is the target means it finished)\n' +
    '  before any new dry run.';
  assert.throws(() => assertTimeoutReSend(oldRefTimeout, 'old reference timeout'));
  // Adding only the branch_changed sentence, and keeping the unqualified
  // replay promise, still fails.
  assert.throws(() =>
    assertTimeoutReSend(
      read(ROLLBACK).replace(/only when it\s+succeeded and nothing was saved since/, 'once it is done'),
      'unqualified replay',
    ),
  );
  // The Wave 3c finish rule: any "Saved before rollback" at the top, not tied
  // to the dry run's head, fails in both files.
  for (const f of [ROLLBACK, REFERENCE]) {
    const unanchored = read(f).replace(
      /\)\s+that\s+is\s+the\s+ONLY\s+version\s+newer\s+than\s+the\s+dry\s+run's\s+`head_commit_id`\s+means\s+it\s+stopped\s+part\s+way/,
      ') means it stopped part way',
    );
    assert.notEqual(unanchored, read(f), `${f}: the anchor was found and removed`);
    assert.throws(() => assertTimeoutReSend(unanchored, `${f} unanchored`));
  }
  // The Wave 3c branch_changed bullet, with no exception for the finish.
  const noException = read(ROLLBACK).replace(/, except to finish this\s+same rollback after a timeout, as described below\./, '.');
  assert.notEqual(noException, read(ROLLBACK), 'the exception was found and removed');
  assert.throws(() => assertNoUnseenReapply(noException));
});
