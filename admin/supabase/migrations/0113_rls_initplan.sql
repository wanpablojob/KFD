-- --------------------------------------------------------------------------
-- 0113: the row level security rules, evaluated once per query
-- --------------------------------------------------------------------------
--
-- Fourteen policies called auth.uid() directly. Postgres then evaluates that
-- call for every row it looks at, because nothing told it the answer is the
-- same for the whole statement: "the customer sees their own orders" turns
-- into a function call per order.
--
-- Wrapping the call in a scalar subquery -- (select auth.uid()) -- tells
-- Postgres the value is an InitPlan: computed once, before the scan, and then
-- reused for every row. The rule each policy states is unchanged; only the
-- cost of checking it changes.
--
-- The tables that matter most are the big ones: orders and deliveries, which
-- the customer, the rider and the admin all read. The admin's list of orders
-- reads every row there, so the saving is per row of every list.
--
-- Rewritten from their live definitions, with the one change. The scoping is
-- unchanged, and the SQL test beside this file proves it: a customer still
-- sees only their own rows, a rider only their assigned ones, an admin all.
-- --------------------------------------------------------------------------

-- The customer reads their own role, and nobody else's.
drop policy if exists "users read own role" on public.app_users;
create policy "users read own role"
  on public.app_users for select
  to authenticated
  using (user_id = (select auth.uid()));

-- A customer reads their own orders.
drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = customer_user_id);

-- A rider reads the orders assigned to them.
drop policy if exists "riders read assigned orders" on public.orders;
create policy "riders read assigned orders"
  on public.orders for select
  to authenticated
  using (
    rider_id is not null
    and rider_id = (
      select id from riders where user_id = (select auth.uid()) limit 1
    )
  );

-- A rider reads their own profile.
drop policy if exists "riders read own profile" on public.riders;
create policy "riders read own profile"
  on public.riders for select
  to authenticated
  using (user_id = (select auth.uid()));

-- A device reads its own push tokens, and can remove them.
drop policy if exists "push_tokens read own" on public.push_tokens;
create policy "push_tokens read own"
  on public.push_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "push_tokens delete own" on public.push_tokens;
create policy "push_tokens delete own"
  on public.push_tokens for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- A customer reads the refunds on their own orders.
drop policy if exists "customers read own refunds" on public.order_refunds;
create policy "customers read own refunds"
  on public.order_refunds for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_refunds.order_id and o.customer_user_id = (select auth.uid())
  ));

-- An applicant reads their own application.
drop policy if exists "applicants read own application" on public.rider_applications;
create policy "applicants read own application"
  on public.rider_applications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- A customer reads the ratings they gave.
drop policy if exists "customers read own ratings" on public.order_ratings;
create policy "customers read own ratings"
  on public.order_ratings
  for select
  to authenticated
  using (customer_user_id = (select auth.uid()));

-- A customer manages their own favourites.
drop policy if exists "customers manage own favorites" on public.customer_favorites;
create policy "customers manage own favorites"
  on public.customer_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A user reads their own notifications, and marks them read.
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users mark own notifications read" on public.notifications;
create policy "users mark own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A customer reads their own trip.
drop policy if exists "customers read own deliveries" on public.deliveries;
create policy "customers read own deliveries"
  on public.deliveries for select to authenticated
  using (customer_user_id = (select auth.uid()));

-- A rider reads the trip they are carrying.
drop policy if exists "riders read assigned deliveries" on public.deliveries;
create policy "riders read assigned deliveries"
  on public.deliveries for select to authenticated
  using (rider_id = (select riders.id from riders where riders.user_id = (select auth.uid()) limit 1));
