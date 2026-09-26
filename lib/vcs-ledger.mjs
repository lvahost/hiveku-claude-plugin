/**
 * The version ledger: which website projects this session changed, and
 * whether those changes were saved as a version afterwards.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * On Hiveku, saving files changes a project straight away (Your site's files,
 * or a branch's working tree) but a save is never a version. A version is one
 * extra call, `project_vcs_commit` with no files, and an agent that edits,
 * verifies and moves on forgets it. The server has a safety net (an automatic
 * version before every publish, merge and rollback), but its names are
 * generic, while the agent knows what it changed and why. So the
 * plugin keeps a cheap record of the session's writes, and the Stop hook
 * (lib/stop-version.mjs) asks for one named version when the record says the
 * work was never versioned.
 *
 * ── What the PostToolUse hook does, and what it must never do ─────────────
 * It runs after EVERY matching tool call, so it is held to the PreToolUse
 * hook's budget: no credentials, no binding lookup, no network. It reads the
 * hook payload, classifies the call, and appends at most a few JSONL lines to
 *
 *     ${os.tmpdir()}/hiveku-vcs/<session_id>.jsonl
 *
 * Append-only on purpose: parallel tool calls fire parallel hooks, and an
 * append (O_APPEND, one write per call) cannot clobber a sibling's line the way
 * a read-modify-write of a JSON file would. os.tmpdir() is writable under the
 * Desktop sandbox, and both hooks of one session see the same directory.
 *
 * ── A shared /tmp is hostile ground ────────────────────────────────────────
 * On Linux os.tmpdir() is usually the one /tmp every local user shares, and
 * what the ledger holds ends up in a Stop-hook reason Claude reads. So:
 *   - the directory is used only when it is a real directory (not a symlink),
 *     owned by this user, with no group or other write bit; anything else
 *     (another user pre-created it, it is world-writable) means "record
 *     nothing, read nothing", never an error;
 *   - the session file is opened with O_NOFOLLOW and must be a regular file
 *     this user owns, so a planted symlink cannot redirect an append;
 *   - every line, written or read, must name a project by uuid and a branch
 *     by the builder's own rule (^[A-Za-z0-9._/-]{1,200}$), so no line can
 *     carry words into the reason.
 * macOS and Windows give each user their own temp folder; the checks cost one
 * lstat and one fstat there.
 *
 * FAILURE-OPEN everywhere: an unreadable payload, an unknown tool, a full disk
 * or a malformed ledger line means "record nothing" or "skip that line", never
 * an exception that reaches the session. The worst a missing line can do is a
 * missed reminder (the server still saves a version before the next publish); the worst an
 * extra `write` line can do is one reminder that the status check or a
 * `nothing_to_commit` answer settles.
 *
 * ── Line shape ─────────────────────────────────────────────────────────────
 *   { t, kind, project_id, branch, tool? }
 *   kind: 'write'     the call changed files and no version holds them yet;
 *         'versioned' the project/branch is saved as a version as of this call;
 *         'blocked'   the Stop hook asked the agent to save a version;
 *         'notified'  the Stop hook told the person the changes are unversioned.
 * Order is FILE order (append order). `t` is informational; two lines in the
 * same millisecond are still ordered.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LEDGER_DIRNAME = 'hiveku-vcs';

/** Both server names the tools arrive under: the plugin's bridge and the VS Code extension's. */
const TOOL_PREFIX_RE = /^mcp__(?:plugin_hiveku_hk|hiveku)__/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The builder's branch-name rule (vcs-branch-param.ts) with its 200-character cap. */
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,200}$/;

const KINDS = new Set(['write', 'versioned', 'blocked', 'notified']);

/**
 * Calls that change a project's files and never save a version themselves.
 *
 * `assets_upload` is deliberately NOT here although the design listed it: it
 * writes the shared asset store (S3 + builder_project_assets), which versions
 * do not cover (the builder contract, section 10.7), so a reminder after it
 * could only ever be answered with `nothing_to_commit`.
 */
