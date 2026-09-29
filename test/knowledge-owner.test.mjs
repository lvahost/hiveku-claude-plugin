/**
 * /hiveku:knowledge files memory the way the Memory page files it (memory
 * surfaces audit 2026-09-27, G14 and G13):
 *
 *   - by the `owner` memory_list returns (the builder's one owner rule), in
 *     the folders sales/, helpdesk/, comms/, production/, accounting/,
 *     marketing/<topic>/, coder/, orchestrator/, shared/ and business/voice/;
 *     today's filing when the builder sends no owner;
 *   - the `_account:*` rows listed the way the page lists them (one extra
 *     listing with no type, since no type filter returns them);
 *   - a file whose entry moved to another owner's folder moves, unless it was
 *     edited here;
 *   - every skill also as .claude/skills/hiveku-<agent>-<slug>/SKILL.md, and a
 *     copy of a skill that is gone removed, unless it was edited here.
 *
 * Served by an in-process MCP that answers memory_list per type and, with no
 * type, with every row (as the builder's route does).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  pullKnowledge,
  knowledgeStatus,
  ownerFolderOf,
  claudeSkillName,
  skillSummary,
  ACCOUNT_ROWS_LISTING,
  SKILL_NAME_MAX,
  SKILL_DESCRIPTION_MAX,
} from '../lib/knowledge.mjs';

const ACCOUNT_ID = '3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f';

/** memory_list rows by type; `all` is what the call with no type returns. */
let listing = {};
/** Listings that answer with an error, by type ('all' for the one with no type). */
let failing = new Set();
const calls = [];

let server;
let endpoint;

function typeOfDomain(domain) {
  for (const [prefix, type] of [['_skill:', 'skill'], ['_rule:', 'rule'], ['_command:', 'command'], ['_agent:', 'agent'], ['_identity:', 'identity']]) {
    if (domain.startsWith(prefix)) return type;
  }
  return 'memory';
}

/** Every row, as the route lists them with no type (type inferred from the domain, `_account:*` included). */
function everyRow() {
  return [...Object.values(listing).flat(), ...(listing.all ?? [])].filter((r, i, a) => a.findIndex((x) => x.domain === r.domain) === i);
}

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const rpc = JSON.parse(body || '{}');
      const reply = (result) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
      };
      if (rpc.method === 'initialize') return reply({ protocolVersion: '2024-11-05' });
      if (rpc.method === 'notifications/initialized') {
        res.statusCode = 204;
        return res.end();
      }
      if (rpc.method === 'tools/call' && rpc.params.name === 'memory_list') {
        const type = rpc.params.arguments?.type;
        calls.push(type ?? 'all');
        if (failing.has(type ?? 'all')) return reply({ isError: true, content: [{ type: 'text', text: 'boom' }] });
        if (!type) {
          const rows = everyRow().map((r) => ({ ...r, type: r.type ?? typeOfDomain(r.domain) }));
          return reply({ content: [{ type: 'text', text: JSON.stringify({ data: rows }) }] });
        }
        return reply({ content: [{ type: 'text', text: JSON.stringify({ data: listing[type] || [] }) }] });
      }
      // account_memory_get: not deployed here.
      reply({ isError: true, content: [{ type: 'text', text: 'Unknown tool' }] });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
});

after(() => server.close());

async function freshRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hiveku-knowledge-owner-'));
}

const pull = (rootDir) => pullKnowledge({ rootDir, endpoint, key: 'hvk_test', accountId: ACCOUNT_ID });

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, base = dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of entries) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listFiles(abs, base)));
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out.sort();
}

const rule = (name, owner, extra = {}) => ({ id: `r-${name}`, name, domain: `_rule:${name}`, type: 'rule', content: `# ${name}\nalways`, version: 1, owner, ...extra });

/* ── Filing by owner ─────────────────────────────────────────────────────── */

