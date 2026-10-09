/**
 * Cold email versus permission email, and the chief of staff's name, on the
 * plugin side (Abe, 2026-10-08: an account wanted to send a "not technically
 * cold" sequence to 2,000 contacts from its association, and neither the team
 * nor the AI could say plainly that the list was cold or which path fits it).
 * The builder states the rules once (lib/platform-guide/email-permission.ts):
 * account_context_get returns them as `platform_rules` on every domain, with an
 * instruction that they outrank the account's memory, and the email-a-list
 * playbook carries the full guide.
 *
 * These pins keep the plugin's prose on the same facts:
 *   (a) the shim's initialize instructions (the shim answers initialize itself,
 *       so the server's never arrive) and hiveku-orient say platform_rules
 *       outrank account memory, and where the full guide is;
 *   (b) every command that plans an email to a group asks how the list was
 *       built, and routes a cold list to Outbound;
 *   (c) the outbound skill carries what is true today: association, chamber
 *       and directory lists are cold; Outbound connects SmartLead only and
 *       Instantly works on its own; the business buys its own inboxes and
 *       domains; never Hiveku email marketing; experience first; no offer of
 *       Hiveku's team; the standard answer in the guide's words;
 *   (d) no prose teaches what is not true: outbound_create_campaign pushes the
 *       steps it is given (MCP outbound catalogue), email_domain_check_dns
 *       checks only Hiveku email-marketing domains (so it cannot vet a cold
 *       sending domain), and Hiveku email marketing pauses a sender at 0.08%
 *       complaints (so no floor says 0.1%);
 *   (e) prose calls the coordinator agent the chief of staff; `orchestrator`
 *       survives only as an identifier (department key, folder, tool name).
 * Each detector has a negative control on the old wording.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { MEMORY_EDIT_INSTRUCTIONS, PLATFORM_RULES_INSTRUCTIONS, runShim } from '../lib/shim.mjs';
import { writeBinding } from '../lib/binding.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Prose as one line: blockquote markers dropped, whitespace collapsed. */
const flat = (text) => text.replace(/^[ \t]*>[ \t]?/gm, '').replace(/\s+/g, ' ').trim();
const has = (text, re) => assert.ok(re.test(text), `missing: ${re}`);
const ACCOUNT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** Every .md under the given folders, as repo-relative paths. */
function walkMarkdown(dirs) {
  const files = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) files.push(child);
    }
  };
  for (const dir of dirs) walk(dir);
  return files.sort();
}

