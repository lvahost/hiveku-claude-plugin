/**
 * Turning "needs-params" into actual coverage, by finding real ids.
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * An account-wide sweep leaves ~400 of 806 read-only tools at `needs-params`:
 * they refused because the sweep passed no arguments. 358 of those want an
 * ENTITY ID. That is the real coverage ceiling.
 *
 * ── The fix that does not work ───────────────────────────────────────────────
 * The obvious move is to read `required[]` off each schema and auto-fill it.
 * Measured against the live server, it makes the report WORSE:
 *
 *   seo_list_keywords   {"error":"SEO project not found","status":404}
 *   seo_content_gaps    {"error":"SEO project not found","status":404}
 *   get_project         {"error":"Project not found","status":404}
 *
 * A synthetic id produces a 404, a 404 classifies as `error`, and ~358 tools
 * would move from needs-params into the failure list with nothing broken
 * behind any of them — the same defect the `unavailable` bucket was added to
 * fix, at 3.5x the scale.
 *
 * ── Why a hand-written map does not work either ──────────────────────────────
 * The next instinct is a per-family table: "seo_* takes the id from
 * seo_list_projects". Also measured, also wrong. Of the nine `seo_*` tools
 * whose only required argument is `project_id`, SEVEN accept the id from
 * seo_list_projects and TWO — seo_project_get and seo_gtm_install_status —
 * want a WEBSITE project id and 404 on it.
 *
 * The parameter name does not identify the entity. `project_id` names at least
 * three different things across the surface (list_projects and pm_projects_list
 * return the same PM project; seo_list_projects returns a different one; the
 * project_* family wants a third), and the tool's own prefix does not tell you
 * which. Any table keyed on name or prefix encodes a guess that is wrong for
 * some fraction of its own family, silently.
 *
 * ── What this module does ────────────────────────────────────────────────────
 * Declares SUPPLIERS: for a parameter name, the read-only listers that can
 * produce candidate values for it. The sweep then PROBES — tries the
 * candidates against the tool and keeps whichever answers. The map is
 * discovered per tool at run time rather than asserted up front, so
 * seo_project_get finds the website id on its own and nobody has to have known.
 *
 * Nothing here performs I/O. The caller injects `call`, so every branch below
 * is testable without a live account, and the sweep's read-only gate stays the
 * single place that decides what may be invoked.
 */

/**
 * Listers that can supply values for a parameter, in probe order.
 *
 * ★ EVERY TOOL NAMED HERE MUST BE READ-ONLY. They are invoked with no
 * arguments during resolution, ahead of the sweep's own per-tool gate, so
 * this list is a second place a mutating tool could sneak in. The sweep
 * asserts it (see assertSuppliersAreReadOnly) rather than trusting this
 * comment.
 *
 * Order matters only as a cost heuristic — a probe stops at the first
 * candidate that answers, so a more commonly-correct supplier first means
 * fewer wasted calls. It is not a correctness claim, which is the whole point:
 * being wrong about the order costs one extra call, not a wrong verdict.
 */
const SUPPLIERS = {
  project_id: [
    // Three distinct project namespaces that all spell the parameter the same.
    { tool: 'seo_list_projects', pick: rowsOf },
    { tool: 'list_projects', pick: rowsOf },
    { tool: 'pm_projects_list', pick: rowsOf },
  ],
  connection_id: [
    { tool: 'ppc_connection_list', pick: rowsOf },
    { tool: 'seo_connections_list', pick: rowsOf },
  ],
};

/** Pull `id` off the usual `{data:[{id}]}` envelope, tolerating shape drift. */
function rowsOf(payload) {
  const rows = payload?.data ?? payload?.results ?? payload?.items ?? payload;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => r?.id).filter((v) => typeof v === 'string' && v);
}

/**
 * Does this tool have exactly one unmet required argument we can supply?
 *
 * Deliberately narrow. A tool needing two ids needs the cross product to be
 * resolved, and a wrong pairing is indistinguishable from a broken tool in the
 * report — so those stay `needs-params` and are honestly counted as uncovered
 * rather than guessed at.
 */
function resolvableParam(schema) {
  const required = schema?.required ?? [];
  if (required.length !== 1) return null;
  const name = required[0];
  return SUPPLIERS[name] ? name : null;
}

/**
 * A probe answered, so the id was right — or it did not, so try the next.
 *
 * ★ A 404 HERE IS NOT A FAILURE. It means "wrong namespace", and treating it
 * as one is exactly how auto-fill would have manufactured 358 incidents. Only
 * a candidate that ANSWERS produces a verdict; candidates that reject are
 * discarded silently and the tool stays unresolved.
 */