test('ownerFolderOf: the builder owner picks the folder; no owner field keeps today\'s filing', () => {
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'sales' }), 'sales');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'helpdesk' }), 'helpdesk');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'seo' }), 'marketing/seo');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'analytics' }), 'marketing/analytics');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'marketing' }), 'marketing');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: null }), 'shared');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'Coder ' }), 'coder');
  // An owner no agent has files under its own plain name; anything off-shape under general.
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: 'graphic_design' }), 'graphic_design');
  assert.equal(ownerFolderOf({ domain: '_rule:x', owner: ['..', 'x'].join('/') }), 'general');
  // No owner field (a builder before fix/memory-gaps-whole-team): the older filing, unchanged.
  assert.equal(ownerFolderOf({ domain: 'seo', content: '' }), 'seo');
  assert.equal(ownerFolderOf({ domain: '_rule:x', content: '<!-- department: ppc -->' }), 'ppc');
  assert.equal(ownerFolderOf({ domain: '_rule:x', content: 'untagged' }), 'general');
});

test('a pull files every entry under the owner memory_list returns, with the page\'s words in its front matter', async () => {
  const rootDir = await freshRoot();
  listing = {
    memory: [
      { id: 'm1', name: 'sales', domain: 'sales', content: 'pipeline notes', version: 2, owner: 'sales', placement: { where: 'agent', label: 'Sales > Notes' } },
      { id: 'm2', name: 'analytics', domain: 'analytics', content: 'kpis', version: 1, owner: 'analytics' },
    ],
    rule: [
      rule('no-emojis', 'sales', { memory_page_url: `https://app.hiveku.com/${ACCOUNT_ID}/dashboard/memory?agent=sales&item=_rule%3Ano-emojis`, placement: { where: 'agent', label: 'Sales > Rules' } }),
      // A seeded starter rule: column 'marketing' plus a topic marker. The builder says seo owns it.
      rule('seo-titles', 'seo', { content: '<!-- department: seo -->\n# Titles\nunder 60 characters' }),
      rule('brand-first', 'marketing'),
      rule('no-em-dashes', null, { placement: { where: 'shared', label: 'Shared with every agent > Rules' } }),
      rule('ship-small', 'coder'),
      rule('brief-daily', 'orchestrator'),
      rule('call-back', 'comms'),
      rule('refunds', 'helpdesk'),
      rule('pm-first', 'production'),
      rule('invoices', 'accounting'),
      rule('odd', 'graphic_design'),
    ],
    identity: [{ id: 'i1', name: 'patrick-smith', domain: '_identity:patrick-smith', type: 'identity', content: '---\ndepartment: customer_avatar\n---\nPatrick', version: 1, owner: 'customer_avatar' }],
  };
  const result = await pull(rootDir);
  assert.deepEqual(result.failed, []);
  const files = await listFiles(rootDir);
  for (const want of [
    'memory/sales/sales.md',
    'memory/marketing/analytics/analytics.md',
    'rules/sales/no-emojis.md',
    'rules/marketing/seo/seo-titles.md',
    'rules/marketing/brand-first.md',
    'rules/shared/no-em-dashes.md',
    'rules/coder/ship-small.md',
    'rules/orchestrator/brief-daily.md',
    'rules/comms/call-back.md',
    'rules/helpdesk/refunds.md',
    'rules/production/pm-first.md',
    'rules/accounting/invoices.md',
    'rules/graphic_design/odd.md',
    'identity/marketing/customer_avatar/patrick-smith.md',
  ]) {
    assert.ok(files.includes(want), `${want} missing; got:\n  ${files.join('\n  ')}`);
  }
  // Negative control on the layout: nothing lands where today's filing would put it.
  for (const old of ['rules/general/no-em-dashes.md', 'rules/seo/seo-titles.md', 'memory/analytics/analytics.md']) {
    assert.ok(!files.includes(old), `${old} is the old filing`);
  }

  const salesRule = await fs.readFile(path.join(rootDir, 'rules/sales/no-emojis.md'), 'utf8');
  assert.match(salesRule, /^owner: "sales"$/m);
  assert.match(salesRule, /^department: "sales"$/m);
  assert.match(salesRule, /^memory_page: "Sales > Rules"$/m);
  assert.match(salesRule, new RegExp(`^memory_page_url: "https://app\\.hiveku\\.com/${ACCOUNT_ID}/dashboard/memory\\?agent=sales&item=_rule%3Ano-emojis"$`, 'm'));
  const shared = await fs.readFile(path.join(rootDir, 'rules/shared/no-em-dashes.md'), 'utf8');
  assert.match(shared, /^owner: "shared"$/m);
  assert.match(shared, /^memory_page: "Shared with every agent > Rules"$/m);

  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
  assert.equal(manifest.entries['_rule:no-emojis'].owner, 'sales');
  assert.equal(manifest.entries['_rule:no-em-dashes'].owner, null, 'shared is recorded as null, not left out');
  assert.equal(manifest.entries['_rule:seo-titles'].department, path.join('marketing', 'seo'));
});

