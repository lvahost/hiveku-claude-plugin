/**
 * Who a social post is for and why (2026-11-14): the social texts name the strategy check and the strategy write.
 *
 * The tool server gained two tools:
 *   - social_post_strategy_check (POST, read-only): checks a draft or a saved post item by item - who it is for, where
 *     they are in their journey (the stage, its step and its job), which before and after row it shows, the ask,
 *     proof, voice, and on each network the first line before the cut, the link, the hashtags and repeats. Each item
 *     is ok, fix, ask (a question only the person can answer) or not_set. It only reads: it never blocks a post, costs
 *     nothing and calls no AI. It does not score copy; the rubric stays the agent's.
 *   - social_post_strategy_update (PATCH): sets or fixes a post's pillar, ICP, journey, stage, grid, row and tags, on
 *     any post, published included, and changes nothing else.
 * And every journey read now carries each stage's step (awareness, one of six) and where it came from
 * (awareness_source: template, person or guess); customer_journey_stage_update takes awareness and stores it as the
 * person's.
 *
 * What this file holds:
 *   1. Every social text that saves, schedules or sends a post for approval runs the check first: it is named before
 *      social_post_validate there, the ask items go to the person, a fix item about the ICP, the journey or the grid
 *      is the person's (never fixed in the post), and every spelled-out call sends the draft.
 *   2. Nothing tells an agent to set a person's picks without asking: every unit (a paragraph, a list item, a table
 *      row) that names the strategy write, or the stage update with awareness, says in that same unit that the
 *      person is asked or gives their word, and nothing there takes it back ("without asking").
 *   3. The words stay true to the tool: a unit naming the check never says it blocks, costs or calls AI, and a
 *      sentence about the check never says it scores, except to say it does not.
 *   4. Each stage's step: the six steps and three sources, the stage id the server keeps, and the sixth step
 *      (Already a customer) in the stage tables and the stage: tag lists.
 *   5. The Social team's own agent has neither tool, takes no grid row and keeps no stage id, and reads its journeys
 *      as stored (a stage only Hiveku guesses carries no step there): every line naming those in the references
 *      scripts/gen-social-playbooks.mjs copies into that agent's playbook carries the generator's plugin-only tag,
 *      and what it keeps says what a stage with no step means.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/**
 * Line breaks and their indent folded to one space, and the generator's plugin-only tags (which end lines) taken out,
 * so a phrase wrapped across lines still matches. Test 5 reads the raw lines, tags and all.
 */
const fold = (text) => text.replace(/ *<!-- plugin-only -->/g, '').replace(/\s*\n\s*/g, ' ');

const CHECK = 'social_post_strategy_check';
const WRITE = 'social_post_strategy_update';
const STAGE_WRITE = 'customer_journey_stage_update';
const PLUGIN_ONLY = '<!-- plugin-only -->';
/**
 * Fields the Social team's agent cannot use: its own post create and update take no settings (so no grid row), and
 * its posts keep no stage id; the generator's translation table maps no customer_journey_stage_list.
 */
const AGENT_LACKS = ['before_after_item_id', 'journey_stage_id', 'customer_journey_stage_list'];

const SKILL = 'skills/hiveku-social-agency/SKILL.md';
const REF = (name) => `skills/hiveku-social-agency/references/${name}`;
const MECHANICS = REF('publishing-approval-mechanics.md');
const GROUNDING = REF('audience-grounding.md');
const ANTI_FLUFF = REF('anti-fluff.md');
const HOOKS = REF('hooks-and-formats.md');
const RECIPES = REF('recipes.md');
const REPURPOSE_REF = REF('repurpose.md');
const ANALYST = 'agents/hiveku-social-analyst.md';

/** The commands that save a draft (or a batch of them) and run social_post_validate before it. */
const DRAFTING_COMMANDS = [
  'commands/social-post.md',
  'commands/social-plan.md',
  'commands/social-calendar.md',
  'commands/social-proof.md',
  'commands/repurpose.md',
];

/** Blank-line separated paragraphs with the line each starts on, so an offender is named file:line. */
function paragraphsOf(text) {
  const out = [];
  let line = 1;
  for (const block of text.split(/\n[ \t]*\n/)) {
    out.push({ line, text: block });
    line += block.split('\n').length + 1;
  }
  return out;
}

