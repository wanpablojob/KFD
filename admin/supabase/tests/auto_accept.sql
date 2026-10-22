\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- An order is accepted by placing it (0121)
-- --------------------------------------------------------------------------
--
-- A shop that is busy must not be able to strand an order: the order is
-- accepted the moment it is placed, the rider is offered it at once, and the
-- shop can still cancel. A shop that wants the gate back gets it -- and even
-- then the order is accepted after five minutes, so it can never strand the
-- customer.
-- --------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ac01', 'auto-c@example.test', '{"name":"Auto Customer","phone":"09171234567"}'),
  ('00000000-0000-0000-0000-00000000ac02', 'auto-m@example.test', '{}'),
  ('00000000-0000-0000-0000-00000000ac03', 'auto-r@example.test', '{}'),
  ('00000000-0000-0000-0000-00000000ac04', 'auto-m2@example.test', '{}');

-- Two kitchens: one takes orders automatically, one keeps the gate.
insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes, auto_accept)
values
  ('RS-AUTO', 'Auto Kitchen', 'Filipino', 'Kabankalan', true, 'active', 15, true),
  ('RS-GATE', 'Gated Kitchen', 'Filipino', 'Kabankalan', true, 'active', 15, false);

insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-00000000ac01', 'customer', null),
  ('00000000-0000-0000-0000-00000000ac02', 'merchant', 'RS-AUTO'),
  ('00000000-0000-0000-0000-00000000ac04', 'merchant', 'RS-GATE')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into menu_items (id, restaurant, restaurant_id, name, category, price, available) values
  ('MI-AUTO', 'Auto Kitchen', 'RS-AUTO', 'Set A', 'Mains', 100.00, true),
  ('MI-GATE', 'Gated Kitchen', 'RS-GATE', 'Set G', 'Mains', 100.00, true);

insert into service_areas (barangay, delivery_fee, fee_agreed_in_person)
values ('Auto', 30.00, false);

insert into riders (id, name, email, user_id, city, status) values
  ('R-AUTO', 'Auto Rider', 'auto-r@example.test', '00000000-0000-0000-0000-00000000ac03', 'Kabankalan', 'online');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac01","role":"authenticated"}', true);

-- 1. The order at the busy kitchen is accepted as it is placed.
create temporary table auto_placed as
select * from customer_place_order(
  'RS-AUTO', '[{"menu_item_id":"MI-AUTO","quantity":1}]'::jsonb,
  '12 Katipunan St., Barangay Poblacion', 'cash', 'auto-request-1', 'Auto', '09171234567');

reset role;
do $$
declare v_status text;
begin
  select status::text into v_status from orders where id = (select order_id from auto_placed);
  if v_status <> 'confirmed' then
    raise exception 'FAIL the order was not accepted when it was placed: %', v_status;
  end if;
  raise notice 'PASS an order at a busy kitchen is accepted when it is placed';
end $$;

reset role;
-- 2. And the rider is offered it at once: the whole point of accepting it.
do $$
begin
  if not exists (
    select 1 from order_offers f
      join orders o on o.id = f.order_id
     where o.id = (select order_id from auto_placed)
       and f.rider_id = 'R-AUTO'
       and f.status = 'offered'
  ) then
    raise exception 'FAIL the rider was not offered the accepted order';
  end if;
  raise notice 'PASS the rider is offered the order as soon as it is placed';
end $$;
set local role authenticated;

-- 3. The customer can still call it off: the kitchen has not started it.
do $$
begin
  perform cancel_order((select order_id from auto_placed));
  if (select status::text from orders where id = (select order_id from auto_placed)) <> 'cancelled' then
    raise exception 'FAIL the customer could not cancel an order the kitchen had not started';
  end if;
  raise notice 'PASS the customer can cancel an order the kitchen has not started';
end $$;

-- 4. The kitchen that wants the gate gets it: its order waits, and no rider
--    is offered it.
create temporary table gate_placed as
select * from customer_place_order(
  'RS-GATE', '[{"menu_item_id":"MI-GATE","quantity":1}]'::jsonb,
  '12 Katipunan St., Barangay Poblacion', 'cash', 'gate-request-1', 'Auto', '09171234567');

reset role;
do $$
begin
  if (select status::text from orders where id = (select order_id from gate_placed)) <> 'pending' then
    raise exception 'FAIL the gated order was not left for the shop';
  end if;
  if exists (
    select 1 from order_offers f
     where f.order_id = (select order_id from gate_placed)
  ) then
    raise exception 'FAIL a gated order was offered to a rider';
  end if;
  raise notice 'PASS a shop that keeps the gate gets its order in front of it';
end $$;
set local role authenticated;
set local role authenticated;

reset role;
-- 5. But it cannot strand the customer: the sweep accepts it after five
--    minutes, and the rider is offered it.
do $$
declare v_before timestamptz; v_count int;
begin
  -- Five minutes and a minute ago: the order is older than the window.
  update orders set placed_at = now() - interval '6 minutes'
   where id = (select order_id from gate_placed);

  v_before := now();
  select public.auto_accept_pending_orders() into v_count;

  if v_count < 1 then
    raise exception 'FAIL the sweep accepted nothing';
  end if;
  if (select status::text from orders where id = (select order_id from gate_placed)) <> 'confirmed' then
    raise exception 'FAIL the gated order was not accepted by the sweep';
  end if;
  if not exists (
    select 1 from order_offers f
     where f.order_id = (select order_id from gate_placed)
       and f.status = 'offered'
  ) then
    raise exception 'FAIL the accepted order was not offered to a rider';
  end if;
  raise notice 'PASS a gated order is accepted after five minutes and offered to the riders';
