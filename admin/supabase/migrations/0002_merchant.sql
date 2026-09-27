-- --------------------------------------------------------------------------
-- Merchant access
--
-- Adds a role table plus restaurant_id columns on the two tables a merchant
-- owns, then narrows RLS so a merchant only ever sees their own rows.
--
-- restaurant_id is populated by joining the existing free-text `restaurant`
-- name to restaurants.name. All seeded names resolve, so the backfill is
-- total; the column stays nullable because RLS already treats NULL as
-- invisible to merchants, which is the safe default for a row whose owner
-- cannot be determined.
-- --------------------------------------------------------------------------

do $$ begin
  create type app_role as enum ('admin', 'merchant');
exception when duplicate_object then null;
end $$;

create table if not exists app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null default 'merchant',
  restaurant_id text references restaurants (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint app_users_merchant_needs_restaurant
    check (role <> 'merchant' or restaurant_id is not null)
);

alter table orders add column if not exists restaurant_id text
  references restaurants (id) on delete set null;
alter table menu_items add column if not exists restaurant_id text
  references restaurants (id) on delete set null;

update orders o
   set restaurant_id = r.id
  from restaurants r
 where o.restaurant_id is null
   and o.restaurant = r.name;

update menu_items m
   set restaurant_id = r.id
  from restaurants r
 where m.restaurant_id is null
   and m.restaurant = r.name;

create index if not exists orders_restaurant_id_idx on orders (restaurant_id);
create index if not exists app_users_restaurant_id_idx on app_users (restaurant_id);

-- --------------------------------------------------------------------------
-- Role helpers
--
-- SECURITY DEFINER so the policies below can read app_users without
-- tripping its own RLS, which would otherwise recurse infinitely.
-- --------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_users
     where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_merchant_restaurant()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id from app_users
   where user_id = auth.uid() and role = 'merchant';
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.current_merchant_restaurant() from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.current_merchant_restaurant() to authenticated;

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table app_users enable row level security;

drop policy if exists "users read own role" on app_users;
create policy "users read own role"
  on app_users for select
  to authenticated
  using (user_id = auth.uid());

-- Only an admin provisions accounts. Without this any signed-in user could
-- promote themselves to admin.
drop policy if exists "admins manage app_users" on app_users;
create policy "admins manage app_users"
  on app_users for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "authenticated full access: restaurants" on restaurants;
create policy "authenticated full access: restaurants"
  on restaurants for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "authenticated full access: riders" on riders;
create policy "authenticated full access: riders"
  on riders for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "authenticated full access: customers" on customers;
create policy "authenticated full access: customers"
  on customers for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- A merchant sees and edits their own restaurant's rows. An admin sees all.
drop policy if exists "authenticated full access: orders" on orders;
create policy "scoped access: orders"
  on orders for all
  to authenticated
  using (
    public.is_platform_admin()
    or restaurant_id = public.current_merchant_restaurant()
  )
  with check (
    public.is_platform_admin()
    or restaurant_id = public.current_merchant_restaurant()
  );

drop policy if exists "authenticated full access: menu_items" on menu_items;
create policy "scoped access: menu_items"
  on menu_items for all
  to authenticated
  using (
    public.is_platform_admin()
    or restaurant_id = public.current_merchant_restaurant()
  )
  with check (
    public.is_platform_admin()
    or restaurant_id = public.current_merchant_restaurant()
  );

-- A merchant needs its own restaurant row to render a name, so grant read on
-- exactly the one row it is attached to.
drop policy if exists "merchants read own restaurant" on restaurants;
create policy "merchants read own restaurant"
  on restaurants for select
  to authenticated
  using (id = public.current_merchant_restaurant());
