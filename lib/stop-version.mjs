/**
 * The Stop hook's version reminder: before a session finishes, changes it made
 * to a website project that no version holds get one named version.
 *
 * ── The contract, in the order it runs ─────────────────────────────────────
 *   1. Fold this session's ledger (lib/vcs-ledger.mjs). Nothing unversioned,
 *      or nothing written since the last reminder: exit silently. This is the
 *      path almost every Stop takes, and it costs one file read.
 *   2. Opt-out: `.hiveku/guardrails.json` with `"version_reminder": false`,
 *      found the same way the PreToolUse guardrails are (walking up from the
 *      session's folder, never at or above the home directory). There is no
 *      environment-variable switch, on purpose.
 *   3. `stop_hook_active: true` means a Stop hook already sent the agent back
 *      once this turn. Never block again: tell the PERSON once that the
 *      changes are saved but not a named version yet, record that, stop.
 *   4. Confirm up to three projects with `project_vcs_status`, in parallel,
 *      inside a six-second budget, through the same upstream path
 *      `hiveku env pull` uses. Clean: record it and drop the project. Unknown
 *      tool, error or timeout: TRUST THE LEDGER. A successful write followed by
 *      no version is direct evidence, and a false alarm costs one call that
 *      answers `nothing_to_commit`.
 *   5. Block with one reason naming the call to make.
 *   Failure-open: any exception means no output and exit 0.
 *
 * Worst case: one extra model continuation per Stop that follows unversioned
 * writes, and one network round trip when the ledger is dirty.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLedger, appendLedger, dirtyPairs } from './vcs-ledger.mjs';
import { resolveBinding } from './binding.mjs';
import { resolveDataDir, readCredentials } from './credentials.mjs';
import { Upstream } from './upstream.mjs';

/** How many projects the confirm step asks about; the rest trust the ledger. */
export const MAX_CONFIRM = 3;
/** The confirm step's whole budget (binding, credentials and the status calls). */
export const CONFIRM_BUDGET_MS = 6_000;

/* ── opt-out ─────────────────────────────────────────────────────────────── */

/**
 * True when the nearest `.hiveku/guardrails.json` says `"version_reminder":
 * false`. Anything else (no file, unreadable, malformed, any other value)
 * keeps the reminder on: an opt-out has to be stated, it is never inferred
 * from a broken file.
 */
export function versionReminderOptedOut(startDir, { homeDir = os.homedir() } = {}) {
  let dir = path.resolve(startDir || process.cwd());
  const home = path.resolve(homeDir);
  for (let depth = 0; depth < 20; depth++) {
    if (dir === home || path.dirname(dir) === dir) return false;
    const file = path.join(dir, '.hiveku', 'guardrails.json');
    let raw = null;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch { /* not at this level */ }
    if (raw !== null) {
      try {
        return JSON.parse(raw)?.version_reminder === false;
      } catch {
        return false;
      }
    }
    dir = path.dirname(dir);
  }
  return false;
}

/* ── wording ─────────────────────────────────────────────────────────────── */

const NAME_EXAMPLE =
  '<plain-language name of what changed for visitors, e.g. Updated the pricing section on the Home page>';

/**
 * A version made with no files holds EVERY unversioned change on that project
 * or branch (the editor, the in-app AI, other sessions), not only this
 * session's, so it must be named for all of it.
 */
const ALSO_HOLDS =
  "It also holds others' unsaved changes: check `project_vcs_status({ project_id, detail: " +
  '"files" })` first and name it for all of it.';

/** In index mode the tool may not be loaded yet; the plugin's search tool finds it. */
const FIND_HINT = ' (Not in your tool list? `hiveku_find_tools` finds it.)';

/**
 * What the agent reads when the Stop is blocked. For one project this is the
 * design's sentence, the reminder that the version holds everyone's unsaved
 * changes, and the find hint; for several it lists them (at most three by
 * name) and keeps the same instruction, so the reason stays near 650-760
 * characters however many projects a session touched.
 */
