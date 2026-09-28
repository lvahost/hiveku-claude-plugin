/**
 * Preload (`node --import`) for tests that spawn bin/hiveku update / doctor.
 *
 * lib/claude-cli.mjs also looks in fixed system folders (/opt/homebrew/bin,
 * /usr/local/bin) that a test's HOME and PATH cannot redirect. On a developer
 * machine with Claude Code installed there, a regression in the search would
 * run the REAL claude (network, git) from the test suite, and a "desktop-only"
 * layout could never be tested. This hides exactly those files from the
 * spawned process: stat/access report ENOENT, and spawning one fails as if it
 * were missing. Nothing in shipped code changes.
 */
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const HIDDEN = new Set(['/opt/homebrew/bin/claude', '/usr/local/bin/claude']);
const missing = (p, syscall) =>
  Object.assign(new Error(`ENOENT: no such file or directory, ${syscall} '${p}'`), {
    code: 'ENOENT', errno: -2, syscall, path: String(p),
  });

for (const name of ['statSync', 'lstatSync', 'accessSync', 'realpathSync']) {
  const real = fs[name];
  fs[name] = function hidden(p, ...rest) {
    if (HIDDEN.has(String(p))) throw missing(p, name.replace(/Sync$/, ''));
    return real.call(this, p, ...rest);
  };
}

const realSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function hidden(file, ...rest) {
  if (HIDDEN.has(String(file))) {
    return { pid: 0, output: null, stdout: '', stderr: '', status: null, signal: null, error: missing(file, 'spawnSync') };
  }
  return realSpawnSync.call(this, file, ...rest);
};

// Named imports (`import { spawnSync } from 'node:child_process'`) read these.
syncBuiltinESMExports();
