\set ON_ERROR_STOP 1
-- 0144: an order is marked picked up before it can be marked delivered.
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'pickup@example.test');
insert into riders (id, name, email, user_id) values ('R-P1', 'Pickup Rider', 'pickup@example.test', '00000000-0000-0000-0000-0000000000c1');
insert into restaurants (id, name, cuisine) values ('RS-P1', 'Pickup Kitchen', 'Filipino');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, rider_payout, subtotal, delivery_fee, service_fee, total, payment)
values ('O-P1', '#KFD-P1', 'C', 'Pickup Kitchen', 'RS-P1', 'confirmed', 'R-P1', 50, 150, 45, 5, 200, 'cash');
insert into storage.objects (bucket_id, name) values ('delivery-proofs', 'R-P1/O-P1.jpg');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);

-- 1. Still at the shop: delivering is refused, and says what to do first.
do $$ begin
  perform rider_mark_delivered('O-P1', 'R-P1/O-P1.jpg', 200);
  raise exception 'FAIL: delivered before pickup';
exception when others then
  if sqlerrm not like '%picked up before%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS delivery before pickup refused';
end $$;

-- 2. Picked up, then delivered: the normal run.
select * from rider_mark_picked_up('O-P1');
do $$ begin
  if (select status from orders where id = 'O-P1') <> 'out_for_delivery' then
    raise exception 'FAIL: pickup did not move the order on the way';
  end if;
end $$;
select rider_mark_delivered('O-P1', 'R-P1/O-P1.jpg', 200);
do $$ begin
  if (select status from orders where id = 'O-P1') <> 'delivered' then
    raise exception 'FAIL: picked-up order was not delivered';
  end if;
  raise notice 'PASS picked up, then delivered';
end $$;
rollback;
