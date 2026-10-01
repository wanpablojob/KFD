-- --------------------------------------------------------------------------
-- FK: orders.restaurant_id -> restaurants.id
--
-- The column already exists (added in 0012) and is populated by
-- customer_place_order() and merchant order creation. Adding the FK now
-- enforces referential integrity for all past and future rows.
-- --------------------------------------------------------------------------

-- Validate no orphans before adding the constraint
do $$
declare
  v_orphans integer;
begin
  select count(*)
    into v_orphans
    from orders o
    left join restaurants r on r.id = o.restaurant_id
   where o.restaurant_id is not null
     and r.id is null;

  if v_orphans > 0 then
    -- The argument is required, not decorative: RAISE treats % as a placeholder,
    -- so without v_orphans here this raises 42601 "too few parameters" and
    -- never reports the orphan count it was written to report.
    raise exception
      'Cannot add FK: % orders have restaurant_id values not found in restaurants. Fix data first.',
      v_orphans
      using errcode = '23503';
  end if;
end;
$$;

-- Idempotent: this constraint was already present in production (applied
-- out-of-band through the SQL editor) while the migration remained unrecorded,
-- so a plain add constraint aborts with 42710. Dropping first re-establishes
-- this file's definition as the source of truth. Same shape 0027 uses for
-- menu_items_restaurant_id_fkey.
alter table orders
  drop constraint if exists orders_restaurant_id_fkey;

alter table orders
  add constraint orders_restaurant_id_fkey
  foreign key (restaurant_id)
  references restaurants (id)
  on delete restrict;

comment on constraint orders_restaurant_id_fkey on orders
  is 'Every order must reference an existing restaurant. Prevents accidental deletion of a restaurant that still has orders.';