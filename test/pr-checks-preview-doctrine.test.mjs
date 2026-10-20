/**
 * The checks and the preview Hiveku starts for each open pull request, in the
 * plugin's prose (CI checks plan, steps 4 and 5; builder #1643 and #1648, MCP
 * #252). project_vcs_pr_get carries `checks` (the build and the site's checks
 * on the PR's branch) and `preview` (the live preview of its branch, or why
 * none runs). These tests pin how an agent reads them:
 *   - a review uses `checks` when they are current, reads the whole log by
 *     session, and builds the branch itself only without them;
 *   - the merge line builds the merged result again with "Build before merging";
 *   - an open PR's preview is sent for sign-off; `live_data` is explained and
 *     never answered by starting a preview by hand without the person's yes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Prose wraps at ~100 columns and carries backticks, so compare with both collapsed. */
const flat = (text) => text.replace(/`/g, '').replace(/\s+/g, ' ');

const PR = flat(read('commands/pr.md'));
const REVIEW_PR = flat(read('commands/review-pr.md'));
const REFERENCE = flat(read('skills/hiveku-web-agency/references/vcs-checkpoints-branch-previews.md'));

test('a review reads the checks Hiveku ran on the branch, and builds it itself only without them', () => {
  assert.match(PR, /checks in project_vcs_pr_get is the build and the site's checks \(type check, lint, tests\)/);
  assert.match(PR, /project_test_build_log_get\(\{ project_id, session_id \}\) has the whole log/);
  assert.match(PR, /current: false means it was for an older state of the branch \(a new run starts by itself\)/);
  assert.match(PR, /Without checks, build it yourself: project_test_build\(\{ project_id, use_db_state: true, branch: <source> \}\)/);
  assert.match(REVIEW_PR, /use it when current is true/);
  assert.match(REVIEW_PR, /Otherwise project_test_build\(\{ project_id, use_db_state: true, branch: <source_branch> \}\)/);
});

test('the merge line builds the merged result again, and a failure names the check', () => {
  assert.match(PR, /with "Build before merging" on that the merged result builds and passes the site's checks \(a failure sends it back naming the check/);
  assert.match(REFERENCE, /the merge line builds the merged result again before it merges/);
});

test("an open PR's preview is sent for sign-off; live data is explained, never worked around unasked", () => {
  assert.match(PR, /A preview of the branch starts by itself within a few minutes: project_vcs_pr_get's preview has its url once state is live/);
  assert.match(PR, /live_data: the site's development settings reach a database or key the live site uses, so no preview is started for a PR/);
  assert.match(PR, /DATABASE_URL_DEV/);
  assert.match(PR, /start one by hand only if the person asks knowing that/);
  assert.match(REVIEW_PR, /when preview\.reason is live_data, ask the person first/);
  assert.match(REVIEW_PR, /tear down only a preview you started/);
  assert.match(REFERENCE, /A preview started for a PR is taken down when the PR merges or closes/);
});
