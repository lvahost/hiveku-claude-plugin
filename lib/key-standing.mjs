/**
 * Why a refused key stopped working, and when that is a reason to remove an
 * account from this computer (offboarding O8b,
 * notes/desktop-offboarding-o8b-2026-11-08.md). The VS Code extension's
 * src/keyStanding.ts (O8a) is the model: the same rule, for the MCP bridge.
 *
 * The tool server answers every refused key with the same 401: an owner
 * switching one key off, a reconnect replacing it, the person leaving the team
 * and the account closing all read the same. The website tells the key's own
 * holder which it was: POST https://app.hiveku.com/api/account/mcp-keys/standing
 * (builder #2087), with the refused key as the bearer and the account it is
 * for. Its four answers: active, key_switched_off, removed_from_team,
 * account_closed.
 *
 * ★ THE RULE ABOVE EVERYTHING: only removed_from_team and account_closed, from
 * that route, read in full, twice, at least two minutes apart and within 30
 * minutes, about the same key still stored for the account, lead to a removal.
 * Everything else (an error, a timeout, a redirect, a 404 or any other 4xx, a
 * 429, a 5xx, a body that is not exactly one of the four answers, active,
 * key_switched_off, a key that changed in between) changes nothing. A passing
 * fault can never delete anyone's work; a release that keeps saying "remove" is
 * what the website's hourly brake is for.
 *
 * ★ AND ONLY FOR A KEY /hiveku:connect MINTED HERE. The website answers about
 * the person who made the key: it records who made a key, never who holds it.
 * The connect exchange makes each key for the person signed in to the browser,
 * so its keys are the person's own (lib/credentials.mjs keeps a hash of each).
 * A key pasted with `accounts add` may be a teammate's, who left while the
 * person here is still on the team. For such a key a removal answer removes
 * nothing and is not repeated (it may be about someone else): the person is
 * told once that the key stopped working.
 *
 * ★ KEPT ON DISK, NOT ONLY IN MEMORY. The extension lives as long as VS Code;
 * a bridge lives one session, and Hiveku's 401 latches it (lib/upstream.mjs),
 * so it hears its key refused once. So the first sighting and the quiet hours
 * are kept in the plugin's data folder, offboarding/watch/<account>.json (times,
 * the answer and a hash of the key, never the key): the confirming question
 * comes from this bridge about two minutes later, or from the next session's
 * bridge within 30 minutes, and ten sessions refused at once ask once. A file
 * that cannot be read is no sighting, the side that removes nothing.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { HIVEKU_APP_URL, USER_AGENT } from './util.mjs';
import { isAccountUuid } from './made-folders.mjs';
import { readPrivateJson, writePrivateJson } from './private-state.mjs';

export const KEY_STANDINGS = ['active', 'key_switched_off', 'removed_from_team', 'account_closed'];

export const STANDING_PATH = '/api/account/mcp-keys/standing';
/** How long one question may take, the body included. */
export const ASK_TIMEOUT_MS = 10_000;
/** The answer is one short JSON object; anything larger is not it. */
export const MAX_ANSWER_BYTES = 4 * 1024;

/** The second question about a removal answer is asked this long after the first (two minutes, and a little). */
export const CONFIRM_AFTER_MS = 2 * 60 * 1000 + 5 * 1000;
/** A first sighting not confirmed within this long is forgotten. */
export const SIGHTING_TTL_MS = 30 * 60 * 1000;
/** After key_switched_off, no new question about that key for this long. */
export const QUIET_AFTER_SWITCHED_OFF_MS = 6 * 60 * 60 * 1000;
/** After active (the 401 was something passing), no new question about that key for this long. */
export const QUIET_AFTER_ACTIVE_MS = 30 * 60 * 1000;
/** After no answer, no new question for this long, or the route's Retry-After, up to an hour. */
export const QUIET_AFTER_NO_ANSWER_MS = 15 * 60 * 1000;
const MOST_RETRY_AFTER_MS = 60 * 60 * 1000;

const HEX64 = /^[0-9a-f]{64}$/;

export function isRemovalStanding(value) {
  return value === 'removed_from_team' || value === 'account_closed';
}

/** The one place the route's answer is read. Anything but exactly one of the four answers is no answer. */
export function readStandingAnswer(status, text) {
  if (status !== 200 || typeof text !== 'string') return { kind: 'no_answer', why: 'unreadable' };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: 'no_answer', why: 'unreadable' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { kind: 'no_answer', why: 'unreadable' };
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'standing') return { kind: 'no_answer', why: 'unreadable' };
  const { standing } = body;
  if (typeof standing !== 'string' || !KEY_STANDINGS.includes(standing)) return { kind: 'no_answer', why: 'unreadable' };
  return { kind: 'answer', standing };
}

