-- --------------------------------------------------------------------------
-- Development merchant login.
--
-- Attaches a real merchant account to Habhab (Kabankalan) (rst_05) so the
-- portal can be exercised end to end. Chosen because rst_05 has the only
-- 'pending' order, so accept/reject is immediately testable, and two menu
-- items.
--
-- This is a development convenience on a seeded dataset, not production
-- provisioning. Real merchant accounts belong in app_users, created by an
-- admin. Rotate or delete this row before the database carries real data.
-- --------------------------------------------------------------------------

insert into app_users (user_id, role, restaurant_id)
select id, 'merchant', 'rst_05'
  from auth.users
 where email = 'kfdtest.merchant@kfd.ph'
on conflict (user_id) do update
  set role = 'merchant',
      restaurant_id = 'rst_05';
