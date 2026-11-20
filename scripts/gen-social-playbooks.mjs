#!/usr/bin/env node
/**
 * Generate hiveku_agent_marketing_server/app/domains/social_playbooks.py from
 * the social skill's doctrine references, so the department agent that
 * talk_to_department({ domain: 'social' }) runs reads the SAME hooks, formats,
 * anti-fluff gate, repurpose ladder and creative handoff the plugin teaches.
 *
 * Why generated, not hand-copied: the VS Code extension carried hand-copied
 * skill bodies for weeks and they drifted from the plugin within days with no
 * check. One source (the plugin references), one generator, one byte-drift
 * check (--check) is the pattern that has held (see the extension's
 * gen-agency-skills.mjs / check-agency-skills-drift.mjs and gen-dept-manifest.mjs).
 *
 * What it does:
 *   - reads the five references in FILES below;
 *   - drops any line tagged `<!-- plugin-only -->` (plugin-side availability or
 *     profile notes the department agent does not need), except the tagged lines
 *     AGENT_KEEPS names, which it keeps with the tag taken off;
 *   - appends a tool-name translation table, because the agent server spells
 *     its tools differently from the MCP registry (social_post_create vs
 *     social_create_post, and so on) and the doctrine is written in MCP names;
 *   - writes the module with a DO-NOT-EDIT header and the five constants
 *     app/services/playbooks.py imports.
 *
 * Usage:
 *   node scripts/gen-social-playbooks.mjs            write the module
 *   node scripts/gen-social-playbooks.mjs --check    exit 0 when identical, 2 on
 *                                                    drift, 3 when the sibling
 *                                                    checkout is absent
 *
 * The sibling checkout defaults to ../hiveku_agent_marketing_server; override
 * with HIVEKU_AGENT_SERVER_PATH.
 *
 * Exits 1 when an AGENT_KEEPS line no longer matches exactly one tagged line of
 * its reference (a reworded line is fixed there, never silently dropped).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF_DIR = path.join(ROOT, 'skills', 'hiveku-social-agency', 'references');
const SERVER = process.env.HIVEKU_AGENT_SERVER_PATH
  ? path.resolve(process.env.HIVEKU_AGENT_SERVER_PATH)
  : path.resolve(ROOT, '..', 'hiveku_agent_marketing_server');
const TARGET = path.join(SERVER, 'app', 'domains', 'social_playbooks.py');

/** constant name -> reference basename */
const FILES = [
  ['SOCIAL_HOOKS_AND_FORMATS', 'hooks-and-formats.md'],
  ['SOCIAL_AUDIENCE_GROUNDING', 'audience-grounding.md'],
  ['SOCIAL_ANTI_FLUFF', 'anti-fluff.md'],
  ['SOCIAL_REPURPOSE', 'repurpose.md'],
  ['SOCIAL_CREATIVE_HANDOFF', 'creative-handoff.md'],
];

const PLUGIN_ONLY = '<!-- plugin-only -->';

/**
 * Plugin-only lines the department agent can act on now (HK-1824), by reference,
 * each as the line reads without its tag. Its social_post_create and
 * social_post_update take the post's grid row (before_after_item_id, in the
 * translation table below), and its posts keep their stage's id
 * (settings.journey_stage_id) because its post writes go through the builder
 * (HK-1794). The lines stay tagged in the references, where the tag keeps them
 * next to the strategy tools, customer_journey_stage_list and the stage update
 * that the agent still lacks; this list is the one place that lets the agent's
 * copy have them. Each entry must match exactly one tagged line of its file.
 */
export const AGENT_KEEPS = {
  'audience-grounding.md': [
    "The server keeps the stage's id beside the name in `settings.journey_stage_id` (no caller",
    'sets it), so a renamed stage keeps its posts.',
    "  The grid's row goes in `settings.before_after_item_id`: the one row of the grid the post",
    '  shows (a row the grid lacks, or a row with no grid, is a 400). Never send',
    '  `settings.journey_stage_id`: the server sets it from the stage.',
    'A post that uses a grid item names its row in `settings.before_after_item_id`.',
  ],
  'repurpose.md': [
    "  The grid item's row goes in `settings.before_after_item_id`.",
  ],
};

/**
 * A reference as the department agent reads it: every line without the tag, and
 * the tagged lines AGENT_KEEPS names for this file with the tag taken off. Throws
 * when a kept line matches no tagged line, or more than one.
 */
export function agentText(file, raw) {
  const wanted = new Map((AGENT_KEEPS[file] ?? []).map((line) => [line, 0]));
  const kept = [];
  for (const line of raw.split('\n')) {
    if (!line.includes('<!-- plugin-only -->')) {
      kept.push(line);
      continue;
    }
    const bare = line.replace(/ *<!-- plugin-only -->\s*$/, '');
    if (wanted.has(bare)) {
      wanted.set(bare, wanted.get(bare) + 1);
      kept.push(bare);
    }
  }
  for (const [line, count] of wanted) {
    if (count !== 1) {
      throw new Error(
        `${file}: the kept line ${JSON.stringify(line)} matches ${count} line(s) tagged ${PLUGIN_ONLY}, not one; fix AGENT_KEEPS`,
      );
    }
  }
  return kept.join('\n');
}

/**
 * MCP registry name -> the department agent's own tool (or where the data
 * already sits in its workspace). Only names the five references actually use,
 * and the two settings keys AGENT_KEEPS lets through.
 */
