-- 0084: two money corrections agreed 2026-10-20.
--
-- 1. order_fees() inferred "agreed at the door" from a NULL fee and never read
--    service_areas.fee_agreed_in_person. A barangay saved with no fee and
--    "agreed at the door" off -- the admin UI's "No fee set -- orders refused"
--    -- came back as (NULL, true), so customer_place_order let the order
--    through at a price nobody had set. The function now returns the stored
--    flag, and only that flag allows a NULL-fee order.
--
-- 2. Merchants could not read order_refunds at all, so the Sales page had no
--    way to show net revenue. The new policy scopes reads to the merchant's
--    own restaurant's orders, matching the order_ratings policy from 0078.
--    Recording a refund stays admin-only (admin_record_refund).

-- --------------------------------------------------------------------------
-- 1. order_fees(): read the flag, do not infer it
-- --------------------------------------------------------------------------

create or replace function public.order_fees(p_barangay text default null)
returns table (
  delivery_fee numeric,
  service_fee numeric,
  fee_agreed_in_person boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_barangay text := nullif(btrim(coalesce(p_barangay, '')), '');
  v_fee numeric;
  v_agreed boolean := false;
begin
  -- A published list is the signal that fees are per-zoned at all. While the
  -- table is empty the platform has not configured anything, so the original
  -- flat rate applies rather than refusing every order.
  if exists (select 1 from service_areas) and v_barangay is not null then
    select sa.delivery_fee, sa.fee_agreed_in_person
      into v_fee, v_agreed
      from service_areas sa
     where lower(sa.barangay) = lower(v_barangay);

    -- No row: this barangay has no band at all. customer_place_order refuses
    -- it; both NULL cases differ only in the stored flag.
    if not found then
      v_fee := null;
      v_agreed := false;
    end if;
  else
    v_fee := 45.00;
  end if;

  return query select v_fee, 5.00, v_agreed;
end;
$$;

comment on function public.order_fees(text)
  is 'Delivery fee for a barangay, plus the stored fee_agreed_in_person flag. A NULL fee is refused unless the flag is true (0084).';

comment on column public.service_areas.delivery_fee is
  'Delivery fee for this barangay. NULL means no fixed price: allowed through only when fee_agreed_in_person is true, otherwise orders to this barangay are refused (0084).';

-- --------------------------------------------------------------------------
-- 2. Merchants can read their own restaurant's refunds
-- --------------------------------------------------------------------------

drop policy if exists "merchants read own refunds" on public.order_refunds;
create policy "merchants read own refunds"
  on public.order_refunds for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_refunds.order_id
       and o.restaurant_id = public.current_merchant_restaurant()
  ));
