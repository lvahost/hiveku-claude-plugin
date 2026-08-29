/**
 * Browser consent over a loopback listener — the pattern `gh auth login` uses.
 *
 * Nothing is pasted, so the authorization code never enters a clipboard or a
 * shell history file. The listener binds 127.0.0.1 on an OS-assigned port,
 * accepts exactly one callback, and shuts down.
 *
 * PKCE matters more here than it would for a custom URI scheme: the code
 * travels through the system browser, so it lands in history, in any local
 * proxy's logs, and within reach of any process that wins the port race. With a
 * verifier that never leaves this process, a captured code is inert.
 */
import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { HIVEKU_APP_URL, USER_AGENT } from './util.mjs';

const CALLBACK_PATH = '/callback';
/**
 * How long the local listener waits for the browser round trip. 10 minutes,
 * matching the consent page's own allowance for slow sign-ins (WebAuthn, 2FA,
 * picking through a large account roster). This clock covers the whole human
 * part; the authorization CODE's 2-minute TTL only starts at the moment they
 * click Connect, so a slow sign-in costs nothing. Waiting long is safe — the
 * listener accepts only a state-matching callback on 127.0.0.1.
 */
const LISTEN_TIMEOUT_MS = 600_000;
/** The consent page's `connected` param must not blow past nginx's request-line
 *  limit; the extension hit an 8KB ceiling with a 350-account roster. */
const MAX_CONNECTED_PARAM_CHARS = 1500;

/**
 * Is this Host header a loopback address on OUR ephemeral port?
 *
 * Exported so the allowlist is testable one attack shape at a time, the way the
 * builder's redirect classifier is. Match on the EXACT host:port string, never a
 * prefix or substring: `localhost.evil.tld:PORT` contains "localhost" and
 * `evil.tld:PORT` ends with the port, and both must fail.
 */
export function isLoopbackHost(host, port) {
  if (typeof host !== 'string' || !host) return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}` || h === `[::1]:${port}`;
}

export function makePkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time compare that tolerates length mismatch without throwing. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export function buildConnectedParam(accountIds) {
  const out = [];
  let budget = MAX_CONNECTED_PARAM_CHARS;
  for (const id of accountIds) {
    const cost = id.length + 3; // id + separator, encoded
    if (cost > budget) break;
    out.push(id);
    budget -= cost;
  }
  return out;
}

function openBrowser(url) {
  try {
    let child;
    if (process.platform === 'win32') {
      // `start` is a cmd builtin, not an executable. Its first quoted arg is the
      // window TITLE, so the URL needs an empty title ('') before it or the URL
      // becomes the title and nothing opens. And cmd treats '&' as a command
      // separator, so the query string's '&' must be escaped as '^&' or the URL
      // is truncated at the first parameter. windowsVerbatimArguments stops Node
      // from re-quoting and undoing the escape.
      child = spawn('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')], {
        stdio: 'ignore',
        detached: true,
        windowsVerbatimArguments: true,
      });
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
    }
    child.unref();
    return true;
  } catch {
    return false;
  }
}

const SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Hiveku connected</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.c{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;max-width:420px;text-align:center}
h1{font-size:1.1rem;margin:0 0 .5rem;color:#fff}p{font-size:.875rem;color:#94a3b8;margin:0;line-height:1.5}</style>
</head><body><div class="c"><h1>Connected to Hiveku</h1>
<p>You can close this tab and return to your terminal.</p></div></body></html>`;

