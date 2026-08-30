/**
 * The HTTP half of the shim: JSON-RPC over Streamable HTTP to core.hiveku.com.
 *
 * Evolved from hiveku-sync's src/mcp.mjs, with the behaviours a PROXY needs that
 * a client does not:
 *   - client message ids are forwarded verbatim (sync renumbers from its own
 *     counter, which would corrupt every response pairing),
 *   - JSON-RPC error objects are returned as data, not thrown (sync converts
 *     them into JS Errors, which loses the code and the machine-readable
 *     error.data the model needs),
 *   - id-less notifications are representable and produce no response,
 *   - HTTP 204 is handled without parsing a body.
 */
import { randomUUID } from 'node:crypto';
import diagnosticsChannel from 'node:diagnostics_channel';
import { HIVEKU_MCP_URL, CLIENT_ID, USER_AGENT, debug } from './util.mjs';
import { loadIndex } from './tool-index.mjs';
import { isReadOnlyTool } from './tool-safety.mjs';

const PROTOCOL_VERSION = '2024-11-05';

/**
 * How long the bridge waits for one tool call, and why the number is PLUMBED
 * rather than hand-listed.
 *
 * ★ THE OLD TABLE WAS WRONG IN BOTH DIRECTIONS AT ONCE. `timeoutFor()` returned
 * a three-key override map or a flat 60s and never consulted the budget the
 * SERVER declares. 254 tools declare `mapping.timeoutMs` above 60s, so every one
 * of them was a latent client-side abort - ppc_sync declared 310s at the time
 * and died here at 60s with "Hiveku did not respond within 60s" while the sync
 * ran on (Locus Digital QA, 2026-08-30; its declaration has since been lowered
 * to 120s, for the undici reason in the ceiling note below).
 * Meanwhile the three tools the table DID name -
 * project_files_snapshot, project_test_build, deploy_site - map to routes that
 * declare NO mapping.timeoutMs, so the Olympus proxy abandoned them at its own
 * 60s default while this bridge sat waiting 180s for an answer that had already
 * come back as an error. A table that has to track a sibling repo drifts; a
 * generated field cannot, so the budget now comes from lib/tool-index.json
 * (scripts/gen-tool-index.mjs reads mapping.timeoutMs out of the declarations).
 *
 * ★ ONE NUMBER FOR BOTH SIDES OF THE HOP. Client budget = the server's declared
 * budget + MCP_HOP_MARGIN_MS, clamped to EDGE_TIMEOUT_CEILING_MS. Waiting
 * EXACTLY the declared number races the abort we are waiting for, which is the
 * same shape as the ladder the MCP proxy already documents for itself (route
 * 120s -> proxy 140s). Waiting LESS turns a server-side answer into a
 * client-side "no response", which is the defect this whole comment exists for.
 */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

/**
 * The margin between the server's declared budget and ours. The MCP server's
 * own hop - auth, profile filtering, the audit write, JSON serialisation - sits
 * OUTSIDE the proxy's timeoutMs, so a client that waits exactly the declared
 * number can abort microseconds before the structured error it was waiting for.
 */
const MCP_HOP_MARGIN_MS = 15_000;

/**
 * ★ THE CEILING IS INFRASTRUCTURE, NOT A PREFERENCE, and no declared budget can
 * be honoured past it. Two separate walls, in this order:
 *
 * 1. core.hiveku.com sits behind Cloudflare, which ends a synchronous request
 *    the origin has not answered and returns an edge 524. The MCP server repo
 *    records the wall empirically - "Cloudflare closes the connection at 120
 *    SECONDS regardless of server or client timeouts, surfacing as an edge HTTP
 *    524" (olympus-tools.ts, project_files_snapshot_async) - and Cloudflare's
 *    own 524 page documents the default at 125s, raisable only on Enterprise.
 *    So 135s is deliberately just PAST that wall: the point is to OUTLIVE the
 *    edge so the 524 (or the proxy's own structured "still running" JSON)
 *    reaches the model, instead of being masked by a client-side abort that
 *    says nothing about whether the work ran.
 *
 * 2. Do NOT raise this to 300_000 or beyond, whatever a declaration says.
 *    undici's headersTimeout defaults to 300e3, and when it fires fetch throws
 *    a bare `TypeError: fetch failed` rather than an AbortError. That lands in
 *    the network branch below and tells the operator to check their VPN and
 *    machine policy for a server that is still working perfectly.
 */
