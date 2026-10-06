-- Admin-side read of the rider payout ledger.
--
-- Why this exists: the riders pages were showing `riders.earnings` and summing
-- `orders.total`, which are two different questions wearing the same label.
-- `orders.total` is what the *customer* paid, so a rider's delivery history
-- totalled a number that has nothing to do with what they earned. The ledger
-- added in 0038 is the actual record -- one row per completed delivery, frozen
-- at claim time -- and it is the only honest source for a rider's money.
--
-- Why an RPC and not a client read: rider_payouts has RLS enabled and, since
-- 0039, no table grant to authenticated. That is deliberate -- a rider's payout
-- history is private to them, and the only paths to it are the rider-side RPCs
-- that resolve the rider from auth.uid(). An admin looking at *another* rider
-- has no path at all. Granting the table would open every rider's earnings to
-- every signed-in merchant and customer, so the read is a function that checks
-- the admin role itself.
--
-- Both functions are security definer with search_path pinned, and both revoke
-- from anon and public. is_platform_admin() reads app_users, which is why the
-- check has to happen inside the function rather than in the page: a page-side
-- check is a UI affordance, and these functions are reachable by anyone who can
-- call them.

-- ---------------------------------------------------------------------------
-- 1. admin_rider_payout_summary(p_rider_id)
--
-- The periods the riders pages show. today/week are in Asia/Manila, matching
-- rider_earnings_summary, so an admin and the rider see the same day boundary.
-- ---------------------------------------------------------------------------
create or replace function public.admin_rider_payout_summary(p_rider_id text)
returns table (
  lifetime numeric,
  earned_today numeric,
  earned_week numeric,
  delivered_count integer,
  failed_count integer,
  payout_count integer,
  first_earned_at timestamptz,
  last_earned_at timestamptz
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

  return query
  select
    coalesce((select sum(p.amount) from public.rider_payouts p where p.rider_id = p_rider_id), 0),
    coalesce((
      select sum(p.amount) from public.rider_payouts p
       where p.rider_id = p_rider_id
         and public.rider_earned_on(p.earned_at) = public.rider_earned_on(now())
    ), 0),
    coalesce((
      select sum(p.amount) from public.rider_payouts p
       where p.rider_id = p_rider_id
         and public.rider_earned_on(p.earned_at) >=
             (public.rider_earned_on(now()) - 6)
    ), 0),
    -- Completed deliveries, counted on orders. This is the same count the riders
    -- list shows (admin_rider_overview's delivered_count), so the list and this
    -- page cannot report different totals for the same rider.
    (select count(*)::int
       from public.orders o
      where o.rider_id = p_rider_id
        and o.status = 'delivered'),
    -- Failed deliveries earn nothing, so there is no ledger row for them. The
    -- accountability record is the order (migration 0044), and the columns
    -- survive reassignment on purpose.
    (select count(*)::int
       from public.orders o
      where o.delivery_failed_by = p_rider_id
        and o.delivery_failed_at is not null),
    -- Ledger rows. Lower than delivered_count for any delivery that predates
    -- 0038, which recorded no payout; surfaced separately rather than folded in,
    -- because the ledger is what the money figures come from and quietly
    -- reconciling the two would hide that difference.
    (select count(*)::int from public.rider_payouts p where p.rider_id = p_rider_id),
    (select min(p.earned_at) from public.rider_payouts p where p.rider_id = p_rider_id),
    (select max(p.earned_at) from public.rider_payouts p where p.rider_id = p_rider_id);
end;
$$;

comment on function public.admin_rider_payout_summary(text) is
  'Admin-only: a rider''s lifetime/today/week earnings from the payout ledger, plus completed/failed delivery counts and the ledger row count. Returns one row (all zeroes) for a rider with no deliveries.';

revoke all on function public.admin_rider_payout_summary(text) from public;
revoke all on function public.admin_rider_payout_summary(text) from anon;
grant execute on function public.admin_rider_payout_summary(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. admin_rider_payouts(p_rider_id, p_limit)
--
-- The per-delivery table. Newest first, so it matches the order the delivery
-- history table above it is already in.
-- ---------------------------------------------------------------------------
create or replace function public.admin_rider_payouts(
  p_rider_id text,
  p_limit integer default 25
)
returns table (
  payout_id bigint,
  order_id text,
  order_reference text,
  restaurant text,
  amount numeric,
  earned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  -- Clamped rather than trusted: this is a row count from the client, and an
  -- unbounded one would let any admin pull the whole ledger in one call.
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 200);

  return query
  select
    p.id,
    p.order_id,
    o.reference,
    o.restaurant,
    p.amount,
    p.earned_at
  from public.rider_payouts p
  join public.orders o on o.id = p.order_id
  where p.rider_id = p_rider_id
  order by p.earned_at desc, p.id desc
  limit v_limit;
end;
$$;

comment on function public.admin_rider_payouts(text, integer) is
  'Admin-only: one rider''s payout rows, newest first, capped at 200. The per-delivery earnings table on /dashboard/riders/[id].';

revoke all on function public.admin_rider_payouts(text, integer) from public;
revoke all on function public.admin_rider_payouts(text, integer) from anon;
grant execute on function public.admin_rider_payouts(text, integer) to authenticated;