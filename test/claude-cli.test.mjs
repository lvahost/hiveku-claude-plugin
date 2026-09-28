/**
 * `hiveku update` on machines where `claude` is not on PATH.
 *
 * The Claude desktop app ships its own CLI, one folder per version, and never
 * puts it on PATH. Until this module, `hiveku update` only searched PATH, so on
 * a desktop-only machine every run fell through to a git pull that installed
 * nothing and still printed "Marketplace refreshed." (a customer, seven runs in
 * two weeks). These tests pin:
 *
 *   - where a usable `claude` is found, and in what order (the Windows layout
 *     runs against an in-memory fs, so it is checked on every OS);
 *   - that both update steps run through the CLI that was found, and the
 *     result printed is what that CLI reported;
 *   - that nothing is ever reported as installed when it was not.
 *
 * The CLIs here are fake shell scripts that log their argv. No test runs a real
 * `claude`, and every test uses a throwaway HOME / config dir.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  findClaudeCandidates,
  resolveClaudeCli,
  parseVersionName,
  compareVersionNames,
  desktopCliRoots,
  spawnPlan,
  parseUpdateResult,
  performUpdate,
  readInstalledVersion,
  MANUAL_STEPS,
} from '../lib/claude-cli.mjs';
import { writeBinding } from '../lib/binding.mjs';

const BIN = fileURLToPath(new URL('../bin/hiveku', import.meta.url));
const POSIX = process.platform !== 'win32';

const tmp = (prefix = 'hk-cli-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
function write(file, body, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode });
  return file;
}

/**
 * A fake `claude`: logs each argv line to `log`, answers --version, and runs
 * the given shell snippet for each update step.
 */
function fakeClaude(file, { log, version = '2.1.281 (Claude Code)', marketplace = 'echo "✔ Successfully updated marketplace: hiveku"', updateJson, updateText }) {
  const body = [
    '#!/bin/sh',
    `echo "$*" >> '${log}'`,
    'case "$*" in',
    `  "--version") echo "${version}" ;;`,
    `  "plugin marketplace update hiveku") ${marketplace} ;;`,
    `  "plugin update hiveku@hiveku --json") ${updateJson ?? 'echo "error: unknown option \'--json\'" >&2; exit 1'} ;;`,
    `  "plugin update hiveku@hiveku") ${updateText ?? 'echo "✔ hiveku is already at the latest version (0.0.0)."'} ;;`,
    '  *) echo "unexpected: $*" >&2; exit 9 ;;',
    'esac',
    '',
  ].join('\n');
  return write(file, body, 0o755);
}

const readLog = (log) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []);

const UPDATED_JSON =
  `echo '{"command":"update","outcome":"ok","plugin":"hiveku@hiveku","scope":"user","message":"Plugin \\"hiveku\\" updated from 0.26.27 to 0.26.29 for scope user. Restart to apply changes.","updateOutcome":"updated","oldVersion":"0.26.27","newVersion":"0.26.29"}'`;

/* ── an in-memory fs for the Windows layout ─────────────────────────────── */

function memFs(files, dirs = []) {
  const norm = (p) => path.win32.normalize(p).toLowerCase();
  const entries = new Map(); // lower-case path -> { name, isDir }
  const put = (p, isDir) => {
    const k = norm(p);
    if (!entries.has(k)) entries.set(k, { name: path.win32.basename(p), isDir });
  };
  for (const f of files) put(f, false);
  for (const d of dirs) put(d, true);
  for (const p of [...files, ...dirs]) {
    for (let d = path.win32.dirname(p); d !== path.win32.dirname(d); d = path.win32.dirname(d)) put(d, true);
  }
  const enoent = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  const get = (p) => entries.get(norm(p));
  return {
    statSync(p) {
      const e = get(p);
      if (!e) throw enoent(p);
      return { isFile: () => !e.isDir, isDirectory: () => e.isDir };
    },
    accessSync(p) {
      const e = get(p);
      if (!e || e.isDir) throw enoent(p);
    },
    readdirSync(p) {
      const k = norm(p);
      if (!get(p)?.isDir) throw enoent(p);
      return [...entries]
        .filter(([key]) => key !== k && path.win32.dirname(key) === k)
        .map(([, e]) => ({ name: e.name, isDirectory: () => e.isDir, isFile: () => !e.isDir }));
    },
  };
}

/* ── version order ──────────────────────────────────────────────────────── */

