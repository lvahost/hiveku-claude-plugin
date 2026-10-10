/**
 * Per-fixture transcript assertions for /hiveku:email, run by
 * evals/bin/grade.mjs after the three standard checkers. A report can call the
 * list cold and still come from a session that built the audience or queued
 * the sequence on its way there - only the transcript shows that. Returns a
 * list of problem strings (empty = pass); every message is one the helper or
 * this file wrote, and the grader prints it verbatim.
 */
import { assertNeverCalled, callsTo } from '../../lib/transcript.mjs';
import { GATED_WRITES, PLAYBOOK_ID, STATUS_READS } from './tools.mjs';

export function checks(transcript) {
  const problems = [];

  // A member directory is a cold list: nothing on Hiveku email marketing, a
  // CRM sequence or Outbound may be built, imported, enrolled or sent for it -
  // and with no human in the loop nothing could be confirmed anyway. A
  // refused call is still a call.
  try {
    assertNeverCalled(transcript, GATED_WRITES);
  } catch (err) {
    problems.push(`cold list gate crossed: ${err.message}`);
  }

  // Hiveku's rules and the account's memory load with the account context.
  // Only a status read may come before it; anything else (the list, the
  // audiences, the CRM, memory, the guide) was read before the rules were.
  const contextReads = callsTo(transcript, 'account_context_get');
  if (contextReads.length < 1) {
    problems.push('account_context_get: expected at least 1 call (platform_rules and the account memory load there), got 0');
  } else {
    const first = contextReads[0].index;
    const early = transcript.find((record) => record.index < first && !STATUS_READS.includes(record.name));
    if (early) {
      problems.push(
        `account_context_get: first called at transcript index ${first}, after ${early.name} (transcript index ${early.index}) - only a status read (${STATUS_READS.join(', ')}) may come before it`
      );
    }
  }

  // The standard answer and the cold-email specifics live in Hiveku's guide.
  const guideReads = callsTo(transcript, 'hiveku_playbook_get').filter((record) => record.arguments?.playbook === PLAYBOOK_ID);
  if (guideReads.length < 1) {
    problems.push(`hiveku_playbook_get: expected at least 1 call with playbook "${PLAYBOOK_ID}", got 0`);
  }

  return problems;
}
