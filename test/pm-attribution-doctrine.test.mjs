/**
 * The PM attribution doctrine must survive an empty Team Members roster.
 *
 * The 2026-09-22 Forney report: crm_list_users returned {"users":[]} on a
 * full-profile key, and the plugin told the agent to take the operator's id
 * from that list and pass it as assigned_to_id. The list is the account's Team
 * Members only (home users plus invited members); an agency or SaaS operator
 * working a client account without an invitation is never in it. Guidance
 * that treats an empty list as a broken key, or that says the assignee must
 * never be blank, pushes an agent to borrow another member's id or an id from
 * another account. Until Forney round 3 nothing downstream rejected that:
 * pm_tasks_create / pm_tasks_update accepted any user id. Since builder
 * e53c412a8 (2026-09-25) every PM write that sets an assignee refuses a person
 * who is not a team member with 400 user_not_in_account (src/lib/pm/assignee.ts),
 * so the prose says that, and what to tell the user, instead.
 *
 * The builder now answers an empty roster with a `hint` saying so. These pins
 * keep the prose on the same rule everywhere it names a roster as the source
 * of an assignee: an empty roster is a real answer, no stand-in id, and the
 * user is told once how to become assignable.
 *
 * Default assignees (2026-09-26, after builder PR #205): projects and sections
 * carry default_assignee_id. A new top-level task created with NO
 * assigned_to_id key goes to the section's default, then the project's (each
 * re-checked against the current team); an explicit null or '' creates it
 * unassigned. So "leave it unset and the task is created unassigned" is no
 * longer true when a default is set, and the prose now says omit / null / id.
 * On a shared project the team is the primary account plus every active
 * co-owner account, which crm_list_users (one account) cannot list; the PM
 * roster is pm_project_team (GET /api/olympus/pm/projects/:id/team). Review
 * feedback tasks can have their own assignee (review_assignee_id on the
 * annotation settings), else the project default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_TOOLS } from './pending-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * The builder checkout the source cross-checks read: HIVEKU_BUILDER_PATH when
 * set (a worktree with the change under review), else the sibling checkout.
 */
const BUILDER = process.env.HIVEKU_BUILDER_PATH
  ? path.resolve(process.env.HIVEKU_BUILDER_PATH)
  : path.join(root, '..', 'hiveku_builder');

/**
 * The MCP server checkout the tool cross-check reads: HIVEKU_MCP_PATH when set
 * (a worktree with the change under review), else the sibling checkout.
 */
const MCP = process.env.HIVEKU_MCP_PATH
  ? path.resolve(process.env.HIVEKU_MCP_PATH)
  : path.join(root, '..', 'hiveku-mcp-api-server');

const ORIENT = 'skills/hiveku-orient/SKILL.md';
const PM = 'skills/hiveku-pm-mission-control/SKILL.md';
const PM_STRUCTURE = 'skills/hiveku-pm-mission-control/references/pm-project-structure.md';
const NODE_RAIL = 'skills/hiveku-automation-agency/references/node-rail.md';
const REVIEW = 'commands/review.md';
const SALES = 'skills/hiveku-sales-agency/SKILL.md';
const MY_DAY = 'commands/my-day.md';
const TRIAGE = 'commands/triage.md';

/** Collapse whitespace so a pinned phrase may wrap across lines. */
const flat = (s) => s.replace(/\s+/g, ' ');

function markdownFiles(rel) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) out.push(child);
    }
  };
  walk(rel);
  return out.sort();
}

/** The top-level bullet (a line starting "- ") that contains `marker`, through the next one. */
function bulletContaining(rel, marker) {
  const text = read(rel);
  const at = text.indexOf(marker);
  assert.ok(at >= 0, `${rel} no longer contains "${marker}"`);
  const start = text.lastIndexOf('\n- ', at);
  const next = text.indexOf('\n- ', at + marker.length);
  const heading = text.indexOf('\n#', at);
  const ends = [next, heading].filter((i) => i > at);
  const end = ends.length ? Math.min(...ends) : text.length;
  return flat(text.slice(start < 0 ? 0 : start, end));
}

