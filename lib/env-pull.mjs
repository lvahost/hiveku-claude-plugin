/**
 * `hiveku env pull`: one tier of a site's variables into a local env file,
 * through project_secrets_reveal (plan B3), never project_secrets_list.
 *
 * WHY THE REVEAL. Abe, 2026-10-06: agents read secret values only for
 * non-sensitive keys, through a reveal that asks every time and is logged.
 * project_secrets_list stops returning values at the cutover (it answers
 * values_moved without metadata_only), and the reveal is the one path that
 * returns them: the values the tier runs with, never a sensitive key, never a
 * platform credential, nothing at all when the flags cannot be read.
 *
 * WHO APPROVES. This CLI sends the plugin's bare name in X-Hiveku-Client, not
 * the <client>/<version> declaration the MCP bridge sends (lib/upstream.mjs):
 * the model runs it through Bash, where the plugin cannot show that a person
 * was asked. So every pull takes the dashboard approval. The first call
 * answers approval_required with a one-time link; the person opens it and
 * approves; this CLI repeats the same call with the token every 5 seconds for
 * up to 10 minutes. A poll while nobody has decided answers approval_pending
 * and does not spend the site's reveals (the builder's revealApprovalPending).
 *
 * THE FILE.
 *   - Written only when at least one value came back. An empty answer never
 *     replaces an existing file (the old pull wrote `body.secrets || {}`).
 *   - Mode 0600 even over an existing file: written to a new file created
 *     0600 and renamed over the target, so the mode is the new file's, not
 *     the old one's (writeFile's mode applies only when it creates).
 *   - Values are written so the dotenv loaders Next.js, Vite and Expo use read
 *     them back exactly (encodeEnvValue): a multi-line value is quoted, and a
 *     `$` is escaped so it is not expanded into another variable.
 *   - Withheld names are listed as comments with the reason, never a value,
 *     so a missing variable is visible instead of a mystery.
 *   - Only names reach stdout, never a value.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const REVEAL_TOOL = 'project_secrets_reveal';

/** The tiers a reveal reads, by the names a person types. */
const TIER_NAMES = {
  development: 'development',
  dev: 'development',
  preview: 'preview',
  staging: 'staging',
  production: 'production',
  prod: 'production',
};
export const DEFAULT_TIER = 'development';

/** How often the CLI asks again while a person decides, and for how long. */
export const APPROVAL_POLL_MS = 5_000;
export const APPROVAL_WAIT_MS = 10 * 60_000;
/** Polls that fail in a row (network, 5xx) before the wait gives up. */
const MAX_POLL_FAILURES = 3;

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EnvPullError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EnvPullError';
    this.code = code;
  }
}

/** The tier a pull reads: development unless one is named. */
export function envTierFrom(raw) {
  if (raw === undefined || raw === true || raw === '') return DEFAULT_TIER;
  const tier = TIER_NAMES[String(raw).trim().toLowerCase()];
  if (!tier) {
    throw new EnvPullError('bad_tier', `Unknown tier "${String(raw).slice(0, 40)}". Use development (the default), preview, staging or production.`);
  }
  return tier;
}

/** Which file a tier's values go to (Next.js loads .env.production.local only for production builds). */
export function envFileForTier(tier) {
  if (tier === 'production') return '.env.production.local';
  if (tier === 'staging') return '.env.staging.local';
  return '.env.local';
}

/** An approval token from the command line: refused unless it has the token's shape. */
export function approvalTokenFrom(raw) {
  if (raw === undefined) return undefined;
  const token = String(raw).trim();
  if (!TOKEN_RE.test(token)) throw new EnvPullError('bad_token', 'That is not an approval token. Use the token the first run printed.');
  return token;
}

/** One line of server text for a comment or the terminal: no line breaks or control characters. */
function oneLine(text, max = 300) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * What one tools/call of project_secrets_reveal answered:
 *   { kind: 'values', values, withheld, notApproved, tier }
 *   { kind: 'approval_required', approval, withheld }
 *   { kind: 'pending' }
 *   { kind: 'refused', code, message }
 * The MCP proxy returns a builder error as a tool result
 * { error, status, details: { code, message } }, with isError set.
 */
