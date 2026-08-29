# Behavioral evals - v1

Behavioral tests for the plugin's skills/commands: does a session that runs
them actually catch what it should, ground every number, and write prose that
synthesizes instead of restating? The three patterns come from the
assertive-media review of a competitor-shaped plugin (planted-defect,
trace-to-tool-call, restatement), adapted to this plugin's own commands.

`test/*.mjs` covers the plumbing (binding, credentials, tool index). This
directory covers behavior - and behavior needs a model in the loop, so the
harness is split into a deterministic layer that costs nothing and a
model-in-the-loop layer that costs tokens.

## Substrate: why this is not a `claude plugin eval` suite

`claude plugin eval` exists upstream but is **early-access and org-gated**, and
the CLI on this machine (2.1.114) does not have the subcommand - `claude
plugin --help` lists install/list/validate/etc. only, and no local reference
for the suite format exists. Rather than fabricate an unverifiable format,
v1 is plain executable fixtures + checkers with a thin runner. The layout is
deliberately close to the early-access shape (one directory per case, a
`prompt.md`, mock tool responses), so when the org gains access the migration
is: keep `dataset/` + `tools.mjs` + `expected-findings.json`, express the
graders as eval-suite grader files, and let `claude plugin eval` replace
`bin/run-eval.sh`. Nothing in the checkers depends on the runner.

## Layout

```
evals/
  bin/
    mock-mcp.mjs        fixture-backed stdio MCP server; logs every tools/call
                        to a JSONL transcript (the provenance record)
    grade.mjs           runs the three checkers over one run directory
    run-eval.sh         model-in-the-loop: real session vs mock server, then grade
  lib/                  transcript parsing (mock JSONL + Claude Code session
                        JSONL), corpus building with echo suppression, text utils
  checkers/
    findings-check.mjs      planted-defect grader (exact set match per category)
    trace-check.mjs         every report number traces to a tool RESULT
    restatement-check.mjs   report prose must not shingle-match its inputs
  fixtures/
    ap-screen/          books fixture for /hiveku:ap-screen
    support-sweep/      helpdesk fixture for /hiveku:support-sweep
      dataset/*.json        the account's truth, internally consistent
      tools.mjs             executable tool surface over the dataset
      prompt.md             eval contract shown to the session (NO answers in it)
      expected-findings.json  the answer key + seeded-defect notes (never shown)
      sample-run/           golden run: transcript + report + sidecar, kept green
  self-test/            node:test suite pinning checkers, fixtures, mock server
```

## The three patterns

**1. Planted-defect.** Each fixture seeds known defects and known traps.
`ap-screen`: one duplicate-shaped pair (same vendor, same 184000-cent amount,
7 days apart, different bill numbers, no schedule) and one out-of-pattern
amount (135000 cents vs a 39750-cent paid median) - against distractors that
must survive unflagged: schedule twins, a hand-keyed bill on an exhausted
schedule, a 2-bill no-baseline vendor, a void, a draft. `support-sweep`: one
*silent* first-response SLA breach - the customer WAS answered, but via
`add_message`, which never stamps `first_response_at`, so the thread looks
handled while the breach clock runs - against an honestly-answered ticket, two
young unassigned tickets, and a paused-clock pending ticket. The session
writes a `findings.json` sidecar (schema in each `prompt.md`);
`findings-check.mjs` requires the actual id set to EQUAL the seeded set per
category - a missed seed and a flagged distractor both fail, and distractors
fail with the named trap.

**2. Trace test.** `trace-check.mjs` extracts every number from the report
prose and requires provenance in a tool RESULT from the transcript (numbers,
digit-runs in strings, or an array length). Inputs are never provenance, and
per-call echo suppression rejects laundering (fabricate a number, put it in a
`pm_tasks_create` title, point at the ack). A derived figure (median,
multiple) passes only when its line also shows >= 2 distinct traced inputs -
the report must show its work; `--strict` disallows even that.

**3. Restatement test.** `restatement-check.mjs` shingles report sentences
against the string values of every tool result (plus optional `--against`
upstream documents) and fails a run whose prose is mostly found in its inputs
- the "action plan that was just a summarisation of the audit" failure.
Verbatim exhibits (draft replies, quotes) are legitimate and go in ``` fences,
which both checkers skip; unfenced paste is what fails.

## Running

Deterministic layer (no model, no network, CI-safe - covers checkers,
fixture arithmetic, the mock server, and both golden sample runs):

```bash
node --test 'evals/self-test/*.test.mjs'
```

Grade any run directory (three checkers, combined verdict):

```bash
node evals/bin/grade.mjs --fixture evals/fixtures/ap-screen \
  --run evals/fixtures/ap-screen/sample-run
```

Model-in-the-loop (needs the `claude` CLI and model access; ~1 session per
run, default 3 runs per case because behavior is non-deterministic):

```bash
bash evals/bin/run-eval.sh ap-screen
bash evals/bin/run-eval.sh support-sweep --model <model> --runs 3
```

The runner builds a scratch dir per run, points a session at ONLY the mock
server (`--strict-mcp-config`, so no live account is reachable), feeds it
`commands/<case>.md` + the fixture's `prompt.md`, lets it write `report.md` +
`findings.json`, then grades. Tool allowlist is `mcp__hk__*` and `Write` only
- no Read/Bash, so the session cannot follow the fixture path in `mcp.json`
to the answer key. **Gateway/non-Claude models:** the runner inherits the
ambient environment on purpose - export `ANTHROPIC_BASE_URL` /
`ANTHROPIC_AUTH_TOKEN` (or select with `--model`) and the identical eval runs
against whatever the gateway serves; compare pass rates across models from
the per-run result directories.

To grade a session you ran some other way, copy its Claude Code session JSONL
into a directory as `transcript.jsonl` next to the `report.md` and
`findings.json` it produced - `lib/transcript.mjs` parses both transcript
shapes - and run `grade.mjs`.

## What v1 covers, and what it does not

Covered: **2 of the plugin's 90+ commands** - `/hiveku:ap-screen` and
`/hiveku:support-sweep` - chosen because each has a crisp defect model. That
exercises slices of 2 of the 18 skills' disciplines (books, helpdesk).

Not covered, no pretense otherwise:

- the other 82 commands, 16 skills, and **all 9 agents** (0 of 9);
- the plugin's real MCP plumbing (binding, credentials, tool promotion) -
  the mock server replaces it; `test/*.mjs` owns that layer;
- send/approval behavior beyond "the fixture refuses gate-crossing writes
  and the refusal shows in the transcript";
- judgment quality of prose (tone, prioritization) - no LLM judge in v1.

Known checker limits (heuristics, documented rather than hidden): trace
candidate forms are generous (x100//100 bridges), so a fabricated number can
coincide with an unrelated corpus value; echo suppression is per-call, not
cross-call; the derived-inline rule can be gamed by sprinkling traced numbers
on a line; restatement shingling (default n=6, sentence >= 0.6, run > 0.35)
misses aggressive paraphrase; a session that ignores the sidecar schema
grades as a miss, which is treated as the session's failure, by design.

Adding a case: copy a fixture directory's shape, keep `dataset/` internally
consistent (add invariants to `self-test/fixtures.test.mjs` - the aging must
reconcile, the seeds must stay the only defect-shaped rows), seed at most a
handful of defects with named traps, and keep the answer key out of
`prompt.md`.
