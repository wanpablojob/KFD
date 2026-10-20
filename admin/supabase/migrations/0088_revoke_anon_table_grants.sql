-- Take away anon's table-level privileges on tables anon has no policy for.
--
-- RLS already denies anon on every table below: each one has policies addressed
-- to authenticated only. The grants are still worth removing, for two reasons
-- that hardening should not depend on staying true:
--
--   1. TRUNCATE is not filtered by RLS. A role holding TRUNCATE can empty a
--      table regardless of policy. PostgREST does not expose TRUNCATE, so this
--      is not reachable through the API today -- which is exactly the point:
--      the API surface, not the database, would be the only thing in the way.
--   2. One future `create policy ... to anon using (true)` would turn a role
--      that can already write into an immediate leak, with no second gate.
--
-- Supabase's default privileges grant ALL on new tables in public to anon and
-- authenticated. These tables hold PII (app_users, customers, riders,
-- rider_applications, audit_log, customer_favorites) and money (order_ratings,
-- order_refunds). Every read and write the app performs on them goes through
-- the service role, which bypasses RLS, or through an authenticated policy --
-- never anon -- so revoking cannot break a live path.
--
-- Deliberately not included:
--   service_areas  anon reads it (public delivery areas, "anyone reads
--                  service areas" policy)
--   restaurants    public catalogue data, no PII
--   menu_items     public catalogue data, no PII
--
-- TRUNCATE is revoked from authenticated as well. No legitimate path truncates
-- a table; the only statements the app issues are SELECT/INSERT/UPDATE/DELETE,
-- all of which RLS still governs.

revoke all on table
  public.app_users,
  public.audit_log,
  public.customers,
  public.riders,
  public.rider_applications,
  public.order_ratings,
  public.order_refunds,
  public.customer_favorites
from anon;

revoke truncate on all tables in schema public from anon, authenticated;
