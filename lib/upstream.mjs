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
import { HIVEKU_MCP_URL, CLIENT_ID, USER_AGENT, debug } from './util.mjs';

const PROTOCOL_VERSION = '2024-11-05';

/**
 * Per-tool timeouts. The default is generous because Hiveku tools proxy to
 * downstream systems; the override exists because project_files_snapshot really
 * does take minutes on a large site and the VS Code extension learned that the
 * expensive way.
 */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
const PROTOCOL_TIMEOUT_MS = 30_000;
const TOOL_TIMEOUT_OVERRIDES = {
  project_files_snapshot: 180_000,
  project_test_build: 180_000,
  deploy_site: 180_000,
};

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
    return TOOL_TIMEOUT_OVERRIDES[name] || DEFAULT_TOOL_TIMEOUT_MS;
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

    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(message),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        const secs = Math.round(timeoutMs / 1000);
        throw new UpstreamError(
          `Hiveku did not respond within ${secs}s (${message?.method || 'request'}).`,
          { kind: 'timeout' },
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
      throw new UpstreamError(
        `Could not reach Hiveku: ${err?.message || err}${code ? ` (${code})` : ''}${causeMsg}. ` +
        'This request came from the Hiveku bridge process itself (its network is separate from ' +
        'the Bash sandbox), so the bridge genuinely could not reach core.hiveku.com: check ' +
        'connectivity, VPN/proxy, or whether a machine-level policy blocks this process.',
        { kind: 'network', code },
      );
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
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
      throw new UpstreamError(`Hiveku returned HTTP ${res.status}. ${body.slice(0, 300)}`, {
        kind: 'http',
        httpStatus: res.status,
      });
    }

    // notifications/initialized answers 204 with an empty body. Parsing it
    // would throw on empty input.
    if (res.status === 204) return null;
    const text = await res.text();
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

export class UpstreamError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'UpstreamError';
    Object.assign(this, meta);
  }
}
