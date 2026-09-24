/**
 * Form capture controls (2026-09-24): the doctrine the plugin teaches.
 *
 * Until this program every form on a Hiveku-hosted site was captured, and the
 * prose said so: "Capture is ALWAYS on" (web-agency forms reference) and "no
 * MCP tool to rename, merge, or mute a form record" (conversion-tracking forms
 * reference). A web app's sign-ins and end-user data entry became leads, and a
 * session reading that prose would tell the owner it could not be stopped.
 * Now a project chooses what is captured, and an agent can read, preview and
 * change it, and dry-run the erase. These pins keep:
 *   - /hiveku:form-capture present, naming the five tools, previewing before
 *     it saves, and teaching the erase as permanent, dry run first, one batch
 *     per yes, with the dashboard fallback while agent execution is off;
 *   - neither forms reference claiming capture is always on;
 *   - the four measurement surfaces checking capture state before blaming
 *     traffic, since a skipped submission leaves no row for any audit;
 *   - the two writes on the ask list with their methods, and the reads off it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace so a pinned phrase may wrap across lines. */
const flat = (s) => s.replace(/\s+/g, ' ');

const TOOLS = [
  'marketing_form_capture_settings_get',
  'marketing_form_capture_settings_update',
  'marketing_form_capture_list',
  'marketing_form_capture_preview',
  'marketing_form_capture_purge',
];
const WRITES = { marketing_form_capture_settings_update: 'PATCH', marketing_form_capture_purge: 'POST' };
const READS = TOOLS.filter((t) => !(t in WRITES));

const COMMAND = 'commands/form-capture.md';
const FORMS_REFERENCES = [
  'skills/hiveku-conversion-tracking/references/forms.md',
  'skills/hiveku-web-agency/references/forms.md',
];
const MEASUREMENT = [
  'commands/leads-down.md',
  'commands/tracking-check.md',
  'commands/cro.md',
  'agents/hiveku-tracking-auditor.md',
];

test('/hiveku:form-capture exists with its frontmatter and names all five tools', () => {
  assert.ok(fs.existsSync(path.join(root, COMMAND)), `${COMMAND} is missing`);
  const cmd = read(COMMAND);
  assert.match(cmd, /^---\ndescription: /, `${COMMAND} has no description frontmatter`);
  assert.match(cmd, /^argument-hint: /m, `${COMMAND} has no argument hint`);
  for (const tool of TOOLS) assert.ok(cmd.includes(`\`${tool}`), `${COMMAND} does not name ${tool}`);
});

test('the command previews an exclusion before it saves, and saves only on an explicit yes', () => {
  const cmd = flat(read(COMMAND));
  const preview = cmd.indexOf('**Preview before any exclusion.**');
  const save = cmd.indexOf('**Save only on an explicit yes**');
  assert.ok(preview > 0, 'the preview step is missing');
  assert.ok(save > preview, 'the save step must come after the preview step');
  assert.ok(cmd.includes('impact.by_form'), 'the preview step must say to read impact.by_form');
  assert.match(cmd, /The rule maps MERGE/, 'the save step must say the rule maps merge rather than replace');
  assert.ok(cmd.includes('"remove"'), 'the save step must teach "remove" for deleting a rule');
});

test('the command teaches the erase as permanent, dry run first, one batch per yes, with the dashboard fallback', () => {
  const cmd = flat(read(COMMAND));
  for (const token of [
    'cannot_undo',
    'confirm_token',
    'stale_plan',
    'agent_execute_disabled',
    'more_available',
    'contacts_erasable',
    'contacts_kept',
    'by_form',
  ]) {
    assert.ok(cmd.includes(token), `the erase step must name ${token}`);
  }
  assert.match(cmd, /PERMANENT/, 'the erase must be called permanent');
  assert.match(cmd, /Dry run, the default/, 'the erase must start with the dry run');
  assert.ok(cmd.includes('Analytics > Forms > Capture > Erase'), 'the dashboard fallback must be named');
  assert.match(cmd, /never loop batches/i, 'the erase must forbid looping batches');
});

test('the command carries the precedence rule in order, the path syntax, the markup and the mute distinction', () => {
  const cmd = flat(read(COMMAND));
  const order = [
    '(`capture_off`)',
    '(`markup_off`)',
    '(`form_excluded`)',
    '(`sign_in_form`)',
    '(`path_excluded`)',
    '(`not_allowlisted`)',
    '(`default`)',
  ];
  let at = -1;
  for (const reason of order) {
    const i = cmd.indexOf(reason);
    assert.ok(i > at, `precedence: ${reason} is missing or out of order`);
    at = i;
  }
  for (const token of [
    '`/portal/*` matches `/portal`',
    'a `*` is exactly one segment',
    'data-hiveku-capture="off"',
    'data-hiveku-capture="on"',
    'window.hivekuCaptureForm',
  ]) {
    assert.ok(cmd.includes(token), `the command must teach ${token}`);
  }
  assert.match(cmd, /Muting is not the same as not capturing/);
});

test('neither forms reference still says capture is always on or that it cannot be controlled', () => {
  for (const rel of FORMS_REFERENCES) {
    const text = flat(read(rel));
    assert.doesNotMatch(text, /Capture is ALWAYS on/i, `${rel} still says capture is always on`);
    assert.doesNotMatch(
      text,
      /no MCP tool\*\* to rename, merge, or mute a form record\./,
      `${rel} still says there is no tool for a form record, with nothing about capture`,
    );
    for (const token of ['marketing_form_capture_settings_update', '/hiveku:form-capture', 'data-hiveku-capture="on"']) {
      assert.ok(text.includes(token), `${rel} must name ${token}`);
    }
    assert.match(text, /Muting is not/, `${rel} must say muting is not the same as not capturing`);
  }
});

test('every measurement surface checks capture state before blaming traffic', () => {
  for (const rel of MEASUREMENT) {
    const text = flat(read(rel));
    for (const token of ['marketing_form_capture_settings_get', 'marketing_form_capture_list', 'skipped_30d', 'Web app']) {
      assert.ok(text.includes(token), `${rel} must name ${token} in its capture-state check`);
    }
  }
});

test('the two writes are on the ask list with their methods, and the three reads are not', () => {
  const gated = new Map(JSON.parse(read('data/permission-critical-tools.json')).tools.map((t) => [t.name, t.method]));
  for (const [name, method] of Object.entries(WRITES)) {
    assert.equal(gated.get(name), method, `${name} must be on the ask list as ${method}`);
  }
  for (const name of READS) {
    assert.equal(gated.has(name), false, `${name} is a read; an ask rule on it stalls every sweep`);
  }
});

test('the README lists the playbook', () => {
  assert.match(read('README.md'), /`form-capture` \(/, 'README.md does not list the form-capture command');
});
