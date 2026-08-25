/**
 * Detects the Hiveku VS Code extension's MCP server in the same directory.
 *
 * The extension writes a server named `hiveku` at LOCAL scope into
 * ~/.claude.json under projects[<folder>].mcpServers.hiveku, with an account key
 * inlined in the Authorization header. Plugin tools are namespaced
 * (mcp__plugin_hiveku_hk__*) so the two do not collide by name — which means
 * they do not override each other either. BOTH can be live in one session.
 *
 * That is the dangerous case: two tenants' toolsets present at once, with
 * nothing in the tool names to tell a user which company they are about to
 * write to. We cannot prevent it without breaking the extension, so we make it
 * impossible to miss.
 */
import path from 'node:path';
import os from 'node:os';
import { readJson, keyPreview } from './util.mjs';

export function claudeConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude.json');
}

/**
 * Looks for an extension-registered `hiveku` server for this exact folder.
 * Returns null when there is none, which is the common case.
 */
export async function detectExtensionServer(projectDir, homeDir = os.homedir()) {
  const cfg = await readJson(claudeConfigPath(homeDir));
  if (!cfg || typeof cfg !== 'object') return null;

  const projects = cfg.projects && typeof cfg.projects === 'object' ? cfg.projects : {};
  const entry = projects[path.resolve(projectDir)];
  const server = entry?.mcpServers?.hiveku;
  if (!server) return null;

  return {
    url: typeof server.url === 'string' ? server.url : null,
    // A PREFIX only. We need just enough to match this against a known account
    // so we can name the tenant; we never log or store the rest.
    keyPreview: extractKeyPreview(server),
    scope: 'local',
  };
}

function extractKeyPreview(server) {
  const auth = server?.headers?.Authorization || server?.headers?.authorization;
  if (typeof auth !== 'string') return null;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || /^\$\{.*\}$/.test(token)) return null; // unexpanded env var
  return keyPreview(token);
}

/**
 * Turns a detection into the line the user actually reads.
 *
 * `accounts` is the plugin's credential map, used only to translate the
 * extension's key prefix into a human account name. If we cannot identify it we
 * say so rather than guessing — "an account we cannot identify" is a more
 * actionable warning than a confidently wrong label.
 */
export function describeCollision(detected, pluginAccountLabel, accounts) {
  if (!detected) return null;

  let extLabel = null;
  if (detected.keyPreview) {
    for (const [, acct] of Object.entries(accounts || {})) {
      if (acct.key_preview && acct.key_preview === detected.keyPreview) {
        extLabel = acct.label;
        break;
      }
    }
  }

  const extName = extLabel || 'an account this plugin cannot identify';
  const lines = [
    `Hiveku: the VS Code extension also registered a server named "hiveku" for this folder, ` +
      `so TWO Hiveku connections are live in this session. ` +
      `mcp__hiveku__* serves ${extName}; mcp__plugin_hiveku_hk__* serves ${pluginAccountLabel || 'nothing (unbound)'}.`,
  ];

  if (extLabel && pluginAccountLabel && extLabel !== pluginAccountLabel) {
    lines.push(
      `These are DIFFERENT accounts. A write through the wrong tool prefix lands in the wrong ` +
        `client's account. Confirm with get_account_info before writing.`,
    );
  } else if (!extLabel) {
    lines.push(
      `Confirm with get_account_info before writing, so you know which account each prefix reaches.`,
    );
  }

  return lines.join(' ');
}
