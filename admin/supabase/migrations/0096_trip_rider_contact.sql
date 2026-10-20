-- --------------------------------------------------------------------------
-- 0096: the customer can reach the rider on a trip
-- --------------------------------------------------------------------------
--
-- The tracking screen looks the rider up by the reference the customer was
-- given. A trip's reference belongs to the trip, not to any one shop's order,
-- so on a multi-shop order the customer could not call the rider and could
-- not see the rider's GCash QR -- the two things the screen offers exactly
-- when they are needed.
--
-- Both functions now fall back to the trip when the reference is not an
-- order's. Rebuilt from their live definitions, with the fallback added; the
-- PII gates are unchanged: only the trip's own customer, and only a trip
-- that is under way, gets an answer.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_rider_contact(p_reference text)
 RETURNS TABLE(rider_name text, rider_phone text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row orders;
  v_trip public.deliveries;
  v_ref text := upper(replace(btrim(coalesce(p_reference, '')), '#', ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in to contact your rider.' using errcode = '42501';
  end if;

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  -- A trip (0092): the reference the customer was given is the trip's.
  if not found then
    select * into v_trip
      from public.deliveries d
     where upper(replace(d.reference, '#', '')) = v_ref
     limit 1;

    if not found
       or v_trip.customer_user_id is distinct from auth.uid()
       or v_trip.rider_id is null
       or v_trip.status not in ('confirmed', 'preparing', 'out_for_delivery') then
      return;
    end if;

    return query
      select r.name, nullif(btrim(r.phone), '')
        from riders r
       where r.id = v_trip.rider_id;
    return;
  end if;

  -- Only the order's own customer, only while it is in progress, only once a
  -- rider is assigned. Anything else returns nothing rather than an error, so
  -- the screen simply shows no contact buttons.
  if not found
     or v_row.customer_user_id is distinct from auth.uid()
     or v_row.rider_id is null
     or v_row.status not in ('confirmed', 'preparing', 'out_for_delivery') then
    return;
  end if;

  return query
    select r.name, nullif(btrim(r.phone), '')
      from riders r
     where r.id = v_row.rider_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.order_rider_payment(p_reference text)
 RETURNS TABLE(reference text, rider_name text, gcash_qr_url text, gcash_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row orders;
  v_trip public.deliveries;
  v_ref text;
begin
  -- PII + payment handle: only the order's own signed-in customer, ever.
  if auth.uid() is null then
    return;
  end if;

  v_ref := upper(replace(btrim(p_reference), '#', ''));

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  -- A trip (0092): the reference the customer was given is the trip's.
  if not found then
    select * into v_trip
      from public.deliveries d
     where upper(replace(d.reference, '#', '')) = v_ref
     limit 1;

    if not found
       or v_trip.customer_user_id is distinct from auth.uid()
       or v_trip.rider_id is null
       or v_trip.payment <> 'e_wallet' then
      return;
    end if;

    return query
      select v_trip.reference, r.name, r.gcash_qr_url, r.gcash_name
        from riders r
       where r.id = v_trip.rider_id
         and r.gcash_qr_url is not null;
    return;
  end if;

  if v_row.customer_user_id is distinct from auth.uid() then
    return;
  end if;

  -- Only an e_wallet order has a QR to show, and only once a rider set one.
  if v_row.payment <> 'e_wallet' or v_row.rider_id is null then
    return;
  end if;

  return query
    select v_row.reference, r.name, r.gcash_qr_url, r.gcash_name
      from riders r
     where r.id = v_row.rider_id
       and r.gcash_qr_url is not null;
end;
$function$;
