-- --------------------------------------------------------------------------
-- Demo data for the defense.
--
-- Run AFTER scripts/seed-kabankalan-shops.sql: the shops, their logos and
-- their menus come from there. This script only adds what a live demo needs
-- on top of them:
--   * one rider left online (the review rider, whose login the owner has)
--   * the review customer gets delivered history at the real shops, so Home
--     and "Picked for you" have something to be personal about
--
-- This is demo CONTENT, not schema. It is idempotent: run it as often as you
-- like. Run it in the Supabase dashboard SQL Editor (it executes as postgres,
-- so it can write); the read-only agent connection cannot.
--
--   Dashboard -> SQL Editor -> paste this file -> Run
--
-- Prices are the shops' own, in pesos, with the standard ₱45 delivery and ₱5
-- service fee (order_fees), paid in cash on delivery.
--
-- Undo: delete the ord_demo% rows. The customer aggregate is recomputed from
-- the orders table at the end, so it corrects itself.
-- --------------------------------------------------------------------------

begin;

-- 1. One rider online ------------------------------------------------------
-- rdr_review is the rider whose credentials the owner has; rdr_01 is kept
-- online too so a second offer has somewhere to go in a busy demo.
update public.riders
   set status = 'online', suspended_at = null, archived_at = null
 where id in ('rdr_review', 'rdr_01');

-- 2. Delivered history for the review customer -----------------------------
-- Linked by customer_user_id, which is what the phone reads to build the
-- "Picked for you" taste profile (mobile/src/lib/home-picks.ts). delivery_id
-- and a non-confirmed status keep the auto-dispatch / trip triggers out of it.
do $$
declare
  v_user uuid;
begin
  if (select count(*) from public.restaurants
       where id in ('rst_alonsos', 'rst_pikons', 'rst_sols', 'rst_cafenoy')
         and archived_at is null) <> 4 then
    raise exception 'The Kabankalan shops are missing; run seed-kabankalan-shops.sql first';
  end if;

  select user_id into v_user from public.customers where id = 'cus_review';
  if v_user is null then
    raise exception 'cus_review has no auth user; run provision-review-accounts first';
  end if;

  delete from public.orders where id like 'ord_demo%';

  insert into public.orders (
    id, reference, customer, restaurant, restaurant_id, items,
    subtotal, delivery_fee, service_fee, total, status, payment,
    rider, rider_id, rider_payout, delivery_address, delivery_barangay,
    placed_at, delivered_at, customer_user_id
  ) values
    ('ord_demo01', '#KFD-DE0000000001', 'Review Customer', 'Alonso''s Cansi & Sizzling House', 'rst_alonsos',
     '[{"name":"Sizzling Cansi","quantity":1,"price":280},{"name":"Garlic Rice","quantity":2,"price":30}]',
     340.00, 45.00, 5.00, 390.00, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '21 days', now() - interval '21 days' + interval '40 minutes', v_user),
    ('ord_demo02', '#KFD-DE0000000002', 'Review Customer', 'Pikon''s Sizzling Hub', 'rst_pikons',
     '[{"name":"Pikon''s Pork Sisig","quantity":1,"price":109},{"name":"Pikon''s Chicken Inasal","quantity":1,"price":139}]',
     248.00, 45.00, 5.00, 298.00, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '14 days', now() - interval '14 days' + interval '35 minutes', v_user),
    ('ord_demo03', '#KFD-DE0000000003', 'Review Customer', 'Sol''s Garden Café', 'rst_sols',
     '[{"name":"Beef Bulalo","quantity":1,"price":450}]',
     450.00, 45.00, 5.00, 500.00, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '9 days', now() - interval '9 days' + interval '45 minutes', v_user),
    ('ord_demo04', '#KFD-DE0000000004', 'Review Customer', 'Alonso''s Cansi & Sizzling House', 'rst_alonsos',
     '[{"name":"Inasal Paa","quantity":1,"price":130}]',
     130.00, 45.00, 5.00, 180.00, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '4 days', now() - interval '4 days' + interval '30 minutes', v_user),
    ('ord_demo05', '#KFD-DE0000000005', 'Review Customer', 'CafeNoy', 'rst_cafenoy',
     '[{"name":"Spanish Latte (Large)","quantity":1,"price":109},{"name":"Pork Sisig","quantity":1,"price":125}]',
     234.00, 45.00, 5.00, 284.00, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '2 days', now() - interval '2 days' + interval '40 minutes', v_user);
end $$;

-- 3. Keep the customer's denormalised totals honest ------------------------
update public.customers c
   set orders_count = (
         select count(*) from public.orders o
          where o.customer_user_id = c.user_id and o.status <> 'cancelled'),
       total_spend = (
         select coalesce(sum(o.total), 0) from public.orders o
          where o.customer_user_id = c.user_id and o.status = 'delivered')
 where c.id = 'cus_review';

commit;

-- Verify (run separately; these are reads):
--   select id, reference, restaurant, total, status, placed_at
--     from public.orders where id like 'ord_demo%' order by placed_at;
--   select id, name, status from public.riders where status = 'online';