const EDGE_TIMEOUT_CEILING_MS = 135_000;

/**
 * Protocol messages (initialize, notifications/initialized, tools/list).
 * tools/list is the one whose size scales with the catalogue - 1,800+ tools,
 * over a megabyte of descriptions - so 30s was tight on a slow link.
 */
const PROTOCOL_TIMEOUT_MS = 60_000;

/**
 * Bounds the response BODY read, which the request timer does NOT cover: that
 * timer is cleared the moment fetch() settles, and fetch() settles on HEADERS.
 * undici's own bodyTimeout is an INTER-CHUNK timer, not a total cap, so a
 * slow-but-steady response can outlive any budget indefinitely without it.
 */
const BODY_READ_TIMEOUT_MS = 60_000;

/**
 * Local overrides, for a tool whose generated budget is known to be wrong on
 * this machine. DELIBERATELY EMPTY: the three entries that used to live here
 * were all wrong (see DEFAULT_TOOL_TIMEOUT_MS), and every value here is still
 * clamped to EDGE_TIMEOUT_CEILING_MS because an override cannot buy time the
 * network will not grant. A Map, not an object literal, so a tool name like
 * `constructor` cannot reach Object.prototype and return a function.
 */
const TOOL_TIMEOUT_OVERRIDES = new Map();

/**
 * The server's declared budget for one tool, or null when it declares none.
 *
 * ★ NULL IS NOT ZERO AND NOT 60s. A tool absent from the index, or present with
 * no mapping.timeoutMs, has not told us it is fast - it has told us nothing.
 * timeoutFor() answers unknown with the ceiling, because the failure that
 * matters is giving up on a call the server was still running. talk_to_department
 * is the case that proves it: it has no route mapping at all, and its server-side
 * budget is 110s (DEPARTMENT_CHAT_TIMEOUT_MS), so anything derived only from
 * declared mappings would have kept aborting the most-used tool in the plugin.
 */
let DECLARED_TIMEOUTS = null;
function declaredTimeoutMs(name) {
  if (!DECLARED_TIMEOUTS) {
    DECLARED_TIMEOUTS = new Map();
    // loadIndex() is the same cached read the search path uses, and it returns
    // [] rather than throwing when the file is missing - which lands us on the
    // ceiling for everything, the safe direction.
    for (const t of loadIndex()) {
      if (typeof t?.name === 'string' && Number.isFinite(t?.timeoutMs) && t.timeoutMs > 0) {
        DECLARED_TIMEOUTS.set(t.name, t.timeoutMs);
      }
    }
  }
  return DECLARED_TIMEOUTS.get(name) ?? null;
}

/**
 * Did this request actually get written to the socket?
 *
 * ★ AN ABORT CANNOT ANSWER THAT ON ITS OWN, and the answer is the one fact that
 * decides whether a retry is safe. undici publishes 'undici:client:sendHeaders'
 * immediately before the first byte of the request is written, and the channel
 * fires for Node's built-in fetch. So each request carries a private stamp and
 * we record the stamp when undici reports the write. The stamp is read from the
 * raw header block undici is about to send, so a proxy stripping the header
 * downstream cannot affect this reading.
 *
 * ARMED BY EVIDENCE, NOT BY SUBSCRIPTION. diagnosticsChannel.subscribe() does
 * NOT throw for a channel nobody publishes - it silently creates the channel -
 * so a try/catch around it can never tell us the probe is unavailable, and
 * treating "subscribe returned" as "the probe works" would make every
 * unmeasured request report an affirmative `dispatched: false`, i.e. "nothing
 * ran, safe to replay" about a write that may well have landed. That is the
 * single most dangerous thing this file could say. So the flag flips only when
 * a publish actually ARRIVES with a parseable header block, and until then the
 * answer is null (unknown).
 *
 * Fails SAFE in both directions. Before any observed publish every answer is
 * null, and the wording then says "treat it as delivered" rather than inventing
 * a reassuring "nothing ran". And a stamp match can only ever OVER-report a
 * dispatch, never under-report one, so the dangerous mistake - telling a caller
 * it is safe to replay a write that already landed - is the one this cannot
 * make.
 */
