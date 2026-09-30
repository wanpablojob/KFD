-- --------------------------------------------------------------------------
-- Storefront read path (customer app, browse)
--
-- Two pieces:
--
--   1. A customer -- and only a customer -- can read the live catalog: active,
--      non-archived restaurants and the available items of active restaurants.
--      The storefront is the only consumer, so the policy is scoped to
--      `is_customer()` rather than handed to every authenticated role, keeping
--      what a merchant straight-line can see exactly where 0002 left it.
--
--   2. Two new orders columns the storefront needs: where the delivery goes
--      (orders has no address column -- 0012 calls that out) and the system
--      service fee, which is a separate line from the delivery fee. The fee
--      is stored, not derived, so a later pricing change rewrites history
--      instead of rewriting what the customer was charged.
--
--      Browse is deliberately read-only: an authenticated user selects a
--      catalog, they do not write one. Order creation goes through the
--      customer_place_order SECURITY DEFINER function in 0023, which is the
--      only writer of orders on the customer path.
-- --------------------------------------------------------------------------

-- Who is a customer. Mirrors is_platform_admin()/current_merchant_restaurant():
-- read by RLS policies from a security definer body so it cannot trip its own
-- table's RLS.
create or replace function public.is_customer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_users
     where user_id = auth.uid() and role = 'customer'
  );
$$;

revoke all on function public.is_customer() from public;
revoke all on function public.is_customer() from anon;
grant execute on function public.is_customer() to authenticated;

-- --------------------------------------------------------------------------
-- Orders columns
-- --------------------------------------------------------------------------

alter table orders add column if not exists delivery_address text;
alter table orders add column if not exists service_fee numeric(12, 2) not null default 0;

comment on column orders.delivery_address is
  'Where the customer wants the delivery. NULL only for legacy/walk-in rows that predate the storefront.';
comment on column orders.service_fee is
  'The system service fee charged on storefront orders, stored as a separate line from delivery_fee so the customer receipt and the operator view match what was paid.';

-- --------------------------------------------------------------------------
-- Catalog RLS: customers read active restaurants and their menus
-- --------------------------------------------------------------------------

drop policy if exists "customers read active restaurants" on restaurants;
create policy "customers read active restaurants"
  on restaurants for select
  to authenticated
  using (
    public.is_customer()
    and status = 'active'
    and archived_at is null
  );

drop policy if exists "customers read active menus" on menu_items;
create policy "customers read active menus"
  on menu_items for select
  to authenticated
  using (
    public.is_customer()
    and available = true
    and restaurant_id in (
      select id from restaurants
       where status = 'active' and archived_at is null
    )
  );