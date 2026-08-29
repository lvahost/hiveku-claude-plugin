/**
 * The plugin's own prerequisites in Claude's settings, provisioned by the plugin.
 *
 * ★ WHY THIS EXISTS. Three settings decide whether Hiveku works inside Claude
 * Desktop at all, and every one of them lives in the USER's settings file,
 * where a plugin cannot declare it:
 *
 *   sandbox.filesystem.allowWrite   ~/.claude/plugins  — or connect dies at the
 *                                    credential save and updates cannot install
 *   sandbox.network.allowedDomains  app + core.hiveku.com — or the key exchange
 *                                    and any script hitting the API is refused
 *   extraKnownMarketplaces.hiveku   autoUpdate: true — or nobody ever receives
 *                                    a fix (off by default for git marketplaces)
 *
 * Telling twenty non-technical people to paste a JSON block is documentation,
 * not a product. So the plugin merges these itself: additive only (never
 * removes or reorders anything the user set), idempotent, with a timestamped
 * backup beside the file the first time it changes anything.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const REQUIRED = {
  allowWrite: ['~/.claude/plugins'],
  allowedDomains: ['app.hiveku.com', 'core.hiveku.com'],
  marketplace: {
    source: { source: 'git', url: 'https://github.com/lvahost/hiveku-claude-plugin.git' },
    autoUpdate: true,
  },
};

export function settingsPath(homeDir = os.homedir()) {
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return path.join(cfg && cfg.trim() ? cfg.trim() : path.join(homeDir, '.claude'), 'settings.json');
}

/** Pure: what is missing, and the settings object with it added. */
export function planProvision(settings) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  const changes = [];

  const sb = (next.sandbox ??= {});
  const fsb = (sb.filesystem ??= {});
  const aw = (fsb.allowWrite ??= []);
  for (const p of REQUIRED.allowWrite) if (!aw.includes(p)) { aw.push(p); changes.push(`allowWrite ${p}`); }

  const net = (sb.network ??= {});
  const dom = (net.allowedDomains ??= []);
  for (const h of REQUIRED.allowedDomains) if (!dom.includes(h)) { dom.push(h); changes.push(`egress ${h}`); }

  const mk = (next.extraKnownMarketplaces ??= {});
  const hk = mk.hiveku;
  if (!hk || hk.autoUpdate !== true) {
    mk.hiveku = { ...(hk ?? {}), source: hk?.source ?? REQUIRED.marketplace.source, autoUpdate: true };
    changes.push('marketplace auto-update');
  }
  return { next, changes };
}

/** Read, plan, write (with backup) — or report why it could not. */
export async function provisionSettings({ homeDir = os.homedir(), dryRun = false } = {}) {
  const file = settingsPath(homeDir);
  let current = {};
  let existed = false;
  try {
    const raw = await fs.readFile(file, 'utf8');
    existed = true;
    try { current = JSON.parse(raw); }
    catch { return { file, applied: false, changes: [], error: 'settings.json is not valid JSON — not touching it' }; }
  } catch { /* no file yet: we create one */ }

  const { next, changes } = planProvision(current);
  if (!changes.length) return { file, applied: false, changes, upToDate: true };
  if (dryRun) return { file, applied: false, changes, dryRun: true };

  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (existed) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.copyFile(file, `${file}.bak-${stamp}`);
    }
    await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    return { file, applied: true, changes };
  } catch (e) {
    // The sandbox itself can block this write. Say so; the caller decides how
    // to route around it (a terminal run, or an admin's managed settings).
    return { file, applied: false, changes, error: `${e?.code || 'write failed'}: cannot write ${file}` };
  }
}
