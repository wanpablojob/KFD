#!/usr/bin/env bash
#
# Phase C preflight: the checks that can be made before the production
# window and the store submissions, in one command.
#
#   scripts/phase-c-preflight.sh
#
# Phase C is the phase where the code stops being the problem and the
# inputs stop being the problem. The plan for it (production deploy,
# store submission, real restaurant data) is mostly a list of things a
# human has to do, and the failure mode of a list like that is that the
# one item nobody checked is the one that fails. This script makes the
# mechanical part of that list mechanical.
#
# Three kinds of result:
#
#   FAIL   A code defect. Fix it before Phase C.
#   OWNER  An input only the owner can supply -- contacts, the DTI
#          number, store screenshots. Reported so it cannot be quietly
#          forgotten, but not fatal here: until the owner fills them in,
#          the site hides them, which is the correct behaviour.
#   OK     Checked and good.
#
# Exit code is 1 when anything FAILed, so this can gate a deploy.
#
# It deliberately does not read any .env file and does not print the value
# of any environment variable. It compares the NAMES the code reads
# against the NAMES the example files declare, and it reads the public
# app configuration, which is committed to the repo.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=()
OWNER_ITEMS=()
CHECKED=0

pass() { CHECKED=$((CHECKED + 1)); printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
fail() {
  CHECKED=$((CHECKED + 1))
  FAILED+=("$1")
  printf '\033[31m  ✗ %s\033[0m\n' "$1"
  shift
  for line in "$@"; do printf '      %s\n' "$line"; done
}
owner() {
  CHECKED=$((CHECKED + 1))
  OWNER_ITEMS+=("$1")
  printf '\033[33m  ! %s\033[0m\n' "$1"
}
section() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

# Environment variable names read by the code.
# Handles process.env.NAME and process.env["NAME"].
used_vars() {
  grep -rhoE 'process\.env\.[A-Za-z_][A-Za-z0-9_]*|process\.env\["[A-Za-z_][A-Za-z0-9_]*"\]' "$@" \
    | sed -E 's/process\.env\.//; s/process\.env\["//; s/"\]//' \
    | sort -u
}

# Environment variable names declared in an example file. A commented-out
# name counts: that is how a platform-provided variable is documented.
declared_vars() {
  grep -oE '^#?[[:space:]]*[A-Z][A-Z0-9_]*=' "$1" | sed -E 's/^#?[[:space:]]*//; s/=$//' | sort -u
}

# Reports variables the code reads that no example file declares. A name
# that is used but undocumented is a name nobody will set in the EAS
# environment or on Vercel, and a missing one in a store build is a
# bundle that boots against an undefined URL instead of an error.
check_env_parity() {
  local label="$1" example="$2" pattern="$3"
  shift 3
  local used declared missing
  used="$(used_vars "$@" | grep -E "$pattern" || true)"
  declared="$(declared_vars "$example")"
  missing="$(comm -23 <(printf '%s\n' "$used") <(printf '%s\n' "$declared") | grep -v '^$' || true)"

  if [ -z "$missing" ]; then
    pass "$label: every variable the code reads is declared in $(basename "$example")"
  else
    fail "$label: read but not declared in $(basename "$example")" \
      "$missing" \
      "Add each one to $example. A store build fails quietly without it."
  fi
}

printf '\033[1mKFD Phase C preflight\033[0m\n'

# ---- 1. Production keys -------------------------------------------
# Phase C needs the EAS production environment and the Vercel production
# environment set. Both are invisible from the repo, so the only thing
# that can be checked here is that the list of names is right.
section "production keys"
check_env_parity "admin" "$ROOT/admin/.env.example" '.' "$ROOT/admin/src"
check_env_parity "mobile" "$ROOT/mobile/.env.example" '^EXPO_PUBLIC_' "$ROOT/mobile/src" "$ROOT/mobile/app.config.js"

# The site URL is the root of every URL in a store listing.
if grep -q '^NEXT_PUBLIC_SITE_URL=' "$ROOT/admin/.env.example"; then
  pass "admin: NEXT_PUBLIC_SITE_URL is declared (the store listing URLs hang off it)"
else
  fail "admin: NEXT_PUBLIC_SITE_URL is not declared" \
    "Store listing URLs (privacy, terms, support) come from it."
fi

# ---- 2. Pages the stores and the reviewers will open ---------------
section "public pages"
for page in privacy terms support; do
  if [ -f "$ROOT/admin/src/app/$page/page.tsx" ]; then
    pass "public page /$page exists"
  else
    fail "public page /$page is missing" \
      "Apple and Google both want a live support/privacy URL that opens."
  fi
done

# ---- 3. Store identity ---------------------------------------------
section "store identity"
APP_JSON="$ROOT/mobile/app.json"
bundle="$(node -e "try{console.log(require('$APP_JSON').expo.ios.bundleIdentifier||'')}catch(e){console.log('')}")"
package="$(node -e "try{console.log(require('$APP_JSON').expo.android.package||'')}catch(e){console.log('')}")"
encryption="$(node -e "try{console.log(String(require('$APP_JSON').expo.ios.infoPlist.ITSAppUsesNonExemptEncryption))}catch(e){console.log('undefined')}")"

if [ -n "$bundle" ] && [ -n "$package" ]; then
  pass "ios bundle id $bundle and android package $package are set"
else
  fail "ios bundle id / android package missing from mobile/app.json" \
    "Apple and Google reject a build with no id."
fi

if [ "$encryption" = "false" ]; then
  pass "ITSAppUsesNonExemptEncryption is false (no export compliance questionnaire)"
else
  owner "ITSAppUsesNonExemptEncryption is not explicitly false" \
    "Leave it false: it keeps the App Store Connect export questions out of the launch window."
fi

if grep -q '\.\.\.appJson' "$ROOT/mobile/app.config.js"; then
  pass "mobile/app.config.js extends mobile/app.json (the values above are the ones that ship)"
else
  fail "mobile/app.config.js does not extend mobile/app.json" \
    "expo-doctor already flags this: the static file and the shipped config disagree."
fi

for asset in icon.png splash-icon.png android-icon-foreground.png android-icon-monochrome.png; do
  if [ -f "$ROOT/mobile/assets/$asset" ]; then
    pass "asset mobile/assets/$asset exists"
  else
    fail "asset mobile/assets/$asset is missing" \
      "The store build needs it; a missing icon fails the build, not the review."
  fi
done

# ---- 4. Content the owner has to supply ---------------------------
section "owner input"
todo_count="$(grep -rn 'TODO(owner)' "$ROOT/admin/src" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$todo_count" = "0" ]; then
  pass "no TODO(owner) left in the app"