function isAnswer(classification) {
  return classification?.status === 'ok';
}

/**
 * Resolve one tool by probing candidate ids.
 *
 * @param {object} o
 * @param {string} o.tool              tool name
 * @param {object} o.schema            its inputSchema
 * @param {Map<string,string[]>} o.candidates  param name -> ids already harvested
 * @param {(tool:string, args:object)=>Promise<object>} o.call  returns a classify() verdict
 * @returns {Promise<{status:string, detail?:string, via?:string, param?:string, probes:number}>}
 *
 * Outcomes, and why each is the honest one:
 *   ok           a candidate answered — real coverage, and `via` records the id
 *                that worked so the discovered map can be reported.
 *   unavailable  every supplier for this parameter returned ZERO rows, so the
 *                account holds none of that entity. No argument would help, and
 *                calling it uncovered would inflate a ceiling that cannot move.
 *                (This is why 44 project_* tools on an account with no website
 *                project are not "needs-params" at all.)
 *   needs-params candidates existed and none was accepted. Unresolved, counted
 *                as uncovered — NOT as an error, because we never established
 *                the right id and cannot distinguish a wrong namespace from a
 *                broken tool.
 */
async function resolveTool({ tool, schema, candidates, call }) {
  const param = resolvableParam(schema);
  if (!param) return { status: 'needs-params', probes: 0 };

  const ids = candidates.get(param) ?? [];
  if (!ids.length) {
    return {
      status: 'unavailable',
      detail: `no ${param} exists on this account (every supplier returned zero rows)`,
      param,
      probes: 0,
    };
  }

  let probes = 0;
  for (const id of ids) {
    probes++;
    const verdict = await call(tool, { [param]: id });
    if (isAnswer(verdict)) {
      return { status: 'ok', detail: verdict.detail, via: id, param, probes };
    }
  }
  return { status: 'needs-params', param, probes };
}

/**
 * Harvest candidate ids once, before any tool is probed.
 *
 * A supplier that errors or returns nothing contributes nothing and is not a
 * failure of the sweep — an account with no SEO project simply has no SEO
 * project ids, which is the signal `unavailable` is built on.
 */
async function harvestCandidates({ call, onNote = () => {} }) {
  const candidates = new Map();
  for (const [param, suppliers] of Object.entries(SUPPLIERS)) {
    const ids = [];
    for (const s of suppliers) {
      let payload;
      try {
        payload = await call(s.tool, {});
      } catch {
        continue;
      }
      const got = s.pick(payload) ?? [];
      if (!got.length) continue;

      // ★ ONE ID PER SUPPLIER, NOT ONE PER ROW.
      //
      // A supplier identifies the NAMESPACE; the row does not. All twelve rows
      // from list_projects are PM projects, so if the first is rejected by
      // project_checkpoint_list the other eleven will be too — they are the
      // same kind of thing. Probing all of them turns the pass into
      // O(tools x rows): 400 unresolved tools against 13 harvested ids is
      // ~5,200 calls, which at the server's 90-per-minute pace is an hour of
      // wall clock to learn what three calls would have said.
      //
      // Taking the head of each supplier makes it O(tools x suppliers) — three
      // candidates for project_id, two for connection_id — and loses nothing,
      // because a namespace that rejects its own first row rejects all of them.
      // The cost of being wrong about that is one tool left unresolved, which
      // is the bucket it was already in.
      onNote(`${param}: ${got.length} row(s) from ${s.tool}, probing ${got[0]}`);
      if (!ids.includes(got[0])) ids.push(got[0]);
    }
    candidates.set(param, ids);
  }
  return candidates;
}

/**
 * Fail loudly if a supplier is not on the read-only list.
 *
 * Suppliers are called with no arguments before the per-tool gate runs, so
 * without this they would be the one path into the sweep that bypasses it.
 */
function assertSuppliersAreReadOnly(isReadOnly) {
  const bad = [];
  for (const suppliers of Object.values(SUPPLIERS)) {
    for (const s of suppliers) if (!isReadOnly(s.tool)) bad.push(s.tool);
  }
  if (bad.length) {
    throw new Error(
      `sweep-resolvers: supplier(s) not on the read-only list: ${bad.join(', ')}. ` +
        'Suppliers run ahead of the per-tool gate; a mutating one would be invoked unguarded.',
    );
  }
}

export {
  SUPPLIERS,
  rowsOf,
  resolvableParam,
  resolveTool,
  harvestCandidates,
  assertSuppliersAreReadOnly,
};