const dispatchedReqs = new Set();
/** Flips true the first time the channel delivers a header block we can read. */
let dispatchChannelProven = false;
try {
  diagnosticsChannel.subscribe('undici:client:sendHeaders', (msg) => {
    const raw = typeof msg?.headers === 'string' ? msg.headers : '';
    // A publish whose headers are not a string means undici changed the event
    // shape. Do not prove the channel on it - an unreadable publish is exactly
    // the case that must keep answering "unknown".
    if (!raw) return;
    dispatchChannelProven = true;
    const m = raw.match(/^x-hiveku-req:[ \t]*([0-9a-f-]+)/im);
    if (m) dispatchedReqs.add(m[1]);
  });
} catch {
  // Kept as a backstop only; subscribe() is not documented to throw.
}

/** true = written to the socket, false = never sent, null = cannot tell. */
function wasDispatched(reqId) {
  if (dispatchedReqs.has(reqId)) return true;
  // No stamp. That is only EVIDENCE of non-dispatch once we have seen the
  // channel work at least once in this process; before that it is silence.
  return dispatchChannelProven ? false : null;
}

/**
 * What to tell the caller about re-sending, once we know whether the request
 * was delivered. Scoped to tools/call: a protocol message has nothing to
 * re-read, and a server-declared read is safe to simply run again.
 */
function retryAdvice(message) {
  if (message?.method !== 'tools/call') return 'Re-send it.';
  const name = message?.params?.name;
  if (typeof name === 'string' && isReadOnlyTool(name)) {
    return `${name} is a server-declared read, so running it again is safe.`;
  }
  return (
    'If this was a write it may already have landed: read the resource back before re-sending, ' +
    'or use the tool\'s async twin (202 + job_id, polled with job_status_get).'
  );
}

export class Upstream {
  constructor({ key, accountId, label, url = HIVEKU_MCP_URL }) {
    this.url = url;
    this.key = key;
    this.accountId = accountId;
    this.label = label || accountId;
    this.sessionId = null;
    this._handshake = null;
    /** Set when the key is rejected, so we stop replaying a dead credential. */
    this.deadReason = null;
  }

  headers() {
    return {
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      // Gets us our own rate-limit bucket. Without it the plugin would share a
      // 100-req/60s budget with the VS Code extension and hiveku-sync whenever
      // they hold the same key, and each would intermittently 429 the others.
      'X-Hiveku-Client': CLIENT_ID,
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      // Deliberately absent: X-Account-Id. A customer key is pinned server-side
      // to one account; sending the header can only ever produce a 403.
    };
  }

