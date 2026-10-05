-- --------------------------------------------------------------------------
-- GCash payment via the assigned rider's QR
--
-- The intended flow: the customer picks E-Wallet (GCash) at checkout, a rider
-- claims the order, and the customer scans that rider's GCash QR from the
-- tracking screen to pay. There is no gateway and no money moves through the
-- platform -- the rider is paid directly, which is why the QR belongs to the
-- rider and is shown only to the order's own customer.
--
--   riders.gcash_qr_url / gcash_name  -- the rider's own payment handle
--   rider_set_gcash()                 -- the rider sets/clears their own
--   order_rider_payment()             -- the customer reads the assigned QR
--
-- The QR is never exposed through the anon track_order(): order_rider_payment()
-- returns a row only to the signed-in customer who owns the order, only for an
-- e_wallet order, and only once a rider with a QR is assigned.
-- --------------------------------------------------------------------------

alter table public.riders
  add column if not exists gcash_qr_url text,
  add column if not exists gcash_name text;

comment on column public.riders.gcash_qr_url is
  'URL of the rider''s GCash QR image. Null until the rider sets one; shown to that rider''s customers on e_wallet orders.';
comment on column public.riders.gcash_name is
  'Name on the rider''s GCash account, shown with the QR so the customer can check the payee.';

-- --------------------------------------------------------------------------
-- rider_set_gcash: a rider maintains their own payment handle
-- --------------------------------------------------------------------------
create function public.rider_set_gcash(p_qr_url text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_qr_url, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in to update your payment details.' using errcode = '42501';
  end if;

  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'The QR image link must start with http:// or https://.'
      using errcode = 'P0001';
  end if;
  if v_url is not null and length(v_url) > 500 then
    raise exception 'That link is too long.' using errcode = 'P0001';
  end if;
  if v_name is not null and length(v_name) > 100 then
    raise exception 'That name is too long.' using errcode = 'P0001';
  end if;

  update riders
     set gcash_qr_url = v_url,
         gcash_name = v_name
   where user_id = auth.uid();

  if not found then
    raise exception 'No rider profile is linked to this account.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.rider_set_gcash(text, text)
  is 'Set or clear the calling rider''s GCash QR URL and account name.';

revoke all on function public.rider_set_gcash(text, text) from public;
revoke all on function public.rider_set_gcash(text, text) from anon;
grant execute on function public.rider_set_gcash(text, text) to authenticated;

-- --------------------------------------------------------------------------
-- order_rider_payment: the customer reads the assigned rider's QR
-- --------------------------------------------------------------------------
create function public.order_rider_payment(p_reference text)
returns table (
  reference text,
  rider_name text,
  gcash_qr_url text,
  gcash_name text
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
  -- PII + payment handle: only the order's own signed-in customer, ever.
  if auth.uid() is null then
    return;
  end if;

  v_ref := upper(replace(btrim(p_reference), '#', ''));

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  if not found then
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
$$;

comment on function public.order_rider_payment(text)
  is 'The assigned rider''s GCash QR for an e_wallet order, returned only to the order''s own customer.';

revoke all on function public.order_rider_payment(text) from public;
revoke all on function public.order_rider_payment(text) from anon;
grant execute on function public.order_rider_payment(text) to authenticated;
