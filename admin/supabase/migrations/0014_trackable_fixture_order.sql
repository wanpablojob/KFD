-- --------------------------------------------------------------------------
-- The trackable fixture order, for real.
--
-- 0013 tried to insert this and did nothing at all. Its id, ord_1008, is
-- already used by a seeded row in 0001, and `on conflict (id) do nothing`
-- swallowed the collision: the migration applied, the run went green, and the
-- public tracking page had nothing to show. `on conflict do nothing` is the
-- wrong tool for a fixture -- it converts "I got this wrong" into "no
-- observable difference".
--
-- Hence the explicit guard below: a duplicate reference raises instead of
-- quietly picking one of the two rows. That matters beyond the fixture, because
-- track_order() resolves a reference with `limit 1` -- there is no unique
-- constraint on orders.reference, so a collision would make the public page
-- serve whichever row Postgres happened to return first.
-- --------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from orders where reference = '#KFD-7A3F9C1E5B20') then
    raise exception
      'reference #KFD-7A3F9C1E5B20 is already taken; track_order() would serve an arbitrary row';
  end if;
end;
$$;

insert into orders (
  id, reference, customer, restaurant, restaurant_id,
  items, subtotal, delivery_fee, total, status, payment, placed_at, rider
) values (
  -- Deliberately not ord_NNNN. The numeric range is a seeded convention that
  -- has already collided once, and this row is not part of that sequence.
  'ord_track_demo',
  -- A literal, so the browser checks can address a known order. Real orders get
  -- their reference from mint_order_reference(), and migrate-db.yml asserts
  -- that function still produces the 48-bit pattern this one imitates.
  '#KFD-7A3F9C1E5B20',
  'Rowela Villanueva',
  'D & D Food Hub',
  'rst_01',
  '[{"name":"Inihaw na Liempo","quantity":2,"price":8.5},{"name":"Java Rice","quantity":1,"price":3.5}]',
  20.50, 1.90, 22.40, 'preparing', 'cash', now() - interval '20 minutes', 'Unassigned'
);

-- Deliberately NOT set: customer_user_id. This is a walk-in with no account,
-- which is the common case and has to stay valid with a null link.
--
-- Also worth being explicit about what the tracking page can never show, since
-- the row above contains all of it: the customer's name, the restaurant's id,
-- the rider assignment. track_order() does not return them, and anon's grant on
-- orders is revoked, so neither the page nor anyone holding the public anon key
-- can read them off this row.