/**
 * The units a reader takes one at a time: a paragraph, and inside it each list item (a line opening `- `, `* ` or
 * `N. `), each table row and each heading on its own, with its continuation lines. So a rule written as one bullet
 * of a long list is read as that bullet, never with the list's other bullets.
 */
function unitsOf(text) {
  const out = [];
  let current = null;
  text.split('\n').forEach((raw, i) => {
    if (!raw.trim()) {
      current = null;
      return;
    }
    const opens = /^\s*(?:[-*] |\d+\. |\| |#{1,6} )/.test(raw);
    if (!current || opens) {
      current = { line: i + 1, text: raw };
      out.push(current);
    } else current.text += `\n${raw}`;
  });
  return out;
}

/** A list of tools an agent lacks or must never call ("It has NO `a`, `b`", "Never call `a`, `b`, or"), taken out. */
const TOOLS_IT_LACKS = /\b(?:has no|Never call|never)\s+(?:`[\w*]+`(?:\([^)]*\))?(?:,\s*(?:or\s+)?|\s+or\s+)?)+/gi;

/** Words that take the asking back: "Without asking the person", "no need to ask". */
const DENIES_ASKING = /without (?:asking|the (?:person|client)|their (?:word|yes|answer))|no need to ask|(?:need not|needn't|do not need to|don't need to) ask|instead of asking|skip(?:ping)? the question/i;

/** Every .md the plugin's prose lives in: the skills, the commands, the agents. */
function proseFiles() {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) out.push(child);
    }
  };
  walk('skills');
  walk('commands');
  walk('agents');
  return out.sort();
}

