#!/usr/bin/env bash
# Model-in-the-loop eval run: put a real session in front of a fixture-backed
# mock MCP server, then grade what it produced. This is the layer that costs
# tokens; the deterministic layer (node --test evals/self-test/) costs none.
#
# Usage:
#   bash evals/bin/run-eval.sh <case> [--model <model>] [--out <dir>] [--runs N]
#
# <case> is a directory name under evals/fixtures/ (ap-screen, support-sweep).
# The model/gateway comes from the ambient environment on purpose - export
# ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN (or nothing, for first-party) and
# the SAME eval runs against whatever the gateway serves, which is the point:
# gateway users are about to run these skills on non-Claude models.
#
# Behavioral evals are non-deterministic - default is 3 runs; grade each.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CASE="${1:-}"
shift || true

MODEL=""
OUT_BASE=""
RUNS=3
while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --out) OUT_BASE="$2"; shift 2 ;;
    --runs) RUNS="$2"; shift 2 ;;
    *) echo "run-eval: unknown argument $1" >&2; exit 2 ;;
  esac
done

FIXTURE="$ROOT/evals/fixtures/$CASE"
COMMAND_MD="$ROOT/commands/$CASE.md"
if [ -z "$CASE" ] || [ ! -d "$FIXTURE" ]; then
  echo "usage: run-eval.sh <case> [--model m] [--out dir] [--runs N]" >&2
  echo "cases: $(ls "$ROOT/evals/fixtures" 2>/dev/null | tr '\n' ' ')" >&2
  exit 2
fi
if [ ! -f "$COMMAND_MD" ]; then
  echo "run-eval: no commands/$CASE.md - each v1 case evals a plugin command" >&2
  exit 2
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "run-eval: 'claude' CLI not on PATH - this layer needs a real session" >&2
  exit 2
fi

OUT_BASE="${OUT_BASE:-$ROOT/evals/results/$CASE-$(date +%Y%m%d-%H%M%S)}"
FAILED=0

for i in $(seq 1 "$RUNS"); do
  RUN_DIR="$OUT_BASE/run-$i"
  mkdir -p "$RUN_DIR"

  # Only the mock server is visible (--strict-mcp-config); the real hk server
  # never loads, so no live account can be touched by an eval run.
  cat > "$RUN_DIR/mcp.json" <<EOF
{
  "mcpServers": {
    "hk": {
      "command": "node",
      "args": [
        "$ROOT/evals/bin/mock-mcp.mjs",
        "--fixture", "$FIXTURE",
        "--transcript", "$RUN_DIR/transcript.jsonl"
      ]
    }
  }
}
EOF

  # The prompt is the command's own documented logic + the fixture's eval
  # harness contract (deliverables, sidecar schema, no-human-in-the-loop).
  PROMPT="$(cat "$COMMAND_MD"; printf '\n\n---\n\n'; cat "$FIXTURE/prompt.md")"

  echo "== $CASE run $i/$RUNS -> $RUN_DIR"
  (
    cd "$RUN_DIR"
    # shellcheck disable=SC2086
    # Write only - no Read/Bash, so the session cannot follow the fixture
    # path in mcp.json and peek at expected-findings.json (the answer key).
    claude -p "$PROMPT" \
      --mcp-config "$RUN_DIR/mcp.json" \
      --strict-mcp-config \
      --allowedTools "mcp__hk__*" "Write" \
      --permission-mode acceptEdits \
      ${MODEL:+--model "$MODEL"} \
      > "$RUN_DIR/session-stdout.txt" 2> "$RUN_DIR/session-stderr.txt"
  ) || echo "run-eval: session exited non-zero (see $RUN_DIR/session-stderr.txt)"

  if node "$ROOT/evals/bin/grade.mjs" --fixture "$FIXTURE" --run "$RUN_DIR"; then
    echo "== run $i: PASS"
  else
    echo "== run $i: FAIL"
    FAILED=$((FAILED + 1))
  fi
done

echo
echo "== $CASE: $((RUNS - FAILED))/$RUNS runs passed (results in $OUT_BASE)"
[ "$FAILED" -eq 0 ]
