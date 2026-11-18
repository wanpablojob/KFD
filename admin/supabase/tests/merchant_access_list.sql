\set ON_ERROR_STOP 1
begin;
-- 0153: the Merchant access page lists admins and merchants only.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ae01', 'ma-admin@example.test'),
  ('00000000-0000-0000-0000-00000000ae02', 'ma-merchant@example.test'),
  ('00000000-0000-0000-0000-00000000ae03', 'ma-rider@example.test'),
  ('00000000-0000-0000-0000-00000000ae04', 'ma-customer@example.test');
insert into restaurants (id, name, cuisine, city) values ('RS-MA', 'MA Kitchen', 'Filipino', 'Kabankalan');
insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-00000000ae01', 'admin', null),
  ('00000000-0000-0000-0000-00000000ae02', 'merchant', 'RS-MA'),
  ('00000000-0000-0000-0000-00000000ae03', 'rider', null),
  ('00000000-0000-0000-0000-00000000ae04', 'customer', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ae01', true);
do $$ begin
  if exists (select 1 from merchant_access_list() where email in ('ma-rider@example.test', 'ma-customer@example.test')) then
    raise exception 'FAIL a rider or customer is listed under Merchant access';
  end if;
  if (select count(*) from merchant_access_list() where email in ('ma-admin@example.test', 'ma-merchant@example.test')) <> 2 then
    raise exception 'FAIL the admin or the merchant is missing';
  end if;
  raise notice 'PASS only admins and merchants are listed';
end $$;
rollback;
