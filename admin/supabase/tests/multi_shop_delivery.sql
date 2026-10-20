\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- Multi-shop cart, one combined delivery (0092)
-- --------------------------------------------------------------------------
--
-- A basket with food from several shops is one trip: one delivery fee (the
-- barangay's rate plus 10.00 for every shop after the first), one service
-- fee, one rider, one drop-off, one cash collection. Each shop's food stays
-- its own order row, so each merchant only ever sees its own part.
--
-- Fixtures: one customer, two merchants, two riders, eleven kitchens, one
-- priced barangay.
--
-- The trip ids are held in TEMPORARY tables rather than psql variables: psql
-- does not interpolate a variable inside a dollar-quoted block, and every
-- assertion below lives in one.
-- --------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000090c1', 'ms-customer@example.test', '{"name":"Multi Customer","phone":"09171234567"}'),
  ('00000000-0000-0000-0000-0000000090c2', 'ms-merchant@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090c3', 'ms-other@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090c4', 'ms-rider@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090c7', 'ms-rider2@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090c8', 'ms-merchant4@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090c9', 'ms-merchant7@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090ca', 'ms-merchant5@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000090cb', 'ms-admin@example.test', '{}');

insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes)
select 'RS-M' || lpad(i::text, 2, '0'), 'Kusina ' || i, 'Filipino', 'Kabankalan', true, 'active', 10
  from generate_series(1, 11) i;

insert into menu_items (id, restaurant, restaurant_id, name, category, price, available)
select 'MI-M' || lpad(i::text, 2, '0'), 'Kusina ' || i, 'RS-M' || lpad(i::text, 2, '0'),
       'Set ' || i, 'Mains', 100.00, true
  from generate_series(1, 11) i;

insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000090c1', 'customer', null),
  ('00000000-0000-0000-0000-0000000090cb', 'admin', null),
  ('00000000-0000-0000-0000-0000000090c2', 'merchant', 'RS-M01'),
  ('00000000-0000-0000-0000-0000000090c3', 'merchant', 'RS-M02'),
  ('00000000-0000-0000-0000-0000000090c8', 'merchant', 'RS-M04'),
  ('00000000-0000-0000-0000-0000000090c9', 'merchant', 'RS-M07'),
  ('00000000-0000-0000-0000-0000000090ca', 'merchant', 'RS-M05')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into service_areas (barangay, delivery_fee, fee_agreed_in_person)
values ('MS-Priced', 30.00, false);

insert into riders (id, name, email, user_id, city, status) values
  ('R-MS1', 'Multi Rider', 'ms-rider@example.test', '00000000-0000-0000-0000-0000000090c4', 'Kabankalan', 'online'),
  ('R-MS3', 'Second Rider', 'ms-rider2@example.test', '00000000-0000-0000-0000-0000000090c7', 'Kabankalan', 'online');

-- --------------------------------------------------------------------------
-- 1. Pricing: one shop, three shops, ten shops, and the eleventh refused
-- --------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);

-- One shop: the barangay rate, nothing more.
do $$
declare v_q record;
begin
  select * into v_q
    from quote_delivery(jsonb_build_array(
      jsonb_build_object('restaurant_id', 'RS-M01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M01', 'quantity', 1)))
    ), 'MS-Priced');

  if v_q.shop_count <> 1 or v_q.subtotal <> 100 or v_q.delivery_fee <> 30
     or v_q.service_fee <> 5 or v_q.total <> 135 then
    raise exception 'FAIL one-shop quote wrong: % % % % %',
      v_q.shop_count, v_q.subtotal, v_q.delivery_fee, v_q.service_fee, v_q.total;
  end if;
  if v_q.shops -> 0 ->> 'restaurant' <> 'Kusina 1' then
    raise exception 'FAIL the quote did not name the shop';
  end if;
  raise notice 'PASS one shop is priced at the barangay rate';
end $$;