export const WRITE_TOOLS = new Set([
  'project_file_save',
  'project_file_save_async',
  'project_files_bulk_save',
  'project_file_delete',
  'project_files_bulk_delete',
  'project_file_move',
  'project_folder_create',
  'project_folder_delete',
  'project_import_finalize',
  'project_files_finalize',
]);

/**
 * The older restore lanes. They write Your site, and a builder with versions
 * records the restore as a version itself and says so in `data.versioning`
 * ('saved' | 'unchanged' | 'included' | 'deferred'); an older builder says
 * nothing, which reads as a plain write.
 */
export const RESTORE_TOOLS = new Set([
  'project_file_restore',
  'project_checkpoint_restore',
  'checkpoint_restore',
  'history_restore_to_time',
]);

/** Calls whose success saves a version (or, for a rollback dry run, does nothing). */
export const VERSION_TOOLS = new Set(['project_vcs_commit', 'project_vcs_rollback', 'deploy_site']);

export const BATCH_TOOL = 'hiveku_batch';

/** Every bare tool name this module classifies. hooks/hooks.json must match all of them. */
export const TRACKED_TOOLS = new Set([...WRITE_TOOLS, ...RESTORE_TOOLS, ...VERSION_TOOLS, BATCH_TOOL]);

/* ── small readers ───────────────────────────────────────────────────────── */

export function bareToolName(toolName) {
  if (typeof toolName !== 'string') return null;
  const bare = toolName.replace(TOOL_PREFIX_RE, '').trim().toLowerCase();
  return bare || null;
}

/** absent / null / '' / 'main' is Your site, exactly as the builder parses `branch`. */
export function normalizeBranch(branch) {
  if (typeof branch !== 'string') return 'main';
  const b = branch.trim();
  return b === '' ? 'main' : b;
}

function projectIdOf(input) {
  const id = input && typeof input === 'object' ? input.project_id : null;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  // The route answers 400 for anything that is not a uuid, so a non-uuid id
  // never names a project that changed.
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

function tryJson(text) {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // A failure payload can carry a prefix before the JSON envelope.
    const open = trimmed.indexOf('{');
    const close = trimmed.lastIndexOf('}');
    if (open !== -1 && close > open) {
      try {
        return JSON.parse(trimmed.slice(open, close + 1));
      } catch { /* not JSON */ }
    }
    return undefined;
  }
}

