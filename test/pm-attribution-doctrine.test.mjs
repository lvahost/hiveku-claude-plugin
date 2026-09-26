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
 * keep the prose on the same rule everywhere it names crm_list_users as the
 * source of an assignee: an empty roster is a real answer, the task or record
 * is created unassigned, no stand-in id, and the user is told once how to
 * become assignable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const ORIENT = 'skills/hiveku-orient/SKILL.md';
const PM = 'skills/hiveku-pm-mission-control/SKILL.md';
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
  assert.match(block, /Team Members/, `${rel}: must say crm_list_users lists the account's Team Members`);
  assert.match(block, /`\{ users: \[\], hint \}`/, `${rel}: must name the empty response shape`);
  assert.match(block, /unassigned/, `${rel}: must say the task is created unassigned`);
  assert.match(block, /[Nn]ever borrow another member's id/, `${rel}: must forbid a stand-in member id`);
  assert.match(block, /never use an id from\s+another account/, `${rel}: must forbid an id from another account`);
  assert.match(block, /[Tt]ell the user once that inviting them under Team\s+Members makes them\s+assignable/, `${rel}: must tell the user once how to become assignable`);
}

test('orient carries the empty-roster rule inside the PM-tasks bullet', () => {
  const block = bulletContaining(ORIENT, '**PM tasks are required.**');
  assert.match(block, /\*\*An empty roster is a real answer\.\*\*/, 'orient: the rule must open with its name');
  assertEmptyRosterRule(ORIENT, block);
  assert.match(block, /leave `assigned_to_id` \(and `owner_id` on CRM records\) unset/, 'orient: must say which fields stay unset');
  assert.match(block, /Agency and SaaS operators working a client account without an invitation are not listed and cannot be assigned/, 'orient: must say who is missing from the roster and why');
  assert.match(
    block,
    /A tool missing from the key's profile is a scope question; the tool answering an empty list is the empty-roster case above/,
    'orient: must separate a scoped-out tool from an empty answer',
  );
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
  assert.match(ids, /Editing other fields of a task already held by a non-member still works/, 'pm: older assignments are left alone');
  assert.doesNotMatch(ids, /still accept any user id/, 'pm: the server now checks membership');

  const scope = flat(read(PM));
  assert.match(
    scope,
    /`crm_list_users` being present and returning an empty list: that is the account's real roster, and the answer is an unassigned task/,
    'pm Key scope: an empty list is not a key problem',
  );

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
  assert.match(recurrence, /each occurrence spawns unassigned and its `ai_metadata` records `assignee_dropped`/, 'pm: a departed recurrence assignee spawns unassigned');
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
  ]) {
    assert.ok(index.has(name), `${name} is not in lib/tool-index.json`);
  }
});

test('source cross-check: the builder answers an empty roster with the hint the prose describes', (t) => {
  const route = path.join(root, '..', 'hiveku_builder', 'src', 'app', 'api', 'olympus', 'crm', 'users', 'route.ts');
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
});

test('source cross-check: the builder refuses a non-member assignee the way the prose says', (t) => {
  const helper = path.join(root, '..', 'hiveku_builder', 'src', 'lib', 'pm', 'assignee.ts');
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
  const bulk = fs.readFileSync(path.join(root, '..', 'hiveku_builder', 'src', 'app', 'api', 'olympus', 'pm', 'tasks', 'bulk', 'route.ts'), 'utf8');
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
  const spawn = path.join(root, '..', 'hiveku_builder', 'src', 'lib', 'pm', 'spawn-recurrence.ts');
  if (!fs.existsSync(spawn)) {
    t.diagnostic('source cross-check skipped: no round-3 hiveku_builder checkout beside this repo');
    return;
  }
  const src = fs.readFileSync(spawn, 'utf8');
  const call = src.slice(src.indexOf('await checkPmAssignee({'), src.indexOf('});', src.indexOf('await checkPmAssignee({')));
  assert.ok(call.includes('candidate: assignedToId'), 'the fire no longer checks the stored assignee');
  assert.ok(!call.includes('currentAssigneeId'), 'the fire now exempts the current assignee - the prose must change');
  assert.ok(src.includes('assignee_dropped: dropped'), 'the fire no longer records assignee_dropped');
});
