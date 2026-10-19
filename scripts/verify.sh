#!/usr/bin/env bash
#
# The single verification gate for this repo.
#
#   scripts/verify.sh            # everything
#   scripts/verify.sh admin      # one app
#   scripts/verify.sh mobile
#
# OpenCode owns this script. It runs the same checks as .github/workflows/ci.yml
# so a green run here means CI should agree. Run it before every push; the
# pre-push hook runs it for you.
#
# Every check runs even if an earlier one fails, so one pass tells you
# everything that is broken rather than just the first thing.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
PASSED=()
FAILED=()
SKIPPED=()

# `required` marks a check that must pass. Advisory checks report but do not
# fail the gate, so a known-unfixable upstream advisory cannot wedge every
# future push.
run() {
  local name="$1" dir="$2" required="$3"
  shift 3
  printf '\n\033[1m── %s\033[0m\n' "$name"

  if (cd "$dir" && "$@"); then
    PASSED+=("$name")
    printf '\033[32m✓ %s\033[0m\n' "$name"
  else
    if [ "$required" = "required" ]; then
      FAILED+=("$name")
      printf '\033[31m✗ %s\033[0m\n' "$name"
    else
      SKIPPED+=("$name (advisory)")
      printf '\033[33m! %s (advisory, not blocking)\033[0m\n' "$name"
    fi
  fi
}

verify_admin() {
  run "admin: audit (production deps)" "$ROOT/admin" required \
    npm audit --omit=dev --audit-level=high
  run "admin: lint"          "$ROOT/admin" required npm run lint
  run "admin: typecheck"     "$ROOT/admin" required npm run typecheck
  run "admin: test"          "$ROOT/admin" required npm run test
  run "admin: build"         "$ROOT/admin" required npm run build
}

verify_mobile() {
  # Advisory: Expo pins packages whose advisories have no upstream fix, and
  # `npm audit fix --force` would move the app off SDK 57. Reported, never
  # blocking — see the note in the harness README.
  run "mobile: audit (production deps)" "$ROOT/mobile" advisory \
    npm audit --omit=dev
  run "mobile: expo-doctor"   "$ROOT/mobile" advisory npx expo-doctor
  run "mobile: lint"          "$ROOT/mobile" required npm run lint
  run "mobile: typecheck"     "$ROOT/mobile" required npm run typecheck
  run "mobile: test"          "$ROOT/mobile" required npm run test -- --ci

  # A clean `tsc --noEmit` can still fail to bundle: this is what happened
  # when dependabot moved react-native 0.86.3 -> 0.87.1 and dropped
  # rn-get-polyfills, which SDK 57's metro-config still needs.
  printf '\n\033[1m── mobile: bundle\033[0m\n'
  local out
  out="$(mktemp -d)"
  if (cd "$ROOT/mobile" && EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder \
      npx expo export --platform android --output-dir "$out" >/dev/null 2>&1); then
    PASSED+=("mobile: bundle")
    printf '\033[32m✓ mobile: bundle\033[0m\n'
  else
    FAILED+=("mobile: bundle")
    printf '\033[31m✗ mobile: bundle\033[0m\n'
  fi
  rm -rf "$out"
}

verify_harness() {
  run "harness: claude-guard self-test" "$ROOT" required \
    node scripts/claude-guard.mjs --self-test
}

# The launch gate. CI runs it as its own job (`.github/workflows/ci.yml`,
# job `launch`), so it belongs in the local mirror too: the pre-push hook
# runs this script, and a push that CI would reject should not get past it.
verify_launch() {
  run "launch: Phase C preflight" "$ROOT" required \
    scripts/phase-c-preflight.sh
}

printf '\033[1mKFD verification gate\033[0m\n'

verify_harness
case "$TARGET" in
  admin)  verify_admin ;;
  mobile) verify_mobile ;;
  all)    verify_admin; verify_mobile; verify_launch ;;
  *)      echo "unknown target: $TARGET (expected all, admin or mobile)" >&2; exit 2 ;;
esac

printf '\n\033[1m── summary ──\033[0m\n'
# The ${arr[@]+...} wrapper keeps `set -u` happy on bash 3.2 (still the default
# /bin/bash on macOS), where expanding an empty array is an unbound-variable
# error. Every summary array is empty on a fully clean run.
for name in ${PASSED[@]+"${PASSED[@]}"};  do printf '\033[32m  ✓ %s\033[0m\n' "$name"; done
for name in ${SKIPPED[@]+"${SKIPPED[@]}"}; do printf '\033[33m  ! %s\033[0m\n' "$name"; done
for name in ${FAILED[@]+"${FAILED[@]}"};  do printf '\033[31m  ✗ %s\033[0m\n' "$name"; done

if [ ${#FAILED[@]} -gt 0 ]; then
  printf '\n\033[31mFAILED: %d required check(s) did not pass. Do not push.\033[0m\n' "${#FAILED[@]}"
  exit 1
fi

printf '\n\033[32mAll required checks passed.\033[0m\n'