-- Three shops: the rate plus 10.00 for each extra shop, and the service fee
-- charged ONCE.
do $$
declare v_q record;
begin
  select * into v_q
    from quote_delivery((
      select jsonb_agg(jsonb_build_object(
        'restaurant_id', r.id,
        'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M' || substr(r.id, 5), 'quantity', 1))
      ) order by r.id)
      from (select id from restaurants where id in ('RS-M01', 'RS-M02', 'RS-M03')) r
    ), 'MS-Priced');

  if v_q.shop_count <> 3 or v_q.subtotal <> 300 then
    raise exception 'FAIL three-shop quote counted wrong: % %', v_q.shop_count, v_q.subtotal;
  end if;
  if v_q.delivery_fee <> 50 then
    raise exception 'FAIL three-shop delivery fee wrong: % (expected 30 + 2 x 10)', v_q.delivery_fee;
  end if;
  if v_q.service_fee <> 5 then
    raise exception 'FAIL the service fee is not charged once: %', v_q.service_fee;
  end if;
  if v_q.total <> 355 then
    raise exception 'FAIL three-shop total wrong: %', v_q.total;
  end if;
  raise notice 'PASS three shops cost the rate plus 10.00 per extra shop, service fee once';
end $$;

-- Ten shops: nine extra stops.
do $$
declare v_q record;
begin
  select * into v_q
    from quote_delivery((
      select jsonb_agg(jsonb_build_object(
        'restaurant_id', r.id,
        'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M' || substr(r.id, 5), 'quantity', 1))
      ) order by r.id)
      from (select id from restaurants where id ~ '^RS-M(0[1-9]|10)$') r
    ), 'MS-Priced');

  if v_q.shop_count <> 10 or v_q.subtotal <> 1000 then
    raise exception 'FAIL ten-shop quote counted wrong: % %', v_q.shop_count, v_q.subtotal;
  end if;
  if v_q.delivery_fee <> 120 then
    raise exception 'FAIL ten-shop delivery fee wrong: % (expected 30 + 9 x 10)', v_q.delivery_fee;
  end if;
  if v_q.total <> 1125 then
    raise exception 'FAIL ten-shop total wrong: %', v_q.total;
  end if;
  raise notice 'PASS ten shops cost the rate plus nine extra stops';
end $$;

-- The eleventh shop is refused, in the quote and at the till.
do $$
begin
  perform quote_delivery((
    select jsonb_agg(jsonb_build_object(
      'restaurant_id', r.id,
      'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M' || substr(r.id, 5), 'quantity', 1))
    ) order by r.id)
    from (select id from restaurants where id like 'RS-M%') r
  ), 'MS-Priced');
  raise exception 'FAIL eleven shops were quoted';
exception when others then
  if sqlerrm not like '%at most 10 restaurants%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS the eleventh shop is refused';
end $$;

do $$
begin
  perform customer_place_delivery((
    select jsonb_agg(jsonb_build_object(
      'restaurant_id', r.id,
      'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M' || substr(r.id, 5), 'quantity', 1))
    ) order by r.id)
    from (select id from restaurants where id like 'RS-M%') r
  ), '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-eleven', 'MS-Priced');
  raise exception 'FAIL eleven shops were placed';
exception when others then
  if sqlerrm not like '%at most 10 restaurants%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS eleven shops are refused at the till';
end $$;

-- --------------------------------------------------------------------------
-- 2. Placing a two-shop trip
-- --------------------------------------------------------------------------

create temporary table ms_placed as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-M01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M01', 'quantity', 1))),
    jsonb_build_object('restaurant_id', 'RS-M02', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M02', 'quantity', 1)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-two-shops', 'MS-Priced');

