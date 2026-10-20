-- Trim what anon can reach to exactly what the public catalogue needs.
--
-- 0088 took anon's grants away from the eight tables that hold PII and money.
-- It left restaurants, menu_items and service_areas alone because anon reads
-- one of them today (service_areas, for a delivery quote before sign-in) and may
-- read the other two later -- but it left them holding Supabase's default ALL.
-- That is the same gap 0088 closed elsewhere. Right now no anon write is
-- reachable: the only policy in the schema addressed to anon is SELECT on
-- service_areas, and restaurants/menu_items have no anon policy at all. The
-- grant is a second gate, and a gate that does not depend on that staying true
-- is the point.
--
-- The function grants need a note, because the obvious fix does not work.
-- Supabase's default privileges grant EXECUTE on every new function in public
-- to anon explicitly, not through PUBLIC. So the `revoke all ... from public`
-- that 0016 and 0021 use leaves `anon=X` in place. 0046 granted its rider RPCs
-- to authenticated without revoking anything, and both are still executable by
-- anon -- harmless, because my_rider_application() filters auth.uid() and
-- review_rider_application() raises unless is_platform_admin(), but it is the
-- same default grant that would make a future unguarded definer reachable.
--
-- The trigger functions are revoked from the client roles as hygiene. A trigger
-- function cannot be called directly (PostgreSQL raises 0A000), and firing a
-- trigger does not check the caller's EXECUTE privilege, so this changes no
-- behaviour. service_role keeps its grant, as it does everywhere else.

-- Tables: anon keeps SELECT on the catalogue, and nothing else anywhere.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

grant select on table public.restaurants, public.menu_items, public.service_areas
  to anon;

-- Callable RPCs anon has no business reaching. Both re-check identity inside
-- the body; this is the second gate.
revoke all on function public.my_rider_application() from public, anon;
revoke all on function public.review_rider_application(uuid, boolean, text) from public, anon;
grant execute on function public.my_rider_application() to authenticated;
grant execute on function public.review_rider_application(uuid, boolean, text) to authenticated;

-- Trigger functions: not directly callable, so the grant is only a default.
revoke all on function public.audit_app_users_changes() from public, anon, authenticated;
revoke all on function public.orders_guard_client_status() from public, anon, authenticated;
revoke all on function public.orders_refresh_restaurant_aggregates() from public, anon, authenticated;
revoke all on function public.riders_audit_changes() from public, anon, authenticated;
revoke all on function public.riders_block_direct_suspension_write() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