/** The body as text, or null once it passes `most` bytes (the rest is never read). */
async function readCapped(res, most) {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    return Buffer.byteLength(text, 'utf8') > most ? null : text;
  }
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > most) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Ask the website why this key stopped working. Never throws. The key goes only
 * in the Authorization header, to the website's address (a constant: a test
 * passes its own), and a redirect is never followed.
 */
export async function askKeyStanding({ appUrl = HIVEKU_APP_URL, key, accountId, timeoutMs = ASK_TIMEOUT_MS, fetchImpl = fetch }) {
  const url = `${String(appUrl).replace(/\/+$/, '')}${STANDING_PATH}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({ account_id: accountId }),
        redirect: 'manual',
        signal: ctrl.signal,
      });
    } catch {
      return { kind: 'no_answer', why: ctrl.signal.aborted ? 'timeout' : 'network' };
    }
    let text;
    try {
      const declared = Number(res.headers.get('content-length') ?? '');
      if (Number.isFinite(declared) && declared > MAX_ANSWER_BYTES) {
        await res.body?.cancel?.().catch(() => undefined);
        return { kind: 'no_answer', why: 'unreadable' };
      }
      text = await readCapped(res, MAX_ANSWER_BYTES);
    } catch {
      return { kind: 'no_answer', why: ctrl.signal.aborted ? 'timeout' : 'unreadable' };
    }
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      return {
        kind: 'no_answer',
        why: 'busy',
        ...(Number.isFinite(after) && after > 0 ? { retryAfterSeconds: Math.ceil(after) } : {}),
      };
    }
    if (res.status >= 500) return { kind: 'no_answer', why: 'unavailable' };
    if (res.status !== 200) return { kind: 'no_answer', why: 'refused' };
    if (text === null) return { kind: 'no_answer', why: 'unreadable' };
    return readStandingAnswer(res.status, text);
  } finally {
    clearTimeout(timer);
  }
}

/** A key, as the watcher keeps it: a hash of its own kind, never the key and never the website's key hash. */
export function keyFingerprint(key) {
  return createHash('sha256').update(`hiveku-claude-plugin offboarding key\n${String(key)}`, 'utf8').digest('hex');
}

/* ── What is kept between processes ───────────────────────────────────────── */

export function watchStatePath(dataDir, accountId) {
  if (!isAccountUuid(accountId)) throw new Error('not an account id');
  return path.join(dataDir, 'offboarding', 'watch', `${accountId}.json`);
}

function validQuiet(q) {
  return q && typeof q === 'object' && Number.isFinite(q.until) && typeof q.key_fp === 'string' && HEX64.test(q.key_fp)
    ? { until: q.until, key_fp: q.key_fp }
    : null;
}

function validSighting(s) {
  return s && typeof s === 'object' && Number.isFinite(s.at) && typeof s.key_fp === 'string' && HEX64.test(s.key_fp) &&
    isRemovalStanding(s.reason)
    ? { at: s.at, key_fp: s.key_fp, reason: s.reason }
    : null;
}

/** What the watcher knows about an account: quiet until when, a first sighting, the key last told about. */
export async function readWatch(dataDir, accountId) {
  const raw = await readPrivateJson(watchStatePath(dataDir, accountId), { mostBytes: 16 * 1024 });
  if (!raw || raw.v !== 1) return { quiet: null, sighting: null, told_fp: null };
  return {
    quiet: validQuiet(raw.quiet),
    sighting: validSighting(raw.sighting),
    told_fp: typeof raw.told_fp === 'string' && HEX64.test(raw.told_fp) ? raw.told_fp : null,
  };
}

function defaultSchedule(fn, ms) {
  const timer = setTimeout(fn, ms);
  // A waiting question never keeps a finished session's bridge alive: the next session asks instead.
  timer.unref?.();
  return { cancel: () => clearTimeout(timer) };
}

/**
 * Watches Hiveku's refusals of stored keys, asks the website why, and removes
 * an account only on the second sighting of a removal answer.
 *
 * deps:
 *   dataDir      the plugin's data folder (required: without it nothing is kept, so nothing is removed)
 *   appUrl       the website's address (default the constant)
 *   storedKey    (accountId) => the key stored for the account now, if any
 *   fromConnect  (accountId, key) => whether connect stored exactly this key here
 *   ask          ({ appUrl, key, accountId }) => the reply (default askKeyStanding)
 *   remove       (accountId, reason, key) => remove the account; called only on the second sighting
 *   keyStopped   (accountId) => tell the person, once per key, that a key not from connect will not work again
 *   log          (line) => void
 *   now, schedule  a test's own clock
 */
export class KeyRefusalWatcher {
  constructor(deps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
    this.schedule = deps.schedule ?? defaultSchedule;
    this.busy = new Set();
    this.timers = new Map();
    this.running = new Set();
    this.disposed = false;
  }

  /** Hiveku refused this key for this account. Never throws; asks at most once for a burst. */
  onRefused(accountId, key) {
    if (this.disposed || !this.deps.dataDir || !isAccountUuid(accountId)) return;
    if (typeof key !== 'string' || !key.startsWith('hvk_')) return;
    if (this.busy.has(accountId)) return;
    this.busy.add(accountId);
    this.track(this.consider(accountId, key).finally(() => this.busy.delete(accountId)));
  }

  /** Resolves once every question and removal started so far has finished (for tests and shutdown). */
  async settled() {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  dispose() {
    this.disposed = true;
    for (const timer of this.timers.values()) timer.cancel();
    this.timers.clear();
  }

  track(promise) {
    const tracked = promise
      .catch((err) => this.deps.log?.(`[offboarding] stopped: ${err?.message || err}`))
      .finally(() => this.running.delete(tracked));
    this.running.add(tracked);
  }

  appUrl() {
    const url = typeof this.deps.appUrl === 'function' ? this.deps.appUrl() : this.deps.appUrl;
    return url || HIVEKU_APP_URL;
  }

  async read(accountId) {
    try {
      return await readWatch(this.deps.dataDir, accountId);
    } catch {
      return { quiet: null, sighting: null, told_fp: null };
    }
  }

  /** Keeps what the watcher knows. A failure is said, and changes nothing else: an unkept sighting confirms nothing. */
  async write(accountId, state) {
    try {
      await writePrivateJson(watchStatePath(this.deps.dataDir, accountId), {
        v: 1,
        quiet: state.quiet,
        sighting: state.sighting,
        told_fp: state.told_fp,
      });
      return true;
    } catch (err) {
      this.deps.log?.(`[offboarding] Could not keep what Hiveku said (${err?.code || 'error'}); nothing is removed on it.`);
      return false;
    }
  }

  async storedKeyOf(accountId) {
    try {
      const key = await this.deps.storedKey(accountId);
      return typeof key === 'string' && key ? key : undefined;
    } catch {
      return undefined;
    }
  }

  async isStored(accountId, fp) {
    const stored = await this.storedKeyOf(accountId);
    return Boolean(stored) && keyFingerprint(stored) === fp;
  }

  /** Whether the key came from connect here; anything uncertain is no. */
  async cameFromConnect(accountId, key) {
    try {
      return (await this.deps.fromConnect(accountId, key)) === true;
    } catch {
      return false;
    }
  }

  scheduleConfirm(accountId, ms) {
    this.cancelConfirm(accountId);
    if (this.disposed) return;
    this.timers.set(
      accountId,
      this.schedule(() => {
        this.timers.delete(accountId);
        this.track(this.confirm(accountId));
      }, Math.max(0, ms)),
    );
  }

  cancelConfirm(accountId) {
    this.timers.get(accountId)?.cancel();
    this.timers.delete(accountId);
  }

  async consider(accountId, key) {
    const fp = keyFingerprint(key);
    const now = this.now();
    const w = await this.read(accountId);
    if (w.quiet && w.quiet.key_fp === fp && now < w.quiet.until) return;
    const s = w.sighting;
    if (s && s.key_fp === fp) {
      const age = now - s.at;
      // The confirming question about this sighting is still to come: set it, and ask nothing now.
      if (age >= 0 && age < CONFIRM_AFTER_MS) {
        this.scheduleConfirm(accountId, CONFIRM_AFTER_MS - age);
        return;
      }
    }
    await this.askAndHandle(accountId, key);
  }

  /** The confirming question: about the key still stored for the account, which must be the sighting's. */
  async confirm(accountId) {
    if (this.disposed) return;
    if (this.busy.has(accountId)) {
      this.scheduleConfirm(accountId, 5_000);
      return;
    }
    this.busy.add(accountId);
    try {
      const w = await this.read(accountId);
      const s = w.sighting;
      if (!s) return;
      const stored = await this.storedKeyOf(accountId);
      if (!stored || keyFingerprint(stored) !== s.key_fp) {
        w.sighting = null;
        await this.write(accountId, w);
        this.deps.log?.('[offboarding] The account has another key now; nothing is removed.');
        return;
      }
      await this.askAndHandle(accountId, stored);
    } finally {
      this.busy.delete(accountId);
    }
  }

  async askAndHandle(accountId, key) {
    let reply;
    try {
      reply = await (this.deps.ask ?? askKeyStanding)({ appUrl: this.appUrl(), key, accountId });
    } catch {
      reply = { kind: 'no_answer', why: 'network' };
    }
    if (!reply || (reply.kind !== 'answer' && reply.kind !== 'no_answer')) reply = { kind: 'no_answer', why: 'unreadable' };
    if (reply.kind === 'answer' && !KEY_STANDINGS.includes(reply.standing)) reply = { kind: 'no_answer', why: 'unreadable' };
    if (this.disposed) return;
    await this.handle(accountId, key, reply);
  }

  async handle(accountId, key, reply) {
    const fp = keyFingerprint(key);
    const now = this.now();
    const w = await this.read(accountId);

    if (reply.kind === 'no_answer') {
      const retry = reply.retryAfterSeconds ? Math.min(reply.retryAfterSeconds * 1000, MOST_RETRY_AFTER_MS) : 0;
      const quietMs = Math.max(retry, QUIET_AFTER_NO_ANSWER_MS);
      // The first sighting, if any, is kept until it expires: a later definite answer may still confirm it.
      w.quiet = { until: now + quietMs, key_fp: fp };
      await this.write(accountId, w);
      this.deps.log?.(`[offboarding] Hiveku gave no answer about a refused key (${reply.why}); nothing changes on this computer.`);
      // This bridge hears its key refused only once, so while a first sighting waits it asks again itself.
      const s = w.sighting;
      if (s && s.key_fp === fp && s.at + SIGHTING_TTL_MS > now + quietMs) this.scheduleConfirm(accountId, quietMs);
      return;
    }

    if (!isRemovalStanding(reply.standing)) {
      this.cancelConfirm(accountId);
      w.sighting = null;
      w.quiet = { until: now + (reply.standing === 'active' ? QUIET_AFTER_ACTIVE_MS : QUIET_AFTER_SWITCHED_OFF_MS), key_fp: fp };
      await this.write(accountId, w);
      this.deps.log?.(`[offboarding] Hiveku says the key is ${reply.standing}; nothing changes on this computer.`);
      return;
    }

    // A removal answer is about whoever made the key. Only a key connect minted here is the person's own.
    if (!(await this.cameFromConnect(accountId, key))) {
      this.cancelConfirm(accountId);
      w.sighting = null;
      w.quiet = { until: now + QUIET_AFTER_SWITCHED_OFF_MS, key_fp: fp };
      // Told once per key, and only while it is still the key stored (not an old one a newer key replaced).
      const tell = w.told_fp !== fp && (await this.isStored(accountId, fp));
      if (tell) w.told_fp = fp;
      await this.write(accountId, w);
      this.deps.log?.(
        '[offboarding] Hiveku will not take this key again. It did not come from /hiveku:connect on this computer, so ' +
          'what Hiveku says about it may be about whoever made it: nothing is removed.',
      );
      if (tell) {
        try {
          await this.deps.keyStopped?.(accountId);
        } catch {
          // Telling the person never changes what happens.
        }
      }
      return;
    }

    const s = w.sighting;
    const age = s && s.key_fp === fp ? now - s.at : null;
    if (age !== null && age >= CONFIRM_AFTER_MS && age <= SIGHTING_TTL_MS) {
      // The second sighting. The key must still be the one stored for the account: a reconnect replaces it.
      this.cancelConfirm(accountId);
      w.sighting = null;
      await this.write(accountId, w);
      if (!(await this.isStored(accountId, fp))) {
        this.deps.log?.('[offboarding] The account has another key now; nothing is removed.');
        return;
      }
      try {
        await this.deps.remove(accountId, reply.standing, key);
      } catch (err) {
        this.deps.log?.(`[offboarding] Removing the account from this computer stopped: ${err?.message || err}`);
      } finally {
        const after = await this.read(accountId);
        after.quiet = { until: this.now() + QUIET_AFTER_SWITCHED_OFF_MS, key_fp: fp };
        await this.write(accountId, after);
      }
      return;
    }
    if (age !== null && age >= 0 && age < CONFIRM_AFTER_MS) {
      // Another session saw it a moment ago: that stays the first sighting, and its confirming question is set.
      this.scheduleConfirm(accountId, CONFIRM_AFTER_MS - age);
      return;
    }
    // A first sighting: it only marks the account, and the confirming question comes about two minutes later.
    this.cancelConfirm(accountId);
    w.sighting = { at: now, key_fp: fp, reason: reply.standing };
    if (!(await this.write(accountId, w))) return;
    this.scheduleConfirm(accountId, CONFIRM_AFTER_MS);
    this.deps.log?.(`[offboarding] Hiveku says ${reply.standing}; asking once more in two minutes before anything is removed.`);
  }
}