do $$
begin
  if (select count(*) from ms_placed) <> 1 then
    raise exception 'FAIL placing did not return one trip';
  end if;
  -- The trip: both shops, the rate plus one extra stop, one service fee.
  if (select shops from deliveries where id = (select delivery_id from ms_placed)) <> 2 then
    raise exception 'FAIL the trip does not count two shops';
  end if;
  if (select subtotal from deliveries where id = (select delivery_id from ms_placed)) <> 200 then
    raise exception 'FAIL the trip subtotal is wrong';
  end if;
  if (select delivery_fee from deliveries where id = (select delivery_id from ms_placed)) <> 40 then
    raise exception 'FAIL the trip delivery fee is wrong';
  end if;
  if (select service_fee from deliveries where id = (select delivery_id from ms_placed)) <> 5 then
    raise exception 'FAIL the trip service fee is wrong';
  end if;
  if (select total from deliveries where id = (select delivery_id from ms_placed)) <> 245 then
    raise exception 'FAIL the trip total is wrong: %', (select total from deliveries where id = (select delivery_id from ms_placed));
  end if;
  if (select status from deliveries where id = (select delivery_id from ms_placed)) <> 'pending' then
    raise exception 'FAIL a new trip is not pending';
  end if;

  -- The shops: each part carries its own food, and its share of the trip's
  -- fees (0094), so every peso is counted once by the books that read
  -- order.total.
  if (select count(*) from orders where delivery_id = (select delivery_id from ms_placed)) <> 2 then
    raise exception 'FAIL the trip did not create one order per shop';
  end if;
  if exists (
    select 1 from orders
     where delivery_id = (select delivery_id from ms_placed)
       and (subtotal <> 100 or total <> subtotal + delivery_fee + service_fee)
  ) then
    raise exception 'FAIL a shop''s order does not add up';
  end if;
  if (select sum(total) from orders where delivery_id = (select delivery_id from ms_placed))
       <> (select total from deliveries where id = (select delivery_id from ms_placed)) then
    raise exception 'FAIL the shops'' totals do not add up to the trip''s total';
  end if;
  if (select sum(delivery_fee) from orders where delivery_id = (select delivery_id from ms_placed))
       <> (select delivery_fee from deliveries where id = (select delivery_id from ms_placed)) then
    raise exception 'FAIL the delivery fee was not shared between the shops';
  end if;
  if (select sum(service_fee) from orders where delivery_id = (select delivery_id from ms_placed))
       <> (select service_fee from deliveries where id = (select delivery_id from ms_placed)) then
    raise exception 'FAIL the service fee was not shared between the shops';
  end if;
  if (select count(distinct restaurant_id) from orders where delivery_id = (select delivery_id from ms_placed)) <> 2 then
    raise exception 'FAIL the two parts are not two different shops';
  end if;
  raise notice 'PASS one trip, two shops, one bill';
end $$;

-- A retry with the same request id returns the same trip and adds nothing.
do $$
declare v_again record;
begin
  select * into v_again
    from customer_place_delivery(
      jsonb_build_array(
        jsonb_build_object('restaurant_id', 'RS-M01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M01', 'quantity', 1))),
        jsonb_build_object('restaurant_id', 'RS-M02', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M02', 'quantity', 1)))
      ),
      '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-two-shops', 'MS-Priced');

  if v_again.delivery_id <> (select delivery_id from ms_placed) then
    raise exception 'FAIL the retry created a second trip';
  end if;
  if (select count(*) from orders where delivery_id = (select delivery_id from ms_placed)) <> 2 then
    raise exception 'FAIL the retry added orders';
  end if;
  raise notice 'PASS a retry returns the same trip';
end $$;

-- --------------------------------------------------------------------------
-- 3. The shops accept: the trip goes to the riders, once
-- --------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c2","role":"authenticated"}', true);

-- The first shop accepts: not everyone has, so nothing is offered yet.
update orders set status = 'confirmed'
 where delivery_id = (select delivery_id from ms_placed) and restaurant_id = 'RS-M01';

-- The offers table is the server's business: no client reads it, so the
-- check runs with the client's privileges lifted.
reset role;
do $$
begin
  if exists (select 1 from delivery_offers where delivery_id = (select delivery_id from ms_placed)) then
    raise exception 'FAIL the trip was offered before every shop accepted';
  end if;
  if exists (select 1 from order_offers where order_id in (select id from orders where delivery_id = (select delivery_id from ms_placed))) then
    raise exception 'FAIL a part of a trip was offered on its own';
  end if;
  raise notice 'PASS a trip waits for every shop';