function textOfBlocks(blocks) {
  return blocks
    .filter((b) => b && typeof b === 'object' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

/**
 * What a tool returned, in whichever shape the hook received it: a string, an
 * MCP content-block array, a `{ content, isError, structuredContent }` result,
 * or an already-parsed object. Returns `{ failed, body, text }`, where `failed`
 * is true only on an affirmative failure signal.
 */
export function readOutcome(response, { failed = false } = {}) {
  let text = '';
  let body;
  let isError = false;
  if (typeof response === 'string') {
    text = response;
  } else if (Array.isArray(response)) {
    text = textOfBlocks(response);
  } else if (response && typeof response === 'object') {
    if (Array.isArray(response.content)) {
      text = textOfBlocks(response.content);
      isError = response.isError === true;
      if (response.structuredContent && typeof response.structuredContent === 'object') {
        body = response.structuredContent;
      }
    } else {
      body = response;
      try { text = JSON.stringify(response); } catch { text = ''; }
    }
  }
  if (body === undefined) body = tryJson(text);
  // The MCP proxy's failure envelope: `{ error, status >= 400, details }`.
  // Only that shape counts: a builder answer may carry an `error` field on a
  // success, and reading every `error` as a failure would drop real writes.
  const envelopeFailure =
    body && typeof body === 'object' && !Array.isArray(body) &&
    typeof body.error === 'string' && body.error !== '' &&
    typeof body.status === 'number' && body.status >= 400;
  return { failed: Boolean(failed || isError || envelopeFailure), body, text };
}

function dataOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data;
  return body;
}

/**
 * The machine-readable error code of a failure, when it is one of `wanted`.
 * A code the envelope states decides on its own: a `content_conflict` whose
 * hint happens to mention `nothing_to_commit` is still a content conflict.
 * The text is searched only when no code field is readable at all (a
 * truncated failure string).
 */
function errorCodeOf(outcome, wanted) {
  const b = outcome.body;
  if (b && typeof b === 'object') {
    const stated = [b.code, b.details?.code, b.details?.data?.code, b.data?.code].find(
      (c) => typeof c === 'string' && c !== '',
    );
    if (stated) return wanted.includes(stated) ? stated : null;
  }
  const text = outcome.text || '';
  return wanted.find((c) => new RegExp(`\\b${c}\\b`).test(text)) || null;
}

function isDryRun(input, data) {
  if (data && data.dry_run === true) return true;
  const d = input && typeof input === 'object' ? input.dry_run : undefined;
  return d === true || d === 'true';
}

/** A publish whose version could not be saved first says so in its note. */
const PIN_FAILED_RE = /could not be saved as a version|not linked to a version/i;

function vcsCommitIdOf(body) {
  const data = dataOf(body);
  const id = data?.vcs_commit_id ?? body?.vcs_commit_id;
  return typeof id === 'string' && id ? id : null;
}

/* ── classification ──────────────────────────────────────────────────────── */

/**
 * The ledger lines one tool call earns, WITHOUT `t`.
 *
 * `outcome` comes from readOutcome(). Every branch answers the one question
 * the Stop hook asks later: after this call, does the project (or branch) hold
 * changes that no version holds?
 */
export function classifyCall(toolName, input, outcome) {
  const bare = bareToolName(toolName);
  if (!bare || !TRACKED_TOOLS.has(bare)) return [];
  if (bare === BATCH_TOOL) return classifyBatch(input, outcome);

  const projectId = projectIdOf(input);
  if (!projectId) return [];
  const branch = normalizeBranch(input?.branch);
  // A branch name the builder would refuse never names a real branch, and a
  // line must never carry free text: record nothing for it.
  const line = (kind, onBranch = branch) =>
    (BRANCH_RE.test(onBranch) ? [{ kind, project_id: projectId, branch: onBranch, tool: bare }] : []);
  const data = dataOf(outcome.body);

  if (WRITE_TOOLS.has(bare)) {
    if (outcome.failed) return [];
    if (isDryRun(input, data)) return [];
    // A Your-site save answers `uncommitted: true` when it wrote anything;
    // an explicit false means nothing changed. Absent (an older builder)
    // still counts as a write.
    if (data && data.uncommitted === false) return [];
    return line('write');
  }

  if (RESTORE_TOOLS.has(bare)) {
    if (outcome.failed) return [];
    const versioning = data?.versioning;
    if (versioning === 'saved' || versioning === 'included') return line('versioned', 'main');
    if (versioning === 'unchanged') return [];
    return line('write', 'main');
  }

  if (bare === 'project_vcs_commit') {
    if (outcome.failed) {
      // 409 nothing_to_commit: everything is already in a version.
      return errorCodeOf(outcome, ['nothing_to_commit']) ? line('versioned') : [];
    }
    const onBranch = typeof data?.branch_name === 'string' && data.branch_name
      ? normalizeBranch(data.branch_name)
      : branch;
    return line('versioned', onBranch);
  }

  if (bare === 'project_vcs_rollback') {
    if (outcome.failed) {
      // Files WERE written, the version was not recorded: that is a write.
      return errorCodeOf(outcome, ['rollback_incomplete']) ? line('write') : [];
    }
    // Dry run unless literally `dry_run: false`, the same rule as the route.
    const applied = input?.dry_run === false && data?.dry_run !== true;
    if (!applied) return [];
    if (data?.noop === true) return [];
    const onBranch = typeof data?.branch?.name === 'string' && data.branch.name
      ? normalizeBranch(data.branch.name)
      : branch;
    return line('versioned', onBranch);
  }

  if (bare === 'deploy_site') {
    if (outcome.failed) return [];
    // A tier bound to a branch saves that branch's unsaved edits as a
    // version before it pins the build; `branch` on deploy_site is the
    // assertion of which branch that is.
    if (branch !== 'main') return line('versioned', branch);
    const env = typeof input?.environment === 'string' ? input.environment.trim().toLowerCase() : '';
    if (env !== 'production') return [];
    // Production saves Your site as a version and pins the build to it, and
    // says so with `vcs_commit_id`. No id (an older builder, a GitHub-sourced
    // publish) or a note saying the save failed: nothing was versioned.
    if (PIN_FAILED_RE.test(outcome.text || '')) return [];
    return vcsCommitIdOf(outcome.body) ? line('versioned', 'main') : [];
  }

  return [];
}

/**
 * hiveku_batch: each member is classified on ITS OWN arguments and result.
 * The envelope is `{ results: [{ ok, result?, error? }] }`, index-aligned with
 * `calls`; a member with no result entry never ran.
 *
 * When the envelope cannot be read at all (Claude Code swaps a large MCP
 * result for a "saved to file" note, and cuts a long failure text in the
 * middle), the members' writes are ASSUMED (assumeBatchWrites): a missed
 * write is a missed reminder, while an extra one costs a status check that
 * answers clean. A readable answer with no `results` (the batch was refused
 * before it ran anything) records nothing.
 */
function classifyBatch(input, outcome) {
  const calls = Array.isArray(input?.calls) ? input.calls : [];
  const body = outcome.body;
  if (!Array.isArray(body?.results)) {
    const readable = body !== null && typeof body === 'object';
    return readable ? [] : assumeBatchWrites(calls);
  }
  const results = body.results;
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const r = results[i];
    if (!call || typeof call.tool !== 'string' || !r || typeof r !== 'object') continue;
    const member = bareToolName(call.tool);
    if (!member || member === BATCH_TOOL || !TRACKED_TOOLS.has(member)) continue;
    let text = '';
    try { text = JSON.stringify(r.result ?? null); } catch { text = ''; }
    if (r.error && typeof r.error === 'object') text += ` ${String(r.error.message ?? '')} ${String(r.error.code ?? '')}`;
    const memberOutcome = {
      failed: r.ok !== true,
      body: r.result && typeof r.result === 'object' ? r.result : tryJson(typeof r.result === 'string' ? r.result : ''),
      text,
    };
    out.push(...classifyCall(member, call.args ?? {}, memberOutcome));
  }
  return out;
}

