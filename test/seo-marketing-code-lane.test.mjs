/**
 * The SEO code lane on the marketing profiles (versions Wave 2).
 *
 * Both marketing profiles carry project_file_save, project_vcs_status,
 * project_vcs_commit and deploy_site, the redirect tools and the whole cms_
 * family; neither carries project_files_bulk_save, a file delete or the build
 * check. On both, project_vcs_commit is VERSION-ONLY: a call carrying files or
 * deletedFiles is refused before it is sent (hiveku-mcp-api-server
 * src/tools/profiles.ts: SEO_SITE_SURFACE_NAMES, VERSION_ONLY_PROFILES).
 *
 * The SEO prose said the opposite ("not visible to a marketing-seo key") and
 * sent marketing code fixes through the bulk save neither profile has, so a
 * marketing session either gave up on a fix it could ship or called a tool it
 * cannot see. These pin both halves: no prose repeats the old claim, and the
 * one-file-at-a-time path is taught where a session loads it.
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

/** Every SEO file a session can load: the skill, its references, the seo-* commands and the analyst. */
function seoProse() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.md')) out.push(rel);
    }
  };
  walk('skills/hiveku-seo-agency');
  for (const f of fs.readdirSync(path.join(root, 'commands'))) {
    if (/^seo-.*\.md$/.test(f)) out.push(path.join('commands', f));
  }
  out.push('agents/hiveku-seo-analyst.md');
  return out;
}

/**
 * The old claim, in the shapes it took. The first pattern needs a tool the
 * marketing profiles DO carry before "not visible", so a true sentence about
 * project_files_search or preview_http_get does not trip it.
 */
