\set ON_ERROR_STOP 1
begin;

-- Invariants that must hold for every migration, not just for the change that
-- happened to ship beside them. Each block raises on violation, so a regression
-- fails scripts/db-tests.sh -- and therefore scripts/verify.sh all and the
-- pre-push hook -- instead of being found in production.
--
-- Static reading cannot check most of these. "security definer" appears seven
-- times in 0051 with a different setting on each function, and a grant is
-- invisible in the migration that created the table: Supabase's default
-- privileges hand ALL on every new public table to anon and authenticated.
-- The catalog is the only place the answer is true.

-- 1. Every table in public has RLS enabled. A table created without it is
--    reachable by every grantee, and the default grants are ALL.
do $$
declare v_bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'FAIL tables without RLS: %', v_bad;
  end if;
  raise notice 'PASS every public table has RLS';
end $$;

-- 2. Every SECURITY DEFINER function pins search_path. Without it the body
--    resolves unqualified names through the caller's search_path, so a caller
--    able to create objects in an earlier schema can shadow a table the definer
--    meant to read.
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
      where cfg like 'search_path=%'
    );
  if v_bad is not null then
    raise exception 'FAIL security definer functions without search_path: %', v_bad;
  end if;
  raise notice 'PASS every security definer function pins search_path';
end $$;

-- 3. anon holds SELECT, and only SELECT, and only on the three public catalogue
--    tables. 0088 and 0089 took the rest away; this keeps it away. A new table
--    anon must read is a deliberate edit to this list.
do $$
declare v_bad text;
begin
  select string_agg(format('%s:%s', g.table_name, g.privilege_type), ', '
                    order by g.table_name, g.privilege_type)
    into v_bad
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee = 'anon'
    and not (g.table_name in ('restaurants', 'menu_items', 'service_areas')
             and g.privilege_type = 'SELECT');
  if v_bad is not null then
    raise exception 'FAIL anon holds unexpected table privileges: %', v_bad;
  end if;
  raise notice 'PASS anon holds SELECT only, on the catalogue tables';
end $$;

-- 4. anon cannot execute trigger functions. PostgreSQL refuses a direct call to
--    one, so this is hygiene rather than a hole -- but it is the same default
--    PUBLIC grant that let anon reach the two RPCs below.
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype = 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'FAIL anon can execute trigger functions: %', v_bad;
  end if;
  raise notice 'PASS anon cannot execute trigger functions';
end $$;

-- 5. anon cannot execute the rider RPCs that depend on auth.uid() or
--    is_platform_admin(). Their bodies already refuse anon; this is the second
--    gate the 0021 and 0016 revokes establish elsewhere.
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('my_rider_application', 'review_rider_application')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'FAIL anon can execute rider application RPCs: %', v_bad;
  end if;
  raise notice 'PASS anon cannot execute the rider application RPCs';
end $$;

-- 6. Neither client role may TRUNCATE. TRUNCATE is not filtered by RLS, so the
--    grant alone would bypass every policy on the table.
do $$
declare v_bad text;
begin
  select string_agg(format('%s:%s', g.table_name, g.grantee), ', '
                    order by g.table_name, g.grantee)
    into v_bad
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.privilege_type = 'TRUNCATE'
    and g.grantee in ('anon', 'authenticated');
  if v_bad is not null then
    raise exception 'FAIL client roles hold TRUNCATE: %', v_bad;
  end if;
  raise notice 'PASS neither client role holds TRUNCATE';
end $$;

rollback;
