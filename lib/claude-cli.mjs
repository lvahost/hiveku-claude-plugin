/**
 * Find and run Claude Code's command-line tool (`claude`), for `hiveku update`
 * and `hiveku doctor`.
 *
 * ★ WHY THIS EXISTS. `hiveku update` used to run a bare `spawnSync('claude')`,
 * which only searches PATH. The Claude desktop app never puts `claude` on
 * PATH: it runs its own copy from a folder per CLI version,
 *
 *   Windows  %APPDATA%\Claude\claude-code\<ver>\claude.exe
 *   macOS    ~/Library/Application Support/Claude/claude-code/<ver>/claude.app/Contents/MacOS/claude
 *
 * so on a desktop-only machine every update fell through to a git pull that
 * installed nothing and still printed "Marketplace refreshed." A customer ran
 * /hiveku:update seven times in two weeks (0.26.12 -> 0.27.4) and never moved;
 * running the app's own claude.exe by hand updated her at once (2026-09-28).
 *
 * Where a usable CLI lives, in the order it is tried:
 *
 *   1. session   $CLAUDE_CODE_EXECPATH, the binary running THIS session. Claude
 *                Code sets it in every Bash-tool shell (not in hooks), and
 *                /hiveku:update runs in one. In the desktop app it is the app's
 *                own copy; in an IDE, the extension's; in a terminal, the
 *                terminal install. It also shares the session's config dir.
 *   2. path      PATH, walked by hand so we know exactly what we would run.
 *   3. terminal  well-known terminal install folders a GUI-launched PATH misses.
 *   4. desktop   the desktop app's bundled copy, newest version first.
 *   5. (Windows) an npm `claude.cmd` shim with no claude.exe behind it, run
 *                through cmd.exe with constant arguments. Last resort only.
 *
 * Linux: no desktop-app location is searched, because there is no evidence of
 * a public Linux desktop build to model it on.
 *
 * Nothing here uses `shell: true`: with an argument array it concatenates
 * without quoting, so a path under "Application Support" breaks (and Node 26
 * warns DEP0190). Every function takes env / platform / homeDir / fs so the
 * Windows and macOS layouts are testable on any machine.
 */
import nodeFs from 'node:fs';
import nodePath from 'node:path';
import os from 'node:os';
import { spawnSync as nodeSpawnSync } from 'node:child_process';

export const MARKETPLACE = 'hiveku';
export const PLUGIN_ID = 'hiveku@hiveku';
/** The CLI's own git clone timeout is 120 s; leave room above it. */
export const CLI_TIMEOUT_MS = 180_000;
export const VERSION_PROBE_TIMEOUT_MS = 20_000;

const CLI_BASENAME = /^claude(\.exe)?$/i;
const NPM_EXE = ['node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'];

const pathFor = (platform) => (platform === 'win32' ? nodePath.win32 : nodePath.posix);

/** Claude's config dir: $CLAUDE_CONFIG_DIR, else ~/.claude (the CLI's own rule). */
export function claudeConfigDir({ env = process.env, homeDir = os.homedir(), platform = process.platform } = {}) {
  const cfg = typeof env.CLAUDE_CONFIG_DIR === 'string' ? env.CLAUDE_CONFIG_DIR.trim() : '';
  return cfg || pathFor(platform).join(homeDir, '.claude');
}

/**
 * Claude's global config file: $CLAUDE_CONFIG_DIR/.claude.json, else
 * ~/.claude.json. (The CLI: `globalConfig: join(CLAUDE_CONFIG_DIR || homedir(), ".claude.json")`.)
 */
export function globalConfigPath({ env = process.env, homeDir = os.homedir(), platform = process.platform } = {}) {
  const cfg = typeof env.CLAUDE_CONFIG_DIR === 'string' ? env.CLAUDE_CONFIG_DIR.trim() : '';
  return pathFor(platform).join(cfg || homeDir, '.claude.json');
}

/** A version folder name, parsed; null for anything that is not one ('tmp', '.DS_Store'). */
export function parseVersionName(name) {
  const m = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(String(name ?? ''));
  return m ? { name: String(name), nums: m[1].split('.').map(Number), pre: m[2] ?? null } : null;
}