else
  owner "$todo_count TODO(owner) items are still unfilled in the app" \
    "$(grep -rn 'TODO(owner)' "$ROOT/admin/src" 2>/dev/null | sed "s|$ROOT/||" | head -8 | sed 's/^/      /')"
fi

if [ -d "$ROOT/mobile/store-screenshots" ] || [ -d "$ROOT/store-screenshots" ]; then
  pass "store screenshot folder exists"
else
  owner "no store screenshots committed to the repo" \
    "Apple wants 6.7\" (1290x2796) and 6.5\" (1242x2688); Google wants 1080x1920." \
    "Screenshots are captured from a device, so they cannot be generated here."
fi

# ---- 5. Migration inventory ---------------------------------------
section "database"
migrations="$(ls "$ROOT/admin/supabase/migrations" 2>/dev/null | grep -E '^[0-9]+_.*\.sql$' | wc -l | tr -d ' ')"
newest="$(ls "$ROOT/admin/supabase/migrations" 2>/dev/null | grep -E '^[0-9]+_.*\.sql$' | LC_ALL=C sort | tail -1)"

# Two files with the same version. The Supabase CLI applies one file per
# version, so the second one is skipped -- and the reset fails with an error
# about a migration that has nothing to do with the two that share a number.
# Two agents adding migrations at the same time is how this happens, so it is
# checked here, where the message can say what is actually wrong.
duplicates="$(ls "$ROOT/admin/supabase/migrations" 2>/dev/null \
  | grep -E '^[0-9]+_.*\.sql$' \
  | sed -E 's/^([0-9]+)_.*/\1/' \
  | sort | uniq -d)"
if [ -n "$duplicates" ]; then
  fail "two migrations share a version: $(echo "$duplicates" | tr '\n' ' ')" \
    "Renumber the newer file, above every version already on disk." \
    "The Supabase CLI applies one file per version and skips the second."
else
  pass "every migration has its own version"
fi

if [ -n "$newest" ]; then
  pass "$migrations migrations on disk, newest $newest" \
    "scripts/verify.sh all proves the generated types match them."
  printf '      Apply them with the migrate-db workflow: dry run first, then apply.\n'
else
  fail "no migrations found in admin/supabase/migrations"
fi

# ---- Summary ------------------------------------------------------
printf '\n\033[1m── summary ──\033[0m\n'
if [ ${#FAILED[@]} -gt 0 ]; then
  for name in ${FAILED[@]+"${FAILED[@]}"}; do printf '\033[31m  ✗ %s\033[0m\n' "$name"; done
  printf '\n\033[31mFAILED: %d check(s) must be fixed before Phase C.\033[0m\n' "${#FAILED[@]}"
  exit 1
fi

printf '\033[32m  ✓ no blocking problems found\033[0m\n'
if [ ${#OWNER_ITEMS[@]} -gt 0 ]; then
  printf '\n\033[33m  Owner input still outstanding:\033[0m\n'
  for name in ${OWNER_ITEMS[@]+"${OWNER_ITEMS[@]}"}; do printf '\033[33m    ! %s\033[0m\n' "$name"; done
fi
printf '\n\033[32mPhase C preflight passed.\033[0m\n'
