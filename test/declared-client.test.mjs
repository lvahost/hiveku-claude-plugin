/**
 * The MCP bridge declares itself as `claude-code-plugin/<version>`; nothing
 * else in the plugin does (plan "Server-side approval"; builder
 * src/lib/secrets/reveal-client.ts, MCP src/utils/declared-client.ts).
 *
 * The declaration tells the builder "this client asked a person before this
 * reveal", and a release at or above the builder's listed minimum then skips
 * the dashboard approval. That is true only on the bridge, where the
 * PreToolUse hook asks before every direct project_secrets_reveal. The CLI
 * (`hiveku env pull`, fleet, reports) and the hooks are run by the model
 * through Bash or by Claude Code, where nobody is asked, so they keep the bare
 * name and their reveals take the dashboard approval.
 *
 * Pinned:
 *  1. DECLARED_CLIENT is exactly `claude-code-plugin/<plugin.json version>`,
 *     in the form the builder parses (its DECLARED_RE, copied here).
 *  2. Upstream sends it only when constructed with declareClient: true, and
 *     the bare name otherwise.
 *  3. The bridge (lib/shim.mjs) is the only place that passes declareClient.
 *  4. The bridge's ask on the reveal is still there, the condition the
 *     declaration rests on.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_ID, DECLARED_CLIENT, PLUGIN_VERSION } from '../lib/util.mjs';
import { Upstream } from '../lib/upstream.mjs';
import { ALWAYS_ASK_WRITES, NEVER_AUTO_APPROVE } from '../lib/tool-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// The builder's DECLARED_RE (hiveku_builder src/lib/secrets/reveal-client.ts), character for character.
const BUILDER_DECLARED_RE = /^([a-z][a-z0-9-]{0,39})\/(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,5})$/;

test('the declaration is claude-code-plugin/<the released version>, in the form the builder reads', () => {
  const pluginJson = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.equal(PLUGIN_VERSION, pluginJson.version);
  assert.equal(DECLARED_CLIENT, `claude-code-plugin/${pluginJson.version}`);
  assert.equal(CLIENT_ID, 'claude-code-plugin');
  assert.match(DECLARED_CLIENT, BUILDER_DECLARED_RE);
});

test('Upstream sends the declaration only when asked to, the bare name otherwise', () => {
  const key = ['hvk', 'test', 'x'.repeat(8)].join('_');
  const declared = new Upstream({ key, accountId: 'a', label: 'A', declareClient: true }).headers();
  assert.equal(declared['X-Hiveku-Client'], DECLARED_CLIENT);
  for (const opts of [{}, { declareClient: false }, { declareClient: 'yes' }]) {
    const bare = new Upstream({ key, accountId: 'a', label: 'A', ...opts }).headers();
    assert.equal(bare['X-Hiveku-Client'], 'claude-code-plugin', JSON.stringify(opts));
  }
});

test('the MCP bridge is the only caller that declares', () => {
  const shim = read('lib/shim.mjs');
  assert.match(shim, /new Upstream\(\{[\s\S]{0,400}?declareClient: true,[\s\S]{0,40}?\}\)/, 'lib/shim.mjs must construct its Upstream with declareClient: true');
  const files = [
    'bin/hiveku',
    'bin/hiveku-mcp',
    ...readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => `lib/${f}`),
  ];
  const others = files.filter((f) => f !== 'lib/shim.mjs' && f !== 'lib/upstream.mjs' && /declareClient\s*:\s*true/.test(read(f)));
  assert.deepEqual(others, [], 'only the bridge may declare: the CLI and the hooks are run without a person being asked');
  // DECLARED_CLIENT is sent by Upstream alone, never put in a header by hand elsewhere.
  const handSent = files.filter((f) => f !== 'lib/util.mjs' && f !== 'lib/upstream.mjs' && /DECLARED_CLIENT/.test(read(f)));
  assert.deepEqual(handSent, []);
});

test('the condition the declaration rests on: the hook asks before every direct reveal', () => {
  assert.ok(ALWAYS_ASK_WRITES.has('project_secrets_reveal'), 'project_secrets_reveal must stay on ALWAYS_ASK_WRITES while the bridge declares');
  assert.ok(NEVER_AUTO_APPROVE.has('project_secrets_reveal'));
});
