#!/bin/bash
set -e
MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$SCRIPT_DIR/../.." && pwd)"

[[ "$(git branch --show-current)" =~ ^(main|master)$ ]] && echo "Cannot run on main" && exit 1

for i in $(seq 1 $MAX_ITERATIONS); do
  echo "=== Iteration $i/$MAX_ITERATIONS ==="
  OUTPUT=$(cat "$SCRIPT_DIR/prompt.md" | claude --dangerously-skip-permissions 2>&1 | tee /dev/stderr) || true

  [[ "$OUTPUT" == *"<promise>COMPLETE</promise>"* ]] && echo "Complete!" && exit 0
  [[ "$OUTPUT" == *"BLOCKED:"* ]] && echo "Blocked" && exit 1
  sleep 2
done
echo "Max iterations reached"
