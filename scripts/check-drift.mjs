#!/usr/bin/env node
/**
 * One gate over every committed copy of "what tools exist".
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 * Adding a tool touches four registries across three repos, and NOTHING
 * propagates. Every one of them went stale silently this week, and each was
 * found only by comparing it against the running system:
 *
 *   lib/tool-index.json      missing 125 tools — the whole DataForSEO surface
 *                            was unfindable, so sessions reported the
 *                            capability as absent
 *   lib/readonly-tools.json  missing 66 — those prompt for permission and
 *                            cannot be swept
 *   dept-manifest.json       mirrored by hand from hiveku-vscode; the publish
 *                            gate does not compare it
 *   builder ENDPOINTS        465 of 868 routes undocumented, no test at all
 *
 * None of these fail loudly. A stale index does not error — it returns
 * confident neighbours instead. So the only reliable signal is a diff against
 * the live server, which is what this does.
 *
 * ── The stamp ─────────────────────────────────────────────────────────────
 * ★ The MCP server already emits a catalogue fingerprint on tools/list, and
 * until now nothing consumed it. The field is `_meta.hiveku.registry_version`
 * (12 hex chars) — NOT `registry`, which is what the design note called it;
 * reading the wrong key returns undefined and reports no stamp at all, silently.
 * Printing it lets a later run answer "did the catalogue change?" without
 * re-diffing, and gives support one token to compare against a staff machine.
 *
 * Usage:
 *   node scripts/check-drift.mjs --dir <bound-account-folder>   [--json]
 *
 * Exit 0 clean · 1 drift found · 2 could not check (no binding, server down)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDirArg } from './lib/bound-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const MONOREPO = path.resolve(PLUGIN_ROOT, '..');

const ARGV = process.argv.slice(2);
const JSON_OUT = ARGV.includes('--json');
const DIR = resolveDirArg(ARGV);

if (!DIR) {
  console.error('[check-drift] no bound account folder found under ~/Hiveku-Accounts.');
  console.error('  Pass one explicitly:  node scripts/check-drift.mjs --dir <folder>');
  console.error('  A live tool list is the only trustworthy baseline; a source parse undercounts by ~125.');
  process.exit(2);   // cannot verify, NOT clean
}

/** Ask the live server what it serves, with index mode off so we see all of it. */
function liveTools(dir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(path.join(PLUGIN_ROOT, 'bin', 'hiveku-mcp'), [], {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HIVEKU_PROJECT_DIR: dir, HIVEKU_TOOL_MODE: 'all' },
    });
    let buf = '', err = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('timed out after 60s')); }, 60_000);
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== 2) continue;
        clearTimeout(timer); proc.kill();
        const tools = msg?.result?.tools;
        if (!Array.isArray(tools) || !tools.length) {
          reject(new Error(`server returned no tools${err ? ` — ${err.trim()}` : ''}`));
        } else {
          resolve({
            names: tools.map((t) => t.name),
            descriptions: new Map(tools.map((t) => [t.name, String(t.description ?? '')])),
            stamp: msg?.result?._meta?.hiveku?.registry_version ?? null,
          });
        }
      }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    for (const m of [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'check-drift', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]) proc.stdin.write(JSON.stringify(m) + '\n');
  });
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/**
 * Each registry reports MISSING (live tools it does not know about) and STALE
 * (names it lists that no longer exist).
 *
 * ★ A registry is allowed to be a SUBSET on purpose — readonly-tools holds only
 * GETs, dept-manifest only what the VS Code panels surface. So "missing" is
 * reported as information for those, and only counted as drift where the
 * registry is meant to be complete. Flagging a deliberate subset as broken
 * would train everyone to ignore this.
 */
function compare(label, names, live, { completeness, descriptions = null, liveDescriptions = null }) {
  const liveSet = new Set(live);
  const set = new Set(names);
  const missing = live.filter((n) => !set.has(n));
  const stale = names.filter((n) => !liveSet.has(n));

  // ★ NAMES ARE NOT ENOUGH, and the registry stamp cannot help here.
  //
  // `_meta.hiveku.registry_version` is a hash of sorted tool NAMES, on purpose —
  // so a deploy that changes no tools raises no "new tools available" banner.
  // The cost is that it is blind to an edited description or schema, and a
  // description is not cosmetic: it is what `hiveku_find_tools` RENDERS, so a
  // stale one is the model reading last month's text about a tool it is about
  // to call. That is not hypothetical — project_get advertised four response
  // fields that did not exist, and correcting it moved no name and no stamp.
  //
  // So a registry that is meant to be COMPLETE is also diffed on text.
  // ★ COMPARE NORMALISED TEXT, never bytes. The stored index and the wire
  // disagree on whitespace for most tools — the generator collapses runs that
  // the transport emits verbatim. Measured on the first real run: 337 byte
  // differences, of which 334 were a double space against a single one and
  // exactly 3 were genuine. A gate that reports 334 phantom problems is a gate
  // everybody learns to skip, which is the same way the two older ones went
  // unnoticed. Whitespace carries no meaning to the model reading this text.
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  const reworded = [];
  if (descriptions && liveDescriptions) {
    for (const [name, desc] of descriptions) {
      const liveDesc = liveDescriptions.get(name);
      if (liveDesc !== undefined && norm(liveDesc) !== norm(desc)) reworded.push(name);
    }
  }
  return {
    label, count: names.length, missing, stale, reworded, completeness,
    drift: (completeness === 'complete' && (missing.length > 0 || reworded.length > 0)) || stale.length > 0,
  };
}

