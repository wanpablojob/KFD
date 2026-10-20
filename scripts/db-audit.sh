#!/usr/bin/env bash
#
# Invariant audit of the migrated schema.
#
#   scripts/db-audit.sh
#
# Builds the same throwaway local Supabase as db-tests.sh (database only, nothing
# remote) and asks pg_catalog the questions this repo has been bitten by before:
# a table that lost its RLS, a SECURITY DEFINER function that forgot to pin
# search_path, an RPC anon can still execute, a grant that survived a policy
# change.
#
# Static reading cannot answer these. A grep for "security definer" cannot tell
# you whether a given function pins search_path, because a file holds many
# functions and the setting is per-function. The catalog knows.
#
# Read-only against a throwaway database. Report-only: it prints findings and
# exits 0. The invariants that must never regress are asserted by
# admin/supabase/tests/schema_invariants.sql, which runs on every verify.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS="$ROOT/admin/supabase/migrations"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kfd-dbaudit.XXXXXX")"
PROJECT="kfd-dbaudit"
EXCLUDE="gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,studio,edge-runtime,logflare,vector,supavisor"

cleanup() {
  (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1) || true
}
trap cleanup EXIT

cd "$WORK"
supabase init --force >/dev/null
# Own project id and ports, so this can run beside db-tests.sh and verify.sh.
sed -i.bak -e "s/^project_id = .*/project_id = \"$PROJECT\"/" \
  -e "s/54322/57322/;s/54320/57320/;s/54321/57321/;s/54323/57323/;s/54324/57324/;s/54327/57327/" \
  supabase/config.toml
mkdir -p supabase/migrations
cp "$MIGRATIONS"/*.sql supabase/migrations/

echo "Applying migrations..."
supabase start -x "$EXCLUDE" >/dev/null

docker exec -i "supabase_db_$PROJECT" psql -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
\echo ''
\echo '== CHECK 1: tables with row level security disabled =='
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

\echo ''
\echo '== CHECK 2: SECURITY DEFINER functions without a pinned search_path =='
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
    where cfg like 'search_path=%'
  )
order by 1;

\echo ''
\echo '== CHECK 3: functions the anon role may execute =='
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       case when p.prosecdef then 'definer' else 'invoker' end as kind
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

\echo ''
\echo '== CHECK 4: anon table privileges =='
select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name
order by 1;

\echo ''
\echo '== CHECK 5: tables with RLS enabled but no policy =='
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy pol where pol.polrelid = c.oid)
order by 1;

\echo ''
\echo '== CHECK 6: TRUNCATE still reachable by anon or authenticated =='
select table_name, grantee
from information_schema.role_table_grants
where table_schema = 'public' and privilege_type = 'TRUNCATE'
  and grantee in ('anon', 'authenticated')
order by 1, 2;

\echo ''
\echo '== CHECK 7: policies addressed to anon or public =='
select tablename, policyname, roles::text as roles, cmd,
       coalesce(qual, '-') as using_expr
from pg_policies
where schemaname = 'public'
  and ('anon' = any(roles) or 'public' = any(roles))
order by 1, 2;

\echo ''
\echo '== CHECK 8: service areas with a duplicate barangay name =='
select lower(barangay) as barangay, count(*) as rows
from public.service_areas
group by 1
having count(*) > 1
order by 1;

\echo ''
\echo '== CHECK 8b: service_areas columns =='
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'service_areas'
order by ordinal_position;

\echo ''
\echo '== CHECK 9: policies that admit everything (USING true) =='
select tablename, policyname, roles::text as roles, cmd, with_check
from pg_policies
where schemaname = 'public' and qual = 'true'
order by 1, 2;

\echo ''
\echo '== CHECK 10: every policy on the anon-granted tables =='
select tablename, policyname, roles::text as roles, cmd,
       coalesce(qual, '-') as using_expr, coalesce(with_check, '-') as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('restaurants', 'menu_items', 'service_areas')
order by 1, 2;

\echo ''
\echo '== CHECK 10b: raw policy roles (0 means PUBLIC) =='
select c.relname as table_name, p.polname as policy, p.polroles::text as role_oids, p.polcmd
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('restaurants', 'menu_items', 'service_areas')
order by 1, 2;
SQL

echo ""
echo "Schema audit complete (see the sections above)."