export function blockReason(pairs) {
  if (pairs.length === 1) {
    const [{ project_id: id, branch }] = pairs;
    const onBranch = branch !== 'main' ? ` on branch \`${branch}\`` : '';
    const branchArg = branch !== 'main' ? `, branch: "${branch}"` : '';
    return (
      `Before you finish: your changes to project \`${id}\`${onBranch} are live in the preview but not ` +
      `saved as a version. Call \`project_vcs_commit({ project_id: "${id}"${branchArg}, message: ` +
      `"${NAME_EXAMPLE}" })\` with NO files — one version for this piece of work. ${ALSO_HOLDS}` +
      `${FIND_HINT} If the user asked you not to save a version yet, say so in one line and stop.`
    );
  }
  const named = pairs
    .slice(0, 3)
    .map((p) => `\`${p.project_id}\`${p.branch !== 'main' ? ` on branch \`${p.branch}\`` : ''}`);
  const more = pairs.length > 3 ? ` and ${pairs.length - 3} more` : '';
  return (
    `Before you finish: your changes to projects ${named.join(', ')}${more} are live in the preview but ` +
    'not saved as versions. For each one, call `project_vcs_commit({ project_id, message })` (add ' +
    '`branch` for a branch) with NO files and a plain-language name of what changed for visitors, ' +
    `e.g. "Updated the pricing section on the Home page" — one version per piece of work. ${ALSO_HOLDS}` +
    `${FIND_HINT} If the user asked you not to save a version yet, say so in one line and stop.`
  );
}

/**
 * What the PERSON sees when the agent already went back once and the work is
 * still not a version. Plain words: "version", and "Your site" for main.
 */
export function unversionedNotice(pairs) {
  const where = pairs.slice(0, 3).map((p) => {
    const short = p.project_id.slice(0, 8);
    return p.branch === 'main'
      ? `Your site (project ${short})`
      : `the branch "${p.branch}" (project ${short})`;
  });
  const more = pairs.length > 3 ? ` and ${pairs.length - 3} more` : '';
  return (
    `Hiveku: your changes to ${where.join(', ')}${more} are saved but not a named version yet. ` +
    'Ask Claude to save one, or Hiveku saves them as a version before the next publish.'
  );
}

/* ── the confirm step ────────────────────────────────────────────────────── */

/**
 * Read one `project_vcs_status` answer: 'clean' | 'dirty' | 'unknown'.
 * `uncommitted: false` with `uncommitted_reason: 'unknown'` is the builder
 * saying it could not tell (never a 500), so it is NOT clean.
 */
export function readStatusAnswer(res) {
  if (!res || typeof res !== 'object' || res.error) return 'unknown';
  const result = res.result;
  if (!result || result.isError === true) return 'unknown';
  const text = Array.isArray(result.content)
    ? result.content.filter((b) => typeof b?.text === 'string').map((b) => b.text).join('\n')
    : '';
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return 'unknown';
  }
  const data = body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : null;
  if (!data) return 'unknown';
  if (data.uncommitted === true) return 'dirty';
  if (data.uncommitted === false && data.uncommitted_reason !== 'unknown') return 'clean';
  return 'unknown';
}

/**
 * The real status caller: this folder's binding, its stored key, one Upstream
 * shared by every project asked about (the handshake is memoized). Resolved
 * lazily and once, inside the confirm budget.
 */
export function upstreamStatusCaller(cwd) {
  let upstreamPromise = null;
  const upstream = () => {
    if (!upstreamPromise) {
      upstreamPromise = (async () => {
        const binding = await resolveBinding(path.resolve(cwd || process.cwd()));
        if (!binding) return null;
        const creds = await readCredentials(resolveDataDir());
        const account = creds?.accounts?.[binding.accountId];
        if (!account?.key) return null;
        return new Upstream({ key: account.key, accountId: binding.accountId, label: account.label });
      })().catch(() => null);
    }
    return upstreamPromise;
  };
  return async (pair, { signal } = {}) => {
    const up = await upstream();
    if (!up) return 'unknown';
    const args = { project_id: pair.project_id, ...(pair.branch !== 'main' ? { branch: pair.branch } : {}) };
    const res = await up.forward(
      { jsonrpc: '2.0', id: `hiveku-stop-${pair.project_id}`, method: 'tools/call', params: { name: 'project_vcs_status', arguments: args } },
      signal,
    );
    return readStatusAnswer(res);
  };
}

/**
 * Ask about each pair, all at once, and stop waiting at the budget. A pair
 * whose answer did not arrive in time, or whose call threw, is 'unknown'.
 */
export async function confirmPairs(pairs, { callStatus, budgetMs = CONFIRM_BUDGET_MS } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, budgetMs);
  });
  try {
    return await Promise.all(
      pairs.map(async (pair) => {
        const asked = Promise.resolve()
          .then(() => callStatus(pair, { signal: controller.signal }))
          .catch(() => 'unknown');
        const answer = await Promise.race([asked, deadline]);
        return answer === 'clean' || answer === 'dirty' ? answer : 'unknown';
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ── the hook ────────────────────────────────────────────────────────────── */

/**
 * `hiveku hook stop`. Returns the JSON text to print, or '' for silence.
 * Options exist for tests: `tmpDir`, `homeDir`, `callStatus`, `budgetMs`.
 */
export async function runStopHook(payload, opts = {}) {
  try {
    const sessionId = payload?.session_id;
    const ledgerOpts = opts.tmpDir ? { tmpDir: opts.tmpDir } : {};
    const entries = readLedger(sessionId, ledgerOpts);
    if (!entries.length) return '';

    const active = payload?.stop_hook_active === true;
    const pending = dirtyPairs(entries, active ? 'notified' : 'blocked');
    if (!pending.length) return '';

    if (versionReminderOptedOut(payload?.cwd, opts.homeDir ? { homeDir: opts.homeDir } : {})) return '';

    const record = (pairs, kind) =>
      appendLedger(sessionId, pairs.map((p) => ({ kind, project_id: p.project_id, branch: p.branch })), ledgerOpts);

    if (active) {
      record(pending, 'notified');
      return JSON.stringify({ systemMessage: unversionedNotice(pending) });
    }

    const callStatus = opts.callStatus || upstreamStatusCaller(payload?.cwd);
    const asked = pending.slice(0, MAX_CONFIRM);
    const answers = await confirmPairs(asked, { callStatus, budgetMs: opts.budgetMs ?? CONFIRM_BUDGET_MS });
    const clean = asked.filter((_, i) => answers[i] === 'clean');
    if (clean.length) record(clean, 'versioned');

    const remaining = pending.filter((p) => !clean.includes(p));
    if (!remaining.length) return '';
    record(remaining, 'blocked');
    return JSON.stringify({ decision: 'block', reason: blockReason(remaining) });
  } catch {
    return '';
  }
}
