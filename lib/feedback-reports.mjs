/**
 * `hiveku reports` - the Agent Feedback reports (problems and feature
 * requests) of EVERY connected account, for someone who runs several client
 * accounts and wants one view of what was reported, where each one stands,
 * and which answers are waiting to be passed on.
 *
 * READ-ONLY BY CONSTRUCTION, like `hiveku fleet`: one hiveku_feedback_status
 * call per stored account, with THAT account's own key; keys are never mixed.
 * It never acknowledges or follows up. An answer is passed on (and
 * acknowledged) inside that account's folder, where the binding pins the
 * tenant and the session can walk the user through any steps.
 */

export const REPORTS_TOOL = 'hiveku_feedback_status';
const MAX_PER_ACCOUNT = 50;

const clip = (value, max) => String(value ?? '').slice(0, max);

/** The feedback list out of one tool result, or null when it cannot be read. */
export function readFeedbackList(res) {
  if (res?.result?.isError) return null;
  const text = res?.result?.content?.[0]?.text;
  if (typeof text !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  let body = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
  if (Array.isArray(body)) body = body[0];
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) return null;
  return body;
}

/**
 * One row per account. A read that failed leaves `reports: null` with the
 * error, which is UNKNOWN and never "no reports".
 *
 * `makeUpstream({ key, accountId, label })` returns something with
 * `forward(jsonrpcRequest)`: the real Upstream in the CLI, a fake in tests.
 */
export async function collectReports(accounts, makeUpstream) {
  const rows = [];
  for (const [accountId, account] of Object.entries(accounts || {})) {
    const row = { account_id: accountId, label: account?.label ?? null, needs_attention_count: null, reports: null };
    try {
      const upstream = makeUpstream({ key: account.key, accountId, label: account.label });
      const res = await upstream.forward({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: REPORTS_TOOL, arguments: { limit: MAX_PER_ACCOUNT } },
      });
      const list = readFeedbackList(res);
      if (!list) {
        row.error = clip(res?.result?.content?.[0]?.text || 'unexpected response shape', 140);
      } else {
        row.needs_attention_count = Number(list.needs_attention_count) || 0;
        row.reports = list.items.map((item) => ({
          ref: clip(item?.ref, 20),
          kind: clip(item?.kind, 20),
          status: clip(item?.status, 30),
          status_label: clip(item?.status_label || item?.status, 60),
          title: clip(item?.public_title || item?.title, 160),
          needs_attention: item?.needs_attention === true,
          updated_at: clip(item?.updated_at, 40),
        }));
      }
    } catch (err) {
      row.error = clip(err?.message || err, 140);
    }
    rows.push(row);
  }
  return rows;
}

/** Plain text: accounts with an answer waiting first, then the rest. */
export function formatReports(rows) {
  const order = (row) => (row.reports === null ? 1 : row.needs_attention_count > 0 ? 0 : 2);
  const lines = [];
  for (const row of [...rows].sort((a, b) => order(a) - order(b))) {
    const name = `${row.label || 'Unnamed account'} (${String(row.account_id).slice(0, 8)})`;
    if (row.reports === null) {
      lines.push(`${name}: UNKNOWN - ${row.error || 'the reports could not be read'}`);
      continue;
    }
    if (row.reports.length === 0) {
      lines.push(`${name}: no reports`);
      continue;
    }
    const waiting = row.needs_attention_count > 0 ? `, ${row.needs_attention_count} with an answer to pass on` : '';
    lines.push(`${name}: ${row.reports.length} report${row.reports.length === 1 ? '' : 's'}${waiting}`);
    for (const r of row.reports) {
      const kind = r.kind === 'feature' ? 'feature' : 'problem';
      lines.push(`  ${r.needs_attention ? 'ANSWER' : '      '}  ${r.ref.padEnd(7)} ${kind.padEnd(8)} ${r.status_label.padEnd(16)} ${r.title}`);
    }
  }
  return lines.join('\n') + '\n';
}
