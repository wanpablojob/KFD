-- --------------------------------------------------------------------------
-- Withdraw the anon EXECUTE grant that Supabase's default privileges add.
--
-- Supabase sets, on every new function in schema public:
--
--   alter default privileges in schema public
--     grant all on functions to postgres, anon, authenticated, service_role;
--
-- So `revoke all on function f() from public` -- the line 0002 and 0011 reach
-- for -- removes the grant to the PUBLIC pseudo-role and leaves the explicit
-- one to `anon` sitting right there. Every function in this schema has been
-- callable by the public anon key since 0002.
--
-- It did not leak, and the reason is worth recording so nobody "fixes" it
-- wrongly later. The 0011 functions are SECURITY DEFINER and re-check
-- is_platform_admin() internally, and auth.uid() is null for an anon caller, so
-- they raise or return nothing. The assertion step in migrate-db.yml has been
-- proving exactly that on every run. What was wrong is the grant, not the
-- behaviour: it left the database relying on a check inside a function rather
-- than on the permission to call it, which is one refactor away from a hole.
--
-- Explicit revokes now, per role, because the default privileges will re-add
-- the grant to the next function anyone writes unless the revokes are explicit.
-- --------------------------------------------------------------------------

revoke all on function public.mark_notifications_seen() from anon;

-- 0011. Not exploitable, as above: both raise for a caller that is not a
-- platform admin, and merchant_access_list() returns no rows. Revoked anyway so
-- the permission matches the intent.
revoke all on function public.set_merchant_access(text, text) from anon;
revoke all on function public.revoke_merchant_access(text) from anon;
revoke all on function public.merchant_access_list() from anon;

-- 0002's helpers. is_platform_admin() and current_merchant_restaurant() return
-- facts about the caller only -- a boolean and the caller's own restaurant id --
-- so exposing them leaks nothing. Revoked for the same reason as above: RLS
-- policies reference them, and a policy that calls a function the caller cannot
-- execute is a policy that fails closed in a way nobody intended.
revoke all on function public.is_platform_admin() from anon;
revoke all on function public.current_merchant_restaurant() from anon;

-- Deliberately NOT revoked: track_order(text). The public tracking page calls it
-- with the anon key and a signed-out browser, which is the whole point of the
-- feature. Its return type is the boundary, and its entitlement check runs
-- inside it.
--
-- mint_order_reference() is also left callable by anon. It returns a random
-- string and reads nothing, so there is nothing to protect, and the component
-- that eventually places a public order will want it without a session.