const STALE = [
  /(?:`project_\*`|`project_`|cms_|deploy_site|project_vcs_commit|project_file_save\b|code lane|code and redirect lanes|redirect tools|web_crawl)[^.]{0,160}\bnot (?:all )?visible (?:to|on) an? marketing-seo (?:scoped )?key/i,
  /marketing-seo (?:scoped )?key[^.]{0,20}(?:cannot see|the code lane is not visible)/i,
  /marketing-seo (?:scoped )?key,? (?:the )?`?(?:cms_|project_)[^.]{0,80}\bnot visible/i,
  /neither marketing key sees/i,
  /\(not marketing-seo today\)/i,
];
const isStale = (text) => STALE.some((re) => re.test(flat(text)));

test('no SEO prose says the code lane, cms_ or deploy_site is invisible to a marketing key', () => {
  // NEGATIVE CONTROL: every sentence this replaced is caught.
  for (const old of [
    '| `cms_list_collections`, `cms_read_entry`, `cms_write_entry` | LIVE | write | CMS-driven pages; `draft: true` writes the draft shadow; not visible to a marketing-seo key |',
    '| `project_files_search`, `project_files_bulk_get`, `project_files_bulk_save`, `project_vcs_commit`, `deploy_site` | LIVE | write | the code lane for templates; not visible to a marketing-seo key |',
    '`cms_write_entry({ project_id, collection_id, slug, fields })` | full, marketing (not marketing-seo today) | the entry',
    'review, one deploy; never 300 `pages_update` calls. On a marketing-seo key the code lane is not visible: page fields go through',
    '| `project_files_bulk_save`, `project_vcs_commit`, `deploy_site` | LIVE | write | the code lane; not visible to a marketing-seo key |',
    'build, `deploy_site` only after approval. Commit is not live. On a marketing-seo scoped key the `cms_*`, `project_*` and `deploy_site` tools are not visible',
    '`project_redirects_deploy` | LIVE | free; crawl credits for `web_crawl` | `web_crawl` and the code and redirect lanes are not visible to a marketing-seo key today. |',
    '| `project_files_bulk_save`, `project_vcs_commit`, `deploy_site`, `pages_update` | LIVE | write | the code lane and the pages-model write; not all visible to a marketing-seo key |',
    '- TODAY neither marketing key sees `web_crawl`, `web_scrape`, `web_map`, `web_extract`',
    '`project_` (redirects included), `cms_` and `deploy_site` are not visible to a marketing-seo\n   key today.',
    'key", never "does not exist": `web_crawl`, `project_files_search`, `preview_http_get` and the\nredirect tools are not visible to a marketing-seo key today.',
    'full-profile key (`project_*`, `cms_*`, `deploy_site` are not visible to a marketing-seo key: say',
    'real robots.txt is `public/robots.txt` through the code lane. On a marketing-seo key `cms_*`, `project_*` and `deploy_site` are not visible: say "not',
    'marketing-seo key the `cms_*`\n    and `project_*` tools are not visible: say so, use `pages_update` or the implement rail.',
    'credentials; today a marketing-seo key cannot see `project_*`, `cms_*` or `deploy_site`.',
  ]) {
    assert.ok(isStale(old), `the check must catch: ${old}`);
  }
  // A true sentence about a tool the profiles lack is not the old claim.
  assert.ok(!isStale('`project_files_search` and `preview_http_get` are not visible to a marketing-seo key.'));

  const files = seoProse();
  assert.ok(files.length > 20, 'found the SEO prose');
  const offenders = files.filter((f) => isStale(read(f)));
  assert.deepEqual(offenders, [], 'these still say the marketing profiles cannot see the code lane');
});

test('on-page 1.2 teaches the marketing path: one file per save, the version with no files, then deploy', () => {
  const onPage = flat(read('skills/hiveku-seo-agency/references/on-page-optimization.md'));
  const section = onPage.slice(onPage.indexOf('### 1.2 The four write paths'), onPage.indexOf('### 1.3'));
  assert.ok(section.length > 200, 'found section 1.2');
  // The code-level row names both paths, and credits the marketing profiles with it.
  assert.match(section, /full: `project_files_bulk_save` in ONE call/);
  assert.match(section, /marketing and marketing-seo: `project_vcs_status\(\{ project_id, detail: "files" \}\)` before the first save \(the version to go back to, saved first when there is none\) -> `project_file_save\(\{ project_id, file_path, content \}\)` one file per call -> `project_vcs_status\(\{ project_id, detail: "files" \}\)` -> `project_vcs_commit\(\{ project_id, message \}\)` with NO files -> `deploy_site\(\{ project_id, environment: "development", branch: "main" \}\)`/);
  assert.match(section, /\| full, marketing, marketing-seo \(two paths, see below\) \|/);
  // The paragraph: what the profiles lack, the version-only refusal, no empty-file "delete".
  assert.match(section, /\*\*The code lane on a marketing or marketing-seo connection\.\*\*/);
  assert.match(section, /neither carries `project_files_bulk_save`/);
  assert.match(section, /a call carrying `files` or `deletedFiles` is refused before it is sent \(`version_files_not_allowed`\)/);
  assert.match(section, /never save it empty/);
  assert.match(section, /deploy to development first and `fetch_url` the development URL before production/);
  // Development may be set to show another branch: then a development deploy does not carry this
  // change (and versions someone else's branch), so the check proves nothing. `branch: "main"` makes
  // the deploy refuse (409 branch_not_bound) instead of shipping the wrong tree.
  assert.match(section, /Send it as `deploy_site\(\{ project_id, environment: "development", branch: "main" \}\)`: `branch` is a check here, not a selector/);
  assert.match(section, /the call is refused with 409 `branch_not_bound` and ships nothing\. Development is then showing other work and cannot check this change: tell the person, check the saved file with `project_file_get`/);
  assert.match(section, /deploy to production only on the person's explicit yes/);
  assert.match(section, /On a project connected to GitHub \(`project_get` shows `github\.connected`\), `branch` names a GitHub branch instead: leave it out there/);
  // pages_update is not on the catch-all marketing profile; cms_ is on both.
  assert.match(section, /`pages_update\([^)]*\)` \| full, marketing-seo \(the catch-all marketing profile has no `pages_\*`\)/);
  assert.match(section, /`cms_write_entry\([^)]*\)` \| full, marketing, marketing-seo \|/);
});

test('the hub names the marketing site surface and points at the path', () => {
  const hub = flat(read('skills/hiveku-seo-agency/SKILL.md'));
  assert.match(hub, /\*\*The code lane on a marketing or marketing-seo connection\*\*: `project_file_save` one file per call, then `project_vcs_commit\(\{ project_id, message \}\)` with NO files, then `deploy_site`/);
  assert.match(hub, /`deletedFiles` is refused before it is sent \(`version_files_not_allowed`\)/);
  assert.match(hub, /`references\/on-page-optimization\.md` section 1\.2/);
  assert.match(hub, /Not on either: `project_files_bulk_save`/);
  // The robots.txt offer is the one-file save every SEO profile has.
  assert.match(hub, /Offer: `public\/robots\.txt` via the code lane with a reviewed diff \(`project_file_save` of that one file/);
});

test('each reference the critic named teaches the one-file save and the refused version call', () => {
  const refused = /(?:version call|a call) carrying `files` or `deletedFiles` is refused|files or deletions in (?:it|that call) are refused/;
  for (const f of [
    'skills/hiveku-seo-agency/references/on-page-optimization.md',
    'skills/hiveku-seo-agency/references/content-strategy.md',
    'skills/hiveku-seo-agency/references/technical-seo.md',
    'skills/hiveku-seo-agency/references/aeo.md',
    'skills/hiveku-seo-agency/references/seo-change-discipline.md',
  ]) {
    const text = flat(read(f));
    assert.match(text, /`project_file_save`/, `${f} names the one-file save`);
    assert.match(text, refused, `${f} says a version call with files is refused on the marketing profiles`);
    assert.match(
      text,
      /`project_files_bulk_save`[^.|]{0,40}(?:is )?full only|neither carries `project_files_bulk_save`|no bulk save/,
      `${f} says the bulk save is full only`,
    );
  }
});

test('single-file fixes (robots.txt, llms.txt, the sitemap) name the save every SEO profile has', () => {
  // The bulk save is full only; a one-file fix written as bulk_save strands a marketing session.
  const oneFileBulk = /`project_files_bulk_save`\s*(?:`public\/llms\.txt`|as `public\/llms\.txt`|of `public\/llms\.txt`)|robots change ships as `public\/robots\.txt` through `project_files_bulk_save`|robots\.txt`? via the code lane with a reviewed diff \(`project_files_bulk_save`|sitemap\.xml['"], content \}`; save (?:it with|via) `project_files_bulk_save`/;
  // NEGATIVE CONTROL: the sentences this replaced are caught.
  for (const old of [
    'the code lane (`project_files_bulk_save` `public/llms.txt`, `project_vcs_commit`, `deploy_site`, `fetch_url`)',
    'or hand-drafted from the sitemap and the top pages, `project_files_bulk_save` as `public/llms.txt`,',
    '(`project_files_bulk_save` of `public/llms.txt`, `project_vcs_commit`, `deploy_site`, then',
    'a robots change ships as `public/robots.txt` through `project_files_bulk_save`, `project_vcs_commit` and `deploy_site`',
    'Offer: `public/robots.txt` via the code lane with a reviewed diff (`project_files_bulk_save`, `project_vcs_commit`, `deploy_site`).',
    // Recipe 6 step 5 and /hiveku:seo-migration step 6: the generated sitemap is one file.
    "5. `seo_generate_sitemap({ project_id: <website id> })` returns `{ file_path: 'public/sitemap.xml',\n   content }`; save via `project_files_bulk_save`, commit, deploy, `fetch_url` it live, then",
    '6. Sitemap: `seo_generate_sitemap({ project_id: <website id> })` returns `{ file_path:\n   "public/sitemap.xml", content }`; save it with `project_files_bulk_save`, commit, deploy, `fetch_url`',
  ]) {
    assert.match(flat(old), oneFileBulk, `the check must catch: ${old}`);
  }
  const offenders = seoProse().filter((f) => oneFileBulk.test(flat(read(f))));
  assert.deepEqual(offenders, []);
});