end $$;

set local role authenticated;
-- The second shop accepts: now the trip is offered, to the online riders in
-- the city only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c3","role":"authenticated"}', true);
update orders set status = 'confirmed'
 where delivery_id = (select delivery_id from ms_placed) and restaurant_id = 'RS-M02';

reset role;
do $$
begin
  if (select count(*) from delivery_offers where delivery_id = (select delivery_id from ms_placed) and status = 'offered') <> 2 then
    raise exception 'FAIL the trip was not offered to the online riders';
  end if;
  if exists (select 1 from delivery_offers where delivery_id = (select delivery_id from ms_placed) and rider_id not in ('R-MS1', 'R-MS3')) then
    raise exception 'FAIL the trip was offered to a rider who cannot take it';
  end if;
  if (select status from deliveries where id = (select delivery_id from ms_placed)) <> 'confirmed' then
    raise exception 'FAIL the trip is not confirmed';
  end if;
  raise notice 'PASS an accepted trip is offered to riders once';
end $$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- 4. One rider claims the whole trip
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);

do $$
declare v_claim record;
begin
  select * into v_claim from claim_delivery((select delivery_id from ms_placed));

  if v_claim.delivery_id <> (select delivery_id from ms_placed) then
    raise exception 'FAIL claiming returned another trip';
  end if;
  if (select rider_id from deliveries where id = (select delivery_id from ms_placed)) <> 'R-MS1' then
    raise exception 'FAIL the trip has no rider';
  end if;
  -- The parts follow the rider, and the payout is frozen per stop.
  if (select count(*) from orders where delivery_id = (select delivery_id from ms_placed) and rider_id = 'R-MS1') <> 2 then
    raise exception 'FAIL the shops did not follow the rider';
  end if;
  if (select count(*) from orders where delivery_id = (select delivery_id from ms_placed) and rider_payout = 25.00) <> 2 then
    raise exception 'FAIL the per-stop payout was not frozen';
  end if;
  if (select rider_payout from deliveries where id = (select delivery_id from ms_placed)) <> 50.00 then
    raise exception 'FAIL the trip payout is not the sum of its stops';
  end if;
  raise notice 'PASS one rider claims the whole trip, paid per stop';
end $$;

-- A second rider cannot take it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c7","role":"authenticated"}', true);
do $$
begin
  perform claim_delivery((select delivery_id from ms_placed));
  raise exception 'FAIL the trip was claimed twice';
exception when others then
  if sqlerrm not like '%no longer available%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a claimed trip cannot be claimed again';
end $$;

-- The trip cannot be closed while a shop's food is still on the counter: the
-- rider would be paid for a stop they never made. The photo has to be in the
-- bucket first, or the server stops at the photo check before it reaches the
-- rule under test.
reset role;
insert into storage.objects (bucket_id, name)
select 'delivery-proofs', 'R-MS1/' || delivery_id || '.jpg' from ms_placed;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);
do $$
begin
  perform rider_mark_delivery_delivered(
    (select delivery_id from ms_placed),
    'R-MS1/' || (select delivery_id from ms_placed) || '.jpg',
    245);
  raise exception 'FAIL the trip was closed with a shop still to collect';
exception when others then
  if sqlerrm not like '%every restaurant%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a trip cannot be closed before every shop is collected';
end $$;

-- --------------------------------------------------------------------------
-- 5. Pickup per shop, one delivery
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);

create temporary table ms_parts as
select id, restaurant_id from orders
 where delivery_id = (select delivery_id from ms_placed)
 order by reference
 limit 1;

select * from rider_mark_picked_up((select id from ms_parts));
-- The other shop too: a trip is closed only when every bag is with the rider.
select * from rider_mark_picked_up((
  select id from orders
   where delivery_id = (select delivery_id from ms_placed)
     and id <> (select id from ms_parts)
));

