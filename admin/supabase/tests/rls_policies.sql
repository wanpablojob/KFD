\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- The row level security rules: same rules, evaluated once (0113)
-- --------------------------------------------------------------------------
--
-- Fourteen policies called auth.uid() directly, so Postgres evaluated it for
-- every row. Wrapping it in (select auth.uid()) makes it an InitPlan: once per
-- query. The rules themselves must not move, and this file proves it.
--
-- Fixtures: two customers, a rider, an admin, two kitchens, and one row of
-- each kind per owner.
-- --------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000113c1', 'rls-one@example.test'),
  ('00000000-0000-0000-0000-0000000113c2', 'rls-two@example.test'),
  ('00000000-0000-0000-0000-0000000113d1', 'rls-rider@example.test'),
  ('00000000-0000-0000-0000-0000000113e1', 'rls-admin@example.test');

insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes) values
  ('RS-RL1', 'RLS Kitchen One', 'Filipino', 'Kabankalan', true, 'active', 10),
  ('RS-RL2', 'RLS Kitchen Two', 'Filipino', 'Kabankalan', true, 'active', 10);

insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000113c1', 'customer', null),
  ('00000000-0000-0000-0000-0000000113c2', 'customer', null),
  ('00000000-0000-0000-0000-0000000113d1', 'rider', null),
  ('00000000-0000-0000-0000-0000000113e1', 'admin', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into riders (id, name, email, city, vehicle, status, user_id) values
  ('R-RL1', 'RLS Rider', 'rls-rider@example.test', 'Kabankalan', 'motorcycle', 'online',
   '00000000-0000-0000-0000-0000000113d1');

insert into orders (
  id, reference, customer, restaurant, restaurant_id, status,
  subtotal, delivery_fee, service_fee, total, payment,
  customer_user_id, customer_phone, delivery_address, rider_id, rider
) values
  ('O-RL1', '#KFD-RL1', 'One', 'RLS Kitchen One', 'RS-RL1', 'out_for_delivery',
   100, 45, 5, 150, 'cash',
   '00000000-0000-0000-0000-0000000113c1', '09171234567', '12 Katipunan St.',
   'R-RL1', 'RLS Rider'),
  ('O-RL2', '#KFD-RL2', 'Two', 'RLS Kitchen Two', 'RS-RL2', 'out_for_delivery',
   100, 45, 5, 150, 'cash',
   '00000000-0000-0000-0000-0000000113c2', '09171234567', '12 Mabini St.',
   null, null);

insert into deliveries (
  id, reference, customer_user_id, customer, customer_phone, delivery_address,
  city, payment, status, shops, subtotal, delivery_fee, service_fee, total,
  rider_id, rider
) values
  ('D-RL1', 'KFD-RL-D1', '00000000-0000-0000-0000-0000000113c1', 'One', '09171234567',
   '12 Katipunan St.', 'Kabankalan', 'cash', 'out_for_delivery', 1, 100, 45, 5, 150,
   'R-RL1', 'RLS Rider');

insert into notifications (user_id, title, body) values
  ('00000000-0000-0000-0000-0000000113c1', 'One', 'For one'),
  ('00000000-0000-0000-0000-0000000113c2', 'Two', 'For two');

insert into push_tokens (id, user_id, token, platform) values
  ('PT-RL1', '00000000-0000-0000-0000-0000000113c1', 'token-one', 'android'),
  ('PT-RL2', '00000000-0000-0000-0000-0000000113c2', 'token-two', 'android');

-- --------------------------------------------------------------------------
-- 1. The form: every policy that names auth.uid() asks for it once
-- --------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and (
         (coalesce(qual, '') ~* 'auth\.uid\(\)'
          and qual !~* '\(\s*select\s+auth\.uid\(\)')
         or (coalesce(with_check, '') ~* 'auth\.uid\(\)'
          and with_check !~* '\(\s*select\s+auth\.uid\(\)')
       )
  loop
    raise exception 'FAIL the policy %.% still calls auth.uid() for every row',
      r.tablename, r.policyname;
  end loop;
  raise notice 'PASS every policy evaluates auth.uid() once per query';
end $$;

-- --------------------------------------------------------------------------
-- 2. The rules: a customer sees their own rows and nobody else's
-- --------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000113c1","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from orders) <> 1 then
    raise exception 'FAIL a customer sees % orders, not their own one', (select count(*) from orders);
  end if;
  if (select count(*) from deliveries) <> 1 then
    raise exception 'FAIL a customer sees % trips, not their own one', (select count(*) from deliveries);
  end if;
  if (select count(*) from notifications) <> 1 then
    raise exception 'FAIL a customer sees % notifications, not their own one', (select count(*) from notifications);
  end if;
  if (select count(*) from push_tokens) <> 1 then
    raise exception 'FAIL a customer sees % push tokens, not their own one', (select count(*) from push_tokens);
  end if;
  if (select count(*) from app_users) <> 1 then
    raise exception 'FAIL a customer sees % account rows, not their own one', (select count(*) from app_users);
  end if;
  raise notice 'PASS a customer sees only their own rows';
end $$;

-- --------------------------------------------------------------------------
-- 3. The rider sees the order and the trip assigned to them, and no others
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000113d1","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from orders) <> 1 then
    raise exception 'FAIL a rider sees % orders, not the one assigned to them', (select count(*) from orders);
  end if;
  if (select count(*) from deliveries) <> 1 then
    raise exception 'FAIL a rider sees % trips, not the one they carry', (select count(*) from deliveries);
  end if;
  if (select count(*) from riders) <> 1 then
    raise exception 'FAIL a rider sees % rider rows, not their own one', (select count(*) from riders);
  end if;
  raise notice 'PASS a rider sees only what is assigned to them';
end $$;

-- --------------------------------------------------------------------------
-- 4. The admin sees everything, which is the point of an admin
-- --------------------------------------------------------------------------
--
-- The database carries seeded fixtures, so "everything" is the total, not the
-- two rows this file adds. The total is read with the owner's privileges
-- (set_config('role', 'none') is the session user), and the admin's view is
-- read with the admin's, in the same block, so the two are comparable.
-- --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000113e1","role":"authenticated"}', true);

do $$
declare
  v_total bigint;
  v_admin bigint;
  v_total_users bigint;
  v_admin_users bigint;
begin
  perform set_config('role', 'none', true);
  select count(*) into v_total from orders;
  select count(*) into v_total_users from app_users;

  perform set_config('role', 'authenticated', true);
  select count(*) into v_admin from orders;
  select count(*) into v_admin_users from app_users;

  if v_admin <> v_total then
    raise exception 'FAIL an admin sees % orders, not all %', v_admin, v_total;
  end if;
  if v_admin_users <> v_total_users then
    raise exception 'FAIL an admin sees % account rows, not all %', v_admin_users, v_total_users;
  end if;
  raise notice 'PASS an admin sees every row';
end $$;

reset role;
rollback;
