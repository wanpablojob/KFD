\set ON_ERROR_STOP 1
-- 0146: the kitchen marks an order ready for pickup; it stays `preparing` for
-- every other rule, and the rider and the tracker can read when it was ready.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f146', 'shop@example.test'),
  ('00000000-0000-0000-0000-00000000f147', 'other-shop@example.test'),
  ('00000000-0000-0000-0000-00000000f148', 'ready-rider@example.test');
insert into restaurants (id, name, cuisine) values
  ('RS-RD1', 'Ready Kitchen', 'Filipino'), ('RS-RD2', 'Other Kitchen', 'Filipino');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-00000000f146', 'merchant', 'RS-RD1'),
  ('00000000-0000-0000-0000-00000000f147', 'merchant', 'RS-RD2')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
insert into riders (id, name, email, user_id) values
  ('R-RD1', 'Ready Rider', 'ready-rider@example.test', '00000000-0000-0000-0000-00000000f148');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, rider_payout, subtotal, delivery_fee, service_fee, total, payment)
values ('O-RD1', '#KFD-0000000000F1', 'C', 'Ready Kitchen', 'RS-RD1', 'confirmed', 'R-RD1', 50, 150, 45, 5, 200, 'cash');

set local role authenticated;

-- 1. Another shop cannot mark it ready.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f147","role":"authenticated"}', true);
do $$ begin
  perform merchant_mark_ready('O-RD1');
  raise exception 'FAIL another shop marked the order ready';
exception when insufficient_privilege then
  raise notice 'PASS only the order''s own shop can mark it ready';
end $$;

-- 2. The shop marks it ready: it is cooked (preparing) and ready is stamped.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f146","role":"authenticated"}', true);
select merchant_mark_ready('O-RD1');

-- 3. The rider's list and the public tracker both carry it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f148","role":"authenticated"}', true);
do $$ begin
  if (select ready_for_pickup_at from fetch_rider_orders_page(null, 20, false) where id = 'O-RD1') is null then
    raise exception 'FAIL the rider cannot see the order is ready';
  end if;
  if (select ready_for_pickup_at from track_order('#KFD-0000000000F1')) is null then
    raise exception 'FAIL the tracker cannot see the order is ready';
  end if;
  raise notice 'PASS rider list and tracker show ready for pickup';
end $$;

-- 4. Still `preparing`, so the rider's pickup works as before.
select * from rider_mark_picked_up('O-RD1');

reset role;
do $$ begin
  if (select status from orders where id = 'O-RD1') <> 'out_for_delivery' then
    raise exception 'FAIL a ready order could not be picked up';
  end if;
  raise notice 'PASS ready, then picked up and on the way';
end $$;
rollback;
