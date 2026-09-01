/**
 * The comments over NEVER_AUTO_APPROVE and ARG_GATED_READS must not read as
 * protections they do not deliver.
 *
 * ── The mechanic, stated once ─────────────────────────────────────────────
 * A PreToolUse hook's realistic power is to ADD an allow. It cannot take back
 * an allow the user's own settings already grant. A name on NEVER_AUTO_APPROVE
 * (or a failing ARG_GATED_READS predicate) makes `isAutoApprovable` false,
 * which makes `decideForPayload` return null, and null means "no opinion" - the
 * call falls through to the permission system. Under the install shape
 * INSTALL.md documents (`allow: ["mcp__plugin_hiveku_hk__*"]` plus a literal
 * `ask` list), that fall-through is the blanket allow, so the call runs with no
 * prompt at all. The lists withhold this plugin's own free pass; they do not
 * gate.
 *
 * ── Why this is a TEST and not just a comment ─────────────────────────────
 * The danger is a future maintainer adding a name to one of those lists to
 * "block" a tool, shipping, and believing the tool is blocked. Nothing in the
 * behaviour of this file will ever fail to tell them otherwise: the code is
 * correct, the list is correct, and the tool still runs. The only thing that
 * can warn them is the comment, so the comment is the artefact under test.
 *
 * Two halves, both required:
 *   1. the BEHAVIOUR the comments describe is pinned against the real
 *      functions, so the comments cannot drift from the code; and
 *   2. the comments must actually carry the caveat - naming the install shape
 *      that defeats the list, and saying in words that it is not a gate.
 *
 * Half 2 asserts on markers, not on wording: rephrase freely, but a rewrite
 * that drops the install shape or drops the not-a-gate statement fails, which
 * is exactly the regression worth catching.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARG_GATED_READS,
  HIVEKU_TOOL_PREFIX,
  NEVER_AUTO_APPROVE,
  decideForPayload,
} from '../lib/tool-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(root, 'lib', 'tool-safety.mjs'), 'utf8');

/** The install shape from INSTALL.md that makes a null decision resolve to "allowed". */
const INSTALL_SHAPE = 'mcp__plugin_hiveku_hk__*';

/** Words that state the limitation rather than implying protection. */
const NOT_A_GATE = /(does not gate|not a gate|cannot take back|does not take away|is not a rail|declines to (add|hand out))/i;

/**
 * The doc-comment block immediately above a declaration. Returns null when the
 * declaration is missing entirely - a null is "could not read it", and the
 * caller must fail on it rather than treat an unfound block as an empty one
 * that trivially satisfies nothing.
 */
function commentBlockAbove(source, declaration) {
  const at = source.indexOf(declaration);
  if (at === -1) return null;
  const before = source.slice(0, at);
  const open = before.lastIndexOf('/**');
  const close = before.lastIndexOf('*/');
  // The block must be the LAST thing before the declaration, not an earlier
  // one with code in between.
  if (open === -1 || close === -1 || open > close) return null;
  if (before.slice(close + 2).trim() !== '') return null;
  return before.slice(open, close + 2);
}

test('the veto lists withhold a pre-approval; they do not produce a gate', () => {
  // Pins the behaviour the comments describe. A vetoed name called DIRECTLY
  // yields null - silence - which the settings then resolve, not a prompt this
  // hook forced.
  assert.ok(NEVER_AUTO_APPROVE.size > 0, 'NEVER_AUTO_APPROVE is empty - nothing to assert about');
  for (const name of NEVER_AUTO_APPROVE) {
    assert.equal(
      decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${name}`, tool_input: {} }),
      null,
      `${name} yields a hook DECISION on a direct call. If that is intentional the comments over `
      + 'NEVER_AUTO_APPROVE are now understated - rewrite them before relaxing this test.',
    );
  }

  const argGated = Object.keys(ARG_GATED_READS);
  assert.ok(argGated.length > 0, 'ARG_GATED_READS is empty - nothing to assert about');
  for (const name of argGated) {
    // `{}` is the failing form for every predicate here (they all demand an
    // explicit safe argument), so this is the "gate did not pass" branch.
    assert.equal(
      decideForPayload({ tool_name: `${HIVEKU_TOOL_PREFIX}${name}`, tool_input: {} }),
      null,
      `${name} yields a hook DECISION when its argument gate fails; the comments say it goes silent`,
    );
  }
});

test('a vetoed name DOES gate inside a batch - the asymmetry the comments call out', () => {
  // The batch branch never returns null, so the same tool that runs silently
  // when called directly turns the whole batch into an `ask`. This is the one
  // place these lists bite, and it is why they are worth keeping at all.
  const [vetoed] = [...NEVER_AUTO_APPROVE];
  const decision = decideForPayload({
    tool_name: `${HIVEKU_TOOL_PREFIX}hiveku_batch`,
    tool_input: { calls: [{ tool: vetoed, args: {} }] },
  });
  assert.equal(
    decision?.hookSpecificOutput?.permissionDecision,
    'ask',
    `a batch carrying ${vetoed} must ask. If this ever returns null, the lists stop biting anywhere `
    + 'and the honest comment becomes "these do nothing" - fix the code, not the comment.',
  );
});

test('both list comments disclose that they are not a gate, and name the install shape', () => {
  const blocks = [
    ['NEVER_AUTO_APPROVE', 'export const NEVER_AUTO_APPROVE'],
    ['ARG_GATED_READS', 'export const ARG_GATED_READS'],
  ];
  const failures = [];
  for (const [label, declaration] of blocks) {
    const block = commentBlockAbove(SOURCE, declaration);
    if (block === null) {
      failures.push(`${label}: no doc comment found immediately above it`);
      continue;
    }
    if (!block.includes(INSTALL_SHAPE)) {
      failures.push(
        `${label}: the comment never names the install shape \`${INSTALL_SHAPE}\` that makes a `
        + 'withheld pre-approval resolve to "allowed" anyway',
      );
    }
    if (!NOT_A_GATE.test(block)) {
      failures.push(
        `${label}: the comment never says in words that this list is not a gate, so it still reads `
        + 'as protection to someone about to add a name to it',
      );
    }
  }
  assert.deepEqual(
    failures,
    [],
    'lib/tool-safety.mjs comments must state the limitation honestly - a hook can ADD an allow, not '
    + 'withhold one the user\'s settings grant:\n  ' + failures.join('\n  '),
  );
});