  /**
   * Performs the upstream handshake once, memoized WHILE IN FLIGHT.
   *
   * The in-flight memo (not just a done-flag) is the important part: several
   * tool calls can arrive in the same tick, and without it each would open its
   * own handshake. The extension hit exactly this and paid seven handshakes for
   * one logical read.
   */
  async ensureInitialized() {
    if (this._handshake) return this._handshake;
    this._handshake = (async () => {
      await this.send(
        {
          jsonrpc: '2.0',
          id: 'hiveku-init',
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'hiveku-claude-plugin', version: USER_AGENT.split('/')[1] },
          },
        },
        PROTOCOL_TIMEOUT_MS,
      );
      // Notification: no id, and the server answers 204 with no body.
      await this.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, PROTOCOL_TIMEOUT_MS);
    })().catch((err) => {
      // Let the next call retry rather than caching a transient network failure
      // forever — a handshake that failed because the wifi blinked must not
      // permanently disable the server.
      this._handshake = null;
      throw err;
    });
    return this._handshake;
  }

  timeoutFor(message) {
    if (message?.method !== 'tools/call') return PROTOCOL_TIMEOUT_MS;
    const name = message?.params?.name;
    const declared = TOOL_TIMEOUT_OVERRIDES.get(name) ?? declaredTimeoutMs(name);
    // ★ UNKNOWN IS NOT SHORT. No declaration means the index could not measure
    // one, not that the tool is fast, so the answer is the only budget we know
    // binds: the edge ceiling. Erring long costs a slower failure report; erring
    // short manufactures "Hiveku did not respond" for a call that answered.
    if (!Number.isFinite(declared) || declared <= 0) return EDGE_TIMEOUT_CEILING_MS;
    // Declared + the MCP hop, floored at the old default so a very short
    // declaration cannot make the bridge stricter than the proxy, and clamped
    // to the ceiling because no declaration can buy time past the edge.
    const budget = Math.max(declared + MCP_HOP_MARGIN_MS, DEFAULT_TOOL_TIMEOUT_MS);
    return Math.min(budget, EDGE_TIMEOUT_CEILING_MS);
  }

  /**
   * Sends one JSON-RPC message and returns the parsed response, or null for a
   * notification / 204. Throws only for transport-level problems; JSON-RPC
   * errors come back as a normal object with an `error` member.
   */
  async send(message, timeoutMs, externalSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (externalSignal) externalSignal.addEventListener('abort', onAbort, { once: true });

    // Stamped so the diagnostics channel above can report whether undici
    // actually wrote this request to the socket. Never read by the server.
    const reqId = randomUUID();
    const secs = Math.round(timeoutMs / 1000);

    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { ...this.headers(), 'X-Hiveku-Req': reqId },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        // A CLIENT cancellation is not a timeout. Reporting it as one told the
        // model Hiveku was slow when the harness had pulled the request.
        if (externalSignal?.aborted) {
          throw new UpstreamError(
            `The request to Hiveku was cancelled by this client (${message?.method || 'request'}). ` +
            'Hiveku was not slow and did not refuse anything.',
            { kind: 'cancelled', dispatched: wasDispatched(reqId), response_started: false },
          );
        }
        // ★ NEVER CALL THIS "NOT SENT". The abort fires when no response HEADERS
        // have arrived, which says NOTHING about whether the request was
        // delivered - and delivered-or-not is the entire question the caller
        // has. wasDispatched() answers it from undici's own socket-write event,
        // and answers "unknown" rather than guessing.
        const dispatched = wasDispatched(reqId);
        const verdict =
          dispatched === false
            // No retryAdvice() here on purpose. Its write text ("it may already
            // have landed - read the resource back before re-sending") is
            // written for the delivered and unknown arms, and appending it to a
            // MEASURED non-dispatch would contradict this sentence in the same
            // breath and defeat the whole point of the three-state verdict.
            ? 'The request never left this machine, so nothing ran on Hiveku and a retry is safe.'
            : dispatched === true
              ? 'The request WAS written to the network, so Hiveku may have it and may still be ' +
                `running it. ${retryAdvice(message)}`
              : 'Whether the request reached Hiveku could not be determined on this runtime, so ' +
                `treat it as delivered. ${retryAdvice(message)}`;
        throw new UpstreamError(
          `Hiveku sent no response within ${secs}s (${message?.method || 'request'}). ${verdict}`,
          { kind: 'timeout', timeout_seconds: secs, dispatched, response_started: false },
        );
      }
      // undici collapses every network failure into 'fetch failed'; the real
      // story is on err.cause. Name it, because the model diagnosing this
      // error needs to distinguish DNS-down from refused from TLS - and say
      // whose network failed: this is the BRIDGE's own path, which is separate
      // from the Bash sandbox, so a sandboxed shell being blocked neither
      // causes nor is proven by this error.
      const cause = err?.cause;
      const code = cause?.code || cause?.errors?.[0]?.code || '';
      const causeMsg = cause?.message && cause.message !== err?.message ? ` - ${cause.message}` : '';
      // A connection that failed BEFORE the request was written ran nothing; one
      // that failed after (a reset mid-request) may have. Same measured answer as
      // the timeout branch, and the same rule: unknown stays null.
      const dispatched = wasDispatched(reqId);
      throw new UpstreamError(
        `Could not reach Hiveku: ${err?.message || err}${code ? ` (${code})` : ''}${causeMsg}. ` +
        'This request came from the Hiveku bridge process itself (its network is separate from ' +
        'the Bash sandbox), so the bridge genuinely could not reach core.hiveku.com: check ' +
        'connectivity, VPN/proxy, or whether a machine-level policy blocks this process.' +
        (dispatched === true
          ? ' NOTE: the request had already been written to the network before the connection ' +
            `failed, so Hiveku may have received it. ${retryAdvice(message)}`
          : ''),
        { kind: 'network', code, dispatched, response_started: false },
      );
    } finally {
      clearTimeout(timer);
      // Bounds the dispatch set so it cannot grow for the life of the process.
      // `finally` runs AFTER the throw expressions above are evaluated, so the
      // wasDispatched() reads in the catch still saw the flag.
      dispatchedReqs.delete(reqId);
      // NB: the external-abort listener is deliberately NOT removed here - the
      // body read below still needs this controller to be abortable by a client
      // cancellation. Nothing leaks: the listener is registered { once: true },
      // and `externalSignal` is the per-request controller shim.mjs drops from
      // its inFlight map when the message settles, so both become garbage
      // together.
    }

    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      // ★ RECONNECTING IS ONLY HALF THE FIX, and omitting the other half
      // produces a loop that looks like a total Hiveku outage.
      //
      // Two things latch. `deadReason` is never cleared once set, so every
      // later call throws here without a network attempt. And the key was
      // resolved ONCE at spawn and pinned for the process lifetime (see
      // shim.mjs — deliberate, so a `cd` cannot move a session to another
      // tenant mid-conversation). So /hiveku:connect writes a fresh key to the
      // credential store while this bridge goes on holding the dead one.
      //
      // Telling someone only to reconnect sends them round that loop: they
      // reconnect, it fails identically, and the advice repeats. Say both.
      this.deadReason =
        res.status === 401
          ? `The Hiveku key for ${this.label} was rejected (revoked or rotated). Two steps, and the ` +
            `second is NOT optional: run /hiveku:connect, then START A NEW SESSION. This connection ` +
            `pinned the old key when it started and cannot pick up the new one — reconnecting alone ` +
            `will fail exactly the same way.`
          : `Hiveku refused this key for ${this.label} (403). This is a scope or permission refusal, ` +
            `not a dead key: reconnecting will not change it. ${body.slice(0, 200)}`;
      throw new UpstreamError(this.deadReason, { kind: 'auth', httpStatus: res.status });
    }

    if (res.status === 429) {
      // The server sends a machine-readable hint. Surface it verbatim rather
      // than regexing the message, and do not retry here — a chat model can act
      // on retry_after_seconds, whereas a hidden retry loop just burns the
      // budget the caller is already over.
      const body = await res.json().catch(() => null);
      const retry = body?.error?.data?.retry_after_seconds ?? Number(res.headers.get('retry-after')) ?? null;
      throw new UpstreamError(
        `Hiveku rate limit reached${retry ? `; retry in ${retry}s` : ''}.`,
        { kind: 'rate_limit', httpStatus: 429, retryAfterSeconds: retry, passthrough: body?.error },
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // ★ 52x COMES FROM THE EDGE, NOT FROM HIVEKU, and the three statuses mean
      // OPPOSITE things about whether anything ran. Rendering them all as
      // "Hiveku returned HTTP 52x" invites a retry that duplicates a write.
      //
      // 524 / 504: the edge REACHED the origin and stopped waiting while the
      // origin was still working. Cloudflare's words for 524 are "the origin did
      // not provide an HTTP response before the default 125 seconds". So the
      // request was delivered; the answer was not. response_started is FALSE
      // because the ORIGIN never began answering - the edge wrote this body.
      if (res.status === 524 || res.status === 504) {
        throw new UpstreamError(
          `The network edge in front of Hiveku stopped waiting for a response (HTTP ${res.status}). ` +
          'The request REACHED Hiveku and the work it started may still be running - this is a ' +
          `timeout, not a refusal. ${retryAdvice(message)} No synchronous Hiveku call can outlive ` +
          'this ceiling, so a longer client timeout cannot fix it.',
          { kind: 'edge_timeout', httpStatus: res.status, dispatched: true, response_started: false },
        );
      }
      // 523 "Origin is unreachable": Cloudflare could not resolve or route to
      // the origin, so nothing was ever delivered and a retry IS safe. It fires
      // almost immediately rather than after a long wait.
      if (res.status === 523) {
        throw new UpstreamError(
          'The network edge in front of Hiveku could not reach the Hiveku origin at all ' +
          '(HTTP 523: Cloudflare\'s "Origin is unreachable"). The request did NOT reach Hiveku, ' +
          'so nothing ran and a retry is safe once the origin is back. This is an outage or a ' +
          'routing failure, not a slow call.',
          { kind: 'edge_unreachable', httpStatus: 523, dispatched: false, response_started: false },
        );
      }
      // 522 "Connection timed out" is NOT the same verdict, and grouping it with
      // 523 asserted a negative we cannot support. Cloudflare documents 522 for
      // TWO different failures: the origin never returned SYN+ACK (nothing was
      // delivered), AND a connection that WAS established where the origin then
      // never acknowledged the request (it may have been delivered). From the
      // client side those are indistinguishable, so dispatched is null and the
      // wording offers both readings rather than inviting a blind replay.
      if (res.status === 522) {
        throw new UpstreamError(
          'Cloudflare could not get an answer from the Hiveku origin (HTTP 522, "Connection ' +
          'timed out"). Cloudflare reports 522 both when the connection was never established ' +
          'and when it was established and the origin never acknowledged the request, so ' +
          `whether this reached Hiveku cannot be determined from here. ${retryAdvice(message)}`,
          { kind: 'edge_unreachable', httpStatus: 522, dispatched: null, response_started: false },
        );
      }
      throw new UpstreamError(`Hiveku returned HTTP ${res.status}. ${body.slice(0, 300)}`, {
        kind: 'http',
        httpStatus: res.status,
      });
    }

    // notifications/initialized answers 204 with an empty body. Parsing it
    // would throw on empty input.
    if (res.status === 204) return null;
    // ★ THE REQUEST TIMER IS ALREADY GONE. It was cleared when fetch() settled,
    // and fetch() settles on HEADERS - the body is still streaming. Bound it
    // separately or a stalled body outlives the declared budget by minutes:
    // undici's bodyTimeout is an inter-chunk timer, not a total cap, so a
    // slow-but-steady response never trips it at all. Same controller, so a
    // client cancellation still aborts this read.
    const bodyTimer = setTimeout(() => controller.abort(), BODY_READ_TIMEOUT_MS);
    let text;
    try {
      text = await res.text();
    } catch (err) {
      if (externalSignal?.aborted) {
        throw new UpstreamError(
          'The request to Hiveku was cancelled by this client while its response was arriving ' +
          `(${message?.method || 'request'}). Hiveku answered, so whatever the call did, it did.`,
          { kind: 'cancelled', dispatched: true, response_started: true },
        );
      }
      // ★ DISTINCT FROM THE PRE-HEADERS TIMEOUT ABOVE, and the distinction is
      // the point: Hiveku ANSWERED. The call reached Hiveku and its work ran.
      // Re-reading is safe; re-sending is a second write.
      throw new UpstreamError(
        `Hiveku started answering ${message?.method || 'this request'} but the response was cut off ` +
        `before it finished (${err?.message || err}). The call reached Hiveku and Hiveku began ` +
        `replying. ${retryAdvice(message)}`,
        { kind: 'truncated', dispatched: true, response_started: true },
      );
    } finally {
      clearTimeout(bodyTimer);
    }
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new UpstreamError(`Hiveku returned a response that was not JSON: ${text.slice(0, 200)}`, {
        kind: 'malformed',
      });
    }
  }

  /** Forwards a client message verbatim, handshaking first if needed. */
  async forward(message, externalSignal) {
    if (this.deadReason) throw new UpstreamError(this.deadReason, { kind: 'auth' });
    await this.ensureInitialized();
    debug(`-> ${message?.method} (id=${JSON.stringify(message?.id)})`);
    return this.send(message, this.timeoutFor(message), externalSignal);
  }
}

/**
 * A transport failure, with the facts a caller needs as DATA and not only as
 * prose.
 *
 * `kind` is one of: timeout | cancelled | network | auth | rate_limit |
 * edge_timeout | edge_unreachable | http | truncated | malformed.
 *
 * ★ THREE FIELDS DECIDE WHETHER A RETRY IS SAFE, so they must survive the
 * JSON-RPC boundary rather than being paraphrased into the message:
 *   dispatched       true = written to the socket, false = never left this
 *                    machine, null = this runtime could not tell. NEVER false
 *                    on a read that failed.
 *   response_started true = Hiveku began answering, so its work ran.
 *   timeout_seconds  the budget that actually applied to this call.
 * lib/shim.mjs forwards all three into error.data; adding a field here without
 * adding it there drops it silently.
 */
export class UpstreamError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'UpstreamError';
    Object.assign(this, meta);
  }
}
