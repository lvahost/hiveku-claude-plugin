/**
 * The department data engine: pulls account datasets into hiveku-data/<dept>/
 * so Claude works from LOCAL files instead of burning live calls.
 *
 * This is a port of the VS Code extension's generated `.hiveku/pull-data.mjs`
 * (runner v2, dataRunner.ts) with two deliberate differences:
 *
 *  - Auth comes from the caller (binding -> credentials), never from a file in
 *    the project. The extension reads `.mcp.json` because it has no runtime on
 *    disk; this plugin IS the runtime, so nothing key-shaped touches the folder.
 *  - The dataset registry ships with the plugin (lib/dept-manifest.json,
 *    generated from the extension's dataManifest()) instead of being scaffolded.
 *
 * Every FILE SHAPE is kept byte-compatible with the extension's exporter —
 * hiveku-data/<dept>/<dataset>.json, README.md, SETUP.md, STATUS.json,
 * manifest.json — because both tools may serve the same folder and an agent
 * must be able to read ONE format regardless of which writer refreshed last.
 * A folder manifest's `default_departments` (role-narrowed by the extension)
 * is preserved, exactly as the extension's writeDataRunner preserves it.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJson, pathExists, mapLimit, daysAgoIso, slugify, USER_AGENT, CLIENT_ID } from './util.mjs';

const VENDORED_MANIFEST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dept-manifest.json');
const MAX_EXTRA_PAGES = 40;
const RUNNER_VERSION = 2;
const BT = '`';

/* ── MCP client (one account, one key, own rate bucket) ─────────────────── */

class PullClient {
  constructor({ endpoint, key }) {
    this.endpoint = endpoint;
    this.key = key;
    this.rpcId = 1;
    this.sessionId = null;
    this.initialized = false;
  }