/** Ascending, numeric per segment (2.1.99 < 2.1.275); a prerelease sorts below its release. */
export function compareVersionNames(a, b) {
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const d = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (d) return d;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/** The desktop app's CLI folders for this platform (none on Linux; see the header). */
export function desktopCliRoots({ env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  const p = pathFor(platform);
  if (platform === 'win32') {
    const appData = env.APPDATA || (homeDir && p.join(homeDir, 'AppData', 'Roaming'));
    return appData ? [p.join(appData, 'Claude', 'claude-code')] : [];
  }
  if (platform === 'darwin') {
    return homeDir ? [p.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude-code')] : [];
  }
  return [];
}

/**
 * Every usable `claude` on this machine, in the order to try them. Each entry
 * is { path, source, version?, viaCmd? }. Pure apart from the injected fs.
 *
 * Desktop versions: the app writes <ver>/.verified last when it installs a
 * version, so a folder without it may be mid-download. Folders WITH the marker
 * come first (newest first), then any without it (newest first) — the marker
 * is from the macOS build and has not been checked on Windows, so a missing
 * marker must not hide the only binary there is. A folder whose binary is
 * missing or not executable is skipped outright. `claude-code-vm` (a Linux
 * binary for the app's VM) is a different folder and is never read.
 */
export function findClaudeCandidates({
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
  fs = nodeFs,
  systemBins = platform === 'win32' ? [] : ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
} = {}) {
  const p = pathFor(platform);
  const isWin = platform === 'win32';
  const isFile = (f) => {
    try { return fs.statSync(f).isFile(); } catch { return false; }
  };
  const runnable = (f) => {
    if (!isFile(f)) return false;
    if (isWin) return true; // no execute bit on Windows
    try { fs.accessSync(f, nodeFs.constants.X_OK); return true; } catch { return false; }
  };

  const found = [];
  const lastResort = [];
  const seen = new Set();
  const add = (list, file, source, extra = {}) => {
    const key = isWin ? file.toLowerCase() : file;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ path: file, source, ...extra });
  };

  // 1. The session's own binary. Rejects a relative path and anything not
  //    named claude/claude.exe (an old npm install would hand us `node`).
  const execPath = typeof env.CLAUDE_CODE_EXECPATH === 'string' ? env.CLAUDE_CODE_EXECPATH.trim() : '';
  if (execPath && p.isAbsolute(execPath) && CLI_BASENAME.test(p.basename(execPath)) && runnable(execPath)) {
    add(found, execPath, 'session');
  }

  // 2. PATH. On Windows a bare spawn finds only .com/.exe, and spawning a .cmd
  //    without a shell throws EINVAL, so an npm shim folder is resolved to the
  //    real claude.exe the shim launches.
  const pathVar = env.PATH ?? env.Path ?? '';
  for (const dir of String(pathVar).split(isWin ? ';' : ':').map((d) => d.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)) {
    if (!p.isAbsolute(dir)) continue;
    if (isWin) {
      const exe = p.join(dir, 'claude.exe');
      if (runnable(exe)) { add(found, exe, 'path'); continue; }
      const cmd = p.join(dir, 'claude.cmd');
      if (!isFile(cmd)) continue;
      const npmExe = p.join(dir, ...NPM_EXE);
      if (runnable(npmExe)) add(found, npmExe, 'path');
      else add(lastResort, cmd, 'path', { viaCmd: true });
    } else {
      const bin = p.join(dir, 'claude');
      if (runnable(bin)) add(found, bin, 'path');
    }
  }

  // 3. Terminal installs a GUI-launched PATH can miss.
  if (isWin) {
    const profile = env.USERPROFILE || homeDir;
    const local = env.LOCALAPPDATA || (profile && p.join(profile, 'AppData', 'Local'));
    const roaming = env.APPDATA || (profile && p.join(profile, 'AppData', 'Roaming'));
    const spots = [
      profile && p.join(profile, '.local', 'bin', 'claude.exe'),
      local && p.join(local, 'Microsoft', 'WinGet', 'Links', 'claude.exe'),
      roaming && p.join(roaming, 'npm', ...NPM_EXE),
    ];
    for (const f of spots) if (f && runnable(f)) add(found, f, 'terminal');
    const npmCmd = roaming && p.join(roaming, 'npm', 'claude.cmd');
    if (npmCmd && isFile(npmCmd) && !runnable(p.join(roaming, 'npm', ...NPM_EXE))) {
      add(lastResort, npmCmd, 'terminal', { viaCmd: true });
    }
  } else if (homeDir) {
    const spots = [
      p.join(homeDir, '.local', 'bin', 'claude'),
      p.join(homeDir, '.claude', 'local', 'claude'),
      ...systemBins,
      p.join(homeDir, '.bun', 'bin', 'claude'),
    ];
    for (const f of spots) if (runnable(f)) add(found, f, 'terminal');
  }

  // 4. The desktop app's bundled copy.
  for (const root of desktopCliRoots({ env, platform, homeDir })) {
    let names = [];
    try {
      names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { continue; }
    const versions = names.map(parseVersionName).filter(Boolean).sort((a, b) => compareVersionNames(b, a));
    const verified = [];
    const unverified = [];
    for (const v of versions) {
      const dir = p.join(root, v.name);
      const bins = isWin
        ? [p.join(dir, 'claude.exe')]
        : [p.join(dir, 'claude.app', 'Contents', 'MacOS', 'claude'), p.join(dir, 'claude')];
      const hit = bins.find(runnable);
      if (!hit) continue;
      (isFile(p.join(dir, '.verified')) ? verified : unverified).push({ path: hit, version: v.name });
    }
    for (const c of [...verified, ...unverified]) add(found, c.path, 'desktop', { version: c.version });
  }

  return [...found, ...lastResort];
}

/** The first candidate, or null. */
export function resolveClaudeCli(opts = {}) {
  return findClaudeCandidates(opts)[0] ?? null;
}

/**
 * How to start `cli` with `args`, without a shell. A Windows .cmd shim is the
 * one exception: it can only run under cmd.exe. The arguments are this
 * module's constants, and a path that cmd.exe could reinterpret is refused.
 */
export function spawnPlan(cli, args, { env = process.env } = {}) {
  if (!cli.viaCmd) {
    return { command: cli.path, args, options: { windowsHide: true } };
  }
  if (/["%\r\n]/.test(cli.path) || args.some((a) => !/^[A-Za-z0-9@._-]+$/.test(a))) {
    return { error: 'unsafe path or argument for cmd.exe' };
  }
  return {
    command: env.ComSpec || env.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/c', `""${cli.path}" ${args.join(' ')}"`],
    options: { windowsHide: true, windowsVerbatimArguments: true },
  };
}

/** Run the CLI once. Never throws; returns spawnSync's result shape. */
export function runClaude(cli, args, { spawnSyncImpl = nodeSpawnSync, env = process.env, timeout = CLI_TIMEOUT_MS } = {}) {
  const plan = spawnPlan(cli, args, { env });
  if (plan.error) {
    const error = new Error(plan.error);
    error.code = 'EUNSAFE';
    return { status: null, stdout: '', stderr: '', error };
  }
  try {
    return spawnSyncImpl(plan.command, plan.args, { ...plan.options, encoding: 'utf8', timeout, env });
  } catch (e) {
    return { status: null, stdout: '', stderr: '', error: e };
  }
}

/** A process that never started (vs one that ran and failed). ETIMEDOUT means it ran. */
function didNotStart(res) {
  return Boolean(res?.error) && res.error.code !== 'ETIMEDOUT';
}

/** This CLI has no such subcommand/option (an old release). */
function unknownCommand(res) {
  return /unknown (command|option)/i.test(`${res?.stderr ?? ''}\n${res?.stdout ?? ''}`);
}

const clip = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** stderr, else stdout, else the spawn error — the most useful one line. */
export function failureText(res) {
  if (res?.error?.code === 'ETIMEDOUT') return 'it timed out';
  return clip(res?.stderr) || clip(res?.stdout) || clip(res?.error?.message) || `exit code ${res?.status}`;
}

/**
 * Make sure a candidate runs, and learn its version. Desktop candidates carry
 * the version in their folder name and skip the extra spawn.
 * A CLI older than 2.0 is skipped: it predates the `plugin` subcommand.
 */
export function probeCli(cli, opts = {}) {
  if (cli.version) return { ok: true, version: cli.version };
  const res = runClaude(cli, ['--version'], { ...opts, timeout: VERSION_PROBE_TIMEOUT_MS });
  if (didNotStart(res) || res.status !== 0) return { ok: false, error: failureText(res) };
  const version = /(\d+\.\d+\.\d+[^\s]*)/.exec(res.stdout || '')?.[1] ?? null;
  if (version && (parseVersionName(version.replace(/[^\d.].*$/, ''))?.nums[0] ?? 0) < 2) {
    return { ok: false, error: `version ${version} is too old to update plugins` };
  }
  return { ok: true, version };
}

/** A version from an update line: 0.26.29, or 1.2.3-beta.1. */
const VER = '(\\d+(?:\\.\\d+)+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)';

/**
 * Read `claude plugin update` output. Handles the one-line --json result
 * (2.1.281+) and the text lines every release prints:
 *   ✔ Plugin "hiveku" updated from 0.26.27 to 0.26.29 for scope user. Restart to apply changes.
 *   ✔ hiveku is already at the latest version (0.27.4).
 *   ✘ Failed to update plugin "hiveku@hiveku": <why>
 */
export function parseUpdateResult(res) {
  const stdout = String(res?.stdout ?? '');
  const stderr = String(res?.stderr ?? '');
  let json = null;
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { json = JSON.parse(t); break; } catch { /* not the result line */ }
  }
  if (json && typeof json === 'object') {
    if (json.outcome === 'ok' && (json.updateOutcome === 'updated' || json.updateOutcome === 'up_to_date')) {
      return {
        outcome: json.updateOutcome,
        oldVersion: json.oldVersion ?? null,
        newVersion: json.newVersion ?? null,
        message: clip(json.message),
      };
    }
    if (json.outcome === 'failed' || res?.status !== 0) {
      return { outcome: 'failed', failureCode: json.failureCode ?? null, message: clip(json.message) || failureText(res) };
    }
  }
  const all = `${stdout}\n${stderr}`;
  const updated = new RegExp(`updated from ${VER} to ${VER}`, 'i').exec(all);
  if (res?.status === 0 && !res?.error && updated) {
    return { outcome: 'updated', oldVersion: updated[1], newVersion: updated[2], message: clip(all) };
  }
  const latest = new RegExp(`already at the latest version(?:\\s*\\(${VER}\\))?`, 'i').exec(all);
  if (res?.status === 0 && !res?.error && latest) {
    return { outcome: 'up_to_date', oldVersion: latest[1] ?? null, newVersion: latest[1] ?? null, message: clip(all) };
  }
  if (res?.status !== 0 || res?.error) {
    const code = /EPERM|EACCES|operation not permitted|permission denied/i.test(all) ? 'error_permission' : null;
    return { outcome: 'failed', failureCode: code, message: failureText(res) };
  }
  return { outcome: 'unclear', message: clip(stdout) || clip(stderr) };
}

/** The version installed for hiveku@hiveku per Claude's own record, or null. */
export function readInstalledVersion(configDir, { fs = nodeFs, platform = process.platform } = {}) {
  try {
    const file = pathFor(platform).join(configDir, 'plugins', 'installed_plugins.json');
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'))?.plugins?.[PLUGIN_ID];
    const versions = (Array.isArray(entries) ? entries : [entries])
      .map((e) => e?.version)
      .filter((v) => typeof v === 'string' && parseVersionName(v));
    if (!versions.length) return null;
    return versions.reduce((a, b) => (compareVersionNames(parseVersionName(a), parseVersionName(b)) >= 0 ? a : b));
  } catch {
    return null;
  }
}

/** What the local marketplace clone advertises for hiveku, or null. */
export function readCloneVersion(configDir, { fs = nodeFs, platform = process.platform } = {}) {
  try {
    const file = pathFor(platform).join(configDir, 'plugins', 'marketplaces', MARKETPLACE, '.claude-plugin', 'marketplace.json');
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))?.plugins?.find?.((pl) => pl?.name === 'hiveku')?.version;
    return typeof v === 'string' && parseVersionName(v) ? v : null;
  } catch {
    return null;
  }
}

