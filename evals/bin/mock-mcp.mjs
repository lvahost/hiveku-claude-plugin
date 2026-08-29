#!/usr/bin/env node
/**
 * Fixture-backed stdio MCP server for behavioral evals.
 *
 * Serves the tool surface a fixture defines (fixtures/<case>/tools.mjs) and
 * appends every tools/call to a JSONL transcript - the provenance record the
 * checkers grade against. Framing matches lib/shim.mjs: newline-delimited
 * JSON, stdout carries protocol bytes only, stderr is diagnostics.
 *
 * Usage (normally spawned by Claude Code via an .mcp.json entry):
 *   node evals/bin/mock-mcp.mjs --fixture evals/fixtures/ap-screen \
 *        [--transcript /path/to/transcript.jsonl]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fixture') args.fixture = argv[++i];
    else if (a === '--transcript') args.transcript = argv[++i];
    else {
      process.stderr.write(`mock-mcp: unknown argument ${a}\n`);
      process.exit(2);
    }
  }
  if (!args.fixture) {
    process.stderr.write('usage: mock-mcp.mjs --fixture <dir> [--transcript <file>]\n');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const fixtureDir = path.resolve(args.fixture);
const transcriptPath = path.resolve(args.transcript || path.join(fixtureDir, 'out', 'transcript.jsonl'));
fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });

const mod = await import(pathToFileURL(path.join(fixtureDir, 'tools.mjs')).href);
const tools = await mod.createTools();

const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const result = (id, res) => write({ jsonrpc: '2.0', id, result: res });
const rpcError = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });
const log = (entry) => fs.appendFileSync(transcriptPath, `${JSON.stringify(entry)}\n`);

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    rpcError(null, -32700, 'Parse error');
    return;
  }
  const { id, method, params = {} } = msg;
  const isNotification = id === undefined || id === null;
  try {
    if (method === 'initialize') {
      result(id, {
        protocolVersion: params.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'hk-mock', version: '1.0.0' },
      });
    } else if (typeof method === 'string' && method.startsWith('notifications/')) {
      // notifications get no response
    } else if (method === 'ping') {
      if (!isNotification) result(id, {});
    } else if (method === 'tools/list') {
      result(id, {
        tools: Object.entries(tools).map(([name, fn]) => ({
          name,
          description: fn.description || `fixture tool ${name}`,
          inputSchema: fn.inputSchema || { type: 'object', properties: {}, additionalProperties: true },
        })),
      });
    } else if (method === 'tools/call') {
      const name = params.name;
      const input = params.arguments || {};
      const fn = tools[name];
      if (!fn) {
        log({ ts: new Date().toISOString(), tool: name, input, result: { error: 'unknown tool' } });
        result(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
        return;
      }
      const res = fn(input);
      log({ ts: new Date().toISOString(), tool: name, input, result: res });
      result(id, { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] });
    } else if (method === 'prompts/list') {
      result(id, { prompts: [] });
    } else if (method === 'resources/list') {
      result(id, { resources: [] });
    } else if (!isNotification) {
      rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    process.stderr.write(`mock-mcp: handler error on ${method}: ${err?.message || err}\n`);
    if (!isNotification) result(id, { content: [{ type: 'text', text: `fixture error: ${err?.message || err}` }], isError: true });
  }
});
