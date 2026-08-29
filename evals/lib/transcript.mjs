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
      calls.push({ tool: obj.tool, input: obj.input ?? null, result: obj.result });
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