/** Plain-language name for where a CLI came from. */
export function describeCli(cli) {
  const v = cli.version ? ` ${cli.version}` : '';
  switch (cli.source) {
    case 'session': return `the Claude command-line tool running this chat${v}`;
    case 'desktop': return `the Claude desktop app's built-in command-line tool${v}`;
    case 'path': return `the claude command on PATH${v}`;
    default: return `a terminal install of the Claude command-line tool${v}`;
  }
}

const cmp = (a, b) => {
  const pa = parseVersionName(a), pb = parseVersionName(b);
  if (!pa || !pb) return 0;
  return compareVersionNames(pa, pb);
};

/** Where a user can press Update themselves. */
export const MANUAL_STEPS =
  'To install it yourself: in the Claude desktop app open Settings > Plugins, pick hiveku and update it; ' +
  'in terminal Claude Code run /plugin, pick hiveku and press Update. Then completely quit and reopen Claude.';

const RESTART =
  '★ This chat still runs the old version. Completely quit and reopen Claude and it takes effect everywhere ' +
  '(in terminal Claude Code, /reload-plugins hot-reloads without a restart; the Desktop app does not have that command).';

const SANDBOX_HINT =
  "Claude's sandbox blocked the install. Run /hiveku:doctor (it repairs the setting Hiveku needs), start a new chat, and try again.";