test('desktop version folders sort numerically per segment, not as strings', () => {
  const names = ['2.1.99', '2.1.275', 'tmp', '2.1.300-beta.1', '.DS_Store', '2.1.271', '2.10.0'];
  const got = names.map(parseVersionName).filter(Boolean).sort((a, b) => compareVersionNames(b, a)).map((v) => v.name);
  assert.deepEqual(got, ['2.10.0', '2.1.300-beta.1', '2.1.275', '2.1.271', '2.1.99']);
});

/* ── where `claude` is found ────────────────────────────────────────────── */

test('PATH hit: a claude on PATH is found (as before)', { skip: !POSIX }, () => {
  const home = tmp();
  const bin = write(path.join(home, 'bin', 'claude'), '#!/bin/sh\n', 0o755);
  const got = findClaudeCandidates({ env: { PATH: `${path.join(home, 'nothing')}:${path.dirname(bin)}` }, platform: 'darwin', homeDir: home, systemBins: [] });
  assert.deepEqual(got.map((c) => [c.source, c.path]), [['path', bin]]);
  assert.equal(resolveClaudeCli({ env: { PATH: path.dirname(bin) }, platform: 'linux', homeDir: home, systemBins: [] })?.path, bin);
});

test('Windows desktop-only: no PATH hit, picks %APPDATA%\\Claude\\claude-code\\2.1.275\\claude.exe', () => {
  const appData = 'C:\\Users\\murph\\AppData\\Roaming';
  const cc = `${appData}\\Claude\\claude-code`;
  const fsys = memFs(
    [
      `${cc}\\2.1.99\\claude.exe`,
      `${cc}\\2.1.271\\claude.exe`,
      `${cc}\\2.1.275\\claude.exe`,
      // the app's VM binary lives in a different folder and must never be picked
      `${appData}\\Claude\\claude-code-vm\\9.9.9\\claude`,
    ],
    [
      `${cc}\\2.1.300`, // newest, but its claude.exe is missing (half downloaded / purged)
      `${cc}\\update-staging`, // not a version at all
    ],
  );
  const env = {
    PATH: 'C:\\Windows\\system32;C:\\Program Files\\Git\\cmd',
    APPDATA: appData,
    USERPROFILE: 'C:\\Users\\murph',
    LOCALAPPDATA: 'C:\\Users\\murph\\AppData\\Local',
  };
  const got = findClaudeCandidates({ env, platform: 'win32', homeDir: 'C:\\Users\\murph', fs: fsys });
  assert.deepEqual(
    got.map((c) => [c.source, c.version]),
    [['desktop', '2.1.275'], ['desktop', '2.1.271'], ['desktop', '2.1.99']],
  );
  assert.equal(got[0].path, `${cc}\\2.1.275\\claude.exe`);
  assert.ok(!got.some((c) => /claude-code-vm/i.test(c.path)));
  assert.deepEqual(desktopCliRoots({ env, platform: 'win32', homeDir: 'C:\\Users\\murph' }), [cc]);
});

test('Windows: an npm claude.cmd shim resolves to its real claude.exe; a bare .cmd is last resort via cmd.exe', () => {
  const npm = 'C:\\Users\\a\\AppData\\Roaming\\npm';
  const withExe = memFs([`${npm}\\claude.cmd`, `${npm}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`]);
  const env = { Path: npm, APPDATA: 'C:\\Users\\a\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\a' };
  const a = findClaudeCandidates({ env, platform: 'win32', homeDir: 'C:\\Users\\a', fs: withExe });
  assert.equal(a[0].path, `${npm}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`);
  assert.ok(!a.some((c) => c.viaCmd), 'no cmd.exe when the real exe exists');

  const shimOnly = memFs([`${npm}\\claude.cmd`]);
  const b = findClaudeCandidates({ env, platform: 'win32', homeDir: 'C:\\Users\\a', fs: shimOnly });
  assert.equal(b.length, 1);
  assert.equal(b[0].viaCmd, true);
  const plan = spawnPlan(b[0], ['plugin', 'update', 'hiveku@hiveku'], { env: { ComSpec: 'C:\\Windows\\system32\\cmd.exe' } });
  assert.equal(plan.command, 'C:\\Windows\\system32\\cmd.exe');
  assert.deepEqual(plan.args, ['/d', '/s', '/c', `""${npm}\\claude.cmd" plugin update hiveku@hiveku"`]);
  assert.equal(plan.options.windowsVerbatimArguments, true);
  assert.ok(spawnPlan({ path: 'C:\\%EVIL%\\claude.cmd', viaCmd: true }, ['--version']).error, 'a path cmd.exe would expand is refused');
  // Everything else is spawned directly — never through a shell.
  const direct = spawnPlan({ path: 'C:\\x\\claude.exe' }, ['--version']);
  assert.equal(direct.command, 'C:\\x\\claude.exe');
  assert.equal(direct.options.shell, undefined);
});

