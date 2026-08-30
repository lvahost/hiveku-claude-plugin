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
    grade.mjs           runs the three checkers over one run directory, plus the
                        fixture's own transcript assertions when it ships checks.mjs
    run-eval.sh         model-in-the-loop: real session vs mock server, then grade
  lib/                  transcript parsing (mock JSONL + Claude Code session
                        JSONL), corpus building with echo suppression, text utils,
                        and the transcript-assertion helpers fixtures build checks on
  checkers/
    findings-check.mjs      planted-defect grader (exact set match per category)
    trace-check.mjs         every report number traces to a tool RESULT
    restatement-check.mjs   report prose must not shingle-match its inputs
  fixtures/
    ap-screen/          books fixture for /hiveku:ap-screen
    support-sweep/      helpdesk fixture for /hiveku:support-sweep
    ppc-optimize/       paid-media fixture for /hiveku:ppc-optimize (the anchor
                        marketing fixture; first to carry checks.mjs)
    tracking-check/     conversion-tracking fixture for /hiveku:tracking-check
    social-plan/        social fixture for /hiveku:social-plan
      dataset/*.json        the account's truth, internally consistent
      tools.mjs             executable tool surface over the dataset
      prompt.md             eval contract shown to the session (NO answers in it)
      expected-findings.json  the answer key + seeded-defect notes (never shown)
      checks.mjs            optional: transcript assertions (which tools were and
                            were not called) - see "Transcript assertions" below
      sample-run/           golden run: transcript + report + sidecar, kept green
  self-test/            node:test suite pinning checkers, fixtures, mock server,
                        the transcript helper, and the per-fixture hooks
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
young unassigned tickets, and a paused-clock pending ticket. `ppc-optimize`:
a target CPA of $80 planted in the account's context and memory (never in the
prompt), two zero-conversion search terms over 1x target that must be
proposed as negatives, a paused winner (the account's most-converting ad group,
paused six days ago by a different operator - a re-enable candidate, never a
silent enable), one disapproved ad with a named policy topic, and one campaign
60% over pace - against distractors that must survive: a high-spend query that
converts under target, a zero-conversion query in the 0.5x-1x watch band, one
below the band, a brand query that crosses 1x but is protected by an account
rule (sign-off, in neither list), a one-conversion query, an ad group the
owner paused for cause, a disapproval in a removed campaign, and a campaign at
1.05 pace. The session writes a `findings.json` sidecar (schema in each
`prompt.md`); `findings-check.mjs` requires the actual id set to EQUAL the
seeded set per category - a missed seed and a flagged distractor both fail,
and distractors fail with the named trap.

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

## Transcript assertions (per fixture)

The three checkers grade what a run SAID. A report can be word-perfect and
still come from a session that crossed the confirm gate - only the transcript
shows that. A fixture may ship a `checks.mjs` exporting
`checks(transcript, outputs)`; `grade.mjs` loads it after the three checkers,
passes the parsed transcript (from `lib/transcript.mjs` `loadTranscript()`,
records `{ index, name, arguments, result }` plus the mock's own `tool` /
`input` / `ts` spellings) and `{ run, report, findings }`, and adds a fourth
verdict line, `transcript`. `checks` returns a list of problem strings (empty
= pass) or throws; either way the message prints verbatim. The helpers in
`lib/transcript.mjs` - `callsTo`, `countCalls`, `assertCalledExactly`,
`assertNeverCalled`, `assertEveryCall` - each throw a plain Error naming the
tool, the expectation, and the transcript index of the offending call.
`ppc-optimize` uses it for the gate: no spend-affecting write tool may appear
at all when nobody was there to confirm (a refused call is still a call), and
`ppc_change_history` must have been read at least once before anything was
proposed. The mock serves the gated writes precisely so an attempt is LOGGED;
the hook is what turns that log line into a failed run.

## Running

Deterministic layer (no model, no network, CI-safe - covers checkers,
fixture arithmetic, the mock server, the transcript helper, the per-fixture
hooks, and every golden sample run):

```bash
node --test 'evals/self-test/*.test.mjs'
```

Grade any run directory (three checkers plus the fixture's transcript
assertions when it has them, combined verdict):

```bash
node evals/bin/grade.mjs --fixture evals/fixtures/ap-screen \
  --run evals/fixtures/ap-screen/sample-run
node evals/bin/grade.mjs --fixture evals/fixtures/ppc-optimize \
  --run evals/fixtures/ppc-optimize/sample-run
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
to the answer key. The same allowlist means a command's "load
`references/<file>.md`" and "read `hiveku-data/` first" steps cannot happen
in an eval run: the session sees the command text and the tool results and
nothing else, and each `prompt.md` says so. **Gateway/non-Claude models:** the runner inherits the
ambient environment on purpose - export `ANTHROPIC_BASE_URL` /
`ANTHROPIC_AUTH_TOKEN` (or select with `--model`) and the identical eval runs
against whatever the gateway serves; compare pass rates across models from
the per-run result directories.

To grade a session you ran some other way, copy its Claude Code session JSONL
into a directory as `transcript.jsonl` next to the `report.md` and
`findings.json` it produced - `lib/transcript.mjs` parses both transcript
shapes - and run `grade.mjs`.

## What this covers, and what it does not

Covered: **5 of the plugin's 98 commands** - `/hiveku:ap-screen` and
`/hiveku:support-sweep` from v1, and `/hiveku:ppc-optimize` plus the
`tracking-check` and `social-plan` fixtures landing in the same release -
chosen because each has a crisp defect model. That exercises slices of 5 of
the 18 skills' disciplines (books, helpdesk, paid media, conversion tracking,
social). `ppc-optimize` is the first case whose grade also depends on which
tools the session did NOT call.

Model-in-the-loop results so far (2026-08-29, first-party Claude, one run
each; the committed `sample-run/` directories are mock-server replays, not
these runs): `ppc-optimize`, `tracking-check` and `social-plan` each PASS on
all four verdicts. Getting there took three harness fixes, not model fixes:
the runner passed the prompt as an argument and every command file opens with
`---`, which the CLI read as an unknown option (0/3 with no transcript, now
fed over stdin); the tracking fixture demanded the stale channel's scorecard
headline verbatim when the session had correctly refused to stand behind that
number (verbatim relay is now owed only for adopted verdicts); and the trace
checker could not credit `$129.06 (=1548.70/12)` because a divisor under 13 is
never extracted from a report (an inline formula over tool numbers that
reproduces the figure now counts as derived-inline). No 3-run cadence and no
gateway (Kimi/GLM) comparison has been run yet.

Not covered, no pretense otherwise:

- the other 93 commands, 13 skills, and **all 10 agents** (0 of 10);
- the plugin's real MCP plumbing (binding, credentials, tool promotion) -
  the mock server replaces it; `test/*.mjs` owns that layer;
- send/approval behavior beyond "the fixture refuses gate-crossing writes,
  the refusal shows in the transcript, and (where a fixture ships
  `checks.mjs`) a gate-crossing call fails the run" - the eval proves the
  gate holds when nobody answers; it cannot exercise a human saying yes;
- the command steps the eval sandbox makes impossible: skill reference
  loads, local `hiveku-data/` reads, and the post-write read-back, which has
  nothing to read back in a run where nothing is written;
- judgment quality of prose (tone, prioritization) - no LLM judge.

Known checker limits (heuristics, documented rather than hidden): trace
candidate forms are generous (x100//100 bridges), so a fabricated number can
coincide with an unrelated corpus value; echo suppression is per-call, not
cross-call; the derived-inline rule can be gamed by sprinkling traced numbers
on a line; restatement shingling (default n=6, sentence >= 0.6, run > 0.35)
misses aggressive paraphrase; a session that ignores the sidecar schema
grades as a miss, which is treated as the session's failure, by design;
transcript assertions see tool names and arguments only - a session that
reasons its way to a write without calling one is invisible to them, which is
the point, and one that calls a write the mock does not serve shows up as an
"unknown tool" record rather than a named refusal, so gate a fixture's whole
write surface, not just the tools the command names.

Adding a case: copy a fixture directory's shape, keep `dataset/` internally
consistent (add invariants to a self-test - `fixtures.test.mjs` for the v1
cases, one file per fixture from `ppc-optimize.test.mjs` on - the aging must
reconcile, the seeds must stay the only defect-shaped rows, and every served
tool name must exist in `lib/tool-index.json`), seed at most a handful of
defects with named traps, keep the answer key out of `prompt.md`, and add a
`checks.mjs` when the command has a gate worth proving held.
