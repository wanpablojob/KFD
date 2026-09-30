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
    raise exception
      'Cannot add FK: % orders have restaurant_id values not found in restaurants. Fix data first.'
      using errcode = '23503';
  end if;
end;
$$;

alter table orders
  add constraint orders_restaurant_id_fkey
  foreign key (restaurant_id)
  references restaurants (id)
  on delete restrict;

comment on constraint orders_restaurant_id_fkey on orders
  is 'Every order must reference an existing restaurant. Prevents accidental deletion of a restaurant that still has orders.';