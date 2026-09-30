-- --------------------------------------------------------------------------
-- Give orders.id a default so customer_place_order() can insert
--
-- customer_place_order() (0023) is the only writer of orders reachable from
-- the customer app. It ends with `returning id into v_order_id` -- so it
-- expects the database to supply the id -- but its INSERT does not list the
-- `id` column, and orders.id was declared `text primary key` with no default
-- and no trigger to fill it. Every call therefore died with:
--
--   23502: null value in column "id" of relation "orders" violates
--          not-null constraint
--
-- Placing a customer order has never worked. The admin app and the 0001 seed
-- both pass an explicit id (makeId("ord") in admin/src/lib/supabase/queries.ts,
-- 'ord_1001' in the seed), which is why the bug was invisible everywhere
-- except the storefront path.
--
-- A column default is the fix rather than editing the function's INSERT: it is
-- one line instead of a 176-line rewrite, it cannot be forgotten by a future
-- writer, and it changes nothing for existing writers -- an explicitly
-- supplied id always overrides a default, so the admin app and the seed are
-- byte-for-byte unaffected.
--
-- gen_random_uuid() is core Postgres 13+ and lives in pg_catalog, which is
-- always implicitly first on the search_path, so this resolves regardless of
-- the caller's search_path. (gen_random_bytes() would be pgcrypto, which
-- Supabase installs in `extensions` -- the same trap called out in 0012.)
--
-- Shape and entropy match mint_order_reference() (0012): 'ord_' plus 12
-- uppercase hex characters, 48 bits drawn from a uuid's 122.
-- --------------------------------------------------------------------------

alter table public.orders
  alter column id set default
    'ord_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

comment on column public.orders.id is
  'Primary key. Defaults to ord_ + 12 hex chars so customer_place_order() (0023) can insert without the client choosing the id.';