const TRANSLATION = [
  ['social_create_post', 'social_post_create (same fields; platforms takes the canonical slugs)'],
  ['social_update_post', 'social_post_update'],
  ['social_list_posts', 'social_post_list (or data/social_posts.json, the last 50)'],
  ['social_get_post', 'social_post_get'],
  ['social_delete_post', 'social_post_delete'],
  ['social_publish_post', 'social_post_publish (stages for approval on this path; never publishes directly)'],
  ['social_list_accounts', 'social_account_list (or data/social_accounts.json)'],
  ['social_account_get', 'social_account_get'],
  ['social_pillar_list', 'social_pillar_list (or data/content_pillars.json)'],
  ['social_post_analytics', 'social_post_metrics'],
  ['social_analytics_summary', 'social_account_summary'],
  ['social_analytics_timeseries', 'social_analytics_timeseries'],
  ['social_post_sync_analytics', 'social_post_sync_analytics'],
  ['social_analytics_by_dimension', 'data/social_winners.json (no agent-side tool yet; read the file)'],
  ['social_calendar_gaps', 'data/social_calendar.json (no agent-side tool yet; read the file)'],
  ['social_hashtags_list', 'data/hashtags.json'],
  ['kb_search', 'knowledge_search_query'],
  ['customer_avatar_get', 'data/customer_avatars.json'],
  ['customer_avatar_list', 'data/customer_avatars.json'],
  ['before_after_grid_get', 'data/before_after_grids.json'],
  ['before_after_grid_list', 'data/before_after_grids.json'],
  ['customer_journey_get', 'data/customer_journey_maps.json'],
  ['customer_journey_list', 'data/customer_journey_maps.json'],
  ['settings.before_after_item_id', 'before_after_item_id, an argument of social_post_create and social_post_update (they take no settings; on an update "" takes the row off)'],
  ['settings.journey_stage_id', 'kept by Hiveku from journey_stage; no tool here sends it'],
  ['media_library_list', 'media_library_list'],
  ['media_library_get', 'media_library_get'],
  ['media_library_register_external_url', 'media_library_register_external_url'],
  ['media_update', 'media_library_update'],
  ['generate_image', 'generate_image (pass register_in_media_library=True)'],
  ['design_publish_to_library', 'design_project_publish'],
  ['design_list', 'design_project_list'],
  ['design_get', 'design_project_get'],
  ['pm_tasks_create', 'pm_task_create'],
  ['pm_tasks_comment', 'pm_task_comment'],
  ['pm_tasks_complete', 'pm_task_complete'],
  ['pm_projects_list', 'pm_project_list'],
  ['memory_list', 'memory_list'],
  ['memory_update', 'memory_update'],
  ['memory_create', 'memory_create'],
  ['talk_to_department', 'you ARE the department on this path; do the drafting yourself'],
  ['content_list', 'content_list'],
  ['content_get', 'content_get'],
  ['sites_list', 'not available here; the operator supplies the live URL'],
  ['cms_list_entries', 'not available here; use content_get or web_scrape on the live URL'],
];

function escapePy(text) {
  return text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

function buildModule() {
  const parts = [];
  parts.push('"""DO NOT EDIT - GENERATED FILE.');
  parts.push('');
  parts.push('Regenerated by hiveku-claude-plugin/scripts/gen-social-playbooks.mjs from the');
  parts.push("plugin's skills/hiveku-social-agency/references/*.md doctrine. Edit the plugin");
  parts.push('references and re-run the generator; hand edits here are overwritten on the');
  parts.push('next run and fail its --check mode.');
  parts.push('');
  parts.push('app.services.playbooks._domain_playbooks("social") writes these five constants');
  parts.push('into data/playbooks/social-*.md; app.domains.social carries the mandatory');
  parts.push('pre-read index that points at them.');
  parts.push('"""');
  parts.push('');
  const table = [
    '',
    '## Tool names on this server',
    '',
    'This playbook is written in the MCP registry vocabulary the Claude Code plugin uses.',
    'On this server the same capability is spelled as follows; when a name below is a',
    'data/ file, the fact is already hydrated into the workspace - read the file instead',
    'of calling a tool.',
    '',
    '| Plugin (MCP) name | Here |',
    '|---|---|',
    ...TRANSLATION.map(([a, b]) => `| ${a} | ${b} |`),
    '',
  ].join('\n');
  for (const [constName, file] of FILES) {
    const raw = fs.readFileSync(path.join(REF_DIR, file), 'utf8');
    const kept = agentText(file, raw).trimEnd();
    parts.push(`${constName} = """`);
    parts.push(escapePy(kept + '\n' + table));
    parts.push('"""');
    parts.push('');
  }
  return parts.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  if (!fs.existsSync(path.join(SERVER, 'app', 'domains'))) {
    console.error(`[gen-social-playbooks] agent server checkout not found at ${SERVER}`);
    process.exit(3);
  }
  let next;
  try {
    next = buildModule();
  } catch (error) {
    console.error(`[gen-social-playbooks] ${error.message}`);
    process.exit(1);
  }
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;
  if (check) {
    if (current === next) {
      console.log('[gen-social-playbooks] OK: social_playbooks.py matches the plugin references');
      process.exit(0);
    }
    console.error('[gen-social-playbooks] DRIFT: social_playbooks.py differs from the plugin references; run without --check');
    process.exit(2);
  }
  fs.writeFileSync(TARGET, next);
  console.log(`[gen-social-playbooks] wrote ${path.relative(process.cwd(), TARGET)} (${next.length} bytes, ${FILES.length} playbooks)`);
}

// Run as a script only: the texts test imports agentText and AGENT_KEEPS.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
