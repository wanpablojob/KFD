-- --------------------------------------------------------------------------
-- 0158: orders from the new shops reach riders again
--
-- Offers go only to riders whose city equals the shop's (offer_order_to_riders,
-- offer_delivery_to_riders). Riders, and every shop before them, use the
-- database default 'Kabankalan City Proper'; the shop seed set the ten new
-- shops to 'Kabankalan'. No rider matched, so every order from them sat at
-- "Finding a rider" with no offer at all -- and the re-offer job only retries
-- orders whose offers lapsed, so it never picked them up either.
--
-- This puts the shops (and trips already placed from them) on the riders'
-- city, then offers each waiting order once. Safe to re-run.
-- --------------------------------------------------------------------------

update public.restaurants
   set city = 'Kabankalan City Proper'
 where city = 'Kabankalan';

update public.deliveries
   set city = 'Kabankalan City Proper'
 where city = 'Kabankalan';

-- Offer what is waiting now. Single orders only (a shop order inside a trip is
-- offered with its trip), and only those with no live offer.
do $$
declare
  v_id text;
begin
  for v_id in
    select o.id
      from public.orders o
     where o.rider_id is null
       and o.delivery_id is null
       and o.status in ('confirmed', 'preparing')
       and not exists (
         select 1 from public.order_offers f
          where f.order_id = o.id and f.status = 'offered' and f.expires_at > now())
  loop
    perform public.offer_order_to_riders(v_id, true);
  end loop;

  for v_id in
    select d.id
      from public.deliveries d
     where d.rider_id is null
       and d.status in ('confirmed', 'preparing')
       and not exists (
         select 1 from public.delivery_offers f
          where f.delivery_id = d.id and f.status = 'offered' and f.expires_at > now())
  loop
    perform public.offer_delivery_to_riders(v_id, true);
  end loop;
end $$;