end $$;
set local role authenticated;

-- 6. And the customer cannot cancel it afterwards: the shop has it now.
do $$
begin
  perform cancel_order((select order_id from gate_placed));
  raise exception 'FAIL the customer cancelled an order the shop had accepted';
exception when others then
  if sqlerrm not like '%already accepted%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a customer cannot cancel an order the shop has accepted';
end $$;

-- 7. A basket from several shops: every part is accepted as it is written,
--    and the trip is offered once -- not before the last shop is in.
reset role;
insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes, auto_accept)
values ('RS-T1', 'Trip One', 'Filipino', 'Kabankalan', true, 'active', 10, true),
       ('RS-T2', 'Trip Two', 'Filipino', 'Kabankalan', true, 'active', 10, true);
insert into menu_items (id, restaurant, restaurant_id, name, category, price, available) values
  ('MI-T1', 'Trip One', 'RS-T1', 'Set T1', 'Mains', 100.00, true),
  ('MI-T2', 'Trip Two', 'RS-T2', 'Set T2', 'Mains', 100.00, true);
set local role authenticated;

create temporary table trip_placed as
select * from customer_place_delivery(
  '[{"restaurant_id":"RS-T1","items":[{"menu_item_id":"MI-T1","quantity":1}]},{"restaurant_id":"RS-T2","items":[{"menu_item_id":"MI-T2","quantity":1}]}]'::jsonb,
  '12 Katipunan St., Barangay Poblacion', 'cash', 'auto-trip-request', 'Auto', '09171234567');

reset role;
do $$
begin
  if exists (
    select 1 from orders o
     where o.delivery_id = (select delivery_id from trip_placed)
       and o.status <> 'confirmed'
  ) then
    raise exception 'FAIL a shop''s part was not accepted when the basket was placed';
  end if;
  if (select shops from deliveries where id = (select delivery_id from trip_placed)) <> 2 then
    raise exception 'FAIL the trip does not count both shops';
  end if;
  if not exists (
    select 1 from delivery_offers f
     where f.delivery_id = (select delivery_id from trip_placed)
       and f.status = 'offered'
  ) then
    raise exception 'FAIL the trip was not offered to the riders';
  end if;
  raise notice 'PASS a basket from busy kitchens is accepted and offered as one trip';
end $$;
set local role authenticated;

-- 9. A basket with one busy shop in it: the trip waits for that shop, and
--    goes out as a whole once it answers or the sweep answers for it.
reset role;
insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes, auto_accept)
values ('RS-T3', 'Trip Three', 'Filipino', 'Kabankalan', true, 'active', 10, false);
insert into menu_items (id, restaurant, restaurant_id, name, category, price, available)
values ('MI-T3', 'Trip Three', 'RS-T3', 'Set T3', 'Mains', 100.00, true);
set local role authenticated;

create temporary table gated_trip as
select * from customer_place_delivery(
  '[{"restaurant_id":"RS-T1","items":[{"menu_item_id":"MI-T1","quantity":1}]},{"restaurant_id":"RS-T3","items":[{"menu_item_id":"MI-T3","quantity":1}]}]'::jsonb,
  '12 Katipunan St., Barangay Poblacion', 'cash', 'gated-trip-request', 'Auto', '09171234567');

reset role;
do $$
begin
  -- One shop took it, one is busy: the trip is not out yet.
  if (select status from deliveries where id = (select delivery_id from gated_trip)) <> 'pending' then
    raise exception 'FAIL the trip went out while a shop was still deciding';
  end if;
  if exists (
    select 1 from delivery_offers f
     where f.delivery_id = (select delivery_id from gated_trip)
  ) then
    raise exception 'FAIL the trip was offered while a shop was still deciding';
  end if;
  raise notice 'PASS a trip waits for the busy shop in it';
end $$;

-- The busy shop's part is accepted by the sweep, and the whole trip goes out.
update orders set placed_at = now() - interval '6 minutes'
 where delivery_id = (select delivery_id from gated_trip)
   and restaurant_id = 'RS-T3';
select public.auto_accept_pending_orders();

set local role authenticated;
do $$
begin
  if (select status from deliveries where id = (select delivery_id from gated_trip)) <> 'confirmed' then
    raise exception 'FAIL the trip was not confirmed after the sweep';
  end if;
  raise notice 'PASS the trip goes out as a whole once the busy shop answers';
end $$;

reset role;
do $$
begin
  if not exists (
    select 1 from delivery_offers f
     where f.delivery_id = (select delivery_id from gated_trip)
       and f.status = 'offered'
  ) then
    raise exception 'FAIL the trip was not offered to the riders';
  end if;
  raise notice 'PASS the whole trip is offered to the riders';
end $$;

-- 8. The shop's own switch.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac02","role":"authenticated"}', true);
do $$
declare v_now boolean;
begin
  select public.merchant_set_auto_accept(false) into v_now;
  if v_now is not false then
    raise exception 'FAIL the switch did not turn auto-accept off';
  end if;
  if (select auto_accept from restaurants where id = 'RS-AUTO') is not false then
    raise exception 'FAIL the switch did not change the shop';
  end if;
  select public.merchant_set_auto_accept(true) into v_now;
  if (select auto_accept from restaurants where id = 'RS-AUTO') is not true then
    raise exception 'FAIL the switch did not turn auto-accept back on';
  end if;
  raise notice 'PASS a shop can turn automatic acceptance on and off';
end $$;

rollback;
