/**
 * The stdio MCP server Claude Code spawns.
 *
 * Transport rules (MCP stdio spec, and they are absolute):
 *   - messages are newline-delimited JSON and MUST NOT contain embedded
 *     newlines (JSON.stringify satisfies this — it escapes them inside strings),
 *   - stdout carries protocol bytes and NOTHING else: no banners, no logging,
 *     no stray console.log, or the client's parser desynchronizes,
 *   - stderr is the sanctioned diagnostic channel.
 *
 * Design decision worth stating: `initialize` is answered LOCALLY, always.
 * An unbound directory has no key and still has to complete a handshake, so a
 * local path must exist regardless; making it the only path removes a mode
 * split, keeps startup instant, and means a network blip at session start does
 * not mark the whole server failed. Upstream's initialize gives us nothing we
 * cannot state ourselves — it hard-codes its protocol version, negotiates
 * nothing, and its session id is cosmetic.
 */
import readline from 'node:readline';
import { resolveBinding, looksLikeHivekuFolder } from './binding.mjs';
import { readCredentials } from './credentials.mjs';
import { Upstream, UpstreamError } from './upstream.mjs';
import { filterTools, parseFocus } from './tool-focus.mjs';
import { FIND_TOOL_NAME, indexModeTools, renderResults, searchTools } from './tool-index.mjs';
import { PLUGIN_VERSION, debug, warn } from './util.mjs';
import { isReadOnlyTool, readOnlyCount } from './tool-safety.mjs';

// ── Discovery-to-call state (session-local) ─────────────────────────────────
// A client dispatches tool_use only for REGISTERED tools, so a tool found via
// hiveku_find_tools must be PROMOTED into the advertised list or it is
// findable but uncallable - the 0.8.0/0.8.2 defect. `exposedTools` is every
// name a search has surfaced this session; `upstreamToolList` caches the
// server-filtered full list so promotions carry REAL schemas (the on-disk
// index deliberately has none) and so a promotion can never advertise a tool
// this key cannot call.
const exposedTools = new Set();
let upstreamToolList = null;

// tool-safety.mjs owns loading readonly-tools.json (and its hand-verified
// no-mapping additions). An empty list means annotate nothing, block nothing.
function readOnlySet() {
  return readOnlyCount() ? { has: (n) => isReadOnlyTool(n) } : null;
}

/** Fetch and cache the upstream tools/list (server-filtered by scope+profile). */
async function upstreamTools(state) {
  if (upstreamToolList) return upstreamToolList;
  const response = await state.upstream.forward({
    jsonrpc: '2.0', id: '__hk_promote_list__', method: 'tools/list', params: {},
  });
  const tools = response?.result?.tools;
  if (Array.isArray(tools)) upstreamToolList = tools;
  return upstreamToolList || [];
}

const PROTOCOL_VERSION = '2024-11-05';

/** Answered without a key. Everything else needs a binding. */
const LOCAL_METHODS = new Set(['initialize', 'notifications/initialized', 'ping']);

/** Safe empty answers so an unbound session degrades quietly instead of erroring. */
const INERT_RESULTS = {
  'tools/list': { tools: [] },
  'resources/list': { resources: [] },
  'resources/templates/list': { resourceTemplates: [] },
  'prompts/list': { prompts: [] },
};

function jsonrpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

/**
 * What the model is told about this directory's Hiveku state.
 *
 * In a directory with no Hiveku history this is deliberately EMPTY. The plugin
 * installs once at user scope, so it is present in every project on the
 * machine; announcing itself inside somebody's unrelated Rust repo would be
 * pollution, and Abe's requirement was that an unbound directory be inert.
 */
function instructionsFor(state) {
  if (state.binding && state.account) {
    return (
      `Hiveku is bound to ${state.account.label} (account ${state.binding.accountId}, ` +
      `${state.account.scope === 'read_only' ? 'read-only' : 'full'} access). ` +
      'One folder is one account; this key cannot reach any other tenant. ' +
      'Before any write, confirm identity with get_account_info, and remember you are not the only ' +
      'writer: check project_version_log before starting and project_files_status before pushing.'
    );
  }
  if (state.binding && !state.account) {
    return (
      `This directory is bound to Hiveku account ${state.binding.accountId} (${state.binding.label}), ` +
      'but no key for it is stored on this machine. Run /hiveku:connect to reconnect. ' +
      'Hiveku tools are inactive until then.'
    );
  }
  if (state.hasCredentials || state.looksLikeHiveku) {
    return (
      'This directory is not bound to a Hiveku account. Run /hiveku:bind to choose one of the ' +
      'connected accounts, or /hiveku:connect to connect an account first. Hiveku tools are inactive ' +
      'until then.'
    );
  }
  return '';
}

