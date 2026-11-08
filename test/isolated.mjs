// Imported FIRST by every test that can reach the key store or start a plugin
// process (HK-1374), so a test run never touches the person's login keychain or
// Claude settings, whatever runs the tests and with any one check broken:
//   1. the credential code's one seam (lib/credentials.mjs setKeychainForTests)
//      gets a fake, in this process and, through NODE_OPTIONS, in every plugin
//      process a test starts (test/no-keychain-preload.mjs);
//   2. the keychain tools are stubbed first on PATH, for this process and every
//      process it starts, so even a broken seam reaches a stub;
//   3. this process loses every variable that aims the plugin at the real
//      machine and gets a temporary home folder, and a spawned process gets only
//      what isolatedEnv lists, never the caller's environment;
//   4. lib/credentials.mjs itself refuses to run the real tool under the test
//      runner (refuseUnderTests), so a test that forgot this file fails loudly;
//   5. test/test-isolation.test.mjs fails if a test file could get around any of it.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setKeychainForTests } from '../lib/credentials.mjs';

/* ── the real machine, out of reach ──────────────────────────────────────── */

// Everything that could aim a plugin process at the real Claude settings or data folder.
const STEERS_THE_PLUGIN = /^(CLAUDE|CODEX|ORCA|HIVEKU_(PLUGIN_DATA|PROJECT_DIR|TOOL_MODE|PROXY_REEXEC|DEBUG))/;
for (const name of Object.keys(process.env)) {
  if (STEERS_THE_PLUGIN.test(name)) delete process.env[name];
}

const HERE = mkdtempSync(path.join(tmpdir(), 'hiveku-isolated-'));
process.on('exit', () => rmSync(HERE, { recursive: true, force: true }));

/** The home folder of everything a test runs: a temporary one, gone when the test process ends. */
export const TEST_HOME = path.join(HERE, 'home');
/** Where the stubbed keychain tools and browser openers live; every call to one is written to calls.log there. */
export const STUB_BIN = path.join(HERE, 'stubs');
/** The log of every stubbed tool that was started. Empty when the credential code stayed on its fake. */
export const STUB_LOG = path.join(HERE, 'stubs', 'calls.log');
mkdirSync(TEST_HOME, { recursive: true });
mkdirSync(STUB_BIN, { recursive: true });
for (const name of ['security', 'secret-tool', 'open', 'xdg-open']) {
  writeFileSync(path.join(STUB_BIN, name), `#!/bin/sh\necho "$0 $*" >> '${STUB_LOG}'\nexit 44\n`);
  chmodSync(path.join(STUB_BIN, name), 0o755);
}

// The PATH this process was started with, kept so a spawned process's PATH is built here and not just inherited.
const CALLERS_PATH = process.env.PATH ?? '';
process.env.PATH = `${STUB_BIN}${path.delimiter}${CALLERS_PATH}`;
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

/* ── the keychain, faked ─────────────────────────────────────────────────── */

/** A machine with no OS keyring: the store stays a plain file. Every test's default. */
const noKeychain = { get: async () => null, set: async () => false };
setKeychainForTests(noKeychain);

/** A keyring that lives only in this process, for tests about encryption itself. `calls` lists each get and set. */
export function memoryKeychain() {
  const keychain = {
    calls: [],
    key: null,
    get: async () => {
      keychain.calls.push('get');
      return keychain.key;
    },
    set: async (key) => {
      keychain.calls.push('set');
      keychain.key = key;
      return true;
    },
  };
  return keychain;
}

/* ── what a spawned process gets ─────────────────────────────────────────── */

const NO_KEYCHAIN_PRELOAD = fileURLToPath(new URL('./no-keychain-preload.mjs', import.meta.url));

/** For a spawned process: fetch goes through a proxy that is not there, for every host but 127.0.0.1. */
export const NO_NETWORK_ENV = {
  NODE_USE_ENV_PROXY: '1',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  HTTP_PROXY: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1,localhost',
};

/**
 * The whole environment for a spawned plugin process: a temporary home, the
 * keychain tools stubbed first on PATH, no network but 127.0.0.1, the fake
 * keychain preloaded, and nothing else of this machine's environment. `extra`
 * is added on top (a test's HOME, HIVEKU_PLUGIN_DATA and the like); a PATH there
 * keeps the stubs first.
 */
export function isolatedEnv(extra = {}) {
  const { PATH: callerPath, ...rest } = extra;
  return {
    HOME: TEST_HOME,
    USERPROFILE: TEST_HOME,
    TMPDIR: tmpdir(),
    ...NO_NETWORK_ENV,
    NODE_OPTIONS: `--import "${NO_KEYCHAIN_PRELOAD}"`,
    ...rest,
    PATH: `${STUB_BIN}${path.delimiter}${callerPath ?? CALLERS_PATH}`,
  };
}

/** Fails at once if the keychain stubs are not first on this process's PATH (a check for the checks). */
export function assertStubsFirst() {
  if (!process.env.PATH.startsWith(`${STUB_BIN}${path.delimiter}`)) {
    throw new Error('test/isolated.mjs: the keychain stubs are not first on PATH');
  }
}
assertStubsFirst();
