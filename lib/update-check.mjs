/**
 * Remote-aware update checking.
 *
 * The plugin cannot update itself, and the pre-existing session-start notice
 * (bin/hiveku describeVersionSkew) is deliberately LOCAL-ONLY: it can see an
 * update only after the app's background updater has already fast-forwarded
 * the marketplace clone. When that updater is off, sandboxed, or broken, a
 * release pushed to GitHub is invisible on the machine and users sit on old
 * versions reading every fixed bug as still broken.
 *
 * This module closes that gap without ever putting the network on a hook's
 * critical path:
 *
 *   - a PROBE (`hiveku hook probe-remote`) fetches the published manifest and
 *     caches {remote_version, checked_at} in the plugin data dir. Hooks never
 *     run it inline — they spawn it DETACHED (fire-and-forget) when the cache
 *     is stale, so the freshest a session can learn about a release is "one
 *     hook firing after the fetch landed", and the slowest hook stays local.
 *   - session start folds the cached remote version into the existing notice.
 *   - a UserPromptSubmit hook gives marathon sessions (one chat for days) a
 *     periodic look: LOCAL READS ONLY, speaks at most once per NOTICE_TTL_MS
 *     per machine, and only in a Hiveku-bound folder — an update nudge must
 *     never spend the user's context mid-unrelated-work.
 *
 * Every function here fails silent: an update notice is a courtesy, never a
 * reason a hook breaks or a session stalls.
 */

import path from 'node:path';
import { promises as fs, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { writeFileAtomic } from './util.mjs';

/** The repo is public; its manifest on main IS the published latest. */
export const REMOTE_MANIFEST_URL =
  'https://raw.githubusercontent.com/lvahost/hiveku-claude-plugin/main/.claude-plugin/plugin.json';

/** How long a cached remote answer stays fresh before a hook re-probes. */
export const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
/** Minimum gap between periodic (mid-session) nudges, machine-wide. */
export const NOTICE_TTL_MS = 12 * 60 * 60 * 1000;
export const PROBE_TIMEOUT_MS = 5000;

const CACHE_FILE = 'update-check.json';

export function updateCheckPath(dataDir) {
  return path.join(dataDir, CACHE_FILE);
}

/** Numeric semver-ish compare; tolerates missing segments and junk (0). */
export function cmpVersions(a, b) {
  const num = (v) => String(v ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const [pa, pb] = [num(a), num(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export async function readUpdateCheck(dataDir) {
  try {
    return JSON.parse(await fs.readFile(updateCheckPath(dataDir), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Is a probe due? Cheap enough for the pre-tool-use hook: one stat, no JSON.
 * A failed probe still rewrites the file, so the mtime throttles retries too.
 */
export function probeIsStale(dataDir, now = Date.now()) {
  try {
    return now - statSync(updateCheckPath(dataDir)).mtimeMs > CHECK_TTL_MS;
  } catch {
    return true; // never probed
  }
}

/**
 * Fire-and-forget the remote probe. Never throws, never waits.
 * `selfPath` is bin/hiveku (process.argv[1] from the hook invocation).
 */
export function spawnDetachedProbe(selfPath, env = process.env) {
  try {
    const child = spawn(process.execPath, [selfPath, 'hook', 'probe-remote'], {
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
 * The probe body: fetch the published manifest, cache what it says.
 * On ANY failure it still stamps checked_at (with error:true) so hooks do not
 * hot-loop spawning probes against a dead network.
 */
export async function probeRemoteVersion(
  dataDir,
  { fetchImpl = fetch, url = REMOTE_MANIFEST_URL, now = Date.now() } = {},
) {
  const prior = (await readUpdateCheck(dataDir)) ?? {};
  let next;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetchImpl(url, { signal: ctl.signal });
    clearTimeout(timer);
    const version = res.ok ? String((await res.json())?.version ?? '').trim() : '';
    next = /^\d+(\.\d+)*$/.test(version)
      ? { ...prior, checked_at: now, remote_version: version, error: undefined }
      : { ...prior, checked_at: now, error: true };
  } catch {
    next = { ...prior, checked_at: now, error: true };
  }
  try {
    await writeFileAtomic(updateCheckPath(dataDir), JSON.stringify(next, null, 2) + '\n');
  } catch {
    // Sandboxed data dir: the probe simply never caches. Hooks stay silent.
  }
  return next;
}

const RESTART_RITUAL =
  'Run /hiveku:update, then completely quit and reopen Claude (in terminal Claude Code, /reload-plugins also works). ' +
  'Tell the user in ONE short line at a natural pause — never interrupt their task, never repeat unless they ask.';

/**
 * Which single notice, if any, does this machine's state deserve?
 * Priority: an update already pulled locally (one click away) beats a remote
 * announcement (needs the update to download) beats a stale running session.
 */
export function chooseUpdateNotice({ running, installedNewest, cloneVersion, remoteVersion }) {
  const have = installedNewest || running;
  if (cloneVersion && cmpVersions(cloneVersion, have) > 0) {
    return {
      kind: 'apply',
      text:
        `Hiveku: plugin ${cloneVersion} is downloaded and ready to install (this machine has ${have}). ` +
        RESTART_RITUAL,
    };
  }
  if (remoteVersion && cmpVersions(remoteVersion, have) > 0 && cmpVersions(remoteVersion, cloneVersion || '0') > 0) {
    return {
      kind: 'remote',
      text:
        `Hiveku: plugin ${remoteVersion} has been released (this machine has ${have}). ` +
        RESTART_RITUAL,
    };
  }
  if (running && installedNewest && cmpVersions(installedNewest, running) > 0) {
    return {
      kind: 'skew',
      text:
        `Hiveku: this session is running plugin ${running}, but ${installedNewest} is installed. A session keeps ` +
        'the bridge it started with, so newer tools and skills are missing here until you start a new ' +
        'session. Symptoms look like missing capability rather than an error.',
    };
  }
  return null;
}

/**
 * The marathon-session nudge (UserPromptSubmit): LOCAL READS ONLY, and speaks
 * at most once per NOTICE_TTL_MS machine-wide — stamping last_notice_at only
 * when it actually speaks. Skew notices are excluded here on purpose: that is
 * a property of the session, said once at session start, not worth repeating
 * on a user's prompt.
 */
export async function maybePeriodicNotice(dataDir, { running, installedNewest, cloneVersion, now = Date.now() }) {
  const cache = (await readUpdateCheck(dataDir)) ?? {};
  const notice = chooseUpdateNotice({
    running,
    installedNewest,
    cloneVersion,
    remoteVersion: cache.remote_version,
  });
  if (!notice || notice.kind === 'skew') return null;
  if (cache.last_notice_at && now - cache.last_notice_at < NOTICE_TTL_MS) return null;
  try {
    await writeFileAtomic(
      updateCheckPath(dataDir),
      JSON.stringify({ ...cache, last_notice_at: now }, null, 2) + '\n',
    );
  } catch {
    return null; // cannot throttle => stay silent rather than risk nagging every prompt
  }
  return notice;
}
