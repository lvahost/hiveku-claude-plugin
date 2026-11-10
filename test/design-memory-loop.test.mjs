/**
 * Design work never saves the agent's own taste to memory, and starts from a
 * template of the frame's size (Hiveku's design rules, 2026-11-10).
 *
 * What went wrong: /hiveku:design ended by saving "palette calls, template
 * choices" to the branding memory, the creative skill's write-back listed
 * "palette and type decisions", and the brand setup copied the palette, type
 * and logo rules into memory. Notes an agent wrote about its own drafts then
 * read as "proven" in later sessions, and a note's colours could disagree with
 * the brand guide and win. The same texts told the agent to restyle an earlier
 * design before anything else, so later sessions copied old drafts instead of
 * starting from a template.
 *
 * The rules now: colours, fonts and logos live only in the brand guide; memory
 * keeps a person's words about a design, quoted, with its id; a new design
 * starts from a template of the same size, and an earlier one only when the
 * person names it. Hiveku's design rules themselves arrive in `platform_rules`
 * from account_context_get, so /hiveku:design points there instead of copying
 * them.
 *
 * Each old sentence is pinned out by its exact words, and each new rule is
 * pinned in, so the fix cannot quietly revert in one file while the others
 * hold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Line breaks in the markdown sources fall anywhere; compare on one line. */
const flat = (rel) => read(rel).replace(/\s+/g, ' ');

const DESIGN = 'commands/design.md';
const BRAND = 'commands/brand.md';
const MEDIA = 'commands/media.md';
const SKILL = 'skills/hiveku-creative-agency/SKILL.md';
const PROTOCOL = 'skills/hiveku-creative-agency/references/memory-protocol.md';
const BRAND_AND_ASSETS = 'skills/hiveku-creative-agency/references/brand-and-assets.md';
const CANVAS = 'skills/hiveku-creative-agency/references/design-canvas.md';

/** The sentences that invited the loop, each in the file that carried it. */
const OLD_LINES = [
  [DESIGN, /persisting decisions \(palette calls, template choices/],
  [DESIGN, /an existing design to restyle beats a rebuild/],
  [DESIGN, /Reuse before you build/],
  [BRAND, /Palette, type pairing, logo rules, and the reasoning go to the `branding` memory/],
  [MEDIA, /find an existing design to restyle instead of rebuilding it/],
  [SKILL, /palette and type decisions/],
  [SKILL, /branding memory updated with palette, type and logo rules/],
  [SKILL, /`design_list` for a design to restyle/],
  [PROTOCOL, /palette hexes and roles, the type pairing, logo rules, and WHY/],
  [PROTOCOL, /Client approved the darker navy for headings/],
  [BRAND_AND_ASSETS, /record the decisions\*\*: palette, type, logo rules, and reasoning into the `branding` memory/],
  [CANVAS, /check there for something to reuse first/],
];

test('no design or brand text still asks the agent to save its own palette, type or template choices, or to restyle first', () => {
  for (const [rel, old] of OLD_LINES) {
    assert.doesNotMatch(flat(rel), old, `${rel} still carries ${old}`);
  }
});

test('/hiveku:design points at Hiveku\'s design rules in platform_rules, before step 1', () => {
  const text = read(DESIGN);
  const pointer = text.indexOf("Hiveku's design rules come first");
  assert.ok(pointer > 0, 'the pointer line to the design rules is missing');
  assert.ok(pointer < text.indexOf('1. **Brand first.**'), 'the pointer must come before step 1');
  assert.match(flat(DESIGN), /returns them in `platform_rules`\. They apply to every account and outrank its memory/);
});

test('/hiveku:design starts from a template of the same size, and an earlier design only when the person names it', () => {
  const text = flat(DESIGN);
  assert.match(text, /2\. \*\*Start from a template of the same size\.\*\* `design_templates_list`/);
  assert.match(text, /Take one whose artboard is the destination's width and height/);
  assert.match(text, /Start from an earlier design \(`design_list`\) only when the person names it/);
  // The template step comes before any mention of design_list in the steps.
  assert.ok(text.indexOf('`design_templates_list`') < text.indexOf('`design_list`'), 'design_list is offered before the templates');
});

test('/hiveku:design saves only the person\'s words, quoted, with the design id, and never its own choices', () => {
  const text = flat(DESIGN);
  assert.match(text, /If the person said what works or what does not, record their words, quoted, with the design's id and the date/);
  assert.match(text, /Never write your own palette, font or template choices there \(the brand guide holds the brand\), and never your own design as what works: it is a draft until the person says so/);
});

test('/hiveku:brand keeps the palette, type and logos in the guide, and memory gets the person\'s words', () => {
  const text = flat(BRAND);
  assert.match(text, /5\. \*\*Persist in the guide\.\*\* The palette, the type pairing, the logos and the logo rules live in the brand guide/);
  assert.match(text, /Never copy them into memory/);
  assert.match(text, /Memory keeps only what the person said about the brand, in their words, quoted/);
});

test('the creative skill and its references say the same', () => {
  const skill = flat(SKILL);
  assert.match(skill, /what the person said works or does not \(their words, quoted, with the design id\)/);
  assert.match(skill, /Never your own palette, type or template choices \(the brand guide holds the brand\), and never your own work as what works/);
  assert.match(skill, /design ids delivered \(drafts until a person approves them\)/);
  assert.match(skill, /the guide updated with the person's yes \(palette, type and logo rules live there, never in memory\)/);
  assert.match(skill, /Take one whose artboard is the destination's size/);
  assert.match(flat(PROTOCOL), /\*\*A person's verdicts on designs, quoted:\*\* what the person said works or does not, in their words, with the design id and the date/);
  assert.match(flat(PROTOCOL), /Brand decisions \(palette, type pairing, logo rules\) live in the brand guide, changed only with a person's yes/);
  assert.match(flat(BRAND_AND_ASSETS), /\*\*record what the person said\*\*: their reasons for the palette, type and logo choices, in their words/);
  assert.match(flat(BRAND_AND_ASSETS), /The values themselves live only in the guide \(step 5\)/);
  assert.match(flat(CANVAS), /\*\*D4\. Start from a `design_templates_list` template of the frame's size, not a blank artboard\.\*\*/);
  assert.match(flat(CANVAS), /`design_list` reads existing designs; restyle one only when the person names it\./);
  assert.match(flat(MEDIA), /A new design starts from a template of the same size \(`design_templates_list`\)/);
});

test('the memory writes that remain still follow the two log rules', () => {
  // The rewrite kept a memory_update in /hiveku:design and /hiveku:brand (for the person's words);
  // memory-log-doctrine.test.mjs pins the rules for every command, this pins that they survived here.
  for (const rel of [DESIGN, BRAND]) {
    const text = read(rel);
    assert.match(text, /memory_update\(\{ memory_id, content, reason, expected_version \}\)/, rel);
    assert.match(text, /memory_log_list\(\{ memory_id, since \}\)/, rel);
    assert.match(text, /pass `reason`, one line on why/, rel);
  }
});