/** Sentences of a paragraph, its line breaks folded; a period inside `code` or a dotted name does not end one. */
function sentencesOf(paragraph) {
  return fold(paragraph).split(/(?<=[.!?])\s+(?=[A-Z`(*"])/);
}

const ASKS_THE_PERSON = /ask(?:s|ed|ing)? the (?:person|client)|the (?:person|client)'s (?:word|yes|answer)|(?:person|client) (?:says|said|has said|confirms|confirmed|answers|answered)/i;

/**
 * Where the check's items are explained: a fix item about the ICP, the journey or the grid is a pick or a
 * foundation, so it is never "fixed" in the post (the route's reasons there say "pick one of yours", "fill in
 * their pains and a quote in their own words", "link it to ...").
 */
const PICKS_ARE_THE_PERSONS =
  "A `fix` item in the `who`, `where` or `what` group (the ICP, the journey and its stage, the grid and its row) is about a pick or a foundation, not the post's words: tell the person what it says, change a pick only to what they choose, and change a foundation only as `hiveku-orient/references/foundation-first.md` says, never making up their pains or a quote in their own words.";

test('1. the skill runs the check before every save, schedule and send for approval, and says what it answers', () => {
  const skill = read(SKILL);
  // The operating principles are one bulleted block; the principle is its own bullet.
  const principleStart = skill.indexOf('- Who and why before every save');
  assert.ok(principleStart >= 0, 'the operating principle "Who and why before every save ..." is gone from the social skill');
  const principle = fold(skill.slice(principleStart, skill.indexOf('\n- ', principleStart + 1)));
  for (const words of [CHECK, 'social_create_post', 'social_update_post', 'social_publish_post', 'fix each `fix` item', 'ask the person each `ask` item', '`not_set`', WRITE, "on the person's word"]) {
    assert.ok(principle.includes(words), `the principle no longer says ${JSON.stringify(words)}`);
  }
  assert.match(principle, /never blocks a post, costs nothing,? (?:and )?calls no AI/, 'the principle must say what the MCP description says: never blocks, costs nothing, calls no AI');
  assert.match(principle, /Never answer an `ask` item yourself/, 'the principle must forbid answering an ask item for the person');
  assert.ok(principle.includes("fix each `fix` item about the post's own words"), "the principle fixes in the post only the items about the post's own words");
  assert.ok(principle.includes(PICKS_ARE_THE_PERSONS), 'the principle must say a who, where or what fix item is a pick or a foundation, never fixed in the post');
  assert.ok(principle.includes('never change what the person chose'), 'the principle must keep the person\'s picks');

  const play3 = fold(skill.slice(skill.indexOf('**Play 3 - Ideation and drafting.**'), skill.indexOf('**Play 4 - Creative and media.**')));
  assert.ok(play3.length > 0, 'Play 3 is gone from the social skill');
  const at = (s) => play3.indexOf(s);
  assert.ok(at(CHECK) >= 0, 'Play 3 must name the strategy check');
  assert.ok(at(CHECK) < at('Dry-run with `social_post_validate`'), 'Play 3 runs the check before the dry run');
  assert.ok(at('Dry-run with `social_post_validate`') < at('`social_create_post`'), 'Play 3 dry-runs before it persists');
  assert.ok(play3.includes(WRITE), 'Play 3 must say a published post\'s who-and-why changes through the strategy write');
  assert.ok(
    play3.includes('/hiveku:social-audit (the rubric and histogram of the last 30 posts; its only writes, each on a yes, are the memory line and the who-and-why fixes)'),
    'Play 3 must say what the audit writes, each on a yes, never that it is read-only',
  );
  assert.doesNotMatch(play3, /social-audit \(read-only/, 'the audit can end with the who-and-why fixes, so the skill must not call it read-only');

  const r8 = paragraphsOf(skill).find((p) => p.text.includes('- R8.'));
  assert.ok(r8 && r8.text.includes(CHECK), 'R8 must check who and why beside the caps');
  const play7 = skill.slice(skill.indexOf('**Play 7 - Publishing and scheduling.**'), skill.indexOf('**Play 8 - The approval queue'));
  assert.ok(play7.includes(CHECK), 'Play 7 must run the check before every schedule or send for approval');
  const invariant9 = skill.slice(skill.indexOf('9. A post at'), skill.indexOf('10. Every number'));
  assert.ok(invariant9.includes(WRITE), 'invariant 9 must name the one thing a published post still takes: its who-and-why');
});

test('1. the publishing reference checks before it validates, and documents the strategy write', () => {
  const ref = read(MECHANICS);
  const creating = ref.slice(ref.indexOf('## Creating a post (the order of operations)'), ref.indexOf('### Many drafts at once'));
  assert.ok(creating.length > 0, 'the "Creating a post" section is gone');
  const step = (n) => creating.search(new RegExp(`^${n}\\. `, 'm'));
  const checkStep = fold(creating.slice(step(2), step(3)));
  const validateStep = fold(creating.slice(step(3), step(4)));
  const createStep = fold(creating.slice(step(4), step(5)));
  assert.ok(checkStep.startsWith(`2. \`${CHECK}\``), 'step 2 of "Creating a post" is the strategy check');
  assert.ok(validateStep.startsWith('3. `social_post_validate`'), 'step 3 of "Creating a post" is the dry run');
  assert.ok(createStep.startsWith('4. `social_create_post` as a DRAFT'), 'step 4 of "Creating a post" is the draft create');
  for (const words of ["fix each `fix` item about the post's own words", 'ask the person each `ask` item', '`summary`', '`stage`', '`items`', 'never blocks a post, costs nothing', 'Never answer an `ask` item yourself', PICKS_ARE_THE_PERSONS, 'never change what the person chose']) {
    assert.ok(checkStep.includes(words), `the check step no longer says ${JSON.stringify(words)}`);
  }

  const section = fold(ref.slice(ref.indexOf(`### Who it is for, on any post: ${WRITE}`), ref.indexOf('### Re-driving a failure')));
  assert.ok(section.length > 0, `the "${WRITE}" section is gone from the publishing reference`);
  for (const words of ['published included', 'never changes the text', '`null` clears', 'replaces the whole tag list', 'send `journey_id` with it', '409 `post_changed`', '409 `post_publishing`', '400 `not_strategy`']) {
    assert.ok(section.includes(words), `the strategy write section no longer says ${JSON.stringify(words)}`);
  }
  assert.match(section, ASKS_THE_PERSON, 'the strategy write runs on the person\'s word');

  const pathB = ref.slice(ref.indexOf('## Path B'), ref.indexOf('## Deleting'));
  assert.ok(pathB.includes(CHECK), 'Path B fixes the targets, then validates AND checks before staging');
  const pitfall = paragraphsOf(ref).find((p) => fold(p.text).includes('"Post has no target accounts configured", discovered only at publish time'));
  assert.ok(pitfall && pitfall.text.includes(CHECK), 'the target-accounts pitfall runs the check with the real accounts too');
  const foundationRow = ref.split('\n').find((l) => l.startsWith('| `avatar_id`, `journey_id`, `journey_stage`'));
  assert.ok(foundationRow, 'the contract table lost its foundation row');
  for (const words of ['`settings.journey_stage_id`', '`settings.before_after_item_id`', WRITE]) {
    assert.ok(foundationRow.includes(words), `the foundation row no longer says ${JSON.stringify(words)}`);
  }
});

