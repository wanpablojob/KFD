\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- The contact number belongs to the delivery (0098)
-- --------------------------------------------------------------------------
--
-- customer_place_order and customer_place_delivery used to read the number
-- from the customer's auth account, so the app had to write the chosen
-- address's number into the account before every checkout -- which quietly
-- replaced the customer's own number with the one they gave for an address.
-- Both now take the number for this delivery, validate it, and leave the
-- account alone.
--
-- Fixtures: one customer whose account carries a number, one kitchen, one
-- priced barangay.
-- --------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000098c1', 'cp-customer@example.test', '{"name":"Phone Customer","phone":"09170000000"}');

insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes)
values ('RS-CP01', 'Kusina CP', 'Filipino', 'Kabankalan', true, 'active', 10);

insert into menu_items (id, restaurant, restaurant_id, name, category, price, available)
values ('MI-CP01', 'Kusina CP', 'RS-CP01', 'Set 1', 'Mains', 100.00, true);

insert into app_users (user_id, role, restaurant_id)
values ('00000000-0000-0000-0000-0000000098c1', 'customer', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into service_areas (barangay, delivery_fee, fee_agreed_in_person)
values ('CP-Priced', 30.00, false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000098c1","role":"authenticated"}', true);

-- --------------------------------------------------------------------------
-- 1. The trip carries the number given for it
-- --------------------------------------------------------------------------

create temporary table cp_placed as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-CP01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-CP01', 'quantity', 1)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'cp-one', 'CP-Priced', '0917 555 1234');

do $$
begin
  if (select count(*) from cp_placed) <> 1 then
    raise exception 'FAIL placing did not return one trip';
  end if;
  if (select customer_phone from deliveries where id = (select delivery_id from cp_placed)) <> '0917 555 1234' then
    raise exception 'FAIL the trip does not carry the number given for it: %',
      (select customer_phone from deliveries where id = (select delivery_id from cp_placed));
  end if;
  if exists (
    select 1 from orders
     where delivery_id = (select delivery_id from cp_placed)
       and customer_phone <> '0917 555 1234'
  ) then
    raise exception 'FAIL a shop''s order does not carry the number given for it';
  end if;
  raise notice 'PASS the trip carries the number given for it';
end $$;

-- The account keeps its own number: choosing an address must not rewrite it.
reset role;
do $$
begin
  if (select raw_user_meta_data ->> 'phone' from auth.users where id = '00000000-0000-0000-0000-0000000098c1')
       <> '09170000000' then
    raise exception 'FAIL the account''s number was changed';
  end if;
  raise notice 'PASS the account keeps its own number';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000098c1","role":"authenticated"}', true);

-- --------------------------------------------------------------------------
-- 2. A number that cannot be dialled is refused, and nothing is placed
-- --------------------------------------------------------------------------

do $$
begin
  perform customer_place_delivery(
    jsonb_build_array(
      jsonb_build_object('restaurant_id', 'RS-CP01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-CP01', 'quantity', 1)))
    ),
    '12 Katipunan St., Barangay Poblacion', 'cash', 'cp-bad', 'CP-Priced', '123');
  raise exception 'FAIL a number with too few digits was accepted';
exception when others then
  if sqlerrm not like '%valid contact number%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a number that cannot be dialled is refused';
end $$;

do $$
begin
  if (select count(*) from deliveries where customer_user_id = '00000000-0000-0000-0000-0000000098c1') <> 1 then
    raise exception 'FAIL the refused order was placed anyway';
  end if;
  raise notice 'PASS a refused number leaves no trip behind';
end $$;

-- --------------------------------------------------------------------------
-- 3. No number sent: the account's number is the fallback
-- --------------------------------------------------------------------------

create temporary table cp_fallback as
select * from customer_place_delivery(
  jsonb_build_array(
    jsonb_build_object('restaurant_id', 'RS-CP01', 'items', jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-CP01', 'quantity', 1)))
  ),
  '12 Katipunan St., Barangay Poblacion', 'cash', 'cp-fallback', 'CP-Priced', null);

do $$
begin
  if (select customer_phone from deliveries where id = (select delivery_id from cp_fallback)) <> '09170000000' then
    raise exception 'FAIL the account''s number was not used as the fallback: %',
      (select customer_phone from deliveries where id = (select delivery_id from cp_fallback));
  end if;
  raise notice 'PASS the account''s number is the fallback';
end $$;

-- --------------------------------------------------------------------------
-- 4. The single-shop order takes the number too
-- --------------------------------------------------------------------------

create temporary table cp_order as
select * from customer_place_order(
  'RS-CP01',
  jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-CP01', 'quantity', 1)),
  '12 Katipunan St., Barangay Poblacion',
  'cash',
  'cp-single',
  'CP-Priced',
  '0918 999 8888');

do $$
begin
  if (select count(*) from cp_order) <> 1 then
    raise exception 'FAIL placing did not return one order';
  end if;
  if (select customer_phone from orders where id = (select order_id from cp_order)) <> '0918 999 8888' then
    raise exception 'FAIL the order does not carry the number given for it: %',
      (select customer_phone from orders where id = (select order_id from cp_order));
  end if;
  raise notice 'PASS the order carries the number given for it';
end $$;

-- And a bad number is refused there too.
do $$
begin
  perform customer_place_order(
    'RS-CP01',
    jsonb_build_array(jsonb_build_object('menu_item_id', 'MI-CP01', 'quantity', 1)),
    '12 Katipunan St., Barangay Poblacion',
    'cash',
    'cp-single-bad',
    'CP-Priced',
    'not a number');
  raise exception 'FAIL a number that is not a number was accepted';
exception when others then
  if sqlerrm not like '%valid contact number%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS a number that is not a number is refused';
end $$;

rollback;
