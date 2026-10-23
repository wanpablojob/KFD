-- --------------------------------------------------------------------------
-- 0138: what KFD owes each shop, and paying it
--
-- The rider hands the customer's cash to KFD, so KFD owes each shop the food
-- it sold: the subtotal of its delivered orders, less refunds (never more than
-- the food), less KFD's commission. Nothing recorded that money moving.
--
-- The commission is one platform-wide rate an admin sets. It starts at 0%:
-- nothing is kept until the owner decides the rate. Each payment records the
-- orders it covers, the rate used and every amount, so an order is paid for
-- once and an old payment never changes when the rate does.
-- --------------------------------------------------------------------------

create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  commission_pct numeric(5, 2) not null default 0 check (commission_pct between 0 and 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;
create index if not exists platform_settings_updated_by_idx on public.platform_settings (updated_by);

comment on table public.platform_settings is
  'Platform-wide settings; one row (0138). commission_pct is KFD''s cut of a shop''s food sales.';

alter table public.platform_settings enable row level security;
revoke all on table public.platform_settings from anon, authenticated;


create table if not exists public.restaurant_payouts (
  id bigint generated always as identity primary key,
  restaurant_id text not null references public.restaurants (id) on delete cascade,
  order_count integer not null,
  food_total numeric(12, 2) not null,
  refunds numeric(12, 2) not null,
  commission_pct numeric(5, 2) not null,
  commission numeric(12, 2) not null,
  net_paid numeric(12, 2) not null,
  method text not null check (method in ('gcash', 'cash')),
  reference text,
  paid_at timestamptz not null default now(),
  paid_by uuid references auth.users (id) on delete set null
);
create index if not exists restaurant_payouts_restaurant_idx
  on public.restaurant_payouts (restaurant_id, paid_at desc);
create index if not exists restaurant_payouts_paid_by_idx on public.restaurant_payouts (paid_by);

comment on table public.restaurant_payouts is
  'Each payment KFD made to a shop, with the orders'' totals and the commission used at the time (0138).';

alter table public.restaurant_payouts enable row level security;
revoke all on table public.restaurant_payouts from anon, authenticated;

alter table public.orders
  add column if not exists restaurant_payout_id bigint
    references public.restaurant_payouts (id) on delete set null;
create index if not exists orders_restaurant_payout_idx on public.orders (restaurant_payout_id);

comment on column public.orders.restaurant_payout_id is
  'The payment to the shop that covered this order (0138); null while KFD still owes it.';


-- What a shop is owed right now: delivered, not yet paid, at today's rate.
create or replace function public.restaurant_owed(p_restaurant_id text)
returns table (
  order_count integer,
  food_total numeric,
  refunds numeric,
  commission_pct numeric,
  commission numeric,
  net numeric,
  last_paid_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with owed as (
    select o.subtotal,
           least(coalesce((select sum(r.amount) from order_refunds r where r.order_id = o.id), 0),
                 o.subtotal) as refunded
      from orders o
     where o.restaurant_id = p_restaurant_id
       and o.status = 'delivered'
       and o.restaurant_payout_id is null
  ), totals as (
    select count(*)::int as n,
           coalesce(sum(subtotal), 0) as food,
           coalesce(sum(refunded), 0) as refunds
      from owed
  ), rate as (
    select commission_pct as pct from platform_settings where id = 1
  )
  select t.n,
         t.food,
         t.refunds,
         r.pct,
         round((t.food - t.refunds) * r.pct / 100, 2),
         (t.food - t.refunds) - round((t.food - t.refunds) * r.pct / 100, 2),
         (select max(paid_at) from restaurant_payouts where restaurant_id = p_restaurant_id)
    from totals t, rate r;
$$;

revoke all on function public.restaurant_owed(text) from public, anon, authenticated;


create or replace function public.admin_restaurant_owed(p_restaurant_id text)
returns table (
  order_count integer, food_total numeric, refunds numeric, commission_pct numeric,
  commission numeric, net numeric, last_paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query select * from restaurant_owed(p_restaurant_id);
end;
$$;
revoke all on function public.admin_restaurant_owed(text) from public, anon;
grant execute on function public.admin_restaurant_owed(text) to authenticated;


create or replace function public.merchant_owed()
returns table (
  order_count integer, food_total numeric, refunds numeric, commission_pct numeric,
  commission numeric, net numeric, last_paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant text := public.current_merchant_restaurant();
begin
  if v_restaurant is null then
    raise exception 'Only a restaurant''s merchant can see this.' using errcode = '42501';
  end if;
  return query select * from restaurant_owed(v_restaurant);
end;
$$;
comment on function public.merchant_owed()
  is 'The calling merchant''s shop: what KFD owes it now, at the current commission (0138).';
revoke all on function public.merchant_owed() from public, anon;
grant execute on function public.merchant_owed() to authenticated;


create or replace function public.admin_commission()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return (select commission_pct from platform_settings where id = 1);
end;
$$;
revoke all on function public.admin_commission() from public, anon;
grant execute on function public.admin_commission() to authenticated;


create or replace function public.admin_set_commission(p_pct numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 50 then
    raise exception 'Commission must be between 0%% and 50%%.' using errcode = '22023';
  end if;
  update platform_settings
     set commission_pct = round(p_pct, 2), updated_at = now(), updated_by = auth.uid()
   where id = 1;
  return round(p_pct, 2);
end;
$$;
comment on function public.admin_set_commission(numeric)
  is 'Sets KFD''s commission on shop food sales, 0-50% (0138). Applies to payments made from now on.';
revoke all on function public.admin_set_commission(numeric) from public, anon;
grant execute on function public.admin_set_commission(numeric) to authenticated;


create or replace function public.admin_pay_restaurant(
  p_restaurant_id text,
  p_method text,
  p_reference text default null
)
returns table (payout_id bigint, order_count integer, net_paid numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_owed record;
  v_id bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('gcash', 'cash') then
    raise exception 'Choose GCash or cash.' using errcode = '22023';
  end if;
  if p_method = 'gcash' and v_reference is null then
    raise exception 'Enter the GCash reference number.' using errcode = '22023';
  end if;

  -- One payment at a time per shop, so two admins cannot pay the same orders.
  perform 1 from restaurants where id = p_restaurant_id for update;

  select * into v_owed from restaurant_owed(p_restaurant_id);
  if v_owed.order_count = 0 then
    raise exception 'Nothing is owed to this shop right now.' using errcode = 'P0001';
  end if;

  insert into restaurant_payouts
    (restaurant_id, order_count, food_total, refunds, commission_pct, commission, net_paid,
     method, reference, paid_by)
  values
    (p_restaurant_id, v_owed.order_count, v_owed.food_total, v_owed.refunds,
     v_owed.commission_pct, v_owed.commission, v_owed.net, p_method, v_reference, auth.uid())
  returning id into v_id;

  update orders
     set restaurant_payout_id = v_id
   where restaurant_id = p_restaurant_id
     and status = 'delivered'
     and restaurant_payout_id is null;

  return query select v_id, v_owed.order_count, v_owed.net;
end;
$$;
comment on function public.admin_pay_restaurant(text, text, text)
  is 'Records paying a shop everything it is owed (delivered, unpaid orders, less refunds and commission) by GCash or cash (0138).';
revoke all on function public.admin_pay_restaurant(text, text, text) from public, anon;
grant execute on function public.admin_pay_restaurant(text, text, text) to authenticated;
