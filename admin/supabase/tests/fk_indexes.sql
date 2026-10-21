\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- Every foreign key has an index (0112)
-- --------------------------------------------------------------------------
--
-- Postgres does not index a foreign key for you, so the constraint is checked
-- with a scan of the child table. The index is how the rows are found; it
-- changes nothing about who may see them.
-- --------------------------------------------------------------------------

-- The invariant: no foreign key in the public schema is left unindexed.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join unnest(c.conkey) with ordinality k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f'
       and c.connamespace = 'public'::regnamespace
       and not exists (
         select 1
           from pg_index i
          where i.indrelid = c.conrelid
            and i.indkey[0] = a.attnum
       )
  loop
    raise exception 'FAIL the foreign key %.% has no index', r.tbl, r.col;
  end loop;
  raise notice 'PASS every foreign key has an index';
end $$;

-- The one that costs the most in daily use: the storefront lists a shop's
-- menu on every visit, and it was a full scan of the menu table each time.
do $$
begin
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'menu_items'
       and indexname = 'menu_items_restaurant_id_idx'
  ) then
    raise exception 'FAIL the menu index is missing';
  end if;
  raise notice 'PASS the storefront menu lookup is indexed';
end $$;

rollback;
