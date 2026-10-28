-- --------------------------------------------------------------------------
-- Demo data for the defense.
--
-- What this does, and why it is not a migration:
--   * photos on the four open shops and their dishes (the files already ship
--     in admin/public/images/food and are credited in admin/src/lib/site-content.ts)
--   * a fuller menu on each of those shops, so a menu screen is not two rows
--   * the review customer gets delivered history, so Home and "Picked for you"
--     have something to be personal about
--   * one rider left online (the review rider, whose login the owner has)
--
-- This is demo CONTENT, not schema. It is idempotent: run it as often as you
-- like. Run it in the Supabase dashboard SQL Editor (it executes as postgres,
-- so it can write); the read-only agent connection cannot.
--
--   Dashboard -> SQL Editor -> paste this file -> Run
--
-- Undo: delete the ord_demo% rows, drop the mnu_d% menu items, and null the
-- image_urls on the four shops. The customer aggregate is recomputed from the
-- orders table at the end, so it corrects itself.
-- --------------------------------------------------------------------------

begin;

-- 1. Shop photos -----------------------------------------------------------
-- Served by the live admin site. These photos are already credited in
-- site-content.ts (CC BY-SA 4.0 / CC0); no new licence is introduced.
update public.restaurants set image_url = 'https://kfd-one.vercel.app/images/food/inasal-plate.jpg' where id = 'rst_01';
update public.restaurants set image_url = 'https://kfd-one.vercel.app/images/food/hero-inasal.jpg'  where id = 'rst_02';
update public.restaurants set image_url = 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'  where id = 'rst_04';
update public.restaurants set image_url = 'https://kfd-one.vercel.app/images/food/kansi.jpg'         where id = 'rst_05';

-- 2. Photos on the dishes that already exist -------------------------------
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/inasal-plate.jpg' where id = 'mnu_01';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'  where id = 'mnu_07';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/hero-inasal.jpg'  where id = 'mnu_08';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/hero-inasal.jpg'  where id = 'mnu_02';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'  where id = 'mnu_04';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'  where id = 'mnu_11';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/kansi.jpg'         where id = 'mnu_g71woexr';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/kansi.jpg'         where id = 'mnu_05';
update public.menu_items set image_url = 'https://kfd-one.vercel.app/images/food/kansi.jpg'         where id = 'mnu_10';