test('1. every drafting command runs the check before its dry run, fixes the fix items and asks the person the ask items', () => {
  for (const rel of DRAFTING_COMMANDS) {
    const text = fold(read(rel));
    const check = text.indexOf(CHECK);
    const validate = text.indexOf('social_post_validate');
    assert.ok(check >= 0, `${rel} does not run ${CHECK}`);
    assert.ok(validate >= 0, `${rel} no longer dry-runs with social_post_validate - re-read this pin`);
    assert.ok(check < validate, `${rel} names the dry run before the strategy check`);
    assert.ok(text.includes('fix each `fix` item'), `${rel} does not say to fix each fix item`);
    assert.match(text, /each `ask` item/, `${rel} does not say what happens to each ask item`);
    assert.match(text, /never answered by you|never answering one yourself/, `${rel} must leave each ask item to the person`);
  }
  const post = fold(read('commands/social-post.md'));
  // The check takes the draft as validate does, link and alt text included: its link item reads link_url, and the
  // voice item reads the alt text.
  const call = post.slice(post.indexOf(`\`${CHECK}({`), post.indexOf('})`', post.indexOf(`\`${CHECK}({`)));
  for (const field of ['content', 'target_platforms', 'target_accounts', 'platform_overrides', 'first_comment', 'link_url', 'media_asset_ids', 'media_alt_texts', 'avatar_id', 'journey_id', 'journey_stage', 'before_after_grid_id', 'before_after_item_id', 'pillar_id']) {
    assert.ok(new RegExp(`\\b${field}\\b`).test(call), `/hiveku:social-post's check call leaves out ${field}`);
  }
  assert.ok(post.includes('`link_url` and `media_alt_texts` included, without the schedule or the media types'), "/hiveku:social-post must say the check takes the draft as validate does, link and alt text included");
  assert.ok(
    post.includes("a `fix` item in the `who`, `where` or `what` group (the ICP, the journey and its stage, the grid and its row) is the person's, put to them at step 5's STOP, and you never make up an ICP's pains or a quote in their own words"),
    "/hiveku:social-post must leave a who, where or what fix item to the person",
  );
  const stop = post.slice(post.indexOf('5. STOP'), post.indexOf('6. Finish'));
  assert.match(stop, /`ask` item as a question/, '/hiveku:social-post shows each ask item at its STOP');
  assert.match(stop, /each `who`, `where` or `what` fix item as what the person needs to pick or fill in/, '/hiveku:social-post shows the who, where and what fix items at its STOP');
  assert.match(stop, /after any change to the copy or to what the post is for, run `social_post_strategy_check` again with its `post_id`/, '/hiveku:social-post checks a saved draft again after it changes');
  const plan = fold(read('commands/social-plan.md'));
  const step4 = plan.slice(plan.indexOf('4. Present the week'), plan.indexOf('5. Finish'));
  assert.ok(step4.indexOf(CHECK) >= 0 && step4.indexOf(CHECK) < step4.indexOf('`social_post_validate` with the draft\'s body'), '/hiveku:social-plan checks each post again before its scheduling update');
  const calendar = fold(read('commands/social-calendar.md'));
  const handoff = calendar.slice(calendar.indexOf('The schedule is `/hiveku:social-plan` step 4'), calendar.indexOf('5. Finish'));
  assert.ok(handoff.includes(CHECK), '/hiveku:social-calendar hands the schedule over with the check in its order');
  assert.ok(handoff.includes(`\`${CHECK}\` with the post's text, its picks and its \`post_id\``), "/hiveku:social-calendar's hand-off must send the check the post's text and picks, not its post_id alone");
});