/**
 * The whole of `hiveku update`: refresh the catalog, install, and say what
 * really happened. Returns { exitCode, json, lines }; the caller prints.
 *
 *   candidates      findClaudeCandidates() output, tried in order until one runs
 *   runningVersion  the plugin version executing this code
 *   configDir       Claude's config dir (for the no-CLI fallback)
 *   gitPull(dir)    the no-CLI fallback's fast-forward; injectable for tests
 *
 * Exit code is non-zero whenever an update exists (or might) and was not
 * installed, so a caller can never read a fallback as success.
 */
export function performUpdate({
  candidates,
  runningVersion,
  configDir,
  spawnSyncImpl = nodeSpawnSync,
  env = process.env,
  fs = nodeFs,
  platform = process.platform,
  gitPull = (dir) => spawnSyncImpl('git', ['-C', dir, 'pull', 'origin', 'HEAD'], { encoding: 'utf8', timeout: CLI_TIMEOUT_MS, windowsHide: true }),
}) {
  const opts = { spawnSyncImpl, env };
  const tried = [];
  let cli = null;
  let refresh = null;

  for (const candidate of candidates ?? []) {
    const probe = probeCli(candidate, opts);
    if (!probe.ok) { tried.push({ path: candidate.path, source: candidate.source, error: probe.error }); continue; }
    const attempt = { ...candidate, version: probe.version ?? candidate.version ?? null };
    const res = runClaude(attempt, ['plugin', 'marketplace', 'update', MARKETPLACE], opts);
    if (didNotStart(res) || unknownCommand(res)) {
      tried.push({ path: candidate.path, source: candidate.source, error: failureText(res) });
      continue;
    }
    cli = attempt;
    refresh = res;
    break;
  }

  const cliFields = cli
    ? { cli_path: cli.path, cli_source: cli.source, cli_version: cli.version ?? null }
    : { cli_path: null, cli_source: null, cli_version: null };

  // ── No CLI anywhere: the old fallback, said honestly ──────────────────
  if (!cli) {
    const installed = readInstalledVersion(configDir, { fs, platform }) ?? runningVersion;
    const clone = pathFor(platform).join(configDir, 'plugins', 'marketplaces', MARKETPLACE);
    let pull;
    try { pull = gitPull(clone); } catch (e) { pull = { status: null, error: e }; }
    const pulled = pull?.status === 0 && !pull?.error;
    const advertised = readCloneVersion(configDir, { fs, platform });
    const newer = advertised && cmp(advertised, installed) > 0 ? advertised : null;
    const upToDate = pulled && !newer;
    const lines = upToDate
      ? [
          `You already have the newest Hiveku version (${installed}). Nothing needed installing.`,
          "(Claude's command-line tool was not found on this machine, so Hiveku checked the plugin catalog directly.)",
        ]
      : [
          newer
            ? `Hiveku ${newer} is available but was NOT installed (this machine has ${installed}).`
            : `The update was NOT applied (this machine has ${installed}).`,
          "Hiveku could not find Claude's command-line tool on this machine (it looked on PATH, in the usual install folders and inside the Claude desktop app), so it cannot install updates by itself here.",
          pulled
            ? 'It did refresh the plugin catalog, so the app can see the new version.'
            : `It could not refresh the plugin catalog either: ${failureText(pull)}`,
          MANUAL_STEPS,
        ];
    return {
      exitCode: upToDate ? 0 : 1,
      json: {
        applied: false,
        outcome: 'no_cli',
        running: runningVersion,
        installed_before: installed,
        installed_now: installed,
        now_installed: installed,
        available: newer ?? advertised ?? installed,
        pulled,
        refreshed: pulled,
        ...cliFields,
        tried,
        detail: pulled ? null : failureText(pull),
      },
      lines,
    };
  }

  // ── Install through the CLI we found ──────────────────────────────────
  const refreshed = refresh.status === 0 && !refresh.error;
  const refreshDetail = refreshed ? null : failureText(refresh);

  let up = runClaude(cli, ['plugin', 'update', PLUGIN_ID, '--json'], opts);
  if (!didNotStart(up) && up.status !== 0 && /unknown option\W+--json/i.test(`${up.stderr}\n${up.stdout}`)) {
    up = runClaude(cli, ['plugin', 'update', PLUGIN_ID], opts); // before 2.1.2xx: text only
  }
  const result = parseUpdateResult(up);
  const ran = `(Used ${describeCli(cli)}: ${cli.path})`;
  const base = {
    running: runningVersion,
    refreshed,
    refresh_detail: refreshDetail,
    ...cliFields,
    tried,
  };

  if (result.outcome === 'updated') {
    return {
      exitCode: 0,
      json: {
        ...base, applied: true, outcome: 'updated',
        installed_before: result.oldVersion, installed_now: result.newVersion, now_installed: result.newVersion,
        detail: result.message,
      },
      lines: [
        `Updated Hiveku from ${result.oldVersion} to ${result.newVersion}.`,
        ...(refreshed ? [] : [`Refreshing the plugin catalog failed (${refreshDetail}), so a newer release may still exist. Run /hiveku:update again later.`]),
        RESTART,
        ran,
      ],
    };
  }

  if (result.outcome === 'up_to_date' && refreshed) {
    const v = result.newVersion;
    const stale = v && runningVersion && cmp(v, runningVersion) > 0;
    return {
      exitCode: 0,
      json: {
        ...base, applied: false, outcome: 'up_to_date',
        installed_before: v, installed_now: v, now_installed: v, detail: result.message,
      },
      lines: [
        `Hiveku is already on the newest version${v ? ` (${v})` : ''}. Nothing to install.`,
        ...(stale ? [`This chat still runs ${runningVersion}. Completely quit and reopen Claude to start using ${v}.`] : []),
        ran,
      ],
    };
  }

  if (result.outcome === 'up_to_date') {
    // The catalog could not be refreshed, so "latest" was measured against a
    // stale copy. Never report that as up to date.
    const v = result.newVersion;
    return {
      exitCode: 1,
      json: {
        ...base, applied: false, outcome: 'refresh_failed',
        installed_before: v, installed_now: v, now_installed: v, detail: refreshDetail,
      },
      lines: [
        `Could not check for a newer Hiveku version: refreshing the plugin catalog failed (${refreshDetail}).`,
        `Nothing was installed${v ? `; this machine has ${v}` : ''}.`,
        MANUAL_STEPS,
        ran,
      ],
    };
  }

  if (result.outcome === 'failed') {
    const permission = result.failureCode === 'error_permission' || /EPERM|EACCES|operation not permitted/i.test(result.message);
    return {
      exitCode: 1,
      json: {
        ...base, applied: false, outcome: 'failed', failure_code: result.failureCode ?? null,
        installed_before: null, installed_now: null, now_installed: null, detail: result.message,
      },
      lines: [
        `The update did NOT install: ${result.message}`,
        ...(refreshed ? [] : [`Refreshing the plugin catalog also failed: ${refreshDetail}`]),
        ...(permission ? [SANDBOX_HINT] : []),
        MANUAL_STEPS,
        ran,
      ],
    };
  }

  // Exit 0 but no line we recognise: quote it rather than guess.
  return {
    exitCode: 0,
    json: {
      ...base, applied: null, outcome: 'unclear',
      installed_before: null, installed_now: null, now_installed: null, detail: result.message,
    },
    lines: [
      `The update command finished without an error but did not say what it did: "${result.message}".`,
      'Check the installed version in Settings > Plugins (desktop app) or /plugin (terminal Claude Code).',
      ran,
    ],
  };
}