  async rpc(method, params) {
    const headers = {
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'X-Hiveku-Client': CLIENT_ID,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    let res;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: this.rpcId++, method, params }),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (ctrl.signal.aborted) throw new Error(`MCP request timed out after 90s (${method})`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const sh = res.headers.get('mcp-session-id');
    if (sh) this.sessionId = sh;
    if (res.status === 204) return null;
    if (!res.ok) {
      // 429 carries machine-readable retry advice — honor it ONCE per call
      // rather than failing a whole department on a burst.
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        const wait = Number(body?.error?.data?.retry_after_seconds);
        if (Number.isFinite(wait) && wait > 0 && wait <= 120) {
          await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
          return this.rpc(method, params);
        }
      }
      throw new Error(`MCP HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    }
    const body = await res.json();
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    return body.result;
  }

  async callTool(name, args) {
    if (!this.initialized) {
      await this.rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'hiveku-claude-plugin-pull', version: String(RUNNER_VERSION) },
      });
      await this.rpc('notifications/initialized', {}).catch(() => undefined);
      this.initialized = true;
    }
    const result = await this.rpc('tools/call', { name, arguments: args || {} });
    if (result?.isError) throw new Error(`Tool ${name} errored: ${result.content?.[0]?.text || 'unknown'}`);
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error(`Tool ${name} returned no text content`);
    return JSON.parse(text);
  }
}

/* ── Extraction / fan-out (byte-compatible port of deptData.ts semantics) ── */

function firstObjectArray(obj) {
  let fallback;
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object' && v[0] !== null) return v;
      if (!fallback) fallback = v;
    }
  }
  return fallback;
}

function extractRows(payload) {
  const inner = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  if (Array.isArray(inner)) return inner;
  if (inner && typeof inner === 'object') {
    const a = firstObjectArray(inner);
    if (a) return a;
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const a = firstObjectArray(payload);
    if (a) return a;
  }
  return [];
}

function resolveDyn(dyn) {
  const out = {};
  for (const k of Object.keys(dyn || {})) out[k] = daysAgoIso(dyn[k]);
  return out;
}

function paginationOf(raw) {
  if (raw && typeof raw === 'object') {
    const p = raw.pagination || raw.data?.pagination;
    if (p && typeof p === 'object') return p;
  }
  return undefined;
}

/** Follows { page, total_pages, total } to completion; stops if the tool
 *  ignores `page`. Returns { rows, total, truncated }. */
async function fetchPaged(client, tool, args) {
  const first = await client.callTool(tool, args);
  let rows = extractRows(first);
  const pg = paginationOf(first);
  const total = pg && pg.total != null ? Number(pg.total) : undefined;
  const totalPages = pg ? Number(pg.total_pages) || 1 : 1;
  const startPage = pg ? Number(pg.page) || 1 : 1;
  if (totalPages <= 1 || startPage >= totalPages) return { rows, total };
  const last = Math.min(totalPages, startPage + MAX_EXTRA_PAGES);
  for (let p = startPage + 1; p <= last; p++) {
    let raw;
    try {
      raw = await client.callTool(tool, { ...args, page: p });
    } catch {
      break;
    }
    const rpg = paginationOf(raw);
    if (!rpg || Number(rpg.page) !== p) break;
    rows = rows.concat(extractRows(raw));
  }
  const truncated = last < totalPages || (total != null && rows.length < total);
  return { rows, total, truncated };
}

async function fetchDataset(client, ds) {
  try {
    const baseArgs = { ...(ds.args || {}), ...resolveDyn(ds.dyn_args) };
    if (!ds.scope) {
      const r = await fetchPaged(client, ds.tool, baseArgs);
      return { rows: r.rows, total: r.total, truncated: r.truncated };
    }
    let contexts = [{ args: {}, label: '' }];
    let firstStep = true;
    for (const step of ds.scope) {
      const isFirst = firstStep;
      firstStep = false;
      const expanded = await mapLimit(contexts, 5, async (ctx) => {
        let parents;
        // A failing ROOT parent listing means the dataset failed (dead key,
        // dead endpoint) — never mistake that for "no parents = 0 rows".
        try {
          parents = extractRows(await client.callTool(step.parentTool, { ...(step.parentArgs || {}), ...ctx.args }));
        } catch (err) {
          if (isFirst) throw err;
          return [];
        }
        const out = [];
        for (const p of parents) {
          const pid = typeof p === 'string' ? p : p[step.parentIdKey];
          if (pid == null || pid === '') continue;
          const plabel = typeof p === 'string' ? p : step.parentLabelKey ? (p[step.parentLabelKey] ?? pid) : pid;
          out.push({
            args: { ...ctx.args, [step.argKey]: pid },
            label: ctx.label ? `${ctx.label} / ${plabel}` : String(plabel),
          });
        }
        return out;
      });
      contexts = expanded.flat();
      if (contexts.length === 0) break;
    }
    let anyTruncated = false;
    const chunks = await mapLimit(contexts, 5, async (ctx) => {
      try {
        const r = await fetchPaged(client, ds.tool, { ...baseArgs, ...ctx.args });
        if (r.truncated) anyTruncated = true;
        return r.rows.map((row) =>
          typeof row === 'string' ? { _parent: ctx.label, value: row } : { _parent: ctx.label, ...row },
        );
      } catch {
        return [];
      }
    });
    return { rows: chunks.flat(), parents: contexts.length, truncated: anyTruncated || undefined };
  } catch (err) {
    return { rows: [], error: err?.message || String(err) };
  }
}

/* ── Files (same shapes as the extension exporter) ──────────────────────── */

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function code(s) {
  return BT + s + BT;
}

/** README per department, composed from ON-DISK files so a partial --dataset
 *  refresh still reports every dataset's true count + fetch time. */
async function writeDeptDocs(dataDir, dept) {
  const dir = path.join(dataDir, dept.id);
  if (dept.setup) await fs.writeFile(path.join(dir, 'SETUP.md'), dept.setup, 'utf8');
  const lines = [];
  for (const ds of dept.datasets) {
    let st = null;
    try {
      st = JSON.parse(await fs.readFile(path.join(dir, `${ds.id}.json`), 'utf8'));
    } catch {
      continue;
    }
    const status = st.error
      ? `error: ${st.error}`
      : st.truncated
        ? `TRUNCATED — ${st.count} of ${st.total != null ? st.total : '?'} rows (page cap hit; re-pull via the live tool for the full set)`
        : `${st.count} rows (fetched ${st.fetched_at})`;
    lines.push(`- ${code(`${ds.id}.json`)} - ${ds.label} (${status}). Tool: ${code(ds.tool)}.`);
  }
  for (const ref of dept.references || []) {
    if (await pathExists(path.join(dir, `${ref.id}.json`))) {
      lines.push(`- ${code(`${ref.id}.json`)} - ${ref.label} (reference). Tool: ${code(ref.tool)}.`);
    }
  }
  const crud = dept.crud
    ? `\n## CRUD - how to change this data\n${dept.crud}\n`
    : dept.read_only
      ? '\n## Read-only\nThis department has no MCP write tools - analyze locally; changes happen in the Hiveku dashboard.\n'
      : '\nTo act on this data (not just read it), call the live MCP tools (named per dataset above).\n';
  const setup = dept.setup
    ? `\n## Setup / connect\nSee ${code('SETUP.md')} in this folder for the exact steps to connect the integration(s).\n`
    : '';
  const md =
    `# ${dept.label} - local data\n\n` +
    `Snapshot pulled from Hiveku. List files are { dataset, count, fetched_at, rows: [...] } - check\n` +
    `fetched_at before trusting. Refresh: ${code(`hiveku pull ${dept.id}`)} (or --stale / --dataset).\n` +
    `Scoped datasets tag each row with ${code('_parent')} (the project/connection it came from).\n\n` +
    `## Datasets\n${lines.join('\n')}\n${crud}${setup}`;
  await fs.writeFile(path.join(dir, 'README.md'), md, 'utf8');
}

async function pullDept(client, dataDir, dept, onlyDataset, log) {
  const dir = path.join(dataDir, dept.id);
  const fetchedAt = new Date().toISOString();
  const status = { fetched_at: fetchedAt, datasets: {} };
  for (const ds of dept.datasets) {
    if (onlyDataset && ds.id !== onlyDataset) continue;
    const r = await fetchDataset(client, ds);
    const scopedBy = ds.scope ? ds.scope.map((s) => s.parentTool).join(' -> ') : null;
    const file = path.join(dir, `${ds.id}.json`);
    if (r.error && (await pathExists(file))) {
      // A failed refresh must never clobber a good snapshot.
      log(`  ${dept.id}/${ds.id}: ERROR ${r.error.slice(0, 120)} (kept previous snapshot)`);
    } else {
      await writeJson(file, {
        dataset: ds.id,
        label: ds.label,
        tool: ds.tool,
        scoped_by: scopedBy,
        parents: r.parents != null ? r.parents : null,
        count: r.rows.length,
        ...(r.total != null ? { total: r.total } : {}),
        ...(r.truncated ? { truncated: true } : {}),
        fetched_at: fetchedAt,
        ...(r.error ? { error: r.error } : {}),
        rows: r.rows,
      });
      let msg = r.error ? `ERROR ${r.error.slice(0, 120)}` : `${r.rows.length} rows`;
      if (r.truncated) {
        msg += ` — TRUNCATED at ${r.rows.length}${r.total != null ? ` of ${r.total}` : ''} (page cap ${MAX_EXTRA_PAGES}; re-pull this dataset via the live tool for the full set)`;
      }
      log(`  ${dept.id}/${ds.id}: ${msg}`);
    }
    status.datasets[ds.id] = { count: r.rows.length, error: r.error || null, truncated: r.truncated || false };
    if (ds.detail && r.rows.length && !r.error) {
      const det = ds.detail;
      const subdir = path.join(dir, det.dir || ds.id);
      const written = await mapLimit(r.rows, 5, async (row) => {
        const id = row[det.idKey || 'id'];
        if (id == null) return false;
        try {
          const data = await client.callTool(det.detailTool, { [det.argKey || 'id']: id });
          const inner = data && typeof data === 'object' && 'data' in data ? data.data : data;
          const name = String(row[det.nameKey || 'name'] ?? id);
          await writeJson(path.join(subdir, `${slugify(name)}-${String(id).slice(0, 8)}.json`), inner);
          return true;
        } catch {
          return false;
        }
      });
      log(`  ${dept.id}/${det.dir || ds.id}/: ${written.filter(Boolean).length} detail files`);
    }
  }
  if (!onlyDataset) {
    for (const ref of dept.references || []) {
      try {
        const data = await client.callTool(ref.tool, ref.args || {});
        const inner = data && typeof data === 'object' && 'data' in data ? data.data : data;
        await writeJson(path.join(dir, `${ref.id}.json`), inner != null ? inner : {});
        log(`  ${dept.id}/${ref.id}: reference ok`);
      } catch (err) {
        log(`  ${dept.id}/${ref.id}: ERROR ${String(err?.message || err).slice(0, 120)}`);
      }
    }
  }
  try {
    await writeDeptDocs(dataDir, dept);
  } catch {
    /* docs are best-effort */
  }
  return status;
}

async function deptFreshness(dataDir, manifest, deptId) {
  const dir = path.join(dataDir, deptId);
  if (!(await pathExists(dir))) return null;
  let newest = null;
  const dept = manifest.departments.find((d) => d.id === deptId);
  for (const ds of dept?.datasets || []) {
    const f = path.join(dir, `${ds.id}.json`);
    try {
      const at = JSON.parse(await fs.readFile(f, 'utf8')).fetched_at;
      if (at && (!newest || at > newest)) newest = at;
    } catch {
      /* missing or unreadable snapshot = not downloaded */
    }
  }
  return newest;
}

/* ── Manifest resolution ────────────────────────────────────────────────── */

/**
 * The vendored registry always wins on DATASETS (a plugin update brings new
 * ones); the folder's `default_departments` always wins when present (the
 * extension narrows it to the user's role, and that choice belongs to the
 * folder). The merged result is written back so the extension's generated
 * runner and this engine stay interchangeable on the same folder.
 */
export async function resolveManifest(dataDir, vendoredOverride = null) {
  const vendored = vendoredOverride || (await readJson(VENDORED_MANIFEST));
  if (!vendored) throw new Error('The plugin is missing lib/dept-manifest.json — reinstall the plugin.');
  const folderPath = path.join(dataDir, 'manifest.json');
  const folder = await readJson(folderPath);
  const defaults =
    Array.isArray(folder?.default_departments) && folder.default_departments.length
      ? folder.default_departments
      : vendored.default_departments;
  const merged = { ...vendored, default_departments: defaults };
  await writeJson(folderPath, merged);
  return merged;
}

/* ── Entry point (mirrors the generated runner's CLI contract) ──────────── */

export function usageLines(manifest) {
  return [
    'Departments (* = your defaults): ' +
      manifest.departments.map((d) => (manifest.default_departments.includes(d.id) ? `${d.id}*` : d.id)).join(' '),
    'Usage: hiveku pull <dept ...> | --default | --all | --stale [hours] | --dataset <dept:id> | --list',
  ];
}

/**
 * Runs a pull against one bound folder. `argv` follows the generated runner's
 * grammar exactly. Returns { ok, lines } — `ok:false` means every targeted
 * dataset failed (dead key / endpoint), which callers should surface loudly.
 */
export async function runPullData({ rootDir, endpoint, key, argv = [], log = () => {}, vendoredManifest = null }) {
  const dataDir = path.join(rootDir, 'hiveku-data');
  const manifest = await resolveManifest(dataDir, vendoredManifest);
  const byId = new Map(manifest.departments.map((d) => [d.id, d]));
  const client = new PullClient({ endpoint, key });

  let targets = [];
  let onlyDataset = null;

  if (argv.includes('--list') || argv.length === 0) {
    for (const d of manifest.departments) {
      const fresh = await deptFreshness(dataDir, manifest, d.id);
      const mark = manifest.default_departments.includes(d.id) ? '*' : ' ';
      log(`${mark} ${d.id.padEnd(12)}${fresh ? `fetched ${fresh}` : 'not downloaded'}`);
    }
    if (argv.length === 0) for (const l of usageLines(manifest)) log(l);
    return { ok: true };
  }

  if (argv[0] === '--dataset') {
    const [deptId, dsId] = String(argv[1] || '').split(':');
    const dept = byId.get(deptId);
    if (!dept || !dsId) throw new Error('Expected --dataset <dept>:<dataset-id>');
    if (!dept.datasets.some((ds) => ds.id === dsId)) {
      throw new Error(`Unknown dataset "${dsId}" for ${dept.id}. Valid: ${dept.datasets.map((ds) => ds.id).join(', ')}`);
    }
    targets = [dept];
    onlyDataset = dsId;
  } else if (argv.includes('--all')) {
    targets = manifest.departments;
  } else if (argv.includes('--default')) {
    targets = manifest.default_departments.map((id) => byId.get(id)).filter(Boolean);
  } else if (argv.includes('--stale')) {
    const idx = argv.indexOf('--stale');
    const hours = Number(argv[idx + 1]) > 0 ? Number(argv[idx + 1]) : 12;
    const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
    const candidates = manifest.default_departments.map((id) => byId.get(id)).filter(Boolean);
    targets = [];
    for (const d of candidates) {
      const f = await deptFreshness(dataDir, manifest, d.id);
      if (!f || f < cutoff) targets.push(d);
    }
    if (!targets.length) {
      log(`All default departments fresh (within ${hours}h).`);
      return { ok: true };
    }
  } else {
    const unknown = argv.filter((a) => !byId.has(a));
    if (unknown.length) throw new Error(`Unknown department(s): ${unknown.join(', ')}`);
    targets = argv.map((a) => byId.get(a));
  }

  const statusFile = path.join(dataDir, 'STATUS.json');
  const statusAll = (await readJson(statusFile)) || {};
  // The extension's exporter writes `departments` as an ARRAY of ids; the
  // runner lineage writes an OBJECT keyed by id. Setting named keys on an
  // inherited array would silently vanish at JSON.stringify, so normalize.
  if (!statusAll.departments || Array.isArray(statusAll.departments)) statusAll.departments = {};

  let okDepts = 0;
  for (const dept of targets) {
    log(`${dept.label} (${dept.id})`);
    const st = await pullDept(client, dataDir, dept, onlyDataset, log);
    const prev = statusAll.departments[dept.id];
    // A single-dataset refresh merges into the department entry, never replaces.
    statusAll.departments[dept.id] =
      onlyDataset && prev?.datasets ? { fetched_at: st.fetched_at, datasets: { ...prev.datasets, ...st.datasets } } : st;
    const errs = Object.values(st.datasets).filter((x) => x.error).length;
    const total = Object.keys(st.datasets).length;
    // total === 0 = references-only department — references log their own errors.
    if (total === 0 || total > errs) okDepts++;
  }

  const nowIso = new Date().toISOString();
  statusAll.updated_at = nowIso;
  // Mirror the extension exporter's fields so an agent reads ONE marker
  // regardless of which writer refreshed last. `failed` is the important one:
  // an empty dataset file means "not retrieved", not "no data".
  statusAll.fetched_at = nowIso;
  statusAll.failed = Object.entries(statusAll.departments).flatMap(([k, v]) =>
    Object.entries(v?.datasets || {})
      .filter(([, d]) => d && d.error)
      .map(([ds, d]) => ({ department: k, dataset: ds, error: String(d.error).slice(0, 200) })),
  );
  statusAll.runner_version = RUNNER_VERSION;
  await writeJson(statusFile, statusAll);

  if (targets.length && okDepts === 0) return { ok: false };
  log('Done. Data in hiveku-data/ — work from these local files; use live MCP tools for writes.');
  return { ok: true };
}
