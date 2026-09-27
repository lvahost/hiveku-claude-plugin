/**
 * PreToolUse rules for the two version tools whose risk lives in ONE argument.
 *
 *   project_vcs_commit    with no `files` and no `deletedFiles` it only saves
 *                         what is already in the project as a version (a
 *                         "promote"): nothing is overwritten, so the plugin
 *                         pre-approves it. With files it writes them into the
 *                         project and saves them, so it asks.
 *   project_vcs_rollback  a dry run unless `dry_run` is literally `false`
 *                         (the route's own rule, and the MCP proxy passes the
 *                         value through untouched), so a dry run is
 *                         pre-approved and an apply always asks. An apply is
 *                         NEVER auto-approved.
 *
 * ★ WHAT AN `allow` HERE CAN AND CANNOT DO. A hook `allow` skips the prompt
 * the permission system would otherwise show, but Claude Code still evaluates
 * the settings' deny and ask rules whatever a hook returns ("Deny and ask rules
 * are still evaluated regardless of what the hook returns", Claude Code hooks
 * reference, PreToolUse decision control). So on a machine whose settings put
 * `project_vcs_commit` or `project_vcs_rollback` on the ask list (INSTALL.md
 * does, for both), those calls still prompt; the `allow` pays off in auto mode
 * (no classifier round trip for a promote or a dry run) and on machines with
 * no ask entry. The `ask` answers are the part that binds everywhere: a hook
 * `ask` overrides a settings allow, including the blanket
 * `mcp__plugin_hiveku_hk__*` INSTALL.md hands out.
 *
 * Reasons are shown to the PERSON (not to Claude), so they say "version" and
 * "Your site", never the internals.
 *
 * Kept out of lib/tool-safety.mjs on purpose: that file only calls
 * `argGatedWriteDecision`, so the rules and their tests live here.
 */

/** True for an argument that carries nothing: absent, null, or an empty array. */
function carriesNothing(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function where(input) {
  const b = isPlainObject(input) && typeof input.branch === 'string' ? input.branch.trim() : '';
  return b && b !== 'main' ? `the branch "${b}"` : 'Your site';
}

/**
 * Bare tool name -> (tool_input) => { decision: 'allow' | 'ask', reason }.
 * A malformed input (not an object) asks: a rule that cannot read the call
 * must not approve it.
 */
export const ARG_GATED_WRITES = new Map([
  ['project_vcs_commit', (input) => {
    if (!isPlainObject(input)) {
      return {
        decision: 'ask',
        reason: 'This version save could not be read, so Hiveku cannot tell whether it also writes files. '
          + 'Confirm it by hand.',
      };
    }
    const promote =
      carriesNothing(input.files) && carriesNothing(input.deletedFiles) && carriesNothing(input.deleted_files);
    if (promote) {
      return {
        decision: 'allow',
        reason: `Saves what is already in ${where(input)} as a version. No file changes, so Hiveku `
          + 'pre-approves it.',
      };
    }
    return {
      decision: 'ask',
      reason: `This writes the files it carries into ${where(input)} and saves them as a version. `
        + 'Hiveku asks before any version save that sends files. Confirm the files and the version name.',
    };
  }],
  ['project_vcs_rollback', (input) => {
    if (isPlainObject(input) && input.dry_run === false) {
      return {
        decision: 'ask',
        reason: `This rolls ${where(input)} back to an earlier version for real: the files change `
          + 'straight away and the preview follows. It can be undone (the rollback is itself a new '
          + 'version), and the live website only changes with a separate publish. Hiveku always asks '
          + 'before a rollback is applied.',
      };
    }
    return {
      decision: 'allow',
      reason: 'A rollback dry run only reports what going back to that version would change. Nothing '
        + 'is written, so Hiveku pre-approves it.',
    };
  }],
]);

/**
 * The decision for one call to a version tool, or null for any other tool.
 * Never throws: a rule that fails asks.
 */
export function argGatedWriteDecision(bareName, toolInput) {
  const name = typeof bareName === 'string' ? bareName.toLowerCase() : '';
  const rule = ARG_GATED_WRITES.get(name);
  if (!rule) return null;
  try {
    const out = rule(toolInput);
    if (out && (out.decision === 'allow' || out.decision === 'ask') && typeof out.reason === 'string') return out;
  } catch { /* fall through */ }
  return { decision: 'ask', reason: 'Hiveku could not check this version call, so confirm it by hand.' };
}