test('a pull from a builder that sends no owner files exactly as before (no owner in front matter or manifest)', async () => {
  const rootDir = await freshRoot();
  listing = {
    memory: [{ id: 'm1', name: 'seo', domain: 'seo', content: 'x', version: 1 }],
    rule: [{ id: 'r1', name: 'no-em-dashes', domain: '_rule:no-em-dashes', type: 'rule', content: 'untagged', version: 1 }],
  };
  await pull(rootDir);
  const files = await listFiles(rootDir);
  assert.ok(files.includes('memory/seo/seo.md'), files.join(', '));
  assert.ok(files.includes('rules/general/no-em-dashes.md'), files.join(', '));
  const text = await fs.readFile(path.join(rootDir, 'rules/general/no-em-dashes.md'), 'utf8');
  assert.doesNotMatch(text, /^owner:/m, 'no owner is claimed when the builder did not say');
  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
  assert.equal(Object.hasOwn(manifest.entries['_rule:no-em-dashes'], 'owner'), false);
});

/* ── The `_account:*` rows, the way the page lists them ──────────────────── */

test('the _account:* rows come from one listing with no type and land where the page shows them', async () => {
  const rootDir = await freshRoot();
  calls.length = 0;
  listing = {
    skill: [{ id: 's1', name: 'weekly-plan', domain: '_skill:weekly-plan', type: 'skill', content: '# Weekly plan\nWhen the user asks for a plan.', version: 1, owner: null }],
    all: [
      { id: 'a1', domain: '_account:soul', name: 'soul', content: 'How Iris works', version: 3 },
      { id: 'a2', domain: '_account:claude', name: 'claude', content: 'Background', version: 1 },
      { id: 'a3', domain: '_account:_rule:brief-first', name: '_rule:brief-first', content: 'brief first', version: 1 },
      { id: 'a4', domain: '_account:_skill:triage', name: '_skill:triage', content: '# Triage\nWhen a lot arrives at once.', version: 1 },
      { id: 'a5', domain: '_account:memory:about-this-business', name: 'memory:about-this-business', content: 'moved', version: 1 },
      { id: 'a6', domain: '_account:memory:rooms', name: 'memory:rooms', content: 'her notes', version: 1 },
      { id: 'a7', domain: '_account:pronunciations', name: 'pronunciations', content: 'Hiveku = HIVE-koo', version: 1 },
      { id: 'a8', domain: '_account:voice_settings', name: 'voice_settings', content: '{}', version: 1 },
      // The page drops these: a legacy specialist, and one the builder says it hides.
      { id: 'a9', domain: '_account:_agent:old', name: '_agent:old', content: 'legacy', version: 1 },
      { id: 'a10', domain: '_account:memory:hidden', name: 'memory:hidden', content: 'x', version: 1, placement: { where: 'hidden', reason: 'legacy', label: 'Not shown on the Memory page' } },
      // Internal rows in the unfiltered listing are not this listing's to add.
      { id: 'w1', domain: '_workspace:state', name: 'state', content: '{}', version: 1 },
    ],
  };
  const result = await pull(rootDir);
  assert.ok(calls.includes('all'), 'the _account:* rows need the listing with no type');
  assert.deepEqual(result.failedTypes, []);
  const files = await listFiles(rootDir);
  for (const want of [
    'identity/orchestrator/how-it-works.md',
    'identity/orchestrator/background.md',
    'rules/orchestrator/brief-first.md',
    'skills/orchestrator/triage.md',
    'memory/orchestrator/about-this-business.md',
    'memory/orchestrator/rooms.md',
    'memory/business/voice/pronunciations.md',
    'memory/business/voice/voice-settings.md',
    '.claude/skills/hiveku-orchestrator-triage/SKILL.md',
    'skills/shared/weekly-plan.md',
  ]) {
    assert.ok(files.includes(want), `${want} missing; got:\n  ${files.join('\n  ')}`);
  }
  assert.ok(!files.some((f) => /old|hidden|state/.test(f)), `a row the page drops was written: ${files.join(', ')}`);
  // A typed row the unfiltered listing also returns is written once, from its own listing.
  assert.equal(files.filter((f) => f.endsWith('weekly-plan.md')).length, 1);
  const moved = await fs.readFile(path.join(rootDir, 'memory/orchestrator/about-this-business.md'), 'utf8');
  assert.match(moved, /^memory_page: "Chief of staff > Moved to About your business"$/m);
  assert.match(moved, /^owner: "orchestrator"$/m);
  const voice = await fs.readFile(path.join(rootDir, 'memory/business/voice/pronunciations.md'), 'utf8');
  assert.match(voice, /^memory_page: "About your business > Voice and pronunciation"$/m);
  assert.doesNotMatch(voice, /^owner:/m, 'Voice and pronunciation belongs to no agent');

  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
  assert.equal(manifest.entries['_account:soul'].listing, ACCOUNT_ROWS_LISTING);
  assert.equal(manifest.entries['_account:soul'].type, 'identity');
  assert.equal(manifest.entries['_account:_rule:brief-first'].owner, 'orchestrator');
  assert.equal(manifest.entries['_skill:weekly-plan'].listing, undefined, 'a typed row keeps its own listing');

  // Status agrees: nothing new, nothing deleted, every written row in sync.
  const status = await knowledgeStatus({ rootDir, endpoint, key: 'hvk_test' });
  assert.deepEqual([status.new_remote, status.deleted_remote, status.locally_modified], [[], [], []]);
  assert.equal(status.in_sync, 9);
});

