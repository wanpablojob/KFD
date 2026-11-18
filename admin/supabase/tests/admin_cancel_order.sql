\set ON_ERROR_STOP 1
begin;
-- 0154: an admin cancels an unfinished order, with a reason.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ac001', 'ac-admin@example.test'),
  ('00000000-0000-0000-0000-0000000ac002', 'ac-merchant@example.test');
insert into restaurants (id, name, cuisine, city) values ('RS-AC', 'AC Kitchen', 'Filipino', 'Kabankalan');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000ac001', 'admin', null),
  ('00000000-0000-0000-0000-0000000ac002', 'merchant', 'RS-AC')
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
insert into riders (id, name, email, city, status) values ('R-AC', 'AC Rider', 'ac-rider@example.test', 'Kabankalan', 'online');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-AC1', '#KFD-AC1', 'C', 'AC Kitchen', 'RS-AC', 'out_for_delivery', 'R-AC', 100, 45, 5, 150, 'cash'),
  ('O-AC2', '#KFD-AC2', 'C', 'AC Kitchen', 'RS-AC', 'delivered', null, 100, 45, 5, 150, 'cash'),
  ('O-AC3', '#KFD-AC3', 'C', 'AC Kitchen', 'RS-AC', 'confirmed', null, 100, 45, 5, 150, 'cash');
-- Placing a confirmed order may already offer it; start from exactly one live offer.
delete from order_offers where order_id = 'O-AC3';
insert into order_offers (order_id, rider_id, status, expires_at) values ('O-AC3', 'R-AC', 'offered', now() + interval '5 minutes');

-- A merchant cannot use it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ac002","role":"authenticated"}', true);
do $$ begin
  perform admin_cancel_order('O-AC3', 'test');
  raise exception 'FAIL a merchant used admin_cancel_order';
exception when insufficient_privilege then
  raise notice 'PASS a merchant is refused';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ac001","role":"authenticated"}', true);
do $$ begin
  perform admin_cancel_order('O-AC1', '   ');
  raise exception 'FAIL cancelled without a reason';
exception when sqlstate '22023' then
  raise notice 'PASS a reason is required';
end $$;
do $$ begin
  perform admin_cancel_order('O-AC2', 'too late');
  raise exception 'FAIL cancelled a delivered order';
exception when sqlstate 'P0001' then
  raise notice 'PASS a delivered order cannot be cancelled';
end $$;

-- Out for delivery: an admin can still call it off.
select previous_status from admin_cancel_order('O-AC1', 'Customer unreachable for an hour');
select admin_cancel_order('O-AC3', 'Shop closed early');
reset role;

do $$ begin
  if (select status::text || '|' || rejection_reason from orders where id = 'O-AC1')
       <> 'cancelled|Cancelled by Meriendash: Customer unreachable for an hour' then
    raise exception 'FAIL status or reason not saved';
  end if;
  if (select status::text from order_offers where order_id = 'O-AC3') <> 'expired' then
    raise exception 'FAIL the rider offer is still live';
  end if;
  if (select count(*) from audit_log where event = 'order.cancelled_by_admin' and detail->>'order_id' in ('O-AC1', 'O-AC3')) <> 2 then
    raise exception 'FAIL the cancellations were not logged';
  end if;
  raise notice 'PASS cancelled with reason, offers lapsed, logged';
end $$;
rollback;
