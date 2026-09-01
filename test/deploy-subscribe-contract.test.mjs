/**
 * The prose that teaches `deploy_subscribe` must teach the CONTRACT IT HAS.
 *
 * ── The failure this guards against ───────────────────────────────────────
 * `deploy_subscribe` was repointed from Server-Sent Events to a JSON long
 * poll. The skill, the reference and the /hiveku:deploy command kept teaching
 * the old shape: subscribe to a stream, pass `include_log_lines` for build-log
 * events, cap it with `max_seconds`, expect `ping` heartbeats and an `end`
 * event. None of those parameters is declared any more, and an MCP argument
 * the schema does not declare is DROPPED SILENTLY - no error, no warning. So
 * an agent following the docs passed three parameters that did nothing and
 * then waited for a stream that never came, on the one tool a deploy's whole
 * feedback loop hangs off.
 *
 * A stale parameter name is invisible to the tool-name gate in
 * tool-names.test.mjs: `deploy_subscribe` itself is perfectly real. Only the
 * ARGUMENTS rotted, which is why this file checks arguments.
 *
 * ── Why it reads lib/tool-index.json first ────────────────────────────────
 * Hardcoding "the docs must say wait_seconds" would pin the prose to today's
 * contract forever - the same mistake one layer up. So the PREMISE is asserted
 * against the generated index (the live tools/list): the index must still show
 * a long-poll tool with `wait_seconds` and `terminal` and no SSE parameters.
 * If the tool ever goes back to streaming, this test fails at the premise with
 * a message saying so, instead of quietly enforcing stale prose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Parameters that belonged to the retired SSE contract and are declared nowhere now. */
const RETIRED_PARAMS = ['include_log_lines', 'max_seconds', 'heartbeat_ms'];

/**
 * Tokens the long-poll contract cannot be taught without. `wait_seconds` is
 * the only knob, and `terminal` is the canonical stop-polling signal - prose
 * that omits either is teaching a caller to sleep-and-poll or to branch on the
 * status string, which is the bug the tool exists to remove.
 */
const REQUIRED_TOKENS = ['wait_seconds', 'terminal'];

/** How far from a retired name a negation may sit and still count as one. */
const NEGATION_WINDOW = 3;
const NEGATION = /\b(no|not|never|nor|instead of|rather than|retired|removed|dropped|belonged)\b/i;

function docFiles() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  walk(path.join(root, 'skills'));
  walk(path.join(root, 'commands'));
  files.push(path.join(root, 'README.md'));
  return files;
}

function deploySubscribeEntry() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'tool-index.json'), 'utf8'));
  return raw.tools.find((t) => t.name === 'deploy_subscribe') ?? null;
}

test('premise: the index still declares deploy_subscribe as a long poll, not a stream', () => {
  const entry = deploySubscribeEntry();
  // A missing entry is "could not tell", never "the tool is fine" - fail loudly
  // rather than let the doc assertions below pass vacuously.
  assert.ok(entry, 'deploy_subscribe is absent from lib/tool-index.json - regenerate the index; do not assume the prose below is still right');

  const desc = entry.description;
  for (const token of REQUIRED_TOKENS) {
    assert.ok(
      desc.includes(token),
      `deploy_subscribe's own description no longer mentions \`${token}\`. The contract moved again - `
      + 'reread it and update this test AND the prose together, in that order.',
    );
  }
  for (const param of RETIRED_PARAMS) {
    assert.ok(
      !desc.includes(param),
      `deploy_subscribe's description declares \`${param}\` again. If the SSE contract came back, `
      + 'this whole test is enforcing stale prose - rewrite it against the new contract.',
    );
  }
});

test('no doc teaches a retired deploy_subscribe parameter as if it worked', () => {
  const offences = [];
  for (const file of docFiles()) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const param of RETIRED_PARAMS) {
        if (!line.includes(param)) continue;
        // A retired name may still be NAMED, to tell the reader it is gone.
        // What it may not be is stated affirmatively, so a negation has to sit
        // within a few lines of it.
        const from = Math.max(0, i - NEGATION_WINDOW);
        const window = lines.slice(from, i + NEGATION_WINDOW + 1).join(' ');
        if (NEGATION.test(window)) continue;
        offences.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(
    offences,
    [],
    'these lines name a parameter deploy_subscribe does not declare, with nothing nearby saying so. '
    + 'An undeclared MCP argument is dropped silently, so this reads as working and does nothing:\n  '
    + offences.join('\n  '),
  );
});

test('every doc that teaches deploy_subscribe teaches wait_seconds and terminal', () => {
  const mentioning = docFiles().filter((f) => fs.readFileSync(f, 'utf8').includes('deploy_subscribe'));

  // Vacuous-pass guard: three files taught this tool when the audit found it.
  // If the walk or the filter breaks, this test would "pass" checking nothing.
  assert.ok(
    mentioning.length >= 3,
    `only ${mentioning.length} docs mention deploy_subscribe (expected at least 3) - the file walk is broken, not the prose`,
  );

  const missing = [];
  for (const file of mentioning) {
    const text = fs.readFileSync(file, 'utf8');
    const absent = REQUIRED_TOKENS.filter((t) => !text.includes(t));
    if (absent.length) missing.push(`${path.relative(root, file)} (missing: ${absent.join(', ')})`);
  }
  assert.deepEqual(
    missing,
    [],
    'a doc that teaches deploy_subscribe must teach `wait_seconds` (its only knob) and `terminal` '
    + '(the stop-polling signal, which is NOT the same question as `succeeded` - a failed deploy is '
    + 'terminal too). Prose without them sends the reader back to sleep-and-poll or to branching on '
    + 'the status string:\n  ' + missing.join('\n  '),
  );
});