test('macOS desktop-only: the claude.app bundle of the newest complete version wins', { skip: !POSIX }, () => {
  const home = tmp();
  const cc = path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code');
  const exe = (v) => path.join(cc, v, 'claude.app', 'Contents', 'MacOS', 'claude');
  write(exe('2.1.99'), '#!/bin/sh\n', 0o755); write(path.join(cc, '2.1.99', '.verified'), 'x');
  write(exe('2.1.280'), '#!/bin/sh\n', 0o755); write(path.join(cc, '2.1.280', '.verified'), 'x');
  write(path.join(cc, '2.1.200', 'claude'), '#!/bin/sh\n', 0o755); write(path.join(cc, '2.1.200', '.verified'), 'x'); // flat layout
  write(exe('2.1.281'), '#!/bin/sh\n', 0o755); // no .verified yet: still installing
  write(path.join(cc, '2.1.282', '.verified'), 'x'); // marker but no binary
  write(exe('2.1.279'), 'not executable', 0o644); write(path.join(cc, '2.1.279', '.verified'), 'x');
  write(path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code-vm', '9.9.9', 'claude'), '#!/bin/sh\n', 0o755);
  fs.mkdirSync(path.join(cc, 'tmp'));

  const got = findClaudeCandidates({ env: { PATH: '' }, platform: 'darwin', homeDir: home, systemBins: [] });
  assert.deepEqual(got.map((c) => c.version), ['2.1.280', '2.1.200', '2.1.99', '2.1.281']);
  assert.equal(got[0].path, exe('2.1.280'));
  assert.equal(got[1].path, path.join(cc, '2.1.200', 'claude'));
  assert.ok(got.every((c) => c.source === 'desktop'));
  assert.ok(!got.some((c) => c.path.includes('claude-code-vm')));
  // Linux: no desktop location is guessed.
  assert.deepEqual(desktopCliRoots({ env: {}, platform: 'linux', homeDir: home }), []);
});

test('the session CLI ($CLAUDE_CODE_EXECPATH) comes first; node or a relative path is ignored', { skip: !POSIX }, () => {
  const home = tmp();
  const session = write(path.join(home, 'ext', 'native-binary', 'claude'), '#!/bin/sh\n', 0o755);
  const node = write(path.join(home, 'bin', 'node'), '#!/bin/sh\n', 0o755);
  const onPath = write(path.join(home, 'pathbin', 'claude'), '#!/bin/sh\n', 0o755);
  const base = { platform: 'darwin', homeDir: home, systemBins: [] };
  assert.deepEqual(
    findClaudeCandidates({ ...base, env: { CLAUDE_CODE_EXECPATH: session, PATH: path.dirname(onPath) } }).map((c) => c.source),
    ['session', 'path'],
  );
  assert.deepEqual(
    findClaudeCandidates({ ...base, env: { CLAUDE_CODE_EXECPATH: node, PATH: path.dirname(onPath) } }).map((c) => c.source),
    ['path'],
  );
  assert.deepEqual(findClaudeCandidates({ ...base, env: { CLAUDE_CODE_EXECPATH: 'claude', PATH: '' } }), []);
});

/* ── reading the CLI's answer ───────────────────────────────────────────── */

test('parseUpdateResult reads the --json line and the text lines every release prints', () => {
  assert.deepEqual(
    parseUpdateResult({ status: 0, stdout: '{"outcome":"ok","updateOutcome":"updated","oldVersion":"0.1.0","newVersion":"0.1.1","message":"x"}\n', stderr: '' }),
    { outcome: 'updated', oldVersion: '0.1.0', newVersion: '0.1.1', message: 'x' },
  );
  const text = parseUpdateResult({
    status: 0,
    stdout: 'Checking for updates for plugin "hiveku@hiveku"…\n✔ Plugin "hiveku" updated from 0.26.27 to 0.26.29 for scope user. Restart to apply changes.\n',
    stderr: '',
  });
  assert.equal(text.outcome, 'updated');
  assert.equal(text.oldVersion, '0.26.27');
  assert.equal(text.newVersion, '0.26.29');
  const latest = parseUpdateResult({ status: 0, stdout: '✔ hiveku is already at the latest version (0.27.4).\n', stderr: '' });
  assert.deepEqual([latest.outcome, latest.newVersion], ['up_to_date', '0.27.4']);
  const failed = parseUpdateResult({
    status: 1,
    stdout: '{"command":"update","outcome":"failed","message":"EPERM: operation not permitted, mkdir \'/x\'","failureCode":"error_permission"}',
    stderr: '✘ Failed to update plugin "hiveku@hiveku": EPERM',
  });
  assert.deepEqual([failed.outcome, failed.failureCode], ['failed', 'error_permission']);
  assert.equal(parseUpdateResult({ status: 0, stdout: 'something new\n', stderr: '' }).outcome, 'unclear');
});

/* ── the update itself, through fake CLIs ───────────────────────────────── */

test('desktop-only macOS: both steps run through the bundled CLI and the real result is reported', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const cc = path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code');
  for (const v of ['2.1.99', '2.1.275']) {
    fakeClaude(path.join(cc, v, 'claude.app', 'Contents', 'MacOS', 'claude'), { log, updateJson: UPDATED_JSON });
    write(path.join(cc, v, '.verified'), 'x');
  }
  const env = { PATH: path.join(home, 'empty') };
  const candidates = findClaudeCandidates({ env, platform: 'darwin', homeDir: home, systemBins: [] });
  const r = performUpdate({ candidates, runningVersion: '0.26.27', configDir: path.join(home, '.claude'), env, gitPull: () => assert.fail('no git pull when a CLI exists') });

  assert.equal(r.exitCode, 0);
  assert.equal(r.json.applied, true);
  assert.equal(r.json.outcome, 'updated');
  assert.equal(r.json.installed_before, '0.26.27');
  assert.equal(r.json.installed_now, '0.26.29');
  assert.equal(r.json.cli_source, 'desktop');
  assert.equal(r.json.cli_version, '2.1.275');
  assert.equal(r.json.cli_path, path.join(cc, '2.1.275', 'claude.app', 'Contents', 'MacOS', 'claude'));
  assert.deepEqual(readLog(log), ['plugin marketplace update hiveku', 'plugin update hiveku@hiveku --json']);
  assert.match(r.lines[0], /^Updated Hiveku from 0\.26\.27 to 0\.26\.29\./);
  assert.ok(r.lines.some((l) => /quit and reopen Claude/.test(l)));
});