/**
 * Every member that writes a project's files (a write tool or a restore lane,
 * not a dry run) as a `write` on its own project and branch, once per pair.
 * Version tools are not assumed to have succeeded: with no answer to read, a
 * version save proves nothing, and the Stop hook's status check settles it.
 */
function assumeBatchWrites(calls) {
  const out = [];
  const seen = new Set();
  for (const call of calls) {
    if (!call || typeof call.tool !== 'string') continue;
    const member = bareToolName(call.tool);
    if (!member || (!WRITE_TOOLS.has(member) && !RESTORE_TOOLS.has(member))) continue;
    const args = call.args && typeof call.args === 'object' ? call.args : {};
    if (isDryRun(args, null)) continue;
    const projectId = projectIdOf(args);
    if (!projectId) continue;
    const branch = RESTORE_TOOLS.has(member) ? 'main' : normalizeBranch(args.branch);
    if (!BRANCH_RE.test(branch)) continue;
    const key = `${projectId}\u0000${branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'write', project_id: projectId, branch, tool: member });
  }
  return out;
}

/**
 * The lines a PostToolUse or PostToolUseFailure payload earns.
 *
 * PostToolUse fires only after a SUCCESSFUL call; an MCP tool that answered
 * `isError` fires PostToolUseFailure instead, with the failure text in
 * `error`. Both land here, because two failures carry facts the ledger needs:
 * `nothing_to_commit` (already versioned) and `rollback_incomplete` (files
 * written, no version).
 */
export function classifyHookPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const event = payload.hook_event_name;
  const failedEvent = event === 'PostToolUseFailure';
  const outcome = failedEvent
    ? readOutcome(typeof payload.error === 'string' ? payload.error : payload.tool_response, { failed: true })
    : readOutcome(payload.tool_response);
  // A failed batch still carries its members' results: the ones that ran
  // before it stopped are real. Classify them on their own `ok`.
  if (failedEvent && bareToolName(payload.tool_name) === BATCH_TOOL) {
    return classifyBatch(payload.tool_input, { ...outcome, failed: false });
  }
  return classifyCall(payload.tool_name, payload.tool_input, outcome);
}

/* ── the file ────────────────────────────────────────────────────────────── */

/** A session id as a file name: only [A-Za-z0-9_-], or null when none is usable. */
export function safeSessionId(sessionId) {
  if (typeof sessionId !== 'string') return null;
  const cleaned = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : null;
}

export function ledgerDir({ tmpDir = os.tmpdir() } = {}) {
  return path.join(tmpDir, LEDGER_DIRNAME);
}

/** This process's uid, or null where there is none (Windows). */
function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

/**
 * True when `dir` is safe to keep a ledger in: a real directory (lstat, so a
 * symlink is refused), owned by `uid`, with no group or other write bit.
 * Where there is no uid (Windows, whose temp folder is per user) only the
 * symlink and directory checks apply.
 */
export function ledgerDirIsTrusted(dir, { uid = currentUid() } = {}) {
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return false;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return false;
  if (uid === null || uid === undefined) return true;
  return st.uid === uid && (st.mode & 0o022) === 0;
}

const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

/**
 * Open a session file without following a symlink, and keep it only when it
 * is a regular file owned by `uid`. Returns the fd, or null. Never throws.
 */
function openLedgerFile(file, flags, uid) {
  let fd;
  try {
    fd = fs.openSync(file, flags | O_NOFOLLOW, 0o600);
  } catch {
    return null;
  }
  try {
    const st = fs.fstatSync(fd);
    if (st.isFile() && (uid === null || uid === undefined || st.uid === uid)) return fd;
  } catch { /* fall through */ }
  try { fs.closeSync(fd); } catch { /* already closed */ }
  return null;
}

/** A line the ledger may hold: a known kind, a uuid project, a branch by the builder's rule. */
function isLedgerLine(l) {
  return Boolean(
    l && KINDS.has(l.kind) &&
    typeof l.project_id === 'string' && UUID_RE.test(l.project_id) &&
    typeof l.branch === 'string' && BRANCH_RE.test(l.branch),
  );
}

export function ledgerPath(sessionId, opts = {}) {
  const id = safeSessionId(sessionId);
  return id ? path.join(ledgerDir(opts), `${id}.jsonl`) : null;
}

/** Ledgers older than this are removed when a session starts its own. */
const STALE_LEDGER_MS = 3 * 24 * 60 * 60 * 1000;

function pruneStaleLedgers(dir, keep, now) {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.jsonl') || name === keep) continue;
      const file = path.join(dir, name);
      try {
        if (now - fs.lstatSync(file).mtimeMs > STALE_LEDGER_MS) fs.unlinkSync(file);
      } catch { /* another session's file, or already gone */ }
    }
  } catch { /* best effort */ }
}

/**
 * Append lines for one session. One write call for all of them, so a
 * parallel hook's lines never interleave inside ours. Lines that fail the
 * ledger's shape are dropped; an untrusted directory records nothing.
 * Never throws. `uid` exists for tests.
 */
export function appendLedger(sessionId, lines, { tmpDir = os.tmpdir(), now = Date.now(), uid = currentUid() } = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const file = ledgerPath(sessionId, { tmpDir });
  if (!file) return false;
  const valid = lines
    .map((l) => (l && typeof l === 'object' ? { ...l, branch: normalizeBranch(l.branch) } : l))
    .filter(isLedgerLine);
  if (valid.length === 0) return false;
  let fd = null;
  try {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!ledgerDirIsTrusted(dir, { uid })) return false;
    fd = openLedgerFile(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT, uid);
    if (fd === null) return false;
    const fresh = fs.fstatSync(fd).size === 0;
    const body = Buffer.from(valid
      .map((l) => JSON.stringify({ t: now, kind: l.kind, project_id: l.project_id.toLowerCase(), branch: l.branch, ...(typeof l.tool === 'string' && TRACKED_TOOLS.has(l.tool) ? { tool: l.tool } : {}) }))
      .join('\n') + '\n', 'utf8');
    let written = 0;
    while (written < body.length) written += fs.writeSync(fd, body, written, body.length - written);
    if (fresh) pruneStaleLedgers(dir, path.basename(file), now);
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
  }
}

/**
 * Every well-formed line of a session's ledger, in file order. [] when there
 * is none, and when the directory or the file cannot be trusted. A line that
 * does not name a uuid project and a valid branch is skipped, whoever wrote
 * it. `uid` exists for tests.
 */
export function readLedger(sessionId, { tmpDir = os.tmpdir(), uid = currentUid() } = {}) {
  const file = ledgerPath(sessionId, { tmpDir });
  if (!file) return [];
  if (!ledgerDirIsTrusted(path.dirname(file), { uid })) return [];
  const fd = openLedgerFile(file, fs.constants.O_RDONLY, uid);
  if (fd === null) return [];
  let raw;
  try {
    raw = fs.readFileSync(fd, 'utf8');
  } catch {
    return [];
  } finally {
    try { fs.closeSync(fd); } catch { /* already closed */ }
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (!e || typeof e !== 'object') continue;
      const entry = { kind: e.kind, project_id: e.project_id, branch: normalizeBranch(e.branch) };
      if (!isLedgerLine(entry)) continue;
      // Only the known fields, rebuilt: nothing else a line carries is kept.
      out.push({
        t: typeof e.t === 'number' ? e.t : null,
        ...entry,
        project_id: entry.project_id.toLowerCase(),
        ...(typeof e.tool === 'string' && TRACKED_TOOLS.has(e.tool) ? { tool: e.tool } : {}),
      });
    } catch { /* a torn or foreign line: skip it, keep the rest */ }
  }
  return out;
}

/**
 * Fold the ledger into one row per (project, branch), with the position of
 * the last line of each kind (-1 when there is none).
 */
export function foldLedger(entries) {
  const pairs = new Map();
  entries.forEach((e, i) => {
    const key = `${e.project_id}\u0000${e.branch}`;
    let p = pairs.get(key);
    if (!p) {
      p = { project_id: e.project_id, branch: e.branch, lastWrite: -1, lastVersioned: -1, lastBlocked: -1, lastNotified: -1 };
      pairs.set(key, p);
    }
    if (e.kind === 'write') p.lastWrite = i;
    else if (e.kind === 'versioned') p.lastVersioned = i;
    else if (e.kind === 'blocked') p.lastBlocked = i;
    else if (e.kind === 'notified') p.lastNotified = i;
  });
  return [...pairs.values()];
}

/**
 * The pairs that are dirty (last write after last version) AND have been
 * written since the given reminder kind was last recorded for them, so one
 * episode of unversioned work earns one reminder of each kind, not one per
 * turn. `since`: 'blocked' | 'notified' | null (every dirty pair).
 */
export function dirtyPairs(entries, since = null) {
  return foldLedger(entries).filter((p) => {
    if (p.lastWrite <= p.lastVersioned) return false;
    if (since === 'blocked') return p.lastWrite > p.lastBlocked;
    if (since === 'notified') return p.lastWrite > p.lastNotified;
    return true;
  });
}

/* ── the hook ────────────────────────────────────────────────────────────── */

/**
 * `hiveku hook post-tool-use`: classify, append, done. Returns the lines it
 * recorded (for tests). Never throws, never prints.
 */
export function runPostToolUseHook(payload, opts = {}) {
  try {
    const lines = classifyHookPayload(payload);
    if (!lines.length) return [];
    return appendLedger(payload.session_id, lines, opts) ? lines : [];
  } catch {
    return [];
  }
}