const FAILURE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Hiveku</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f87171;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.c{background:#1e293b;border:1px solid #7f1d1d;border-radius:12px;padding:2rem;max-width:420px;text-align:center}</style>
</head><body><div class="c"><h1>Could not complete the connection</h1>
<p>Return to your terminal for details.</p></div></body></html>`;

/**
 * Runs the consent round trip and returns the exchange payload.
 * Throws with a message meant to be shown to the user verbatim.
 */
/**
 * The command a user can paste into their own terminal.
 *
 * ★ `hiveku` is NOT on PATH for a plugin install — it lives under
 * ~/.claude/plugins/cache/hiveku/hiveku/<version>/bin/hiveku, which is why the
 * transcript that hit this showed a 70-character path. Telling someone to run
 * "hiveku connect" when that is command-not-found is a second dead end, so
 * quote the binary this process was actually launched from.
 */
function selfCommand() {
  const self = process.argv[1];
  if (!self) return 'hiveku';
  return /[\s]/.test(self) ? `"${self}"` : self;
}

export async function runLoopbackConsent({ appUrl = HIVEKU_APP_URL, alreadyConnected = [], onUrl } = {}) {
  const state = randomBytes(32).toString('hex');
  const { verifier, challenge } = makePkcePair();

  const server = http.createServer();
  // 127.0.0.1 explicitly, never 0.0.0.0: binding all interfaces would expose the
  // authorization code to anything on the local network.
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  }).catch((e) => {
    // ★ A SANDBOXED SESSION CANNOT BIND A LOOPBACK PORT, and the raw error says
    // only `listen EPERM: operation not permitted 127.0.0.1`, which reads as a
    // broken install. It is not: the consent round trip needs a local listener
    // to catch the browser redirect, and Claude Desktop's sandbox forbids
    // listening. "Bypass permissions" does not lift it — that governs tool
    // approval, not the sandbox's network policy.
    //
    // Fail with the two paths that actually work rather than the errno.
    if (['EPERM', 'EACCES', 'EADDRNOTAVAIL'].includes(e?.code)) {
      const err = new Error(
        'Cannot complete the browser consent flow here: this session is sandboxed and is not ' +
          'allowed to open a local callback port, which the redirect needs. This is not a broken ' +
          'install and re-running will not help.\n\n' +
          'Either of these works:\n' +
          '  1. Run the SAME command in your own terminal (outside Claude), then come back — one ' +
          'run grants every account you tick, and the keys land where this session reads them:\n' +
          `       ${selfCommand()} connect\n` +
          '  2. Per account, create a key at app.hiveku.com > Settings > LLM Connectors and run:\n' +
          `       ${selfCommand()} accounts add <key>\n\n` +
          'Prefer (1) when connecting more than one account — (2) is one key at a time.',
      );
      err.code = 'ELOOPBACKBLOCKED';
      throw err;
    }
    throw e;
  });

  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const url = new URL('/connect/cli', appUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect', redirectUri);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  const connected = buildConnectedParam(alreadyConnected);
  if (connected.length) url.searchParams.set('connected', connected.join(','));

  const consentUrl = url.toString();
  if (onUrl) onUrl(consentUrl);

  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out after 10 minutes waiting for the browser. Run /hiveku:connect again.'));
    }, LISTEN_TIMEOUT_MS);

    server.on('request', (req, res) => {
      const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }

      // Anti-DNS-rebinding: a page on another origin can reach a loopback port,
      // but it cannot forge the Host header a real redirect carries. An attacker
      // page at evil.tld whose DNS answers 127.0.0.1 still sends
      // `Host: evil.tld:<port>`, which is what this rejects.
      //
      // Accept every spelling of loopback on OUR port, not just the literal we
      // put in the redirect. We ask for http://127.0.0.1:<port>/callback, but the
      // request can legitimately arrive as `localhost:<port>`: the browser, an
      // extension, or a local proxy may rewrite the host on the way, and the
      // consent server now issues localhost redirects too. Pinning to the single
      // literal turned a completed consent into "Bad host" at the last step,
      // after the user had already approved and a real code had been minted.
      //
      // This does not widen the rebinding defence: the names below all mean this
      // machine, the PORT still has to match the ephemeral one we just bound, and
      // the state check plus PKCE below carry the rest.
      const host = req.headers.host || '';
      if (!isLoopbackHost(host, port)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
          .end(`Bad host: ${host || '(none)'}. Expected loopback on port ${port}.`);
        return;
      }

      const returnedState = reqUrl.searchParams.get('state');
      const code = reqUrl.searchParams.get('code');
      const finish = (ok, err) => {
        res.writeHead(ok ? 200 : 400, {
          'Content-Type': 'text/html; charset=utf-8',
          // The query string holds the code; do not let it leak onward.
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
        });
        res.end(ok ? SUCCESS_HTML : FAILURE_HTML);
        clearTimeout(timer);
        server.close();
        if (ok) resolve(code);
        else reject(new Error(err));
      };

      if (!code) return finish(false, 'The browser came back without an authorization code.');
      if (!safeEqual(returnedState, state)) {
        return finish(false, 'The browser came back with a state value we did not issue. Nothing was connected.');
      }
      finish(true);
    });
  });

  if (!openBrowser(consentUrl)) {
    // Not fatal: on SSH or a headless box the user opens it themselves.
    process.stderr.write('hiveku: could not open a browser automatically.\n');
  }

  let code;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

  return exchangeCode({ appUrl, code, verifier });
}

/**
 * Revoke a key server-side using itself as the credential. Idempotent: a key
 * that is already dead counts as revoked.
 */
export async function revokeSelf(key, appUrl = HIVEKU_APP_URL) {
  try {
    const res = await fetch(new URL('/api/account/mcp-keys/revoke-self', appUrl).toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json().catch(() => null);
    if (body?.revoked === true) return { ok: true };
    if (body?.reason === 'not_found_or_inactive') return { ok: true };
    return { ok: false, reason: body?.reason || 'server did not confirm revocation' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Which of THIS DEVICE's previous keys a fresh connect replaced. The exchange
 * always mints (reuse meant returning stored plaintext), so a re-connect that
 * includes already-connected accounts re-keys them — without this, every
 * re-connect leaves the old key alive server-side and an agency re-connecting
 * a 400-account roster strews hundreds of live orphans. Only keys this device
 * actually held are candidates: other devices' keys are not ours to revoke.
 */
export function keysToRotate(priorAccounts, incoming) {
  const out = [];
  for (const acct of incoming) {
    const prior = priorAccounts?.[acct.account_id];
    if (prior?.key && prior.key !== acct.key) {
      out.push({ account_id: acct.account_id, label: prior.label || acct.account_id, oldKey: prior.key });
    }
  }
  return out;
}

export async function exchangeCode({ appUrl = HIVEKU_APP_URL, code, verifier }) {
  const res = await fetch(new URL('/api/connect/vscode/exchange', appUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ code, code_verifier: verifier }),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) detail = parsed.error;
    } catch {
      /* keep the raw text */
    }
    throw new Error(`Hiveku rejected the connection (HTTP ${res.status}): ${detail}`);
  }

  const payload = JSON.parse(text);
  if (!Array.isArray(payload.accounts) || payload.accounts.length === 0) {
    throw new Error('Hiveku returned no accounts. Nothing was connected.');
  }
  return payload;
}
