/**
 * `hiveku reports` - the Agent Feedback reports (problems and feature
 * requests) of EVERY connected account, for someone who runs several client
 * accounts and wants one view of what was reported, who filed it, where each
 * one stands, how it closed, and which answers are waiting to be passed on.
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
/** A field an older server leaves out, or an open ticket has no value for: null, never "". */
const clipOrNull = (value, max) => (value == null || value === '' ? null : clip(value, max));

export const FILER_TYPES = ['person', 'assistant', 'department_agent'];
const FILER_WORDS = { person: "a person's key", assistant: 'an assistant session', department_agent: 'a department agent' };

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
 * Who filed it, as the server sends it (HK-323): the account, the filer type
 * and the filer's name (a key's name, a department agent's name or the
 * client's name). Built by the server from its own records, never from a
 * report's text.
 */
function readFiledBy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    account_id: clipOrNull(raw.account_id, 40),
    account_label: clipOrNull(raw.account_label, 120),
    filer_type: FILER_TYPES.includes(raw.filer_type) ? raw.filer_type : null,
    filer_name: clipOrNull(raw.filer_name, 100),
    via: clipOrNull(raw.via, 60),
  };
}

/** The ticket's page; only an https link is kept. */
function readTicketUrl(raw) {
  const url = clipOrNull(raw, 200);
  return url && url.startsWith('https://') ? url : null;
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
          filed_by: readFiledBy(item?.filed_by),
          closed_at: clipOrNull(item?.closed_at, 40),
          resolution_kind: clipOrNull(item?.resolution_kind, 30),
          resolution_label: clipOrNull(item?.resolution_label, 60),
          answer_text: clipOrNull(item?.answer_text, 2000),
          ticket_url: readTicketUrl(item?.ticket_url),
        }));
      }
    } catch (err) {
      row.error = clip(err?.message || err, 140);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The connected accounts that --account names: its id, the first 8 or more
 * characters of the id (as the text view prints it), or part of its name,
 * in any case.
 */
export function pickAccounts(accounts, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { ...(accounts || {}) };
  return Object.fromEntries(Object.entries(accounts || {}).filter(([id, account]) => {
    const lowerId = id.toLowerCase();
    return lowerId === q || (q.length >= 8 && lowerId.startsWith(q)) || String(account?.label ?? '').toLowerCase().includes(q);
  }));
}

/** --closed-since: a real day like 2026-10-01 (from midnight UTC) as epoch ms, or null. */
export function parseClosedSinceDay(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

/** What an account shows under a filter when its server does not say who filed or when a ticket closed. */
export const FILTER_UNKNOWN_ERROR = 'cannot filter: this account\'s server does not say yet who filed each ticket or when it closed';

/**
 * The --filer and --closed-since filters, over what was read.
 * filer: a filer type (person, assistant, department_agent) or part of the
 * filer's name, in any case. closedSinceMs: only tickets closed at or after it.
 * An account whose read failed stays UNKNOWN, and so does one whose server
 * sends no filing fields (none of its reports has filed_by), since a filter
 * there would drop every report and read as "nothing matched". A filtered
 * account is marked `filtered: true`, and its waiting count is the count of
 * the reports that are left.
 */
export function filterReports(rows, { filer, closedSinceMs } = {}) {
  const who = String(filer ?? '').trim().toLowerCase();
  const since = typeof closedSinceMs === 'number' ? closedSinceMs : null;
  if (!who && since === null) return rows;
  const keep = (r) => {
    if (who) {
      const type = r.filed_by?.filer_type ?? '';
      const name = String(r.filed_by?.filer_name ?? '').toLowerCase();
      if (type !== who && !name.includes(who)) return false;
    }
    if (since !== null) {
      const closed = Date.parse(r.closed_at ?? '');
      if (!Number.isFinite(closed) || closed < since) return false;
    }
    return true;
  };
  return rows.map((row) => {
    if (row.reports === null) return row;
    if (row.reports.length > 0 && row.reports.every((r) => r.filed_by === null)) {
      return { ...row, reports: null, needs_attention_count: null, error: FILTER_UNKNOWN_ERROR };
    }
    const reports = row.reports.filter(keep);
    return { ...row, filtered: true, reports, needs_attention_count: reports.filter((r) => r.needs_attention).length };
  });
}

/** Text an account member chose (a title, a key name) on one line: no line breaks or control characters. */
const oneLine = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ');

/** "filed by Sales agent; closed 2026-10-03: Fixed", or '' when the server sent neither. */
function detailLine(r) {
  const parts = [];
  const who = r.filed_by?.filer_name || FILER_WORDS[r.filed_by?.filer_type];
  if (who) parts.push(`filed by ${who}${r.filed_by?.via && r.filed_by.via !== who ? ` (${r.filed_by.via})` : ''}`);
  if (r.closed_at) parts.push(`closed ${r.closed_at.slice(0, 10)}${r.resolution_label ? `: ${r.resolution_label}` : ''}`);
  return parts.join('; ');
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
      lines.push(`${name}: ${row.filtered ? 'no matching reports' : 'no reports'}`);
      continue;
    }
    const waiting = row.needs_attention_count > 0 ? `, ${row.needs_attention_count} with an answer to pass on` : '';
    const noun = `${row.filtered ? 'matching ' : ''}report${row.reports.length === 1 ? '' : 's'}`;
    lines.push(`${name}: ${row.reports.length} ${noun}${waiting}`);
    for (const r of row.reports) {
      const kind = r.kind === 'feature' ? 'feature' : 'problem';
      lines.push(`  ${r.needs_attention ? 'ANSWER' : '      '}  ${r.ref.padEnd(7)} ${kind.padEnd(8)} ${r.status_label.padEnd(16)} ${oneLine(r.title)}`);
      const detail = oneLine(detailLine(r));
      if (detail) lines.push(`${' '.repeat(18)}${detail}`);
    }
  }
  return lines.join('\n') + '\n';
}
