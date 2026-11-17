\set ON_ERROR_STOP 1
-- A cash order, end to end, the way the rider app does it: upload the photo as
-- the rider (0145), pick up (0144), deliver with the cash taken. Then the money
-- has to be where the rider and the shop look for it: the rider's earnings
-- ledger and the fees left to hand in (the food went to the shop at pickup,
-- 0147), and the order delivered so it counts in the shop's food sales. Before 0145 the photo
-- upload was refused, so no order was ever delivered and none of this moved.
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c0de1', 'cash@example.test');
insert into riders (id, name, email, user_id) values ('R-CM1', 'Cash Rider', 'cash@example.test', '00000000-0000-0000-0000-0000000c0de1');
insert into restaurants (id, name, cuisine) values ('RS-CM1', 'Cash Kitchen', 'Filipino');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, rider_payout, subtotal, delivery_fee, service_fee, total, payment)
values ('O-CM1', '#KFD-CM1', 'C', 'Cash Kitchen', 'RS-CM1', 'confirmed', 'R-CM1', 25, 150, 45, 5, 200, 'cash');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c0de1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c0de1', true);

insert into storage.objects (bucket_id, name) values ('delivery-proofs', 'R-CM1/O-CM1.jpg');
select * from rider_mark_picked_up('O-CM1');
select rider_mark_delivered('O-CM1', 'R-CM1/O-CM1.jpg', 200);

do $$ begin
  if (select delivery_count from rider_earnings_summary()) <> 1 then
    raise exception 'FAIL the delivery is not in the rider''s earnings';
  end if;
  raise notice 'PASS the rider sees the delivery in their earnings';
  -- 0147: the rider paid the shop the 150 food at pickup, so only the 50 of
  -- delivery and service fees is still to hand in, not the whole 200. Their
  -- own 25 comes back to them through the payout ledger.
  if (select on_hand from rider_cash_position()) <> 50 then
    raise exception 'FAIL rider owes KFD % instead of the 50 in fees', (select on_hand from rider_cash_position());
  end if;
  raise notice 'PASS only the fees are left to hand in';
end $$;

reset role;

do $$ begin
  if (select status from orders where id = 'O-CM1') <> 'delivered' then
    raise exception 'FAIL the order was not delivered';
  end if;
  if (select amount from rider_payouts where order_id = 'O-CM1') <> 25 then
    raise exception 'FAIL the rider''s fee was not recorded';
  end if;
  if (select amount_collected from rider_cash_collections where order_id = 'O-CM1') <> 200 then
    raise exception 'FAIL the cash taken is not on the rider''s hands';
  end if;
  raise notice 'PASS cash order lands in rider earnings, cash taken and shop sales';
end $$;
rollback;