test('1. every spelled-out call of the check sends the draft, never a post_id alone', () => {
  // content is required (the route answers 400 without it); a saved post's id only adds the repeat check and a
  // renamed stage.
  const offenders = [];
  let calls = 0;
  for (const rel of proseFiles()) {
    const text = fold(read(rel));
    for (const m of text.matchAll(new RegExp(`\`${CHECK}\\(\\{([^}]*)\\}\\)\``, 'g'))) {
      calls++;
      if (!/\bcontent\b|\.\.\./.test(m[1])) offenders.push(`${rel}: ${m[0].slice(0, 100)}`);
    }
    for (const m of text.matchAll(new RegExp(`\`${CHECK}\` with (?:the|its) \`post_id\``, 'g'))) offenders.push(`${rel}: ${m[0]}`);
  }
  assert.ok(calls >= 6, `only ${calls} spelled-out call(s) of the check - the walker is broken, or the texts lost them`);
  assert.deepEqual(offenders, [], 'the check takes the draft (content is required); these calls send it less');
});

test('1. the social audit can fix an old post\'s who-and-why, only on the person\'s word', () => {
  const raw = read('commands/social-audit.md');
  const audit = fold(raw);
  assert.ok(audit.includes(WRITE), '/hiveku:social-audit must say how an old post\'s ICP or stage is fixed');
  // Step 5's item (h), from its letter to the sentence after it: the fix runs on the person's word, post by post.
  const h = audit.slice(audit.indexOf('(h) The who-and-why fixes'), audit.indexOf('A phrase the client bans'));
  assert.ok(h.includes(WRITE) && h.includes(CHECK), 'step 5 (h) must check the post, then fix it with the strategy write');
  assert.match(h, ASKS_THE_PERSON, 'step 5 (h) must run the fix on the person\'s word');
  assert.match(h, /one post per yes/, 'step 5 (h) must take one yes per post');
  assert.match(h, /published posts too/, 'the audit must say the write works on a published post');
  assert.match(fold(raw.slice(0, raw.indexOf('1. **Sync'))), /writes it can end with, each after its own yes/, 'the audit\'s opening must say its writes each wait for a yes');
});

test('1. the department agent has neither tool, and the operator session runs the check', () => {
  const recipes = read(RECIPES);
  const has = paragraphsOf(recipes).find((p) => p.text.includes('It has NO `social_post_validate`'));
  assert.ok(has, 'recipes.md lost the list of tools the department agent lacks');
  assert.ok(has.text.includes(CHECK) && has.text.includes(WRITE), 'recipes.md must say the department agent has neither strategy tool');
  const twins = paragraphsOf(recipes).find((p) => p.text.includes('The MCP-side twins of these plays'));
  assert.ok(twins && twins.text.includes(CHECK), 'recipes.md must say the operator session runs the check');
  const onboard = read('commands/social-onboard.md');
  const lacks = paragraphsOf(onboard).find((p) => p.text.includes('the agent has no'));
  assert.ok(lacks && lacks.text.includes(CHECK) && lacks.text.includes(WRITE), '/hiveku:social-onboard must say the department agent has neither strategy tool');
});

test('1. the social analyst reads with the check and never runs either write', () => {
  const analyst = read(ANALYST);
  const investigate = analyst.slice(analyst.indexOf('Investigate with exactly these tools'), analyst.indexOf('Every number names its N'));
  assert.ok(investigate.includes(CHECK), 'the analyst may read a post with the check (a read-only POST)');
  const never = analyst.slice(analyst.indexOf('You do not create, update, delete'));
  for (const name of [WRITE, STAGE_WRITE]) assert.ok(never.includes(`\`${name}\``), `the analyst's never-call list must name ${name}`);
});

