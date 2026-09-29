/**
 * The department domain map and the Sales agent switch, as the plugin teaches
 * them (memory surfaces audit 2026-09-27, G15).
 *
 * The domain enums are the MCP server's (hiveku-mcp-api-server, read
 * 2026-09-29 at 9f4b47c, the live commit):
 *   account_context_get, agent_identity_get  src/tools/olympus-tools.ts (the
 *     `domain` enum of each): 16 values, `email` included;
 *   talk_to_department                       src/tools/department-chat-tools.ts
 *     VALID_DOMAINS: 16 values, `email` and `analytics` included, no `helpdesk`.
 * The orient map said there was no `email` domain on either tool, which was
 * stale. When those enums change (the whole-team change adds the agents the
 * Memory page lists), change ENUMS here and the prose it pins together.
 *
 * The Sales agent's switch is on the Memory page now (Sales, then Switch on,
 * /dashboard/memory?agent=sales; the old Sales memory page redirects there),
 * and its spend limit is under CRM > Settings > Sales agent. The skills sent
 * owners to "the Sales agent's memory page: CRM, then the Agent menu".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Whitespace collapsed and backticks dropped, so a pinned phrase may wrap. */
const flat = (text) => text.replace(/`/g, '').replace(/\s+/g, ' ');

const ENUMS = {
  context: [
    'content', 'marketing', 'seo', 'social', 'ppc', 'sales', 'helpdesk', 'branding', 'customer_avatar',
    'customer_journey', 'before_after_grid', 'website_design', 'knowledge_base', 'workflow', 'outbound', 'email',
  ],
  talk: [
    'seo', 'social', 'content', 'marketing', 'branding', 'outbound', 'ppc', 'analytics', 'customer_avatar',
    'customer_journey', 'before_after_grid', 'website_design', 'knowledge_base', 'workflow', 'sales', 'email',
  ],
};

/** The rows of the orient map: domain -> [context/identity cell, talk cell]. */
function orientTable() {
  const text = read('skills/hiveku-orient/SKILL.md');
  const start = text.indexOf('## Department domains');
  assert.ok(start > 0, 'the orient skill lost its domain map');
  const rows = new Map();
  let inTable = false;
  for (const line of text.slice(start).split('\n')) {
    if (!line.trim().startsWith('|')) {
      if (inTable) break; // the first line after the table ends it
      continue;
    }
    inTable = true;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4 || !cells[1] || cells[1].startsWith('Domain') || cells[1].startsWith('---')) continue;
    for (const domain of cells[1].split(',').map((d) => d.trim())) rows.set(domain, [cells[2], cells[3]]);
  }
  assert.ok(rows.size >= 16, `the domain table parsed to ${rows.size} rows`);
  return rows;
}

test('the orient map lists exactly the MCP enums, email on all three tools', () => {
  const rows = orientTable();
  const yes = (cell) => /^(yes|YES)\b/.test(cell);
  const context = [...rows].filter(([, [c]]) => yes(c)).map(([d]) => d).sort();
  const talk = [...rows].filter(([, [, t]]) => yes(t)).map(([d]) => d).sort();
  assert.deepEqual(context, [...ENUMS.context].sort());
  assert.deepEqual(talk, [...ENUMS.talk].sort());
  assert.ok(rows.has('email') && yes(rows.get('email')[0]) && yes(rows.get('email')[1]), 'email is a domain on all three');
  const prose = flat(read('skills/hiveku-orient/SKILL.md'));
  assert.match(prose, /That is 16 values for account_context_get and agent_identity_get/);
  assert.match(prose, /and 16 for talk_to_department/);
  assert.match(prose, /It accepts the same 16 domains as account_context_get/);
  // The stale claims are gone (negative controls on the pattern).
  assert.doesNotMatch(prose, /There is no web, commerce, email/);
  assert.doesNotMatch(prose, /email -> marketing/);
  assert.doesNotMatch(prose, /15 values|same 15 domains/);
});

test('/hiveku:talk lists the same enums, and no longer says email has no agent', () => {
  const text = flat(read('commands/talk.md'));
  const listAfter = (marker) => {
    const at = text.indexOf(marker);
    assert.ok(at >= 0, marker);
    return text.slice(at, at + 420);
  };
  const context = listAfter('Its enum is 16 values');
  for (const d of ENUMS.context) assert.ok(context.includes(d), `account_context_get list lacks ${d}`);
  const talk = listAfter('Exactly 16 domains are accepted');
  for (const d of ENUMS.talk) assert.ok(talk.includes(d), `talk_to_department list lacks ${d}`);
  assert.doesNotMatch(text, /There is no agent at all behind accounting, PM, voice, creative or email/);
  assert.doesNotMatch(text, /15 values|Exactly 15|same 15/);
  for (const rel of ['commands/brief.md', 'skills/hiveku-analytics-agency/SKILL.md', 'skills/hiveku-creative-agency/references/brand-and-assets.md', 'skills/hiveku-sales-agency/SKILL.md']) {
    const other = flat(read(rel));
    assert.doesNotMatch(other, /\b15 (values|domains)\b|SAME 15/, `${rel} still counts 15 domains`);
  }
});

const SWITCH_CARRIERS = ['skills/hiveku-orient/SKILL.md', 'commands/talk.md', 'skills/hiveku-sales-agency/SKILL.md'];

test('the Sales agent switch points at the Memory page, and its spend limit at CRM > Settings > Sales agent', () => {
  for (const rel of SWITCH_CARRIERS) {
    const text = flat(read(rel));
    assert.match(text, /\/dashboard\/memory\?agent=sales/, `${rel}: the switch is on the Memory page`);
    assert.match(text, /Switch on/, `${rel}: name the button`);
    assert.match(text, /\/dashboard\/crm\/settings\/sales-agent/, `${rel}: the spend limit's page`);
    assert.match(text, /Most you spend per chat/, `${rel}: the setting's own words`);
    // The retired page and its menu path (negative control on the pattern).
    assert.doesNotMatch(text, /Sales agent's memory page/, `${rel}: the old Sales memory page redirects now`);
    assert.doesNotMatch(text, /on that same memory page|on the same memory page/, `${rel}: the old settings location`);
  }
});

test('nothing in the plugin sends an owner to the retired Sales memory page', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
  const hits = [];
  for (const file of [...walk(path.join(root, 'skills')), ...walk(path.join(root, 'commands')), ...walk(path.join(root, 'agents'))]) {
    const text = flat(fs.readFileSync(file, 'utf8'));
    if (/Sales agent's memory page|dashboard\/crm\/memory/.test(text)) hits.push(path.relative(root, file));
  }
  assert.deepEqual(hits, []);
});
