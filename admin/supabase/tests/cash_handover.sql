\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into riders (id, name, email) values ('R-T1', 'Test Rider', 'rider@example.test');
-- Two orders' worth of collections, bypassing the order flow: only the balance math is under test.
alter table rider_cash_collections drop constraint rider_cash_collections_order_id_fkey;
insert into rider_cash_collections (rider_id, order_id, amount_expected, amount_collected, variance)
values ('R-T1', 'O-1', 100, 100, 0), ('R-T1', 'O-2', 100, 90, -10);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
-- Two deliveries: KFD is owed 20 each, 40 in all (0151), whatever was collected.
do $$ begin
  if (select string_agg(reference || '=' || amount, ',' order by reference)
        from admin_rider_cash_orders() where rider_id = 'R-T1') is not null then
    raise exception 'FAIL orders without a reference row should not be listed';
  end if;
end $$;
-- Hand over 15 -> 25 left; 25 is allowed exactly.
select admin_record_cash_handover('R-T1', 15, 'first') is not null as handover_1;
select admin_record_cash_handover('R-T1', 25, 'rest') is not null as handover_2;
-- Now 0 on hand: 0.01 must be refused with a readable amount.
do $$ begin
  perform admin_record_cash_handover('R-T1', 0.01, 'over');
  raise exception 'FAIL: over-handover accepted';
exception when others then
  if sqlerrm not like '%(0.00 on hand)%' then raise exception 'FAIL: message was %', sqlerrm; end if;
  raise notice 'PASS refused: %', sqlerrm;
end $$;
do $$ begin
  if (select collected::text || '|' || handed_over || '|' || on_hand || '|' || flagged
        from admin_rider_cash() where rider_id = 'R-T1') <> '190.00|40.00|0.00|10.00' then
    raise exception 'FAIL admin cash roster totals wrong';
  end if;
  raise notice 'PASS admin cash roster totals';
end $$;

-- --------------------------------------------------------------------------
-- A rider who did a trip (0110)
--
-- A trip is one delivery the customer paid one bill for, and its cash lands in
-- delivery_cash_collections rather than rider_cash_collections. The admin
-- roster counts both, so it says the rider is holding all of it -- and the
-- handover check used to count only the order money, so the admin was refused
-- with "That is more than the rider is holding" for cash the roster said was
-- there. The check and the roster have to agree.
-- --------------------------------------------------------------------------
insert into riders (id, name, email) values ('R-T2', 'Trip Rider', 'trip@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'trip-customer@example.test');
-- The trip itself, so delivery_cash_collections has a row to point at.
insert into deliveries (id, reference, customer_user_id, customer, customer_phone, delivery_address, payment, status, rider_id)
values ('D-T1', '#KFD-TT1', '00000000-0000-0000-0000-0000000000c1', 'Trip Customer', '09171234567', 'Somewhere', 'cash', 'delivered', 'R-T2');
-- 100.00 from an order, 300.00 from the trip. The roster says 400.00.
insert into rider_cash_collections (rider_id, order_id, amount_expected, amount_collected, variance)
values ('R-T2', 'O-T1', 100, 100, 0);
insert into delivery_cash_collections (delivery_id, rider_id, amount_expected, amount_collected, variance)
values ('D-T1', 'R-T2', 300, 300, 0);

-- One order and one trip: two deliveries, so 40 is owed (0151). The trip's
-- reference is listed for the admin at 20.00.
do $$ begin
  if (select string_agg(reference || '=' || amount, ',')
        from admin_rider_cash_orders() where rider_id = 'R-T2') <> '#KFD-TT1=20.00' then
    raise exception 'FAIL the trip is not listed at 20: %',
      (select string_agg(reference || '=' || amount, ',') from admin_rider_cash_orders() where rider_id = 'R-T2');
  end if;
  raise notice 'PASS the admin sees the delivery behind the balance';
end $$;
select admin_record_cash_handover('R-T2', 40, 'orders and trip') is not null as trip_handover;
do $$ begin
  if exists (select 1 from admin_rider_cash_orders() where rider_id = 'R-T2') then
    raise exception 'FAIL a paid-off rider still has deliveries listed';
  end if;
  raise notice 'PASS nothing is listed once the rider has handed it in';
end $$;
-- Nothing is left now, so a further peso must be refused with the balance.
do $$ begin
  perform admin_record_cash_handover('R-T2', 0.01, 'over');
  raise exception 'FAIL: over-handover accepted';
exception when others then
  if sqlerrm not like '%(0.00 on hand)%' then raise exception 'FAIL: message was %', sqlerrm; end if;
  raise notice 'PASS refused: %', sqlerrm;
end $$;
do $$ begin
  if (select collected::text || '|' || handed_over || '|' || on_hand
        from admin_rider_cash() where rider_id = 'R-T2') <> '400.00|40.00|0.00' then
    raise exception 'FAIL trip cash missing from the roster or the balance: %',
      (select collected::text || '|' || handed_over || '|' || on_hand
         from admin_rider_cash() where rider_id = 'R-T2');
  end if;
  raise notice 'PASS trip cash counts towards the handover balance';
end $$;
rollback;