test('no CLI anywhere: the fallback says plainly that nothing was installed', () => {
  const home = tmp();
  const configDir = path.join(home, '.claude');
  write(path.join(configDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'hiveku@hiveku': [{ scope: 'user', version: '0.26.12' }] } }));
  const clone = path.join(configDir, 'plugins', 'marketplaces', 'hiveku');
  write(path.join(clone, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'hiveku', version: '0.27.4' }] }));
  let pulledDir = null;
  const r = performUpdate({
    candidates: [],
    runningVersion: '0.26.12',
    configDir,
    gitPull: (dir) => { pulledDir = dir; return { status: 0, stdout: '', stderr: '' }; },
  });

  assert.equal(pulledDir, clone, 'the clone under the config dir is fast-forwarded');
  assert.equal(r.exitCode, 1, 'an update that exists and was not installed is a failure');
  assert.equal(r.json.applied, false);
  assert.equal(r.json.outcome, 'no_cli');
  assert.equal(r.json.cli_path, null);
  assert.equal(r.json.cli_source, null);
  assert.equal(r.json.available, '0.27.4');
  assert.match(r.lines[0], /0\.27\.4 is available but was NOT installed \(this machine has 0\.26\.12\)/);
  assert.ok(r.lines.includes(MANUAL_STEPS));
  const all = r.lines.join('\n');
  assert.doesNotMatch(all, /Marketplace refreshed|Updated|is ready|success/i);

  // Nothing newer in the catalog: that IS the answer, and it is not a failure.
  write(path.join(clone, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'hiveku', version: '0.26.12' }] }));
  const same = performUpdate({ candidates: [], runningVersion: '0.26.12', configDir, gitPull: () => ({ status: 0 }) });
  assert.equal(same.exitCode, 0);
  assert.equal(same.json.applied, false);
  assert.match(same.lines[0], /already have the newest Hiveku version \(0\.26\.12\)/);

  // The pull itself failing is never "up to date".
  const broken = performUpdate({ candidates: [], runningVersion: '0.26.12', configDir, gitPull: () => ({ status: 1, stderr: 'fatal: unable to access github.com' }) });
  assert.equal(broken.exitCode, 1);
  assert.match(broken.lines.join('\n'), /NOT applied[\s\S]*unable to access github\.com/);
});