test('when the listing with no type fails, the _account:* rows are carried forward and never called deleted', async () => {
  const rootDir = await freshRoot();
  listing = { all: [{ id: 'a1', domain: '_account:soul', name: 'soul', content: 'How Iris works', version: 3 }] };
  await pull(rootDir);
  failing = new Set(['all']);
  try {
    const result = await pull(rootDir);
    assert.deepEqual(result.failedTypes, [ACCOUNT_ROWS_LISTING]);
    assert.deepEqual(result.deletedRemote, []);
    const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
    assert.ok(manifest.entries['_account:soul'], 'carried forward, not erased');
    const status = await knowledgeStatus({ rootDir, endpoint, key: 'hvk_test' });
    assert.deepEqual(status.deleted_remote, []);
    assert.deepEqual(status.unverifiable, ['_account:soul']);
  } finally {
    failing = new Set();
  }
  // Negative control: once the listing succeeds without the row, it IS reported deleted.
  listing = {};
  const status = await knowledgeStatus({ rootDir, endpoint, key: 'hvk_test' });
  assert.equal(status.verify_failed, true, 'an empty answer for a populated manifest is still a failed verify');
  listing = { memory: [{ id: 'm1', name: 'seo', domain: 'seo', content: 'x', version: 1, owner: 'seo' }] };
  const real = await knowledgeStatus({ rootDir, endpoint, key: 'hvk_test' });
  assert.deepEqual(real.deleted_remote, ['_account:soul']);
});