-- 3. A fuller menu on each open shop ---------------------------------------
-- Prices stay on the same scale as the seeded menu (0001) rather than inventing
-- a second one; the owner replaces them with real prices at launch.
insert into public.menu_items (id, restaurant, restaurant_id, name, category, price, available, image_url) values
  ('mnu_d01', 'D & D Food Hub',      'rst_01', 'Chicken Inasal',        'Grill',   9.50, true, 'https://kfd-one.vercel.app/images/food/inasal-plate.jpg'),
  ('mnu_d02', 'D & D Food Hub',      'rst_01', 'Pork Sisig',            'Viand',   8.80, true, 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'),
  ('mnu_d03', 'D & D Food Hub',      'rst_01', 'Garlic Rice',           'Rice',    2.50, true, 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'),
  ('mnu_d04', 'D & D Food Hub',      'rst_01', 'Halo-Halo',             'Dessert', 6.50, true, 'https://kfd-one.vercel.app/images/food/napoleones.jpg'),
  ('mnu_d05', 'Master Lechon House', 'rst_02', 'Lechon Belly (1/4 kg)', 'Lechon', 14.00, true, 'https://kfd-one.vercel.app/images/food/hero-inasal.jpg'),
  ('mnu_d06', 'Master Lechon House', 'rst_02', 'Crispy Pata',           'Lechon', 13.50, true, 'https://kfd-one.vercel.app/images/food/hero-inasal.jpg'),
  ('mnu_d07', 'Master Lechon House', 'rst_02', 'Atchara',               'Side',    2.80, true, 'https://kfd-one.vercel.app/images/food/kansi.jpg'),
  ('mnu_d08', 'Master Lechon House', 'rst_02', 'Steamed Rice',          'Rice',    2.00, true, 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'),
  ('mnu_d09', 'Kalkan',              'rst_04', 'Grilled Tanigue',       'Seafood',11.20, true, 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'),
  ('mnu_d10', 'Kalkan',              'rst_04', 'Garlic Butter Shrimp',  'Seafood',12.50, true, 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'),
  ('mnu_d11', 'Kalkan',              'rst_04', 'Sinigang na Hipon',     'Soup',   10.80, true, 'https://kfd-one.vercel.app/images/food/kansi.jpg'),
  ('mnu_d12', 'Kalkan',              'rst_04', 'Grilled Squid',         'Seafood', 9.60, true, 'https://kfd-one.vercel.app/images/food/inasal-meal.jpg'),
  ('mnu_d13', 'Habhab (Kabankalan)', 'rst_05', 'Bulalo Special',        'Soup',   13.00, true, 'https://kfd-one.vercel.app/images/food/kansi.jpg'),
  ('mnu_d14', 'Habhab (Kabankalan)', 'rst_05', 'Kansi',                 'Soup',   12.50, true, 'https://kfd-one.vercel.app/images/food/kansi.jpg'),
  ('mnu_d15', 'Habhab (Kabankalan)', 'rst_05', 'Bagnet',                'Viand',   7.50, true, 'https://kfd-one.vercel.app/images/food/inasal-plate.jpg'),
  ('mnu_d16', 'Habhab (Kabankalan)', 'rst_05', 'Piyaya',                'Dessert', 3.00, true, 'https://kfd-one.vercel.app/images/food/piaya.jpg')
on conflict (id) do update set
  restaurant    = excluded.restaurant,
  restaurant_id = excluded.restaurant_id,
  name          = excluded.name,
  category      = excluded.category,
  price         = excluded.price,
  available     = excluded.available,
  image_url     = excluded.image_url;

-- 4. The four shops a customer can order from stay open --------------------
update public.restaurants
   set is_open = true
 where id in ('rst_01', 'rst_02', 'rst_04', 'rst_05');

-- 5. One rider online ------------------------------------------------------
-- rdr_review is the rider whose credentials the owner has; rdr_01 is kept
-- online too so a second offer has somewhere to go in a busy demo.
update public.riders
   set status = 'online', suspended_at = null, archived_at = null
 where id in ('rdr_review', 'rdr_01');

-- 6. Delivered history for the review customer -----------------------------
-- Linked by customer_user_id, which is what the phone reads to build the
-- "Picked for you" taste profile (mobile/src/lib/home-picks.ts). delivery_id
-- and a non-confirmed status keep the auto-dispatch / trip triggers out of it.
do $$
declare
  v_user uuid;
begin
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
    ('ord_demo01', '#KFD-DE0000000001', 'Review Customer', 'D & D Food Hub', 'rst_01',
     '[{"name":"Inihaw na Liempo","quantity":2,"price":8.5},{"name":"Pinakbet","quantity":1,"price":9.2}]',
     26.20, 1.90, 0.00, 28.10, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '21 days', now() - interval '21 days' + interval '40 minutes', v_user),
    ('ord_demo02', '#KFD-DE0000000002', 'Review Customer', 'Master Lechon House', 'rst_02',
     '[{"name":"Lechon Paksiw","quantity":1,"price":10.5},{"name":"Whole Lechon (per kg)","quantity":1,"price":12.0}]',
     22.50, 1.90, 0.00, 24.40, 'delivered', 'e_wallet',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '14 days', now() - interval '14 days' + interval '35 minutes', v_user),
    ('ord_demo03', '#KFD-DE0000000003', 'Review Customer', 'Habhab (Kabankalan)', 'rst_05',
     '[{"name":"Bulalo Bowl","quantity":1,"price":11.5},{"name":"KBL (Kadios, Baboy, Langka)","quantity":2,"price":3.2}]',
     17.90, 1.70, 0.00, 19.60, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '9 days', now() - interval '9 days' + interval '45 minutes', v_user),
    ('ord_demo04', '#KFD-DE0000000004', 'Review Customer', 'D & D Food Hub', 'rst_01',
     '[{"name":"Inihaw na Liempo","quantity":1,"price":8.5}]',
     8.50, 1.90, 0.00, 10.40, 'delivered', 'card',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '4 days', now() - interval '4 days' + interval '30 minutes', v_user),
    ('ord_demo05', '#KFD-DE0000000005', 'Review Customer', 'Master Lechon House', 'rst_02',
     '[{"name":"Whole Lechon (per kg)","quantity":1,"price":12.0}]',
     12.00, 1.50, 0.00, 13.50, 'delivered', 'cash',
     'Juan Dela Cruz', 'rdr_01', 50.00, 'Cabadiangan, Kabankalan City', null,
     now() - interval '2 days', now() - interval '2 days' + interval '40 minutes', v_user);
end $$;

-- 7. Keep the customer's denormalised totals honest ------------------------
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
--   select id, name, status, is_open, image_url from public.restaurants
--    where id in ('rst_01','rst_02','rst_04','rst_05');
--   select restaurant_id, count(*) from public.menu_items group by 1 order by 1;
--   select id, reference, restaurant, total, status, placed_at
--     from public.orders where id like 'ord_demo%' order by placed_at;
--   select id, name, status from public.riders where status = 'online';
