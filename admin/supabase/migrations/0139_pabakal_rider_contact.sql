-- --------------------------------------------------------------------------
-- 0139: a pabakal customer can reach their rider
--
-- The food tracker shows the rider's name and a call button (0078) and where
-- they are (0135). A pabakal customer saw only "Rider is buying": no name, no
-- way to call when the store was out of something. This is order_rider_contact
-- for a pabakal: the customer's own, only while a rider has it.
-- --------------------------------------------------------------------------

create or replace function public.pabakal_rider_contact(p_id uuid)
returns table (rider_name text, rider_phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to contact your rider.' using errcode = '42501';
  end if;

  -- Only the pabakal's own customer, only while a rider has it. Anything else
  -- returns nothing, so the screen simply shows no rider.
  return query
    select r.name, nullif(btrim(r.phone), '')
      from pabakal_requests p
      join riders r on r.id = p.rider_id
     where p.id = p_id
       and p.customer_user_id = auth.uid()
       and p.status in ('accepted', 'delivering');
end;
$$;

comment on function public.pabakal_rider_contact(uuid)
  is 'The rider''s name and phone for the calling customer''s own pabakal while a rider has it (0139).';
revoke all on function public.pabakal_rider_contact(uuid) from public, anon;
grant execute on function public.pabakal_rider_contact(uuid) to authenticated;
