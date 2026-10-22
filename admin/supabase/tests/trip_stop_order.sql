\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- The order of a trip's stops (0111)
--
-- A trip from several shops is one walk for the rider. The stops used to be
-- listed in the order the shops were placed -- an accident of the cart, not a
-- route. The rule now is: visit the stop whose food is ready LAST first, so
-- the rider is never standing at a kitchen waiting and the last pickup is
-- already made.
-- --------------------------------------------------------------------------

-- Customer, the rider who carries the trip, another customer, and an admin.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'trip-order-customer@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'trip-order-rider@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'trip-order-other@example.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'trip-order-admin@example.test');
insert into app_users (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email, user_id, city, status)
values ('R-ORD', 'Order Rider', 'trip-order-rider@example.test',
        '00000000-0000-0000-0000-0000000000d1', 'Kabankalan', 'online');
insert into restaurants (id, name, cuisine, city, prep_minutes) values
  ('RS-A', 'Slow Kitchen', 'Filipino', 'Kabankalan', 30),
  ('RS-B', 'Quick Kitchen', 'Filipino', 'Kabankalan', 10),
  ('RS-C', 'Middle Kitchen', 'Filipino', 'Kabankalan', 20);

-- The trip: one customer, one address, one rider.
insert into deliveries (id, reference, customer_user_id, customer, customer_phone,
                        delivery_address, payment, status, city, rider_id)
values ('D-ORD', '#KFD-ORD1', '00000000-0000-0000-0000-0000000000c1', 'Trip Customer',
        '09171234567', 'Somewhere', 'cash', 'preparing', 'Kabankalan', 'R-ORD');

-- Three shops, placed in a scrambled order on purpose: A cooks slowest, B
-- quickest, C in between. The route must be A, C, B.
insert into orders (id, reference, customer, restaurant, restaurant_id, delivery_id,
                    prep_minutes, status, placed_at)
values
  ('O-A', '#KFD-ODA', 'C', 'Slow Kitchen', 'RS-A', 'D-ORD', 30, 'preparing', now()),
  ('O-B', '#KFD-ODB', 'C', 'Quick Kitchen', 'RS-B', 'D-ORD', 10, 'preparing', now()),
  ('O-C', '#KFD-ODC', 'C', 'Middle Kitchen', 'RS-C', 'D-ORD', 20, 'preparing', now());
-- A shop the rider already collected, and one that cancelled: neither is on
-- the route, and neither takes a number.
insert into orders (id, reference, customer, restaurant, restaurant_id, delivery_id,
                    prep_minutes, status, placed_at)
values
  ('O-G', '#KFD-ODG', 'C', 'Collected Kitchen', 'RS-C', 'D-ORD', 15, 'out_for_delivery', now()),
  ('O-H', '#KFD-ODH', 'C', 'Cancelled Kitchen', 'RS-B', 'D-ORD', 15, 'cancelled', now());

-- The rider reads the route.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);

-- The route: the stop that is ready last is first, and the numbers run 1, 2, 3.
do $$ begin
  if (select string_agg(coalesce(stop_order::text, '-'), ',' order by
                            case when stop_order is null then 1 else 0 end, stop_order, reference)
        from delivery_stops('D-ORD')) <> '1,2,3,-,-' then
    raise exception 'FAIL the route is not ordered by when the food is ready: %',
      (select string_agg(coalesce(stop_order::text, '-'), ',' order by
                            case when stop_order is null then 1 else 0 end, stop_order, reference)
         from delivery_stops('D-ORD'));
  end if;
  raise notice 'PASS the route is numbered in visiting order';
end $$;

-- Which kitchens, in that order: A (30 min), C (20), B (10).
do $$ begin
  if (select string_agg(reference, ',' order by
                            case when stop_order is null then 1 else 0 end, stop_order, reference)
        from delivery_stops('D-ORD')) <> '#KFD-ODA,#KFD-ODC,#KFD-ODB,#KFD-ODG,#KFD-ODH' then
    raise exception 'FAIL the stops are in the wrong order: %',
      (select string_agg(reference, ',' order by
                            case when stop_order is null then 1 else 0 end, stop_order, reference)
         from delivery_stops('D-ORD'));
  end if;
  raise notice 'PASS the slowest kitchen is visited first';
end $$;

-- The shop's own estimate travels with the stop.
do $$ begin
  if (select prep_minutes from delivery_stops('D-ORD') where order_id = 'O-A') <> 30 then
    raise exception 'FAIL the prep estimate is missing from the stop';
  end if;
  if (select ready_at from delivery_stops('D-ORD') where order_id = 'O-A')
       is distinct from (select placed_at + interval '30 minutes' from orders where id = 'O-A') then
    raise exception 'FAIL the ready time is not the placed time plus the prep time';
  end if;
  raise notice 'PASS each stop carries its prep estimate and ready time';
end $$;

-- The order is by WHEN the food is ready, not by how long it cooks. A shop
-- ordered twenty minutes ago with a short prep time is ready before a shop
-- ordered just now with a longer one, so it is visited later.
insert into deliveries (id, reference, customer_user_id, customer, customer_phone,
                        delivery_address, payment, status, city, rider_id)
values ('D-ORD2', '#KFD-ORD2', '00000000-0000-0000-0000-0000000000c1', 'Trip Customer',
        '09171234567', 'Somewhere', 'cash', 'preparing', 'Kabankalan', 'R-ORD');
insert into orders (id, reference, customer, restaurant, restaurant_id, delivery_id,
                    prep_minutes, status, placed_at)
values
  ('O-E', '#KFD-ODE', 'C', 'Slow Kitchen', 'RS-A', 'D-ORD2', 25, 'preparing', now() - interval '20 minutes'),
  ('O-F', '#KFD-ODF', 'C', 'Quick Kitchen', 'RS-B', 'D-ORD2', 15, 'preparing', now());
do $$ begin
  if (select string_agg(reference, ',' order by stop_order) from delivery_stops('D-ORD2'))
       <> '#KFD-ODF,#KFD-ODE' then
    raise exception 'FAIL the order ignored when the food is ready: %',
      (select string_agg(reference, ',' order by stop_order) from delivery_stops('D-ORD2'));
  end if;
  raise notice 'PASS the order follows the ready time, not the prep time alone';
end $$;

-- Another customer cannot read the trip.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
do $$ begin
  if exists (select 1 from delivery_stops('D-ORD')) then
    raise exception 'FAIL another customer read a trip''s stops';
  end if;
  raise notice 'PASS another customer cannot read the trip''s stops';
end $$;

-- The trip's own customer can.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$ begin
  if (select count(*) from delivery_stops('D-ORD')) <> 5 then
    raise exception 'FAIL the customer cannot read their own trip''s stops';
  end if;
  raise notice 'PASS the customer reads the trip''s stops';
end $$;

-- And an admin can.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  if (select count(*) from delivery_stops('D-ORD')) <> 5 then
    raise exception 'FAIL an admin cannot read the trip''s stops';
  end if;
  raise notice 'PASS an admin reads the trip''s stops';
end $$;

rollback;