const live = await liveTools(DIR).catch((e) => {
  console.error(`[check-drift] cannot reach the live server: ${e.message}`);
  console.error('  Is --dir a bound account folder? Try /hiveku:status there.');
  process.exit(2);
});

const reports = [];

// 1. The plugin's search index — must be COMPLETE or tools become unfindable.
const idx = readJson(path.join(PLUGIN_ROOT, 'lib', 'tool-index.json'));
reports.push(idx
  ? compare('plugin tool-index.json', idx.tools.map((t) => t.name), live.names, {
      completeness: 'complete',
      descriptions: new Map(idx.tools.map((t) => [t.name, String(t.description ?? '')])),
      liveDescriptions: live.descriptions,
    })
  : { label: 'plugin tool-index.json', count: 0, missing: live.names, stale: [], reworded: [], completeness: 'complete', drift: true });

// 2. The read-only list — a deliberate SUBSET (GET only). Only stale names are drift.
const ro = readJson(path.join(PLUGIN_ROOT, 'lib', 'readonly-tools.json'));
if (ro) reports.push(compare('plugin readonly-tools.json', ro.tools, live.names, { completeness: 'subset' }));

// 3. The VS Code department manifest, mirrored into this repo. Subset by design;
//    a name it lists that no longer exists is a broken panel.
for (const [label, p] of [
  ['plugin dept-manifest.json', path.join(PLUGIN_ROOT, 'lib', 'dept-manifest.json')],
  ['vscode dept-manifest.json', path.join(MONOREPO, 'hiveku-vscode', 'src', 'dept-manifest.json')],
]) {
  const m = readJson(p);
  if (!m) continue;
  const names = [...new Set(JSON.stringify(m).match(/"tool"\s*:\s*"([a-z0-9_]+)"/g)?.map((s) => s.split('"')[3]) ?? [])];
  if (names.length) reports.push(compare(label, names, live.names, { completeness: 'subset' }));
}

const drifted = reports.filter((r) => r.drift);

if (JSON_OUT) {
  console.log(JSON.stringify({ registry_stamp: live.stamp, live_tools: live.names.length, reports }, null, 2));
} else {
  console.log(`live server: ${live.names.length} tools${live.stamp ? `  registry ${live.stamp}` : ''}\n`);
  for (const r of reports) {
    const verdict = r.drift ? 'DRIFT' : 'ok   ';
    console.log(`  ${verdict}  ${r.label.padEnd(30)} ${String(r.count).padStart(5)} names` +
      `${r.missing.length ? `  missing ${r.missing.length}` : ''}` +
      `${r.stale.length ? `  STALE ${r.stale.length}` : ''}` +
      `${r.reworded?.length ? `  REWORDED ${r.reworded.length}` : ''}` +
      `${r.completeness === 'subset' ? '   (subset by design)' : ''}`);
    if (r.stale.length) console.log(`         gone from the server: ${r.stale.slice(0, 8).join(', ')}${r.stale.length > 8 ? ` … +${r.stale.length - 8}` : ''}`);
    if (r.reworded?.length) console.log(`         description changed upstream: ${r.reworded.slice(0, 8).join(', ')}${r.reworded.length > 8 ? ` … +${r.reworded.length - 8}` : ''}`);
    if (r.drift && r.completeness === 'complete' && r.missing.length) {
      console.log(`         not indexed: ${r.missing.slice(0, 8).join(', ')}${r.missing.length > 8 ? ` … +${r.missing.length - 8}` : ''}`);
    }
  }
  console.log();
  if (drifted.length) {
    console.log('  Regenerate:');
    console.log(`    node ${path.relative(process.cwd(), path.join(PLUGIN_ROOT, 'scripts', 'gen-tool-index.mjs'))} --dir ${DIR}`);
    console.log(`    node ${path.relative(process.cwd(), path.join(PLUGIN_ROOT, 'scripts', 'gen-readonly-tools.mjs'))}`);
    console.log('    cd ../hiveku-vscode && npm run sync:registry');
  } else {
    console.log('  every registry agrees with the live server.');
  }
}

process.exit(drifted.length ? 1 : 0);
