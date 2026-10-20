#!/usr/bin/env bash
#
# Run the SQL tests in admin/supabase/tests against a throwaway database built
# from every migration.
#
#   scripts/db-tests.sh
#
# Same throwaway local Supabase as gen-db-types.sh (database only, nothing
# remote). Each test runs in a transaction it rolls back, and fails by raising,
# so ON_ERROR_STOP turns any FAIL into a non-zero exit. Needs the Supabase CLI
# and a running Docker runtime.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS="$ROOT/admin/supabase/migrations"
TESTS="$ROOT/admin/supabase/tests"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kfd-dbtests.XXXXXX")"
PROJECT="kfd-dbtests"
EXCLUDE="gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"

cleanup() {
  (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1) || true
}
trap cleanup EXIT

cd "$WORK"
supabase init --force >/dev/null
# Own project id and ports, so this can run beside another local Supabase.
sed -i.bak -e "s/^project_id = .*/project_id = \"$PROJECT\"/" \
  -e "s/54322/56322/;s/54320/56320/;s/54321/56321/;s/54323/56323/;s/54324/56324/;s/54327/56327/" \
  supabase/config.toml

# Realtime off. `-x realtime` stops the container but the CLI still runs
# Realtime's own migrations during `supabase start`; on a fresh volume they race
# the service's entrypoint and abort the whole start with
# `duplicate key value ... schema_migrations_pkey` (CLI 2.117). The tests below
# are SQL and never touch the service, and migration 0007's publication still
# exists without it.
sed -i.bak '/^\[realtime\]/,/^\[/s/^enabled = true/enabled = false/' supabase/config.toml
mkdir -p supabase/migrations
cp "$MIGRATIONS"/*.sql supabase/migrations/

echo "Applying migrations..."
supabase start -x "$EXCLUDE" >/dev/null

failed=0
for test in "$TESTS"/*.sql; do
  if docker exec -i "supabase_db_$PROJECT" psql -U postgres -q -v ON_ERROR_STOP=1 < "$test" >/dev/null 2>"$WORK/err"; then
    echo "ok   $(basename "$test")"
  else
    echo "FAIL $(basename "$test")"
    grep -E "ERROR" "$WORK/err" | head -3
    failed=1
  fi
done
exit "$failed"
