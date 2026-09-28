-- Prompt 2.4 (Option A, restaurants) -- make the aggregate columns real.
--
-- EVIDENCE GATHERED BEFORE WRITING THIS (per the prompt's "investigate and
-- report, do not assume"):
--
--   * `orders.restaurant_id text references restaurants (id)` was added by
--     migration 0002, so restaurant-level aggregation is feasible on a real
--     foreign key. Confirmed by reading 0002_merchant.sql:28.
--   * `orders.customer text not null` is free text with NO foreign key to
--     `customers`. Customer aggregates therefore CANNOT be maintained
--     correctly, because the only available join is on a name string.
--     This migration deliberately does not touch customer aggregates, and no
--     query joins orders to customers on `name`.
--
-- Consequently the recommendation was a split: Option A for restaurants (a
-- real FK exists, so the database can maintain it truthfully) and Option B for
-- customers (stop implying the seed-time constants are live figures; see
-- src/lib/supabase/queries.ts and the "Known data limitations" section of
-- SETUP.md).
--
-- `orders_count` and `revenue` were written once by the seed insert in
-- 0001_init.sql and never recomputed, while the dashboard labelled the card
-- "Top restaurants -- by gross revenue this month" and badged it "Live".
--
-- Cancelled orders are excluded: the acceptance criterion requires that
-- cancelling or deleting an order updates the aggregate, and a rejected order
-- is not revenue.
--
-- Next free number verified with `ls supabase/migrations/`: 0008 follows
-- 0007_realtime_orders.sql.

-- ---------------------------------------------------------------------------
-- Helper: recompute the aggregate for the given restaurants in one statement.
--
-- Recomputes from `orders` rather than applying +1/-1 deltas. Deltas drift the
-- moment a status changes, an order moves between restaurants, or a row is
-- edited outside the app; a recompute is idempotent and self-healing, and at
-- this data volume a single indexed aggregate per touched restaurant is cheap.
--
-- security definer so the maintenance is not subject to the caller's RLS. It
-- writes only the two aggregate columns on `restaurants`; read policies are
-- untouched.
-- ---------------------------------------------------------------------------
create or replace function refresh_restaurant_aggregates(p_ids text[])
returns void
language sql
security definer
set search_path = public
as $$
  update restaurants r
     set orders_count = coalesce(agg.orders_count, 0),
         revenue = coalesce(agg.revenue, 0)
    from unnest(p_ids) as t(id)
    left join (
      select o.restaurant_id,
             count(*)::integer as orders_count,
             coalesce(sum(o.total), 0)::numeric(12, 2) as revenue
        from orders o
       where o.restaurant_id = any (p_ids)
         and o.status <> 'cancelled'
       group by o.restaurant_id
    ) as agg on agg.restaurant_id = t.id
   where r.id = t.id;
$$;

comment on function refresh_restaurant_aggregates(text[]) is
  'Recomputes restaurants.orders_count and restaurants.revenue from non-cancelled orders. Exposed so the backfill and the trigger share one definition of "counted".';

-- ---------------------------------------------------------------------------
-- Backfill FIRST, before the trigger exists, so there is no window in which
-- existing rows disagree with the maintained value.
--
-- Scalar subqueries rather than a grouped join so restaurants with zero orders
-- are also reset to zero instead of keeping their seed value.
-- ---------------------------------------------------------------------------
update restaurants r
   set orders_count = agg.orders_count,
       revenue = agg.revenue
  from (
    select r2.id,
           (
             select count(*)::integer
               from orders o
              where o.restaurant_id = r2.id
                and o.status <> 'cancelled'
           ) as orders_count,
           (
             select coalesce(sum(o.total), 0)::numeric(12, 2)
               from orders o
              where o.restaurant_id = r2.id
                and o.status <> 'cancelled'
           ) as revenue
      from restaurants r2
  ) as agg
 where r.id = agg.id;

-- ---------------------------------------------------------------------------
-- Trigger: keep the columns true from here on.
--
-- Fires on INSERT, UPDATE and DELETE, and re-derives BOTH the old and the new
-- restaurant on UPDATE, because an order can be reassigned and the restaurant
-- it left is now overstated.
-- ---------------------------------------------------------------------------
create or replace function orders_refresh_restaurant_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ids text[] := '{}';
begin
  if tg_op in ('UPDATE', 'DELETE') and old.restaurant_id is not null then
    ids := array_append(ids, old.restaurant_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.restaurant_id is not null then
    ids := array_append(ids, new.restaurant_id);
  end if;

  if cardinality(ids) > 0 then
    perform refresh_restaurant_aggregates(array(select distinct unnest(ids)));
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists orders_refresh_restaurant_aggregates on orders;

create trigger orders_refresh_restaurant_aggregates
  after insert or update or delete on orders
  for each row
  execute function orders_refresh_restaurant_aggregates();

comment on trigger orders_refresh_restaurant_aggregates on orders is
  'Maintains restaurants.orders_count and restaurants.revenue. Cancelled orders are excluded from both.';
