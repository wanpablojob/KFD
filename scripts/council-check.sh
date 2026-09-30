#!/usr/bin/env bash
# Council health check for Big Pickle + Space Bunny + Muse Spark.
# Free models only; see the Council section of AGENTS.md for the full roster
# and the measurement behind the timeout below.
#
# Probes each coworker's model and classifies the failure, because the dangerous
# case is a model that HANGS rather than one that errors. A hang looks identical
# to "thinking hard" from the outside, so every probe runs under a hard watchdog.
#
# `timeout` is not installed by default on macOS, so this implements it with a
# background kill, which works everywhere.
#
# Exit codes:
#   0  every model is healthy
#   2  at least one model is down (stdout names which)
#   3  one or more models ran out of juice; do NOT retry blindly

set -uo pipefail

# 45s is ~6x the measured worst case (Muse Spark ~9s), so this flags a genuine
# hang without punishing a slow start. Raise it with COUNCIL_TIMEOUT=... if the
# provider is cold.
TIMEOUT="${COUNCIL_TIMEOUT:-45}"
PROMPT="Reply with exactly: OK"

# id | label | model
COUNCIL=(
  "primary|big-pickle|opencode/big-pickle"
  "architect|space-bunny|opencode/space-bunny-free"
  "auditor|muse-spark|opencode/muse-spark-1.3-contributor-free"
)

# probe <model> -> writes output to $PROBE_OUT, returns the exit code
probe() {
  PROBE_OUT="$(mktemp)"
  opencode run -m "$1" --agent plan "$PROMPT" >"$PROBE_OUT" 2>&1 &
  local pid=$!

  ( sleep "$TIMEOUT"; kill -9 "$pid" 2>/dev/null ) &
  local killer=$!

  wait "$pid"
  local rc=$?

  kill -9 "$killer" 2>/dev/null
  wait "$killer" 2>/dev/null
  return $rc
}

classify() {
  local rc=$1
  if [ "$rc" -eq 137 ] || [ "$rc" -eq 124 ]; then
    printf 'HUNG (no response in %ss)' "$TIMEOUT"
  elif grep -qiE '429|rate.?limit|quota|insufficient|too many requests' "$PROBE_OUT"; then
    printf 'OUT OF JUICE (rate/quota limit)'
  elif grep -qiE '402|payment|balance|no credit' "$PROBE_OUT"; then
    printf 'OUT OF JUICE (no credit/balance)'
  elif grep -qiE '401|unauthorized|invalid.*key|forbidden|403' "$PROBE_OUT"; then
    printf 'BROKEN (auth rejected)'
  elif grep -qiE '404|not found|no such model|unknown model|unsupported' "$PROBE_OUT"; then
    printf 'BROKEN (model unavailable)'
  elif grep -qiE 'connection|network|dns|ENOTFOUND|ECONNREFUSED|ETIMEDOUT' "$PROBE_OUT"; then
    printf 'BROKEN (network)'
  elif [ "$rc" -ne 0 ]; then
    printf 'BROKEN (exit %s)' "$rc"
  elif grep -q 'OK' "$PROBE_OUT"; then
    printf 'healthy'
  else
    printf 'BROKEN (no valid response)'
  fi
}

notify() {
  osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null
}

declare -a down juicy
echo "Council check (timeout ${TIMEOUT}s per model)"
echo

for entry in "${COUNCIL[@]}"; do
  role="${entry%%|*}"; rest="${entry#*|}"
  label="${rest%%|*}"; model="${rest#*|}"

  probe "$model"; rc=$?
  verdict="$(classify "$rc")"
  rm -f "$PROBE_OUT"

  printf '  %-10s %-12s %-28s %s\n' "$role" "$label" "$model" "$verdict"

  if [ "$verdict" != "healthy" ]; then
    down+=("$label ($verdict)")
    case "$verdict" in
      *JUICE*) juicy+=("$label") ;;
    esac
  fi
done

echo
if [ ${#down[@]} -eq 0 ]; then
  echo "All council models healthy."
  exit 0
fi

names="${down[*]}"
if [ ${#juicy[@]} -gt 0 ]; then
  echo "STOP: no juice on ${juicy[*]}. Other down: $names"
  notify "Council: OUT OF JUICE" "${juicy[*]} -- stopping, do not retry"
  exit 3
fi

echo "DEGRADED: continue on healthy models only. Down: $names"
notify "Council degraded" "$names"
exit 2