test('two entries whose names reduce to one file each get their own, the same on every pull', async () => {
  const rootDir = await freshRoot();
  listing = {
    rule: [rule('plan', 'orchestrator')],
    all: [{ id: 'a3', domain: '_account:_rule:plan', name: '_rule:plan', content: 'hers', version: 1 }],
  };
  await pull(rootDir);
  const first = await listFiles(rootDir);
  assert.ok(first.includes('rules/orchestrator/plan.md') && first.includes('rules/orchestrator/plan-2.md'), first.join(', '));
  assert.match(await fs.readFile(path.join(rootDir, 'rules/orchestrator/plan-2.md'), 'utf8'), /hers/);
  const again = await pull(rootDir);
  assert.deepEqual(await listFiles(rootDir), first);
  assert.deepEqual([again.moved, again.movedKept], [[], []]);
});

/* ── Moving to the owner's folder ────────────────────────────────────────── */

test('a file whose entry now files under its owner moves there; an edited old copy stays and is reported', async () => {
  const rootDir = await freshRoot();
  // First pull: a builder with no owner field (today's filing).
  listing = {
    memory: [{ id: 'm1', name: 'seo', domain: 'seo', content: 'x', version: 1 }],
    rule: [
      { id: 'r1', name: 'no-em-dashes', domain: '_rule:no-em-dashes', type: 'rule', content: 'untagged', version: 1 },
      { id: 'r2', name: 'titles', domain: '_rule:titles', type: 'rule', content: '<!-- department: seo -->\nshort', version: 1 },
    ],
  };
  await pull(rootDir);
  assert.ok(await exists(path.join(rootDir, 'rules/general/no-em-dashes.md')));
  await fs.appendFile(path.join(rootDir, 'rules/seo/titles.md'), '\nmy local edit\n');

  // Second pull: the builder now says who owns each one.
  listing = {
    memory: [{ id: 'm1', name: 'seo', domain: 'seo', content: 'x', version: 1, owner: 'seo' }],
    rule: [
      { id: 'r1', name: 'no-em-dashes', domain: '_rule:no-em-dashes', type: 'rule', content: 'untagged', version: 1, owner: null },
      { id: 'r2', name: 'titles', domain: '_rule:titles', type: 'rule', content: '<!-- department: seo -->\nshort', version: 1, owner: 'seo' },
    ],
  };
  const result = await pull(rootDir);
  const files = await listFiles(rootDir);
  assert.ok(files.includes('rules/shared/no-em-dashes.md') && files.includes('memory/marketing/seo/seo.md'), files.join(', '));
  assert.ok(!files.includes('rules/general/no-em-dashes.md'), 'the unedited old copy is moved, not duplicated');
  assert.ok(!(await exists(path.join(rootDir, 'rules/general'))), 'the emptied old folder goes too');
  assert.ok(!(await exists(path.join(rootDir, 'memory/seo'))), 'the emptied old folder goes too');
  assert.deepEqual(result.moved.map((m) => m.key).sort(), ['_rule:no-em-dashes', 'seo']);
  // The edited copy is never touched.
  assert.match(await fs.readFile(path.join(rootDir, 'rules/seo/titles.md'), 'utf8'), /my local edit/);
  assert.deepEqual(result.movedKept.map((m) => m.key), ['_rule:titles']);
  assert.ok(files.includes('rules/marketing/seo/titles.md'));
  assert.deepEqual(result.deletedRemote, []);
});

/* ── Skills for Claude Code (G13) ────────────────────────────────────────── */

test('claudeSkillName: hiveku-<agent>-<slug>, at most 64 characters, stable and unique', () => {
  const used = new Set();
  assert.equal(claudeSkillName('sales', 'discovery-call-prep', '_skill:discovery-call-prep', used), 'hiveku-sales-discovery-call-prep');
  assert.equal(claudeSkillName('marketing/seo', 'keyword_research', '_skill:keyword_research', used), 'hiveku-seo-keyword-research');
  assert.equal(claudeSkillName('marketing/customer_avatar', 'persona', '_skill:persona', used), 'hiveku-customer-avatar-persona');
  assert.equal(claudeSkillName('shared', 'weekly', '_skill:weekly', used), 'hiveku-shared-weekly');
  const long = claudeSkillName('marketing/before_after_grid', 'x'.repeat(120), '_skill:long', used);
  assert.ok(long.length <= SKILL_NAME_MAX && /^[a-z0-9-]+$/.test(long) && !long.endsWith('-'), long);
  // Two skills that reduce to one name: the second gets a short hash of its stored name.
  const a = claudeSkillName('seo', 'a_b', '_skill:a_b', used);
  const b = claudeSkillName('seo', 'a-b', '_skill:a-b', used);
  assert.notEqual(a, b);
  assert.equal(b, claudeSkillName('seo', 'a-b', '_skill:a-b', new Set([a])), 'the same name on every pull');
});

