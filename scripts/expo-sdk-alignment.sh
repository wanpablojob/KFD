#!/usr/bin/env bash
#
# Expo SDK alignment, with patch drift separated from major/minor drift.
#
#   cd mobile && ../../scripts/expo-sdk-alignment.sh
#
# Why this is not just `npx expo install --check`: that command compares the
# installed tree against the version list Expo publishes *today*, not against
# what the lockfile pinned. Expo ships patch releases for a live SDK without
# warning, so the same commit goes from green to red with nothing changed. On
# 2026-11-09 that is exactly what happened on main: CI went red on a commit
# that touched no mobile file, with 11 packages flagged, every one a patch
# bump. A gate that fires on someone else's release schedule is a gate people
# learn to route around.
#
# The defect this check exists to catch was a *minor* move: dependabot took
# react-native 0.86.3 -> 0.87.1, which dropped rn-get-polyfills that the SDK 57
# metro config requires, and `tsc --noEmit` stayed green while the bundle
# broke. So the rule here is:
#
#   major/minor drift  -> failure, the app is on a different SDK than it pins
#   patch drift        -> printed, not fatal
#   any other failure  -> failure, because the check did not actually run
#
# Callers set CI=1 so the CLI never offers to rewrite the lockfile.

set -uo pipefail

out=$(npx expo install --check 2>&1) || status=$?
status=${status:-0}
printf '%s\n' "$out"

hard=0
patch=0
while read -r pkg installed expected; do
  [ -n "${pkg:-}" ] || continue
  if [ "${installed%.*}" != "${expected%.*}" ]; then
    printf '::error::%s %s -> %s is major/minor drift\n' "$pkg" "$installed" "$expected"
    hard=$((hard + 1))
  else
    patch=$((patch + 1))
  fi
done < <(printf '%s\n' "$out" \
  | sed -nE 's/^ *([^ ]+)@([0-9]+\.[0-9]+\.[0-9]+) - expected version: ~?([0-9]+\.[0-9]+\.[0-9]+).*/\1 \2 \3/p')

if [ "$hard" -gt 0 ]; then
  printf 'expo SDK alignment: %s package(s) drifted at major/minor level -- install the expected versions\n' "$hard" >&2
  exit 1
fi

# Exit 1 with no drift lines means the command itself failed -- a missing
# install, a config error, a network failure. That is not a passing state.
if [ "$status" -ne 0 ] && ! printf '%s' "$out" | grep -q 'Found outdated dependencies'; then
  printf 'expo SDK alignment: `expo install --check` failed for a reason other than version drift\n' >&2
  exit 1
fi

printf 'expo SDK alignment: %s patch-level difference(s), no major/minor drift\n' "$patch"
