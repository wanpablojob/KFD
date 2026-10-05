-- --------------------------------------------------------------------------
-- track_order: expose the full fee breakdown and the delivery address
--
-- The customer tracker could show subtotal, delivery fee and total, but not the
-- service fee (so the three figures did not add up) and not where the order is
-- going. Both were already on the row -- service_fee since 0023, delivery_address
-- since 0021 -- they were simply never selected.
--
-- Adding columns to a RETURNS TABLE changes the function's OUT row type, which
-- CREATE OR REPLACE refuses (42P13). The function is therefore dropped and
-- recreated, then re-granted, the same shape 0037 used to widen claim_order.
--
-- delivery_address is customer PII and this function is callable by anon with
-- just a reference. It is returned ONLY to the order's own customer
-- (auth.uid() = orders.customer_user_id); every other caller, including the
-- public tracking page, gets NULL. The non-PII columns are unchanged.
--
-- Base is 0012's definition. Everything except the two new columns and the
-- address gate is byte-for-byte the same logic.
-- --------------------------------------------------------------------------

drop function if exists public.track_order(text);

create function public.track_order(p_reference text)
returns table (
  reference text,
  restaurant text,
  items jsonb,
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  status order_status,
  payment payment_method,
  placed_at timestamptz,
  delivery_address text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row orders;
  v_ref text;
begin
  if p_reference is null or btrim(p_reference) = '' then
    return;
  end if;

  -- Normalise once: references are stored '#KFD-1001', printed 'KFD-1001', and
  -- arrive pasted in any case, sometimes with the '#'. Comparing the stripped,
  -- uppercased form handles all of it and cannot accidentally match a prefix.
  v_ref := upper(replace(btrim(p_reference), '#', ''));

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  if not found then
    return;
  end if;

  if v_row.reference !~ '^#KFD-[0-9A-F]{12}$' then
    -- Legacy sequential reference. Public access is refused; an already
    -- entitled caller may still read it. Inlined against app_users rather than
    -- reusing the helper functions, exactly as 0012 does, and for the same
    -- reason: this function is security definer, so this read is authoritative.
    if not (
      exists (
        select 1 from app_users
         where user_id = auth.uid() and role = 'admin'
      )
      or (
        v_row.restaurant_id is not null
        and exists (
          select 1 from app_users
           where user_id = auth.uid()
             and role = 'merchant'
             and restaurant_id = v_row.restaurant_id
        )
      )
      or (v_row.customer_user_id is not null and v_row.customer_user_id = auth.uid())
    ) then
      return;
    end if;
  end if;

  return query
    select
      v_row.reference,
      v_row.restaurant,
      v_row.items,
      v_row.subtotal,
      v_row.delivery_fee,
      v_row.service_fee,
      v_row.total,
      v_row.status,
      v_row.payment,
      v_row.placed_at,
      -- PII gate: the address is only for the order's own customer.
      case
        when v_row.customer_user_id is not null
         and v_row.customer_user_id = auth.uid()
        then v_row.delivery_address
        else null
      end;
end;
$$;

comment on function public.track_order(text)
  is 'Public order tracking by reference. Returns the order projection, with the fee breakdown. delivery_address is returned only to the order''s own customer (auth.uid() = customer_user_id); every other caller gets NULL.';

revoke all on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon, authenticated;