test('the marketing code lane records its undo: a version saved before the first save, named for the owner, never "none"', () => {
  // project_vcs_rollback and project_vcs_history are on neither marketing profile. head_commit_id
  // alone is not enough: on a site with no version yet it is null, and with changes pending the
  // first version would hold them and the SEO change together. So the version to go back to is
  // settled BEFORE the first save, saving one when there is none. The owner's list of Your site's
  // versions shows names and dates, so the UNDO line names it by name and time, not by id.
  const discipline = flat(read('skills/hiveku-seo-agency/references/seo-change-discipline.md'));
  const gate1 = discipline.slice(discipline.indexOf('1. **A tested capability on this connection.**'), discipline.indexOf('2. **Explicit ids'));
  assert.ok(gate1.length > 200, 'found gate 1');
  assert.match(gate1, /Undo on these two profiles: `project_vcs_rollback` and `project_vcs_history` are not on them, so settle the version to go back to BEFORE the first save with `project_vcs_status\(\{ project_id, detail: "files" \}\)`/);
  assert.match(gate1, /When `head_commit_id` is null \(`uncommitted_reason` 'no_version_yet'\), `uncommitted` is true, or the reason is 'unknown', tell the person and first save the site as it stands with `project_vcs_commit\(\{ project_id, message \}\)` and NO files/);
  assert.match(gate1, /a 409 `nothing_to_commit` is success and carries `latest_version`\. That version \(`data`, or `latest_version`\) is the version to go back to; only otherwise is it `head_commit_id`, with `last_version\.message` and `last_version\.created_at`/);
  assert.match(gate1, /The new version is `data\.id` from the version call after the saves, or `latest_version\.id` when that call answers 409 `nothing_to_commit`/);
  assert.match(gate1, /The UNDO line names the version to go back to by its name and time, the way the owner's list of Your site's versions shows it, never by id; the ids go to the PM task \(gate 5\)/);
  assert.match(gate1, /Going back is done by the site owner from Your site's versions, or from a full connection with `project_vcs_rollback` \(dry run first, then the owner's yes\), then a separate deploy/);
  assert.match(gate1, /Never write "none" for a code lane change: with that first read done, and the version it calls for saved, there is always a version to go back to/);
  // Gate 5 collects the handles; the full-connection card stays pinned (versions-doctrine.test.mjs).
  assert.match(discipline, /the version before the change \(settled before the first save, gate 1\) with its name and time/);
  assert.match(discipline, /the version id \(`data\.id` from `project_vcs_commit`\) or, when that call answers 409 `nothing_to_commit`, `latest_version\.id`/);
  assert.match(discipline, /UNDO: project_vcs_rollback to the version before this change/);
  assert.match(discipline, /the UNDO line names the version settled before the first save \(gate 1\) by its name and time: ``` UNDO: go back to the version "[^"]+", saved [^,]+, \d{4}, [^,]+, from Your site's versions, then deploy again\. Both version ids are in the PM task \(gate 5\) ```/);

  const onPage = flat(read('skills/hiveku-seo-agency/references/on-page-optimization.md'));
  const section = onPage.slice(onPage.indexOf('**The code lane on a marketing or marketing-seo connection.**'), onPage.indexOf('### 1.3'));
  assert.match(section, /1\. \*\*The version to go back to, before the first save\.\*\* `project_vcs_status\(\{ project_id, detail: "files" \}\)`/);
  assert.match(section, /When `head_commit_id` is set, `uncommitted` is false and `uncommitted_reason` is not 'unknown', that version is the one to go back to: keep `head_commit_id` with `last_version\.message` and `last_version\.created_at`\. Otherwise save one first\./);
  assert.match(section, /`head_commit_id` null \(`uncommitted_reason` 'no_version_yet'\) means the site has never had a version/);
  assert.match(section, /tell the person, then save the site as it stands with `project_vcs_commit\(\{ project_id, message \}\)` and NO files/);
  assert.match(section, /A 409 `nothing_to_commit` is success and carries `latest_version`\. Keep that version's `id`, `message` and `created_at` \(from `data`, or from `latest_version`\): it is the version to go back to\. If no version can be saved, stop before the first save\./);
  // The new version: a 409 after the saves is success, and its handle is latest_version.id.
  assert.match(section, /keep `data\.id` as the new version\. A 409 `nothing_to_commit` is success too: the change is already a version .* so keep `latest_version\.id` as the new version and never report the call as failed/);
  // The UNDO line a site owner can act on: name and time, not an id.
  assert.match(section, /the site owner's list of Your site's versions shows names and dates, not ids\. So the pre-flight card's UNDO line names the version to go back to by the name and time kept in step 1: `UNDO: go back to the version "<name>" saved <date and time> from Your site's versions, then deploy again`/);
  assert.match(section, /The ids \(the version to go back to, and the new version from step 4\) go into the PM task/);
  assert.match(section, /Going back is done by the site owner from Your site's versions, or from a full connection with `project_vcs_rollback` \(dry run first, then the owner's yes\)/);
  assert.match(section, /Never write "none": with step 1 done there is always a version to go back to/);
  assert.doesNotMatch(section, /the site can always go back/, 'the unconditional claim is gone');
  // The first read comes before the first save in the taught order.
  assert.ok(section.indexOf('**The version to go back to, before the first save.**') < section.indexOf('`project_file_save({ project_id, file_path, content })`'));

  const hub = flat(read('skills/hiveku-seo-agency/SKILL.md'));
  assert.match(hub, /Undo there: read `project_vcs_status\(\{ project_id, detail: "files" \}\)` before the first save\. When it shows no version yet \(`head_commit_id` null\), changes not in a version \(`uncommitted` true\) or an 'unknown' reason, tell the person and first save the site as it stands/);
  assert.match(hub, /that version, or else `head_commit_id`, is the version to go back to\. Keep its name and time with its id: the UNDO line names it by name and time/);
  // The hub never describes a rollback without its yes.
  assert.match(hub, /or a full connection with `project_vcs_rollback` \(dry run first, then the owner's yes\), then a separate deploy/);

  const fix = flat(read('commands/seo-fix.md'));
  assert.match(fix, /Read `project_vcs_status\(\{ project_id, detail: "files" \}\)` before the first save: when `head_commit_id` is null, `uncommitted` is true or the reason is 'unknown', tell the person and first save the site as it stands/);
  assert.match(fix, /That version, or else `head_commit_id`, is the version to go back to; the UNDO line names it by its name and time/);

  // NEGATIVE CONTROL: the wording this replaced (head_commit_id alone, an unconditional "always").
  for (const [label, text] of [
    ['gate 1', flat('first save and keep its `head_commit_id`: that is the version to go back to. The UNDO line names that id and the new version\'s `data.id` from `project_vcs_commit`. Never write "none" for a code lane change: the site can always go back to that version.')],
  ]) {
    assert.doesNotMatch(text, /When `head_commit_id` is null/, `${label}: the old wording has no null case`);
    assert.match(text, /the site can always go back/, `${label}: the control carries the old claim`);
  }
  for (const f of seoProse()) {
    assert.doesNotMatch(flat(read(f)), /the site can always go back to that version/, `${f} still says the site can always go back`);
    assert.doesNotMatch(flat(read(f)), /The UNDO line names that id/, `${f} still names an id on the UNDO line`);
  }
});

test('the marketing code lane stops before versioning another writer\'s edits unannounced', () => {
  // A no-files version saves EVERYTHING pending on Your site. Without this step an SEO-named
  // version carries someone else's edits, and rolling it back later undoes their work too.
  const onPage = flat(read('skills/hiveku-seo-agency/references/on-page-optimization.md'));
  const section = onPage.slice(onPage.indexOf('**The code lane on a marketing or marketing-seo connection.**'), onPage.indexOf('### 1.3'));
  assert.match(section, /`project_vcs_status\(\{ project_id, detail: "files" \}\)` again, to see everything not in a version yet \(you are not the only writer\): if `changed_files` lists paths you did not save, tell the person the version will include those changes too \(or wait\) before saving it/);
  // latest_changes.state is 'editing' for 3 minutes after ANY write, the agent's own saves included
  // (version-api-types.ts EDITING_QUIET_WINDOW_MS). After the saves it says nothing about other
  // writers; waiting on it only lets the automatic save version the change first.
  assert.match(section, /`latest_changes\.state` reads 'editing' now because of your own saves, so at this read it is not a sign of another writer: judge by the paths alone/);
  assert.match(section, /`latest_changes\.state` 'editing' at THIS read means someone else wrote in the last 3 minutes/, 'the before-save read is where editing means someone else');
  assert.ok(
    section.indexOf("'editing' at THIS read means someone else") < section.indexOf('`project_file_save({ project_id, file_path, content })`'),
    'the someone-else reading of editing belongs to the read before the first save',
  );
  // NEGATIVE CONTROL: the old after-save rule treated 'editing' as another writer.
  const oldRule = /you did not save, or `latest_changes\.state` is 'editing', tell the person/;
  assert.match(flat("if it lists files you did not save, or `latest_changes.state` is\n'editing', tell the person the version will include"), oldRule);
  assert.doesNotMatch(section, oldRule);
});

test('the shorter marketing-path pointers carry the first read and the development branch check', () => {
  // content-strategy.md and /hiveku:seo-onpage teach the marketing path in a few lines. Without the
  // read before the first save the first version already holds the change (no version to go back
  // to), and without `branch: "main"` a development tier set to another branch deploys other work.
  for (const f of ['skills/hiveku-seo-agency/references/content-strategy.md', 'commands/seo-onpage.md']) {
    const text = flat(read(f));
    assert.match(text, /`project_vcs_status\(\{ project_id, detail: "files" \}\)` before the first save/, `${f} reads the status before the first save`);
    assert.match(text, /with `branch: "main"`/, `${f} sends the development deploy with branch main`);
    assert.match(text, /section 1\.2/, `${f} points at on-page section 1.2`);
  }
  // NEGATIVE CONTROL: the wording this replaced has neither.
  const old = flat('`deploy_site` to development first and production after approval. A change across many files, or');
  assert.doesNotMatch(old, /with `branch: "main"`/);
});

test('a marketing session can find the template file without the search or bulk read', () => {
  const onPage = flat(read('skills/hiveku-seo-agency/references/on-page-optimization.md'));
  const s11 = onPage.slice(onPage.indexOf('### 1.1'), onPage.indexOf('### 1.2'));
  assert.match(s11, /On marketing and marketing-seo \(no search or bulk read\): `project_files_list\(\{ project_id, search: 'layout' \}\)` \(a match on the path, not the content\) to find the layout or page file, then `project_file_get\(\{ project_id, file_path \}\)`/);
  const discipline = flat(read('skills/hiveku-seo-agency/references/seo-change-discipline.md'));
  assert.match(discipline, /\| Template \/ code \| `project_files_search\(\{ project_id, query \}\)`, then `project_files_bulk_get`; on marketing and marketing-seo \(no search or bulk read\), `project_files_list\(\{ project_id, search \}\)` by path, then `project_file_get` \|/);
});

test('the read-only analyst is told not to use the saves a marketing connection has', () => {
  const analyst = flat(read('agents/hiveku-seo-analyst.md'));
  assert.match(analyst, /Do not work around it with `pages_update`, `project_file_save`, `project_files_bulk_save`, `project_vcs_commit` or `deploy_site`\./);
  const writes = analyst.slice(analyst.indexOf('You do not run writes'));
  for (const tool of ['`project_file_save`', '`project_vcs_commit`', '`project_redirect_*`', '`project_redirects_deploy`', '`deploy_site`', '`cms_*`']) {
    assert.ok(writes.includes(tool), `the analyst's write list names ${tool}`);
  }
});

