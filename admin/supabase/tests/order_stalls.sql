\set ON_ERROR_STOP 1
-- 0149: an order that stops moving with a rider is flagged, the rider who had
-- it keeps the mark, and the row closes when the order moves on.
begin;
insert into restaurants (id, name, cuisine) values ('RS-ST1', 'Stall Kitchen', 'Filipino');
insert into riders (id, name, email) values
  ('R-ST1', 'Stalled Rider', 'stalled-rider@example.test'),
  ('R-ST2', 'Fresh Rider', 'fresh-rider@example.test');

-- One order that has been out for two hours, one placed a minute ago, one
-- sitting in the pool with no rider.
insert into orders (id, reference, customer, restaurant, restaurant_id, status, rider_id,
                    rider_payout, subtotal, delivery_fee, service_fee, total, payment, placed_at)
values
  ('O-ST1', '#KFD-0000000000S1', 'C', 'Stall Kitchen', 'RS-ST1', 'out_for_delivery', 'R-ST1',
   50, 150, 45, 5, 200, 'cash', now() - interval '2 hours'),
  ('O-ST2', '#KFD-0000000000S2', 'C', 'Stall Kitchen', 'RS-ST1', 'out_for_delivery', 'R-ST2',
   50, 150, 45, 5, 200, 'cash', now()),
  ('O-ST3', '#KFD-0000000000S3', 'C', 'Stall Kitchen', 'RS-ST1', 'preparing', null,
   50, 150, 45, 5, 200, 'cash', now() - interval '3 hours');

-- 1. Only the order that has actually stopped moving is flagged.
select public.sweep_stalled_orders();

do $$ begin
  if (select count(*) from order_stalls where cleared_at is null) <> 1 then
    raise exception 'FAIL the sweep flagged % orders, expected exactly one',
      (select count(*) from order_stalls where cleared_at is null);
  end if;
  if not exists (
       select 1 from order_stalls
        where order_id = 'O-ST1' and cleared_at is null and minutes_stalled >= 120
  ) then
    raise exception 'FAIL the two-hour order was not flagged with its age';
  end if;
  if exists (select 1 from order_stalls where order_id in ('O-ST2', 'O-ST3') and cleared_at is null) then
    raise exception 'FAIL a fresh order or an unassigned one was flagged';
  end if;
  raise notice 'PASS only the order that stopped moving is flagged, with its age';
end $$;

-- 2. Reassigning it stops the clock and does not launder the incident: the
--    mark stays with the rider who had it when it stalled.
update orders set rider_id = 'R-ST2' where id = 'O-ST1';
select public.sweep_stalled_orders();

do $$ begin
  if exists (select 1 from order_stalls where order_id = 'O-ST1' and cleared_at is null) then
    raise exception 'FAIL the reassigned order is still shown as stalled';
  end if;
  if exists (select 1 from order_stalls where rider_id = 'R-ST2' and cleared_at is null) then
    raise exception 'FAIL the rider who took over was blamed for the previous wait';
  end if;
  if (select rider_id from order_stalls where order_id = 'O-ST1' order by id limit 1) <> 'R-ST1' then
    raise exception 'FAIL the reassignment moved the incident onto the new rider';
  end if;
  raise notice 'PASS reassignment closes the stall and keeps it with the original rider';
end $$;

-- 3. A second stall for the same order is a new row, not a reopened one, so a
--    rider's history is not overwritten by a later incident. Same rider, so the
--    clock is still the order's own and the stall is real.
update orders set rider_id = 'R-ST1', status = 'out_for_delivery', placed_at = now() - interval '3 hours' where id = 'O-ST1';
select public.sweep_stalled_orders();

do $$ begin
  if (select count(*) from order_stalls where order_id = 'O-ST1') <> 2 then
    raise exception 'FAIL a second stall overwrote the first instead of adding history';
  end if;
  if (select count(*) from order_stalls where order_id = 'O-ST1' and cleared_at is null) <> 1 then
    raise exception 'FAIL exactly one stall should be open';
  end if;
  if (select rider_id from order_stalls where order_id = 'O-ST1' and cleared_at is null) <> 'R-ST1' then
    raise exception 'FAIL the open stall is not attributed to the rider holding the order';
  end if;
  raise notice 'PASS a second stall adds history and leaves one open';
end $$;

-- 4. Delivering a stalled order closes it, and the history is kept.
update orders set status = 'delivered', delivered_at = now() where id = 'O-ST1';
select public.sweep_stalled_orders();

do $$ begin
  if exists (select 1 from order_stalls where cleared_at is null) then
    raise exception 'FAIL the stall survived the delivery';
  end if;
  if (select count(*) from order_stalls where order_id = 'O-ST1') <> 2 then
    raise exception 'FAIL the closed stall was deleted instead of kept as history';
  end if;
  raise notice 'PASS the stall closes on delivery and stays as history';
end $$;

rollback;