export function readRevealAnswer(res) {
  if (res?.error) {
    return { kind: 'refused', code: 'rpc_error', message: oneLine(res.error.message || 'The Hiveku server refused the call.') };
  }
  const text = res?.result?.content?.[0]?.text;
  let body = null;
  try {
    body = typeof text === 'string' ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  body = asObject(body);
  if (!body) return { kind: 'refused', code: 'unreadable_answer', message: 'The reveal answered with something that is not JSON.' };

  const failed = res?.result?.isError === true || (typeof body.error === 'string' && typeof body.status === 'number' && body.status >= 400);
  if (failed) {
    const details = asObject(body.details) ?? body;
    const code = String(details.code || body.code || details.error || body.error || 'refused');
    if (code === 'approval_pending') return { kind: 'pending' };
    return { kind: 'refused', code, message: oneLine(details.message || body.message || body.error || 'The reveal was refused.') };
  }

  const data = asObject(body.data) && !('values' in body) && !('code' in body) ? body.data : body;
  const withheld = Array.isArray(data.withheld) ? data.withheld.filter((w) => asObject(w) && typeof w.key === 'string') : [];
  if (data.code === 'approval_required') {
    const approval = asObject(data.approval);
    // The link and the token are printed for the person, so both must be plain: an https link with
    // no spaces or control characters, and a token of the token's own shape.
    if (!approval || !TOKEN_RE.test(String(approval.token)) || !/^https:\/\/[^\s\u0000-\u001f\u007f]+$/.test(String(approval.approve_url))) {
      return { kind: 'refused', code: 'unexpected_answer', message: 'The reveal asked for an approval without a usable link.' };
    }
    return { kind: 'approval_required', approval, withheld };
  }
  const values = asObject(data.values);
  if (values) {
    const clean = {};
    for (const [key, value] of Object.entries(values)) if (typeof value === 'string') clean[key] = value;
    const notApproved = Array.isArray(data.not_approved) ? data.not_approved.filter((k) => typeof k === 'string') : [];
    return { kind: 'values', values: clean, withheld, notApproved, tier: data.tier };
  }
  return { kind: 'refused', code: 'unexpected_answer', message: 'The reveal answered in a shape this version does not read. Update the plugin.' };
}

/** A refusal as one sentence for the terminal. */
function refusalText(answer) {
  const byCode = {
    approval_declined: 'A person declined the request. Nothing was written.',
    approval_used: 'That approval was already used. Run the pull again to ask once more.',
    approval_unknown: 'That approval is unknown or its 10 minutes ran out. Run the pull again to ask once more.',
    approval_mismatch: 'That approval was for another tier or another key. Run the pull again without --approval-token.',
    reveal_rate_limited: 'This site\'s values were revealed 20 times in the last hour, the most allowed. Try again later.',
    reveal_requests_rate_limited: '20 approvals were asked for this site in the last hour, the most allowed. Try again later.',
    scope_denied: 'This folder\'s key is read-only, and revealing values needs a full key.',
  };
  return byCode[answer.code] || `${answer.message || 'The reveal was refused.'} (${answer.code})`;
}

/**
 * Reveal one tier's values, waiting for a person's approval when the server
 * asks for one. `call(args)` sends one project_secrets_reveal and returns the
 * JSON-RPC answer. With `approvalToken` it resumes a wait a first run started
 * (no new request is made). `onApprovalRequired(approval)` is told the link
 * once, before the wait; with `wait: false` the pull stops there and throws
 * approval_waiting (the token is in the error's `approval`).
 */
export async function revealTier({
  call,
  projectId,
  tier,
  approvalToken,
  wait = true,
  onApprovalRequired,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  pollMs = APPROVAL_POLL_MS,
  waitMs = APPROVAL_WAIT_MS,
}) {
  const args = { project_id: projectId, tier };
  let answer;
  let token = approvalToken;
  if (token) {
    answer = readRevealAnswer(await call({ ...args, approval_token: token }));
  } else {
    answer = readRevealAnswer(await call(args));
    if (answer.kind === 'approval_required') {
      token = answer.approval.token;
      await onApprovalRequired?.(answer.approval, answer.withheld);
      if (!wait) {
        const err = new EnvPullError('approval_waiting', 'Waiting for a person to approve. Run the pull again with --approval-token once they have.');
        err.approval = answer.approval;
        throw err;
      }
      answer = { kind: 'pending' };
    }
  }
  if (answer.kind === 'pending') {
    // Only a call that carries a token can be pending; without one, a repeat would
    // ask a person again on every poll.
    if (!token) throw new EnvPullError('unexpected_answer', 'The reveal said it is waiting for an approval it never asked for. Pull again.');
    const deadline = now() + waitMs;
    let failures = 0;
    while (answer.kind === 'pending') {
      if (now() >= deadline) {
        throw new EnvPullError('approval_timeout', 'Nobody approved within 10 minutes, so nothing was written. Run the pull again to ask once more.');
      }
      await sleep(pollMs);
      try {
        answer = readRevealAnswer(await call({ ...args, approval_token: token }));
        failures = 0;
      } catch (err) {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) throw err;
        answer = { kind: 'pending' };
      }
    }
  }
  if (answer.kind === 'values') return answer;
  if (answer.kind === 'approval_required') {
    throw new EnvPullError('unexpected_answer', 'The reveal asked for a new approval in the middle of a wait. Run the pull again.');
  }
  throw new EnvPullError(answer.code || 'refused', refusalText(answer));
}