do $$
begin
  if (select status from orders where id = (select id from ms_parts)) <> 'out_for_delivery' then
    raise exception 'FAIL the shop was not marked picked up';
  end if;
  if exists (
    select 1 from orders
     where delivery_id = (select delivery_id from ms_placed)
       and status <> 'out_for_delivery'
  ) then
    raise exception 'FAIL a shop was not marked picked up';
  end if;
  if (select status from deliveries where id = (select delivery_id from ms_placed)) <> 'out_for_delivery' then
    raise exception 'FAIL the trip is not out for delivery';
  end if;
  raise notice 'PASS pickup is marked per shop and the trip follows';
end $$;

-- --------------------------------------------------------------------------
-- 6. Cash variance against the GRAND total, and the payouts
-- --------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);

-- 240 taken against a 245 total is a 5 short.
select rider_mark_delivery_delivered(
  (select delivery_id from ms_placed),
  'R-MS1/' || (select delivery_id from ms_placed) || '.jpg',
  240);

do $$
begin
  if (select status from deliveries where id = (select delivery_id from ms_placed)) <> 'delivered' then
    raise exception 'FAIL the trip is not delivered';
  end if;
  if exists (select 1 from orders where delivery_id = (select delivery_id from ms_placed) and status <> 'delivered') then
    raise exception 'FAIL a shop was not delivered with the trip';
  end if;
  -- The rider's own books: one trip, one cash collection.
  if (select on_hand from rider_cash_position()) <> 240 then
    raise exception 'FAIL the rider''s on-hand cash is wrong: %', (select on_hand from rider_cash_position());
  end if;
  if (select flagged from rider_cash_position()) <> 5 then
    raise exception 'FAIL the short collection is not flagged';
  end if;
  if (select deliveries from rider_cash_position()) <> 1 then
    raise exception 'FAIL a trip with two stops counted as two deliveries';
  end if;
  raise notice 'PASS the trip is delivered and the rider''s books add up';
end $$;

-- The cash ledger and the payouts are the server's tables: no client reads
-- them, so those checks run with the client's privileges lifted.
reset role;
do $$
begin
  -- One collection for the trip, against the grand total.
  if (select count(*) from delivery_cash_collections where delivery_id = (select delivery_id from ms_placed)) <> 1 then
    raise exception 'FAIL the trip did not record one cash collection';
  end if;
  if (select amount_expected from delivery_cash_collections where delivery_id = (select delivery_id from ms_placed)) <> 245 then
    raise exception 'FAIL the expected cash is not the trip total';
  end if;
  if (select variance from delivery_cash_collections where delivery_id = (select delivery_id from ms_placed)) <> -5 then
    raise exception 'FAIL the variance is not -5: %', (select variance from delivery_cash_collections where delivery_id = (select delivery_id from ms_placed));
  end if;
  if exists (select 1 from rider_cash_collections where order_id in (select id from orders where delivery_id = (select delivery_id from ms_placed))) then
    raise exception 'FAIL a shop recorded its own cash collection';
  end if;
  -- One payout row per stop, all pointing at the trip.
  if (select count(*) from rider_payouts where delivery_id = (select delivery_id from ms_placed)) <> 2 then
    raise exception 'FAIL the trip did not pay one row per stop';
  end if;
  if (select coalesce(sum(amount), 0) from rider_payouts where delivery_id = (select delivery_id from ms_placed)) <> 50 then
    raise exception 'FAIL the trip paid the wrong total';
  end if;
  raise notice 'PASS one delivery, one cash collection against the grand total, one payout per stop';
end $$;

set local role authenticated;

-- A photo of another trip is refused.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);
create temporary table ms_second as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-M03', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M03', 'quantity', 1)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-one-shop', 'MS-Priced');
-- The shop accepts and the trip is offered.
reset role;
update orders set status = 'confirmed' where delivery_id = (select delivery_id from ms_second);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c7","role":"authenticated"}', true);
select * from claim_delivery((select delivery_id from ms_second));
-- The food is collected, so the rule under test here is the photo's, not the
-- "collect every shop first" rule.
select * from rider_mark_picked_up((
  select id from orders where delivery_id = (select delivery_id from ms_second)
));

