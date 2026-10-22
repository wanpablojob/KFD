-- --------------------------------------------------------------------------
-- The order of a trip's stops (0111)
--
-- A basket from three shops is one trip and one drop-off, so the rider walks
-- three kitchens. The stops were listed in the order the shops were placed,
-- which is an accident of the cart, not a route: the rider could arrive at a
-- kitchen whose food was not cooked yet, stand there for fifteen minutes, and
-- then be handed food that had been sitting at the last shop getting cold.
--
-- Each shop's order already snapshots the merchant's own prep estimate
-- (orders.prep_minutes, 0077), so the system knows when every stop will be
-- ready. What it was missing is an order to walk them in.
--
-- THE RULE: visit the stop whose food is ready LAST first.
--
-- The rider's trip is finished when the last stop is collected, so the order
-- that finishes earliest puts the stop that waits longest at the front, where
-- the waiting happens while the other kitchens are still cooking, and the
-- stop that is ready soonest at the back, where it is already waiting. The
-- rider collects continuously and the customer waits once, not twice.
--
-- A stop that is ready last is the one with the most prep time, so the sort
-- key is when the food will be ready -- placed_at + prep -- and not prep
-- alone: a shop that was ordered later can be ready later even with a shorter
-- prep time.
--
-- WHERE THE ROUTE WOULD COME FROM, AND WHY IT DOES NOT YET
--
-- The real answer is travel time, and there is none to be had: orders carry a
-- free-text address, there is no geocoding anywhere in the app, and no
-- coordinates are stored. A stop order that ignores where the shops are can
-- be a worse route than the one it replaces. So this is the honest best
-- available -- the order that never makes the rider wait at a kitchen -- and
-- the place a travel-aware order would slot into is this one sort key.
--
-- THE STOPS STILL TO VISIT
--
-- A stop the rider has already collected (the shop's order is out for
-- delivery) and a shop that cancelled are not on the route. They stay in the
-- list -- the rider needs to see what happened to each shop -- but they do not
-- take a number, and they sit below the route so the next kitchen is the
-- first thing on the card.
-- --------------------------------------------------------------------------

-- The return type changes, so the old function goes first. Both statements run
-- in the migration's transaction, so there is no window where the trip screen
-- finds no function.
drop function if exists public.delivery_stops(text);

create function public.delivery_stops(p_delivery_id text)
returns table (
  order_id text,
  reference text,
  restaurant text,
  restaurant_id text,
  items jsonb,
  subtotal numeric,
  status public.order_status,
  -- The merchant's own estimate, snapshotted when the order was placed.
  prep_minutes int,
  -- When this shop's food will be ready.
  ready_at timestamptz,
  -- 1, 2, 3... in the order to visit. Null for a stop that is not on the
  -- route any more: already collected, or the shop cancelled.
  stop_order int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.customer_user_id = auth.uid()
    )
    or exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.rider_id = public.current_rider_id()
    )
    or public.is_platform_admin()
  ) then
    return;
  end if;

  return query
    with stops as (
      select o.id,
             o.reference,
             o.restaurant,
             o.restaurant_id,
             o.items,
             o.subtotal,
             o.status,
             o.placed_at,
             -- 20 is the same default the app uses for an order placed before
             -- prep times were recorded (delivery-estimate.ts). The two must
             -- agree, or the rider sees a ready time the customer was never
             -- told.
             coalesce(o.prep_minutes, 20) as prep,
             o.placed_at + make_interval(mins => coalesce(o.prep_minutes, 20)) as ready,
             case
               when o.status in ('pending', 'confirmed', 'preparing') then 0
               when o.status in ('out_for_delivery', 'delivered') then 1
               else 2
             end as grp
        from public.orders o
       where o.delivery_id = p_delivery_id
    ),
    numbered as (
      select s.*,
             -- The visits are numbered first (grp 0 sorts ahead of the rest),
             -- so the numbers run 1, 2, 3... over the route and not over the
             -- whole list.
             row_number() over (
               order by s.grp, s.ready desc nulls last, s.placed_at, s.reference
             ) as seq
        from stops s
    )
    select n.id,
           n.reference,
           n.restaurant,
           n.restaurant_id,
           n.items,
           n.subtotal,
           n.status,
           n.prep,
           n.ready,
           case when n.grp = 0 then n.seq::int end
      from numbered n
     order by n.grp, n.ready desc nulls last, n.placed_at, n.reference;
end;
$$;

comment on function public.delivery_stops(text)
  is 'The shops of a trip, in the order to visit them, for the rider''s trip screen and the customer''s tracking (0111). The stop whose food is ready last is visited first, so the rider never waits at a kitchen. prep_minutes and ready_at are the shop''s own estimate; stop_order is the number of the stop on the route, and null for one that is already collected or cancelled.';

revoke all on function public.delivery_stops(text) from public, anon;
grant execute on function public.delivery_stops(text) to authenticated;
