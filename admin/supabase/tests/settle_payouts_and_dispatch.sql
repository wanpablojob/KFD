\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------
-- The dispute window closes on its own (0114)
-- --------------------------------------------------------------------------
--
-- A payout sits in 'pending_review' for 24 hours after a delivery is
-- reported as a problem. At the end of that window it settles: nobody
-- disputed it in time, so the rider is paid. It used to settle only when an
-- admin opened the ledger. Now a job does it every minute.
--
-- Fixtures: one rider, one customer, one kitchen, two delivered orders and
-- two payouts -- one whose window has elapsed, one whose window has not.
-- --------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000114d1', 'settle-rider@example.test'),
  ('00000000-0000-0000-0000-0000000114c1', 'settle-customer@example.test'),
  ('00000000-0000-0000-0000-0000000114a1', 'settle-admin@example.test');

insert into restaurants (id, name, cuisine, city, is_open, status, prep_minutes) values
  ('RS-ST1', 'Settle Kitchen', 'Filipino', 'Kabankalan', true, 'active', 10);

insert into app_users (user_id, role, restaurant_id) values
  ('00000000-0000-0000-0000-0000000114d1', 'rider', null),
  ('00000000-0000-0000-0000-0000000114c1', 'customer', null),
  ('00000000-0000-0000-0000-0000000114a1', 'admin', null)
  on conflict (user_id) do update set role = excluded.role, restaurant_id = excluded.restaurant_id;

insert into riders (id, name, email, city, vehicle, status, user_id) values
  ('R-ST1', 'Settle Rider', 'settle-rider@example.test', 'Kabankalan', 'motorcycle', 'online',
   '00000000-0000-0000-0000-0000000114d1');

insert into orders (
  id, reference, customer, restaurant, restaurant_id, status,
  subtotal, delivery_fee, service_fee, total, payment,
  customer_user_id, customer_phone, delivery_address, rider_id, rider, delivered_at
) values
  ('O-ST1', '#KFD-ST1', 'One', 'Settle Kitchen', 'RS-ST1', 'delivered',
   100, 45, 5, 150, 'cash',
   '00000000-0000-0000-0000-0000000114c1', '09171234567', '12 Katipunan St.',
   'R-ST1', 'Settle Rider', now() - interval '2 days'),
  ('O-ST2', '#KFD-ST2', 'One', 'Settle Kitchen', 'RS-ST1', 'delivered',
   100, 45, 5, 150, 'cash',
   '00000000-0000-0000-0000-0000000114c1', '09171234567', '12 Katipunan St.',
   'R-ST1', 'Settle Rider', now() - interval '2 days');

insert into rider_payouts (order_id, rider_id, amount, settlement_state, review_expires_at) values
  ('O-ST1', 'R-ST1', 25.00, 'pending_review', now() - interval '1 hour'),
  ('O-ST2', 'R-ST1', 25.00, 'pending_review', now() + interval '23 hours');

-- --------------------------------------------------------------------------
-- 1. The elapsed window settles, the one still open does not
-- --------------------------------------------------------------------------

do $$
declare
  v_settled integer;
begin
  v_settled := public.settle_elapsed_dispute_windows();
  if v_settled <> 1 then
    raise exception 'FAIL the job settled % payouts, not the one elapsed window', v_settled;
  end if;
  if (select settlement_state::text from rider_payouts where order_id = 'O-ST1') <> 'settled' then
    raise exception 'FAIL the elapsed window did not settle';
  end if;
  if (select settlement_state::text from rider_payouts where order_id = 'O-ST2') <> 'pending_review' then
    raise exception 'FAIL a window that has not elapsed was settled';
  end if;
  raise notice 'PASS an elapsed dispute window settles on its own';
end $$;

-- It is idempotent: the job runs every minute, and a second run settles
-- nothing more.
do $$
declare
  v_settled integer;
begin
  v_settled := public.settle_elapsed_dispute_windows();
  if v_settled <> 0 then
    raise exception 'FAIL a second run settled % payouts', v_settled;
  end if;
  raise notice 'PASS settling twice settles nothing twice';
end $$;

-- --------------------------------------------------------------------------
-- 2. The admin gate stays on the admin function
-- --------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000114c1","role":"authenticated"}', true);

do $$
begin
  perform public.rider_settle_expired_payouts();
  raise exception 'FAIL a customer settled payouts';
exception when others then
  if sqlerrm not like '%Only an admin%' then raise exception 'FAIL: %', sqlerrm; end if;
  raise notice 'PASS only an admin settles payouts by hand';
end $$;

-- And the worker itself is not for the client: it runs as the database owner.
do $$
begin
  perform public.settle_elapsed_dispute_windows();
  raise exception 'FAIL a customer called the worker directly';
exception when insufficient_privilege then
  raise notice 'PASS the worker is closed to signed-in users';
end $$;

reset role;

-- --------------------------------------------------------------------------
-- 3. The job is scheduled
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'settle-elapsed-payouts' and active
  ) then
    raise exception 'FAIL the settle job is not scheduled';
  end if;
  raise notice 'PASS the settle job is scheduled';
end $$;

-- --------------------------------------------------------------------------
-- 4. The leftovers from the first dispatch design are gone
-- --------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.dispatch_riders()') is not null then
    raise exception 'FAIL dispatch_riders is still there';
  end if;
  if to_regprocedure('public.dispatch_unassigned_orders()') is not null then
    raise exception 'FAIL dispatch_unassigned_orders is still there';
  end if;
  if to_regprocedure('public.available_jobs()') is not null then
    raise exception 'FAIL available_jobs is still there';
  end if;
  raise notice 'PASS the leftover dispatch functions are gone';
end $$;

rollback;
