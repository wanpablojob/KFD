-- --------------------------------------------------------------------------
-- menu_items.restaurant_id: NOT NULL + FK (ON DELETE RESTRICT)
--
-- The column was added nullable in 0002, with a backfill from the free-text
-- `restaurant` name, and left nullable only because "RLS treats NULL as
-- invisible" was the safe default for an owner that could not be resolved.
-- Every seeded name resolved then, and every writer since (merchant-queries
-- saveMenuItem, customer_place_order) sets restaurant_id from a trusted
-- source, so the column has no legitimate NULLs.
--
-- Making it NOT NULL is the honest schema: a menu item without a restaurant is
-- an orphan that no role can see, and it cannot be priced into an order. The
-- ON DELETE SET NULL inherited from 0002 is replaced with ON DELETE RESTRICT
-- for the same reason orders.restaurant_id is RESTRICT in 0024: 0010 archives
-- restaurants instead of deleting them, so RESTRICT protects history rather
-- than silently orphaning a menu.
-- --------------------------------------------------------------------------

-- Backfill any stragglers from the free-text name, so the NOT NULL below can
-- never strand a row. Same join 0002 used.
update menu_items m
   set restaurant_id = r.id
  from restaurants r
 where m.restaurant_id is null
   and m.restaurant = r.name;

-- Fail loudly if anything is still unresolved: a menu item that cannot be
-- attributed must be fixed by hand, not silently dropped by the NOT NULL.
do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
    from menu_items
   where restaurant_id is null;

  if v_orphans > 0 then
    raise exception
      'Cannot set NOT NULL: % menu_items rows have no resolvable restaurant. Fix data first.',
      v_orphans
      using errcode = '23502';
  end if;
end;
$$;

-- Replace the inherited ON DELETE SET NULL constraint with a named RESTRICT one.
alter table menu_items
  drop constraint if exists menu_items_restaurant_id_fkey;

alter table menu_items
  alter column restaurant_id set not null;

alter table menu_items
  add constraint menu_items_restaurant_id_fkey
  foreign key (restaurant_id)
  references restaurants (id)
  on delete restrict;

comment on constraint menu_items_restaurant_id_fkey on menu_items
  is 'Every menu item belongs to a restaurant. RESTRICT, not SET NULL: restaurants are archived (0010), never deleted.';
