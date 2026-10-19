\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'rider@example.test');
insert into riders (id, name, email, user_id) values ('R-T1', 'Test Rider', 'rider@example.test', '00000000-0000-0000-0000-0000000000b1');
insert into restaurants (id, name, cuisine) values ('RS-T1', 'Test Kitchen', 'Filipino');
-- O-AGREED: fee agreed at the door. O-FIXED: normal priced order.
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, rider_payout, subtotal, delivery_fee, service_fee, total, payment, fee_agreed_in_person)
values ('O-AGREED', '#KFD-T1', 'C', 'Test Kitchen', 'RS-T1', 'out_for_delivery', 'R-T1', 50, 195, 0, 5, 200, 'cash', true),
       ('O-FIXED',  '#KFD-T2', 'C', 'Test Kitchen', 'RS-T1', 'out_for_delivery', 'R-T1', 50, 150, 45, 5, 200, 'cash', false);
insert into storage.objects (bucket_id, name) values
  ('delivery-proofs', 'R-T1/O-AGREED.jpg'), ('delivery-proofs', 'R-T1/O-FIXED.jpg'), ('delivery-proofs', 'R-OTHER/O-AGREED.jpg');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);

-- 1. Another rider's photo, which exists in the bucket, is refused.
do $$ begin
  perform rider_mark_delivered('O-AGREED', 'R-OTHER/O-AGREED.jpg', 250);
  raise exception 'FAIL: foreign proof accepted';
exception when others then
  if sqlerrm not like '%does not belong%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS foreign photo refused';
end $$;
-- 2. This rider's photo of a different order is refused too.
do $$ begin
  perform rider_mark_delivered('O-AGREED', 'R-T1/O-FIXED.jpg', 250);
  raise exception 'FAIL: other-order proof accepted';
exception when others then
  if sqlerrm not like '%does not belong%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS other-order photo refused';
end $$;
-- 3. Agreed at the door: 250 taken on a 200 total is the 50 fee, not a variance.
select rider_mark_delivered('O-AGREED', 'R-T1/O-AGREED.jpg', 250);
-- 4. Fixed fee: 190 taken on 200 is a -10 variance.
select rider_mark_delivered('O-FIXED', 'R-T1/O-FIXED.jpg', 190);
do $$ begin
  if (select variance from rider_cash_collections where order_id = 'O-AGREED') <> 0 then
    raise exception 'FAIL agreed-at-the-door fee counted as variance';
  end if;
  if (select variance from rider_cash_collections where order_id = 'O-FIXED') <> -10 then
    raise exception 'FAIL short collection not recorded as -10';
  end if;
  if exists (select 1 from orders where id like 'O-%' and (status <> 'delivered' or delivery_photo_path is null)) then
    raise exception 'FAIL an order was not closed with its photo';
  end if;
  if (select on_hand from rider_cash_position()) <> 440 or (select flagged from rider_cash_position()) <> 10 then
    raise exception 'FAIL rider cash position wrong';
  end if;
  raise notice 'PASS variance, photo and cash position';
end $$;
rollback;