do $$
begin
  perform rider_mark_delivery_delivered(
    (select delivery_id from ms_second),
    'R-MS3/' || (select delivery_id from ms_placed) || '.jpg',
    135);
  raise exception 'FAIL another trip''s photo was accepted';
exception when others then
  if sqlerrm not like '%does not belong to this trip%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS another trip''s photo is refused';
end $$;

-- --------------------------------------------------------------------------
-- 7. A shop rejects: the trip is re-priced
-- --------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);
create temporary table ms_three as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-M04', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M04', 'quantity', 1))),
    jsonb_build_object('restaurant_id', 'RS-M05', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M05', 'quantity', 1)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-reject', 'MS-Priced');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c8","role":"authenticated"}', true);

-- The merchant of RS-M04 rejects its part.
update orders set status = 'cancelled', rejection_reason = 'Out of stock'
 where delivery_id = (select delivery_id from ms_three) and restaurant_id = 'RS-M04';

-- The trip is the server's row: the check runs with the client's privileges
-- lifted.
reset role;
do $$
begin
  if (select shops from deliveries where id = (select delivery_id from ms_three)) <> 1 then
    raise exception 'FAIL the trip still counts the shop that rejected';
  end if;
  -- The extra-shop surcharge goes away with it; the rate and the service fee
  -- stay.
  if (select delivery_fee from deliveries where id = (select delivery_id from ms_three)) <> 30 then
    raise exception 'FAIL the extra-shop surcharge survived the rejection: %', (select delivery_fee from deliveries where id = (select delivery_id from ms_three));
  end if;
  if (select service_fee from deliveries where id = (select delivery_id from ms_three)) <> 5 then
    raise exception 'FAIL the service fee was dropped';
  end if;
  if (select total from deliveries where id = (select delivery_id from ms_three)) <> 135 then
    raise exception 'FAIL the trip was not re-priced: %', (select total from deliveries where id = (select delivery_id from ms_three));
  end if;
  -- The shops' shares are re-cut: the extra-shop surcharge went with the shop
  -- that rejected, so the shops that are left carry the fees that are left.
  if (select sum(o.total) from orders o
       where o.delivery_id = (select delivery_id from ms_three)
         and o.status <> 'cancelled')
       <> (select total from deliveries where id = (select delivery_id from ms_three)) then
    raise exception 'FAIL the shops'' totals no longer add up to the re-priced trip';
  end if;
  if (select sum(o.delivery_fee + o.service_fee) from orders o
       where o.delivery_id = (select delivery_id from ms_three)
         and o.status <> 'cancelled')
       <> (select delivery_fee + service_fee from deliveries where id = (select delivery_id from ms_three)) then
    raise exception 'FAIL the fees were not re-cut after the rejection';
  end if;
  -- The shop that dropped out takes its share of the fees with it.
  if exists (
    select 1 from orders
     where delivery_id = (select delivery_id from ms_three)
       and status = 'cancelled'
       and (delivery_fee <> 0 or service_fee <> 0)
  ) then
    raise exception 'FAIL the shop that dropped out kept a share of the fees';
  end if;
  raise notice 'PASS a rejecting shop is dropped and the trip is re-priced';
end $$;

-- The other shop accepts: the smaller trip is offered.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090ca","role":"authenticated"}', true);
update orders set status = 'confirmed'
 where delivery_id = (select delivery_id from ms_three) and restaurant_id = 'RS-M05';

reset role;
do $$
begin
  if (select count(*) from delivery_offers where delivery_id = (select delivery_id from ms_three) and status = 'offered') < 1 then
    raise exception 'FAIL the re-priced trip was not offered';
  end if;
  raise notice 'PASS the re-priced trip is offered to riders';
end $$;

set local role authenticated;

-- A rejection after the rider has the food is refused: that is a refund, not
-- a re-price.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);
create temporary table ms_four as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-M06', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M06', 'quantity', 1))),
    jsonb_build_object('restaurant_id', 'RS-M07', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M07', 'quantity', 1)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-collected', 'MS-Priced');
