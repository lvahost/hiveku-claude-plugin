#!/usr/bin/env node
/**
 * Bump the plugin version everywhere it is declared, in one shot.
 *
 * The version string is the ONLY update signal: adding skills, commands, or
 * agents does nothing for installed users until it changes — they keep the
 * cached copy. And the version lives in four files that must never drift:
 *
 *   .claude-plugin/plugin.json       the authority (Claude Code uses this one
 *                                    WITHOUT WARNING, so a stale value here
 *                                    silently masks a bumped marketplace entry)
 *   .claude-plugin/marketplace.json  what the catalog lists
 *   lib/util.mjs PLUGIN_VERSION      what the CLI and User-Agent report
 *   data/permission-critical-tools.json plugin_version — which plugin release
 *                                    the ask-list was verified against (the
 *                                    MCP-side jest suite and this repo's
 *                                    permission-critical test both read it)
 *
 * Usage:
 *   node scripts/release.mjs            show current versions + drift check
 *   node scripts/release.mjs 0.2.0      set all three to 0.2.0
 *   node scripts/release.mjs patch      0.1.0 -> 0.1.1
 *   node scripts/release.mjs minor      0.1.0 -> 0.2.0
 *   node scripts/release.mjs major      0.1.0 -> 1.0.0
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKET_JSON = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const UTIL_MJS = path.join(ROOT, 'lib', 'util.mjs');
const PERM_JSON = path.join(ROOT, 'data', 'permission-critical-tools.json');

const SEMVER = /^\d+\.\d+\.\d+$/;

async function readVersions() {
  const plugin = JSON.parse(await fs.readFile(PLUGIN_JSON, 'utf8'));
  const market = JSON.parse(await fs.readFile(MARKET_JSON, 'utf8'));
  const util = await fs.readFile(UTIL_MJS, 'utf8');
  const perm = JSON.parse(await fs.readFile(PERM_JSON, 'utf8'));
  const utilMatch = /export const PLUGIN_VERSION = '([^']+)'/.exec(util);
  const entry = (market.plugins || []).find((p) => p.name === plugin.name);
  return {
    plugin: plugin.version,
    marketplace: entry?.version,
    util: utilMatch?.[1],
    perm: perm.plugin_version,
    _raw: { plugin, market, util, entry, perm },
  };
}

function bumped(current, kind) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/**
 * The generated registries must track the MCP server, and nothing else notices
 * when they stop.
 *
 * ★ These files are DERIVED from hiveku-mcp-api-server. Add a tool there and
 * lib/tool-index.json no longer knows about it — so the assistant cannot FIND
 * it, concludes the capability does not exist, and tells the user Hiveku cannot
 * do the thing Hiveku just learned to do. That failure is silent and looks like
 * a product gap rather than a stale file, which is exactly why it is gated here
 * rather than left to memory.
 *
 * Not fatal when the server repo is absent (exit 2): a release from a machine
 * without it is fine, it just cannot re-verify. Stale (exit 1) IS fatal.
 */
function checkGeneratedRegistries() {
  const checks = [
    ['tool index', 'gen-tool-index.mjs', ['--check']],
    ['read-only list', 'gen-readonly-tools.mjs', ['--check']],
    // ★ The two above compare a file against a SOURCE PARSE, which cannot see
    // the ~125 tools registered at runtime from external microservices. They
    // agree with each other and are both wrong together. check-drift asks the
    // running server instead, so it is the only one of the three that can catch
    // a missing DataForSEO surface — the exact failure that shipped.
    ['live catalogue', 'check-drift.mjs', []],
  ];
  let stale = false;
  for (const [label, script, args] of checks) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
      encoding: 'utf8',
    });
    // ★ Print the PASSES too. This gate spent a release cycle silently
    // reporting "cannot verify" as success, and an invisible check is
    // indistinguishable from one that never ran.
    if (r.status === 0) {
      console.log(`  ${label}: ok${r.stdout?.trim() ? ` — ${r.stdout.trim().split('\n')[0]}` : ''}`);
      continue;
    }
    if (r.status === 2) {
      console.warn(`  ${label}: cannot verify — ${(r.stderr || '').trim().split('\n')[0] || 'prerequisite missing'}`);
      continue;
    }
    console.error(`  ${label}: STALE — ${(r.stderr || r.stdout || '').trim()}`);
    stale = true;
  }
  return !stale;
}

async function main() {
  const arg = process.argv[2];
  const v = await readVersions();

  if (!arg) {
    const drift = new Set([v.plugin, v.marketplace, v.util, v.perm]).size !== 1;
    console.log(`plugin.json      ${v.plugin}`);
    console.log(`marketplace.json ${v.marketplace}`);
    console.log(`lib/util.mjs     ${v.util}`);
    console.log(`permission-critical-tools.json ${v.perm}`);
    if (drift) {
      console.error(
        '\nDRIFT: these must match. plugin.json wins silently, so installed users would ' +
          'get whatever it says regardless of the catalog. Fix: node scripts/release.mjs <version>',
      );
      process.exit(1);
    }
    console.log('\ngenerated registries:');
    const fresh = checkGeneratedRegistries();
    if (!fresh) {
      console.error('\nRegenerate before releasing:\n  node scripts/gen-tool-index.mjs --dir <bound-account>\n  node scripts/gen-readonly-tools.mjs');
      process.exit(1);
    }
    console.log('\nin sync. To release: node scripts/release.mjs <version|patch|minor|major>');
    return;
  }

  const next = SEMVER.test(arg)
    ? arg
    : ['patch', 'minor', 'major'].includes(arg)
      ? bumped(v.plugin, arg)
      : null;
  if (!next) {
    console.error(`Expected a semver (1.2.3) or patch|minor|major, got "${arg}"`);
    process.exit(1);
  }

  // Refuse to stamp a version onto a stale catalogue: the version string is the
  // ONLY update signal installed users get, so shipping one with an out-of-date
  // index bakes the staleness in until the next release.
  if (!checkGeneratedRegistries()) {
    console.error('\nRefusing to release with stale generated registries. Regenerate, commit, then retry.');
    process.exit(1);
  }

  v._raw.plugin.version = next;
  await fs.writeFile(PLUGIN_JSON, JSON.stringify(v._raw.plugin, null, 2) + '\n');

  if (v._raw.entry) v._raw.entry.version = next;
  await fs.writeFile(MARKET_JSON, JSON.stringify(v._raw.market, null, 2) + '\n');

  await fs.writeFile(
    UTIL_MJS,
    v._raw.util.replace(/export const PLUGIN_VERSION = '[^']+'/, `export const PLUGIN_VERSION = '${next}'`),
  );

  // The ask-list carries the plugin version it was verified against, and two
  // suites (this repo's permission-critical test and the MCP server's jest
  // suite) fail on drift — so it is stamped here, never edited by hand.
  v._raw.perm.plugin_version = next;
  await fs.writeFile(PERM_JSON, JSON.stringify(v._raw.perm, null, 2) + '\n');

  const after = await readVersions();
  if (new Set([after.plugin, after.marketplace, after.util, after.perm]).size !== 1) {
    console.error('Bump did not apply cleanly — versions still differ. Fix by hand before releasing.');
    process.exit(1);
  }

  console.log(`${v.plugin} -> ${next} (plugin.json, marketplace.json, lib/util.mjs, data/permission-critical-tools.json)`);
  console.log('\nNext: commit and push. Installed users see an Update button once their');
  console.log('marketplace catalog refreshes in the background; nothing ships until then.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