test('what the SEO skill tells a person about a scoped connection is plain and says connection', () => {
  // The profile is chosen per connection, not stored on the key (profiles.ts VERSION_ONLY_PROFILES):
  // "not visible to this key" / "a full-profile key" sends a person after a new key they do not need,
  // and "implement rail" / "full-profile connection" are internal words a person reads verbatim.
  const keyWords = /not visible to this key|invisible to this key|key-invisible|\bkey scope\b|full-profile (?:key|connection)|`?\byour key's profile|the key's profile|on your key\b|\bscoped key\b|marketing(?:-seo)?`? (?:scoped )?keys?\b/;
  // NEGATIVE CONTROL: the sentences this replaced are caught.
  for (const old of [
    'visible to this key", use the implement rail or a full-profile key, never "does not exist".',
    'missing feature: say "not visible to this key", never "does not exist", and route through the implement rail or a full-profile key.',
    'Preconditions: a full-profile key (a migration needs the multi-file save',
    'change needs a full-profile connection or the implement rail", never "Hiveku cannot".',
    '- A tool outside your key\'s profile is INVISIBLE and fails exactly like a missing feature.',
    'A tool outside the key\'s profile fails like a missing feature: say "not visible to this key".',
    // technical-seo-blind-spots.md, the analyst, metered-research-suite.md and /hiveku:seo-links.
    'Every tool named below is LIVE. A name that does not resolve on your key is "not visible to this\nkey", never "does not exist"',
    '`project_files_search` and `preview_http_get` are not visible on a\nmarketing or marketing-seo key (`web_crawl` and the redirect tools are).',
    'Tool-not-found means invisible to this key or not provisioned',
    '`blocked` (unbound, account mismatch, or the key\'s profile hides `seo_`)',
    '`seo_` is visible on full, marketing and marketing-seo keys only;',
    '`crm_create_activity` is not visible on\n   a marketing-seo key.',
    // The analyst's verdict and could-not-verify reasons, and link-building step 4.
    '`not_measurable` (hollow rail, missing connection) and `unknown` (tool errored or key-invisible)',
    '4. What you could not verify, and why (key scope, disconnected connection, hollow rail, failed',
    'Visibility caveat on step 4: `crm_create_activity` is NOT visible to a `marketing-seo` key (that\nprofile carries only the seven CRM contact tools; `crm_contacts_bulk_create` in step 3 is one). On\na scoped key record the won link as a PM task',
  ]) {
    assert.match(flat(old), keyWords, `the check must catch: ${old}`);
  }
  // Every SEO file a session can load, not a hand list: a hand list left technical-seo-blind-spots.md
  // and the analyst out, and both kept the key wording.
  const files = seoProse();
  for (const f of ['skills/hiveku-seo-agency/references/technical-seo-blind-spots.md', 'agents/hiveku-seo-analyst.md']) {
    assert.ok(files.includes(f), `the check reads ${f}`);
  }
  const offenders = files.filter((f) => keyWords.test(flat(read(f))));
  assert.deepEqual(offenders, [], 'these still tell the person about their key instead of this connection');
  // The quote a person hears on the scoped-connection trap matches the MCP refusal's plain words.
  assert.match(
    flat(read('skills/hiveku-seo-agency/references/on-page-optimization.md')),
    /say "this change needs a connection that has the site's file tools, or Hiveku's SEO fix flow with your approval", never "Hiveku cannot"/,
  );
  // "commit" never reaches the person from these rows.
  const discipline = flat(read('skills/hiveku-seo-agency/references/seo-change-discipline.md'));
  assert.match(discipline, /the code lane; a version is not live until the deploy;/);
  for (const f of files) assert.doesNotMatch(flat(read(f)), /commit is not live/i, `${f} says "commit is not live"`);
});