create temporary table ms_four_part as
select id from orders where delivery_id = (select delivery_id from ms_four) and restaurant_id = 'RS-M06';

reset role;
update orders set status = 'confirmed' where delivery_id = (select delivery_id from ms_four);
set local role authenticated;
-- The rider takes the trip and collects the first shop.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);
select * from claim_delivery((select delivery_id from ms_four));
select * from rider_mark_picked_up((select id from ms_four_part));

-- Now the other shop tries to drop out.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c9","role":"authenticated"}', true);
do $$
begin
  update orders set status = 'cancelled', rejection_reason = 'Too late'
   where delivery_id = (select delivery_id from ms_four) and restaurant_id = 'RS-M07';
  raise exception 'FAIL a shop dropped out after the rider collected';
exception when others then
  if sqlerrm not like '%already on its way%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a shop cannot drop out once the rider has the food';
end $$;

-- --------------------------------------------------------------------------
-- 8. Who can see what
-- --------------------------------------------------------------------------

-- The customer sees their own trips.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from deliveries) <> 4 then
    raise exception 'FAIL the customer sees % trips, expected 4', (select count(*) from deliveries);
  end if;
  raise notice 'PASS the customer sees their own trips';
end $$;

-- A merchant sees its own parts, and no trip at all: the trip is not the
-- merchant's business, and it carries another shop's food.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from deliveries) <> 0 then
    raise exception 'FAIL a merchant can read a trip';
  end if;
  if (select count(*) from orders) <> 1 then
    raise exception 'FAIL a merchant sees % orders, expected its own 1', (select count(*) from orders);
  end if;
  raise notice 'PASS a merchant sees only its own parts, never the trip';
end $$;

-- A rider sees a trip only once it is theirs.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from deliveries) <> 2 then
    raise exception 'FAIL the rider sees % trips, expected the 2 it carries', (select count(*) from deliveries);
  end if;
  raise notice 'PASS a rider sees the trips it carries';
end $$;

-- Another customer sees nothing.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000090c6', 'ms-stranger@example.test', '{"phone":"09170000000"}');
insert into app_users (user_id, role, restaurant_id)
values ('00000000-0000-0000-0000-0000000090c6', 'customer', null)
on conflict (user_id) do update set role = excluded.role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c6","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from deliveries) <> 0 then
    raise exception 'FAIL another customer can read a trip';
  end if;
  if (select count(*) from orders) <> 0 then
    raise exception 'FAIL another customer can read an order';
  end if;
  raise notice 'PASS another customer sees nothing';
end $$;

-- --------------------------------------------------------------------------
-- 9. The customer can reach the rider on a trip
-- --------------------------------------------------------------------------

-- The reference the customer was given is the trip's, so the rider's contact
-- details have to be findable by it (0096). The trip used here is still under
-- way: a delivered trip has no rider to reach.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);
do $$
declare v_row record;
begin
  select * into v_row
    from order_rider_contact((select reference from deliveries where id = (select delivery_id from ms_four)));
  if v_row.rider_name is null then
    raise exception 'FAIL the customer cannot reach the rider on a trip';
  end if;
  raise notice 'PASS the customer can reach the rider on a trip';
end $$;

-- But only the trip's own customer.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c6","role":"authenticated"}', true);
do $$
begin
  if exists (
    select 1 from order_rider_contact((select reference from deliveries where id = (select delivery_id from ms_four)))
  ) then
    raise exception 'FAIL another customer can reach the rider on a trip';
  end if;
  raise notice 'PASS another customer cannot reach the rider on a trip';
end $$;

-- --------------------------------------------------------------------------
-- 10. The holes 0093 closed
-- --------------------------------------------------------------------------

