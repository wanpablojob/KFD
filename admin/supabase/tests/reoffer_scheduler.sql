\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- The scheduler re-offers what lapsed, and queues the push (0099)
-- --------------------------------------------------------------------------
--
-- An offer lives five minutes. When it lapsed with nobody taking it, the
-- order waited for an admin to press Re-offer: 0085 said so in as many
-- words. Now a job runs every minute and offers it again, and queues the
-- push for the riders it reached -- because a trigger cannot send a push.
--
-- Fixtures: one customer, one kitchen, one online rider, one priced
-- barangay.
-- --------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000099c1', 'rs-customer@example.test', '{"name":"Scheduler Customer","phone":"09171234567"}');

insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes)
values ('RS-RS01', 'Kusina RS', 'Filipino', 'Kabankalan City Proper', true, 'active', 10);

insert into menu_items (id, restaurant, restaurant_id, name, category, price, available)
values ('MI-RS01', 'Kusina RS', 'RS-RS01', 'Set 1', 'Mains', 100.00, true);

insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000099c1', 'customer', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into service_areas (barangay, delivery_fee, fee_agreed_in_person)
values ('RS-Priced', 30.00, false);

insert into riders (id, name, email, city, vehicle, status) values
  ('R-RS1', 'Scheduler Rider', 'rs-rider@example.test', 'Kabankalan City Proper', 'motorcycle', 'online');

-- --------------------------------------------------------------------------
-- 1. An order whose offer lapsed is offered again, and the rider is queued
-- --------------------------------------------------------------------------

insert into orders (
  id, reference, customer, restaurant, restaurant_id, items,
  subtotal, delivery_fee, service_fee, total, status, payment,
  customer_user_id, customer_phone, delivery_address, delivery_barangay,
  prep_minutes, placed_at
) values (
  'ord_rs_lapsed', 'KFD-RS-1', 'Scheduler Customer', 'Kusina RS', 'RS-RS01',
  '[{"name":"Set 1","quantity":1,"price":100.00}]'::jsonb,
  100.00, 30.00, 5.00, 135.00, 'confirmed', 'cash',
  '00000000-0000-0000-0000-0000000099c1', '09171234567',
  '12 Katipunan St., Barangay Poblacion', 'RS-Priced', 10, now()
);

-- The offer that lapsed: five minutes ago, nobody took it.
insert into order_offers (order_id, rider_id, status, offered_at, expires_at) values
  ('ord_rs_lapsed', 'R-RS1', 'expired', now() - interval '10 minutes', now() - interval '5 minutes');

select public.reoffer_lapsed_offers();

do $$
begin
  -- The offer is live again.
  if not exists (
    select 1 from order_offers
     where order_id = 'ord_rs_lapsed'
       and rider_id = 'R-RS1'
       and status = 'offered'
       and expires_at > now()
  ) then
    raise exception 'FAIL the lapsed offer was not made again';
  end if;
  -- And the rider is queued for a push.
  if not exists (
    select 1 from reoffer_push_queue
     where order_id = 'ord_rs_lapsed'
       and rider_id = 'R-RS1'
       and sent_at is null
       and token is not null
  ) then
    raise exception 'FAIL the rider was not queued for a push';
  end if;
  raise notice 'PASS a lapsed offer is offered again and the rider is queued';
end $$;

-- --------------------------------------------------------------------------
-- 2. A live offer is left alone: the order is not offered twice
-- --------------------------------------------------------------------------

select public.reoffer_lapsed_offers();

do $$
begin
  -- The offer reaches every eligible rider in the city, so the count is this
  -- rider's: a live offer must not queue him a second time.
  if (select count(*) from reoffer_push_queue where order_id = 'ord_rs_lapsed' and rider_id = 'R-RS1') <> 1 then
    raise exception 'FAIL a live offer was queued again: %',
      (select count(*) from reoffer_push_queue where order_id = 'ord_rs_lapsed' and rider_id = 'R-RS1');
  end if;
  if (select count(*) from order_offers where order_id = 'ord_rs_lapsed' and rider_id = 'R-RS1' and status = 'offered') <> 1 then
    raise exception 'FAIL the live offer was made twice: %',
      (select count(*) from order_offers where order_id = 'ord_rs_lapsed' and rider_id = 'R-RS1' and status = 'offered');
  end if;
  raise notice 'PASS a live offer is left alone';
end $$;

-- --------------------------------------------------------------------------
-- 3. An order with a rider is never re-offered
-- --------------------------------------------------------------------------

insert into orders (
  id, reference, customer, restaurant, restaurant_id, items,
  subtotal, delivery_fee, service_fee, total, status, payment,
  customer_user_id, customer_phone, delivery_address, delivery_barangay,
  rider_id, rider, rider_payout, prep_minutes, placed_at
) values (
  'ord_rs_taken', 'KFD-RS-2', 'Scheduler Customer', 'Kusina RS', 'RS-RS01',
  '[{"name":"Set 1","quantity":1,"price":100.00}]'::jsonb,
  100.00, 30.00, 5.00, 135.00, 'out_for_delivery', 'cash',
  '00000000-0000-0000-0000-0000000099c1', '09171234567',
  '12 Katipunan St., Barangay Poblacion', 'RS-Priced',
  'R-RS1', 'Scheduler Rider', 25.00, 10, now()
);

insert into order_offers (order_id, rider_id, status, offered_at, expires_at) values
  ('ord_rs_taken', 'R-RS1', 'expired', now() - interval '10 minutes', now() - interval '5 minutes');

select public.reoffer_lapsed_offers();

do $$
begin
  if exists (
    select 1 from order_offers
     where order_id = 'ord_rs_taken'
       and status = 'offered'
  ) then
    raise exception 'FAIL an order that already has a rider was offered again';
  end if;
  if exists (select 1 from reoffer_push_queue where order_id = 'ord_rs_taken') then
    raise exception 'FAIL an order that already has a rider was queued';
  end if;
  raise notice 'PASS an order with a rider is never re-offered';
end $$;

-- --------------------------------------------------------------------------
-- 4. A rider who declined is not asked again
-- --------------------------------------------------------------------------

insert into orders (
  id, reference, customer, restaurant, restaurant_id, items,
  subtotal, delivery_fee, service_fee, total, status, payment,
  customer_user_id, customer_phone, delivery_address, delivery_barangay,
  prep_minutes, placed_at
) values (
  'ord_rs_declined', 'KFD-RS-3', 'Scheduler Customer', 'Kusina RS', 'RS-RS01',
  '[{"name":"Set 1","quantity":1,"price":100.00}]'::jsonb,
  100.00, 30.00, 5.00, 135.00, 'confirmed', 'cash',
  '00000000-0000-0000-0000-0000000099c1', '09171234567',
  '12 Katipunan St., Barangay Poblacion', 'RS-Priced', 10, now()
);

insert into order_offers (order_id, rider_id, status, offered_at, expires_at) values
  ('ord_rs_declined', 'R-RS1', 'declined', now() - interval '10 minutes', now() - interval '5 minutes');

select public.reoffer_lapsed_offers();

do $$
begin
  if exists (
    select 1 from order_offers
     where order_id = 'ord_rs_declined'
       and rider_id = 'R-RS1'
       and status = 'offered'
  ) then
    raise exception 'FAIL a rider who declined was asked again';
  end if;
  raise notice 'PASS a decline sticks';
end $$;

rollback;