test('2. no text tells an agent to set a person\'s picks without asking', () => {
  const offenders = [];
  let writes = 0;
  let stageWrites = 0;
  for (const rel of proseFiles()) {
    for (const u of unitsOf(read(rel))) {
      // A heading names a section; a list of the tools an agent lacks, or must never call, tells no one to run them.
      if (/^#{1,6} /.test(u.text.trim())) continue;
      const text = fold(u.text).replace(TOOLS_IT_LACKS, ' ');
      const namesWrite = text.includes(WRITE);
      const setsStep = text.includes(STAGE_WRITE) && /\bawareness\b/.test(text);
      if (!namesWrite && !setsStep) continue;
      if (namesWrite) writes++;
      if (setsStep) stageWrites++;
      // The ask words in the same unit as the write, and nothing there that takes them back.
      if (!ASKS_THE_PERSON.test(text) || DENIES_ASKING.test(text)) offenders.push(`${rel}:${u.line}`);
    }
  }
  assert.ok(writes >= 8, `only ${writes} unit(s) name ${WRITE} - the walker is broken, or the texts lost it`);
  assert.ok(stageWrites >= 2, `only ${stageWrites} unit(s) set a stage's step - the walker is broken, or the texts lost it`);
  assert.deepEqual(offenders, [], 'these units change who a post is for, or a stage\'s step, without asking the person');
});

test('3. a text naming the check never claims it scores, blocks, costs or calls AI', () => {
  const offenders = [];
  let sentences = 0;
  // Read across the whole unit that names the check (its other sentences are about it too): blocking, a cost and AI.
  // Scoring, in a sentence that names the check or goes on about it ("It ...", "Its ..."): the unit's other
  // sentences score drafts on the rubric, which is the agent's own work.
  const wholeUnit = [
    [/(?<!`\s*)\bblock(?:s|ed|ing)?\b/i, /never blocks|blocks nothing|not block/i],
    // A credit spent, not the credit a link gives its piece ("so the piece gets the credit").
    [/\bcosts?\b|\bcharge[sd]?\b|\b(?:spends?|uses?|takes?|draws?) (?:an? |the |your |its |the account's )?(?:AI )?credits?\b|\bbill(?:s|ed|ing)?\b/i, /costs nothing/i],
    [/\bAI\b/, /calls no AI|no AI/],
  ];
  const aboutTheCheck = [[/\bscor/i, /never scores|scores nothing|no score|not scor|score stays yours/i]];
  for (const rel of proseFiles()) {
    for (const u of unitsOf(read(rel))) {
      if (!u.text.includes(CHECK)) continue;
      for (const s of sentencesOf(u.text)) {
        const namesIt = s.includes(CHECK) || /^(?:It|Its|This|That|The check)\b/.test(s);
        if (s.includes(CHECK)) sentences++;
        for (const [claim, denial] of namesIt ? [...wholeUnit, ...aboutTheCheck] : wholeUnit) {
          if (claim.test(s) && !denial.test(s)) offenders.push(`${rel}:${u.line}: ${s.slice(0, 140)}`);
        }
      }
    }
  }
  assert.ok(sentences >= 20, `only ${sentences} sentence(s) name the check - the walker is broken, or the texts lost it`);
  assert.deepEqual(offenders, [], 'the check only reads: it never scores copy, never blocks a post, costs nothing and calls no AI');
  const antiFluff = read(ANTI_FLUFF);
  const gate = fold(antiFluff.slice(antiFluff.indexOf('## 1. Why a gate'), antiFluff.indexOf('## 2. The banned list')));
  assert.ok(gate.includes('nothing on the server scores copy'), 'anti-fluff.md section 1 lost its rule');
  assert.ok(gate.includes(CHECK), 'anti-fluff.md section 1 must say what the check reads');
  assert.match(gate, /never scores copy/, 'anti-fluff.md section 1 must say the check still never scores copy');
});

test('4. each stage\'s step: the six steps, their sources, the stage id the server keeps, the sixth step in every stage list', () => {
  const grounding = fold(read(GROUNDING));
  for (const step of ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware', 'customer']) {
    assert.ok(grounding.includes(`\`${step}\``), `audience-grounding.md does not name the step ${step}`);
  }
  for (const words of ["Doesn't see the problem yet", 'Feels the problem', 'Weighing kinds of fix', 'Weighing you', 'Ready to act', 'Already a customer']) {
    assert.ok(grounding.includes(words), `audience-grounding.md does not give the step its words: ${words}`);
  }
  for (const source of ['`template`', '`person`', '`guess`', '`awareness_source`']) {
    assert.ok(grounding.includes(source), `audience-grounding.md does not name ${source}`);
  }
  assert.ok(
    grounding.includes('A `guess`, or a stage with no `awareness` at all (no step set yet), is a question for the person'),
    'a guessed step, and a stage with no step set, is a question for the person',
  );
  assert.match(grounding, /`settings\.journey_stage_id`/, 'audience-grounding.md must say the server keeps the stage id');
  assert.match(grounding, /`settings\.before_after_item_id`/, 'audience-grounding.md must say how a post names its grid row');
  for (const rel of [GROUNDING, HOOKS]) {
    assert.ok(read(rel).split('\n').some((l) => l.startsWith('| Already a customer |')), `${rel} lost the sixth step's row`);
  }
  for (const rel of [GROUNDING, 'commands/social-post.md', 'commands/social-plan.md', 'commands/social-calendar.md']) {
    assert.match(fold(read(rel)), /`most-aware`,? or `customer`/, `${rel} lists the stage: tag values without customer`);
  }
  const journey = fold(read('commands/journey.md'));
  for (const words of ['`awareness`', '`awareness_source`', `\`${STAGE_WRITE}({ journey_id, stage_id, awareness })\``, '`awareness_source: person`']) {
    assert.ok(journey.includes(words), `/hiveku:journey no longer says ${JSON.stringify(words)}`);
  }
});

test('5. the lines naming the tools and fields the Social team\'s agent lacks are kept out of its playbook', () => {
  const generator = read('scripts/gen-social-playbooks.mjs');
  const files = [...generator.matchAll(/\['SOCIAL_[A-Z_]+', '([a-z-]+\.md)'\]/g)].map((m) => m[1]);
  assert.ok(files.length >= 5, `read ${files.length} playbook files from the generator - its FILES list moved`);
  assert.ok(generator.includes(`line.includes('${PLUGIN_ONLY}')`), 'the generator no longer drops plugin-only lines - re-read this pin');
  const untagged = [];
  let tagged = 0;
  for (const name of files) {
    read(REF(name)).split('\n').forEach((line, i) => {
      if (![...AGENT_LACKS, CHECK, WRITE, STAGE_WRITE].some((name2) => line.includes(name2))) return;
      if (line.includes(PLUGIN_ONLY)) tagged++;
      else untagged.push(`${REF(name)}:${i + 1}`);
    });
  }
  assert.ok(tagged >= 10, `only ${tagged} tagged line(s) name the tools and fields in the playbook references - the texts lost them`);
  assert.deepEqual(untagged, [], 'these lines would teach the Social team\'s agent a tool or a field it cannot use: end each with the plugin-only tag');
});

test("5. the playbook the Social team's agent reads says what a stage with no step means, and claims no step it lacks", () => {
  // The agent reads its journeys as stored, where a stage only Hiveku guesses carries no step (the guess is made when
  // a journey is read through Hiveku), so its playbook must not say every stage carries one.
  const generator = read('scripts/gen-social-playbooks.mjs');
  const files = [...generator.matchAll(/\['SOCIAL_[A-Z_]+', '([a-z-]+\.md)'\]/g)].map((m) => m[1]);
  const kept = (name) => fold(read(REF(name)).split('\n').filter((line) => !line.includes(PLUGIN_ONLY)).join('\n'));
  const grounding = kept('audience-grounding.md');
  assert.ok(grounding.includes('A `guess`, or a stage with no `awareness` at all (no step set yet), is a question for the person'), "the agent's playbook must say a stage with no step set is a question for the person");
  assert.ok(grounding.includes('a stage with no `awareness` has no step set yet'), "the agent's playbook keeps the trap of a missing step");
  for (const name of files) {
    const text = kept(name);
    assert.doesNotMatch(text, /\b[Ee]very stage\b[^.]*\bcarries\b/, `${REF(name)} tells the agent every stage carries a step`);
    assert.doesNotMatch(text, /stages each carry their step/, `${REF(name)} tells the agent every stage carries a step`);
  }
});
