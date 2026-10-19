\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'merchant@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'customer@example.test');
insert into restaurants (id, name, cuisine) values ('RS-P1', 'Perm Kitchen', 'Filipino');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'merchant', 'RS-P1'),
  ('00000000-0000-0000-0000-0000000000c2', 'customer', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
insert into orders (id, reference, customer, restaurant, restaurant_id, status, subtotal, delivery_fee, service_fee, total, payment)
values ('O-P1', '#KFD-P1', 'C', 'Perm Kitchen', 'RS-P1', 'pending', 100, 45, 5, 150, 'cash');

-- Act as the merchant, the way PostgREST does.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

do $$ begin update orders set total = 1 where id = 'O-P1'; raise exception 'FAIL total edit allowed';
exception when insufficient_privilege then raise notice 'PASS merchant cannot edit total'; end $$;
do $$ begin delete from orders where id = 'O-P1'; raise exception 'FAIL delete allowed';
exception when insufficient_privilege then raise notice 'PASS merchant cannot delete'; end $$;
do $$ begin update orders set status = 'delivered' where id = 'O-P1'; raise exception 'FAIL skip to delivered allowed';
exception when insufficient_privilege then raise notice 'PASS merchant cannot jump to delivered'; end $$;
update orders set status = 'confirmed' where id = 'O-P1';
update orders set status = 'cancelled', rejection_reason = 'Out of stock' where id = 'O-P1';
do $$ begin
  if (select status::text || '/' || rejection_reason from orders where id = 'O-P1') <> 'cancelled/Out of stock' then
    raise exception 'FAIL merchant could not confirm then cancel';
  end if;
  raise notice 'PASS merchant confirms and cancels';
end $$;

-- Act as a customer.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from admin_disputed_payouts()) <> 0 then
    raise exception 'FAIL a customer can read disputed payouts';
  end if;
  raise notice 'PASS customer sees no disputed payouts';
end $$;
reset role;

set local role anon;
do $$ begin perform refresh_restaurant_aggregates(array['RS-P1']); raise exception 'FAIL anon refresh allowed';
exception when insufficient_privilege then raise notice 'PASS anon cannot run refresh'; end $$;
reset role;
rollback;
