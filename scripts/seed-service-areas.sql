-- --------------------------------------------------------------------------
-- Service areas: the barangays of Kabankalan City Proper, Barangay 1 to 9.
--
-- Demo CONTENT, not schema, like seed-kabankalan-shops.sql: run it in the
-- dashboard SQL Editor (SQL Editor -> paste -> Run). Idempotent.
--
-- Each is priced at the current flat fee (P45, order_fees in 0084), so no
-- customer's total changes. What does change: once this list exists, checkout
-- asks the customer for their barangay and refuses addresses outside it
-- (0077). Fees can be edited per barangay in the admin's Service areas page.
--
-- Undo: delete from public.service_areas where barangay like 'Barangay _';
-- --------------------------------------------------------------------------

begin;

insert into public.service_areas (barangay, delivery_fee, fee_agreed_in_person)
select 'Barangay ' || n, 45.00, false
  from generate_series(1, 9) as n
on conflict (lower(barangay)) do nothing;

commit;
