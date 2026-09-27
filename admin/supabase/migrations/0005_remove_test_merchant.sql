-- --------------------------------------------------------------------------
-- Test scaffolding teardown.
--
-- Removes the merchant account created in 0004 now that the RLS scoping has
-- been verified end to end: correct restaurant visible, other restaurants
-- invisible, cross-restaurant writes blocked, and self-promotion to admin
-- refused.
--
-- Deliberately leaves auth.users intact. Deleting the auth row needs the
-- admin API rather than SQL, and an orphan auth user with no app_users row
-- has no access to anything, so it is inert.
-- --------------------------------------------------------------------------

delete from app_users
 where user_id = (select id from auth.users where email = 'kfdtest.merchant@kfd.ph');
