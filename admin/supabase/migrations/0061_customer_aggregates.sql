-- --------------------------------------------------------------------------
-- Live customer aggregates, computed from orders.customer_user_id
--
-- `customers.orders_count` and `customers.total_spend` are seed constants written
-- once by 0001 and never maintained -- 0008 declined to fix them because
-- `orders.customer` was free text with no foreign key. That stopped being true
-- at 0012 (orders.customer_user_id), and 0059 added the matching
-- `customers.user_id`. These two functions are the replacement.
--
-- A recompute, not a maintained counter. Deltas drift the moment an order is
-- cancelled, an order moves, or a row is edited outside the app; a recompute is
-- idempotent and cannot lie.
--
-- The aggregates are read here and deliberately NOT written back onto
-- `customers`. A stored column that only one function keeps in sync is a second
-- source of truth that goes stale the day that function is not called, which is
-- exactly how orders_count/total_spend ended up as seed constants. They stay as
-- legacy columns; nothing selects them.
--
-- Both functions re-check is_platform_admin() INSIDE rather than relying on the
-- caller having passed RLS. `customers` still carries a broad authenticated
-- policy for historical reasons (see the later migration that closes it); these
-- functions must be admin-only regardless of that.
--
-- Walk-in orders: orders whose customer_user_id IS NULL (placed before 0012, or
-- created by hand) belong to nobody. They are never attributed to a customer --
-- that would require a name join, which is precisely the misattribution this
-- migration exists to end -- and are reported separately as platform-level
-- walk-in counts in admin_customer_stats_totals().
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Per-customer aggregates
-- --------------------------------------------------------------------------
create or replace function public.admin_customer_stats()
returns table (
  id text,
  user_id uuid,
  name text,
  email text,
  phone text,
  city text,
  joined_at date,
  archived_at timestamptz,
  blocked_at timestamptz,
  notes text,
  orders_count bigint,
  delivered_count bigint,
  cancelled_count bigint,
  failed_count bigint,
  total_spend numeric,
  avg_order_value numeric,
  last_order_at timestamptz
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
      c.id,
      c.user_id,
      c.name,
      c.email,
      c.phone,
      c.city,
      c.joined_at,
      c.archived_at,
      c.blocked_at,
      c.notes,
      coalesce(a.orders_count, 0),
      coalesce(a.delivered_count, 0),
      coalesce(a.cancelled_count, 0),
      coalesce(a.failed_count, 0),
      a.total_spend,
      a.avg_order_value,
      a.last_order_at
    from customers c
    -- The lateral is gated on user_id being non-null, so an unlinked row (a 0001
    -- seed row with no account) gets NULL aggregates rather than a fabricated
    -- zero, and the UI can say "not linked" instead of "never ordered".
    left join lateral (
      select
        count(*) as orders_count,
        count(*) filter (where o.status = 'delivered') as delivered_count,
        count(*) filter (where o.status = 'cancelled') as cancelled_count,
        -- A rider failure is not an order_status: 0044 records
        -- delivery_failed_at and returns the order to 'confirmed', so a failure
        -- is counted from that column and not from `status`. An order that
        -- bounced and was later delivered appears in both counts, which is the
        -- truth -- and no money is double-counted, because only delivered
        -- orders are summed.
        count(*) filter (where o.delivery_failed_at is not null) as failed_count,
        round(coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)::numeric, 2)
          as total_spend,
        round(avg(o.total) filter (where o.status = 'delivered')::numeric, 2)
          as avg_order_value,
        max(o.placed_at) as last_order_at
      from orders o
      where o.customer_user_id = c.user_id
    ) a on c.user_id is not null
    order by c.name;
end;
$$;

comment on function public.admin_customer_stats()
  is 'Every customer with live aggregates from orders.customer_user_id. Admin-only (checked inside). A row with NULL user_id is unlinked and its aggregates are NULL, not zero. Walk-in orders (NULL customer_user_id) are excluded entirely.';

revoke all on function public.admin_customer_stats() from public;
revoke all on function public.admin_customer_stats() from anon;
grant execute on function public.admin_customer_stats() to authenticated;

-- --------------------------------------------------------------------------
-- Platform totals, for the stat cards
-- --------------------------------------------------------------------------
create or replace function public.admin_customer_stats_totals()
returns table (
  total_customers bigint,
  new_this_month bigint,
  active_this_month bigint,
  walk_in_orders bigint,
  walk_in_spend numeric
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
      -- Archived rows are excluded: the list's default view is live customers,
      -- and a count that disagrees with the rows below it is a bug report.
      (select count(*) from customers where archived_at is null),
      -- joined_at is the record's date, not the auth account's created_at.
      (select count(*) from customers
        where archived_at is null
          and joined_at >= date_trunc('month', now())::date),
      -- "Active" = placed at least one order this calendar month. Distinct, so
      -- a customer with five orders counts once.
      (select count(distinct o.customer_user_id) from orders o
        where o.customer_user_id is not null
          and o.placed_at >= date_trunc('month', now())),
      -- Walk-ins: nobody to attribute, so they are reported here instead of
      -- inflating anybody's spend or tier.
      (select count(*) from orders where customer_user_id is null),
      -- Value of those walk-in orders, delivered only, on the same basis as
      -- per-customer spend.
      (select round(coalesce(sum(total) filter (where status = 'delivered'), 0)::numeric, 2)
         from orders where customer_user_id is null);
end;
$$;

comment on function public.admin_customer_stats_totals()
  is 'Customer counts for the stat cards plus walk-in order count and value. Admin-only (checked inside). Archived rows excluded from the customer counts.';

revoke all on function public.admin_customer_stats_totals() from public;
revoke all on function public.admin_customer_stats_totals() from anon;
grant execute on function public.admin_customer_stats_totals() to authenticated;