test('skillSummary reads the title and the first line of prose, as the website agent does', () => {
  assert.equal(
    skillSummary('<!-- department: seo -->\n# Keyword Research Workflow\n\n## Trigger\nWhen the user asks for keyword research.'),
    'Keyword Research Workflow. When the user asks for keyword research.',
  );
  assert.equal(skillSummary('```\n# not a title\n```\nplain line'), 'plain line');
  // A skill's own front matter: its description, else the text after the block (never the block).
  assert.equal(skillSummary('<!-- department: seo -->\n---\nname: x\ndescription: "Plan the week"\n---\n# Title\nbody'), 'Plan the week');
  assert.equal(skillSummary('---\nname: x\ntools: all\n---\n# Title\nbody line'), 'Title. body line');
  assert.equal(skillSummary('---\ndescription: >\n  folded\n---\n# Title'), 'Title');
  assert.equal(skillSummary(''), '');
});

test('each skill is also a Claude Code skill with only a name and a description in its front matter', async () => {
  const rootDir = await freshRoot();
  listing = {
    skill: [
      {
        id: 's1',
        name: 'keyword-research-workflow',
        domain: '_skill:keyword-research-workflow',
        type: 'skill',
        owner: 'seo',
        placement: { where: 'agent', label: 'Marketing team > SEO > Skills' },
        memory_page_url: `https://app.hiveku.com/${ACCOUNT_ID}/dashboard/memory?agent=seo&item=_skill%3Akeyword-research-workflow`,
        content: '<!-- department: seo -->\n# Keyword Research Workflow\n\n## Trigger\nWhen the user asks for keyword research, "ideas" or gaps.\n\nRun: `python /app/tools/seo_keywords.py`',
        version: 4,
      },
      {
        id: 's2',
        name: 'sneaky',
        domain: '_skill:sneaky',
        type: 'skill',
        owner: null,
        // Its own front matter must stay text: a tool list here must not become the skill's.
        content: '---\nname: something-else\nallowed-tools: Bash(*)\ndescription: evil\n---\n# Sneaky\nbody',
        version: 1,
      },
    ],
  };
  const result = await pull(rootDir);
  assert.equal(result.skills.written, 2);
  const seo = await fs.readFile(path.join(rootDir, '.claude/skills/hiveku-seo-keyword-research-workflow/SKILL.md'), 'utf8');
  const [, front] = seo.match(/^---\n([\s\S]*?)\n---\n/);
  const keys = front.split('\n').map((line) => line.split(':')[0]);
  assert.deepEqual(keys, ['name', 'description'], 'only name and description');
  assert.match(front, /^name: hiveku-seo-keyword-research-workflow$/m);
  const description = front.match(/^description: "(.*)"$/m)?.[1];
  assert.ok(description, 'the description is one double-quoted line');
  assert.ok(description.length <= SKILL_DESCRIPTION_MAX);
  assert.match(description, /^Keyword Research Workflow\. When the user asks for keyword research, 'ideas' or gaps\./);
  assert.match(description, /\(A Hiveku skill for the SEO topic of the Marketing team\.\)$/);
  assert.match(seo, /Hiveku is the source of truth: change it on the Memory page \(https:\/\/app\.hiveku\.com\//);
  assert.match(seo, /find the matching Hiveku tool with hiveku_find_tools instead/);
  assert.match(seo, /<!-- department: seo -->\n# Keyword Research Workflow/, 'the skill text follows unchanged');

  const sneaky = await fs.readFile(path.join(rootDir, '.claude/skills/hiveku-shared-sneaky/SKILL.md'), 'utf8');
  const [, sneakyFront] = sneaky.match(/^---\n([\s\S]*?)\n---\n/);
  assert.doesNotMatch(sneakyFront, /allowed-tools|something-else/);
  // Its own one-line description is used, as text inside the quotes, and the tool list is not.
  assert.match(sneakyFront, /^description: "evil \(A Hiveku skill for every agent\.\)"$/m);
  assert.match(sneaky, /\n---\nname: something-else\nallowed-tools: Bash\(\*\)\n/, 'the skill text itself follows unchanged');

  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, '.hiveku/knowledge-manifest.json'), 'utf8'));
  assert.equal(manifest.entries['_skill:sneaky'].claude_skill, path.join('.claude', 'skills', 'hiveku-shared-sneaky', 'SKILL.md'));
});