-- A shop named twice is ONE shop: the extra-shop surcharge is not inflated,
-- and the two lines of the same item add up.
do $$
declare v_q record;
begin
  select * into v_q
    from quote_delivery(jsonb_build_array(
      jsonb_build_object('restaurant_id', 'RS-M01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M01', 'quantity', 1))),
      jsonb_build_object('restaurant_id', 'RS-M01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M01', 'quantity', 2)))
    ), 'MS-Priced');

  if v_q.shop_count <> 1 then
    raise exception 'FAIL the same shop was counted twice: %', v_q.shop_count;
  end if;
  if v_q.subtotal <> 300 then
    raise exception 'FAIL the merged lines are wrong: %', v_q.subtotal;
  end if;
  if v_q.delivery_fee <> 30 then
    raise exception 'FAIL the extra-shop surcharge was charged for one shop: %', v_q.delivery_fee;
  end if;
  raise notice 'PASS a shop named twice is one shop';
end $$;

-- The same, at the till: one order for the shop, and the trip's subtotal is
-- the sum of the orders' subtotals.
--
-- The customer already has three trips on the way, which is the cap, so the
-- one-shop trip from earlier is dropped first: its only shop cancels, and a
-- trip whose last shop drops out is cancelled with it.
reset role;
update orders set status = 'cancelled', rejection_reason = 'Test cleanup'
 where delivery_id = (select delivery_id from ms_second);
do $$
begin
  if (select status from deliveries where id = (select delivery_id from ms_second)) <> 'cancelled' then
    raise exception 'FAIL a trip whose only shop dropped out was not cancelled';
  end if;
  raise notice 'PASS a trip whose only shop drops out is cancelled';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c1","role":"authenticated"}', true);
create temporary table ms_same_shop as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-M08', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M08', 'quantity', 1))),
    jsonb_build_object('restaurant_id', 'RS-M08', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-M08', 'quantity', 2)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'ms-same-shop', 'MS-Priced');

reset role;
do $$
begin
  if (select shops from deliveries where id = (select delivery_id from ms_same_shop)) <> 1 then
    raise exception 'FAIL the trip counts the same shop twice';
  end if;
  if (select count(*) from orders where delivery_id = (select delivery_id from ms_same_shop)) <> 1 then
    raise exception 'FAIL the trip made two orders for one shop';
  end if;
  if (select subtotal from deliveries where id = (select delivery_id from ms_same_shop))
       <> (select sum(subtotal) from orders where delivery_id = (select delivery_id from ms_same_shop)) then
    raise exception 'FAIL the trip''s subtotal is not the sum of its shops';
  end if;
  if (select total from deliveries where id = (select delivery_id from ms_same_shop)) <> 335 then
    raise exception 'FAIL the trip was priced wrong: %', (select total from deliveries where id = (select delivery_id from ms_same_shop));
  end if;
  raise notice 'PASS the trip''s subtotal is the sum of its shops';
end $$;

-- A part of a trip cannot be claimed on its own: a rider who claimed one
-- shop would be left holding one kitchen's food with no trip around it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);
do $$
begin
  perform claim_order((select id from orders where delivery_id = (select delivery_id from ms_placed) limit 1));
  raise exception 'FAIL a part of a trip was claimed';
exception when others then
  if sqlerrm not like '%part of a delivery%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a part of a trip cannot be claimed';
end $$;

-- Nor dispatched on its own by an admin.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090cb","role":"authenticated"}', true);
do $$
begin
  perform admin_dispatch_order((select id from orders where delivery_id = (select delivery_id from ms_placed) limit 1));
  raise exception 'FAIL a part of a trip was dispatched';
exception when others then
  if sqlerrm not like '%Dispatch the delivery instead%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a part of a trip cannot be dispatched';
end $$;

-- The trip's shops are not everybody's business.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c6","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from delivery_stops((select delivery_id from ms_placed))) then
    raise exception 'FAIL another customer read a trip''s shops';
  end if;
  raise notice 'PASS another customer cannot read a trip''s shops';
end $$;

-- The rider carrying it can.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000090c4","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from delivery_stops((select delivery_id from ms_placed))) < 1 then
    raise exception 'FAIL the rider cannot read the shops of the trip they carry';
  end if;
  raise notice 'PASS the rider reads the shops of the trip they carry';
end $$;

rollback;