test('CLI failure (sandbox EPERM): says it did NOT install, quotes why, and gives the manual steps', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const cli = fakeClaude(path.join(home, 'bin', 'claude'), {
    log,
    updateJson:
      `echo '{"command":"update","outcome":"failed","plugin":"hiveku@hiveku","message":"EPERM: operation not permitted, mkdir /h/.claude/plugins/cache/hiveku/hiveku/0.27.4","failureCode":"error_permission"}'; ` +
      `echo '✘ Failed to update plugin "hiveku@hiveku": EPERM' >&2; exit 1`,
  });
  const r = performUpdate({ candidates: [{ path: cli, source: 'path' }], runningVersion: '0.27.3', configDir: path.join(home, '.claude'), env: {} });
  assert.equal(r.exitCode, 1);
  assert.equal(r.json.applied, false);
  assert.equal(r.json.outcome, 'failed');
  assert.equal(r.json.failure_code, 'error_permission');
  assert.equal(r.json.cli_path, cli);
  assert.equal(r.json.cli_version, '2.1.281');
  assert.match(r.lines[0], /^The update did NOT install: EPERM: operation not permitted/);
  assert.ok(r.lines.some((l) => /sandbox blocked the install/.test(l)));
  assert.ok(r.lines.includes(MANUAL_STEPS));
});

test('a failed catalog refresh is never reported as "up to date"', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const cli = fakeClaude(path.join(home, 'bin', 'claude'), {
    log,
    marketplace: `echo '✘ Failed to update marketplace(s): unable to access github.com' >&2; exit 1`,
    updateJson: `echo '{"command":"update","outcome":"ok","updateOutcome":"up_to_date","oldVersion":"0.27.3","newVersion":"0.27.3","message":"hiveku is already at the latest version (0.27.3)."}'`,
  });
  const r = performUpdate({ candidates: [{ path: cli, source: 'path' }], runningVersion: '0.27.3', configDir: path.join(home, '.claude'), env: {} });
  assert.equal(r.exitCode, 1);
  assert.equal(r.json.outcome, 'refresh_failed');
  assert.equal(r.json.refreshed, false);
  assert.match(r.lines[0], /Could not check for a newer Hiveku version: .*unable to access github\.com/);
  assert.doesNotMatch(r.lines.join('\n'), /already on the newest/);
  assert.deepEqual(readLog(log), ['--version', 'plugin marketplace update hiveku', 'plugin update hiveku@hiveku --json']);
});

test('an older CLI without --json is retried in text mode and parsed', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const cli = fakeClaude(path.join(home, 'bin', 'claude'), {
    log,
    version: '2.1.114 (Claude Code)',
    updateText: `echo '✔ Plugin "hiveku" updated from 0.1.0 to 0.1.1 for scope user. Restart to apply changes.'`,
  });
  const r = performUpdate({ candidates: [{ path: cli, source: 'terminal' }], runningVersion: '0.1.0', configDir: path.join(home, '.claude'), env: {} });
  assert.equal(r.exitCode, 0);
  assert.deepEqual([r.json.applied, r.json.installed_before, r.json.installed_now, r.json.cli_version], [true, '0.1.0', '0.1.1', '2.1.114']);
  assert.deepEqual(readLog(log), ['--version', 'plugin marketplace update hiveku', 'plugin update hiveku@hiveku --json', 'plugin update hiveku@hiveku']);
});

test('a candidate that will not start is skipped for the next one; up to date names a stale chat', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const good = fakeClaude(path.join(home, 'desk', 'claude'), {
    log,
    updateJson: `echo '{"outcome":"ok","updateOutcome":"up_to_date","oldVersion":"0.27.4","newVersion":"0.27.4"}'`,
  });
  const r = performUpdate({
    candidates: [{ path: path.join(home, 'gone', 'claude'), source: 'path' }, { path: good, source: 'desktop', version: '2.1.275' }],
    runningVersion: '0.27.2',
    configDir: path.join(home, '.claude'),
    env: {},
  });
  assert.equal(r.exitCode, 0);
  assert.equal(r.json.cli_path, good);
  assert.equal(r.json.tried.length, 1);
  assert.match(r.lines[0], /already on the newest version \(0\.27\.4\)/);
  assert.match(r.lines[1], /This chat still runs 0\.27\.2/);
});