/** One initialize round-trip through the shim; returns the instructions it answers with. */
async function initializeInstructions(projectDir, dataDir) {
  const chunks = [];
  const stdout = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const stdin = Readable.from([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n']);
  await runShim({ projectDir, dataDir, stdin, stdout });
  return JSON.parse(chunks.join('').trim().split('\n')[0]).result.instructions;
}

test('(a) the shim tells a bound session that platform_rules outrank memory and to ask how a list was built, as static text', async () => {
  assert.ok(!PLATFORM_RULES_INSTRUCTIONS.includes('${'), 'static text only');
  assert.match(PLATFORM_RULES_INSTRUCTIONS, /`platform_rules` in account_context_get/);
  assert.match(PLATFORM_RULES_INSTRUCTIONS, /outrank this account's memory where the two disagree/);
  assert.match(PLATFORM_RULES_INSTRUCTIONS, /find out how the list was built/);
  assert.match(PLATFORM_RULES_INSTRUCTIONS, /goes through a cold email platform, never Hiveku email marketing/);
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hiveku-email-rules-'));
  try {
    const bound = path.join(tmp, 'bound');
    const unbound = path.join(tmp, 'unbound');
    const dataDir = path.join(tmp, 'data');
    await fsp.mkdir(unbound, { recursive: true });
    await fsp.mkdir(dataDir, { recursive: true });
    await writeBinding(bound, { accountId: ACCOUNT, label: 'Acme', keyPreview: 'hvk_test' });
    await fsp.writeFile(
      path.join(dataDir, 'credentials.json'),
      JSON.stringify({ version: 1, accounts: { [ACCOUNT]: { key: 'hvk_test', label: 'Acme', key_preview: 'hvk_test' } } }),
    );
    const [binding, block, ...rest] = (await initializeInstructions(bound, dataDir)).split('\n\n');
    assert.ok(block && rest.length === 0, 'still two paragraphs: the binding paragraph and the feedback block');
    const rules = binding.indexOf(PLATFORM_RULES_INSTRUCTIONS);
    assert.ok(rules > 0, 'the binding paragraph carries the platform rules');
    assert.ok(rules > binding.indexOf(MEMORY_EDIT_INSTRUCTIONS), 'after the memory rules it qualifies');
    assert.doesNotMatch(await initializeInstructions(unbound, dataDir), /platform_rules/);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('(a) hiveku-orient says platform_rules outrank memory and names the email-a-list playbook', () => {
  const text = flat(read('skills/hiveku-orient/SKILL.md'));
  has(text, /\*\*Hiveku's own rules come before memory\.\*\* `account_context_get` returns `platform_rules` on every domain/);
  has(text, /Where the two disagree, follow the rule and tell the person why\./);
  has(text, /`hiveku_playbook_get\(\{ playbook: "email-a-list" \}\)`/);
  has(text, /plus `platform_rules` \(Hiveku's own rules, which outrank memory where they disagree/);
});

/**
 * A command that plans email to a group carries the list check: it names
 * platform_rules, says what is cold, and routes a cold list to Outbound.
 */
function checksTheList(text) {
  const t = flat(text);
  return /`platform_rules`/.test(t) && /\bcold\b/.test(t) && /\/hiveku:(outbound-campaign|prospect)|\bOutbound\b/.test(t);
}

const GROUP_SEND_COMMANDS = [
  'campaign.md',
  'email-review.md',
  'email.md',
  'followups.md',
  'outbound-campaign.md',
  'outbound-launch.md',
  'prospect.md',
  'sales-sequence.md',
  'sequence.md',
];

test('(b) every command that plans an email to a group asks how the list was built and routes cold to Outbound', () => {
  const missing = GROUP_SEND_COMMANDS.filter((f) => !checksTheList(read(path.join('commands', f))));
  assert.deepEqual(missing, [], `these commands plan a group send without the list check:\n  ${missing.join('\n  ')}`);
  // The marketing rails say permission only, in so many words.
  has(flat(read('commands/email.md')), /Hiveku email marketing is for permission lists only/);
  has(flat(read('commands/sequence.md')), /\*\*First, the list: permission only\.\*\*/);
  has(flat(read('commands/sales-sequence.md')), /at most 100 emails a day per inbox/);
});

test('(b) the list check fails on a command without it (negative control)', () => {
  assert.equal(checksTheList('Build and launch an email campaign. Sends are GATED. 1. `marketing_setup_status`.'), false);
  const stripped = read('commands/email.md').replace(/\*\*First, the list:[\s\S]*?"email-a-list" \}\)`\./, '');
  assert.equal(checksTheList(stripped), false, 'email.md without its list block fails');
});

test('(c) the outbound skill carries the rules and the standard answer with today\'s facts', () => {
  const text = flat(read('skills/hiveku-outbound-agency/SKILL.md'));
  has(text, /`account_context_get` returns `platform_rules` on every domain/);
  has(text, /Members of the same association, chamber, club or directory/);
  has(text, /"they are not technically cold" are cold/);
  has(text, /Never through Hiveku email marketing/);
  has(text, /never from the business's main domain or its everyday inbox/);
  has(text, /Instantly is recommended too, but it is not connected to Hiveku yet; it works on its own/);
  has(text, /buys its sending\s+inboxes and separate sending domains separately: Outbound includes neither/);
  has(text, /ask whether they have run cold email before/);
  has(text, /Never offer Hiveku's team to set cold email up/);
  has(text, /These are rules you apply, not checks Hiveku runs for you/);
  has(text, /`hiveku_playbook_get\(\{ playbook: "email-a-list" \}\)`/);
  // The standard answer, in the guide's words (EMAIL_PERMISSION_GUIDE section 7).
  has(text, /People who haven't asked to hear from you are a cold audience, even if you share an association\./);
  has(text, /We recommend SmartLead and Instantly\./);
  has(text, /Warm new inboxes for 2 to 3 weeks, then send about 30 to 50 a day per inbox\. Turn open tracking off\./);
  has(text, /Hiveku's Outbound page connects SmartLead: it runs the campaigns and sorts the replies inside Hiveku\. Instantly is not connected to Hiveku yet; it works on its own\./);
  has(text, /Hiveku's email marketing is only for people who signed up or are customers\./);
});

/** Claims that are not true, each with the reason. Matched on whitespace-collapsed prose. */
const UNTRUE = [
  [/creates it EMPTY upstream/, 'outbound_create_campaign pushes the steps it is given'],
  [/writes no steps upstream/, 'outbound_create_campaign pushes the steps it is given'],
  [/sends the NAME ONLY upstream|campaign with the NAME ONLY/, 'outbound_create_campaign pushes the steps it is given'],
  [/mirrored as LOCAL JSON only/, 'the create mirrors what the provider read back'],
  [/create-time argument also reaches the provider is not verified/, 'it is verified: the create pushes and reads back'],
  [/`email_domain_check_dns` can still confirm/, 'email_domain_check_dns checks only Hiveku email-marketing domains'],
  [/verified BY TOOL \(`email_domain_check_dns`\)/, 'email_domain_check_dns cannot vet a cold sending domain'],
  [/complaints under 0\.1 percent/, 'Hiveku email marketing pauses a sender at 0.08% complaints'],
];

function untrueClaims(text) {
  const t = flat(text);
  return UNTRUE.filter(([re]) => re.test(t)).map(([re, why]) => `${re} (${why})`);
}

test('(d) no prose teaches the old create, check_dns or complaint-floor claims', () => {
  const hits = [];
  for (const file of walkMarkdown(['commands', 'skills', 'agents'])) {
    for (const claim of untrueClaims(read(file))) hits.push(`${file}: ${claim}`);
  }
  assert.deepEqual(hits, []);
});

test('(d) the untrue-claim detector catches the old wording (negative control)', () => {
  const old = [
    'mirrored campaign (the API creates it EMPTY upstream)',
    'the `sequences` passed here are mirrored as LOCAL JSON only',
    'for those, `email_domain_check_dns` can still confirm the public SPF/DKIM/DMARC records resolve',
    'spam complaints under 0.1\npercent',
  ];
  for (const line of old) assert.ok(untrueClaims(line).length > 0, `not caught: ${line}`);
  assert.deepEqual(untrueClaims('search matches title and original filename only'), [], 'no false hit on "filename only"');
});

/**
 * Prose mentions of the old name: outside code spans, and not part of a path,
 * URL or snake/kebab identifier (`/dashboard/orchestrator`, `talk_to_orchestrator`,
 * `orchestrator/`, `hiveku-orchestrator-triage` are identifiers and stay).
 */
function oldNameMentions(text) {
  return text.replace(/`[^`\n]*`/g, '').match(/(?<![\w/-])[Oo]rchestrator(?![\w/-])/g) ?? [];
}

test('(e) prose calls the coordinator agent the chief of staff; orchestrator stays an identifier', () => {
  const hits = [];
  for (const file of [...walkMarkdown(['commands', 'skills', 'agents']), 'README.md']) {
    const found = oldNameMentions(read(file));
    if (found.length) hits.push(`${file}: ${found.length}`);
  }
  assert.deepEqual(hits, [], 'say "the chief of staff" in prose; `orchestrator` only as a key, folder or tool name');
  // The canonical lists name her beside her key.
  for (const rel of ['commands/remember.md', 'commands/seed.md', 'commands/memory-changes.md', 'skills/hiveku-orient/SKILL.md']) {
    has(flat(read(rel)), /`orchestrator` \(the chief of staff\)/);
  }
});

test('(e) the old-name detector flags prose and spares identifiers (negative control)', () => {
  assert.equal(oldNameMentions('Ask the Orchestrator to brief the team.').length, 1);
  assert.equal(oldNameMentions('the idempotent orchestrator').length, 1);
  assert.equal(oldNameMentions('department `orchestrator`, folder `rules/orchestrator/`').length, 0);
  assert.equal(oldNameMentions('call talk_to_orchestrator, then open /dashboard/orchestrator').length, 0);
  assert.equal(oldNameMentions('the skill hiveku-orchestrator-triage, under orchestrator/rules').length, 0);
});
