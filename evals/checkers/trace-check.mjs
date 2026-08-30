#!/usr/bin/env node
/**
 * TRACE TEST - every number in a produced report must trace to a tool result
 * in the transcript. A number with no provenance is the "interface, not
 * operator" rule broken: the model became the source of a datum.
 *
 * Usage:
 *   node trace-check.mjs --transcript <run.jsonl> --report <report.md>
 *                        [--ignore-below N] [--strict] [--json]
 *
 * Classification per number (fenced blocks are exempt exhibits - stripped):
 *   traced         - some candidate form of it appears in a tool result
 *                    (numbers, string digit-runs, or an array length);
 *   derived-inline - untraced, but its line shows >= 2 distinct traced numbers,
 *                    i.e. the report showed the inputs of the derivation on the
 *                    same line (a median next to its history, a delta next to
 *                    both operands). Passes by default; --strict fails it.
 *   UNTRACED       - no provenance and no inputs shown. Always fails.
 *
 * Exit: 0 clean, 1 findings, 2 usage/input error.
 */
import fs from 'node:fs';
import process from 'node:process';
import { readTranscript, buildCorpus } from '../lib/transcript.mjs';
import { canonicalNumber, extractNumbers, stripFences } from '../lib/text.mjs';

function parseArgs(argv) {
  const args = { ignoreBelow: 13, strict: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--transcript') args.transcript = argv[++i];
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--ignore-below') args.ignoreBelow = Number(argv[++i]);
    else if (a === '--strict') args.strict = true;
    else if (a === '--json') args.json = true;
    else {
      console.error(`trace-check: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!args.transcript || !args.report) {
    console.error('usage: trace-check.mjs --transcript <run.jsonl> --report <report.md> [--ignore-below N] [--strict] [--json]');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

let calls;
let reportText;
try {
  calls = readTranscript(args.transcript);
  reportText = stripFences(fs.readFileSync(args.report, 'utf8'));
} catch (err) {
  console.error(`trace-check: ${err.message}`);
  process.exit(2);
}
if (calls.length === 0) {
  console.error('trace-check: transcript contains no tool calls - nothing can trace, refusing to grade');
  process.exit(2);
}

const corpus = buildCorpus(calls);
const numbers = extractNumbers(reportText, { ignoreBelow: args.ignoreBelow });

for (const num of numbers) {
  num.traced =
    num.forms.some((f) => corpus.numbers.has(f)) ||
    (Number.isInteger(num.value) && corpus.counts.has(num.value));
}
const tracedByLine = new Map();
for (const num of numbers) {
  if (!num.traced) continue;
  if (!tracedByLine.has(num.line)) tracedByLine.set(num.line, new Set());
  tracedByLine.get(num.line).add(num.canonical);
}
// A figure the report derives with its arithmetic shown - "$129.06 (=1548.70/12)"
// - is provenance in the strongest form the report can offer, and it must not
// depend on the two-traced-numbers-per-line heuristic: a divisor under
// ignoreBelow (12 conversions) is never extracted from the report, so the line
// carries one traced number and the figure would read as fabricated. Accept the
// figure when the formula sits right after it, both operands come from a tool
// result (small integers included - the corpus keeps every number a tool
// returned), and evaluating it reproduces the figure to the cent.
const reportLines = reportText.split('\n');
const FORMULA_RE = /^\s*\(\s*=\s*([$]?[\d,]+(?:\.\d+)?)\s*([\/*x×+\-])\s*([$]?[\d,]+(?:\.\d+)?)\s*\)/;
function operandKnown(value) {
  return corpus.numbers.has(canonicalNumber(value)) || (Number.isInteger(value) && corpus.counts.has(value));
}
function explicitFormulaDerives(num) {
  const line = reportLines[num.line - 1] || '';
  let from = 0;
  while (true) {
    const at = line.indexOf(num.raw, from);
    if (at === -1) return false;
    const m = line.slice(at + num.raw.length).match(FORMULA_RE);
    if (m) {
      const a = Number(m[1].replace(/[$,]/g, ''));
      const b = Number(m[3].replace(/[$,]/g, ''));
      if (Number.isFinite(a) && Number.isFinite(b) && operandKnown(a) && operandKnown(b)) {
        const op = m[2];
        const result = op === '/' ? (b === 0 ? NaN : a / b) : op === '+' ? a + b : op === '-' ? a - b : a * b;
        if (Number.isFinite(result) && Math.abs(result - num.value) <= Math.max(0.011, Math.abs(num.value) * 0.005)) return true;
      }
    }
    from = at + num.raw.length;
  }
}
for (const num of numbers) {
  if (num.traced) num.kind = 'traced';
  else if ((tracedByLine.get(num.line)?.size || 0) >= 2) num.kind = 'derived-inline';
  else if (explicitFormulaDerives(num)) num.kind = 'derived-inline';
  else num.kind = 'UNTRACED';
}

const untraced = numbers.filter((n) => n.kind === 'UNTRACED');
const derived = numbers.filter((n) => n.kind === 'derived-inline');
const failing = args.strict ? [...untraced, ...derived] : untraced;

if (args.json) {
  console.log(JSON.stringify({ checked: numbers.length, traced: numbers.length - untraced.length - derived.length, derivedInline: derived.length, untraced: untraced.length, failing: failing.map(({ raw, line, context, kind }) => ({ raw, line, context, kind })) }, null, 2));
} else {
  console.log(`trace-check: ${numbers.length} numbers checked over ${calls.length} tool calls`);
  console.log(`  traced: ${numbers.length - untraced.length - derived.length}   derived-inline: ${derived.length}   UNTRACED: ${untraced.length}`);
  for (const n of derived) console.log(`  ~ derived-inline  line ${n.line}: ${n.raw}   | ${n.context}`);
  for (const n of failing) console.log(`  x ${n.kind}  line ${n.line}: ${n.raw}   | ${n.context}`);
  console.log(failing.length === 0 ? 'PASS: every number has provenance' : `FAIL: ${failing.length} number(s) with no tool-result provenance`);
}
process.exit(failing.length === 0 ? 0 : 1);