/** The empty-roster rule, in the words each surface must carry. */
function assertEmptyRosterRule(rel, block) {
  assert.match(block, /Team Members/, `${rel}: must say the roster lists Team Members`);
  assert.match(block, /`\{ users: \[\], hint \}`/, `${rel}: must name crm_list_users's empty response shape`);
  assert.match(block, /`members: \[\]` from `pm_project_team`/, `${rel}: must name pm_project_team's empty response shape`);
  // Omitting the assignee now applies a default when one is set; the empty
  // roster no longer means "unassigned" unconditionally.
  assert.match(block, /the task goes to the default assignee when one is set and is (otherwise created unassigned|created unassigned otherwise)/, `${rel}: must say what an omitted assignee becomes`);
  assert.match(block, /[Nn]ever borrow another member's id/, `${rel}: must forbid a stand-in member id`);
  assert.match(block, /never use an id from\s+another account unless `pm_project_team` lists that person/, `${rel}: must forbid an id from another account, except the shared project's other company`);
  assert.match(block, /[Tt]ell the user once that inviting them under Team\s+Members makes them\s+assignable/, `${rel}: must tell the user once how to become assignable`);
}

test('orient carries the roster, the omit/null/id rule and the empty-roster rule inside the PM-tasks bullet', () => {
  const block = bulletContaining(ORIENT, '**PM tasks are required.**');
  assert.match(block, /`assigned_to_id` is a member `id` from `pm_project_team\(\{ project_id \}\)` - NOT `clerk_user_id`/, 'orient: the PM assignee comes from pm_project_team');
  assert.match(block, /`pm_project_team` is the roster for PM assignment/, 'orient: must name the PM roster');
  assert.match(block, /when the project is shared, the other account's people too/, 'orient: the roster spans both accounts of a shared project');
  assert.match(block, /`crm_list_users` is this account's own team only/, 'orient: crm_list_users is one account');
  assert.match(block, /Leave `assigned_to_id` out and the new task goes to its section's default assignee, else the project's/, 'orient: omit = the default');
  assert.match(block, /Pass `null` \(or `''`\) to create it unassigned even when a default is set/, 'orient: null = unassigned');
  assert.match(block, /Moving an unassigned task into a section that has a default \(`pm_tasks_update\(\{ id, section_id \}\)`\) assigns it to that section's default/, 'orient: a move into a section with a default assigns the task');
  assert.match(block, /`pm_projects_update` and `pm_sections_create` \/ `pm_sections_update` \(`default_assignee_id`; `''` or `null` clears; someone off the project team is refused with `field: 'default_assignee_id'`\)/, 'orient: where defaults are set, how to clear one, and the refusal field');
  assert.match(block, /review feedback tasks can have their own assignee \(`review_assignee_id`\), else they follow the project default/, 'orient: review feedback has its own assignee, else the project default');
  assert.match(block, /\*\*An empty roster is a real answer\.\*\*/, 'orient: the rule must open with its name');
  assertEmptyRosterRule(ORIENT, block);
  assert.match(block, /leave `assigned_to_id` \(and `owner_id` on CRM records\) unset/, 'orient: must say which fields stay unset');
  assert.match(block, /Agency and SaaS operators working a client account without an invitation are not listed and cannot be assigned/, 'orient: must say who is missing from the roster and why');
  assert.match(
    block,
    /A tool missing from the key's profile is a scope question; the tool answering an empty list is the empty-roster case above/,
    'orient: must separate a scoped-out tool from an empty answer',
  );
  // The MCP profiles grant pm_project_team by the pm_ prefix and, by name,
  // wherever create_task is granted (TASK_NAMES, the sales profile).
  assert.match(block, /every key that can create a PM task \(`pm_tasks_create`, or `create_task` on a sales key\) also sees `pm_project_team`/, 'orient: who can see the roster');
});

test('pm-mission-control carries the rule in Ids, Key scope and the decide relay', () => {
  const ids = bulletContaining(PM, '**An empty roster is a real answer.**');
  assertEmptyRosterRule(PM, ids);
  // Round 3: the builder refuses a non-member on every PM write that sets an
  // assignee. The old "still accept any user id" line is retired.
  assert.match(
    ids,
    /Every PM write that sets an assignee refuses someone who is not a team member with 400 `user_not_in_account`/,
    'pm: must say a non-member is refused with user_not_in_account',
  );
  assert.match(ids, /400 `invalid_assignee_id`/, 'pm: must say a value that is not a UUID is refused');
  assert.match(ids, /`pm_tasks_create_bulk` \(the whole batch, with `invalid` listing each `\{ index, assigned_to_id \}`\)/, 'pm: bulk create is all-or-nothing and names each bad row');
  assert.match(ids, /invite the person under Settings > Team Members, or create the task unassigned/, 'pm: what to tell the user on the refusal');
  assert.match(ids, /or leave `assigned_to_id` out so the default applies/, 'pm: the refusal can also fall back to the default');
  assert.match(ids, /A default assignee that is refused the same way answers with `field: 'default_assignee_id'`/, 'pm: a default refusal names its own field');
  assert.match(ids, /Editing other fields of a task already held by a non-member still works/, 'pm: older assignments are left alone');
  assert.doesNotMatch(ids, /still accept any user id/, 'pm: the server now checks membership');

  const roster = bulletContaining(PM, '**The PM roster is `pm_project_team({ project_id })`.**');
  assert.match(roster, /its own account's team and, when the project is shared, the other account's team/, 'pm: the roster spans both accounts');
  assert.match(roster, /the other company's emails hidden \(`email: null`\)/, 'pm: the other company\'s emails are hidden');
  assert.match(roster, /Use a member `id` as `assigned_to_id` or `default_assignee_id`/, 'pm: roster ids feed both fields');
  assert.match(roster, /`crm_list_users` is this account's own team only/, 'pm: crm_list_users is one account');
  assert.match(roster, /prefer `pm_project_team` for any PM assignment/, 'pm: prefer the PM roster');

  const omit = bulletContaining(PM, '**Omit, null, or an id.**');
  assert.match(omit, /leave `assigned_to_id` out and a new top-level task goes to its section's default assignee, else the project's/, 'pm: omit = the default');
  assert.match(omit, /Pass `null` \(or `''`\) to create it unassigned even when a default is set/, 'pm: null = unassigned');
  assert.match(omit, /A subtask never takes a default/, 'pm: subtasks never take a default');

  const scope = flat(read(PM));
  assert.match(
    scope,
    /`pm_project_team` or `crm_list_users` being present and returning an empty list: that is the real roster, and the answer is to leave `assigned_to_id` out \(Ids, above\), not a different key/,
    'pm Key scope: an empty list is not a key problem',
  );
  assert.match(scope, /The PM roster, `pm_project_team`, is a `pm_` tool and is present/, 'pm Key scope: the pm profile has the roster');

  const decide = bulletContaining(PM, 'Pass `acting_as_user_id` (public_users `id` from `crm_list_users`');
  assert.match(decide, /invited members are accepted/, 'pm: mc_task_decide accepts invited members');
  assert.match(decide, /omit `acting_as_user_id` and put their name and their answer in `comment`/, 'pm: a non-member decider is named in comment');
  assert.match(decide, /Never pass another member's id in their place/, 'pm: no stand-in decider id');
});

test('the commands and the sales skill that read crm_list_users for an id follow the same rule', () => {
  const myDay = flat(read(MY_DAY));
  assert.match(myDay, /if it is empty \(`\{ users: \[\], hint \}`\) or the rep is not in it/, '/hiveku:my-day: the empty-roster branch');
  assert.match(myDay, /label EVERY queue account-wide/, '/hiveku:my-day: no personal queue without an owner id');
  assert.match(myDay, /never pick another member's `owner_id` to stand in/, '/hiveku:my-day: no stand-in owner');

  const triage = flat(read(TRIAGE));
  assert.match(
    triage,
    /When the decider is not a Team Member \(`crm_list_users` is empty, or they are not in it\), omit `acting_as_user_id` and put their name and their answer in `comment`; never pass another member's id in their place/,
    '/hiveku:triage: the non-member decider rule',
  );

  const sales = flat(read(SALES));
  assert.match(sales, /An empty `crm_list_users`, or an owner who is not in it, means leave the record unowned \(`unowned: true`\), never a guessed owner/, 'sales: an empty roster leaves the deal unowned');
});

test('no surface says a PM write accepts any assignee: the builder checks membership (round 3)', () => {
  const retired = /still accept any user id|nothing checks membership|checks only the UUID shape|(is|are) stored as given/i;
  const offenders = [];
  for (const rel of [...markdownFiles('skills'), ...markdownFiles('commands'), ...markdownFiles('agents')]) {
    const text = flat(read(rel));
    if (retired.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'a PM write refuses a non-member with 400 user_not_in_account; no surface may say it stores any id');
  const recurrence = flat(read(PM));
  assert.match(recurrence, /each occurrence spawns without them and its `ai_metadata` records `assignee_dropped`/, 'pm: a departed recurrence assignee is dropped from the occurrence');
  assert.match(
    recurrence,
    /An occurrence with nobody on it \(no assignee on the recurrence, or one that was dropped\) goes to the recurrence section's default assignee, then the project's/,
    'pm: an occurrence with nobody on it takes the default (spawn-recurrence.ts)',
  );
  assert.match(
    flat(read('skills/hiveku-pm-mission-control/references/pm-project-structure.md')),
    /anyone else is refused with 400 `user_not_in_account` and no task changes/,
    'pm-project-structure: bulk reassignment refuses a non-member',
  );
});

test('no skill, command or agent tells the agent the assignee must never be blank', () => {
  const banned = [/never leave (it|the assignee|assigned_to_id|owner_id) blank/i, /assignee MUST be/i, /must never be unassigned/i];
  const offenders = [];
  for (const rel of [...markdownFiles('skills'), ...markdownFiles('commands'), ...markdownFiles('agents')]) {
    const text = read(rel);
    for (const re of banned) if (re.test(text)) offenders.push(`${rel}: ${re}`);
  }
  assert.deepEqual(offenders, [], 'a surface still demands a non-blank assignee, which is what pushes an agent to borrow an id');
});

test('the tools the rule names are live', () => {
  const index = new Set(JSON.parse(read('lib/tool-index.json')).tools.map((t) => t.name));
  for (const name of [
    'crm_list_users',
    'pm_tasks_create',
    'pm_tasks_update',
    'pm_tasks_create_bulk',
    'pm_tasks_reassign_bulk',
    'mc_task_spawn_pm',
    'pm_task_recurrence_create',
    'pm_task_recurrence_update',
    'mc_task_decide',
    'crm_update_deal',
    'pm_projects_get',
    'pm_projects_update',
    'pm_sections_list',
    'pm_sections_create',
    'pm_sections_update',
    'project_annotation_settings_get',
    'project_annotation_settings_set',
  ]) {
    assert.ok(index.has(name), `${name} is not in lib/tool-index.json`);
  }
  // The PM roster ships with the MCP deploy of this program; until the index
  // is regenerated it rides on PENDING_TOOLS (tool-names.test.mjs forces the
  // entry out once the index carries it).
  assert.ok(
    index.has('pm_project_team') || PENDING_TOOLS.get('pm_project_team')?.batch === 'PM-TEAM-1',
    'pm_project_team is neither in lib/tool-index.json nor pending as PM-TEAM-1',
  );
});

// pm_ is not a gated prefix in tool-names.test.mjs, so this is the check that
// the assignment docs call only tools that exist (or are contracted).
test('every PM, Mission Control and annotation tool the assignment docs call is live or pending', () => {
  const index = new Set(JSON.parse(read('lib/tool-index.json')).tools.map((t) => t.name));
  const unknown = [];
  let checked = 0;
  for (const rel of [ORIENT, PM, PM_STRUCTURE, NODE_RAIL, REVIEW]) {
    // A backticked name followed by `(` or the closing backtick: a call or a
    // tool name, never a table (`pm_projects` UUID) or a column path.
    for (const m of read(rel).matchAll(/`((?:pm|mc|project_annotation)_[a-z0-9_]+)(?=[`(])/g)) {
      checked += 1;
      if (!index.has(m[1]) && !PENDING_TOOLS.has(m[1])) unknown.push(`${rel}: ${m[1]}`);
    }
  }
  assert.ok(checked > 100, `only ${checked} tool names found - the extraction is broken, not the prose`);
  assert.deepEqual([...new Set(unknown)], [], 'the PM docs name a tool that is neither in the index nor pending');
});

test('Default assignees: the PM skill says where a default is set, how it applies, and how it is refused', () => {
  const pm = flat(read(PM));
  const at = pm.indexOf('**Default assignees: who a new task goes to when nobody is named.**');
  assert.ok(at >= 0, 'the PM skill lost its Default assignees paragraph');
  const block = pm.slice(at, pm.indexOf('**Review feedback tasks.**', at));
  for (const phrase of [
    '`pm_projects_update({ id, default_assignee_id })`',
    '`pm_sections_create({ project_id, name, default_assignee_id })`',
    '`pm_sections_update({ project_id, section_id, default_assignee_id })`',
    "`''` or `null` clears it",
    'the body\'s `field` is `default_assignee_id`, not `assigned_to_id`',
    'A new top-level task created with no `assigned_to_id` key takes its section\'s default, else the project\'s',
    'someone who has left (removed from the account, or the share ended) is skipped rather than assigned',
    "`null` or `''` on the create means unassigned, default or not",
    'A subtask never takes a default, and neither does a task handed to an AI agent',
    '`pm_tasks_update` that moves an unassigned top-level task into a section with a default assigns it to that section\'s default (the section\'s only, never the project\'s)',
    'A write that also names `assigned_to_id` keeps what it names, `null` included',
    'Setting or changing a default never touches tasks that already exist',
  ]) {
    assert.ok(block.includes(phrase), `PM Default assignees must say: ${phrase}`);
  }
  assert.match(block, /400 `user_not_in_account`/, 'PM: a default outside the team is refused');

  const review = pm.slice(pm.indexOf('**Review feedback tasks.**'));
  for (const phrase of [
    'with no section, so a section default never reaches it',
    "It goes to the website's review assignee when one is set, else to the project's default assignee, else to nobody",
    '`project_annotation_settings_set({ project_id, review_assignee_id })` with the WEBSITE project id',
    'someone who has left is skipped and the project default applies',
    "anyone else is refused with 400 `user_not_in_account`, `field: 'review_assignee_id'`",
    // review2 C2: the roster comes with the setting, so it works before any PM
    // project is linked and on a dev key (no crm_list_users there).
    "Take the id from `project_annotation_settings_get`'s `review_assignee.people`",
    "or the account's own team before any project is linked",
    'it needs no `pm_project_team` or `crm_list_users` call and works on every key that can set it',
    '`review_assignee.pm_project` names the project the tasks land in',
    // One primary linked project (2026-09-27): the oldest that is not archived,
    // never an arbitrary one, and a new one only when none is left.
    "review feedback lands in the site's oldest linked PM project that is not archived (null when none is left, until the next writer creates one)",
    'With a `linked_project_count` (linked projects that are not archived) above 1 it still lands only there',
    // Who creates a missing project, and read pm_project rather than assume a name.
    'When no linked project is left (none was linked, or every linked one is archived), the next writer creates one: the first review comment makes "Website Feedback: <site>", while the editor Tasks panel, the tasks page, session recordings and discussion converts make "PM - <site>"',
    // Round 9 (builder #242): every new site gets "PM - <site>" when it is
    // created, on every birth path (createSiteBirthPmProject). Only a site made
    // before that by the MCP site tools or a clone may have none.
    'Every new site gets "PM - <site>" when it is created (from the dashboard, `site_create`, `site_create_external`, a clone with `site_clone` or the dashboard\'s Clone Project, a Webflow site added in the account hub, or a GitHub import that makes a new site), but a site created before that by `site_create`, `site_create_external` or `site_clone`, or by the dashboard\'s Clone Project, may have none until one of those writers makes one, and a project linked to a site with none becomes where feedback lands (call `project_annotation_settings_get` before linking). So read `review_assignee.pm_project` rather than assuming a name',
    // Moving it: unlink first (and what that costs) or share; archive only a
    // finished project, because it hides the project and its open tasks.
    // Round 8: EACH older one, since unlinking only the oldest of three hands
    // feedback to the next-oldest.
    'To move it, unlink each older one (`pm_projects_update` with `website_project_id: null`) so the next-oldest takes over, or share the existing project with the other company',
    // Unlinking keeps the project in the PM lists, but the site's Tasks page loads
    // only projects linked to the site (hiveku_builder useTasks.ts) and the
    // editor's "This Project" view only the primary one (TasksPanel.tsx).
    'its tasks stay in the PM project lists but leave this site\'s Tasks page and the editor\'s "This Project" task view, and their "Implement with AI" can no longer find the site\'s code',
    'Archiving the older project also moves feedback, but hides it and all its open tasks from every list, so archive only a project whose work is finished',
    // The team is that one project's team (it was the union of every linked
    // project's team while the pick was arbitrary), and stale follows it.
    'the team of the PM project feedback lands in (both companies when it is shared)',
    "Being on another linked project's team is not enough",
    "`review_assignee.stale` is true when the saved person is not on `review_assignee.pm_project`'s team (they left, or they are only on another linked project's team); new feedback then follows the project default",
  ]) {
    assert.ok(review.includes(phrase), `PM Review feedback tasks must say: ${phrase}`);
  }

  const structure = flat(read(PM_STRUCTURE));
  assert.ok(structure.includes('`pm_projects_update({ id, default_assignee_id })`'), 'pm-project-structure: the project default');
  assert.ok(structure.includes('`pm_sections_update({ project_id, section_id, name, sort_order, is_collapsed, default_assignee_id })`'), 'pm-project-structure: the section default');
  assert.ok(structure.includes('it is the ONLY default a move applies'), 'pm-project-structure: a move applies the section default only');
  assert.ok(structure.includes("`field: 'default_assignee_id'`"), 'pm-project-structure: the refusal field');
  assert.ok(structure.includes('`pm_project_team({ project_id })` is the roster for PM assignment'), 'pm-project-structure: the roster');
  assert.ok(structure.includes('their assignee does not change'), 'pm-project-structure: deleting a section never unassigns a person');
  // Round 9 (builder #242): the site-birth project, and where the site tools return it.
  for (const phrase of [
    'Every new site gets a linked "PM - <site>" project when it is created: from the dashboard, `site_create`, `site_create_external`, a clone (`site_clone` or the dashboard\'s Clone Project), a Webflow site added in the account hub, or a GitHub import that makes a new site.',
    '`site_create` and `site_create_external` return it as `pm_project: { id, name }` and `site_clone` as `data.pm_project` (null only when it could not be made)',
    "A site created before that by `site_create`, `site_create_external` or `site_clone`, or by the dashboard's Clone Project, may have none.",
  ]) {
    assert.ok(structure.includes(phrase), `pm-project-structure must say: ${phrase}`);
  }

  const review2 = flat(read(REVIEW));
  for (const phrase of [
    "Review feedback lands in the site's oldest linked PM project that is not archived: `project_annotation_settings_get`'s `review_assignee.pm_project` names it, even when `linked_project_count` (the linked projects that are not archived) is above 1",
    'Every new site gets a linked "PM - <site>" project when it is created: from the dashboard, from `site_create` or `site_create_external`, from a clone (the dashboard\'s Clone Project or `site_clone`), from a Webflow site added in the account hub, or from a GitHub import that makes a new site. A site created before that by `site_create`, `site_create_external` or `site_clone`, or by the dashboard\'s Clone Project, may have no linked PM project until one of the writers below creates one',
    'On a site with no linked project that is not archived, a project you link with `website_project_id` becomes where feedback lands, so call `project_annotation_settings_get` before linking one',
    'When no linked project is left, the next writer creates one: the first review comment makes "Website Feedback: <site>", while the editor Tasks panel, the tasks page, session recordings and discussion converts make "PM - <site>". So read `review_assignee.pm_project` instead of assuming a name.',
    'To send feedback to another project, link it (`website_project_id`), then unlink each older one (`pm_projects_update` with `website_project_id: null`) so the next-oldest takes over, or share the existing project with the other company instead',
    'Unlinking keeps the old project and its tasks in the PM project lists, but they leave this site\'s Tasks page and the editor\'s "This Project" task view, and their "Implement with AI" can no longer find the site\'s code',
    "Archiving the old project (`status: 'archived'`) also moves feedback, but it hides that project and all its open tasks from every list, so archive only a project whose work is finished",
    "The review assignee must be on `review_assignee.pm_project`'s team, not just on another linked project's team",
    "`review_assignee.stale` is true when the saved person is not on that team (they left, or they are only on another linked project's team); new feedback then follows the project default",
  ]) {
    assert.ok(review2.includes(phrase), `/hiveku:review must say: ${phrase}`);
  }
  assert.ok(
    review2.includes("The task goes to the website's review assignee (`review_assignee_id` on `project_annotation_settings_get` / `project_annotation_settings_set`"),
    '/hiveku:review: who a feedback task goes to',
  );
  assert.ok(
    review2.includes("Take the assignee's id from `project_annotation_settings_get`'s `review_assignee.people`"),
    '/hiveku:review: where the review assignee id comes from',
  );
  assert.ok(
    structure.includes("`project_annotation_settings_get`'s `review_assignee.stale` is true once that person is not on the team of `review_assignee.pm_project` (they left, or they are only on another linked project's team), and the replacement's id comes from its `review_assignee.people`"),
    'pm-project-structure: a stale review assignee and where the replacement comes from',
  );
});

// review2 C2/C3: where a review assignee's id comes from, and which PM project
// a site's review feedback lands in. The builder honours website_project_id on
// pm_projects_create / pm_projects_update, and project_annotation_settings_get
// returns review_assignee { assignee_id, stale, pm_project, linked_project_count,
// shared, shared_with, people }.
test('the website link and the review assignee roster are taught where a PM project is linked', () => {
  for (const rel of [PM, ORIENT]) {
    const text = flat(read(rel));
    for (const phrase of [
      '`pm_projects_create` ',
      '`website_project_id`',
      '(`pm_projects_update` sets it later, `null` unlinks)',
      "A website's review feedback lands in the site's oldest linked PM project that is not archived, and `project_annotation_settings_get`'s `review_assignee.pm_project` names it.",
      // Round 8: the rule orders by the project's creation date (hiveku_builder
      // primary-link.ts primaryLinkOrderBy), not the link date, so linking an
      // existing project created before the site's current one moves feedback.
      "Linking a project created after the site's current one does not move it, but linking an older one does: the rule goes by the project's creation date, not the link date.",
      // Round 9 (builder #242): every new site is born with "PM - <site>".
      // Only a site made before that by the MCP site tools or a clone may have
      // none, and there the first project linked becomes the feedback
      // destination.
      "Every new site gets a linked \"PM - <site>\" project when it is created: from the dashboard, `site_create`, `site_create_external`, a clone (`site_clone` or the dashboard's Clone Project), a Webflow site added in the account hub, or a GitHub import that makes a new site. A site created before that by `site_create`, `site_create_external` or `site_clone`, or by the dashboard's Clone Project, may have none until the editor Tasks panel, the tasks page, a session recording, a discussion convert or the first review comment creates one, and on a site with no linked project that is not archived the project you link becomes where feedback lands, so call `project_annotation_settings_get` before linking.",
      "To move it, unlink each older one (`pm_projects_update` with `website_project_id: null`) or share the existing one with the other company; unlinking keeps that project and its tasks in the PM project lists, but they leave this site's Tasks page and the editor's \"This Project\" task view, and their \"Implement with AI\" can no longer find the site's code.",
      "Archive the older project (`status: 'archived'`) only when its work is finished, because archiving hides it and all its open tasks from every list.",
      "Only that project's team can be the review assignee",
      "check `project_annotation_settings_get`'s `review_assignee.pm_project` before setting a cross-company review assignee",
    ]) {
      assert.ok(text.includes(phrase), `${rel}: the website link must say: ${phrase}`);
    }
  }
  // The retired rule: the annotation server no longer picks a linked project
  // arbitrarily (hiveku_builder src/lib/pm/primary-link.ts, mirrored by
  // hiveku_annotation), so no page that teaches the link may still say it does.
  for (const rel of [ORIENT, PM, REVIEW]) {
    const text = flat(read(rel));
    assert.doesNotMatch(text, /picks? one (of them )?arbitrarily/i, `${rel}: still says a linked PM project is picked arbitrarily`);
    assert.doesNotMatch(text, /the oldest when several are linked/, `${rel}: still gives the old archived-blind rule`);
    // Round 6 (review of round 5): archiving hides the project and all its open
    // tasks, so it is never offered as the first way to move feedback; a
    // builder-born site is linked from birth, so no timing advice; and pm_project
    // is null only when no linked project is left.
    assert.doesNotMatch(text, /archive or unlink the old project/i, `${rel}: still offers archiving first`);
    assert.doesNotMatch(text, /before the first (review )?comment/i, `${rel}: still times a project before the first comment`);
    assert.doesNotMatch(text, /null until one is linked/, `${rel}: still says pm_project is null only until one is linked`);
    assert.doesNotMatch(text, /stale[^.]*(once|when) (that|the saved) person has left/i, `${rel}: still says stale only means the person left`);
    // Round 7: an unlinked project's tasks are not "visible" everywhere: they
    // leave the site's Tasks page and the editor's "This Project" view.
    assert.doesNotMatch(text, /tasks (stay )?visible/i, `${rel}: still says an unlinked project's tasks stay visible`);
    // Round 7: only dashboard-created sites have "PM - <site>" from birth, so a
    // new link is not always harmless, and "no PM project yet" is not how an
    // all-archived site is described.
    assert.doesNotMatch(text, /"PM - <site>"[^.]*from (creation|the start)/i, `${rel}: still says every site has "PM - <site>" from creation`);
    assert.doesNotMatch(text, /most sites (already )?have (a )?"PM - <site>"/i, `${rel}: still says most sites have "PM - <site>"`);
    assert.doesNotMatch(text, /created in the builder have "PM - <site>"/i, `${rel}: still says builder-created sites have "PM - <site>"`);
    assert.doesNotMatch(text, /Linking a newer project does not move it\./, `${rel}: still says a new link never moves feedback`);
    assert.doesNotMatch(text, /no PM project yet/i, `${rel}: still says "no PM project yet"`);
    // Round 8: a site cloned on the dashboard starts with none too, so "created
    // from the dashboard" alone overclaims; with three or more linked projects,
    // unlinking only the oldest hands feedback to the next-oldest; and linking
    // an older existing project does move feedback.
    assert.doesNotMatch(text, /created from the dashboard have[^.]*from birth/i, `${rel}: still counts a dashboard clone as born with "PM - <site>"`);
    assert.doesNotMatch(text, /unlink the older (project|one)\b/i, `${rel}: still says to unlink only the older project`);
    assert.doesNotMatch(text, /(a new link|linking a new one) does not move (it|feedback)/i, `${rel}: still says a new link never moves feedback`);
    // Round 9 (builder #242): every new site is born with "PM - <site>", so no
    // page may say only dashboard sites are, or that cloned and agent-made
    // sites start with none.
    assert.doesNotMatch(text, /created new from the dashboard have/i, `${rel}: still says only dashboard sites are born with "PM - <site>"`);
    assert.doesNotMatch(text, /\bcloned sites?\b[^.]*\b(have|has|start with) (none|no linked PM project)\b/i, `${rel}: still says a cloned site starts with no linked PM project`);
    assert.doesNotMatch(text, /made with `?site_create`? or `?site_create_external`? (have|has|start with) (none|no linked)/i, `${rel}: still says sites made with site_create start with no linked PM project`);
  }
  // Round 7: /hiveku:review S1 found the review project by the `website`
  // project_type, which most feedback projects do not have (hiveku_annotation
  // pm-project.js creates 'website_design'; builder-born "PM - <site>" projects
  // are 'website', 'general' or 'python-lambda'). It now lists the site's
  // annotations by WEBSITE id (they carry task_id whatever PM project the task
  // is in) and reads review_assignee.pm_project for where new tasks land.
  const reviewCmd = flat(read(REVIEW));
  assert.doesNotMatch(reviewCmd, /scan the list for the `website` project_type/, '/hiveku:review S1 still picks the review project by the `website` project_type');
  assert.ok(
    reviewCmd.includes('Otherwise `project_annotations_list({ project_id, state: "open" })` with the WEBSITE project id: one call returns every open annotation on the site with its `task_id`, whichever PM project that task sits in'),
    '/hiveku:review S1: find open review tasks through project_annotations_list',
  );
  assert.ok(
    reviewCmd.includes("New review tasks land in `project_annotation_settings_get({ project_id })`'s `review_assignee.pm_project.id` (a pm_projects id, NOT the website id)"),
    '/hiveku:review S1: where new review tasks land',
  );
  // The department registry the plugin ships (lib/dept-manifest.json, copied
  // from hiveku-vscode src/dept-manifest.json by its sync:registry). Nothing
  // gates it at release time (scripts/check-drift.mjs does not compare it), so
  // the retired sentence is scanned here. lib/tool-index.json is NOT scanned:
  // it is regenerated from the live MCP server at release time
  // (scripts/gen-tool-index.mjs --check in release.mjs), so it follows the
  // server's descriptions once the MCP change is deployed.
  const manifest = flat(read('lib/dept-manifest.json'));
  assert.doesNotMatch(manifest, /picks? one (of them )?arbitrarily/i, 'lib/dept-manifest.json: still says a linked PM project is picked arbitrarily');
  assert.doesNotMatch(manifest, /archive or unlink the old project/i, 'lib/dept-manifest.json: still offers archiving first');
  const orient = bulletContaining(ORIENT, '**PM tasks are required.**');
  assert.match(
    flat(orient),
    /take that id from `project_annotation_settings_get`'s `review_assignee\.people` \(it lists the team even before a PM project is linked\)/,
    'orient: where a review assignee id comes from',
  );
  // The retired source: crm_list_users is not on every key that holds the
  // setter (dev), and pm_project_team needs a linked PM project.
  for (const rel of [ORIENT, PM, PM_STRUCTURE, REVIEW]) {
    const text = flat(read(rel));
    assert.doesNotMatch(text, /review[_ ]assignee[^.]*take it from `?crm_list_users/i, `${rel}: still sends the review assignee to crm_list_users`);
  }
});

test('node-rail 6.3: an empty assignToId on createTask lets the default apply, and the roster is pm_project_team', () => {
  const rail = flat(read(NODE_RAIL));
  const at = rail.indexOf('**Work management**');
  const work = rail.slice(at, rail.indexOf('Mission Control (the', at));
  assert.ok(work.includes('team members are the ids `pm_project_team` returns for the step\'s project'), 'node-rail: the roster');
  assert.ok(work.includes('check every literal `assignToId` against `pm_project_team({ project_id })`'), 'node-rail: check literals against the project team');
  assert.ok(work.includes('An empty `assignToId` (or a template that resolves to nothing) on `createTask` is not "unassigned"'), 'node-rail: empty is not unassigned');
  assert.ok(work.includes('The step has no way to force "unassigned" past a default; `createSubtask` never takes one'), 'node-rail: no forced unassigned, subtasks never');
  assert.ok(!work.includes('against `crm_list_users`'), 'node-rail: crm_list_users is one account, not the project team');
});

// The 2026-09-26 wording change: before builder PR #205 an omitted assignee
// meant an unassigned task. Every surface that said so now teaches the
// default instead. These are the retired sentences.
test('no surface says an omitted assignee always creates an unassigned task', () => {
  const retired = [
    /the task or record is created unassigned/i,
    /leave `assigned_to_id` unset and create the task unassigned/i,
    /[Oo]mit (it )?to (create|spawn) (the task )?unassigned/,
    /unassigned \(omit `assigned_to_id`\)/i,
    /each occurrence spawns unassigned/i,
    /the answer is an unassigned task/i,
  ];
  const offenders = [];
  for (const rel of [...markdownFiles('skills'), ...markdownFiles('commands'), ...markdownFiles('agents')]) {
    const text = flat(read(rel));
    for (const re of retired) if (re.test(text)) offenders.push(`${rel}: ${re}`);
  }
  assert.deepEqual(offenders, [], 'an omitted assigned_to_id takes the section or project default; only null or \'\' is unassigned');
});

// Round 9: pm_tasks_update moving a task out of done clears completed_at (the
// Olympus PATCH did before builder #245, and src/lib/pm/update-task.ts still
// does). What it does not do is reset progress, which stays at 100. The old
// reason ("the allow-list cannot clear completed_at") contradicted the MCP
// tool descriptions an agent reads beside it, so it is retired everywhere.
const REOPEN_REASON =
  '`pm_tasks_update` moving the status out of done also clears `completed_at`, but it leaves progress at 100 unless you send `progress_percentage` too, so the task still reads as finished in progress reports';

test('reopening: the prose gives the true reason to prefer pm_tasks_uncomplete', () => {
  for (const rel of [ORIENT, PM]) {
    const text = flat(read(rel));
    assert.ok(text.includes(REOPEN_REASON), `${rel}: the reopen passage must say: ${REOPEN_REASON}`);
    assert.ok(text.includes('reopens the linked review annotation'), `${rel}: say that pm_tasks_uncomplete reopens the linked review annotation`);
  }
  const retired = [
    /allow-list (cannot clear|can't clear|does not include|doesn't include) `?completed_at/i,
    /reopen leaves `?completed_at`? set/i,
    /keeps reading as done in every report/i,
  ];
  const offenders = [];
  for (const rel of [...markdownFiles('skills'), ...markdownFiles('commands'), ...markdownFiles('agents')]) {
    const text = flat(read(rel));
    for (const re of retired) if (re.test(text)) offenders.push(`${rel}: ${re}`);
  }
  assert.deepEqual(offenders, [], 'pm_tasks_update leaving done clears completed_at; only progress stays at 100');
});

test('source cross-check: a PATCH out of done clears completed_at and leaves progress; uncomplete resets both', (t) => {
  const update = path.join(BUILDER, 'src', 'lib', 'pm', 'update-task.ts');
  const complete = path.join(BUILDER, 'src', 'lib', 'pm', 'complete-task.ts');
  if (!fs.existsSync(update) || !fs.existsSync(complete)) {
    t.diagnostic(`source cross-check skipped: ${BUILDER} has no src/lib/pm/update-task.ts (builder #245); set HIVEKU_BUILDER_PATH`);
    return;
  }
  const src = fs.readFileSync(update, 'utf8');
  const at = src.indexOf('} else if (!nextDone && prevDone) {');
  assert.ok(at > 0, 'update-task.ts no longer has an out-of-done branch');
  const branch = src.slice(at, src.indexOf('}', at + 40) + 1);
  assert.ok(branch.includes('data.completed_at = null'), 'update-task.ts: moving out of done no longer clears completed_at');
  assert.ok(!branch.includes('progress_percentage'), 'update-task.ts: moving out of done now resets progress, so the prose reason is stale');
  const done = fs.readFileSync(complete, 'utf8');
  const un = done.slice(done.indexOf('export async function uncompletePmTaskForAccount'));
  assert.ok(/completed_at: null, progress_percentage: targetProgress/.test(un), 'complete-task.ts: uncomplete no longer clears completed_at and resets progress');
  assert.ok(un.includes('syncAnnotationsFromTask('), 'complete-task.ts: uncomplete no longer reopens the linked annotation');
});

test('source cross-check: the builder answers an empty roster with the hint the prose describes', (t) => {
  const route = path.join(BUILDER, 'src', 'app', 'api', 'olympus', 'crm', 'users', 'route.ts');
  if (!fs.existsSync(route)) {
    t.diagnostic('source cross-check skipped: hiveku_builder checkout not beside this repo');
    return;
  }
  const src = fs.readFileSync(route, 'utf8');
  if (!src.includes('EMPTY_ROSTER_HINT')) {
    t.diagnostic('source cross-check skipped: the builder checkout beside this repo predates the empty-roster hint');
    return;
  }
  // The constant is a concatenation of quoted pieces; join them before reading it.
  const hint = flat(src.slice(src.indexOf('EMPTY_ROSTER_HINT ='), src.indexOf('export async function GET')).replace(/'\s*\+\s*'/g, ''));
  assert.match(hint, /Team Members/, 'the hint no longer names Team Members - the prose must change');
  assert.match(hint, /unset/, 'the hint no longer says to leave the assignee unset - the prose must change');
  assert.match(hint, /never substitute an id from another account/, 'the hint no longer forbids a foreign id - the prose must change');
  assert.match(hint, /Inviting a person under Team Members makes them assignable/, 'the hint no longer says how to become assignable');
  assert.match(src, /return NextResponse\.json\(\{ users: shaped, hint: EMPTY_ROSTER_HINT \}\)/, 'the empty roster is no longer answered as { users: [], hint }');
  if (!hint.includes('pm_project_team')) {
    t.diagnostic('PM roster pins skipped: the builder checkout predates the pm_project_team hint');
    return;
  }
  // Since the PM roster: the hint sends PM assignment to pm_project_team and
  // says what an omitted and a null assigned_to_id do, as the prose does.
  assert.match(hint, /omit assigned_to_id to let the section or project default assignee apply/, 'the hint no longer says an omitted assignee takes the default');
  assert.match(hint, /pass null to create it unassigned/, 'the hint no longer says null means unassigned');
});

test('source cross-check: the builder refuses a non-member assignee the way the prose says', (t) => {
  const helper = path.join(BUILDER, 'src', 'lib', 'pm', 'assignee.ts');
  if (!fs.existsSync(helper)) {
    t.diagnostic('source cross-check skipped: no round-3 hiveku_builder checkout beside this repo');
    return;
  }
  const src = fs.readFileSync(helper, 'utf8');
  // Read each refusal body itself: the codes also appear in the type union above them.
  const body = (name) => {
    const at = src.indexOf(`export const ${name}`);
    assert.ok(at >= 0, `assignee.ts no longer exports ${name} - the prose must change`);
    return src.slice(at, src.indexOf('});', at));
  };
  const notMember = body('PM_ASSIGNEE_NOT_MEMBER');
  assert.match(notMember, /code: 'user_not_in_account'/, 'the refusal code changed - the prose must change');
  assert.match(notMember, /Invite them under Settings > Team Members first, or leave the task unassigned/, 'the refusal no longer names Settings > Team Members');
  assert.match(body('PM_ASSIGNEE_INVALID_ID'), /code: 'invalid_assignee_id'/, 'the invalid-id code changed - the prose must change');
  const bulk = fs.readFileSync(path.join(BUILDER, 'src', 'app', 'api', 'olympus', 'pm', 'tasks', 'bulk', 'route.ts'), 'utf8');
  assert.match(bulk, /\[\{ index, assigned_to_id: t\.assigned_to_id \}\]/, 'bulk create no longer lists { index, assigned_to_id } per bad row');
});

// Round 3 fact-check (2026-09-26). spawn-recurrence.ts re-checks the stored
// assignee at every fire with no exemption for the current one, so a
// recurrence set up before the check with a non-member also spawns unassigned
// (the old text said only "if the assignee later leaves"). And the refusal body
// is { error: <sentence>, code, field }: the code is not in `error`.
test('round-3 fact-check: a recurrence re-checks at every fire, and the refusal code is in `code`', () => {
  const pm = flat(read(PM));
  assert.match(pm, /If the assignee is not a team member when an occurrence fires \(they left, or the recurrence predates the check\)/);
  assert.doesNotMatch(pm, /If the assignee later leaves the team/, 'every fire checks, whatever the reason the assignee is not a member');
  assert.match(pm, /sending the current assignee back on `pm_task_recurrence_update` is accepted but does not stop that/);
  const ids = bulletContaining(PM, '**An empty roster is a real answer.**');
  assert.match(ids, /the body is `\{ error, code, field: 'assigned_to_id' \}`, so read the code from `code`/);
});

test('source cross-check: a recurrence fire checks the stored assignee with no current-assignee exemption', (t) => {
  const spawn = path.join(BUILDER, 'src', 'lib', 'pm', 'spawn-recurrence.ts');
  // assignee.ts is the round-3 marker: an older checkout has spawn-recurrence.ts
  // without the check, which is not a regression, just a stale sibling.
  if (!fs.existsSync(spawn) || !fs.existsSync(path.join(BUILDER, 'src', 'lib', 'pm', 'assignee.ts'))) {
    t.diagnostic('source cross-check skipped: no round-3 hiveku_builder checkout beside this repo (set HIVEKU_BUILDER_PATH)');
    return;
  }
  const src = fs.readFileSync(spawn, 'utf8');
  const call = src.slice(src.indexOf('await checkPmAssignee({'), src.indexOf('});', src.indexOf('await checkPmAssignee({')));
  assert.ok(call.includes('candidate: assignedToId'), 'the fire no longer checks the stored assignee');
  assert.ok(!call.includes('currentAssigneeId'), 'the fire now exempts the current assignee - the prose must change');
  assert.ok(src.includes('assignee_dropped: dropped'), 'the fire no longer records assignee_dropped');
});

// Default assignees (builder PR #205). Each branch the prose describes, read
// from the builder source; skipped on a checkout that predates the defaults.
/**
 * A route's source plus the src/lib/pm helpers it imports. Builder PR #245
 * moved the Olympus PM writes into shared helpers (update-task.ts,
 * project-write.ts, sections.ts) that the agent servers' internal routes run
 * too, so a rule pinned on the route may now live in the helper. On a builder
 * where the route still does the work, the route's own text is what matches.
 */
function withPmHelpers(routeText) {
  let out = routeText;
  for (const m of routeText.matchAll(/from '@\/lib\/pm\/([a-z-]+)'/g)) {
    const helper = path.join(BUILDER, 'src', 'lib', 'pm', `${m[1]}.ts`);
    if (fs.existsSync(helper)) out += '\n' + fs.readFileSync(helper, 'utf8');
  }
  return out;
}

test('source cross-check: the builder applies and refuses defaults the way the prose says', (t) => {
  const src = (...p) => {
    const file = path.join(BUILDER, 'src', ...p);
    assert.ok(fs.existsSync(file), `${p.join('/')} is gone - the prose must change`);
    return fs.readFileSync(file, 'utf8');
  };
  const helperPath = path.join(BUILDER, 'src', 'lib', 'pm', 'assignee.ts');
  if (!fs.existsSync(helperPath) || !fs.readFileSync(helperPath, 'utf8').includes('export async function resolvePmDefaultAssignee')) {
    t.diagnostic('source cross-check skipped: no hiveku_builder checkout with default assignees (set HIVEKU_BUILDER_PATH)');
    return;
  }
  const helper = fs.readFileSync(helperPath, 'utf8');
  // The default refusal names its own field.
  const defaultCheck = helper.slice(helper.indexOf('export async function checkPmDefaultAssignee'), helper.indexOf('export async function resolvePmDefaultAssignee'));
  assert.match(defaultCheck, /field: 'default_assignee_id'/, 'a default refusal no longer answers field: default_assignee_id');
  // Section first, then project; each re-checked against the current team.
  const resolve = helper.slice(helper.indexOf('export async function resolvePmDefaultAssignee'));
  assert.match(resolve, /for \(const id of \[sectionDefault, includeProject \? projectDefault : null\]\)/, 'the section default no longer wins over the project default');
  assert.match(resolve, /await checkPmAssignee\(\{ candidate, teamAccountIds: team \}\)/, 'a default is no longer re-checked against the current team');

  // Create: only an absent key, only a top-level task, never an agent's. The
  // create moved out of the Olympus route into src/lib/pm/create-task.ts (shared
  // with the agent servers' internal route), with its own local names, so read
  // whichever file carries it. The guard's names are pinned in both shapes: a
  // shape-only match (\w+) also passed a guard on the RESOLVED assignee (never
  // undefined, so no default would ever apply) or on the section instead of the
  // agent.
  const createHelper = path.join(BUILDER, 'src', 'lib', 'pm', 'create-task.ts');
  const hasHelper = fs.existsSync(createHelper);
  const create = hasHelper
    ? fs.readFileSync(createHelper, 'utf8')
    : src('app', 'api', 'olympus', 'pm', 'tasks', 'route.ts');
  assert.match(create, /if \((?:assigned_to_id|assignedToIdInput) === undefined && !(?:parent_task_id|hasParent) && !(?:agent_codename|agentCodename)\) \{\s*assignedToId = await resolvePmDefaultAssignee/, 'pm_tasks_create no longer applies the default only to an absent key on a top-level, non-agent task');
  if (hasHelper) {
    // The raw body key, before any resolution: only a missing key means "apply
    // the default". Anchored to the end of the statement: `body.assigned_to_id
    // ?? null` would never be undefined, so no default would ever apply.
    assert.match(create, /^[ \t]*const assignedToIdInput = body\.assigned_to_id[ \t]*;?[ \t]*$/m, 'create-task.ts no longer reads the guard\'s assignee from the raw body key');
    assert.doesNotMatch(create, /const assignedToIdInput = body\.assigned_to_id\s*(\?\?|\|\||&&|\?)/, 'create-task.ts defaults the raw assignee key, so it is never undefined');
  }
  const bulk = src('app', 'api', 'olympus', 'pm', 'tasks', 'bulk', 'route.ts');
  assert.match(bulk, /if \(t\.assigned_to_id !== undefined \|\| t\.parent_task_id\) \{/, 'bulk create no longer skips the default for a named assignee or a subtask');

  // Move: section default only, only when the write names no assignee.
  const update = withPmHelpers(src('app', 'api', 'olympus', 'pm', 'tasks', '[id]', 'route.ts'));
  const move = update.slice(update.indexOf('const nextSectionId'), update.indexOf('prisma.pm_tasks.update(', update.indexOf('const nextSectionId')));
  assert.ok(move.includes("!('assigned_to_id' in data)"), 'a move now applies the default even when the write names an assignee');
  assert.ok(move.includes('!existing.assigned_to_id'), 'a move now reassigns a task someone holds');
  assert.ok(move.includes('includeProjectDefault: false'), 'a move now applies the project default too');

  // Where defaults are written.
  const projects = withPmHelpers(src('app', 'api', 'olympus', 'pm', 'projects', '[id]', 'route.ts'));
  // Any key may follow it in the allow-list (website_project_id does since review2 C3).
  assert.match(projects, /const allowed = \[[^\]]*'default_assignee_id',[^\]]*\] as const/, 'pm_projects_update no longer allows default_assignee_id');
  assert.ok(projects.includes('checkPmDefaultAssignee('), 'the project default is no longer validated');
  for (const p of [['sections', 'route.ts'], ['sections', '[sectionId]', 'route.ts']]) {
    assert.ok(withPmHelpers(src('app', 'api', 'olympus', 'pm', 'projects', '[id]', ...p)).includes('checkPmDefaultAssignee('), `${p.join('/')} no longer validates default_assignee_id`);
  }

  // Recurrence occurrences and workflow createTask take the default too.
  const spawn = src('lib', 'pm', 'spawn-recurrence.ts');
  assert.match(spawn, /if \(!assignedToId && !rec\.olympus_agent_codename\) \{\s*assignedToId = await resolvePmDefaultAssignee/, 'an occurrence with nobody on it no longer takes the default');
  const workflow = src('lib', 'workflow', 'nodeHandlers', 'pmActions.ts');
  assert.match(workflow, /assignee\.assignedToId \?\?\s*\(await resolvePmDefaultAssignee\(/, 'an empty assignToId on createTask no longer takes the default');
  assert.match(workflow, /if \(!candidate\) return \{ ok: true, assignedToId: undefined \}/, 'an empty assignToId is no longer "no assignee named"');
});

test('source cross-check: pm_project_team reads the project team the prose describes', (t) => {
  const route = path.join(BUILDER, 'src', 'app', 'api', 'olympus', 'pm', 'projects', '[id]', 'team', 'route.ts');
  if (!fs.existsSync(route)) {
    t.diagnostic('source cross-check skipped: no hiveku_builder checkout with GET /api/olympus/pm/projects/:id/team (set HIVEKU_BUILDER_PATH)');
    return;
  }
  const src = fs.readFileSync(route, 'utf8');
  assert.ok(src.includes('pmTeamAccountIds(project.id, project.account_id)'), 'the roster is no longer the project team (primary + active co-owners)');
  assert.ok(src.includes('revealOtherCompanyEmails: false'), 'the other company\'s emails are no longer hidden');
  assert.ok(src.includes('where: { id, account_id: auth.accountId }'), 'the project is no longer scoped to the key\'s account');
  for (const key of ['default_assignee_id:', 'shared:', 'teams:', 'members:']) {
    assert.ok(src.includes(key), `the response no longer carries ${key.slice(0, -1)}`);
  }
});

test('source cross-check: a review task takes the review assignee before the project default', (t) => {
  const route = path.join(BUILDER, 'src', 'app', 'api', 'internal', 'pm', 'task-event', 'route.ts');
  const helper = path.join(BUILDER, 'src', 'lib', 'review', 'review-assignee.ts');
  if (!fs.existsSync(route) || !fs.existsSync(helper)) {
    t.diagnostic('source cross-check skipped: no hiveku_builder checkout with the review assignee (set HIVEKU_BUILDER_PATH)');
    return;
  }
  assert.ok(fs.readFileSync(helper, 'utf8').includes("'review_assignee_id'"), 'the setting is no longer annotation_settings.review_assignee_id');
  const src = fs.readFileSync(route, 'utf8');
  const review = src.indexOf('resolveReviewTaskAssignee(');
  const fallback = src.indexOf('resolvePmDefaultAssignee(', review);
  assert.ok(review >= 0 && fallback > review, 'the review assignee no longer comes before the section/project default');
  const agents = fs.readFileSync(path.join(BUILDER, 'src', 'app', 'api', 'olympus', 'builder', 'projects', '[projectId]', 'annotations-settings', 'route.ts'), 'utf8');
  assert.ok(agents.includes("const REVIEW_ASSIGNEE_FIELD = 'review_assignee_id'"), 'the agents\' annotation settings route no longer reads or writes review_assignee_id');
  assert.match(agents, /checkReviewAssignee\(\{[\s\S]*?field: REVIEW_ASSIGNEE_FIELD/, 'the review assignee refusal no longer names field: review_assignee_id');
  assert.match(fs.readFileSync(helper, 'utf8'), /body: \{ error, code: check\.body\.code, field: args\.field \}/, 'the review assignee refusal no longer carries the caller\'s field name');
});

/** One tool declaration: from `name: '<tool>'` to the next tool's name line. */
function toolDecl(src, tool) {
  const at = src.indexOf(`name: '${tool}'`);
  assert.ok(at >= 0, `the MCP server no longer declares ${tool} - the prose must change`);
  const next = src.slice(at + 8).search(/\n\s*name: '[a-z0-9_]+',/);
  return next < 0 ? src.slice(at) : src.slice(at, at + 8 + next);
}

// The tools the prose tells agents to call, read from the MCP declarations:
// the roster and its visibility, and the fields the default and review
// assignee writes need. Skipped on a checkout that predates pm_project_team.
test('source cross-check: the MCP server declares the roster and the assignee fields the prose names', (t) => {
  const olympusPath = path.join(MCP, 'src', 'tools', 'olympus-tools.ts');
  if (!fs.existsSync(olympusPath) || !fs.readFileSync(olympusPath, 'utf8').includes("name: 'pm_project_team'")) {
    t.diagnostic('source cross-check skipped: no hiveku-mcp-api-server checkout with pm_project_team (set HIVEKU_MCP_PATH)');
    return;
  }
  const olympus = fs.readFileSync(olympusPath, 'utf8');
  const marketing = fs.readFileSync(path.join(MCP, 'src', 'tools', 'marketing-tools.ts'), 'utf8');

  const team = toolDecl(olympus, 'pm_project_team');
  assert.match(team, /method: 'GET',\s*path: '\/api\/olympus\/pm\/projects\/:id\/team'/, 'pm_project_team no longer reads GET /api/olympus/pm/projects/:id/team');
  assert.match(team, /required: \['project_id'\]/, 'pm_project_team no longer takes project_id');

  // orient: every key that can create a PM task sees the roster. pm_tasks_create
  // comes with the pm_ prefix; create_task only by name, in TASK_NAMES.
  const profiles = fs.readFileSync(path.join(MCP, 'src', 'tools', 'profiles.ts'), 'utf8');
  const start = profiles.indexOf('const TASK_NAMES = [');
  assert.ok(start >= 0, 'profiles.ts no longer has TASK_NAMES - re-check who can see pm_project_team');
  const taskNames = profiles.slice(start, profiles.indexOf('];', start));
  assert.ok(taskNames.includes("'create_task'"), 'create_task left TASK_NAMES - re-check the orient visibility sentence');
  assert.ok(taskNames.includes("'pm_project_team'"), 'pm_project_team is not granted wherever create_task is - the orient visibility sentence is wrong');

  // Where defaults are written. pm_projects_update forwards declared
  // properties; the section tools forward only bodyParams.
  assert.match(toolDecl(olympus, 'pm_projects_update'), /default_assignee_id: \{/, 'pm_projects_update no longer declares default_assignee_id');
  for (const tool of ['pm_sections_create', 'pm_sections_update']) {
    assert.match(toolDecl(marketing, tool), /bodyParams: \[[^\]]*'default_assignee_id'/, `${tool} no longer forwards default_assignee_id`);
  }
  assert.match(toolDecl(olympus, 'project_annotation_settings_set'), /bodyParams: \[[^\]]*'review_assignee_id'/, 'project_annotation_settings_set no longer forwards review_assignee_id');

  // review2 C2: the setter points at the getter's roster, never crm_list_users.
  const setter = toolDecl(olympus, 'project_annotation_settings_set');
  assert.ok(setter.includes("project_annotation_settings_get's review_assignee.people"), 'project_annotation_settings_set no longer names review_assignee.people as the source of the id');
  assert.ok(!setter.includes('crm_list_users'), 'project_annotation_settings_set sends the agent to crm_list_users again');
  assert.ok(toolDecl(olympus, 'project_annotation_settings_get').includes('review_assignee: { assignee_id, stale'), 'project_annotation_settings_get no longer describes review_assignee');
  // review2 C3: the link the prose names is writable on create and update.
  // pm_projects_update has no bodyParams, so declaring it forwards it.
  assert.match(toolDecl(olympus, 'pm_projects_update'), /website_project_id: \{\s*type: \['string', 'null'\]/, 'pm_projects_update no longer declares website_project_id (string or null)');
  assert.match(toolDecl(olympus, 'pm_projects_create'), /bodyParams: \[[^\]]*'website_project_id'/, 'pm_projects_create no longer forwards website_project_id');
  // review2 C1: create_task (no bodyParams) declares section_id, so the
  // "section's default" the PM skill promises for it can apply.
  assert.match(toolDecl(olympus, 'create_task'), /section_id: \{/, 'create_task no longer declares section_id - the Omit, null, or an id bullet names it');
});

// Rounds 7 and 8 pinned "only the dashboard create makes PM - <site>". Round 9
// (builder #242, "Give every new site one linked PM project when it is
// created"): every path that creates a website_projects row calls
// createSiteBirthPmProject (src/lib/pm/site-birth.ts) after the site has
// committed, so the prose now says every new site gets "PM - <site>" when it
// is created, and names the MCP site tools and clones only for sites made
// before that. Read both sides so the sentence follows the code.
test('source cross-check: every site birth path calls the site-birth helper, which makes "PM - <site>" and never throws', (t) => {
  const src = (...p) => path.join(BUILDER, 'src', ...p);
  const helper = src('lib', 'pm', 'site-birth.ts');
  const dashboard = src('app', 'api', 'builder', 'projects', 'route.ts');
  const olympusCreate = src('app', 'api', 'olympus', 'builder', 'projects', 'route.ts');
  const olympusClone = src('app', 'api', 'olympus', 'builder', 'projects', '[projectId]', 'clone', 'route.ts');
  const dashboardClone = src('app', 'api', 'builder', 'projects', '[projectId]', 'clone', 'route.ts');
  const clone = src('lib', 'builder', 'project-clone.service.ts');
  const webflow = src('app', 'api', 'builder', 'webflow', 'projects-from-site', 'route.ts');
  const githubImport = src('app', 'api', 'github', 'import', 'route.ts');
  const githubImportStream = src('app', 'api', 'github', 'import-stream', 'route.ts');
  const cardMenu = src('components', 'dashboard', 'ProjectCardMenu.tsx');
  const olympusTools = path.join(MCP, 'src', 'tools', 'olympus-tools.ts');
  const files = [helper, dashboard, olympusCreate, olympusClone, dashboardClone, clone, webflow, githubImport, githubImportStream, cardMenu, olympusTools];
  if (!files.every((f) => fs.existsSync(f))) {
    t.diagnostic('source cross-check skipped: no hiveku_builder checkout with src/lib/pm/site-birth.ts (builder #242) and no hiveku-mcp-api-server checkout (set HIVEKU_BUILDER_PATH and HIVEKU_MCP_PATH)');
    return;
  }
  const read = (f) => fs.readFileSync(f, 'utf8');
  const rel = (f) => path.relative(BUILDER, f);

  // The helper: "PM - <site>" through the one get-or-create under the
  // per-website lock, and a failure is reported, never thrown.
  const birth = read(helper);
  assert.ok(birth.includes('export async function createSiteBirthPmProject('), 'site-birth.ts no longer exports createSiteBirthPmProject - the prose must change');
  assert.ok(birth.includes('`PM - ${'), 'the site-birth project is no longer named "PM - <site>"');
  assert.ok(birth.includes('getOrCreatePrimaryLinkedPmProject('), 'the site-birth project no longer goes through getOrCreatePrimaryLinkedPmProject (a second writer could make a duplicate)');
  const body = birth.slice(birth.indexOf('export async function createSiteBirthPmProject('));
  assert.match(body, /\} catch \(\w+\) \{[\s\S]*?return null;?/, 'createSiteBirthPmProject no longer catches and returns null - a PM failure could fail a site create');

  // Every birth path calls it: the dashboard create in each branch (external,
  // python-lambda, expo, regular), the Olympus create behind site_create and
  // site_create_external (external, name reuse, hosted), the clone service
  // behind both clone routes, Webflow projects-from-site and both GitHub
  // createNew imports.
  const calls = (f) => (read(f).match(/\bcreateSiteBirthPmProject\(/g) ?? []).length;
  for (const [file, min] of [[dashboard, 4], [olympusCreate, 3], [clone, 1], [webflow, 1], [githubImport, 1], [githubImportStream, 1]]) {
    assert.ok(calls(file) >= min, `${rel(file)} calls createSiteBirthPmProject ${calls(file)} time(s), expected at least ${min} - "every new site gets PM - <site>" must change`);
  }
  // No birth path still makes its own PM project beside the helper.
  for (const file of [dashboard, olympusCreate, clone, webflow, githubImport, githubImportStream]) {
    assert.doesNotMatch(read(file), /\b(prisma|tx)\.pm_projects\.create\(/, `${rel(file)} creates a PM project itself again - a second "PM - <site>" path`);
  }
  // Webflow makes it after the site's transaction has committed, not inside it.
  const wf = read(webflow);
  assert.ok(wf.indexOf('createSiteBirthPmProject(') > wf.indexOf('prisma.$transaction('), 'Webflow projects-from-site makes the PM project inside (or before) the site transaction');
  // A clone copies nothing PM-related; it gets its own fresh project.
  assert.doesNotMatch(read(clone), /\bpm_(tasks|task_sections|milestones|projects)\b/, 'the clone service now copies PM rows - the "the clone gets its own new PM - <name>" prose must change');
  for (const file of [olympusClone, dashboardClone]) {
    assert.ok(fs.readFileSync(file, 'utf8').includes('projectCloneService.cloneProject('), `${path.relative(BUILDER, file)} no longer runs the clone service`);
  }
  assert.ok(
    fs.readFileSync(cardMenu, 'utf8').includes('fetch(`/api/builder/projects/${project.id}/clone`'),
    "the dashboard's Clone Project no longer posts to /api/builder/projects/:projectId/clone",
  );
  const olympus = fs.readFileSync(olympusTools, 'utf8');
  for (const tool of ['site_create', 'site_create_external']) {
    assert.match(toolDecl(olympus, tool), /path: '\/api\/olympus\/builder\/projects',/, `${tool} no longer posts to /api/olympus/builder/projects`);
  }
  assert.match(toolDecl(olympus, 'site_clone'), /path: '\/api\/olympus\/builder\/projects\/:projectId\/clone',/, 'site_clone no longer posts to .../clone');
});

// Round 8: the orient and PM skills say linking an older existing project moves
// feedback, because the rule goes by the project's creation date, not the link
// date. That holds while the primary-link order is created_at then id and the
// Olympus PATCH that links a project cannot write created_at.
test('source cross-check: the primary linked project is ordered by creation date, which a PATCH cannot change', (t) => {
  const primaryLink = path.join(BUILDER, 'src', 'lib', 'pm', 'primary-link.ts');
  const patchRoute = path.join(BUILDER, 'src', 'app', 'api', 'olympus', 'pm', 'projects', '[id]', 'route.ts');
  if (![primaryLink, patchRoute].every((f) => fs.existsSync(f))) {
    t.diagnostic('source cross-check skipped: no hiveku_builder checkout with src/lib/pm/primary-link.ts (set HIVEKU_BUILDER_PATH)');
    return;
  }
  assert.ok(
    fs.readFileSync(primaryLink, 'utf8').includes("return [{ created_at: 'asc' }, { id: 'asc' }]"),
    'the primary-link order is no longer created_at then id - the "creation date, not the link date" prose must change',
  );
  const allowed = withPmHelpers(fs.readFileSync(patchRoute, 'utf8')).match(/const allowed = \[([\s\S]*?)\]/);
  assert.ok(allowed, 'the Olympus PM project PATCH no longer declares its allow-list as `const allowed = [...]`');
  assert.doesNotMatch(allowed[1], /'created_at'/, 'the Olympus PM project PATCH now writes created_at - linking could reorder projects');
});
