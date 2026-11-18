\set ON_ERROR_STOP 1
begin;
-- 0155: two cancellations a day, the third refused, every one recorded.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000cc001', 'cx-rider@example.test'),
  ('00000000-0000-0000-0000-0000000cc002', 'cx-admin@example.test');
insert into app_users (user_id, role) values ('00000000-0000-0000-0000-0000000cc002', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into restaurants (id, name, cuisine, city) values ('RS-CX', 'CX Kitchen', 'Filipino', 'Kabankalan');
insert into riders (id, name, email, user_id, city, status) values
  ('R-CX', 'CX Rider', 'cx-rider@example.test', '00000000-0000-0000-0000-0000000cc001', 'Kabankalan', 'online');
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-CX4', '#KFD-CX4', 'C', 'CX Kitchen', 'RS-CX', 'confirmed', null, 100, 45, 5, 150, 'cash');
-- An admin taking a rider off an order is not the rider cancelling.
update orders set rider_id = 'R-CX' where id = 'O-CX4';
update orders set rider_id = null where id = 'O-CX4';

insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-CX1', '#KFD-CX1', 'C', 'CX Kitchen', 'RS-CX', 'out_for_delivery', 'R-CX', 100, 45, 5, 150, 'cash'),
  ('O-CX2', '#KFD-CX2', 'C', 'CX Kitchen', 'RS-CX', 'out_for_delivery', 'R-CX', 100, 45, 5, 150, 'cash');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cc001","role":"authenticated"}', true);
select order_id from rider_report_failed_delivery('O-CX1', 'Customer not answering');
select order_id from rider_report_failed_delivery('O-CX2', 'Address not found');
reset role;

insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id, subtotal, delivery_fee, service_fee, total, payment) values
  ('O-CX3', '#KFD-CX3', 'C', 'CX Kitchen', 'RS-CX', 'out_for_delivery', 'R-CX', 100, 45, 5, 150, 'cash');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cc001","role":"authenticated"}', true);
do $$ begin
  if (select used::text || '/' || daily_limit from rider_cancellation_status()) <> '2/2' then
    raise exception 'FAIL status should be 2/2, got %', (select used::text || '/' || daily_limit from rider_cancellation_status());
  end if;
  raise notice 'PASS the rider sees 2 of 2 used';
  begin
    perform rider_report_failed_delivery('O-CX3', 'Third one');
    raise exception 'FAIL a third cancellation went through';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%already cancelled 2 jobs today%' then raise; end if;
    raise notice 'PASS the third cancellation is refused';
  end;
end $$;
reset role;

do $$ begin
  if (select rider_id from orders where id = 'O-CX3') is distinct from 'R-CX' then
    raise exception 'FAIL the refused cancellation still took the rider off';
  end if;
  if (select count(*) from rider_cancellations where rider_id = 'R-CX') <> 2 then
    raise exception 'FAIL expected 2 recorded cancellations (the admin unassign must not count)';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cc002","role":"authenticated"}', true);
do $$ begin
  if (select string_agg(reference || ':' || kind, ',' order by reference) from admin_rider_cancellations(7)
       where rider_id = 'R-CX') <> '#KFD-CX1:order,#KFD-CX2:order' then
    raise exception 'FAIL admin list wrong: %',
      (select string_agg(reference || ':' || kind, ',') from admin_rider_cancellations(7) where rider_id = 'R-CX');
  end if;
  raise notice 'PASS the admin sees both cancellations';
end $$;
rollback;
