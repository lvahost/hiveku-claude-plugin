#!/usr/bin/env node
/**
 * Bump the plugin version everywhere it is declared, in one shot.
 *
 * The version string is the ONLY update signal: adding skills, commands, or
 * agents does nothing for installed users until it changes — they keep the
 * cached copy. And the version lives in three files that must never drift:
 *
 *   .claude-plugin/plugin.json       the authority (Claude Code uses this one
 *                                    WITHOUT WARNING, so a stale value here
 *                                    silently masks a bumped marketplace entry)
 *   .claude-plugin/marketplace.json  what the catalog lists
 *   lib/util.mjs PLUGIN_VERSION      what the CLI and User-Agent report
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
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKET_JSON = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const UTIL_MJS = path.join(ROOT, 'lib', 'util.mjs');

const SEMVER = /^\d+\.\d+\.\d+$/;

async function readVersions() {
  const plugin = JSON.parse(await fs.readFile(PLUGIN_JSON, 'utf8'));
  const market = JSON.parse(await fs.readFile(MARKET_JSON, 'utf8'));
  const util = await fs.readFile(UTIL_MJS, 'utf8');
  const utilMatch = /export const PLUGIN_VERSION = '([^']+)'/.exec(util);
  const entry = (market.plugins || []).find((p) => p.name === plugin.name);
  return {
    plugin: plugin.version,
    marketplace: entry?.version,
    util: utilMatch?.[1],
    _raw: { plugin, market, util, entry },
  };
}

function bumped(current, kind) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

async function main() {
  const arg = process.argv[2];
  const v = await readVersions();

  if (!arg) {
    const drift = new Set([v.plugin, v.marketplace, v.util]).size !== 1;
    console.log(`plugin.json      ${v.plugin}`);
    console.log(`marketplace.json ${v.marketplace}`);
    console.log(`lib/util.mjs     ${v.util}`);
    if (drift) {
      console.error(
        '\nDRIFT: these must match. plugin.json wins silently, so installed users would ' +
          'get whatever it says regardless of the catalog. Fix: node scripts/release.mjs <version>',
      );
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

  v._raw.plugin.version = next;
  await fs.writeFile(PLUGIN_JSON, JSON.stringify(v._raw.plugin, null, 2) + '\n');

  if (v._raw.entry) v._raw.entry.version = next;
  await fs.writeFile(MARKET_JSON, JSON.stringify(v._raw.market, null, 2) + '\n');

  await fs.writeFile(
    UTIL_MJS,
    v._raw.util.replace(/export const PLUGIN_VERSION = '[^']+'/, `export const PLUGIN_VERSION = '${next}'`),
  );

  const after = await readVersions();
  if (new Set([after.plugin, after.marketplace, after.util]).size !== 1) {
    console.error('Bump did not apply cleanly — versions still differ. Fix by hand before releasing.');
    process.exit(1);
  }

  console.log(`${v.plugin} -> ${next} (plugin.json, marketplace.json, lib/util.mjs)`);
  console.log('\nNext: commit and push. Installed users see an Update button once their');
  console.log('marketplace catalog refreshes in the background; nothing ships until then.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
