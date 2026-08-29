/**
 * Transcript parsing for the eval checkers. No dependencies - Node 20+.
 *
 * Two JSONL shapes are accepted, so the same checkers grade both a mock-server
 * run and a real Claude Code session transcript:
 *
 *  1. Mock-server call log (evals/bin/mock-mcp.mjs writes this):
 *       {"ts":"...","tool":"accounting_ap_aging","input":{},"result":{...}}
 *
 *  2. Claude Code session JSONL (~/.claude/projects/<dir>/<session>.jsonl):
 *       entries whose message.content carries tool_use / tool_result blocks,
 *       paired here by tool_use_id. tool_result content that parses as JSON is
 *       treated as JSON; otherwise it stays text.
 *
 * Provenance is built from tool RESULTS only, never tool inputs - a number the
 * model itself typed into an input proves nothing about where it came from.
 */
import fs from 'node:fs';
import { canonicalNumber } from './text.mjs';

const tryJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

function normalizeResultContent(content) {
  if (typeof content === 'string') return tryJson(content);
  if (Array.isArray(content)) {
    const text = content
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return tryJson(text);
  }
  return content;
}

export function readTranscript(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim());
  const calls = [];
  const pendingUse = new Map();
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj && typeof obj.tool === 'string' && 'result' in obj) {
      calls.push({ tool: obj.tool, input: obj.input ?? null, result: obj.result, ...(obj.ts ? { ts: obj.ts } : {}) });
      continue;
    }
    const content = obj?.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'tool_use') pendingUse.set(block.id, { tool: block.name, input: block.input });
        if (block?.type === 'tool_result') {
          const use = pendingUse.get(block.tool_use_id) || { tool: 'unknown', input: null };
          calls.push({ tool: use.tool, input: use.input, result: normalizeResultContent(block.content) });
        }
      }
    }
  }
  return calls;
}

/**
 * Walk every tool result and index what it supplied:
 *   numbers - every number value, plus every digit-run inside string values
 *             (dates and ids in strings donate their fragments; generous on
 *             purpose - see trace-check.mjs);
 *   counts  - the length of every array (a report may honestly say "N rows"
 *             about a list no field summarizes);
 *   text    - every string value, newline-joined (the restatement corpus:
 *             string VALUES are what a lazy report copies; keys are not).
 *
 * ECHO SUPPRESSION: per call, any primitive in the result that also appears
 * verbatim among the call's INPUT primitives is dropped. An echo of your own
 * input is not provenance - without this, a session could fabricate a number,
 * write it into a pm_tasks_create title, and let the ack's echoed title
 * "trace" it (and its own prose would pad the restatement corpus).
 */
export function buildCorpus(calls) {
  const numbers = new Set();
  const counts = new Set();
  const strings = [];
  const collectPrimitives = (v, out) => {
    if (v == null) return;
    if (typeof v === 'number') out.add(canonicalNumber(v));
    else if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach((x) => collectPrimitives(x, out));
    else if (typeof v === 'object') Object.values(v).forEach((x) => collectPrimitives(x, out));
  };
  const visit = (v, echoes) => {
    if (v == null) return;
    if (typeof v === 'number') {
      if (!echoes.has(canonicalNumber(v))) numbers.add(canonicalNumber(v));
      return;
    }
    if (typeof v === 'string') {
      if (echoes.has(v)) return;
      strings.push(v);
      for (const m of v.match(/\d+(?:\.\d+)?/g) || []) numbers.add(canonicalNumber(Number(m)));
      return;
    }
    if (Array.isArray(v)) {
      counts.add(v.length);
      v.forEach((x) => visit(x, echoes));
      return;
    }
    if (typeof v === 'object') Object.values(v).forEach((x) => visit(x, echoes));
  };
  for (const c of calls) {
    const echoes = new Set();
    collectPrimitives(c.input, echoes);
    visit(c.result, echoes);
  }
  return { numbers, counts, text: strings.join('\n') };
}

// ── Transcript assertions ───────────────────────────────────────────────────
// The per-fixture layer: a fixture's checks.mjs (loaded by bin/grade.mjs)
// asserts WHICH tools a run called, not just what its report says. The gate
// tests live here - "the confirm gate held: no write tool was called when
// nobody was there to answer", "the paused-winner read happened at all".
//
// Every assertion throws a plain Error whose message a grader can print
// verbatim: tool name, expected, actual, and the transcript index of the
// offending call where there is one.

/**
 * Parse a transcript into ordered call records. Both JSONL shapes above are
 * accepted (this wraps readTranscript). Each record exposes:
 *   index      - 0-based position in the transcript
 *   name       - tool name
 *   arguments  - the call's input ({} when the transcript carried none)
 *   result     - the tool result
 * plus the mock server's own field names (tool, input, ts when present) so a
 * record reads the same whichever spelling a check reaches for.
 */
export function loadTranscript(filePath) {
  return readTranscript(filePath).map((call, index) => ({
    index,
    name: call.tool,
    arguments: call.input ?? {},
    result: call.result,
    tool: call.tool,
    input: call.input,
    ...(call.ts ? { ts: call.ts } : {}),
  }));
}

/** The records for one tool, in transcript order. */
export function callsTo(transcript, toolName) {
  return transcript.filter((record) => record.name === toolName);
}

export function countCalls(transcript, toolName) {
  return callsTo(transcript, toolName).length;
}

/** Throws unless the tool was called exactly n times. */
export function assertCalledExactly(transcript, toolName, n) {
  const actual = countCalls(transcript, toolName);
  if (actual !== n) {
    throw new Error(`${toolName}: expected exactly ${n} call(s), got ${actual}`);
  }
}

/**
 * Throws on the FIRST call to any listed tool, naming the tool and its
 * transcript index. `names` is an array (a single string is accepted).
 */
export function assertNeverCalled(transcript, names) {
  const banned = new Set(Array.isArray(names) ? names : [names]);
  const offending = transcript.find((record) => banned.has(record.name));
  if (offending) {
    throw new Error(`${offending.name} was called (transcript index ${offending.index}) - expected never called`);
  }
}

/**
 * Throws when any call to the tool has arguments the predicate rejects.
 * predicate(arguments, record) -> boolean. The message names the failing
 * index and prints the arguments so the grader shows what was sent.
 */
export function assertEveryCall(transcript, toolName, predicate, message) {
  for (const record of callsTo(transcript, toolName)) {
    let ok = false;
    try {
      ok = Boolean(predicate(record.arguments, record));
    } catch (err) {
      ok = false;
    }
    if (!ok) {
      throw new Error(
        `${toolName} call at transcript index ${record.index} failed: ${message}\n  arguments: ${JSON.stringify(record.arguments)}`
      );
    }
  }
}