test('readInstalledVersion reads Claude\'s own record, newest scope first', () => {
  const dir = tmp();
  write(path.join(dir, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'hiveku@hiveku': [{ scope: 'project', version: '0.26.9' }, { scope: 'user', version: '0.26.29' }] },
  }));
  assert.equal(readInstalledVersion(dir), '0.26.29');
  assert.equal(readInstalledVersion(path.join(dir, 'missing')), null);
});

/* ── end to end through bin/hiveku ──────────────────────────────────────── */

function runBin(args, env) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env, timeout: 60_000 });
}

test('bin/hiveku update --json uses the session CLI when claude is not on PATH', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const session = fakeClaude(path.join(home, 'Claude', 'claude-code', '2.1.275', 'claude'), { log, updateJson: UPDATED_JSON });
  const run = runBin(['update', '--json'], {
    HOME: home,
    PATH: `${path.join(home, 'empty')}:/usr/bin:/bin`,
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CLAUDE_CODE_EXECPATH: session,
  });
  assert.equal(run.status, 0, run.stderr);
  const json = JSON.parse(run.stdout);
  assert.equal(json.applied, true);
  assert.equal(json.cli_source, 'session');
  assert.equal(json.cli_path, session);
  assert.equal(json.installed_now, '0.26.29');
  assert.deepEqual(readLog(log), ['--version', 'plugin marketplace update hiveku', 'plugin update hiveku@hiveku --json']);
});

test('bin/hiveku doctor reports the CLI it found and that auto-update is off in a desktop session', { skip: !POSIX }, () => {
  const home = tmp();
  const log = path.join(home, 'argv.log');
  const session = fakeClaude(path.join(home, 'bin', 'claude'), { log });
  const base = {
    HOME: home,
    PATH: `${path.join(home, 'empty')}:/usr/bin:/bin`,
    HIVEKU_PLUGIN_DATA: path.join(home, 'data'),
    CLAUDE_CODE_EXECPATH: session,
  };
  const desk = runBin(['doctor', '--json'], { ...base, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' });
  const json = JSON.parse(desk.stdout);
  assert.deepEqual(json.claude_cli, { path: session, source: 'session', version: '2.1.281' });
  assert.equal(json.auto_update.on, false);
  assert.equal(json.auto_update.blocked_by, 'DISABLE_AUTOUPDATER');
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'settings.json')), 'doctor without --fix writes nothing');

  const human = runBin(['doctor'], { ...base, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' });
  assert.match(human.stdout, /auto-update +off in this session — the Claude desktop app switches it off/);
  assert.match(human.stdout, /claude CLI +.*\/bin\/claude/);
});

test('session start in a desktop-app chat: the release notice says it will not install by itself', { skip: !POSIX }, async () => {
  const home = tmp();
  const dataDir = path.join(home, 'data');
  const folder = path.join(home, 'client');
  const account = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  fs.mkdirSync(folder, { recursive: true });
  await writeBinding(folder, { accountId: account, label: 'Acme' });
  write(path.join(dataDir, 'credentials.json'), JSON.stringify({ version: 1, accounts: { [account]: { key: 'hvk_test_not_real', label: 'Acme', scope: 'full' } } }));
  // A fresh probe cache, so the hook reads it and spawns no network probe.
  write(path.join(dataDir, 'update-check.json'), JSON.stringify({ checked_at: Date.now(), remote_version: '0.27.4' }));
  const root = path.join(home, '.claude', 'plugins', 'cache', 'hiveku', 'hiveku', '0.26.12');
  write(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'hiveku', version: '0.26.12' }));

  const hook = (extra) => spawnSync(process.execPath, [BIN, 'hook', 'session-start'], {
    input: JSON.stringify({ cwd: folder, source: 'startup' }),
    encoding: 'utf8',
    timeout: 30_000,
    env: { HOME: home, PATH: '/usr/bin:/bin', HIVEKU_PLUGIN_DATA: dataDir, CLAUDE_PLUGIN_ROOT: root, ...extra },
  });
  const desk = hook({ DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' });
  assert.equal(desk.status, 0, desk.stderr);
  assert.match(desk.stdout, /plugin 0\.27\.4 has been released \(this machine has 0\.26\.12\)\. Plugin auto-update is switched off in this Claude session, so it will not install by itself: run \/hiveku:update/);

  const term = hook({});
  assert.match(term.stdout, /plugin 0\.27\.4 has been released/);
  assert.doesNotMatch(term.stdout, /switched off/);
});