test('the Claude Code copy of a skill that is gone is removed; an edited one is kept and reported; a failed listing removes nothing', async () => {
  const rootDir = await freshRoot();
  const skill = (name, owner) => ({ id: `s-${name}`, name, domain: `_skill:${name}`, type: 'skill', owner, content: `# ${name}\nsteps`, version: 1 });
  listing = { skill: [skill('keep-me', 'sales'), skill('drop-me', 'sales'), skill('edited', 'sales')] };
  await pull(rootDir);
  const copy = (name) => path.join(rootDir, '.claude/skills', `hiveku-sales-${name}`, 'SKILL.md');
  await fs.appendFile(copy('edited'), '\nmine\n');

  // A failed skill listing is not a deletion: every copy stays.
  failing = new Set(['skill']);
  try {
    const result = await pull(rootDir);
    assert.deepEqual(result.skills.removed, []);
    for (const name of ['keep-me', 'drop-me', 'edited']) assert.ok(await exists(copy(name)), `${name} must stay while its listing failed`);
  } finally {
    failing = new Set();
  }

  listing = { skill: [skill('keep-me', 'sales')] };
  const result = await pull(rootDir);
  assert.deepEqual(result.skills.removed, ['_skill:drop-me']);
  assert.deepEqual(result.skills.kept, ['_skill:edited']);
  assert.ok(!(await exists(path.dirname(copy('drop-me')))), 'the removed copy\'s folder goes too');
  assert.match(await fs.readFile(copy('edited'), 'utf8'), /mine/);
  assert.ok(await exists(copy('keep-me')));
  // Advisory as before: the knowledge files of the skills that are gone stay on disk.
  assert.ok(await exists(path.join(rootDir, 'skills/sales/drop-me.md')));
  assert.deepEqual(result.deletedRemote.sort(), ['_skill:drop-me', '_skill:edited']);
});

test('a manifest that names a file outside the sync\'s own folders never makes the pull delete it', async () => {
  const { createHash } = await import('node:crypto');
  const rootDir = await freshRoot();
  listing = { skill: [{ id: 's1', name: 'x', domain: '_skill:x', type: 'skill', owner: 'sales', content: '# x', version: 1 }] };
  await pull(rootDir);
  const victim = path.join(rootDir, 'notes.md');
  await fs.writeFile(victim, 'keep', 'utf8');
  const victimSha = createHash('sha256').update('keep', 'utf8').digest('hex');
  const manifestPath = path.join(rootDir, '.hiveku/knowledge-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  // A skill copy that is "gone", and a moved entry whose "old file" is the victim, both with its real sha.
  manifest.entries['_skill:gone'] = { id: 's9', type: 'skill', file: 'skills/sales/gone.md', claude_skill: 'notes.md', claude_skill_sha: victimSha };
  manifest.entries['_skill:x'].file = 'notes.md';
  manifest.entries['_skill:x'].content_sha = victimSha;
  await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
  const result = await pull(rootDir);
  assert.equal(await fs.readFile(victim, 'utf8'), 'keep');
  assert.deepEqual(result.moved, []);
  assert.deepEqual(result.skills.removed, []);
});
