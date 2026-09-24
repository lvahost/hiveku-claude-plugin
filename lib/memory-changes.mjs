/**
 * "N memory changes since your last session here" (memory event log plan 14.4,
 * Session start).
 *
 * Hiveku's database now records every change to an account's memory, rules and
 * skills, whatever made it (dashboard, department agents, other sessions, VS
 * Code, GitHub sync). A session that edits a memory document it read earlier
 * needs to know that other writers exist; the cheapest reminder is a count at
 * the start of a session, pointing at /hiveku:memory-changes for the detail.
 *
 * ★ NEVER ON A HOOK'S CRITICAL PATH. The count needs a network call
 * (memory_log_list), and the hooks must stay local. So, the probe-remote
 * pattern (lib/update-check.mjs):
 *
 *   - SessionStart (a fresh start only, not resume / clear / compact) rotates
 *     the per-account state: the previous session's start becomes the window's
 *     start, now is its end. When there was a previous session it spawns a
 *     DETACHED probe for that window and prints nothing itself.
 *   - The probe (`hiveku hook probe-memory <accountId>`) calls memory_log_list
 *     once and caches ONLY NUMBERS: the count, whether there were more, when it
 *     checked. A failure caches `error: true`, so nothing re-spawns in a loop.
 *   - UserPromptSubmit (bound folders only, local reads) prints the notice once
 *     per window when the cached count is above zero.
 *
 * ★ THE HOOK OUTPUT IS AN INSTRUCTION CHANNEL (test/instruction-channel.test.mjs).
 * The log's entry names and reasons are other people's and agents' free text,
 * so none of it is stored here and none of it can reach the notice: the notice
 * is built from an integer and a date this module wrote itself. A count that is
 * not a small non-negative integer, or a date that is not our own ISO stamp,
 * produces no notice at all.
 *
 * Every function fails silent: the notice is a courtesy, never a reason a hook
 * breaks or a session stalls.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { writeFileAtomic, isUuid } from './util.mjs';

/** One page of the log is enough to say "N" or "more than N". */
export const MEMORY_PROBE_LIMIT = 100;
/** A probe that never wrote back (killed, laptop closed) is retried after this. */
export const MEMORY_PROBE_RETRY_MS = 10 * 60 * 1000;
/** Only a start that recent counts: a window older than 30 days is not "since your last session". */
export const MEMORY_WINDOW_MAX_MS = 30 * 24 * 60 * 60 * 1000;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function iso(ms) {
  return new Date(ms).toISOString();
}