/**
 * A value in the form the dotenv loaders read back exactly (dotenv parse plus
 * dotenv-expand, as Next.js 15, Vite and Expo load .env files), or null when
 * no form does:
 *   - nothing to quote or expand: written bare;
 *   - otherwise in single quotes, which dotenv keeps literally (line breaks
 *     included), with every `$` written `\$` so it is not expanded into
 *     another variable;
 *   - a value with a single quote goes in backticks the same way;
 *   - null for a value with both, with a carriage return or NUL (dotenv turns
 *     CR into LF), or ending in a backslash (dotenv reads `\'` as a quote
 *     inside the value and runs on to the next line).
 */
export function encodeEnvValue(value) {
  const v = String(value);
  if (v === '') return '';
  if (/[\r\0]/.test(v) || v.endsWith('\\')) return null;
  if (/^[A-Za-z0-9_\-.,:/@+%~^=]+$/.test(v)) return v;
  const escaped = v.replace(/\$/g, '\\$');
  if (!v.includes("'")) return `'${escaped}'`;
  if (!v.includes('`')) return `\`${escaped}\``;
  return null;
}

/**
 * The env file's text: the values, sorted, then what was not included and
 * why, as comments. Returns the names written and the names left out.
 */
export function renderEnvFile({ values, withheld = [], notApproved = [], tier, file }) {
  const written = [];
  const unwritable = [];
  const lines = [
    `# Written by \`hiveku env pull\` from Hiveku: this site's ${tier} values, revealed with a person's approval.`,
    `# ${file} holds real values: keep it out of git and never paste it anywhere.`,
  ];
  for (const key of Object.keys(values).sort()) {
    if (!KEY_RE.test(key)) {
      unwritable.push({ key: oneLine(key, 80), why: 'not a variable name a .env file can hold' });
      continue;
    }
    const encoded = encodeEnvValue(values[key]);
    if (encoded === null) {
      unwritable.push({ key, why: 'its value cannot be written to a .env file exactly (set it by hand)' });
      continue;
    }
    lines.push(`${key}=${encoded}`);
    written.push(key);
  }
  const notes = [
    ...withheld.map((w) => ({ key: oneLine(w.key, 80), why: oneLine(w.why || w.reason || 'withheld') })),
    ...notApproved.map((key) => ({ key: oneLine(key, 80), why: 'added after the person approved; pull again to include it' })),
    ...unwritable,
  ];
  if (notes.length) {
    lines.push('', '# Not included (their values are never shown; set them by hand if local dev needs them):');
    for (const note of notes) lines.push(`# ${note.key}: ${note.why}`);
  }
  lines.push('');
  return { text: lines.join('\n'), written, notes };
}

/**
 * Write `text` to `target` with mode 0600, also over an existing file: a new
 * file is created 0600 beside it and renamed over it.
 */
export async function writeEnvFileSecure(target, text) {
  const dir = path.dirname(target);
  const temp = path.join(dir, `.${path.basename(target)}.${randomUUID()}.tmp`);
  const handle = await fs.open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(text, 'utf8');
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temp, target);
  } catch (err) {
    await fs.unlink(temp).catch(() => {});
    throw err;
  }
}

/** Add `file` to the folder's .gitignore unless a line there already covers it. */
export async function ensureGitignored(dir, file) {
  const gi = path.join(dir, '.gitignore');
  let text = '';
  try {
    text = await fs.readFile(gi, 'utf8');
  } catch {
    /* no .gitignore yet */
  }
  const covered = text.split(/\r?\n/).some((line) => {
    const rule = line.trim();
    return rule === file || rule === `/${file}` || rule === '.env*' || rule === '*.local' || rule === '.env*.local';
  });
  if (covered) return false;
  const prefix = text && !text.endsWith('\n') ? '\n' : '';
  await fs.writeFile(gi, `${text}${prefix}${file}\n`, 'utf8');
  return true;
}
