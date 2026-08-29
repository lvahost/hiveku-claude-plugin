/**
 * Find a bound Hiveku account folder without being told where one is.
 *
 * ★ This is what makes the drift gates RUNNABLE. Both --check gates degrade to
 * "cannot verify" (exit 2) when nobody passes a directory, and a gate that
 * usually skips itself is not a gate — it is a green light with no bulb. Every
 * staff machine already has ~/Hiveku-Accounts/<account>/.hiveku/account.json
 * from `/hiveku:setup`, so the common case needs no argument at all.
 *
 * ★ Any bound folder will do. The tool catalogue is a property of the SERVER,
 * not of the account — scope and profile narrow what a given key SEES, which is
 * the one reason a caller would still name a specific --dir.
 *
 * Kept here rather than in lib/ because it is build machinery: it must never be
 * shipped into the runtime path a customer's session depends on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ACCOUNTS_ROOT_NAME = 'Hiveku-Accounts';

export function discoverBoundDir(homeDir = os.homedir()) {
  const root = path.join(homeDir, ACCOUNTS_ROOT_NAME);
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    if (fs.existsSync(path.join(dir, '.hiveku', 'account.json'))) return dir;
  }
  return null;
}

/** `--dir <path>` if given, else a discovered one, else null. */
export function resolveDirArg(argv, homeDir = os.homedir()) {
  const i = argv.indexOf('--dir');
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return path.resolve(argv[i + 1]);
  return discoverBoundDir(homeDir);
}
