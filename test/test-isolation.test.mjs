// HK-1374: the plugin's own test run must not reach the person's login
// keychain or Claude settings, even with a safety check broken. This file proves
// each layer test/isolated.mjs puts in place, and fails the suite if a test
// file could get around them. Every key and account id is made up.
import { STUB_BIN, STUB_LOG, TEST_HOME, isolatedEnv, memoryKeychain } from './isolated.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { credentialsPath, readCredentials, setKeychainForTests, upsertAccounts, writeCredentials } from '../lib/credentials.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREDENTIALS = path.join(ROOT, 'lib', 'credentials.mjs');
const BIN = path.join(ROOT, 'bin', 'hiveku');
const ISOLATED = path.join(ROOT, 'test', 'isolated.mjs');
// This file's job is to name the forbidden patterns, and these two are what the rules below keep everyone else on.
const THE_RULES_THEMSELVES = new Set(['test/test-isolation.test.mjs', 'test/isolated.mjs', 'test/no-keychain-preload.mjs']);
const A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Every .mjs file under a folder of this repo, as repo-relative paths. */
function mjsFilesUnder(folder) {
  const out = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(child);
      } else if (entry.name.endsWith('.mjs')) out.push(child);
    }
  };
  walk(folder);
  return out;
}

/** Source text with comments gone, so a comment naming a pattern does not count as doing it. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** The relative modules a file statically imports, as absolute paths that exist. */
function importsOf(file) {
  const src = code(readFileSync(file, 'utf8'));
  const specifiers = new Set();
  for (const pattern of [/\bfrom\s*['"](\.[^'"]+)['"]/g, /\bimport\s*['"](\.[^'"]+)['"]/g, /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g]) {
    for (const m of src.matchAll(pattern)) specifiers.add(m[1]);
  }
  return [...specifiers]
    .map((s) => path.resolve(path.dirname(file), s))
    .filter((p) => existsSync(p) && statSync(p).isFile());
}

/** Whether a file reaches lib/credentials.mjs through its static imports, test/isolated.mjs aside. */
function reachesCredentials(file, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  if (file === ISOLATED) return false;
  if (file === CREDENTIALS) return true;
  return importsOf(file).some((next) => reachesCredentials(next, seen));
}

