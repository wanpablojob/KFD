-- --------------------------------------------------------------------------
-- Restrict `customers` to the admin role
--
-- NOT SAFE TO APPLY BLIND. Read "who loses access" below before applying.
--
-- 0001 gave every signed-in role full access to this table:
--
--   create policy "authenticated full access: customers"
--     on customers for all to authenticated using (true) with check (true);
--
-- `for all` means the merchant portal, the rider app AND a signed-in customer
-- could each SELECT every row -- and INSERT, UPDATE and DELETE any of them.
-- That is not hypothetical write access either: with (name, email) both
-- operator-editable and now also written by register_customer (0067), a
-- signed-in customer could rewrite an arbitrary customer's email, which is the
-- field /api/orders/notify resolves to find out where to send order mail.
--
-- This replaces it with what 0011 already did to app_users: admins read, and
-- every write happens inside a function that re-checks is_platform_admin().
--
-- The writes this table still needs are all definer functions, so no write
-- policy is created and none is needed:
--   register_customer()                   0067  creates the row at signup
--   admin_customer_update_contact()       0069  contact + note
--   admin_customer_set_blocked()          0069  block / unblock
--   admin_customer_set_archived()         0069  archive / restore
--
-- WHO LOSES ACCESS
--
--   * Admend: no change. The console is already role-gated by AuthGate, and
--     is_platform_admin() is true for them. Global search (which reads
--     `customers` for the admin search palette) keeps working.
--
--   * Merchants: lose SELECT. They have no customers screen, no menu on one,
--     and no query that reads this table. Nothing they can reach breaks.
--     /api/orders/notify, the one place a merchant path touches customers,
--     uses the SERVICE ROLE and bypasses RLS, so the rejection email they
--     already get is unaffected.
--
--   * Riders: lose SELECT. Same as merchants -- nothing reads it.
--
--   * Signed-in customers (the storefront app): lose SELECT *and* all writes.
--     They never had a legitimate use for it; their own record is written for
--     them by register_customer() and read through track_order() /
--     fetchMyOrders, both of which are unaffected.
--
-- VERIFY AFTER APPLYING (read-only, expect rows):
--   select * from customers;                    -- as an admin
--   set local role authenticated;               -- as a merchant in a psql role
--   select count(*) from customers;             -- expect 0, or permission denied
-- --------------------------------------------------------------------------

drop policy if exists "authenticated full access: customers" on public.customers;

create policy "admins read customers"
  on public.customers
  for select
  to authenticated
  using (public.is_platform_admin());

-- No insert/update/delete policy on purpose. A `with check` policy on this table
-- would let any authenticated role write to every row, which is the bug this
-- migration removes. Every legitimate write is inside a definer function.