-- Phase 3: earnings that mean something.
--
-- Before this, rider earnings were a lifetime aggregate on `riders` with no
-- history behind it. 0001 seeds fixture rows (rdr_01 carries
-- earnings 2840.00 / deliveries 182) and nothing in the schema ever wrote the
-- column, so the earnings screen divided 2840 / 182 and confidently showed a
-- rider "₱2,840.00 lifetime, ₱15.60 per delivery" for work that never happened.
-- 0037 began writing earnings on delivery completion, which makes the column
-- real for new deliveries but leaves the fixture baseline underneath it, so
-- the number stayed a blend of fiction and truth.
--
-- The fix is a ledger. `rider_payouts` is the record of what each delivery was
-- actually worth; every earnings figure the rider sees is now summed from it,
-- and `riders.earnings` is reconciled to the same sum so the admin dashboard
-- and the app cannot disagree.

create table if not exists public.rider_payouts (
  id bigint generated always as identity primary key,
  rider_id text not null references public.riders (id) on delete cascade,
  order_id text not null references public.orders (id) on delete cascade,
  -- Frozen at claim time, copied here verbatim. Never recomputed from the
  -- current rate: a completed delivery keeps what it was worth.
  amount numeric(12, 2) not null,
  earned_at timestamptz not null default now(),
  -- One payout per delivery. rider_mark_delivered already refuses a second
  -- completion, so this is a backstop rather than the primary guard.
  constraint rider_payouts_order_unique unique (order_id)
);

create index if not exists rider_payouts_rider_earned_idx
  on public.rider_payouts (rider_id, earned_at desc);

comment on table public.rider_payouts is
  'Per-delivery rider earnings ledger. One row per completed delivery; every rider-facing earnings figure sums from here.';

-- Ledger rows are written by rider_mark_delivered and read through the two
-- RPCs below. Direct client reads are off: a rider's payout history is private
-- to them and needs no table access of its own.
alter table public.rider_payouts enable row level security;

-- The rider's own day boundary. Supabase runs sessions in UTC, so an 11pm
-- Manila delivery would file under the next day without this. Change the zone
-- here if the operation is ever run from elsewhere.
create or replace function public.rider_earned_on(p_at timestamptz)
  returns date
  language sql
  immutable
as $$
  select (p_at at time zone 'Asia/Manila')::date;
$$;

-- What the rider earned, for the periods they actually care about.
create or replace function public.rider_earnings_summary()
  returns table (
    earned_today numeric,
    earned_week numeric,
    lifetime numeric,
    delivery_count integer,
    first_earned_at timestamptz,
    last_earned_at timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_rider_id text;
  v_today date;
begin
  -- riders.user_id is the auth link, and it is the only one the other rider
  -- RPCs use. Joining app_users as well would make these two stricter than
  -- fetch_rider_orders_page, which reads as a bug when a rider has a riders
  -- row but no matching app_users row.
  select r.id into v_rider_id
  from public.riders r
  where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'No rider profile is linked to this account.'
      using errcode = 'P0002';
  end if;

  v_today := public.rider_earned_on(now());

  return query
  select
    coalesce(sum(p.amount) filter (where public.rider_earned_on(p.earned_at) = v_today), 0),
    coalesce(
      sum(p.amount) filter (
        where public.rider_earned_on(p.earned_at) >= date_trunc('week', v_today)::date
      ),
      0
    ),
    coalesce(sum(p.amount), 0),
    count(*)::integer,
    min(p.earned_at),
    max(p.earned_at)
  from public.rider_payouts p
  where p.rider_id = v_rider_id;
end;
$$;

revoke all on function public.rider_earnings_summary() from public, anon;
grant execute on function public.rider_earnings_summary() to authenticated;

-- Per-delivery history, newest first. Limit-based rather than cursor-based: a
-- rider looking up "what was that delivery worth" reaches the answer in the
-- first screenful, and a `has_more` flag is enough to offer more.
create or replace function public.rider_payout_history(p_limit int default 20)
  returns table (
    order_id text,
    order_reference text,
    restaurant text,
    amount numeric,
    earned_at timestamptz,
    has_more boolean
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_rider_id text;
begin
  -- riders.user_id is the auth link, and it is the only one the other rider
  -- RPCs use. Joining app_users as well would make these two stricter than
  -- fetch_rider_orders_page, which reads as a bug when a rider has a riders
  -- row but no matching app_users row.
  select r.id into v_rider_id
  from public.riders r
  where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'No rider profile is linked to this account.'
      using errcode = 'P0002';
  end if;

  return query
  with rows as (
    select p.order_id, p.amount, p.earned_at
    from public.rider_payouts p
    where p.rider_id = v_rider_id
    order by p.earned_at desc, p.id desc
    limit greatest(coalesce(p_limit, 20), 1)
  )
  select
    rows.order_id,
    o.reference,
    o.restaurant,
    rows.amount,
    rows.earned_at,
    (
      select count(*) > greatest(coalesce(p_limit, 20), 1)
      from public.rider_payouts p2
      where p2.rider_id = v_rider_id
    )
  from rows
  join public.orders o on o.id = rows.order_id;
end;
$$;

revoke all on function public.rider_payout_history(int) from public, anon;
grant execute on function public.rider_payout_history(int) to authenticated;

-- Deliveries already marked complete are not backfilled: orders that predate
-- 0037 have a NULL rider_payout, so there is no trustworthy amount to record.
-- Inventing one from a historical rate would be the same fiction this
-- migration exists to remove. The ledger starts empty and fills from the next
-- completed delivery.

-- Reconcile the aggregate the admin dashboard reads. The seeded values were
-- never real earnings; every figure in the app is now a sum over the ledger,
-- so leaving 2840.00 in place would have the admin and the rider disagreeing
-- about the same rider's history. Expect rider totals to read 0.00 until real
-- deliveries complete -- that is the honest number, not a regression.
update public.riders r
set earnings = coalesce(
  (select sum(p.amount) from public.rider_payouts p where p.rider_id = r.id),
  0
);
-- rider_mark_delivered, rebuilt from 0037 with the ledger write added. The
-- 0037 body is otherwise byte-for-byte unchanged, including the `is distinct
-- from` ownership guard -- NULL-safe because a NULL order rider must not pass.
create or replace function public.rider_mark_delivered(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_order_rider_id text;
  v_status order_status;
  v_payout numeric;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  -- Read the order's assignee into its OWN variable. This previously selected
  -- into v_rider_id, overwriting the caller's id with the order's, so the
  -- ownership check below compared the order's rider against itself and could
  -- never fail -- any authenticated rider could mark any order delivered.
  select o.status, o.rider_id, o.rider_payout
    into v_status, v_order_rider_id, v_payout
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.'
      using errcode = '42501';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  update orders
     set status = 'delivered'
   where id = p_order_id;

  -- The ledger row is the record. `on conflict do nothing` because the status
  -- guard above already refuses a second completion; this keeps a retry from
  -- raising instead of quietly double-paying.
  insert into rider_payouts (rider_id, order_id, amount)
  values (v_rider_id, p_order_id, coalesce(v_payout, 0))
  on conflict (order_id) do nothing;

  update riders
     set deliveries = deliveries + 1,
         earnings = earnings + coalesce(v_payout, 0)
   where id = v_rider_id;
end;
$$;
