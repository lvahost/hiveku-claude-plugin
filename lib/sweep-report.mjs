/**
 * What a tool sweep writes to its report (HK-1800, 2026-11-15).
 *
 * The sweep keeps each tool's whole answer as `raw`, because its --resolve
 * step reads ids out of a listing. The report must not carry it: a sweep on
 * 2026-09-11 wrote memory_list's whole answer into a report in the account's
 * folder, and that answer held a tool's key in plain text. The report keeps
 * each tool's verdict and its short `detail`, with anything shaped like a
 * key or a token masked down to its first characters.
 */

/**
 * Key and token shapes a tool's answer can carry: Hiveku keys, a provider's secret key, a JWT, a bearer header, and
 * (review) Stripe's secret, restricted and webhook keys, an AWS access key id, GitHub's and Slack's tokens and a Google
 * API key.
 */
const SECRET_SHAPES = [
  /\b(?:hvk|olp|gwk)_[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bwhsec_[A-Za-z0-9]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}/g,
];

/** How much of a secret stays readable: enough to tell which one it was, never enough to use. */
const KEEP = 8;

/** The text with every key-shaped run cut to its first characters. */
export function maskSecrets(text) {
  let out = text;
  for (const shape of SECRET_SHAPES) out = out.replace(shape, (hit) => `${hit.slice(0, KEEP)}...[masked]`);
  return out;
}

/** The rows the report writes: each result without its whole answer, and with its detail masked. */
export function reportRows(results) {
  return results.map(({ raw: _raw, ...row }) => (typeof row.detail === 'string' ? { ...row, detail: maskSecrets(row.detail) } : row));
}

/** One failure as the sweep prints it to the console: its tool and its detail, masked as the report's is. */
export function failureLine(result) {
  const detail = typeof result.detail === 'string' ? maskSecrets(result.detail) : result.detail;
  return `    ${result.tool.padEnd(46)} ${detail}`;
}
