\set ON_ERROR_STOP 1
begin;
-- Merchant, admin and four riders with user accounts.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'merchant-ad@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'admin-ad@example.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'free@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'busy@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'offline@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'elsewhere@example.test');
insert into restaurants (id, name, cuisine, city) values ('RS-AD', 'Auto Kitchen', 'Filipino', 'Kabankalan');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'merchant', 'RS-AD'),
  ('00000000-0000-0000-0000-0000000000d2', 'admin', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
insert into riders (id, name, email, user_id, city, status) values
  ('R-FREE', 'Free', 'free@example.test', '00000000-0000-0000-0000-0000000000a1', 'Kabankalan', 'online'),
  ('R-BUSY', 'Busy', 'busy@example.test', '00000000-0000-0000-0000-0000000000a2', 'Kabankalan', 'online'),
  ('R-OFF', 'Off', 'offline@example.test', '00000000-0000-0000-0000-0000000000a3', 'Kabankalan', 'offline'),
  ('R-FAR', 'Far', 'elsewhere@example.test', '00000000-0000-0000-0000-0000000000a4', 'Himamaylan', 'online');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-BUSY', '#KFD-AD0', 'C', 'Auto Kitchen', 'RS-AD', 'out_for_delivery', 'R-BUSY', 100, 45, 5, 150, 'cash'),
  ('O-AD1', '#KFD-AD1', 'C', 'Auto Kitchen', 'RS-AD', 'pending', null, 100, 45, 5, 150, 'cash'),
  ('O-AD2', '#KFD-AD2', 'C', 'Auto Kitchen', 'RS-AD', 'pending', null, 100, 45, 5, 150, 'cash');

-- The merchant accepts O-AD1 from the portal, as PostgREST would run it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
update orders set status = 'confirmed' where id = 'O-AD1';
reset role;

do $$ begin
  if (select string_agg(rider_id, ',' order by rider_id) from order_offers
       where order_id = 'O-AD1' and status = 'offered') is distinct from 'R-FREE' then
    raise exception 'FAIL acceptance should offer only the free, online, same-city rider; got %',
      (select string_agg(rider_id, ',') from order_offers where order_id = 'O-AD1');
  end if;
  raise notice 'PASS accepting an order offers it to eligible riders only';
end $$;

-- The kitchen starts cooking before anyone claims: the offer must survive.
set local role authenticated;
update orders set status = 'preparing' where id = 'O-AD1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select order_id from claim_order('O-AD1');
reset role;
do $$ begin
  if (select rider_id from orders where id = 'O-AD1') is distinct from 'R-FREE' then
    raise exception 'FAIL rider could not claim a preparing order';
  end if;
  raise notice 'PASS rider claims after the kitchen starts preparing';
end $$;

-- The rider gives up on O-AD1. It returns to 'confirmed' and is re-offered by
-- the same trigger, but never to the rider who just failed it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select rider_report_failed_delivery('O-AD1', 'Customer not answering');
reset role;
do $$ begin
  if (select status::text || '/' || coalesce(rider_id, '-') from orders where id = 'O-AD1') <> 'confirmed/-' then
    raise exception 'FAIL failed delivery did not return the order to confirmed with no rider';
  end if;
  if exists (select 1 from order_offers where order_id = 'O-AD1' and rider_id = 'R-FREE' and status = 'offered') then
    raise exception 'FAIL the rider who failed the delivery was offered it again';
  end if;
  raise notice 'PASS failed delivery is re-offered, not to the rider who failed it';
end $$;

-- O-AD2: accepted, offers lapse unclaimed, kitchen is cooking. Admin re-offers.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
update orders set status = 'confirmed' where id = 'O-AD2';
update orders set status = 'preparing' where id = 'O-AD2';
reset role;
update order_offers set expires_at = now() - interval '1 minute' where order_id = 'O-AD2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$ begin
  if (select offered_to from admin_dispatch_order('O-AD2')) < 1 then
    raise exception 'FAIL admin re-offer of a preparing order reached nobody';
  end if;
  raise notice 'PASS admin re-offers a preparing order';
end $$;
reset role;
rollback;
