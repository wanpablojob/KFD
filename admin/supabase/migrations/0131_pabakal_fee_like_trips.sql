-- --------------------------------------------------------------------------
-- Pabakal costs the same as a food trip
--
-- 0130 charged a 20 pabakal fee on top of the delivery fee. The owner wants
-- one rule for both: the barangay's delivery fee, plus 10 per extra store
-- (0094). So the base pabakal fee is 0 and only the extra stores add to it.
-- --------------------------------------------------------------------------

create or replace function public.pabakal_rules()
returns table (
  pabakal_fee numeric,
  per_extra_store numeric,
  max_cost numeric,
  max_stores int,
  max_lines int
)
language sql
immutable
as $$ select 0.00::numeric, 10.00::numeric, 2000.00::numeric, 5, 30 $$;

comment on function public.pabakal_rules()
  is 'Pabakal fee on top of the delivery fee (0: priced like a food trip, 0131), the fee per extra store, the most a rider fronts on one pabakal, and the size limits.';
