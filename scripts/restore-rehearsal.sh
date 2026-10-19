#!/usr/bin/env bash
#
# Restore rehearsal: prove a backup can be restored, before the day you
# need it.
#
#   scripts/restore-rehearsal.sh <schema.sql> [data.sql]
#
# Restores a dump into a throwaway Postgres container, then reports what
# came back. Nothing here touches a real database: the container is created
# for this run and deleted on the way out, including when the restore
# fails.
#
# The pair of files it takes is what .github/workflows/migrate-db.yml
# attaches to every production apply:
#
#   public-schema.sql   the schema, as it was before the migration
#   public-data.sql     the rows, as they were before the migration
#
# Restore the schema first and the data second. A data-only dump has no
# CREATE TABLE in it, so restoring it into an empty database fails on the
# first INSERT with "relation does not exist" -- which is a confusing way
# to learn that you needed both files.
#
# Needs Docker. The Postgres image is pulled on first run.

set -uo pipefail

if [ $# -lt 1 ]; then
  echo "usage: scripts/restore-rehearsal.sh <schema.sql> [data.sql]" >&2
  exit 2
fi

SCHEMA_DUMP="$1"
DATA_DUMP="${2:-}"
CONTAINER="kfd-restore-rehearsal-$$"
IMAGE="postgres:16-alpine"
LOGDIR="$(mktemp -d -t kfd-restore)"

for file in "$SCHEMA_DUMP" ${DATA_DUMP:+"$DATA_DUMP"}; do
  if [ ! -s "$file" ]; then
    echo "error: $file is missing or empty" >&2
    exit 2
  fi
done

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$LOGDIR"
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker is not running. The rehearsal needs it." >&2
  exit 2
fi

printf '\033[1mKFD restore rehearsal\033[0m\n'
printf 'schema: %s\n' "$SCHEMA_DUMP"
[ -n "$DATA_DUMP" ] && printf 'data:   %s\n' "$DATA_DUMP"
printf '\n'

echo "Starting a throwaway Postgres ($IMAGE)..."
docker run -d --rm --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=rehearsal \
  -e POSTGRES_DB=rehearsal \
  "$IMAGE" >/dev/null || {
  echo "error: could not start the container" >&2
  exit 1
}

ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d rehearsal >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  echo "error: Postgres did not become ready in 60s" >&2
  exit 1
fi

# A Supabase dump grants privileges to roles that only exist on Supabase
# (anon, authenticated, service_role, ...). Creating them locally is what
# makes those GRANTs apply instead of aborting the restore on the first
# "role does not exist".
#
# The pg_* roles are left out on purpose: Postgres 14 and up ship them, and
# their names are reserved.
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d rehearsal -q <<'SQL' >"$LOGDIR/roles.log" 2>&1
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'rehearsal';
create role supabase_admin superuser noinherit;
create role supabase_auth_admin login noinherit createrole password 'rehearsal';
create role supabase_storage_admin login noinherit createrole password 'rehearsal';
create role dashboard_user login password 'rehearsal';
create role supabase_read_only_user nologin;
SQL
if [ $? -ne 0 ]; then
  echo "warning: could not create every Supabase role. The restore below is"
  echo "         the real test -- if a GRANT needed one of them, it fails"
  echo "         there and says so."
fi

# Two statements in a real Supabase dump cannot apply to a vanilla
# Postgres, and both are noise for a restore rehearsal:
#
#   CREATE SCHEMA "public"   -- the schema is already there
#   CREATE EXTENSION "pgsodium" (and the other platform extensions)
#                             -- they are not in the stock image
#
# Everything else is left exactly as dumped, so the rehearsal fails on a
# real problem rather than hiding one.
docker cp "$SCHEMA_DUMP" "$CONTAINER:/schema.sql" >/dev/null
if [ -n "$DATA_DUMP" ]; then
  docker cp "$DATA_DUMP" "$CONTAINER:/data.sql" >/dev/null
fi

echo "Restoring the schema..."
docker exec "$CONTAINER" sed -E \
  -e 's/^CREATE SCHEMA "public";/CREATE SCHEMA IF NOT EXISTS "public";/' \
  -e 's/^CREATE SCHEMA public;/CREATE SCHEMA IF NOT EXISTS "public";/' \
  -e 's/^CREATE EXTENSION IF NOT EXISTS "(pg_tle|pgsodium|pgmq|pg_cron|pg_graphql|vault|supabase_vault)".*/-- &/' \
  -i /schema.sql
if ! docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d rehearsal \
  -q -f /schema.sql >"$LOGDIR/schema.log" 2>&1; then
  echo "error: the schema did not restore. Last lines:" >&2
  tail -20 "$LOGDIR/schema.log" >&2
  exit 1
fi

if [ -n "$DATA_DUMP" ]; then
  echo "Restoring the data..."
  if ! docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d rehearsal \
    -q -f /data.sql >"$LOGDIR/data.log" 2>&1; then
    echo "error: the data did not restore. Last lines:" >&2
    tail -20 "$LOGDIR/data.log" >&2
    exit 1
  fi
fi

# What came back. Exact counts, not estimates: pg_stat estimates are fine
# for a dashboard and useless for "did my rows survive".
echo
echo "Tables restored:"
docker exec "$CONTAINER" psql -U postgres -d rehearsal -t -A -c "
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
" | while read -r table; do
  [ -z "$table" ] && continue
  count="$(docker exec "$CONTAINER" psql -U postgres -d rehearsal -t -A -c \
    "select count(*) from public.\"$table\";" 2>/dev/null || echo '?')"
  printf '  %-40s %s rows\n' "$table" "$count"
done

tables="$(docker exec "$CONTAINER" psql -U postgres -d rehearsal -t -A -c \
  "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';")"

echo
if [ "${tables:-0}" -gt 0 ]; then
  printf '\033[32mRestore path works: %s table(s) came back.\033[0m\n' "$tables"
  echo "The same two files restore the database this way if a migration lands badly."
  exit 0
fi

printf '\033[31mThe restore produced no tables. The dump is not a usable backup.\033[0m\n'
exit 1