/** The text of every call that starts a process, from just after the call's opening parenthesis to the matching one. */
function startedProcesses(src) {
  const calls = [];
  for (const match of src.matchAll(/\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\(/g)) {
    calls.push(callText(src, match.index + match[0].length - 1));
  }
  return calls;
}

/** Quotes and template text skipped, from an opening parenthesis to its match. */
function callText(src, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

const NAMES_BIN = /\bbin\b['"\s,/+`]+hiveku/;

/** Whether any call in this file starts the plugin's own bin/hiveku (named outright or through a constant). */
function startsPluginProcess(src) {
  const names = [...src.matchAll(/\bconst\s+(\w+)\s*=[^;\n]*\bbin\b['"\s,/+`]+hiveku/g)].map((m) => m[1]);
  return startedProcesses(src).some((text) => NAMES_BIN.test(text) || names.some((name) => new RegExp(`\\b${name}\\b`).test(text)));
}

/** Whether a test file is one the isolation rules apply to: it can reach the key store or start a plugin process. */
function mustBeIsolated(rel, src) {
  return startsPluginProcess(src) || reachesCredentials(path.join(ROOT, rel));
}

/* ── no test file can get around the isolation ───────────────────────────── */

test('no test file passes the real environment on to anything it starts', () => {
  const offenders = [];
  for (const rel of [...mjsFilesUnder('test'), ...mjsFilesUnder('evals')]) {
    if (THE_RULES_THEMSELVES.has(rel)) continue;
    const src = code(read(rel));
    if (/\.\.\.\s*process\.env\b/.test(src) || /\benv\s*:\s*process\.env\b/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'these files pass the whole environment on: build it with isolatedEnv (test/isolated.mjs) instead');
});

test('every test file that can reach the key store or start a plugin process imports test/isolated.mjs first', () => {
  const offenders = [];
  for (const rel of mjsFilesUnder('test')) {
    if (THE_RULES_THEMSELVES.has(rel) || !rel.endsWith('.test.mjs')) continue;
    const src = code(read(rel));
    if (!mustBeIsolated(rel, src)) continue;
    const firstRelative = src.match(/\bimport\s+(?:[^'";]*?\bfrom\s*)?['"](\.[^'"]+)['"]/);
    if (firstRelative?.[1] !== './isolated.mjs') offenders.push(`${rel}: first relative import is ${firstRelative?.[1]}`);
  }
  assert.deepEqual(offenders, [], "these files can reach the key store or a plugin process but do not import './isolated.mjs' first");
});

test('every process a test starts from such a file is given the isolated environment, and never inherits one', () => {
  const offenders = [];
  for (const rel of mjsFilesUnder('test')) {
    if (THE_RULES_THEMSELVES.has(rel)) continue;
    const src = code(read(rel));
    if (!mustBeIsolated(rel, src)) continue;
    const started = startedProcesses(src);
    for (const text of started) {
      // git is not a plugin process and never asks a keychain here (a test-local repo, no remote).
      if (/^\s*['"`]git['"`]/.test(text)) continue;
      if (!/\benv\b/.test(text)) offenders.push(`${rel}: ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
    }
    if (started.length && !/\b(?:isolatedEnv|childEnv)\(/.test(src)) offenders.push(`${rel}: never calls isolatedEnv`);
  }
  assert.deepEqual(offenders, [], 'these calls hand a process no explicit environment, or never go through isolatedEnv');
});

/* ── the layers themselves ───────────────────────────────────────────────── */

test('this process has no real home, no real Claude setup, and the stubs first on PATH', () => {
  assert.equal(homedir(), TEST_HOME);
  assert.equal(process.env.HOME, TEST_HOME);
  assert.ok(TEST_HOME.startsWith(tmpdir().replace(/\/$/, '')) || TEST_HOME.includes('/tmp'), TEST_HOME);
  for (const name of ['CLAUDE_CONFIG_DIR', 'CLAUDE_PLUGIN_DATA', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PROJECT_DIR', 'CODEX_HOME', 'HIVEKU_PLUGIN_DATA']) {
    assert.equal(process.env[name], undefined, `${name} survived test/isolated.mjs`);
  }
  assert.equal(process.env.PATH.split(path.delimiter)[0], STUB_BIN);
  const which = spawnSync('security', ['--help'], { encoding: 'utf8' });
  assert.equal(which.status, 44, 'the first security on PATH must be the stub, which exits 44');
});

test('test/isolated.mjs itself clears a real Claude setup and takes the real home folder out of its process', () => {
  // Run it as a child with the real setup planted: the only way to see the import do its work.
  const script = `
    import ${JSON.stringify(pathToFileURL(ISOLATED).href)};
    import os from 'node:os';
    console.log(JSON.stringify({
      config: process.env.CLAUDE_CONFIG_DIR ?? null,
      root: process.env.CLAUDE_PLUGIN_ROOT ?? null,
      data: process.env.HIVEKU_PLUGIN_DATA ?? null,
      codex: process.env.CODEX_HOME ?? null,
      home: os.homedir(),
      firstOnPath: process.env.PATH.split(${JSON.stringify(path.delimiter)})[0],
    }));
  `;
  const run = nodeScript(script, {
    PATH: `/usr/bin${path.delimiter}/bin`,
    HOME: '/tmp/the-real-home',
    TMPDIR: tmpdir(),
    CLAUDE_CONFIG_DIR: '/tmp/the-real-claude-config',
    CLAUDE_PLUGIN_ROOT: '/tmp/the-real-root',
    HIVEKU_PLUGIN_DATA: '/tmp/the-real-data',
    CODEX_HOME: '/tmp/the-real-codex',
  });
  assert.equal(run.status, 0, run.stderr);
  const got = JSON.parse(run.stdout.trim().split('\n').at(-1));
  assert.deepEqual({ config: got.config, root: got.root, data: got.data, codex: got.codex }, { config: null, root: null, data: null, codex: null });
  assert.notEqual(got.home, '/tmp/the-real-home');
  assert.match(got.firstOnPath, /hiveku-isolated-.*stubs$/, 'the keychain stubs are first on PATH inside the importing process');
});

test('a spawned process gets only what isolatedEnv lists, even with the real setup planted around it', () => {
  // A later edit to isolatedEnv that spreads process.env, or forgets the stubs, shows here.
  const planted = {
    CLAUDE_CONFIG_DIR: '/tmp/real-claude-config',
    CLAUDE_PLUGIN_DATA: '/tmp/real-plugin-data',
    CLAUDE_PLUGIN_ROOT: '/tmp/real-plugin-root',
    HIVEKU_PLUGIN_DATA: '/tmp/real-data',
    CODEX_HOME: '/tmp/real-codex',
    ORCA_PROFILE: 'real',
    AWS_SECRET_ACCESS_KEY: 'not-a-real-key',
    SECRET_THING: 'not-a-real-secret',
  };
  Object.assign(process.env, planted);
  let env;
  let run;
  try {
    env = isolatedEnv({ HIVEKU_PLUGIN_DATA: path.join(tmpdir(), 'hk-isolated-data') });
    run = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'], { env, encoding: 'utf8' });
  } finally {
    for (const name of Object.keys(planted)) delete process.env[name];
  }
  assert.equal(run.status, 0, run.stderr);
  const childEnv = JSON.parse(run.stdout.trim().split('\n').at(-1));
  for (const name of Object.keys(planted)) {
    if (name === 'HIVEKU_PLUGIN_DATA') continue;
    assert.equal(childEnv[name], undefined, `${name} reached the spawned process`);
  }
  assert.equal(childEnv.HIVEKU_PLUGIN_DATA, path.join(tmpdir(), 'hk-isolated-data'), 'what a test adds is passed on');
  assert.equal(childEnv.HOME, TEST_HOME);
  assert.equal(childEnv.PATH.split(path.delimiter)[0], STUB_BIN, 'the keychain stubs are first on the child PATH');
  assert.match(childEnv.NODE_OPTIONS, /no-keychain-preload\.mjs/, 'the fake keychain is preloaded into the child');
  // A test that sets its own PATH keeps the stubs first.
  assert.equal(isolatedEnv({ PATH: '/usr/bin:/bin' }).PATH, `${STUB_BIN}${path.delimiter}/usr/bin:/bin`);
});

test("the session-start hook, run the way the tests run it, writes nothing into a planted CLAUDE_CONFIG_DIR (the original report)", async (t) => {
  const planted = mkdtempSync(path.join(tmpdir(), 'hk-planted-config-'));
  const dataDir = mkdtempSync(path.join(tmpdir(), 'hk-isolation-data-'));
  const folder = mkdtempSync(path.join(tmpdir(), 'hk-isolation-folder-'));
  t.after(() => {
    for (const dir of [planted, dataDir, folder]) rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(path.join(dataDir, 'update-check.json'), JSON.stringify({ checked_at: new Date().toISOString() }));
  process.env.CLAUDE_CONFIG_DIR = planted;
  let run;
  try {
    run = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], {
      input: JSON.stringify({ cwd: folder, source: 'startup' }),
      encoding: 'utf8',
      timeout: 30_000,
      env: isolatedEnv({ HIVEKU_PLUGIN_DATA: dataDir }),
    });
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
  }
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readdirSync(planted), [], 'the hook wrote into the planted CLAUDE_CONFIG_DIR');
});

test('the credential code goes through the seam: a real run through it never starts a keychain tool', async (t) => {
  const keychain = memoryKeychain();
  setKeychainForTests(keychain);
  const dir = mkdtempSync(path.join(tmpdir(), 'hk-isolation-seam-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const logBefore = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8') : '';
  await upsertAccounts(dir, [{ account_id: A, key: `hvk_${'a'.repeat(64)}`, label: 'Acme' }]);
  const creds = await readCredentials(dir);
  assert.equal(creds.accounts[A].key, `hvk_${'a'.repeat(64)}`);
  assert.ok(keychain.calls.includes('get') && keychain.calls.includes('set'), 'the fake was asked');
  assert.equal(JSON.parse(readFileSync(credentialsPath(dir), 'utf8')).enc, 'aes-256-gcm', 'the store was encrypted with the fake master key');
  await writeCredentials(dir, { accounts: {} });
  const logAfter = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8') : '';
  assert.equal(logAfter, logBefore, 'a keychain tool was started during a test that has the fake on');
});

/** Node, given a script and an environment: the script gets the real lib/credentials.mjs with no fake on. */
function nodeScript(source, env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', env, timeout: 30_000 });
}

/** A folder whose only "security" is a stub that logs that it was run. */
function loggingStubTool(dir, log) {
  const bin = path.join(dir, 'stubbed-bin');
  mkdirSync(bin, { recursive: true });
  for (const name of ['security', 'secret-tool']) {
    writeFileSync(path.join(bin, name), `#!/bin/sh\necho "$0 $*" >> '${log}'\nexit 44\n`);
    chmodSync(path.join(bin, name), 0o755);
  }
  return bin;
}

test('under the test runner the real keychain tool refuses: a test without the fake fails instead of reaching it', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hk-isolation-runner-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'calls.log');
  const bin = loggingStubTool(dir, log);
  const data = path.join(dir, 'data');
  mkdirSync(data, { recursive: true });
  writeFileSync(path.join(data, 'credentials.json'), JSON.stringify({ v: 1, enc: 'aes-256-gcm', iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA', data: 'AAAA' }));
  const script = `
    import { readCredentials } from ${JSON.stringify(pathToFileURL(CREDENTIALS).href)};
    await readCredentials(${JSON.stringify(data)});
    console.log('reached the end');
  `;
  // No fake, and the runner's mark present (this is what a forgotten fake looks like from inside the test run).
  const marked = nodeScript(script, { HOME: dir, PATH: `${bin}${path.delimiter}/usr/bin:/bin`, NODE_TEST_CONTEXT: 'child-v8' });
  assert.notEqual(marked.status, 0, 'the run must fail');
  assert.match(marked.stderr, /a test reached the real keychain tool/);
  assert.equal(existsSync(log), false, 'the keychain tool must not have been started');

  // The control: without the runner's mark the same script runs the tool, so the check above is what stopped it.
  const unmarked = nodeScript(script, { HOME: dir, PATH: `${bin}${path.delimiter}/usr/bin:/bin` });
  assert.equal(unmarked.status, 0, unmarked.stderr);
  assert.match(unmarked.stdout, /reached the end/);
  assert.match(readFileSync(log, 'utf8'), /security find-generic-password/);
});

test('with the preload, a spawned plugin process reaches no keychain tool even when the stubs are gone from its PATH', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hk-isolation-preload-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'calls.log');
  const bin = loggingStubTool(dir, log);
  const data = path.join(dir, 'data');
  mkdirSync(data, { recursive: true });
  const script = `
    import { upsertAccounts, readCredentials } from ${JSON.stringify(pathToFileURL(CREDENTIALS).href)};
    await upsertAccounts(${JSON.stringify(data)}, [{ account_id: ${JSON.stringify(A)}, key: 'hvk_preload', label: 'Acme' }]);
    const creds = await readCredentials(${JSON.stringify(data)});
    console.log(creds.accounts[${JSON.stringify(A)}].key);
  `;
  // The child's PATH is exactly the logging stub (a real path with no isolation stubs): only the preload can keep it off the tool.
  const env = { ...isolatedEnv({ HOME: dir }), PATH: `${bin}${path.delimiter}/usr/bin:/bin` };
  const run = nodeScript(script, env);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /hvk_preload/);
  assert.equal(existsSync(log), false, 'the preloaded fake must keep the process off the keychain tool');
});

test('without the preload, a spawned process stops at the PATH stub, never the real tool, and the store stays plain', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hk-isolation-stub-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = path.join(dir, 'data');
  mkdirSync(data, { recursive: true });
  const script = `
    import { upsertAccounts } from ${JSON.stringify(pathToFileURL(CREDENTIALS).href)};
    await upsertAccounts(${JSON.stringify(data)}, [{ account_id: ${JSON.stringify(A)}, key: 'hvk_stubbed', label: 'Acme' }]);
  `;
  // The mark is taken off too (HK-1418), so this proves the PATH stub on its own, as it did before the mark.
  const { HIVEKU_ISOLATED_TEST: _mark, ...env } = isolatedEnv({ HOME: dir, NODE_OPTIONS: '' });
  const run = nodeScript(script, env);
  assert.equal(run.status, 0, run.stderr);
  const store = JSON.parse(readFileSync(path.join(data, 'credentials.json'), 'utf8'));
  assert.equal(store.enc, undefined, 'no keyring: the store stays a plain file');
  assert.equal(store.accounts[A].key, 'hvk_stubbed');
  assert.match(readFileSync(STUB_LOG, 'utf8'), new RegExp(`${path.join(STUB_BIN, 'security').replace(/[/.]/g, '\\$&')} find-generic-password`), 'the stub ran, and the real tool did not');
});

test('the real keychain calls live in one place, reached only through the seam', () => {
  const src = code(read('lib/credentials.mjs'));
  assert.equal(src.match(/execFileAsync\(/g).length, 4, 'exactly the four real keychain calls');
  assert.equal(src.match(/'find-generic-password'/g).length, 1);
  assert.match(src, /refuseUnderTests\(\);\s*if \(process\.platform === 'darwin'\)/, 'get refuses first');
  assert.match(src, /refuseUnderTests\(\);\s*const b64/, 'set refuses first');
  assert.match(src, /const existing = await keychain\.get\(\);/);
  assert.match(src, /const stored = await keychain\.set\(fresh\);/);
  for (const rel of ['bin/hiveku', 'bin/hiveku-mcp', ...readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.mjs') && f !== 'credentials.mjs').map((f) => path.join('lib', f))]) {
    assert.doesNotMatch(code(read(rel)), /find-generic-password|add-generic-password|secret-tool/, `${rel} must not run the keychain tools itself`);
  }
});

test('a process spawned with isolatedEnv refuses the real keychain tool by its own mark, with no runner mark (HK-1418)', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hk-isolation-mark-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'calls.log');
  const bin = loggingStubTool(dir, log);
  const data = path.join(dir, 'data');
  mkdirSync(data, { recursive: true });
  writeFileSync(path.join(data, 'credentials.json'), JSON.stringify({ v: 1, enc: 'aes-256-gcm', iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA', data: 'AAAA' }));
  const script = `
    import { readCredentials } from ${JSON.stringify(pathToFileURL(CREDENTIALS).href)};
    await readCredentials(${JSON.stringify(data)});
    console.log('reached the end');
  `;
  const env = isolatedEnv({ HOME: dir });
  // A nested runner must not see the runner's mark (content-doctrine.test.mjs), and the child must carry its own.
  assert.equal(env.NODE_TEST_CONTEXT, undefined);
  assert.equal(env.HIVEKU_ISOLATED_TEST, '1');
  // The other layers taken away: no preload, and a PATH whose only keychain tool logs that it ran.
  const { NODE_OPTIONS: _preload, ...withoutPreload } = env;
  const run = nodeScript(script, { ...withoutPreload, PATH: `${bin}${path.delimiter}/usr/bin:/bin` });
  assert.notEqual(run.status, 0, 'the run must fail');
  assert.match(run.stderr, /a test reached the real keychain tool/);
  assert.equal(existsSync(log), false, 'the keychain tool must not have been started');
});