export async function runShim({ projectDir, dataDir, stdin = process.stdin, stdout = process.stdout }) {
  const state = {
    binding: null,
    account: null,
    upstream: null,
    // Departments this directory advertises. Empty = the full surface.
    focus: [],
    // 'index' (default) advertises a core set + hiveku_find_tools; 'all'
    // advertises every tool, which is what this did before and costs ~447k
    // tokens of context before the first message.
    toolMode: 'index',
    hasCredentials: false,
    looksLikeHiveku: false,
  };

  // Resolve ONCE at spawn and pin for the process lifetime. Re-resolving per
  // request would let a `cd` silently move the session to another tenant
  // mid-conversation, which is the one failure this whole design exists to make
  // impossible. The CwdChanged hook reports the mismatch instead.
  try {
    state.binding = await resolveBinding(projectDir);
    state.looksLikeHiveku = await looksLikeHivekuFolder(projectDir);
    const creds = await readCredentials(dataDir);
    state.hasCredentials = Object.keys(creds.accounts).length > 0;
    if (state.binding) {
      const account = creds.accounts[state.binding.accountId];
      if (account) {
        state.account = account;
        state.upstream = new Upstream({
          key: account.key,
          accountId: state.binding.accountId,
          label: account.label,
        });
        debug(`bound to ${account.label} (${state.binding.accountId}) via ${state.binding.file}`);
        state.focus = parseFocus(state.binding.departments);
        if (state.binding.toolMode === 'all') state.toolMode = 'all';
        // ★ An env override, for callers that legitimately need the whole
        // surface. The sweep script is the reason: it enumerates tools/list,
        // and index mode would silently reduce a 591-tool sweep to 13 while
        // still reporting success. Not a security control -- tools/call was
        // never filtered -- so an override only widens what is ADVERTISED.
        if (process.env.HIVEKU_TOOL_MODE === 'all') state.toolMode = 'all';
        if (state.focus.length) debug(`tool focus: ${state.focus.join(', ')}`);
      } else {
        warn(`bound to account ${state.binding.accountId} but no key is stored for it.`);
      }
    }
  } catch (err) {
    // A broken credential store must not take the session down. Report to
    // stderr and serve inert.
    warn(err?.message || String(err));
  }

  const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  const write = (obj) => stdout.write(JSON.stringify(obj) + '\n');

  /** In-flight requests, so notifications/cancelled can abort the fetch. */
  const inFlight = new Map();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      // No id is recoverable from unparseable input, so per JSON-RPC we answer
      // with a null id rather than staying silent.
      write(jsonrpcError(null, -32700, 'Parse error: message was not valid JSON'));
      continue;
    }

    handleMessage(msg).catch((err) => {
      warn(`unhandled: ${err?.stack || err}`);
      if (msg && msg.id !== undefined) {
        write(jsonrpcError(msg.id, -32603, `Hiveku plugin internal error: ${err?.message || err}`));
      }
    });
  }

  async function handleMessage(msg) {
    const { id, method } = msg || {};
    const isNotification = id === undefined;

    if (method === 'notifications/cancelled') {
      const controller = inFlight.get(msg?.params?.requestId);
      if (controller) controller.abort();
      return;
    }

    if (method === 'initialize') {
      write(
        jsonrpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            // listChanged:true is what lets a bind mid-session light the tools
            // up without a restart.
            tools: { listChanged: true },
            resources: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: { name: 'hiveku', version: PLUGIN_VERSION },
          instructions: instructionsFor(state),
        }),
      );
      return;
    }

    if (method === 'notifications/initialized') return; // no response for a notification
    if (method === 'ping') {
      if (!isNotification) write(jsonrpcResult(id, {}));
      return;
    }

    // ── Everything below needs a live binding ─────────────────────────────
    if (!state.upstream) {
      if (isNotification) return;
      if (method in INERT_RESULTS) {
        write(jsonrpcResult(id, INERT_RESULTS[method]));
        return;
      }
      write(jsonrpcError(id, -32002, inertReason(state)));
      return;
    }

    if (isNotification) {
      // Forward and drop the reply: a notification has no id, so there is
      // nothing to correlate a response to.
      try {
        await state.upstream.forward(msg);
      } catch (err) {
        debug(`notification forward failed: ${err?.message || err}`);
      }
      return;
    }

    // ── Answered locally, never forwarded ─────────────────────────────
    // hiveku_find_tools is this plugin's own tool: it searches the catalogue on
    // disk. Forwarding it upstream would 404, since the server has never heard
    // of it.
    if (method === 'tools/call' && msg?.params?.name === FIND_TOOL_NAME) {
      const args = msg.params.arguments || {};
      const matches = searchTools(args.query, {
        department: args.department,
        limit: args.limit,
        focus: state.focus || [],
        readOnlySet: state.account?.scope === 'read_only' ? readOnlySet() : null,
      });
      // PROMOTE before answering: intersect with the server-filtered upstream
      // list so a name the key cannot see is never advertised, then tell the
      // client the tool list changed. Without this notification the found
      // tools exist only in prose and the client never re-lists.
      let grew = false;
      if (matches.length && state.toolMode === 'index') {
        try {
          const live = new Set((await upstreamTools(state)).map((t) => t?.name));
          for (const m of matches) {
            if (live.has(m.name) && !exposedTools.has(m.name)) {
              exposedTools.add(m.name);
              grew = true;
            }
          }
        } catch (err) {
          debug(`promotion list fetch failed: ${err?.message || err}`);
        }
      }
      write(jsonrpcResult(id, {
        content: [{ type: 'text', text: renderResults(matches, String(args.query ?? '')) }],
      }));
      if (grew) {
        write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        debug(`promoted -> ${exposedTools.size} exposed tools`);
      }
      return;
    }

    const controller = new AbortController();
    inFlight.set(id, controller);
    try {
      const response = await state.upstream.forward(msg, controller.signal);
      if (response === null) return; // 204 with no body
      // ── The ONE place a response is altered ────────────────────────────
      // A focused directory advertises only its departments' tools. Applied to
      // tools/list ALONE, never to tools/call: an out-of-focus tool named
      // explicitly must still work. This trims context, it does not restrict
      // access -- see lib/tool-focus.mjs.
      if (method === 'tools/list' && Array.isArray(response?.result?.tools)) {
        const before = response.result.tools.length;
        let tools = response.result.tools;
        // Cache the full server-filtered list: it is the schema source for
        // promoted tools and saves the promotion path its own list fetch.
        upstreamToolList = response.result.tools;
        if (state.focus?.length && state.toolMode !== 'index') tools = filterTools(tools, state.focus);
        // Index mode: core + everything a search has promoted, from the
        // UNFILTERED list - a tool the model went looking for and found must
        // not be stripped by a directory focus it cannot see. Focus instead
        // narrows what search reaches by default (see searchTools).
        if (state.toolMode === 'index') tools = indexModeTools(response.result.tools, exposedTools);
        response.result.tools = tools;
        if (tools.length !== before) {
          debug(`tools/list ${before} -> ${tools.length} (mode=${state.toolMode}` +
            `${state.focus?.length ? `, focus=${state.focus.join(',')}` : ''})`);
        }
      }
      // Otherwise forward VERBATIM, including a JSON-RPC `error` member. The
      // 429 hint in error.data.retry_after_seconds is machine-readable and the
      // model can act on it; rewriting it into prose would destroy that.
      write(response);
    } catch (err) {
      write(errorResponseFor(id, err, state));
    } finally {
      inFlight.delete(id);
    }
  }
}

function inertReason(state) {
  if (state.binding && !state.account) {
    return (
      `This directory is bound to Hiveku account ${state.binding.label} but no key for it is stored ` +
      'on this machine. Run /hiveku:connect to reconnect.'
    );
  }
  return (
    'This directory is not bound to a Hiveku account, so Hiveku tools are inactive here. ' +
    'Run /hiveku:bind to bind it to one of your connected accounts.'
  );
}

function errorResponseFor(id, err, state) {
  if (err instanceof UpstreamError) {
    if (err.kind === 'rate_limit' && err.passthrough) {
      return { jsonrpc: '2.0', id, error: err.passthrough };
    }
    return jsonrpcError(id, -32000, err.message, {
      kind: err.kind,
      account: state.account?.label ?? null,
      ...(err.httpStatus ? { http_status: err.httpStatus } : {}),
      ...(err.retryAfterSeconds ? { retry_after_seconds: err.retryAfterSeconds } : {}),
    });
  }
  return jsonrpcError(id, -32603, `Hiveku plugin error: ${err?.message || err}`);
}
