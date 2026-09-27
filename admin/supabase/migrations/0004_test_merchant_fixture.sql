-- --------------------------------------------------------------------------
-- Test scaffolding: provision a merchant account.
--
-- Merchant accounts are created by an admin in the dashboard, not by
-- migration, so this exists only to make the RLS scoping in 0002 testable
-- end to end. 0005 removes it again.
--
-- The account is pinned to rst_01 (D & D Food Hub). Orders for any other
-- restaurant must be invisible to it.
-- --------------------------------------------------------------------------

insert into app_users (user_id, role, restaurant_id)
select id, 'merchant', 'rst_01'
  from auth.users
 where email = 'kfdtest.merchant@kfd.ph'
on conflict (user_id) do update
  set role = 'merchant',
      restaurant_id = 'rst_01';

-- Signups are unconfirmed by default, which blocks the sign-in the test needs.
update auth.users
   set email_confirmed_at = now()
 where email = 'kfdtest.merchant@kfd.ph'
   and email_confirmed_at is null;
