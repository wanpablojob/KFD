\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'settle-merchant@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into restaurants (id, name, cuisine, city, status)
  values ('RS-SET', 'Settle Kitchen', 'Filipino', 'Kabankalan City Proper', 'active');
insert into app_users (user_id, role, restaurant_id)
  values ('00000000-0000-0000-0000-0000000000e3', 'merchant', 'RS-SET')
  on conflict (user_id) do update set role = 'merchant', restaurant_id = 'RS-SET';
insert into orders (id, reference, customer, restaurant, restaurant_id, status, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-S1', '#KFD-S1', 'C', 'Settle Kitchen', 'RS-SET', 'delivered', 200, 45, 5, 250, 'cash'),
  ('O-S2', '#KFD-S2', 'C', 'Settle Kitchen', 'RS-SET', 'delivered', 100, 45, 5, 150, 'cash'),
  ('O-S3', '#KFD-S3', 'C', 'Settle Kitchen', 'RS-SET', 'cancelled', 300, 45, 5, 350, 'cash');
-- A refund larger than the food is capped at the food.
insert into order_refunds (order_id, amount, method, reason) values ('O-S2', 140, 'cash', 'Cold food');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

do $$ begin
  -- 0% to start: the shop gets everything.
  if (select (order_count, food_total, refunds, commission, net)
             is distinct from (2, 300::numeric, 100::numeric, 0::numeric, 200::numeric)
        from admin_restaurant_owed('RS-SET')) then
    raise exception 'FAIL owed at 0%%: %', (select row_to_json(o) from admin_restaurant_owed('RS-SET') o);
  end if;
  perform admin_set_commission(10);
  if (select (commission, net) is distinct from (20::numeric, 180::numeric)
        from admin_restaurant_owed('RS-SET')) then
    raise exception 'FAIL owed at 10%%';
  end if;
  begin
    perform admin_set_commission(60);
    raise exception 'FAIL a 60%% commission was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS owed = food - refunds (capped) - commission';
end $$;

do $$ begin
  if (select (order_count, net_paid) is distinct from (2, 180::numeric)
        from admin_pay_restaurant('RS-SET', 'cash')) then
    raise exception 'FAIL the payment did not cover what was owed';
  end if;
  if exists (select 1 from orders where id in ('O-S1', 'O-S2') and restaurant_payout_id is null)
     or exists (select 1 from orders where id = 'O-S3' and restaurant_payout_id is not null) then
    raise exception 'FAIL the wrong orders were marked paid';
  end if;
  if (select order_count from admin_restaurant_owed('RS-SET')) <> 0 then
    raise exception 'FAIL still owed after paying';
  end if;
  begin
    perform admin_pay_restaurant('RS-SET', 'cash');
    raise exception 'FAIL paid twice';
  exception when sqlstate 'P0001' then null;
  end;
  -- Changing the rate later leaves the recorded payment alone.
  perform admin_set_commission(15);
  if (select commission_pct from restaurant_payouts where restaurant_id = 'RS-SET') <> 10 then
    raise exception 'FAIL a past payment changed with the rate';
  end if;
  raise notice 'PASS pays once, records the rate used';
end $$;

-- The merchant sees their own shop; a merchant cannot pay or set the rate.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', true);
do $$ begin
  if (select last_paid_at from merchant_owed()) is null then
    raise exception 'FAIL the merchant does not see the payment';
  end if;
  begin
    perform admin_pay_restaurant('RS-SET', 'cash');
    raise exception 'FAIL a merchant paid themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform admin_set_commission(0);
    raise exception 'FAIL a merchant set the commission';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS merchant reads own, cannot pay or set the rate';
end $$;
rollback;