function validIso(value) {
  return typeof value === 'string' && ISO_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export function memoryStatePath(dataDir, accountId) {
  if (!isUuid(accountId)) throw new Error('not an account id');
  return path.join(dataDir, 'memory-changes', `${String(accountId).toLowerCase()}.json`);
}

export async function readMemoryState(dataDir, accountId) {
  try {
    const parsed = JSON.parse(await fs.readFile(memoryStatePath(dataDir, accountId), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeMemoryState(dataDir, accountId, state) {
  try {
    await writeFileAtomic(memoryStatePath(dataDir, accountId), JSON.stringify(state, null, 2) + '\n');
    return true;
  } catch {
    return false; // sandboxed data dir: no notice, never an error
  }
}

/**
 * A fresh session started in a folder bound to `accountId`. Rotates the
 * window and says whether a probe should run for it. `source` is the
 * SessionStart payload's source: only 'startup' (or none) is a new session;
 * resume, clear and compact continue one.
 */
export async function startMemorySession(dataDir, accountId, { now = Date.now(), source } = {}) {
  if (source && source !== 'startup') return { probe: false };
  if (!isUuid(accountId)) return { probe: false };
  const prior = (await readMemoryState(dataDir, accountId)) ?? {};
  const previous = validIso(prior.session_start) && now - Date.parse(prior.session_start) <= MEMORY_WINDOW_MAX_MS
    ? prior.session_start
    : null;
  const next = {
    session_start: iso(now),
    previous_session_start: previous,
    probe: null,
    probe_spawned_at: previous ? iso(now) : null,
    notified_since: null,
  };
  const written = await writeMemoryState(dataDir, accountId, next);
  return { probe: Boolean(previous && written) };
}

/**
 * The probe body: count the changes in [previous_session_start, session_start)
 * with one memory_log_list page. `callTool(name, args)` resolves to the tool's
 * parsed JSON body or throws. Stores numbers only.
 */
export async function probeMemoryChanges(dataDir, accountId, { callTool, now = Date.now() } = {}) {
  const state = await readMemoryState(dataDir, accountId);
  if (!state || !validIso(state.previous_session_start) || !validIso(state.session_start)) return null;
  const since = state.previous_session_start;
  const until = state.session_start;
  let probe;
  try {
    const body = await callTool('memory_log_list', {
      since,
      until,
      limit: MEMORY_PROBE_LIMIT,
      // Project-scoped entries (the Coder's project memory) are this account's memory too.
      include_project_scoped: true,
    });
    const lines = body && typeof body === 'object' ? body.data : null;
    if (!Array.isArray(lines)) throw new Error('unexpected memory_log_list shape');
    probe = {
      since,
      until,
      checked_at: iso(now),
      count: Math.min(lines.length, MEMORY_PROBE_LIMIT),
      more: typeof body.next_cursor === 'string' && body.next_cursor.length > 0,
    };
  } catch {
    probe = { since, until, checked_at: iso(now), error: true };
  }
  // Re-read before writing: a newer session may have rotated the window while
  // the probe was on the network, and its state must not be clobbered.
  const latest = await readMemoryState(dataDir, accountId);
  if (!latest || latest.previous_session_start !== since || latest.session_start !== until) return probe;
  await writeMemoryState(dataDir, accountId, { ...latest, probe });
  return probe;
}

/**
 * The one notice line, or null. Built from an integer and our own ISO date,
 * nothing else, so it is safe on the hook channel.
 */
export function memoryChangesNotice(state) {
  if (!state || typeof state !== 'object') return null;
  const probe = state.probe;
  if (!probe || typeof probe !== 'object' || probe.error) return null;
  if (!validIso(state.previous_session_start) || probe.since !== state.previous_session_start) return null;
  if (probe.until !== state.session_start) return null;
  if (state.notified_since === probe.since) return null;
  const count = probe.count;
  if (!Number.isInteger(count) || count <= 0 || count > MEMORY_PROBE_LIMIT) return null;
  const date = state.previous_session_start.slice(0, 10);
  const howMany = probe.more === true ? `More than ${count} changes` : `${count} change${count === 1 ? '' : 's'}`;
  return (
    `Hiveku: ${howMany} to this account's memory since your last session here (${date}), by people, ` +
    'department agents or other sessions. Before editing a memory entry, check memory_log_list for it; ' +
    '/hiveku:memory-changes shows who changed what, from which app and why.'
  );
}

/**
 * UserPromptSubmit: the notice once per window, marking it said. Also decides
 * whether a probe that never wrote back should be spawned again.
 */
export async function takeMemoryNotice(dataDir, accountId, { now = Date.now() } = {}) {
  if (!isUuid(accountId)) return { notice: null, probe: false };
  const state = await readMemoryState(dataDir, accountId);
  if (!state) return { notice: null, probe: false };
  const notice = memoryChangesNotice(state);
  if (notice) {
    const written = await writeMemoryState(dataDir, accountId, { ...state, notified_since: state.probe.since });
    // Said only when it can be marked said: a read-only data dir must not
    // repeat the line on every prompt.
    return { notice: written ? notice : null, probe: false };
  }
  const pending =
    validIso(state.previous_session_start) &&
    !state.probe &&
    (!validIso(state.probe_spawned_at) || now - Date.parse(state.probe_spawned_at) > MEMORY_PROBE_RETRY_MS);
  if (pending) {
    const written = await writeMemoryState(dataDir, accountId, { ...state, probe_spawned_at: iso(now) });
    return { notice: null, probe: written };
  }
  return { notice: null, probe: false };
}

/**
 * Fire-and-forget the memory probe. Never throws, never waits. `selfPath` is
 * bin/hiveku (process.argv[1] from the hook invocation).
 */
export function spawnDetachedMemoryProbe(selfPath, accountId, env = process.env) {
  if (!isUuid(accountId)) return false;
  try {
    const child = spawn(process.execPath, [selfPath, 'hook', 'probe-memory', String(accountId)], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * A tools/call JSON-RPC response to its parsed JSON body. Throws on a tool
 * error (isError, or the proxy's { error, status >= 400 } body) so the probe
 * records `error: true` instead of counting an error as "no changes".
 */
export function toolResultJson(res) {
  const result = res?.result;
  const text = result?.content?.[0]?.text;
  if (result?.isError) throw new Error('tool error');
  if (typeof text !== 'string') throw new Error('no text content');
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string' && Number(parsed.status) >= 400) {
    throw new Error('tool error');
  }
  return parsed;
}
