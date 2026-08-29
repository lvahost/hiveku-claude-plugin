/**
 * Shared text utilities for the eval checkers. No dependencies - Node 20+.
 */

// ── Fenced blocks ───────────────────────────────────────────────────────────
// The report contract (see evals/README.md) is that verbatim exhibits - a
// proposed send-text, a quoted customer message - live inside ``` fences.
// Both checkers strip fences first: a fence is an exhibit, not a claim, so it
// is exempt from both the trace test and the restatement test. Prose outside
// fences gets no such exemption.
export function stripFences(text) {
  return text.replace(/```[\s\S]*?```/g, '\n');
}

export function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function sentences(text) {
  const cleaned = text.replace(/[#*_`>|]+/g, ' ');
  return cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shingleSet(tokens, n) {
  const out = new Set();
  for (let i = 0; i + n <= tokens.length; i += 1) out.add(tokens.slice(i, i + n).join(' '));
  return out;
}

// ── Numbers ─────────────────────────────────────────────────────────────────
export function canonicalNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

const NUM_RE = /\$?\d[\d,]*(?:\.\d+)?%?/g;

/**
 * Extract checkable numbers from report text, line by line.
 *
 * Deliberately skipped (they are structure, not claims):
 *   - identifier fragments and date/time/version fragments, via the
 *     neighbouring-character rule (bill_1042, MOS-2214, 2026-08-28, 09:12,
 *     2.1.114) - anything glued to [A-Za-z0-9_/:-] on either side;
 *   - bare four-digit years 1900-2100;
 *   - small bare integers below `ignoreBelow` (default 13) - step numbers,
 *     "2 flags", "7 days" - too ambiguous to trace and rarely the fabrication
 *     that matters. Dollar amounts, percentages, and decimals are ALWAYS
 *     checked regardless of size.
 *
 * Each extracted number carries the candidate `forms` under which a tool
 * result may have supplied it: the value itself; cents (x100) when it reads
 * as dollars; x100 and /100 for integers (the dollars<->cents bridge both
 * ways); /100 for percentages. This is deliberately generous - the checker
 * exists to catch numbers with NO plausible provenance, not to relitigate
 * formatting.
 */
export function extractNumbers(text, { ignoreBelow = 13 } = {}) {
  const found = [];
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    NUM_RE.lastIndex = 0;
    let m;
    while ((m = NUM_RE.exec(line)) !== null) {
      const raw = m[0];
      const before = m.index > 0 ? line[m.index - 1] : '';
      const afterIdx = m.index + raw.length;
      const after = afterIdx < line.length ? line[afterIdx] : '';
      if (/[A-Za-z0-9_/:-]/.test(before) || before === '.') continue;
      if (/[A-Za-z0-9_/:-]/.test(after)) continue;
      if (after === '.' && /\d/.test(line[afterIdx + 1] || '')) continue;

      const hasDollar = raw.startsWith('$');
      const hasPercent = raw.endsWith('%');
      const numeric = raw.replace(/[$%,]/g, '');
      const value = Number(numeric);
      if (!Number.isFinite(value)) continue;
      const hasDecimals = /\.\d+$/.test(numeric);
      const isBareInt = !hasDollar && !hasPercent && !hasDecimals && Number.isInteger(value);
      if (isBareInt && value >= 1900 && value <= 2100) continue; // reads as a year
      if (isBareInt && value < ignoreBelow) continue;

      const forms = new Set([canonicalNumber(value)]);
      if (hasDollar || /\.\d{2}$/.test(numeric)) forms.add(canonicalNumber(Math.round(value * 100)));
      if (Number.isInteger(value)) {
        forms.add(canonicalNumber(value * 100));
        forms.add(canonicalNumber(value / 100));
      }
      if (hasPercent) forms.add(canonicalNumber(value / 100));

      found.push({
        raw,
        value,
        canonical: canonicalNumber(value),
        forms: [...forms],
        line: idx + 1,
        context: line.trim().slice(0, 160),
      });
    }
  });
  return found;
}
