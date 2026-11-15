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

/** Key and token shapes a tool's answer can carry: Hiveku keys, a provider's secret key, a JWT, a bearer header. */
const SECRET_SHAPES = [
  /\b(?:hvk|olp|gwk)_[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
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
